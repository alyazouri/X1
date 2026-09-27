// ════════════════════════════════════════════════════════════════
// ALYAZOURI NETWORK INTELLIGENCE CENTER
// Unified DNS + Proxy measurement, verification & analysis platform.
// NOC-quality interface with Command Center, live scan, NOC table,
// evidence drawer, activity feed, ranking profiles, and export.
// ════════════════════════════════════════════════════════════════
import { useState, useMemo, useCallback, useRef } from "react";
import { useLang } from "../LanguageContext";
import { useNetworkDetection } from "../network/useNetwork";
import { MASTER_DNS, MASTER_DNS_V6, inferIspAny, prefixOf } from "../dns/dataset";
import { SAUDI_DNS, saudiIspOf } from "../dns/saudiDataset";
import { PROXY_POOL, type ProxyEntry } from "../proxy/pool";
import type { Endpoint, EndpointRecord, ScanProgress } from "./types";
import type { DnsCountry } from "../dns/types";

import { endpointId, freshnessOf } from "./stats";
import { ScanController } from "./controller";
import {
  StatusBadge, FreshnessBadge, MetricCard, ScanProgressBar,
  ActivityFeed, EmptyState, ExportPanel,
  type ActivityEntry,
} from "./components";
import { EvidenceDrawer } from "./EvidenceDrawer";

type Tab = "dns" | "proxy";
type SortCol = "state" | "p50" | "p95" | "jitter" | "reliability" | "overall" | "confidence" | "endpoint";
type SortDir = "asc" | "desc";

/* ── Build DNS endpoint pool ──────────────────────────────────── */
function buildDnsEndpoints(country: DnsCountry) {
  const pool = country === "Saudi Arabia" ? SAUDI_DNS : [...MASTER_DNS, ...MASTER_DNS_V6];
  return pool.map((ip) => {
    const isSaudi = country === "Saudi Arabia";
    return {
      id: endpointId(ip, 53, "dns"),
      host: ip,
      port: 53,
      protocol: "dns" as const,
      kind: "dns" as const,
      isp: isSaudi ? saudiIspOf(ip) : inferIspAny(ip),
      asn: "",
      country,
      catalogPrefix: prefixOf(ip),
    };
  });
}

/* ── Build Proxy endpoint pool ────────────────────────────────── */
function buildProxyEndpoints(): Endpoint[] {
  return PROXY_POOL.map((p: ProxyEntry) => ({
    id: endpointId(p.host, p.port, "tcp"),
    host: p.host,
    port: p.port,
    protocol: "tcp" as const,
    kind: "proxy" as const,
    isp: p.isp,
    asn: p.asn,
    country: "Jordan",
    catalogPrefix: p.catalogPrefix,
  }));
}

/* ── DNS probe: multi-strategy (like the old DnsAnalyzer) ──── */
/* Strategy 1: DoH query (best evidence — proves DNS actually responds)
   Strategy 2: DoH no-cors (proves TCP+TLS established)
   Strategy 3: Plain HTTPS reachability (proves host is alive)
   Only fail if ALL strategies fail. */
async function dnsProbe(ep: Endpoint, signal: AbortSignal): Promise<{ ok: boolean; ms: number; detail?: string }> {
  const host = ep.host.includes(":") ? `[${ep.host}]` : ep.host;
  const query = `?name=google.com&type=A&_=${Date.now()}`;

  // Strategy 1: DoH with CORS — try to read the actual DNS response.
  let start = performance.now();
  try {
    const resp = await fetch(`https://${host}/dns-query${query}`, {
      headers: { Accept: "application/dns-json" },
      mode: "cors", cache: "no-store", signal,
    });
    const ms = Math.round(performance.now() - start);
    if (resp.ok) {
      try {
        const data = await resp.json();
        if (typeof data.Status === "number") {
          return { ok: true, ms, detail: `rcode:${data.Status}` };
        }
      } catch { /* not JSON — still proves reachability */ }
    }
    return { ok: true, ms, detail: "doh-reachable" };
  } catch { /* CORS or connection — try next */ }

  // Strategy 2: DoH no-cors — resolves if TCP+TLS handshake succeeds.
  start = performance.now();
  try {
    await fetch(`https://${host}/dns-query${query}`, {
      mode: "no-cors", cache: "no-store", signal,
    });
    return { ok: true, ms: Math.round(performance.now() - start), detail: "tls-reachable" };
  } catch { /* try next */ }

  // Strategy 3: Plain HTTPS — any path on the host.
  start = performance.now();
  try {
    await fetch(`https://${host}/?_=${Date.now()}`, {
      mode: "no-cors", cache: "no-store", signal,
    });
    return { ok: true, ms: Math.round(performance.now() - start), detail: "https-reachable" };
  } catch (err) {
    const dt = performance.now() - start;
    const isTimeout = dt > 1200 || (err instanceof Error && err.name === "AbortError");
    return { ok: false, ms: Math.round(dt), detail: isTimeout ? "TIMEOUT" : "CONNECTION_REFUSED" };
  }
}

/* ── Proxy probe: HTTPS no-cors + backend TCP scanner ────────── */
async function proxyProbe(ep: Endpoint, signal: AbortSignal): Promise<{ ok: boolean; ms: number; detail?: string }> {
  // For port 443: try HTTPS no-cors directly from browser.
  if (ep.port === 443) {
    const start = performance.now();
    try {
      await fetch(`https://${ep.host}:443/?_=${Date.now()}`, {
        mode: "no-cors", cache: "no-store", signal,
      });
      return { ok: true, ms: Math.round(performance.now() - start), detail: "tls-ok" };
    } catch {
      const dt = performance.now() - start;
      return { ok: false, ms: Math.round(dt), detail: dt > 1200 ? "TIMEOUT" : "CONNECTION_REFUSED" };
    }
  }

  // For all other ports: use the Netlify backend TCP scanner (same-origin).
  const start = performance.now();
  try {
    const resp = await fetch("/api/proxy-scan", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ endpoints: [{ host: ep.host, port: ep.port }] }),
      cache: "no-store", signal,
    });
    const ms = Math.round(performance.now() - start);
    if (!resp.ok) return { ok: false, ms, detail: "BACKEND_UNAVAILABLE" };
    const data = await resp.json();
    const result = data.results?.[0];
    if (result?.open) {
      return { ok: true, ms: result.connectMs ?? ms, detail: "tcp-open" };
    }
    return { ok: false, ms, detail: result?.evidence === "TCP_RST" ? "CONNECTION_REFUSED" : "TIMEOUT" };
  } catch {
    const dt = performance.now() - start;
    return { ok: false, ms: Math.round(dt), detail: dt > 1500 ? "TIMEOUT" : "CONNECTION_REFUSED" };
  }
}

/* ── Main component ───────────────────────────────────────────── */
export function NetworkCenter() {
  const { lang } = useLang();
  const isAr = lang === "ar";
  const net = useNetworkDetection();

  const [tab, setTab] = useState<Tab>("dns");
  const [country, setCountry] = useState<DnsCountry>("Jordan");
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [sortCol, setSortCol] = useState<SortCol>("overall");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "verified" | "partial" | "failed">("all");

  // Per-tab result storage: DNS and Proxy each keep their own results independently.
  const [dnsRecords, setDnsRecords] = useState<Map<string, EndpointRecord>>(new Map());
  const [proxyRecords, setProxyRecords] = useState<Map<string, EndpointRecord>>(new Map());

  const controllerRef = useRef<ScanController | null>(null);

  // Active records = the ones for the currently selected tab.
  const records = tab === "dns" ? dnsRecords : proxyRecords;
  const setRecords = tab === "dns" ? setDnsRecords : setProxyRecords;
  const [compareIds, setCompareIds] = useState<string[]>([]);

  const label = (ar: string, en: string) => (isAr ? ar : en);

  /* ── Scan ──────────────────────────────────────────────────── */
  const runScan = useCallback(() => {
    const endpoints = tab === "dns" ? buildDnsEndpoints(country) : buildProxyEndpoints();
    if (endpoints.length === 0) return;

    setScanning(true);
    setActivity([]);
    setCompareIds([]);
    setSelected(null);

    const controller = new ScanController(
      tab === "dns" ? dnsProbe : proxyProbe,
      {
        kind: tab,
        initialConcurrency: 8,
        maxConcurrency: 32,
        onBatch: (events, prog) => {
          setProgress(prog);
          for (const evt of events) {
            if (evt.type === "row" || evt.type === "phase") {
              const id = evt.data as string;
              const rec = controller.getRecords().get(id);
              if (rec) {
                setActivity((prev) => [{
                  at: evt.at,
                  icon: rec.state === "VERIFIED" ? "✓" : rec.state === "DNS_FAILED" ? "×" : "◌",
                  text: `${rec.endpoint.host}:${rec.endpoint.port}`,
                  detail: rec.metrics ? `${rec.metrics.p50}ms` : rec.state,
                  ok: rec.state !== "DNS_FAILED",
                }, ...prev].slice(0, 20));
              }
            }
          }
          setRecords(controller.getRecords());
        },
        onComplete: (finalRecords) => {
          setRecords(finalRecords);
          setScanning(false);
          setProgress(null);
        },
      },
    );
    controllerRef.current = controller;
    controller.enqueue(endpoints);
    controller.start();
  }, [tab, country]);

  const stopScan = useCallback(() => {
    controllerRef.current?.stop();
    setScanning(false);
  }, []);

  const pauseScan = useCallback(() => { controllerRef.current?.pause(); }, []);
  const resumeScan = useCallback(() => { controllerRef.current?.resume(); }, []);

  const clearResults = useCallback(() => {
    controllerRef.current?.stop();
    controllerRef.current = null;
    if (tab === "dns") setDnsRecords(new Map()); else setProxyRecords(new Map());
    setProgress(null);
    setActivity([]);
    setSelected(null);
    setCompareIds([]);
  }, [tab]);

  /* ── Derived data ──────────────────────────────────────────── */
  const sortedRecords = useMemo(() => {
    const list = [...records.values()];
    const filtered = list.filter((r) => {
      if (search && !r.endpoint.host.toLowerCase().includes(search.toLowerCase())) return false;
      const isProxyRow = r.endpoint.kind === "proxy";
      const verifiedStates = isProxyRow ? ["VERIFIED", "TCP_PASS"] : ["VERIFIED", "DNS_PASS"];
      const failedStates = isProxyRow ? ["TCP_FAILED", "EXPIRED"] : ["DNS_FAILED"];
      const partialStates = isProxyRow ? ["REACHABLE"] : ["REACHABLE", "DNS_PARTIAL"];
      if (statusFilter === "verified" && !verifiedStates.includes(r.state)) return false;
      if (statusFilter === "failed" && !failedStates.includes(r.state)) return false;
      if (statusFilter === "partial" && !partialStates.includes(r.state)) return false;
      return true;
    });
    const dir = sortDir === "asc" ? 1 : -1;
    filtered.sort((a, b) => {
      switch (sortCol) {
        case "endpoint": return a.endpoint.host.localeCompare(b.endpoint.host) * dir;
        case "state": return a.state.localeCompare(b.state) * dir;
        case "p50": return ((a.metrics?.p50 ?? 9999) - (b.metrics?.p50 ?? 9999)) * dir;
        case "p95": return ((a.metrics?.p95 ?? 9999) - (b.metrics?.p95 ?? 9999)) * dir;
        case "jitter": return ((a.metrics?.jitter ?? 9999) - (b.metrics?.jitter ?? 9999)) * dir;
        case "reliability": return ((a.scores?.reliability ?? 0) - (b.scores?.reliability ?? 0)) * dir;
        case "confidence": return ((a.scores?.confidence ?? 0) - (b.scores?.confidence ?? 0)) * dir;
        case "overall": return ((a.scores?.overall ?? 0) - (b.scores?.overall ?? 0)) * dir;
      }
    });
    return filtered;
  }, [records, search, statusFilter, sortCol, sortDir]);

  /* ── Command Center metrics ────────────────────────────────── */
  const cmdMetrics = useMemo(() => {
    const recs = [...records.values()];
    const isProxyTab = tab === "proxy";
    const verifiedStates = isProxyTab ? ["VERIFIED", "TCP_PASS"] : ["VERIFIED", "DNS_PASS", "DNS_PARTIAL"];
    const verified = recs.filter((r) => verifiedStates.includes(r.state));
    const bestP50 = verified.length > 0 ? Math.min(...verified.map((r) => r.metrics?.p50 ?? 9999)) : null;
    const avgReliability = verified.length > 0
      ? verified.reduce((a, r) => a + (r.scores?.reliability ?? 0), 0) / verified.length
      : null;
    const lastUpdate = recs.length > 0 ? Math.max(...recs.map((r) => r.updatedAt)) : null;
    return { verifiedCount: verified.length, bestP50, avgReliability, lastUpdate, total: recs.length };
  }, [records, tab]);

  const selectedRecord = selected ? records.get(selected) ?? null : null;
  const compareRecords = compareIds.map((id) => records.get(id)).filter(Boolean) as EndpointRecord[];

  const handleSort = (col: SortCol) => {
    if (sortCol === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortCol(col); setSortDir(col === "endpoint" || col === "state" ? "asc" : "desc"); }
  };

  const toggleCompare = (id: string) => {
    setCompareIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : prev.length < 3 ? [...prev, id] : prev);
  };

  return (
    <div className="ni-panel overflow-hidden">
      {/* ═══ COMMAND CENTER ═══ */}
      <div className="border-b border-white/8 bg-[var(--s2)] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="font-display text-sm font-black text-white">NETWORK INTELLIGENCE</span>
            <StatusBadge state={cmdMetrics.verifiedCount > 0 ? "VERIFIED" : "NEW"} size="sm" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {/* Tabs */}
            <button onClick={() => setTab("dns")} className={`ni-filter-chip ${tab === "dns" ? "ni-active" : ""}`}>
              🛰️ DNS {dnsRecords.size > 0 && <span className="ms-1 text-[8px] opacity-60">{dnsRecords.size}</span>}
            </button>
            <button onClick={() => setTab("proxy")} className={`ni-filter-chip ${tab === "proxy" ? "ni-active" : ""}`}>
              🛡️ Proxy {proxyRecords.size > 0 && <span className="ms-1 text-[8px] opacity-60">{proxyRecords.size}</span>}
            </button>
            {tab === "dns" && (
              <>
                <button onClick={() => setCountry("Jordan")} className={`ni-filter-chip ${country === "Jordan" ? "ni-active" : ""}`}>🇯🇴 Jordan</button>
                <button onClick={() => setCountry("Saudi Arabia")} className={`ni-filter-chip ${country === "Saudi Arabia" ? "ni-active" : ""}`}>🇸🇦 Saudi</button>
              </>
            )}
          </div>
        </div>

        {/* Metric strip */}
        <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
          <MetricCard
            value={cmdMetrics.verifiedCount > 0 ? `${cmdMetrics.verifiedCount}` : "—"}
            label={label("مؤكد", "VERIFIED")}
            status={cmdMetrics.verifiedCount > 0 ? "good" : "info"}
          />
          <MetricCard
            value={cmdMetrics.bestP50 !== null && cmdMetrics.bestP50 < 9999 ? `${cmdMetrics.bestP50}` : "—"}
            label={label("أفضل P50", "BEST P50")}
            context="ms"
            status={cmdMetrics.bestP50 !== null && cmdMetrics.bestP50 < 50 ? "good" : "info"}
          />
          <MetricCard
            value={cmdMetrics.avgReliability !== null ? `${Math.round(cmdMetrics.avgReliability)}%` : "—"}
            label={label("الموثوقية", "RELIABILITY")}
            status={cmdMetrics.avgReliability !== null && cmdMetrics.avgReliability > 80 ? "good" : "warn"}
          />
          <MetricCard value={`${cmdMetrics.total}`} label={label("إجمالي", "TOTAL")} status="info" />
          <MetricCard
            value={net.status === "detected" ? (net.friendlyIsp ?? "—") : "—"}
            label={label("شبكتك", "YOUR ISP")}
            status="info"
          />
          <MetricCard
            value={cmdMetrics.lastUpdate ? freshnessOf(cmdMetrics.lastUpdate).toLowerCase() : "—"}
            label={label("آخر فحص", "LAST SCAN")}
            status="info"
          />
        </div>
      </div>

      {/* ═══ SCAN CONTROLS ═══ */}
      <div className="border-b border-white/8 p-4">
        <div className="flex flex-wrap items-center gap-2">
          {!scanning ? (
            <button onClick={runScan} className="btn-primary rounded-xl px-5 py-2.5 text-xs font-bold">
              ▶ {label("بدء الفحص", "START SCAN")}
            </button>
          ) : (
            <>
              <button onClick={pauseScan} className="btn-ghost rounded-xl px-4 py-2.5 text-xs">⏸ {label("إيقاف مؤقت", "PAUSE")}</button>
              <button onClick={resumeScan} className="btn-ghost rounded-xl px-4 py-2.5 text-xs">▶ {label("متابعة", "RESUME")}</button>
              <button onClick={stopScan} className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-2.5 text-xs text-red-300">⏹ {label("إيقاف", "STOP")}</button>
            </>
          )}
          <button onClick={clearResults} disabled={records.size === 0} className="btn-ghost rounded-xl px-4 py-2.5 text-xs disabled:opacity-40">
            🗑 {label("مسح", "CLEAR")}
          </button>
          <ExportPanel records={records} kind={tab} />
        </div>

        {progress && <div className="mt-3"><ScanProgressBar progress={progress} /></div>}

        {/* Filters */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={label("بحث IP…", "Search IP…")}
            className="w-40 rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-[11px] text-white placeholder-white/30 outline-none focus:border-orange-400/40"
            dir="ltr"
          />
          {(["all", "verified", "partial", "failed"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={`ni-filter-chip ${statusFilter === f ? "ni-active" : ""}`}
            >
              {f === "all" ? label("الكل", "All") : f === "verified" ? "✓ Verified" : f === "partial" ? "◐ Partial" : "× Failed"}
            </button>
          ))}
          {compareRecords.length > 1 && (
            <span className="ms-auto rounded-full bg-violet-500/15 px-3 py-1 text-[10px] font-bold text-violet-300">
              {compareRecords.length} {label("محدد للمقارنة", "selected for comparison")}
            </span>
          )}
        </div>
      </div>

      {/* ═══ BODY: Table + Activity ═══ */}
      <div className="grid lg:grid-cols-[1fr_220px]">
        {/* Table */}
        <div className="min-w-0">
          {records.size === 0 && !scanning ? (
            <EmptyState
              title={label("لا توجد نتائج بعد", "No results yet")}
              description={label("ابدأ الفحص لقياس جميع النقاط وجمع الأدلة الحقيقية.", "Start a scan to measure all endpoints and collect real evidence.")}
              action={label("بدء الفحص", "START SCAN")}
              onAction={runScan}
            />
          ) : (
            <div className="ni-vscroll max-h-[560px] overflow-x-auto">
              <table className="ni-table">
                <thead>
                  <tr>
                    <th className="w-8">{label("م", "#")}</th>
                    <th onClick={() => handleSort("endpoint")}>{label("النقطة", "Endpoint")} {sortCol === "endpoint" && (sortDir === "asc" ? "↑" : "↓")}</th>
                    <th onClick={() => handleSort("state")}>{label("الحالة", "Status")} {sortCol === "state" && (sortDir === "asc" ? "↑" : "↓")}</th>
                    <th onClick={() => handleSort("p50")}>P50 {sortCol === "p50" && (sortDir === "asc" ? "↑" : "↓")}</th>
                    <th onClick={() => handleSort("p95")}>P95 {sortCol === "p95" && (sortDir === "asc" ? "↑" : "↓")}</th>
                    <th onClick={() => handleSort("jitter")}>{label("تذبذب", "Jitter")} {sortCol === "jitter" && (sortDir === "asc" ? "↑" : "↓")}</th>
                    <th onClick={() => handleSort("reliability")}>{label("موثوقية", "Rel")} {sortCol === "reliability" && (sortDir === "asc" ? "↑" : "↓")}</th>
                    <th onClick={() => handleSort("overall")}>{label("أداء", "Score")} {sortCol === "overall" && (sortDir === "asc" ? "↑" : "↓")}</th>
                    <th onClick={() => handleSort("confidence")}>{label("ثقة", "Conf")} {sortCol === "confidence" && (sortDir === "asc" ? "↑" : "↓")}</th>
                    <th>{label("مزود", "ISP")}</th>
                    <th className="w-10">{label("قارن", "Cmp")}</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedRecords.map((r, i) => (
                    <tr
                      key={r.endpoint.id}
                      onClick={() => setSelected(r.endpoint.id)}
                      className={`cursor-pointer ${selected === r.endpoint.id ? "ni-selected" : ""}`}
                    >
                      <td className="text-white/30">{i + 1}</td>
                      <td className="font-mono font-bold text-white" dir="ltr">
                        {r.endpoint.country === "Jordan" ? "🇯🇴 " : r.endpoint.country === "Saudi Arabia" ? "🇸🇦 " : ""}{r.endpoint.host}
                        {r.endpoint.port !== 53 && <span className="text-white/40">:{r.endpoint.port}</span>}
                      </td>
                      <td><StatusBadge state={r.state} size="xs" /></td>
                    <td className="hidden lg:table-cell"><FreshnessBadge freshness={freshnessOf(r.updatedAt)} /></td>
                      <td className="ni-mono text-white/80">{r.metrics ? r.metrics.p50 : "—"}</td>
                      <td className="ni-mono text-white/80">{r.metrics ? r.metrics.p95 : "—"}</td>
                      <td className="ni-mono text-white/60">{r.metrics ? r.metrics.jitter : "—"}</td>
                      <td className="ni-mono font-bold text-emerald-300/80">{r.scores ? r.scores.reliability : "—"}</td>
                      <td className="ni-mono font-bold text-orange-300">{r.scores ? r.scores.overall : "—"}</td>
                      <td className="ni-mono text-violet-300/70">{r.scores ? r.scores.confidence : "—"}</td>
                      <td className="max-w-[100px] truncate text-[10px] text-white/50">{r.endpoint.isp}</td>
                      <td>
                        <input
                          type="checkbox"
                          checked={compareIds.includes(r.endpoint.id)}
                          onChange={() => toggleCompare(r.endpoint.id)}
                          onClick={(e) => e.stopPropagation()}
                          className="h-3 w-3 accent-orange-500"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Activity Feed */}
        <div className="hidden border-s border-white/5 p-3 lg:block">
          <div className="mb-2 font-display text-[9px] font-bold tracking-widest text-white/50">
            {label("النشاط", "ACTIVITY")}
          </div>
          <ActivityFeed entries={activity} />
        </div>
      </div>

      {/* ═══ COMPARISON PANEL ═══ */}
      {compareRecords.length >= 2 && (
        <div className="border-t border-white/8 bg-[var(--s2)] p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="font-display text-[10px] font-bold tracking-widest text-violet-300">
              {label("مقارنة النقاط", "ENDPOINT COMPARISON")}
            </span>
            <button onClick={() => setCompareIds([])} className="text-[10px] text-white/40 hover:text-white/70">✕ {label("إغلاق", "Close")}</button>
          </div>
          <div className="overflow-x-auto">
            <table className="ni-table">
              <thead>
                <tr>
                  <th>{label("المقياس", "Metric")}</th>
                  {compareRecords.map((r) => <th key={r.endpoint.id} className="font-mono">{r.endpoint.host}</th>)}
                </tr>
              </thead>
              <tbody>
                {[
                  { l: "P50 (ms)", get: (r: EndpointRecord) => r.metrics?.p50 ?? "—" },
                  { l: "P95 (ms)", get: (r: EndpointRecord) => r.metrics?.p95 ?? "—" },
                  { l: "Jitter (ms)", get: (r: EndpointRecord) => r.metrics?.jitter ?? "—" },
                  { l: "Reliability", get: (r: EndpointRecord) => r.scores?.reliability ?? "—" },
                  { l: "Overall", get: (r: EndpointRecord) => r.scores?.overall ?? "—" },
                  { l: "Confidence", get: (r: EndpointRecord) => r.scores?.confidence ?? "—" },
                  { l: "DNS UDP", get: (r: EndpointRecord) => r.verification.dnsUdp },
                  { l: "NXDOMAIN", get: (r: EndpointRecord) => r.verification.nxdomain },
                  { l: "DNSSEC", get: (r: EndpointRecord) => r.verification.dnssec },
                ].map((row) => (
                  <tr key={row.l}>
                    <td className="text-white/50">{row.l}</td>
                    {compareRecords.map((r) => <td key={r.endpoint.id} className="ni-mono text-white/80">{row.get(r)}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ═══ EVIDENCE DRAWER ═══ */}
      {selectedRecord && (
        <EvidenceDrawer
          record={selectedRecord}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

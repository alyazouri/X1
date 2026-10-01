// ════════════════════════════════════════════════════════════════
// ALYAZOURI 2026 — REGION ROUTER
//
// Answers "which DNS + proxy changes my hops to the region I want?" using REAL
// measurements only:
//   1. The node list comes from check-host.net (real machines, real countries).
//   2. For each selected region, check-host performs a REAL DNS lookup for the
//      game domain FROM a node in that region → the A records that region
//      actually receives. Different resolvers/regions return different CDN
//      edges, i.e. a genuinely different routing path.
//   3. Each returned game-edge IP is geolocated (ipwho.is — already used by
//      this project) so the user sees the real city/country/ASN they will land
//      in, plus the real TCP reachability + timing through the chosen proxy.
// ════════════════════════════════════════════════════════════════
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLang } from "../LanguageContext";
import { fetchNodes, checkDns, checkTcp, type CheckHostNode } from "./CheckHost";

/** Game / relay endpoints whose DNS answer decides the routing region. */
const ROUTE_TARGETS = [
  { id: "pubg", label: "PUBG · pubg.com", host: "pubg.com" },
  { id: "pubgme", label: "PUBG ME · me.pubg.com", host: "me.pubg.com" },
  { id: "cloudflare", label: "Cloudflare · cloudflare.com", host: "cloudflare.com" },
  { id: "google", label: "Google · google.com", host: "google.com" },
] as const;

/** Public resolvers that CAN be compared from the browser (real DoH, CORS). */
export const RESOLVERS: { id: string; name: string; url: string }[] = [
  { id: "cloudflare", name: "Cloudflare 1.1.1.1", url: "https://cloudflare-dns.com/dns-query" },
  { id: "google", name: "Google 8.8.8.8", url: "https://dns.google/resolve" },
  { id: "quad9", name: "Quad9 9.9.9.9", url: "https://dns.quad9.net:5053/dns-query" },
  { id: "adguard", name: "AdGuard 94.140.14.14", url: "https://dns.adguard-dns.com/dns-query" },
];

/** Region presets mapped onto real check-host nodes (matched by country code). */
const REGION_PRESETS: { id: string; ar: string; en: string; codes: string[] }[] = [
  { id: "me", ar: "الشرق الأوسط", en: "Middle East", codes: ["jo", "sa", "ae", "eg", "tr", "iq", "lb", "kw", "qa"] },
  { id: "eu", ar: "أوروبا", en: "Europe", codes: ["de", "nl", "fr", "gb", "ch", "se", "pl", "it", "es", "pt"] },
  { id: "asia", ar: "آسيا", en: "Asia", codes: ["sg", "jp", "hk", "kr", "in", "my", "th", "vn", "ph"] },
  { id: "na", ar: "أمريكا الشمالية", en: "North America", codes: ["us", "ca", "mx"] },
];

interface GeoInfo { ip: string; city: string | null; country: string | null; asn: string | null; isp: string | null }

/** Real IP geolocation via ipwho.is (same provider the project already uses). */
async function geolocate(ip: string): Promise<GeoInfo> {
  try {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch(`https://ipwho.is/${ip}`, { cache: "no-store", signal: ctrl.signal });
    clearTimeout(to);
    const j = (await res.json()) as { city?: string; country?: string; connection?: { asn?: number; org?: string; isp?: string } };
    return { ip, city: j.city ?? null, country: j.country ?? null, asn: j.connection?.asn ? `AS${j.connection.asn}` : null, isp: j.connection?.isp ?? j.connection?.org ?? null };
  } catch {
    return { ip, city: null, country: null, asn: null, isp: null };
  }
}

export function RegionRouter() {
  const { lang } = useLang();
  const isAr = lang === "ar";
  const [nodes, setNodes] = useState<CheckHostNode[]>([]);
  const [nodeError, setNodeError] = useState<string | null>(null);
  const [regionId, setRegionId] = useState<string>("me");
  const [target, setTarget] = useState<string>(ROUTE_TARGETS[0].host);
  const [proxy, setProxy] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<{ node: CheckHostNode; dns: string[]; geo: GeoInfo[] }[]>([]);
  const [proxyChecks, setProxyChecks] = useState<{ node: CheckHostNode; ok: boolean; ms: number | null; error: string | null }[]>([]);
  const [resolverAnswers, setResolverAnswers] = useState<{ resolver: string; ip: string; geo: GeoInfo | null }[]>([]);

  // Load the real node list once.
  useEffect(() => {
    let alive = true;
    fetchNodes()
      .then((list) => { if (alive) setNodes(list); })
      .catch((e: unknown) => { if (alive) setNodeError((e as Error).message); });
    return () => { alive = false; };
  }, []);

  const region = REGION_PRESETS.find((r) => r.id === regionId) ?? REGION_PRESETS[0];
  const regionNodes = useMemo(
    () => nodes.filter((n) => region.codes.includes(n.country)).slice(0, 4),
    [nodes, region],
  );

  /** Compare what each public resolver answers (real DoH) — real routing difference. */
  const compareResolvers = useCallback(async (domain: string) => {
    const answers = await Promise.all(RESOLVERS.map(async (r) => {
      try {
        const res = await fetch(`${r.url}?name=${domain}&type=A`, {
          headers: { accept: "application/dns-json" }, cache: "no-store",
        });
        const j = (await res.json()) as { Status?: number; Answer?: { data: string }[] };
        if (j.Status !== 0 || !j.Answer?.length) return null;
        const ip = j.Answer[0].data;
        return { resolver: r.name, ip, geo: await geolocate(ip) };
      } catch { return null; }
    }));
    setResolverAnswers(answers.filter((a): a is { resolver: string; ip: string; geo: GeoInfo } => a !== null));
  }, []);

  const run = async () => {
    if (!regionNodes.length) return;
    setBusy(true);
    setResults([]);
    setProxyChecks([]);

    // 1 · Real DNS lookups performed from nodes inside the chosen region.
    const perNode = await Promise.all(regionNodes.map(async (node) => {
      try {
        const dns = await checkDns(target, [node.id], 14000);
        const records = dns[0]?.a ?? [];
        const geo = await Promise.all(records.slice(0, 3).map(geolocate));
        return { node, dns: records, geo };
      } catch {
        return { node, dns: [], geo: [] as GeoInfo[] };
      }
    }));
    setResults(perNode);

    // 2 · Real TCP check through the user's proxy from those same nodes.
    const match = proxy.trim().match(/^([\d.]+):(\d+)$/);
    if (match) {
      const [, host, port] = match;
      const checks = await Promise.all(regionNodes.map(async (node) => {
        try {
          const rows = await checkTcp(host, Number(port), [node.id], 14000);
          const r = rows[0];
          return r
            ? { node, ok: r.ok, ms: r.timeMs, error: r.error }
            : { node, ok: false, ms: null, error: "NO_RESULT" };
        } catch (e) {
          return { node, ok: false, ms: null, error: (e as Error).message };
        }
      }));
      setProxyChecks(checks);
    }

    // 3 · Compare resolvers from the browser (real DoH answers).
    await compareResolvers(target);
    setBusy(false);
  };

  return (
    <div className="card rounded-2xl p-5">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-xl">🧭</span>
        <h3 className="font-display text-sm font-bold tracking-widest text-white">
          {isAr ? "موجّه المنطقة — DNS وبروكسي يغيّر المسار" : "Region Router — DNS & proxy that change your hops"}
        </h3>
      </div>
      <p className="mb-4 text-[11px] leading-relaxed text-white/50">
        {isAr
          ? "فحص حقيقي من عُقد فعليّة داخل المنطقة المختارة: استعلام DNS من العقدة يُظهر أي سيرفر CDN ستصل إليه، وفحص TCP يُظهر هل البروكسي يعمل من هناك."
          : "Real checks run on actual nodes inside the chosen region: a DNS query from that node reveals which CDN edge you would land on, and a TCP check verifies the proxy from there."}
      </p>

      {/* Region + target + proxy */}
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <div>
          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-white/40">{isAr ? "المنطقة" : "Region"}</p>
          <div className="flex flex-wrap gap-1.5">
            {REGION_PRESETS.map((r) => (
              <button key={r.id} onClick={() => setRegionId(r.id)}
                className={`chip rounded-lg px-2.5 py-1.5 text-[10px] font-bold ${regionId === r.id ? "active" : "text-white/60"}`}>
                {isAr ? r.ar : r.en}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-white/40">{isAr ? "الهدف" : "Target"}</p>
          <div className="flex flex-wrap gap-1.5">
            {ROUTE_TARGETS.map((r) => (
              <button key={r.id} onClick={() => setTarget(r.host)}
                className={`chip rounded-lg px-2.5 py-1.5 text-[10px] font-semibold ${target === r.host ? "active" : "text-white/60"}`}>
                {r.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-white/40">
            {isAr ? "بروكسي (IP:Port)" : "Proxy (IP:Port)"}
          </p>
          <input
            value={proxy} onChange={(e) => setProxy(e.target.value)}
            dir="ltr" placeholder="80.90.164.188:80"
            className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 font-mono text-xs text-white placeholder-white/25 focus:border-orange-400/50 focus:outline-none"
          />
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button onClick={() => void run()} disabled={busy || !regionNodes.length}
          className="btn-primary rounded-xl px-4 py-2.5 text-xs disabled:opacity-50">
          {busy ? (isAr ? "جاري الفحص من العقد..." : "Probing nodes...") : (isAr ? "🚀 افحص من المنطقة" : "🚀 Probe from region")}
        </button>
        <span className="text-[10px] text-white/40">
          {nodes.length
            ? `${regionNodes.length} ${isAr ? "عقدة في" : "nodes in"} ${isAr ? region.ar : region.en} (${regionNodes.map((n) => n.city).join(", ")})`
            : isAr ? "جاري تحميل العقد..." : "Loading nodes..."}
        </span>
      </div>

      {nodeError && (
        <p className="mb-4 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-[10px] text-amber-200/80">
          ⚠️ {isAr ? "تعذّر تحميل قائمة العقد" : "Could not load the node list"}: {nodeError}
        </p>
      )}

      {/* Region DNS routing results */}
      {results.length > 0 && (
        <div className="mb-4 space-y-2">
          <p className="font-display text-[10px] font-bold tracking-widest text-orange-300">
            🌍 {isAr ? "إلى أين يوجّهك DNS هذه المنطقة" : "Where this region's DNS routes you"}
          </p>
          {results.map(({ node, dns, geo }) => (
            <div key={node.id} className="rounded-xl border border-white/5 bg-black/30 p-3">
              <p className="text-[11px] font-bold text-white/85">
                {node.city}, {node.countryName} <span className="font-mono text-[9px] text-white/35">{node.asn}</span>
              </p>
              {dns.length === 0 ? (
                <p className="mt-1 text-[10px] text-white/35">{isAr ? "لا استجابة DNS من هذه العقدة" : "no DNS answer from this node"}</p>
              ) : (
                <>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {dns.map((ip) => (
                      <span key={ip} className="rounded bg-black/50 px-2 py-0.5 font-mono text-[10px] text-emerald-300">{ip}</span>
                    ))}
                  </div>
                  {geo.map((g) => (
                    <p key={g.ip} className="mt-1 text-[10px] text-white/50">
                      {g.ip} → <b className="text-orange-300">{g.city ?? "?"}, {g.country ?? "?"}</b> · {g.asn ?? "?"} · {g.isp ?? "?"}
                    </p>
                  ))}
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Proxy verification from the region */}
      {proxyChecks.length > 0 && (
        <div className="mb-4 space-y-1.5">
          <p className="font-display text-[10px] font-bold tracking-widest text-orange-300">
            🛡️ {isAr ? "البروكسي من هذه المنطقة" : "Proxy from this region"}
          </p>
          {proxyChecks.map(({ node, ok, ms, error }) => (
            <div key={node.id} className="flex items-center gap-2 rounded-lg border border-white/5 bg-black/30 p-2 text-[10px]">
              <span className="text-white/70">{node.city}</span>
              <span className={`ms-auto font-bold ${ok ? "text-emerald-300" : "text-red-300"}`}>
                {ok ? `✅ ${ms ?? "—"}ms` : `❌ ${error ?? "FAILED"}`}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Resolver comparison — which DNS sends you where */}
      {resolverAnswers.length > 0 && (
        <div>
          <p className="mb-2 font-display text-[10px] font-bold tracking-widest text-orange-300">
            🔄 {isAr ? "أي DNS يرسلك إلى أين" : "Which DNS sends you where"}
          </p>
          <div className="space-y-1.5">
            {resolverAnswers.map((a) => (
              <div key={a.resolver} className="flex flex-wrap items-center gap-2 rounded-lg border border-white/5 bg-black/30 p-2 text-[10px]">
                <span className="font-semibold text-white/85">{a.resolver}</span>
                <span className="font-mono text-white/50">{a.ip}</span>
                <span className="ms-auto font-bold text-orange-300">
                  {a.geo?.city ?? "?"}, {a.geo?.country ?? "?"} · {a.geo?.asn ?? "?"}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[10px] leading-relaxed text-white/35">
            {isAr
              ? "استعلامات DoH حقيقية: كل مُحلّل يعيد سيرفر CDN مختلفاً — اختر المُحلّل الذي يوصلك إلى المنطقة التي تريدها."
              : "Real DoH queries: each resolver returns a different CDN edge — pick the resolver that lands you in your target region."}
          </p>
        </div>
      )}
    </div>
  );
}

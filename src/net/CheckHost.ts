// ════════════════════════════════════════════════════════════════
// ALYAZOURI 2026 — CHECK-HOST INTEGRATION (real distributed probing)
//
// check-host.net exposes a public JSON API (Accept: application/json) that runs
// REAL network checks from dozens of physical nodes worldwide:
//   /check-tcp?host=IP:PORT  → real TCP connect + timing from each node
//   /check-dns?host=DOMAIN   → real A / AAAA / PTR + TTL from each node
//   /nodes/hosts             → the node list (country, city, IP, ASN)
//   /trace                   → real traceroute (hops)
//
// This is what makes a browser-only build able to test proxy ports and compare
// DNS routing per region — the checks genuinely happen on real remote machines.
// Docs: https://check-host.net/about/api
// ════════════════════════════════════════════════════════════════

const API = "https://check-host.net";
const JSON_HEADERS = { accept: "application/json" } as const;

export interface CheckHostNode {
  id: string;        // e.g. "eg1.node.check-host.net"
  country: string;   // "eg"
  countryName: string; // "Egypt"
  city: string;      // "Cairo"
  ip: string;
  asn: string;
}

export interface TcpNodeResult {
  nodeId: string;
  ok: boolean;
  timeMs: number | null;
  address: string | null;
  error: string | null;
}

export interface DnsNodeResult {
  nodeId: string;
  a: string[];
  aaaa: string[];
  ttl: number | null;
  ptr: string[] | null;
}

/** Fetch the live node list so regions can be selected from real nodes. */
export async function fetchNodes(): Promise<CheckHostNode[]> {
  const res = await fetch(`${API}/nodes/hosts`, { headers: JSON_HEADERS, cache: "no-store" });
  if (!res.ok) throw new Error(`NODES_${res.status}`);
  const json = (await res.json()) as { nodes?: Record<string, [string, string, string, string, string]> } | Record<string, [string, string, string, string, string]>;
  const raw = (json as { nodes?: Record<string, [string, string, string, string, string]> }).nodes
    ?? (json as Record<string, [string, string, string, string, string]>);
  if (!raw) return [];
  return Object.entries(raw).map(([id, meta]) => ({
    id,
    country: meta[0] ?? "",
    countryName: meta[1] ?? "",
    city: meta[2] ?? "",
    ip: meta[3] ?? "",
    asn: meta[4] ?? "",
  }));
}

/** Submit a check; returns the request_id used for polling. */
async function submit(
  type: "tcp" | "dns" | "ping" | "http",
  host: string,
  nodes: string[],
): Promise<string> {
  const params = new URLSearchParams({ host });
  for (const n of nodes) params.append("node", n);
  const res = await fetch(`${API}/check-${type}?${params.toString()}`, {
    headers: JSON_HEADERS, cache: "no-store",
  });
  if (!res.ok) throw new Error(`SUBMIT_${res.status}`);
  const json = (await res.json()) as { ok?: number; request_id?: string };
  if (!json.request_id) throw new Error("NO_REQUEST_ID");
  return json.request_id;
}

/** Poll a submitted check until the requested nodes have reported (or timeout). */
async function poll<T>(
  requestId: string,
  expected: number,
  parse: (nodeId: string, raw: unknown) => T | null,
  timeoutMs: number,
): Promise<T[]> {
  const deadline = performance.now() + timeoutMs;
  const seen = new Map<string, T>();
  while (performance.now() < deadline) {
    await new Promise((r) => setTimeout(r, 900));
    let json: unknown;
    try {
      const res = await fetch(`${API}/check-result/${requestId}`, { headers: JSON_HEADERS, cache: "no-store" });
      if (!res.ok) continue;
      json = await res.json();
    } catch { continue; }
    const map = json as Record<string, unknown>;
    for (const [nodeId, value] of Object.entries(map ?? {})) {
      if (value === null || value === undefined) continue;   // node not done yet
      const parsed = parse(nodeId, value);
      if (parsed) seen.set(nodeId, parsed);
    }
    if (seen.size >= expected) break;
  }
  return [...seen.values()];
}

/**
 * REAL TCP port check from specific global nodes.
 * `host` must be "ip:port". Returns one result per node with real connect time.
 */
export async function checkTcp(host: string, port: number, nodes: string[], timeoutMs = 12000): Promise<TcpNodeResult[]> {
  const requestId = await submit("tcp", `${host}:${port}`, nodes);
  return poll<TcpNodeResult>(requestId, nodes.length, (nodeId, raw) => {
    const rows = raw as { time?: number; address?: string; error?: string }[];
    const first = Array.isArray(rows) ? rows[0] : (raw as { time?: number; address?: string; error?: string });
    if (!first) return { nodeId, ok: false, timeMs: null, address: null, error: "NO_RESULT" };
    if (typeof first.error === "string") {
      return { nodeId, ok: false, timeMs: null, address: null, error: first.error };
    }
    return {
      nodeId,
      ok: true,
      timeMs: typeof first.time === "number" ? Math.round(first.time * 1000) / 1000 : null,
      address: first.address ?? null,
      error: null,
    };
  }, timeoutMs);
}

/**
 * REAL DNS lookup performed BY each node (so the answer reflects that region's
 * routing). Returns the A records that region actually receives.
 */
export async function checkDns(domain: string, nodes: string[], timeoutMs = 12000): Promise<DnsNodeResult[]> {
  const requestId = await submit("dns", domain, nodes);
  return poll<DnsNodeResult>(requestId, nodes.length, (nodeId, raw) => {
    const rows = raw as { A?: string[]; AAAA?: string[]; TTL?: number | null; PTR?: string[] | null }[];
    const first = Array.isArray(rows) ? rows[0] : (raw as { A?: string[]; AAAA?: string[]; TTL?: number | null; PTR?: string[] | null });
    if (!first) return null;
    return {
      nodeId,
      a: first.A ?? [],
      aaaa: first.AAAA ?? [],
      ttl: first.TTL ?? null,
      ptr: first.PTR ?? null,
    };
  }, timeoutMs);
}

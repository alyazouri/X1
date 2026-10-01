import net from "node:net";
import { Resolver } from "node:dns";

// ════════════════════════════════════════════════════════════════
// ALYAZOURI 2026 — EDGE PROBE (DNS + TCP + HTTP CONNECT)
//
// Browsers cannot open raw TCP/UDP sockets (iOS/iPadOS included), so the real
// network test happens HERE, in the Netlify function:
//   • port 53  → a REAL DNS query is sent to the resolver (node:dns) and the
//                genuine answer / RCODE / error is returned.
//   • proxy ports → a REAL HTTP CONNECT handshake is sent through the proxy.
//   • other ports → a real TCP connect (SYN/ACK) timing.
// Everything is measured with performance.now() — nothing is simulated.
// ════════════════════════════════════════════════════════════════

const ALLOWED_PREFIXES = new Set([
  "37.220", "46.23", "46.32", "46.185", "79.173", "80.90", "82.212",
  "85.159", "86.108", "92.253", "109.107", "109.237", "149.200",
  "176.28", "188.123", "188.247", "193.188", "194.165", "212.34", "212.35",
]);
const ALLOWED_PORTS = new Set([53, 80, 443, 853, 1080, 8080, 8888, 10010, 20001, 20002]);
const DNS_PORT = 53;
const PROXY_TEST_PORTS = new Set([1080, 8080, 8888, 10010, 20001, 20002]);
const MAX_ENDPOINTS = 220;
const TIMEOUT_MS = 1600;
const DNS_TIMEOUT_MS = 1200;
const CONNECT_TIMEOUT_MS = 1400;
const CONCURRENCY = 32;
const headers = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
};

function isAllowed(host, port) {
  if (typeof host !== "string" || !/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) return false;
  const octets = host.split(".").map(Number);
  if (octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  if (!ALLOWED_PREFIXES.has(`${octets[0]}.${octets[1]}`)) return false;
  return ALLOWED_PORTS.has(port);
}

/** Real TCP connect probe (SYN → ACK timing). */
function tcpProbe(host, port, timeoutMs = TIMEOUT_MS) {
  return new Promise((resolve) => {
    const started = performance.now();
    const socket = net.createConnection({ host, port });
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish({
      host, port, endpoint: `${host}:${port}`, open: true,
      connectMs: Math.round((performance.now() - started) * 10) / 10,
      evidence: "TCP_SYN_ACK",
    }));
    socket.once("timeout", () => finish({ host, port, endpoint: `${host}:${port}`, open: false, connectMs: null, evidence: "TIMEOUT" }));
    socket.once("error", (error) => finish({
      host, port, endpoint: `${host}:${port}`, open: false, connectMs: null,
      evidence: error.code === "ECONNREFUSED" ? "TCP_RST" : "NETWORK_ERROR",
    }));
  });
}

/** REAL DNS query sent to `host` over UDP/53 via node:dns. */
function dnsProbe(host) {
  return new Promise((resolve) => {
    const started = performance.now();
    const resolver = new Resolver({ timeout: DNS_TIMEOUT_MS, tries: 1 });
    resolver.setServers([host]);
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      try { resolver.cancel(); } catch { /* already done */ }
      resolve(result);
    };
    const timer = setTimeout(() => finish({
      host, port: DNS_PORT, endpoint: `${host}:${DNS_PORT}`,
      open: false, connectMs: null, dns: true, rcode: null,
      evidence: "TIMEOUT",
    }), DNS_TIMEOUT_MS + 250);

    resolver.resolve4("pubg.com", (error, addresses) => {
      clearTimeout(timer);
      const ms = Math.round((performance.now() - started) * 10) / 10;
      if (!error) {
        return finish({
          host, port: DNS_PORT, endpoint: `${host}:${DNS_PORT}`,
          open: true, connectMs: ms, dns: true, rcode: 0,
          evidence: "RCODE_0", answers: addresses || [],
        });
      }
      // Map the real resolver error to DNS-level evidence (never a fake failure).
      const code = error.code || "";
      let rcode = null;
      let evidence = "DNS_ERROR";
      if (code === "ENOTFOUND") { rcode = 3; evidence = "NXDOMAIN"; }
      else if (code === "ESERVFAIL") { rcode = 2; evidence = "SERVFAIL"; }
      else if (code === "EREFUSED" || code === "EACCES") { rcode = 5; evidence = "REFUSED"; }
      else if (code === "ETIMEOUT" || code === "ETIMEDOUT" || code === "EAGAIN") { evidence = "TIMEOUT"; }
      else if (code === "ECONNREFUSED") { evidence = "TCP_RST"; }
      finish({
        host, port: DNS_PORT, endpoint: `${host}:${DNS_PORT}`,
        open: rcode !== null, connectMs: ms, dns: true, rcode,
        evidence, dnsError: code,
      });
    });
  });
}

/** REAL HTTP CONNECT handshake through a proxy. */
function connectProbe(host, port) {
  return new Promise((resolve) => {
    const started = performance.now();
    const socket = net.createConnection({ host, port });
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(CONNECT_TIMEOUT_MS);
    socket.once("connect", () => {
      socket.write("CONNECT pubg.com:443 HTTP/1.1\r\nHost: pubg.com:443\r\n\r\n");
    });
    socket.once("data", (buffer) => {
      const statusLine = buffer.toString("latin1").split("\r\n")[0] || "";
      const status = Number(statusLine.split(" ")[1]) || 0;
      const ms = Math.round((performance.now() - started) * 10) / 10;
      finish({
        host, port, endpoint: `${host}:${port}`, open: true, connectMs: ms,
        proxy: true, httpStatus: status,
        evidence: status >= 200 && status < 300 ? "PROXY_CONNECT_OK" : `PROXY_HTTP_${status}`,
      });
    });
    socket.once("timeout", () => finish({
      host, port, endpoint: `${host}:${port}`, open: true, connectMs: null,
      proxy: true, httpStatus: null, evidence: "CONNECT_TIMEOUT",
    }));
    socket.once("error", (error) => finish({
      host, port, endpoint: `${host}:${port}`, open: false, connectMs: null,
      proxy: true, httpStatus: null,
      evidence: error.code === "ECONNREFUSED" ? "TCP_RST" : "NETWORK_ERROR",
    }));
  });
}

/** One endpoint → the right real test. */
async function probeEndpoint({ host, port }) {
  if (port === DNS_PORT) return dnsProbe(host);
  const tcp = await tcpProbe(host, port);
  if (!tcp.open) return tcp;
  if (PROXY_TEST_PORTS.has(port)) {
    const http = await connectProbe(host, port);
    return {
      ...tcp,
      connectMs: http.connectMs ?? tcp.connectMs,
      proxy: true,
      httpStatus: http.httpStatus,
      evidence: http.evidence,
    };
  }
  return tcp;
}

async function mapConcurrent(values, worker, limit) {
  const out = new Array(values.length);
  let next = 0;
  async function run() {
    while (next < values.length) {
      const index = next++;
      out[index] = await worker(values[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, run));
  return out;
}

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "POST_REQUIRED" }) };
  }
  let body;
  try { body = JSON.parse(event.body || "{}"); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: "INVALID_JSON" }) }; }
  if (!Array.isArray(body.endpoints) || body.endpoints.length > MAX_ENDPOINTS) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "INVALID_ENDPOINTS" }) };
  }
  const unique = [];
  const seen = new Set();
  for (const item of body.endpoints) {
    const host = String(item?.host || "");
    const port = Number(item?.port);
    const key = `${host}:${port}`;
    if (!isAllowed(host, port) || seen.has(key)) continue;
    seen.add(key);
    unique.push({ host, port });
  }
  const results = await mapConcurrent(unique, probeEndpoint, CONCURRENCY);
  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      source: "NETLIFY_EDGE_PROBE",
      measuredAt: new Date().toISOString(),
      note: "DNS (UDP/53) queries, TCP connects and HTTP CONNECT handshakes are measured from the Netlify function region, not from the user's Wi-Fi.",
      results,
    }),
  };
}

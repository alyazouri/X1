import net from "node:net";

const ALLOWED_PREFIXES = new Set([
  "37.220", "46.23", "46.32", "46.185", "79.173", "80.90", "82.212",
  "85.159", "86.108", "92.253", "109.107", "109.237", "149.200",
  "176.28", "188.123", "188.247", "193.188", "194.165", "212.34", "212.35",
]);
const ALLOWED_PORTS = new Set([80, 443, 1080, 8080, 8888, 10010, 20001, 20002]);
const MAX_ENDPOINTS = 220;
const TIMEOUT_MS = 1800;
const CONCURRENCY = 24;
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

function tcpProbe(host, port) {
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
    socket.setTimeout(TIMEOUT_MS);
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
  const results = await mapConcurrent(unique, ({ host, port }) => tcpProbe(host, port), CONCURRENCY);
  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      source: "NETLIFY_TCP_SCANNER",
      measuredAt: new Date().toISOString(),
      note: "Latency is measured from the Netlify function region, not from the user's Wi-Fi.",
      results,
    }),
  };
}
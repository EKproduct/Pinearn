import { Agent, setGlobalDispatcher } from "undici";

// One-time outbound-HTTP tuning for the Node server (import for side effect).
//
// The long-running server was hitting repeated UND_ERR_CONNECT_TIMEOUT on
// Supabase (JWKS + auth) — NOT a remote/DNS problem: the host is IPv4-only (so
// it isn't an IPv6 happy-eyeballs stall) and a *fresh* Node process connects in
// <0.5s. The stalls are local connection-pool contention: the visual-search
// pipeline (Google Lens + CK) opens many concurrent sockets, and undici's
// default keep-alive is only ~4s — long enough that the gaps between Supabase
// calls (a single Lens request can take 7–16s) let the pooled Supabase socket
// idle-close, forcing a cold reconnect that then can't get through under load
// until it times out at undici's 10s default.
//
// Fix: keep idle sockets warm far longer so the Supabase connection is REUSED
// instead of cold-connecting under load, raise the per-origin connection
// ceiling so the pipeline never starves other origins, and shorten the connect
// timeout so a genuinely stuck connect fails fast and our retry recovers
// quickly (see resilient-fetch.ts) instead of blocking ~10s.
let tuned = false;

export function tuneGlobalDispatcher() {
  if (tuned) return;
  tuned = true;
  setGlobalDispatcher(
    new Agent({
      // TCP+TLS connect ceiling — below undici's 10s default so a wedged
      // connect is abandoned fast; resilient-fetch retries from there.
      connect: { timeout: 8_000 },
      // Plenty of headroom per origin so concurrent pipeline fetches never
      // queue behind each other or block a fresh Supabase connect.
      connections: 128,
      // Keep idle sockets alive across the pipeline's long gaps so Supabase
      // (and CK / Lens) connections are reused, not cold-reconnected.
      keepAliveTimeout: 30_000,
      keepAliveMaxTimeout: 10 * 60_000,
    }),
  );
}

tuneGlobalDispatcher();

import { webcrypto } from "node:crypto";
import type { JwtPayload } from "@supabase/supabase-js";
// Side-effect import: tunes undici's global dispatcher (keep-alive reuse +
// higher connection ceiling) before this module warms the JWKS, so the
// Supabase connect isn't starved by pipeline load. Must precede any fetch.
import "@/lib/net-dispatcher.server";
import { withConnectRetry } from "@/lib/resilient-fetch";

// -------------------------------------------------------------
// Local, zero-network JWT verification for the auth middleware.
//
// Supabase signs its access tokens with a single asymmetric ES256 key exposed
// at /auth/v1/.well-known/jwks.json. That key is stable (it only changes on an
// explicit rotation), so we fetch it ONCE, cache the imported public key, and
// verify every request's token locally with WebCrypto — no per-request network
// call, and therefore no per-request connect-timeout to retry through.
//
// The JWKS is warmed in the background the moment this module loads (server
// boot), so by the time the first authenticated request arrives the key is
// already in memory and verification succeeds on the first try. If a request
// somehow beats the warm-up, it awaits the same in-flight fetch (which retries
// transient connect failures) rather than starting a fresh cold one.
//
// This is a FAST PATH only: it can accept a token (valid ES256 signature +
// claims), never reject one. The middleware falls back to Supabase's own
// getClaims for anything this can't positively verify (a rotated/unknown kid,
// a non-ES256 token, a still-cold cache), so security and correctness never
// depend on this code being exhaustive — only its happy path being fast.
// -------------------------------------------------------------

export type TokenClaims = {
  sub?: string;
  exp?: number;
  nbf?: number;
  iss?: string;
  [k: string]: unknown;
};

const JWKS_PATH = "/auth/v1/.well-known/jwks.json";
const jwksFetch = withConnectRetry("supabase.jwks");

// kid -> imported ES256 public key.
let keyCache = new Map<string, CryptoKey>();
let inFlight: Promise<void> | null = null;

function b64urlToBytes(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return new Uint8Array(Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64"));
}

function decodeSegment(seg: string): Record<string, unknown> | null {
  try {
    return JSON.parse(new TextDecoder().decode(b64urlToBytes(seg)));
  } catch {
    return null;
  }
}

async function importJwkSet(
  keys: Array<JsonWebKey & { kid?: string; alg?: string }>,
): Promise<Map<string, CryptoKey>> {
  const next = new Map<string, CryptoKey>();
  for (const jwk of keys) {
    if (jwk.kty !== "EC" || jwk.alg !== "ES256" || !jwk.kid) continue;
    try {
      const imported = await webcrypto.subtle.importKey(
        "jwk",
        jwk,
        { name: "ECDSA", namedCurve: "P-256" },
        false,
        ["verify"],
      );
      next.set(jwk.kid, imported);
    } catch {
      // Skip a key we can't import; getClaims fallback still covers it.
    }
  }
  return next;
}

async function loadJwks(): Promise<void> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url) throw new Error("SUPABASE_URL not set");

  const res = await jwksFetch(`${url.replace(/\/+$/, "")}${JWKS_PATH}`, {
    headers: key ? { apikey: key } : undefined,
  });
  if (!res.ok) throw new Error(`JWKS fetch failed (${res.status})`);
  const data = (await res.json()) as {
    keys?: Array<JsonWebKey & { kid?: string; alg?: string }>;
  };

  const next = await importJwkSet(data.keys ?? []);
  if (next.size === 0) throw new Error("No usable ES256 keys in JWKS");
  keyCache = next;
}

// Optional zero-network seed: put the project's JWKS JSON in SUPABASE_JWKS
// (`curl "$SUPABASE_URL/auth/v1/.well-known/jwks.json"` — it's the PUBLIC
// verification key, safe in env) and local verification works from the very
// first request even when the boot-time fetch to Supabase stalls behind the
// UND_ERR_CONNECT_TIMEOUT → retry cycle seen under pipeline load. Harmless if
// stale: an unknown kid still triggers a live (re)fetch in verifyTokenLocal,
// and getClaims remains the authoritative fallback.
async function seedJwksFromEnv(): Promise<void> {
  const raw = process.env.SUPABASE_JWKS;
  if (!raw) return;
  try {
    const data = JSON.parse(raw) as { keys?: Array<JsonWebKey & { kid?: string; alg?: string }> };
    const seeded = await importJwkSet(data.keys ?? []);
    // Never clobber keys a live fetch already landed — the network copy wins.
    if (seeded.size > 0 && keyCache.size === 0) keyCache = seeded;
  } catch {
    // Malformed seed — the network warm-up below still covers us.
  }
}

// Coalesced fetch — concurrent callers share one in-flight request; a failure
// clears the slot so the next call retries fresh.
function ensureJwks(): Promise<void> {
  if (!inFlight) {
    inFlight = loadJwks().catch((e) => {
      inFlight = null;
      throw e;
    });
  }
  return inFlight;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Warm the cache at boot, retrying with backoff until it lands. Runs detached
// so it never blocks module load; requests that arrive first just await
// ensureJwks() themselves. The env seed (if configured) lands first so the
// cache is usable immediately, with no network round-trip on the line.
(async () => {
  await seedJwksFromEnv();
  for (let attempt = 0; attempt < 30 && keyCache.size === 0; attempt++) {
    try {
      await ensureJwks();
      return;
    } catch {
      await sleep(Math.min(1000 * 2 ** attempt, 30_000));
    }
  }
})();

// Verify a token entirely locally. Returns its claims on a positive verify,
// or null for anything we can't confirm (bad/absent signature, wrong alg,
// expired, unknown kid, cold cache) — callers treat null as "defer to the
// authoritative getClaims path", never as a hard rejection.
export async function verifyTokenLocal(token: string): Promise<JwtPayload | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const header = decodeSegment(parts[0]);
  const payload = decodeSegment(parts[1]) as TokenClaims | null;
  if (!header || !payload) return null;
  // Only the asymmetric ES256 fast path is handled here.
  if (header.alg !== "ES256" || typeof header.kid !== "string") return null;

  let key = keyCache.get(header.kid);
  if (!key) {
    // Key not cached yet (cold start) or possibly rotated — try (re)loading once.
    try {
      await ensureJwks();
    } catch {
      return null;
    }
    key = keyCache.get(header.kid);
  }
  if (!key) return null;

  let ok = false;
  try {
    ok = await webcrypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      b64urlToBytes(parts[2]),
      new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
    );
  } catch {
    return null;
  }
  if (!ok) return null;

  const now = Math.floor(Date.now() / 1000);
  // 30s leeway for clock skew, matching typical JWT libraries.
  if (typeof payload.exp === "number" && now > payload.exp + 30) return null;
  if (typeof payload.nbf === "number" && now < payload.nbf - 30) return null;

  // Guard against a token minted for a different Supabase project.
  const url = process.env.SUPABASE_URL?.replace(/\/+$/, "");
  if (url && typeof payload.iss === "string" && !payload.iss.startsWith(url)) return null;

  // Runtime shape is a real Supabase access-token payload (it carries aud/iat/
  // role/etc.); TokenClaims just doesn't enumerate them. Cast so callers get
  // the same claims type the getClaims fallback returns.
  return payload as unknown as JwtPayload;
}

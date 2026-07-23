import { logNet } from "@/lib/net-logger";

// The runtime's own fetch throws a connect-level error — ConnectTimeoutError
// / UND_ERR_CONNECT_TIMEOUT, ECONNRESET, ETIMEDOUT, ECONNREFUSED, EAI_AGAIN —
// when it can't establish a connection in time. That's about the LOCAL
// process's outbound networking (DNS resolution / connection-pool
// contention from concurrent fetches to other hosts), not the remote
// server: the same URL answers instantly via `curl` moments later, from a
// separate process with its own resolver/socket path. It's inherently
// transient — a retry a moment later succeeds once the local contention
// clears — so it gets a few retries with growing backoff, the same spirit as
// the CK/visual-search retry logic.
//
// undici's default connect timeout is ~10s per attempt, so a single blip can
// burn that before we even retry. A handful of attempts with exponential
// backoff covers a transient window several seconds wide without changing
// behavior for a request that would otherwise succeed.
const MAX_ATTEMPTS = 4;
// Backoff before attempt N (index N-2). Grows so we don't hammer during a
// longer blip but still recover quickly from a brief one.
const RETRY_BACKOFFS_MS = [300, 1_000, 3_000];

// Per-attempt connect ceiling (index = attempt-1). This is a balance between
// two failure modes seen in the wild:
//   - undici's own 10s default is too long when a connect is genuinely wedged
//     (a retry a moment later connects instantly), and
//   - too SHORT a ceiling is actively harmful: a real cold connect to Supabase
//     (DNS + TLS, no warm pooled socket yet) legitimately takes ~6s, so an
//     aggressive 3s/5s ceiling aborts a connect that was about to succeed and
//     then re-races it — turning one ~6s connect into 16s+ of churn.
// So the first attempt gets ~9s (enough for a cold connect to land, still
// under undici's 10s so the ceiling stays meaningful), and later attempts are
// uncapped — a transient reset/refused still retries, but we never repeatedly
// guillotine a slow-but-healthy connect. Net: the common cold connect succeeds
// on attempt 1 with no wasted retry; only a truly wedged socket escalates.
const CONNECT_TIMEOUTS_MS: Array<number | undefined> = [9_000, undefined];

const TRANSIENT_CODES = new Set([
  "UND_ERR_CONNECT_TIMEOUT",
  "ECONNRESET",
  "ETIMEDOUT",
  "ECONNREFUSED",
  "EAI_AGAIN",
]);

function connectErrorCode(e: unknown): string | undefined {
  if (!(e instanceof Error)) return undefined;
  const own = (e as { code?: string }).code;
  const causeCode = (e.cause as { code?: string } | undefined)?.code;
  if (own) return own;
  if (causeCode) return causeCode;
  return e.name === "ConnectTimeoutError" ? "UND_ERR_CONNECT_TIMEOUT" : undefined;
}

function isTransientConnectError(e: unknown): boolean {
  const code = connectErrorCode(e);
  return !!code && TRANSIENT_CODES.has(code);
}

// Wraps a fetch implementation so a transient connect-level failure gets a few
// retries with growing backoff, plus a per-attempt connect ceiling that fails
// fast instead of waiting out undici's ~10s default (see CONNECT_TIMEOUTS_MS).
// The timeout is applied via an AbortController we own, kept strictly separate
// from the caller's own signal: a caller-driven abort (`init.signal` firing) is
// never retried or logged here — that's the caller's decision — while our own
// timeout is treated exactly like the transient connect error it stands in for.
// Because the final attempt is uncapped, this can only make a failing request
// recover sooner; it never changes behavior for a request that would succeed.
export function withConnectRetry(label: string, baseFetch: typeof fetch = fetch): typeof fetch {
  return async (input, init) => {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const startedAt = Date.now();

      // Our own controller for this attempt's connect ceiling. We forward the
      // caller's abort into it so an external cancel still works, but track
      // whether WE aborted (timeout) so it isn't mistaken for a caller abort.
      const timeoutMs = CONNECT_TIMEOUTS_MS[Math.min(attempt - 1, CONNECT_TIMEOUTS_MS.length - 1)];
      const controller = new AbortController();
      let timedOut = false;
      const timer =
        timeoutMs == null
          ? undefined
          : setTimeout(() => {
              timedOut = true;
              controller.abort();
            }, timeoutMs);
      const callerSignal = init?.signal ?? undefined;
      const forwardAbort = () => controller.abort(callerSignal?.reason);
      if (callerSignal) {
        if (callerSignal.aborted) controller.abort(callerSignal.reason);
        else callerSignal.addEventListener("abort", forwardAbort, { once: true });
      }

      try {
        const res = await baseFetch(input, { ...init, signal: controller.signal });
        if (attempt > 1) {
          logNet(`${label}.retry_succeeded`, { attempt, durationMs: Date.now() - startedAt });
        }
        return res;
      } catch (e) {
        const durationMs = Date.now() - startedAt;
        // A real caller abort (their signal fired) is their decision — bail.
        // Our own timeout also surfaces as an abort here, but `timedOut`
        // tells the two apart.
        if (callerSignal?.aborted && !timedOut) throw e;

        const transient = timedOut || isTransientConnectError(e);
        const isLastAttempt = attempt === MAX_ATTEMPTS;
        const code = timedOut
          ? "UND_ERR_CONNECT_TIMEOUT"
          : (connectErrorCode(e) ?? (e instanceof Error ? e.name : String(e)));
        logNet(transient ? `${label}.connect_timeout` : `${label}.error`, {
          attempt,
          durationMs,
          willRetry: transient && !isLastAttempt,
          code,
        });
        if (!transient) throw e;
        if (isLastAttempt) {
          console.error(`[${label}] connect failed after ${attempt} attempts: ${code}`);
          throw e;
        }
        await new Promise((resolve) =>
          setTimeout(
            resolve,
            RETRY_BACKOFFS_MS[Math.min(attempt - 1, RETRY_BACKOFFS_MS.length - 1)],
          ),
        );
      } finally {
        if (timer) clearTimeout(timer);
        callerSignal?.removeEventListener("abort", forwardAbort);
      }
    }
    throw new Error(`${label}: exhausted retries`);
  };
}

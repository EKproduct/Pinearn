// Structured logging for outbound-request instrumentation (concurrency,
// cache hit/miss, retries, timeouts, duration) so bottlenecks show up
// directly in server logs — grep for "[net]" — without extra tooling.
type LogFields = Record<string, string | number | boolean | null | undefined>;

export function logNet(event: string, fields: LogFields = {}): void {
  const parts = Object.entries(fields)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}=${v}`);
  console.log(`[net] ${event}${parts.length ? " " + parts.join(" ") : ""}`);
}

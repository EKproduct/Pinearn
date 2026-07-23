// Client-side pipeline timing instrumentation — mirrors the server's
// `net-logger.ts` structured-log style so both halves of the pipeline show
// up the same way in their respective consoles (grep "[pipeline]").
//
// The three numbers that matter for a progressive-rendering pipeline aren't
// "total time" (there's no single end-to-end request to time anymore) —
// they're per search-session:
//   ttfp  — time to first product: raw matches painted on screen
//   ttfcp — time to first *complete* card: first CK lookup resolved
//   done  — every CK lookup for this session has reached a terminal state
type LogFields = Record<string, string | number | boolean | null | undefined>;

export function logPipeline(event: string, fields: LogFields = {}): void {
  const parts = Object.entries(fields)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}=${v}`);
  console.log(`[pipeline] ${event}${parts.length ? " " + parts.join(" ") : ""}`);
}

import { useEffect, useRef } from "react";
import { logPipeline } from "@/lib/pipeline-log";

// Tracks the three numbers that matter for a progressive-rendering search:
// TTFP (time to first product — raw matches painted), TTFCP (time to first
// *complete* card — first CK lookup resolved), and total completion (every
// match's CK lookup has reached a terminal state: available, unavailable,
// or errored). There's no single "pipeline done" request to time anymore
// once CK calls run independently per card, so this reconstructs the same
// picture from the client side instead.
//
// `sessionId` identifies one search (a pinId or an imageUrl) — bookkeeping
// resets the instant it changes, so timings never leak across searches.
export function usePipelineTiming(sessionId: string | null, isReady: boolean, matchCount: number) {
  const sessionRef = useRef<string | null>(null);
  const startRef = useRef<number | null>(null);
  const loggedTtfpRef = useRef(false);
  const loggedTtfcpRef = useRef(false);
  const doneLoggedRef = useRef(false);
  const resolvedRef = useRef<Set<string>>(new Set());

  // Reset bookkeeping synchronously during render the moment the session
  // changes — this must happen before anything below reads the refs this
  // render, so it can't be a useEffect (which would run one render late).
  if (sessionRef.current !== sessionId) {
    sessionRef.current = sessionId;
    startRef.current = sessionId ? performance.now() : null;
    loggedTtfpRef.current = false;
    loggedTtfcpRef.current = false;
    doneLoggedRef.current = false;
    resolvedRef.current = new Set();
  }

  useEffect(() => {
    if (!sessionId || !isReady || loggedTtfpRef.current || startRef.current == null) return;
    loggedTtfpRef.current = true;
    const ms = Math.round(performance.now() - startRef.current);
    logPipeline("ttfp", { sessionId, ms, matches: matchCount });
    // A search with zero matches has nothing left to progressively
    // complete — it's done the instant it's ready.
    if (matchCount === 0 && !doneLoggedRef.current) {
      doneLoggedRef.current = true;
      logPipeline("pipeline_complete", { sessionId, ms, total: 0 });
    }
  }, [sessionId, isReady, matchCount]);

  function reportResolved(link: string) {
    if (!sessionId || startRef.current == null || resolvedRef.current.has(link)) return;
    resolvedRef.current.add(link);
    const ms = Math.round(performance.now() - startRef.current);
    if (!loggedTtfcpRef.current) {
      loggedTtfcpRef.current = true;
      logPipeline("ttfcp", { sessionId, ms });
    }
    if (!doneLoggedRef.current && matchCount > 0 && resolvedRef.current.size >= matchCount) {
      doneLoggedRef.current = true;
      logPipeline("pipeline_complete", { sessionId, ms, total: matchCount });
    }
  }

  return { reportResolved };
}

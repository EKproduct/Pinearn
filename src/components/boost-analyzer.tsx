import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  CalendarClock,
  Check,
  LayoutGrid,
  Loader2,
  Rocket,
  ScanSearch,
  Type,
  UserCheck,
} from "lucide-react";

// The theatrical "analysing your Pinterest" sequence shown before the Boost
// score reveals. Pure choreography — the real scoring is synchronous and
// instant, but landing straight on a number reads like a static audit. This
// walks through what the engine actually checks, with live counts, so the
// score that follows feels earned.

type Step = {
  icon: typeof Type;
  label: string;
  // Resolves the live sub-label ("142 pins scanned") once data is in hand.
  detail: (counts: AnalyzerCounts) => string;
};

export type AnalyzerCounts = { pins: number; boards: number };

const STEPS: Step[] = [
  {
    icon: ScanSearch,
    label: "Scanning your Pinterest",
    detail: (c) => `${c.pins} pins · ${c.boards} boards found`,
  },
  {
    icon: Type,
    label: "Checking pin titles & descriptions",
    detail: (c) => `${c.pins} pins checked against SEO rules`,
  },
  {
    icon: LayoutGrid,
    label: "Auditing board structure",
    detail: (c) => `${c.boards} board names & descriptions reviewed`,
  },
  {
    icon: UserCheck,
    label: "Reviewing profile completeness",
    detail: () => "Bio, avatar, website & socials",
  },
  {
    icon: CalendarClock,
    label: "Measuring content freshness",
    detail: () => "Pin activity over the last 30 days",
  },
];

const STEP_MS = 750;

// Once per session — returning from a fix flow must land straight on the
// climbing score, not sit through the scan again.
const SEEN_KEY = "pinearn.boost.analyzed";

export function hasAnalyzedThisSession(): boolean {
  try {
    return sessionStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

export function markAnalyzedThisSession() {
  try {
    sessionStorage.setItem(SEEN_KEY, "1");
  } catch {
    /* private mode — worst case the scan replays */
  }
}

export function BoostAnalyzer({
  counts,
  ready,
  onDone,
}: {
  counts: AnalyzerCounts | null;
  // Data + report are in hand — the reveal may fire once choreography ends.
  ready: boolean;
  onDone: () => void;
}) {
  const reduce = useReducedMotion();
  // How many steps have completed. Steps tick on a timer; the final reveal
  // additionally waits for real data so we never reveal a skeleton.
  const [completed, setCompleted] = useState(0);

  useEffect(() => {
    if (completed >= STEPS.length) return;
    const t = setTimeout(() => setCompleted((n) => n + 1), STEP_MS);
    return () => clearTimeout(t);
  }, [completed]);

  const allStepsDone = completed >= STEPS.length;
  useEffect(() => {
    if (!allStepsDone || !ready) return;
    const t = setTimeout(onDone, 500);
    return () => clearTimeout(t);
  }, [allStepsDone, ready, onDone]);

  // Reduced motion: no theatrical wait — reveal the moment data is ready.
  useEffect(() => {
    if (!reduce) return;
    if (ready) {
      const t = setTimeout(onDone, 200);
      return () => clearTimeout(t);
    }
  }, [reduce, ready, onDone]);

  const c = counts;

  if (reduce) {
    return (
      <div role="status" aria-live="polite" className="mx-auto max-w-md py-16 text-center">
        <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
        <p className="mt-3 text-sm font-semibold">Analysing your Pinterest…</p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.25 } }}
      className="mx-auto max-w-md"
    >
      {/* Radar — pulsing rings around the rocket */}
      <div className="relative mx-auto grid h-40 w-40 place-items-center">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="absolute inset-0 rounded-full border-2 border-primary/40"
            initial={{ scale: 0.4, opacity: 0.8 }}
            animate={{ scale: 1.15, opacity: 0 }}
            transition={{ duration: 2, repeat: Infinity, delay: i * 0.66, ease: "easeOut" }}
          />
        ))}
        <motion.div
          animate={{ scale: [1, 1.06, 1] }}
          transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
          className="grid h-20 w-20 place-items-center rounded-full bg-gradient-primary text-primary-foreground shadow-glow"
        >
          <Rocket className="h-9 w-9" />
        </motion.div>
      </div>

      <h2 className="mt-2 text-center font-display text-xl font-bold">Analysing your Pinterest</h2>
      <p className="mt-1 text-center text-xs text-muted-foreground">
        Running {STEPS.length} checks across your pins, boards & profile
      </p>

      {/* Steps — each spins, then checks off. role=status narrates for SR. */}
      <div role="status" aria-live="polite" className="mt-6 space-y-2">
        {STEPS.map((step, i) => {
          const state = i < completed ? "done" : i === completed ? "active" : "pending";
          const Icon = step.icon;
          return (
            <motion.div
              key={step.label}
              initial={{ opacity: 0, y: 10 }}
              animate={{
                opacity: state === "pending" ? 0.4 : 1,
                y: 0,
                scale: state === "active" ? 1.02 : 1,
              }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className={`flex items-center gap-3 rounded-2xl border px-4 py-3 ${
                state === "active"
                  ? "border-primary/40 bg-primary/5 shadow-sm"
                  : "border-border bg-surface"
              }`}
            >
              <div
                className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${
                  state === "done"
                    ? "bg-emerald-500/10 text-emerald-600"
                    : "bg-primary/10 text-primary"
                }`}
              >
                <Icon className="h-4.5 w-4.5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold leading-tight">{step.label}</p>
                <AnimatePresence mode="wait">
                  {/* Only show the count line once real data is in — never "0 pins". */}
                  {state === "done" && c && (
                    <motion.p
                      initial={{ opacity: 0, y: -3 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="text-[11px] text-muted-foreground"
                    >
                      {step.detail(c)}
                    </motion.p>
                  )}
                </AnimatePresence>
              </div>
              <div className="shrink-0">
                {state === "done" ? (
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", stiffness: 500, damping: 22 }}
                    className="grid h-6 w-6 place-items-center rounded-full bg-emerald-500 text-white"
                  >
                    <Check className="h-3.5 w-3.5" strokeWidth={3} />
                  </motion.span>
                ) : state === "active" ? (
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                ) : (
                  <span className="block h-6 w-6 rounded-full border-2 border-dashed border-border" />
                )}
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Overall progress bar */}
      <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-surface-2">
        <motion.div
          className="h-full rounded-full bg-gradient-primary"
          initial={{ width: "4%" }}
          animate={{ width: `${Math.min(100, (completed / STEPS.length) * 100)}%` }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        />
      </div>
      <div className="mt-2 flex items-center justify-center gap-3">
        <p className="text-[11px] font-medium text-muted-foreground">
          {allStepsDone && !ready ? "Crunching your score…" : "This only takes a few seconds"}
        </p>
        <button
          type="button"
          onClick={onDone}
          className="text-[11px] font-bold text-primary hover:underline"
        >
          Skip
        </button>
      </div>
    </motion.div>
  );
}

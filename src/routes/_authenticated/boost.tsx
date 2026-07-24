import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Fragment, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, type Variants } from "framer-motion";
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Compass,
  Hand,
  ImagePlus,
  Info,
  LayoutGrid,
  Link2,
  MousePointerClick,
  PencilLine,
  RefreshCw,
  Rocket,
  Sparkles,
  TrendingUp,
  Type,
  Undo2,
  UserCheck,
  X,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { AnimatedNumber, scoreTone } from "@/components/health-widgets";
import {
  BoostAnalyzer,
  hasAnalyzedThisSession,
  markAnalyzedThisSession,
} from "@/components/boost-analyzer";
import { useHealthScore, type HealthData } from "@/hooks/use-health-score";
import {
  boardIssues,
  boardPassesStructure,
  pinPassesSeo,
  pinSeoIssues,
  recordScore,
  saveLastSeenScore,
  SCORE_CRITERIA,
  staleBoards,
  SUB_SCORE_WEIGHTS,
  takeLastSeenScore,
  type ProfileItem,
  type ProfileItemKey,
  type SubScore,
  type SubScoreKey,
} from "@/lib/health-score";

export const Route = createFileRoute("/_authenticated/boost")({
  component: BoostPinsPage,
});

const SUB_ICONS: Record<SubScoreKey, typeof Type> = {
  pinSeo: Type,
  boardStructure: LayoutGrid,
  profile: UserCheck,
  freshness: CalendarClock,
};

function BoostPinsPage() {
  const navigate = useNavigate();
  const { report, data, isLoading, refetch, isFetching } = useHealthScore();

  // A fix flow stashes the score the user last saw; climb from it so the
  // improvement is felt the moment they land back here.
  const animateFrom = useMemo(() => takeLastSeenScore(), []);

  // Which area's fix briefing is open. Every entry into a fix flow goes through
  // this intermediate step first — it shows what's wrong and what we'll do,
  // rather than dumping the user straight into the deck.
  const [briefingKey, setBriefingKey] = useState<SubScoreKey | null>(null);

  // The "analysing your Pinterest" choreography — once per session, and never
  // when returning from a fix flow (the climbing score IS that moment).
  const [analyzing, setAnalyzing] = useState(
    () => animateFrom == null && !hasAnalyzedThisSession(),
  );

  // Record the score for the dashboard's "since last visit" delta — once the
  // real number is on screen.
  const recorded = useMemo(() => ({ done: false }), []);
  useEffect(() => {
    if (report && !analyzing && !recorded.done) {
      recorded.done = true;
      recordScore(report.overall);
    }
  }, [report, analyzing, recorded]);

  // Deep-link CTAs. saveLastSeenScore fires on EVERY fix path (not just the
  // swipe flows) so the score climb animates on return regardless of route.
  const goProfile = (item: ProfileItemKey) => {
    if (report) saveLastSeenScore(report.overall);
    if (item === "avatar") return navigate({ to: "/profile", search: { focus: "avatar" } });
    if (item === "social") return navigate({ to: "/profile", search: { focus: "pinterest" } });
    return navigate({ to: "/storefront", search: { collection: undefined, edit: 1 } });
  };
  const goFreshness = (boardId?: string) => {
    if (report) saveLastSeenScore(report.overall);
    navigate({ to: "/pins/create", search: { board: boardId } });
  };
  const goFix = (key: SubScoreKey) => {
    if (!data || !report) return;
    switch (key) {
      case "pinSeo":
        return navigate({ to: "/boost/pins" });
      case "boardStructure":
        return navigate({ to: "/boost/boards" });
      case "profile": {
        const first = report.profileItems.find((i) => !i.ok);
        return goProfile(first?.key ?? "bio");
      }
      case "freshness":
        return goFreshness(staleBoards(data.pins, data.boards)[0]?.id);
    }
  };

  const ranked = useMemo(
    () => (report ? [...report.subScores].sort((a, b) => b.potentialGain - a.potentialGain) : []),
    [report],
  );
  return (
    <AppShell
      title="Boost Pins"
      subtitle="One score. Everything holding your reach back."
      backButton
      backTo="/dashboard"
    >
      <div className="mx-auto max-w-2xl">
        <AnimatePresence mode="wait">
          {analyzing ? (
            <BoostAnalyzer
              key="analyzer"
              counts={data ? { pins: data.pins.length, boards: data.boards.length } : null}
              ready={!!report}
              onDone={() => {
                markAnalyzedThisSession();
                setAnalyzing(false);
              }}
            />
          ) : isLoading || !report ? (
            <BoostSkeleton key="skeleton" />
          ) : report.isEmpty ? (
            <EmptyState key="empty" />
          ) : (
            <motion.div
              key="score"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            >
              {/* ---- Minimal hero: score · one line · one action ---- */}
              <div className="relative overflow-hidden rounded-[2rem] border border-border/70 bg-gradient-to-b from-rose-50/70 via-surface to-surface p-6 shadow-elevate sm:p-7">
                <div
                  aria-hidden
                  className="pointer-events-none absolute -top-28 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-primary/10 blur-3xl"
                />
                {/* Quiet, icon-only recheck — kept out of the main composition. */}
                <button
                  type="button"
                  onClick={() => refetch()}
                  aria-label="Recheck score"
                  className="absolute right-3 top-3 z-10 grid h-9 w-9 place-items-center rounded-full text-muted-foreground/60 transition hover:bg-surface-2 hover:text-primary"
                >
                  <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
                </button>

                <div className="relative flex flex-col items-center text-center">
                  <ScoreRing score={report.overall} from={animateFrom} />
                </div>
              </div>

              <HowScoringWorks />

              {/* ---- One prioritized plan (grid + list merged) ---- */}
              <div className="mt-6">
                <div className="mb-3 flex items-baseline justify-between">
                  <h2 className="font-display text-lg font-semibold">Your boost plan</h2>
                  <span className="text-[11px] text-muted-foreground">Biggest wins first</span>
                </div>
                <div className="grid gap-2.5">
                  {ranked.map((s, i) => (
                    <BoostRow key={s.key} sub={s} rank={i} onFix={() => setBriefingKey(s.key)} />
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Intermediate briefing — what's wrong + how we'll fix it, before the flow. */}
      <AnimatePresence>
        {briefingKey && report && data && (
          <FixBriefing
            sub={report.subScores.find((s) => s.key === briefingKey)!}
            data={data}
            profileItems={report.profileItems}
            onStart={() => goFix(briefingKey)}
            onClose={() => setBriefingKey(null)}
          />
        )}
      </AnimatePresence>
    </AppShell>
  );
}

/* ---------------- Fix briefing (intermediate step) ---------------- */

type MissingItem = { id: string; title: string; note: string };

// The concrete items dragging an area down — the same detail the old inline
// "what's missing" expander showed, now surfaced in the briefing.
function missingItemsFor(
  key: SubScoreKey,
  data: HealthData,
  profileItems: ProfileItem[],
): MissingItem[] {
  switch (key) {
    case "pinSeo":
      return data.pins
        .filter((p) => !pinPassesSeo(p))
        .map((p) => ({
          id: p.id,
          title: p.title?.trim() || "Untitled pin",
          note: pinSeoIssues(p).join(" · "),
        }));
    case "boardStructure":
      return data.boards
        .filter((b) => !boardPassesStructure(b))
        .map((b) => ({
          id: b.id,
          title: b.name?.trim() || "Unnamed board",
          note: boardIssues(b).join(" · "),
        }));
    case "profile":
      return profileItems
        .filter((i) => !i.ok)
        .map((i) => ({ id: i.key, title: i.label, note: "Not set yet" }));
    case "freshness":
      return staleBoards(data.pins, data.boards).map((b) => ({
        id: b.id,
        title: b.name,
        note: b.daysSinceLastPin == null ? "No pins yet" : `Last pin ${b.daysSinceLastPin}d ago`,
      }));
  }
}

// The fix flow shown as three glanceable icon steps instead of sentences.
type HowStep = { icon: typeof Sparkles; label: string };
const HOW_STEPS: Record<SubScoreKey, HowStep[]> = {
  pinSeo: [
    { icon: Sparkles, label: "AI drafts titles & descriptions" },
    { icon: Hand, label: "Swipe to apply" },
    { icon: TrendingUp, label: "Grow reach & rank" },
  ],
  boardStructure: [
    { icon: Sparkles, label: "We suggest" },
    { icon: Hand, label: "Swipe to apply" },
    { icon: Undo2, label: "Undo anytime" },
  ],
  profile: [
    { icon: MousePointerClick, label: "Jump to field" },
    { icon: PencilLine, label: "Fill it in" },
    { icon: TrendingUp, label: "Score climbs" },
  ],
  freshness: [
    { icon: Compass, label: "Find quiet boards" },
    { icon: ImagePlus, label: "Add a pin" },
    { icon: TrendingUp, label: "Reach grows" },
  ],
};

function FixBriefing({
  sub,
  data,
  profileItems,
  onStart,
  onClose,
}: {
  sub: SubScore;
  data: HealthData;
  profileItems: ProfileItem[];
  onStart: () => void;
  onClose: () => void;
}) {
  const tone = scoreTone(sub.score);
  const Icon = SUB_ICONS[sub.key];
  const items = missingItemsFor(sub.key, data, profileItems);
  const shown = items.slice(0, 6);
  const more = items.length - shown.length;

  // Collapse the repetitive per-item notes into a ranked tally of problem
  // types, so the same information reads as a visual breakdown, not a list.
  const topIssues = useMemo(() => {
    const tally = new Map<string, number>();
    for (const it of items) {
      for (const tag of it.note ? it.note.split(" · ") : []) {
        tally.set(tag, (tally.get(tag) ?? 0) + 1);
      }
    }
    return [...tally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
  }, [items]);
  // Bars only make sense when a problem actually repeats; otherwise (freshness,
  // profile — every note unique) fall back to titled chips.
  const useBars = topIssues.length > 0 && topIssues[0][1] >= 2;

  const container: Variants = {
    hidden: {},
    show: { transition: { staggerChildren: 0.06, delayChildren: 0.1 } },
  };
  const item: Variants = {
    hidden: { opacity: 0, y: 10 },
    // ease typed as a cubic-bezier tuple — a bare number[] isn't assignable to
    // framer-motion's Easing inside a Variants object (unlike inline transitions).
    show: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] },
    },
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      onClick={onClose}
      className="fixed inset-0 z-[60] flex items-end justify-center bg-background/70 backdrop-blur-sm sm:items-center sm:p-4"
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="briefing-title"
        onClick={(e) => e.stopPropagation()}
        initial={{ y: 48, opacity: 0.5 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 48, opacity: 0 }}
        transition={{ type: "spring", stiffness: 360, damping: 34 }}
        className="max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-border bg-surface p-6 shadow-elevate sm:rounded-3xl"
        style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}
      >
        <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-border sm:hidden" />

        <motion.div variants={container} initial="hidden" animate="show">
          {/* Header: which area, the score now, the points on the table. */}
          <motion.div variants={item} className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div
                className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${tone.bg} ${tone.text}`}
              >
                <Icon className="h-6 w-6" />
              </div>
              <div>
                <h2 id="briefing-title" className="font-display text-lg font-bold leading-tight">
                  {sub.label}
                </h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  <span className={`font-bold ${tone.text}`}>{sub.score}%</span> now ·{" "}
                  <span className="font-bold text-emerald-600">+{sub.potentialGain} pts</span> to
                  gain
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="-mr-1 -mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted-foreground transition hover:bg-surface-2"
            >
              <X className="h-4 w-4" />
            </button>
          </motion.div>

          {/* What's holding it back — a hero count + visual problem breakdown. */}
          <motion.p
            variants={item}
            className="mt-6 text-[11px] font-bold uppercase tracking-wide text-muted-foreground"
          >
            What's holding it back
          </motion.p>
          <motion.div variants={item} className="mt-2 flex items-end gap-2">
            <span className={`font-display text-4xl font-black leading-none ${tone.text}`}>
              {sub.failing}
            </span>
            <span className="pb-0.5 text-sm font-semibold text-muted-foreground">
              {sub.unit} need attention
            </span>
          </motion.div>

          {useBars ? (
            <motion.div variants={container} className="mt-4 space-y-2.5">
              {topIssues.map(([label, count]) => (
                <motion.div key={label} variants={item}>
                  <div className="mb-1 flex items-center justify-between text-[11px] font-semibold">
                    <span className="text-foreground/80">{label}</span>
                    <span className="text-muted-foreground">{count}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                    <motion.div
                      className="h-full rounded-full bg-amber-400"
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.max(6, (count / sub.failing) * 100)}%` }}
                      transition={{ duration: 0.6, delay: 0.25, ease: [0.22, 1, 0.36, 1] }}
                    />
                  </div>
                </motion.div>
              ))}
            </motion.div>
          ) : (
            <motion.div variants={container} className="mt-3 flex flex-wrap gap-1.5">
              {shown.map((m) => (
                <motion.span
                  key={m.id}
                  variants={item}
                  className="max-w-full truncate rounded-full bg-surface-2/70 px-3 py-1.5 text-xs font-medium"
                >
                  {m.title}
                </motion.span>
              ))}
              {more > 0 && (
                <motion.span
                  variants={item}
                  className="rounded-full px-2 py-1.5 text-xs text-muted-foreground"
                >
                  +{more} more
                </motion.span>
              )}
            </motion.div>
          )}

          {/* How we'll fix it — three glanceable steps, connected left to right. */}
          <motion.p
            variants={item}
            className="mt-6 text-[11px] font-bold uppercase tracking-wide text-muted-foreground"
          >
            How we'll fix it
          </motion.p>
          <motion.div variants={container} className="mt-2.5 flex items-stretch gap-1">
            {HOW_STEPS[sub.key].map((step, i) => (
              <Fragment key={i}>
                <motion.div
                  variants={item}
                  className="flex flex-1 flex-col items-center gap-1.5 rounded-2xl bg-surface-2/50 px-1.5 py-3 text-center"
                >
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-primary/10 text-primary">
                    <step.icon className="h-4 w-4" />
                  </span>
                  <span className="text-[11px] font-semibold leading-tight text-foreground/85">
                    {step.label}
                  </span>
                </motion.div>
                {i < HOW_STEPS[sub.key].length - 1 && (
                  <ChevronRight className="h-4 w-4 shrink-0 self-center text-muted-foreground/40" />
                )}
              </Fragment>
            ))}
          </motion.div>

          <motion.div variants={item} className="mt-6 flex flex-col gap-1.5">
            <button
              type="button"
              onClick={onStart}
              className="inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-gradient-primary px-5 text-sm font-extrabold text-primary-foreground shadow-glow transition hover:opacity-95 active:scale-[0.99]"
            >
              <Sparkles className="h-4 w-4" /> Start fixing <ArrowRight className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] w-full text-xs font-semibold text-muted-foreground transition hover:text-foreground"
            >
              Maybe later
            </button>
          </motion.div>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}

/* ---------------- Hero pieces ---------------- */

function ScoreRing({ score, from }: { score: number; from?: number | null }) {
  const R = 76;
  const C = 2 * Math.PI * R;
  const tone = scoreTone(score);
  return (
    <div className="relative grid h-48 w-48 shrink-0 place-items-center">
      <svg viewBox="0 0 176 176" className="absolute inset-0 h-full w-full -rotate-90">
        <defs>
          <linearGradient id="boost-ring" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="oklch(0.62 0.22 28)" />
            <stop offset="100%" stopColor="oklch(0.5 0.24 15)" />
          </linearGradient>
        </defs>
        <circle cx="88" cy="88" r={R} fill="none" strokeWidth="9" className="stroke-primary/10" />
        <motion.circle
          cx="88"
          cy="88"
          r={R}
          fill="none"
          stroke="url(#boost-ring)"
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={C}
          initial={{ strokeDashoffset: C * (1 - (from ?? 0) / 100) }}
          animate={{ strokeDashoffset: C * (1 - score / 100) }}
          transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1] }}
        />
      </svg>
      <div className="flex flex-col items-center">
        <span
          className={`font-display text-6xl font-extrabold leading-none tracking-tight ${tone.text}`}
        >
          <AnimatedNumber value={score} from={from ?? 0} duration={1.4} />
        </span>
        <span className="mt-2 text-xs font-semibold tracking-wide text-muted-foreground">
          / 100
        </span>
      </div>
    </div>
  );
}

/* ---------------- Boost plan rows ---------------- */

function BoostRow({ sub, rank, onFix }: { sub: SubScore; rank: number; onFix: () => void }) {
  const tone = scoreTone(sub.score);
  const Icon = SUB_ICONS[sub.key];
  const optimized = sub.score >= 100;

  // Show points earned out of this area's max contribution to the overall
  // score (its weight as points), e.g. Pin SEO at 20% → "7/35". The bar itself
  // stays proportional to the raw percentage.
  const totalPts = Math.round(SUB_SCORE_WEIGHTS[sub.key] * 100);
  const earnedPts = Math.round(SUB_SCORE_WEIGHTS[sub.key] * sub.score);

  if (optimized) {
    return (
      <div className="flex items-center gap-3.5 rounded-2xl border border-border bg-surface/60 px-4 py-4">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-emerald-500/10 text-emerald-500">
          <Icon className="h-5 w-5" />
        </div>
        <p className="min-w-0 flex-1 truncate text-[15px] font-semibold">{sub.label}</p>
        <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" />
      </div>
    );
  }

  // Whole card is the action — tap anywhere to open that area's fix flow.
  // Just the heading and its progress loader; ranking is shown by order and,
  // for the top win, a subtle primary tint.
  const isTop = rank === 0;
  return (
    <motion.button
      type="button"
      onClick={onFix}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 + rank * 0.06, duration: 0.3, ease: "easeOut" }}
      className={`group flex w-full items-center gap-3.5 rounded-2xl border p-4 text-left transition active:scale-[0.99] ${
        isTop
          ? "border-primary/40 bg-primary/5 hover:bg-primary/[0.08]"
          : "border-border bg-surface hover:bg-surface-2/60"
      }`}
    >
      <div
        className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${tone.bg} ${tone.text}`}
      >
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-semibold">{sub.label}</p>
        <div className="mt-2 flex items-center gap-2.5">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
            <motion.div
              className={`h-full rounded-full ${tone.bar}`}
              initial={false}
              animate={{ width: `${sub.score}%` }}
              transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
            />
          </div>
          <span className={`shrink-0 text-right text-xs font-extrabold tabular-nums ${tone.text}`}>
            {earnedPts}/{totalPts} pts
          </span>
        </div>
      </div>
      <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground/50 transition group-hover:translate-x-0.5 group-hover:text-muted-foreground" />
    </motion.button>
  );
}

/* ---------------- "How your score works" explainer ---------------- */

function HowScoringWorks() {
  const [open, setOpen] = useState(false);
  const keys: SubScoreKey[] = ["pinSeo", "boardStructure", "profile", "freshness"];
  return (
    <div className="mt-3 rounded-xl border border-border bg-surface">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 px-3 py-2 text-left"
        aria-expanded={open}
      >
        <Info className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="flex-1 text-xs font-semibold">How your score works</span>
        <ChevronDown
          className={`h-3.5 w-3.5 text-muted-foreground transition ${open ? "rotate-180" : ""}`}
        />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="space-y-3 px-4 pb-4">
              {keys.map((k) => (
                <div key={k} className="border-t border-border/60 pt-3">
                  <p className="flex items-center justify-between text-sm font-semibold">
                    {
                      {
                        pinSeo: "Pin SEO",
                        boardStructure: "Board Structure",
                        profile: "Profile Completeness",
                        freshness: "Content Freshness",
                      }[k]
                    }
                    <span className="text-[11px] font-bold text-muted-foreground">
                      {Math.round(SUB_SCORE_WEIGHTS[k] * 100)}% of score
                    </span>
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {SCORE_CRITERIA[k]}
                  </p>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ---------------- Empty / loading ---------------- */

function EmptyState() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-3xl border border-border bg-gradient-to-br from-rose-50 via-orange-50/60 to-surface p-8 text-center shadow-elevate"
    >
      <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-primary/10 text-primary">
        <Rocket className="h-8 w-8" />
      </div>
      <h2 className="mt-4 font-display text-2xl font-bold">Your Boost Score starts here</h2>
      <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted-foreground">
        Once you have pins and boards, we'll score your Pinterest SEO and show you exactly what to
        fix. Add your first pin to begin.
      </p>
      <div className="mt-6 flex flex-col justify-center gap-2.5 sm:flex-row">
        <Link
          to="/pins/create"
          search={{ board: undefined }}
          className="inline-flex items-center justify-center gap-1.5 rounded-full bg-gradient-primary px-5 py-3 text-sm font-bold text-primary-foreground shadow-glow"
        >
          <ImagePlus className="h-4 w-4" /> Create your first pin
        </Link>
        <Link
          to="/pins/attach"
          className="inline-flex items-center justify-center gap-1.5 rounded-full border border-border bg-surface px-5 py-3 text-sm font-semibold text-foreground transition hover:bg-surface-2"
        >
          <Link2 className="h-4 w-4" /> Import from Pinterest
        </Link>
      </div>
    </motion.div>
  );
}

function BoostSkeleton() {
  return (
    <div>
      <div className="rounded-[2rem] border border-border bg-surface p-8 sm:p-10">
        <div className="flex flex-col items-center gap-6">
          <Skeleton className="h-48 w-48 rounded-full" />
          <Skeleton className="h-6 w-64 max-w-full rounded-full" />
          <Skeleton className="h-12 w-48 rounded-full" />
        </div>
      </div>
      <div className="mt-6 grid gap-2.5">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[92px] rounded-2xl" />
        ))}
      </div>
    </div>
  );
}

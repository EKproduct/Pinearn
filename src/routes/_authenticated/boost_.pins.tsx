import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Check,
  CheckCheck,
  Image as ImageIcon,
  Info,
  Loader2,
  Pencil,
  RotateCcw,
  Sparkles,
  TriangleAlert,
  X,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { LiveScorePill } from "@/components/health-widgets";
import {
  ApproveAllSheet,
  DeckSkeleton,
  DoneState,
  FixEditSheet,
  GuideSheet,
  OptimizedState,
} from "@/components/boost-fix-kit";
import { supabase } from "@/integrations/supabase/client";
import { useFixFlow, type BaseFixCard } from "@/hooks/use-fix-flow";
import type { HealthData } from "@/hooks/use-health-score";
import {
  PIN_DESC_MAX,
  PIN_DESC_MIN,
  PIN_TITLE_MAX,
  PIN_TITLE_MIN,
  pinPassesSeo,
  pinSeoIssues,
  SCORE_CRITERIA,
  suggestPinDescription,
  suggestPinTitle,
} from "@/lib/health-score";

// How to drive the deck — surfaced any time via the header's "How it works".
const PIN_GUIDE_STEPS = [
  "Tap Apply fix to accept the suggested rewrite for the current pin.",
  "Tap Skip to leave a pin untouched and move on.",
  "Tap Edit to adjust the wording before you apply it.",
  "Jump between pins from the strip up top — and undo any fix anytime.",
];

// Filmstrip sizing — mirrors the board review navigator so the two flows feel
// like one product.
const NAV_SLOT = 72; // px per pin slot (56px pin + spacing + room to enlarge)
const NAV_VISIBLE = 4; // whole pins visible at once

export const Route = createFileRoute("/_authenticated/boost_/pins")({
  component: FixPinSeoPage,
});

type PinFixCard = BaseFixCard & { image_url: string | null };

function buildDeck(data: HealthData): PinFixCard[] {
  const boardNameById = new Map(data.boards.map((b) => [b.id, b.name]));
  return data.pins
    .filter((p) => !pinPassesSeo(p))
    .map((p) => {
      const boardName = p.collection_id ? (boardNameById.get(p.collection_id) ?? null) : null;
      return {
        id: p.id,
        title: p.title?.trim() || "Untitled pin",
        issues: pinSeoIssues(p),
        image_url: p.image_url,
        fields: [
          {
            key: "title",
            label: "Title",
            value: suggestPinTitle(p, boardName),
            min: PIN_TITLE_MIN,
            max: PIN_TITLE_MAX,
          },
          {
            key: "description",
            label: "Description",
            value: suggestPinDescription(p, boardName),
            min: PIN_DESC_MIN,
            max: PIN_DESC_MAX,
            multiline: true,
          },
        ],
        original: { title: p.title, description: p.description },
      };
    });
}

function FixPinSeoPage() {
  const navigate = useNavigate();
  const flow = useFixFlow<PinFixCard>({
    scoreKey: "pinSeo",
    buildDeck,
    persist: async (id, values) => {
      // values is a dynamic {title, description} map — cast past the generated
      // row type's excess-property check (keys are ours, not user input).
      const { error } = await supabase
        .from("pins")
        .update(values as never)
        .eq("id", id);
      return { error };
    },
    applyToCache: (data, id, values) => ({
      ...data,
      pins: data.pins.map((p) => (p.id === id ? { ...p, ...values } : p)),
    }),
    invalidateKeys: [["dashboard-unmonetized-pins"]],
  });

  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [guide, setGuide] = useState(false);

  const backToScore = () => navigate({ to: "/boost" });
  const paused = editing || confirming;
  const remaining = flow.cards.slice(flow.index);
  const current = flow.current;
  const currentPending = !!current && flow.pendingIds.has(current.id);

  const reviewing = !flow.isLoading && flow.deck !== null && flow.deck.length > 0 && !flow.done;

  // Keyboard parity with the rest of the app: → apply, ← skip, ⌘/Ctrl+Z undo —
  // never while a sheet is open or focus is in a field.
  useEffect(() => {
    if (!reviewing) return;
    const handler = (e: KeyboardEvent) => {
      if (paused) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (flow.canUndo) flow.undo();
        return;
      }
      if (!current) return;
      if (e.key === "ArrowRight" && !currentPending) flow.decide(current, "approved");
      else if (e.key === "ArrowLeft") flow.decide(current, "skipped");
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reviewing, paused, current, currentPending, flow.canUndo]);

  return (
    <AppShell title="Pin Boost" backButton backTo="/boost" hideBottomNav>
      <div className="mx-auto flex h-[calc(100dvh-6.5rem)] max-w-md flex-col px-1">
        {flow.isLoading || flow.deck === null ? (
          <DeckSkeleton />
        ) : flow.deck.length === 0 ? (
          <OptimizedState onBack={backToScore} />
        ) : flow.done ? (
          <DoneState
            scoreLabel="Pin SEO"
            score={flow.score}
            gained={flow.gained}
            approvedCount={flow.approvedCount}
            skippedCount={flow.skippedCount}
            total={flow.total}
            appliedCards={flow.appliedCards}
            onRevertOne={(c) => flow.revertOne(c as PinFixCard)}
            onUndoAll={flow.undoAll}
            onBack={backToScore}
            busy={flow.bulkApplying || flow.pendingIds.size > 0}
          />
        ) : (
          <>
            {/* Progress summary — reviewed / applied / skipped. */}
            <div className="flex shrink-0 items-center justify-center gap-2 pb-2 text-[11px] font-medium text-muted-foreground">
              <span className="tabular-nums">
                Reviewed {flow.index}/{flow.total}
              </span>
              <span className="text-muted-foreground/40">•</span>
              <span className="font-semibold text-emerald-600">{flow.approvedCount} applied</span>
              <span className="text-muted-foreground/40">•</span>
              <span>{flow.skippedCount} skipped</span>
            </div>

            {/* Live Pin SEO score + how-it-works — the feedback loop, always on. */}
            <div className="flex shrink-0 items-center justify-center gap-3 pb-2">
              <LiveScorePill label="Pin SEO" score={flow.score} />
              <button
                type="button"
                onClick={() => setGuide(true)}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary transition hover:underline"
              >
                <Info className="h-3 w-3" /> How it works
              </button>
            </div>

            {/* Navigator (neutral grey panel) whose selected pin becomes a white
                red-bordered tab that pokes down into the red rewrite card — the
                selected pin sits inside the card's boundary, like the board
                review screen. */}
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="relative z-20 shrink-0 rounded-t-3xl bg-surface-2 px-6 pb-2 pt-6">
                {flow.canUndo && (
                  <button
                    type="button"
                    onClick={flow.undo}
                    className="absolute right-3 top-3 inline-flex min-h-8 items-center gap-1 rounded-full bg-surface px-2.5 text-[11px] font-bold text-muted-foreground ring-1 ring-border transition hover:text-foreground"
                  >
                    <RotateCcw className="h-3 w-3" /> Undo
                  </button>
                )}
                <PinFilmstrip
                  cards={flow.cards}
                  currentIndex={flow.index}
                  statusById={flow.statusById}
                  pendingIds={flow.pendingIds}
                  onJump={flow.goTo}
                />
              </div>

              {/* The rewrite — the hero, in a red-bordered card that echoes the
                  selected pin tab above. */}
              <div className="no-scrollbar relative z-10 min-h-0 flex-1 overflow-y-auto rounded-3xl border-2 border-primary bg-surface p-4 shadow-sm">
                {current && (
                  <motion.div
                    key={current.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                    className="space-y-3.5"
                  >
                    <div className="flex items-center justify-between px-0.5">
                      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        <Sparkles className="h-3.5 w-3.5 text-primary" /> Suggested rewrite
                      </p>
                      <button
                        type="button"
                        onClick={() => setEditing(true)}
                        className="inline-flex min-h-8 items-center gap-1 rounded-full bg-surface px-3 text-[11px] font-bold text-primary ring-1 ring-primary/25 transition hover:bg-primary/10"
                      >
                        <Pencil className="h-3 w-3" /> Edit
                      </button>
                    </div>

                    {/* Issue tags — what this rewrite fixes. */}
                    {current.issues.length > 0 && (
                      <div className="no-scrollbar -mx-1 flex items-center gap-2 overflow-x-auto px-1">
                        {current.issues.map((issue) => (
                          <span
                            key={issue}
                            className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-amber-500/10 px-3 py-1.5 text-xs font-bold text-amber-700"
                          >
                            <TriangleAlert className="h-3 w-3" /> {issue}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* The suggested title + description. */}
                    <div className="rounded-2xl bg-primary/[0.06] p-3.5 ring-1 ring-primary/15">
                      <p className="text-[15px] font-bold leading-snug text-foreground">
                        {current.fields[0].value}
                      </p>
                      {current.fields[1] && (
                        <p className="mt-2 text-[13px] leading-relaxed text-foreground/75">
                          {current.fields[1].value}
                        </p>
                      )}
                    </div>

                    {/* What it replaces — demoted, struck through. */}
                    <div className="rounded-2xl bg-surface-2/50 px-3.5 py-2.5">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground/70">
                        Replacing
                      </p>
                      <p className="mt-0.5 truncate text-xs font-medium text-muted-foreground line-through decoration-muted-foreground/40">
                        {current.original.title?.toString().trim() || "(empty title)"}
                      </p>
                      {current.fields[1] && (
                        <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground/60 line-through decoration-muted-foreground/30">
                          {current.original.description?.toString().trim() || "(no description)"}
                        </p>
                      )}
                    </div>
                  </motion.div>
                )}
              </div>
            </div>

            {/* Fixed action zone — Skip (small) + Apply (dominant), bulk beneath. */}
            <div className="shrink-0 space-y-2.5 pt-3">
              <div className="flex items-stretch gap-2.5">
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={() => current && flow.decide(current, "skipped")}
                  disabled={!current || paused}
                  aria-label="Skip this suggestion"
                  className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-2xl border-2 border-border bg-surface px-5 py-3.5 text-sm font-bold text-muted-foreground transition hover:text-foreground disabled:opacity-40"
                >
                  <X className="h-4 w-4" strokeWidth={2.5} /> Skip
                </motion.button>
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={() => current && flow.decide(current, "approved")}
                  disabled={!current || currentPending || paused}
                  aria-label="Apply fix"
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-gradient-primary px-4 py-3.5 text-[15px] font-extrabold text-primary-foreground shadow-glow transition disabled:opacity-60"
                >
                  {currentPending ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <Check className="h-5 w-5" strokeWidth={3} />
                  )}
                  Apply fix
                </motion.button>
              </div>

              <motion.button
                whileTap={{ scale: 0.98 }}
                onClick={() => setConfirming(true)}
                disabled={flow.bulkApplying || remaining.length === 0}
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-2xl border-2 border-primary bg-surface px-3 py-3 text-[13px] font-bold text-primary transition disabled:opacity-40"
              >
                <CheckCheck className="h-4 w-4" /> Approve all remaining ({remaining.length})
              </motion.button>
            </div>
          </>
        )}
      </div>

      <AnimatePresence>
        {editing && flow.current && (
          <FixEditSheet
            fields={flow.current.fields}
            onSave={flow.editCurrent}
            onClose={() => setEditing(false)}
          />
        )}
        {confirming && (
          <ApproveAllSheet
            cards={remaining}
            unitLabel="pins"
            onConfirm={flow.approveAll}
            onCancel={() => setConfirming(false)}
          />
        )}
        {guide && (
          <GuideSheet
            title="What makes a good pin"
            criteria={SCORE_CRITERIA.pinSeo}
            steps={PIN_GUIDE_STEPS}
            onClose={() => setGuide(false)}
          />
        )}
      </AnimatePresence>
    </AppShell>
  );
}

/** Horizontal pin strip. The selected pin grows from its bottom edge into a
 * white red-bordered tab whose open bottom pokes down into the rewrite card, so
 * its border joins the card boundary — the connected tab from the board review
 * screen. A paged window (overflow-x-clip, not native scroll) keeps the vertical
 * poke from being clipped. */
function PinFilmstrip({
  cards,
  currentIndex,
  statusById,
  pendingIds,
  onJump,
}: {
  cards: PinFixCard[];
  currentIndex: number;
  statusById: Record<string, "approved" | "skipped">;
  pendingIds: Set<string>;
  onJump: (i: number) => void;
}) {
  const total = cards.length;
  const visible = Math.min(NAV_VISIBLE, total);
  const maxStart = Math.max(0, total - visible);

  // The window's own scroll position, independent of the selection — browse the
  // strip a pin at a time without changing which pin you're reviewing.
  const [start, setStart] = useState(() => Math.min(Math.max(currentIndex - 1, 0), maxStart));
  const clampStart = (s: number) => Math.min(Math.max(s, 0), maxStart);

  useEffect(() => {
    setStart((s) => {
      if (currentIndex < s) return clampStart(currentIndex);
      if (currentIndex > s + visible - 1) return clampStart(currentIndex - visible + 1);
      return clampStart(s);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, visible, maxStart]);

  const movedRef = useRef(false);
  const downXRef = useRef<number | null>(null);
  const lastStepRef = useRef(0);
  const step = (dir: number) => setStart((s) => clampStart(s + dir));

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    downXRef.current = e.clientX;
    movedRef.current = false;
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (downXRef.current != null && Math.abs(e.clientX - downXRef.current) > 6)
      movedRef.current = true;
  };
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (downXRef.current == null) return;
    const dx = e.clientX - downXRef.current;
    downXRef.current = null;
    if (Math.abs(dx) > 30) step(dx < 0 ? 1 : -1);
  };
  const onWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    if (Math.abs(d) < 8) return;
    const now = Date.now();
    if (now - lastStepRef.current < 260) return;
    lastStepRef.current = now;
    step(d > 0 ? 1 : -1);
  };

  return (
    <div className="flex justify-center">
      <div
        className="relative overflow-x-clip"
        style={{ width: visible * NAV_SLOT }}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <motion.div
          className="flex items-end"
          animate={{ x: -start * NAV_SLOT }}
          transition={{ type: "spring", stiffness: 380, damping: 34 }}
        >
          {cards.map((cand, i) => {
            const status = statusById[cand.id];
            const active = i === currentIndex;
            const pending = pendingIds.has(cand.id);
            return (
              <div
                key={cand.id}
                className="flex shrink-0 justify-center"
                style={{ width: NAV_SLOT }}
              >
                <motion.button
                  onClick={() => {
                    if (!movedRef.current) onJump(i);
                  }}
                  aria-label={active ? "Current pin" : "Go to this pin"}
                  animate={{ scale: active ? 1.32 : 0.8 }}
                  transition={{ type: "spring", stiffness: 420, damping: 24 }}
                  className={`relative h-14 w-14 origin-bottom overflow-hidden will-change-transform ${
                    active
                      ? "z-30 -mb-4 rounded-2xl rounded-b-none border-2 border-b-0 border-primary bg-surface p-[3px] shadow-[0_-3px_10px_rgba(0,0,0,0.08)]"
                      : "rounded-2xl bg-gradient-to-br from-rose-500 to-pink-600 opacity-90 shadow-sm hover:opacity-100"
                  }`}
                >
                  {cand.image_url ? (
                    <img
                      src={cand.image_url}
                      alt=""
                      draggable={false}
                      className={`h-full w-full object-cover ${active ? "rounded-t-lg" : ""} ${
                        status === "skipped" ? "opacity-30 grayscale" : ""
                      }`}
                    />
                  ) : (
                    <div className="grid h-full w-full place-items-center bg-surface-2 text-muted-foreground">
                      <ImageIcon className="h-4 w-4" />
                    </div>
                  )}
                  {pending ? (
                    <span className="absolute inset-0 grid place-items-center rounded-lg bg-black/50 text-white">
                      <Loader2 className="h-4 w-4 animate-spin" />
                    </span>
                  ) : status === "approved" ? (
                    <span className="absolute inset-0 grid place-items-center rounded-lg bg-emerald-500/70 text-white">
                      <Check className="h-4 w-4" strokeWidth={3} />
                    </span>
                  ) : status === "skipped" ? (
                    <span className="absolute inset-0 grid place-items-center rounded-lg bg-black/55 text-white">
                      <X className="h-4 w-4" strokeWidth={3} />
                    </span>
                  ) : null}
                </motion.button>
              </div>
            );
          })}
        </motion.div>
      </div>
    </div>
  );
}

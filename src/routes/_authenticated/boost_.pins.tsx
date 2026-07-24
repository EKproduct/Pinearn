import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Check,
  CheckCheck,
  Image as ImageIcon,
  Info,
  LayoutGrid,
  Loader2,
  Pencil,
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
import { useFixFlow, type BaseFixCard, type FixField } from "@/hooks/use-fix-flow";
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
  const [boardOpen, setBoardOpen] = useState(false);

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
                <PinFilmstrip
                  cards={flow.cards}
                  currentIndex={flow.index}
                  statusById={flow.statusById}
                  pendingIds={flow.pendingIds}
                  onJump={flow.goTo}
                  onOpenBoard={() => setBoardOpen(true)}
                />
              </div>

              {/* The rewrite — the hero, in a red-bordered card that echoes the
                  selected pin tab above. */}
              <div className="no-scrollbar relative z-10 min-h-0 flex-1 overflow-y-auto rounded-3xl border-2 border-primary bg-surface p-4 shadow-sm">
                {current && <RewriteCard card={current} onEdit={() => setEditing(true)} />}
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
        {boardOpen && (
          <PinGridSheet
            cards={flow.cards}
            currentIndex={flow.index}
            statusById={flow.statusById}
            pendingIds={flow.pendingIds}
            onJump={flow.goTo}
            onClose={() => setBoardOpen(false)}
          />
        )}
      </AnimatePresence>
    </AppShell>
  );
}

/** A green/amber pill that shows a field's length against Pinterest's sweet
 * spot — the same band the score checks. Doubles as proof the rewrite is
 * genuinely better, not just different. */
function FitChip({ len, min, max }: { len: number; min?: number; max?: number }) {
  const ok = (min == null || len >= min) && (max == null || len <= max);
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums ring-1 ring-inset ${
        ok
          ? "bg-emerald-500/10 text-emerald-700 ring-emerald-500/20"
          : "bg-amber-500/10 text-amber-700 ring-amber-500/20"
      }`}
    >
      {ok && <Check className="h-2.5 w-2.5" strokeWidth={3.5} />}
      {len}
      {max != null ? `/${max}` : ""}
    </span>
  );
}

/** One field's Without AI → AI suggested comparison. The current value is
 * demoted and struck through; the AI suggestion is the bright, primary-accented
 * payoff carrying a live SEO-fit chip. */
function FieldDiff({
  heading,
  now,
  field,
}: {
  heading: string;
  now?: string;
  field: FixField;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface">
      <p className="border-b border-border/70 bg-surface-2/50 px-3.5 py-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
        {heading}
      </p>

      {/* Without AI — demoted. */}
      <div className="px-3.5 py-2.5">
        <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground/60">
          Without AI
        </p>
        <p
          className={`mt-0.5 text-sm ${
            now
              ? "text-muted-foreground line-through decoration-muted-foreground/40"
              : "italic text-muted-foreground/50"
          }`}
        >
          {now || `No ${heading.toLowerCase()} yet`}
        </p>
      </div>

      {/* AI suggested — the payoff. */}
      <div className="bg-primary/[0.05] px-3.5 py-3">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-bold uppercase tracking-wide text-primary">AI suggested</p>
          <FitChip len={field.value.trim().length} min={field.min} max={field.max} />
        </div>
        <p className="mt-1.5 text-[15px] font-bold leading-snug text-foreground">{field.value}</p>
      </div>
    </div>
  );
}

/** The hero of the pin fix flow: the pin in context, then a Without AI →
 * AI suggested comparison for the Title and Description headings. */
function RewriteCard({ card, onEdit }: { card: PinFixCard; onEdit: () => void }) {
  const [titleField, descField] = card.fields;
  const nowTitle = card.original.title?.toString().trim();
  const nowDesc = card.original.description?.toString().trim();

  return (
    <motion.div
      key={card.id}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      className="space-y-3"
    >
      {/* AI rewrite header + Edit. */}
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-extrabold text-foreground">AI rewrite</p>
        <button
          type="button"
          onClick={onEdit}
          className="inline-flex min-h-8 shrink-0 items-center gap-1 rounded-full bg-surface px-3 text-[11px] font-bold text-primary ring-1 ring-primary/25 transition hover:bg-primary/10"
        >
          <Pencil className="h-3 w-3" /> Edit
        </button>
      </div>

      <FieldDiff heading="Title" now={nowTitle} field={titleField} />
      {descField && <FieldDiff heading="Description" now={nowDesc} field={descField} />}
    </motion.div>
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
  onOpenBoard,
}: {
  cards: PinFixCard[];
  currentIndex: number;
  statusById: Record<string, "approved" | "skipped">;
  pendingIds: Set<string>;
  onJump: (i: number) => void;
  onOpenBoard: () => void;
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
    <div className="flex items-center justify-center gap-1.5">
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

      {/* Board cover — a mini collage of the deck's pins; opens the full board. */}
      <BoardCoverButton cards={cards} onClick={onOpenBoard} />
    </div>
  );
}

/** The board this deck belongs to, rendered as a Pinterest-style cover collage
 * (one large pin + two stacked) so it reads as a real board, not a button. */
function BoardCoverButton({ cards, onClick }: { cards: PinFixCard[]; onClick: () => void }) {
  const covers = cards.map((c) => c.image_url).filter(Boolean).slice(0, 3) as string[];
  const [big, ...rest] = covers;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Open board — see all pins"
      className="group relative h-14 w-14 shrink-0 overflow-hidden rounded-2xl bg-surface-2 ring-1 ring-border transition hover:ring-2 hover:ring-primary/50"
    >
      <div className="flex h-full w-full gap-px">
        <div className="relative flex-[2] bg-surface-2">
          {big ? (
            <img src={big} alt="" draggable={false} className="h-full w-full object-cover" />
          ) : (
            <div className="grid h-full place-items-center text-muted-foreground">
              <LayoutGrid className="h-4 w-4" />
            </div>
          )}
        </div>
        <div className="flex flex-1 flex-col gap-px">
          {[0, 1].map((i) => (
            <div key={i} className="relative flex-1 bg-surface-2">
              {rest[i] && (
                <img src={rest[i]} alt="" draggable={false} className="h-full w-full object-cover" />
              )}
            </div>
          ))}
        </div>
      </div>
      <span className="absolute inset-x-0 bottom-0 grid place-items-center bg-black/55 py-0.5 text-[8px] font-bold uppercase tracking-wide text-white backdrop-blur-sm">
        Board
      </span>
    </button>
  );
}

/** Full-screen board view of every pin in the deck — a Pinterest-style grid
 * that reads like opening a board, with each pin's fix status. Tapping a pin
 * selects it and returns to the review flow. */
function PinGridSheet({
  cards,
  currentIndex,
  statusById,
  pendingIds,
  onJump,
  onClose,
}: {
  cards: PinFixCard[];
  currentIndex: number;
  statusById: Record<string, "approved" | "skipped">;
  pendingIds: Set<string>;
  onJump: (i: number) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  const fixedCount = cards.filter((c) => statusById[c.id] === "approved").length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 24 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      role="dialog"
      aria-modal="true"
      aria-label="Board — all pins"
      className="fixed inset-0 z-[70] flex flex-col bg-background"
    >
      {/* Sticky board header. */}
      <div className="glass sticky top-0 z-10 flex items-center gap-3 border-b border-border px-4 py-3 safe-top">
        <button
          type="button"
          onClick={onClose}
          aria-label="Back to review"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface ring-1 ring-border transition hover:text-primary"
        >
          <X className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-display text-lg font-bold leading-tight">Your board</h3>
          <p className="text-xs text-muted-foreground">
            {cards.length} {cards.length === 1 ? "pin" : "pins"} to fix
            {fixedCount > 0 && (
              <span className="font-semibold text-emerald-600"> · {fixedCount} done</span>
            )}
          </p>
        </div>
      </div>

      {/* Pinterest-style pin grid. */}
      <div className="no-scrollbar flex-1 overflow-y-auto px-3 py-4">
        <div className="masonry-2 sm:masonry-3">
          {cards.map((cand, i) => {
            const status = statusById[cand.id];
            const active = i === currentIndex;
            const pending = pendingIds.has(cand.id);
            return (
              <button
                key={cand.id}
                type="button"
                onClick={() => {
                  onJump(i);
                  onClose();
                }}
                aria-label={active ? "Current pin" : "Go to this pin"}
                className={`relative w-full overflow-hidden rounded-2xl transition active:scale-[0.98] ${
                  active
                    ? "ring-2 ring-primary ring-offset-2 ring-offset-background"
                    : "ring-1 ring-border"
                }`}
              >
                {cand.image_url ? (
                  <img
                    src={cand.image_url}
                    alt=""
                    draggable={false}
                    className={`w-full object-cover ${
                      status === "skipped" ? "opacity-40 grayscale" : ""
                    }`}
                  />
                ) : (
                  <div className="grid aspect-[3/4] w-full place-items-center bg-surface-2 text-muted-foreground">
                    <ImageIcon className="h-6 w-6" />
                  </div>
                )}

                {/* Title caption. */}
                <span className="absolute inset-x-0 bottom-0 line-clamp-1 bg-gradient-to-t from-black/70 to-transparent px-2.5 pb-2 pt-6 text-left text-[11px] font-semibold text-white">
                  {cand.title}
                </span>

                {/* Status badge. */}
                {pending ? (
                  <span className="absolute inset-0 grid place-items-center bg-black/45 text-white">
                    <Loader2 className="h-6 w-6 animate-spin" />
                  </span>
                ) : status === "approved" ? (
                  <span className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full bg-emerald-500 text-white shadow">
                    <Check className="h-3.5 w-3.5" strokeWidth={3} />
                  </span>
                ) : status === "skipped" ? (
                  <span className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full bg-black/60 text-white shadow">
                    <X className="h-3.5 w-3.5" strokeWidth={3} />
                  </span>
                ) : active ? (
                  <span className="absolute left-1.5 top-1.5 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground shadow">
                    Editing
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}

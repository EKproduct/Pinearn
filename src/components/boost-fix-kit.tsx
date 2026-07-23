import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  CheckCircle2,
  Pencil,
  RotateCcw,
  Sparkles,
  TriangleAlert,
  X,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import type { BaseFixCard, FixField } from "@/hooks/use-fix-flow";

/* ---------------- Bottom sheet shell (matches the app's hand-rolled sheets) --------------- */

function Sheet({
  onClose,
  children,
  labelledBy,
}: {
  onClose: () => void;
  children: React.ReactNode;
  labelledBy?: string;
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
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-[60] flex items-end justify-center bg-background/60 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        onClick={(e) => e.stopPropagation()}
        initial={{ y: 40, opacity: 0.6 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 40, opacity: 0 }}
        transition={{ type: "spring", stiffness: 380, damping: 34 }}
        className="w-full max-w-lg rounded-t-3xl border border-border bg-surface p-5 shadow-elevate sm:rounded-3xl"
        style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}
      >
        <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-border sm:hidden" />
        {children}
      </motion.div>
    </motion.div>
  );
}

/* ---------------- Edit-before-apply ---------------- */

/** Lets the creator tweak the suggested rewrite before applying it — with a
 * live character counter against the SEO band, which doubles as teaching what
 * the score actually checks. */
export function FixEditSheet({
  fields,
  onSave,
  onClose,
}: {
  fields: FixField[];
  onSave: (values: Record<string, string>) => void;
  onClose: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map((f) => [f.key, f.value])),
  );
  const firstRef = useRef<HTMLTextAreaElement | HTMLInputElement>(null);
  useEffect(() => {
    firstRef.current?.focus();
  }, []);

  const inBand = (f: FixField, v: string) =>
    (f.min == null || v.trim().length >= f.min) && (f.max == null || v.trim().length <= f.max);
  const allValid = fields.every((f) => inBand(f, values[f.key]));

  return (
    <Sheet onClose={onClose} labelledBy="edit-sheet-title">
      <h3 id="edit-sheet-title" className="font-display text-lg font-bold">
        Edit before applying
      </h3>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Make it sound like you. The counter turns green when it fits Pinterest's sweet spot.
      </p>
      <div className="mt-4 space-y-4">
        {fields.map((f, i) => {
          const v = values[f.key];
          const len = v.trim().length;
          const ok = inBand(f, v);
          return (
            <div key={f.key}>
              <div className="mb-1 flex items-baseline justify-between">
                <label htmlFor={`fix-${f.key}`} className="text-xs font-semibold">
                  {f.label}
                </label>
                {(f.min != null || f.max != null) && (
                  <span
                    className={`text-[11px] font-bold tabular-nums ${
                      ok ? "text-emerald-600" : "text-amber-600"
                    }`}
                  >
                    {len}
                    {f.max != null ? ` / ${f.min ?? 0}–${f.max}` : ""}
                  </span>
                )}
              </div>
              {f.multiline ? (
                <textarea
                  id={`fix-${f.key}`}
                  ref={i === 0 ? (firstRef as React.Ref<HTMLTextAreaElement>) : undefined}
                  value={v}
                  onChange={(e) => setValues((s) => ({ ...s, [f.key]: e.target.value }))}
                  rows={4}
                  className="w-full resize-none rounded-2xl border border-input bg-background p-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
                />
              ) : (
                <input
                  id={`fix-${f.key}`}
                  ref={i === 0 ? (firstRef as React.Ref<HTMLInputElement>) : undefined}
                  value={v}
                  onChange={(e) => setValues((s) => ({ ...s, [f.key]: e.target.value }))}
                  className="w-full rounded-2xl border border-input bg-background p-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
                />
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-5 flex gap-2.5">
        <button
          type="button"
          onClick={onClose}
          className="min-h-[48px] flex-1 rounded-2xl border border-border bg-surface text-sm font-semibold text-muted-foreground transition hover:text-foreground"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={!allValid}
          onClick={() => {
            onSave(values);
            onClose();
          }}
          className="min-h-[48px] flex-[1.5] rounded-2xl bg-gradient-primary text-sm font-bold text-primary-foreground shadow-glow transition disabled:opacity-50"
        >
          Save changes
        </button>
      </div>
    </Sheet>
  );
}

/* ---------------- Approve-all confirmation ---------------- */

/** A one-tap bulk write to live content deserves a beat of confirmation — with
 * a couple of real before→after previews so it's never a blind action. */
export function ApproveAllSheet({
  cards,
  unitLabel,
  onConfirm,
  onCancel,
}: {
  cards: BaseFixCard[];
  unitLabel: string; // "pins" | "boards"
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const samples = cards.slice(0, 2);
  return (
    <Sheet onClose={onCancel} labelledBy="approveall-title">
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-500/10 text-amber-600">
          <TriangleAlert className="h-5 w-5" />
        </div>
        <div>
          <h3 id="approveall-title" className="font-display text-lg font-bold">
            Apply {cards.length} {unitLabel} at once?
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            This rewrites titles &amp; descriptions on your live {unitLabel}. You can review and
            undo everything on the next screen.
          </p>
        </div>
      </div>

      {samples.length > 0 && (
        <div className="mt-4 space-y-2">
          <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            Preview
          </p>
          {samples.map((c) => (
            <div key={c.id} className="rounded-2xl border border-border bg-surface-2/40 p-3">
              <p className="truncate text-[11px] text-muted-foreground line-through">
                {c.original[c.fields[0].key]?.toString().trim() || "(empty)"}
              </p>
              <p className="mt-0.5 line-clamp-2 text-sm font-semibold">{c.fields[0].value}</p>
            </div>
          ))}
          {cards.length > samples.length && (
            <p className="text-center text-[11px] text-muted-foreground">
              + {cards.length - samples.length} more
            </p>
          )}
        </div>
      )}

      <div className="mt-5 flex gap-2.5">
        <button
          type="button"
          onClick={onCancel}
          className="min-h-[48px] flex-1 rounded-2xl border border-border bg-surface text-sm font-semibold text-muted-foreground transition hover:text-foreground"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => {
            onConfirm();
            onCancel();
          }}
          className="min-h-[48px] flex-[1.5] rounded-2xl bg-gradient-primary text-sm font-bold text-primary-foreground shadow-glow"
        >
          Apply {cards.length} fixes
        </button>
      </div>
    </Sheet>
  );
}

/* ---------------- The suggested-copy block (with Edit) ---------------- */

/** The shared "Now → Suggested" block on every fix card, with an Edit button.
 * `current`/`suggested` render as two-field before/after; media is supplied by
 * the flow (pin image vs board collage). */
export function SuggestionBlock({
  fields,
  current,
  onEdit,
}: {
  fields: FixField[];
  current: Record<string, string | null>;
  onEdit: () => void;
}) {
  return (
    <div className="no-scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Now</p>
        <p className="mt-0.5 line-clamp-1 text-sm font-semibold text-muted-foreground">
          {current[fields[0].key]?.toString().trim() || "(empty)"}
        </p>
        {fields[1] && (
          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground/70">
            {current[fields[1].key]?.toString().trim() || "(no description)"}
          </p>
        )}
      </div>
      <div className="relative rounded-2xl bg-primary/5 p-3 ring-1 ring-primary/20">
        <div className="flex items-center justify-between">
          <p className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-primary">
            <Sparkles className="h-3 w-3" /> Suggested
          </p>
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex min-h-8 items-center gap-1 rounded-full bg-surface px-2.5 text-[11px] font-bold text-primary ring-1 ring-primary/20 transition hover:bg-primary/10"
          >
            <Pencil className="h-3 w-3" /> Edit
          </button>
        </div>
        <p className="mt-1 text-sm font-semibold leading-snug">{fields[0].value}</p>
        {fields[1] && (
          <p className="mt-1.5 text-xs leading-relaxed text-foreground/80">{fields[1].value}</p>
        )}
      </div>
    </div>
  );
}

/* ---------------- In-flow guidance (re-openable) ---------------- */

/** Always-available help for a fix flow: what counts as "good" (the pass
 * criteria) and how to drive the deck. Re-openable from the header, so guidance
 * is never more than a tap away — unlike a one-time intro the user can't recall. */
export function GuideSheet({
  title,
  criteria,
  steps,
  onClose,
}: {
  title: string;
  criteria: string;
  steps: string[];
  onClose: () => void;
}) {
  return (
    <Sheet onClose={onClose} labelledBy="guide-title">
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <Sparkles className="h-5 w-5" />
        </div>
        <div>
          <h3 id="guide-title" className="font-display text-lg font-bold">
            {title}
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            What counts as good — and how to fix it fast.
          </p>
        </div>
      </div>

      <div className="mt-4 rounded-2xl bg-emerald-500/[0.06] p-3.5 ring-1 ring-emerald-500/15">
        <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-emerald-700">
          <CheckCircle2 className="h-3.5 w-3.5" /> What passes the check
        </p>
        <p className="mt-1 text-[13px] leading-relaxed text-foreground/80">{criteria}</p>
      </div>

      <div className="mt-4">
        <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
          How to use this screen
        </p>
        <ol className="mt-2 space-y-2.5">
          {steps.map((s, i) => (
            <li key={i} className="flex items-start gap-3">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary/10 text-[11px] font-extrabold text-primary">
                {i + 1}
              </span>
              <p className="text-sm leading-snug text-foreground/85">{s}</p>
            </li>
          ))}
        </ol>
      </div>

      <button
        type="button"
        onClick={onClose}
        className="mt-5 inline-flex min-h-[48px] w-full items-center justify-center gap-1.5 rounded-2xl bg-gradient-primary text-sm font-bold text-primary-foreground shadow-glow"
      >
        Got it <ArrowRight className="h-4 w-4" />
      </button>
    </Sheet>
  );
}

/* ---------------- Shared states ---------------- */

export function OptimizedState({ onBack }: { onBack: () => void }) {
  return (
    <div className="grid flex-1 place-items-center">
      <div className="rounded-3xl border border-border bg-surface p-10 text-center shadow-elevate">
        <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500" />
        <h2 className="mt-3 font-display text-xl font-bold">You're fully optimized here</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Nothing needs fixing — every item already passes the check.
        </p>
        <button
          onClick={onBack}
          className="mt-5 inline-flex min-h-[48px] items-center gap-1.5 rounded-full bg-gradient-primary px-5 text-sm font-bold text-primary-foreground shadow-glow"
        >
          Back to Boost Pins
        </button>
      </div>
    </div>
  );
}

/** The done screen — a real celebration with an auditable, revertable list of
 * exactly what changed, so bulk apply → review → selective undo is one loop. */
export function DoneState({
  scoreLabel,
  score,
  gained,
  approvedCount,
  skippedCount,
  total,
  appliedCards,
  onRevertOne,
  onUndoAll,
  onBack,
  busy,
}: {
  scoreLabel: string;
  score: number;
  gained: number;
  approvedCount: number;
  skippedCount: number;
  total: number;
  appliedCards: BaseFixCard[];
  onRevertOne: (card: BaseFixCard) => void;
  onUndoAll: () => void;
  onBack: () => void;
  busy: boolean;
}) {
  const [reverted, setReverted] = useState<Set<string>>(new Set());
  const [showReview, setShowReview] = useState(false);
  // Snapshot on mount: reverting a row removes it from the live appliedCards,
  // but the row should stay visible in an "Undone" state, not disappear.
  const [snapshot] = useState(appliedCards);
  return (
    <div className="grid flex-1 place-items-center overflow-y-auto py-2">
      <motion.div
        initial={{ opacity: 0, scale: 0.94 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: "spring", stiffness: 320, damping: 26 }}
        className="w-full rounded-3xl border border-border bg-surface p-7 text-center shadow-elevate"
      >
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 18, delay: 0.1 }}
          className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-emerald-500/15 text-emerald-500"
        >
          <CheckCircle2 className="h-8 w-8" />
        </motion.div>
        <h2 className="mt-3 font-display text-xl font-bold">
          {approvedCount > 0
            ? `${approvedCount} ${approvedCount === 1 ? "fix" : "fixes"} applied`
            : "All reviewed"}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {scoreLabel} is now <span className="font-bold text-foreground">{score}%</span>
          {gained > 0 && <span className="font-bold text-emerald-600"> (+{gained})</span>}
          {busy ? " — saving…" : ""}
        </p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          {approvedCount} applied · {skippedCount} skipped · {total} reviewed
        </p>

        <button
          onClick={onBack}
          disabled={busy}
          className="mt-5 inline-flex min-h-[52px] w-full items-center justify-center gap-1.5 rounded-2xl bg-gradient-primary px-5 text-sm font-bold text-primary-foreground shadow-glow transition disabled:opacity-70"
        >
          {busy ? "Saving…" : "See your new Boost Score"} <ArrowRight className="h-4 w-4" />
        </button>

        {snapshot.length > 0 && (
          <>
            <button
              onClick={() => setShowReview((v) => !v)}
              className="mt-2.5 text-xs font-semibold text-muted-foreground underline-offset-2 hover:underline"
            >
              {showReview
                ? "Hide changes"
                : `Review ${snapshot.length} ${snapshot.length === 1 ? "change" : "changes"}`}
            </button>
            <AnimatePresence>
              {showReview && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mt-3 space-y-2 overflow-hidden text-left"
                >
                  {snapshot.map((c) => {
                    const isReverted = reverted.has(c.id);
                    return (
                      <div
                        key={c.id}
                        className="flex items-start gap-2 rounded-2xl border border-border bg-surface-2/40 p-3"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[11px] text-muted-foreground line-through">
                            {c.original[c.fields[0].key]?.toString().trim() || "(empty)"}
                          </p>
                          <p
                            className={`mt-0.5 line-clamp-2 text-xs font-semibold ${
                              isReverted ? "text-muted-foreground line-through" : ""
                            }`}
                          >
                            {c.fields[0].value}
                          </p>
                        </div>
                        <button
                          type="button"
                          disabled={isReverted || busy}
                          onClick={() => {
                            setReverted((s) => new Set(s).add(c.id));
                            onRevertOne(c);
                          }}
                          className="inline-flex min-h-8 shrink-0 items-center gap-1 rounded-full bg-surface px-2.5 text-[11px] font-bold text-muted-foreground ring-1 ring-border transition hover:text-foreground disabled:opacity-50"
                        >
                          <RotateCcw className="h-3 w-3" /> {isReverted ? "Undone" : "Undo"}
                        </button>
                      </div>
                    );
                  })}
                  <button
                    onClick={onUndoAll}
                    disabled={busy}
                    className="inline-flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-2xl border border-border text-xs font-semibold text-muted-foreground transition hover:text-foreground disabled:opacity-50"
                  >
                    <RotateCcw className="h-3.5 w-3.5" /> Undo all changes
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}
      </motion.div>
    </div>
  );
}

export function DeckSkeleton() {
  return (
    <div className="flex flex-1 flex-col">
      <Skeleton className="mb-2.5 h-1.5 w-full rounded-full" />
      <div className="relative min-h-0 flex-1">
        <Skeleton className="absolute inset-0 rounded-3xl" />
      </div>
      <div className="mt-3 flex shrink-0 gap-2.5">
        <Skeleton className="h-[52px] w-24 rounded-2xl" />
        <Skeleton className="h-[52px] flex-1 rounded-2xl" />
      </div>
    </div>
  );
}

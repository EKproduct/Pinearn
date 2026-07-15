import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { motion, useMotionValue, useTransform, animate as animateMotionValue } from "framer-motion";
import { toast } from "sonner";
import {
  AlertTriangle,
  Check,
  CheckCheck,
  Heart,
  Image as ImageIcon,
  Link2,
  Loader2,
  Plus,
  RefreshCw,
  Sparkles,
  Store,
  Wand2,
  X,
} from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { SuggestionCard } from "@/components/suggestion-card";
import { supabase } from "@/integrations/supabase/client";
import {
  approveBoardPins,
  getBoardMonetizationCandidates,
  getPinRecommendation,
  type BoardCandidate,
  type VisualMatch,
} from "@/lib/pinterest.functions";

export const Route = createFileRoute("/_authenticated/pins_/monetize-board")({
  validateSearch: (s: Record<string, unknown>) => ({
    collectionId: typeof s.collectionId === "string" ? s.collectionId : "",
  }),
  component: MonetizeBoardPage,
});

type ManualProduct = { id: string; title: string; url: string; selected: boolean };
type ManualDraft = { pasteUrl: string; products: ManualProduct[] };

function deriveManualTitle(pinTitle: string, url: string): string {
  let hostname = "New product";
  try {
    hostname = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    /* keep default */
  }
  return pinTitle ? `${pinTitle} — ${hostname}` : hostname;
}
type CardApi = { flyOut: (dir: "left" | "right") => void };
// How many pins ahead of the current one we fetch a recommendation for in
// the background — big enough that swiping never has to wait, small enough
// not to hammer the visual-search API for a 40+ pin board.
const PREFETCH_WINDOW = 3;

function MonetizeBoardPage() {
  const { collectionId } = Route.useSearch();
  const navigate = useNavigate();
  const runGetCandidates = useServerFn(getBoardMonetizationCandidates);
  const runGetRecommendation = useServerFn(getPinRecommendation);
  const runApprove = useServerFn(approveBoardPins);
  const qc = useQueryClient();

  const { data, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: ["board-monetization-candidates", collectionId],
    queryFn: () => runGetCandidates({ data: { collectionId } }),
    enabled: !!collectionId,
    retry: 1,
  });

  const candidates = data?.candidates ?? [];
  const boardName = data?.boardName ?? "";
  const total = candidates.length;

  const [cursor, setCursor] = useState(0);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [approvedCount, setApprovedCount] = useState(0);
  const [approvingAll, setApprovingAll] = useState(false);
  const [confirmAll, setConfirmAll] = useState(false);
  const [manualDraft, setManualDraft] = useState<ManualDraft>({ pasteUrl: "", products: [] });
  const cardApiRef = useRef<CardApi | null>(null);

  const remaining = candidates.slice(cursor);
  const current = remaining[0] ?? null;
  const upNext = remaining.slice(1, 3);
  const done = !!data && cursor >= total && total > 0;

  // Only fetch recommendations for the current pin + a small lookahead —
  // never the whole board — so the first card is ready in ~1 request
  // instead of waiting on all of them.
  const windowPins = remaining.slice(0, PREFETCH_WINDOW);
  const recQueries = useQueries({
    queries: windowPins.map((c) => ({
      queryKey: ["pin-recommendation", c.pinId],
      queryFn: () => runGetRecommendation({ data: { pinId: c.pinId } }),
      staleTime: Infinity,
      retry: 1,
    })),
  });
  const currentRecQuery = current ? recQueries[0] : undefined;
  const currentRecLoading = !!current && (!currentRecQuery || currentRecQuery.isLoading);
  const currentRecFetching = !!(current && currentRecQuery?.isFetching);
  // A failed search is treated exactly like a confirmed "no product found" —
  // both just mean there's nothing to auto-fill, so the manual fields show
  // either way instead of a dead-end error screen.
  const currentRecommendation: VisualMatch | null = currentRecQuery?.data?.recommendation ?? null;
  const [approveAllProgress, setApproveAllProgress] = useState<{ done: number; total: number } | null>(null);

  useEffect(() => {
    if (!confirmAll) return;
    const t = setTimeout(() => setConfirmAll(false), 4000);
    return () => clearTimeout(t);
  }, [confirmAll]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!current) return;
      if (e.key === "ArrowRight") handleApproveClick();
      else if (e.key === "ArrowLeft") handleRejectClick();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // Re-subscribe whenever what a keypress would act on changes, so the
    // handler never closes over a stale manual-entry draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, currentRecommendation, manualDraft]);

  const persistApproval = async (
    candidate: BoardCandidate,
    products: Array<{ title: string; affiliateUrl: string; imageUrl: string | null }>,
  ) => {
    setPendingIds((s) => new Set(s).add(candidate.pinId));
    try {
      const { failed } = await runApprove({
        data: { origin: window.location.origin, approvals: [{ pinId: candidate.pinId, products }] },
      });
      if (failed.length > 0) {
        toast.error(failed[0], {
          action: { label: "Retry", onClick: () => void persistApproval(candidate, products) },
        });
      } else {
        setApprovedCount((n) => n + 1);
        toast.success(`Approved "${candidate.title || products[0].title}"`, {
          action: {
            label: "Undo",
            onClick: async () => {
              const { error } = await supabase.from("pins").update({ status: "draft" }).eq("id", candidate.pinId);
              if (error) {
                toast.error("Failed to undo: " + error.message);
                return;
              }
              setApprovedCount((n) => Math.max(0, n - 1));
              toast.success("Reverted to draft");
            },
          },
        });
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to approve";
      toast.error(message, {
        action: { label: "Retry", onClick: () => void persistApproval(candidate, products) },
      });
    } finally {
      setPendingIds((s) => {
        const next = new Set(s);
        next.delete(candidate.pinId);
        return next;
      });
    }
  };

  const advance = () => {
    setManualDraft({ pasteUrl: "", products: [] });
    setCursor((c) => c + 1);
  };

  const retryCurrentRecommendation = () => {
    if (!current) return;
    void qc.refetchQueries({ queryKey: ["pin-recommendation", current.pinId], exact: true });
  };

  // Unified approve — works identically whether this pin got a real AI
  // match or one or more manually-added products, so the same Reject/Approve
  // buttons drive both cases.
  const approveCurrent = (candidate: BoardCandidate) => {
    if (currentRecommendation) {
      void persistApproval(candidate, [
        {
          title: currentRecommendation.title,
          affiliateUrl: currentRecommendation.link,
          imageUrl: currentRecommendation.thumbnail,
        },
      ]);
    } else {
      const selected = manualDraft.products.filter((p) => p.selected);
      void persistApproval(
        candidate,
        selected.map((p) => ({ title: p.title, affiliateUrl: p.url, imageUrl: null })),
      );
    }
    advance();
  };

  const handleRejectClick = () => {
    if (!current) return;
    cardApiRef.current?.flyOut("left");
  };

  const handleApproveClick = () => {
    if (!current || pendingIds.has(current.pinId)) return;
    if (!currentRecommendation && manualDraft.products.filter((p) => p.selected).length === 0) {
      toast.error("Add at least one product first.");
      return;
    }
    cardApiRef.current?.flyOut("right");
  };

  const handleApproveAllClick = () => {
    if (remaining.length === 0) return;
    if (!confirmAll) {
      setConfirmAll(true);
      return;
    }
    setConfirmAll(false);
    void runApproveAll(remaining);
  };

  // Bulk action: matches every remaining pin (not just the small swipe
  // lookahead), reusing whatever's already cached from the prefetch window
  // so it never re-fetches a recommendation twice. Bounded concurrency
  // keeps a 40+ pin board from hammering the visual-search API at once.
  const runApproveAll = async (targets: BoardCandidate[]) => {
    setApprovingAll(true);
    setApproveAllProgress({ done: 0, total: targets.length });
    try {
      const resolved: Array<{ candidate: BoardCandidate; recommendation: VisualMatch | null }> = new Array(
        targets.length,
      );
      let nextIndex = 0;
      let doneCount = 0;
      const CONCURRENCY = 4;
      const worker = async () => {
        while (nextIndex < targets.length) {
          const i = nextIndex++;
          const c = targets[i];
          try {
            const result = await qc.fetchQuery({
              queryKey: ["pin-recommendation", c.pinId],
              queryFn: () => runGetRecommendation({ data: { pinId: c.pinId } }),
              staleTime: Infinity,
            });
            resolved[i] = { candidate: c, recommendation: result.recommendation };
          } catch {
            resolved[i] = { candidate: c, recommendation: null };
          }
          doneCount++;
          setApproveAllProgress({ done: doneCount, total: targets.length });
        }
      };
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, targets.length) }, worker));

      const matched = resolved.filter((r) => r.recommendation);
      if (matched.length === 0) {
        toast.error("No products matched for the remaining pins.");
        return;
      }

      const { approved, failed } = await runApprove({
        data: {
          origin: window.location.origin,
          approvals: matched.map((r) => ({
            pinId: r.candidate.pinId,
            products: [
              {
                title: r.recommendation!.title,
                affiliateUrl: r.recommendation!.link,
                imageUrl: r.recommendation!.thumbnail,
              },
            ],
          })),
        },
      });
      setApprovedCount((n) => n + approved);
      setCursor(total);

      const unmatched = targets.length - matched.length;
      if (unmatched > 0) {
        toast(`${unmatched} pin${unmatched === 1 ? "" : "s"} had no match — reopen this board to tag them manually.`);
      }
      if (failed.length > 0) {
        toast.error(`${failed.length} pin${failed.length === 1 ? "" : "s"} failed — reopen this board to retry them.`);
      }
      if (approved > 0) {
        toast.success(`${approved} pin${approved === 1 ? "" : "s"} approved`, {
          action: {
            label: "Undo all",
            onClick: async () => {
              const { error } = await supabase
                .from("pins")
                .update({ status: "draft" })
                .in("id", matched.map((r) => r.candidate.pinId));
              if (error) {
                toast.error("Failed to undo: " + error.message);
                return;
              }
              setApprovedCount((n) => Math.max(0, n - approved));
              toast.success("Reverted all to draft");
            },
          },
        });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to approve all");
    } finally {
      setApprovingAll(false);
      setApproveAllProgress(null);
    }
  };

  const backToBoard = () => navigate({ to: "/pins/attach", search: { collection: collectionId } });

  if (!collectionId) {
    return (
      <AppShell title="Monetise board" backButton hideBottomNav hideNotifications>
        <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          No board selected.
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Monetise board" subtitle={boardName || undefined} backButton hideBottomNav hideNotifications>
      {isError ? (
        <div className="rounded-2xl border border-dashed border-rose-300 bg-rose-50/50 p-10 text-center text-sm text-rose-700">
          <p>Couldn't load this board's pins.</p>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-rose-600 px-4 py-2 text-sm font-medium text-white transition disabled:opacity-60"
          >
            {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Try again
          </button>
        </div>
      ) : isLoading ? (
        <div className="mx-auto max-w-sm">
          <div className="mb-4 h-2 w-full animate-pulse rounded-full bg-surface-2" />
          <div className="aspect-[4/5] w-full animate-pulse rounded-3xl border border-border bg-surface-2" />
        </div>
      ) : candidates.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-surface/40 p-12 text-center text-sm text-muted-foreground">
          <p>Every pin in this board already has a product attached.</p>
          <button
            onClick={backToBoard}
            className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-gradient-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-glow"
          >
            Back to board
          </button>
        </div>
      ) : done ? (
        <div className="mx-auto max-w-sm rounded-2xl border border-border bg-surface p-8 text-center shadow-sm">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-emerald-500 text-white shadow-glow">
            <CheckCheck className="h-6 w-6" />
          </span>
          <h2 className="mt-4 text-lg font-bold">Board reviewed</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {approvedCount} pin{approvedCount === 1 ? "" : "s"} now live in "{boardName}".
          </p>
          <button
            onClick={backToBoard}
            className="mt-6 inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-gradient-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-glow"
          >
            Back to board
          </button>
        </div>
      ) : (
        <div className="mx-auto max-w-sm pb-32">
          <div className="mb-1.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full rounded-full bg-gradient-primary transition-all duration-300"
              style={{ width: `${total > 0 ? (cursor / total) * 100 : 0}%` }}
            />
          </div>
          <p className="mb-4 text-center text-xs font-medium text-muted-foreground">
            {cursor} of {total} reviewed · {approvedCount} approved
          </p>

          {/* Height is driven by the current (in-flow) card, not a fixed
              box, so nothing is ever clipped — the page just scrolls. */}
          <div className="relative">
            {upNext.map((c, i) => (
              <div
                key={c.pinId}
                className="absolute inset-x-0 top-0 aspect-[4/5] overflow-hidden rounded-3xl border border-border bg-surface shadow-sm"
                style={{
                  transform: `scale(${1 - (i + 1) * 0.04}) translateY(${(i + 1) * 10}px)`,
                  zIndex: 10 - i,
                  opacity: 1 - (i + 1) * 0.3,
                }}
              >
                <div className="relative h-full w-full bg-gradient-to-br from-rose-500 to-pink-600">
                  {c.imageUrl && (
                    <img src={c.imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
                  )}
                </div>
              </div>
            ))}

            {current && (
              <div className="relative z-20">
                <DraggableCard
                  key={current.pinId}
                  candidate={current}
                  recommendation={currentRecommendation}
                  recLoading={currentRecLoading}
                  recFetching={currentRecFetching}
                  pending={pendingIds.has(current.pinId)}
                  apiRef={cardApiRef}
                  manualDraft={manualDraft}
                  onManualDraft={setManualDraft}
                  onApprove={() => approveCurrent(current)}
                  onSkip={advance}
                  onRetry={retryCurrentRecommendation}
                />
              </div>
            )}
          </div>

          {current && !currentRecLoading && (
            <div className="mt-5 flex items-center justify-center gap-5">
              <button
                onClick={handleRejectClick}
                aria-label="Reject this pin"
                className="grid h-14 w-14 place-items-center rounded-full border border-border bg-surface text-muted-foreground shadow-sm transition hover:border-rose-300 hover:text-rose-500 active:scale-95"
              >
                <X className="h-6 w-6" />
              </button>
              <button
                onClick={handleApproveClick}
                aria-label="Approve this pin"
                disabled={pendingIds.has(current.pinId)}
                className="grid h-16 w-16 place-items-center rounded-full bg-gradient-primary text-primary-foreground shadow-glow transition active:scale-95 disabled:opacity-60"
              >
                {pendingIds.has(current.pinId) ? (
                  <Loader2 className="h-6 w-6 animate-spin" />
                ) : (
                  <Heart className="h-6 w-6" />
                )}
              </button>
            </div>
          )}

          <div
            className="fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-surface/95 px-4 py-3 backdrop-blur-xl"
            style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
          >
            <div className="mx-auto flex max-w-sm items-center gap-3">
              <button
                onClick={handleApproveAllClick}
                disabled={approvingAll || remaining.length === 0}
                className={`inline-flex w-full items-center justify-center gap-1.5 rounded-xl border px-4 py-3 text-sm font-semibold transition active:scale-[0.98] disabled:opacity-50 ${
                  confirmAll
                    ? "border-amber-400 bg-amber-400/15 text-amber-600"
                    : "border-primary/30 bg-primary/10 text-primary"
                }`}
              >
                {approvingAll ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {approveAllProgress
                      ? `Matching products… ${approveAllProgress.done}/${approveAllProgress.total}`
                      : "Approving…"}
                  </>
                ) : confirmAll ? (
                  <>
                    <AlertTriangle className="h-4 w-4" />
                    {`Tap again to approve ${remaining.length} pin${remaining.length === 1 ? "" : "s"}`}
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    {`Approve all remaining (${remaining.length})`}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}

function DraggableCard({
  candidate,
  recommendation,
  recLoading,
  recFetching,
  pending,
  apiRef,
  manualDraft,
  onManualDraft,
  onApprove,
  onSkip,
  onRetry,
}: {
  candidate: BoardCandidate;
  recommendation: VisualMatch | null;
  recLoading: boolean;
  recFetching: boolean;
  pending: boolean;
  apiRef: React.MutableRefObject<CardApi | null>;
  manualDraft: ManualDraft;
  onManualDraft: (d: ManualDraft) => void;
  onApprove: () => void;
  onSkip: () => void;
  onRetry: () => void;
}) {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-260, 0, 260], [-14, 0, 14]);
  const likeOpacity = useTransform(x, [20, 140], [0, 1]);
  const nopeOpacity = useTransform(x, [-140, -20], [1, 0]);
  const [leaving, setLeaving] = useState(false);
  const firedRef = useRef(false);

  // The Reject / Approve buttons below the stack drive this (same two
  // buttons whether the pin got a real AI match or needs manual tagging) —
  // no drag gesture, just a directional slide-out animation on click.
  const flyOut = (dir: "left" | "right") => {
    if (firedRef.current) return;
    firedRef.current = true;
    setLeaving(false);
    animateMotionValue(x, dir === "right" ? 620 : -620, {
      duration: 0.22,
      ease: "easeIn",
      onComplete: dir === "right" ? onApprove : onSkip,
    });
  };
  apiRef.current = { flyOut };

  // "Add product" appends to the list and clears the paste box — the user
  // can keep pasting more links for this same pin. Newly-added products
  // start selected; tapping one in "Your products" toggles it in/out of
  // what Approve will actually submit.
  const handleAddProduct = () => {
    const url = manualDraft.pasteUrl.trim();
    if (!url) {
      toast.error("Paste a product link first");
      return;
    }
    try {
      new URL(url);
    } catch {
      toast.error("That doesn't look like a valid URL");
      return;
    }
    const normalize = (u: string) => u.trim().replace(/\/+$/, "").toLowerCase();
    if (manualDraft.products.some((p) => normalize(p.url) === normalize(url))) {
      toast.error("Already added");
      return;
    }
    onManualDraft({
      pasteUrl: "",
      products: [
        ...manualDraft.products,
        { id: crypto.randomUUID(), title: deriveManualTitle(candidate.title, url), url, selected: true },
      ],
    });
  };

  const toggleManualProduct = (id: string) => {
    onManualDraft({
      ...manualDraft,
      products: manualDraft.products.map((p) => (p.id === id ? { ...p, selected: !p.selected } : p)),
    });
  };

  let linkHost: string | null = null;
  if (recommendation) {
    try {
      linkHost = new URL(recommendation.link).hostname.replace(/^www\./, "");
    } catch {
      linkHost = null;
    }
  }

  return (
    <motion.div
      style={{ x, rotate }}
      className={`relative select-none overflow-hidden rounded-3xl border border-border bg-surface shadow-elevate transition-all duration-150 ${
        leaving ? "scale-95 opacity-0" : ""
      }`}
    >
      {!recLoading && (
        <>
          <motion.span
            style={{ opacity: likeOpacity }}
            className="pointer-events-none absolute left-4 top-4 z-30 -rotate-12 rounded-lg border-4 border-emerald-500 px-3 py-1 text-lg font-black uppercase tracking-wide text-emerald-500"
          >
            Approve
          </motion.span>
          <motion.span
            style={{ opacity: nopeOpacity }}
            className="pointer-events-none absolute right-4 top-4 z-30 rotate-12 rounded-lg border-4 border-rose-500 px-3 py-1 text-lg font-black uppercase tracking-wide text-rose-500"
          >
            Reject
          </motion.span>
        </>
      )}

      <div className="relative aspect-[4/5] w-full bg-gradient-to-br from-rose-500 to-pink-600">
        {candidate.imageUrl && (
          <img
            src={candidate.imageUrl}
            alt=""
            draggable={false}
            className="pointer-events-none absolute inset-0 h-full w-full object-cover"
          />
        )}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-black/0 to-transparent" />
        <p className="pointer-events-none absolute inset-x-3 bottom-3 line-clamp-2 text-sm font-semibold text-white">
          {candidate.title || "Untitled pin"}
        </p>
      </div>

      <div className="max-h-[45vh] overflow-y-auto p-3">
        {recLoading ? (
          <div className="space-y-2.5 py-2">
            <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Finding a matching product…
            </p>
            <div className="h-56 animate-pulse rounded-xl bg-surface-2" />
          </div>
        ) : recommendation ? (
          <>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Recommended product
            </p>
            <div className="h-56">
              <SuggestionCard
                title={recommendation.title}
                thumbnail={recommendation.thumbnail}
                source={recommendation.source}
                link={recommendation.link}
                price={recommendation.price}
              />
            </div>
            {linkHost && (
              <p className="mt-2 truncate text-center text-[11px] text-muted-foreground">Links to {linkHost}</p>
            )}
          </>
        ) : (
          <div className="space-y-5">
            {/* Manual link — same component as the single-pin attach flow */}
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Product link
              </label>
              <div className="mt-1.5 flex items-center gap-2 rounded-xl border border-input bg-background px-3 py-2.5">
                <Link2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                <input
                  type="url"
                  value={manualDraft.pasteUrl}
                  onChange={(e) => onManualDraft({ ...manualDraft, pasteUrl: e.target.value })}
                  placeholder="Paste an affiliate link…"
                  className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
                />
              </div>
              <button
                type="button"
                onClick={handleAddProduct}
                disabled={pending || !manualDraft.pasteUrl.trim()}
                className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-primary/10 px-4 py-2 text-sm font-semibold text-primary transition hover:bg-primary/15 disabled:opacity-50"
              >
                <Plus className="h-4 w-4" />
                Add product
              </button>
            </div>

            {/* Our Recommendation */}
            <div>
              <div className="flex items-center justify-between">
                <h5 className="flex items-center gap-1.5 text-sm font-semibold">
                  <Wand2 className="h-4 w-4 text-primary" />
                  Our Recommendation
                </h5>
                <button
                  onClick={onRetry}
                  disabled={recFetching}
                  className="rounded-full bg-surface-2 px-2.5 py-1 text-[10px] font-semibold text-muted-foreground hover:text-foreground disabled:opacity-50"
                >
                  {recFetching ? "Scanning…" : "Retry"}
                </button>
              </div>
              <div className="mt-3">
                {recFetching ? (
                  <div className="h-56 animate-pulse rounded-xl bg-surface-2" />
                ) : (
                  <p className="rounded-xl border border-dashed border-border bg-surface-2/40 p-4 text-center text-xs text-muted-foreground">
                    No suggestions yet.
                  </p>
                )}
              </div>
            </div>

            {/* Your products — manually added, auto-selected, toggleable */}
            {manualDraft.products.length > 0 && (
              <div>
                <div className="flex items-center justify-between">
                  <h5 className="flex items-center gap-1.5 text-sm font-semibold">
                    <Store className="h-4 w-4 text-primary" />
                    Your products
                  </h5>
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                    {manualDraft.products.length} added
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                  {manualDraft.products.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => toggleManualProduct(p.id)}
                      className={`group relative flex h-full flex-col overflow-hidden rounded-xl border bg-surface text-left transition hover:-translate-y-0.5 hover:shadow-elevate ${
                        p.selected ? "border-primary ring-2 ring-primary" : "border-primary/30 hover:border-primary/60"
                      }`}
                    >
                      <div className="relative aspect-square w-full overflow-hidden bg-primary/10">
                        <div className="absolute inset-0 grid place-items-center text-muted-foreground">
                          <ImageIcon className="h-8 w-8" />
                        </div>
                      </div>
                      {p.selected && (
                        <span className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full bg-primary text-primary-foreground shadow">
                          <Check className="h-3.5 w-3.5" strokeWidth={3} />
                        </span>
                      )}
                      <div className="flex flex-1 flex-col gap-1.5 p-2.5">
                        <h3 className="line-clamp-2 text-[12px] font-semibold leading-snug text-foreground">
                          {p.title}
                        </h3>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}

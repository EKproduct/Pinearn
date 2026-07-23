import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCheck, Info, LayoutGrid } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { SwipeDeck } from "@/components/swipe-deck";
import { LiveScorePill } from "@/components/health-widgets";
import {
  ApproveAllSheet,
  DeckSkeleton,
  DoneState,
  FixEditSheet,
  GuideSheet,
  OptimizedState,
  SuggestionBlock,
} from "@/components/boost-fix-kit";
import { supabase } from "@/integrations/supabase/client";
import { useFixFlow, type BaseFixCard } from "@/hooks/use-fix-flow";
import type { HealthData } from "@/hooks/use-health-score";
import {
  boardIssues,
  boardPassesStructure,
  SCORE_CRITERIA,
  suggestBoardDescription,
  suggestBoardName,
} from "@/lib/health-score";

export const Route = createFileRoute("/_authenticated/boost_/boards")({
  component: FixBoardsPage,
});

type BoardFixCard = BaseFixCard & { covers: string[]; pinCount: number };

// How to drive the deck — surfaced any time via the header's "How it works".
const BOARD_GUIDE_STEPS = [
  "Swipe right (or tap Apply fix) to accept the suggested name & description.",
  "Swipe left to skip a board and leave it untouched.",
  "Tap Edit to adjust the wording before you apply it.",
  "Changed your mind? Undo any fix from the summary at the end.",
];

function buildDeck(data: HealthData): BoardFixCard[] {
  return data.boards
    .filter((b) => !boardPassesStructure(b))
    .map((b) => {
      const boardPins = data.pins.filter((p) => p.collection_id === b.id);
      const suggestedName = suggestBoardName(b, boardPins);
      return {
        id: b.id,
        title: b.name?.trim() || "Unnamed board",
        issues: boardIssues(b),
        pinCount: boardPins.length,
        covers: boardPins
          .map((p) => p.image_url)
          .filter((u): u is string => !!u)
          .slice(0, 3),
        fields: [
          { key: "name", label: "Board name", value: suggestedName, min: 3, max: 50 },
          {
            key: "description",
            label: "Description",
            value: suggestBoardDescription(b, suggestedName),
            min: 20,
            max: 500,
            multiline: true,
          },
        ],
        original: { name: b.name, description: b.description },
      };
    });
}

function FixBoardsPage() {
  const navigate = useNavigate();
  const flow = useFixFlow<BoardFixCard>({
    scoreKey: "boardStructure",
    buildDeck,
    persist: async (id, values) => {
      // values is a dynamic {name, description} map — cast past the generated
      // row type's excess-property check (keys are ours, not user input).
      const { error } = await supabase
        .from("collections")
        .update(values as never)
        .eq("id", id);
      return { error };
    },
    applyToCache: (data, id, values) => ({
      ...data,
      boards: data.boards.map((b) => (b.id === id ? { ...b, ...values } : b)),
    }),
    invalidateKeys: [["dashboard-boards-collections"], ["collections"]],
  });

  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [guide, setGuide] = useState(false);

  const backToScore = () => navigate({ to: "/boost" });
  const paused = editing || confirming;
  const remaining = flow.cards.slice(flow.index);

  return (
    <AppShell title="Board Boost" backButton backTo="/boost" hideBottomNav>
      <div className="mx-auto flex h-[calc(100dvh-6.5rem)] max-w-md flex-col px-1">
        <div className="flex shrink-0 flex-col items-center gap-1 pb-3">
          <LiveScorePill label="Board Structure" score={flow.score} />
          {!flow.done && flow.deck && flow.deck.length > 0 && (
            <p className="text-[11px] text-muted-foreground">
              Applying renames this board &amp; adds a description
            </p>
          )}
          <button
            type="button"
            onClick={() => setGuide(true)}
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary transition hover:underline"
          >
            <Info className="h-3 w-3" /> How it works
          </button>
        </div>

        {flow.isLoading || flow.deck === null ? (
          <DeckSkeleton />
        ) : flow.deck.length === 0 ? (
          <OptimizedState onBack={backToScore} />
        ) : flow.done ? (
          <DoneState
            scoreLabel="Board Structure"
            score={flow.score}
            gained={flow.gained}
            approvedCount={flow.approvedCount}
            skippedCount={flow.skippedCount}
            total={flow.total}
            appliedCards={flow.appliedCards}
            onRevertOne={(c) => flow.revertOne(c as BoardFixCard)}
            onUndoAll={flow.undoAll}
            onBack={backToScore}
            busy={flow.bulkApplying || flow.pendingIds.size > 0}
          />
        ) : (
          <>
            <SwipeDeck
              items={flow.cards}
              index={flow.index}
              pendingIds={flow.pendingIds}
              paused={paused}
              canUndo={flow.canUndo}
              cardLabel={(c) => c.title}
              renderCard={(card) => <BoardCardBody card={card} onEdit={() => setEditing(true)} />}
              onDecide={flow.decide}
              onUndo={flow.undo}
              approveLabel="Apply fix"
            />
            <motion.button
              whileTap={{ scale: 0.98 }}
              onClick={() => setConfirming(true)}
              disabled={flow.bulkApplying || remaining.length === 0}
              className="mt-2.5 inline-flex min-h-[48px] w-full shrink-0 items-center justify-center gap-1.5 rounded-2xl border-2 border-primary bg-surface px-3 text-[13px] font-bold text-primary transition disabled:opacity-40"
            >
              <CheckCheck className="h-4 w-4" /> Approve all ({remaining.length})
            </motion.button>
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
            unitLabel="boards"
            onConfirm={flow.approveAll}
            onCancel={() => setConfirming(false)}
          />
        )}
        {guide && (
          <GuideSheet
            title="What makes a good board"
            criteria={SCORE_CRITERIA.boardStructure}
            steps={BOARD_GUIDE_STEPS}
            onClose={() => setGuide(false)}
          />
        )}
      </AnimatePresence>
    </AppShell>
  );
}

function BoardCardBody({ card, onEdit }: { card: BoardFixCard; onEdit: () => void }) {
  const [cover, ...rest] = card.covers;
  return (
    <div className="flex h-full flex-col">
      <div className="relative h-2/5 shrink-0 bg-surface-2">
        <div className="flex h-full gap-0.5">
          <div className="relative flex-[2] bg-surface-2">
            {cover ? (
              <img src={cover} alt="" className="h-full w-full object-cover" draggable={false} />
            ) : (
              <div className="grid h-full place-items-center text-muted-foreground">
                <LayoutGrid className="h-8 w-8" />
              </div>
            )}
          </div>
          <div className="flex flex-1 flex-col gap-0.5">
            {[0, 1].map((i) => (
              <div key={i} className="relative flex-1 bg-surface-2">
                {rest[i] && (
                  <img
                    src={rest[i]}
                    alt=""
                    className="h-full w-full object-cover"
                    draggable={false}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
        <div className="absolute left-2 top-2 flex flex-wrap gap-1">
          {card.issues.map((issue) => (
            <span
              key={issue}
              className="rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur"
            >
              {issue}
            </span>
          ))}
          <span className="rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur">
            {card.pinCount} {card.pinCount === 1 ? "pin" : "pins"}
          </span>
        </div>
      </div>
      <SuggestionBlock fields={card.fields} current={card.original} onEdit={onEdit} />
    </div>
  );
}

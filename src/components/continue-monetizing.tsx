import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowRight, Sparkles, Wand2 } from "lucide-react";

import {
  listMonetizeProgress,
  subscribeMonetizeProgress,
  type MonetizeProgress,
} from "@/lib/monetize-progress";

// "Continue monetising" — boards the user started reviewing in the manual
// monetise flow but left before finishing (see monetize-progress). Each is a
// native board thumbnail with a Continue button that drops them back on the
// exact pin they left off.
export function ContinueMonetizing() {
  const [boards, setBoards] = useState<MonetizeProgress[]>([]);

  useEffect(() => {
    const refresh = () => setBoards(listMonetizeProgress());
    refresh();
    const unsub = subscribeMonetizeProgress(refresh);
    // Coming back from the board via a bfcache/tab switch won't always fire our
    // custom event, so re-read on focus/visibility too.
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      unsub();
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);

  if (boards.length === 0) return null;

  return (
    <section className="mt-8">
      <div className="mb-4 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-1.5 font-display text-lg font-semibold">
            <Sparkles className="h-4 w-4 text-primary" /> Continue monetising
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Pick up {boards.length === 1 ? "the board" : `${boards.length} boards`} you started
          </p>
        </div>
      </div>

      <div className="no-scrollbar -mx-5 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-1 sm:mx-0 sm:px-0">
        {boards.map((b) => (
          <ContinueCard key={b.collectionId} board={b} />
        ))}
      </div>
    </section>
  );
}

function ContinueCard({ board }: { board: MonetizeProgress }) {
  const pct = board.total > 0 ? Math.round((board.reviewedCount / board.total) * 100) : 0;
  const left = Math.max(board.total - board.reviewedCount, 0);

  return (
    <div className="flex w-44 shrink-0 snap-start flex-col overflow-hidden rounded-2xl border border-border/70 bg-surface shadow-sm">
      <BoardThumb covers={board.covers} />

      {/* Progress bar — sits right on the seam between the board thumbnail and the white content area */}
      <div className="h-1.5 w-full bg-primary/10">
        <div
          className="h-full bg-gradient-primary transition-all"
          style={{ width: `${Math.max(pct, 4)}%` }}
        />
      </div>

      <div className="flex flex-1 flex-col gap-2 p-3">
        <h3 className="line-clamp-1 text-sm font-bold leading-tight">
          {board.boardName || "Untitled board"}
        </h3>

        <Link
          to="/pins/monetize-board"
          search={{ collectionId: board.collectionId, resume: board.lastPinId ?? "" }}
          className="inline-flex w-fit items-center gap-1 rounded-full bg-gradient-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-glow transition active:scale-[0.97]"
        >
          {left > 0 ? `${left} pin${left === 1 ? "" : "s"} left` : "Continue"}{" "}
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
    </div>
  );
}

// The board's native thumbnail collage — one big cover on the left, two stacked
// on the right — mirroring how boards are shown everywhere else.
function BoardThumb({ covers }: { covers: string[] }) {
  const [a, b, c] = covers;
  const side = [b, c];
  return (
    <div className="flex aspect-[4/3] w-full gap-0.5 bg-surface-2">
      <div className="relative flex-[2] bg-gradient-to-br from-rose-500 to-pink-600">
        {a ? (
          <img src={a} alt="" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <div className="grid h-full w-full place-items-center text-primary-foreground">
            <Wand2 className="h-6 w-6" />
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-0.5">
        {side.map((src, i) => (
          <div key={i} className="relative flex-1 bg-gradient-to-br from-rose-400 to-pink-500">
            {src && (
              <img src={src} alt="" className="absolute inset-0 h-full w-full object-cover" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

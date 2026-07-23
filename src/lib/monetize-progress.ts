// Tracks boards the user has started monetising in the manual review flow but
// hasn't finished — so the dashboard can offer a "Continue monetising" section
// that drops them back exactly where they left off. This is inherently a
// client-session signal (a board opened with zero pins reviewed leaves no trace
// in the DB), so it lives in localStorage rather than on the server.

export type MonetizeProgress = {
  collectionId: string;
  boardName: string;
  // Up to three pin covers for the native board thumbnail.
  covers: string[];
  // The pin the user was last looking at — where "Continue" resumes.
  lastPinId: string | null;
  reviewedCount: number;
  total: number;
  updatedAt: number;
};

const KEY = "pinearn.monetizeProgress";
// Same-tab updates don't fire the native `storage` event, so we broadcast our
// own so a mounted dashboard can react live.
const EVENT = "pinearn:monetize-progress";

// One-time wipe for browsers that picked up progress saved under the old
// behaviour (before "Continue monetising" required at least one real
// decision to show up). Bump the suffix again if this ever needs to re-run.
const RESET_KEY = "pinearn.monetizeProgress.reset.2";
function ensureOneTimeReset() {
  if (typeof localStorage === "undefined") return;
  try {
    if (localStorage.getItem(RESET_KEY)) return;
    localStorage.removeItem(KEY);
    localStorage.setItem(RESET_KEY, "1");
  } catch {
    /* best-effort */
  }
}

function readAll(): Record<string, MonetizeProgress> {
  if (typeof localStorage === "undefined") return {};
  ensureOneTimeReset();
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Record<string, MonetizeProgress>) : {};
  } catch {
    return {};
  }
}

function writeAll(map: Record<string, MonetizeProgress>) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(map));
    window.dispatchEvent(new Event(EVENT));
  } catch {
    /* storage full / disabled — progress tracking is best-effort */
  }
}

export function saveMonetizeProgress(p: MonetizeProgress) {
  const all = readAll();
  all[p.collectionId] = p;
  writeAll(all);
}

export function clearMonetizeProgress(collectionId: string) {
  const all = readAll();
  if (all[collectionId]) {
    delete all[collectionId];
    writeAll(all);
  }
}

// A pin taken down outside the review flow (e.g. from the Pins page) had its
// product detached, so it's effectively un-reviewed again — pull it back out
// of a board's saved reviewedCount so "N pins left" stays accurate instead of
// silently going stale. No-op if the board has no saved progress. If that was
// the only reviewed pin, the board hasn't really been "started" any more, so
// drop it entirely rather than leaving a zero-progress entry on the dashboard.
export function unreviewMonetizeProgressPin(collectionId: string) {
  const all = readAll();
  const existing = all[collectionId];
  if (!existing) return;
  const reviewedCount = Math.max(existing.reviewedCount - 1, 0);
  if (reviewedCount === 0) {
    clearMonetizeProgress(collectionId);
    return;
  }
  writeAll({
    ...all,
    [collectionId]: { ...existing, reviewedCount, updatedAt: Date.now() },
  });
}

// Newest-touched first — the board they most recently left sits at the front.
// Filters out zero-progress entries: saveMonetizeProgress used to write one
// the instant a board was opened, before the user reviewed anything, so
// browsers that picked that up before the fix would otherwise still show a
// "started" board that never actually was.
export function listMonetizeProgress(): MonetizeProgress[] {
  return Object.values(readAll())
    .filter((p) => p.reviewedCount > 0)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export function subscribeMonetizeProgress(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) cb();
  };
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", onStorage);
  };
}

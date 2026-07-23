// Translates technical/internal error text (Supabase/Postgres messages, OAuth
// debug strings, network errors) into short, user-safe copy. Never changes
// what was thrown — only what gets shown.
const PATTERNS: Array<{ test: RegExp; message: string }> = [
  {
    test: /token exchange failed|oauth state|PINTEREST_APP_(ID|SECRET)|PINTEREST_REDIRECT_URI/i,
    message: "We couldn't connect to Pinterest. Please try again.",
  },
  {
    test: /failed to fetch|networkerror|load failed|ECONNRESET|ETIMEDOUT/i,
    message: "Network issue — check your connection and try again.",
  },
  {
    test: /jwt|not authenticated|auth session missing|401/i,
    message: "Your session expired. Please sign in again.",
  },
  { test: /duplicate key|violates unique constraint/i, message: "That already exists." },
  {
    test: /violates foreign key constraint|violates row-level security/i,
    message: "We couldn't complete that action. Please try again.",
  },
  { test: /permission denied|forbidden|403/i, message: "You don't have permission to do that." },
];

export function getFriendlyMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  const match = PATTERNS.find((p) => p.test.test(raw));
  return match?.message ?? "Something went wrong. Please try again.";
}

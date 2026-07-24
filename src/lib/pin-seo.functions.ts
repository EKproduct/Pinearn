// Pin SEO suggestion pipeline — server functions.
//
// POST surface (all TanStack Start server functions, auth via Supabase JWT,
// data access through the caller's RLS-scoped client so users can only ever
// touch their own pins):
//   suggestPinSeo({ pinId })            → generate (or reuse) one suggestion
//   approvePinSeoSuggestion({ suggestionId }) → write onto the pin, mark approved
//   rejectPinSeoSuggestion({ suggestionId })  → mark rejected, pin untouched
//   suggestBoardSeoBatch({ boardId })   → pipeline for every low-SEO pin on a board
//
// "Board" here is the `collections` table — that's what the rest of the app
// (import, health score, storefront) treats as a Pinterest board; the `boards`
// table is a separate storefront-layout grouping that pins don't belong to.

import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import { pinSeoIssues } from "@/lib/health-score";
import { generatePinSuggestion } from "@/lib/gemini.server";
import {
  pickAngle,
  primaryKeyword,
  validateSuggestion,
  type PinSuggestionContext,
  type SeoAngle,
} from "@/lib/pin-seo";
import { createLimiter } from "@/lib/concurrency-limiter";

type Supabase = SupabaseClient<Database>;

// Module-level limiter: bounds TOTAL in-flight Gemini calls process-wide
// (free-tier Flash allows ~10 RPM — see concurrency-limiter.ts for why the
// cap must live at module scope, not inside the batch loop).
const geminiLimit = createLimiter(2);

// Reuse a pending suggestion younger than this instead of re-calling Gemini.
const DEDUP_WINDOW_MS = 24 * 60 * 60 * 1000;

/* ---------------- Step 1: context gathering ---------------- */

function formatPrice(priceCents: number | null, currency: string | null): string | null {
  if (priceCents == null) return null;
  const amount = (priceCents / 100).toFixed(2).replace(/\.00$/, "");
  const symbols: Record<string, string> = { USD: "$", INR: "₹", EUR: "€", GBP: "£" };
  const cur = currency ?? "USD";
  return `${symbols[cur] ?? `${cur} `}${amount}`;
}

/** Everything the prompt needs about one pin, from the existing schema:
 * pin row, its board (collection) + up to 10 sibling pin titles, the
 * creator's niche (storefront name/description), the tagged product
 * (storefront_products via pin_id, falling back to pins.product_id), and
 * prior rejected suggestions to avoid repeating. */
export async function getPinSuggestionContext(
  supabase: Supabase,
  userId: string,
  pinId: string,
): Promise<Omit<PinSuggestionContext, "angle"> & { priorSuggestionCount: number }> {
  const { data: pin, error: pinErr } = await supabase
    .from("pins")
    .select("id, title, description, image_url, collection_id, origin_collection_id, product_id")
    .eq("id", pinId)
    .eq("user_id", userId)
    .maybeSingle();
  if (pinErr) throw new Error(pinErr.message);
  if (!pin) throw new Error("Pin not found");

  // A live pin sits in its own per-pin collection; origin_collection_id
  // remembers the real board it came from (see 20260720120000 migration).
  const boardId = pin.origin_collection_id ?? pin.collection_id;

  const [boardRes, siblingsRes, storefrontRes, taggedProductRes, historyRes] = await Promise.all([
    boardId
      ? supabase.from("collections").select("id, name").eq("id", boardId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    boardId
      ? supabase
          .from("pins")
          .select("title")
          .eq("collection_id", boardId)
          .neq("id", pinId)
          .order("created_at", { ascending: false })
          .limit(10)
      : Promise.resolve({ data: [], error: null }),
    supabase.from("storefronts").select("name, description").eq("user_id", userId).maybeSingle(),
    supabase
      .from("storefront_products")
      .select("title, price_cents, currency")
      .eq("pin_id", pinId)
      .order("position", { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("pin_suggestion_history")
      .select("suggested_title, suggested_description, status")
      .eq("pin_id", pinId)
      .order("created_at", { ascending: false }),
  ]);
  for (const res of [boardRes, siblingsRes, storefrontRes, taggedProductRes, historyRes]) {
    if (res.error) throw new Error(res.error.message);
  }

  // Fall back to the pin's directly-linked product when nothing is tagged
  // via storefront_products.pin_id.
  let product = taggedProductRes.data;
  if (!product && pin.product_id) {
    const { data, error } = await supabase
      .from("storefront_products")
      .select("title, price_cents, currency")
      .eq("id", pin.product_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    product = data;
  }

  const board = boardRes.data ? { id: boardRes.data.id, name: boardRes.data.name } : null;
  const storefront = storefrontRes.data;
  const history = historyRes.data ?? [];

  return {
    pin: {
      id: pin.id,
      title: pin.title ?? "",
      description: pin.description ?? "",
      imageUrl: pin.image_url,
    },
    board,
    siblingPinTitles: (siblingsRes.data ?? []).map((p) => p.title).filter((t) => t.trim() !== ""),
    niche: storefront
      ? [storefront.name, storefront.description].filter(Boolean).join(" — ")
      : null,
    product: product
      ? {
          name: product.title,
          // No product-category column exists; the board name is the closest
          // category signal we have.
          category: board?.name ?? null,
          priceLabel: formatPrice(product.price_cents, product.currency),
        }
      : null,
    rejectedSuggestions: history
      .filter((h) => h.status === "rejected")
      .slice(0, 5)
      .map((h) => ({ title: h.suggested_title, description: h.suggested_description })),
    priorSuggestionCount: history.length,
  };
}

/* ---------------- Steps 2-5: generate → validate → store ---------------- */

export type SuggestSeoResult = {
  pinId: string;
  suggestionId: string;
  title: string;
  description: string;
  angle_used: SeoAngle | null;
  /** 'pending' = ready to swipe; 'needs_review' = failed validation twice. */
  status: "pending" | "needs_review";
  /** True when a <24h-old pending suggestion was returned instead of a new
   * Gemini call (cost control). */
  reused: boolean;
};

async function runSuggestionPipeline(
  supabase: Supabase,
  userId: string,
  pinId: string,
): Promise<SuggestSeoResult> {
  // Dedup: an unanswered suggestion from the last 24h is returned as-is.
  const since = new Date(Date.now() - DEDUP_WINDOW_MS).toISOString();
  const { data: recent, error: recentErr } = await supabase
    .from("pin_suggestion_history")
    .select("id, suggested_title, suggested_description, angle")
    .eq("pin_id", pinId)
    .eq("status", "pending")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (recentErr) throw new Error(recentErr.message);
  if (recent) {
    return {
      pinId,
      suggestionId: recent.id,
      title: recent.suggested_title,
      description: recent.suggested_description,
      angle_used: (recent.angle as SeoAngle | null) ?? null,
      status: "pending",
      reused: true,
    };
  }

  const base = await getPinSuggestionContext(supabase, userId, pinId);
  // Salting the angle with the prior-suggestion count both spreads the five
  // framings across a batch (different pin ids hash apart) and guarantees a
  // regenerate-after-reject tries the next framing, not the same one again.
  const angle = pickAngle(pinId, base.priorSuggestionCount);
  const context: PinSuggestionContext = { ...base, angle };
  const keyword = primaryKeyword(context);

  let candidate = await geminiLimit(() => generatePinSuggestion(context));
  let issues = validateSuggestion(candidate, keyword);
  if (issues.length > 0) {
    // One stricter retry, then park it for a human instead of looping.
    candidate = await geminiLimit(() => generatePinSuggestion(context, issues));
    issues = validateSuggestion(candidate, keyword);
  }
  const status: SuggestSeoResult["status"] = issues.length > 0 ? "needs_review" : "pending";

  const { data: saved, error: saveErr } = await supabase
    .from("pin_suggestion_history")
    .insert({
      pin_id: pinId,
      user_id: userId,
      suggested_title: candidate.title,
      suggested_description: candidate.description,
      angle,
      status,
    })
    .select("id")
    .single();
  if (saveErr) throw new Error(saveErr.message);

  return {
    pinId,
    suggestionId: saved.id,
    title: candidate.title,
    description: candidate.description,
    angle_used: angle,
    status,
    reused: false,
  };
}

/* ---------------- Server functions ---------------- */

/** POST — run the full pipeline for one pin. */
export const suggestPinSeo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { pinId: string }) => z.object({ pinId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    return runSuggestionPipeline(supabase, userId, data.pinId);
  });

/** POST — apply a suggestion to the pin's real title/description and mark it
 * approved. */
export const approvePinSeoSuggestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { suggestionId: string }) =>
    z.object({ suggestionId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;

    const { data: suggestion, error: sErr } = await supabase
      .from("pin_suggestion_history")
      .select("id, pin_id, suggested_title, suggested_description")
      .eq("id", data.suggestionId)
      .eq("user_id", userId)
      .maybeSingle();
    if (sErr) throw new Error(sErr.message);
    if (!suggestion) throw new Error("Suggestion not found");

    const { error: pinErr } = await supabase
      .from("pins")
      .update({
        title: suggestion.suggested_title,
        description: suggestion.suggested_description,
      })
      .eq("id", suggestion.pin_id)
      .eq("user_id", userId);
    if (pinErr) throw new Error(pinErr.message);

    const { error: updErr } = await supabase
      .from("pin_suggestion_history")
      .update({ status: "approved" })
      .eq("id", suggestion.id);
    if (updErr) throw new Error(updErr.message);

    return { pinId: suggestion.pin_id, approved: true };
  });

/** POST — mark a suggestion rejected without touching the pin. Rejected
 * phrasings feed back into the next generation's "avoid these" list. */
export const rejectPinSeoSuggestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { suggestionId: string }) =>
    z.object({ suggestionId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;

    const { data: updated, error } = await supabase
      .from("pin_suggestion_history")
      .update({ status: "rejected" })
      .eq("id", data.suggestionId)
      .eq("user_id", userId)
      .select("pin_id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!updated) throw new Error("Suggestion not found");

    return { pinId: updated.pin_id, rejected: true };
  });

export type BatchSuggestSeoResult = {
  results: SuggestSeoResult[];
  /** Pins whose pipeline threw (e.g. Gemini outage) — the rest still succeed. */
  failures: Array<{ pinId: string; error: string }>;
  /** Pins on the board that already pass Pin SEO and were skipped. */
  skipped: number;
};

/** POST — run the pipeline for every pin on a board (collection) that fails
 * the existing Pin SEO health check (missing/short/generic title or
 * description). Results feed the swipe-approval deck. */
export const suggestBoardSeoBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { boardId: string }) => z.object({ boardId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }): Promise<BatchSuggestSeoResult> => {
    const { supabase, userId } = context;

    const { data: board, error: bErr } = await supabase
      .from("collections")
      .select("id")
      .eq("id", data.boardId)
      .eq("user_id", userId)
      .maybeSingle();
    if (bErr) throw new Error(bErr.message);
    if (!board) throw new Error("Board not found");

    const { data: pins, error: pErr } = await supabase
      .from("pins")
      .select("id, title, description")
      .eq("collection_id", data.boardId)
      .eq("user_id", userId);
    if (pErr) throw new Error(pErr.message);

    const all = pins ?? [];
    const lowSeo = all.filter((p) => pinSeoIssues(p).length > 0);

    const results: SuggestSeoResult[] = [];
    const failures: Array<{ pinId: string; error: string }> = [];
    // geminiLimit already caps concurrent API calls; running the pipelines
    // concurrently just overlaps the Supabase reads between calls.
    await Promise.all(
      lowSeo.map(async (pin) => {
        try {
          results.push(await runSuggestionPipeline(supabase, userId, pin.id));
        } catch (e) {
          failures.push({ pinId: pin.id, error: e instanceof Error ? e.message : String(e) });
        }
      }),
    );

    return { results, failures, skipped: all.length - lowSeo.length };
  });

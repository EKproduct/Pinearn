import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import {
  createPin as createPinterestPinRemote,
  getAccountAnalytics,
  getPinAnalytics,
  getTopPinsAnalytics,
  getUserAccount,
  listBoardPins,
  listBoards,
  requireEnv,
} from "@/lib/pinterest-api";
import { getValidPinterestToken } from "@/lib/pinterest-oauth.functions";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// -------------------------------------------------------------
// Helpers
// -------------------------------------------------------------

function slugify(s: string) {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "board"
  );
}

// -------------------------------------------------------------
// Import real Pinterest boards + pins → Collections + Pins in the storefront.
// Idempotent: re-running only adds boards/pins not already synced, keyed on
// the real Pinterest board/pin id (see collections.pinterest_board_id and
// pins.pinterest_pin_id unique indexes).
// -------------------------------------------------------------

export const importPinterestBoards = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const { data: storefront, error: sErr } = await supabase
      .from("storefronts")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    if (sErr) throw new Error(sErr.message);
    if (!storefront) throw new Error("No storefront found for user");

    const accessToken = await getValidPinterestToken(userId);
    const boards = [...(await listBoards(accessToken))].sort((a, b) => {
      const at = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bt = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bt - at; // newest board first
    });

    let boardsCreated = 0;
    let pinsCreated = 0;

    const { data: existingCollections } = await supabase
      .from("collections")
      .select("id, pinterest_board_id")
      .eq("storefront_id", storefront.id)
      .not("pinterest_board_id", "is", null);
    const existingByBoardId = new Map(
      (existingCollections ?? []).map((c) => [c.pinterest_board_id as string, c.id]),
    );

    const { data: existingPositions } = await supabase
      .from("collections")
      .select("position")
      .eq("storefront_id", storefront.id)
      .order("position", { ascending: false })
      .limit(1);
    let nextPosition = (existingPositions?.[0]?.position ?? -1) + 1;

    // Board names can be emoji-only or otherwise collapse to the same slug
    // (e.g. "-🎵" and "_📝" both strip down to the "board" fallback) — track
    // every slug already used in this storefront and disambiguate collisions
    // with a numeric suffix, the same way the default-storefront trigger does.
    const { data: existingSlugRows } = await supabase
      .from("collections")
      .select("slug")
      .eq("storefront_id", storefront.id);
    const usedSlugs = new Set((existingSlugRows ?? []).map((c) => c.slug as string));

    function uniqueSlug(name: string): string {
      const base = slugify(name);
      if (!usedSlugs.has(base)) {
        usedSlugs.add(base);
        return base;
      }
      let n = 2;
      while (usedSlugs.has(`${base}-${n}`)) n++;
      const candidate = `${base}-${n}`;
      usedSlugs.add(candidate);
      return candidate;
    }

    const failedBoards: string[] = [];

    for (const board of boards) {
      let collectionId = existingByBoardId.get(board.id);

      if (!collectionId) {
        const { data: coll, error: cErr } = await supabase
          .from("collections")
          .insert({
            user_id: userId,
            storefront_id: storefront.id,
            name: board.name,
            slug: uniqueSlug(board.name),
            description: board.description ?? null,
            source: "pinterest",
            pinterest_board_id: board.id,
            position: nextPosition++,
          })
          .select("id")
          .single();
        if (cErr) {
          // Don't let one bad board abort the whole sync — skip it and keep going.
          failedBoards.push(`${board.name || board.id}: ${cErr.message}`);
          continue;
        }
        collectionId = coll.id;
        boardsCreated++;
      }

      const pins = await listBoardPins(accessToken, board.id);
      if (pins.length === 0) continue;

      const { data: existingPins } = await supabase
        .from("pins")
        .select("pinterest_pin_id")
        .eq("collection_id", collectionId)
        .not("pinterest_pin_id", "is", null);
      const alreadySynced = new Set((existingPins ?? []).map((p) => p.pinterest_pin_id as string));

      const newPinRows = pins
        .filter((p) => !alreadySynced.has(p.id))
        .map((p) => ({
          user_id: userId,
          storefront_id: storefront.id,
          collection_id: collectionId,
          title: p.title || "Untitled pin",
          description: p.description,
          image_url: p.imageUrl,
          external_url: p.link,
          source: "pinterest",
          // "new" = untouched, fresh from Pinterest sync. "draft" is reserved
          // for pins where the user actually started attaching a product and
          // left it unfinished — see PinDetailDialog in pins.tsx.
          status: "new",
          pinterest_pin_id: p.id,
          // Preserve the pin's real Pinterest creation time so the pins list
          // (sorted by created_at) reflects actual posting order, not sync order.
          ...(p.createdAt ? { created_at: p.createdAt } : {}),
        }));
      if (newPinRows.length === 0) continue;

      const { error: pErr } = await supabase.from("pins").insert(newPinRows);
      if (pErr) {
        failedBoards.push(`${board.name || board.id} (pins): ${pErr.message}`);
        continue;
      }
      pinsCreated += newPinRows.length;
    }

    if (failedBoards.length > 0) {
      console.error("[importPinterestBoards] skipped boards:", failedBoards);
    }

    return { boardsCreated, pinsCreated, skipped: failedBoards.length };
  });

// -------------------------------------------------------------
// Publish a real Pin to one of the user's synced Pinterest boards.
// -------------------------------------------------------------

export const createPinterestPin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      collectionId: string;
      title: string;
      description?: string;
      imageUrl: string;
      link?: string;
      productId?: string;
    }) =>
      z
        .object({
          collectionId: z.string().uuid(),
          title: z.string().min(1).max(100),
          description: z.string().max(500).optional(),
          imageUrl: z.string().url(),
          link: z.string().url().optional(),
          productId: z.string().uuid().optional(),
        })
        .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: collection, error: cErr } = await supabase
      .from("collections")
      .select("id, storefront_id, pinterest_board_id")
      .eq("id", data.collectionId)
      .maybeSingle();
    if (cErr) throw new Error(cErr.message);
    if (!collection?.pinterest_board_id) {
      throw new Error("Pick a board that's synced from Pinterest first.");
    }

    const accessToken = await getValidPinterestToken(userId);
    const pin = await createPinterestPinRemote(accessToken, {
      boardId: collection.pinterest_board_id,
      title: data.title,
      description: data.description,
      link: data.link,
      imageUrl: data.imageUrl,
    });

    const { data: inserted, error: pErr } = await supabase
      .from("pins")
      .insert({
        user_id: userId,
        storefront_id: collection.storefront_id,
        collection_id: collection.id,
        product_id: data.productId ?? null,
        title: data.title,
        description: data.description || null,
        image_url: data.imageUrl,
        external_url: data.link || null,
        source: "pinterest",
        status: "live",
        pinterest_pin_id: pin.id,
      })
      .select("id")
      .single();
    if (pErr) throw new Error(pErr.message);

    return { id: inserted.id, pinterestPinId: pin.id };
  });

// -------------------------------------------------------------
// Refresh real impressions/clicks for already-published pins.
//
// Pinterest's per-pin analytics endpoint is rate-limited hard (confirmed: a
// burst of ~40 concurrent requests immediately gets 429 "You have exceeded
// your rate limit"). So this runs fully sequential with a pause between
// calls and a single retry-with-backoff on 429, and only processes a bounded
// batch per invocation (oldest-synced pins first) — call it again to work
// through the rest instead of trying to do all pins in one shot.
// -------------------------------------------------------------

const SYNC_BATCH_SIZE = 40;
const SYNC_DELAY_MS = 350;

export const syncPinterestAnalytics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const accessToken = await getValidPinterestToken(userId);

    const { count: totalCount } = await supabase
      .from("pins")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .not("pinterest_pin_id", "is", null);

    const { data: pins, error } = await supabase
      .from("pins")
      .select("id, pinterest_pin_id")
      .eq("user_id", userId)
      .not("pinterest_pin_id", "is", null)
      .order("updated_at", { ascending: true }) // least-recently-synced first
      .limit(SYNC_BATCH_SIZE);
    if (error) throw new Error(error.message);

    let updated = 0;
    for (const p of pins ?? []) {
      let stats = await getPinAnalytics(accessToken, p.pinterest_pin_id as string);
      if (stats.impressions === 0 && stats.pinClicks === 0) {
        // Could be a genuine zero or a swallowed 429 — a short backoff and
        // one retry disambiguates without risking another burst.
        await sleep(1500);
        stats = await getPinAnalytics(accessToken, p.pinterest_pin_id as string);
      }
      const { error: updErr } = await supabase
        .from("pins")
        .update({ impressions: stats.impressions, clicks: stats.pinClicks })
        .eq("id", p.id);
      if (!updErr) updated++;
      await sleep(SYNC_DELAY_MS);
    }

    return { updated, remaining: Math.max((totalCount ?? 0) - updated, 0) };
  });

// -------------------------------------------------------------
// Real Pinterest traffic analytics for the Analytics page. Every number here
// comes straight from Pinterest (account totals + Impressions/Pin clicks/
// Outbound clicks/Saves/Engagement) or from our own `pins`/`storefront_products`
// tables (which products are actually attached). There is no orders/sales/
// commission data anywhere in Pinterest's API — the Analytics page zeroes
// that out itself rather than this endpoint faking it.
//
// Per-pin numbers come from our own `pins.impressions`/`pins.clicks` columns
// (kept fresh by syncPinterestAnalytics, see above) rather than a live call
// per pin — Pinterest's per-pin analytics endpoint rate-limits hard, so
// fetching every pin live on every page load isn't viable. The one live call
// here (getTopPinsAnalytics) is a single request that overlays fresher
// numbers for whichever pins Pinterest currently considers "trending".
// -------------------------------------------------------------

const ANALYTICS_RANGES = ["7d", "30d", "90d", "12mo"] as const;
// Pinterest's analytics endpoints reject any start_date older than 90 days,
// so "12mo" just requests the max allowed window under the hood.
const ANALYTICS_RANGE_DAYS: Record<(typeof ANALYTICS_RANGES)[number], number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
  "12mo": 90,
};

export const getPinterestAnalytics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { range: "7d" | "30d" | "90d" | "12mo" }) =>
    z.object({ range: z.enum(ANALYTICS_RANGES) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const accessToken = await getValidPinterestToken(userId);

    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - ANALYTICS_RANGE_DAYS[data.range] * 86400000);

    const [account, overview, topPins, { data: ourPins }] = await Promise.all([
      getUserAccount(accessToken),
      getAccountAnalytics(accessToken, { startDate, endDate }),
      getTopPinsAnalytics(accessToken, { startDate, endDate }),
      supabase
        .from("pins")
        .select("id, title, image_url, product_id, pinterest_pin_id, impressions, clicks")
        .eq("user_id", userId)
        .eq("status", "live") // only live pins (real product attached, Go Live hit) belong in pin analytics
        .not("pinterest_pin_id", "is", null),
    ]);
    const topByPinterestId = new Map(topPins.map((p) => [p.pinId, p]));

    const productIds = (ourPins ?? []).map((p) => p.product_id).filter((id): id is string => !!id);
    const { data: attachedProducts } = productIds.length
      ? await supabase
          .from("storefront_products")
          .select("id, title, image_url, affiliate_url")
          .in("id", productIds)
      : { data: [] as { id: string; title: string; image_url: string | null; affiliate_url: string }[] };
    const productById = new Map((attachedProducts ?? []).map((p) => [p.id, p]));

    const pins = (ourPins ?? []).map((p) => {
      // Prefer Pinterest's live "top pins" number when this pin is trending
      // right now; otherwise fall back to our last synced snapshot.
      const top = topByPinterestId.get(p.pinterest_pin_id as string);
      const product = p.product_id ? (productById.get(p.product_id) ?? null) : null;
      return {
        id: p.id,
        title: p.title,
        imageUrl: p.image_url,
        impressions: top?.impressions ?? p.impressions ?? 0,
        clicks: top?.pinClicks ?? p.clicks ?? 0,
        product,
      };
    });

    return { account, overview, pins };
  });

// -------------------------------------------------------------
// Visual search: real reverse-image product search (search-by-image API).
// Given a pin's image, finds actual shoppable listings that visually match
// it — real title/link/thumbnail/price from real retailers, not an LLM guess.
// -------------------------------------------------------------

export type VisualMatch = {
  title: string;
  link: string;
  source: string;
  thumbnail: string | null;
  price: { value: string; extractedValue: number; currency: string } | null;
};

async function searchByImage(imageUrl: string): Promise<VisualMatch[]> {
  const apiKey = requireEnv("VISUAL_SEARCH_API_KEY");
  const apiUrl = process.env.VISUAL_SEARCH_API_URL || "https://ekvisualsearch.lovable.app/api/public/v1/search-by-image";

  const imgRes = await fetch(imageUrl);
  if (!imgRes.ok) {
    throw new Error(`Couldn't fetch the pin image to search (${imgRes.status})`);
  }
  const imgBlob = await imgRes.blob();

  const form = new FormData();
  form.append("image", imgBlob, "pin.jpg");
  form.append("filter", "partners");

  const res = await fetch(apiUrl, {
    method: "POST",
    headers: { "x-api-key": apiKey },
    body: form,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    // The API returns a 500 with this specific message when the reverse-image
    // search genuinely found nothing (not a real failure) — treat it as zero
    // matches rather than an error.
    if (/hasn'?t returned any results/i.test(text)) return [];
    throw new Error(`Visual search failed (${res.status}): ${text.slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    visual_matches?: Array<{
      position?: number;
      title?: string;
      link?: string;
      source?: string;
      thumbnail?: string;
      price?: { value?: string; extracted_value?: number; currency?: string };
    }>;
  };

  const matches = (data.visual_matches ?? [])
    .filter((m) => m.title && m.link)
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .map((m) => ({
      title: m.title!,
      link: m.link!,
      source: m.source ?? "Store",
      thumbnail: m.thumbnail ?? null,
      price:
        m.price?.value && m.price.extracted_value != null && m.price.currency
          ? {
              value: m.price.value,
              extractedValue: m.price.extracted_value,
              currency: m.price.currency,
            }
          : null,
    }));

  // De-duplicate by link in case the same listing shows up twice.
  const seen = new Set<string>();
  return matches.filter((m) => {
    if (seen.has(m.link)) return false;
    seen.add(m.link);
    return true;
  });
}

export const visualSearchPin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { pinId: string }) => z.object({ pinId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const { data: pin, error } = await supabase
      .from("pins")
      .select("id,title,description,image_url")
      .eq("id", data.pinId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!pin) throw new Error("Pin not found");
    if (!pin.image_url) return { suggestions: [] };

    try {
      return { suggestions: await searchByImage(pin.image_url) };
    } catch (e) {
      console.error("[visualSearchPin] failed", e);
      return { suggestions: [] };
    }
  });

// Same visual search but takes a raw image URL — used by the Create-pin
// wizard where no pin row exists yet.
export const visualSearchImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { imageUrl: string; title?: string; description?: string }) =>
    z
      .object({
        imageUrl: z.string().url(),
        title: z.string().optional().default(""),
        description: z.string().optional().default(""),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    try {
      return { suggestions: await searchByImage(data.imageUrl) };
    } catch (e) {
      console.error("[visualSearchImage] failed", e);
      return { suggestions: [] };
    }
  });

// -------------------------------------------------------------
// Go Live — the one real "attach product(s) and publish" mechanism. Creates
// a fresh collection for the pin, attaches the given product(s) into it,
// and marks the pin live with a real external_url pointing at that
// collection on the creator's public storefront. Shared by the single-pin
// preview flow (pins_.preview.tsx) and board-level bulk monetization below
// — one real code path, not two divergent ones.
// -------------------------------------------------------------

async function performGoLive(
  supabase: any,
  userId: string,
  origin: string,
  pin: { id: string; title: string; image_url: string | null },
  storefront: { id: string; slug: string },
  position: number,
  existingProductIds: string[],
  newProducts: Array<{ title: string; affiliateUrl: string; imageUrl: string | null }>,
): Promise<{ externalUrl: string; collectionId: string; productId: string | null }> {
  if (existingProductIds.length === 0 && newProducts.length === 0) {
    throw new Error("Attach at least one product before going live.");
  }

  const name = (pin.title?.trim() || "Pin collection").slice(0, 60);
  const slug = `${slugify(name) || "collection"}-${Math.random().toString(36).slice(2, 6)}`;
  const { data: created, error: cErr } = await supabase
    .from("collections")
    .insert({
      user_id: userId,
      storefront_id: storefront.id,
      name,
      slug,
      source: "manual",
      position,
    })
    .select("id,slug")
    .single();
  if (cErr) throw new Error(cErr.message);
  const collectionId = created.id as string;
  const collectionSlug = created.slug as string;

  // Insert new (e.g. visual-search-matched) products into this collection,
  // reusing an existing row with the same affiliate URL if one exists.
  let newInsertedIds: string[] = [];
  if (newProducts.length > 0) {
    const urls = newProducts.map((p) => p.affiliateUrl);
    const { data: existingRows } = await supabase
      .from("storefront_products")
      .select("id, affiliate_url")
      .eq("storefront_id", storefront.id)
      .in("affiliate_url", urls);
    const existingByUrl = new Map(
      (existingRows ?? []).map((r: any) => [r.affiliate_url as string, r.id as string]),
    );
    const toInsert = newProducts
      .filter((p) => !existingByUrl.has(p.affiliateUrl))
      .map((p) => ({
        user_id: userId,
        storefront_id: storefront.id,
        collection_id: collectionId,
        title: p.title,
        affiliate_url: p.affiliateUrl,
        image_url: p.imageUrl ?? pin.image_url,
      }));
    if (toInsert.length > 0) {
      const { data: inserted, error: insErr } = await supabase
        .from("storefront_products")
        .insert(toInsert)
        .select("id");
      if (insErr) throw new Error(insErr.message);
      newInsertedIds = (inserted ?? []).map((r: any) => r.id as string);
    }
    newInsertedIds = [...newInsertedIds, ...Array.from(existingByUrl.values() as Iterable<string>)];
  }

  // Move any explicitly-selected existing products into this collection too.
  if (existingProductIds.length > 0) {
    const { error: mvErr } = await supabase
      .from("storefront_products")
      .update({ collection_id: collectionId })
      .in("id", existingProductIds);
    if (mvErr) throw new Error(mvErr.message);
  }

  const externalUrl = `${origin}/s/${storefront.slug}#${collectionSlug}`;
  const productId = existingProductIds[0] ?? newInsertedIds[0] ?? null;

  const { error: pinErr } = await supabase
    .from("pins")
    .update({ status: "live", collection_id: collectionId, product_id: productId, external_url: externalUrl })
    .eq("id", pin.id);
  if (pinErr) throw new Error(pinErr.message);

  return { externalUrl, collectionId, productId };
}

export const goLivePin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      pinId: string;
      origin: string;
      existingProductIds?: string[];
      newProducts?: Array<{ title: string; affiliateUrl: string; imageUrl: string | null }>;
    }) =>
      z
        .object({
          pinId: z.string().uuid(),
          origin: z.string().url(),
          existingProductIds: z.array(z.string().uuid()).optional().default([]),
          newProducts: z
            .array(
              z.object({
                title: z.string(),
                affiliateUrl: z.string().url(),
                imageUrl: z.string().url().nullable(),
              }),
            )
            .optional()
            .default([]),
        })
        .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: pin, error: pinErr } = await supabase
      .from("pins")
      .select("id,title,image_url,storefront_id")
      .eq("id", data.pinId)
      .maybeSingle();
    if (pinErr) throw new Error(pinErr.message);
    if (!pin) throw new Error("Pin not found");
    if (!pin.storefront_id) throw new Error("Pin has no storefront");

    const { data: storefront, error: sfErr } = await supabase
      .from("storefronts")
      .select("id,slug")
      .eq("id", pin.storefront_id)
      .maybeSingle();
    if (sfErr) throw new Error(sfErr.message);
    if (!storefront) throw new Error("Storefront not found");

    const { count: collCount } = await supabase
      .from("collections")
      .select("*", { count: "exact", head: true })
      .eq("storefront_id", storefront.id);

    return performGoLive(
      supabase,
      userId,
      data.origin,
      pin,
      storefront,
      collCount ?? 0,
      data.existingProductIds,
      data.newProducts,
    );
  });

// -------------------------------------------------------------
// Board-level bulk monetization: find every un-monetized pin in a board
// (a synced Pinterest board = a `collections` row), run each through the
// same real visual-search pipeline, and let the swipe UI approve/reject
// them — approvals go through the exact same performGoLive() path as the
// single-pin flow above, just looped.
// -------------------------------------------------------------

export type BoardCandidate = {
  pinId: string;
  title: string;
  imageUrl: string | null;
};

export const getBoardMonetizationCandidates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { collectionId: string }) =>
    z.object({ collectionId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: collection, error: cErr } = await supabase
      .from("collections")
      .select("id,name,storefront_id")
      .eq("id", data.collectionId)
      .eq("user_id", userId)
      .maybeSingle();
    if (cErr) throw new Error(cErr.message);
    if (!collection) throw new Error("Board not found");

    // Deliberately no visual search here — that's the slow part (an
    // external API call per pin). Return the pin list instantly; the swipe
    // UI fetches each pin's recommendation on demand (current + next few),
    // so the user starts swiping in ~1 request instead of waiting on all of
    // them up front.
    const { data: pins, error: pErr } = await supabase
      .from("pins")
      .select("id,title,image_url")
      .eq("collection_id", data.collectionId)
      .is("product_id", null)
      .order("created_at", { ascending: false });
    if (pErr) throw new Error(pErr.message);

    const candidates: BoardCandidate[] = (pins ?? []).map((p) => ({
      pinId: p.id,
      title: p.title,
      imageUrl: p.image_url,
    }));

    return { boardName: collection.name, candidates };
  });

export const getPinRecommendation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { pinId: string }) => z.object({ pinId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    // RLS scopes this to the caller's own pin (see "pins owner all" policy) —
    // no explicit user_id check needed, matching goLivePin's lookup above.
    const { data: pin, error } = await supabase
      .from("pins")
      .select("id,image_url")
      .eq("id", data.pinId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!pin) throw new Error("Pin not found");
    if (!pin.image_url) return { recommendation: null as VisualMatch | null };
    // Let real failures (bad API key, network error, non-"no results" 500s)
    // throw and surface to the client as a retryable error — searchByImage
    // already collapses a genuine "no results" response into `[]`, so a
    // clean `null` here always means "confirmed no match", never "broke".
    const matches = await searchByImage(pin.image_url);
    return { recommendation: (matches[0] ?? null) as VisualMatch | null };
  });

export const approveBoardPins = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      origin: string;
      approvals: Array<{
        pinId: string;
        products: Array<{ title: string; affiliateUrl: string; imageUrl: string | null }>;
      }>;
    }) =>
      z
        .object({
          origin: z.string().url(),
          approvals: z
            .array(
              z.object({
                pinId: z.string().uuid(),
                products: z
                  .array(
                    z.object({
                      title: z.string(),
                      affiliateUrl: z.string().url(),
                      imageUrl: z.string().url().nullable(),
                    }),
                  )
                  .min(1),
              }),
            )
            .min(1),
        })
        .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const pinIds = data.approvals.map((a) => a.pinId);
    const { data: pinRows, error: pErr } = await supabase
      .from("pins")
      .select("id,title,image_url,storefront_id")
      .in("id", pinIds);
    if (pErr) throw new Error(pErr.message);
    const pinById = new Map((pinRows ?? []).map((p: any) => [p.id as string, p]));

    const storefrontId = (pinRows ?? [])[0]?.storefront_id as string | undefined;
    if (!storefrontId) throw new Error("No storefront found for these pins");
    const { data: storefront, error: sfErr } = await supabase
      .from("storefronts")
      .select("id,slug")
      .eq("id", storefrontId)
      .maybeSingle();
    if (sfErr) throw new Error(sfErr.message);
    if (!storefront) throw new Error("Storefront not found");

    const { count: collCount } = await supabase
      .from("collections")
      .select("*", { count: "exact", head: true })
      .eq("storefront_id", storefront.id);
    let nextPosition = collCount ?? 0;

    let approved = 0;
    const failed: string[] = [];
    for (const a of data.approvals) {
      const pin = pinById.get(a.pinId);
      if (!pin) {
        failed.push(`${a.pinId}: pin not found`);
        continue;
      }
      try {
        await performGoLive(
          supabase,
          userId,
          data.origin,
          pin,
          storefront,
          nextPosition++,
          [],
          a.products,
        );
        approved++;
      } catch (e) {
        failed.push(`${pin.title || a.pinId}: ${e instanceof Error ? e.message : e}`);
      }
    }

    return { approved, failed };
  });

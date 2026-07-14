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
} from "@/lib/pinterest-api";
import { getValidPinterestToken } from "@/lib/pinterest-oauth.functions";

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
          // No product attached yet at import time — stays a draft until the
          // user attaches one, matching the manual create-pin flow's rule.
          status: "draft",
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
// -------------------------------------------------------------

export const syncPinterestAnalytics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const accessToken = await getValidPinterestToken(userId);

    const { data: pins, error } = await supabase
      .from("pins")
      .select("id, pinterest_pin_id")
      .eq("user_id", userId)
      .not("pinterest_pin_id", "is", null);
    if (error) throw new Error(error.message);

    let updated = 0;
    for (const p of pins ?? []) {
      const stats = await getPinAnalytics(accessToken, p.pinterest_pin_id as string);
      const { error: updErr } = await supabase
        .from("pins")
        .update({ impressions: stats.impressions, clicks: stats.clicks })
        .eq("id", p.id);
      if (!updErr) updated++;
    }

    return { updated };
  });

// -------------------------------------------------------------
// Real Pinterest traffic analytics for the Analytics page. Everything here
// is genuine Pinterest data (account totals + account/pin-level Impressions,
// Pin clicks, Outbound clicks, Saves, Engagement) — there is no orders/sales/
// commission data anywhere in Pinterest's API, so that's handled separately
// on the client as an explicit zero state, not faked here.
// -------------------------------------------------------------

const ANALYTICS_RANGES = ["7d", "30d", "90d"] as const;
// Pinterest's analytics endpoints reject any start_date older than 90 days.
const ANALYTICS_RANGE_DAYS: Record<(typeof ANALYTICS_RANGES)[number], number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

export const getPinterestAnalytics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { range: "7d" | "30d" | "90d" }) =>
    z.object({ range: z.enum(ANALYTICS_RANGES) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const accessToken = await getValidPinterestToken(userId);

    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - ANALYTICS_RANGE_DAYS[data.range] * 86400000);

    const [account, overview, topPins] = await Promise.all([
      getUserAccount(accessToken),
      getAccountAnalytics(accessToken, { startDate, endDate }),
      getTopPinsAnalytics(accessToken, { startDate, endDate, limit: 25 }),
    ]);

    // Join Pinterest's pin ids back to our own synced pin rows for title/image —
    // only show pins we actually have a local record of.
    const pinterestPinIds = topPins.map((p) => p.pinId);
    const { data: ourPins } = pinterestPinIds.length
      ? await supabase
          .from("pins")
          .select("id, title, image_url, pinterest_pin_id")
          .in("pinterest_pin_id", pinterestPinIds)
      : { data: [] as { id: string; title: string; image_url: string | null; pinterest_pin_id: string | null }[] };
    const byPinterestId = new Map((ourPins ?? []).map((p) => [p.pinterest_pin_id, p]));

    const pins = topPins
      .map((tp) => {
        const local = byPinterestId.get(tp.pinId);
        if (!local) return null;
        return {
          id: local.id,
          title: local.title,
          imageUrl: local.image_url,
          impressions: tp.impressions,
          pinClicks: tp.pinClicks,
          outboundClicks: tp.outboundClicks,
          saves: tp.saves,
          engagement: tp.engagement,
        };
      })
      .filter((p): p is NonNullable<typeof p> => p !== null);

    return { account, overview, pins };
  });

// -------------------------------------------------------------
// Visual search: given a pin image, suggest product ideas.
// Uses Lovable AI Gateway (Gemini) when LOVABLE_API_KEY is set;
// falls back to heuristic suggestions based on the pin title.
// -------------------------------------------------------------

const suggestionsSchema = z.object({
  suggestions: z.array(
    z.object({
      title: z.string(),
      query: z.string(),
      reason: z.string().optional(),
    }),
  ),
});

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

    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) {
      return { suggestions: fallbackSuggestions(pin.title) };
    }

    try {
      const systemPrompt = [
        "You are a meticulous visual product-detection engine for a Pinterest affiliate creator.",
        "Your job: examine the pin image exhaustively and enumerate EVERY distinct, buyable object you can see — foreground and background, worn and held, decor and utility.",
        "",
        "Detection rules — do not miss anything:",
        "- Scan the whole frame in a grid (top-left → bottom-right). Include partially visible or small items.",
        "- List each item separately. Do not merge (e.g. 'shirt + pants' → two entries).",
        "- Cover these categories when present: apparel (top, bottom, outerwear, dress), footwear, headwear, bags, jewelry, watches, eyewear, hair accessories, makeup/skincare packaging, furniture, lighting, rugs, curtains, wall art, plants/planters, kitchenware, appliances, tableware, bedding, textiles, electronics, books, stationery, food/drink props, toys, tools, sports gear, vehicles/parts.",
        "- Include distinguishing attributes in the title: color, material, pattern, style, era (e.g. 'cream cable-knit wool turtleneck sweater', 'brass arc floor lamp with marble base').",
        "- If the same category repeats (e.g. two cushions of different colors), list each variant separately.",
        "- Only skip an item if it is genuinely unidentifiable or not purchasable (e.g. a person, the sky).",
        "",
        "For each detected item output an object with:",
        "  title  — concrete product name a shopper would recognize, with key attributes.",
        "  query  — short Amazon-style search phrase (3–7 words) that would surface it.",
        "  reason — 1 short sentence naming exactly WHERE in the image it appears (e.g. 'the vase on the left nightstand').",
        "",
        "Return JSON ONLY, no prose, matching:",
        '{"suggestions":[{"title":"...","query":"...","reason":"..."}, ...]}',
        "Include as many items as you truly see — do not artificially cap the list. If nothing is buyable, return an empty array.",
      ].join("\n");

      const userText = [
        `Pin title: ${pin.title}`,
        `Description: ${pin.description ?? ""}`,
        "Detect every buyable item in the image. Be exhaustive.",
      ].join("\n");

      const messages: Array<{
        role: "system" | "user";
        content:
          | string
          | Array<
              { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }
            >;
      }> = [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            { type: "text", text: userText },
            ...(pin.image_url
              ? ([{ type: "image_url", image_url: { url: pin.image_url } }] as const)
              : []),
          ],
        },
      ];

      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          // Pro model = stronger vision + more thorough enumeration
          model: "google/gemini-2.5-pro",
          messages,
          response_format: { type: "json_object" },
          temperature: 0.2,
        }),
      });

      if (!res.ok) {
        console.error("[visualSearch] gateway error", res.status, await res.text());
        return { suggestions: fallbackSuggestions(pin.title) };
      }
      const body = await res.json();
      const raw = body?.choices?.[0]?.message?.content ?? "{}";
      const parsed = suggestionsSchema.safeParse(typeof raw === "string" ? JSON.parse(raw) : raw);
      if (!parsed.success || parsed.data.suggestions.length === 0) {
        return { suggestions: fallbackSuggestions(pin.title) };
      }
      // De-duplicate by lowercased query so the model doesn't repeat itself.
      const seen = new Set<string>();
      const deduped = parsed.data.suggestions.filter((s) => {
        const key = s.query.trim().toLowerCase();
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      return { suggestions: deduped };
    } catch (e) {
      console.error("[visualSearch] failed", e);
      return { suggestions: fallbackSuggestions(pin.title) };
    }
  });

// Same AI call but takes raw image + title/description — used by the
// Create-pin wizard where no pin row exists yet.
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
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) return { suggestions: fallbackSuggestions(data.title) };

    try {
      const systemPrompt = [
        "You are a meticulous visual product-detection engine for a Pinterest affiliate creator.",
        "Examine the image and enumerate EVERY distinct, buyable object you can see.",
        "For each item output: title (concrete product name w/ key attributes), query (3–7 word Amazon-style search), reason (short sentence naming where it appears).",
        'Return JSON ONLY matching: {"suggestions":[{"title":"...","query":"...","reason":"..."}, ...]}',
      ].join("\n");

      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: "google/gemini-2.5-pro",
          messages: [
            { role: "system", content: systemPrompt },
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: `Pin title: ${data.title}\nDescription: ${data.description}\nDetect every buyable item.`,
                },
                { type: "image_url", image_url: { url: data.imageUrl } },
              ],
            },
          ],
          response_format: { type: "json_object" },
          temperature: 0.2,
        }),
      });
      if (!res.ok) return { suggestions: fallbackSuggestions(data.title) };
      const body = await res.json();
      const raw = body?.choices?.[0]?.message?.content ?? "{}";
      const parsed = suggestionsSchema.safeParse(typeof raw === "string" ? JSON.parse(raw) : raw);
      if (!parsed.success || parsed.data.suggestions.length === 0) {
        return { suggestions: fallbackSuggestions(data.title) };
      }
      const seen = new Set<string>();
      const deduped = parsed.data.suggestions.filter((s) => {
        const k = s.query.trim().toLowerCase();
        if (!k || seen.has(k)) return false;
        seen.add(k);
        return true;
      });
      return { suggestions: deduped };
    } catch {
      return { suggestions: fallbackSuggestions(data.title) };
    }
  });

function fallbackSuggestions(title: string) {
  const t = title.toLowerCase();
  const base = [
    { key: "coffee", items: ["Espresso machine", "Ceramic mug set", "Burr grinder"] },
    { key: "kitchen", items: ["Chef knife", "Cast iron skillet", "Wooden cutting board"] },
    { key: "skincare", items: ["Vitamin C serum", "SPF 50 sunscreen", "Ceramide moisturizer"] },
    { key: "denim", items: ["Levi's denim jacket", "Straight-leg jeans", "White sneakers"] },
    { key: "travel", items: ["Carry-on backpack", "Packing cubes", "Travel adapter"] },
    { key: "desk", items: ["4K monitor", "Ergonomic chair", "Desk mat"] },
  ];
  const match = base.find((b) => t.includes(b.key)) ?? {
    key: "picks",
    items: ["Best-seller pick", "Editor's choice", "Budget favorite"],
  };
  return match.items.map((name) => ({
    title: name,
    query: name,
    reason: "Matches the pin's theme.",
  }));
}

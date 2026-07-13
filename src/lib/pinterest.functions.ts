import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

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

// Deterministic mock "Pinterest boards" per handle so the demo feels real.
const BOARD_TEMPLATES: {
  name: string;
  description: string;
  color: string;
  pins: { title: string; description: string }[];
}[] = [
  {
    name: "Home & Kitchen",
    description: "Cozy home upgrades and kitchen essentials.",
    color: "#F97316",
    pins: [
      { title: "Coffee bar refresh", description: "My favorite mugs, grinder and beans." },
      { title: "Minimalist kitchen tools", description: "10 tools I actually use every week." },
      { title: "Cozy lighting picks", description: "Warm bulbs, floor lamps, dimmers." },
      { title: "Under-₹4,000 upgrades", description: "Small swaps, big vibe shift." },
    ],
  },
  {
    name: "Style & Outfits",
    description: "Capsule outfits and everyday style.",
    color: "#EC4899",
    pins: [
      { title: "Autumn capsule wardrobe", description: "12 pieces, 30 outfits." },
      { title: "Denim jacket, 3 ways", description: "Casual → smart → evening." },
      { title: "Everyday sneakers", description: "The pairs I keep re-buying." },
      { title: "Sunset street style", description: "Golden hour outfit inspo." },
    ],
  },
  {
    name: "Beauty & Skincare",
    description: "Routines and products that actually work.",
    color: "#8B5CF6",
    pins: [
      { title: "5-minute morning routine", description: "Cleanser, serum, SPF." },
      { title: "Barrier-repair basics", description: "Ceramides, niacinamide, patience." },
      { title: "Travel skincare kit", description: "Under 100ml, works anywhere." },
    ],
  },
  {
    name: "Travel",
    description: "Packing lists and destination guides.",
    color: "#06B6D4",
    pins: [
      { title: "Minimalist packing", description: "A week in one carry-on." },
      { title: "Best travel bag", description: "Tested across 12 trips." },
      { title: "In-flight essentials", description: "The kit that saves long-hauls." },
    ],
  },
];

const PLACEHOLDER_IMAGES = [
  "https://images.unsplash.com/photo-1522152168539-3e17b1f851f8?auto=format&fit=crop&w=800&q=60",
  "https://images.unsplash.com/photo-1503602642458-232111445657?auto=format&fit=crop&w=800&q=60",
  "https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?auto=format&fit=crop&w=800&q=60",
  "https://images.unsplash.com/photo-1490481651871-ab68de25d43d?auto=format&fit=crop&w=800&q=60",
  "https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=800&q=60",
  "https://images.unsplash.com/photo-1520975916090-3105956dac38?auto=format&fit=crop&w=800&q=60",
  "https://images.unsplash.com/photo-1493770348161-369560ae357d?auto=format&fit=crop&w=800&q=60",
  "https://images.unsplash.com/photo-1512436991641-6745cdb1723f?auto=format&fit=crop&w=800&q=60",
  "https://images.unsplash.com/photo-1523381210434-271e8be1f52b?auto=format&fit=crop&w=800&q=60",
  "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=800&q=60",
  "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=800&q=60",
  "https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=800&q=60",
];

// -------------------------------------------------------------
// Import Pinterest boards → Collections + Pins into the single storefront
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

    let boardsCreated = 0;
    let pinsCreated = 0;

    for (const [bIdx, tpl] of BOARD_TEMPLATES.entries()) {
      const slug = slugify(tpl.name);

      // Skip if already imported (unique per storefront_id+slug)
      const { data: existing } = await supabase
        .from("collections")
        .select("id")
        .eq("storefront_id", storefront.id)
        .eq("slug", slug)
        .maybeSingle();
      if (existing) continue;

      const { data: coll, error: cErr } = await supabase
        .from("collections")
        .insert({
          user_id: userId,
          storefront_id: storefront.id,
          name: tpl.name,
          slug,
          description: tpl.description,
          cover_color: tpl.color,
          source: "pinterest",
          position: bIdx,
        })
        .select("id")
        .single();
      if (cErr) throw new Error(cErr.message);
      boardsCreated++;

      const pinRows = tpl.pins.map((p, i) => ({
        user_id: userId,
        storefront_id: storefront.id,
        collection_id: coll.id,
        title: p.title,
        description: p.description,
        image_url: PLACEHOLDER_IMAGES[(bIdx * 4 + i) % PLACEHOLDER_IMAGES.length],
        source: "pinterest",
        status: "live",
        impressions: Math.floor(500 + Math.random() * 8000),
        clicks: Math.floor(20 + Math.random() * 800),
      }));

      const { error: pErr } = await supabase.from("pins").insert(pinRows);
      if (pErr) throw new Error(pErr.message);
      pinsCreated += pinRows.length;
    }

    return { boardsCreated, pinsCreated };
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
  .inputValidator((d: { pinId: string }) =>
    z.object({ pinId: z.string().uuid() }).parse(d),
  )
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
              | { type: "text"; text: string }
              | { type: "image_url"; image_url: { url: string } }
            >;
      }> = [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            { type: "text", text: userText },
            ...(pin.image_url
              ? ([
                  { type: "image_url", image_url: { url: pin.image_url } },
                ] as const)
              : []),
          ],
        },
      ];

      const res = await fetch(
        "https://ai.gateway.lovable.dev/v1/chat/completions",
        {
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
        },
      );

      if (!res.ok) {
        console.error("[visualSearch] gateway error", res.status, await res.text());
        return { suggestions: fallbackSuggestions(pin.title) };
      }
      const body = await res.json();
      const raw = body?.choices?.[0]?.message?.content ?? "{}";
      const parsed = suggestionsSchema.safeParse(
        typeof raw === "string" ? JSON.parse(raw) : raw,
      );
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
      const parsed = suggestionsSchema.safeParse(
        typeof raw === "string" ? JSON.parse(raw) : raw,
      );
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
  const match =
    base.find((b) => t.includes(b.key)) ??
    { key: "picks", items: ["Best-seller pick", "Editor's choice", "Budget favorite"] };
  return match.items.map((name) => ({
    title: name,
    query: name,
    reason: "Matches the pin's theme.",
  }));
}

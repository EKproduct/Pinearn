// Pin SEO suggestion pipeline — pure prompt construction + output validation.
// No network, no Supabase: everything here is deterministic and synchronous
// (mirroring health-score.ts) so it can be unit-tested and reused verbatim by
// both the single-pin and batch server functions. The Gemini call itself lives
// in gemini.server.ts; the Supabase queries in pin-seo.functions.ts.

import {
  PIN_TITLE_MIN,
  PIN_TITLE_MAX,
  PIN_DESC_MIN,
  PIN_DESC_MAX,
  isPlaceholderText,
} from "@/lib/health-score";

/* ---------------- Framing angles ---------------- */

// Rotated across a batch (and across regenerations of the same pin) so a
// board of suggestions doesn't read like one template with nouns swapped.
export const SEO_ANGLES = [
  "use-case-led",
  "aesthetic-led",
  "question-led",
  "detail-led",
  "comparison-led",
] as const;

export type SeoAngle = (typeof SEO_ANGLES)[number];

const ANGLE_INSTRUCTIONS: Record<SeoAngle, string> = {
  "use-case-led":
    "Lead with the concrete situation or occasion where this product shines (e.g. small-space living, festive gifting, daily commute). The title should name the use case, and the description should walk the reader into that scenario.",
  "aesthetic-led":
    "Lead with the visual style and mood of the image (colors, textures, setting). Anchor the copy in the aesthetic a Pinterest user would search for (e.g. minimalist, boho, cottagecore) — but only styles genuinely visible in the image.",
  "question-led":
    "Open the description with a natural question a shopper would actually type or think (e.g. 'Looking for a rug that survives muddy paws?'). The title stays declarative; only the description uses the question hook.",
  "detail-led":
    "Lead with the most distinctive concrete attribute — material, finish, dimension, craft technique. Be specific and sensory; the details are the hook.",
  "comparison-led":
    "Frame the product against the obvious alternative a shopper is weighing (e.g. 'warmer than a throw blanket, lighter than a duvet'). Never disparage other products by name; compare categories, not brands.",
};

/** Deterministic angle for a pin: cycles through all five as `salt` increases
 * (batch index, or the pin's prior-suggestion count so regenerating after a
 * rejection naturally tries the next framing). */
export function pickAngle(pinId: string, salt: number): SeoAngle {
  let h = 0;
  for (let i = 0; i < pinId.length; i++) h = (h * 31 + pinId.charCodeAt(i)) >>> 0;
  return SEO_ANGLES[(h + salt) % SEO_ANGLES.length];
}

/* ---------------- Context shape ---------------- */

export type SuggestionProduct = {
  name: string;
  // The schema has no product-category column; callers pass the board name as
  // the closest category signal, or null. Kept as its own field so a real
  // category (or Pinterest Trends data) can slot in without a shape change.
  category: string | null;
  // Pre-formatted for the prompt, e.g. "₹1,299" / "$24.99" — null if unpriced.
  priceLabel: string | null;
};

/** Everything generatePinSuggestion() needs. Future signal sources (e.g.
 * Pinterest Trends keywords) are added as one more optional field here —
 * the Gemini call site never changes. */
export type PinSuggestionContext = {
  pin: {
    id: string;
    title: string;
    description: string;
    imageUrl: string | null;
  };
  board: { id: string; name: string } | null;
  siblingPinTitles: string[];
  /** Creator's niche, from their storefront name + description. */
  niche: string | null;
  product: SuggestionProduct | null;
  /** Previously rejected suggestions for this pin — phrasings to avoid. */
  rejectedSuggestions: Array<{ title: string; description: string }>;
  angle: SeoAngle;
  /** Reserved for the future signals module (Pinterest Trends etc.). */
  trendKeywords?: string[];
};

/* ---------------- Primary keyword ---------------- */

/** The keyword the title must contain verbatim. Tagged product name wins;
 * otherwise whatever real title the pin has; otherwise the board name. Long
 * product names are trimmed to their first few significant words so "verbatim,
 * positioned early" stays achievable inside a 100-char title. */
export function primaryKeyword(context: {
  pin: { title: string };
  board: { name: string } | null;
  product: { name: string } | null;
}): string {
  const source =
    (context.product && !isPlaceholderText(context.product.name) && context.product.name) ||
    (!isPlaceholderText(context.pin.title) && context.pin.title) ||
    (context.board && !isPlaceholderText(context.board.name) && context.board.name) ||
    "trending finds";
  const words = source.replace(/\s+/g, " ").trim().split(" ");
  return words.slice(0, 4).join(" ");
}

/* ---------------- Prompt construction ---------------- */

// Padding phrases the heuristic fixer leans on (health-score.ts) plus the
// classic AI-listing clichés. Banned in the prompt AND checked post-hoc.
export const GENERIC_PHRASES = [
  "must-have",
  "must have",
  "perfect for any occasion",
  "look no further",
  "elevate your",
  "game-changer",
  "game changer",
  "you'll love",
  "shop now",
  "limited time",
  "best ever",
];

export function buildSuggestionPrompt(context: PinSuggestionContext): string {
  const keyword = primaryKeyword(context);
  const lines: string[] = [
    "You are a Pinterest SEO copywriter for a creator's affiliate storefront.",
    "Write a new title and description for the pin shown in the attached image.",
    "",
    "HARD RULES:",
    `- The title MUST contain the primary keyword "${keyword}" verbatim, positioned in the first half of the title.`,
    `- Title length: ${PIN_TITLE_MIN}-${PIN_TITLE_MAX} characters.`,
    `- Description length: ${PIN_DESC_MIN}-${PIN_DESC_MAX} characters.`,
    `- The description MUST repeat the primary keyword "${keyword}" exactly once, woven into a natural sentence.`,
    "- The description must read as natural language a person would write — flowing sentences, NOT a comma-separated keyword list.",
    "- Include 2-3 related long-tail phrases a real shopper would actually search for.",
    `- Never use generic filler phrases, including: ${GENERIC_PHRASES.map((p) => `"${p}"`).join(", ")}.`,
    "- No hashtags, no emoji, no ALL-CAPS words, no quotes around the output text.",
    "",
    `FRAMING ANGLE — ${context.angle}: ${ANGLE_INSTRUCTIONS[context.angle]}`,
  ];

  const ctx: string[] = [];
  if (context.pin.title && !isPlaceholderText(context.pin.title)) {
    ctx.push(`Current pin title: "${context.pin.title}"`);
  }
  if (context.pin.description && !isPlaceholderText(context.pin.description)) {
    ctx.push(`Current pin description: "${context.pin.description}"`);
  }
  if (context.product) {
    const bits = [
      `Tagged product: "${context.product.name}"`,
      context.product.category ? `category: ${context.product.category}` : null,
      context.product.priceLabel ? `price: ${context.product.priceLabel}` : null,
    ].filter(Boolean);
    ctx.push(bits.join(", "));
  }
  if (context.board) {
    ctx.push(
      `This pin lives on the board "${context.board.name}" — the copy must fit that board's theme, not just the product in isolation.`,
    );
  }
  if (context.siblingPinTitles.length > 0) {
    ctx.push(
      `Other pins on the same board (match their thematic register, do NOT copy their wording): ${context.siblingPinTitles
        .map((t) => `"${t}"`)
        .join("; ")}`,
    );
  }
  if (context.niche) {
    ctx.push(
      `Creator's niche/storefront: ${context.niche}. Reflect this niche in tone and phrasing.`,
    );
  }
  if (context.trendKeywords && context.trendKeywords.length > 0) {
    ctx.push(
      `Currently trending searches worth weaving in naturally: ${context.trendKeywords.join(", ")}`,
    );
  }
  if (ctx.length > 0) {
    lines.push("", "CONTEXT:", ...ctx.map((c) => `- ${c}`));
  }

  if (context.rejectedSuggestions.length > 0) {
    lines.push(
      "",
      "PREVIOUSLY REJECTED SUGGESTIONS — the creator turned these down. Do NOT repeat or lightly rephrase their wording; take a genuinely different angle:",
      ...context.rejectedSuggestions.map(
        (r, i) => `${i + 1}. Title: "${r.title}" / Description: "${r.description}"`,
      ),
    );
  }

  lines.push("", 'Respond with JSON only: { "title": "...", "description": "..." }');
  return lines.join("\n");
}

/** Appended to the prompt on the single validation-failure retry. */
export function retryFeedback(issues: string[]): string {
  return [
    "",
    `YOUR PREVIOUS OUTPUT WAS REJECTED for these reasons: ${issues.join("; ")}.`,
    "Be more specific and concrete this time. Count your characters carefully and satisfy every hard rule exactly.",
  ].join("\n");
}

/* ---------------- Output validation ---------------- */

export type SuggestionCandidate = { title: string; description: string };

/** Empty array = valid. Mirrors pinSeoIssues() bands so an approved
 * suggestion is guaranteed to pass the Boost health score. */
export function validateSuggestion(candidate: SuggestionCandidate, keyword: string): string[] {
  const issues: string[] = [];
  const title = (candidate.title ?? "").trim();
  const desc = (candidate.description ?? "").trim();

  if (title.length < PIN_TITLE_MIN)
    issues.push(`title too short (${title.length} chars, need ${PIN_TITLE_MIN}+)`);
  if (title.length > PIN_TITLE_MAX)
    issues.push(`title too long (${title.length} chars, max ${PIN_TITLE_MAX})`);
  if (desc.length < PIN_DESC_MIN)
    issues.push(`description too short (${desc.length} chars, need ${PIN_DESC_MIN}+)`);
  if (desc.length > PIN_DESC_MAX)
    issues.push(`description too long (${desc.length} chars, max ${PIN_DESC_MAX})`);
  if (isPlaceholderText(title)) issues.push("title is generic/placeholder text");

  const kw = keyword.toLowerCase();
  if (!title.toLowerCase().includes(kw))
    issues.push(`title is missing the primary keyword "${keyword}"`);
  if (!desc.toLowerCase().includes(kw))
    issues.push(`description is missing the primary keyword "${keyword}"`);

  const combined = `${title} ${desc}`.toLowerCase();
  for (const phrase of GENERIC_PHRASES) {
    if (combined.includes(phrase)) issues.push(`contains banned filler phrase "${phrase}"`);
  }

  return issues;
}

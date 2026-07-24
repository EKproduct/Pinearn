
import { requireEnv } from "@/lib/pinterest-api";
import { logNet } from "@/lib/net-logger";
import {
  buildSuggestionPrompt,
  retryFeedback,
  type PinSuggestionContext,
  type SuggestionCandidate,
} from "@/lib/pin-seo";

// Flash Lite: vision-capable, free tier. The pinned "gemini-2.5-flash-lite"
// returns 404 "no longer available to new users" for this project's key, so
// we use the alias that tracks the newest Lite release (currently 3.5).
// Override with GEMINI_MODEL (e.g. "gemini-3.5-flash-lite") to pin a version.
const DEFAULT_MODEL = "gemini-flash-lite-latest";
const API_BASE = "https://generativelanguage.googleapis.com/v1beta";

// 429 rate-limit backoff: exponential with full jitter. Free-tier Flash Lite
// quotas are per-minute, so waits climb fast enough (1s → 16s) to straddle a
// window reset before giving up.
const MAX_RATE_LIMIT_RETRIES = 4;
const BACKOFF_BASE_MS = 1_000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Prefer the server's own Retry-After when it sends one; otherwise
 * exponential (1s, 2s, 4s, 8s…) with full jitter to de-synchronize the
 * batch pipeline's concurrent callers. */
function backoffDelayMs(attempt: number, retryAfterHeader: string | null): number {
  const retryAfter = Number(retryAfterHeader);
  if (retryAfterHeader && Number.isFinite(retryAfter) && retryAfter > 0) {
    return retryAfter * 1_000;
  }
  return Math.random() * BACKOFF_BASE_MS * 2 ** attempt;
}

// Gemini caps inline request payloads at 20MB; skip the image (text-only
// prompt still works) rather than fail the whole suggestion on a huge upload.
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

type InlineImage = { mimeType: string; base64: string };

function bytesToBase64(bytes: Uint8Array): string {
  // Chunked btoa — String.fromCharCode(...allBytes) overflows the call stack
  // on multi-megabyte pin images.
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/** Fetch and base64-encode the pin image for inline upload. Returns null on
 * any failure — a missing image degrades the suggestion, it shouldn't kill it. */
async function fetchImageInline(imageUrl: string): Promise<InlineImage | null> {
  try {
    const res = await fetch(imageUrl, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return null;
    const mimeType = res.headers.get("content-type")?.split(";")[0]?.trim() || "image/jpeg";
    if (!mimeType.startsWith("image/")) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) return null;
    return { mimeType, base64: bytesToBase64(bytes) };
  } catch {
    return null;
  }
}

type GeminiResponse = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
  error?: { message?: string };
};

async function callGemini(prompt: string, image: InlineImage | null): Promise<SuggestionCandidate> {
  const apiKey = requireEnv("GEMINI_API_KEY");
  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;

  const parts: Array<Record<string, unknown>> = [];
  if (image) parts.push({ inline_data: { mime_type: image.mimeType, data: image.base64 } });
  parts.push({ text: prompt });

  const doFetch = () =>
    fetch(`${API_BASE}/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-goog-api-key": apiKey },
      signal: AbortSignal.timeout(60_000),
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
          // Forces valid JSON matching the schema — no markdown-fence stripping.
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              title: { type: "STRING" },
              description: { type: "STRING" },
            },
            required: ["title", "description"],
          },
          temperature: 0.8,
        },
      }),
    });

  let res = await doFetch();
  for (let attempt = 0; res.status === 429 && attempt < MAX_RATE_LIMIT_RETRIES; attempt++) {
    const delayMs = Math.round(backoffDelayMs(attempt, res.headers.get("retry-after")));
    logNet("gemini.rate_limited", {
      model,
      attempt: attempt + 1,
      maxAttempts: MAX_RATE_LIMIT_RETRIES,
      delayMs,
    });
    await sleep(delayMs);
    res = await doFetch();
  }

  const bodyText = await res.text();
  if (!res.ok) {
    let message = bodyText.slice(0, 500);
    try {
      const parsed = JSON.parse(bodyText) as GeminiResponse;
      if (parsed.error?.message) message = parsed.error.message;
    } catch {
      /* not JSON — keep raw text */
    }
    throw new Error(`Gemini API error (HTTP ${res.status}): ${message}`);
  }

  const data = JSON.parse(bodyText) as GeminiResponse;
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("");
  if (!text) {
    throw new Error(
      `Gemini returned no text (finishReason: ${data.candidates?.[0]?.finishReason ?? "unknown"})`,
    );
  }

  const parsed = JSON.parse(text) as SuggestionCandidate;
  if (typeof parsed.title !== "string" || typeof parsed.description !== "string") {
    throw new Error("Gemini returned JSON without title/description strings");
  }
  return { title: parsed.title.trim(), description: parsed.description.trim() };
}

/** Generate one title/description suggestion for a pin. `previousIssues` is
 * set on the single validation-failure retry — it appends the "your previous
 * output was rejected because…" feedback to the same prompt. */
export async function generatePinSuggestion(
  context: PinSuggestionContext,
  previousIssues?: string[],
): Promise<SuggestionCandidate> {
  let prompt = buildSuggestionPrompt(context);
  if (previousIssues && previousIssues.length > 0) prompt += retryFeedback(previousIssues);

  const image = context.pin.imageUrl ? await fetchImageInline(context.pin.imageUrl) : null;
  return callGemini(prompt, image);
}

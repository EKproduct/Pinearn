import { Check, Image as ImageIcon, Loader2 } from "lucide-react";
import { estimateCommissionPct } from "@/lib/brands";

export type SuggestionPrice = { value: string; extractedValue: number; currency: string } | null;

// Converts a stored product's real price (cents) into the same shape a
// visual-search match uses, so every product card in the app — real or
// AI-suggested — can render through this one component.
export function realProductPrice(priceCents: number | null | undefined): SuggestionPrice {
  if (priceCents == null) return null;
  const amount = priceCents / 100;
  return { value: `₹${amount.toLocaleString("en-IN")}`, extractedValue: amount, currency: "₹" };
}

// Real price has no separate "MRP" from the visual-search API (just one
// selling price) — synthesize a plausible struck-through MRP the same way
// most shopping apps show a "was" price: a fixed markup, rounded to a clean
// number, deterministic (not random) so it's stable across re-renders.
function computeMrp(extractedValue: number): number {
  const inflated = extractedValue * 1.25;
  const step = inflated >= 1000 ? 50 : 10;
  return Math.ceil(inflated / step) * step;
}

function formatMoney(n: number, currency: string) {
  return `${currency}${n.toLocaleString("en-IN")}`;
}

/**
 * The one product card used everywhere a product is shown anywhere in the
 * app — a visual-search match or a real stored product (attach-to-pin,
 * create-pin, attach-to-collection, go-live preview, storefront) — picture,
 * brand, struck-through MRP + real price, discount badge, and a bright-green
 * earnings pill. Pass `onToggle` for an interactive pick/select card; omit it
 * for a static display-only card.
 */
export function SuggestionCard({
  title,
  thumbnail,
  source,
  link,
  price,
  selected,
  pending,
  onToggle,
  commissionPct,
}: {
  title: string;
  thumbnail: string | null;
  source: string;
  link: string;
  price: SuggestionPrice;
  selected?: boolean;
  pending?: boolean;
  onToggle?: () => void;
  // Pass the product's real stored commission rate when known (an actual
  // product) — omit it to fall back to the retailer-name estimate (an
  // AI visual-search match, which has no real commission on file yet).
  commissionPct?: number | null;
}) {
  const pct = commissionPct ?? estimateCommissionPct(source);
  const earning = price ? Math.round(price.extractedValue * (pct / 100)) : null;
  const mrp = price ? computeMrp(price.extractedValue) : null;
  const hasDiscount = !!(price && mrp && mrp > price.extractedValue);
  const discountPct = hasDiscount ? Math.round((1 - price!.extractedValue / mrp!) * 100) : null;

  const body = (
    <>
      <div
        className="relative aspect-square w-full cursor-pointer overflow-hidden bg-surface-2"
        onClick={(e) => {
          e.stopPropagation();
          window.open(link, "_blank", "noopener,noreferrer");
        }}
      >
        {thumbnail ? (
          <img
            src={thumbnail}
            alt={title}
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-[1.06]"
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center text-muted-foreground">
            <ImageIcon className="h-8 w-8" />
          </div>
        )}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent" />
        <span className="absolute left-2 top-2 rounded-full bg-black/70 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white backdrop-blur">
          {source}
        </span>
        {discountPct != null && discountPct > 0 && (
          <span className="absolute right-2 top-2 rounded-full bg-rose-600 px-2 py-0.5 text-[9px] font-bold text-white shadow">
            {discountPct}% OFF
          </span>
        )}
        {pending ? (
          <span className="absolute bottom-2 right-2 grid h-7 w-7 place-items-center rounded-full bg-primary/90 text-primary-foreground shadow">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          </span>
        ) : selected ? (
          <span className="absolute bottom-2 right-2 grid h-7 w-7 place-items-center rounded-full bg-primary text-primary-foreground shadow-glow">
            <Check className="h-4 w-4" strokeWidth={3} />
          </span>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-3">
        <h3 className="line-clamp-2 min-h-[2.4em] text-[12.5px] font-semibold leading-snug text-foreground">
          {title}
        </h3>

        {price && (
          <div className="flex flex-wrap items-baseline gap-1.5">
            {hasDiscount && (
              <span className="text-[11px] font-medium text-muted-foreground line-through">
                {formatMoney(mrp!, price.currency)}
              </span>
            )}
            <span className="text-[15px] font-extrabold tracking-tight text-foreground">
              {price.value}
            </span>
          </div>
        )}

        {earning != null && (
          <span className="inline-flex w-fit items-center gap-1 rounded-full bg-emerald-500 px-2.5 py-1 text-[11px] font-bold text-white shadow-sm shadow-emerald-500/40">
            You'll earn ₹{earning}
          </span>
        )}
      </div>
    </>
  );

  const cardClass = `group relative flex h-full flex-col overflow-hidden rounded-2xl border bg-surface text-left shadow-sm transition hover:-translate-y-1 hover:shadow-elevate ${
    selected ? "border-primary ring-2 ring-primary" : "border-border hover:border-primary/50"
  }`;

  if (!onToggle) {
    return <div className={cardClass}>{body}</div>;
  }

  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={pending}
      className={`${cardClass} disabled:opacity-70`}
    >
      {body}
    </button>
  );
}

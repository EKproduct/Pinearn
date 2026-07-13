import { Package } from "lucide-react";

export type ProductCardData = {
  id: string;
  title: string;
  affiliate_url: string;
  image_url: string | null;
  price_cents: number | null;
  currency?: string | null;
  commission_pct?: number | null;
};

function hostBrand(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").split(".")[0];
  } catch {
    return "shop";
  }
}

export function ProductCard({
  product,
  brand,
}: {
  product: ProductCardData;
  brand?: string | null;
}) {
  const brandLabel = (brand ?? hostBrand(product.affiliate_url)).toLowerCase();

  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-xl border border-border bg-surface transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-elevate">
      <a
        href={product.affiliate_url}
        target="_blank"
        rel="noreferrer noopener"
        className="relative aspect-square w-full overflow-hidden bg-surface-2"
      >
        {product.image_url ? (
          <img
            src={product.image_url}
            alt={product.title}
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]"
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center text-muted-foreground/60">
            <Package className="h-6 w-6" />
          </div>
        )}
      </a>

      <div className="flex flex-1 flex-col gap-1.5 p-2.5">
        <div className="min-w-0">
          <p className="truncate text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {brandLabel}
          </p>
          <h3 className="mt-0.5 line-clamp-2 text-[12px] font-semibold leading-snug text-foreground">
            {product.title}
          </h3>
        </div>

        <div className="mt-auto flex items-baseline gap-2">
          {product.price_cents != null ? (
            <span className="text-sm font-bold tracking-tight text-foreground">
              ₹{(product.price_cents / 100).toFixed(0)}
            </span>
          ) : (
            <span className="text-[11px] text-muted-foreground">Price on site</span>
          )}
        </div>
      </div>
    </article>
  );
}

export function ProductCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border border-dashed border-border bg-surface/40">
      <div className="aspect-square w-full animate-pulse bg-surface-2/60" />
      <div className="space-y-1.5 p-2.5">
        <div className="h-2 w-1/3 animate-pulse rounded-full bg-muted" />
        <div className="h-2.5 w-4/5 animate-pulse rounded-full bg-muted" />
        <div className="h-5 w-full animate-pulse rounded-full bg-muted/70" />
      </div>
    </div>
  );
}

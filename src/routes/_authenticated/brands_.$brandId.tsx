import { createFileRoute, Link, notFound, useRouter } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  ArrowLeft,
  Clipboard,
  ExternalLink,
  Info,
  Loader2,
  Sparkles,
  ChevronDown,
} from "lucide-react";
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getBrand, brandLogoUrl } from "@/lib/brands";
import { BrandLogo } from "@/components/brand-card";

export const Route = createFileRoute("/_authenticated/brands_/$brandId")({
  loader: ({ params }) => {
    const brand = getBrand(params.brandId);
    if (!brand) throw notFound();
    return { brand };
  },
  component: BrandDetailPage,
  notFoundComponent: () => (
    <div className="mx-auto max-w-md p-6 text-center text-sm text-muted-foreground">
      Brand not found. <Link to="/brands" className="text-primary underline">Back to brands</Link>
    </div>
  ),
  errorComponent: ({ error }) => (
    <div className="mx-auto max-w-md p-6 text-center text-sm text-muted-foreground">
      {error.message}
    </div>
  ),
});

const CREATOR_TILES = [
  { handle: "@influencer1", img: "https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=400&q=70" },
  { handle: "@creator2", img: "https://images.unsplash.com/photo-1556228720-195a672e8a03?w=400&q=70" },
  { handle: "@style3", img: "https://images.unsplash.com/photo-1512496015851-a90fb38ba796?w=400&q=70" },
  { handle: "@beauty4", img: "https://images.unsplash.com/photo-1522335789203-aaa8bc7c7f3f?w=400&q=70" },
  { handle: "@glow5", img: "https://images.unsplash.com/photo-1526045478516-99145907023c?w=400&q=70" },
  { handle: "@shop6", img: "https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=400&q=70" },
];

const TC_ITEMS = [
  "Commission rates are subject to change based on promotional periods.",
  "Earnings are calculated on the final sale price after all discounts.",
  "Payouts are processed within 30 days of order confirmation.",
  "Returns and cancellations will affect your commission earnings.",
  "Minimum payout threshold is ₹500.",
  "Fraudulent activities will result in immediate account termination.",
  "Content must comply with brand guidelines and community standards.",
  "Exclusive deals may have different commission structures.",
];

function BrandDetailPage() {
  const { brand } = Route.useLoaderData();
  const [tab, setTab] = useState<"tc">("tc");
  const [url, setUrl] = useState("");
  const [expanded, setExpanded] = useState(false);
  const qc = useQueryClient();
  const router = useRouter();

  const description = useMemo(
    () =>
      brand.description ??
      `${brand.name} is one of India's leading brands known for quality products and excellent customer service. Partner with ${brand.name} to earn up to ${brand.commission}% commission on every sale you drive through your affiliate links. Share your unique link across social media, blogs, or with your community and start earning today.`,
    [brand],
  );

  const create = useMutation({
    mutationFn: async () => {
      const link = url.trim();
      if (!link) throw new Error("Paste a product link first");
      try {
        new URL(link);
      } catch {
        throw new Error("That doesn't look like a valid URL");
      }
      const { data: userRes } = await supabase.auth.getUser();
      const userId = userRes.user?.id;
      if (!userId) throw new Error("Not signed in");

      const { data: sf, error: sfErr } = await supabase
        .from("storefronts")
        .select("id")
        .eq("user_id", userId)
        .order("is_default", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (sfErr) throw sfErr;
      if (!sf) throw new Error("Your storefront isn't ready yet.");

      const { error } = await supabase.from("storefront_products").insert({
        user_id: userId,
        storefront_id: sf.id,
        title: brand.name,
        affiliate_url: link,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["all-products"] });
      qc.invalidateQueries({ queryKey: ["storefront-products"] });
      toast.success("Affiliate link created");
      setUrl("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function pasteFromClipboard() {
    try {
      const t = await navigator.clipboard.readText();
      if (t) setUrl(t.trim());
    } catch {
      toast.error("Clipboard access blocked");
    }
  }

  const logo = brandLogoUrl(brand);

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <div className="sticky top-0 z-20 flex items-center justify-between border-b border-border bg-surface px-4 py-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              if (window.history.length > 1) router.history.back();
              else router.navigate({ to: "/brands" });
            }}
            className="grid h-9 w-9 place-items-center rounded-full text-foreground transition hover:bg-surface-2"
            aria-label="Back"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="font-display text-xl font-bold text-foreground">{brand.name}</h1>
        </div>
        {logo && (
          <a
            href={`https://${brand.domain}`}
            target="_blank"
            rel="noreferrer"
            className="grid h-9 w-9 place-items-center rounded-full text-foreground transition hover:bg-surface-2"
            aria-label="Visit brand"
          >
            <ExternalLink className="h-5 w-5" />
          </a>
        )}
      </div>

      <div className="mx-auto max-w-md px-4 pt-5">
        {/* Brand identity */}
        <div className="flex items-start gap-4">
          <div className="grid h-24 w-24 shrink-0 place-items-center overflow-hidden rounded-2xl bg-surface ring-1 ring-border">
            <BrandLogo brand={brand} size={92} />
          </div>
          <div className="flex flex-1 flex-col gap-2 pt-1">
            <h2 className="font-display text-2xl font-bold text-foreground">{brand.name}</h2>
            <div className="inline-flex w-fit items-center rounded-full bg-surface-2 px-4 py-1.5 text-sm font-semibold text-foreground ring-1 ring-border/60">
              Upto {brand.commission}% Earning
            </div>
          </div>
        </div>

        {/* Earnings banner */}
        <div className="mt-5 overflow-hidden rounded-2xl bg-primary text-primary-foreground shadow-elevate">
          <div className="flex items-center justify-center gap-2 border-b border-primary-foreground/15 px-4 py-3 text-sm">
            <Sparkles className="h-4 w-4" />
            <span>
              Avg. Creator Earns{" "}
              <span className="font-bold">{brand.avgEarnings ?? "₹50,000/month"}</span>
            </span>
            <Sparkles className="h-4 w-4" />
          </div>
          <div className="p-4">
            <div className="text-sm font-semibold">Create Your Affiliate Link Now</div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                create.mutate();
              }}
              className="mt-3 flex items-center gap-2 rounded-full bg-surface pl-4 pr-1.5 py-1.5"
            >
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder={`Paste any ${brand.name} product link here`}
                className="min-w-0 flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
              />
              <button
                type="button"
                onClick={pasteFromClipboard}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted-foreground transition hover:bg-surface-2"
                aria-label="Paste"
              >
                {create.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Clipboard className="h-4 w-4" />
                )}
              </button>
            </form>
          </div>
        </div>

        {/* Description */}
        <div className="mt-5">
          <p className={`text-sm leading-relaxed text-foreground/80 ${expanded ? "" : "line-clamp-2"}`}>
            {description}
          </p>
          <button
            onClick={() => setExpanded((v) => !v)}
            className="mt-1 inline-flex items-center gap-1 text-sm font-semibold text-primary"
          >
            {expanded ? "Show less" : "Read more"}
            <ChevronDown className={`h-4 w-4 transition ${expanded ? "rotate-180" : ""}`} />
          </button>
        </div>

        <div className="mt-5">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-surface p-3 ring-1 ring-border">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                Tracking Time
                <Info className="h-3.5 w-3.5" />
              </div>
              <div className="mt-1 text-base font-bold text-foreground">
                {brand.tracking ?? "24 hours"}
              </div>
            </div>
            <div className="rounded-2xl bg-surface p-3 ring-1 ring-border">
              <div className="text-xs text-muted-foreground">Confirmation Time</div>
              <div className="mt-1 text-base font-bold text-foreground">
                {brand.confirmation ?? "30 days"}
              </div>
            </div>
          </div>
          <h3 className="mt-5 font-display text-base font-bold text-foreground">
            Terms &amp; Conditions
          </h3>
          <ol className="mt-3 space-y-3">
            {TC_ITEMS.map((t, i) => (
              <li key={i} className="flex gap-3 text-sm text-foreground/80">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-surface-2 text-xs font-semibold text-foreground">
                  {i + 1}
                </span>
                <span>{t}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}

import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { BrandsSection } from "@/components/brand-card";
import { BEST_SELLING_BRANDS } from "@/lib/brands";
import { openAffiliateLinkDialog } from "@/components/affiliate-link-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";
import {
  IndianRupee,
  MousePointerClick,
  Coins,
  ImagePlus,
  Link2,
  Link as LinkIcon,
  Store,
  ChevronLeft,
  ChevronRight,
  Plus,
  ArrowRight,
  Layers,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

/* ---------------- Feature slideshow ---------------- */

const SLIDES = [
  {
    icon: Coins,
    title: "Monetise any pin",
    body: "Every pin is a shelf waiting to sell. Attach a product in one tap and start earning on every click.",
    cta: { label: "Attach products", to: "/pins/attach" as const },
    gradient: "from-rose-100 via-rose-50 to-orange-50",
  },
  {
    icon: ImagePlus,
    title: "Create pin",
    body: "Drop a photo or reel — Pinearn crops, formats, and gets it publish-ready in seconds.",
    cta: { label: "Create pin", to: "/pins/create" as const },
    gradient: "from-orange-100 via-amber-50 to-rose-50",
  },
  {
    icon: Link2,
    title: "Create affiliate link",
    body: "Paste any product URL and get a trackable link ready for pins, stories, or DMs.",
    cta: { label: "Create link", onClick: openAffiliateLinkDialog },
    gradient: "from-red-50 via-rose-100 to-pink-50",
  },
  {
    icon: Store,
    title: "Create storefront",
    body: "One link, every product. Build a shoppable storefront every new pin can point to.",
    cta: { label: "Open storefront", to: "/storefront" as const },
    gradient: "from-pink-50 via-rose-100 to-orange-100",
  },
] as const;

function FeatureCarousel() {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setIdx((i) => (i + 1) % SLIDES.length), 5000);
    return () => clearInterval(t);
  }, []);
  const s = SLIDES[idx];
  const Icon = s.icon;
  return (
    <div className="relative overflow-hidden rounded-3xl border border-border shadow-elevate">
      <div className={`flex min-h-[220px] flex-col justify-between bg-gradient-to-br ${s.gradient} px-5 py-5 sm:min-h-[240px] sm:px-6 sm:py-6`}>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h3 className="line-clamp-2 font-display text-xl font-bold leading-tight text-foreground sm:text-2xl">
              {s.title}
            </h3>
            <p className="mt-2 line-clamp-2 max-w-md text-sm text-foreground/70">{s.body}</p>
            {"to" in s.cta ? (
              <Link
                to={s.cta.to}
                className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-glow transition hover:opacity-90 sm:px-4 sm:py-2 sm:text-sm"
              >
                {s.cta.label} <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            ) : (
              <button
                onClick={s.cta.onClick}
                className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-glow transition hover:opacity-90 sm:px-4 sm:py-2 sm:text-sm"
              >
                {s.cta.label} <ArrowRight className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <div className="hidden shrink-0 sm:block">
            <div className="grid h-16 w-16 place-items-center rounded-2xl bg-white/70 text-primary shadow-sm backdrop-blur">
              <Icon className="h-8 w-8" />
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={() => setIdx((i) => (i - 1 + SLIDES.length) % SLIDES.length)}
            className="grid h-8 w-8 place-items-center rounded-full bg-white/80 text-foreground/70 shadow-sm transition hover:bg-white"
            aria-label="Previous"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="flex flex-1 items-center gap-1">
            {SLIDES.map((_, i) => (
              <button
                key={i}
                onClick={() => setIdx(i)}
                aria-label={`Slide ${i + 1}`}
                className={`h-1 rounded-full transition-all ${
                  i === idx ? "w-4 bg-primary" : "w-1 bg-foreground/20"
                }`}
              />
            ))}
          </div>
          <button
            onClick={() => setIdx((i) => (i + 1) % SLIDES.length)}
            className="grid h-8 w-8 place-items-center rounded-full bg-white/80 text-foreground/70 shadow-sm transition hover:bg-white"
            aria-label="Next"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function Dashboard() {
  return (
    <AppShell title="Dashboard" subtitle="Your monetization at a glance." greetingName>
      {/* Feature carousel */}
      <FeatureCarousel />

      {/* Quick actions */}
      <div className="mt-8">
        <h2 className="mb-4 font-display text-lg font-semibold">Quick actions</h2>
        <div className="grid grid-cols-3 gap-3 sm:gap-4">
          <QuickAction to="/pins/attach" icon={Link2} label="Attach product" />
          <QuickAction to="/pins/create" icon={Plus} label="Create pin" />
          <QuickAction onClick={openAffiliateLinkDialog} icon={LinkIcon} label="Create affiliate link" />
        </div>
      </div>

      {/* Best selling brands */}
      <BrandsSection brands={BEST_SELLING_BRANDS} />

      {/* Top 5 pins */}
      <TopPins />

    </AppShell>
  );
}


function TopPins() {
  const { data: topPins = [], isLoading } = useQuery({
    queryKey: ["dashboard-top-pins"],
    queryFn: async () => {
      const { data } = await supabase
        .from("pins")
        .select("id, title, image_url, clicks, earnings_cents")
        .order("clicks", { ascending: false })
        .limit(5);
      return data ?? [];
    },
  });

  return (
    <div className="mt-6 rounded-2xl border border-border bg-surface p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold">Top 5 pins</h2>
        <Link
          to="/analytics"
          className="text-xs font-medium text-primary hover:underline"
        >
          View analytics
        </Link>
      </div>
      {isLoading ? (
        <div className="py-6 text-center text-sm text-muted-foreground">Loading…</div>
      ) : topPins.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border bg-surface-2/40 py-8 text-center">
          <Layers className="h-5 w-5 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            No pins yet — connect Pinterest and sync your boards to see your top pins here.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {topPins.map((p, i) => (
            <li key={p.id} className="flex items-center gap-3 py-3">
              <div className="w-5 text-center text-xs font-medium text-muted-foreground">
                {i + 1}
              </div>
              {p.image_url ? (
                <img
                  src={p.image_url}
                  alt={p.title}
                  className="h-14 w-14 flex-shrink-0 rounded-lg object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="grid h-14 w-14 flex-shrink-0 place-items-center rounded-lg bg-surface-2 text-muted-foreground">
                  <ImagePlus className="h-5 w-5" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{p.title}</div>
                <div className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <MousePointerClick className="h-3 w-3" /> {fmt(p.clicks)} clicks
                  </span>
                </div>
              </div>
              <div className="text-right">
                <div className="inline-flex items-center font-display text-sm font-semibold">
                  <IndianRupee className="h-3.5 w-3.5" />
                  {fmt(Math.round(p.earnings_cents / 100))}
                </div>
                <div className="text-[10px] text-muted-foreground">earned</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function QuickAction({
  to,
  onClick,
  icon: Icon,
  label,
}: {
  to?: any;
  onClick?: () => void;
  icon: any;
  label: string;
}) {
  const className =
    "group flex flex-col items-center gap-2.5 rounded-2xl border border-border bg-surface p-4 text-center transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-elevate sm:flex-row sm:items-center sm:gap-3 sm:text-left sm:p-5";
  const inner = (
    <>
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary transition group-hover:bg-primary group-hover:text-primary-foreground">
        <Icon className="h-5 w-5" />
      </div>
      <span className="text-xs font-semibold leading-snug sm:text-sm">{label}</span>
    </>
  );
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={className}>
        {inner}
      </button>
    );
  }
  return (
    <Link to={to} className={className}>
      {inner}
    </Link>
  );
}

function fmt(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "k";
  return n.toLocaleString();
}


import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/app-shell";
import { BrandsSection } from "@/components/brand-card";
import { BEST_SELLING_BRANDS } from "@/lib/brands";
import { openAffiliateLinkDialog } from "@/components/affiliate-link-dialog";
import { supabase } from "@/integrations/supabase/client";
import { getPinterestAnalytics } from "@/lib/pinterest.functions";
import { GRADIENTS } from "./pins";
import { useEffect, useMemo, useState } from "react";
import {
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
  Eye,
  Sparkles,
  LayoutGrid,
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

      {/* Unmonetized pins → CTA */}
      <MonetizePins />

      {/* Boards with unmonetized pins → bulk swipe-approval CTA */}
      <MonetizeBoards />

      {/* Best selling brands */}
      <BrandsSection brands={BEST_SELLING_BRANDS} />

      {/* Quick actions */}
      <div className="mt-8">
        <h2 className="mb-4 font-display text-lg font-semibold">Quick actions</h2>
        <div className="grid grid-cols-3 gap-3 sm:gap-4">
          <QuickAction to="/pins/attach" icon={Link2} label="Attach product" />
          <QuickAction to="/pins/create" icon={Plus} label="Create pin" />
          <QuickAction onClick={openAffiliateLinkDialog} icon={LinkIcon} label="Create affiliate link" />
        </div>
      </div>
    </AppShell>
  );
}

function MonetizePins() {
  const runGetAnalytics = useServerFn(getPinterestAnalytics);

  // Every unmonetized pin, no cap — attached-product status from our DB,
  // impressions/clicks from Pinterest's real per-pin analytics (90d = the
  // widest window Pinterest allows) so every synced pin shows real numbers,
  // not a possibly-stale local column.
  const { data: dbPins = [], isLoading: pinsLoading } = useQuery({
    queryKey: ["dashboard-unmonetized-pins"],
    queryFn: async () => {
      const { data } = await supabase
        .from("pins")
        .select("id, title, image_url, impressions, clicks")
        .is("product_id", null)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const { data: pinterestData, isLoading: analyticsLoading } = useQuery({
    queryKey: ["dashboard-pin-analytics"],
    queryFn: () => runGetAnalytics({ data: { range: "90d" } }),
    retry: false,
  });

  const isLoading = pinsLoading || analyticsLoading;

  const pins = useMemo(() => {
    const realById = new Map((pinterestData?.pins ?? []).map((p) => [p.id, p]));
    return [...dbPins]
      .map((p) => {
        const real = realById.get(p.id);
        return {
          id: p.id,
          title: p.title,
          image_url: p.image_url,
          impressions: real?.impressions ?? p.impressions,
          clicks: real?.clicks ?? p.clicks,
        };
      })
      .sort((a, b) => b.impressions - a.impressions);
  }, [dbPins, pinterestData]);

  // Nothing unmonetized — skip the whole section rather than show an empty CTA.
  if (!isLoading && pins.length === 0) return null;

  const VISIBLE_COUNT = 10;
  const visiblePins = pins.slice(0, VISIBLE_COUNT);
  const hasMore = pins.length > VISIBLE_COUNT;

  return (
    <div className="mt-8">
      <div className="mb-4 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-lg font-semibold">Turn your pins into income</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {isLoading ? "Loading…" : `${pins.length} pin${pins.length === 1 ? "" : "s"} getting views with nothing to sell yet`}
          </p>
        </div>
        <Link to="/pins" className="shrink-0 text-xs font-medium text-primary hover:underline">
          View all
        </Link>
      </div>

      {isLoading ? (
        <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-52 w-32 shrink-0 animate-pulse rounded-2xl border border-border bg-surface-2 sm:w-36"
            />
          ))}
        </div>
      ) : (
        <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
          {visiblePins.map((p) => (
            <div
              key={p.id}
              className="group relative h-52 w-32 shrink-0 overflow-hidden rounded-2xl shadow-sm ring-1 ring-border/60 transition hover:-translate-y-0.5 hover:shadow-elevate sm:w-36"
            >
              {p.image_url ? (
                <img
                  src={p.image_url}
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover transition duration-300 group-hover:scale-105"
                  loading="lazy"
                />
              ) : (
                <div className="absolute inset-0 grid place-items-center bg-surface-2 text-muted-foreground">
                  <ImagePlus className="h-5 w-5" />
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
              <div className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/50 px-2 py-1 text-[10px] font-semibold text-white backdrop-blur">
                <Eye className="h-3 w-3" /> {fmt(p.impressions)}
              </div>
              <div className="absolute inset-x-2 bottom-11 text-white">
                <p className="line-clamp-2 text-[11px] font-medium leading-tight">{p.title}</p>
                <p className="mt-1 inline-flex items-center gap-1 text-[10px] opacity-80">
                  <MousePointerClick className="h-2.5 w-2.5" /> {fmt(p.clicks)} clicks
                </p>
              </div>
              <Link
                to="/pins/attach"
                search={{ pinId: p.id, collection: undefined }}
                className="absolute inset-x-2 bottom-2 flex items-center justify-center gap-1 rounded-full bg-white px-2 py-2 text-[11px] font-semibold text-foreground shadow-sm transition hover:bg-white/90"
              >
                <Sparkles className="h-3 w-3 text-primary" /> Monetise
              </Link>
            </div>
          ))}
          {hasMore && (
            <Link
              to="/pins"
              className="flex h-52 w-24 shrink-0 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-surface-2/40 text-center transition hover:border-primary/40 hover:bg-surface-2 sm:w-28"
            >
              <span className="grid h-9 w-9 place-items-center rounded-full bg-surface text-primary shadow-sm">
                <ArrowRight className="h-4 w-4" />
              </span>
              <span className="px-1 text-xs font-semibold leading-tight">
                View all
                <br />
                <span className="font-normal text-muted-foreground">
                  {pins.length - VISIBLE_COUNT} more
                </span>
              </span>
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

function MonetizeBoards() {
  // Real Pinterest boards (collections), grouped from the same pins table —
  // no separate "boards" schema needed, mirrors MonetizePins' data shape.
  const { data: collections = [], isLoading: collectionsLoading } = useQuery({
    queryKey: ["dashboard-boards-collections"],
    queryFn: async () => {
      const { data } = await supabase
        .from("collections")
        .select("id,name,slug")
        .order("position", { ascending: true });
      return (data ?? []) as { id: string; name: string; slug: string }[];
    },
  });

  const { data: pins = [], isLoading: pinsLoading } = useQuery({
    queryKey: ["dashboard-boards-pins"],
    queryFn: async () => {
      const { data } = await supabase.from("pins").select("id, collection_id, image_url, product_id");
      return data ?? [];
    },
  });

  const isLoading = collectionsLoading || pinsLoading;

  const boards = useMemo(() => {
    const byId = new Map(
      collections.map((c) => [c.id, { collection: c, cover: null as string | null, total: 0, unmonetized: 0 }]),
    );
    for (const p of pins) {
      const b = p.collection_id ? byId.get(p.collection_id) : undefined;
      if (!b) continue;
      b.total += 1;
      if (!b.cover && p.image_url) b.cover = p.image_url;
      if (!p.product_id) b.unmonetized += 1;
    }
    return Array.from(byId.values())
      .filter((b) => b.unmonetized > 0)
      .sort((a, b) => b.unmonetized - a.unmonetized);
  }, [collections, pins]);

  // No board has anything left to monetize — skip the section entirely.
  if (!isLoading && boards.length === 0) return null;

  const VISIBLE_COUNT = 10;
  const visibleBoards = boards.slice(0, VISIBLE_COUNT);
  const hasMore = boards.length > VISIBLE_COUNT;

  return (
    <div className="mt-8">
      <div className="mb-4 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-lg font-semibold">Monetise your boards</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {isLoading ? "Loading…" : `${boards.length} board${boards.length === 1 ? "" : "s"} with pins ready to sell`}
          </p>
        </div>
        <Link
          to="/pins/attach"
          search={{ intent: "monetize" }}
          className="shrink-0 text-xs font-medium text-primary hover:underline"
        >
          View all
        </Link>
      </div>

      {isLoading ? (
        <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-52 w-32 shrink-0 animate-pulse rounded-2xl border border-border bg-surface-2 sm:w-36"
            />
          ))}
        </div>
      ) : (
        <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
          {visibleBoards.map((b, i) => (
            <div
              key={b.collection.id}
              className="group relative h-52 w-32 shrink-0 overflow-hidden rounded-2xl shadow-sm ring-1 ring-border/60 transition hover:-translate-y-0.5 hover:shadow-elevate sm:w-36"
            >
              {b.cover ? (
                <img
                  src={b.cover}
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover transition duration-300 group-hover:scale-105"
                  loading="lazy"
                />
              ) : (
                <div
                  className={`absolute inset-0 bg-gradient-to-br ${GRADIENTS[i % GRADIENTS.length]}`}
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
              <div className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/50 px-2 py-1 text-[10px] font-semibold text-white backdrop-blur">
                <LayoutGrid className="h-3 w-3" /> {b.total}
              </div>
              <div className="absolute inset-x-2 bottom-11 text-white">
                <p className="line-clamp-2 text-[11px] font-medium leading-tight">{b.collection.name}</p>
                <p className="mt-1 text-[10px] opacity-80">{b.unmonetized} to monetise</p>
              </div>
              <Link
                to="/pins/monetize-board"
                search={{ collectionId: b.collection.id }}
                className="absolute inset-x-2 bottom-2 flex items-center justify-center gap-1 rounded-full bg-white px-2 py-2 text-[11px] font-semibold text-foreground shadow-sm transition hover:bg-white/90"
              >
                <Sparkles className="h-3 w-3 text-primary" /> Monetise
              </Link>
            </div>
          ))}
          {hasMore && (
            <Link
              to="/pins/attach"
              search={{ intent: "monetize" }}
              className="flex h-52 w-24 shrink-0 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-surface-2/40 text-center transition hover:border-primary/40 hover:bg-surface-2 sm:w-28"
            >
              <span className="grid h-9 w-9 place-items-center rounded-full bg-surface text-primary shadow-sm">
                <ArrowRight className="h-4 w-4" />
              </span>
              <span className="px-1 text-xs font-semibold leading-tight">
                View all
                <br />
                <span className="font-normal text-muted-foreground">
                  {boards.length - VISIBLE_COUNT} more
                </span>
              </span>
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

function QuickAction({
  to,
  search,
  onClick,
  icon: Icon,
  label,
}: {
  to?: any;
  search?: any;
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
    <Link to={to} search={search} className={className}>
      {inner}
    </Link>
  );
}

function fmt(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "k";
  return n.toLocaleString();
}


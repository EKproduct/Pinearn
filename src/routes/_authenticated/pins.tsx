import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useMemo, useState } from "react";
import {
  Plus,
  Link2,
  Trash2,
  Loader2,
  Pin as PinIcon,
  X,
  Check,
  Sparkles,
  Wand2,
  Upload,
  Image as ImageIcon,
  Pencil,
  Store,
  ArrowUpDown,
} from "lucide-react";
import { toast } from "sonner";
import { visualSearchPin } from "@/lib/pinterest.functions";
import { pickPlaceholderImage } from "@/lib/placeholder-image";

export const Route = createFileRoute("/_authenticated/pins")({
  validateSearch: (s: Record<string, unknown>) => ({
    new: s.new === 1 || s.new === "1" ? 1 : undefined,
    filter: s.filter === "drafts" ? "drafts" : undefined,
  }),
  component: PinsPage,
});

export type Pin = {
  id: string;
  title: string;
  description: string | null;
  image_url: string | null;
  external_url: string | null;
  status: string;
  impressions: number;
  clicks: number;
  conversions: number;
  earnings_cents: number;
  storefront_id: string | null;
  product_id: string | null;
  collection_id: string | null;
  created_at: string;
};

export type Collection = { id: string; name: string; slug: string };
export type Storefront = { id: string; name: string; slug: string };
export type Product = {
  id: string;
  title: string;
  affiliate_url: string;
  image_url: string | null;
  price_cents: number | null;
  currency: string | null;
  commission_pct: number | null;
  storefront_id: string;
  collection_id: string | null;
};

export const GRADIENTS = [
  "from-rose-500 to-pink-600",
  "from-amber-400 to-orange-600",
  "from-emerald-400 to-teal-600",
  "from-sky-400 to-indigo-600",
  "from-fuchsia-500 to-purple-600",
  "from-lime-400 to-green-600",
  "from-cyan-400 to-blue-600",
  "from-red-500 to-rose-700",
];

export const RATIOS = [
  "aspect-[3/4]",
  "aspect-[3/5]",
  "aspect-square",
  "aspect-[4/5]",
  "aspect-[3/4]",
  "aspect-[2/3]",
];

function PinsPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const search = Route.useSearch();
  const [collectionFilter, setCollectionFilter] = useState<string>("live");
  const [sortBy, setSortBy] = useState<"newest" | "clicks" | "ctr" | "earnings">("newest");
  const [openPinId, setOpenPinId] = useState<string | null>(null);

  // Sync the "Drafts" filter chip from ?filter=drafts (e.g. after clicking Save draft).
  useEffect(() => {
    if (search.filter === "drafts") {
      setCollectionFilter("drafts");
    } else if (search.filter === undefined) {
      setCollectionFilter("live");
    }
  }, [search.filter]);

  useEffect(() => {
    if (search.new === 1) {
      navigate({ to: "/pins/attach", replace: true });
    }
  }, [search.new, navigate]);

  const { data: pins = [], isLoading } = useQuery({
    queryKey: ["pins"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pins")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Pin[];
    },
  });

  const { data: collections = [] } = useQuery({
    queryKey: ["collections"],
    queryFn: async () => {
      const { data } = await supabase
        .from("collections")
        .select("id,name,slug")
        .order("position", { ascending: true });
      return (data ?? []) as Collection[];
    },
  });

  const { data: storefronts = [] } = useQuery({
    queryKey: ["storefronts"],
    queryFn: async () => {
      const { data } = await supabase.from("storefronts").select("id,name,slug");
      return (data ?? []) as Storefront[];
    },
  });

  const { data: products = [] } = useQuery({
    queryKey: ["all-products"],
    queryFn: async () => {
      const { data } = await supabase
        .from("storefront_products")
        .select("id,title,affiliate_url,image_url,price_cents,currency,commission_pct,storefront_id,collection_id");
      return (data ?? []) as Product[];
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("pins").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pins"] });
      toast.success("Pin deleted");
    },
  });

  const visiblePins = useMemo(
    () => pins.filter((p) => p.status === "draft" || p.status === "live"),
    [pins],
  );

  const filtered = useMemo(() => {
    const base =
      collectionFilter === "drafts"
        ? visiblePins.filter((p) => p.status === "draft")
        : visiblePins.filter((p) => p.status === "live");
    return [...base].sort((a, b) => {
      switch (sortBy) {
        case "clicks":
          return b.clicks - a.clicks;
        case "earnings":
          return b.earnings_cents - a.earnings_cents;
        case "ctr": {
          const ctrA = a.impressions > 0 ? a.clicks / a.impressions : 0;
          const ctrB = b.impressions > 0 ? b.clicks / b.impressions : 0;
          return ctrB - ctrA;
        }
        case "newest":
        default:
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
    });
  }, [visiblePins, collectionFilter, sortBy]);

  const openPin = pins.find((p) => p.id === openPinId) ?? null;

  const draftsCount = visiblePins.filter((p) => p.status === "draft").length;
  const liveCount = visiblePins.filter((p) => p.status === "live").length;

  return (
    <AppShell
      title="Pins"
      subtitle="Browse pins by collection, then match each one to affiliate products."
      backButton
      hideNotifications
      actions={
        pins.length > 0 &&
        (storefronts.length === 0 ? (
          <button
            disabled
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-gradient-primary px-5 py-2.5 text-sm font-medium text-primary-foreground shadow-glow opacity-50"
          >
            <Plus className="h-4 w-4" /> Attach Products
          </button>
        ) : (
          <Link
            to="/pins/attach"
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-gradient-primary px-5 py-2.5 text-sm font-medium text-primary-foreground shadow-glow"
          >
            <Plus className="h-4 w-4" /> Attach Products
          </Link>
        ))
      }
    >
      <div className="no-scrollbar mb-5 -mx-1 flex items-center gap-2 overflow-x-auto px-1">
        <FilterChip
          active={collectionFilter === "live"}
          onClick={() => setCollectionFilter("live")}
          label="Live"
          count={liveCount}
        />
        {draftsCount > 0 && (
          <FilterChip
            active={collectionFilter === "drafts"}
            onClick={() => setCollectionFilter("drafts")}
            label="Drafts"
            count={draftsCount}
          />
        )}
        <div className="ml-auto flex items-center">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            className="h-8 rounded-full border border-border bg-surface px-3 text-xs font-medium text-muted-foreground focus:border-primary focus:outline-none"
          >
            <option value="newest">Newest</option>
            <option value="clicks">Most clicks</option>
            <option value="ctr">Highest CTR</option>
            <option value="earnings">Highest earnings</option>
          </select>
        </div>
      </div>


      {openPin && (
        <PinDetailDialog
          pin={openPin}
          products={products}
          onClose={() => setOpenPinId(null)}
        />
      )}

      {isLoading ? (
        <div className="masonry-3 sm:masonry-4 lg:masonry-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className={`${RATIOS[i % RATIOS.length]} animate-pulse rounded-2xl border border-border bg-surface/60`}
            />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyPins canCreate={storefronts.length > 0} />
      ) : (
        <div className="masonry-3 sm:masonry-4 lg:masonry-4">
          {filtered.map((p, i) => {
            const grad = GRADIENTS[i % GRADIENTS.length];
            const ratio = RATIOS[i % RATIOS.length];
            return (
              <article
                key={p.id}
                onClick={() => {
                  if (p.status === "draft") setOpenPinId(p.id);
                }}
                className={`group overflow-hidden rounded-2xl bg-surface shadow-sm ring-1 ring-border/60 transition hover:shadow-elevate ${
                  p.status === "draft" ? "cursor-pointer" : ""
                }`}
              >
                <div className={`relative ${ratio} w-full bg-gradient-to-br ${grad}`}>
                  {p.image_url && (
                    <img
                      src={p.image_url}
                      alt=""
                      className="absolute inset-0 h-full w-full object-cover"
                      loading="lazy"
                    />
                  )}
                  <span
                    className="absolute right-2 top-2 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide backdrop-blur"
                    style={{
                      background:
                        p.status === "live"
                          ? "oklch(0.72 0.16 45 / 0.95)"
                          : p.status === "scheduled"
                            ? "oklch(0.72 0.14 85 / 0.95)"
                            : "oklch(1 0 0 / 0.9)",
                      color: p.status === "draft" ? "oklch(0.28 0.015 45)" : "oklch(1 0 0)",
                    }}
                  >
                    {p.status}
                  </span>
                </div>
                <div className="p-3">
                  <h3 className="hidden">{p.title}</h3>
                  <div className="mt-2 grid grid-cols-2 gap-1.5">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenPinId(p.id);
                      }}
                      className="inline-flex items-center justify-center gap-1.5 rounded-full bg-surface-2 px-2 py-2 text-xs font-semibold text-foreground hover:bg-surface-2/70"
                    >
                      <Pencil className="h-3.5 w-3.5" /> Edit
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(`Delete "${p.title}"?`)) remove.mutate(p.id);
                      }}
                      className="inline-flex items-center justify-center gap-1.5 rounded-full bg-destructive/10 px-2 py-2 text-xs font-semibold text-destructive hover:bg-destructive/15"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Delete
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}

function FilterChip({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 rounded-full border px-4 py-1.5 text-sm capitalize transition ${
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-surface text-muted-foreground hover:text-foreground"
      }`}
    >
      {label} <span className={`ml-1 text-xs ${active ? "opacity-80" : "opacity-60"}`}>{count}</span>
    </button>
  );
}

function EmptyPins({ canCreate }: { canCreate: boolean }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-surface/40 p-12 text-center">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-gradient-primary shadow-glow">
        <PinIcon className="h-6 w-6 text-primary-foreground" />
      </div>
      <h3 className="mt-4 font-display text-xl font-semibold">No pins here</h3>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
        {canCreate
          ? "Create a pin and attach one of your affiliate products to start earning."
          : "Add a storefront and product first, then come back to create pins."}
      </p>
      {canCreate && (
        <Link
          to="/pins/attach"
          className="mt-6 inline-flex items-center gap-2 rounded-full bg-gradient-primary px-5 py-2.5 text-sm font-medium text-primary-foreground shadow-glow"
        >
          <Plus className="h-4 w-4" /> Attach Products
        </Link>
      )}
    </div>
  );
}

export function PinDetailDialog({
  pin,
  products,
  onClose,
}: {
  pin: Pin;
  products: Product[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const runVisualSearch = useServerFn(visualSearchPin);

  // Suggested products from the same storefront/collection auto-checked.
  const storeProducts = useMemo(
    () => products.filter((p) => !pin.storefront_id || p.storefront_id === pin.storefront_id),
    [products, pin.storefront_id],
  );
  // Only pre-check the pin's already-linked product, if any. No collection auto-pick.
  const initialAutoChecked = useMemo(() => {
    const ids = new Set<string>();
    if (pin.product_id) ids.add(pin.product_id);
    return ids;
  }, [pin.product_id]);

  const [checked, setChecked] = useState<Set<string>>(initialAutoChecked);
  const [manualProductIds, setManualProductIds] = useState<Set<string>>(new Set());
  const [previewLoading, setPreviewLoading] = useState(false);
  const [manualUrl, setManualUrl] = useState(
    pin.external_url && !pin.product_id ? pin.external_url : "",
  );

  const {
    data: aiData,
    isFetching: aiLoading,
    refetch: refetchAI,
  } = useQuery({
    queryKey: ["visual-search", pin.id],
    queryFn: async () => runVisualSearch({ data: { pinId: pin.id } }),
    staleTime: 5 * 60_000,
  });
  const suggestions = aiData?.suggestions ?? [];

  // Auto-check every AI suggestion the moment it arrives so its link
  // gets picked up when the user publishes.
  const [checkedAI, setCheckedAI] = useState<Set<number>>(new Set());
  useEffect(() => {
    if (suggestions.length > 0) {
      setCheckedAI(new Set(suggestions.map((_, i) => i)));
    }
  }, [aiData]);


  const toggleAI = (idx: number) =>
    setCheckedAI((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });

  const aiLinkFor = (s: { query: string }) =>
    `https://www.amazon.in/s?k=${encodeURIComponent(s.query)}`;

  const resolveExternal = () => {
    if (manualUrl.trim()) return manualUrl.trim();
    const firstProductId = Array.from(checked)[0];
    const firstProduct = firstProductId
      ? storeProducts.find((p) => p.id === firstProductId)
      : undefined;
    if (firstProduct?.affiliate_url) return firstProduct.affiliate_url;
    const firstAI = Array.from(checkedAI)[0];
    if (firstAI !== undefined && suggestions[firstAI]) {
      return aiLinkFor(suggestions[firstAI]);
    }
    return pin.external_url ?? null;
  };

  const goToPreview = () => {
    if (checked.size === 0 && checkedAI.size === 0 && !manualUrl.trim()) {
      toast.error("Pick a product or paste a product link first.");
      return;
    }
    setPreviewLoading(true);
    const aiPicks = Array.from(checkedAI)
      .map((i) => suggestions[i])
      .filter(Boolean)
      .map((s) => ({ title: s.title, url: aiLinkFor(s), reason: s.reason }));
    try {
      sessionStorage.setItem(
        `pin-preview:${pin.id}`,
        JSON.stringify({ productIds: Array.from(checked), aiPicks }),
      );
    } catch {
      /* ignore quota */
    }
    onClose();
    navigate({ to: "/pins/preview", search: { pinId: pin.id } });
  };

  const saveDraft = useMutation({
    mutationFn: async () => {
      const firstProductId = Array.from(checked)[0] ?? null;
      const external = resolveExternal();
      const { error } = await supabase
        .from("pins")
        .update({
          status: firstProductId || external ? "live" : "draft",
          product_id: firstProductId,
          external_url: external ?? null,
        })
        .eq("id", pin.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pins"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addProduct = useMutation({
    mutationFn: async () => {
      const url = manualUrl.trim();
      if (!url) throw new Error("Paste a product link first");
      try {
        new URL(url);
      } catch {
        throw new Error("That doesn't look like a valid URL");
      }
      if (!pin.storefront_id) {
        throw new Error("This pin has no storefront yet.");
      }
      // If this URL already exists in the user's storefront, don't duplicate —
      // just reuse the existing product and let onSuccess auto-select it.
      const normalize = (u: string) => u.trim().replace(/\/+$/, "").toLowerCase();
      const target = normalize(url);
      const existing = storeProducts.find((p) => normalize(p.affiliate_url) === target);
      if (existing) {
        return { id: existing.id, duplicate: true as const };
      }
      const { data: userRes } = await supabase.auth.getUser();
      const userId = userRes.user?.id;
      if (!userId) throw new Error("Not signed in");
      let hostname = "New product";
      try {
        hostname = new URL(url).hostname.replace(/^www\./, "");
      } catch {
        /* keep default */
      }
      const title = pin.title ? `${pin.title} — ${hostname}` : hostname;
      const { data: inserted, error } = await supabase
        .from("storefront_products")
        .insert({
          user_id: userId,
          storefront_id: pin.storefront_id,
          collection_id: pin.collection_id,
          title,
          affiliate_url: url,
          image_url: pin.image_url,
        })
        .select("id")
        .single();
      if (error) throw error;
      return { id: inserted.id as string, duplicate: false as const };
    },
    onSuccess: ({ id, duplicate }) => {
      qc.invalidateQueries({ queryKey: ["all-products"] });
      setChecked((prev) => {
        const next = new Set(prev);
        next.add(id);
        return next;
      });
      setManualProductIds((prev) => {
        const next = new Set(prev);
        next.add(id);
        return next;
      });
      setManualUrl("");
      toast.success(duplicate ? "Already selected" : "Added");
    },
    onError: (e: Error) => toast.error(e.message),
  });


  const handleCancel = () => {
    saveDraft.mutate();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-background/70 backdrop-blur sm:items-center sm:p-4"
      onClick={handleCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative flex h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-border bg-surface shadow-elevate sm:h-auto sm:max-h-[90vh] sm:max-w-2xl sm:rounded-2xl"
      >
        {/* Sticky compact header with pin thumb */}
        <div className="flex items-center gap-3 border-b border-border/60 bg-surface px-4 py-3">
          <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-gradient-to-br from-rose-500 to-pink-600">
            {pin.image_url && (
              <img src={pin.image_url} alt="" className="h-full w-full object-cover" />
            )}
            {aiLoading && (
              <span className="pointer-events-none absolute inset-x-0 top-0 h-1/3 animate-scan bg-gradient-to-b from-primary/70 to-transparent" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <Sparkles className="h-3 w-3 text-primary" />
              <span className="text-[10px] font-semibold uppercase tracking-wide text-primary">
                {aiLoading ? "Scanning pin…" : "Visual match"}
              </span>
            </div>
            <h3 className="hidden">{pin.title}</h3>
          </div>
          <button
            onClick={handleCancel}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-surface-2 hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-6 pt-4">
          {/* Visual scan preview (big pin with scanning bar) */}
          {pin.image_url && (
            <div className="overflow-hidden rounded-2xl border border-border bg-surface-2/40">
              <div className="relative mx-auto aspect-[4/5] max-h-72 w-full">
                <img
                  src={pin.image_url}
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover"
                />
                {aiLoading && (
                  <>
                    <span className="pointer-events-none absolute inset-x-0 top-0 h-24 animate-scan bg-gradient-to-b from-primary/60 via-primary/20 to-transparent" />
                    <span className="pointer-events-none absolute inset-0 ring-2 ring-inset ring-primary/50" />
                  </>
                )}
                <div className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur">
                  {aiLoading ? (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin" /> Visual search…
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-3 w-3" /> {suggestions.length} matches
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Manual link */}
          <div className="mt-6">
            <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Product link
            </label>
            <div className="mt-1.5 flex items-center gap-2 rounded-xl border border-input bg-background px-3 py-2.5">
              <Link2 className="h-4 w-4 shrink-0 text-muted-foreground" />
              <input
                type="url"
                value={manualUrl}
                onChange={(e) => setManualUrl(e.target.value)}
                placeholder="Paste an affiliate link…"
                className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
              />
            </div>
            <button
              type="button"
              onClick={() => addProduct.mutate()}
              disabled={addProduct.isPending || !manualUrl.trim()}
              className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-primary/10 px-4 py-2 text-sm font-semibold text-primary transition hover:bg-primary/15 disabled:opacity-50"
            >
              {addProduct.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              Add product
            </button>
          </div>

          {/* Our Recommendations (AI) */}
          <div className="mt-6 flex items-center justify-between">
            <h5 className="flex items-center gap-1.5 text-sm font-semibold">
              <Wand2 className="h-4 w-4 text-primary" />
              Our Recommendation
            </h5>
            <div className="flex items-center gap-2">
              {suggestions.length > 0 && (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                  {checkedAI.size} picked
                </span>
              )}
              <button
                onClick={() => refetchAI()}
                disabled={aiLoading}
                className="rounded-full bg-surface-2 px-2.5 py-1 text-[10px] font-semibold text-muted-foreground hover:text-foreground disabled:opacity-50"
              >
                {aiLoading ? "Scanning…" : "Retry"}
              </button>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {aiLoading && suggestions.length === 0 ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="overflow-hidden rounded-xl border border-dashed border-border bg-surface-2/40"
                >
                  <div className="aspect-square w-full animate-pulse bg-surface-2/60" />
                  <div className="space-y-1.5 p-2.5">
                    <div className="h-2 w-1/3 animate-pulse rounded-full bg-muted" />
                    <div className="h-2.5 w-4/5 animate-pulse rounded-full bg-muted" />
                    <div className="h-5 w-full animate-pulse rounded-full bg-muted/70" />
                  </div>
                </div>
              ))
            ) : suggestions.length === 0 ? (
              <p className="col-span-full rounded-xl border border-dashed border-border bg-surface-2/40 p-4 text-center text-xs text-muted-foreground">
                No suggestions yet.
              </p>
            ) : (
              suggestions.map((s, idx) => {
                const isChecked = checkedAI.has(idx);
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => toggleAI(idx)}
                    className={`group relative flex h-full flex-col overflow-hidden rounded-xl border bg-surface text-left transition hover:-translate-y-0.5 hover:shadow-elevate ${
                      isChecked
                        ? "border-primary ring-2 ring-primary"
                        : "border-primary/30 hover:border-primary/60"
                    }`}
                  >
                    <div
                      className="relative aspect-square w-full cursor-pointer overflow-hidden bg-primary/10"
                      onClick={(e) => {
                        e.stopPropagation();
                        window.open(aiLinkFor(s), "_blank", "noopener,noreferrer");
                      }}
                    >
                      <img
                        src={pickPlaceholderImage(s.query)}
                        alt={s.title}
                        loading="lazy"
                        className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]"
                      />
                    </div>
                    {isChecked && (
                      <span className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full bg-primary text-primary-foreground shadow">
                        <Check className="h-3.5 w-3.5" strokeWidth={3} />
                      </span>
                    )}
                    <div className="flex flex-1 flex-col gap-1.5 p-2.5">
                      <div className="min-w-0">
                        <h3 className="line-clamp-2 text-[12px] font-semibold leading-snug text-foreground">
                          {s.title}
                        </h3>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Products */}
          {manualProductIds.size > 0 && (
            <div className="mt-6">
              <div className="flex items-center justify-between">
                <h5 className="flex items-center gap-1.5 text-sm font-semibold">
                  <Store className="h-4 w-4 text-primary" />
                  Products
                </h5>
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                  {manualProductIds.size} added
                </span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                {storeProducts
                  .filter((p) => manualProductIds.has(p.id))
                  .map((p) => {
                    const isChecked = checked.has(p.id);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() =>
                          setChecked((prev) => {
                            const next = new Set(prev);
                            if (next.has(p.id)) next.delete(p.id);
                            else next.add(p.id);
                            return next;
                          })
                        }
                        className={`group relative flex h-full flex-col overflow-hidden rounded-xl border bg-surface text-left transition hover:-translate-y-0.5 hover:shadow-elevate ${
                          isChecked
                            ? "border-primary ring-2 ring-primary"
                            : "border-primary/30 hover:border-primary/60"
                        }`}
                      >
                        <div
                          className="relative aspect-square w-full cursor-pointer overflow-hidden bg-primary/10"
                          onClick={(e) => {
                            e.stopPropagation();
                            window.open(p.affiliate_url, "_blank", "noopener,noreferrer");
                          }}
                        >
                          {p.image_url ? (
                            <img
                              src={p.image_url}
                              alt={p.title}
                              loading="lazy"
                              className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]"
                            />
                          ) : (
                            <div className="absolute inset-0 grid place-items-center text-muted-foreground">
                              <ImageIcon className="h-8 w-8" />
                            </div>
                          )}
                        </div>
                        {isChecked && (
                          <span className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full bg-primary text-primary-foreground shadow">
                            <Check className="h-3.5 w-3.5" strokeWidth={3} />
                          </span>
                        )}
                        <div className="flex flex-1 flex-col gap-1.5 p-2.5">
                          <div className="min-w-0">
                            <h3 className="line-clamp-2 text-[12px] font-semibold leading-snug text-foreground">
                              {p.title}
                            </h3>
                          </div>
                        </div>
                      </button>
                    );
                  })}
              </div>
            </div>
          )}

        </div>


        {/* Sticky footer */}
        <div
          className="flex items-center gap-2 border-t border-border/60 bg-surface px-4 py-3"
          style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
        >
          <button
            onClick={goToPreview}
            disabled={saveDraft.isPending}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-glow disabled:opacity-60"
          >
            Next
          </button>
        </div>
      </div>
      {previewLoading && (
        <div className="absolute inset-0 z-[60] grid place-items-center rounded-t-2xl bg-surface/80 backdrop-blur sm:rounded-2xl">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="text-sm font-medium text-muted-foreground">Preparing preview…</span>
          </div>
        </div>
      )}
    </div>
  );
}

function NewPinDialog({
  storefronts,
  collections,
  products,
  onClose,
}: {
  storefronts: Storefront[];
  collections: Collection[];
  products: Product[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [storefrontId, setStorefrontId] = useState(storefronts[0]?.id ?? "");
  const [collectionId, setCollectionId] = useState("");
  const [productId, setProductId] = useState("");
  const [status, setStatus] = useState("draft");

  const productsForStore = products.filter((p) => p.storefront_id === storefrontId);
  const activeStorefront = storefronts.find((s) => s.id === storefrontId);

  async function handleUpload(file: File) {
    if (!file.type.startsWith("image/")) {
      return toast.error("Please choose an image file");
    }
    if (file.size > 10 * 1024 * 1024) {
      return toast.error("Max file size is 10 MB");
    }
    setUploading(true);
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes.user?.id;
      if (!uid) throw new Error("Not signed in");
      const ext = file.name.split(".").pop() ?? "jpg";
      const path = `${uid}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("pin-images")
        .upload(path, file, { upsert: false, contentType: file.type });
      if (upErr) throw upErr;
      const { data: signed, error: signErr } = await supabase.storage
        .from("pin-images")
        .createSignedUrl(path, 60 * 60 * 24 * 365 * 10);
      if (signErr || !signed) throw signErr ?? new Error("Could not sign URL");
      setImageUrl(signed.signedUrl);
      toast.success("Image uploaded");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  const create = useMutation({
    mutationFn: async () => {
      const { data: userRes } = await supabase.auth.getUser();
      const product = products.find((p) => p.id === productId);
      const { error } = await supabase.from("pins").insert({
        user_id: userRes.user!.id,
        title: title.trim(),
        description: description.trim() || null,
        image_url: imageUrl.trim() || null,
        storefront_id: storefrontId || null,
        collection_id: collectionId || null,
        product_id: productId || null,
        external_url: product?.affiliate_url ?? null,
        status,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pins"] });
      toast.success("Pin created");
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-background/70 p-4 backdrop-blur">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
        className="my-8 w-full max-w-lg rounded-2xl border border-border bg-surface shadow-elevate"
      >
        <div className="flex items-center justify-between border-b border-border/60 px-5 py-3">
          <h3 className="font-display text-lg font-semibold">New pin</h3>
          <button
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-surface-2 hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          {/* Pin preview card (matches pins/preview) */}
          <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
            <div className="relative aspect-[4/5] w-full bg-gradient-to-br from-rose-500 to-pink-600">
              {imageUrl ? (
                <img
                  src={imageUrl}
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover"
                />
              ) : (
                <div className="absolute inset-0 grid place-items-center text-primary-foreground/90">
                  <div className="flex flex-col items-center gap-2 text-center">
                    <ImageIcon className="h-8 w-8 opacity-90" />
                    <span className="text-xs font-medium opacity-90">
                      Upload or paste an image
                    </span>
                  </div>
                </div>
              )}

              {/* Upload / replace overlay */}
              <label className="absolute bottom-3 right-3 inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-background/90 px-3 py-1.5 text-xs font-semibold text-foreground shadow backdrop-blur hover:bg-background">
                {uploading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Upload className="h-3.5 w-3.5" />
                )}
                {uploading ? "Uploading…" : imageUrl ? "Replace" : "Upload image"}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={uploading}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleUpload(f);
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
            <div className="p-4">
              <h2 className="font-display text-lg font-semibold leading-tight">
                {title.trim() || "Untitled pin"}
              </h2>
              {activeStorefront && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Storefront ·{" "}
                  <span className="font-medium text-foreground">{activeStorefront.name}</span>
                </p>
              )}
            </div>
          </div>

          <div>
            <label className="text-xs text-muted-foreground">Image URL</label>
            <input
              type="url"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="Paste an image URL or upload above"
              className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div>
            <label className="text-xs text-muted-foreground">Title</label>
            <input
              required
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Autumn capsule wardrobe"
              className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Optional pin caption"
              className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">Storefront</label>
              <select
                value={storefrontId}
                onChange={(e) => {
                  setStorefrontId(e.target.value);
                  setProductId("");
                }}
                className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              >
                {storefronts.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Collection</label>
              <select
                value={collectionId}
                onChange={(e) => setCollectionId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">— None —</option>
                {collections.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Product link (optional)</label>
            <select
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">— None (add later from pin) —</option>
              {productsForStore.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Status</label>
            <div className="mt-1 flex gap-2">
              {["draft", "scheduled", "live"].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatus(s)}
                  className={`rounded-lg border px-3 py-1.5 text-xs capitalize ${
                    status === s
                      ? "border-primary/60 bg-primary/10 text-foreground"
                      : "border-border text-muted-foreground"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-border/60 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
          <button
            disabled={create.isPending || uploading}
            className="inline-flex items-center gap-2 rounded-lg bg-gradient-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-glow disabled:opacity-60"
          >
            {create.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Create pin
          </button>
        </div>
      </form>
    </div>
  );
}

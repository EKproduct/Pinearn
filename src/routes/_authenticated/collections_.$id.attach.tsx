import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import {
  Loader2,
  Check,
  Sparkles,
  Wand2,
  Link2,
  Plus,
  Image as ImageIcon,
  Store,
  ArrowRight,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { supabase } from "@/integrations/supabase/client";
import { visualSearchImage } from "@/lib/pinterest.functions";

export const Route = createFileRoute("/_authenticated/collections_/$id/attach")({
  component: AttachToCollectionPage,
  errorComponent: ({ error }) => (
    <div className="p-6 text-sm text-destructive">{error.message}</div>
  ),
  notFoundComponent: () => (
    <div className="p-6 text-sm text-muted-foreground">Collection not found.</div>
  ),
});

type CollectionRow = {
  id: string;
  name: string;
  cover_image_url: string | null;
  storefront_id: string;
};

type ProductRow = {
  id: string;
  title: string;
  image_url: string | null;
  affiliate_url: string;
  collection_id: string | null;
};

function AttachToCollectionPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const runVisualSearch = useServerFn(visualSearchImage);

  const { data: collection, isLoading } = useQuery({
    queryKey: ["collection", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("collections")
        .select("id,name,cover_image_url,storefront_id")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data as CollectionRow | null;
    },
  });

  const { data: products = [] } = useQuery({
    queryKey: ["collection-products", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("storefront_products")
        .select("id,title,image_url,affiliate_url,collection_id")
        .eq("collection_id", id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ProductRow[];
    },
  });

  const imageUrl = collection?.cover_image_url ?? "";

  const {
    data: aiData,
    isFetching: aiLoading,
    refetch: refetchAI,
  } = useQuery({
    queryKey: ["visual-search-collection", id, imageUrl],
    queryFn: () =>
      runVisualSearch({ data: { imageUrl, title: collection?.name ?? "" } }),
    enabled: !!imageUrl,
    staleTime: 5 * 60_000,
  });
  const suggestions: Array<{ title: string; query: string; reason?: string }> =
    aiData?.suggestions ?? [];

  const [attachedIdxs, setAttachedIdxs] = useState<Set<number>>(new Set());
  const [pendingIdx, setPendingIdx] = useState<Set<number>>(new Set());
  const [manualUrl, setManualUrl] = useState("");
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    setAttachedIdxs(new Set());
  }, [aiData]);

  const aiLinkFor = (s: { query: string }) =>
    `https://www.amazon.in/s?k=${encodeURIComponent(s.query)}`;

  const attachSuggestion = async (idx: number) => {
    if (pendingIdx.has(idx) || attachedIdxs.has(idx)) return;
    const s = suggestions[idx];
    if (!s || !collection) return;
    setPendingIdx((prev) => new Set(prev).add(idx));
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const userId = userRes.user?.id;
      if (!userId) throw new Error("Not signed in");
      const { error } = await supabase.from("storefront_products").insert({
        user_id: userId,
        storefront_id: collection.storefront_id,
        collection_id: collection.id,
        title: s.title,
        affiliate_url: aiLinkFor(s),
        image_url: `https://loremflickr.com/400/400/${encodeURIComponent(s.query)}?lock=${idx + 1}`,
      });
      if (error) throw error;
      setAttachedIdxs((prev) => new Set(prev).add(idx));
      qc.invalidateQueries({ queryKey: ["collection-products", id] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPendingIdx((prev) => {
        const next = new Set(prev);
        next.delete(idx);
        return next;
      });
    }
  };

  const attachSuggestionRef = useRef(attachSuggestion);
  attachSuggestionRef.current = attachSuggestion;

  useEffect(() => {
    if (aiLoading || suggestions.length === 0) return;
    if (attachedIdxs.size > 0 || pendingIdx.size > 0) return;

    (async () => {
      for (let idx = 0; idx < suggestions.length; idx++) {
        if (!mountedRef.current) break;
        await attachSuggestionRef.current(idx);
      }
    })();
  }, [aiLoading, suggestions.length, attachedIdxs, pendingIdx]);

  const addManual = useMutation({
    mutationFn: async () => {
      const url = manualUrl.trim();
      if (!url) throw new Error("Paste a product link first");
      try {
        new URL(url);
      } catch {
        throw new Error("That doesn't look like a valid URL");
      }
      if (!collection) throw new Error("Collection not loaded");
      const { data: userRes } = await supabase.auth.getUser();
      const userId = userRes.user?.id;
      if (!userId) throw new Error("Not signed in");
      let hostname = "New product";
      try {
        hostname = new URL(url).hostname.replace(/^www\./, "");
      } catch {
        /* keep default */
      }
      const title = collection.name ? `${collection.name} — ${hostname}` : hostname;
      const { error } = await supabase.from("storefront_products").insert({
        user_id: userId,
        storefront_id: collection.storefront_id,
        collection_id: collection.id,
        title,
        affiliate_url: url,
        image_url: imageUrl || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["collection-products", id] });
      setManualUrl("");
      toast.success("Product added to collection");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) {
    return (
      <AppShell title="Attach products" backButton hideBottomNav>
        <div className="grid place-items-center p-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </AppShell>
    );
  }

  if (!collection) {
    return (
      <AppShell title="Attach products" backButton hideBottomNav>
        <div className="rounded-2xl border border-dashed border-border bg-surface/40 p-12 text-center text-sm text-muted-foreground">
          Collection not found.
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      title={collection.name}
      subtitle="Attach products to this collection"
      backButton
      hideBottomNav
      hideNotifications
    >
      <div className="mx-auto max-w-2xl space-y-6 pb-32">
        {/* Visual scan preview */}
        {imageUrl ? (
          <div className="overflow-hidden rounded-2xl border border-border bg-surface-2/40">
            <div className="relative mx-auto aspect-[4/5] max-h-72 w-full">
              <img
                src={imageUrl}
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
        ) : (
          <div className="rounded-2xl border border-dashed border-border bg-surface-2/40 p-6 text-center text-xs text-muted-foreground">
            Add a cover photo to this collection to run visual search.
          </div>
        )}

        {/* Manual link */}
        <div>
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
            onClick={() => addManual.mutate()}
            disabled={addManual.isPending || !manualUrl.trim()}
            className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-primary/10 px-4 py-2 text-sm font-semibold text-primary transition hover:bg-primary/15 disabled:opacity-50"
          >
            {addManual.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            Add product
          </button>
        </div>

        {/* Our Recommendation */}
        <div>
          <div className="flex items-center justify-between">
            <h5 className="flex items-center gap-1.5 text-sm font-semibold">
              <Wand2 className="h-4 w-4 text-primary" />
              Our Recommendation
            </h5>
            <div className="flex items-center gap-2">
              {suggestions.length > 0 && (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                  {attachedIdxs.size} attached
                </span>
              )}
              <button
                onClick={() => refetchAI()}
                disabled={aiLoading || !imageUrl}
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
                  </div>
                </div>
              ))
            ) : suggestions.length === 0 ? (
              <p className="col-span-full rounded-xl border border-dashed border-border bg-surface-2/40 p-4 text-center text-xs text-muted-foreground">
                No suggestions yet.
              </p>
            ) : (
              suggestions.map((s, idx) => {
                const isAttached = attachedIdxs.has(idx);
                const isPending = pendingIdx.has(idx);
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => attachSuggestion(idx)}
                    disabled={isPending || isAttached}
                    className={`group relative flex h-full flex-col overflow-hidden rounded-xl border bg-surface text-left transition hover:-translate-y-0.5 hover:shadow-elevate disabled:opacity-70 ${
                      isAttached
                        ? "border-primary ring-2 ring-primary"
                        : "border-primary/30 hover:border-primary/60"
                    }`}
                  >
                    <div className="relative aspect-square w-full overflow-hidden bg-primary/10">
                      <img
                        src={`https://loremflickr.com/400/400/${encodeURIComponent(s.query)}?lock=${idx + 1}`}
                        alt={s.title}
                        loading="lazy"
                        className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]"
                      />
                    </div>
                    {isPending ? (
                      <span className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full bg-primary/80 text-primary-foreground shadow">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      </span>
                    ) : isAttached ? (
                      <span className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full bg-primary text-primary-foreground shadow">
                        <Check className="h-3.5 w-3.5" strokeWidth={3} />
                      </span>
                    ) : null}
                    <div className="flex flex-1 flex-col gap-1.5 p-2.5">
                      <h3 className="line-clamp-2 text-[12px] font-semibold leading-snug text-foreground">
                        {s.title}
                      </h3>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Already in this collection */}
        {products.length > 0 && (
          <div>
            <h5 className="flex items-center gap-1.5 text-sm font-semibold">
              <Store className="h-4 w-4 text-primary" />
              In this collection
              <span className="ml-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                {products.length}
              </span>
            </h5>
            <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              {products.map((p) => (
                <div
                  key={p.id}
                  className="overflow-hidden rounded-xl border border-border bg-surface"
                >
                  <div className="relative aspect-square w-full overflow-hidden bg-primary/10">
                    {p.image_url ? (
                      <img
                        src={p.image_url}
                        alt={p.title}
                        loading="lazy"
                        className="absolute inset-0 h-full w-full object-cover"
                      />
                    ) : (
                      <div className="absolute inset-0 grid place-items-center text-muted-foreground">
                        <ImageIcon className="h-8 w-8" />
                      </div>
                    )}
                  </div>
                  <div className="p-2.5">
                    <h3 className="line-clamp-2 text-[12px] font-semibold leading-snug text-foreground">
                      {p.title}
                    </h3>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Sticky Done */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-background/95 px-4 py-3 backdrop-blur-xl">
        <div className="mx-auto flex max-w-2xl items-center justify-end">
          <button
            onClick={() => navigate({ to: "/storefront" })}
            className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-glow transition active:scale-[0.98]"
          >
            Done <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </AppShell>
  );
}

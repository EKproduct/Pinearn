import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { ProductCard } from "@/components/product-card";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useMemo } from "react";
import {
  Loader2,
  Rocket,
} from "lucide-react";
import { toast } from "sonner";
import { SuggestionCard, type SuggestionPrice } from "@/components/suggestion-card";
import { goLivePin } from "@/lib/pinterest.functions";


export const Route = createFileRoute("/_authenticated/pins_/preview")({
  validateSearch: (s: Record<string, unknown>) => ({
    pinId: typeof s.pinId === "string" ? s.pinId : "",
  }),
  component: PinPreviewPage,
});

type Pin = {
  id: string;
  title: string;
  image_url: string | null;
  external_url: string | null;
  storefront_id: string | null;
  collection_id: string | null;
};
type Storefront = { id: string; name: string; slug: string };
type Product = {
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
type AIPick = { title: string; url: string; image: string | null; source: string; price: SuggestionPrice };

function PinPreviewPage() {
  const { pinId } = Route.useSearch();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const runGoLive = useServerFn(goLivePin);




  const { data: pin, isLoading: pinLoading } = useQuery({
    queryKey: ["pin", pinId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pins")
        .select("id,title,image_url,external_url,storefront_id,collection_id")
        .eq("id", pinId)
        .maybeSingle();
      if (error) throw error;
      return data as Pin | null;
    },
    enabled: !!pinId,
  });

  const { data: storefront } = useQuery({
    queryKey: ["storefront", pin?.storefront_id],
    queryFn: async () => {
      if (!pin?.storefront_id) return null;
      const { data } = await supabase
        .from("storefronts")
        .select("id,name,slug")
        .eq("id", pin.storefront_id)
        .maybeSingle();
      return (data ?? null) as Storefront | null;
    },
    enabled: !!pin?.storefront_id,
  });

  const stash = useMemo<{ productIds: string[]; aiPicks: AIPick[] }>(() => {
    if (!pinId) return { productIds: [], aiPicks: [] };
    try {
      const raw = sessionStorage.getItem(`pin-preview:${pinId}`);
      if (!raw) return { productIds: [], aiPicks: [] };
      const parsed = JSON.parse(raw);
      return {
        productIds: Array.isArray(parsed.productIds) ? parsed.productIds : [],
        aiPicks: Array.isArray(parsed.aiPicks) ? parsed.aiPicks : [],
      };
    } catch {
      return { productIds: [], aiPicks: [] };
    }
  }, [pinId]);

  const { data: selectedProducts = [] } = useQuery({
    queryKey: ["selected-products", stash.productIds.join(",")],
    queryFn: async () => {
      if (stash.productIds.length === 0) return [];
      const { data } = await supabase
        .from("storefront_products")
        .select("id,title,affiliate_url,image_url,price_cents,currency,commission_pct,storefront_id,collection_id")
        .in("id", stash.productIds);
      return (data ?? []) as Product[];
    },
  });



  const goLive = useMutation({
    mutationFn: async () => {
      if (!pin || !storefront) throw new Error("Pin not ready");
      // Real Go Live path, shared with board-level bulk monetization — see
      // performGoLive() in pinterest.functions.ts.
      return runGoLive({
        data: {
          pinId: pin.id,
          origin: window.location.origin,
          existingProductIds: stash.productIds,
          newProducts: stash.aiPicks.map((a) => ({
            title: a.title,
            affiliateUrl: a.url,
            imageUrl: a.image,
          })),
        },
      });
    },
    onSuccess: ({ externalUrl }) => {
      qc.invalidateQueries({ queryKey: ["pins"] });
      qc.invalidateQueries({ queryKey: ["collections"] });
      qc.invalidateQueries({ queryKey: ["all-products"] });
      try {
        sessionStorage.removeItem(`pin-preview:${pinId}`);
      } catch {
        /* ignore */
      }
      toast.success("Pin is live", {
        action: {
          label: "Cancel",
          onClick: async () => {
            const { error } = await supabase
              .from("pins")
              .update({ status: "draft" })
              .eq("id", pinId);
            if (error) {
              toast.error("Failed to cancel: " + error.message);
              return;
            }
            qc.invalidateQueries({ queryKey: ["pins"] });
            toast.success("Pin reverted to draft", {
              action: {
                label: "Cancel",
                onClick: async () => {
                  const { error } = await supabase
                    .from("pins")
                    .update({ status: "live" })
                    .eq("id", pinId);
                  if (error) {
                    toast.error("Failed to cancel: " + error.message);
                    return;
                  }
                  qc.invalidateQueries({ queryKey: ["pins"] });
                  toast.success("Pin is live");
                },
              },
            });
          },
        },
      });
      navigate({ to: "/pins", search: {} as never });
    },
    onError: (e: Error) => toast.error(e.message),
  });


  if (!pinId) {
    return (
      <AppShell title="Preview" backButton hideNotifications hideBottomNav>
        <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          No pin selected.
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Preview"
      subtitle="Choose where this pin should live, then push it live."
      backButton
      hideNotifications
      hideBottomNav
    >
      {pinLoading || !pin ? (
        <div className="grid place-items-center py-20 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : (
        <div className="mx-auto max-w-xs pb-24 md:pb-8">
          {/* Pin preview — image + attached products in one card, as the viewer sees it */}
          <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
            <div className="relative aspect-[4/5] w-full bg-gradient-to-br from-rose-500 to-pink-600">
              {pin.image_url && (
                <img
                  src={pin.image_url}
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover"
                />
              )}
            </div>
            <div className="p-4">
              <h2 className="hidden">{pin.title}</h2>

              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Products on this pin</h3>
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                  {selectedProducts.length + stash.aiPicks.length} items
                </span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                {selectedProducts.map((p) => (
                  <ProductCard key={p.id} product={p} brand={storefront?.name} />
                ))}
                {stash.aiPicks.map((a, i) => (
                  <SuggestionCard
                    key={`ai-${i}`}
                    title={a.title}
                    thumbnail={a.image}
                    source={a.source}
                    link={a.url}
                    price={a.price}
                  />
                ))}
                {selectedProducts.length + stash.aiPicks.length === 0 && (
                  <p className="col-span-full rounded-xl border border-dashed border-border bg-surface-2/40 p-4 text-center text-xs text-muted-foreground">
                    No products attached.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}


      {/* Sticky Go live button */}
      {pin && (
        <div
          className="fixed inset-x-0 bottom-0 z-50 border-t border-border/60 bg-surface/95 px-3 pt-2 shadow-[0_-12px_30px_rgba(0,0,0,0.12)] backdrop-blur"
          style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
        >
          {selectedProducts.length + stash.aiPicks.length === 0 && (
            <p className="mx-auto max-w-2xl pb-1.5 text-center text-[11px] text-muted-foreground">
              Attach at least one product to go live.
            </p>
          )}
          <div className="mx-auto flex max-w-2xl">
            <button
              onClick={() => goLive.mutate()}
              disabled={goLive.isPending || selectedProducts.length + stash.aiPicks.length === 0}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-gradient-primary px-3 py-3 text-sm font-semibold text-primary-foreground shadow-glow transition disabled:opacity-50"
            >
              {goLive.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Rocket className="h-4 w-4" />
              )}
              <span>Go live</span>
            </button>
          </div>
        </div>
      )}

    </AppShell>
  );
}

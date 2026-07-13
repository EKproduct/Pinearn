import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import {
  Upload,
  Image as ImageIcon,
  Loader2,
  Check,
  ChevronRight,
  Sparkles,
  Store,
  Link2,
  Plus,
  Wand2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { supabase } from "@/integrations/supabase/client";
import { visualSearchImage } from "@/lib/pinterest.functions";
import type { Collection, Product, Storefront } from "./pins";

export const Route = createFileRoute("/_authenticated/pins_/create")({
  component: CreatePinWizard,
});

type Step = 1 | 2 | 3 | 4;

const STEP_LABELS: Record<Step, string> = {
  1: "Upload image",
  2: "Add details",
  3: "Pick products",
  4: "Publish",
};

function CreatePinWizard() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [step, setStep] = useState<Step>(1);

  // form state
  const [imageUrl, setImageUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  
  const [storefrontId, setStorefrontId] = useState<string>("");
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const { data: storefronts = [] } = useQuery({
    queryKey: ["storefronts"],
    queryFn: async () => {
      const { data } = await supabase.from("storefronts").select("id,name,slug");
      return (data ?? []) as Storefront[];
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

  const { data: products = [] } = useQuery({
    queryKey: ["all-products"],
    queryFn: async () => {
      const { data } = await supabase
        .from("storefront_products")
        .select(
          "id,title,affiliate_url,image_url,price_cents,currency,commission_pct,storefront_id,collection_id",
        );
      return (data ?? []) as Product[];
    },
  });

  const selectedProducts = products.filter((p) => selectedProductIds.includes(p.id));
  // Use the first selected product's storefront so the pin still links to a shop.
  const derivedStorefrontId = selectedProducts[0]?.storefront_id ?? storefrontId ?? "";
  const activeStorefront = storefronts.find((s) => s.id === derivedStorefrontId);

  // Keep storefrontId in sync with the picked products.
  useEffect(() => {
    if (selectedProducts[0]?.storefront_id && selectedProducts[0].storefront_id !== storefrontId) {
      setStorefrontId(selectedProducts[0].storefront_id);
    }
  }, [selectedProducts, storefrontId]);

  async function handleUpload(file: File) {
    if (!file.type.startsWith("image/")) return toast.error("Please choose an image file");
    if (file.size > 10 * 1024 * 1024) return toast.error("Max file size is 10 MB");
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

  const publish = useMutation({
    mutationFn: async () => {
      // Simulate Pinterest publish latency
      await new Promise((r) => setTimeout(r, 1200));

      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes.user!.id;
      const primaryProduct = selectedProducts[0];
      const external = activeStorefront
        ? `${window.location.origin}/s/${activeStorefront.slug}`
        : primaryProduct?.affiliate_url || null;

      const { error } = await supabase.from("pins").insert({
        user_id: uid,
        title: title.trim() || "Untitled pin",
        description: description.trim() || null,
        image_url: imageUrl || null,
        storefront_id: derivedStorefrontId || null,
        product_id: primaryProduct?.id ?? null,
        external_url: external,
        status: "live",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pins"] });
      toast.success("Pin published to Pinterest");
      navigate({ to: "/pins" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function next() {
    if (step === 1 && !imageUrl) return toast.error("Upload an image to continue");
    if (step === 2 && !title.trim()) return toast.error("Add a title");
    if (step === 3 && selectedProductIds.length === 0)
      return toast.error("Pick at least one product");
    setStep((s) => (s < 4 ? ((s + 1) as Step) : s));
  }

  return (
    <AppShell title="Create pin" subtitle={STEP_LABELS[step]} backButton hideNotifications hideBottomNav>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleUpload(f);
          e.target.value = "";
        }}
      />

      {/* Stepper */}
      <div className="mx-auto mb-6 flex max-w-2xl items-center gap-2">
        {([1, 2, 3, 4] as Step[]).map((n, i) => {
          const done = step > n;
          const active = step === n;
          return (
            <div key={n} className="flex flex-1 items-center gap-2">
              <div
                className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-bold ring-2 transition ${
                  done
                    ? "bg-primary text-primary-foreground ring-primary"
                    : active
                      ? "bg-primary/10 text-primary ring-primary"
                      : "bg-surface-2 text-muted-foreground ring-border"
                }`}
              >
                {done ? <Check className="h-4 w-4" /> : n}
              </div>
              {i < 3 && (
                <div
                  className={`h-0.5 flex-1 rounded transition ${done ? "bg-primary" : "bg-border"}`}
                />
              )}
            </div>
          );
        })}
      </div>

      <div className="mx-auto max-w-2xl pb-32">
        {step === 1 && (
          <StepImage
            imageUrl={imageUrl}
            uploading={uploading}
            onPick={() => fileRef.current?.click()}
            onClear={() => setImageUrl("")}
          />
        )}
        {step === 2 && (
          <StepDetails
            imageUrl={imageUrl}
            title={title}
            setTitle={setTitle}
            description={description}
            setDescription={setDescription}
          />
        )}
        {step === 3 && (
          <StepProducts
            imageUrl={imageUrl}
            title={title}
            description={description}
            storefronts={storefronts}
            preferredStorefrontId={derivedStorefrontId}
            products={products}
            selectedIds={selectedProductIds}
            toggle={(id) =>
              setSelectedProductIds((cur) =>
                cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id],
              )
            }
          />
        )}
        {step === 4 && (
          <StepReview
            imageUrl={imageUrl}
            title={title}
            description={description}
            storefront={activeStorefront}
            products={selectedProducts}
          />
        )}
      </div>

      {/* Sticky footer */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-background/95 px-4 py-3 backdrop-blur-xl">
        <div className="mx-auto flex max-w-2xl items-center justify-end gap-3">
          {step < 4 ? (
            <button
              onClick={next}
              className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-glow transition active:scale-[0.98]"
            >
              Next <ChevronRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              onClick={() => publish.mutate()}
              disabled={publish.isPending}
              className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-glow transition active:scale-[0.98] disabled:opacity-70"
            >
              {publish.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              Publish to Pinterest
            </button>
          )}
        </div>
      </div>
    </AppShell>
  );
}

function StepImage({
  imageUrl,
  uploading,
  onPick,
  onClear,
}: {
  imageUrl: string;
  uploading: boolean;
  onPick: () => void;
  onClear: () => void;
}) {
  return (
    <div className="space-y-4">
      <h2 className="font-display text-xl font-bold">Add a photo</h2>
      <p className="text-sm text-muted-foreground">
        Vertical images (2:3) perform best on Pinterest.
      </p>
      {imageUrl ? (
        <div className="relative overflow-hidden rounded-3xl border border-border bg-surface">
          <img src={imageUrl} alt="" className="max-h-[520px] w-full object-contain" />
          <button
            onClick={onClear}
            className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-background/90 text-foreground shadow-elevate"
            aria-label="Remove image"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <button
          onClick={onPick}
          disabled={uploading}
          className="flex aspect-[3/4] w-full flex-col items-center justify-center gap-3 rounded-3xl border-2 border-dashed border-border bg-surface/40 p-6 text-center transition hover:border-primary hover:bg-primary/5 disabled:opacity-70"
        >
          {uploading ? (
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          ) : (
            <>
              <div className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
                <Upload className="h-6 w-6" />
              </div>
              <div>
                <div className="font-semibold">Tap to upload</div>
                <div className="text-xs text-muted-foreground">JPG or PNG · up to 10 MB</div>
              </div>
            </>
          )}
        </button>
      )}
    </div>
  );
}

function StepDetails({
  imageUrl,
  title,
  setTitle,
  description,
  setDescription,
}: {
  imageUrl: string;
  title: string;
  setTitle: (v: string) => void;
  description: string;
  setDescription: (v: string) => void;
}) {
  return (
    <div className="space-y-5">
      <h2 className="font-display text-xl font-bold">Pin details</h2>
      <div className="flex gap-4">
        {imageUrl && (
          <img
            src={imageUrl}
            alt=""
            className="hidden h-40 w-32 shrink-0 rounded-2xl object-cover ring-1 ring-border sm:block"
          />
        )}
        <div className="flex-1 space-y-4">
          <Field label="Title" hint={`${title.length}/100`}>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value.slice(0, 100))}
              placeholder="Add a catchy title"
              className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none focus:border-primary"
            />
          </Field>
          <Field label="Description" hint={`${description.length}/500`}>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value.slice(0, 500))}
              placeholder="Tell people about your pin"
              rows={4}
              className="w-full resize-none rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none focus:border-primary"
            />
          </Field>
        </div>
      </div>
    </div>
  );
}

function StepProducts({
  imageUrl,
  title,
  description,
  storefronts,
  preferredStorefrontId,
  products,
  selectedIds,
  toggle,
}: {
  imageUrl: string;
  title: string;
  description: string;
  storefronts: Storefront[];
  preferredStorefrontId: string;
  products: Product[];
  selectedIds: string[];
  toggle: (id: string) => void;
}) {
  const qc = useQueryClient();
  const runVisualSearch = useServerFn(visualSearchImage);
  
  const [manualUrl, setManualUrl] = useState("");
  const [aiProductIds, setAiProductIds] = useState<Record<number, string>>({});
  const [manualProductIds, setManualProductIds] = useState<Set<string>>(new Set());
  const [pendingAI, setPendingAI] = useState<Set<number>>(new Set());
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const {
    data: aiData,
    isFetching: aiLoading,
    refetch: refetchAI,
  } = useQuery({
    queryKey: ["visual-search-image", imageUrl, title],
    queryFn: () => runVisualSearch({ data: { imageUrl, title, description } }),
    enabled: !!imageUrl,
    staleTime: 5 * 60_000,
  });
  const suggestions: Array<{ title: string; query: string; reason?: string }> =
    aiData?.suggestions ?? [];

  // Reset AI selection tracking when a fresh set of suggestions arrives.
  useEffect(() => {
    setAiProductIds({});
    setPendingAI(new Set());
  }, [aiData]);

  const aiLinkFor = (s: { query: string }) =>
    `https://www.amazon.in/s?k=${encodeURIComponent(s.query)}`;

  const checkedAI = new Set<number>(
    Object.entries(aiProductIds)
      .filter(([, id]) => selectedIds.includes(id))
      .map(([idx]) => Number(idx)),
  );

  const toggleAI = async (idx: number) => {
    const existingId = aiProductIds[idx];
    if (existingId) {
      if (selectedIds.includes(existingId)) toggle(existingId);
      else toggle(existingId);
      return;
    }
    if (pendingAI.has(idx)) return;
    const s = suggestions[idx];
    if (!s) return;
    const targetStorefront = preferredStorefrontId || storefronts[0]?.id;
    if (!targetStorefront) {
      toast.error("Create a storefront first.");
      return;
    }
    setPendingAI((prev) => new Set(prev).add(idx));
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const userId = userRes.user?.id;
      if (!userId) throw new Error("Not signed in");
      const { data: inserted, error } = await supabase
        .from("storefront_products")
        .insert({
          user_id: userId,
          storefront_id: targetStorefront,
          title: s.title,
          affiliate_url: aiLinkFor(s),
          image_url: `https://loremflickr.com/400/400/${encodeURIComponent(s.query)}?lock=${idx + 1}`,
        })
        .select("id")
        .single();
      if (error) throw error;
      setAiProductIds((prev) => ({ ...prev, [idx]: inserted.id as string }));
      toggle(inserted.id as string);
      qc.invalidateQueries({ queryKey: ["all-products"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPendingAI((prev) => {
        const next = new Set(prev);
        next.delete(idx);
        return next;
      });
    }
  };


  const toggleAIRef = useRef(toggleAI);
  toggleAIRef.current = toggleAI;

  useEffect(() => {
    if (aiLoading || suggestions.length === 0) return;
    if (Object.keys(aiProductIds).length > 0) return;
    if (pendingAI.size > 0) return;

    (async () => {
      for (let idx = 0; idx < suggestions.length; idx++) {
        if (!mountedRef.current) break;
        await toggleAIRef.current(idx);
      }
    })();
  }, [aiLoading, suggestions.length, aiProductIds, pendingAI]);

  const addProduct = useMutation({
    mutationFn: async () => {
      const url = manualUrl.trim();
      if (!url) throw new Error("Paste a product link first");
      try {
        new URL(url);
      } catch {
        throw new Error("That doesn't look like a valid URL");
      }
      const targetStorefront = preferredStorefrontId || storefronts[0]?.id;
      if (!targetStorefront) throw new Error("Create a storefront first.");

      const normalize = (u: string) => u.trim().replace(/\/+$/, "").toLowerCase();
      const existing = products.find(
        (p) => normalize(p.affiliate_url) === normalize(url),
      );
      if (existing) return { id: existing.id, duplicate: true as const };

      const { data: userRes } = await supabase.auth.getUser();
      const userId = userRes.user?.id;
      if (!userId) throw new Error("Not signed in");
      let hostname = "New product";
      try {
        hostname = new URL(url).hostname.replace(/^www\./, "");
      } catch {
        /* keep default */
      }
      const productTitle = title ? `${title} — ${hostname}` : hostname;
      const { data: inserted, error } = await supabase
        .from("storefront_products")
        .insert({
          user_id: userId,
          storefront_id: targetStorefront,
          title: productTitle,
          affiliate_url: url,
          image_url: imageUrl || null,
        })
        .select("id")
        .single();
      if (error) throw error;
      return { id: inserted.id as string, duplicate: false as const };
    },
    onSuccess: ({ id, duplicate }) => {
      qc.invalidateQueries({ queryKey: ["all-products"] });
      if (!selectedIds.includes(id)) toggle(id);
      setManualProductIds((prev) => new Set(prev).add(id));
      setManualUrl("");
      toast.success(
        duplicate ? "Already in Your products — selected" : "Added to Your products",
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      {/* Visual scan preview */}
      {imageUrl && (
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
              const isPending = pendingAI.has(idx);
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => toggleAI(idx)}
                  disabled={isPending}
                  className={`group relative flex h-full flex-col overflow-hidden rounded-xl border bg-surface text-left transition hover:-translate-y-0.5 hover:shadow-elevate disabled:opacity-70 ${
                    isChecked
                      ? "border-primary ring-2 ring-primary"
                      : "border-primary/30 hover:border-primary/60"
                  }`}
                >
                  <a
                    href={aiLinkFor(s)}
                    target="_blank"
                    rel="noreferrer noopener"
                    onClick={(e) => e.stopPropagation()}
                    className="relative aspect-square w-full overflow-hidden bg-primary/10"
                  >
                    <img
                      src={`https://loremflickr.com/400/400/${encodeURIComponent(s.query)}?lock=${idx + 1}`}
                      alt={s.title}
                      loading="lazy"
                      className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]"
                    />
                  </a>
                  {isPending ? (
                    <span className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full bg-primary/80 text-primary-foreground shadow">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    </span>
                  ) : isChecked ? (
                    <span className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full bg-primary text-primary-foreground shadow">
                      <Check className="h-3.5 w-3.5" strokeWidth={3} />
                    </span>
                  ) : null}
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
      </div>

      {/* Products */}
      {manualProductIds.size > 0 && (
        <div>
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
            {products
              .filter((p) => manualProductIds.has(p.id))
              .map((p) => {
                const isChecked = selectedIds.includes(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => toggle(p.id)}
                    className={`group relative flex h-full flex-col overflow-hidden rounded-xl border bg-surface text-left transition hover:-translate-y-0.5 hover:shadow-elevate ${
                      isChecked
                        ? "border-primary ring-2 ring-primary"
                        : "border-primary/30 hover:border-primary/60"
                    }`}
                  >
                    <a
                      href={p.affiliate_url}
                      target="_blank"
                      rel="noreferrer noopener"
                      onClick={(e) => e.stopPropagation()}
                      className="relative aspect-square w-full overflow-hidden bg-primary/10"
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
                    </a>
                    {isChecked ? (
                      <span className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full bg-primary text-primary-foreground shadow">
                        <Check className="h-3.5 w-3.5" strokeWidth={3} />
                      </span>
                    ) : null}
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
  );
}


function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
        active
          ? "bg-primary text-primary-foreground shadow-glow"
          : "bg-surface-2 text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function StepReview({
  imageUrl,
  title,
  description,
  storefront,
  products,
}: {
  imageUrl: string;
  title: string;
  description: string;
  storefront: Storefront | undefined;
  products: Product[];
}) {
  return (
    <div className="space-y-5">
      <h2 className="font-display text-xl font-bold">Ready to publish</h2>
      <div className="overflow-hidden rounded-3xl border border-border bg-surface">
        {imageUrl && <img src={imageUrl} alt="" className="max-h-[420px] w-full object-cover" />}
        <div className="space-y-3 p-5">
          <h3 className="font-display text-lg font-bold">{title || "Untitled pin"}</h3>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
          {storefront && (
            <div className="flex items-center gap-2 rounded-xl bg-primary/5 px-3 py-2 text-xs font-medium text-primary">
              <Store className="h-4 w-4" /> {storefront.name}
              {products.length > 0 && (
                <span className="text-primary/70">· {products.length} product{products.length === 1 ? "" : "s"}</span>
              )}
            </div>
          )}
        </div>
      </div>
      {products.length > 0 && (
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Attached products
          </div>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {products.map((p) => (
              <div key={p.id} className="w-28 shrink-0">
                <div className="aspect-square w-full overflow-hidden rounded-xl bg-surface-2 ring-1 ring-border">
                  {p.image_url && (
                    <img src={p.image_url} alt="" className="h-full w-full object-cover" />
                  )}
                </div>
                <div className="mt-1 line-clamp-2 text-[11px] font-medium">{p.title}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-sm font-medium">{label}</span>
        {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
      </div>
      {children}
    </label>
  );
}

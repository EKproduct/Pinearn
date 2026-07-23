import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import {
  Upload,
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
import {
  SuggestionCard,
  ProgressiveSuggestionCard,
  realProductPrice,
} from "@/components/suggestion-card";
import { EducationalLoader, HINTS } from "@/components/rotating-hint";
import { AppShell } from "@/components/app-shell";
import { supabase } from "@/integrations/supabase/client";
import { hostBrand } from "@/lib/brands";
import { getFriendlyMessage } from "@/lib/friendly-error";
import {
  visualSearchImage,
  createPinterestPin,
  type CkResult,
  type RawVisualMatch,
} from "@/lib/pinterest.functions";
import type { Collection, Product, Storefront } from "./pins";

type PinterestBoard = { id: string; name: string };

export const Route = createFileRoute("/_authenticated/pins_/create")({
  // The Health Score "Add Fresh Pins" action deep-links here pre-filtered to
  // a board (collection id) with no recent activity.
  validateSearch: (s: Record<string, unknown>): { board?: string } => ({
    board: typeof s.board === "string" ? s.board : undefined,
  }),
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
  const { board: boardFromSearch } = Route.useSearch();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [step, setStep] = useState<Step>(1);

  // form state
  const [imageUrl, setImageUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [titleError, setTitleError] = useState<string | null>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);

  const [storefrontId, setStorefrontId] = useState<string>("");
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [boardId, setBoardId] = useState<string>("");
  const fileRef = useRef<HTMLInputElement | null>(null);
  const runCreatePinterestPin = useServerFn(createPinterestPin);

  const { data: boards = [] } = useQuery({
    queryKey: ["pinterest-boards"],
    queryFn: async () => {
      const { data: userRes } = await supabase.auth.getUser();
      const userId = userRes.user?.id;
      if (!userId) return [];
      const { data } = await supabase
        .from("collections")
        .select("id,name,pinterest_board_id")
        .eq("user_id", userId)
        .not("pinterest_board_id", "is", null)
        .order("position", { ascending: true });
      return ((data ?? []) as { id: string; name: string }[]).map((c) => ({
        id: c.id,
        name: c.name,
      })) as PinterestBoard[];
    },
  });

  useEffect(() => {
    if (boardId || boards.length === 0) return;
    // A deep-linked stale board (Health Score freshness fix) wins over the
    // default first-board pick.
    const linked = boardFromSearch && boards.find((b) => b.id === boardFromSearch);
    setBoardId(linked ? linked.id : boards[0].id);
  }, [boards, boardId, boardFromSearch]);

  const { data: storefronts = [] } = useQuery({
    queryKey: ["storefronts"],
    queryFn: async () => {
      const { data: userRes } = await supabase.auth.getUser();
      const userId = userRes.user?.id;
      if (!userId) return [];
      const { data } = await supabase
        .from("storefronts")
        .select("id,name,slug")
        .eq("user_id", userId);
      return (data ?? []) as Storefront[];
    },
  });

  const { data: collections = [] } = useQuery({
    queryKey: ["collections"],
    queryFn: async () => {
      const { data: userRes } = await supabase.auth.getUser();
      const userId = userRes.user?.id;
      if (!userId) return [];
      const { data } = await supabase
        .from("collections")
        .select("id,name,slug")
        .eq("user_id", userId)
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
      toast.error(getFriendlyMessage(e));
    } finally {
      setUploading(false);
    }
  }

  const publish = useMutation({
    mutationFn: async () => {
      if (!boardId) throw new Error("Sync a Pinterest board from Storefront first");
      if (!imageUrl) throw new Error("Add an image first");

      const primaryProduct = selectedProducts[0];
      const external = activeStorefront
        ? `${window.location.origin}/s/${activeStorefront.slug}`
        : primaryProduct?.affiliate_url || undefined;

      await runCreatePinterestPin({
        data: {
          collectionId: boardId,
          title: title.trim() || "Untitled pin",
          description: description.trim() || undefined,
          imageUrl,
          link: external,
          productId: primaryProduct?.id,
        },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pins"] });
      toast.success("Pin published to Pinterest");
      navigate({ to: "/pins" });
    },
    onError: (e: Error) => toast.error(getFriendlyMessage(e)),
  });

  function next() {
    if (step === 1 && !imageUrl) return toast.error("Upload an image to continue");
    if (step === 2 && !title.trim()) {
      setTitleError("Add a title");
      titleInputRef.current?.focus();
      return toast.error("Add a title");
    }
    if (step === 3 && selectedProductIds.length === 0)
      return toast.error("Pick at least one product");
    setStep((s) => (s < 4 ? ((s + 1) as Step) : s));
  }

  return (
    <AppShell
      title="Create pin"
      subtitle={STEP_LABELS[step]}
      backButton
      backTo="/pins"
      hideBottomNav
    >
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
            titleError={titleError}
            setTitleError={setTitleError}
            titleInputRef={titleInputRef}
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
            boards={boards}
            boardId={boardId}
            setBoardId={setBoardId}
          />
        )}
      </div>

      {/* Sticky footer */}
      <div
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-background/95 px-5 py-3 backdrop-blur-xl"
        style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      >
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
              disabled={publish.isPending || !boardId}
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
  const [imgLoaded, setImgLoaded] = useState(false);
  return (
    <div className="space-y-4">
      <h2 className="font-display text-xl font-bold">Add a photo</h2>
      <p className="text-sm text-muted-foreground">
        Vertical images (2:3) perform best on Pinterest.
      </p>
      {imageUrl ? (
        <div className="relative overflow-hidden rounded-3xl border border-border bg-surface">
          <img
            key={imageUrl}
            src={imageUrl}
            alt=""
            loading="lazy"
            onLoad={() => setImgLoaded(true)}
            className={`max-h-[520px] w-full object-contain opacity-0 transition-opacity duration-300 ${
              imgLoaded ? "opacity-100" : ""
            }`}
          />
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
  titleError,
  setTitleError,
  titleInputRef,
}: {
  imageUrl: string;
  title: string;
  setTitle: (v: string) => void;
  description: string;
  setDescription: (v: string) => void;
  titleError: string | null;
  setTitleError: (v: string | null) => void;
  titleInputRef: React.RefObject<HTMLInputElement | null>;
}) {
  const [imgLoaded, setImgLoaded] = useState(false);
  return (
    <div className="space-y-5">
      <h2 className="font-display text-xl font-bold">Pin details</h2>
      <div className="flex gap-4">
        {imageUrl && (
          <img
            key={imageUrl}
            src={imageUrl}
            alt=""
            loading="lazy"
            onLoad={() => setImgLoaded(true)}
            className={`hidden h-40 w-32 shrink-0 rounded-2xl object-cover opacity-0 ring-1 ring-border transition-opacity duration-300 sm:block ${
              imgLoaded ? "opacity-100" : ""
            }`}
          />
        )}
        <div className="flex-1 space-y-4">
          <div>
            <Field label="Title" hint={`${title.length}/100`}>
              <input
                ref={titleInputRef}
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value.slice(0, 100));
                  if (titleError) setTitleError(null);
                }}
                placeholder="Add a catchy title"
                className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none focus:border-primary"
              />
            </Field>
            {titleError && (
              <p className="mt-1 text-xs font-medium text-destructive">{titleError}</p>
            )}
          </div>
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
  const [productUrlError, setProductUrlError] = useState<string | null>(null);
  const manualUrlInputRef = useRef<HTMLInputElement>(null);
  const [previewLoaded, setPreviewLoaded] = useState(false);
  // Keyed by link (stable identity for a progressive-rendering match),
  // not index — the real storefront_products row id once auto-inserted.
  const [aiProductIds, setAiProductIds] = useState<Record<string, string>>({});
  const [manualProductIds, setManualProductIds] = useState<Set<string>>(new Set());
  const mountedRef = useRef(true);
  // Guards against double-inserting the same suggestion — plain ref (not
  // state) since it only needs to block a duplicate call, never render.
  const insertingLinksRef = useRef<Set<string>>(new Set());

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
    // title/description ride along to the server fn but aren't used by the
    // actual search (it only ever searches by imageUrl) — keeping them out
    // of the key means editing the title text can't trigger a redundant
    // re-search of the same image.
    queryKey: ["visual-search-image", imageUrl],
    queryFn: () => runVisualSearch({ data: { imageUrl, title, description } }),
    enabled: !!imageUrl,
    // Results are already fully validated (real matches, live price+stock) —
    // never silently refetch this expensive pipeline in the background; a
    // manual refetchAI() call is the only way it runs again.
    staleTime: Infinity,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const suggestions = aiData?.suggestions ?? [];

  // Progressive rendering: `suggestions` paints immediately (image/title/
  // source + Lens price, no CK wait); each card resolves its live price/stock
  // independently via ProgressiveSuggestionCard. `confirmedByLink` records
  // each match's outcome the instant it settles — never present = still
  // resolving, `null` = no price from CK or Lens at all (rare).
  const [confirmedByLink, setConfirmedByLink] = useState<Map<string, CkResult>>(new Map());

  // Reset AI selection tracking when a fresh set of suggestions arrives.
  useEffect(() => {
    setAiProductIds({});
    setConfirmedByLink(new Map());
    insertingLinksRef.current = new Set();
  }, [aiData]);

  const checkedAI = new Set<string>(
    Object.entries(aiProductIds)
      .filter(([, id]) => selectedIds.includes(id))
      .map(([link]) => link),
  );

  // Auto-inserts one confirmed-available suggestion as a real
  // storefront_product — same "add every AI match automatically" behavior
  // as before, just triggered per-match the instant CK confirms it instead
  // of blindly looping over unconfirmed raw matches.
  const autoInsertSuggestion = async (s: RawVisualMatch) => {
    if (aiProductIds[s.link] || insertingLinksRef.current.has(s.link)) return;
    const targetStorefront = preferredStorefrontId || storefronts[0]?.id;
    if (!targetStorefront) {
      toast.error("Create a storefront first.");
      return;
    }
    insertingLinksRef.current.add(s.link);
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
          affiliate_url: s.link,
          image_url: s.thumbnail,
        })
        .select("id")
        .single();
      if (error) throw error;
      if (!mountedRef.current) return;
      setAiProductIds((prev) => ({ ...prev, [s.link]: inserted.id as string }));
      toggle(inserted.id as string);
      qc.invalidateQueries({ queryKey: ["all-products"] });
    } catch (e) {
      toast.error(getFriendlyMessage(e));
    } finally {
      insertingLinksRef.current.delete(s.link);
    }
  };

  const handleSuggestionSettled = (link: string, details: CkResult) => {
    setConfirmedByLink((prev) => {
      if (prev.has(link)) return prev;
      const next = new Map(prev);
      next.set(link, details);
      return next;
    });
    // Every match that resolved with a usable price (live CK figure or the
    // Lens fallback, in stock or not) is auto-attached — there's no
    // "unavailable" card to hold back anymore. Only a match with no price at
    // all (`details === null`) is skipped, since there'd be nothing to show.
    if (details) {
      const s = suggestions.find((m) => m.link === link);
      if (s) void autoInsertSuggestion(s);
    }
  };

  // Toggling an already-inserted suggestion just flips its selection; a
  // card can't be tapped before it's confirmed+inserted (ProgressiveSuggestionCard
  // only renders onToggle once resolved), so this is the common path.
  const toggleAI = (link: string) => {
    const existingId = aiProductIds[link];
    if (existingId) {
      toggle(existingId);
      return;
    }
    const s = suggestions.find((m) => m.link === link);
    if (s) void autoInsertSuggestion(s);
  };

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
      const existing = products.find((p) => normalize(p.affiliate_url) === normalize(url));
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
      setProductUrlError(null);
      toast.success(duplicate ? "Already in Your products — selected" : "Added to Your products");
    },
    onError: (e: Error) => {
      toast.error(getFriendlyMessage(e));
      setProductUrlError(e.message);
      manualUrlInputRef.current?.focus();
    },
  });

  return (
    <div className="space-y-6">
      {/* Visual scan preview */}
      {imageUrl && (
        <div className="overflow-hidden rounded-2xl border border-border bg-surface-2/40">
          <div className="relative mx-auto aspect-[4/5] max-h-72 w-full">
            <img
              key={imageUrl}
              src={imageUrl}
              alt=""
              loading="lazy"
              onLoad={() => setPreviewLoaded(true)}
              className={`absolute inset-0 h-full w-full object-cover opacity-0 transition-opacity duration-300 ${
                previewLoaded ? "opacity-100" : ""
              }`}
            />
            {aiLoading && suggestions.length === 0 && (
              <>
                <span className="pointer-events-none absolute inset-x-0 top-0 h-24 animate-scan bg-gradient-to-b from-primary/60 via-primary/20 to-transparent" />
                <span className="pointer-events-none absolute inset-0 ring-2 ring-inset ring-primary/50" />
              </>
            )}
            <div className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur">
              {aiLoading && suggestions.length === 0 ? (
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
            ref={manualUrlInputRef}
            type="url"
            value={manualUrl}
            onChange={(e) => {
              setManualUrl(e.target.value);
              if (productUrlError) setProductUrlError(null);
            }}
            placeholder="Paste an affiliate link…"
            className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
          />
        </div>
        {productUrlError && (
          <p className="mt-1 text-xs font-medium text-destructive">{productUrlError}</p>
        )}
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
        {aiLoading && suggestions.length === 0 ? (
          <div className="mt-3">
            <EducationalLoader label="Finding matching products…" hints={HINTS.createScan} />
          </div>
        ) : suggestions.length === 0 ? (
          <p className="mt-3 rounded-xl border border-dashed border-border bg-surface-2/40 p-4 text-center text-xs text-muted-foreground">
            No matching products found.
          </p>
        ) : (
          <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {suggestions.map((s) => (
              <ProgressiveSuggestionCard
                key={s.link}
                match={s}
                selected={checkedAI.has(s.link)}
                onToggle={() => toggleAI(s.link)}
                onSettled={handleSuggestionSettled}
              />
            ))}
          </div>
        )}
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
              .map((p) => (
                <SuggestionCard
                  key={p.id}
                  title={p.title}
                  thumbnail={p.image_url}
                  source={hostBrand(p.affiliate_url)}
                  link={p.affiliate_url}
                  price={realProductPrice(p.price_cents)}
                  commissionPct={p.commission_pct}
                  selected={selectedIds.includes(p.id)}
                  onToggle={() => toggle(p.id)}
                />
              ))}
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
  boards,
  boardId,
  setBoardId,
}: {
  imageUrl: string;
  title: string;
  description: string;
  storefront: Storefront | undefined;
  products: Product[];
  boards: PinterestBoard[];
  boardId: string;
  setBoardId: (id: string) => void;
}) {
  const [imgLoaded, setImgLoaded] = useState(false);
  return (
    <div className="space-y-5">
      <h2 className="font-display text-xl font-bold">Ready to publish</h2>

      <div>
        <label className="mb-1.5 block text-sm font-medium">Pinterest board</label>
        {boards.length === 0 ? (
          <div className="space-y-2 rounded-xl border border-dashed border-border bg-surface-2/40 p-3">
            <p className="text-xs text-muted-foreground">
              No synced boards yet — sync your Pinterest boards from Storefront first.
            </p>
            <Link
              to="/storefront"
              className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
            >
              Go to Storefront <ChevronRight className="h-3 w-3" />
            </Link>
          </div>
        ) : (
          <select
            value={boardId}
            onChange={(e) => setBoardId(e.target.value)}
            className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none focus:border-primary"
          >
            {boards.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="overflow-hidden rounded-3xl border border-border bg-surface">
        {imageUrl && (
          <img
            key={imageUrl}
            src={imageUrl}
            alt=""
            loading="lazy"
            onLoad={() => setImgLoaded(true)}
            className={`max-h-[420px] w-full object-cover opacity-0 transition-opacity duration-300 ${
              imgLoaded ? "opacity-100" : ""
            }`}
          />
        )}
        <div className="space-y-3 p-5">
          <h3 className="font-display text-lg font-bold">{title || "Untitled pin"}</h3>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
          {storefront && (
            <div className="flex items-center gap-2 rounded-xl bg-primary/5 px-3 py-2 text-xs font-medium text-primary">
              <Store className="h-4 w-4" /> {storefront.name}
              {products.length > 0 && (
                <span className="text-primary/70">
                  · {products.length} product{products.length === 1 ? "" : "s"}
                </span>
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
              <div key={p.id} className="h-56 w-36 shrink-0">
                <SuggestionCard
                  title={p.title}
                  thumbnail={p.image_url}
                  source={hostBrand(p.affiliate_url)}
                  link={p.affiliate_url}
                  price={realProductPrice(p.price_cents)}
                  commissionPct={p.commission_pct}
                />
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

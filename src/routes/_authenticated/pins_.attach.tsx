import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, Link2 } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { supabase } from "@/integrations/supabase/client";
import {
  GRADIENTS,
  RATIOS,
  PinDetailDialog,
  type Pin,
  type Collection,
  type Product,
} from "./pins";


export const Route = createFileRoute("/_authenticated/pins_/attach")({
  component: AttachPage,
  validateSearch: (search: Record<string, unknown>) => ({
    collection: typeof search.collection === "string" ? search.collection : undefined,
  }),
});

type Tab = "pins" | "boards";

function AttachPage() {
  const search = Route.useSearch();
  const [selectedPinId, setSelectedPinId] = useState<string | null>(null);
  const [dialogPinId, setDialogPinId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>(search.collection ? "boards" : "pins");
  const [activeBoardId, setActiveBoardId] = useState<string | null>(search.collection ?? null);


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

  const { data: products = [] } = useQuery({
    queryKey: ["all-products"],
    queryFn: async () => {
      const { data } = await supabase
        .from("storefront_products")
        .select("id,title,affiliate_url,image_url,price_cents,currency,commission_pct,storefront_id,collection_id");
      return (data ?? []) as Product[];
    },
  });




  const boards = useMemo(() => {
    const byId = new Map<string, { collection: Collection; pins: Pin[] }>();
    for (const c of collections) byId.set(c.id, { collection: c, pins: [] });
    const unassigned: Pin[] = [];
    for (const p of pins) {
      if (p.collection_id && byId.has(p.collection_id)) {
        byId.get(p.collection_id)!.pins.push(p);
      } else {
        unassigned.push(p);
      }
    }
    const list = Array.from(byId.values());
    if (unassigned.length > 0) {
      list.push({
        collection: { id: "__unassigned__", name: "Unassigned", slug: "unassigned" },
        pins: unassigned,
      });
    }
    return list;
  }, [pins, collections]);

  const activeBoard = boards.find((b) => b.collection.id === activeBoardId) ?? null;
  const dialogPin = pins.find((p) => p.id === dialogPinId) ?? null;

  const togglePin = (id: string) => {
    setSelectedPinId((cur) => (cur === id ? null : id));
  };

  const openAttachDialog = () => {
    if (selectedPinId) setDialogPinId(selectedPinId);
  };

  return (
    <AppShell
      title="Select pin"
      subtitle="Pick a pin to attach products to."
      backButton
      hideBottomNav
    >
      {dialogPin && (
        <PinDetailDialog
          pin={dialogPin}
          products={products}
          onClose={() => setDialogPinId(null)}
        />
      )}


      {/* Pinterest-style tabs */}
      {!activeBoard && (
        <div className="mb-6 flex items-center justify-center gap-8 border-b border-border/60">
          <TabButton active={tab === "pins"} onClick={() => setTab("pins")}>
            Pins
          </TabButton>
          <TabButton active={tab === "boards"} onClick={() => setTab("boards")}>
            Boards
          </TabButton>
        </div>
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
      ) : activeBoard ? (
        <div className="space-y-5">
          <button
            onClick={() => setActiveBoardId(null)}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" /> All boards
          </button>
          <div>
            <h2 className="text-2xl font-bold">{activeBoard.collection.name}</h2>
            <p className="text-sm text-muted-foreground">
              {activeBoard.pins.length} {activeBoard.pins.length === 1 ? "Pin" : "Pins"}
            </p>
          </div>
          {activeBoard.pins.length === 0 ? (
            <EmptyBlock text="No pins in this board." />
          ) : (
            <PinGrid
              pins={activeBoard.pins}
              selectedId={selectedPinId}
              onToggle={togglePin}
            />
          )}
        </div>
      ) : tab === "pins" ? (
        pins.length === 0 ? (
          <EmptyBlock text="No pins yet." />
        ) : (
          <PinGrid
            pins={pins}
            selectedId={selectedPinId}
            onToggle={togglePin}
          />
        )
      ) : boards.length === 0 ? (
        <EmptyBlock text="No boards yet." />
      ) : (
        <BoardsGrid boards={boards} onSelect={setActiveBoardId} />
      )}

      {/* Sticky CTA once a pin is selected */}
      {selectedPinId && (
        <div
          className="fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-surface/95 px-4 py-3 backdrop-blur-xl"
          style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
        >
          <div className="mx-auto flex max-w-2xl items-center gap-3">
            <button
              onClick={openAttachDialog}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-gradient-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-glow transition active:scale-[0.98]"
            >
              <Link2 className="h-4 w-4" /> Attach products
            </button>
          </div>
        </div>
      )}
    </AppShell>
  );
}

function TabButton({
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
      className={`relative -mb-px px-1 pb-3 pt-1 text-[15px] font-semibold transition ${
        active
          ? "text-foreground"
          : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
      {active && (
        <span className="absolute inset-x-0 bottom-0 h-[3px] rounded-full bg-foreground" />
      )}
    </button>
  );
}

function EmptyBlock({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-surface/40 p-12 text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}

function BoardsGrid({
  boards,
  onSelect,
}: {
  boards: { collection: Collection; pins: Pin[] }[];
  onSelect: (id: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {boards.map(({ collection, pins }, i) => {
        const [cover, ...rest] = pins;
        const side = rest.slice(0, 2);
        const grad = GRADIENTS[i % GRADIENTS.length];
        return (
          <button
            key={collection.id}
            onClick={() => onSelect(collection.id)}
            className="group text-left"
          >
            <div className="overflow-hidden rounded-2xl bg-surface ring-1 ring-border/60 transition group-hover:shadow-elevate">
              <div className="flex aspect-[4/3] gap-0.5">
                <div className={`relative flex-[2] bg-gradient-to-br ${grad}`}>
                  {cover?.image_url && (
                    <img
                      src={cover.image_url}
                      alt=""
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  )}
                </div>
                <div className="flex flex-1 flex-col gap-0.5">
                  {[0, 1].map((idx) => {
                    const p = side[idx];
                    const g = GRADIENTS[(i + idx + 1) % GRADIENTS.length];
                    return (
                      <div key={idx} className={`relative flex-1 bg-gradient-to-br ${g}`}>
                        {p?.image_url && (
                          <img
                            src={p.image_url}
                            alt=""
                            className="h-full w-full object-cover"
                            loading="lazy"
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="px-1 pt-2">
              <h3 className="line-clamp-1 text-sm font-semibold">{collection.name}</h3>
              <p className="text-xs text-muted-foreground">
                {pins.length} {pins.length === 1 ? "Pin" : "Pins"}
              </p>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function PinGrid({
  pins,
  selectedId,
  onToggle,
}: {
  pins: Pin[];
  selectedId: string | null;
  onToggle: (id: string) => void;
}) {
  return (
    <div className="masonry-3 sm:masonry-4 lg:masonry-4">
      {pins.map((p, i) => {
        const grad = GRADIENTS[i % GRADIENTS.length];
        const ratio = RATIOS[i % RATIOS.length];
        const selected = selectedId === p.id;
        return (
          <article
            key={p.id}
            onClick={() => onToggle(p.id)}
            className={`group relative cursor-pointer overflow-hidden rounded-2xl bg-surface shadow-sm ring-1 transition active:scale-[0.98] hover:shadow-elevate ${
              selected ? "ring-2 ring-primary" : "ring-border/60"
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
              {selected && (
                <div className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-primary text-primary-foreground shadow-glow">
                  <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                    <path fillRule="evenodd" d="M16.7 5.3a1 1 0 010 1.4l-8 8a1 1 0 01-1.4 0l-4-4a1 1 0 111.4-1.4L8 12.6l7.3-7.3a1 1 0 011.4 0z" clipRule="evenodd" />
                  </svg>
                </div>
              )}
            </div>
            <div className="p-3">
              <h3 className="hidden">{p.title}</h3>
            </div>
          </article>
        );
      })}
    </div>
  );
}

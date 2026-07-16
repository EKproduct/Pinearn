import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Eye,
  Navigation,
  ShoppingBag,
  Banknote,
  Wallet,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  X,
  Info,
  Share,
  Home,
  MapPin,
  Clock,
  CheckCircle2,
  XCircle,
  CreditCard,
  Send,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { pickPlaceholderImage } from "@/lib/placeholder-image";
import { getPinterestAnalytics, syncPinterestAnalytics } from "@/lib/pinterest.functions";
import { ALL_BRANDS, hostBrand } from "@/lib/brands";

export const Route = createFileRoute("/_authenticated/analytics")({
  component: Analytics,
});

/* ---------------------------------------------------------------- */
/* Pins/products come from the real synced Pinterest data (fetched   */
/* per-user below via getPinterestAnalytics). Orders/sales/earnings  */
/* have no real data source anywhere — Pinterest has no visibility   */
/* into affiliate purchases — so ORDERS stays permanently empty and  */
/* every order-derived stat below (pinAgg/brandAgg/wallet/etc.)      */
/* naturally zeroes out from that, without being faked.              */
/* ---------------------------------------------------------------- */

type PinDef = { id: string; title: string; image: string; clicks: number; impressions: number };

type ProductDef = {
  id: string;
  pinId: string;
  title: string;
  image: string;
  brand: string;
  clicks: number;
};

const BRAND_INFO: Record<string, { initial: string; color: string }> = {
  Amazon: { initial: "A", color: "oklch(0.62 0.15 55)" },
  Myntra: { initial: "M", color: "oklch(0.55 0.22 340)" },
  Flipkart: { initial: "F", color: "oklch(0.5 0.18 255)" },
  "Nat Habit": { initial: "N", color: "oklch(0.55 0.13 150)" },
  Nykaa: { initial: "N", color: "oklch(0.55 0.2 350)" },
  Ajio: { initial: "A", color: "oklch(0.45 0.02 40)" },
  Meesho: { initial: "M", color: "oklch(0.55 0.2 320)" },
  "Sugar Cosmetics": { initial: "S", color: "oklch(0.4 0.03 30)" },
  Mamaearth: { initial: "M", color: "oklch(0.55 0.14 145)" },
  Boat: { initial: "B", color: "oklch(0.28 0.02 30)" },
  Lenskart: { initial: "L", color: "oklch(0.55 0.18 30)" },
  Purplle: { initial: "P", color: "oklch(0.5 0.18 300)" },
};

type OrderStatus = "pending" | "confirmed" | "cancelled";
type PayoutStage = "confirmed" | "requested" | "paid";

type Order = {
  id: string;
  orderId: string;
  status: OrderStatus;
  payoutStage?: PayoutStage;
  orderDate: Date;
  value: number;
  earnings: number;
  brand: string;
  productId: string | null;
  productTitle: string | null;
  productImage: string | null;
  pinId: string;
  pinTitle: string;
  pinImage: string;
};

// No real order/commission-tracking system exists yet — Pinterest's API has
// no concept of purchases, so this stays permanently empty rather than faked.
const ORDERS: Order[] = [];

function nonCancelled(list: Order[]) {
  return list.filter((o) => o.status !== "cancelled");
}

const ZERO_AGG = { orders: 0, sales: 0, earnings: 0 };

function ordersForProduct(productId: string) {
  return ORDERS.filter((o) => o.productId === productId);
}
function productAgg(productId: string) {
  const list = nonCancelled(ordersForProduct(productId));
  return {
    orders: list.length,
    sales: list.reduce((a, o) => a + o.value, 0),
    earnings: list.reduce((a, o) => a + o.earnings, 0),
  };
}

const walletBuckets = {
  pending: ORDERS.filter((o) => o.status === "pending").reduce((a, o) => a + o.earnings, 0),
  confirmed: ORDERS.filter((o) => o.status === "confirmed" && o.payoutStage === "confirmed").reduce((a, o) => a + o.earnings, 0),
  requested: ORDERS.filter((o) => o.status === "confirmed" && o.payoutStage === "requested").reduce((a, o) => a + o.earnings, 0),
  paid: ORDERS.filter((o) => o.status === "confirmed" && o.payoutStage === "paid").reduce((a, o) => a + o.earnings, 0),
  cancelled: ORDERS.filter((o) => o.status === "cancelled").reduce((a, o) => a + o.earnings, 0),
};
const allTimeTotalProfit =
  walletBuckets.pending + walletBuckets.confirmed + walletBuckets.requested + walletBuckets.paid;

/* ---------------------------------------------------------------- */
/* Formatting helpers                                                */
/* ---------------------------------------------------------------- */

function fmt(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "k";
  return n.toLocaleString();
}
function fmtINR(n: number) {
  if (n >= 10_000_000) return (n / 10_000_000).toFixed(2) + "Cr";
  if (n >= 100_000) return (n / 100_000).toFixed(1) + "L";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "k";
  return n.toLocaleString();
}
function fmtDate(d: Date) {
  return d.toLocaleDateString("en", { day: "numeric", month: "short", year: "numeric" });
}
function addDays(d: Date, days: number) {
  return new Date(d.getTime() + days * 86400000);
}

/* ---------------------------------------------------------------- */
/* Top overview                                                      */
/* ---------------------------------------------------------------- */

const RANGES = ["7d", "30d", "90d", "12mo"] as const;
type RangeKey = (typeof RANGES)[number];

function ordersInRange(r: RangeKey) {
  const days = r === "7d" ? 7 : r === "30d" ? 30 : r === "90d" ? 90 : 365;
  const cutoff = Date.now() - days * 86400000;
  return nonCancelled(ORDERS.filter((o) => o.orderDate.getTime() >= cutoff));
}

type Tab = "orders" | "pins" | "brands";

function Analytics() {
  const [range, setRange] = useState<RangeKey>("30d");
  const [tab, setTab] = useState<Tab>("pins");
  const [walletOpen, setWalletOpen] = useState(false);
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const [activePinId, setActivePinId] = useState<string | null>(null);
  const [activeProductId, setActiveProductId] = useState<string | null>(null);

  // Real Pinterest data — Impressions/Pin clicks/account totals genuinely
  // come from Pinterest's API for the selected range (see pinterest.functions.ts).
  const qc = useQueryClient();
  const runGetAnalytics = useServerFn(getPinterestAnalytics);
  const { data: pinterestData } = useQuery({
    queryKey: ["pinterest-analytics", range],
    queryFn: () => runGetAnalytics({ data: { range } }),
    retry: false,
  });

  // Pinterest rate-limits per-pin analytics hard, so real numbers for every
  // pin get backfilled a batch at a time rather than fetched live. This runs
  // silently in the background (no button, no toast) — one batch per page
  // visit — so pin-wise data keeps getting fresher over time regardless.
  const runSync = useServerFn(syncPinterestAnalytics);
  const syncMutation = useMutation({
    mutationFn: () => runSync({ data: undefined as unknown as never }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pinterest-analytics"] }),
  });
  const syncStartedRef = useRef(false);
  useEffect(() => {
    if (syncStartedRef.current) return;
    syncStartedRef.current = true;
    syncMutation.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const overview = pinterestData?.overview ?? {
    impressions: 0,
    pinClicks: 0,
    outboundClicks: 0,
    saves: 0,
    engagement: 0,
  };

  const PIN_DEFS: PinDef[] = useMemo(
    () =>
      (pinterestData?.pins ?? []).map((p) => ({
        id: p.id,
        title: p.title,
        image: p.imageUrl ?? pickPlaceholderImage(p.id),
        clicks: p.clicks,
        impressions: p.impressions,
      })),
    [pinterestData],
  );

  const PRODUCT_DEFS: ProductDef[] = useMemo(
    () =>
      (pinterestData?.pins ?? [])
        .filter((p) => p.product)
        .map((p) => ({
          id: p.product!.id,
          pinId: p.id,
          title: p.product!.title,
          image: p.product!.image_url ?? pickPlaceholderImage(p.product!.id),
          brand: brandFromUrl(p.product!.affiliate_url),
          clicks: 0, // no real per-product click tracking exists yet
        })),
    [pinterestData],
  );

  const rangeOrders = useMemo(() => ordersInRange(range), [range]);
  const totalEarnings = rangeOrders.reduce((a, o) => a + o.earnings, 0);
  const totalSales = rangeOrders.reduce((a, o) => a + o.value, 0);
  const totalOrdersInRange = rangeOrders.length;
  const totalImpressions = overview.impressions;
  const totalClicks = overview.pinClicks;

  const activeOrder = ORDERS.find((o) => o.id === activeOrderId) ?? null;
  const activePin = PIN_DEFS.find((p) => p.id === activePinId) ?? null;
  const activeProduct = PRODUCT_DEFS.find((p) => p.id === activeProductId) ?? null;

  return (
    <AppShell title="Analytics" subtitle="Traffic, conversions, and earnings." backButton>
      {/* Total earnings card */}
      <div className="rounded-3xl border border-border bg-surface p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm text-muted-foreground">Total Earnings</div>
            <div className="mt-1 font-display text-4xl font-extrabold tracking-tight">
              ₹{fmtINR(totalEarnings)}
            </div>
          </div>
          <div className="inline-flex shrink-0 rounded-full border border-border bg-surface p-1">
            {RANGES.map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`rounded-full px-2.5 py-1.5 text-xs font-semibold transition ${
                  range === r ? "bg-gradient-primary text-primary-foreground shadow-glow" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={() => setWalletOpen(true)}
          className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full border border-border bg-surface-2/60 px-4 py-3 text-sm font-semibold hover:bg-surface-2"
        >
          <Wallet className="h-4 w-4" /> View wallet breakdown
        </button>

        <div className="my-5 border-t border-dashed border-border" />

        <div className="grid grid-cols-2 gap-3">
          <OverviewStat icon={Eye} label="Impressions" value={fmt(totalImpressions)} />
          <OverviewStat icon={Navigation} label="Clicks" value={fmt(totalClicks)} />
          <OverviewStat icon={ShoppingBag} label="Orders" value={fmt(totalOrdersInRange)} />
          <OverviewStat icon={Banknote} label="Sales" value={`₹${fmtINR(totalSales)}`} />
        </div>
      </div>

      {/* Tabs */}
      <div className="mt-6 flex items-center gap-1 rounded-full border border-border bg-surface p-1">
        <TabButton active={tab === "orders"} onClick={() => setTab("orders")} icon={ShoppingBag} label="Orders" />
        <TabButton active={tab === "pins"} onClick={() => setTab("pins")} icon={MapPin} label="Pins" />
        <TabButton active={tab === "brands"} onClick={() => setTab("brands")} icon={Home} label="Brands" />
      </div>

      {tab === "orders" && (
        <OrdersPanel onOpenOrder={setActiveOrderId} onOpenPin={setActivePinId} />
      )}
      {tab === "pins" && (
        <PinsPanel pins={PIN_DEFS} products={PRODUCT_DEFS} onOpenPin={setActivePinId} />
      )}
      {tab === "brands" && <BrandsPanel />}

      {walletOpen && <WalletBreakdownDialog onClose={() => setWalletOpen(false)} />}

      {activePin && (
        <PinBreakdownDialog
          pin={activePin}
          products={PRODUCT_DEFS}
          onOpenProduct={setActiveProductId}
          onClose={() => setActivePinId(null)}
        />
      )}

      {activeProduct && (
        <OrderBreakdownDialog
          product={activeProduct}
          onOpenOrder={setActiveOrderId}
          onClose={() => setActiveProductId(null)}
        />
      )}

      {activeOrder && <OrderDetailDialog order={activeOrder} onClose={() => setActiveOrderId(null)} />}
    </AppShell>
  );
}

// Products are attached via a pasted affiliate link, not a formal brand
// catalog — use the link's hostname as a readable stand-in, same pattern
// pins.tsx already uses when a product is added from a manual URL.
function brandFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Store";
  }
}

function OverviewStat({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-3.5">
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="font-display text-lg font-bold">{value}</div>
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: any;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-2.5 text-sm font-semibold transition ${
        active ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      <Icon className="h-4 w-4" /> {label}
    </button>
  );
}

/* ---------------------------------------------------------------- */
/* Orders tab                                                        */
/* ---------------------------------------------------------------- */

const ORDER_DATE_RANGES = ["7d", "30d", "60d", "90d", "All"] as const;
type OrderDateRange = (typeof ORDER_DATE_RANGES)[number];

function OrdersPanel({
  onOpenOrder,
  onOpenPin,
}: {
  onOpenOrder: (id: string) => void;
  onOpenPin: (id: string) => void;
}) {
  const [status, setStatus] = useState<OrderStatus>("confirmed");
  const [dateRange, setDateRange] = useState<OrderDateRange>("All");

  const filtered = useMemo(() => {
    let list = ORDERS.filter((o) => o.status === status);
    if (dateRange !== "All") {
      const days = dateRange === "7d" ? 7 : dateRange === "30d" ? 30 : dateRange === "60d" ? 60 : 90;
      const cutoff = Date.now() - days * 86400000;
      list = list.filter((o) => o.orderDate.getTime() >= cutoff);
    }
    return list;
  }, [status, dateRange]);

  const totalOrders = filtered.length;
  const avgOrderValue = totalOrders ? Math.round(filtered.reduce((a, o) => a + o.value, 0) / totalOrders) : 0;

  // No real order-tracking system exists yet, so ORDERS is always empty —
  // show a bare message instead of stat cards/filters with nothing behind
  // them. Once real orders exist, this falls away and the full panel below
  // (stat cards, status/date filters, order list) renders exactly as built.
  if (ORDERS.length === 0) {
    return (
      <div className="mt-6 rounded-2xl border border-dashed border-border bg-surface/40 p-10 text-center text-sm text-muted-foreground">
        No orders currently.
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <SimpleStatCard label="Total Orders" value={totalOrders.toLocaleString()} />
        <SimpleStatCard label="Average Order Value" value={`₹${avgOrderValue.toLocaleString()}`} />
      </div>

      <div className="rounded-2xl border border-border bg-surface p-4">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Status</div>
        <div className="mt-2 flex gap-2">
          {(["pending", "confirmed", "cancelled"] as OrderStatus[]).map((s) => (
            <FilterChip key={s} active={status === s} onClick={() => setStatus(s)}>
              {s[0].toUpperCase() + s.slice(1)}
            </FilterChip>
          ))}
        </div>
        <div className="mt-4 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Date range
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {ORDER_DATE_RANGES.map((r) => (
            <FilterChip key={r} active={dateRange === r} onClick={() => setDateRange(r)}>
              {r}
            </FilterChip>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-surface/40 p-10 text-center text-sm text-muted-foreground">
          No {status} orders in this range.
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((o) => (
            <OrderCard key={o.id} order={o} onOpen={() => onOpenOrder(o.id)} onOpenPin={() => onOpenPin(o.pinId)} />
          ))}
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
        active ? "bg-primary text-primary-foreground shadow-glow" : "bg-surface-2 text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function SimpleStatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 font-display text-2xl font-bold">{value}</div>
    </div>
  );
}

const STATUS_STYLE: Record<OrderStatus, { dot: string; text: string; label: string }> = {
  pending: { dot: "bg-amber-500", text: "text-amber-600", label: "Pending" },
  confirmed: { dot: "bg-emerald-500", text: "text-emerald-600", label: "Confirmed" },
  cancelled: { dot: "bg-red-500", text: "text-red-600", label: "Cancelled" },
};

function statusMessage(order: Order) {
  if (order.status === "pending") return "Pending confirmation from the store.";
  if (order.status === "cancelled") return "Order was cancelled or returned — excluded from earnings.";
  if (order.payoutStage === "paid") return "Paid out — money has been sent to your account.";
  if (order.payoutStage === "requested") return "Payout requested — awaiting transfer.";
  return "Confirmed by the store — ready to be requested for payout.";
}

function OrderCard({ order, onOpen, onOpenPin }: { order: Order; onOpen: () => void; onOpenPin: () => void }) {
  const info = BRAND_INFO[order.brand] ?? { initial: order.brand[0], color: "oklch(0.5 0.05 40)" };
  const st = STATUS_STYLE[order.status];
  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <button onClick={onOpen} className="flex w-full items-start gap-3 text-left">
        <div
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-sm font-bold text-white"
          style={{ background: info.color }}
        >
          {info.initial}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate font-semibold">{order.brand}</span>
            <span className={`inline-flex items-center gap-1 text-xs font-medium ${st.text}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} /> {st.label}
            </span>
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {fmtDate(order.orderDate)} · {order.orderId}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="font-display text-base font-bold">₹{fmtINR(order.earnings)}</div>
          <div className="text-[10px] text-muted-foreground">earned</div>
        </div>
      </button>

      <div className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
        {statusMessage(order)}
      </div>

      <button
        onClick={onOpenPin}
        className="mt-2 flex w-full items-center gap-2 rounded-xl bg-surface-2/60 px-3 py-2 text-left text-sm hover:bg-surface-2"
      >
        <img src={order.pinImage} alt="" className="h-8 w-8 shrink-0 rounded-lg object-cover" />
        <span className="min-w-0 flex-1 truncate">
          From &quot;{order.pinTitle}&quot;
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>

      <div className="mt-2 flex gap-2">
        <div className="flex-1 rounded-xl bg-surface-2/60 px-3 py-2">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">MRP</div>
          <div className="text-sm font-semibold">₹{fmtINR(order.value)}</div>
        </div>
        <div className="flex-1 rounded-xl bg-surface-2/60 px-3 py-2 text-right">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Type</div>
          <div className="text-sm font-semibold">Cashback</div>
        </div>
      </div>
    </div>
  );
}

function OrderDetailDialog({ order, onClose }: { order: Order; onClose: () => void }) {
  const info = BRAND_INFO[order.brand] ?? { initial: order.brand[0], color: "oklch(0.5 0.05 40)" };
  const st = STATUS_STYLE[order.status];
  return (
    <ModalShell onClose={onClose} z={80}>
      <div className="w-full overflow-hidden rounded-t-2xl border border-border bg-surface shadow-xl">
        <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
          <div className="flex items-center gap-3">
            <div
              className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-sm font-bold text-white"
              style={{ background: info.color }}
            >
              {info.initial}
            </div>
            <div>
              <div className="font-display text-base font-bold">{order.brand}</div>
              <div className="text-xs text-muted-foreground">Order #{order.orderId}</div>
            </div>
          </div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full bg-surface-2 hover:bg-surface-2/80">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-4">
          <div className="flex items-center justify-between">
            <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${st.text} bg-surface-2/60`}>
              <span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} /> {st.label}
            </span>
            <span className="font-display text-2xl font-extrabold">₹{fmtINR(order.earnings)}</span>
          </div>

          <div className="mt-4 divide-y divide-border/60 rounded-xl border border-border/60">
            <Row label="Type" value="Cashback" />
            <Row label="Order date" value={fmtDate(order.orderDate)} />
            <Row label="Expected confirmation" value={fmtDate(addDays(order.orderDate, 15))} />
          </div>

          <div className="mt-4 rounded-xl bg-amber-50 px-3 py-2.5 text-xs font-medium text-amber-800">
            {statusMessage(order)}
          </div>
        </div>
      </div>
    </ModalShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-3 py-2.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Pins tab                                                          */
/* ---------------------------------------------------------------- */

const PIN_SORTS = ["Newest", "Impressions", "Clicks"] as const;
type PinSort = (typeof PIN_SORTS)[number];

function PinsPanel({
  pins,
  products,
  onOpenPin,
}: {
  pins: PinDef[];
  products: ProductDef[];
  onOpenPin: (id: string) => void;
}) {
  const [sortBy, setSortBy] = useState<PinSort>("Newest");
  const totalClicks = pins.reduce((a, p) => a + p.clicks, 0);

  const sortedPins = useMemo(() => {
    if (sortBy === "Impressions") return [...pins].sort((a, b) => b.impressions - a.impressions);
    if (sortBy === "Clicks") return [...pins].sort((a, b) => b.clicks - a.clicks);
    return pins; // "Newest" — already ordered by the server
  }, [pins, sortBy]);

  return (
    <div className="mt-6 space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <SimpleStatCard label="Total Pins" value={pins.length.toString()} />
        <SimpleStatCard label="Total Clicks" value={fmt(totalClicks)} />
      </div>

      <div className="flex items-center justify-between">
        <h3 className="font-display text-base font-semibold">All pins</h3>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as PinSort)}
          className="h-8 rounded-full border border-border bg-surface px-3 text-xs font-medium text-muted-foreground focus:border-primary focus:outline-none"
        >
          {PIN_SORTS.map((s) => (
            <option key={s} value={s}>
              Sort: {s}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-4">
        {sortedPins.map((pin) => {
          const agg = ZERO_AGG;
          const product = products.find((p) => p.pinId === pin.id);
          const brandLabel = (product?.brand ?? "Amazon").toUpperCase();
          return (
            <div key={pin.id} className="rounded-2xl border border-border bg-surface p-4">
              <div className="flex items-start gap-3">
                <img src={pin.image} alt="" className="h-14 w-14 shrink-0 rounded-xl object-cover" />
                <div className="min-w-0 flex-1">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {brandLabel}
                  </div>
                  <div className="truncate text-sm font-semibold">{pin.title}</div>
                </div>
                <button
                  onClick={() => {
                    if (navigator.share) {
                      navigator.share({ title: pin.title, url: window.location.href }).catch(() => {});
                    } else {
                      toast.success("Link copied");
                    }
                  }}
                  aria-label="Share pin"
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-surface-2 hover:text-foreground"
                >
                  <Share className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-3 flex gap-2">
                <div className="flex-1 rounded-xl bg-surface-2/60 px-3 py-2">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Clicks</div>
                  <div className="text-sm font-semibold">{fmt(pin.clicks)}</div>
                </div>
                <div className="flex-1 rounded-xl bg-surface-2/60 px-3 py-2 text-right">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Orders</div>
                  <div className="text-sm font-semibold">{agg.orders}</div>
                </div>
              </div>
              <div className="mt-2 flex gap-2">
                <div className="flex-1 rounded-xl bg-surface-2/60 px-3 py-2">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Sales</div>
                  <div className="text-sm font-semibold">₹{fmtINR(agg.sales)}</div>
                </div>
                <div className="flex-1 rounded-xl bg-surface-2/60 px-3 py-2 text-right">
                  <div className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                    Earnings <Info className="h-3 w-3" />
                  </div>
                  <div className="text-sm font-semibold text-emerald-600">₹{fmtINR(agg.earnings)}</div>
                </div>
              </div>

              <button
                onClick={() => onOpenPin(pin.id)}
                className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-gradient-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-glow"
              >
                Pin Breakdown <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PinBreakdownDialog({
  pin,
  products,
  onOpenProduct,
  onClose,
}: {
  pin: PinDef;
  products: ProductDef[];
  onOpenProduct: (id: string) => void;
  onClose: () => void;
}) {
  const agg = ZERO_AGG;
  const pinProducts = products.filter((p) => p.pinId === pin.id);

  return (
    <ModalShell onClose={onClose} z={60}>
      <div className="flex max-h-[85vh] w-full flex-col overflow-hidden rounded-t-2xl border border-border bg-surface shadow-xl">
        <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
          <h3 className="font-display text-lg font-bold">Pin Breakdown</h3>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full bg-surface-2 hover:bg-surface-2/80">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <div className="rounded-2xl border border-border bg-surface p-3">
            <div className="flex items-center gap-3">
              <img src={pin.image} alt="" className="h-12 w-12 shrink-0 rounded-xl object-cover" />
              <div className="min-w-0 truncate font-semibold">{pin.title}</div>
            </div>
            <div className="mt-3 flex divide-x divide-border rounded-xl border border-border/60">
              <div className="flex-1 px-3 py-2">
                <div className="text-xs text-muted-foreground">Orders</div>
                <div className="font-display text-lg font-bold">{agg.orders}</div>
              </div>
              <div className="flex-1 px-3 py-2 text-right">
                <div className="text-xs text-muted-foreground">Sales</div>
                <div className="font-display text-lg font-bold">₹{fmtINR(agg.sales)}</div>
              </div>
            </div>
            <div className="mt-2 flex items-center justify-between border-t border-border/60 pt-2 text-sm">
              <span className="text-muted-foreground">Products attached</span>
              <span className="font-semibold text-emerald-600">{pinProducts.length}</span>
            </div>
          </div>

          <div className="mt-5 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Products attached to this pin
          </div>

          {pinProducts.length === 0 ? (
            <p className="mt-4 rounded-xl border border-dashed border-border bg-surface-2/40 p-6 text-center text-sm text-muted-foreground">
              No products attached to this pin yet.
            </p>
          ) : (
            <div className="mt-3 space-y-3">
              {pinProducts.map((product) => {
                const pAgg = productAgg(product.id);
                return (
                  <div key={product.id} className="rounded-2xl border border-border bg-surface p-3">
                    <div className="flex items-center gap-3">
                      <img src={product.image} alt="" className="h-12 w-12 shrink-0 rounded-xl object-cover" />
                      <div className="min-w-0">
                        <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          {product.brand}
                        </div>
                        <div className="truncate text-sm font-semibold">{product.title}</div>
                      </div>
                    </div>
                    <div className="mt-2 flex gap-2">
                      <div className="flex-1 rounded-xl bg-surface-2/60 px-3 py-2">
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Clicks</div>
                        <div className="text-sm font-semibold">{fmt(product.clicks)}</div>
                      </div>
                      <div className="flex-1 rounded-xl bg-surface-2/60 px-3 py-2 text-right">
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Orders</div>
                        <div className="text-sm font-semibold">{pAgg.orders}</div>
                      </div>
                    </div>
                    <div className="mt-2 flex gap-2">
                      <div className="flex-1 rounded-xl bg-surface-2/60 px-3 py-2">
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Sales</div>
                        <div className="text-sm font-semibold">₹{fmtINR(pAgg.sales)}</div>
                      </div>
                      <div className="flex-1 rounded-xl bg-surface-2/60 px-3 py-2 text-right">
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Earnings</div>
                        <div className="text-sm font-semibold text-emerald-600">₹{fmtINR(pAgg.earnings)}</div>
                      </div>
                    </div>
                    <button
                      onClick={() => onOpenProduct(product.id)}
                      className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-gradient-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-glow"
                    >
                      Order Breakdown <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </ModalShell>
  );
}

/* ---------------------------------------------------------------- */
/* Order Breakdown dialog (per product)                              */
/* ---------------------------------------------------------------- */

function OrderBreakdownDialog({
  product,
  onOpenOrder,
  onClose,
}: {
  product: ProductDef;
  onOpenOrder: (id: string) => void;
  onClose: () => void;
}) {
  const [statusTab, setStatusTab] = useState<OrderStatus>("confirmed");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const agg = productAgg(product.id);
  const list = ordersForProduct(product.id).filter((o) => o.status === statusTab);

  const groups = useMemo(() => {
    const map = new Map<string, Order[]>();
    for (const o of list) {
      const key = fmtDate(o.orderDate);
      const arr = map.get(key) ?? [];
      arr.push(o);
      map.set(key, arr);
    }
    return Array.from(map.entries())
      .map(([date, orders]) => ({
        date,
        orders,
        value: orders.reduce((a, o) => a + o.value, 0),
        earnings: orders.reduce((a, o) => a + o.earnings, 0),
      }))
      .sort((a, b) => b.orders[0].orderDate.getTime() - a.orders[0].orderDate.getTime());
  }, [list]);

  const toggle = (date: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });

  return (
    <ModalShell onClose={onClose} z={70}>
      <div className="flex max-h-[85vh] w-full flex-col overflow-hidden rounded-t-2xl border border-border bg-surface shadow-xl">
        <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
          <h3 className="font-display text-lg font-bold">Order Breakdown</h3>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full bg-surface-2 hover:bg-surface-2/80">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <div className="rounded-2xl border border-border bg-surface p-3">
            <div className="flex items-center gap-3">
              <img src={product.image} alt="" className="h-12 w-12 shrink-0 rounded-xl object-cover" />
              <div className="min-w-0">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {product.brand}
                </div>
                <div className="truncate text-sm font-semibold">{product.title}</div>
              </div>
            </div>
            <div className="mt-3 flex divide-x divide-border rounded-xl border border-border/60">
              <div className="flex-1 px-3 py-2">
                <div className="text-xs text-muted-foreground">Orders</div>
                <div className="font-display text-base font-bold">{agg.orders}</div>
              </div>
              <div className="flex-1 px-3 py-2 text-center">
                <div className="text-xs text-muted-foreground">Sales</div>
                <div className="font-display text-base font-bold">₹{fmtINR(agg.sales)}</div>
              </div>
              <div className="flex-1 px-3 py-2 text-right">
                <div className="text-xs text-muted-foreground">Earnings</div>
                <div className="font-display text-base font-bold text-emerald-600">₹{fmtINR(agg.earnings)}</div>
              </div>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-1 rounded-full border border-border bg-surface p-1">
            {(["confirmed", "pending", "cancelled"] as OrderStatus[]).map((s) => (
              <button
                key={s}
                onClick={() => setStatusTab(s)}
                className={`flex-1 rounded-full px-3 py-2 text-xs font-semibold capitalize transition ${
                  statusTab === s ? "bg-surface shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {s}
              </button>
            ))}
          </div>

          {groups.length === 0 ? (
            <p className="mt-4 rounded-xl border border-dashed border-border bg-surface-2/40 p-6 text-center text-sm text-muted-foreground">
              No {statusTab} orders for this product.
            </p>
          ) : (
            <div className="mt-3">
              <div className="grid grid-cols-3 px-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                <span>Date</span>
                <span className="text-center">Value</span>
                <span className="text-right">Earnings</span>
              </div>
              <div className="mt-1 space-y-2">
                {groups.map((g) => {
                  const isOpen = expanded.has(g.date);
                  return (
                    <div key={g.date} className="overflow-hidden rounded-xl border border-border/60">
                      <button
                        onClick={() => toggle(g.date)}
                        className="grid w-full grid-cols-3 items-center bg-surface px-3 py-2.5 text-left text-sm hover:bg-surface-2/50"
                      >
                        <span className="font-semibold">{g.date}</span>
                        <span className="text-center">₹{fmtINR(g.value)}</span>
                        <span className="flex items-center justify-end gap-1.5">
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                            ₹{fmtINR(g.earnings)}
                          </span>
                          {isOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                        </span>
                      </button>
                      {isOpen && (
                        <div className="border-t border-border/60 bg-surface-2/30 px-3 py-2">
                          <div className="grid grid-cols-[1.5rem_1fr_auto_auto_auto] gap-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                            <span>#</span>
                            <span>Order ID</span>
                            <span>Order Value</span>
                            <span>Earnings</span>
                            <span>Details</span>
                          </div>
                          <div className="mt-1 space-y-1">
                            {g.orders.map((o, i) => (
                              <button
                                key={o.id}
                                onClick={() => onOpenOrder(o.id)}
                                className="grid w-full grid-cols-[1.5rem_1fr_auto_auto_auto] items-center gap-2 rounded-lg px-1 py-1.5 text-left text-xs hover:bg-surface-2/60"
                              >
                                <span className="text-muted-foreground">{i + 1}</span>
                                <span className="truncate font-medium">{o.orderId}…</span>
                                <span>₹{fmtINR(o.value)}</span>
                                <span className="font-semibold text-emerald-600">₹{fmtINR(o.earnings)}</span>
                                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </ModalShell>
  );
}

/* ---------------------------------------------------------------- */
/* Brands tab                                                        */
/* ---------------------------------------------------------------- */

const BRAND_SORTS = ["Earnings", "Orders", "Average Order Value", "Products attached", "Conv. rate"] as const;
type BrandSort = (typeof BRAND_SORTS)[number];

type BrandRow = {
  brand: string;
  color: string;
  initial: string;
  orders: number;
  avgOrderValue: number;
  productsAttached: number;
  earnings: number;
  convRate: number;
};

// Derive a display brand from a real product's affiliate link — match
// against our known brand catalog (real name/color/logo) when the domain is
// recognized, otherwise fall back to the bare hostname rather than inventing
// a brand that isn't there.
function resolveBrandFromUrl(url: string): { name: string; color: string; initial: string } {
  let host = "";
  try {
    host = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    /* keep empty */
  }
  const known = ALL_BRANDS.find(
    (b) => b.domain && (host === b.domain || host.endsWith(`.${b.domain}`)),
  );
  if (known) {
    return { name: known.name, color: known.color, initial: (known.logoText ?? known.name[0]).toUpperCase() };
  }
  const name = hostBrand(url);
  return { name, color: "oklch(0.55 0.02 250)", initial: name[0]?.toUpperCase() ?? "?" };
}

function BrandsPanel() {
  const [sort, setSort] = useState<BrandSort>("Products attached");

  const { data: products = [], isLoading } = useQuery({
    queryKey: ["analytics-brand-products"],
    queryFn: async () => {
      const { data, error } = await supabase.from("storefront_products").select("id,affiliate_url");
      if (error) throw error;
      return data ?? [];
    },
  });

  const rows = useMemo(() => {
    const byBrand = new Map<string, BrandRow>();
    for (const p of products) {
      const { name, color, initial } = resolveBrandFromUrl(p.affiliate_url);
      const key = name.toLowerCase();
      const existing = byBrand.get(key);
      if (existing) existing.productsAttached += 1;
      else byBrand.set(key, { brand: name, color, initial, orders: 0, avgOrderValue: 0, productsAttached: 1, earnings: 0, convRate: 0 });
    }
    const list = Array.from(byBrand.values());
    const key: Record<BrandSort, (r: BrandRow) => number> = {
      Earnings: (r) => r.earnings,
      Orders: (r) => r.orders,
      "Average Order Value": (r) => r.avgOrderValue,
      "Products attached": (r) => r.productsAttached,
      "Conv. rate": (r) => r.convRate,
    };
    return [...list].sort((a, b) => key[sort](b) - key[sort](a));
  }, [products, sort]);

  return (
    <div className="mt-6 space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <SimpleStatCard label="Total Brands" value={rows.length.toString()} />
        <SimpleStatCard label="Total products attached" value={products.length.toString()} />
      </div>

      <h3 className="font-display text-base font-semibold">All brands you&apos;ve worked with</h3>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-2xl border border-border bg-surface-2/60" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-surface/40 p-10 text-center text-sm text-muted-foreground">
          No brands worked with yet — attach a product to a pin and it'll show up here.
        </div>
      ) : (
        <>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Sort by</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {BRAND_SORTS.map((s) => (
                <FilterChip key={s} active={sort === s} onClick={() => setSort(s)}>
                  {s}
                </FilterChip>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            {rows.map((r) => (
              <div key={r.brand} className="rounded-2xl border border-border bg-surface p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-bold text-white"
                      style={{ background: r.color }}
                    >
                      {r.initial}
                    </div>
                    <span className="font-semibold">{r.brand}</span>
                  </div>
                  <span className="font-display text-lg font-bold text-emerald-600">₹{fmtINR(r.earnings)}</span>
                </div>
                <div className="mt-3 flex gap-2">
                  <div className="flex-1 rounded-xl bg-surface-2/60 px-3 py-2">
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Orders</div>
                    <div className="text-sm font-semibold">{r.orders}</div>
                  </div>
                  <div className="flex-1 rounded-xl bg-surface-2/60 px-3 py-2 text-right">
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Average Order Value</div>
                    <div className="text-sm font-semibold">₹{r.avgOrderValue.toLocaleString()}</div>
                  </div>
                </div>
                <div className="mt-2 flex gap-2">
                  <div className="flex-1 rounded-xl bg-surface-2/60 px-3 py-2">
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Products attached</div>
                    <div className="text-sm font-semibold">{r.productsAttached}</div>
                  </div>
                  <div className="flex-1 rounded-xl bg-surface-2/60 px-3 py-2 text-right">
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Conv. rate</div>
                    <div className="text-sm font-semibold">{r.convRate.toFixed(1)}%</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Wallet breakdown                                                   */
/* ---------------------------------------------------------------- */

function WalletBreakdownDialog({ onClose }: { onClose: () => void }) {
  const rows: {
    key: string;
    icon: any;
    label: string;
    desc: string;
    amount: number;
    tone: string;
    iconBg: string;
    iconColor: string;
  }[] = [
    {
      key: "pending",
      icon: Clock,
      label: "Pending",
      desc: "Order placed, awaiting the return window to close.",
      amount: walletBuckets.pending,
      tone: "text-amber-600",
      iconBg: "bg-amber-100",
      iconColor: "text-amber-600",
    },
    {
      key: "confirmed",
      icon: CheckCircle2,
      label: "Confirmed",
      desc: "Return window passed — commission locked in.",
      amount: walletBuckets.confirmed,
      tone: "text-emerald-600",
      iconBg: "bg-emerald-100",
      iconColor: "text-emerald-600",
    },
    {
      key: "paid",
      icon: CreditCard,
      label: "Paid",
      desc: "Money already sent to your account.",
      amount: walletBuckets.paid,
      tone: "text-blue-600",
      iconBg: "bg-blue-100",
      iconColor: "text-blue-600",
    },
    {
      key: "requested",
      icon: Send,
      label: "Requested",
      desc: "Payout requested on confirmed earnings.",
      amount: walletBuckets.requested,
      tone: "text-red-600",
      iconBg: "bg-red-100",
      iconColor: "text-red-600",
    },
    {
      key: "cancelled",
      icon: XCircle,
      label: "Cancelled",
      desc: "Order returned or voided — excluded from total.",
      amount: walletBuckets.cancelled,
      tone: "text-red-600",
      iconBg: "bg-red-100",
      iconColor: "text-red-600",
    },
  ];

  return (
    <ModalShell onClose={onClose} z={60}>
      <div className="flex max-h-[85vh] w-full flex-col overflow-hidden rounded-t-2xl border border-border bg-surface shadow-xl">
        <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
          <div>
            <h3 className="font-display text-lg font-bold">Wallet breakdown</h3>
            <p className="text-xs text-muted-foreground">Last 30 Days</p>
          </div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full bg-surface-2 hover:bg-surface-2/80">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          <div className="rounded-2xl bg-surface-2/60 p-4 text-center">
            <div className="text-sm text-muted-foreground">All-time total profit</div>
            <div className="mt-1 font-display text-3xl font-extrabold">₹{fmtINR(allTimeTotalProfit)}</div>
          </div>
          {rows.map((r) => (
            <div key={r.key} className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-3.5">
              <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${r.iconBg} ${r.iconColor}`}>
                <r.icon className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold">{r.label}</div>
                <div className="text-xs text-muted-foreground">{r.desc}</div>
              </div>
              <div className={`shrink-0 font-display text-base font-bold ${r.tone}`}>₹{fmtINR(r.amount)}</div>
            </div>
          ))}
        </div>
      </div>
    </ModalShell>
  );
}

/* ---------------------------------------------------------------- */
/* Shared modal shell                                                 */
/* ---------------------------------------------------------------- */

function ModalShell({ children, onClose, z }: { children: React.ReactNode; onClose: () => void; z: number }) {
  return (
    <div
      className="fixed inset-0 flex items-end justify-center bg-black/50"
      style={{ zIndex: z }}
      onClick={onClose}
    >
      <div className="w-full" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

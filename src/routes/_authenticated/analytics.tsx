import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Eye,
  MousePointerClick,
  ExternalLink,
  Bookmark,
  Wallet,
  X,
  Home,
  MapPin,
  ShoppingBag,
  Users,
  Layers,
  Loader2,
  AlertCircle,
  Link2,
} from "lucide-react";
import { getPinterestAnalytics } from "@/lib/pinterest.functions";

export const Route = createFileRoute("/_authenticated/analytics")({
  component: Analytics,
});

/* ---------------------------------------------------------------- */
/* Formatting helpers                                                */
/* ---------------------------------------------------------------- */

function fmt(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "k";
  return n.toLocaleString();
}

const RANGES = ["7d", "30d", "90d"] as const;
type RangeKey = (typeof RANGES)[number];
type Tab = "pins" | "orders" | "brands";

/* ---------------------------------------------------------------- */
/* Page                                                               */
/* ---------------------------------------------------------------- */

function Analytics() {
  const [range, setRange] = useState<RangeKey>("30d");
  const [tab, setTab] = useState<Tab>("pins");
  const [walletOpen, setWalletOpen] = useState(false);

  const runGetAnalytics = useServerFn(getPinterestAnalytics);
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["pinterest-analytics", range],
    queryFn: () => runGetAnalytics({ data: { range } }),
    retry: false,
  });

  const notConnected =
    isError && error instanceof Error && /not connected/i.test(error.message);

  return (
    <AppShell
      title="Analytics"
      subtitle="Real traffic from your connected Pinterest account."
      backButton
      hideNotifications
    >
      {notConnected ? (
        <ConnectPinterestPrompt />
      ) : isError ? (
        <ErrorState message={error instanceof Error ? error.message : "Couldn't load analytics."} />
      ) : isLoading ? (
        <div className="flex items-center justify-center py-24 text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading Pinterest analytics…
        </div>
      ) : (
        <>
          {/* Account overview */}
          <div className="rounded-3xl border border-border bg-surface p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm text-muted-foreground">
                  @{data!.account.username ?? "your account"}
                </div>
                <div className="mt-1 font-display text-3xl font-extrabold tracking-tight">
                  {fmt(data!.overview.impressions)}
                  <span className="ml-1.5 text-sm font-medium text-muted-foreground">impressions</span>
                </div>
              </div>
              <div className="inline-flex shrink-0 rounded-full border border-border bg-surface p-1">
                {RANGES.map((r) => (
                  <button
                    key={r}
                    onClick={() => setRange(r)}
                    className={`rounded-full px-2.5 py-1.5 text-xs font-semibold transition ${
                      range === r
                        ? "bg-gradient-primary text-primary-foreground shadow-glow"
                        : "text-muted-foreground hover:text-foreground"
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
              <OverviewStat icon={Eye} label="Impressions" value={fmt(data!.overview.impressions)} />
              <OverviewStat icon={MousePointerClick} label="Pin clicks" value={fmt(data!.overview.pinClicks)} />
              <OverviewStat
                icon={ExternalLink}
                label="Outbound clicks"
                value={fmt(data!.overview.outboundClicks)}
              />
              <OverviewStat icon={Bookmark} label="Saves" value={fmt(data!.overview.saves)} />
            </div>

            <div className="my-5 border-t border-dashed border-border" />

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <AccountStat label="Boards" value={fmt(data!.account.boardCount)} />
              <AccountStat label="Pins" value={fmt(data!.account.pinCount)} />
              <AccountStat label="Followers" value={fmt(data!.account.followerCount)} />
              <AccountStat label="Monthly views" value={fmt(Math.max(data!.account.monthlyViews, 0))} />
            </div>
          </div>

          {/* Tabs */}
          <div className="mt-6 flex items-center gap-1 rounded-full border border-border bg-surface p-1">
            <TabButton active={tab === "pins"} onClick={() => setTab("pins")} icon={MapPin} label="Pins" />
            <TabButton
              active={tab === "orders"}
              onClick={() => setTab("orders")}
              icon={ShoppingBag}
              label="Orders"
            />
            <TabButton active={tab === "brands"} onClick={() => setTab("brands")} icon={Home} label="Brands" />
          </div>

          {tab === "pins" && <PinsPanel pins={data!.pins} />}
          {tab === "orders" && <NotAvailablePanel
            icon={ShoppingBag}
            title="No order data"
            body="Pinterest's API has no visibility into affiliate purchases, so order tracking can't be pulled from it. This section will populate once a real order/commission-tracking integration is built."
          />}
          {tab === "brands" && <NotAvailablePanel
            icon={Home}
            title="No brand performance data"
            body="Pinterest doesn't report brand-level data, and there's no commission-tracking system wired up yet to attribute earnings to brands."
          />}

          {walletOpen && <WalletDialog onClose={() => setWalletOpen(false)} />}
        </>
      )}
    </AppShell>
  );
}

/* ---------------------------------------------------------------- */
/* Shared bits                                                       */
/* ---------------------------------------------------------------- */

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

function AccountStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-surface-2/60 px-3 py-2.5 text-center">
      <div className="font-display text-base font-bold">{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
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

function ConnectPinterestPrompt() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-surface-2/40 px-6 py-16 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-full bg-primary/10 text-primary">
        <Link2 className="h-5 w-5" />
      </div>
      <h2 className="font-display text-lg font-semibold">Connect Pinterest to see analytics</h2>
      <p className="max-w-xs text-sm text-muted-foreground">
        Every number on this page comes straight from your Pinterest account — connect it first.
      </p>
      <Link
        to="/settings"
        className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-glow"
      >
        Go to Settings
      </Link>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-destructive/40 bg-destructive/5 px-6 py-16 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-full bg-destructive/15 text-destructive">
        <AlertCircle className="h-5 w-5" />
      </div>
      <h2 className="font-display text-lg font-semibold">Couldn't load analytics</h2>
      <p className="max-w-sm text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

function NotAvailablePanel({ icon: Icon, title, body }: { icon: any; title: string; body: string }) {
  return (
    <div className="mt-6 flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-surface-2/40 px-6 py-14 text-center">
      <div className="grid h-11 w-11 place-items-center rounded-full bg-surface-2 text-muted-foreground">
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="font-display text-base font-semibold">{title}</h3>
      <p className="max-w-sm text-sm text-muted-foreground">{body}</p>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Pins tab — real per-pin Impressions/Clicks/Saves from Pinterest   */
/* ---------------------------------------------------------------- */

type AnalyticsPin = {
  id: string;
  title: string;
  imageUrl: string | null;
  impressions: number;
  pinClicks: number;
  outboundClicks: number;
  saves: number;
  engagement: number;
};

function PinsPanel({ pins }: { pins: AnalyticsPin[] }) {
  if (pins.length === 0) {
    return (
      <NotAvailablePanel
        icon={Layers}
        title="No pin analytics yet"
        body="Sync your Pinterest boards, then check back once Pinterest has recorded some traffic on your pins — this section is real Pinterest data, so it fills in as views/clicks/saves come in."
      />
    );
  }

  const totalImpressions = pins.reduce((a, p) => a + p.impressions, 0);
  const totalClicks = pins.reduce((a, p) => a + p.pinClicks + p.outboundClicks, 0);

  return (
    <div className="mt-6 space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <SimpleStatCard label="Pins with traffic" value={pins.length.toString()} />
        <SimpleStatCard label="Total clicks" value={fmt(totalClicks)} />
      </div>

      <h3 className="font-display text-base font-semibold">Top pins by impressions</h3>

      <div className="space-y-4">
        {pins.map((pin) => (
          <div key={pin.id} className="rounded-2xl border border-border bg-surface p-4">
            <div className="flex items-start gap-3">
              {pin.imageUrl ? (
                <img src={pin.imageUrl} alt="" className="h-14 w-14 shrink-0 rounded-xl object-cover" />
              ) : (
                <div className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-surface-2 text-muted-foreground">
                  <Layers className="h-5 w-5" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{pin.title}</div>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <MiniStat icon={Eye} label="Impressions" value={fmt(pin.impressions)} />
              <MiniStat icon={MousePointerClick} label="Pin clicks" value={fmt(pin.pinClicks)} />
              <MiniStat icon={ExternalLink} label="Outbound clicks" value={fmt(pin.outboundClicks)} />
              <MiniStat icon={Bookmark} label="Saves" value={fmt(pin.saves)} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MiniStat({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="rounded-xl bg-surface-2/60 px-3 py-2">
      <div className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3 w-3" /> {label}
      </div>
      <div className="text-sm font-semibold">{value}</div>
    </div>
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

/* ---------------------------------------------------------------- */
/* Wallet — zero state: no commission-tracking backend exists yet    */
/* ---------------------------------------------------------------- */

function WalletDialog({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50" onClick={onClose}>
      <div className="w-full" onClick={(e) => e.stopPropagation()}>
        <div className="flex max-h-[85vh] w-full flex-col overflow-hidden rounded-t-2xl border border-border bg-surface shadow-xl">
          <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
            <div>
              <h3 className="font-display text-lg font-bold">Wallet breakdown</h3>
              <p className="text-xs text-muted-foreground">No commission tracking connected yet</p>
            </div>
            <button
              onClick={onClose}
              className="grid h-8 w-8 place-items-center rounded-full bg-surface-2 hover:bg-surface-2/80"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            <div className="rounded-2xl bg-surface-2/60 p-4 text-center">
              <div className="text-sm text-muted-foreground">All-time total profit</div>
              <div className="mt-1 font-display text-3xl font-extrabold">₹0</div>
            </div>
            <div className="flex items-start gap-3 rounded-2xl border border-dashed border-border bg-surface-2/40 p-4 text-sm text-muted-foreground">
              <Users className="mt-0.5 h-4 w-4 shrink-0" />
              Pinterest has no concept of orders or commissions, so earnings can't be
              calculated from it. This will show real numbers once an order/commission
              tracking system exists.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

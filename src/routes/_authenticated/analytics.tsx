import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { useState } from "react";
import {
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Download, Mail, MousePointerClick, IndianRupee } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/analytics")({
  component: Analytics,
});

const RANGES = ["7d", "30d", "90d", "12mo"] as const;

function series(range: (typeof RANGES)[number]) {
  const days = range === "7d" ? 7 : range === "30d" ? 30 : range === "90d" ? 90 : 365;
  const step = days > 60 ? Math.ceil(days / 30) : 1;
  const out: { date: string; clicks: number; conversions: number; earnings: number }[] = [];
  for (let i = days - 1; i >= 0; i -= step) {
    const d = new Date(Date.now() - i * 86400000);
    const seed = (d.getDate() * 17 + d.getMonth() * 53 + i * 7) % 100;
    const clicks = 900 + seed * 22 + Math.sin(i / 4) * 220;
    const conversions = Math.round(clicks * (0.035 + (seed % 8) / 400));
    const earnings = Math.round(conversions * (11 + (seed % 6)) * 100) / 100;
    out.push({
      date: d.toLocaleDateString("en", { month: "short", day: "numeric" }),
      clicks: Math.round(clicks),
      conversions,
      earnings,
    });
  }
  return out;
}

const CATEGORIES = [
  { name: "Home & Decor", value: 32 },
  { name: "Fashion", value: 26 },
  { name: "Beauty", value: 18 },
  { name: "Food", value: 14 },
  { name: "Travel", value: 10 },
];
const COLORS = [
  "oklch(0.55 0.23 25)",
  "oklch(0.72 0.16 45)",
  "oklch(0.72 0.14 85)",
  "oklch(0.55 0.13 155)",
  "oklch(0.65 0.12 260)",
];

const tooltipStyle = {
  background: "oklch(1 0 0)",
  border: "1px solid oklch(0.9 0.01 60)",
  borderRadius: 10,
  fontSize: 12,
  color: "oklch(0.18 0.015 40)",
};

function Analytics() {
  const [range, setRange] = useState<(typeof RANGES)[number]>("30d");
  const data = series(range);
  const totals = data.reduce(
    (a, d) => ({
      clicks: a.clicks + d.clicks,
      conversions: a.conversions + d.conversions,
      earnings: a.earnings + d.earnings,
    }),
    { clicks: 0, conversions: 0, earnings: 0 },
  );
  const cvr = ((totals.conversions / totals.clicks) * 100).toFixed(2);
  const epc = (totals.earnings / totals.clicks).toFixed(2);

  return (
    <AppShell
      title="Analytics"
      subtitle="Traffic, conversions, and earnings — sliced by any dimension."
      backButton
      hideNotifications
      actions={
        <>
          <button
            onClick={() => toast.success("Report emailed")}
            className="hidden items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-sm hover:bg-surface-2 sm:inline-flex"
          >
            <Mail className="h-4 w-4" /> Email report
          </button>
          <button
            onClick={() => toast.success("CSV downloaded")}
            className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow-glow"
          >
            <Download className="h-4 w-4" /> Export
          </button>
        </>
      }
    >
      <div className="inline-flex rounded-lg border border-border bg-surface p-1">
        {RANGES.map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            className={`rounded-md px-3 py-1.5 text-sm ${
              range === r ? "bg-gradient-primary text-primary-foreground shadow-glow" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {r}
          </button>
        ))}
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <MetricCard label="Clicks" value={fmt(totals.clicks)} sub="+12.4% vs prev" />
        <MetricCard label="Conversions" value={fmt(totals.conversions)} sub="+8.1% vs prev" />
        <MetricCard label="CVR" value={`${cvr}%`} sub="+0.6pp vs prev" />
        <MetricCard label="Earnings" value={`₹${fmt(totals.earnings)}`} sub={`₹${epc} EPC`} accent />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-border bg-surface p-5 lg:col-span-2">
          <h3 className="font-display text-base font-semibold">Earnings over time</h3>
          <div className="mt-4 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 10, right: 10, bottom: 0, left: -10 }}>
                <CartesianGrid stroke="oklch(0.85 0.01 60 / 70%)" vertical={false} />
                <XAxis dataKey="date" stroke="oklch(0.48 0.015 45)" fontSize={11} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis stroke="oklch(0.48 0.015 45)" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Line dataKey="earnings" stroke="oklch(0.72 0.16 45)" strokeWidth={2} dot={false} />
                <Line dataKey="clicks" stroke="oklch(0.55 0.23 25)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-surface p-5">
          <h3 className="font-display text-base font-semibold">By category</h3>
          <div className="mt-4 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={CATEGORIES} dataKey="value" nameKey="name" innerRadius={50} outerRadius={90} paddingAngle={3}>
                  {CATEGORIES.map((_, i) => (
                    <Cell key={i} fill={COLORS[i]} stroke="none" />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="mt-2 space-y-1.5 text-xs">
            {CATEGORIES.map((c, i) => (
              <li key={c.name} className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full" style={{ background: COLORS[i] }} />
                  {c.name}
                </span>
                <span className="text-muted-foreground">{c.value}%</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <PinAnalytics range={range} />
    </AppShell>
  );
}

export const PINS: { id: string; title: string; image: string; clicks: number; earnings: number }[] = [
  { id: "p1", title: "Cozy autumn living room", image: "https://images.unsplash.com/photo-1522152168539-3e17b1f851f8?auto=format&fit=crop&w=400&q=60", clicks: 4820, earnings: 2140 },
  { id: "p2", title: "Ceramic dutch oven recipes", image: "https://images.unsplash.com/photo-1503602642458-232111445657?auto=format&fit=crop&w=400&q=60", clicks: 3910, earnings: 1782 },
  { id: "p3", title: "Slip dress midi outfits", image: "https://images.unsplash.com/photo-1490481651871-ab68de25d43d?auto=format&fit=crop&w=400&q=60", clicks: 2740, earnings: 1204 },
  { id: "p4", title: "5-minute skincare routine", image: "https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?auto=format&fit=crop&w=400&q=60", clicks: 2210, earnings: 987 },
  { id: "p5", title: "Rattan pendant lamp styling", image: "https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=400&q=60", clicks: 1980, earnings: 811 },
  { id: "p6", title: "Minimalist packing carry-on", image: "https://images.unsplash.com/photo-1520975916090-3105956dac38?auto=format&fit=crop&w=400&q=60", clicks: 1640, earnings: 662 },
  { id: "p7", title: "Coffee bar refresh", image: "https://images.unsplash.com/photo-1493770348161-369560ae357d?auto=format&fit=crop&w=400&q=60", clicks: 1420, earnings: 548 },
  { id: "p8", title: "Denim jacket, 3 ways", image: "https://images.unsplash.com/photo-1512436991641-6745cdb1723f?auto=format&fit=crop&w=400&q=60", clicks: 1190, earnings: 462 },
  { id: "p9", title: "Everyday sneakers picks", image: "https://images.unsplash.com/photo-1523381210434-271e8be1f52b?auto=format&fit=crop&w=400&q=60", clicks: 980, earnings: 388 },
  { id: "p10", title: "Best travel bag tested", image: "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=400&q=60", clicks: 820, earnings: 301 },
];

function PinAnalytics({ range }: { range: string }) {
  const [showAll, setShowAll] = useState(false);
  const list = showAll ? PINS : PINS.slice(0, 5);
  return (
    <div className="mt-6 rounded-2xl border border-border bg-surface p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="font-display text-base font-semibold">
            {showAll ? "All pins" : "Top 5 pins"}
          </h3>
          <p className="text-xs text-muted-foreground">Performance last {range}</p>
        </div>
        <button
          onClick={() => setShowAll((v) => !v)}
          className="rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-xs font-medium hover:bg-surface"
        >
          {showAll ? "Show top 5" : "See all"}
        </button>
      </div>
      <ul className="divide-y divide-border">
        {list.map((p, i) => (
          <li key={p.id} className="flex items-center gap-3 py-3">
            <div className="w-5 text-center text-xs font-medium text-muted-foreground">
              {i + 1}
            </div>
            <img
              src={p.image}
              alt={p.title}
              className="h-14 w-14 flex-shrink-0 rounded-lg object-cover"
              loading="lazy"
            />
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
                {fmt(p.earnings)}
              </div>
              <div className="text-[10px] text-muted-foreground">earned</div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MetricCard({ label, value, sub, accent }: { label: string; value: string; sub: string; accent?: boolean }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-1 font-display text-2xl font-semibold ${accent ? "text-gradient" : ""}`}>{value}</div>
      <div className="mt-1 text-xs text-accent">{sub}</div>
    </div>
  );
}

function fmt(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "k";
  return n.toLocaleString();
}

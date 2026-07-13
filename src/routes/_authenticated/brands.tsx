import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Search, ChevronDown, Package, Palette, Shirt, Smartphone, Sparkles } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ALL_BRANDS, BRAND_CATEGORIES, type Brand } from "@/lib/brands";
import { BrandLogo } from "@/components/brand-card";

export const Route = createFileRoute("/_authenticated/brands")({
  component: BrandsPage,
});

const CATEGORY_ICONS = {
  all: Package,
  beauty: Palette,
  fashion: Shirt,
  electronics: Smartphone,
  lifestyle: Sparkles,
} as const;

type SortKey = "featured" | "commission" | "name";
const SORT_LABELS: Record<SortKey, string> = {
  featured: "Sort",
  commission: "Top earning",
  name: "A → Z",
};

function BrandsPage() {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string>("all");
  const [sort, setSort] = useState<SortKey>("featured");
  const [sortOpen, setSortOpen] = useState(false);

  const filtered = useMemo(() => {
    let list: Brand[] = [...ALL_BRANDS];
    if (cat !== "all") list = list.filter((b) => b.category === cat);
    if (q.trim()) {
      const needle = q.trim().toLowerCase();
      list = list.filter((b) => b.name.toLowerCase().includes(needle));
    }
    if (sort === "commission") list.sort((a, b) => b.commission - a.commission);
    else if (sort === "name") list.sort((a, b) => a.name.localeCompare(b.name));
    return list;
  }, [q, cat, sort]);

  return (
    <AppShell title="Discover" backButton hideNotifications>
      {/* Search + sort */}
      <div className="mt-5 flex items-center gap-2">
        <div className="flex flex-1 items-center gap-2 rounded-full bg-surface-2 px-4 py-2.5 ring-1 ring-border/60">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search brands..."
            className="min-w-0 flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
        </div>
        <div className="relative">
          <button
            onClick={() => setSortOpen((v) => !v)}
            className="flex items-center gap-1.5 rounded-full bg-surface-2 px-3.5 py-2.5 text-sm font-semibold text-foreground ring-1 ring-border/60"
          >
            {SORT_LABELS[sort]}
            <ChevronDown className={`h-4 w-4 transition ${sortOpen ? "rotate-180" : ""}`} />
          </button>
          {sortOpen && (
            <div className="absolute right-0 top-[calc(100%+6px)] z-20 w-40 overflow-hidden rounded-2xl border border-border bg-surface p-1 shadow-elevate">
              {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
                <button
                  key={k}
                  onClick={() => {
                    setSort(k);
                    setSortOpen(false);
                  }}
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition hover:bg-surface-2 ${
                    sort === k ? "text-primary font-semibold" : "text-foreground"
                  }`}
                >
                  {SORT_LABELS[k]}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Category chips */}
      <div className="no-scrollbar mt-4 flex items-center gap-2 overflow-x-auto pb-1">
        {BRAND_CATEGORIES.map((c) => {
          const active = cat === c.id;
          const Icon = CATEGORY_ICONS[c.id as keyof typeof CATEGORY_ICONS];
          return (
            <button
              key={c.id}
              onClick={() => setCat(c.id)}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-semibold transition ${
                active
                  ? "bg-primary text-primary-foreground"
                  : "bg-surface-2 text-foreground ring-1 ring-border/60 hover:bg-surface"
              }`}
            >
              <Icon className="h-4 w-4" />
              {c.label}
            </button>
          );
        })}
      </div>

      {/* Grid */}
      <div className="mt-5 grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
        {filtered.map((b) => (
          <Link
            key={b.id}
            to="/brands/$brandId"
            params={{ brandId: b.id }}
            className="group flex flex-col items-center gap-2 rounded-2xl border border-border bg-surface p-4 text-center transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-elevate"
          >
            <BrandLogo brand={b} size={64} />
            <div className="mt-1 line-clamp-1 text-sm font-semibold text-foreground">
              {b.name}
            </div>
            <div className="text-xs font-semibold text-primary">
              {b.commission}% Earning
            </div>
          </Link>
        ))}
        {filtered.length === 0 && (
          <div className="col-span-full rounded-2xl border border-dashed border-border bg-surface/40 p-10 text-center text-sm text-muted-foreground">
            No brands match your search.
          </div>
        )}
      </div>
    </AppShell>
  );
}

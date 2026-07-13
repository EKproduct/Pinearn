import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  BarChart3,
  ChevronDown,
  Layers,
  Link2,
  Sparkles,
  Users,
  Wand2,
  Menu,
  X,
} from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Pinearn — Turn Pinterest traffic into affiliate revenue" },
      {
        name: "description",
        content:
          "Pinearn is the revenue OS for Pinterest creators. Import content, attach a storefront to any pin, and track every click and cent.",
      },
      { property: "og:title", content: "Pinearn — Turn Pinterest into revenue" },
      {
        property: "og:description",
        content:
          "Import, format, publish and monetize Pinterest content with an enterprise-grade creator dashboard.",
      },
    ],
  }),
  component: Landing,
});

function Landing() {
  const heroCtaRef = useRef<HTMLDivElement | null>(null);
  const [showFloating, setShowFloating] = useState(false);

  useEffect(() => {
    const el = heroCtaRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => setShowFloating(!entry.isIntersecting),
      { rootMargin: "-80px 0px 0px 0px", threshold: 0 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Nav />
      <Hero heroCtaRef={heroCtaRef} />
      <LogoStrip />
      <Features />
      <HowItWorks />
      <StatsBand />
      <CTA />
      <Footer />

      {/* Floating "Start earning" CTA */}
      <div
        className={`fixed bottom-6 right-6 z-50 transition-all duration-500 ${
          showFloating
            ? "translate-y-0 opacity-100"
            : "pointer-events-none translate-y-8 opacity-0"
        }`}
      >
        <Link
          to="/auth"
          search={{ mode: "signup" }}
          className="group inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3.5 text-sm font-semibold text-primary-foreground shadow-glow ring-4 ring-primary/10 transition hover:scale-[1.03] hover:bg-primary/95"
        >
          <Sparkles className="h-4 w-4" />
          Start earning free
          <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
        </Link>
      </div>
    </div>
  );
}

const MENU_LINKS = [
  { label: "About", href: "#about" },
  { label: "Features", href: "#features" },
  { label: "How it works", href: "#how" },
  { label: "Creators", href: "#creators" },
  { label: "Pricing", href: "#pricing" },
  { label: "Blog", href: "#blog" },
  { label: "Help", href: "#help" },
  { label: "Contact", href: "#contact" },
];

function Nav() {
  const [open, setOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <Link to="/" className="flex items-center gap-2">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary shadow-glow">
            <span className="font-display text-sm font-bold text-primary-foreground">P</span>
          </div>
          <span className="font-display text-lg font-semibold tracking-tight">Pinearn</span>
        </Link>

        <nav className="hidden items-center gap-7 text-sm text-muted-foreground md:flex">
          <a href="#features" className="transition hover:text-foreground">Features</a>
          <a href="#how" className="transition hover:text-foreground">How it works</a>
          <a href="#creators" className="transition hover:text-foreground">Creators</a>
          <a href="#pricing" className="transition hover:text-foreground">Pricing</a>
        </nav>

        <div className="flex items-center gap-2">
          <Link
            to="/auth"
            className="hidden text-sm font-medium text-muted-foreground transition hover:text-foreground sm:inline-flex"
          >
            Already a Pinterest creator? <span className="ml-1 text-primary">Log in</span>
          </Link>
          <Link
            to="/auth"
            search={{ mode: "signup" }}
            className="hidden items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-glow transition hover:opacity-90 sm:inline-flex"
          >
            Get started <ArrowRight className="h-3.5 w-3.5" />
          </Link>

          {/* Menu dropdown (desktop) */}
          <div ref={menuRef} className="relative hidden md:block">
            <button
              onClick={() => setOpen((v) => !v)}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-3 py-2 text-sm font-medium transition hover:bg-surface-2"
              aria-haspopup="menu"
              aria-expanded={open}
            >
              Menu <ChevronDown className={`h-3.5 w-3.5 transition ${open ? "rotate-180" : ""}`} />
            </button>
            {open && (
              <div
                role="menu"
                className="absolute right-0 top-[calc(100%+8px)] w-56 overflow-hidden rounded-2xl border border-border bg-surface p-2 shadow-elevate"
              >
                {MENU_LINKS.map((l) => (
                  <a
                    key={l.label}
                    href={l.href}
                    onClick={() => setOpen(false)}
                    className="block rounded-xl px-3 py-2 text-sm text-foreground/80 transition hover:bg-surface-2 hover:text-foreground"
                  >
                    {l.label}
                  </a>
                ))}
              </div>
            )}
          </div>

          <button
            className="grid h-10 w-10 place-items-center rounded-full border border-border md:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-foreground/40" onClick={() => setMobileOpen(false)} />
          <div className="absolute right-0 top-0 h-full w-[85%] max-w-sm bg-background p-6 shadow-elevate">
            <div className="flex items-center justify-between">
              <span className="font-display text-lg font-semibold">Menu</span>
              <button
                className="grid h-10 w-10 place-items-center rounded-full bg-surface-2"
                onClick={() => setMobileOpen(false)}
                aria-label="Close menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-6 space-y-1">
              {MENU_LINKS.map((l) => (
                <a
                  key={l.label}
                  href={l.href}
                  onClick={() => setMobileOpen(false)}
                  className="block rounded-xl px-3 py-3 text-base font-medium text-foreground/85 transition hover:bg-surface-2"
                >
                  {l.label}
                </a>
              ))}
            </div>
            <div className="mt-6 grid gap-2">
              <Link
                to="/auth"
                onClick={() => setMobileOpen(false)}
                className="inline-flex items-center justify-center rounded-full border border-border px-4 py-3 text-sm font-semibold"
              >
                Log in
              </Link>
              <Link
                to="/auth"
                search={{ mode: "signup" }}
                onClick={() => setMobileOpen(false)}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-glow"
              >
                Start earning free <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}

function Hero({ heroCtaRef }: { heroCtaRef: React.MutableRefObject<HTMLDivElement | null> }) {
  return (
    <section className="relative overflow-hidden bg-gradient-hero">
      <div className="mx-auto max-w-7xl px-6 pt-20 pb-24 md:pt-28 md:pb-32">
        <div className="mx-auto max-w-3xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-surface/70 px-3 py-1 text-xs text-muted-foreground shadow-sm backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            Trusted by 12,400+ Pinterest creators
          </div>
          <h1 className="mt-6 font-display text-5xl font-semibold leading-[1.02] tracking-tight md:text-7xl">
            Turn Pinterest traffic
            <br />
            into <span className="text-gradient">affiliate revenue</span>.
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-lg text-muted-foreground">
            Pinearn is the one-stop platform for creators. Import content, attach a
            storefront to any pin, and track every click and cent — in one enterprise-grade
            dashboard.
          </p>
          <div
            ref={heroCtaRef}
            className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row"
          >
            <Link
              to="/auth"
              search={{ mode: "signup" }}
              className="inline-flex items-center gap-2 rounded-full bg-primary px-7 py-3.5 text-sm font-semibold text-primary-foreground shadow-glow transition hover:scale-[1.02]"
            >
              Start earning free <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              to="/auth"
              className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-7 py-3.5 text-sm font-semibold text-foreground transition hover:bg-surface-2"
            >
              Already a Pinterest creator? Log in
            </Link>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            No credit card. Sign in with Google, then connect your Pinterest.
          </p>
        </div>

        <MockDashboard />
      </div>
    </section>
  );
}

function MockDashboard() {
  return (
    <div className="relative mx-auto mt-16 max-w-6xl">
      <div className="absolute inset-x-10 -top-8 h-40 bg-primary/40 blur-3xl" />
      <div className="relative overflow-hidden rounded-3xl border border-border bg-surface shadow-elevate">
        <div className="flex items-center gap-2 border-b border-border bg-surface-2 px-4 py-3">
          <span className="h-2.5 w-2.5 rounded-full bg-destructive/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-chart-5/80" />
          <span className="h-2.5 w-2.5 rounded-full bg-accent/70" />
          <span className="ml-3 text-xs text-muted-foreground">app.pinearn.io / dashboard</span>
        </div>
        <div className="grid grid-cols-12">
          <aside className="col-span-3 hidden border-r border-border bg-sidebar p-5 md:block">
            {["Home", "Pins", "Storefront", "Import", "Analytics", "Community"].map((l, i) => (
              <div
                key={l}
                className={`mt-1 rounded-lg px-3 py-2 text-sm ${
                  i === 0 ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground"
                }`}
              >
                {l}
              </div>
            ))}
          </aside>
          <div className="col-span-12 p-6 md:col-span-9">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {[
                { k: "Impressions", v: "1.24M", d: "+18.2%" },
                { k: "Clicks", v: "48,910", d: "+9.7%" },
                { k: "Earnings", v: "₹10,58,240", d: "+22.4%" },
              ].map((s) => (
                <div key={s.k} className="rounded-2xl border border-border bg-surface-2 p-4">
                  <div className="text-xs text-muted-foreground">{s.k}</div>
                  <div className="mt-1 font-display text-2xl font-semibold">{s.v}</div>
                  <div className="mt-1 text-xs text-accent">{s.d}</div>
                </div>
              ))}
            </div>
            <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
              <div className="col-span-2 h-56 rounded-2xl border border-border bg-surface-2 p-4">
                <div className="mb-3 flex items-center justify-between text-xs text-muted-foreground">
                  <span>Traffic</span>
                  <span>Last 30 days</span>
                </div>
                <SparkChart />
              </div>
              <div className="rounded-2xl border border-border bg-surface-2 p-4">
                <div className="text-xs text-muted-foreground">Top pin</div>
                <div className="mt-2 aspect-[4/5] rounded-xl bg-gradient-primary" />
                <div className="mt-2 text-sm font-medium">Autumn capsule wardrobe</div>
                <div className="text-xs text-muted-foreground">₹1,73,400 · 8.4k clicks</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SparkChart() {
  const points = [8, 24, 18, 32, 40, 30, 46, 60, 52, 74, 68, 92, 84, 108];
  const max = Math.max(...points);
  const path = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${(i / (points.length - 1)) * 100} ${100 - (p / max) * 90}`)
    .join(" ");
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-40 w-full">
      <defs>
        <linearGradient id="g" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="oklch(0.55 0.23 25)" stopOpacity="0.5" />
          <stop offset="100%" stopColor="oklch(0.55 0.23 25)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${path} L 100 100 L 0 100 Z`} fill="url(#g)" />
      <path d={path} fill="none" stroke="oklch(0.55 0.23 25)" strokeWidth="1.2" />
    </svg>
  );
}

function LogoStrip() {
  return (
    <section className="border-y border-border/60 bg-surface/40 py-8">
      <div className="mx-auto max-w-7xl px-6">
        <p className="text-center text-xs uppercase tracking-widest text-muted-foreground">
          Trusted by creators publishing to
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-x-12 gap-y-4 font-display text-lg font-semibold text-muted-foreground/80">
          <span>Pinterest</span><span>Instagram</span><span>YouTube</span><span>TikTok</span><span>Substack</span><span>Shopify</span>
        </div>
      </div>
    </section>
  );
}

const FEATURES = [
  { icon: Wand2, title: "Import & auto-format", body: "Pull existing posts from IG, YouTube, TikTok, or blogs. We crop, resize, and caption pin-ready assets." },
  { icon: Link2, title: "Storefront link manager", body: "One central storefront that attaches to any pin. Add affiliate links, collections, and product pages." },
  { icon: BarChart3, title: "Earnings analytics", body: "Impressions, clicks, CTR, conversions and revenue — sliced by pin, product or date range." },
  { icon: Layers, title: "Bulk publishing", body: "Queue dozens of formatted pins with the correct external URLs in a single flow." },
  { icon: Sparkles, title: "Content discovery", body: "See what's trending across the Pinearn network and remix winning formats." },
  { icon: Users, title: "Creator community", body: "Swap tactics, get feedback, and unlock playbooks from top-earning creators." },
];

function Features() {
  return (
    <section id="features" className="mx-auto max-w-7xl px-6 py-24">
      <div className="max-w-2xl">
        <p className="text-sm font-medium text-primary">Everything, in one place</p>
        <h2 className="mt-3 font-display text-4xl font-semibold tracking-tight md:text-5xl">
          A revenue OS built for Pinterest creators.
        </h2>
        <p className="mt-4 text-muted-foreground">
          Stop juggling spreadsheets, tab-hopping between analytics, and formatting images by
          hand. Pinearn handles the entire monetization loop.
        </p>
      </div>
      <div className="mt-12 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f) => (
          <div
            key={f.title}
            className="group rounded-3xl border border-border bg-surface p-6 transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-elevate"
          >
            <div className="grid h-11 w-11 place-items-center rounded-xl bg-primary/10 text-primary">
              <f.icon className="h-5 w-5" />
            </div>
            <h3 className="mt-5 font-display text-lg font-semibold">{f.title}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{f.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    { n: "01", t: "Connect a source", b: "New to Pinterest? Link Instagram, YouTube, or TikTok. Already active? Just connect your Pinterest." },
    { n: "02", t: "Build your storefront", b: "Add affiliate links and product collections once. Reuse across every pin." },
    { n: "03", t: "Publish & earn", b: "Auto-formatted pins go live with your storefront URL. Watch clicks and earnings roll in." },
  ];
  return (
    <section id="how" className="border-y border-border/60 bg-surface/30 py-24">
      <div className="mx-auto max-w-7xl px-6">
        <h2 className="max-w-xl font-display text-4xl font-semibold tracking-tight md:text-5xl">
          From zero to monetized in minutes.
        </h2>
        <div className="mt-14 grid grid-cols-1 gap-6 md:grid-cols-3">
          {steps.map((s) => (
            <div key={s.n} className="relative rounded-3xl border border-border bg-surface p-8">
              <div className="font-display text-sm font-semibold text-primary">{s.n}</div>
              <h3 className="mt-3 font-display text-xl font-semibold">{s.t}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{s.b}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function StatsBand() {
  const stats = [
    { v: "₹35Cr+", l: "Attributed creator revenue" },
    { v: "28k", l: "Pins auto-formatted / mo" },
    { v: "12.4x", l: "Average CTR uplift" },
    { v: "99.98%", l: "Publish success rate" },
  ];
  return (
    <section id="creators" className="mx-auto max-w-7xl px-6 py-20">
      <div className="grid grid-cols-2 gap-6 rounded-3xl border border-border bg-gradient-hero p-10 md:grid-cols-4">
        {stats.map((s) => (
          <div key={s.l}>
            <div className="font-display text-4xl font-semibold text-gradient">{s.v}</div>
            <div className="mt-1 text-sm text-muted-foreground">{s.l}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function CTA() {
  return (
    <section id="pricing" className="mx-auto max-w-7xl px-6 py-24">
      <div className="relative overflow-hidden rounded-3xl border border-border bg-surface p-12 text-center">
        <div className="absolute inset-0 bg-gradient-hero opacity-70" />
        <div className="relative">
          <h2 className="font-display text-4xl font-semibold tracking-tight md:text-5xl">
            Your Pinterest, monetized.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
            Join the creators turning inspiration boards into recurring income.
          </p>
          <Link
            to="/auth"
            search={{ mode: "signup" }}
            className="mt-8 inline-flex items-center gap-2 rounded-full bg-primary px-7 py-3.5 text-sm font-semibold text-primary-foreground shadow-glow"
          >
            Create your Pinearn <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer id="contact" className="border-t border-border/60 py-10">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-6 text-sm text-muted-foreground md:flex-row">
        <div className="flex items-center gap-2">
          <div className="grid h-6 w-6 place-items-center rounded bg-primary">
            <span className="text-[10px] font-bold text-primary-foreground">P</span>
          </div>
          <span>© {new Date().getFullYear()} Pinearn Labs</span>
        </div>
        <div className="flex gap-6">
          <a href="#" className="hover:text-foreground">Privacy</a>
          <a href="#" className="hover:text-foreground">Terms</a>
          <a href="#" className="hover:text-foreground">Contact</a>
        </div>
      </div>
    </footer>
  );
}

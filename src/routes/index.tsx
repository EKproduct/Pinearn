import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion, type Variants } from "framer-motion";
import {
  ArrowRight,
  BadgeCheck,
  Check,
  Eye,
  Link2,
  PlayCircle,
  Quote,
  ScanSearch,
  Sparkles,
  Menu,
  X,
} from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Pinearn — Your boards already get the clicks. Now make them pay." },
      {
        name: "description",
        content:
          "Connect Pinterest and Pinearn auto-detects the products in your pins, attaches your affiliate links, and turns a whole board into income in about a minute.",
      },
      {
        property: "og:title",
        content: "Pinearn — Your boards already get the clicks. Now make them pay.",
      },
      {
        property: "og:description",
        content:
          "Auto-detect products in your pins, attach affiliate links, and monetize a whole board in about a minute.",
      },
    ],
  }),
  component: Landing,
});

/* ------------------------------------------------------------------ */
/* Scroll-reveal helper — fade + rise into view once, honouring        */
/* reduced-motion.                                                     */
/* ------------------------------------------------------------------ */
function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? undefined : { opacity: 0, y: 22 }}
      whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-10% 0px" }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1], delay }}
    >
      {children}
    </motion.div>
  );
}

const staggerParent: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
};
const staggerChild: Variants = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] } },
};

function Landing() {
  const heroCtaRef = useRef<HTMLDivElement | null>(null);
  const [showFloating, setShowFloating] = useState(false);

  useEffect(() => {
    const el = heroCtaRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setShowFloating(!entry.isIntersecting), {
      rootMargin: "-80px 0px 0px 0px",
      threshold: 0,
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Nav />
      <Hero heroCtaRef={heroCtaRef} />
      <HowItWorks />
      <Proof />
      <Footer />

      {/* Floating CTA once the hero buttons scroll out of view */}
      <div
        className={`fixed bottom-6 right-6 z-50 transition-all duration-500 ${
          showFloating ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-8 opacity-0"
        }`}
      >
        <Link
          to="/auth"
          className="group inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3.5 text-sm font-semibold text-primary-foreground shadow-glow ring-4 ring-primary/10 transition hover:scale-[1.03] hover:bg-primary/95"
        >
          <Sparkles className="h-4 w-4" />
          Monetize my boards free
          <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
        </Link>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Nav                                                                  */
/* ------------------------------------------------------------------ */
function Nav() {
  const [mobileOpen, setMobileOpen] = useState(false);

  const links = [
    { href: "#how", label: "How it works" },
    { href: "#proof", label: "Why Pinearn" },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-6">
        <Link to="/" className="flex items-center gap-2">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary shadow-glow">
            <span className="font-display text-sm font-bold text-primary-foreground">P</span>
          </div>
          <span className="font-display text-lg font-semibold tracking-tight">Pinearn</span>
        </Link>

        <nav className="hidden items-center gap-7 text-sm text-muted-foreground md:flex">
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="group relative py-1 transition hover:text-foreground"
            >
              {l.label}
              <span className="absolute inset-x-0 -bottom-0.5 h-px scale-x-0 bg-primary transition-transform duration-300 group-hover:scale-x-100" />
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Link
            to="/auth"
            className="hidden text-sm font-medium text-muted-foreground transition hover:text-foreground sm:inline-flex"
          >
            Log in
          </Link>
          <Link
            to="/auth"
            className="hidden items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-glow transition hover:scale-[1.03] hover:opacity-90 sm:inline-flex"
          >
            Connect Pinterest <ArrowRight className="h-3.5 w-3.5" />
          </Link>

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
              {links.map((l) => (
                <a
                  key={l.href}
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
                onClick={() => setMobileOpen(false)}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-glow"
              >
                Monetize my boards free <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}

/* ------------------------------------------------------------------ */
/* Fold 1 — Hero: "Your boards already get the clicks. Now make them   */
/* pay." Split layout: copy left, an animated board where pins light   */
/* up with price/link tags one by one on the right.                    */
/* ------------------------------------------------------------------ */
const TRUST_ROW = ["Free to start", "No new content needed", "Works on boards you already have"];

function Hero({ heroCtaRef }: { heroCtaRef: React.RefObject<HTMLDivElement | null> }) {
  return (
    <section className="relative overflow-hidden bg-gradient-hero">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.035]"
        style={{
          backgroundImage: `radial-gradient(circle, var(--foreground) 1px, transparent 1px)`,
          backgroundSize: "32px 32px",
        }}
        aria-hidden
      />
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="animate-blob absolute -left-24 -top-24 h-96 w-96 rounded-full bg-primary/15 blur-[100px]" />
        <div className="animate-blob-delay-2 absolute -right-20 top-10 h-80 w-80 rounded-full bg-accent/20 blur-[100px]" />
      </div>

      <div className="relative mx-auto max-w-6xl px-6 pb-20 pt-16 md:pb-28 md:pt-24">
        <div className="grid items-center gap-14 md:grid-cols-2">
          <motion.div
            className="text-center md:text-left"
            initial="hidden"
            animate="show"
            variants={staggerParent}
          >
            <motion.div
              variants={staggerChild}
              className="inline-flex items-center gap-2 rounded-full border border-border bg-surface/70 px-3 py-1 text-xs text-muted-foreground shadow-sm backdrop-blur"
            >
              <Sparkles className="h-3 w-3 text-primary" />
              For creators who already own Pinterest
            </motion.div>

            <motion.h1
              variants={staggerChild}
              className="mt-5 font-display text-4xl font-semibold leading-[1.06] tracking-tight sm:text-5xl md:text-[3.4rem]"
            >
              Your boards already get the clicks.{" "}
              <span className="text-gradient">Now make them pay.</span>
            </motion.h1>

            <motion.p
              variants={staggerChild}
              className="mx-auto mt-5 max-w-md text-base text-muted-foreground md:mx-0"
            >
              Connect Pinterest and we auto-detect the products in your pins, attach your affiliate
              links, and turn a whole board into income in about a minute.
            </motion.p>

            <motion.div
              ref={heroCtaRef}
              variants={staggerChild}
              className="mt-8 flex flex-col items-center gap-3 sm:flex-row md:justify-start"
            >
              <Link
                to="/auth"
                className="group inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-7 py-3.5 text-sm font-semibold text-primary-foreground shadow-glow transition hover:scale-[1.02] sm:w-auto"
              >
                Monetize my boards free
                <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
              </Link>
              <a
                href="#how"
                className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-border bg-surface px-7 py-3.5 text-sm font-semibold text-foreground transition hover:bg-surface-2 sm:w-auto"
              >
                <PlayCircle className="h-4 w-4 text-primary" /> See a 60-sec demo
              </a>
            </motion.div>

            <motion.div
              variants={staggerChild}
              className="mt-5 flex flex-col items-center gap-2 text-xs text-muted-foreground sm:flex-row sm:flex-wrap md:justify-start"
            >
              {TRUST_ROW.map((t, i) => (
                <span key={t} className="inline-flex items-center gap-2">
                  <span className="inline-flex items-center gap-1">
                    <Check className="h-3.5 w-3.5 text-success" /> {t}
                  </span>
                  {i < TRUST_ROW.length - 1 && (
                    <span className="hidden text-border sm:inline">·</span>
                  )}
                </span>
              ))}
            </motion.div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1], delay: 0.15 }}
          >
            <BoardScanMock />
          </motion.div>
        </div>
      </div>
    </section>
  );
}

/* The hero's hook visual: a real-looking board where the AI "reads" each
   pin and price/link tags pop in one by one — the whole pitch in 3s. */
const HERO_PINS = [
  { g: "from-rose-500 to-pink-600", h: "h-40", tag: "₹1,299 · linked", d: 0.9 },
  { g: "from-amber-400 to-orange-600", h: "h-28", tag: "₹499 · linked", d: 1.7 },
  { g: "from-emerald-400 to-teal-600", h: "h-32", tag: "₹2,150 · linked", d: 2.5 },
  { g: "from-sky-400 to-indigo-600", h: "h-36", tag: "₹899 · linked", d: 3.3 },
  { g: "from-fuchsia-500 to-purple-600", h: "h-28", tag: "₹649 · linked", d: 4.1 },
  { g: "from-red-500 to-rose-700", h: "h-40", tag: "₹1,799 · linked", d: 4.9 },
];

function BoardScanMock() {
  const reduce = useReducedMotion();
  return (
    <div className="relative mx-auto w-full max-w-sm">
      <div
        className="absolute -inset-4 -z-10 rounded-[2.5rem] bg-gradient-primary opacity-15 blur-2xl"
        aria-hidden
      />

      <div className="overflow-hidden rounded-3xl border border-border bg-surface shadow-elevate">
        {/* Board header */}
        <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 gap-0.5 overflow-hidden rounded-lg">
              <div className="flex-[2] bg-gradient-to-br from-rose-500 to-pink-600" />
              <div className="flex flex-1 flex-col gap-0.5">
                <div className="flex-1 bg-gradient-to-br from-amber-400 to-orange-600" />
                <div className="flex-1 bg-gradient-to-br from-emerald-400 to-teal-600" />
              </div>
            </div>
            <div>
              <p className="text-sm font-bold leading-tight">Home decor finds</p>
              <p className="text-[10px] text-muted-foreground">64 pins · syncing live</p>
            </div>
          </div>
          <motion.span
            className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-bold text-primary"
            animate={reduce ? undefined : { opacity: [1, 0.55, 1] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
          >
            <ScanSearch className="h-3 w-3" /> Reading pins…
          </motion.span>
        </div>

        {/* Pins, 2-col masonry-ish; tags pop in one by one */}
        <div className="relative grid grid-cols-2 gap-2.5 p-3">
          {/* Scan sweep */}
          {!reduce && (
            <motion.span
              className="pointer-events-none absolute inset-x-0 top-0 z-10 h-20 bg-gradient-to-b from-primary/25 via-primary/10 to-transparent"
              animate={{ y: ["-15%", "480%"] }}
              transition={{ duration: 3.4, repeat: Infinity, ease: "easeInOut" }}
              aria-hidden
            />
          )}
          {HERO_PINS.map((p, i) => (
            <div
              key={i}
              className={`relative overflow-hidden rounded-xl bg-gradient-to-br ${p.g} ${p.h}`}
            >
              <div className="absolute left-1.5 top-1.5 inline-flex items-center gap-0.5 rounded-full bg-black/45 px-1.5 py-0.5 text-[8px] font-semibold text-white">
                <Eye className="h-2 w-2" /> {(3.4 - i * 0.4).toFixed(1)}k
              </div>
              <motion.span
                initial={{ opacity: 0, scale: 0.5, y: 6 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{
                  delay: reduce ? 0 : p.d,
                  type: "spring",
                  stiffness: 380,
                  damping: 22,
                }}
                className="absolute bottom-1.5 left-1.5 right-1.5 inline-flex items-center justify-center gap-1 rounded-full bg-surface/95 px-1.5 py-1 text-[9px] font-bold text-foreground shadow-sm backdrop-blur"
              >
                <Link2 className="h-2.5 w-2.5 text-primary" /> {p.tag}
              </motion.span>
            </div>
          ))}
        </div>

        {/* Result strip */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: reduce ? 0 : 5.6, duration: 0.4 }}
          className="flex items-center justify-between border-t border-border/60 bg-surface-2/50 px-4 py-3"
        >
          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-success">
            <BadgeCheck className="h-4 w-4" /> 6 products linked
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-gradient-primary px-3 py-1.5 text-[11px] font-bold text-primary-foreground shadow-glow">
            Approve board <ArrowRight className="h-3 w-3" />
          </span>
        </motion.div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Fold 2 — How it works: "From pin to payout, on autopilot"           */
/* ------------------------------------------------------------------ */
const STEPS = [
  {
    n: "01",
    icon: ScanSearch,
    t: "We read your pins",
    b: "AI detects every product inside a pin — no tagging by hand.",
  },
  {
    n: "02",
    icon: Link2,
    t: "We add the links",
    b: "Your affiliate links get attached and dropped into the pin's website link.",
  },
  {
    n: "03",
    icon: BadgeCheck,
    t: "You approve, it's live",
    b: "Review the whole board in one screen and publish in a minute.",
  },
];

const FEATURE_PILLS = ["Creator storefront (link-in-bio)", "SEO booster", "Create-a-pin flow"];

function HowItWorks() {
  return (
    <section id="how" className="border-y border-border/60 bg-surface/30 py-20 md:py-28">
      <div className="mx-auto max-w-6xl px-6">
        <Reveal className="mx-auto max-w-xl text-center">
          <p className="text-sm font-medium text-primary">How it works</p>
          <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight md:text-4xl">
            From pin to payout, on autopilot.
          </h2>
        </Reveal>

        <div className="mt-12 grid grid-cols-1 gap-5 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <Reveal key={s.n} delay={i * 0.08}>
              <div className="group h-full rounded-3xl border border-border bg-surface p-7 transition duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-elevate">
                <div className="flex items-center justify-between">
                  <div className="grid h-11 w-11 place-items-center rounded-xl bg-primary/10 text-primary transition group-hover:bg-primary group-hover:text-primary-foreground">
                    <s.icon className="h-5 w-5" />
                  </div>
                  <span className="font-display text-sm font-bold text-primary/50">{s.n}</span>
                </div>
                <h3 className="mt-4 font-display text-lg font-semibold">{s.t}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{s.b}</p>

                {/* Step 3 gets the "I stay in control" visual — approve toggles */}
                {i === 2 && (
                  <div className="mt-4 space-y-1.5 rounded-2xl bg-surface-2/60 p-2.5">
                    {["Boho wall shelf", "Rattan lamp", "Linen throw"].map((t, j) => (
                      <div
                        key={t}
                        className="flex items-center justify-between rounded-xl bg-surface px-2.5 py-1.5 text-[11px] font-semibold"
                      >
                        <span className="truncate">{t}</span>
                        <span
                          className={`grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full ${
                            j < 2
                              ? "bg-success text-success-foreground"
                              : "border border-border text-transparent"
                          }`}
                        >
                          <Check className="h-2.5 w-2.5" strokeWidth={3.5} />
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal delay={0.2} className="mt-8 flex flex-wrap items-center justify-center gap-2.5">
          {FEATURE_PILLS.map((p) => (
            <span
              key={p}
              className="rounded-full border border-border bg-surface px-4 py-1.5 text-xs font-semibold text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
            >
              {p}
            </span>
          ))}
        </Reveal>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Fold 3 — Proof + final CTA                                          */
/* ------------------------------------------------------------------ */
const STAT_CHIPS = [
  { value: "1 min", label: "to monetize a board" },
  { value: "0", label: "links to copy-paste" },
  { value: "100%", label: "your existing pins" },
];

function Proof() {
  return (
    <section id="proof" className="py-20 md:py-28">
      <div className="mx-auto max-w-4xl px-6 text-center">
        <Reveal>
          <p className="text-sm font-medium text-primary">Why Pinearn</p>
          <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight md:text-4xl">
            Built for creators who already own Pinterest.
          </h2>
        </Reveal>

        <Reveal delay={0.1}>
          <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {STAT_CHIPS.map((s) => (
              <div
                key={s.label}
                className="rounded-3xl border border-border bg-surface p-6 transition duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-elevate"
              >
                <div className="font-display text-3xl font-bold tracking-tight text-gradient">
                  {s.value}
                </div>
                <div className="mt-1 text-sm text-muted-foreground">{s.label}</div>
              </div>
            ))}
          </div>
        </Reveal>

        <Reveal delay={0.15}>
          <div className="mx-auto mt-8 max-w-xl rounded-3xl border border-border bg-surface p-7">
            <Quote className="mx-auto h-6 w-6 text-primary/40" />
            <p className="mt-3 font-display text-lg font-medium leading-relaxed text-foreground/90">
              “I connected one board and had affiliate links live before my chai went cold.”
            </p>
            <div className="mt-4 flex items-center justify-center gap-2.5">
              <div className="grid h-9 w-9 place-items-center rounded-full bg-gradient-primary text-xs font-bold text-primary-foreground">
                C
              </div>
              <div className="text-left">
                <p className="text-xs font-semibold">Creator name</p>
                <p className="text-[11px] text-muted-foreground">@handle · placeholder</p>
              </div>
            </div>
          </div>
        </Reveal>

        <Reveal delay={0.2}>
          <h3 className="mt-14 font-display text-2xl font-semibold tracking-tight md:text-3xl">
            Stop leaving money on your boards.
          </h3>
          <Link
            to="/auth"
            className="group mt-6 inline-flex items-center gap-2 rounded-full bg-primary px-8 py-4 text-base font-semibold text-primary-foreground shadow-glow transition hover:scale-[1.02]"
          >
            Connect Pinterest — it's free
            <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
          </Link>
          <p className="mt-3 text-xs text-muted-foreground">
            Free to start · No new content needed · Works on boards you already have
          </p>
        </Reveal>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Footer                                                               */
/* ------------------------------------------------------------------ */
function Footer() {
  return (
    <footer className="border-t border-border/60">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="flex flex-col items-center justify-between gap-6 sm:flex-row">
          <Link to="/" className="flex items-center gap-2">
            <div className="grid h-7 w-7 place-items-center rounded-lg bg-primary shadow-glow">
              <span className="font-display text-xs font-bold text-primary-foreground">P</span>
            </div>
            <span className="font-display text-base font-semibold">Pinearn</span>
          </Link>
          <div className="flex items-center gap-6 text-sm text-muted-foreground">
            <a href="#how" className="transition hover:text-foreground">
              How it works
            </a>
            <Link to="/auth" className="transition hover:text-foreground">
              Log in
            </Link>
            <Link to="/privacy" className="transition hover:text-foreground">
              Privacy
            </Link>
          </div>
        </div>
        <div className="mt-8 flex flex-col items-center justify-between gap-3 border-t border-border/60 pt-6 text-xs text-muted-foreground sm:flex-row">
          <span>© {new Date().getFullYear()} Pinearn. All rights reserved.</span>
          <span>Pinearn is an independent product and is not affiliated with Pinterest, Inc.</span>
        </div>
      </div>
    </footer>
  );
}

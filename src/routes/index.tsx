import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion, type Variants } from "framer-motion";
import { ArrowRight, BadgeCheck, Heart, Link2, TrendingUp } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Pinearn — Your pins already get clicks. Now make them pay." },
      {
        name: "description",
        content:
          "Connect Pinterest and Pinearn auto-detects the products in your pins, attaches your affiliate links, and turns a whole board into income in about a minute.",
      },
      {
        property: "og:title",
        content: "Pinearn — Your pins already get clicks. Now make them pay.",
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
/* Real pin imagery — Unsplash CDN over a brand-gradient underlay, so  */
/* a failed load can never leave a blank tile.                          */
/* ------------------------------------------------------------------ */
const img = (id: string, w = 480) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&q=70`;

const IMG = {
  chair: img("photo-1586023492125-27b2c045efd7"),
  livingRoom: img("photo-1522708323590-d24dbb6b0267"),
  modelPink: img("photo-1515886657613-9f3515b0c78f"),
  shoppingBags: img("photo-1483985988355-763728e1935b"),
  clothesRail: img("photo-1434389677669-e08b4cac3105"),
  foodTable: img("photo-1504674900247-0877df9cc836"),
  salad: img("photo-1512621776951-a57141f2eefd"),
  makeup: img("photo-1596462502278-27bfdc403348"),
  watch: img("photo-1523275335684-37898b6baf30"),
  sneakerRed: img("photo-1542291026-7eec264c27ff"),
  handbag: img("photo-1584917865442-de89df76afd3"),
  plants: img("photo-1463320726281-696a485928c7"),
};

function PinImg({ src, g }: { src: string; g: string }) {
  return (
    <span className={`absolute inset-0 block bg-gradient-to-br ${g}`} aria-hidden>
      <img
        src={src}
        alt=""
        draggable={false}
        loading="eager"
        decoding="async"
        className="h-full w-full object-cover"
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).style.display = "none";
        }}
      />
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Landing = splash → welcome. One viewport each, zero scroll.         */
/* ------------------------------------------------------------------ */
function Landing() {
  const reduce = useReducedMotion();
  const [splash, setSplash] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setSplash(false), reduce ? 600 : 2000);
    return () => clearTimeout(t);
  }, [reduce]);

  return (
    <div className="h-dvh overflow-hidden bg-background text-foreground">
      <AnimatePresence mode="wait">
        {splash ? (
          <Splash key="splash" onDone={() => setSplash(false)} />
        ) : (
          <Welcome key="welcome" />
        )}
      </AnimatePresence>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Splash — full-bleed brand red, breathing logo mark, tap to skip.    */
/* ------------------------------------------------------------------ */
function Splash({ onDone }: { onDone: () => void }) {
  const reduce = useReducedMotion();
  return (
    <motion.button
      type="button"
      aria-label="Continue"
      onClick={onDone}
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.04 }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      className="relative flex h-dvh w-full cursor-default flex-col items-center justify-center overflow-hidden bg-gradient-primary text-primary-foreground"
    >
      {/* Drifting light blobs */}
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="animate-blob absolute -left-24 -top-24 h-96 w-96 rounded-full bg-white/10 blur-[90px]" />
        <div className="animate-blob-delay-2 absolute -bottom-28 -right-20 h-96 w-96 rounded-full bg-black/15 blur-[90px]" />
      </div>

      {/* Logo mark — springs in, then breathes */}
      <motion.div
        initial={reduce ? undefined : { scale: 0.6, opacity: 0 }}
        animate={reduce ? { opacity: 1 } : { scale: [0.6, 1.06, 1], opacity: 1 }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
      >
        <motion.img
          src="/pinearn-logo.png"
          alt="Pinearn"
          draggable={false}
          animate={reduce ? undefined : { scale: [1, 1.04, 1] }}
          transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut", delay: 0.7 }}
          className="h-28 w-28 rounded-[28px] shadow-elevate"
        />
      </motion.div>

      <motion.p
        initial={reduce ? undefined : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: reduce ? 0 : 0.35, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="mt-5 font-display text-3xl font-semibold tracking-tight"
      >
        Pinearn
      </motion.p>

      {/* Bottom tagline + progress shimmer */}
      <div className="safe-bottom absolute inset-x-0 bottom-6 flex flex-col items-center gap-3">
        <motion.p
          initial={reduce ? undefined : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: reduce ? 0 : 0.7 }}
          className="text-xs font-semibold uppercase tracking-[0.2em] text-primary-foreground/80"
        >
          Pins → payouts
        </motion.p>
        <div className="h-1 w-24 overflow-hidden rounded-full bg-white/20">
          <motion.div
            className="h-full w-1/3 rounded-full bg-white/90"
            animate={reduce ? { x: 64 } : { x: [-32, 96] }}
            transition={reduce ? undefined : { duration: 1.1, repeat: Infinity, ease: "easeInOut" }}
          />
        </div>
      </div>
    </motion.button>
  );
}

/* ------------------------------------------------------------------ */
/* Welcome — one screen, no scroll: pin collage up top fading into the */
/* canvas, one loud claim, thumb-reach CTAs pinned at the bottom.      */
/* ------------------------------------------------------------------ */
const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.1 } },
};
const rise: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] } },
};

type WelcomePin = { src: string; g: string; tag?: string; save?: boolean; d?: number };

const WELCOME_COLLAGE: WelcomePin[][] = [
  [
    { src: IMG.chair, g: "from-rose-400 to-pink-600", save: true },
    { src: IMG.salad, g: "from-amber-400 to-orange-600", tag: "₹499", d: 1.2 },
    { src: IMG.clothesRail, g: "from-sky-400 to-indigo-600" },
  ],
  [
    { src: IMG.modelPink, g: "from-emerald-400 to-teal-600", tag: "₹1,299", d: 0.8 },
    { src: IMG.livingRoom, g: "from-red-500 to-rose-700", save: true },
    { src: IMG.watch, g: "from-fuchsia-500 to-purple-600", tag: "₹2,150", d: 1.7 },
  ],
  [
    { src: IMG.shoppingBags, g: "from-indigo-400 to-violet-600" },
    { src: IMG.makeup, g: "from-teal-400 to-cyan-600", save: true },
    { src: IMG.sneakerRed, g: "from-orange-400 to-red-500", tag: "₹899", d: 2.2 },
  ],
];

function Welcome() {
  const reduce = useReducedMotion();
  return (
    <motion.main
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="relative mx-auto grid h-dvh w-full max-w-lg grid-rows-[minmax(0,1fr)_auto_auto] overflow-hidden"
    >
      {/* ---- Collage band (fades into the canvas) ---- */}
      <div className="relative min-h-0">
        <div
          className="absolute inset-0 px-3 pt-3"
          style={{
            maskImage: "linear-gradient(180deg, black 62%, transparent 97%)",
            WebkitMaskImage: "linear-gradient(180deg, black 62%, transparent 97%)",
          }}
        >
          <div className="grid h-full grid-cols-3 gap-2.5">
            {WELCOME_COLLAGE.map((col, ci) => (
              <motion.div
                key={ci}
                initial={reduce ? undefined : { opacity: 0, y: ci === 1 ? -24 : 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1], delay: 0.1 + ci * 0.12 }}
                className={`flex min-h-0 flex-col gap-2.5 ${ci === 1 ? "-mt-1" : "mt-5"}`}
              >
                {col.map((p, pi) => (
                  <div key={pi} className="relative flex-1 overflow-hidden rounded-2xl shadow-sm">
                    <PinImg src={p.src} g={p.g} />
                    {p.save && (
                      <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-primary px-2 py-1 text-[9px] font-bold text-primary-foreground">
                        <Heart className="h-2.5 w-2.5" fill="currentColor" /> Save
                      </span>
                    )}
                    {p.tag && (
                      <motion.span
                        initial={{ opacity: 0, scale: 0.5, y: 8 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        transition={{
                          delay: reduce ? 0 : (p.d ?? 1),
                          type: "spring",
                          stiffness: 380,
                          damping: 22,
                        }}
                        className="absolute bottom-2 left-2 right-2 inline-flex items-center justify-center gap-1 rounded-full bg-surface/95 px-1.5 py-1 text-[9px] font-bold text-foreground shadow-sm backdrop-blur"
                      >
                        <Link2 className="h-2.5 w-2.5 text-primary" /> {p.tag} · linked
                      </motion.span>
                    )}
                  </div>
                ))}
              </motion.div>
            ))}
          </div>
        </div>

        {/* Floating proof chips riding the collage */}
        <div className="animate-float absolute right-3 top-[30%] z-10">
          <div className="glass flex items-center gap-1.5 rounded-2xl px-3 py-2 text-xs font-bold shadow-elevate">
            <TrendingUp className="h-3.5 w-3.5 text-success" /> +₹214 today
          </div>
        </div>
        <div className="animate-float-delay absolute left-3 top-[55%] z-10">
          <div className="glass flex items-center gap-1.5 rounded-2xl px-3 py-2 text-xs font-bold shadow-elevate">
            <BadgeCheck className="h-3.5 w-3.5 text-primary" /> 3 linked
          </div>
        </div>
      </div>

      {/* ---- Claim ---- */}
      <motion.div
        variants={stagger}
        initial="hidden"
        animate="show"
        className="relative z-10 -mt-2 px-6 text-center"
      >
        <motion.img
          variants={rise}
          src="/pinearn-logo.png"
          alt=""
          draggable={false}
          className="mx-auto h-14 w-14 rounded-2xl shadow-elevate"
        />
        <motion.h1
          variants={rise}
          className="mx-auto mt-3 max-w-[15ch] font-display text-[clamp(1.8rem,7.5vw,2.6rem)] font-semibold leading-[1.08] tracking-tight"
        >
          Your pins already get clicks. <span className="text-gradient">Make them pay.</span>
        </motion.h1>
        <motion.p variants={rise} className="mt-2 text-sm text-muted-foreground">
          AI links the products in your pins. You earn.
        </motion.p>
      </motion.div>

      {/* ---- CTAs pinned at the thumb ---- */}
      <motion.div
        variants={stagger}
        initial="hidden"
        animate="show"
        className="safe-bottom relative z-10 px-5 pb-4 pt-5"
      >
        <motion.div variants={rise}>
          <Link
            to="/auth"
            className="group flex min-h-[54px] w-full items-center justify-center gap-2 rounded-full bg-primary text-[16px] font-bold text-primary-foreground shadow-glow transition active:scale-[0.98]"
          >
            Start free
            <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
          </Link>
        </motion.div>
        <motion.div variants={rise} className="mt-2.5">
          <Link
            to="/auth"
            className="flex min-h-[54px] w-full items-center justify-center rounded-full bg-surface-2 text-[16px] font-semibold text-foreground ring-1 ring-border transition active:scale-[0.98]"
          >
            Log in
          </Link>
        </motion.div>
        <motion.p
          variants={rise}
          className="mt-3 text-center text-[11px] leading-relaxed text-muted-foreground"
        >
          Free to start · Works on boards you already have
          <br />
          Not affiliated with Pinterest ·{" "}
          <Link to="/privacy" className="underline underline-offset-2 hover:text-foreground">
            Privacy
          </Link>
        </motion.p>
      </motion.div>
    </motion.main>
  );
}

export type Brand = {
  id: string;
  name: string;
  commission: number; // %
  category: "beauty" | "fashion" | "electronics" | "lifestyle";
  color: string; // ring/label color
  logoText?: string; // fallback glyph inside circle
  domain?: string; // clearbit logo domain
  description?: string;
  tracking?: string;
  confirmation?: string;
  avgEarnings?: string;
};

export const BRAND_CATEGORIES = [
  { id: "all", label: "All" },
  { id: "beauty", label: "Beauty" },
  { id: "fashion", label: "Fashion" },
  { id: "electronics", label: "Electronics" },
  { id: "lifestyle", label: "Lifestyle" },
] as const;

export const BEST_SELLING_BRANDS: Brand[] = [
  {
    id: "myntra",
    name: "Myntra",
    commission: 12,
    category: "fashion",
    color: "#ff3f6c",
    logoText: "M",
    domain: "myntra.com",
    avgEarnings: "₹85,000/month",
  },
  {
    id: "ajio",
    name: "AJIO",
    commission: 14,
    category: "fashion",
    color: "#2b2b2b",
    logoText: "A",
    domain: "ajio.com",
    avgEarnings: "₹72,000/month",
  },
  {
    id: "flipkart",
    name: "Flipkart",
    commission: 8,
    category: "electronics",
    color: "#2874f0",
    logoText: "F",
    domain: "flipkart.com",
    avgEarnings: "₹65,000/month",
  },
  {
    id: "amazon",
    name: "amazon.in",
    commission: 10,
    category: "electronics",
    color: "#ff9900",
    logoText: "a",
    domain: "amazon.in",
    avgEarnings: "₹90,000/month",
  },
  {
    id: "nykaa",
    name: "Nykaa Fashion",
    commission: 13,
    category: "beauty",
    color: "#e6007e",
    logoText: "N",
    domain: "nykaafashion.com",
    avgEarnings: "₹78,000/month",
  },
  {
    id: "westside",
    name: "Westside",
    commission: 11,
    category: "fashion",
    color: "#111",
    logoText: "W",
    domain: "westside.com",
    avgEarnings: "₹55,000/month",
  },
  // No domain — mi.com's fetched logo bakes the "Xiaomi" wordmark into the
  // image itself (not something CSS can crop cleanly), so this one uses the
  // plain initial-letter avatar instead of an auto-fetched logo.
  {
    id: "mi",
    name: "Mi",
    commission: 6,
    category: "electronics",
    color: "#ff6900",
    logoText: "MI",
    avgEarnings: "₹45,000/month",
  },
  {
    id: "motorola",
    name: "Motorola",
    commission: 5,
    category: "electronics",
    color: "#5c92fa",
    logoText: "M",
    domain: "motorola.com",
    avgEarnings: "₹40,000/month",
  },
];

export const ALL_BRANDS: Brand[] = [
  ...BEST_SELLING_BRANDS,
  {
    id: "wow",
    name: "WOW Skin Science",
    commission: 55,
    category: "beauty",
    color: "#0a0a0a",
    logoText: "W",
    domain: "wowskinscienceindia.com",
  },
  {
    id: "nathabit",
    name: "Nat Habit",
    commission: 60,
    category: "beauty",
    color: "#2f6b3a",
    logoText: "N",
    domain: "nathabit.in",
  },
  {
    id: "arata",
    name: "Arata",
    commission: 50,
    category: "beauty",
    color: "#1e3a8a",
    logoText: "A",
    domain: "arata.in",
  },
  {
    id: "nua",
    name: "Nua",
    commission: 52,
    category: "beauty",
    color: "#ff6b6b",
    logoText: "n",
    domain: "nua.co.in",
  },
  {
    id: "newme",
    name: "NEWME",
    commission: 48,
    category: "fashion",
    color: "#22c55e",
    logoText: "NM",
    domain: "newmeforever.com",
  },
  {
    id: "palmonas",
    name: "Palmonas",
    commission: 45,
    category: "lifestyle",
    color: "#1f2937",
    logoText: "P",
    domain: "palmonas.com",
  },
  { id: "fyva", name: "Fyva", commission: 50, category: "beauty", color: "#7c3aed", logoText: "F" },
  {
    id: "jivisa",
    name: "Jivisa",
    commission: 55,
    category: "lifestyle",
    color: "#eab308",
    logoText: "J",
  },
  {
    id: "dotkey",
    name: "Dot & Key",
    commission: 40,
    category: "beauty",
    color: "#111",
    logoText: "D&K",
    domain: "dotandkey.com",
  },
  {
    id: "sugar",
    name: "Sugar Cosmetics",
    commission: 42,
    category: "beauty",
    color: "#111",
    logoText: "S",
    domain: "sugarcosmetics.com",
  },
  {
    id: "mamaearth",
    name: "Mamaearth",
    commission: 38,
    category: "beauty",
    color: "#22c55e",
    logoText: "m",
    domain: "mamaearth.in",
  },
  {
    id: "swissbeauty",
    name: "Swiss Beauty",
    commission: 44,
    category: "beauty",
    color: "#111",
    logoText: "SB",
    domain: "swissbeauty.in",
  },
];

export function getBrand(id: string): Brand | undefined {
  return ALL_BRANDS.find((b) => b.id === id);
}

// Visual-search results report a retailer name (e.g. "Amazon.in", "Flipkart")
// with no commission rate of their own — match it against our real brand
// catalog's commission rate; fall back to a conservative flat estimate for
// retailers we don't have a specific rate for.
const DEFAULT_COMMISSION_PCT = 8;

export function estimateCommissionPct(source: string): number {
  const s = source.toLowerCase();
  const match = ALL_BRANDS.find(
    (b) => s.includes(b.name.toLowerCase()) || (b.domain && s.includes(b.domain.split(".")[0])),
  );
  return match?.commission ?? DEFAULT_COMMISSION_PCT;
}

export function estimateEarning(source: string, extractedValue: number): number {
  return Math.round(extractedValue * (estimateCommissionPct(source) / 100));
}

// Real stored products have no brand field of their own — derive a display
// name from the affiliate link's domain when no better label is on hand.
export function hostBrand(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").split(".")[0];
  } catch {
    return "shop";
  }
}

export function brandLogoUrl(brand: Brand): string | null {
  if (!brand.domain) return null;
  const token = import.meta.env.VITE_LOVABLE_CONNECTOR_LOGO_DEV_API_KEY;
  if (token) {
    return `https://img.logo.dev/${brand.domain}?token=${token}&size=200&format=png`;
  }
  return `https://logo.clearbit.com/${brand.domain}`;
}

// Matches a product/affiliate-link URL's hostname against our known brand
// catalog (exact domain or subdomain) — used to show a real retailer logo
// badge on a product card instead of just its plain text name.
export function brandForUrl(url: string): Brand | undefined {
  let hostname: string;
  try {
    hostname = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return undefined;
  }
  return ALL_BRANDS.find(
    (b) => b.domain && (hostname === b.domain || hostname.endsWith(`.${b.domain}`)),
  );
}

// Retailer domains CK's product-details API is onboarded with. Visual search
// turns up listings from arbitrary retailers, but CK can only resolve these —
// any match outside this list must never be sent to the CK product API.
export const CK_SUPPORTED_RETAILER_DOMAINS = [
  "flipkart.com",
  "amazon.in",
  "nykaa.com",
  "mamaearth.in",
  "mamaearth.com",
  "myntra.com",
  "buywow.in",
  "buywow.com",
  "wowskinscienceindia.com",
  "ustraa.com",
  "arata.in",
  "arata.com",
  "amocare.com",
  "dermaco.in",
  "thedermaco.com",
  "boat-lifestyle.com",
  "beardo.in",
  "dotandkey.com",
  "plumgoodness.com",
  "themancompany.com",
  "mcaffeine.com",
  "letshyphen.com",
  "nutristar.in",
  "optimumnutrition.co.in",
  "nakpro.com",
  "mycf.in",
  "bigmusclesnutrition.com",
  "oziva.in",
  "guardian.in",
  "wellbeingnutrition.com",
  "zenithnutrition.com",
  "naturaltein.in",
  "croma.com",
  "reliancedigital.in",
  "muscleblaze.com",
  "hyugalife.com",
  "nutrabay.com",
  "avvatarindia.com",
  "hkvitals.com",
  "thewholetruthfoods.com",
  "kapiva.in",
  "herbalife.com",
  "plixlife.com",
  "store.wellversed.in",
  "zepto.com",
  "blinkit.com",
  "swiggy.com",
  "shopsy.in",
] as const;

const CK_SUPPORTED_RETAILER_SET = new Set<string>(CK_SUPPORTED_RETAILER_DOMAINS);

// True if `url`'s host is (or is a subdomain of) one of the CK-supported
// retailer domains above. Set-based lookup — walks the hostname's own domain
// chain (e.g. "shop.flipkart.com" -> "flipkart.com") checking each ancestor
// against the Set, so it's O(depth) (effectively O(1) for a real hostname's
// 2-4 labels) rather than O(N) over the retailer list, while still matching
// subdomains correctly.
export function isSupportedRetailerLink(url: string): boolean {
  let hostname: string;
  try {
    hostname = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return false;
  }
  let candidate = hostname;
  while (candidate) {
    if (CK_SUPPORTED_RETAILER_SET.has(candidate)) return true;
    const dot = candidate.indexOf(".");
    if (dot === -1) return false;
    candidate = candidate.slice(dot + 1);
  }
  return false;
}

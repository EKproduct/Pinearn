// Curated, reliably-hosted product photos (Unsplash direct static URLs) used
// as stand-ins wherever we don't have a real product image yet — e.g. AI
// visual-search suggestions. LoremFlickr was used here previously but is a
// flaky third-party placeholder service that frequently fails to load.
const PLACEHOLDER_PRODUCT_IMAGES = [
  "https://images.unsplash.com/photo-1524758631624-e2822e304c36?auto=format&fit=crop&w=400&q=60", // pendant lamp
  "https://images.unsplash.com/photo-1584990347449-a5d9f800a783?auto=format&fit=crop&w=400&q=60", // dutch oven / cookware
  "https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=400&q=60", // cast iron skillet
  "https://images.unsplash.com/photo-1490481651871-ab68de25d43d?auto=format&fit=crop&w=400&q=60", // slip dress / fashion
  "https://images.unsplash.com/photo-1556228720-195a672e8a03?auto=format&fit=crop&w=400&q=60", // skincare serum
  "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=400&q=60", // suitcase / travel
  "https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?auto=format&fit=crop&w=400&q=60", // beauty routine
  "https://images.unsplash.com/photo-1441984904996-e0b6ba687e04?auto=format&fit=crop&w=400&q=60", // home decor
  "https://images.unsplash.com/photo-1560343090-f0409e92791a?auto=format&fit=crop&w=400&q=60", // sneakers
  "https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=400&q=60", // watch / accessory
] as const;

function hashSeed(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export function pickPlaceholderImage(seed: string): string {
  const idx = hashSeed(seed) % PLACEHOLDER_PRODUCT_IMAGES.length;
  return PLACEHOLDER_PRODUCT_IMAGES[idx];
}

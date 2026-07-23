-- The public storefront page (/s/$slug) reads pins with the anon key to
-- build its collections/products list, but pins only ever had an
-- owner-only RLS policy ("pins owner all") and no anon GRANT — so every
-- storefront's public page saw zero pins and showed "still being set up"
-- even when the owner had live products. Mirror the "collections public
-- read" policy, scoped to live pins only (drafts/new pins never leak).
GRANT SELECT ON public.pins TO anon;

CREATE POLICY "pins public read live" ON public.pins
  FOR SELECT TO anon, authenticated
  USING (status = 'live');

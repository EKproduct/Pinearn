GRANT SELECT ON public.storefronts TO anon;
GRANT SELECT ON public.storefront_products TO anon;

CREATE POLICY "storefronts public read"
ON public.storefronts FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "storefront_products public read"
ON public.storefront_products FOR SELECT
TO anon, authenticated
USING (true);

-- 1. Enforce a single storefront per creator
DELETE FROM public.storefronts s
USING public.storefronts s2
WHERE s.user_id = s2.user_id
  AND s.created_at > s2.created_at;

ALTER TABLE public.storefronts
  ADD CONSTRAINT storefronts_user_id_unique UNIQUE (user_id);

-- 2. Collections (Pinterest-style boards) grouped inside a creator's single storefront
CREATE TABLE public.collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  storefront_id uuid NOT NULL REFERENCES public.storefronts(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL,
  description text,
  cover_color text DEFAULT '#7C5CFF',
  pinterest_board_id text,
  source text NOT NULL DEFAULT 'manual',
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (storefront_id, slug)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.collections TO authenticated;
GRANT SELECT ON public.collections TO anon;
GRANT ALL ON public.collections TO service_role;

ALTER TABLE public.collections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "collections owner all" ON public.collections
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "collections public read" ON public.collections
  FOR SELECT TO anon, authenticated USING (true);

CREATE TRIGGER trg_collections_updated
  BEFORE UPDATE ON public.collections
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- 3. Link pins and products into collections
ALTER TABLE public.pins
  ADD COLUMN collection_id uuid REFERENCES public.collections(id) ON DELETE SET NULL;

ALTER TABLE public.storefront_products
  ADD COLUMN collection_id uuid REFERENCES public.collections(id) ON DELETE SET NULL;

-- 4. Auto-create a default storefront the moment a profile is created
CREATE OR REPLACE FUNCTION public.ensure_default_storefront()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  base_slug text;
  final_slug text;
  n int := 0;
BEGIN
  IF EXISTS (SELECT 1 FROM public.storefronts WHERE user_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  base_slug := regexp_replace(lower(coalesce(NEW.display_name, 'shop')), '[^a-z0-9]+', '-', 'g');
  base_slug := regexp_replace(base_slug, '(^-|-$)', '', 'g');
  IF base_slug = '' THEN base_slug := 'shop'; END IF;
  final_slug := base_slug;
  WHILE EXISTS (SELECT 1 FROM public.storefronts WHERE slug = final_slug) LOOP
    n := n + 1;
    final_slug := base_slug || '-' || n;
  END LOOP;

  INSERT INTO public.storefronts (user_id, name, slug, description, is_default)
  VALUES (
    NEW.id,
    coalesce(NEW.display_name, 'My Shop'),
    final_slug,
    'Curated picks and affiliate links from ' || coalesce(NEW.display_name, 'my Pinterest'),
    true
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profile_default_storefront ON public.profiles;
CREATE TRIGGER trg_profile_default_storefront
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.ensure_default_storefront();

-- 5. Backfill: give any existing profile without a storefront one
INSERT INTO public.storefronts (user_id, name, slug, description, is_default)
SELECT
  p.id,
  coalesce(p.display_name, 'My Shop'),
  regexp_replace(lower(coalesce(p.display_name, 'shop-') || substr(p.id::text, 1, 6)), '[^a-z0-9]+', '-', 'g'),
  'Curated picks and affiliate links',
  true
FROM public.profiles p
WHERE NOT EXISTS (SELECT 1 FROM public.storefronts s WHERE s.user_id = p.id);

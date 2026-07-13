
-- Storefront background image
ALTER TABLE public.storefronts ADD COLUMN IF NOT EXISTS is_published boolean NOT NULL DEFAULT false;
ALTER TABLE public.storefronts ADD COLUMN IF NOT EXISTS background_image_url text;

-- Soft-remove for collections
ALTER TABLE public.collections ADD COLUMN IF NOT EXISTS hidden_from_storefront_at timestamptz;

-- Boards
CREATE TABLE IF NOT EXISTS public.boards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  storefront_id uuid NOT NULL REFERENCES public.storefronts(id) ON DELETE CASCADE,
  name text NOT NULL,
  cover_image_url text,
  position integer NOT NULL DEFAULT 0,
  hidden_from_storefront_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.boards TO authenticated;
GRANT SELECT ON public.boards TO anon;
GRANT ALL ON public.boards TO service_role;

ALTER TABLE public.boards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "boards owner all" ON public.boards
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "boards public read published" ON public.boards
  FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM public.storefronts s WHERE s.id = boards.storefront_id AND s.is_published = true));

CREATE TRIGGER trg_boards_updated BEFORE UPDATE ON public.boards
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Board -> Collections join
CREATE TABLE IF NOT EXISTS public.board_collections (
  board_id uuid NOT NULL REFERENCES public.boards(id) ON DELETE CASCADE,
  collection_id uuid NOT NULL REFERENCES public.collections(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (board_id, collection_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.board_collections TO authenticated;
GRANT SELECT ON public.board_collections TO anon;
GRANT ALL ON public.board_collections TO service_role;

ALTER TABLE public.board_collections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "board_collections owner all" ON public.board_collections
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "board_collections public read" ON public.board_collections
  FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM public.boards b JOIN public.storefronts s ON s.id = b.storefront_id WHERE b.id = board_collections.board_id AND s.is_published = true));

-- Storage policies for storefront-covers bucket
CREATE POLICY "storefront-covers public read" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'storefront-covers');

CREATE POLICY "storefront-covers owner write" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'storefront-covers' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "storefront-covers owner update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'storefront-covers' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "storefront-covers owner delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'storefront-covers' AND (storage.foldername(name))[1] = auth.uid()::text);

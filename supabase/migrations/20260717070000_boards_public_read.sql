-- The public storefront page's Collections/Boards tab toggle only renders
-- when boards.length > 0, but "boards public read published" gated on
-- storefronts.is_published — a flag nothing in the app ever sets to true
-- (grep confirms no writer exists). So anon visitors always saw zero
-- boards, and the tab toggle silently never appeared, same root cause as
-- the pins visibility bug fixed in 20260717060000. Align both policies
-- with "collections public read" (USING (true)) — visibility is already
-- scoped at the query layer via hidden_from_storefront_at.
DROP POLICY IF EXISTS "boards public read published" ON public.boards;
CREATE POLICY "boards public read" ON public.boards
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "board_collections public read" ON public.board_collections;
CREATE POLICY "board_collections public read" ON public.board_collections
  FOR SELECT TO anon, authenticated USING (true);

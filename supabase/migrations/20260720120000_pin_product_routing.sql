-- Route affiliate products to the specific PIN they were attached to (not just
-- a collection), so the analytics pin breakdown can show every product on a
-- pin, and so taking a pin/collection down can cleanly detach its products.
alter table public.storefront_products
  add column if not exists pin_id uuid references public.pins(id) on delete cascade;

create index if not exists storefront_products_pin_id_idx
  on public.storefront_products (pin_id);

-- Remember the board (collection) a pin came from before it went live. Going
-- live moves the pin into its own per-pin collection; this lets "take down"
-- return the pin to its original board instead of orphaning it, so the set of
-- boards/pins a user has never changes.
alter table public.pins
  add column if not exists origin_collection_id uuid references public.collections(id) on delete set null;

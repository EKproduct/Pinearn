# Storefront redesign

Pinterest-style Collections + Boards on the storefront page, with cover uploads, reorder, editable background, and soft-remove.

## Database

New migration:

- Add `board_id uuid` to `public.collections` (nullable, FK → `boards.id`, `on delete set null`).
- Add `hidden_from_storefront_at timestamptz` to `public.collections` for soft-remove.
- Add `background_image_url text` to `public.storefronts`.
- Create `public.boards` table:
  ```
  id uuid pk, user_id uuid, storefront_id uuid, name text,
  cover_image_url text, position int default 0,
  created_at timestamptz default now()
  ```
  with GRANTs + RLS (owner-only insert/update/delete/select via `auth.uid() = user_id`).
- New storage bucket `storefront-covers` (public read) for collection/board covers and storefront backgrounds.

## Storefront page (`src/routes/_authenticated/storefront.tsx`)

1. **Background image band** at top of storefront body, using `storefronts.background_image_url` with a beautiful default (Unsplash-hosted landscape URL). Small "Change background" pencil overlay opens file picker → uploads to `storefront-covers` → updates `storefronts.background_image_url`.

2. **Tabs `Collections | Boards`** just under the store header. Pinterest-style pill switcher.

3. **Collections tab**:
   - Fetches collections where `hidden_from_storefront_at IS NULL`, ordered by `position asc`.
   - Card cover falls back to the **latest** pin/product's image (newest first) when `cover_image_url` is null — updates default thumbnail logic.
   - **New collection dialog**: name + cover image upload (optional).
   - **Reorder mode toggle**: enters a mode with ↑/↓ arrows on each card that swap `position` values. Exit with "Done".
   - Delete becomes **Remove from storefront**: sets `hidden_from_storefront_at = now()`. Collection stays linked to pins/products.

4. **Boards tab**:
   - Fetches boards ordered by `position`.
   - Each board renders a 2x2 mosaic of its collections' covers (Pinterest board style).
   - **New board dialog**: name + cover upload + multi-select existing collections to include.
   - Tapping a board opens it → shows its collections in a grid → tapping a collection opens the existing `CollectionPinsDialog`.
   - Reorder + soft-remove for boards mirror collections.

5. **Newest-first ordering**: `storefront-pins` and `collection-products` queries already sort by `created_at desc`; verify and mirror in the default-cover logic (`pins[0]?.image_url ?? products[0]?.image_url`).

## Affiliate link picker (`src/components/affiliate-link-dialog.tsx`)

No structural changes — collections it shows already filter to `hidden_from_storefront_at IS NULL` after this migration (add the filter to the query).

## Out of scope

- Drag-and-drop reordering (arrow buttons only — reliable on mobile web).
- Bulk board editing beyond the create dialog.
- Boards feeding into the affiliate-link picker (product still attaches to a Collection).

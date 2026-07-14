-- RLS policies for these buckets already exist in earlier migrations
-- (pin-images, avatars, storefront-covers), but the buckets themselves
-- were never created, which caused "Bucket not found" on upload.
insert into storage.buckets (id, name, public)
values
  ('pin-images', 'pin-images', false),
  ('avatars', 'avatars', true),
  ('storefront-covers', 'storefront-covers', true)
on conflict (id) do nothing;

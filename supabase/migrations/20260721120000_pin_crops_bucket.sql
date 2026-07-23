-- Public storage bucket for object-detection component crops.
--
-- The matching pipeline (src/lib/pinterest.functions.ts) detects the products
-- inside a pin, then runs Google Lens on each cropped component for far more
-- accurate matches. Lens can only read a public URL (not base64), so each crop
-- is uploaded here and its public URL is fed to Lens. Uploads are performed by
-- the service-role client (bypasses RLS); reads are public because the bucket
-- is public. This runs entirely off the match path, so it never affects
-- matching latency.
insert into storage.buckets (id, name, public)
values ('pin-crops', 'pin-crops', true)
on conflict (id) do nothing;

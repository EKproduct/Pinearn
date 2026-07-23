-- This is a creator app — only pins the user actually authored on Pinterest
-- (is_owner = true) should ever be synced/shown, never pins they merely
-- saved/repinned from someone else. Default true so pins created directly
-- in-app (createPinterestPin) are correctly "owned" without extra plumbing.
ALTER TABLE public.pins
  ADD COLUMN IF NOT EXISTS is_owner boolean NOT NULL DEFAULT true;

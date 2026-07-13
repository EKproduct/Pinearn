ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS pinterest_username text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS onboarding_completed boolean NOT NULL DEFAULT false;
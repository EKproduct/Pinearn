
-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_url TEXT,
  pinterest_connected BOOLEAN NOT NULL DEFAULT false,
  source_platform TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles self read" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "profiles self write" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles self update" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- Storefronts
CREATE TABLE public.storefronts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  brand_color TEXT DEFAULT '#7C5CFF',
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.storefronts TO authenticated;
GRANT ALL ON public.storefronts TO service_role;
ALTER TABLE public.storefronts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "storefronts owner all" ON public.storefronts FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Products / affiliate links inside a storefront
CREATE TABLE public.storefront_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  storefront_id UUID NOT NULL REFERENCES public.storefronts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  affiliate_url TEXT NOT NULL,
  image_url TEXT,
  price_cents INTEGER,
  currency TEXT DEFAULT 'USD',
  commission_pct NUMERIC(5,2),
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.storefront_products TO authenticated;
GRANT ALL ON public.storefront_products TO service_role;
ALTER TABLE public.storefront_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "products owner all" ON public.storefront_products FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Pins
CREATE TABLE public.pins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  storefront_id UUID REFERENCES public.storefronts(id) ON DELETE SET NULL,
  product_id UUID REFERENCES public.storefront_products(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  image_url TEXT,
  external_url TEXT,
  source TEXT DEFAULT 'pinterest',
  status TEXT NOT NULL DEFAULT 'draft',
  impressions INTEGER NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0,
  conversions INTEGER NOT NULL DEFAULT 0,
  earnings_cents INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pins TO authenticated;
GRANT ALL ON public.pins TO service_role;
ALTER TABLE public.pins ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pins owner all" ON public.pins FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.tg_set_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER set_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER set_storefronts_updated_at BEFORE UPDATE ON public.storefronts FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER set_pins_updated_at BEFORE UPDATE ON public.pins FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END; $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

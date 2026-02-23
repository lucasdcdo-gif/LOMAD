-- Migration to create the coupons table for the MASTER role

CREATE TABLE IF NOT EXISTS public.coupons (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  code text NOT NULL UNIQUE,
  type text NOT NULL CHECK (type IN ('PERCENTAGE', 'FIXED')),
  value numeric NOT NULL CHECK (value > 0),
  valid_from timestamptz,
  valid_until timestamptz,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- Enable RLS
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;

-- Policies
-- Anyone can view active coupons (needed for checkout validation)
CREATE POLICY "Public can view active coupons"
  ON public.coupons FOR SELECT
  USING (is_active = true);

-- Masters can do everything (we handle this in the backend with service role, but good to have)
-- If we were to do it via RLS, we'd need to join profiles. For simplicity, since the backend uses the service key for admin routes,
-- we'll rely on the backend enforcing the MASTER role.

-- Grants
GRANT SELECT ON public.coupons TO authenticated, anon;
GRANT ALL ON public.coupons TO service_role;

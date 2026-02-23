-- Migration to add OPL field for Welcome Email control
-- opl = 0 means email not sent, opl = 1 means email sent

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS opl integer DEFAULT 0;

-- Optional: If you want all existing users to NOT receive the welcome email now,
-- you can run the following update:
-- UPDATE public.profiles SET opl = 1;

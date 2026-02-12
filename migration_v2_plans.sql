-- Migration V2: Plans & Recall.ai

-- 1. Update 'role' check constraint logic (if applicable)
-- Since supabase 'text' columns don't strictly enforce enums unless a constraint exists,
-- we generally just insert the new string values. If there is a constraint, we'd need to drop and recreate it.
-- For safety, we will assume standard text behavior but document the intent.
-- New Roles: 'PRO_PLUS', 'LOMAD_PLUS'

-- 2. Add columns to 'profiles'
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS bot_name text,
ADD COLUMN IF NOT EXISTS recall_id text,
ADD COLUMN IF NOT EXISTS calendar_connected boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS plan_limit_minutes int,
ADD COLUMN IF NOT EXISTS usage_minutes int DEFAULT 0,
ADD COLUMN IF NOT EXISTS extra_minutes int DEFAULT 0; -- Bank for 'Add-on' hours

-- 3. Comment on columns for clarity
COMMENT ON COLUMN profiles.bot_name IS 'User customizable bot name suffix';
COMMENT ON COLUMN profiles.recall_id IS 'ID of the user in Recall.ai system';
COMMENT ON COLUMN profiles.plan_limit_minutes IS 'Monthly limit in minutes (e.g., 600 for PRO+)';

-- 4. (Optional) Create a table for Recall.ai webhooks log if needed for debugging
CREATE TABLE IF NOT EXISTS recall_webhooks (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  payload jsonb,
  created_at timestamptz DEFAULT now()
);

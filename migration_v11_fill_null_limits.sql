-- 1. Default NULL users to 600 (10 Hours)
UPDATE profiles 
SET plan_limit_minutes = 600
WHERE plan_limit_minutes IS NULL AND role IN ('PRO', 'PRO_PLUS');

-- 2. Alter the table to apply the default going forward
ALTER TABLE profiles 
ALTER COLUMN plan_limit_minutes SET DEFAULT 600;

-- 3. Just to be completely safe, default extra_minutes to 0 instead of leaving it NULL as well
UPDATE profiles
SET extra_minutes = 0
WHERE extra_minutes IS NULL;

ALTER TABLE profiles
ALTER COLUMN extra_minutes SET DEFAULT 0;

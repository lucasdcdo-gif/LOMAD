-- Enable the pg_cron extension (Required for scheduling jobs)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Create a function to delete meetings older than 30 days
-- This aligns with LGPD compliance for data minimizing and retention
CREATE OR REPLACE FUNCTION delete_old_meetings()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Delete records where timestamp is older than 30 days (in milliseconds)
  -- 30 days * 24 hours * 60 minutes * 60 seconds * 1000 milliseconds
  DELETE FROM meetings
  WHERE timestamp < (extract(epoch from now()) * 1000 - 2592000000);
END;
$$;

-- Schedule the job using pg_cron extension
-- Ensure you have enabled the 'pg_cron' extension in your Supabase Dashboard if this fails
-- Extension > pg_cron > Enable
SELECT cron.schedule(
  'delete-old-meetings-30days', -- Job name
  '0 3 * * *',                  -- Schedule: Every day at 03:00 AM
  'SELECT delete_old_meetings()' -- Command to execute
);

-- To verify if job is scheduled:
-- select * from cron.job;

-- To manually run for testing:
-- select delete_old_meetings();

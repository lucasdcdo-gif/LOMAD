-- Migration to add meeting duration columns

ALTER TABLE public.meetings 
ADD COLUMN IF NOT EXISTS started_at timestamptz,
ADD COLUMN IF NOT EXISTS completed_at timestamptz,
ADD COLUMN IF NOT EXISTS duration_minutes integer,
ADD COLUMN IF NOT EXISTS "OPLQTNCALL" integer DEFAULT 0;

-- Optional Comments
COMMENT ON COLUMN public.meetings.started_at IS 'Meeting exact start time from Recall.ai recording';
COMMENT ON COLUMN public.meetings.completed_at IS 'Meeting exact end time from Recall.ai recording';
COMMENT ON COLUMN public.meetings.duration_minutes IS 'Total calculated duration of the meeting in minutes';
COMMENT ON COLUMN public.meetings."OPLQTNCALL" IS 'Flag indicating if duration has been automatically fetched (0=pending, 1=done)';

-- Update existing meetings to skip this routine if they are old (optional)
UPDATE public.meetings SET "OPLQTNCALL" = 1;

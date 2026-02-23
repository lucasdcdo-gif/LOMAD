-- Migration to add participants tracking columns to meetings table

ALTER TABLE public.meetings 
ADD COLUMN IF NOT EXISTS participants jsonb,
ADD COLUMN IF NOT EXISTS "OPLgetpeople" integer DEFAULT 0;

-- Optional Comments
COMMENT ON COLUMN public.meetings.participants IS 'Array of participant names fetched from Recall.ai';
COMMENT ON COLUMN public.meetings."OPLgetpeople" IS 'Flag to indicate if participants have been fetched (0=no, 1=yes)';

-- Migration to add OPL field for Transcription Ready Email control
-- opl = 0 means email not sent, opl = 1 means email sent

ALTER TABLE public.meetings
ADD COLUMN IF NOT EXISTS opl integer DEFAULT 0;

-- Prevent retro-spam: mark all existing meetings as having the email sent
-- If a meeting is old, we don't want to spam the users now
UPDATE public.meetings SET opl = 1;

-- If a meeting is currently processing ('Processando...'), you might want to set opl = 0
-- so it gets sent later, but it's safer to just set everything to 1 for now and let
-- new meetings follow the flow properly.
UPDATE public.meetings
SET opl = 0
WHERE summary = 'Processando...';

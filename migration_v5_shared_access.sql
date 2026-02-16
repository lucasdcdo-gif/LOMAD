-- Migration V5: Shared Transcripts

-- 1. Create meeting_access table
CREATE TABLE IF NOT EXISTS public.meeting_access (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    meeting_id UUID NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE, -- Nullable identifying existing user
    email TEXT NOT NULL, -- Mandatory for pending invites
    role TEXT DEFAULT 'viewer',
    status TEXT DEFAULT 'pending', -- 'pending', 'accepted'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(meeting_id, email)
);

-- 2. RLS Policies for meeting_access
ALTER TABLE public.meeting_access ENABLE ROW LEVEL SECURITY;

-- Allow users to view access records where they are the assignee
CREATE POLICY "Users can view their own access" ON public.meeting_access
    FOR SELECT USING (auth.uid() = user_id);

-- Allow meeting owners (from meetings table) to manage access
-- (This might be complex in RLS without a join, simplified for now: if you can see the meeting, you can see who has access? No, let's keep it simple)
-- Ideally: "Users can insert/update access if they own the meeting_id"

-- 3. Create a VIEW to simplify "My Meetings + Shared Meetings"
-- This view consolidates meetings I own AND meetings shared with me.
CREATE OR REPLACE VIEW public.user_meetings_view AS
SELECT
    m.id,
    m.user_id as owner_id,
    m.title,
    m.summary,
    m.timestamp,
    m.video_url,
    m.transcriptions, -- JSONB
    m.notes,
    -- Add an 'access_role' column to distinguish ownership
    CASE 
        WHEN m.user_id = auth.uid() THEN 'owner'
        ELSE coalesce(ma.role, 'viewer')
    END as access_role,
    -- Add 'shared_by' email if it's shared
    p.email as owner_email
FROM
    public.meetings m
LEFT JOIN
    public.meeting_access ma ON m.id = ma.meeting_id AND ma.user_id = auth.uid()
LEFT JOIN
    public.profiles p ON m.user_id = p.id
WHERE
    m.user_id = auth.uid() -- My meetings
    OR
    ma.user_id = auth.uid(); -- Shared with me

-- 4. Grant access to the view
GRANT SELECT ON public.user_meetings_view TO authenticated;

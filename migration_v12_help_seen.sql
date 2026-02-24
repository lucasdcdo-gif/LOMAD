-- Add boolean column to profiles for recording if the user closed the help tutorial
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS has_seen_help boolean DEFAULT FALSE;

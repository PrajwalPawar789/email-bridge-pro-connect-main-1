-- Add sender display name to email configs
ALTER TABLE public.email_configs
ADD COLUMN IF NOT EXISTS sender_name TEXT;

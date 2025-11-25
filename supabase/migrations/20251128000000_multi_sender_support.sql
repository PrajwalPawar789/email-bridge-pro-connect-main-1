
-- Add sender info to prospects
ALTER TABLE public.prospects
ADD COLUMN IF NOT EXISTS sender_name TEXT,
ADD COLUMN IF NOT EXISTS sender_email TEXT;

-- Create campaign_email_configurations table
CREATE TABLE IF NOT EXISTS public.campaign_email_configurations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  email_config_id UUID NOT NULL REFERENCES public.email_configs(id) ON DELETE CASCADE,
  daily_limit INTEGER NOT NULL DEFAULT 100,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(campaign_id, email_config_id)
);

-- Add assigned_email_config_id to recipients
ALTER TABLE public.recipients
ADD COLUMN IF NOT EXISTS assigned_email_config_id UUID REFERENCES public.email_configs(id);

-- Enable RLS
ALTER TABLE public.campaign_email_configurations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own campaign email configs"
  ON public.campaign_email_configurations
  USING (
    campaign_id IN (SELECT id FROM public.campaigns WHERE user_id = auth.uid())
  );

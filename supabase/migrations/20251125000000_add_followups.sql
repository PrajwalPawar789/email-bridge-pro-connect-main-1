
-- Create table for campaign follow-up steps
CREATE TABLE IF NOT EXISTS public.campaign_followups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  step_number INTEGER NOT NULL, -- 1 = First follow-up (Step 2 of sequence), 2 = Second follow-up, etc.
  template_id UUID REFERENCES public.email_templates(id), -- Optional: Link to a saved template
  subject TEXT, -- Optional: If null, we use "Re: [Original Subject]" to thread it
  body TEXT, -- Content of the follow-up. If template_id is present, this can be a snapshot or override.
  delay_days INTEGER NOT NULL DEFAULT 3, -- How many days to wait after the PREVIOUS step
  delay_hours INTEGER DEFAULT 0, -- Optional: Add hours for finer control
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Add tracking columns to recipients table
ALTER TABLE public.recipients 
ADD COLUMN IF NOT EXISTS replied BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS current_step INTEGER DEFAULT 0, -- 0 = Initial email sent, 1 = Follow-up 1 sent
ADD COLUMN IF NOT EXISTS last_email_sent_at TIMESTAMP WITH TIME ZONE, -- Timestamp of the LAST email sent to this person
ADD COLUMN IF NOT EXISTS message_id TEXT; -- The Message-ID of the last email sent (for threading/reply-to)

-- Index for faster lookups during cron jobs
CREATE INDEX IF NOT EXISTS idx_recipients_campaign_step ON public.recipients(campaign_id, current_step, replied);
CREATE INDEX IF NOT EXISTS idx_recipients_last_sent ON public.recipients(last_email_sent_at);

-- RLS Policies
ALTER TABLE public.campaign_followups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own campaign followups"
  ON public.campaign_followups
  USING (
    campaign_id IN (SELECT id FROM public.campaigns WHERE user_id = auth.uid())
  );

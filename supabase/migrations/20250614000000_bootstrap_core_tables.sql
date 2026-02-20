-- Bootstrap missing core tables so subsequent historical migrations can run via CLI.
-- This migration is idempotent and safe on projects where these objects already exist.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.email_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  smtp_host TEXT NOT NULL,
  smtp_port INTEGER NOT NULL,
  smtp_username TEXT NOT NULL,
  smtp_password TEXT NOT NULL,
  security TEXT NOT NULL,
  imap_host TEXT NOT NULL,
  imap_port INTEGER NOT NULL,
  sender_name TEXT
);

CREATE TABLE IF NOT EXISTS public.email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  body TEXT NOT NULL DEFAULT '',
  is_html BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS public.campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'ready', 'sending', 'paused', 'sent', 'failed', 'scheduled', 'completed')),
  scheduled_at TIMESTAMPTZ,
  sent_count INTEGER NOT NULL DEFAULT 0,
  opened_count INTEGER NOT NULL DEFAULT 0,
  clicked_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  send_delay_minutes INTEGER DEFAULT 0,
  batch_size INTEGER DEFAULT 10,
  emails_per_hour INTEGER DEFAULT 60,
  body TEXT NOT NULL DEFAULT '',
  template_id UUID REFERENCES public.email_templates(id) ON DELETE SET NULL,
  total_recipients INTEGER DEFAULT 0,
  last_batch_sent_at TIMESTAMPTZ,
  bounced_count INTEGER DEFAULT 0,
  replied_count INTEGER DEFAULT 0,
  bot_open_count INTEGER DEFAULT 0,
  bot_click_count INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.prospects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  company TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  email_list_id UUID,
  sender_name TEXT,
  sender_email TEXT,
  country TEXT,
  industry TEXT,
  job_title TEXT
);

CREATE TABLE IF NOT EXISTS public.recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  opened_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,
  track_open_link TEXT,
  track_click_link TEXT,
  replied BOOLEAN NOT NULL DEFAULT false,
  current_step INTEGER NOT NULL DEFAULT 0,
  last_email_sent_at TIMESTAMPTZ,
  message_id TEXT,
  bounced BOOLEAN NOT NULL DEFAULT false,
  bounced_at TIMESTAMPTZ,
  assigned_email_config_id UUID,
  updated_at TIMESTAMPTZ DEFAULT now(),
  thread_id TEXT,
  sender_email TEXT
);

CREATE TABLE IF NOT EXISTS public.email_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  config_id UUID NOT NULL REFERENCES public.email_configs(id) ON DELETE CASCADE,
  folder TEXT NOT NULL,
  uid BIGINT NOT NULL,
  from_email TEXT NOT NULL,
  to_email TEXT NOT NULL,
  subject TEXT,
  body TEXT,
  date TIMESTAMPTZ NOT NULL,
  read BOOLEAN NOT NULL DEFAULT false,
  message_id TEXT,
  in_reply_to TEXT,
  "references" TEXT[],
  to_emails TEXT[],
  cc_emails TEXT[],
  reply_to TEXT[],
  attachments JSONB,
  direction TEXT,
  thread_id TEXT,
  reply_to_message_id UUID
);

CREATE INDEX IF NOT EXISTS idx_campaigns_user_id ON public.campaigns(user_id);
CREATE INDEX IF NOT EXISTS idx_prospects_user_id ON public.prospects(user_id);
CREATE INDEX IF NOT EXISTS idx_recipients_campaign_id ON public.recipients(campaign_id);
CREATE INDEX IF NOT EXISTS idx_email_messages_config_id ON public.email_messages(config_id);

ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prospects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "campaigns owner access" ON public.campaigns;
CREATE POLICY "campaigns owner access"
  ON public.campaigns
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "prospects owner access" ON public.prospects;
CREATE POLICY "prospects owner access"
  ON public.prospects
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "email configs owner access" ON public.email_configs;
CREATE POLICY "email configs owner access"
  ON public.email_configs
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "email templates owner access" ON public.email_templates;
CREATE POLICY "email templates owner access"
  ON public.email_templates
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "email messages owner access" ON public.email_messages;
CREATE POLICY "email messages owner access"
  ON public.email_messages
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "recipients owner access via campaign" ON public.recipients;
CREATE POLICY "recipients owner access via campaign"
  ON public.recipients
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.campaigns c
      WHERE c.id = campaign_id
        AND c.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.campaigns c
      WHERE c.id = campaign_id
        AND c.user_id = auth.uid()
    )
  );

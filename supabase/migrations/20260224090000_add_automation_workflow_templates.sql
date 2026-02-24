CREATE TABLE IF NOT EXISTS public.automation_workflow_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'General',
  use_case TEXT,
  trigger_type TEXT NOT NULL DEFAULT 'list_joined' CHECK (trigger_type IN ('list_joined', 'manual')),
  trigger_filters JSONB NOT NULL DEFAULT '{}'::jsonb,
  flow JSONB NOT NULL DEFAULT '[]'::jsonb,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  runner_compatible BOOLEAN NOT NULL DEFAULT true,
  is_featured BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 100,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_automation_workflow_templates_sort
  ON public.automation_workflow_templates(
    is_active DESC,
    is_featured DESC,
    sort_order ASC,
    created_at ASC
  );

ALTER TABLE public.automation_workflow_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view active automation workflow templates" ON public.automation_workflow_templates;
CREATE POLICY "Users can view active automation workflow templates"
  ON public.automation_workflow_templates
  FOR SELECT
  USING (is_active = true);

DROP TRIGGER IF EXISTS update_automation_workflow_templates_updated_at ON public.automation_workflow_templates;
CREATE TRIGGER update_automation_workflow_templates_updated_at
BEFORE UPDATE ON public.automation_workflow_templates
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

INSERT INTO public.automation_workflow_templates (
  slug,
  name,
  description,
  category,
  use_case,
  trigger_type,
  trigger_filters,
  flow,
  settings,
  tags,
  runner_compatible,
  is_featured,
  sort_order,
  is_active
)
VALUES
  (
    'email-marketing-nurture-sequence',
    'Email Marketing Nurture Sequence',
    'Three-touch nurture flow for new leads with spaced follow-ups.',
    'Email Marketing',
    'Warm up fresh leads from a list and move them toward a reply.',
    'list_joined',
    '{}'::jsonb,
    $$[
      {"id":"send_intro","name":"Send intro email","type":"send_email","config":{"sender_config_id":"","template_id":"","subject":"Welcome - quick next step for {company}","body":"Hi {first_name},\n\nThanks for connecting. I wanted to share a quick idea for {company}.\n\nWould you be open to a short chat this week?\n\nBest,\n{sender_name}","is_html":false,"thread_with_previous":true}},
      {"id":"wait_2_days","name":"Wait 2 days","type":"wait","config":{"duration":2,"unit":"days"}},
      {"id":"send_value","name":"Send value follow-up","type":"send_email","config":{"sender_config_id":"","template_id":"","subject":"Idea for your current priorities","body":"Hi {first_name},\n\nSharing a short example of how teams like {company} improve results with this workflow.\n\nShould I send a one-page breakdown?\n\nBest,\n{sender_name}","is_html":false,"thread_with_previous":true}},
      {"id":"wait_3_days","name":"Wait 3 days","type":"wait","config":{"duration":3,"unit":"days"}},
      {"id":"send_last_call","name":"Send final check-in","type":"send_email","config":{"sender_config_id":"","template_id":"","subject":"Close the loop?","body":"Hi {first_name},\n\nI know priorities shift quickly. If this is not a fit right now, no problem.\n\nIf helpful, I can still share a short plan specific to {company}.\n\nBest,\n{sender_name}","is_html":false,"thread_with_previous":true}},
      {"id":"stop","name":"Stop","type":"stop","config":{}}
    ]$$::jsonb,
    $${
      "workflow_graph": {
        "id": "tpl_email_marketing_nurture",
        "name": "Email Marketing Nurture Sequence",
        "status": "draft",
        "version": 1,
        "nodes": [
          {"id":"trigger","kind":"trigger","title":"Trigger","position":{"x":120,"y":140},"status":"draft","config":{"triggerType":"list_joined"}},
          {"id":"send_intro","kind":"send_email","title":"Send Intro Email","position":{"x":420,"y":140},"status":"draft","config":{"subject":"Welcome - quick next step for {company}","body":"Hi {first_name},\n\nThanks for connecting. I wanted to share a quick idea for {company}.\n\nWould you be open to a short chat this week?\n\nBest,\n{sender_name}","senderConfigId":"","templateId":"","personalizationTokens":["{first_name}","{company}","{sender_name}"],"threadWithPrevious":true}},
          {"id":"wait_2_days","kind":"wait","title":"Wait 2 Days","position":{"x":710,"y":140},"status":"draft","config":{"duration":2,"unit":"days","randomized":false,"randomMaxMinutes":0,"timeWindowStart":"09:00","timeWindowEnd":"18:00"}},
          {"id":"send_value","kind":"send_email","title":"Send Value Follow-up","position":{"x":1000,"y":140},"status":"draft","config":{"subject":"Idea for your current priorities","body":"Hi {first_name},\n\nSharing a short example of how teams like {company} improve results with this workflow.\n\nShould I send a one-page breakdown?\n\nBest,\n{sender_name}","senderConfigId":"","templateId":"","personalizationTokens":["{first_name}","{company}","{sender_name}"],"threadWithPrevious":true}},
          {"id":"wait_3_days","kind":"wait","title":"Wait 3 Days","position":{"x":1290,"y":140},"status":"draft","config":{"duration":3,"unit":"days","randomized":false,"randomMaxMinutes":0,"timeWindowStart":"09:00","timeWindowEnd":"18:00"}},
          {"id":"send_last_call","kind":"send_email","title":"Send Final Check-in","position":{"x":1580,"y":140},"status":"draft","config":{"subject":"Close the loop?","body":"Hi {first_name},\n\nI know priorities shift quickly. If this is not a fit right now, no problem.\n\nIf helpful, I can still share a short plan specific to {company}.\n\nBest,\n{sender_name}","senderConfigId":"","templateId":"","personalizationTokens":["{first_name}","{company}","{sender_name}"],"threadWithPrevious":true}},
          {"id":"exit","kind":"exit","title":"Exit","position":{"x":1870,"y":140},"status":"draft","config":{"reason":"completed"}}
        ],
        "edges": [
          {"id":"edge_trigger_send_intro","source":"trigger","target":"send_intro","sourceHandle":"out","targetHandle":"in","animated":true},
          {"id":"edge_send_intro_wait_2","source":"send_intro","target":"wait_2_days","sourceHandle":"out","targetHandle":"in","animated":true},
          {"id":"edge_wait_2_send_value","source":"wait_2_days","target":"send_value","sourceHandle":"out","targetHandle":"in","animated":true},
          {"id":"edge_send_value_wait_3","source":"send_value","target":"wait_3_days","sourceHandle":"out","targetHandle":"in","animated":true},
          {"id":"edge_wait_3_send_last","source":"wait_3_days","target":"send_last_call","sourceHandle":"out","targetHandle":"in","animated":true},
          {"id":"edge_send_last_exit","source":"send_last_call","target":"exit","sourceHandle":"out","targetHandle":"in","animated":true}
        ]
      }
    }$$::jsonb,
    ARRAY['email', 'nurture', 'onboarding'],
    true,
    true,
    10,
    true
  ),
  (
    'highly-personalized-email-marketing',
    'Highly Personalized Email Marketing',
    'Personalization-first sequence with dynamic placeholders for role, company, and sender.',
    'Personalized Outreach',
    'Account-level outreach where message relevance matters more than volume.',
    'list_joined',
    '{}'::jsonb,
    $$[
      {"id":"send_personal_intro","name":"Send personalized opener","type":"send_email","config":{"sender_config_id":"","template_id":"","subject":"{first_name}, a tailored idea for {company}","body":"Hi {first_name},\n\nI noticed your work in {job_title} at {company}.\n\nBased on that, I put together a specific idea that could fit your priorities this quarter.\n\nOpen to seeing it?\n\nBest,\n{sender_name}","is_html":false,"thread_with_previous":true}},
      {"id":"wait_1_day","name":"Wait 1 day","type":"wait","config":{"duration":1,"unit":"days"}},
      {"id":"send_personal_proof","name":"Send personalized proof","type":"send_email","config":{"sender_config_id":"","template_id":"","subject":"Relevant example for {company}","body":"Hi {first_name},\n\nOne team with a similar motion used this to speed up meetings booked without increasing send volume.\n\nIf useful, I can map this directly to your current process.\n\nBest,\n{sender_name}","is_html":false,"thread_with_previous":true}},
      {"id":"wait_2_days","name":"Wait 2 days","type":"wait","config":{"duration":2,"unit":"days"}},
      {"id":"send_personal_breakup","name":"Send final personalized note","type":"send_email","config":{"sender_config_id":"","template_id":"","subject":"Should I close this out?","body":"Hi {first_name},\n\nIf now is not the right time, I can close this thread.\n\nIf priorities changed and this is still relevant for {company}, happy to send a short plan.\n\nBest,\n{sender_name}","is_html":false,"thread_with_previous":true}},
      {"id":"stop","name":"Stop","type":"stop","config":{}}
    ]$$::jsonb,
    $${
      "workflow_graph": {
        "id": "tpl_personalized_email_marketing",
        "name": "Highly Personalized Email Marketing",
        "status": "draft",
        "version": 1,
        "nodes": [
          {"id":"trigger","kind":"trigger","title":"Trigger","position":{"x":120,"y":240},"status":"draft","config":{"triggerType":"list_joined"}},
          {"id":"send_personal_intro","kind":"send_email","title":"Personalized Opener","position":{"x":420,"y":240},"status":"draft","config":{"subject":"{first_name}, a tailored idea for {company}","body":"Hi {first_name},\n\nI noticed your work in {job_title} at {company}.\n\nBased on that, I put together a specific idea that could fit your priorities this quarter.\n\nOpen to seeing it?\n\nBest,\n{sender_name}","senderConfigId":"","templateId":"","personalizationTokens":["{first_name}","{company}","{job_title}","{sender_name}"],"threadWithPrevious":true}},
          {"id":"wait_1_day","kind":"wait","title":"Wait 1 Day","position":{"x":710,"y":240},"status":"draft","config":{"duration":1,"unit":"days","randomized":false,"randomMaxMinutes":0,"timeWindowStart":"09:00","timeWindowEnd":"18:00"}},
          {"id":"send_personal_proof","kind":"send_email","title":"Send Personalized Proof","position":{"x":1000,"y":240},"status":"draft","config":{"subject":"Relevant example for {company}","body":"Hi {first_name},\n\nOne team with a similar motion used this to speed up meetings booked without increasing send volume.\n\nIf useful, I can map this directly to your current process.\n\nBest,\n{sender_name}","senderConfigId":"","templateId":"","personalizationTokens":["{first_name}","{company}","{sender_name}"],"threadWithPrevious":true}},
          {"id":"wait_2_days","kind":"wait","title":"Wait 2 Days","position":{"x":1290,"y":240},"status":"draft","config":{"duration":2,"unit":"days","randomized":false,"randomMaxMinutes":0,"timeWindowStart":"09:00","timeWindowEnd":"18:00"}},
          {"id":"send_personal_breakup","kind":"send_email","title":"Final Personalized Note","position":{"x":1580,"y":240},"status":"draft","config":{"subject":"Should I close this out?","body":"Hi {first_name},\n\nIf now is not the right time, I can close this thread.\n\nIf priorities changed and this is still relevant for {company}, happy to send a short plan.\n\nBest,\n{sender_name}","senderConfigId":"","templateId":"","personalizationTokens":["{first_name}","{company}","{sender_name}"],"threadWithPrevious":true}},
          {"id":"exit","kind":"exit","title":"Exit","position":{"x":1870,"y":240},"status":"draft","config":{"reason":"completed"}}
        ],
        "edges": [
          {"id":"edge_trigger_intro","source":"trigger","target":"send_personal_intro","sourceHandle":"out","targetHandle":"in","animated":true},
          {"id":"edge_intro_wait1","source":"send_personal_intro","target":"wait_1_day","sourceHandle":"out","targetHandle":"in","animated":true},
          {"id":"edge_wait1_proof","source":"wait_1_day","target":"send_personal_proof","sourceHandle":"out","targetHandle":"in","animated":true},
          {"id":"edge_proof_wait2","source":"send_personal_proof","target":"wait_2_days","sourceHandle":"out","targetHandle":"in","animated":true},
          {"id":"edge_wait2_breakup","source":"wait_2_days","target":"send_personal_breakup","sourceHandle":"out","targetHandle":"in","animated":true},
          {"id":"edge_breakup_exit","source":"send_personal_breakup","target":"exit","sourceHandle":"out","targetHandle":"in","animated":true}
        ]
      }
    }$$::jsonb,
    ARRAY['email', 'personalization', 'account-based'],
    true,
    true,
    20,
    true
  ),
  (
    'webhook-based-email-marketing',
    'Webhook Based Email Marketing',
    'Starts from a webhook event and routes contacts into an email follow-up path.',
    'Webhook Automation',
    'Event-driven automation for product usage or external system events.',
    'manual',
    '{}'::jsonb,
    $$[
      {"id":"stop","name":"Stop","type":"stop","config":{}}
    ]$$::jsonb,
    $${
      "requires_runner_support": true,
      "workflow_graph": {
        "id": "tpl_webhook_email_marketing",
        "name": "Webhook Based Email Marketing",
        "status": "draft",
        "version": 1,
        "nodes": [
          {"id":"trigger","kind":"trigger","title":"Trigger","position":{"x":120,"y":340},"status":"draft","config":{"triggerType":"manual"}},
          {"id":"webhook_ingest","kind":"webhook","title":"Receive Webhook Payload","position":{"x":430,"y":340},"status":"draft","config":{"url":"https://api.example.com/events/marketing","method":"POST","payloadTemplate":"{\"email\":\"{email}\",\"event\":\"signup\"}"}},
          {"id":"wait_15m","kind":"wait","title":"Wait 15 Minutes","position":{"x":740,"y":340},"status":"draft","config":{"duration":15,"unit":"minutes","randomized":false,"randomMaxMinutes":0,"timeWindowStart":"00:00","timeWindowEnd":"23:59"}},
          {"id":"send_webhook_followup","kind":"send_email","title":"Send Event Follow-up","position":{"x":1050,"y":340},"status":"draft","config":{"subject":"Thanks for your recent activity","body":"Hi {first_name},\n\nWe noticed your recent activity and wanted to share the next best step.\n\nBest,\n{sender_name}","senderConfigId":"","templateId":"","personalizationTokens":["{first_name}","{sender_name}"],"threadWithPrevious":true}},
          {"id":"exit","kind":"exit","title":"Exit","position":{"x":1360,"y":340},"status":"draft","config":{"reason":"completed"}}
        ],
        "edges": [
          {"id":"edge_trigger_webhook","source":"trigger","target":"webhook_ingest","sourceHandle":"out","targetHandle":"in","animated":true},
          {"id":"edge_webhook_wait","source":"webhook_ingest","target":"wait_15m","sourceHandle":"out","targetHandle":"in","animated":true},
          {"id":"edge_wait_send","source":"wait_15m","target":"send_webhook_followup","sourceHandle":"out","targetHandle":"in","animated":true},
          {"id":"edge_send_exit","source":"send_webhook_followup","target":"exit","sourceHandle":"out","targetHandle":"in","animated":true}
        ]
      }
    }$$::jsonb,
    ARRAY['webhook', 'event-driven', 'advanced'],
    false,
    true,
    30,
    true
  ),
  (
    'webinar-follow-up-sequence',
    'Webinar Follow-up Sequence',
    'Post-event campaign for attendees with recap and meeting CTA.',
    'Event Follow-up',
    'Keep event momentum and convert engaged attendees into meetings.',
    'list_joined',
    '{}'::jsonb,
    $$[
      {"id":"send_thank_you","name":"Send thank-you email","type":"send_email","config":{"sender_config_id":"","template_id":"","subject":"Thanks for joining the session","body":"Hi {first_name},\n\nThanks for joining our webinar. Sharing key takeaways and next steps.\n\nBest,\n{sender_name}","is_html":false,"thread_with_previous":true}},
      {"id":"wait_1_day","name":"Wait 1 day","type":"wait","config":{"duration":1,"unit":"days"}},
      {"id":"send_recording","name":"Send recording + summary","type":"send_email","config":{"sender_config_id":"","template_id":"","subject":"Recording + summary inside","body":"Hi {first_name},\n\nHere is the session recording plus a short summary you can share internally.\n\nBest,\n{sender_name}","is_html":false,"thread_with_previous":true}},
      {"id":"wait_2_days","name":"Wait 2 days","type":"wait","config":{"duration":2,"unit":"days"}},
      {"id":"send_meeting_cta","name":"Send meeting CTA","type":"send_email","config":{"sender_config_id":"","template_id":"","subject":"Want a tailored walkthrough?","body":"Hi {first_name},\n\nIf helpful, I can walk through a tailored setup for {company} in 20 minutes.\n\nBest,\n{sender_name}","is_html":false,"thread_with_previous":true}},
      {"id":"stop","name":"Stop","type":"stop","config":{}}
    ]$$::jsonb,
    $${
      "workflow_graph": {
        "id": "tpl_webinar_follow_up",
        "name": "Webinar Follow-up Sequence",
        "status": "draft",
        "version": 1,
        "nodes": [
          {"id":"trigger","kind":"trigger","title":"Trigger","position":{"x":120,"y":440},"status":"draft","config":{"triggerType":"list_joined"}},
          {"id":"send_thank_you","kind":"send_email","title":"Send Thank-you","position":{"x":420,"y":440},"status":"draft","config":{"subject":"Thanks for joining the session","body":"Hi {first_name},\n\nThanks for joining our webinar. Sharing key takeaways and next steps.\n\nBest,\n{sender_name}","senderConfigId":"","templateId":"","personalizationTokens":["{first_name}","{sender_name}"],"threadWithPrevious":true}},
          {"id":"wait_1_day","kind":"wait","title":"Wait 1 Day","position":{"x":710,"y":440},"status":"draft","config":{"duration":1,"unit":"days","randomized":false,"randomMaxMinutes":0,"timeWindowStart":"09:00","timeWindowEnd":"18:00"}},
          {"id":"send_recording","kind":"send_email","title":"Send Recording","position":{"x":1000,"y":440},"status":"draft","config":{"subject":"Recording + summary inside","body":"Hi {first_name},\n\nHere is the session recording plus a short summary you can share internally.\n\nBest,\n{sender_name}","senderConfigId":"","templateId":"","personalizationTokens":["{first_name}","{sender_name}"],"threadWithPrevious":true}},
          {"id":"wait_2_days","kind":"wait","title":"Wait 2 Days","position":{"x":1290,"y":440},"status":"draft","config":{"duration":2,"unit":"days","randomized":false,"randomMaxMinutes":0,"timeWindowStart":"09:00","timeWindowEnd":"18:00"}},
          {"id":"send_meeting_cta","kind":"send_email","title":"Send Meeting CTA","position":{"x":1580,"y":440},"status":"draft","config":{"subject":"Want a tailored walkthrough?","body":"Hi {first_name},\n\nIf helpful, I can walk through a tailored setup for {company} in 20 minutes.\n\nBest,\n{sender_name}","senderConfigId":"","templateId":"","personalizationTokens":["{first_name}","{company}","{sender_name}"],"threadWithPrevious":true}},
          {"id":"exit","kind":"exit","title":"Exit","position":{"x":1870,"y":440},"status":"draft","config":{"reason":"completed"}}
        ],
        "edges": [
          {"id":"edge_trigger_ty","source":"trigger","target":"send_thank_you","sourceHandle":"out","targetHandle":"in","animated":true},
          {"id":"edge_ty_wait1","source":"send_thank_you","target":"wait_1_day","sourceHandle":"out","targetHandle":"in","animated":true},
          {"id":"edge_wait1_recording","source":"wait_1_day","target":"send_recording","sourceHandle":"out","targetHandle":"in","animated":true},
          {"id":"edge_recording_wait2","source":"send_recording","target":"wait_2_days","sourceHandle":"out","targetHandle":"in","animated":true},
          {"id":"edge_wait2_cta","source":"wait_2_days","target":"send_meeting_cta","sourceHandle":"out","targetHandle":"in","animated":true},
          {"id":"edge_cta_exit","source":"send_meeting_cta","target":"exit","sourceHandle":"out","targetHandle":"in","animated":true}
        ]
      }
    }$$::jsonb,
    ARRAY['webinar', 'follow-up', 'events'],
    true,
    false,
    40,
    true
  ),
  (
    're-engagement-winback-sequence',
    'Re-engagement Winback Sequence',
    'Win back inactive contacts with a concise multi-touch sequence.',
    'Lifecycle',
    'Re-engage cold prospects or dormant subscribers.',
    'list_joined',
    '{}'::jsonb,
    $$[
      {"id":"send_miss_you","name":"Send re-engagement email","type":"send_email","config":{"sender_config_id":"","template_id":"","subject":"Still relevant for {company}?","body":"Hi {first_name},\n\nIt has been a while since we connected.\n\nIf improving outbound results is still on your roadmap, I can share an updated playbook.\n\nBest,\n{sender_name}","is_html":false,"thread_with_previous":true}},
      {"id":"wait_4_days","name":"Wait 4 days","type":"wait","config":{"duration":4,"unit":"days"}},
      {"id":"send_offer","name":"Send value offer","type":"send_email","config":{"sender_config_id":"","template_id":"","subject":"Quick resource for your team","body":"Hi {first_name},\n\nI put together a practical checklist that teams at {company} can apply quickly.\n\nWant me to send it over?\n\nBest,\n{sender_name}","is_html":false,"thread_with_previous":true}},
      {"id":"wait_3_days","name":"Wait 3 days","type":"wait","config":{"duration":3,"unit":"days"}},
      {"id":"send_last_reengage","name":"Send final re-engagement","type":"send_email","config":{"sender_config_id":"","template_id":"","subject":"Should I pause outreach?","body":"Hi {first_name},\n\nI do not want to keep nudging if this is no longer a priority.\n\nIf you want, I can pause and reconnect later.\n\nBest,\n{sender_name}","is_html":false,"thread_with_previous":true}},
      {"id":"stop","name":"Stop","type":"stop","config":{}}
    ]$$::jsonb,
    $${
      "workflow_graph": {
        "id": "tpl_reengagement_winback",
        "name": "Re-engagement Winback Sequence",
        "status": "draft",
        "version": 1,
        "nodes": [
          {"id":"trigger","kind":"trigger","title":"Trigger","position":{"x":120,"y":540},"status":"draft","config":{"triggerType":"list_joined"}},
          {"id":"send_miss_you","kind":"send_email","title":"Send Re-engagement","position":{"x":420,"y":540},"status":"draft","config":{"subject":"Still relevant for {company}?","body":"Hi {first_name},\n\nIt has been a while since we connected.\n\nIf improving outbound results is still on your roadmap, I can share an updated playbook.\n\nBest,\n{sender_name}","senderConfigId":"","templateId":"","personalizationTokens":["{first_name}","{company}","{sender_name}"],"threadWithPrevious":true}},
          {"id":"wait_4_days","kind":"wait","title":"Wait 4 Days","position":{"x":710,"y":540},"status":"draft","config":{"duration":4,"unit":"days","randomized":false,"randomMaxMinutes":0,"timeWindowStart":"09:00","timeWindowEnd":"18:00"}},
          {"id":"send_offer","kind":"send_email","title":"Send Value Offer","position":{"x":1000,"y":540},"status":"draft","config":{"subject":"Quick resource for your team","body":"Hi {first_name},\n\nI put together a practical checklist that teams at {company} can apply quickly.\n\nWant me to send it over?\n\nBest,\n{sender_name}","senderConfigId":"","templateId":"","personalizationTokens":["{first_name}","{company}","{sender_name}"],"threadWithPrevious":true}},
          {"id":"wait_3_days","kind":"wait","title":"Wait 3 Days","position":{"x":1290,"y":540},"status":"draft","config":{"duration":3,"unit":"days","randomized":false,"randomMaxMinutes":0,"timeWindowStart":"09:00","timeWindowEnd":"18:00"}},
          {"id":"send_last_reengage","kind":"send_email","title":"Send Final Re-engagement","position":{"x":1580,"y":540},"status":"draft","config":{"subject":"Should I pause outreach?","body":"Hi {first_name},\n\nI do not want to keep nudging if this is no longer a priority.\n\nIf you want, I can pause and reconnect later.\n\nBest,\n{sender_name}","senderConfigId":"","templateId":"","personalizationTokens":["{first_name}","{sender_name}"],"threadWithPrevious":true}},
          {"id":"exit","kind":"exit","title":"Exit","position":{"x":1870,"y":540},"status":"draft","config":{"reason":"completed"}}
        ],
        "edges": [
          {"id":"edge_trigger_re","source":"trigger","target":"send_miss_you","sourceHandle":"out","targetHandle":"in","animated":true},
          {"id":"edge_re_wait4","source":"send_miss_you","target":"wait_4_days","sourceHandle":"out","targetHandle":"in","animated":true},
          {"id":"edge_wait4_offer","source":"wait_4_days","target":"send_offer","sourceHandle":"out","targetHandle":"in","animated":true},
          {"id":"edge_offer_wait3","source":"send_offer","target":"wait_3_days","sourceHandle":"out","targetHandle":"in","animated":true},
          {"id":"edge_wait3_final","source":"wait_3_days","target":"send_last_reengage","sourceHandle":"out","targetHandle":"in","animated":true},
          {"id":"edge_final_exit","source":"send_last_reengage","target":"exit","sourceHandle":"out","targetHandle":"in","animated":true}
        ]
      }
    }$$::jsonb,
    ARRAY['re-engagement', 'winback', 'lifecycle'],
    true,
    false,
    50,
    true
  ),
  (
    'product-activation-onboarding',
    'Product Activation Onboarding',
    'Guide new users from signup to first meaningful product action.',
    'Product Activation',
    'Onboard fresh users and increase early activation.',
    'list_joined',
    '{}'::jsonb,
    $$[
      {"id":"send_welcome","name":"Send welcome email","type":"send_email","config":{"sender_config_id":"","template_id":"","subject":"Welcome to the platform","body":"Hi {first_name},\n\nWelcome aboard. Here is the fastest way to get first value in under 15 minutes.\n\nBest,\n{sender_name}","is_html":false,"thread_with_previous":true}},
      {"id":"wait_1_day","name":"Wait 1 day","type":"wait","config":{"duration":1,"unit":"days"}},
      {"id":"send_quick_start","name":"Send quick-start checklist","type":"send_email","config":{"sender_config_id":"","template_id":"","subject":"Your quick-start checklist","body":"Hi {first_name},\n\nHere is a short checklist to complete your setup and start seeing outcomes quickly.\n\nBest,\n{sender_name}","is_html":false,"thread_with_previous":true}},
      {"id":"wait_2_days","name":"Wait 2 days","type":"wait","config":{"duration":2,"unit":"days"}},
      {"id":"send_help_offer","name":"Send help offer","type":"send_email","config":{"sender_config_id":"","template_id":"","subject":"Need help with setup?","body":"Hi {first_name},\n\nIf you want, I can help review your setup and share optimization tips for {company}.\n\nBest,\n{sender_name}","is_html":false,"thread_with_previous":true}},
      {"id":"stop","name":"Stop","type":"stop","config":{}}
    ]$$::jsonb,
    $${
      "workflow_graph": {
        "id": "tpl_product_activation_onboarding",
        "name": "Product Activation Onboarding",
        "status": "draft",
        "version": 1,
        "nodes": [
          {"id":"trigger","kind":"trigger","title":"Trigger","position":{"x":120,"y":640},"status":"draft","config":{"triggerType":"list_joined"}},
          {"id":"send_welcome","kind":"send_email","title":"Send Welcome","position":{"x":420,"y":640},"status":"draft","config":{"subject":"Welcome to the platform","body":"Hi {first_name},\n\nWelcome aboard. Here is the fastest way to get first value in under 15 minutes.\n\nBest,\n{sender_name}","senderConfigId":"","templateId":"","personalizationTokens":["{first_name}","{sender_name}"],"threadWithPrevious":true}},
          {"id":"wait_1_day","kind":"wait","title":"Wait 1 Day","position":{"x":710,"y":640},"status":"draft","config":{"duration":1,"unit":"days","randomized":false,"randomMaxMinutes":0,"timeWindowStart":"09:00","timeWindowEnd":"18:00"}},
          {"id":"send_quick_start","kind":"send_email","title":"Send Quick-start Checklist","position":{"x":1000,"y":640},"status":"draft","config":{"subject":"Your quick-start checklist","body":"Hi {first_name},\n\nHere is a short checklist to complete your setup and start seeing outcomes quickly.\n\nBest,\n{sender_name}","senderConfigId":"","templateId":"","personalizationTokens":["{first_name}","{sender_name}"],"threadWithPrevious":true}},
          {"id":"wait_2_days","kind":"wait","title":"Wait 2 Days","position":{"x":1290,"y":640},"status":"draft","config":{"duration":2,"unit":"days","randomized":false,"randomMaxMinutes":0,"timeWindowStart":"09:00","timeWindowEnd":"18:00"}},
          {"id":"send_help_offer","kind":"send_email","title":"Send Help Offer","position":{"x":1580,"y":640},"status":"draft","config":{"subject":"Need help with setup?","body":"Hi {first_name},\n\nIf you want, I can help review your setup and share optimization tips for {company}.\n\nBest,\n{sender_name}","senderConfigId":"","templateId":"","personalizationTokens":["{first_name}","{company}","{sender_name}"],"threadWithPrevious":true}},
          {"id":"exit","kind":"exit","title":"Exit","position":{"x":1870,"y":640},"status":"draft","config":{"reason":"completed"}}
        ],
        "edges": [
          {"id":"edge_trigger_welcome","source":"trigger","target":"send_welcome","sourceHandle":"out","targetHandle":"in","animated":true},
          {"id":"edge_welcome_wait1","source":"send_welcome","target":"wait_1_day","sourceHandle":"out","targetHandle":"in","animated":true},
          {"id":"edge_wait1_quickstart","source":"wait_1_day","target":"send_quick_start","sourceHandle":"out","targetHandle":"in","animated":true},
          {"id":"edge_quickstart_wait2","source":"send_quick_start","target":"wait_2_days","sourceHandle":"out","targetHandle":"in","animated":true},
          {"id":"edge_wait2_help","source":"wait_2_days","target":"send_help_offer","sourceHandle":"out","targetHandle":"in","animated":true},
          {"id":"edge_help_exit","source":"send_help_offer","target":"exit","sourceHandle":"out","targetHandle":"in","animated":true}
        ]
      }
    }$$::jsonb,
    ARRAY['onboarding', 'activation', 'product'],
    true,
    false,
    60,
    true
  ),
  (
    'executive-segmented-outreach',
    'Executive Segmented Outreach',
    'Branches only senior titles into a high-intent follow-up path.',
    'Segmentation',
    'Prioritize outreach for senior decision-makers while stopping others.',
    'list_joined',
    '{}'::jsonb,
    $$[
      {"id":"send_intro","name":"Send intro email","type":"send_email","config":{"sender_config_id":"","template_id":"","subject":"Quick question for your team","body":"Hi {first_name},\n\nReaching out with a short idea that may help {company} improve outbound conversion.\n\nWorth sharing a 2-minute summary?\n\nBest,\n{sender_name}","is_html":false,"thread_with_previous":true}},
      {"id":"wait_2_days","name":"Wait 2 days","type":"wait","config":{"duration":2,"unit":"days"}},
      {"id":"condition_exec","name":"Check executive title","type":"condition","config":{"rule":"job_title_contains","value":"head","if_true":"continue","if_false":"stop"}},
      {"id":"send_exec_followup","name":"Send executive follow-up","type":"send_email","config":{"sender_config_id":"","template_id":"","subject":"Head of {job_title}? tailored note","body":"Hi {first_name},\n\nSince you lead {job_title} at {company}, I drafted a focused recommendation for your team.\n\nWould you like me to send it?\n\nBest,\n{sender_name}","is_html":false,"thread_with_previous":true}},
      {"id":"stop","name":"Stop","type":"stop","config":{}}
    ]$$::jsonb,
    $${
      "workflow_graph": {
        "id": "tpl_executive_segmented_outreach",
        "name": "Executive Segmented Outreach",
        "status": "draft",
        "version": 1,
        "nodes": [
          {"id":"trigger","kind":"trigger","title":"Trigger","position":{"x":120,"y":760},"status":"draft","config":{"triggerType":"list_joined"}},
          {"id":"send_intro","kind":"send_email","title":"Send Intro Email","position":{"x":420,"y":760},"status":"draft","config":{"subject":"Quick question for your team","body":"Hi {first_name},\n\nReaching out with a short idea that may help {company} improve outbound conversion.\n\nWorth sharing a 2-minute summary?\n\nBest,\n{sender_name}","senderConfigId":"","templateId":"","personalizationTokens":["{first_name}","{company}","{sender_name}"],"threadWithPrevious":true}},
          {"id":"wait_2_days","kind":"wait","title":"Wait 2 Days","position":{"x":710,"y":760},"status":"draft","config":{"duration":2,"unit":"days","randomized":false,"randomMaxMinutes":0,"timeWindowStart":"09:00","timeWindowEnd":"18:00"}},
          {"id":"condition_exec","kind":"condition","title":"Executive Title?","position":{"x":1000,"y":760},"status":"draft","config":{"clauses":[{"id":"if","rule":"user_property","propertyKey":"job_title","comparator":"contains","value":"head"}]}},
          {"id":"send_exec_followup","kind":"send_email","title":"Send Executive Follow-up","position":{"x":1290,"y":700},"status":"draft","config":{"subject":"Head of {job_title}? tailored note","body":"Hi {first_name},\n\nSince you lead {job_title} at {company}, I drafted a focused recommendation for your team.\n\nWould you like me to send it?\n\nBest,\n{sender_name}","senderConfigId":"","templateId":"","personalizationTokens":["{first_name}","{job_title}","{company}","{sender_name}"],"threadWithPrevious":true}},
          {"id":"exit","kind":"exit","title":"Exit","position":{"x":1580,"y":760},"status":"draft","config":{"reason":"completed"}}
        ],
        "edges": [
          {"id":"edge_trigger_intro","source":"trigger","target":"send_intro","sourceHandle":"out","targetHandle":"in","animated":true},
          {"id":"edge_intro_wait","source":"send_intro","target":"wait_2_days","sourceHandle":"out","targetHandle":"in","animated":true},
          {"id":"edge_wait_condition","source":"wait_2_days","target":"condition_exec","sourceHandle":"out","targetHandle":"in","animated":true},
          {"id":"edge_condition_if","source":"condition_exec","target":"send_exec_followup","sourceHandle":"if","targetHandle":"in","label":"If","animated":true,"data":{"branch":"if"}},
          {"id":"edge_condition_else","source":"condition_exec","target":"exit","sourceHandle":"else","targetHandle":"in","label":"Else","animated":true,"data":{"branch":"else"}},
          {"id":"edge_exec_exit","source":"send_exec_followup","target":"exit","sourceHandle":"out","targetHandle":"in","animated":true}
        ]
      }
    }$$::jsonb,
    ARRAY['segmentation', 'executive', 'b2b'],
    true,
    false,
    70,
    true
  )
ON CONFLICT (slug)
DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  use_case = EXCLUDED.use_case,
  trigger_type = EXCLUDED.trigger_type,
  trigger_filters = EXCLUDED.trigger_filters,
  flow = EXCLUDED.flow,
  settings = EXCLUDED.settings,
  tags = EXCLUDED.tags,
  runner_compatible = EXCLUDED.runner_compatible,
  is_featured = EXCLUDED.is_featured,
  sort_order = EXCLUDED.sort_order,
  is_active = EXCLUDED.is_active,
  updated_at = now();

GRANT SELECT ON TABLE public.automation_workflow_templates TO authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON TABLE public.automation_workflow_templates TO service_role;

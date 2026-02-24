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
    'email-marketing',
    'Email Marketing',
    'General email marketing sequence for new leads with follow-up touches.',
    'Email Marketing',
    'Launch a list-based campaign in minutes.',
    'list_joined',
    '{}'::jsonb,
    $$[
      {"id":"send_intro","name":"Send intro email","type":"send_email","config":{"sender_config_id":"","template_id":"","subject":"Quick idea for {company}","body":"Hi {first_name},\n\nI wanted to share a quick idea for {company}.\n\nWould you be open to a short chat?\n\nBest,\n{sender_name}","is_html":false,"thread_with_previous":true}},
      {"id":"wait_2_days","name":"Wait 2 days","type":"wait","config":{"duration":2,"unit":"days"}},
      {"id":"send_follow_up","name":"Send follow-up","type":"send_email","config":{"sender_config_id":"","template_id":"","subject":"Following up on my note","body":"Hi {first_name},\n\nChecking in to see if this is relevant for {company}.\n\nBest,\n{sender_name}","is_html":false,"thread_with_previous":true}},
      {"id":"wait_3_days","name":"Wait 3 days","type":"wait","config":{"duration":3,"unit":"days"}},
      {"id":"send_final","name":"Send final follow-up","type":"send_email","config":{"sender_config_id":"","template_id":"","subject":"Should I close this out?","body":"Hi {first_name},\n\nIf this is not a priority right now, no worries.\n\nHappy to reconnect later.\n\nBest,\n{sender_name}","is_html":false,"thread_with_previous":true}},
      {"id":"stop","name":"Stop","type":"stop","config":{}}
    ]$$::jsonb,
    '{}'::jsonb,
    ARRAY['email', 'marketing', 'follow-up'],
    true,
    true,
    11,
    true
  ),
  (
    'highly-personalized-email-marketing',
    'Highly Personalized Email Marketing',
    'Account-level outreach template focused on personalization tokens.',
    'Email Marketing',
    'Send tailored messages by role, company, and context.',
    'list_joined',
    '{}'::jsonb,
    $$[
      {"id":"send_personalized_intro","name":"Send personalized opener","type":"send_email","config":{"sender_config_id":"","template_id":"","subject":"{first_name}, idea for {company}","body":"Hi {first_name},\n\nI noticed your role in {job_title} at {company}.\n\nI have a tailored idea that could help.\n\nBest,\n{sender_name}","is_html":false,"thread_with_previous":true}},
      {"id":"wait_1_day","name":"Wait 1 day","type":"wait","config":{"duration":1,"unit":"days"}},
      {"id":"send_context_follow_up","name":"Send context follow-up","type":"send_email","config":{"sender_config_id":"","template_id":"","subject":"Specific recommendation for {company}","body":"Hi {first_name},\n\nBased on your goals in {job_title}, here is a practical next step for {company}.\n\nWant me to share details?\n\nBest,\n{sender_name}","is_html":false,"thread_with_previous":true}},
      {"id":"wait_2_days","name":"Wait 2 days","type":"wait","config":{"duration":2,"unit":"days"}},
      {"id":"send_personalized_final","name":"Send personalized final","type":"send_email","config":{"sender_config_id":"","template_id":"","subject":"Last note for now","body":"Hi {first_name},\n\nIf this is not a fit for {company} right now, I can close the loop.\n\nBest,\n{sender_name}","is_html":false,"thread_with_previous":true}},
      {"id":"stop","name":"Stop","type":"stop","config":{}}
    ]$$::jsonb,
    '{}'::jsonb,
    ARRAY['personalized', 'email', 'outreach'],
    true,
    true,
    12,
    true
  ),
  (
    'webhook-email-notification',
    'Webhook Email Notification',
    'Event-driven email notification flow triggered from webhook events.',
    'Webhook Automation',
    'Send notification emails from external events.',
    'manual',
    '{}'::jsonb,
    $$[
      {"id":"stop","name":"Stop","type":"stop","config":{}}
    ]$$::jsonb,
    $${
      "workflow_graph": {
        "id": "tpl_webhook_email_notification",
        "name": "Webhook Email Notification",
        "status": "draft",
        "version": 1,
        "nodes": [
          {"id":"trigger","kind":"trigger","title":"Trigger","position":{"x":120,"y":240},"status":"draft","config":{"triggerType":"manual"}},
          {"id":"webhook_notification","kind":"webhook","title":"Receive Webhook Event","position":{"x":420,"y":240},"status":"draft","config":{"url":"https://api.example.com/events/notify","method":"POST","payloadTemplate":"{\"email\":\"{email}\",\"event\":\"notification\"}"}},
          {"id":"wait_10_minutes","kind":"wait","title":"Wait 10 Minutes","position":{"x":710,"y":240},"status":"draft","config":{"duration":10,"unit":"minutes","randomized":false,"randomMaxMinutes":0,"timeWindowStart":"00:00","timeWindowEnd":"23:59"}},
          {"id":"send_notification_email","kind":"send_email","title":"Send Notification Email","position":{"x":1000,"y":240},"status":"draft","config":{"senderConfigId":"","templateId":"","subject":"Notification from your webhook event","body":"Hi {first_name},\n\nA new webhook event was received for your account.\n\nBest,\n{sender_name}","personalizationTokens":["{first_name}","{sender_name}"],"threadWithPrevious":true}},
          {"id":"exit","kind":"exit","title":"Exit","position":{"x":1290,"y":240},"status":"draft","config":{"reason":"completed"}}
        ],
        "edges": [
          {"id":"edge_trigger_webhook","source":"trigger","target":"webhook_notification","sourceHandle":"out","targetHandle":"in","animated":true},
          {"id":"edge_webhook_wait","source":"webhook_notification","target":"wait_10_minutes","sourceHandle":"out","targetHandle":"in","animated":true},
          {"id":"edge_wait_email","source":"wait_10_minutes","target":"send_notification_email","sourceHandle":"out","targetHandle":"in","animated":true},
          {"id":"edge_email_exit","source":"send_notification_email","target":"exit","sourceHandle":"out","targetHandle":"in","animated":true}
        ]
      }
    }$$::jsonb,
    ARRAY['webhook', 'notification', 'event-driven'],
    false,
    true,
    13,
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

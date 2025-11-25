-- Fix foreign key for campaign_email_configurations
ALTER TABLE public.campaign_email_configurations
DROP CONSTRAINT IF EXISTS campaign_email_configurations_email_config_id_fkey;

ALTER TABLE public.campaign_email_configurations
ADD CONSTRAINT campaign_email_configurations_email_config_id_fkey
FOREIGN KEY (email_config_id)
REFERENCES public.email_configs(id)
ON DELETE CASCADE;

-- Fix foreign key for recipients
ALTER TABLE public.recipients
DROP CONSTRAINT IF EXISTS recipients_assigned_email_config_id_fkey;

ALTER TABLE public.recipients
ADD CONSTRAINT recipients_assigned_email_config_id_fkey
FOREIGN KEY (assigned_email_config_id)
REFERENCES public.email_configs(id);

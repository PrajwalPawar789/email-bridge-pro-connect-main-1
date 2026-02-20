
ALTER TABLE public.campaigns
ADD COLUMN IF NOT EXISTS email_config_id UUID;

ALTER TABLE public.campaigns
DROP CONSTRAINT IF EXISTS fk_email_config;

ALTER TABLE public.campaigns
ADD CONSTRAINT fk_email_config
FOREIGN KEY (email_config_id)
REFERENCES public.email_configs(id)
ON DELETE SET NULL;

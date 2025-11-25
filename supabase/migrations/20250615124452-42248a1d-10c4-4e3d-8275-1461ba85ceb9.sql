
ALTER TABLE public.campaigns
ADD COLUMN email_config_id UUID,
ADD CONSTRAINT fk_email_config
FOREIGN KEY (email_config_id)
REFERENCES public.email_configs(id)
ON DELETE SET NULL;

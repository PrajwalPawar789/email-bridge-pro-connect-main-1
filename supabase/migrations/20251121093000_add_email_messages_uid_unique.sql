-- Ensure each IMAP message is only stored once per config
CREATE UNIQUE INDEX IF NOT EXISTS email_messages_config_uid_key
  ON public.email_messages (config_id, uid);

-- Helpful index for ordering queries in the mailbox
CREATE INDEX IF NOT EXISTS email_messages_config_date_idx
  ON public.email_messages (config_id, date DESC);

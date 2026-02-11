-- Add threading + reply metadata to email_messages
ALTER TABLE public.email_messages
  ADD COLUMN IF NOT EXISTS message_id TEXT,
  ADD COLUMN IF NOT EXISTS in_reply_to TEXT,
  ADD COLUMN IF NOT EXISTS "references" TEXT[],
  ADD COLUMN IF NOT EXISTS to_emails TEXT[],
  ADD COLUMN IF NOT EXISTS cc_emails TEXT[],
  ADD COLUMN IF NOT EXISTS reply_to TEXT[],
  ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS direction TEXT DEFAULT 'inbound',
  ADD COLUMN IF NOT EXISTS thread_id TEXT,
  ADD COLUMN IF NOT EXISTS reply_to_message_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'email_messages_reply_to_message_id_fkey'
  ) THEN
    ALTER TABLE public.email_messages
      ADD CONSTRAINT email_messages_reply_to_message_id_fkey
      FOREIGN KEY (reply_to_message_id) REFERENCES public.email_messages(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS email_messages_thread_id_idx ON public.email_messages(thread_id);
CREATE INDEX IF NOT EXISTS email_messages_message_id_idx ON public.email_messages(message_id);

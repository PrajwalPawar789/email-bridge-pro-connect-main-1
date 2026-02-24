-- Automation workflow builder + execution runtime.

CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE TABLE IF NOT EXISTS public.automation_workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'live', 'paused', 'archived')),
  trigger_type TEXT NOT NULL DEFAULT 'list_joined' CHECK (trigger_type IN ('list_joined', 'manual')),
  trigger_list_id UUID REFERENCES public.email_lists(id) ON DELETE SET NULL,
  trigger_filters JSONB NOT NULL DEFAULT '{}'::jsonb,
  flow JSONB NOT NULL DEFAULT '[]'::jsonb,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  run_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_run_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.automation_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES public.automation_workflows(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  prospect_id UUID REFERENCES public.prospects(id) ON DELETE SET NULL,
  email TEXT NOT NULL,
  full_name TEXT,
  source_list_id UUID REFERENCES public.email_lists(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'processing', 'completed', 'failed', 'paused', 'unsubscribed')),
  current_step INTEGER NOT NULL DEFAULT 0 CHECK (current_step >= 0),
  next_run_at TIMESTAMPTZ,
  processing_started_at TIMESTAMPTZ,
  state JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_error TEXT,
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT automation_contacts_workflow_email_key UNIQUE (workflow_id, email)
);

CREATE TABLE IF NOT EXISTS public.automation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES public.automation_workflows(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES public.automation_contacts(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  step_index INTEGER,
  message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_automation_workflows_user_created_at
  ON public.automation_workflows(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_automation_workflows_status
  ON public.automation_workflows(status);
CREATE INDEX IF NOT EXISTS idx_automation_contacts_workflow_status_next
  ON public.automation_contacts(workflow_id, status, next_run_at);
CREATE INDEX IF NOT EXISTS idx_automation_contacts_user_created_at
  ON public.automation_contacts(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_automation_logs_workflow_created_at
  ON public.automation_logs(workflow_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_automation_logs_user_created_at
  ON public.automation_logs(user_id, created_at DESC);

ALTER TABLE public.automation_workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own automation workflows" ON public.automation_workflows;
CREATE POLICY "Users can view own automation workflows"
  ON public.automation_workflows
  FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can insert own automation workflows" ON public.automation_workflows;
CREATE POLICY "Users can insert own automation workflows"
  ON public.automation_workflows
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update own automation workflows" ON public.automation_workflows;
CREATE POLICY "Users can update own automation workflows"
  ON public.automation_workflows
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can delete own automation workflows" ON public.automation_workflows;
CREATE POLICY "Users can delete own automation workflows"
  ON public.automation_workflows
  FOR DELETE
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can view own automation contacts" ON public.automation_contacts;
CREATE POLICY "Users can view own automation contacts"
  ON public.automation_contacts
  FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can insert own automation contacts" ON public.automation_contacts;
CREATE POLICY "Users can insert own automation contacts"
  ON public.automation_contacts
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update own automation contacts" ON public.automation_contacts;
CREATE POLICY "Users can update own automation contacts"
  ON public.automation_contacts
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can delete own automation contacts" ON public.automation_contacts;
CREATE POLICY "Users can delete own automation contacts"
  ON public.automation_contacts
  FOR DELETE
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can view own automation logs" ON public.automation_logs;
CREATE POLICY "Users can view own automation logs"
  ON public.automation_logs
  FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can insert own automation logs" ON public.automation_logs;
CREATE POLICY "Users can insert own automation logs"
  ON public.automation_logs
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP TRIGGER IF EXISTS update_automation_workflows_updated_at ON public.automation_workflows;
CREATE TRIGGER update_automation_workflows_updated_at
BEFORE UPDATE ON public.automation_workflows
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_automation_contacts_updated_at ON public.automation_contacts;
CREATE TRIGGER update_automation_contacts_updated_at
BEFORE UPDATE ON public.automation_contacts
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE FUNCTION public.enroll_workflow_contacts(
  p_workflow_id UUID,
  p_limit INTEGER DEFAULT 200
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_workflow public.automation_workflows%ROWTYPE;
  v_inserted INTEGER := 0;
  v_limit INTEGER := GREATEST(1, LEAST(COALESCE(p_limit, 200), 2000));
BEGIN
  SELECT *
  INTO v_workflow
  FROM public.automation_workflows aw
  WHERE aw.id = p_workflow_id;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  IF v_actor IS NOT NULL AND v_actor <> v_workflow.user_id AND NOT public.is_service_role() THEN
    RAISE EXCEPTION 'Not authorized to enroll contacts for another user workflow';
  END IF;

  IF v_workflow.trigger_type <> 'list_joined' OR v_workflow.trigger_list_id IS NULL THEN
    RETURN 0;
  END IF;

  WITH candidates AS (
    SELECT
      p.id AS prospect_id,
      lower(trim(p.email)) AS email,
      NULLIF(trim(p.name), '') AS full_name,
      p.company,
      p.job_title
    FROM public.email_list_prospects elp
    JOIN public.prospects p ON p.id = elp.prospect_id
    WHERE elp.list_id = v_workflow.trigger_list_id
      AND p.user_id = v_workflow.user_id
      AND p.email IS NOT NULL
      AND length(trim(p.email)) > 3
    ORDER BY p.created_at DESC
    LIMIT v_limit
  ),
  inserted AS (
    INSERT INTO public.automation_contacts (
      workflow_id,
      user_id,
      prospect_id,
      email,
      full_name,
      source_list_id,
      status,
      current_step,
      next_run_at,
      state
    )
    SELECT
      v_workflow.id,
      v_workflow.user_id,
      c.prospect_id,
      c.email,
      c.full_name,
      v_workflow.trigger_list_id,
      'active',
      0,
      now(),
      jsonb_strip_nulls(
        jsonb_build_object(
          'company', c.company,
          'job_title', c.job_title
        )
      )
    FROM candidates c
    ON CONFLICT (workflow_id, email)
    DO NOTHING
    RETURNING id
  )
  SELECT COUNT(*) INTO v_inserted FROM inserted;

  RETURN COALESCE(v_inserted, 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.invoke_automation_runner()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  service_role_key TEXT;
  url TEXT := 'https://smwjzloqamtvemljedkv.supabase.co/functions/v1/automation-runner';
BEGIN
  SELECT value
  INTO service_role_key
  FROM public.app_secrets
  WHERE key = 'service_role_key';

  IF service_role_key IS NULL OR service_role_key = '' THEN
    RAISE WARNING 'Service role key not found in public.app_secrets.';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_role_key
    ),
    body := jsonb_build_object('action', 'tick')
  );
END;
$$;

DO $$
BEGIN
  BEGIN
    PERFORM public.unschedule_job_if_exists('automation-runner-worker');
  EXCEPTION
    WHEN undefined_function THEN
      BEGIN
        PERFORM cron.unschedule('automation-runner-worker');
      EXCEPTION
        WHEN OTHERS THEN
          NULL;
      END;
  END;
END;
$$;

SELECT cron.schedule(
  'automation-runner-worker',
  '*/2 * * * *',
  'SELECT public.invoke_automation_runner()'
);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.automation_workflows TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.automation_contacts TO authenticated, service_role;
GRANT SELECT, INSERT ON TABLE public.automation_logs TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.enroll_workflow_contacts(UUID, INTEGER) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.invoke_automation_runner() TO service_role;

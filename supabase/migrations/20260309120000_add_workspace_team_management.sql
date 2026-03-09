-- Workspace hierarchy, approval workflows, and allocation-aware quota enforcement.

ALTER TABLE public.billing_plans
ADD COLUMN IF NOT EXISTS daily_send_limit INTEGER CHECK (daily_send_limit IS NULL OR daily_send_limit >= 0);

UPDATE public.billing_plans
SET
  daily_send_limit = CASE id
    WHEN 'free' THEN 200
    WHEN 'growth' THEN 2500
    WHEN 'scale' THEN 10000
    WHEN 'enterprise' THEN NULL
    ELSE daily_send_limit
  END,
  updated_at = now()
WHERE id IN ('free', 'growth', 'scale', 'enterprise')
  AND daily_send_limit IS DISTINCT FROM CASE id
    WHEN 'free' THEN 200
    WHEN 'growth' THEN 2500
    WHEN 'scale' THEN 10000
    WHEN 'enterprise' THEN NULL
    ELSE daily_send_limit
  END;

CREATE TABLE IF NOT EXISTS public.workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  approval_delegate_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.workspace_permissions (
  permission TEXT PRIMARY KEY,
  description TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.workspace_role_permissions (
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'sub_admin', 'user', 'reviewer')),
  permission TEXT NOT NULL REFERENCES public.workspace_permissions(permission) ON DELETE CASCADE,
  allowed BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (role, permission)
);

CREATE TABLE IF NOT EXISTS public.workspace_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'sub_admin', 'user', 'reviewer')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'invited', 'disabled')),
  parent_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_reviewer_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  can_manage_billing BOOLEAN NOT NULL DEFAULT false,
  can_manage_workspace BOOLEAN NOT NULL DEFAULT false,
  extra_permissions TEXT[] NOT NULL DEFAULT '{}'::text[],
  revoked_permissions TEXT[] NOT NULL DEFAULT '{}'::text[],
  require_campaign_approval BOOLEAN,
  require_sender_approval BOOLEAN,
  require_automation_approval BOOLEAN,
  created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  invited_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  disabled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.workspace_quota_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  allocated_by_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  allocated_to_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  credits_allocated INTEGER CHECK (credits_allocated IS NULL OR credits_allocated >= 0),
  max_active_campaigns INTEGER CHECK (max_active_campaigns IS NULL OR max_active_campaigns >= 0),
  max_sender_accounts INTEGER CHECK (max_sender_accounts IS NULL OR max_sender_accounts >= 0),
  daily_send_limit INTEGER CHECK (daily_send_limit IS NULL OR daily_send_limit >= 0),
  max_automations INTEGER CHECK (max_automations IS NULL OR max_automations >= 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'superseded', 'revoked')),
  effective_from TIMESTAMPTZ NOT NULL DEFAULT now(),
  effective_to TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.workspace_usage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  credit_delta INTEGER NOT NULL DEFAULT 0,
  send_delta INTEGER NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.approval_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('campaign', 'sender_account', 'automation')),
  entity_id UUID NOT NULL,
  requested_by_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reviewer_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending_approval'
    CHECK (status IN ('draft', 'pending_approval', 'approved', 'rejected', 'changes_requested')),
  reason TEXT,
  comments TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.approval_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  approval_request_id UUID NOT NULL REFERENCES public.approval_requests(id) ON DELETE CASCADE,
  actor_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL CHECK (action_type IN ('submitted', 'approved', 'rejected', 'changes_requested', 'commented')),
  status_from TEXT,
  status_to TEXT,
  comment TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action_type TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  before_json JSONB,
  after_json JSONB,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workspaces_owner ON public.workspaces(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_workspace_memberships_workspace_role ON public.workspace_memberships(workspace_id, role, status);
CREATE INDEX IF NOT EXISTS idx_workspace_memberships_parent ON public.workspace_memberships(parent_user_id);
CREATE INDEX IF NOT EXISTS idx_workspace_memberships_reviewer ON public.workspace_memberships(assigned_reviewer_user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_workspace_quota_allocations_active_member
  ON public.workspace_quota_allocations(allocated_to_user_id)
  WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_workspace_quota_allocations_workspace_created
  ON public.workspace_quota_allocations(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_workspace_usage_events_workspace_user_time
  ON public.workspace_usage_events(workspace_id, user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_approval_requests_workspace_status
  ON public.approval_requests(workspace_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_approval_requests_reviewer_status
  ON public.approval_requests(reviewer_user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_approval_actions_request_created
  ON public.approval_actions(approval_request_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_workspace_created
  ON public.audit_logs(workspace_id, created_at DESC);

ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_quota_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_usage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approval_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approval_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own workspaces" ON public.workspaces;
CREATE POLICY "Users can view own workspaces"
  ON public.workspaces
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.workspace_memberships wm
      WHERE wm.workspace_id = workspaces.id
        AND wm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can view own workspace memberships" ON public.workspace_memberships;
CREATE POLICY "Users can view own workspace memberships"
  ON public.workspace_memberships
  FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can view own approval requests" ON public.approval_requests;
CREATE POLICY "Users can view own approval requests"
  ON public.approval_requests
  FOR SELECT
  USING (
    requested_by_user_id = auth.uid()
    OR reviewer_user_id = auth.uid()
  );

DROP POLICY IF EXISTS "Users can view own approval actions" ON public.approval_actions;
CREATE POLICY "Users can view own approval actions"
  ON public.approval_actions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.approval_requests ar
      WHERE ar.id = approval_request_id
        AND (ar.requested_by_user_id = auth.uid() OR ar.reviewer_user_id = auth.uid())
    )
  );

DROP TRIGGER IF EXISTS update_workspaces_updated_at ON public.workspaces;
CREATE TRIGGER update_workspaces_updated_at
BEFORE UPDATE ON public.workspaces
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_workspace_memberships_updated_at ON public.workspace_memberships;
CREATE TRIGGER update_workspace_memberships_updated_at
BEFORE UPDATE ON public.workspace_memberships
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

INSERT INTO public.workspace_permissions (permission, description)
VALUES
  ('manage_workspace', 'Manage workspace settings and members'),
  ('manage_billing', 'Manage billing, plan changes, invoices, and payment methods'),
  ('create_admin', 'Invite and configure admin-level users'),
  ('create_user', 'Invite and configure member-level users'),
  ('assign_credits', 'Allocate credit pools to child users'),
  ('assign_limits', 'Allocate non-credit limits to child users'),
  ('manage_sender_accounts', 'Create and manage sender accounts'),
  ('create_campaign', 'Create and edit campaigns'),
  ('launch_campaign', 'Launch or schedule campaigns without approval'),
  ('approve_campaign', 'Approve or reject campaign launch requests'),
  ('approve_sender', 'Approve or reject sender activation requests'),
  ('approve_automation', 'Approve or reject automation activation requests'),
  ('view_team_dashboard', 'View dashboards for assigned team scope'),
  ('view_workspace_dashboard', 'View dashboards for the full workspace'),
  ('view_audit_logs', 'View workspace audit logs'),
  ('manage_contacts', 'Create and manage contacts, lists, and segments'),
  ('manage_templates', 'Create and manage templates'),
  ('manage_automations', 'Create and manage automations')
ON CONFLICT (permission) DO UPDATE
SET description = EXCLUDED.description;

DELETE FROM public.workspace_role_permissions;

INSERT INTO public.workspace_role_permissions (role, permission, allowed)
SELECT 'owner', permission, true
FROM public.workspace_permissions
UNION ALL
SELECT 'admin', permission, true
FROM public.workspace_permissions
WHERE permission IN (
  'create_user',
  'assign_credits',
  'assign_limits',
  'manage_sender_accounts',
  'create_campaign',
  'launch_campaign',
  'approve_campaign',
  'approve_sender',
  'approve_automation',
  'view_team_dashboard',
  'view_audit_logs',
  'manage_contacts',
  'manage_templates',
  'manage_automations'
)
UNION ALL
SELECT 'sub_admin', permission, true
FROM public.workspace_permissions
WHERE permission IN (
  'create_user',
  'assign_credits',
  'assign_limits',
  'manage_sender_accounts',
  'create_campaign',
  'launch_campaign',
  'view_team_dashboard',
  'manage_contacts',
  'manage_templates',
  'manage_automations'
)
UNION ALL
SELECT 'user', permission, true
FROM public.workspace_permissions
WHERE permission IN (
  'manage_sender_accounts',
  'create_campaign',
  'launch_campaign',
  'manage_contacts',
  'manage_templates',
  'manage_automations'
)
UNION ALL
SELECT 'reviewer', permission, true
FROM public.workspace_permissions
WHERE permission IN (
  'approve_campaign',
  'approve_sender',
  'approve_automation',
  'view_team_dashboard',
  'view_audit_logs'
);

ALTER TABLE public.campaigns
ADD COLUMN IF NOT EXISTS approval_status TEXT,
ADD COLUMN IF NOT EXISTS approval_request_id UUID REFERENCES public.approval_requests(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS approved_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.email_configs
ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS approval_status TEXT,
ADD COLUMN IF NOT EXISTS approval_request_id UUID REFERENCES public.approval_requests(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS approved_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.automation_workflows
ADD COLUMN IF NOT EXISTS approval_status TEXT,
ADD COLUMN IF NOT EXISTS approval_request_id UUID REFERENCES public.approval_requests(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS approved_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'campaigns'
      AND column_name = 'approval_status'
  ) THEN
    ALTER TABLE public.campaigns
      DROP CONSTRAINT IF EXISTS campaigns_approval_status_check;
    ALTER TABLE public.campaigns
      ADD CONSTRAINT campaigns_approval_status_check
      CHECK (approval_status IS NULL OR approval_status IN ('draft', 'pending_approval', 'approved', 'rejected', 'changes_requested'));
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'email_configs'
      AND column_name = 'approval_status'
  ) THEN
    ALTER TABLE public.email_configs
      DROP CONSTRAINT IF EXISTS email_configs_approval_status_check;
    ALTER TABLE public.email_configs
      ADD CONSTRAINT email_configs_approval_status_check
      CHECK (approval_status IS NULL OR approval_status IN ('draft', 'pending_approval', 'approved', 'rejected', 'changes_requested'));
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'automation_workflows'
      AND column_name = 'approval_status'
  ) THEN
    ALTER TABLE public.automation_workflows
      DROP CONSTRAINT IF EXISTS automation_workflows_approval_status_check;
    ALTER TABLE public.automation_workflows
      ADD CONSTRAINT automation_workflows_approval_status_check
      CHECK (approval_status IS NULL OR approval_status IN ('draft', 'pending_approval', 'approved', 'rejected', 'changes_requested'));
  END IF;
END;
$$;

UPDATE public.campaigns
SET
  approval_status = CASE
    WHEN status IN ('ready', 'sending', 'paused', 'sent', 'scheduled', 'completed') THEN 'approved'
    ELSE 'draft'
  END,
  approved_at = CASE
    WHEN status IN ('ready', 'sending', 'paused', 'sent', 'scheduled', 'completed') THEN COALESCE(approved_at, updated_at, created_at, now())
    ELSE approved_at
  END
WHERE approval_status IS NULL;

UPDATE public.email_configs
SET
  approval_status = 'approved',
  approved_at = COALESCE(approved_at, created_at, now()),
  is_active = true
WHERE approval_status IS NULL;

UPDATE public.automation_workflows
SET
  approval_status = CASE WHEN status = 'live' THEN 'approved' ELSE 'draft' END,
  approved_at = CASE WHEN status = 'live' THEN COALESCE(approved_at, published_at, updated_at, created_at, now()) ELSE approved_at END
WHERE approval_status IS NULL;

CREATE OR REPLACE FUNCTION public.workspace_role_level(p_role TEXT)
RETURNS INTEGER
LANGUAGE SQL
IMMUTABLE
AS $$
  SELECT CASE lower(COALESCE(p_role, 'user'))
    WHEN 'owner' THEN 500
    WHEN 'admin' THEN 400
    WHEN 'sub_admin' THEN 300
    WHEN 'reviewer' THEN 250
    ELSE 100
  END;
$$;

CREATE OR REPLACE FUNCTION public.workspace_default_requires_approval(p_role TEXT, p_entity_type TEXT)
RETURNS BOOLEAN
LANGUAGE SQL
IMMUTABLE
AS $$
  SELECT CASE
    WHEN lower(COALESCE(p_role, 'user')) IN ('owner', 'admin', 'reviewer') THEN false
    WHEN lower(COALESCE(p_role, 'user')) IN ('sub_admin', 'user') THEN true
    ELSE true
  END;
$$;

CREATE OR REPLACE FUNCTION public.workspace_approval_permission_for_entity(p_entity_type TEXT)
RETURNS TEXT
LANGUAGE SQL
IMMUTABLE
AS $$
  SELECT CASE lower(COALESCE(p_entity_type, ''))
    WHEN 'campaign' THEN 'approve_campaign'
    WHEN 'sender_account' THEN 'approve_sender'
    WHEN 'automation' THEN 'approve_automation'
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION public.workspace_status_requires_approval(
  p_user_id UUID,
  p_entity_type TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_membership public.workspace_memberships%ROWTYPE;
BEGIN
  PERFORM public.ensure_workspace_membership(p_user_id);

  SELECT *
  INTO v_membership
  FROM public.workspace_memberships
  WHERE user_id = p_user_id;

  IF NOT FOUND THEN
    RETURN true;
  END IF;

  IF lower(COALESCE(p_entity_type, '')) = 'campaign' THEN
    RETURN COALESCE(v_membership.require_campaign_approval, public.workspace_default_requires_approval(v_membership.role, p_entity_type));
  ELSIF lower(COALESCE(p_entity_type, '')) = 'sender_account' THEN
    RETURN COALESCE(v_membership.require_sender_approval, public.workspace_default_requires_approval(v_membership.role, p_entity_type));
  ELSIF lower(COALESCE(p_entity_type, '')) = 'automation' THEN
    RETURN COALESCE(v_membership.require_automation_approval, public.workspace_default_requires_approval(v_membership.role, p_entity_type));
  END IF;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.workspace_notification_insert(
  p_user_id UUID,
  p_event_type TEXT,
  p_title TEXT,
  p_message TEXT DEFAULT NULL,
  p_category TEXT DEFAULT 'system',
  p_action_url TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_category TEXT := lower(COALESCE(p_category, 'system'));
  v_notification_id UUID;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF COALESCE(trim(p_title), '') = '' THEN
    RETURN NULL;
  END IF;

  IF v_category NOT IN ('billing', 'campaign', 'system', 'account') THEN
    v_category := 'system';
  END IF;

  INSERT INTO public.user_notifications (
    user_id,
    event_type,
    category,
    title,
    message,
    action_url,
    metadata
  )
  VALUES (
    p_user_id,
    COALESCE(NULLIF(trim(p_event_type), ''), 'workspace_event'),
    v_category,
    trim(p_title),
    NULLIF(trim(COALESCE(p_message, '')), ''),
    NULLIF(trim(COALESCE(p_action_url, '')), ''),
    COALESCE(p_metadata, '{}'::jsonb)
  )
  RETURNING id INTO v_notification_id;

  RETURN v_notification_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.workspace_write_audit_log(
  p_workspace_id UUID,
  p_actor_user_id UUID,
  p_action_type TEXT,
  p_target_type TEXT,
  p_target_id TEXT,
  p_before_json JSONB DEFAULT NULL,
  p_after_json JSONB DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_log_id UUID;
BEGIN
  IF p_workspace_id IS NULL OR COALESCE(trim(p_action_type), '') = '' OR COALESCE(trim(p_target_type), '') = '' OR COALESCE(trim(p_target_id), '') = '' THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.audit_logs (
    workspace_id,
    actor_user_id,
    action_type,
    target_type,
    target_id,
    before_json,
    after_json,
    metadata
  )
  VALUES (
    p_workspace_id,
    p_actor_user_id,
    trim(p_action_type),
    trim(p_target_type),
    trim(p_target_id),
    p_before_json,
    p_after_json,
    COALESCE(p_metadata, '{}'::jsonb)
  )
  RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_workspace_membership(p_user_id UUID DEFAULT auth.uid())
RETURNS public.workspace_memberships
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_membership public.workspace_memberships%ROWTYPE;
  v_workspace public.workspaces%ROWTYPE;
  v_user RECORD;
  v_workspace_id UUID;
  v_role TEXT;
  v_parent_user_id UUID;
  v_assigned_reviewer_user_id UUID;
  v_invited_by_user_id UUID;
  v_full_name TEXT;
  v_email TEXT;
  v_extra_permissions TEXT[] := '{}'::text[];
  v_revoked_permissions TEXT[] := '{}'::text[];
  v_credits_allocated INTEGER;
  v_max_active_campaigns INTEGER;
  v_max_sender_accounts INTEGER;
  v_daily_send_limit INTEGER;
  v_max_automations INTEGER;
  v_can_manage_billing BOOLEAN := false;
  v_can_manage_workspace BOOLEAN := false;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'User id is required';
  END IF;

  SELECT *
  INTO v_membership
  FROM public.workspace_memberships
  WHERE user_id = p_user_id;

  IF FOUND THEN
    IF v_membership.status = 'invited' THEN
      UPDATE public.workspace_memberships
      SET
        status = 'active',
        updated_at = now()
      WHERE id = v_membership.id
      RETURNING * INTO v_membership;
    END IF;
    RETURN v_membership;
  END IF;

  SELECT
    u.id,
    u.email,
    u.raw_user_meta_data,
    u.raw_app_meta_data
  INTO v_user
  FROM auth.users u
  WHERE u.id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Auth user % not found', p_user_id;
  END IF;

  v_email := v_user.email;
  v_full_name := trim(
    COALESCE(
      NULLIF(v_user.raw_user_meta_data ->> 'full_name', ''),
      concat_ws(' ', v_user.raw_user_meta_data ->> 'first_name', v_user.raw_user_meta_data ->> 'last_name'),
      split_part(COALESCE(v_email, ''), '@', 1)
    )
  );

  BEGIN
    v_workspace_id := NULLIF(
      COALESCE(
        v_user.raw_user_meta_data ->> 'workspace_id',
        v_user.raw_app_meta_data ->> 'workspace_id',
        ''
      ),
      ''
    )::uuid;
  EXCEPTION
    WHEN OTHERS THEN
      v_workspace_id := NULL;
  END;

  IF v_workspace_id IS NOT NULL THEN
    v_role := lower(COALESCE(
      NULLIF(v_user.raw_user_meta_data ->> 'workspace_role', ''),
      NULLIF(v_user.raw_app_meta_data ->> 'workspace_role', ''),
      'user'
    ));

    BEGIN
      v_parent_user_id := NULLIF(
        COALESCE(
          v_user.raw_user_meta_data ->> 'parent_user_id',
          v_user.raw_app_meta_data ->> 'parent_user_id',
          ''
        ),
        ''
      )::uuid;
    EXCEPTION
      WHEN OTHERS THEN
        v_parent_user_id := NULL;
    END;

    BEGIN
      v_assigned_reviewer_user_id := NULLIF(
        COALESCE(
          v_user.raw_user_meta_data ->> 'assigned_reviewer_user_id',
          v_user.raw_app_meta_data ->> 'assigned_reviewer_user_id',
          ''
        ),
        ''
      )::uuid;
    EXCEPTION
      WHEN OTHERS THEN
        v_assigned_reviewer_user_id := NULL;
    END;

    BEGIN
      v_invited_by_user_id := NULLIF(
        COALESCE(
          v_user.raw_user_meta_data ->> 'invited_by_user_id',
          v_user.raw_app_meta_data ->> 'invited_by_user_id',
          ''
        ),
        ''
      )::uuid;
    EXCEPTION
      WHEN OTHERS THEN
        v_invited_by_user_id := NULL;
    END;

    v_can_manage_billing := COALESCE((v_user.raw_user_meta_data ->> 'can_manage_billing')::boolean, false);
    v_can_manage_workspace := COALESCE((v_user.raw_user_meta_data ->> 'can_manage_workspace')::boolean, false);
    v_credits_allocated := NULLIF(v_user.raw_user_meta_data ->> 'credits_allocated', '')::integer;
    v_max_active_campaigns := NULLIF(v_user.raw_user_meta_data ->> 'max_active_campaigns', '')::integer;
    v_max_sender_accounts := NULLIF(v_user.raw_user_meta_data ->> 'max_sender_accounts', '')::integer;
    v_daily_send_limit := NULLIF(v_user.raw_user_meta_data ->> 'daily_send_limit', '')::integer;
    v_max_automations := NULLIF(v_user.raw_user_meta_data ->> 'max_automations', '')::integer;

    IF jsonb_typeof(COALESCE(v_user.raw_user_meta_data -> 'extra_permissions', '[]'::jsonb)) = 'array' THEN
      v_extra_permissions := ARRAY(
        SELECT jsonb_array_elements_text(COALESCE(v_user.raw_user_meta_data -> 'extra_permissions', '[]'::jsonb))
      );
    END IF;
    IF jsonb_typeof(COALESCE(v_user.raw_user_meta_data -> 'revoked_permissions', '[]'::jsonb)) = 'array' THEN
      v_revoked_permissions := ARRAY(
        SELECT jsonb_array_elements_text(COALESCE(v_user.raw_user_meta_data -> 'revoked_permissions', '[]'::jsonb))
      );
    END IF;

    INSERT INTO public.workspace_memberships (
      workspace_id,
      user_id,
      email,
      full_name,
      role,
      status,
      parent_user_id,
      assigned_reviewer_user_id,
      can_manage_billing,
      can_manage_workspace,
      extra_permissions,
      revoked_permissions,
      require_campaign_approval,
      require_sender_approval,
      require_automation_approval,
      created_by_user_id,
      invited_by_user_id
    )
    VALUES (
      v_workspace_id,
      p_user_id,
      v_email,
      NULLIF(v_full_name, ''),
      CASE
        WHEN v_role IN ('owner', 'admin', 'sub_admin', 'user', 'reviewer') THEN v_role
        ELSE 'user'
      END,
      'invited',
      v_parent_user_id,
      v_assigned_reviewer_user_id,
      v_can_manage_billing,
      v_can_manage_workspace,
      COALESCE(v_extra_permissions, '{}'::text[]),
      COALESCE(v_revoked_permissions, '{}'::text[]),
      CASE WHEN v_user.raw_user_meta_data ? 'require_campaign_approval' THEN (v_user.raw_user_meta_data ->> 'require_campaign_approval')::boolean ELSE NULL END,
      CASE WHEN v_user.raw_user_meta_data ? 'require_sender_approval' THEN (v_user.raw_user_meta_data ->> 'require_sender_approval')::boolean ELSE NULL END,
      CASE WHEN v_user.raw_user_meta_data ? 'require_automation_approval' THEN (v_user.raw_user_meta_data ->> 'require_automation_approval')::boolean ELSE NULL END,
      v_invited_by_user_id,
      v_invited_by_user_id
    )
    ON CONFLICT (user_id) DO UPDATE
    SET
      workspace_id = EXCLUDED.workspace_id,
      email = EXCLUDED.email,
      full_name = EXCLUDED.full_name,
      role = EXCLUDED.role,
      status = EXCLUDED.status,
      parent_user_id = EXCLUDED.parent_user_id,
      assigned_reviewer_user_id = EXCLUDED.assigned_reviewer_user_id,
      can_manage_billing = EXCLUDED.can_manage_billing,
      can_manage_workspace = EXCLUDED.can_manage_workspace,
      extra_permissions = EXCLUDED.extra_permissions,
      revoked_permissions = EXCLUDED.revoked_permissions,
      require_campaign_approval = EXCLUDED.require_campaign_approval,
      require_sender_approval = EXCLUDED.require_sender_approval,
      require_automation_approval = EXCLUDED.require_automation_approval,
      updated_at = now()
    RETURNING * INTO v_membership;

    IF v_membership.role <> 'owner' THEN
      PERFORM public.workspace_validate_allocation(
        v_membership.user_id,
        v_credits_allocated,
        v_max_active_campaigns,
        v_max_sender_accounts,
        v_daily_send_limit,
        v_max_automations
      );

      INSERT INTO public.workspace_quota_allocations (
        workspace_id,
        allocated_by_user_id,
        allocated_to_user_id,
        credits_allocated,
        max_active_campaigns,
        max_sender_accounts,
        daily_send_limit,
        max_automations,
        status,
        metadata
      )
      SELECT
        v_membership.workspace_id,
        COALESCE(v_invited_by_user_id, w.owner_user_id),
        v_membership.user_id,
        v_credits_allocated,
        v_max_active_campaigns,
        v_max_sender_accounts,
        v_daily_send_limit,
        v_max_automations,
        'active',
        jsonb_build_object('source', 'invite_bootstrap')
      FROM public.workspaces w
      WHERE w.id = v_membership.workspace_id
        AND NOT EXISTS (
          SELECT 1
          FROM public.workspace_quota_allocations qa
          WHERE qa.allocated_to_user_id = v_membership.user_id
            AND qa.status = 'active'
        );
    END IF;

    RETURN v_membership;
  END IF;

  INSERT INTO public.workspaces (owner_user_id, name)
  VALUES (
    p_user_id,
    COALESCE(NULLIF(v_full_name, ''), split_part(COALESCE(v_email, 'Workspace'), '@', 1)) || ' Workspace'
  )
  ON CONFLICT (owner_user_id) DO UPDATE
  SET
    name = COALESCE(workspaces.name, EXCLUDED.name),
    updated_at = now()
  RETURNING * INTO v_workspace;

  INSERT INTO public.workspace_memberships (
    workspace_id,
    user_id,
    email,
    full_name,
    role,
    status,
    can_manage_billing,
    can_manage_workspace,
    created_by_user_id,
    invited_by_user_id
  )
  VALUES (
    v_workspace.id,
    p_user_id,
    v_email,
    NULLIF(v_full_name, ''),
    'owner',
    'active',
    true,
    true,
    p_user_id,
    p_user_id
  )
  ON CONFLICT (user_id) DO UPDATE
  SET
    workspace_id = EXCLUDED.workspace_id,
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    role = 'owner',
    status = 'active',
    can_manage_billing = true,
    can_manage_workspace = true,
    updated_at = now()
  RETURNING * INTO v_membership;

  RETURN v_membership;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_auth_user_workspace()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  BEGIN
    PERFORM public.ensure_workspace_membership(NEW.id);
  EXCEPTION
    WHEN OTHERS THEN
      RAISE WARNING 'Workspace bootstrap failed for user %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_workspace ON auth.users;
CREATE TRIGGER on_auth_user_created_workspace
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_auth_user_workspace();

DO $$
DECLARE
  u RECORD;
BEGIN
  FOR u IN SELECT id FROM auth.users LOOP
    PERFORM public.ensure_workspace_membership(u.id);
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.workspace_get_permissions(p_user_id UUID DEFAULT auth.uid())
RETURNS TEXT[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_membership public.workspace_memberships%ROWTYPE;
  v_permissions TEXT[] := '{}'::text[];
BEGIN
  PERFORM public.ensure_workspace_membership(p_user_id);

  SELECT *
  INTO v_membership
  FROM public.workspace_memberships
  WHERE user_id = p_user_id;

  IF NOT FOUND OR v_membership.status = 'disabled' THEN
    RETURN '{}'::text[];
  END IF;

  IF v_membership.role = 'owner' THEN
    SELECT ARRAY_AGG(permission ORDER BY permission)
    INTO v_permissions
    FROM public.workspace_permissions;
  ELSE
    SELECT COALESCE(ARRAY_AGG(permission ORDER BY permission), '{}'::text[])
    INTO v_permissions
    FROM public.workspace_role_permissions
    WHERE role = v_membership.role
      AND allowed = true;
  END IF;

  IF v_membership.can_manage_workspace THEN
    v_permissions := ARRAY(SELECT DISTINCT unnest(v_permissions || ARRAY['manage_workspace']));
  END IF;
  IF v_membership.can_manage_billing THEN
    v_permissions := ARRAY(SELECT DISTINCT unnest(v_permissions || ARRAY['manage_billing']));
  END IF;

  IF COALESCE(array_length(v_membership.extra_permissions, 1), 0) > 0 THEN
    v_permissions := ARRAY(SELECT DISTINCT unnest(v_permissions || v_membership.extra_permissions));
  END IF;

  IF COALESCE(array_length(v_membership.revoked_permissions, 1), 0) > 0 THEN
    SELECT COALESCE(ARRAY_AGG(permission ORDER BY permission), '{}'::text[])
    INTO v_permissions
    FROM unnest(v_permissions) permission
    WHERE permission <> ALL(v_membership.revoked_permissions);
  END IF;

  RETURN COALESCE(v_permissions, '{}'::text[]);
END;
$$;

CREATE OR REPLACE FUNCTION public.workspace_has_permission(
  p_user_id UUID DEFAULT auth.uid(),
  p_permission TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_permissions TEXT[];
BEGIN
  IF p_user_id IS NULL OR COALESCE(trim(p_permission), '') = '' THEN
    RETURN false;
  END IF;

  v_permissions := public.workspace_get_permissions(p_user_id);
  RETURN p_permission = ANY(COALESCE(v_permissions, '{}'::text[]));
END;
$$;

CREATE OR REPLACE FUNCTION public.workspace_scope_user_ids(p_actor_user_id UUID DEFAULT auth.uid())
RETURNS TABLE(user_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_membership public.workspace_memberships%ROWTYPE;
  v_can_view_workspace BOOLEAN := false;
  v_can_view_team BOOLEAN := false;
BEGIN
  PERFORM public.ensure_workspace_membership(p_actor_user_id);

  SELECT *
  INTO v_membership
  FROM public.workspace_memberships actor_membership
  WHERE actor_membership.user_id = p_actor_user_id;

  IF NOT FOUND OR v_membership.status = 'disabled' THEN
    RETURN;
  END IF;

  v_can_view_workspace := public.workspace_has_permission(p_actor_user_id, 'view_workspace_dashboard')
    OR public.workspace_has_permission(p_actor_user_id, 'manage_workspace');
  v_can_view_team := public.workspace_has_permission(p_actor_user_id, 'view_team_dashboard')
    OR public.workspace_has_permission(p_actor_user_id, 'manage_workspace');

  IF v_can_view_workspace OR v_membership.role = 'owner' THEN
    RETURN QUERY
    SELECT wm.user_id
    FROM public.workspace_memberships wm
    WHERE wm.workspace_id = v_membership.workspace_id;
    RETURN;
  END IF;

  IF v_can_view_team OR v_membership.role IN ('admin', 'sub_admin') THEN
    RETURN QUERY
    WITH RECURSIVE scope_tree AS (
      SELECT wm.user_id
      FROM public.workspace_memberships wm
      WHERE wm.user_id = p_actor_user_id
      UNION ALL
      SELECT child.user_id
      FROM public.workspace_memberships child
      JOIN scope_tree parent_tree ON parent_tree.user_id = child.parent_user_id
      WHERE child.workspace_id = v_membership.workspace_id
    )
    SELECT DISTINCT scope_tree.user_id
    FROM scope_tree;
    RETURN;
  END IF;

  IF v_membership.role = 'reviewer' THEN
    RETURN QUERY
    SELECT DISTINCT wm.user_id
    FROM public.workspace_memberships wm
    WHERE wm.user_id = p_actor_user_id
       OR wm.assigned_reviewer_user_id = p_actor_user_id;
    RETURN;
  END IF;

  RETURN QUERY SELECT p_actor_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.workspace_user_in_scope(
  p_actor_user_id UUID,
  p_target_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.workspace_scope_user_ids(p_actor_user_id) scope_users
    WHERE scope_users.user_id = p_target_user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.workspace_member_snapshot(
  p_user_id UUID DEFAULT auth.uid(),
  p_include_descendants BOOLEAN DEFAULT true
)
RETURNS TABLE (
  workspace_id UUID,
  owner_user_id UUID,
  role TEXT,
  membership_status TEXT,
  parent_user_id UUID,
  credits_cap INTEGER,
  credits_used INTEGER,
  credits_remaining INTEGER,
  campaign_cap INTEGER,
  active_campaigns INTEGER,
  sender_cap INTEGER,
  active_senders INTEGER,
  daily_send_cap INTEGER,
  sends_today INTEGER,
  automation_cap INTEGER,
  live_automations INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_membership public.workspace_memberships%ROWTYPE;
  v_workspace public.workspaces%ROWTYPE;
  v_allocation public.workspace_quota_allocations%ROWTYPE;
  v_scope_ids UUID[];
BEGIN
  PERFORM public.ensure_workspace_membership(p_user_id);

  SELECT *
  INTO v_membership
  FROM public.workspace_memberships member_row
  WHERE member_row.user_id = p_user_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT *
  INTO v_workspace
  FROM public.workspaces
  WHERE id = v_membership.workspace_id;

  IF p_include_descendants THEN
    SELECT ARRAY_AGG(scope_users.user_id)
    INTO v_scope_ids
    FROM (
      WITH RECURSIVE scope_tree AS (
        SELECT wm.user_id
        FROM public.workspace_memberships wm
        WHERE wm.user_id = p_user_id
        UNION ALL
        SELECT child.user_id
        FROM public.workspace_memberships child
        JOIN scope_tree st ON st.user_id = child.parent_user_id
        WHERE child.workspace_id = v_membership.workspace_id
      )
      SELECT DISTINCT user_id
      FROM scope_tree
    ) scope_users;
  ELSE
    v_scope_ids := ARRAY[p_user_id];
  END IF;

  IF v_membership.role = 'owner' THEN
    RETURN QUERY
    WITH owner_plan AS (
      SELECT
        w.id AS workspace_id,
        w.owner_user_id,
        bp.campaign_limit,
        bp.mailbox_limit,
        bp.daily_send_limit,
        cw.period_credits
      FROM public.workspaces w
      JOIN public.user_subscriptions us ON us.user_id = w.owner_user_id
      JOIN public.billing_plans bp ON bp.id = us.plan_id
      JOIN public.credit_wallets cw ON cw.user_id = w.owner_user_id
      WHERE w.id = v_membership.workspace_id
    )
    SELECT
      op.workspace_id,
      op.owner_user_id,
      v_membership.role,
      v_membership.status,
      v_membership.parent_user_id,
      op.period_credits,
      COALESCE((
        SELECT SUM(wue.credit_delta)::INTEGER
        FROM public.workspace_usage_events wue
        WHERE wue.workspace_id = op.workspace_id
          AND wue.user_id = ANY(v_scope_ids)
      ), 0),
      GREATEST(
        COALESCE(op.period_credits, 0) - COALESCE((
          SELECT SUM(wue.credit_delta)::INTEGER
          FROM public.workspace_usage_events wue
          WHERE wue.workspace_id = op.workspace_id
            AND wue.user_id = ANY(v_scope_ids)
        ), 0),
        0
      ),
      op.campaign_limit,
      COALESCE((
        SELECT COUNT(*)::INTEGER
        FROM public.campaigns c
        WHERE c.user_id = ANY(v_scope_ids)
          AND COALESCE(c.status, 'draft') IN ('ready', 'sending', 'paused', 'scheduled')
      ), 0),
      op.mailbox_limit,
      COALESCE((
        SELECT COUNT(*)::INTEGER
        FROM public.email_configs ec
        WHERE ec.user_id = ANY(v_scope_ids)
          AND COALESCE(ec.is_active, true) = true
      ), 0),
      op.daily_send_limit,
      COALESCE((
        SELECT SUM(wue.send_delta)::INTEGER
        FROM public.workspace_usage_events wue
        WHERE wue.workspace_id = op.workspace_id
          AND wue.user_id = ANY(v_scope_ids)
          AND wue.occurred_at >= date_trunc('day', now())
      ), 0),
      NULL::INTEGER,
      COALESCE((
        SELECT COUNT(*)::INTEGER
        FROM public.automation_workflows aw
        WHERE aw.user_id = ANY(v_scope_ids)
          AND aw.status = 'live'
      ), 0)
    FROM owner_plan op;
    RETURN;
  END IF;

  SELECT *
  INTO v_allocation
  FROM public.workspace_quota_allocations qa
  WHERE qa.allocated_to_user_id = p_user_id
    AND qa.status = 'active'
  ORDER BY qa.created_at DESC
  LIMIT 1;

  RETURN QUERY
  SELECT
    v_membership.workspace_id,
    v_workspace.owner_user_id,
    v_membership.role,
    v_membership.status,
    v_membership.parent_user_id,
    v_allocation.credits_allocated,
    COALESCE((
      SELECT SUM(wue.credit_delta)::INTEGER
      FROM public.workspace_usage_events wue
      WHERE wue.workspace_id = v_membership.workspace_id
        AND wue.user_id = ANY(v_scope_ids)
    ), 0),
    CASE
      WHEN v_allocation.credits_allocated IS NULL THEN NULL
      ELSE GREATEST(
        v_allocation.credits_allocated - COALESCE((
          SELECT SUM(wue.credit_delta)::INTEGER
          FROM public.workspace_usage_events wue
          WHERE wue.workspace_id = v_membership.workspace_id
            AND wue.user_id = ANY(v_scope_ids)
        ), 0),
        0
      )
    END,
    v_allocation.max_active_campaigns,
    COALESCE((
      SELECT COUNT(*)::INTEGER
      FROM public.campaigns c
      WHERE c.user_id = ANY(v_scope_ids)
        AND COALESCE(c.status, 'draft') IN ('ready', 'sending', 'paused', 'scheduled')
    ), 0),
    v_allocation.max_sender_accounts,
    COALESCE((
      SELECT COUNT(*)::INTEGER
      FROM public.email_configs ec
      WHERE ec.user_id = ANY(v_scope_ids)
        AND COALESCE(ec.is_active, true) = true
    ), 0),
    v_allocation.daily_send_limit,
    COALESCE((
      SELECT SUM(wue.send_delta)::INTEGER
      FROM public.workspace_usage_events wue
      WHERE wue.workspace_id = v_membership.workspace_id
        AND wue.user_id = ANY(v_scope_ids)
        AND wue.occurred_at >= date_trunc('day', now())
    ), 0),
    v_allocation.max_automations,
    COALESCE((
      SELECT COUNT(*)::INTEGER
      FROM public.automation_workflows aw
      WHERE aw.user_id = ANY(v_scope_ids)
        AND aw.status = 'live'
    ), 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.workspace_root_capacity_ok(
  p_owner_user_id UUID,
  p_plan_id TEXT,
  p_billing_cycle TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_workspace public.workspaces%ROWTYPE;
  v_credit_cap INTEGER := COALESCE(public.get_plan_period_credits(p_plan_id, p_billing_cycle), 0);
  v_campaign_cap INTEGER;
  v_sender_cap INTEGER;
  v_daily_send_cap INTEGER;
  v_owner_direct RECORD;
  v_child_credit_alloc INTEGER := 0;
  v_child_campaign_alloc INTEGER := 0;
  v_child_sender_alloc INTEGER := 0;
  v_child_daily_send_alloc INTEGER := 0;
BEGIN
  SELECT *
  INTO v_workspace
  FROM public.workspaces
  WHERE owner_user_id = p_owner_user_id;

  IF NOT FOUND THEN
    RETURN true;
  END IF;

  SELECT
    bp.campaign_limit,
    bp.mailbox_limit,
    bp.daily_send_limit
  INTO v_campaign_cap, v_sender_cap, v_daily_send_cap
  FROM public.billing_plans bp
  WHERE bp.id = p_plan_id;

  SELECT *
  INTO v_owner_direct
  FROM public.workspace_member_snapshot(p_owner_user_id, false)
  LIMIT 1;

  SELECT
    COALESCE(SUM(qa.credits_allocated), 0),
    COALESCE(SUM(qa.max_active_campaigns), 0),
    COALESCE(SUM(qa.max_sender_accounts), 0),
    COALESCE(SUM(qa.daily_send_limit), 0)
  INTO
    v_child_credit_alloc,
    v_child_campaign_alloc,
    v_child_sender_alloc,
    v_child_daily_send_alloc
  FROM public.workspace_quota_allocations qa
  JOIN public.workspace_memberships wm ON wm.user_id = qa.allocated_to_user_id
  WHERE qa.status = 'active'
    AND wm.workspace_id = v_workspace.id
    AND wm.parent_user_id = p_owner_user_id;

  IF COALESCE(v_owner_direct.credits_used, 0) + v_child_credit_alloc > v_credit_cap THEN
    RETURN false;
  END IF;
  IF v_campaign_cap IS NOT NULL AND COALESCE(v_owner_direct.active_campaigns, 0) + v_child_campaign_alloc > v_campaign_cap THEN
    RETURN false;
  END IF;
  IF v_sender_cap IS NOT NULL AND COALESCE(v_owner_direct.active_senders, 0) + v_child_sender_alloc > v_sender_cap THEN
    RETURN false;
  END IF;
  IF v_daily_send_cap IS NOT NULL AND COALESCE(v_owner_direct.sends_today, 0) + v_child_daily_send_alloc > v_daily_send_cap THEN
    RETURN false;
  END IF;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_workspace_root_capacity_on_subscription_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.workspaces w WHERE w.owner_user_id = NEW.user_id) THEN
    IF NOT public.workspace_root_capacity_ok(NEW.user_id, NEW.plan_id, NEW.billing_cycle) THEN
      RAISE EXCEPTION 'Workspace allocations exceed the selected plan capacity. Reduce child allocations or live usage before changing the workspace plan.'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_workspace_root_capacity_on_user_subscriptions ON public.user_subscriptions;
CREATE TRIGGER validate_workspace_root_capacity_on_user_subscriptions
AFTER INSERT OR UPDATE OF plan_id, billing_cycle ON public.user_subscriptions
FOR EACH ROW
EXECUTE FUNCTION public.validate_workspace_root_capacity_on_subscription_change();

DROP FUNCTION IF EXISTS public.get_billing_snapshot(UUID);

CREATE OR REPLACE FUNCTION public.get_billing_snapshot(p_user_id UUID DEFAULT auth.uid())
RETURNS TABLE (
  user_id UUID,
  workspace_id UUID,
  workspace_name TEXT,
  role TEXT,
  plan_id TEXT,
  plan_name TEXT,
  billing_cycle TEXT,
  subscription_status TEXT,
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  credits_in_period INTEGER,
  credits_used INTEGER,
  credits_remaining INTEGER,
  mailbox_limit INTEGER,
  mailboxes_used INTEGER,
  unlimited_mailboxes BOOLEAN,
  campaign_limit INTEGER,
  campaigns_used INTEGER,
  unlimited_campaigns BOOLEAN,
  daily_send_limit INTEGER,
  sends_today INTEGER,
  unlimited_daily_sends BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_membership public.workspace_memberships%ROWTYPE;
  v_workspace public.workspaces%ROWTYPE;
  v_snapshot RECORD;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'User id is required';
  END IF;

  IF v_actor IS NOT NULL AND v_actor <> p_user_id AND NOT public.is_service_role() THEN
    RAISE EXCEPTION 'Not authorized to view another user billing snapshot';
  END IF;

  PERFORM public.ensure_workspace_membership(p_user_id);

  SELECT *
  INTO v_membership
  FROM public.workspace_memberships
  WHERE user_id = p_user_id;

  SELECT *
  INTO v_workspace
  FROM public.workspaces
  WHERE id = v_membership.workspace_id;

  PERFORM public.refresh_user_credit_wallet(v_workspace.owner_user_id);

  SELECT *
  INTO v_snapshot
  FROM public.workspace_member_snapshot(p_user_id, true)
  LIMIT 1;

  RETURN QUERY
  SELECT
    p_user_id,
    v_workspace.id,
    v_workspace.name,
    v_membership.role,
    us.plan_id,
    bp.name,
    us.billing_cycle,
    us.status,
    us.current_period_start,
    us.current_period_end,
    v_snapshot.credits_cap,
    v_snapshot.credits_used,
    v_snapshot.credits_remaining,
    v_snapshot.sender_cap,
    v_snapshot.active_senders,
    v_snapshot.sender_cap IS NULL,
    v_snapshot.campaign_cap,
    v_snapshot.active_campaigns,
    v_snapshot.campaign_cap IS NULL,
    v_snapshot.daily_send_cap,
    v_snapshot.sends_today,
    v_snapshot.daily_send_cap IS NULL
  FROM public.user_subscriptions us
  JOIN public.billing_plans bp ON bp.id = us.plan_id
  WHERE us.user_id = v_workspace.owner_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_user_mailbox_limit(p_user_id UUID DEFAULT auth.uid())
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_snapshot RECORD;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'User id is required';
  END IF;

  IF v_actor IS NOT NULL AND v_actor <> p_user_id AND NOT public.is_service_role() THEN
    RAISE EXCEPTION 'Not authorized to view another user mailbox limit';
  END IF;

  SELECT *
  INTO v_snapshot
  FROM public.workspace_member_snapshot(p_user_id, true)
  LIMIT 1;

  RETURN v_snapshot.sender_cap;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_user_campaign_limit(p_user_id UUID DEFAULT auth.uid())
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_snapshot RECORD;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'User id is required';
  END IF;

  IF v_actor IS NOT NULL AND v_actor <> p_user_id AND NOT public.is_service_role() THEN
    RAISE EXCEPTION 'Not authorized to view another user campaign limit';
  END IF;

  SELECT *
  INTO v_snapshot
  FROM public.workspace_member_snapshot(p_user_id, true)
  LIMIT 1;

  RETURN v_snapshot.campaign_cap;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_user_daily_send_limit(p_user_id UUID DEFAULT auth.uid())
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_snapshot RECORD;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'User id is required';
  END IF;

  IF v_actor IS NOT NULL AND v_actor <> p_user_id AND NOT public.is_service_role() THEN
    RAISE EXCEPTION 'Not authorized to view another user daily send limit';
  END IF;

  SELECT *
  INTO v_snapshot
  FROM public.workspace_member_snapshot(p_user_id, true)
  LIMIT 1;

  RETURN v_snapshot.daily_send_cap;
END;
$$;

CREATE OR REPLACE FUNCTION public.consume_user_credits(
  p_amount INTEGER,
  p_event_type TEXT,
  p_reference_id TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb,
  p_user_id UUID DEFAULT auth.uid()
)
RETURNS TABLE (
  allowed BOOLEAN,
  credits_remaining INTEGER,
  message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_membership public.workspace_memberships%ROWTYPE;
  v_workspace public.workspaces%ROWTYPE;
  v_wallet public.credit_wallets%ROWTYPE;
  v_snapshot RECORD;
  v_remaining INTEGER;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'User id is required';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be greater than zero';
  END IF;
  IF COALESCE(trim(p_event_type), '') = '' THEN
    RAISE EXCEPTION 'Event type is required';
  END IF;
  IF v_actor IS NOT NULL AND v_actor <> p_user_id AND NOT public.is_service_role() THEN
    RAISE EXCEPTION 'Not authorized to consume credits for another user';
  END IF;

  PERFORM public.ensure_workspace_membership(p_user_id);

  SELECT *
  INTO v_membership
  FROM public.workspace_memberships
  WHERE user_id = p_user_id;

  SELECT *
  INTO v_workspace
  FROM public.workspaces
  WHERE id = v_membership.workspace_id;

  PERFORM public.refresh_user_credit_wallet(v_workspace.owner_user_id);

  SELECT *
  INTO v_snapshot
  FROM public.workspace_member_snapshot(p_user_id, true)
  LIMIT 1;

  IF v_snapshot.credits_cap IS NOT NULL AND COALESCE(v_snapshot.credits_remaining, 0) < p_amount THEN
    RETURN QUERY SELECT false, COALESCE(v_snapshot.credits_remaining, 0), 'Insufficient allocated credits';
    RETURN;
  END IF;

  SELECT *
  INTO v_wallet
  FROM public.credit_wallets
  WHERE user_id = v_workspace.owner_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, COALESCE(v_snapshot.credits_remaining, 0), 'Workspace credit wallet not found';
    RETURN;
  END IF;

  IF v_wallet.credits_remaining < p_amount THEN
    RETURN QUERY SELECT false, v_wallet.credits_remaining, 'Insufficient workspace credits';
    RETURN;
  END IF;

  UPDATE public.credit_wallets
  SET
    credits_remaining = credits_remaining - p_amount,
    credits_used = credits_used + p_amount,
    updated_at = now()
  WHERE user_id = v_workspace.owner_user_id
  RETURNING * INTO v_wallet;

  INSERT INTO public.credit_ledger (
    user_id,
    subscription_id,
    delta,
    balance_after,
    event_type,
    reference_id,
    metadata
  )
  VALUES (
    v_workspace.owner_user_id,
    v_wallet.subscription_id,
    -p_amount,
    v_wallet.credits_remaining,
    trim(p_event_type),
    p_reference_id,
    COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object(
      'actor_user_id', p_user_id,
      'workspace_id', v_workspace.id
    )
  );

  INSERT INTO public.workspace_usage_events (
    workspace_id,
    user_id,
    event_type,
    entity_type,
    entity_id,
    credit_delta,
    metadata
  )
  VALUES (
    v_workspace.id,
    p_user_id,
    trim(p_event_type),
    COALESCE(p_metadata ->> 'source', p_event_type),
    p_reference_id,
    p_amount,
    COALESCE(p_metadata, '{}'::jsonb)
  );

  SELECT *
  INTO v_snapshot
  FROM public.workspace_member_snapshot(p_user_id, true)
  LIMIT 1;

  v_remaining := COALESCE(v_snapshot.credits_remaining, v_wallet.credits_remaining);
  RETURN QUERY SELECT true, v_remaining, 'Credits consumed';
END;
$$;

CREATE OR REPLACE FUNCTION public.refund_user_credits(
  p_amount INTEGER,
  p_event_type TEXT DEFAULT 'credit_refund',
  p_reference_id TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb,
  p_user_id UUID DEFAULT auth.uid()
)
RETURNS TABLE (
  credits_remaining INTEGER,
  message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_membership public.workspace_memberships%ROWTYPE;
  v_workspace public.workspaces%ROWTYPE;
  v_wallet public.credit_wallets%ROWTYPE;
  v_snapshot RECORD;
  v_remaining INTEGER;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'User id is required';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be greater than zero';
  END IF;
  IF COALESCE(trim(p_event_type), '') = '' THEN
    RAISE EXCEPTION 'Event type is required';
  END IF;
  IF v_actor IS NOT NULL AND v_actor <> p_user_id AND NOT public.is_service_role() THEN
    RAISE EXCEPTION 'Not authorized to refund credits for another user';
  END IF;

  PERFORM public.ensure_workspace_membership(p_user_id);

  SELECT *
  INTO v_membership
  FROM public.workspace_memberships
  WHERE user_id = p_user_id;

  SELECT *
  INTO v_workspace
  FROM public.workspaces
  WHERE id = v_membership.workspace_id;

  PERFORM public.refresh_user_credit_wallet(v_workspace.owner_user_id);

  SELECT *
  INTO v_wallet
  FROM public.credit_wallets
  WHERE user_id = v_workspace.owner_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Workspace credit wallet not found';
  END IF;

  UPDATE public.credit_wallets
  SET
    credits_remaining = credits_remaining + p_amount,
    credits_used = GREATEST(0, credits_used - p_amount),
    updated_at = now()
  WHERE user_id = v_workspace.owner_user_id
  RETURNING * INTO v_wallet;

  INSERT INTO public.credit_ledger (
    user_id,
    subscription_id,
    delta,
    balance_after,
    event_type,
    reference_id,
    metadata
  )
  VALUES (
    v_workspace.owner_user_id,
    v_wallet.subscription_id,
    p_amount,
    v_wallet.credits_remaining,
    trim(p_event_type),
    p_reference_id,
    COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object(
      'actor_user_id', p_user_id,
      'workspace_id', v_workspace.id
    )
  );

  INSERT INTO public.workspace_usage_events (
    workspace_id,
    user_id,
    event_type,
    entity_type,
    entity_id,
    credit_delta,
    metadata
  )
  VALUES (
    v_workspace.id,
    p_user_id,
    trim(p_event_type),
    COALESCE(p_metadata ->> 'source', p_event_type),
    p_reference_id,
    -p_amount,
    COALESCE(p_metadata, '{}'::jsonb)
  );

  SELECT *
  INTO v_snapshot
  FROM public.workspace_member_snapshot(p_user_id, true)
  LIMIT 1;

  v_remaining := COALESCE(v_snapshot.credits_remaining, v_wallet.credits_remaining);
  RETURN QUERY SELECT v_remaining, 'Credits refunded';
END;
$$;

CREATE OR REPLACE FUNCTION public.consume_user_send_quota(
  p_amount INTEGER DEFAULT 1,
  p_event_type TEXT DEFAULT 'send_quota',
  p_reference_id TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb,
  p_user_id UUID DEFAULT auth.uid()
)
RETURNS TABLE (
  allowed BOOLEAN,
  sends_remaining INTEGER,
  message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_membership public.workspace_memberships%ROWTYPE;
  v_snapshot RECORD;
  v_remaining INTEGER;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'User id is required';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be greater than zero';
  END IF;
  IF v_actor IS NOT NULL AND v_actor <> p_user_id AND NOT public.is_service_role() THEN
    RAISE EXCEPTION 'Not authorized to consume send quota for another user';
  END IF;

  PERFORM public.ensure_workspace_membership(p_user_id);

  SELECT *
  INTO v_membership
  FROM public.workspace_memberships
  WHERE user_id = p_user_id;

  SELECT *
  INTO v_snapshot
  FROM public.workspace_member_snapshot(p_user_id, true)
  LIMIT 1;

  IF v_snapshot.daily_send_cap IS NOT NULL AND COALESCE(v_snapshot.sends_today, 0) + p_amount > v_snapshot.daily_send_cap THEN
    RETURN QUERY SELECT false, GREATEST(COALESCE(v_snapshot.daily_send_cap, 0) - COALESCE(v_snapshot.sends_today, 0), 0), 'Daily send limit reached';
    RETURN;
  END IF;

  INSERT INTO public.workspace_usage_events (
    workspace_id,
    user_id,
    event_type,
    entity_type,
    entity_id,
    send_delta,
    metadata
  )
  VALUES (
    v_membership.workspace_id,
    p_user_id,
    COALESCE(NULLIF(trim(p_event_type), ''), 'send_quota'),
    COALESCE(p_metadata ->> 'source', 'send'),
    p_reference_id,
    p_amount,
    COALESCE(p_metadata, '{}'::jsonb)
  );

  SELECT *
  INTO v_snapshot
  FROM public.workspace_member_snapshot(p_user_id, true)
  LIMIT 1;

  v_remaining := CASE
    WHEN v_snapshot.daily_send_cap IS NULL THEN NULL
    ELSE GREATEST(v_snapshot.daily_send_cap - COALESCE(v_snapshot.sends_today, 0), 0)
  END;

  RETURN QUERY SELECT true, v_remaining, 'Send quota reserved';
END;
$$;

CREATE OR REPLACE FUNCTION public.refund_user_send_quota(
  p_amount INTEGER DEFAULT 1,
  p_event_type TEXT DEFAULT 'send_quota_refund',
  p_reference_id TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb,
  p_user_id UUID DEFAULT auth.uid()
)
RETURNS TABLE (
  sends_remaining INTEGER,
  message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_membership public.workspace_memberships%ROWTYPE;
  v_snapshot RECORD;
  v_remaining INTEGER;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'User id is required';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be greater than zero';
  END IF;
  IF v_actor IS NOT NULL AND v_actor <> p_user_id AND NOT public.is_service_role() THEN
    RAISE EXCEPTION 'Not authorized to refund send quota for another user';
  END IF;

  PERFORM public.ensure_workspace_membership(p_user_id);

  SELECT *
  INTO v_membership
  FROM public.workspace_memberships
  WHERE user_id = p_user_id;

  INSERT INTO public.workspace_usage_events (
    workspace_id,
    user_id,
    event_type,
    entity_type,
    entity_id,
    send_delta,
    metadata
  )
  VALUES (
    v_membership.workspace_id,
    p_user_id,
    COALESCE(NULLIF(trim(p_event_type), ''), 'send_quota_refund'),
    COALESCE(p_metadata ->> 'source', 'send'),
    p_reference_id,
    -p_amount,
    COALESCE(p_metadata, '{}'::jsonb)
  );

  SELECT *
  INTO v_snapshot
  FROM public.workspace_member_snapshot(p_user_id, true)
  LIMIT 1;

  v_remaining := CASE
    WHEN v_snapshot.daily_send_cap IS NULL THEN NULL
    ELSE GREATEST(v_snapshot.daily_send_cap - COALESCE(v_snapshot.sends_today, 0), 0)
  END;

  RETURN QUERY SELECT v_remaining, 'Send quota refunded';
END;
$$;

CREATE OR REPLACE FUNCTION public.workspace_validate_allocation(
  p_target_user_id UUID,
  p_credits_allocated INTEGER,
  p_max_active_campaigns INTEGER,
  p_max_sender_accounts INTEGER,
  p_daily_send_limit INTEGER,
  p_max_automations INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target public.workspace_memberships%ROWTYPE;
  v_parent public.workspace_memberships%ROWTYPE;
  v_target_snapshot RECORD;
  v_parent_direct_snapshot RECORD;
  v_parent_full_snapshot RECORD;
  v_sibling_credit_alloc INTEGER := 0;
  v_sibling_campaign_alloc INTEGER := 0;
  v_sibling_sender_alloc INTEGER := 0;
  v_sibling_daily_send_alloc INTEGER := 0;
  v_sibling_automation_alloc INTEGER := 0;
BEGIN
  PERFORM public.ensure_workspace_membership(p_target_user_id);

  SELECT *
  INTO v_target
  FROM public.workspace_memberships
  WHERE user_id = p_target_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target member not found';
  END IF;

  IF v_target.role = 'owner' THEN
    RAISE EXCEPTION 'Owner allocation is derived from the workspace plan';
  END IF;

  IF v_target.parent_user_id IS NULL THEN
    RAISE EXCEPTION 'Target member must be assigned to a parent admin';
  END IF;

  SELECT *
  INTO v_parent
  FROM public.workspace_memberships
  WHERE user_id = v_target.parent_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Parent member not found';
  END IF;

  SELECT *
  INTO v_target_snapshot
  FROM public.workspace_member_snapshot(p_target_user_id, true)
  LIMIT 1;

  IF p_credits_allocated IS NOT NULL AND p_credits_allocated < COALESCE(v_target_snapshot.credits_used, 0) THEN
    RAISE EXCEPTION 'Credits allocation cannot be set below current usage (%).', COALESCE(v_target_snapshot.credits_used, 0)
      USING ERRCODE = 'P0001';
  END IF;
  IF p_max_active_campaigns IS NOT NULL AND p_max_active_campaigns < COALESCE(v_target_snapshot.active_campaigns, 0) THEN
    RAISE EXCEPTION 'Campaign limit cannot be reduced below current live usage (% active campaigns).', COALESCE(v_target_snapshot.active_campaigns, 0)
      USING ERRCODE = 'P0001';
  END IF;
  IF p_max_sender_accounts IS NOT NULL AND p_max_sender_accounts < COALESCE(v_target_snapshot.active_senders, 0) THEN
    RAISE EXCEPTION 'Sender limit cannot be reduced below current live usage (% active sender accounts).', COALESCE(v_target_snapshot.active_senders, 0)
      USING ERRCODE = 'P0001';
  END IF;
  IF p_daily_send_limit IS NOT NULL AND p_daily_send_limit < COALESCE(v_target_snapshot.sends_today, 0) THEN
    RAISE EXCEPTION 'Daily send limit cannot be reduced below current usage today (% sends).', COALESCE(v_target_snapshot.sends_today, 0)
      USING ERRCODE = 'P0001';
  END IF;
  IF p_max_automations IS NOT NULL AND p_max_automations < COALESCE(v_target_snapshot.live_automations, 0) THEN
    RAISE EXCEPTION 'Automation limit cannot be reduced below current live usage (% live automations).', COALESCE(v_target_snapshot.live_automations, 0)
      USING ERRCODE = 'P0001';
  END IF;

  SELECT *
  INTO v_parent_direct_snapshot
  FROM public.workspace_member_snapshot(v_parent.user_id, false)
  LIMIT 1;

  SELECT *
  INTO v_parent_full_snapshot
  FROM public.workspace_member_snapshot(v_parent.user_id, true)
  LIMIT 1;

  SELECT
    COALESCE(SUM(qa.credits_allocated), 0),
    COALESCE(SUM(qa.max_active_campaigns), 0),
    COALESCE(SUM(qa.max_sender_accounts), 0),
    COALESCE(SUM(qa.daily_send_limit), 0),
    COALESCE(SUM(qa.max_automations), 0)
  INTO
    v_sibling_credit_alloc,
    v_sibling_campaign_alloc,
    v_sibling_sender_alloc,
    v_sibling_daily_send_alloc,
    v_sibling_automation_alloc
  FROM public.workspace_quota_allocations qa
  JOIN public.workspace_memberships wm ON wm.user_id = qa.allocated_to_user_id
  WHERE qa.status = 'active'
    AND wm.workspace_id = v_parent.workspace_id
    AND wm.parent_user_id = v_parent.user_id
    AND wm.user_id <> p_target_user_id;

  IF v_parent_full_snapshot.credits_cap IS NOT NULL
    AND COALESCE(v_parent_direct_snapshot.credits_used, 0) + v_sibling_credit_alloc + COALESCE(p_credits_allocated, 0) > v_parent_full_snapshot.credits_cap
  THEN
    RAISE EXCEPTION 'Credit allocation exceeds the remaining capacity of the parent admin.'
      USING ERRCODE = 'P0001';
  END IF;
  IF v_parent_full_snapshot.campaign_cap IS NOT NULL
    AND COALESCE(v_parent_direct_snapshot.active_campaigns, 0) + v_sibling_campaign_alloc + COALESCE(p_max_active_campaigns, 0) > v_parent_full_snapshot.campaign_cap
  THEN
    RAISE EXCEPTION 'Campaign allocation exceeds the remaining capacity of the parent admin.'
      USING ERRCODE = 'P0001';
  END IF;
  IF v_parent_full_snapshot.sender_cap IS NOT NULL
    AND COALESCE(v_parent_direct_snapshot.active_senders, 0) + v_sibling_sender_alloc + COALESCE(p_max_sender_accounts, 0) > v_parent_full_snapshot.sender_cap
  THEN
    RAISE EXCEPTION 'Sender allocation exceeds the remaining capacity of the parent admin.'
      USING ERRCODE = 'P0001';
  END IF;
  IF v_parent_full_snapshot.daily_send_cap IS NOT NULL
    AND COALESCE(v_parent_direct_snapshot.sends_today, 0) + v_sibling_daily_send_alloc + COALESCE(p_daily_send_limit, 0) > v_parent_full_snapshot.daily_send_cap
  THEN
    RAISE EXCEPTION 'Daily send allocation exceeds the remaining capacity of the parent admin.'
      USING ERRCODE = 'P0001';
  END IF;
  IF v_parent_full_snapshot.automation_cap IS NOT NULL
    AND COALESCE(v_parent_direct_snapshot.live_automations, 0) + v_sibling_automation_alloc + COALESCE(p_max_automations, 0) > v_parent_full_snapshot.automation_cap
  THEN
    RAISE EXCEPTION 'Automation allocation exceeds the remaining capacity of the parent admin.'
      USING ERRCODE = 'P0001';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_workspace_member_allocation(
  p_target_user_id UUID,
  p_credits_allocated INTEGER,
  p_max_active_campaigns INTEGER,
  p_max_sender_accounts INTEGER,
  p_daily_send_limit INTEGER,
  p_max_automations INTEGER DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS public.workspace_quota_allocations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_target public.workspace_memberships%ROWTYPE;
  v_existing public.workspace_quota_allocations%ROWTYPE;
  v_new_allocation public.workspace_quota_allocations%ROWTYPE;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF NOT public.workspace_has_permission(v_actor, 'assign_credits') AND NOT public.workspace_has_permission(v_actor, 'assign_limits') THEN
    RAISE EXCEPTION 'Not authorized to assign member allocations';
  END IF;

  PERFORM public.ensure_workspace_membership(p_target_user_id);

  SELECT *
  INTO v_target
  FROM public.workspace_memberships
  WHERE user_id = p_target_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target member not found';
  END IF;
  IF NOT public.workspace_user_in_scope(v_actor, p_target_user_id) THEN
    RAISE EXCEPTION 'Target member is outside of your scope';
  END IF;
  IF v_target.user_id <> v_actor AND v_target.parent_user_id <> v_actor AND NOT public.workspace_has_permission(v_actor, 'manage_workspace') AND NOT public.workspace_has_permission(v_actor, 'view_workspace_dashboard') THEN
    RAISE EXCEPTION 'Only the assigned parent admin or workspace owner can change this allocation';
  END IF;

  PERFORM public.workspace_validate_allocation(
    p_target_user_id,
    p_credits_allocated,
    p_max_active_campaigns,
    p_max_sender_accounts,
    p_daily_send_limit,
    p_max_automations
  );

  SELECT *
  INTO v_existing
  FROM public.workspace_quota_allocations
  WHERE allocated_to_user_id = p_target_user_id
    AND status = 'active'
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    UPDATE public.workspace_quota_allocations
    SET
      status = 'superseded',
      effective_to = now()
    WHERE id = v_existing.id;
  END IF;

  INSERT INTO public.workspace_quota_allocations (
    workspace_id,
    allocated_by_user_id,
    allocated_to_user_id,
    credits_allocated,
    max_active_campaigns,
    max_sender_accounts,
    daily_send_limit,
    max_automations,
    status,
    metadata
  )
  VALUES (
    v_target.workspace_id,
    v_actor,
    p_target_user_id,
    p_credits_allocated,
    p_max_active_campaigns,
    p_max_sender_accounts,
    p_daily_send_limit,
    p_max_automations,
    'active',
    COALESCE(p_metadata, '{}'::jsonb)
  )
  RETURNING * INTO v_new_allocation;

  PERFORM public.workspace_write_audit_log(
    v_target.workspace_id,
    v_actor,
    'member_allocation_updated',
    'workspace_member',
    p_target_user_id::text,
    to_jsonb(v_existing),
    to_jsonb(v_new_allocation),
    COALESCE(p_metadata, '{}'::jsonb)
  );

  PERFORM public.workspace_notification_insert(
    p_target_user_id,
    'allocation_updated',
    'Allocation updated',
    'Your workspace allocation and limits were updated.',
    'account',
    '/team',
    jsonb_build_object(
      'credits_allocated', p_credits_allocated,
      'max_active_campaigns', p_max_active_campaigns,
      'max_sender_accounts', p_max_sender_accounts,
      'daily_send_limit', p_daily_send_limit,
      'max_automations', p_max_automations
    )
  );

  RETURN v_new_allocation;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_workspace_member(
  p_target_user_id UUID,
  p_role TEXT DEFAULT NULL,
  p_parent_user_id UUID DEFAULT NULL,
  p_status TEXT DEFAULT NULL,
  p_assigned_reviewer_user_id UUID DEFAULT NULL,
  p_can_manage_billing BOOLEAN DEFAULT NULL,
  p_can_manage_workspace BOOLEAN DEFAULT NULL,
  p_extra_permissions TEXT[] DEFAULT NULL,
  p_revoked_permissions TEXT[] DEFAULT NULL,
  p_require_campaign_approval BOOLEAN DEFAULT NULL,
  p_require_sender_approval BOOLEAN DEFAULT NULL,
  p_require_automation_approval BOOLEAN DEFAULT NULL,
  p_full_name TEXT DEFAULT NULL
)
RETURNS public.workspace_memberships
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_actor_membership public.workspace_memberships%ROWTYPE;
  v_target public.workspace_memberships%ROWTYPE;
  v_before public.workspace_memberships%ROWTYPE;
  v_active_allocation public.workspace_quota_allocations%ROWTYPE;
  v_effective_role TEXT;
  v_effective_parent UUID;
  v_effective_status TEXT;
  v_descendant_conflict BOOLEAN := false;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT public.workspace_has_permission(v_actor, 'manage_workspace')
    AND NOT public.workspace_has_permission(v_actor, 'create_user')
    AND NOT public.workspace_has_permission(v_actor, 'create_admin')
  THEN
    RAISE EXCEPTION 'Not authorized to update workspace members';
  END IF;

  PERFORM public.ensure_workspace_membership(v_actor);
  PERFORM public.ensure_workspace_membership(p_target_user_id);

  SELECT *
  INTO v_actor_membership
  FROM public.workspace_memberships
  WHERE user_id = v_actor;

  SELECT *
  INTO v_target
  FROM public.workspace_memberships
  WHERE user_id = p_target_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target member not found';
  END IF;
  IF v_target.workspace_id <> v_actor_membership.workspace_id THEN
    RAISE EXCEPTION 'Target member is outside of your workspace';
  END IF;
  IF NOT public.workspace_user_in_scope(v_actor, p_target_user_id)
    AND v_actor_membership.role <> 'owner'
  THEN
    RAISE EXCEPTION 'Target member is outside of your scope';
  END IF;

  v_before := v_target;
  v_effective_role := lower(COALESCE(NULLIF(p_role, ''), v_target.role));
  v_effective_parent := COALESCE(p_parent_user_id, v_target.parent_user_id);
  v_effective_status := lower(COALESCE(NULLIF(p_status, ''), v_target.status));

  IF v_target.role = 'owner' AND (v_effective_role <> 'owner' OR v_effective_status <> 'active') THEN
    RAISE EXCEPTION 'Workspace owner cannot be downgraded or disabled';
  END IF;
  IF v_effective_role NOT IN ('owner', 'admin', 'sub_admin', 'user', 'reviewer') THEN
    RAISE EXCEPTION 'Invalid role: %', v_effective_role;
  END IF;
  IF v_effective_status NOT IN ('active', 'invited', 'disabled') THEN
    RAISE EXCEPTION 'Invalid member status: %', v_effective_status;
  END IF;
  IF v_effective_role = 'owner' AND v_target.user_id <> v_actor_membership.user_id THEN
    RAISE EXCEPTION 'Only the existing owner can retain the owner role';
  END IF;
  IF v_effective_role <> 'owner' AND v_effective_parent IS NULL THEN
    RAISE EXCEPTION 'Non-owner members must be assigned to a parent admin';
  END IF;
  IF v_effective_parent = p_target_user_id THEN
    RAISE EXCEPTION 'A member cannot be their own parent';
  END IF;

  IF v_effective_parent IS NOT NULL THEN
    WITH RECURSIVE scope_tree AS (
      SELECT wm.user_id
      FROM public.workspace_memberships wm
      WHERE wm.user_id = p_target_user_id
      UNION ALL
      SELECT child.user_id
      FROM public.workspace_memberships child
      JOIN scope_tree st ON st.user_id = child.parent_user_id
      WHERE child.workspace_id = v_target.workspace_id
    )
    SELECT EXISTS (
      SELECT 1
      FROM scope_tree
      WHERE user_id = v_effective_parent
    )
    INTO v_descendant_conflict;

    IF v_descendant_conflict THEN
      RAISE EXCEPTION 'Cannot assign a descendant as the parent admin';
    END IF;
  END IF;

  IF v_effective_status = 'disabled' AND EXISTS (
    SELECT 1
    FROM public.workspace_memberships child
    WHERE child.parent_user_id = p_target_user_id
      AND child.status <> 'disabled'
  ) THEN
    RAISE EXCEPTION 'Reassign or disable child users before disabling this parent admin';
  END IF;

  UPDATE public.workspace_memberships
  SET
    role = v_effective_role,
    parent_user_id = CASE WHEN v_effective_role = 'owner' THEN NULL ELSE v_effective_parent END,
    status = v_effective_status,
    assigned_reviewer_user_id = COALESCE(p_assigned_reviewer_user_id, assigned_reviewer_user_id),
    can_manage_billing = COALESCE(p_can_manage_billing, can_manage_billing),
    can_manage_workspace = COALESCE(p_can_manage_workspace, can_manage_workspace),
    extra_permissions = COALESCE(p_extra_permissions, extra_permissions),
    revoked_permissions = COALESCE(p_revoked_permissions, revoked_permissions),
    require_campaign_approval = COALESCE(p_require_campaign_approval, require_campaign_approval),
    require_sender_approval = COALESCE(p_require_sender_approval, require_sender_approval),
    require_automation_approval = COALESCE(p_require_automation_approval, require_automation_approval),
    full_name = COALESCE(NULLIF(trim(COALESCE(p_full_name, '')), ''), full_name),
    disabled_at = CASE WHEN v_effective_status = 'disabled' THEN now() ELSE NULL END,
    updated_at = now()
  WHERE user_id = p_target_user_id
  RETURNING * INTO v_target;

  IF v_target.role <> 'owner' THEN
    SELECT *
    INTO v_active_allocation
    FROM public.workspace_quota_allocations
    WHERE allocated_to_user_id = p_target_user_id
      AND status = 'active'
    ORDER BY created_at DESC
    LIMIT 1;

    IF FOUND THEN
      PERFORM public.workspace_validate_allocation(
        p_target_user_id,
        v_active_allocation.credits_allocated,
        v_active_allocation.max_active_campaigns,
        v_active_allocation.max_sender_accounts,
        v_active_allocation.daily_send_limit,
        v_active_allocation.max_automations
      );
    END IF;
  END IF;

  PERFORM public.workspace_write_audit_log(
    v_target.workspace_id,
    v_actor,
    'member_updated',
    'workspace_member',
    p_target_user_id::text,
    to_jsonb(v_before),
    to_jsonb(v_target),
    '{}'::jsonb
  );

  RETURN v_target;
END;
$$;

CREATE OR REPLACE FUNCTION public.workspace_resolve_reviewer(
  p_requester_user_id UUID,
  p_entity_type TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_membership public.workspace_memberships%ROWTYPE;
  v_permission TEXT := public.workspace_approval_permission_for_entity(p_entity_type);
  v_reviewer UUID;
BEGIN
  PERFORM public.ensure_workspace_membership(p_requester_user_id);

  SELECT *
  INTO v_membership
  FROM public.workspace_memberships
  WHERE user_id = p_requester_user_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF v_membership.assigned_reviewer_user_id IS NOT NULL
    AND public.workspace_has_permission(v_membership.assigned_reviewer_user_id, v_permission)
  THEN
    RETURN v_membership.assigned_reviewer_user_id;
  END IF;

  WITH RECURSIVE ancestry AS (
    SELECT wm.parent_user_id AS user_id
    FROM public.workspace_memberships wm
    WHERE wm.user_id = p_requester_user_id
    UNION ALL
    SELECT wm.parent_user_id
    FROM public.workspace_memberships wm
    JOIN ancestry a ON a.user_id = wm.user_id
    WHERE wm.parent_user_id IS NOT NULL
  )
  SELECT a.user_id
  INTO v_reviewer
  FROM ancestry a
  WHERE a.user_id IS NOT NULL
    AND public.workspace_has_permission(a.user_id, v_permission)
  LIMIT 1;

  IF v_reviewer IS NOT NULL THEN
    RETURN v_reviewer;
  END IF;

  SELECT COALESCE(w.approval_delegate_user_id, w.owner_user_id)
  INTO v_reviewer
  FROM public.workspaces w
  WHERE w.id = v_membership.workspace_id;

  RETURN v_reviewer;
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_approval_request(
  p_entity_type TEXT,
  p_entity_id UUID,
  p_reason TEXT DEFAULT NULL,
  p_comments TEXT DEFAULT NULL,
  p_reviewer_user_id UUID DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS public.approval_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_request public.approval_requests%ROWTYPE;
  v_existing public.approval_requests%ROWTYPE;
  v_entity_user_id UUID;
  v_workspace_id UUID;
  v_entity_name TEXT;
  v_approval_required BOOLEAN;
  v_reviewer UUID;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF COALESCE(trim(p_entity_type), '') = '' OR p_entity_id IS NULL THEN
    RAISE EXCEPTION 'Entity type and id are required';
  END IF;

  CASE lower(p_entity_type)
    WHEN 'campaign' THEN
      SELECT c.user_id, wm.workspace_id, COALESCE(c.name, 'Campaign')
      INTO v_entity_user_id, v_workspace_id, v_entity_name
      FROM public.campaigns c
      JOIN public.workspace_memberships wm ON wm.user_id = c.user_id
      WHERE c.id = p_entity_id;
    WHEN 'sender_account' THEN
      SELECT ec.user_id, wm.workspace_id, COALESCE(ec.smtp_username, 'Sender account')
      INTO v_entity_user_id, v_workspace_id, v_entity_name
      FROM public.email_configs ec
      JOIN public.workspace_memberships wm ON wm.user_id = ec.user_id
      WHERE ec.id = p_entity_id;
    WHEN 'automation' THEN
      SELECT aw.user_id, wm.workspace_id, COALESCE(aw.name, 'Automation')
      INTO v_entity_user_id, v_workspace_id, v_entity_name
      FROM public.automation_workflows aw
      JOIN public.workspace_memberships wm ON wm.user_id = aw.user_id
      WHERE aw.id = p_entity_id;
    ELSE
      RAISE EXCEPTION 'Unsupported entity type: %', p_entity_type;
  END CASE;

  IF v_entity_user_id IS NULL THEN
    RAISE EXCEPTION 'Entity not found';
  END IF;
  IF v_actor <> v_entity_user_id AND NOT public.workspace_user_in_scope(v_actor, v_entity_user_id) THEN
    RAISE EXCEPTION 'Entity is outside of your scope';
  END IF;

  v_approval_required := public.workspace_status_requires_approval(v_entity_user_id, p_entity_type);
  IF NOT v_approval_required THEN
    RAISE EXCEPTION 'Approval is not required for this action';
  END IF;

  v_reviewer := COALESCE(p_reviewer_user_id, public.workspace_resolve_reviewer(v_entity_user_id, p_entity_type));
  IF v_reviewer IS NULL THEN
    RAISE EXCEPTION 'No reviewer is available for this approval request';
  END IF;

  SELECT *
  INTO v_existing
  FROM public.approval_requests ar
  WHERE ar.entity_type = lower(p_entity_type)
    AND ar.entity_id = p_entity_id
    AND ar.status = 'pending_approval'
  ORDER BY ar.created_at DESC
  LIMIT 1;

  IF FOUND THEN
    RETURN v_existing;
  END IF;

  INSERT INTO public.approval_requests (
    workspace_id,
    entity_type,
    entity_id,
    requested_by_user_id,
    reviewer_user_id,
    status,
    reason,
    comments,
    metadata
  )
  VALUES (
    v_workspace_id,
    lower(p_entity_type),
    p_entity_id,
    v_entity_user_id,
    v_reviewer,
    'pending_approval',
    NULLIF(trim(COALESCE(p_reason, '')), ''),
    NULLIF(trim(COALESCE(p_comments, '')), ''),
    COALESCE(p_metadata, '{}'::jsonb)
  )
  RETURNING * INTO v_request;

  INSERT INTO public.approval_actions (
    approval_request_id,
    actor_user_id,
    action_type,
    status_from,
    status_to,
    comment,
    metadata
  )
  VALUES (
    v_request.id,
    v_actor,
    'submitted',
    'draft',
    'pending_approval',
    NULLIF(trim(COALESCE(p_comments, '')), ''),
    COALESCE(p_metadata, '{}'::jsonb)
  );

  IF lower(p_entity_type) = 'campaign' THEN
    UPDATE public.campaigns
    SET approval_status = 'pending_approval', approval_request_id = v_request.id
    WHERE id = p_entity_id;
  ELSIF lower(p_entity_type) = 'sender_account' THEN
    UPDATE public.email_configs
    SET approval_status = 'pending_approval', approval_request_id = v_request.id, is_active = false
    WHERE id = p_entity_id;
  ELSE
    UPDATE public.automation_workflows
    SET approval_status = 'pending_approval', approval_request_id = v_request.id
    WHERE id = p_entity_id;
  END IF;

  PERFORM public.workspace_write_audit_log(
    v_workspace_id,
    v_actor,
    'approval_submitted',
    lower(p_entity_type),
    p_entity_id::text,
    NULL,
    to_jsonb(v_request),
    COALESCE(p_metadata, '{}'::jsonb)
  );

  PERFORM public.workspace_notification_insert(
    v_reviewer,
    'approval_requested',
    'Approval requested',
    format('%s submitted %s for your review.', COALESCE(v_entity_name, 'An item'), replace(lower(p_entity_type), '_', ' ')),
    'system',
    '/team?tab=approvals',
    jsonb_build_object(
      'approval_request_id', v_request.id,
      'entity_type', lower(p_entity_type),
      'entity_id', p_entity_id,
      'requested_by_user_id', v_entity_user_id
    )
  );

  RETURN v_request;
END;
$$;

CREATE OR REPLACE FUNCTION public.review_approval_request(
  p_request_id UUID,
  p_action TEXT,
  p_comment TEXT DEFAULT NULL
)
RETURNS public.approval_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_request public.approval_requests%ROWTYPE;
  v_permission TEXT;
  v_action TEXT := lower(COALESCE(p_action, ''));
  v_entity_user_id UUID;
  v_entity_name TEXT;
  v_desired_status TEXT;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT *
  INTO v_request
  FROM public.approval_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Approval request not found';
  END IF;
  IF v_request.status <> 'pending_approval' THEN
    RAISE EXCEPTION 'Only pending approval requests can be reviewed';
  END IF;

  v_permission := public.workspace_approval_permission_for_entity(v_request.entity_type);
  IF NOT public.workspace_has_permission(v_actor, v_permission) AND NOT public.workspace_has_permission(v_actor, 'manage_workspace') THEN
    RAISE EXCEPTION 'Not authorized to review this approval request';
  END IF;
  IF v_actor <> v_request.reviewer_user_id
    AND NOT public.workspace_has_permission(v_actor, 'manage_workspace')
    AND NOT public.workspace_has_permission(v_actor, 'view_workspace_dashboard')
  THEN
    RAISE EXCEPTION 'You are not the assigned reviewer for this request';
  END IF;
  IF v_action NOT IN ('approved', 'rejected', 'changes_requested') THEN
    RAISE EXCEPTION 'Invalid approval action: %', p_action;
  END IF;

  UPDATE public.approval_requests
  SET
    status = v_action,
    comments = COALESCE(NULLIF(trim(COALESCE(p_comment, '')), ''), comments),
    resolved_at = now(),
    reviewer_user_id = v_actor
  WHERE id = p_request_id
  RETURNING * INTO v_request;

  INSERT INTO public.approval_actions (
    approval_request_id,
    actor_user_id,
    action_type,
    status_from,
    status_to,
    comment,
    metadata
  )
  VALUES (
    p_request_id,
    v_actor,
    v_action,
    'pending_approval',
    v_action,
    NULLIF(trim(COALESCE(p_comment, '')), ''),
    '{}'::jsonb
  );

  v_desired_status := NULLIF(v_request.metadata ->> 'desired_status', '');

  IF v_request.entity_type = 'campaign' THEN
    SELECT c.user_id, COALESCE(c.name, 'Campaign')
    INTO v_entity_user_id, v_entity_name
    FROM public.campaigns c
    WHERE c.id = v_request.entity_id;

    UPDATE public.campaigns
    SET
      approval_status = v_action,
      approval_request_id = v_request.id,
      approved_at = CASE WHEN v_action = 'approved' THEN now() ELSE approved_at END,
      approved_by_user_id = CASE WHEN v_action = 'approved' THEN v_actor ELSE approved_by_user_id END,
      status = CASE
        WHEN v_action = 'approved' AND v_desired_status IS NOT NULL THEN v_desired_status
        WHEN v_action IN ('rejected', 'changes_requested') THEN 'draft'
        ELSE status
      END
    WHERE id = v_request.entity_id;
  ELSIF v_request.entity_type = 'sender_account' THEN
    SELECT ec.user_id, COALESCE(ec.smtp_username, 'Sender account')
    INTO v_entity_user_id, v_entity_name
    FROM public.email_configs ec
    WHERE ec.id = v_request.entity_id;

    UPDATE public.email_configs
    SET
      approval_status = v_action,
      approval_request_id = v_request.id,
      approved_at = CASE WHEN v_action = 'approved' THEN now() ELSE approved_at END,
      approved_by_user_id = CASE WHEN v_action = 'approved' THEN v_actor ELSE approved_by_user_id END,
      is_active = CASE WHEN v_action = 'approved' THEN true ELSE false END
    WHERE id = v_request.entity_id;
  ELSE
    SELECT aw.user_id, COALESCE(aw.name, 'Automation')
    INTO v_entity_user_id, v_entity_name
    FROM public.automation_workflows aw
    WHERE aw.id = v_request.entity_id;

    UPDATE public.automation_workflows
    SET
      approval_status = v_action,
      approval_request_id = v_request.id,
      approved_at = CASE WHEN v_action = 'approved' THEN now() ELSE approved_at END,
      approved_by_user_id = CASE WHEN v_action = 'approved' THEN v_actor ELSE approved_by_user_id END,
      status = CASE
        WHEN v_action = 'approved' AND COALESCE(v_desired_status, '') = 'live' THEN 'live'
        WHEN v_action IN ('rejected', 'changes_requested') THEN 'draft'
        ELSE status
      END,
      published_at = CASE
        WHEN v_action = 'approved' AND COALESCE(v_desired_status, '') = 'live' THEN COALESCE(published_at, now())
        ELSE published_at
      END
    WHERE id = v_request.entity_id;
  END IF;

  PERFORM public.workspace_write_audit_log(
    v_request.workspace_id,
    v_actor,
    'approval_reviewed',
    v_request.entity_type,
    v_request.entity_id::text,
    NULL,
    to_jsonb(v_request),
    jsonb_build_object('action', v_action)
  );

  PERFORM public.workspace_notification_insert(
    v_entity_user_id,
    'approval_reviewed',
    'Approval updated',
    format('%s was %s.', COALESCE(v_entity_name, 'Your request'), replace(v_action, '_', ' ')),
    'system',
    CASE
      WHEN v_request.entity_type = 'campaign' THEN '/campaigns'
      WHEN v_request.entity_type = 'sender_account' THEN '/dashboard?tab=config'
      ELSE '/automations'
    END,
    jsonb_build_object(
      'approval_request_id', v_request.id,
      'entity_type', v_request.entity_type,
      'entity_id', v_request.entity_id,
      'status', v_action
    )
  );

  RETURN v_request;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_workspace_context()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_membership public.workspace_memberships%ROWTYPE;
  v_workspace public.workspaces%ROWTYPE;
  v_snapshot RECORD;
  v_permissions TEXT[];
BEGIN
  IF v_actor IS NULL THEN
    RETURN NULL;
  END IF;

  PERFORM public.ensure_workspace_membership(v_actor);

  UPDATE public.workspace_memberships
  SET
    status = CASE WHEN status = 'invited' THEN 'active' ELSE status END,
    updated_at = now()
  WHERE user_id = v_actor
    AND status = 'invited';

  SELECT *
  INTO v_membership
  FROM public.workspace_memberships
  WHERE user_id = v_actor;

  SELECT *
  INTO v_workspace
  FROM public.workspaces
  WHERE id = v_membership.workspace_id;

  SELECT *
  INTO v_snapshot
  FROM public.workspace_member_snapshot(v_actor, true)
  LIMIT 1;

  v_permissions := public.workspace_get_permissions(v_actor);

  RETURN jsonb_build_object(
    'workspaceId', v_workspace.id,
    'workspaceName', v_workspace.name,
    'ownerUserId', v_workspace.owner_user_id,
    'approvalDelegateUserId', v_workspace.approval_delegate_user_id,
    'role', v_membership.role,
    'status', v_membership.status,
    'parentUserId', v_membership.parent_user_id,
    'assignedReviewerUserId', v_membership.assigned_reviewer_user_id,
    'canManageBilling', public.workspace_has_permission(v_actor, 'manage_billing'),
    'canManageWorkspace', public.workspace_has_permission(v_actor, 'manage_workspace'),
    'permissions', COALESCE(v_permissions, '{}'::text[]),
    'requiresApproval', jsonb_build_object(
      'campaign', public.workspace_status_requires_approval(v_actor, 'campaign'),
      'sender', public.workspace_status_requires_approval(v_actor, 'sender_account'),
      'automation', public.workspace_status_requires_approval(v_actor, 'automation')
    ),
    'snapshot', jsonb_build_object(
      'creditsCap', v_snapshot.credits_cap,
      'creditsUsed', v_snapshot.credits_used,
      'creditsRemaining', v_snapshot.credits_remaining,
      'campaignCap', v_snapshot.campaign_cap,
      'activeCampaigns', v_snapshot.active_campaigns,
      'senderCap', v_snapshot.sender_cap,
      'activeSenders', v_snapshot.active_senders,
      'dailySendCap', v_snapshot.daily_send_cap,
      'sendsToday', v_snapshot.sends_today,
      'automationCap', v_snapshot.automation_cap,
      'liveAutomations', v_snapshot.live_automations
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_workspace_member_list()
RETURNS TABLE (
  user_id UUID,
  email TEXT,
  full_name TEXT,
  role TEXT,
  status TEXT,
  parent_user_id UUID,
  parent_name TEXT,
  parent_email TEXT,
  assigned_reviewer_user_id UUID,
  credits_allocated INTEGER,
  credits_used INTEGER,
  credits_remaining INTEGER,
  max_active_campaigns INTEGER,
  active_campaigns INTEGER,
  max_sender_accounts INTEGER,
  active_senders INTEGER,
  daily_send_limit INTEGER,
  sends_today INTEGER,
  max_automations INTEGER,
  live_automations INTEGER,
  permissions TEXT[],
  can_manage_billing BOOLEAN,
  can_manage_workspace BOOLEAN,
  require_campaign_approval BOOLEAN,
  require_sender_approval BOOLEAN,
  require_automation_approval BOOLEAN,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_actor_membership public.workspace_memberships%ROWTYPE;
BEGIN
  IF v_actor IS NULL THEN
    RETURN;
  END IF;

  PERFORM public.ensure_workspace_membership(v_actor);

  SELECT *
  INTO v_actor_membership
  FROM public.workspace_memberships actor_membership
  WHERE actor_membership.user_id = v_actor;

  RETURN QUERY
  WITH scope_users AS (
    SELECT scoped.user_id
    FROM public.workspace_scope_user_ids(v_actor) scoped
  ),
  member_snapshots AS (
    SELECT
      wm.*,
      snap.credits_cap,
      snap.credits_used,
      snap.credits_remaining,
      snap.campaign_cap,
      snap.active_campaigns,
      snap.sender_cap,
      snap.active_senders,
      snap.daily_send_cap,
      snap.sends_today,
      snap.automation_cap,
      snap.live_automations
    FROM public.workspace_memberships wm
    JOIN scope_users su ON su.user_id = wm.user_id
    CROSS JOIN LATERAL public.workspace_member_snapshot(wm.user_id, true) snap
    WHERE wm.workspace_id = v_actor_membership.workspace_id
  )
  SELECT
    ms.user_id,
    ms.email,
    ms.full_name,
    ms.role,
    ms.status,
    ms.parent_user_id,
    parent.full_name,
    parent.email,
    ms.assigned_reviewer_user_id,
    ms.credits_cap,
    ms.credits_used,
    ms.credits_remaining,
    ms.campaign_cap,
    ms.active_campaigns,
    ms.sender_cap,
    ms.active_senders,
    ms.daily_send_cap,
    ms.sends_today,
    ms.automation_cap,
    ms.live_automations,
    public.workspace_get_permissions(ms.user_id),
    public.workspace_has_permission(ms.user_id, 'manage_billing'),
    public.workspace_has_permission(ms.user_id, 'manage_workspace'),
    COALESCE(ms.require_campaign_approval, public.workspace_default_requires_approval(ms.role, 'campaign')),
    COALESCE(ms.require_sender_approval, public.workspace_default_requires_approval(ms.role, 'sender_account')),
    COALESCE(ms.require_automation_approval, public.workspace_default_requires_approval(ms.role, 'automation')),
    ms.created_at
  FROM member_snapshots ms
  LEFT JOIN public.workspace_memberships parent ON parent.user_id = ms.parent_user_id
  ORDER BY public.workspace_role_level(ms.role) DESC, ms.created_at ASC;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_workspace_approval_queue(
  p_status TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  entity_type TEXT,
  entity_id UUID,
  entity_name TEXT,
  requested_by_user_id UUID,
  requested_by_name TEXT,
  requested_by_email TEXT,
  reviewer_user_id UUID,
  reviewer_name TEXT,
  reviewer_email TEXT,
  status TEXT,
  reason TEXT,
  comments TEXT,
  desired_status TEXT,
  created_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_actor_membership public.workspace_memberships%ROWTYPE;
BEGIN
  IF v_actor IS NULL THEN
    RETURN;
  END IF;

  PERFORM public.ensure_workspace_membership(v_actor);

  SELECT *
  INTO v_actor_membership
  FROM public.workspace_memberships
  WHERE user_id = v_actor;

  RETURN QUERY
  WITH scope_users AS (
    SELECT user_id
    FROM public.workspace_scope_user_ids(v_actor)
  )
  SELECT
    ar.id,
    ar.entity_type,
    ar.entity_id,
    CASE
      WHEN ar.entity_type = 'campaign' THEN (SELECT c.name FROM public.campaigns c WHERE c.id = ar.entity_id)
      WHEN ar.entity_type = 'sender_account' THEN (SELECT ec.smtp_username FROM public.email_configs ec WHERE ec.id = ar.entity_id)
      ELSE (SELECT aw.name FROM public.automation_workflows aw WHERE aw.id = ar.entity_id)
    END AS entity_name,
    ar.requested_by_user_id,
    requester.full_name,
    requester.email,
    ar.reviewer_user_id,
    reviewer.full_name,
    reviewer.email,
    ar.status,
    ar.reason,
    ar.comments,
    NULLIF(ar.metadata ->> 'desired_status', ''),
    ar.created_at,
    ar.resolved_at
  FROM public.approval_requests ar
  JOIN public.workspace_memberships requester ON requester.user_id = ar.requested_by_user_id
  LEFT JOIN public.workspace_memberships reviewer ON reviewer.user_id = ar.reviewer_user_id
  WHERE ar.workspace_id = v_actor_membership.workspace_id
    AND requester.user_id IN (SELECT user_id FROM scope_users)
    AND (p_status IS NULL OR ar.status = p_status)
  ORDER BY ar.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_approval_request_actions(
  p_request_id UUID
)
RETURNS TABLE (
  id UUID,
  action_type TEXT,
  status_from TEXT,
  status_to TEXT,
  comment TEXT,
  actor_user_id UUID,
  actor_name TEXT,
  actor_email TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_actor_membership public.workspace_memberships%ROWTYPE;
  v_request public.approval_requests%ROWTYPE;
BEGIN
  IF v_actor IS NULL OR p_request_id IS NULL THEN
    RETURN;
  END IF;

  PERFORM public.ensure_workspace_membership(v_actor);

  SELECT *
  INTO v_actor_membership
  FROM public.workspace_memberships
  WHERE user_id = v_actor;

  SELECT *
  INTO v_request
  FROM public.approval_requests
  WHERE id = p_request_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Approval request not found';
  END IF;
  IF v_request.workspace_id <> v_actor_membership.workspace_id THEN
    RAISE EXCEPTION 'Approval request is outside of your workspace';
  END IF;
  IF NOT public.workspace_user_in_scope(v_actor, v_request.requested_by_user_id)
    AND v_request.reviewer_user_id IS DISTINCT FROM v_actor
    AND NOT public.workspace_has_permission(v_actor, 'manage_workspace')
    AND NOT public.workspace_has_permission(v_actor, 'view_workspace_dashboard')
  THEN
    RAISE EXCEPTION 'Approval request is outside of your scope';
  END IF;

  RETURN QUERY
  SELECT
    aa.id,
    aa.action_type,
    aa.status_from,
    aa.status_to,
    aa.comment,
    aa.actor_user_id,
    actor.full_name,
    actor.email,
    aa.metadata,
    aa.created_at
  FROM public.approval_actions aa
  LEFT JOIN public.workspace_memberships actor ON actor.user_id = aa.actor_user_id
  WHERE aa.approval_request_id = p_request_id
  ORDER BY aa.created_at ASC;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_workspace_audit_history(
  p_limit INTEGER DEFAULT 50
)
RETURNS TABLE (
  id UUID,
  action_type TEXT,
  target_type TEXT,
  target_id TEXT,
  actor_user_id UUID,
  actor_name TEXT,
  actor_email TEXT,
  before_json JSONB,
  after_json JSONB,
  metadata JSONB,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_actor_membership public.workspace_memberships%ROWTYPE;
BEGIN
  IF v_actor IS NULL THEN
    RETURN;
  END IF;
  IF NOT public.workspace_has_permission(v_actor, 'view_audit_logs')
    AND NOT public.workspace_has_permission(v_actor, 'manage_workspace')
  THEN
    RAISE EXCEPTION 'Not authorized to view audit logs';
  END IF;

  PERFORM public.ensure_workspace_membership(v_actor);

  SELECT *
  INTO v_actor_membership
  FROM public.workspace_memberships
  WHERE user_id = v_actor;

  RETURN QUERY
  SELECT
    al.id,
    al.action_type,
    al.target_type,
    al.target_id,
    al.actor_user_id,
    actor.full_name,
    actor.email,
    al.before_json,
    al.after_json,
    al.metadata,
    al.created_at
  FROM public.audit_logs al
  LEFT JOIN public.workspace_memberships actor ON actor.user_id = al.actor_user_id
  WHERE al.workspace_id = v_actor_membership.workspace_id
  ORDER BY al.created_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50), 200));
END;
$$;

CREATE OR REPLACE FUNCTION public.get_workspace_spending_rollup(
  p_days INTEGER DEFAULT 30
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_actor_membership public.workspace_memberships%ROWTYPE;
  v_since TIMESTAMPTZ := now() - make_interval(days => GREATEST(1, LEAST(COALESCE(p_days, 30), 365)));
  v_result JSONB;
BEGIN
  IF v_actor IS NULL THEN
    RETURN NULL;
  END IF;

  PERFORM public.ensure_workspace_membership(v_actor);

  SELECT *
  INTO v_actor_membership
  FROM public.workspace_memberships actor_membership
  WHERE actor_membership.user_id = v_actor;

  WITH scope_users AS (
    SELECT scoped.user_id
    FROM public.workspace_scope_user_ids(v_actor) scoped
  ),
  manager_rollup AS (
    SELECT jsonb_agg(
      jsonb_build_object(
        'userId', wm.user_id,
        'name', wm.full_name,
        'email', wm.email,
        'role', wm.role,
        'creditsUsed', (SELECT COALESCE(SUM(credit_delta), 0) FROM public.workspace_usage_events wue WHERE wue.user_id = ANY(ARRAY(SELECT user_id FROM public.workspace_scope_user_ids(wm.user_id))) AND wue.workspace_id = v_actor_membership.workspace_id AND wue.occurred_at >= v_since),
        'sends', (SELECT COALESCE(SUM(send_delta), 0) FROM public.workspace_usage_events wue WHERE wue.user_id = ANY(ARRAY(SELECT user_id FROM public.workspace_scope_user_ids(wm.user_id))) AND wue.workspace_id = v_actor_membership.workspace_id AND wue.occurred_at >= v_since)
      )
      ORDER BY wm.created_at ASC
    ) AS payload
    FROM public.workspace_memberships wm
    WHERE wm.workspace_id = v_actor_membership.workspace_id
      AND wm.role IN ('admin', 'sub_admin')
  ),
  user_rollup AS (
    SELECT jsonb_agg(
      jsonb_build_object(
        'userId', wm.user_id,
        'name', wm.full_name,
        'email', wm.email,
        'role', wm.role,
        'creditsUsed', COALESCE((SELECT SUM(credit_delta) FROM public.workspace_usage_events wue WHERE wue.workspace_id = v_actor_membership.workspace_id AND wue.user_id = wm.user_id AND wue.occurred_at >= v_since), 0),
        'sends', COALESCE((SELECT SUM(send_delta) FROM public.workspace_usage_events wue WHERE wue.workspace_id = v_actor_membership.workspace_id AND wue.user_id = wm.user_id AND wue.occurred_at >= v_since), 0)
      )
      ORDER BY wm.created_at ASC
    ) AS payload
    FROM public.workspace_memberships wm
    WHERE wm.workspace_id = v_actor_membership.workspace_id
      AND wm.user_id IN (SELECT user_id FROM scope_users)
  ),
  usage_total AS (
    SELECT
      COALESCE(SUM(credit_delta), 0) AS credits_used,
      COALESCE(SUM(send_delta), 0) AS sends
    FROM public.workspace_usage_events
    WHERE workspace_id = v_actor_membership.workspace_id
      AND user_id IN (SELECT user_id FROM scope_users)
      AND occurred_at >= v_since
  )
  SELECT jsonb_build_object(
    'since', v_since,
    'workspace', jsonb_build_object(
      'creditsUsed', usage_total.credits_used,
      'sends', usage_total.sends
    ),
    'byManager', COALESCE(manager_rollup.payload, '[]'::jsonb),
    'byUser', COALESCE(user_rollup.payload, '[]'::jsonb)
  )
  INTO v_result
  FROM usage_total, manager_rollup, user_rollup;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_workspace_dashboard(
  p_days INTEGER DEFAULT 30,
  p_user_filter UUID DEFAULT NULL,
  p_campaign_status TEXT DEFAULT NULL,
  p_approval_status TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_actor_membership public.workspace_memberships%ROWTYPE;
  v_since TIMESTAMPTZ := now() - make_interval(days => GREATEST(1, LEAST(COALESCE(p_days, 30), 365)));
  v_result JSONB;
BEGIN
  IF v_actor IS NULL THEN
    RETURN NULL;
  END IF;

  PERFORM public.ensure_workspace_membership(v_actor);

  SELECT *
  INTO v_actor_membership
  FROM public.workspace_memberships actor_membership
  WHERE actor_membership.user_id = v_actor;

  WITH scope_users AS (
    SELECT scoped.user_id
    FROM public.workspace_scope_user_ids(v_actor) scoped
  ),
  filtered_users AS (
    SELECT scope_users.user_id
    FROM scope_users
    WHERE p_user_filter IS NULL OR scope_users.user_id = p_user_filter
  ),
  campaign_rollup AS (
    SELECT
      COUNT(*) FILTER (WHERE COALESCE(c.status, 'draft') = 'draft')::INTEGER AS draft_count,
      COUNT(*) FILTER (WHERE COALESCE(c.status, 'draft') IN ('ready', 'sending', 'paused', 'scheduled'))::INTEGER AS active_count,
      COUNT(*) FILTER (WHERE COALESCE(c.status, 'draft') IN ('sent', 'completed'))::INTEGER AS completed_count
    FROM public.campaigns c
    WHERE c.user_id IN (SELECT user_id FROM filtered_users)
      AND (p_campaign_status IS NULL OR c.status = p_campaign_status)
  ),
  metric_rollup AS (
    SELECT
      COALESCE(SUM(c.sent_count), 0)::INTEGER AS sends,
      COALESCE(SUM(c.opened_count), 0)::INTEGER AS opens,
      COALESCE(SUM(c.replied_count), 0)::INTEGER AS replies,
      COALESCE(SUM(c.bounced_count), 0)::INTEGER AS bounces
    FROM public.campaigns c
    WHERE c.user_id IN (SELECT user_id FROM filtered_users)
  ),
  approval_rollup AS (
    SELECT
      COUNT(*) FILTER (WHERE ar.status = 'pending_approval')::INTEGER AS pending_count,
      COUNT(*) FILTER (WHERE ar.status = 'changes_requested')::INTEGER AS changes_requested_count
    FROM public.approval_requests ar
    WHERE ar.workspace_id = v_actor_membership.workspace_id
      AND ar.requested_by_user_id IN (SELECT user_id FROM filtered_users)
      AND (p_approval_status IS NULL OR ar.status = p_approval_status)
  ),
  sender_rollup AS (
    SELECT COUNT(*)::INTEGER AS sender_count
    FROM public.email_configs ec
    WHERE ec.user_id IN (SELECT user_id FROM filtered_users)
      AND COALESCE(ec.is_active, true) = true
  ),
  member_list AS (
    SELECT jsonb_agg(
      jsonb_build_object(
        'userId', member.user_id,
        'email', member.email,
        'fullName', member.full_name,
        'role', member.role,
        'status', member.status,
        'creditsAllocated', member.credits_allocated,
        'creditsUsed', member.credits_used,
        'creditsRemaining', member.credits_remaining,
        'campaignLimit', member.max_active_campaigns,
        'activeCampaigns', member.active_campaigns,
        'senderLimit', member.max_sender_accounts,
        'activeSenders', member.active_senders,
        'dailySendLimit', member.daily_send_limit,
        'sendsToday', member.sends_today
      )
      ORDER BY member.created_at ASC
    ) AS payload
    FROM public.get_workspace_member_list() member
    WHERE member.user_id IN (SELECT user_id FROM filtered_users)
  ),
  recent_activity AS (
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', al.id,
        'actionType', al.action_type,
        'targetType', al.target_type,
        'targetId', al.target_id,
        'actorName', actor.full_name,
        'actorEmail', actor.email,
        'createdAt', al.created_at
      )
      ORDER BY al.created_at DESC
    ) AS payload
    FROM (
      SELECT *
      FROM public.audit_logs
      WHERE workspace_id = v_actor_membership.workspace_id
      ORDER BY created_at DESC
      LIMIT 20
    ) al
    LEFT JOIN public.workspace_memberships actor ON actor.user_id = al.actor_user_id
  ),
  approval_queue AS (
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', q.id,
        'entityType', q.entity_type,
        'entityId', q.entity_id,
        'entityName', q.entity_name,
        'requestedByName', q.requested_by_name,
        'requestedByEmail', q.requested_by_email,
        'reviewerName', q.reviewer_name,
        'reviewerEmail', q.reviewer_email,
        'status', q.status,
        'createdAt', q.created_at
      )
      ORDER BY q.created_at DESC
    ) AS payload
    FROM (
      SELECT *
      FROM public.get_workspace_approval_queue(p_approval_status)
      LIMIT 20
    ) q
  ),
  usage_snapshot AS (
    SELECT *
    FROM public.workspace_member_snapshot(v_actor, true)
    LIMIT 1
  )
  SELECT jsonb_build_object(
    'scope', jsonb_build_object(
      'workspaceId', v_actor_membership.workspace_id,
      'days', p_days,
      'since', v_since
    ),
    'summary', jsonb_build_object(
      'creditsCap', usage_snapshot.credits_cap,
      'creditsUsed', usage_snapshot.credits_used,
      'creditsRemaining', usage_snapshot.credits_remaining,
      'campaignsDraft', campaign_rollup.draft_count,
      'campaignsActive', campaign_rollup.active_count,
      'campaignsCompleted', campaign_rollup.completed_count,
      'senderAccounts', sender_rollup.sender_count,
      'sendingVolume', metric_rollup.sends,
      'openRate', CASE WHEN metric_rollup.sends > 0 THEN ROUND((metric_rollup.opens::numeric / metric_rollup.sends::numeric) * 100, 2) ELSE 0 END,
      'replyRate', CASE WHEN metric_rollup.sends > 0 THEN ROUND((metric_rollup.replies::numeric / metric_rollup.sends::numeric) * 100, 2) ELSE 0 END,
      'bounceRate', CASE WHEN metric_rollup.sends > 0 THEN ROUND((metric_rollup.bounces::numeric / metric_rollup.sends::numeric) * 100, 2) ELSE 0 END,
      'approvalPending', approval_rollup.pending_count,
      'approvalChangesRequested', approval_rollup.changes_requested_count
    ),
    'members', COALESCE(member_list.payload, '[]'::jsonb),
    'approvalQueue', COALESCE(approval_queue.payload, '[]'::jsonb),
    'recentActivity', COALESCE(recent_activity.payload, '[]'::jsonb)
  )
  INTO v_result
  FROM usage_snapshot, campaign_rollup, metric_rollup, approval_rollup, sender_rollup, member_list, recent_activity, approval_queue;

  RETURN v_result;
END;
$$;

DROP TRIGGER IF EXISTS enforce_campaign_limit_on_campaigns ON public.campaigns;
DROP TRIGGER IF EXISTS enforce_mailbox_limit_on_email_configs ON public.email_configs;

CREATE OR REPLACE FUNCTION public.enforce_workspace_campaign_rules()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_snapshot RECORD;
  v_requires_approval BOOLEAN;
  v_active_count INTEGER;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT public.workspace_has_permission(NEW.user_id, 'create_campaign') THEN
      RAISE EXCEPTION 'You do not have permission to create campaigns'
        USING ERRCODE = 'P0001';
    END IF;

    v_requires_approval := public.workspace_status_requires_approval(NEW.user_id, 'campaign');
    IF COALESCE(NEW.approval_status, '') = '' THEN
      NEW.approval_status := CASE WHEN v_requires_approval THEN 'draft' ELSE 'approved' END;
    END IF;

    IF NEW.approval_status = 'approved' AND NEW.approved_at IS NULL THEN
      NEW.approved_at := now();
      NEW.approved_by_user_id := NEW.user_id;
    END IF;
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    SELECT *
    INTO v_snapshot
    FROM public.workspace_member_snapshot(NEW.user_id, true)
    LIMIT 1;

    IF COALESCE(NEW.status, 'draft') IN ('ready', 'sending', 'paused', 'scheduled') THEN
      IF NOT public.workspace_has_permission(NEW.user_id, 'launch_campaign') THEN
        RAISE EXCEPTION 'You do not have permission to launch campaigns'
          USING ERRCODE = 'P0001';
      END IF;

      IF COALESCE(NEW.approval_status, 'draft') <> 'approved' THEN
        RAISE EXCEPTION 'Campaign launch is blocked until approval is granted'
          USING ERRCODE = 'P0001';
      END IF;

      SELECT COUNT(*)::INTEGER
      INTO v_active_count
      FROM public.campaigns c
      WHERE c.user_id = NEW.user_id
        AND COALESCE(c.status, 'draft') IN ('ready', 'sending', 'paused', 'scheduled')
        AND c.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);

      IF v_snapshot.campaign_cap IS NOT NULL AND v_active_count + 1 > v_snapshot.campaign_cap THEN
        RAISE EXCEPTION 'Active campaign limit reached for your workspace allocation (% campaigns).', v_snapshot.campaign_cap
          USING ERRCODE = 'P0001';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_workspace_campaign_rules
BEFORE INSERT OR UPDATE ON public.campaigns
FOR EACH ROW
EXECUTE FUNCTION public.enforce_workspace_campaign_rules();

CREATE OR REPLACE FUNCTION public.enforce_workspace_email_config_rules()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_snapshot RECORD;
  v_requires_approval BOOLEAN;
  v_sender_count INTEGER;
BEGIN
  IF NOT public.workspace_has_permission(NEW.user_id, 'manage_sender_accounts') THEN
    RAISE EXCEPTION 'You do not have permission to manage sender accounts'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT *
  INTO v_snapshot
  FROM public.workspace_member_snapshot(NEW.user_id, true)
  LIMIT 1;

  v_requires_approval := public.workspace_status_requires_approval(NEW.user_id, 'sender_account');

  IF COALESCE(NEW.approval_status, '') = '' THEN
    NEW.approval_status := CASE WHEN v_requires_approval THEN 'draft' ELSE 'approved' END;
  END IF;

  IF v_requires_approval AND COALESCE(NEW.approval_status, 'draft') <> 'approved' THEN
    NEW.is_active := false;
  END IF;

  IF COALESCE(NEW.is_active, false) = true THEN
    IF COALESCE(NEW.approval_status, 'draft') <> 'approved' THEN
      RAISE EXCEPTION 'Sender activation is blocked until approval is granted'
        USING ERRCODE = 'P0001';
    END IF;

    SELECT COUNT(*)::INTEGER
    INTO v_sender_count
    FROM public.email_configs ec
    WHERE ec.user_id = NEW.user_id
      AND COALESCE(ec.is_active, true) = true
      AND ec.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);

    IF v_snapshot.sender_cap IS NOT NULL AND v_sender_count + 1 > v_snapshot.sender_cap THEN
      RAISE EXCEPTION 'Sender account limit reached for your workspace allocation (% sender accounts).', v_snapshot.sender_cap
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_workspace_email_config_rules
BEFORE INSERT OR UPDATE ON public.email_configs
FOR EACH ROW
EXECUTE FUNCTION public.enforce_workspace_email_config_rules();

CREATE OR REPLACE FUNCTION public.enforce_workspace_automation_rules()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_snapshot RECORD;
  v_requires_approval BOOLEAN;
  v_live_count INTEGER;
BEGIN
  IF NOT public.workspace_has_permission(NEW.user_id, 'manage_automations') THEN
    RAISE EXCEPTION 'You do not have permission to manage automations'
      USING ERRCODE = 'P0001';
  END IF;

  v_requires_approval := public.workspace_status_requires_approval(NEW.user_id, 'automation');

  IF COALESCE(NEW.approval_status, '') = '' THEN
    NEW.approval_status := CASE WHEN v_requires_approval THEN 'draft' ELSE 'approved' END;
  END IF;

  IF COALESCE(NEW.status, 'draft') = 'live' THEN
    IF COALESCE(NEW.approval_status, 'draft') <> 'approved' THEN
      RAISE EXCEPTION 'Automation activation is blocked until approval is granted'
        USING ERRCODE = 'P0001';
    END IF;

    SELECT *
    INTO v_snapshot
    FROM public.workspace_member_snapshot(NEW.user_id, true)
    LIMIT 1;

    SELECT COUNT(*)::INTEGER
    INTO v_live_count
    FROM public.automation_workflows aw
    WHERE aw.user_id = NEW.user_id
      AND aw.status = 'live'
      AND aw.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);

    IF v_snapshot.automation_cap IS NOT NULL AND v_live_count + 1 > v_snapshot.automation_cap THEN
      RAISE EXCEPTION 'Automation limit reached for your workspace allocation (% live automations).', v_snapshot.automation_cap
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_workspace_automation_rules ON public.automation_workflows;
CREATE TRIGGER enforce_workspace_automation_rules
BEFORE INSERT OR UPDATE ON public.automation_workflows
FOR EACH ROW
EXECUTE FUNCTION public.enforce_workspace_automation_rules();

DROP POLICY IF EXISTS "campaigns owner access" ON public.campaigns;
DROP POLICY IF EXISTS "campaigns read own" ON public.campaigns;
DROP POLICY IF EXISTS "campaigns insert permitted" ON public.campaigns;
DROP POLICY IF EXISTS "campaigns update permitted" ON public.campaigns;
DROP POLICY IF EXISTS "campaigns delete permitted" ON public.campaigns;
CREATE POLICY "campaigns read own" ON public.campaigns FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "campaigns insert permitted" ON public.campaigns FOR INSERT WITH CHECK (auth.uid() = user_id AND public.workspace_has_permission(auth.uid(), 'create_campaign'));
CREATE POLICY "campaigns update permitted" ON public.campaigns FOR UPDATE USING (auth.uid() = user_id AND public.workspace_has_permission(auth.uid(), 'create_campaign')) WITH CHECK (auth.uid() = user_id AND public.workspace_has_permission(auth.uid(), 'create_campaign'));
CREATE POLICY "campaigns delete permitted" ON public.campaigns FOR DELETE USING (auth.uid() = user_id AND public.workspace_has_permission(auth.uid(), 'create_campaign'));

DROP POLICY IF EXISTS "email configs owner access" ON public.email_configs;
DROP POLICY IF EXISTS "email configs read own" ON public.email_configs;
DROP POLICY IF EXISTS "email configs insert permitted" ON public.email_configs;
DROP POLICY IF EXISTS "email configs update permitted" ON public.email_configs;
DROP POLICY IF EXISTS "email configs delete permitted" ON public.email_configs;
CREATE POLICY "email configs read own" ON public.email_configs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "email configs insert permitted" ON public.email_configs FOR INSERT WITH CHECK (auth.uid() = user_id AND public.workspace_has_permission(auth.uid(), 'manage_sender_accounts'));
CREATE POLICY "email configs update permitted" ON public.email_configs FOR UPDATE USING (auth.uid() = user_id AND public.workspace_has_permission(auth.uid(), 'manage_sender_accounts')) WITH CHECK (auth.uid() = user_id AND public.workspace_has_permission(auth.uid(), 'manage_sender_accounts'));
CREATE POLICY "email configs delete permitted" ON public.email_configs FOR DELETE USING (auth.uid() = user_id AND public.workspace_has_permission(auth.uid(), 'manage_sender_accounts'));

DROP POLICY IF EXISTS "email templates owner access" ON public.email_templates;
DROP POLICY IF EXISTS "email templates read own" ON public.email_templates;
DROP POLICY IF EXISTS "email templates insert permitted" ON public.email_templates;
DROP POLICY IF EXISTS "email templates update permitted" ON public.email_templates;
DROP POLICY IF EXISTS "email templates delete permitted" ON public.email_templates;
CREATE POLICY "email templates read own" ON public.email_templates FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "email templates insert permitted" ON public.email_templates FOR INSERT WITH CHECK (auth.uid() = user_id AND public.workspace_has_permission(auth.uid(), 'manage_templates'));
CREATE POLICY "email templates update permitted" ON public.email_templates FOR UPDATE USING (auth.uid() = user_id AND public.workspace_has_permission(auth.uid(), 'manage_templates')) WITH CHECK (auth.uid() = user_id AND public.workspace_has_permission(auth.uid(), 'manage_templates'));
CREATE POLICY "email templates delete permitted" ON public.email_templates FOR DELETE USING (auth.uid() = user_id AND public.workspace_has_permission(auth.uid(), 'manage_templates'));

DROP POLICY IF EXISTS "Users can view own email lists" ON public.email_lists;
DROP POLICY IF EXISTS "Users can insert own email lists" ON public.email_lists;
DROP POLICY IF EXISTS "Users can update own email lists" ON public.email_lists;
DROP POLICY IF EXISTS "Users can delete own email lists" ON public.email_lists;
CREATE POLICY "Users can view own email lists" ON public.email_lists FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own email lists" ON public.email_lists FOR INSERT WITH CHECK (auth.uid() = user_id AND public.workspace_has_permission(auth.uid(), 'manage_contacts'));
CREATE POLICY "Users can update own email lists" ON public.email_lists FOR UPDATE USING (auth.uid() = user_id AND public.workspace_has_permission(auth.uid(), 'manage_contacts')) WITH CHECK (auth.uid() = user_id AND public.workspace_has_permission(auth.uid(), 'manage_contacts'));
CREATE POLICY "Users can delete own email lists" ON public.email_lists FOR DELETE USING (auth.uid() = user_id AND public.workspace_has_permission(auth.uid(), 'manage_contacts'));

DROP POLICY IF EXISTS "prospects owner access" ON public.prospects;
DROP POLICY IF EXISTS "prospects read own" ON public.prospects;
DROP POLICY IF EXISTS "prospects insert permitted" ON public.prospects;
DROP POLICY IF EXISTS "prospects update permitted" ON public.prospects;
DROP POLICY IF EXISTS "prospects delete permitted" ON public.prospects;
CREATE POLICY "prospects read own" ON public.prospects FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "prospects insert permitted" ON public.prospects FOR INSERT WITH CHECK (auth.uid() = user_id AND public.workspace_has_permission(auth.uid(), 'manage_contacts'));
CREATE POLICY "prospects update permitted" ON public.prospects FOR UPDATE USING (auth.uid() = user_id AND public.workspace_has_permission(auth.uid(), 'manage_contacts')) WITH CHECK (auth.uid() = user_id AND public.workspace_has_permission(auth.uid(), 'manage_contacts'));
CREATE POLICY "prospects delete permitted" ON public.prospects FOR DELETE USING (auth.uid() = user_id AND public.workspace_has_permission(auth.uid(), 'manage_contacts'));

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'contact_segments') THEN
    EXECUTE 'DROP POLICY IF EXISTS "Users can view own contact segments" ON public.contact_segments';
    EXECUTE 'DROP POLICY IF EXISTS "Users can insert own contact segments" ON public.contact_segments';
    EXECUTE 'DROP POLICY IF EXISTS "Users can update own contact segments" ON public.contact_segments';
    EXECUTE 'DROP POLICY IF EXISTS "Users can delete own contact segments" ON public.contact_segments';
    EXECUTE 'CREATE POLICY "Users can view own contact segments" ON public.contact_segments FOR SELECT USING (auth.uid() = user_id)';
    EXECUTE 'CREATE POLICY "Users can insert own contact segments" ON public.contact_segments FOR INSERT WITH CHECK (auth.uid() = user_id AND public.workspace_has_permission(auth.uid(), ''manage_contacts''))';
    EXECUTE 'CREATE POLICY "Users can update own contact segments" ON public.contact_segments FOR UPDATE USING (auth.uid() = user_id AND public.workspace_has_permission(auth.uid(), ''manage_contacts'')) WITH CHECK (auth.uid() = user_id AND public.workspace_has_permission(auth.uid(), ''manage_contacts''))';
    EXECUTE 'CREATE POLICY "Users can delete own contact segments" ON public.contact_segments FOR DELETE USING (auth.uid() = user_id AND public.workspace_has_permission(auth.uid(), ''manage_contacts''))';
  END IF;
END;
$$;

DROP POLICY IF EXISTS "Users can view own automation workflows" ON public.automation_workflows;
DROP POLICY IF EXISTS "Users can insert own automation workflows" ON public.automation_workflows;
DROP POLICY IF EXISTS "Users can update own automation workflows" ON public.automation_workflows;
DROP POLICY IF EXISTS "Users can delete own automation workflows" ON public.automation_workflows;
CREATE POLICY "Users can view own automation workflows" ON public.automation_workflows FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users can insert own automation workflows" ON public.automation_workflows FOR INSERT WITH CHECK (user_id = auth.uid() AND public.workspace_has_permission(auth.uid(), 'manage_automations'));
CREATE POLICY "Users can update own automation workflows" ON public.automation_workflows FOR UPDATE USING (user_id = auth.uid() AND public.workspace_has_permission(auth.uid(), 'manage_automations')) WITH CHECK (user_id = auth.uid() AND public.workspace_has_permission(auth.uid(), 'manage_automations'));
CREATE POLICY "Users can delete own automation workflows" ON public.automation_workflows FOR DELETE USING (user_id = auth.uid() AND public.workspace_has_permission(auth.uid(), 'manage_automations'));

DO $$
DECLARE
  owner_row RECORD;
BEGIN
  FOR owner_row IN
    SELECT wm.user_id, wm.workspace_id, cw.credits_used
    FROM public.workspace_memberships wm
    JOIN public.workspaces w ON w.id = wm.workspace_id
    JOIN public.credit_wallets cw ON cw.user_id = w.owner_user_id
    WHERE wm.role = 'owner'
      AND COALESCE(cw.credits_used, 0) > 0
      AND NOT EXISTS (
        SELECT 1
        FROM public.workspace_usage_events wue
        WHERE wue.workspace_id = wm.workspace_id
          AND wue.user_id = wm.user_id
      )
  LOOP
    INSERT INTO public.workspace_usage_events (
      workspace_id,
      user_id,
      event_type,
      entity_type,
      credit_delta,
      metadata,
      occurred_at
    )
    VALUES (
      owner_row.workspace_id,
      owner_row.user_id,
      'billing_usage_backfill',
      'workspace',
      owner_row.credits_used,
      jsonb_build_object('source', 'migration_backfill'),
      now()
    );
  END LOOP;
END;
$$;

GRANT SELECT ON TABLE public.workspaces TO authenticated, service_role;
GRANT SELECT ON TABLE public.workspace_memberships TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ensure_workspace_membership(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.workspace_get_permissions(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.workspace_has_permission(UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.workspace_scope_user_ids(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.workspace_user_in_scope(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.workspace_member_snapshot(UUID, BOOLEAN) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.workspace_status_requires_approval(UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_billing_snapshot(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_user_mailbox_limit(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_user_campaign_limit(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_user_daily_send_limit(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.consume_user_credits(INTEGER, TEXT, TEXT, JSONB, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.refund_user_credits(INTEGER, TEXT, TEXT, JSONB, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.consume_user_send_quota(INTEGER, TEXT, TEXT, JSONB, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.refund_user_send_quota(INTEGER, TEXT, TEXT, JSONB, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_workspace_context() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_workspace_member_list() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_workspace_member_allocation(UUID, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER, JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_workspace_member(UUID, TEXT, UUID, TEXT, UUID, BOOLEAN, BOOLEAN, TEXT[], TEXT[], BOOLEAN, BOOLEAN, BOOLEAN, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.submit_approval_request(TEXT, UUID, TEXT, TEXT, UUID, JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.review_approval_request(UUID, TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_workspace_approval_queue(TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_approval_request_actions(UUID) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
GRANT EXECUTE ON FUNCTION public.get_workspace_dashboard(INTEGER, UUID, TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_workspace_spending_rollup(INTEGER) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_workspace_audit_history(INTEGER) TO authenticated, service_role;

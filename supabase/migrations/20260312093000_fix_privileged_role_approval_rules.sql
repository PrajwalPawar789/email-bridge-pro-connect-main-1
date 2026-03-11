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

  IF lower(COALESCE(v_membership.role, 'user')) IN ('owner', 'admin', 'reviewer') THEN
    RETURN false;
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

UPDATE public.workspace_memberships
SET
  require_campaign_approval = NULL,
  require_sender_approval = NULL,
  require_automation_approval = NULL,
  updated_at = now()
WHERE role IN ('owner', 'admin', 'reviewer')
  AND (
    require_campaign_approval IS NOT NULL
    OR require_sender_approval IS NOT NULL
    OR require_automation_approval IS NOT NULL
  );

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

  IF v_actor_membership.role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Only workspace owners and admins can update team members';
  END IF;

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

  IF v_actor_membership.role = 'admin' THEN
    IF v_target.role <> 'user' THEN
      RAISE EXCEPTION 'Admins can only manage users in their assigned scope';
    END IF;
    IF v_target.parent_user_id IS DISTINCT FROM v_actor THEN
      RAISE EXCEPTION 'Admins can only update users assigned directly to them';
    END IF;
    IF v_effective_role <> 'user' THEN
      RAISE EXCEPTION 'Admins cannot promote users to admin-level roles';
    END IF;
    IF p_parent_user_id IS NOT NULL AND p_parent_user_id <> v_actor THEN
      RAISE EXCEPTION 'Admins can only keep users assigned to themselves';
    END IF;
    IF p_can_manage_workspace = true OR p_can_manage_billing = true THEN
      RAISE EXCEPTION 'Admins cannot grant workspace or billing management';
    END IF;
  END IF;

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
    require_campaign_approval = CASE
      WHEN v_effective_role IN ('owner', 'admin', 'reviewer') THEN NULL
      ELSE COALESCE(p_require_campaign_approval, require_campaign_approval)
    END,
    require_sender_approval = CASE
      WHEN v_effective_role IN ('owner', 'admin', 'reviewer') THEN NULL
      ELSE COALESCE(p_require_sender_approval, require_sender_approval)
    END,
    require_automation_approval = CASE
      WHEN v_effective_role IN ('owner', 'admin', 'reviewer') THEN NULL
      ELSE COALESCE(p_require_automation_approval, require_automation_approval)
    END,
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
  END IF;

  v_requires_approval := public.workspace_status_requires_approval(NEW.user_id, 'campaign');
  IF COALESCE(NEW.approval_status, '') = '' THEN
    NEW.approval_status := CASE WHEN v_requires_approval THEN 'draft' ELSE 'approved' END;
  ELSIF NOT v_requires_approval AND COALESCE(NEW.approval_status, 'draft') <> 'approved' THEN
    NEW.approval_status := 'approved';
  END IF;

  IF COALESCE(NEW.approval_status, 'draft') = 'approved' AND NEW.approved_at IS NULL THEN
    NEW.approved_at := now();
    NEW.approved_by_user_id := COALESCE(NEW.approved_by_user_id, NEW.user_id);
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
  ELSIF NOT v_requires_approval AND COALESCE(NEW.approval_status, 'draft') <> 'approved' THEN
    NEW.approval_status := 'approved';
  END IF;

  IF NOT v_requires_approval AND NEW.approved_at IS NULL THEN
    NEW.approved_at := now();
    NEW.approved_by_user_id := COALESCE(NEW.approved_by_user_id, NEW.user_id);
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
  ELSIF NOT v_requires_approval AND COALESCE(NEW.approval_status, 'draft') <> 'approved' THEN
    NEW.approval_status := 'approved';
  END IF;

  IF NOT v_requires_approval AND NEW.approved_at IS NULL THEN
    NEW.approved_at := now();
    NEW.approved_by_user_id := COALESCE(NEW.approved_by_user_id, NEW.user_id);
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

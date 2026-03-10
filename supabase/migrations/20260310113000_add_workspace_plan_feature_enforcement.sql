CREATE OR REPLACE FUNCTION public.workspace_effective_plan_id(p_user_id UUID DEFAULT auth.uid())
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_workspace_id UUID;
  v_owner_user_id UUID;
  v_plan_id TEXT;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN 'free';
  END IF;

  SELECT wm.workspace_id
  INTO v_workspace_id
  FROM public.workspace_memberships wm
  WHERE wm.user_id = p_user_id;

  IF v_workspace_id IS NOT NULL THEN
    SELECT w.owner_user_id
    INTO v_owner_user_id
    FROM public.workspaces w
    WHERE w.id = v_workspace_id;
  END IF;

  SELECT us.plan_id
  INTO v_plan_id
  FROM public.user_subscriptions us
  WHERE us.user_id = COALESCE(v_owner_user_id, p_user_id)
  ORDER BY us.updated_at DESC NULLS LAST, us.created_at DESC
  LIMIT 1;

  RETURN COALESCE(v_plan_id, 'free');
END;
$$;

CREATE OR REPLACE FUNCTION public.workspace_plan_rank(p_plan_id TEXT)
RETURNS INTEGER
LANGUAGE SQL
IMMUTABLE
AS $$
  SELECT CASE lower(COALESCE(p_plan_id, 'free'))
    WHEN 'enterprise' THEN 3
    WHEN 'scale' THEN 2
    WHEN 'growth' THEN 1
    ELSE 0
  END;
$$;

CREATE OR REPLACE FUNCTION public.workspace_plan_supports_feature(
  p_user_id UUID DEFAULT auth.uid(),
  p_feature TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_rank INTEGER := public.workspace_plan_rank(public.workspace_effective_plan_id(p_user_id));
  v_feature TEXT := lower(COALESCE(p_feature, ''));
BEGIN
  CASE v_feature
    WHEN 'team_roles' THEN
      RETURN v_rank >= 1;
    WHEN 'team_approvals' THEN
      RETURN v_rank >= 2;
    WHEN 'audit_logs' THEN
      RETURN v_rank >= 2;
    WHEN 'api_webhooks' THEN
      RETURN v_rank >= 1;
    ELSE
      RETURN false;
  END CASE;
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
  IF NOT public.workspace_plan_supports_feature(p_user_id, 'team_approvals') THEN
    RETURN false;
  END IF;

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
  IF NOT public.workspace_plan_supports_feature(v_actor, 'team_roles') THEN
    RAISE EXCEPTION 'Team allocations require the Growth plan or higher';
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
  IF NOT public.workspace_plan_supports_feature(v_actor, 'team_roles') THEN
    RAISE EXCEPTION 'Team management requires the Growth plan or higher';
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
  IF NOT public.workspace_plan_supports_feature(v_actor, 'team_approvals') THEN
    IF (v_effective_role = 'reviewer' AND v_target.role <> 'reviewer')
      OR p_assigned_reviewer_user_id IS NOT NULL
      OR COALESCE(p_require_campaign_approval, false)
      OR COALESCE(p_require_sender_approval, false)
      OR COALESCE(p_require_automation_approval, false)
    THEN
      RAISE EXCEPTION 'Approval policies and reviewer roles require the Scale plan or higher';
    END IF;
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
  IF NOT public.workspace_plan_supports_feature(v_actor, 'team_approvals') THEN
    RAISE EXCEPTION 'Approval workflows require the Scale plan or higher';
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
  IF NOT public.workspace_plan_supports_feature(v_actor, 'team_approvals') THEN
    RAISE EXCEPTION 'Approval workflows require the Scale plan or higher';
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
  IF NOT public.workspace_plan_supports_feature(v_actor, 'team_roles') THEN
    RAISE EXCEPTION 'Team member management requires the Growth plan or higher';
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
  IF NOT public.workspace_plan_supports_feature(v_actor, 'team_roles') THEN
    RAISE EXCEPTION 'Team spending rollups require the Growth plan or higher';
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
        'creditsUsed', (
          SELECT COALESCE(SUM(credit_delta), 0)
          FROM public.workspace_usage_events wue
          WHERE wue.user_id = ANY(ARRAY(SELECT scoped.user_id FROM public.workspace_scope_user_ids(wm.user_id) scoped))
            AND wue.workspace_id = v_actor_membership.workspace_id
            AND wue.occurred_at >= v_since
        ),
        'sends', (
          SELECT COALESCE(SUM(send_delta), 0)
          FROM public.workspace_usage_events wue
          WHERE wue.user_id = ANY(ARRAY(SELECT scoped.user_id FROM public.workspace_scope_user_ids(wm.user_id) scoped))
            AND wue.workspace_id = v_actor_membership.workspace_id
            AND wue.occurred_at >= v_since
        )
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
        'creditsUsed', COALESCE((
          SELECT SUM(credit_delta)
          FROM public.workspace_usage_events wue
          WHERE wue.workspace_id = v_actor_membership.workspace_id
            AND wue.user_id = wm.user_id
            AND wue.occurred_at >= v_since
        ), 0),
        'sends', COALESCE((
          SELECT SUM(send_delta)
          FROM public.workspace_usage_events wue
          WHERE wue.workspace_id = v_actor_membership.workspace_id
            AND wue.user_id = wm.user_id
            AND wue.occurred_at >= v_since
        ), 0)
      )
      ORDER BY wm.created_at ASC
    ) AS payload
    FROM public.workspace_memberships wm
    WHERE wm.workspace_id = v_actor_membership.workspace_id
      AND wm.user_id IN (SELECT scope_users.user_id FROM scope_users)
  ),
  usage_total AS (
    SELECT
      COALESCE(SUM(credit_delta), 0) AS credits_used,
      COALESCE(SUM(send_delta), 0) AS sends
    FROM public.workspace_usage_events
    WHERE workspace_id = v_actor_membership.workspace_id
      AND user_id IN (SELECT scope_users.user_id FROM scope_users)
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
  v_team_approvals_enabled BOOLEAN;
BEGIN
  IF v_actor IS NULL THEN
    RETURN NULL;
  END IF;
  IF NOT public.workspace_plan_supports_feature(v_actor, 'team_roles') THEN
    RAISE EXCEPTION 'Workspace dashboards require the Growth plan or higher';
  END IF;

  PERFORM public.ensure_workspace_membership(v_actor);

  SELECT *
  INTO v_actor_membership
  FROM public.workspace_memberships actor_membership
  WHERE actor_membership.user_id = v_actor;

  v_team_approvals_enabled := public.workspace_plan_supports_feature(v_actor, 'team_approvals');

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
    WHERE c.user_id IN (SELECT filtered_users.user_id FROM filtered_users)
      AND (p_campaign_status IS NULL OR c.status = p_campaign_status)
  ),
  metric_rollup AS (
    SELECT
      COALESCE(SUM(c.sent_count), 0)::INTEGER AS sends,
      COALESCE(SUM(c.opened_count), 0)::INTEGER AS opens,
      COALESCE(SUM(c.replied_count), 0)::INTEGER AS replies,
      COALESCE(SUM(c.bounced_count), 0)::INTEGER AS bounces
    FROM public.campaigns c
    WHERE c.user_id IN (SELECT filtered_users.user_id FROM filtered_users)
  ),
  approval_rollup AS (
    SELECT
      COUNT(*) FILTER (
        WHERE v_team_approvals_enabled
          AND ar.status = 'pending_approval'
          AND (p_approval_status IS NULL OR ar.status = p_approval_status)
      )::INTEGER AS pending_count,
      COUNT(*) FILTER (
        WHERE v_team_approvals_enabled
          AND ar.status = 'changes_requested'
          AND (p_approval_status IS NULL OR ar.status = p_approval_status)
      )::INTEGER AS changes_requested_count
    FROM public.approval_requests ar
    WHERE ar.workspace_id = v_actor_membership.workspace_id
      AND ar.requested_by_user_id IN (SELECT filtered_users.user_id FROM filtered_users)
  ),
  sender_rollup AS (
    SELECT COUNT(*)::INTEGER AS sender_count
    FROM public.email_configs ec
    WHERE ec.user_id IN (SELECT filtered_users.user_id FROM filtered_users)
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
    WHERE member.user_id IN (SELECT filtered_users.user_id FROM filtered_users)
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
        'id', ar.id,
        'entityType', ar.entity_type,
        'entityId', ar.entity_id,
        'entityName', CASE
          WHEN ar.entity_type = 'campaign' THEN (SELECT c.name FROM public.campaigns c WHERE c.id = ar.entity_id)
          WHEN ar.entity_type = 'sender_account' THEN (SELECT ec.smtp_username FROM public.email_configs ec WHERE ec.id = ar.entity_id)
          ELSE (SELECT aw.name FROM public.automation_workflows aw WHERE aw.id = ar.entity_id)
        END,
        'requestedByName', requester.full_name,
        'requestedByEmail', requester.email,
        'reviewerName', reviewer.full_name,
        'reviewerEmail', reviewer.email,
        'status', ar.status,
        'createdAt', ar.created_at
      )
      ORDER BY ar.created_at DESC
    ) AS payload
    FROM (
      SELECT *
      FROM public.approval_requests
      WHERE v_team_approvals_enabled
        AND workspace_id = v_actor_membership.workspace_id
        AND requested_by_user_id IN (SELECT filtered_users.user_id FROM filtered_users)
        AND (p_approval_status IS NULL OR status = p_approval_status)
      ORDER BY created_at DESC
      LIMIT 20
    ) ar
    JOIN public.workspace_memberships requester ON requester.user_id = ar.requested_by_user_id
    LEFT JOIN public.workspace_memberships reviewer ON reviewer.user_id = ar.reviewer_user_id
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
  v_plan_id TEXT;
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
  v_plan_id := public.workspace_effective_plan_id(v_actor);

  RETURN jsonb_build_object(
    'workspaceId', v_workspace.id,
    'workspaceName', v_workspace.name,
    'ownerUserId', v_workspace.owner_user_id,
    'approvalDelegateUserId', v_workspace.approval_delegate_user_id,
    'planId', v_plan_id,
    'planFeatures', jsonb_build_object(
      'teamRoles', public.workspace_plan_supports_feature(v_actor, 'team_roles'),
      'teamApprovals', public.workspace_plan_supports_feature(v_actor, 'team_approvals'),
      'auditLogs', public.workspace_plan_supports_feature(v_actor, 'audit_logs'),
      'apiWebhooks', public.workspace_plan_supports_feature(v_actor, 'api_webhooks')
    ),
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
  IF NOT public.workspace_plan_supports_feature(v_actor, 'team_approvals') THEN
    RAISE EXCEPTION 'Approval workflows require the Scale plan or higher';
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
  IF NOT public.workspace_plan_supports_feature(v_actor, 'team_approvals') THEN
    RAISE EXCEPTION 'Approval workflows require the Scale plan or higher';
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
  IF NOT public.workspace_plan_supports_feature(v_actor, 'audit_logs') THEN
    RAISE EXCEPTION 'Audit logs require the Scale plan or higher';
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
  IF COALESCE(NEW.trigger_type, 'list_joined') = 'custom_event'
    AND NOT public.workspace_plan_supports_feature(NEW.user_id, 'api_webhooks')
  THEN
    RAISE EXCEPTION 'Webhook-triggered automations require the Growth plan or higher'
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

GRANT EXECUTE ON FUNCTION public.workspace_effective_plan_id(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.workspace_plan_rank(TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.workspace_plan_supports_feature(UUID, TEXT) TO authenticated, service_role;

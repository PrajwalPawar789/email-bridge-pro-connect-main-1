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
  WITH scope_users AS (
    SELECT scoped.user_id
    FROM public.workspace_scope_user_ids(v_actor) scoped
  )
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
    AND (
      al.actor_user_id IN (SELECT user_id FROM scope_users)
      OR (al.target_type = 'workspace_member' AND al.target_id IN (SELECT user_id::text FROM scope_users))
    )
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
      AND wm.user_id IN (SELECT user_id FROM scope_users)
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
        AND (
          actor_user_id IN (SELECT user_id FROM scope_users)
          OR (target_type = 'workspace_member' AND target_id IN (SELECT user_id::text FROM scope_users))
        )
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

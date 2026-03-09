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
  FROM public.workspace_memberships member_row
  WHERE member_row.user_id = p_user_id;

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
      COUNT(*) FILTER (WHERE ar.status = 'pending_approval')::INTEGER AS pending_count,
      COUNT(*) FILTER (WHERE ar.status = 'changes_requested')::INTEGER AS changes_requested_count
    FROM public.approval_requests ar
    WHERE ar.workspace_id = v_actor_membership.workspace_id
      AND ar.requested_by_user_id IN (SELECT filtered_users.user_id FROM filtered_users)
      AND (p_approval_status IS NULL OR ar.status = p_approval_status)
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

NOTIFY pgrst, 'reload schema';

CREATE OR REPLACE FUNCTION public.workspace_validate_invite_allocation(
  p_parent_user_id UUID,
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
  v_parent public.workspace_memberships%ROWTYPE;
  v_parent_direct_snapshot RECORD;
  v_parent_full_snapshot RECORD;
  v_sibling_credit_alloc INTEGER := 0;
  v_sibling_campaign_alloc INTEGER := 0;
  v_sibling_sender_alloc INTEGER := 0;
  v_sibling_daily_send_alloc INTEGER := 0;
  v_sibling_automation_alloc INTEGER := 0;
BEGIN
  IF p_parent_user_id IS NULL THEN
    RAISE EXCEPTION 'Parent member id is required';
  END IF;

  SELECT *
  INTO v_parent
  FROM public.workspace_memberships
  WHERE user_id = p_parent_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Parent member not found';
  END IF;

  SELECT *
  INTO v_parent_direct_snapshot
  FROM public.workspace_member_snapshot(p_parent_user_id, false)
  LIMIT 1;

  SELECT *
  INTO v_parent_full_snapshot
  FROM public.workspace_member_snapshot(p_parent_user_id, true)
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
    AND wm.parent_user_id = v_parent.user_id;

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

GRANT EXECUTE ON FUNCTION public.workspace_validate_invite_allocation(UUID, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER) TO authenticated, service_role;

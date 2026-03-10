CREATE OR REPLACE FUNCTION public.refresh_user_credit_wallet_internal(p_user_id UUID)
RETURNS public.credit_wallets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub RECORD;
  v_wallet public.credit_wallets%ROWTYPE;
  v_now TIMESTAMPTZ := now();
  v_new_start TIMESTAMPTZ;
  v_new_end TIMESTAMPTZ;
  v_new_credits INTEGER := 0;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'User id is required';
  END IF;

  PERFORM public.ensure_user_billing_profile(p_user_id);

  SELECT
    s.id AS subscription_id,
    s.plan_id,
    s.billing_cycle,
    s.status,
    s.current_period_start,
    s.current_period_end,
    COALESCE(public.get_plan_period_credits(s.plan_id, s.billing_cycle), 0) AS period_credits
  INTO v_sub
  FROM public.user_subscriptions s
  WHERE s.user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Subscription missing for user %', p_user_id;
  END IF;

  SELECT *
  INTO v_wallet
  FROM public.credit_wallets
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    v_new_credits := CASE
      WHEN v_sub.status IN ('active', 'trialing') THEN v_sub.period_credits
      ELSE 0
    END;

    INSERT INTO public.credit_wallets (
      user_id,
      subscription_id,
      period_start,
      period_end,
      period_credits,
      credits_used,
      credits_remaining
    )
    VALUES (
      p_user_id,
      v_sub.subscription_id,
      v_sub.current_period_start,
      v_sub.current_period_end,
      v_new_credits,
      0,
      v_new_credits
    )
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
      p_user_id,
      v_sub.subscription_id,
      v_new_credits,
      v_wallet.credits_remaining,
      'initial_allocation',
      v_sub.subscription_id::text,
      jsonb_build_object(
        'plan_id', v_sub.plan_id,
        'billing_cycle', v_sub.billing_cycle
      )
    );

    RETURN v_wallet;
  END IF;

  IF v_now >= COALESCE(v_wallet.period_end, v_sub.current_period_end) THEN
    v_new_start := v_now;
    v_new_end := v_now + public.get_billing_cycle_interval(v_sub.billing_cycle);
    v_new_credits := CASE
      WHEN v_sub.status IN ('active', 'trialing') THEN v_sub.period_credits
      ELSE 0
    END;

    UPDATE public.user_subscriptions
    SET
      current_period_start = v_new_start,
      current_period_end = v_new_end,
      updated_at = v_now
    WHERE id = v_sub.subscription_id;

    UPDATE public.credit_wallets
    SET
      subscription_id = v_sub.subscription_id,
      period_start = v_new_start,
      period_end = v_new_end,
      period_credits = v_new_credits,
      credits_used = 0,
      credits_remaining = v_new_credits,
      updated_at = v_now
    WHERE user_id = p_user_id
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
      p_user_id,
      v_sub.subscription_id,
      v_new_credits,
      v_wallet.credits_remaining,
      'period_refresh',
      v_sub.subscription_id::text,
      jsonb_build_object(
        'plan_id', v_sub.plan_id,
        'billing_cycle', v_sub.billing_cycle,
        'period_start', v_new_start,
        'period_end', v_new_end
      )
    );
  ELSE
    IF v_wallet.subscription_id IS DISTINCT FROM v_sub.subscription_id THEN
      UPDATE public.credit_wallets
      SET
        subscription_id = v_sub.subscription_id,
        updated_at = v_now
      WHERE user_id = p_user_id
      RETURNING * INTO v_wallet;
    END IF;

    IF v_wallet.user_id IS NULL THEN
      SELECT *
      INTO v_wallet
      FROM public.credit_wallets
      WHERE user_id = p_user_id;
    END IF;
  END IF;

  RETURN v_wallet;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_user_credit_wallet_internal(UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.refresh_user_credit_wallet(p_user_id UUID DEFAULT auth.uid())
RETURNS public.credit_wallets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'User id is required';
  END IF;

  IF v_actor IS NOT NULL AND v_actor <> p_user_id AND NOT public.is_service_role() THEN
    RAISE EXCEPTION 'Not authorized to refresh another user wallet';
  END IF;

  RETURN public.refresh_user_credit_wallet_internal(p_user_id);
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

  PERFORM public.refresh_user_credit_wallet_internal(v_workspace.owner_user_id);

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

  PERFORM public.refresh_user_credit_wallet_internal(v_workspace.owner_user_id);

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

  PERFORM public.refresh_user_credit_wallet_internal(v_workspace.owner_user_id);

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

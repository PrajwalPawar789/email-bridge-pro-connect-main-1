CREATE OR REPLACE FUNCTION public.set_user_subscription_plan(
  p_plan_id TEXT,
  p_billing_cycle TEXT DEFAULT 'monthly',
  p_user_id UUID DEFAULT auth.uid(),
  p_status TEXT DEFAULT 'active'
)
RETURNS TABLE (
  plan_id TEXT,
  billing_cycle TEXT,
  subscription_status TEXT,
  credits_remaining INTEGER,
  mailbox_limit INTEGER,
  current_period_end TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_now TIMESTAMPTZ := now();
  v_cycle TEXT := lower(COALESCE(p_billing_cycle, 'monthly'));
  v_status TEXT := lower(COALESCE(p_status, 'active'));
  v_sub public.user_subscriptions%ROWTYPE;
  v_wallet public.credit_wallets%ROWTYPE;
  v_credits INTEGER := 0;
  v_mailbox_limit INTEGER;
  v_should_reset BOOLEAN := true;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'User id is required';
  END IF;

  IF v_actor IS NOT NULL AND v_actor <> p_user_id AND NOT public.is_service_role() THEN
    RAISE EXCEPTION 'Not authorized to change another user subscription';
  END IF;

  IF v_cycle NOT IN ('monthly', 'annual') THEN
    RAISE EXCEPTION 'Invalid billing cycle: %', p_billing_cycle;
  END IF;

  IF v_status NOT IN ('trialing', 'active', 'past_due', 'canceled', 'expired') THEN
    RAISE EXCEPTION 'Invalid subscription status: %', p_status;
  END IF;

  PERFORM 1
  FROM public.billing_plans
  WHERE id = p_plan_id
    AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown or inactive plan id: %', p_plan_id;
  END IF;

  PERFORM public.ensure_user_billing_profile(p_user_id);

  SELECT *
  INTO v_sub
  FROM public.user_subscriptions
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF v_sub.plan_id = p_plan_id
    AND lower(v_sub.billing_cycle) = v_cycle
    AND lower(v_sub.status) = v_status
    AND v_now < v_sub.current_period_end
  THEN
    v_should_reset := false;
  END IF;

  IF v_should_reset THEN
    UPDATE public.user_subscriptions
    SET
      plan_id = p_plan_id,
      billing_cycle = v_cycle,
      status = v_status,
      current_period_start = v_now,
      current_period_end = v_now + public.get_billing_cycle_interval(v_cycle),
      cancel_at_period_end = false,
      canceled_at = NULL,
      updated_at = v_now
    WHERE user_id = p_user_id
    RETURNING * INTO v_sub;

    v_credits := CASE
      WHEN v_status IN ('active', 'trialing') THEN COALESCE(public.get_plan_period_credits(p_plan_id, v_cycle), 0)
      ELSE 0
    END;

    INSERT INTO public.credit_wallets (
      user_id,
      subscription_id,
      period_start,
      period_end,
      period_credits,
      credits_used,
      credits_remaining,
      updated_at
    )
    VALUES (
      p_user_id,
      v_sub.id,
      v_sub.current_period_start,
      v_sub.current_period_end,
      v_credits,
      0,
      v_credits,
      v_now
    )
    ON CONFLICT (user_id)
    DO UPDATE SET
      subscription_id = EXCLUDED.subscription_id,
      period_start = EXCLUDED.period_start,
      period_end = EXCLUDED.period_end,
      period_credits = EXCLUDED.period_credits,
      credits_used = EXCLUDED.credits_used,
      credits_remaining = EXCLUDED.credits_remaining,
      updated_at = EXCLUDED.updated_at
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
      v_sub.id,
      v_credits,
      v_wallet.credits_remaining,
      'plan_change_allocation',
      v_sub.id::text,
      jsonb_build_object(
        'plan_id', p_plan_id,
        'billing_cycle', v_cycle,
        'status', v_status
      )
    );
  ELSE
    PERFORM public.refresh_user_credit_wallet(p_user_id);

    SELECT *
    INTO v_sub
    FROM public.user_subscriptions
    WHERE user_id = p_user_id;

    SELECT *
    INTO v_wallet
    FROM public.credit_wallets
    WHERE user_id = p_user_id;
  END IF;

  SELECT bp.mailbox_limit
  INTO v_mailbox_limit
  FROM public.billing_plans bp
  WHERE bp.id = v_sub.plan_id;

  RETURN QUERY
  SELECT
    v_sub.plan_id,
    v_sub.billing_cycle,
    v_sub.status,
    COALESCE(v_wallet.credits_remaining, 0),
    v_mailbox_limit,
    v_sub.current_period_end;
END;
$$;

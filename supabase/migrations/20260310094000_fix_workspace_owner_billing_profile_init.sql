CREATE OR REPLACE FUNCTION public.ensure_user_billing_profile_internal(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub public.user_subscriptions%ROWTYPE;
  v_wallet public.credit_wallets%ROWTYPE;
  v_period_credits INTEGER := 0;
  v_now TIMESTAMPTZ := now();
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'User id is required';
  END IF;

  INSERT INTO public.user_subscriptions (
    user_id,
    plan_id,
    billing_cycle,
    status,
    current_period_start,
    current_period_end
  )
  VALUES (
    p_user_id,
    'free',
    'monthly',
    'active',
    v_now,
    v_now + INTERVAL '1 month'
  )
  ON CONFLICT (user_id) DO NOTHING;

  SELECT *
  INTO v_sub
  FROM public.user_subscriptions
  WHERE user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unable to create billing profile for user %', p_user_id;
  END IF;

  v_period_credits := COALESCE(public.get_plan_period_credits(v_sub.plan_id, v_sub.billing_cycle), 0);

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
    v_sub.id,
    v_sub.current_period_start,
    v_sub.current_period_end,
    v_period_credits,
    0,
    v_period_credits
  )
  ON CONFLICT (user_id) DO NOTHING
  RETURNING * INTO v_wallet;

  IF FOUND THEN
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
      v_period_credits,
      v_period_credits,
      'initial_allocation',
      v_sub.id::text,
      jsonb_build_object(
        'plan_id', v_sub.plan_id,
        'billing_cycle', v_sub.billing_cycle
      )
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_user_billing_profile_internal(UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.ensure_user_billing_profile(p_user_id UUID DEFAULT auth.uid())
RETURNS VOID
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
    RAISE EXCEPTION 'Not authorized to manage another user billing profile';
  END IF;

  PERFORM public.ensure_user_billing_profile_internal(p_user_id);
END;
$$;

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

  PERFORM public.ensure_user_billing_profile_internal(p_user_id);

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

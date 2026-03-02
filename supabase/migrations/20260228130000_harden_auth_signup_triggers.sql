-- Prevent non-critical billing/referral side-effects from blocking auth signup.
-- Also ensure the default 'free' plan exists before creating billing profile rows.

CREATE OR REPLACE FUNCTION public.ensure_user_billing_profile(p_user_id UUID DEFAULT auth.uid())
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_sub public.user_subscriptions%ROWTYPE;
  v_wallet public.credit_wallets%ROWTYPE;
  v_period_credits INTEGER := 0;
  v_now TIMESTAMPTZ := now();
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'User id is required';
  END IF;

  IF v_actor IS NOT NULL AND v_actor <> p_user_id AND NOT public.is_service_role() THEN
    RAISE EXCEPTION 'Not authorized to manage another user billing profile';
  END IF;

  -- Guard against missing seed data in environments where plan rows were removed.
  INSERT INTO public.billing_plans (
    id,
    name,
    description,
    monthly_price_cents,
    annual_price_cents,
    monthly_credits,
    annual_credits,
    mailbox_limit,
    is_active
  )
  VALUES (
    'free',
    'Starter Trial',
    'Validate your outbound workflow before scaling.',
    0,
    0,
    2000,
    24000,
    1,
    true
  )
  ON CONFLICT (id) DO NOTHING;

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

CREATE OR REPLACE FUNCTION public.handle_new_auth_user_billing()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  BEGIN
    PERFORM public.ensure_user_billing_profile(NEW.id);
  EXCEPTION
    WHEN OTHERS THEN
      RAISE WARNING 'Billing bootstrap failed for user %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_auth_user_referral()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_referral_code TEXT;
BEGIN
  v_referral_code := upper(
    trim(
      COALESCE(
        NEW.raw_user_meta_data ->> 'referral_code',
        NEW.raw_app_meta_data ->> 'referral_code',
        ''
      )
    )
  );

  IF v_referral_code <> '' THEN
    BEGIN
      PERFORM *
      FROM public.claim_referral_for_user(v_referral_code, NEW.id);
    EXCEPTION
      WHEN OTHERS THEN
        RAISE WARNING 'Referral claim failed for user % (code=%): %', NEW.id, v_referral_code, SQLERRM;
    END;
  END IF;

  RETURN NEW;
END;
$$;

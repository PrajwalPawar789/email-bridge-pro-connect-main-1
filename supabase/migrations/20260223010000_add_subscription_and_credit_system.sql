-- Subscription + credits system with mailbox limits.

CREATE TABLE IF NOT EXISTS public.billing_plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  monthly_price_cents INTEGER NOT NULL DEFAULT 0 CHECK (monthly_price_cents >= 0),
  annual_price_cents INTEGER NOT NULL DEFAULT 0 CHECK (annual_price_cents >= 0),
  monthly_credits INTEGER NOT NULL DEFAULT 0 CHECK (monthly_credits >= 0),
  annual_credits INTEGER NOT NULL DEFAULT 0 CHECK (annual_credits >= 0),
  mailbox_limit INTEGER CHECK (mailbox_limit IS NULL OR mailbox_limit > 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL REFERENCES public.billing_plans(id),
  billing_cycle TEXT NOT NULL DEFAULT 'monthly' CHECK (billing_cycle IN ('monthly', 'annual')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('trialing', 'active', 'past_due', 'canceled', 'expired')),
  current_period_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  current_period_end TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '1 month'),
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
  canceled_at TIMESTAMPTZ,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  trial_ends_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.credit_wallets (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES public.user_subscriptions(id) ON DELETE SET NULL,
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  period_credits INTEGER NOT NULL DEFAULT 0 CHECK (period_credits >= 0),
  credits_used INTEGER NOT NULL DEFAULT 0 CHECK (credits_used >= 0),
  credits_remaining INTEGER NOT NULL DEFAULT 0 CHECK (credits_remaining >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.credit_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES public.user_subscriptions(id) ON DELETE SET NULL,
  delta INTEGER NOT NULL,
  balance_after INTEGER NOT NULL CHECK (balance_after >= 0),
  event_type TEXT NOT NULL,
  reference_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_subscriptions_user_id ON public.user_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_plan_id ON public.user_subscriptions(plan_id);
CREATE INDEX IF NOT EXISTS idx_credit_ledger_user_created_at ON public.credit_ledger(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_credit_wallets_subscription_id ON public.credit_wallets(subscription_id);
CREATE INDEX IF NOT EXISTS idx_email_configs_user_id ON public.email_configs(user_id);

ALTER TABLE public.billing_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Billing plans readable" ON public.billing_plans;
CREATE POLICY "Billing plans readable"
  ON public.billing_plans
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Users can view own subscription" ON public.user_subscriptions;
CREATE POLICY "Users can view own subscription"
  ON public.user_subscriptions
  FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can view own credit wallet" ON public.credit_wallets;
CREATE POLICY "Users can view own credit wallet"
  ON public.credit_wallets
  FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can view own credit ledger" ON public.credit_ledger;
CREATE POLICY "Users can view own credit ledger"
  ON public.credit_ledger
  FOR SELECT
  USING (user_id = auth.uid());

DROP TRIGGER IF EXISTS update_billing_plans_updated_at ON public.billing_plans;
CREATE TRIGGER update_billing_plans_updated_at
BEFORE UPDATE ON public.billing_plans
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_user_subscriptions_updated_at ON public.user_subscriptions;
CREATE TRIGGER update_user_subscriptions_updated_at
BEFORE UPDATE ON public.user_subscriptions
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_credit_wallets_updated_at ON public.credit_wallets;
CREATE TRIGGER update_credit_wallets_updated_at
BEFORE UPDATE ON public.credit_wallets
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

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
VALUES
  ('free', 'Starter Trial', 'Validate your outbound workflow before scaling.', 0, 0, 2000, 24000, 1, true),
  ('growth', 'Growth', 'For lean GTM teams launching repeatable campaigns.', 7900, 6300, 100000, 1200000, 5, true),
  ('scale', 'Scale', 'For revenue teams operating multiple inbox pods.', 14900, 11900, 300000, 3600000, 20, true),
  ('enterprise', 'Enterprise', 'For global teams with compliance and governance needs.', 0, 0, 0, 0, NULL, true)
ON CONFLICT (id)
DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  monthly_price_cents = EXCLUDED.monthly_price_cents,
  annual_price_cents = EXCLUDED.annual_price_cents,
  monthly_credits = EXCLUDED.monthly_credits,
  annual_credits = EXCLUDED.annual_credits,
  mailbox_limit = EXCLUDED.mailbox_limit,
  is_active = EXCLUDED.is_active,
  updated_at = now();

CREATE OR REPLACE FUNCTION public.is_service_role()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
AS $$
  SELECT COALESCE(current_setting('request.jwt.claim.role', true), '') = 'service_role';
$$;

CREATE OR REPLACE FUNCTION public.get_billing_cycle_interval(p_billing_cycle TEXT)
RETURNS INTERVAL
LANGUAGE SQL
IMMUTABLE
AS $$
  SELECT CASE
    WHEN lower(COALESCE(p_billing_cycle, 'monthly')) = 'annual' THEN INTERVAL '1 year'
    ELSE INTERVAL '1 month'
  END;
$$;

CREATE OR REPLACE FUNCTION public.get_plan_period_credits(p_plan_id TEXT, p_billing_cycle TEXT)
RETURNS INTEGER
LANGUAGE SQL
STABLE
AS $$
  SELECT CASE
    WHEN lower(COALESCE(p_billing_cycle, 'monthly')) = 'annual' THEN COALESCE(bp.annual_credits, 0)
    ELSE COALESCE(bp.monthly_credits, 0)
  END
  FROM public.billing_plans bp
  WHERE bp.id = p_plan_id;
$$;

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

CREATE OR REPLACE FUNCTION public.refresh_user_credit_wallet(p_user_id UUID DEFAULT auth.uid())
RETURNS public.credit_wallets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
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

  IF v_actor IS NOT NULL AND v_actor <> p_user_id AND NOT public.is_service_role() THEN
    RAISE EXCEPTION 'Not authorized to refresh another user wallet';
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

CREATE OR REPLACE FUNCTION public.get_user_mailbox_limit(p_user_id UUID DEFAULT auth.uid())
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_limit INTEGER;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'User id is required';
  END IF;

  IF v_actor IS NOT NULL AND v_actor <> p_user_id AND NOT public.is_service_role() THEN
    RAISE EXCEPTION 'Not authorized to view another user mailbox limit';
  END IF;

  PERFORM public.ensure_user_billing_profile(p_user_id);

  SELECT bp.mailbox_limit
  INTO v_limit
  FROM public.user_subscriptions us
  JOIN public.billing_plans bp ON bp.id = us.plan_id
  WHERE us.user_id = p_user_id;

  RETURN v_limit;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_billing_snapshot(p_user_id UUID DEFAULT auth.uid())
RETURNS TABLE (
  user_id UUID,
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
  unlimited_mailboxes BOOLEAN
)
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
    RAISE EXCEPTION 'Not authorized to view another user billing snapshot';
  END IF;

  PERFORM public.refresh_user_credit_wallet(p_user_id);

  RETURN QUERY
  SELECT
    us.user_id,
    us.plan_id,
    bp.name AS plan_name,
    us.billing_cycle,
    us.status AS subscription_status,
    us.current_period_start,
    us.current_period_end,
    cw.period_credits AS credits_in_period,
    cw.credits_used,
    cw.credits_remaining,
    bp.mailbox_limit,
    COALESCE((
      SELECT count(*)::INTEGER
      FROM public.email_configs ec
      WHERE ec.user_id = us.user_id
    ), 0) AS mailboxes_used,
    bp.mailbox_limit IS NULL AS unlimited_mailboxes
  FROM public.user_subscriptions us
  JOIN public.billing_plans bp ON bp.id = us.plan_id
  JOIN public.credit_wallets cw ON cw.user_id = us.user_id
  WHERE us.user_id = p_user_id;
END;
$$;

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

  SELECT mailbox_limit
  INTO v_mailbox_limit
  FROM public.billing_plans
  WHERE id = v_sub.plan_id;

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
  v_wallet public.credit_wallets%ROWTYPE;
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

  PERFORM public.refresh_user_credit_wallet(p_user_id);

  SELECT *
  INTO v_wallet
  FROM public.credit_wallets
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 0, 'Credit wallet not found';
    RETURN;
  END IF;

  IF v_wallet.credits_remaining < p_amount THEN
    RETURN QUERY SELECT false, v_wallet.credits_remaining, 'Insufficient credits';
    RETURN;
  END IF;

  UPDATE public.credit_wallets
  SET
    credits_remaining = credits_remaining - p_amount,
    credits_used = credits_used + p_amount,
    updated_at = now()
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
    v_wallet.subscription_id,
    -p_amount,
    v_wallet.credits_remaining,
    p_event_type,
    p_reference_id,
    COALESCE(p_metadata, '{}'::jsonb)
  );

  RETURN QUERY SELECT true, v_wallet.credits_remaining, 'Credits consumed';
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
  v_wallet public.credit_wallets%ROWTYPE;
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

  PERFORM public.refresh_user_credit_wallet(p_user_id);

  SELECT *
  INTO v_wallet
  FROM public.credit_wallets
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Credit wallet not found for user %', p_user_id;
  END IF;

  UPDATE public.credit_wallets
  SET
    credits_remaining = credits_remaining + p_amount,
    credits_used = GREATEST(0, credits_used - p_amount),
    updated_at = now()
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
    v_wallet.subscription_id,
    p_amount,
    v_wallet.credits_remaining,
    p_event_type,
    p_reference_id,
    COALESCE(p_metadata, '{}'::jsonb)
  );

  RETURN QUERY SELECT v_wallet.credits_remaining, 'Credits refunded';
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_mailbox_limit_on_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit INTEGER;
  v_used INTEGER;
BEGIN
  v_limit := public.get_user_mailbox_limit(NEW.user_id);

  IF v_limit IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT count(*)::INTEGER
  INTO v_used
  FROM public.email_configs ec
  WHERE ec.user_id = NEW.user_id;

  IF v_used >= v_limit THEN
    RAISE EXCEPTION 'Mailbox limit reached for your current plan (% mailboxes). Upgrade to add more inboxes.', v_limit
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_mailbox_limit_on_email_configs ON public.email_configs;
CREATE TRIGGER enforce_mailbox_limit_on_email_configs
BEFORE INSERT ON public.email_configs
FOR EACH ROW
EXECUTE FUNCTION public.enforce_mailbox_limit_on_insert();

CREATE OR REPLACE FUNCTION public.handle_new_auth_user_billing()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.ensure_user_billing_profile(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_billing ON auth.users;
CREATE TRIGGER on_auth_user_created_billing
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_auth_user_billing();

DO $$
DECLARE
  u RECORD;
BEGIN
  FOR u IN SELECT id FROM auth.users LOOP
    PERFORM public.ensure_user_billing_profile(u.id);
  END LOOP;
END;
$$;

GRANT SELECT ON TABLE public.billing_plans TO anon, authenticated, service_role;
GRANT SELECT ON TABLE public.user_subscriptions TO authenticated, service_role;
GRANT SELECT ON TABLE public.credit_wallets TO authenticated, service_role;
GRANT SELECT ON TABLE public.credit_ledger TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.ensure_user_billing_profile(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.refresh_user_credit_wallet(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_user_mailbox_limit(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_billing_snapshot(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_user_subscription_plan(TEXT, TEXT, UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.consume_user_credits(INTEGER, TEXT, TEXT, JSONB, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.refund_user_credits(INTEGER, TEXT, TEXT, JSONB, UUID) TO authenticated, service_role;

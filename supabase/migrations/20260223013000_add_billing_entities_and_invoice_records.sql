-- Billing entities for payment methods, invoices, and transactions.

CREATE TABLE IF NOT EXISTS public.billing_payment_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'manual',
  brand TEXT NOT NULL,
  last4 TEXT NOT NULL,
  exp_month INTEGER,
  exp_year INTEGER,
  is_default BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT billing_payment_methods_last4_check CHECK (char_length(last4) = 4),
  CONSTRAINT billing_payment_methods_exp_month_check CHECK (exp_month IS NULL OR (exp_month BETWEEN 1 AND 12))
);

CREATE TABLE IF NOT EXISTS public.billing_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES public.user_subscriptions(id) ON DELETE SET NULL,
  plan_id TEXT REFERENCES public.billing_plans(id),
  billing_cycle TEXT NOT NULL CHECK (billing_cycle IN ('monthly', 'annual')),
  amount_cents INTEGER NOT NULL DEFAULT 0 CHECK (amount_cents >= 0),
  currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'paid' CHECK (status IN ('paid', 'pending', 'failed', 'void')),
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at TIMESTAMPTZ,
  period_start TIMESTAMPTZ,
  period_end TIMESTAMPTZ,
  description TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.billing_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invoice_id UUID REFERENCES public.billing_invoices(id) ON DELETE SET NULL,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('charge', 'refund', 'adjustment')),
  status TEXT NOT NULL DEFAULT 'succeeded' CHECK (status IN ('succeeded', 'failed', 'pending')),
  amount_cents INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  provider TEXT NOT NULL DEFAULT 'manual',
  provider_reference TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT billing_transactions_amount_nonzero_check CHECK (amount_cents <> 0)
);

CREATE INDEX IF NOT EXISTS idx_billing_payment_methods_user_id ON public.billing_payment_methods(user_id);
CREATE INDEX IF NOT EXISTS idx_billing_invoices_user_issued_at ON public.billing_invoices(user_id, issued_at DESC);
CREATE INDEX IF NOT EXISTS idx_billing_transactions_user_created_at ON public.billing_transactions(user_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_billing_payment_methods_one_default_per_user
  ON public.billing_payment_methods(user_id)
  WHERE is_default = true;

ALTER TABLE public.billing_payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own payment methods" ON public.billing_payment_methods;
CREATE POLICY "Users can view own payment methods"
  ON public.billing_payment_methods
  FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can insert own payment methods" ON public.billing_payment_methods;
CREATE POLICY "Users can insert own payment methods"
  ON public.billing_payment_methods
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update own payment methods" ON public.billing_payment_methods;
CREATE POLICY "Users can update own payment methods"
  ON public.billing_payment_methods
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can delete own payment methods" ON public.billing_payment_methods;
CREATE POLICY "Users can delete own payment methods"
  ON public.billing_payment_methods
  FOR DELETE
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can view own invoices" ON public.billing_invoices;
CREATE POLICY "Users can view own invoices"
  ON public.billing_invoices
  FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can view own billing transactions" ON public.billing_transactions;
CREATE POLICY "Users can view own billing transactions"
  ON public.billing_transactions
  FOR SELECT
  USING (user_id = auth.uid());

DROP TRIGGER IF EXISTS update_billing_payment_methods_updated_at ON public.billing_payment_methods;
CREATE TRIGGER update_billing_payment_methods_updated_at
BEFORE UPDATE ON public.billing_payment_methods
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_billing_invoices_updated_at ON public.billing_invoices;
CREATE TRIGGER update_billing_invoices_updated_at
BEFORE UPDATE ON public.billing_invoices
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

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
  v_plan public.billing_plans%ROWTYPE;
  v_invoice_amount INTEGER := 0;
  v_invoice_id UUID;
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

  SELECT *
  INTO v_plan
  FROM public.billing_plans bp
  WHERE bp.id = p_plan_id
    AND bp.is_active = true;

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

    IF v_status IN ('active', 'trialing') THEN
      v_invoice_amount := CASE
        WHEN v_cycle = 'annual' THEN COALESCE(v_plan.annual_price_cents, 0) * 12
        ELSE COALESCE(v_plan.monthly_price_cents, 0)
      END;

      IF v_invoice_amount > 0 THEN
        INSERT INTO public.billing_invoices (
          user_id,
          subscription_id,
          plan_id,
          billing_cycle,
          amount_cents,
          currency,
          status,
          issued_at,
          paid_at,
          period_start,
          period_end,
          description,
          metadata
        )
        VALUES (
          p_user_id,
          v_sub.id,
          p_plan_id,
          v_cycle,
          v_invoice_amount,
          'USD',
          'paid',
          v_now,
          v_now,
          v_sub.current_period_start,
          v_sub.current_period_end,
          format('Subscription charge for %s (%s)', v_plan.name, v_cycle),
          jsonb_build_object(
            'source', 'set_user_subscription_plan',
            'plan_name', v_plan.name
          )
        )
        RETURNING id INTO v_invoice_id;

        INSERT INTO public.billing_transactions (
          user_id,
          invoice_id,
          transaction_type,
          status,
          amount_cents,
          currency,
          provider,
          provider_reference,
          metadata
        )
        VALUES (
          p_user_id,
          v_invoice_id,
          'charge',
          'succeeded',
          v_invoice_amount,
          'USD',
          'manual',
          CONCAT('manual_', v_sub.id::text, '_', extract(epoch FROM v_now)::bigint::text),
          jsonb_build_object(
            'plan_id', p_plan_id,
            'billing_cycle', v_cycle
          )
        );
      END IF;
    END IF;
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

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.billing_payment_methods TO authenticated, service_role;
GRANT SELECT ON TABLE public.billing_invoices TO authenticated, service_role;
GRANT SELECT ON TABLE public.billing_transactions TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_user_subscription_plan(TEXT, TEXT, UUID, TEXT) TO authenticated, service_role;

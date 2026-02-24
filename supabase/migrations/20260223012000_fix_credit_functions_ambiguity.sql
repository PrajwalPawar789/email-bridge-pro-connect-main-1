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

  UPDATE public.credit_wallets cw
  SET
    credits_remaining = cw.credits_remaining - p_amount,
    credits_used = cw.credits_used + p_amount,
    updated_at = now()
  WHERE cw.user_id = p_user_id
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

  UPDATE public.credit_wallets cw
  SET
    credits_remaining = cw.credits_remaining + p_amount,
    credits_used = GREATEST(0, cw.credits_used - p_amount),
    updated_at = now()
  WHERE cw.user_id = p_user_id
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

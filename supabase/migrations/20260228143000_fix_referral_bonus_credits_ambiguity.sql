-- Fix ambiguous credits_remaining reference in referral bonus award flow.
-- This ambiguity can abort referral linking and leave referral_events empty.

CREATE OR REPLACE FUNCTION public.award_referral_event_bonus(
  p_referral_event_id UUID,
  p_bonus_credits INTEGER DEFAULT NULL,
  p_reference_id TEXT DEFAULT NULL
)
RETURNS TABLE (
  awarded BOOLEAN,
  message TEXT,
  referrer_user_id UUID,
  credits_remaining INTEGER,
  bonus_credits INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event public.referral_events%ROWTYPE;
  v_wallet public.credit_wallets%ROWTYPE;
  v_bonus INTEGER;
BEGIN
  IF p_referral_event_id IS NULL THEN
    RAISE EXCEPTION 'Referral event id is required';
  END IF;

  SELECT *
  INTO v_event
  FROM public.referral_events re
  WHERE re.id = p_referral_event_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY
    SELECT false, 'Referral event not found', NULL::UUID, 0, 0;
    RETURN;
  END IF;

  IF v_event.status = 'rewarded' AND v_event.bonus_awarded_at IS NOT NULL THEN
    SELECT *
    INTO v_wallet
    FROM public.credit_wallets cw
    WHERE cw.user_id = v_event.referrer_user_id;

    RETURN QUERY
    SELECT
      false,
      'Referral bonus already awarded',
      v_event.referrer_user_id,
      COALESCE(v_wallet.credits_remaining, 0),
      COALESCE(v_event.bonus_credits, 0);
    RETURN;
  END IF;

  v_bonus := COALESCE(p_bonus_credits, v_event.bonus_credits, 10000);

  IF v_bonus <= 0 THEN
    RAISE EXCEPTION 'Bonus credits must be greater than zero';
  END IF;

  PERFORM public.ensure_user_billing_profile(v_event.referrer_user_id);
  PERFORM public.refresh_user_credit_wallet(v_event.referrer_user_id);

  UPDATE public.credit_wallets cw
  SET
    period_credits = cw.period_credits + v_bonus,
    credits_remaining = cw.credits_remaining + v_bonus,
    updated_at = now()
  WHERE cw.user_id = v_event.referrer_user_id
  RETURNING * INTO v_wallet;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Credit wallet not found for referrer %', v_event.referrer_user_id;
  END IF;

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
    v_event.referrer_user_id,
    v_wallet.subscription_id,
    v_bonus,
    v_wallet.credits_remaining,
    'referral_bonus',
    COALESCE(p_reference_id, 'referral:' || v_event.id::text),
    jsonb_build_object(
      'referral_event_id', v_event.id,
      'referred_user_id', v_event.referred_user_id,
      'referral_code', v_event.referral_code
    )
  );

  UPDATE public.referral_events re
  SET
    status = 'rewarded',
    bonus_credits = v_bonus,
    bonus_awarded_at = now(),
    updated_at = now()
  WHERE re.id = v_event.id
  RETURNING * INTO v_event;

  RETURN QUERY
  SELECT
    true,
    'Referral bonus awarded',
    v_event.referrer_user_id,
    v_wallet.credits_remaining,
    v_bonus;
END;
$$;

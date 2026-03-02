-- Referral program for user-managed invite links and automatic bonus credits.

CREATE TABLE IF NOT EXISTS public.referral_program_members (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  referral_code TEXT NOT NULL UNIQUE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  company_name TEXT NOT NULL,
  company_email TEXT NOT NULL,
  terms_accepted_at TIMESTAMPTZ NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'referral_program_members_referral_code_upper_check'
  ) THEN
    ALTER TABLE public.referral_program_members
      ADD CONSTRAINT referral_program_members_referral_code_upper_check
      CHECK (referral_code = upper(referral_code));
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.referral_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  referred_user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  referral_code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'qualified', 'rewarded', 'rejected')),
  bonus_credits INTEGER NOT NULL DEFAULT 10000 CHECK (bonus_credits >= 0),
  bonus_awarded_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT referral_events_no_self_referral CHECK (referrer_user_id <> referred_user_id)
);

CREATE INDEX IF NOT EXISTS idx_referral_events_referrer_created_at
  ON public.referral_events(referrer_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_referral_events_status
  ON public.referral_events(status);

ALTER TABLE public.referral_program_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own referral profile" ON public.referral_program_members;
CREATE POLICY "Users can view own referral profile"
  ON public.referral_program_members
  FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can insert own referral profile" ON public.referral_program_members;
CREATE POLICY "Users can insert own referral profile"
  ON public.referral_program_members
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update own referral profile" ON public.referral_program_members;
CREATE POLICY "Users can update own referral profile"
  ON public.referral_program_members
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can view own referral events" ON public.referral_events;
CREATE POLICY "Users can view own referral events"
  ON public.referral_events
  FOR SELECT
  USING (referrer_user_id = auth.uid() OR referred_user_id = auth.uid());

DROP TRIGGER IF EXISTS update_referral_program_members_updated_at ON public.referral_program_members;
CREATE TRIGGER update_referral_program_members_updated_at
BEFORE UPDATE ON public.referral_program_members
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_referral_events_updated_at ON public.referral_events;
CREATE TRIGGER update_referral_events_updated_at
BEFORE UPDATE ON public.referral_events
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE FUNCTION public.generate_referral_code(p_length INTEGER DEFAULT 8)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_alphabet CONSTANT TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code TEXT := '';
  v_i INTEGER;
BEGIN
  IF p_length IS NULL OR p_length < 6 OR p_length > 16 THEN
    RAISE EXCEPTION 'Referral code length must be between 6 and 16';
  END IF;

  FOR v_i IN 1..p_length LOOP
    v_code := v_code || substr(v_alphabet, floor(random() * length(v_alphabet))::INTEGER + 1, 1);
  END LOOP;

  RETURN v_code;
END;
$$;

CREATE OR REPLACE FUNCTION public.register_referral_program_member(
  p_first_name TEXT,
  p_last_name TEXT,
  p_company_name TEXT,
  p_company_email TEXT,
  p_terms_accepted BOOLEAN DEFAULT false,
  p_user_id UUID DEFAULT auth.uid()
)
RETURNS TABLE (
  user_id UUID,
  referral_code TEXT,
  first_name TEXT,
  last_name TEXT,
  company_name TEXT,
  company_email TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_member public.referral_program_members%ROWTYPE;
  v_code TEXT;
  v_attempts INTEGER := 0;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'User id is required';
  END IF;

  IF v_actor IS NOT NULL AND v_actor <> p_user_id AND NOT public.is_service_role() THEN
    RAISE EXCEPTION 'Not authorized to register referral profile for another user';
  END IF;

  IF COALESCE(trim(p_first_name), '') = '' THEN
    RAISE EXCEPTION 'First name is required';
  END IF;

  IF COALESCE(trim(p_last_name), '') = '' THEN
    RAISE EXCEPTION 'Last name is required';
  END IF;

  IF COALESCE(trim(p_company_name), '') = '' THEN
    RAISE EXCEPTION 'Company name is required';
  END IF;

  IF COALESCE(trim(p_company_email), '') = '' THEN
    RAISE EXCEPTION 'Company email is required';
  END IF;

  IF NOT COALESCE(p_terms_accepted, false) THEN
    RAISE EXCEPTION 'Terms acceptance is required';
  END IF;

  SELECT *
  INTO v_member
  FROM public.referral_program_members
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF FOUND THEN
    UPDATE public.referral_program_members
    SET
      first_name = trim(p_first_name),
      last_name = trim(p_last_name),
      company_name = trim(p_company_name),
      company_email = lower(trim(p_company_email)),
      terms_accepted_at = now(),
      is_active = true,
      updated_at = now()
    WHERE user_id = p_user_id
    RETURNING * INTO v_member;

    RETURN QUERY
    SELECT
      v_member.user_id,
      v_member.referral_code,
      v_member.first_name,
      v_member.last_name,
      v_member.company_name,
      v_member.company_email,
      v_member.created_at,
      v_member.updated_at;
    RETURN;
  END IF;

  LOOP
    v_attempts := v_attempts + 1;
    IF v_attempts > 8 THEN
      RAISE EXCEPTION 'Unable to generate unique referral code';
    END IF;

    v_code := public.generate_referral_code(8);

    BEGIN
      INSERT INTO public.referral_program_members (
        user_id,
        referral_code,
        first_name,
        last_name,
        company_name,
        company_email,
        terms_accepted_at,
        is_active
      )
      VALUES (
        p_user_id,
        v_code,
        trim(p_first_name),
        trim(p_last_name),
        trim(p_company_name),
        lower(trim(p_company_email)),
        now(),
        true
      )
      RETURNING * INTO v_member;

      EXIT;
    EXCEPTION
      WHEN unique_violation THEN
        CONTINUE;
    END;
  END LOOP;

  RETURN QUERY
  SELECT
    v_member.user_id,
    v_member.referral_code,
    v_member.first_name,
    v_member.last_name,
    v_member.company_name,
    v_member.company_email,
    v_member.created_at,
    v_member.updated_at;
END;
$$;

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
  FROM public.referral_events
  WHERE id = p_referral_event_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY
    SELECT false, 'Referral event not found', NULL::UUID, 0, 0;
    RETURN;
  END IF;

  IF v_event.status = 'rewarded' AND v_event.bonus_awarded_at IS NOT NULL THEN
    SELECT *
    INTO v_wallet
    FROM public.credit_wallets
    WHERE user_id = v_event.referrer_user_id;

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

  UPDATE public.credit_wallets
  SET
    period_credits = period_credits + v_bonus,
    credits_remaining = credits_remaining + v_bonus,
    updated_at = now()
  WHERE user_id = v_event.referrer_user_id
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

  UPDATE public.referral_events
  SET
    status = 'rewarded',
    bonus_credits = v_bonus,
    bonus_awarded_at = now(),
    updated_at = now()
  WHERE id = v_event.id
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

CREATE OR REPLACE FUNCTION public.claim_referral_for_user(
  p_referral_code TEXT,
  p_referred_user_id UUID DEFAULT auth.uid(),
  p_default_bonus_credits INTEGER DEFAULT 10000
)
RETURNS TABLE (
  linked BOOLEAN,
  message TEXT,
  referral_event_id UUID,
  referrer_user_id UUID,
  bonus_credits INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_code TEXT := upper(trim(COALESCE(p_referral_code, '')));
  v_member public.referral_program_members%ROWTYPE;
  v_event public.referral_events%ROWTYPE;
BEGIN
  IF p_referred_user_id IS NULL THEN
    RAISE EXCEPTION 'Referred user id is required';
  END IF;

  IF v_actor IS NOT NULL AND v_actor <> p_referred_user_id AND NOT public.is_service_role() THEN
    RAISE EXCEPTION 'Not authorized to claim referral for another user';
  END IF;

  IF v_code = '' THEN
    RETURN QUERY
    SELECT false, 'Referral code is required', NULL::UUID, NULL::UUID, 0;
    RETURN;
  END IF;

  IF p_default_bonus_credits IS NULL OR p_default_bonus_credits <= 0 THEN
    RAISE EXCEPTION 'Default bonus credits must be greater than zero';
  END IF;

  SELECT *
  INTO v_event
  FROM public.referral_events
  WHERE referred_user_id = p_referred_user_id;

  IF FOUND THEN
    RETURN QUERY
    SELECT
      false,
      'Referral already linked for this user',
      v_event.id,
      v_event.referrer_user_id,
      COALESCE(v_event.bonus_credits, 0);
    RETURN;
  END IF;

  SELECT *
  INTO v_member
  FROM public.referral_program_members
  WHERE referral_code = v_code
    AND is_active = true;

  IF NOT FOUND THEN
    RETURN QUERY
    SELECT false, 'Invalid referral code', NULL::UUID, NULL::UUID, 0;
    RETURN;
  END IF;

  IF v_member.user_id = p_referred_user_id THEN
    RETURN QUERY
    SELECT false, 'You cannot refer your own account', NULL::UUID, NULL::UUID, 0;
    RETURN;
  END IF;

  BEGIN
    INSERT INTO public.referral_events (
      referrer_user_id,
      referred_user_id,
      referral_code,
      status,
      bonus_credits,
      metadata
    )
    VALUES (
      v_member.user_id,
      p_referred_user_id,
      v_code,
      'pending',
      p_default_bonus_credits,
      jsonb_build_object('source', 'signup')
    )
    RETURNING * INTO v_event;
  EXCEPTION
    WHEN unique_violation THEN
      SELECT *
      INTO v_event
      FROM public.referral_events
      WHERE referred_user_id = p_referred_user_id;

      RETURN QUERY
      SELECT
        false,
        'Referral already linked for this user',
        v_event.id,
        v_event.referrer_user_id,
        COALESCE(v_event.bonus_credits, 0);
      RETURN;
  END;

  PERFORM *
  FROM public.award_referral_event_bonus(v_event.id, v_event.bonus_credits, NULL);

  SELECT *
  INTO v_event
  FROM public.referral_events
  WHERE id = v_event.id;

  RETURN QUERY
  SELECT
    true,
    'Referral linked successfully',
    v_event.id,
    v_event.referrer_user_id,
    COALESCE(v_event.bonus_credits, 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_referral_program_dashboard(
  p_user_id UUID DEFAULT auth.uid()
)
RETURNS TABLE (
  user_id UUID,
  is_registered BOOLEAN,
  referral_code TEXT,
  first_name TEXT,
  last_name TEXT,
  company_name TEXT,
  company_email TEXT,
  total_referrals INTEGER,
  pending_referrals INTEGER,
  rewarded_referrals INTEGER,
  total_bonus_credits INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_member public.referral_program_members%ROWTYPE;
  v_total_referrals INTEGER := 0;
  v_pending_referrals INTEGER := 0;
  v_rewarded_referrals INTEGER := 0;
  v_total_bonus_credits INTEGER := 0;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'User id is required';
  END IF;

  IF v_actor IS NOT NULL AND v_actor <> p_user_id AND NOT public.is_service_role() THEN
    RAISE EXCEPTION 'Not authorized to access another user referral dashboard';
  END IF;

  SELECT *
  INTO v_member
  FROM public.referral_program_members
  WHERE user_id = p_user_id;

  IF NOT FOUND THEN
    RETURN QUERY
    SELECT
      p_user_id,
      false,
      NULL::TEXT,
      NULL::TEXT,
      NULL::TEXT,
      NULL::TEXT,
      NULL::TEXT,
      0,
      0,
      0,
      0;
    RETURN;
  END IF;

  SELECT
    count(*)::INTEGER,
    count(*) FILTER (WHERE status = 'pending')::INTEGER,
    count(*) FILTER (WHERE status = 'rewarded')::INTEGER,
    COALESCE(sum(CASE WHEN status = 'rewarded' THEN bonus_credits ELSE 0 END), 0)::INTEGER
  INTO
    v_total_referrals,
    v_pending_referrals,
    v_rewarded_referrals,
    v_total_bonus_credits
  FROM public.referral_events
  WHERE referrer_user_id = p_user_id;

  RETURN QUERY
  SELECT
    v_member.user_id,
    true,
    v_member.referral_code,
    v_member.first_name,
    v_member.last_name,
    v_member.company_name,
    v_member.company_email,
    v_total_referrals,
    v_pending_referrals,
    v_rewarded_referrals,
    v_total_bonus_credits;
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
    PERFORM *
    FROM public.claim_referral_for_user(v_referral_code, NEW.id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_referral ON auth.users;
CREATE TRIGGER on_auth_user_created_referral
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_auth_user_referral();

GRANT SELECT ON TABLE public.referral_program_members TO authenticated, service_role;
GRANT SELECT ON TABLE public.referral_events TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.register_referral_program_member(TEXT, TEXT, TEXT, TEXT, BOOLEAN, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.claim_referral_for_user(TEXT, UUID, INTEGER) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_referral_program_dashboard(UUID) TO authenticated, service_role;

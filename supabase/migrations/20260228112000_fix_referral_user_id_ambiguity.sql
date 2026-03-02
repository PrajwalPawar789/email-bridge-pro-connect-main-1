-- Fix ambiguous user_id references in referral RPC functions.

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
  FROM public.referral_program_members rpm
  WHERE rpm.user_id = p_user_id
  FOR UPDATE;

  IF FOUND THEN
    UPDATE public.referral_program_members rpm
    SET
      first_name = trim(p_first_name),
      last_name = trim(p_last_name),
      company_name = trim(p_company_name),
      company_email = lower(trim(p_company_email)),
      terms_accepted_at = now(),
      is_active = true,
      updated_at = now()
    WHERE rpm.user_id = p_user_id
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
  FROM public.referral_program_members rpm
  WHERE rpm.user_id = p_user_id;

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
    count(*) FILTER (WHERE re.status = 'pending')::INTEGER,
    count(*) FILTER (WHERE re.status = 'rewarded')::INTEGER,
    COALESCE(sum(CASE WHEN re.status = 'rewarded' THEN re.bonus_credits ELSE 0 END), 0)::INTEGER
  INTO
    v_total_referrals,
    v_pending_referrals,
    v_rewarded_referrals,
    v_total_bonus_credits
  FROM public.referral_events re
  WHERE re.referrer_user_id = p_user_id;

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

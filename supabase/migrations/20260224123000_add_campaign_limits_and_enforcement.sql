-- Add campaign limits per billing plan and enforce campaign creation caps.

ALTER TABLE public.billing_plans
ADD COLUMN IF NOT EXISTS campaign_limit INTEGER CHECK (campaign_limit IS NULL OR campaign_limit > 0);

UPDATE public.billing_plans
SET
  campaign_limit = CASE id
    WHEN 'free' THEN 3
    WHEN 'growth' THEN 25
    WHEN 'scale' THEN 100
    WHEN 'enterprise' THEN NULL
    ELSE campaign_limit
  END,
  updated_at = now()
WHERE id IN ('free', 'growth', 'scale', 'enterprise')
  AND campaign_limit IS DISTINCT FROM CASE id
    WHEN 'free' THEN 3
    WHEN 'growth' THEN 25
    WHEN 'scale' THEN 100
    WHEN 'enterprise' THEN NULL
    ELSE campaign_limit
  END;

CREATE OR REPLACE FUNCTION public.get_user_campaign_limit(p_user_id UUID DEFAULT auth.uid())
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
    RAISE EXCEPTION 'Not authorized to view another user campaign limit';
  END IF;

  PERFORM public.ensure_user_billing_profile(p_user_id);

  SELECT bp.campaign_limit
  INTO v_limit
  FROM public.user_subscriptions us
  JOIN public.billing_plans bp ON bp.id = us.plan_id
  WHERE us.user_id = p_user_id;

  RETURN v_limit;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_campaign_limit_on_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit INTEGER;
  v_used INTEGER;
BEGIN
  v_limit := public.get_user_campaign_limit(NEW.user_id);

  IF v_limit IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT count(*)::INTEGER
  INTO v_used
  FROM public.campaigns c
  WHERE c.user_id = NEW.user_id;

  IF v_used >= v_limit THEN
    RAISE EXCEPTION 'Campaign limit reached for your current plan (% campaigns). Upgrade to create more campaigns.', v_limit
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_campaign_limit_on_campaigns ON public.campaigns;
CREATE TRIGGER enforce_campaign_limit_on_campaigns
BEFORE INSERT ON public.campaigns
FOR EACH ROW
EXECUTE FUNCTION public.enforce_campaign_limit_on_insert();

DROP FUNCTION IF EXISTS public.get_billing_snapshot(UUID);
CREATE FUNCTION public.get_billing_snapshot(p_user_id UUID DEFAULT auth.uid())
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
  unlimited_mailboxes BOOLEAN,
  campaign_limit INTEGER,
  campaigns_used INTEGER,
  unlimited_campaigns BOOLEAN
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
    bp.mailbox_limit IS NULL AS unlimited_mailboxes,
    bp.campaign_limit,
    COALESCE((
      SELECT count(*)::INTEGER
      FROM public.campaigns c
      WHERE c.user_id = us.user_id
    ), 0) AS campaigns_used,
    bp.campaign_limit IS NULL AS unlimited_campaigns
  FROM public.user_subscriptions us
  JOIN public.billing_plans bp ON bp.id = us.plan_id
  JOIN public.credit_wallets cw ON cw.user_id = us.user_id
  WHERE us.user_id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_campaign_limit(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_billing_snapshot(UUID) TO authenticated, service_role;

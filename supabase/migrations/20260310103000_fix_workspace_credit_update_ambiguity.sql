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
  v_membership public.workspace_memberships%ROWTYPE;
  v_workspace public.workspaces%ROWTYPE;
  v_wallet public.credit_wallets%ROWTYPE;
  v_snapshot RECORD;
  v_remaining INTEGER;
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

  PERFORM public.ensure_workspace_membership(p_user_id);

  SELECT *
  INTO v_membership
  FROM public.workspace_memberships
  WHERE user_id = p_user_id;

  SELECT *
  INTO v_workspace
  FROM public.workspaces
  WHERE id = v_membership.workspace_id;

  PERFORM public.refresh_user_credit_wallet_internal(v_workspace.owner_user_id);

  SELECT *
  INTO v_snapshot
  FROM public.workspace_member_snapshot(p_user_id, true)
  LIMIT 1;

  IF v_snapshot.credits_cap IS NOT NULL AND COALESCE(v_snapshot.credits_remaining, 0) < p_amount THEN
    RETURN QUERY SELECT false, COALESCE(v_snapshot.credits_remaining, 0), 'Insufficient allocated credits';
    RETURN;
  END IF;

  SELECT *
  INTO v_wallet
  FROM public.credit_wallets cw
  WHERE cw.user_id = v_workspace.owner_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, COALESCE(v_snapshot.credits_remaining, 0), 'Workspace credit wallet not found';
    RETURN;
  END IF;

  IF v_wallet.credits_remaining < p_amount THEN
    RETURN QUERY SELECT false, v_wallet.credits_remaining, 'Insufficient workspace credits';
    RETURN;
  END IF;

  UPDATE public.credit_wallets cw
  SET
    credits_remaining = cw.credits_remaining - p_amount,
    credits_used = cw.credits_used + p_amount,
    updated_at = now()
  WHERE cw.user_id = v_workspace.owner_user_id
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
    v_workspace.owner_user_id,
    v_wallet.subscription_id,
    -p_amount,
    v_wallet.credits_remaining,
    trim(p_event_type),
    p_reference_id,
    COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object(
      'actor_user_id', p_user_id,
      'workspace_id', v_workspace.id
    )
  );

  INSERT INTO public.workspace_usage_events (
    workspace_id,
    user_id,
    event_type,
    entity_type,
    entity_id,
    credit_delta,
    metadata
  )
  VALUES (
    v_workspace.id,
    p_user_id,
    trim(p_event_type),
    COALESCE(p_metadata ->> 'source', p_event_type),
    p_reference_id,
    p_amount,
    COALESCE(p_metadata, '{}'::jsonb)
  );

  SELECT *
  INTO v_snapshot
  FROM public.workspace_member_snapshot(p_user_id, true)
  LIMIT 1;

  v_remaining := COALESCE(v_snapshot.credits_remaining, v_wallet.credits_remaining);
  RETURN QUERY SELECT true, v_remaining, 'Credits consumed';
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
  v_membership public.workspace_memberships%ROWTYPE;
  v_workspace public.workspaces%ROWTYPE;
  v_wallet public.credit_wallets%ROWTYPE;
  v_snapshot RECORD;
  v_remaining INTEGER;
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

  PERFORM public.ensure_workspace_membership(p_user_id);

  SELECT *
  INTO v_membership
  FROM public.workspace_memberships
  WHERE user_id = p_user_id;

  SELECT *
  INTO v_workspace
  FROM public.workspaces
  WHERE id = v_membership.workspace_id;

  PERFORM public.refresh_user_credit_wallet_internal(v_workspace.owner_user_id);

  SELECT *
  INTO v_wallet
  FROM public.credit_wallets cw
  WHERE cw.user_id = v_workspace.owner_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Workspace credit wallet not found';
  END IF;

  UPDATE public.credit_wallets cw
  SET
    credits_remaining = cw.credits_remaining + p_amount,
    credits_used = GREATEST(0, cw.credits_used - p_amount),
    updated_at = now()
  WHERE cw.user_id = v_workspace.owner_user_id
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
    v_workspace.owner_user_id,
    v_wallet.subscription_id,
    p_amount,
    v_wallet.credits_remaining,
    trim(p_event_type),
    p_reference_id,
    COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object(
      'actor_user_id', p_user_id,
      'workspace_id', v_workspace.id
    )
  );

  INSERT INTO public.workspace_usage_events (
    workspace_id,
    user_id,
    event_type,
    entity_type,
    entity_id,
    credit_delta,
    metadata
  )
  VALUES (
    v_workspace.id,
    p_user_id,
    trim(p_event_type),
    COALESCE(p_metadata ->> 'source', p_event_type),
    p_reference_id,
    -p_amount,
    COALESCE(p_metadata, '{}'::jsonb)
  );

  SELECT *
  INTO v_snapshot
  FROM public.workspace_member_snapshot(p_user_id, true)
  LIMIT 1;

  v_remaining := COALESCE(v_snapshot.credits_remaining, v_wallet.credits_remaining);
  RETURN QUERY SELECT v_remaining, 'Credits refunded';
END;
$$;

NOTIFY pgrst, 'reload schema';

CREATE OR REPLACE FUNCTION public.enforce_workspace_campaign_rules()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_snapshot RECORD;
  v_requires_approval BOOLEAN;
  v_active_count INTEGER;
  v_total_count INTEGER;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT public.workspace_has_permission(NEW.user_id, 'create_campaign') THEN
      RAISE EXCEPTION 'You do not have permission to create campaigns'
        USING ERRCODE = 'P0001';
    END IF;

    SELECT *
    INTO v_snapshot
    FROM public.workspace_member_snapshot(NEW.user_id, true)
    LIMIT 1;

    SELECT COUNT(*)::INTEGER
    INTO v_total_count
    FROM public.campaigns c
    WHERE c.user_id = NEW.user_id;

    IF v_snapshot.campaign_cap IS NOT NULL AND v_total_count >= v_snapshot.campaign_cap THEN
      RAISE EXCEPTION 'Campaign limit reached for your current plan (% campaigns). Upgrade to create more campaigns.', v_snapshot.campaign_cap
        USING ERRCODE = 'P0001';
    END IF;

    v_requires_approval := public.workspace_status_requires_approval(NEW.user_id, 'campaign');
    IF COALESCE(NEW.approval_status, '') = '' THEN
      NEW.approval_status := CASE WHEN v_requires_approval THEN 'draft' ELSE 'approved' END;
    END IF;

    IF NEW.approval_status = 'approved' AND NEW.approved_at IS NULL THEN
      NEW.approved_at := now();
      NEW.approved_by_user_id := NEW.user_id;
    END IF;
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    IF v_snapshot IS NULL THEN
      SELECT *
      INTO v_snapshot
      FROM public.workspace_member_snapshot(NEW.user_id, true)
      LIMIT 1;
    END IF;

    IF COALESCE(NEW.status, 'draft') IN ('ready', 'sending', 'paused', 'scheduled') THEN
      IF NOT public.workspace_has_permission(NEW.user_id, 'launch_campaign') THEN
        RAISE EXCEPTION 'You do not have permission to launch campaigns'
          USING ERRCODE = 'P0001';
      END IF;

      IF COALESCE(NEW.approval_status, 'draft') <> 'approved' THEN
        RAISE EXCEPTION 'Campaign launch is blocked until approval is granted'
          USING ERRCODE = 'P0001';
      END IF;

      SELECT COUNT(*)::INTEGER
      INTO v_active_count
      FROM public.campaigns c
      WHERE c.user_id = NEW.user_id
        AND COALESCE(c.status, 'draft') IN ('ready', 'sending', 'paused', 'scheduled')
        AND c.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);

      IF v_snapshot.campaign_cap IS NOT NULL AND v_active_count + 1 > v_snapshot.campaign_cap THEN
        RAISE EXCEPTION 'Active campaign limit reached for your workspace allocation (% campaigns).', v_snapshot.campaign_cap
          USING ERRCODE = 'P0001';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_workspace_email_config_rules()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_snapshot RECORD;
  v_requires_approval BOOLEAN;
  v_sender_count INTEGER;
  v_total_count INTEGER;
BEGIN
  IF NOT public.workspace_has_permission(NEW.user_id, 'manage_sender_accounts') THEN
    RAISE EXCEPTION 'You do not have permission to manage sender accounts'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT *
  INTO v_snapshot
  FROM public.workspace_member_snapshot(NEW.user_id, true)
  LIMIT 1;

  IF TG_OP = 'INSERT' THEN
    SELECT COUNT(*)::INTEGER
    INTO v_total_count
    FROM public.email_configs ec
    WHERE ec.user_id = NEW.user_id;

    IF v_snapshot.sender_cap IS NOT NULL AND v_total_count >= v_snapshot.sender_cap THEN
      RAISE EXCEPTION 'Mailbox limit reached for your current plan (% mailboxes). Upgrade to add more inboxes.', v_snapshot.sender_cap
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  v_requires_approval := public.workspace_status_requires_approval(NEW.user_id, 'sender_account');

  IF COALESCE(NEW.approval_status, '') = '' THEN
    NEW.approval_status := CASE WHEN v_requires_approval THEN 'draft' ELSE 'approved' END;
  END IF;

  IF v_requires_approval AND COALESCE(NEW.approval_status, 'draft') <> 'approved' THEN
    NEW.is_active := false;
  END IF;

  IF COALESCE(NEW.is_active, false) = true THEN
    IF COALESCE(NEW.approval_status, 'draft') <> 'approved' THEN
      RAISE EXCEPTION 'Sender activation is blocked until approval is granted'
        USING ERRCODE = 'P0001';
    END IF;

    SELECT COUNT(*)::INTEGER
    INTO v_sender_count
    FROM public.email_configs ec
    WHERE ec.user_id = NEW.user_id
      AND COALESCE(ec.is_active, true) = true
      AND ec.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);

    IF v_snapshot.sender_cap IS NOT NULL AND v_sender_count + 1 > v_snapshot.sender_cap THEN
      RAISE EXCEPTION 'Sender account limit reached for your workspace allocation (% sender accounts).', v_snapshot.sender_cap
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

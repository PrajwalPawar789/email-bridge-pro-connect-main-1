CREATE OR REPLACE FUNCTION public.get_approval_request_actions(
  p_request_id UUID
)
RETURNS TABLE (
  id UUID,
  action_type TEXT,
  status_from TEXT,
  status_to TEXT,
  comment TEXT,
  actor_user_id UUID,
  actor_name TEXT,
  actor_email TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_actor_membership public.workspace_memberships%ROWTYPE;
  v_request public.approval_requests%ROWTYPE;
BEGIN
  IF v_actor IS NULL OR p_request_id IS NULL THEN
    RETURN;
  END IF;

  PERFORM public.ensure_workspace_membership(v_actor);

  SELECT *
  INTO v_actor_membership
  FROM public.workspace_memberships wm
  WHERE wm.user_id = v_actor;

  SELECT *
  INTO v_request
  FROM public.approval_requests ar
  WHERE ar.id = p_request_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Approval request not found';
  END IF;
  IF v_request.workspace_id <> v_actor_membership.workspace_id THEN
    RAISE EXCEPTION 'Approval request is outside of your workspace';
  END IF;
  IF NOT public.workspace_user_in_scope(v_actor, v_request.requested_by_user_id)
    AND v_request.reviewer_user_id IS DISTINCT FROM v_actor
    AND NOT public.workspace_has_permission(v_actor, 'manage_workspace')
    AND NOT public.workspace_has_permission(v_actor, 'view_workspace_dashboard')
  THEN
    RAISE EXCEPTION 'Approval request is outside of your scope';
  END IF;

  RETURN QUERY
  SELECT
    aa.id,
    aa.action_type,
    aa.status_from,
    aa.status_to,
    aa.comment,
    aa.actor_user_id,
    actor.full_name,
    actor.email,
    aa.metadata,
    aa.created_at
  FROM public.approval_actions aa
  LEFT JOIN public.workspace_memberships actor ON actor.user_id = aa.actor_user_id
  WHERE aa.approval_request_id = p_request_id
  ORDER BY aa.created_at ASC;
END;
$$;

NOTIFY pgrst, 'reload schema';

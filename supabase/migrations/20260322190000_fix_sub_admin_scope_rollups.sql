CREATE OR REPLACE FUNCTION public.workspace_scope_user_ids(p_actor_user_id UUID DEFAULT auth.uid())
RETURNS TABLE(user_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_membership public.workspace_memberships%ROWTYPE;
  v_can_view_workspace BOOLEAN := false;
  v_can_view_team BOOLEAN := false;
BEGIN
  PERFORM public.ensure_workspace_membership(p_actor_user_id);

  SELECT *
  INTO v_membership
  FROM public.workspace_memberships actor_membership
  WHERE actor_membership.user_id = p_actor_user_id;

  IF NOT FOUND OR v_membership.status = 'disabled' THEN
    RETURN;
  END IF;

  v_can_view_workspace := public.workspace_has_permission(p_actor_user_id, 'view_workspace_dashboard')
    OR public.workspace_has_permission(p_actor_user_id, 'manage_workspace');
  v_can_view_team := public.workspace_has_permission(p_actor_user_id, 'view_team_dashboard')
    OR public.workspace_has_permission(p_actor_user_id, 'manage_workspace');

  IF v_membership.role = 'owner' THEN
    RETURN QUERY
    SELECT wm.user_id
    FROM public.workspace_memberships wm
    WHERE wm.workspace_id = v_membership.workspace_id;
    RETURN;
  END IF;

  IF v_membership.role = 'admin' AND v_can_view_workspace THEN
    RETURN QUERY
    SELECT wm.user_id
    FROM public.workspace_memberships wm
    WHERE wm.workspace_id = v_membership.workspace_id;
    RETURN;
  END IF;

  IF v_can_view_team OR v_membership.role IN ('admin', 'sub_admin') THEN
    RETURN QUERY
    WITH RECURSIVE scope_tree AS (
      SELECT wm.user_id
      FROM public.workspace_memberships wm
      WHERE wm.user_id = p_actor_user_id
      UNION ALL
      SELECT child.user_id
      FROM public.workspace_memberships child
      JOIN scope_tree parent_tree ON parent_tree.user_id = child.parent_user_id
      WHERE child.workspace_id = v_membership.workspace_id
    )
    SELECT DISTINCT scope_tree.user_id
    FROM scope_tree;
    RETURN;
  END IF;

  IF v_membership.role = 'reviewer' THEN
    RETURN QUERY
    SELECT DISTINCT wm.user_id
    FROM public.workspace_memberships wm
    WHERE wm.user_id = p_actor_user_id
      OR wm.assigned_reviewer_user_id = p_actor_user_id;
    RETURN;
  END IF;

  RETURN QUERY SELECT p_actor_user_id;
END;
$$;

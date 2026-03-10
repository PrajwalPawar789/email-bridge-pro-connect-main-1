// @ts-nocheck
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const buildCorsHeaders = (req?: Request) => ({
  "Access-Control-Allow-Origin": req?.headers.get("origin") || "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, accept, accept-language, content-language",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
  Vary: "Origin",
});

const jsonResponse = (payload: Record<string, unknown>, status = 200, req?: Request) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...buildCorsHeaders(req),
    },
  });

const getRuntimeConfig = () => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const appUrl = Deno.env.get("APP_URL") || Deno.env.get("SITE_URL") || "";

  return {
    supabaseUrl,
    supabaseServiceRoleKey,
    appUrl,
  };
};

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown error";
  }
};

const normalizeAppUrl = (value: string) => {
  const normalized = String(value || "").trim();
  if (!normalized) return "";

  try {
    const url = new URL(normalized);
    url.search = "";
    url.hash = "";
    url.pathname = url.pathname.replace(/\/+$/, "");
    return url.toString().replace(/\/+$/, "");
  } catch {
    return "";
  }
};

const resolveAppUrl = (req: Request, configuredAppUrl: string) => {
  const fromConfig = normalizeAppUrl(configuredAppUrl);
  if (fromConfig) return fromConfig;

  const fromOrigin = normalizeAppUrl(req.headers.get("origin") || "");
  if (fromOrigin) return fromOrigin;

  const referer = String(req.headers.get("referer") || "").trim();
  if (referer) {
    try {
      const url = new URL(referer);
      url.search = "";
      url.hash = "";
      url.pathname = "";
      return url.toString().replace(/\/+$/, "");
    } catch {
      // Ignore invalid referer values.
    }
  }

  return "";
};

const buildInviteRedirectTo = (appUrl: string) => {
  const normalized = normalizeAppUrl(appUrl);
  if (!normalized) return "";

  const url = new URL(normalized);
  url.pathname = `${url.pathname.replace(/\/+$/, "")}/auth/confirm`.replace(/\/{2,}/g, "/");
  url.search = "";
  url.hash = "";
  url.searchParams.set("next", "/auth?mode=invite");
  return url.toString();
};

const getBearerToken = (req: Request) => {
  const authHeader = req.headers.get("Authorization") || req.headers.get("authorization") || "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) return "";
  return authHeader.slice(7).trim();
};

const allowedRoles = new Set(["admin", "sub_admin", "user", "reviewer"]);

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: buildCorsHeaders(req) });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405, req);
  }

  try {
    const { supabaseUrl, supabaseServiceRoleKey, appUrl } = getRuntimeConfig();
    if (!supabaseUrl || !supabaseServiceRoleKey) {
      return jsonResponse(
        { error: "workspace-invite-member is missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" },
        500,
        req,
      );
    }

    const admin = createClient(supabaseUrl, supabaseServiceRoleKey);
    const token = getBearerToken(req);
    if (!token) {
      return jsonResponse({ error: "Missing bearer token" }, 401, req);
    }

    const { data: authData, error: authError } = await admin.auth.getUser(token);
    if (authError || !authData.user) {
      return jsonResponse({ error: "Unauthorized" }, 401, req);
    }

    const actor = authData.user;
    const payload = await req.json().catch(() => ({}));
    const email = String(payload.email || "").trim().toLowerCase();
    const fullName = String(payload.fullName || "").trim();
    const role = String(payload.role || "user").trim().toLowerCase();
    const assignedReviewerUserId = payload.assignedReviewerUserId
      ? String(payload.assignedReviewerUserId).trim()
      : "";
    const requestedParentUserId = payload.parentUserId
      ? String(payload.parentUserId).trim()
      : "";

    if (!email || !email.includes("@")) {
      return jsonResponse({ error: "A valid email is required" }, 400, req);
    }
    if (!allowedRoles.has(role)) {
      return jsonResponse({ error: "Invalid role" }, 400, req);
    }

    const { data: actorMembership, error: actorMembershipError } = await admin
      .from("workspace_memberships")
      .select("workspace_id, role, status")
      .eq("user_id", actor.id)
      .maybeSingle();

    if (actorMembershipError) {
      throw new Error(actorMembershipError.message);
    }
    if (!actorMembership) {
      return jsonResponse({ error: "Workspace membership not found" }, 403, req);
    }
    if (actorMembership.status === "disabled") {
      return jsonResponse({ error: "Your workspace membership is disabled" }, 403, req);
    }

    const requiresAdminPermission = role !== "user";
    const permissionName = requiresAdminPermission ? "create_admin" : "create_user";

    const [{ data: canCreate }, { data: canManageWorkspace }] = await Promise.all([
      admin.rpc("workspace_has_permission", {
        p_user_id: actor.id,
        p_permission: permissionName,
      }),
      admin.rpc("workspace_has_permission", {
        p_user_id: actor.id,
        p_permission: "manage_workspace",
      }),
    ]);

    if (!canCreate && !canManageWorkspace) {
      return jsonResponse({ error: "You do not have permission to invite this role" }, 403, req);
    }

    const [{ data: teamRolesEnabled }, { data: teamApprovalsEnabled }] = await Promise.all([
      admin.rpc("workspace_plan_supports_feature", {
        p_user_id: actor.id,
        p_feature: "team_roles",
      }),
      admin.rpc("workspace_plan_supports_feature", {
        p_user_id: actor.id,
        p_feature: "team_approvals",
      }),
    ]);

    if (!teamRolesEnabled) {
      return jsonResponse(
        { error: "Team member management requires the Growth plan or higher" },
        403,
        req,
      );
    }

    if (actorMembership.role !== "owner" && role !== "user") {
      return jsonResponse(
        { error: "Only workspace owners can invite admins, sub-admins, or reviewers" },
        403,
        req,
      );
    }
    if (
      !teamApprovalsEnabled &&
      (
        role === "reviewer" ||
        assignedReviewerUserId ||
        payload.requireCampaignApproval === true ||
        payload.requireSenderApproval === true ||
        payload.requireAutomationApproval === true
      )
    ) {
      return jsonResponse(
        { error: "Reviewer roles and approval policies require the Scale plan or higher" },
        403,
        req,
      );
    }

    let parentUserId = requestedParentUserId || actor.id;
    if (role === "admin" || role === "sub_admin" || role === "reviewer") {
      parentUserId = requestedParentUserId || actor.id;
    }

    if (!parentUserId) {
      return jsonResponse({ error: "A parent admin is required" }, 400, req);
    }

    const { data: parentMembership, error: parentError } = await admin
      .from("workspace_memberships")
      .select("user_id, workspace_id, role, status")
      .eq("user_id", parentUserId)
      .maybeSingle();

    if (parentError) {
      throw new Error(parentError.message);
    }
    if (!parentMembership || parentMembership.workspace_id !== actorMembership.workspace_id) {
      return jsonResponse({ error: "Parent admin is outside of your workspace" }, 400, req);
    }
    if (parentMembership.status === "disabled") {
      return jsonResponse({ error: "Parent admin is disabled" }, 400, req);
    }

    if (actorMembership.role !== "owner" && parentUserId !== actor.id) {
      return jsonResponse({ error: "Admins can only invite users under themselves" }, 403, req);
    }

    const allocationMetadata = {
      credits_allocated:
        payload.creditsAllocated === null || payload.creditsAllocated === undefined || payload.creditsAllocated === ""
          ? null
          : Number(payload.creditsAllocated),
      max_active_campaigns:
        payload.maxActiveCampaigns === null || payload.maxActiveCampaigns === undefined || payload.maxActiveCampaigns === ""
          ? null
          : Number(payload.maxActiveCampaigns),
      max_sender_accounts:
        payload.maxSenderAccounts === null || payload.maxSenderAccounts === undefined || payload.maxSenderAccounts === ""
          ? null
          : Number(payload.maxSenderAccounts),
      daily_send_limit:
        payload.dailySendLimit === null || payload.dailySendLimit === undefined || payload.dailySendLimit === ""
          ? null
          : Number(payload.dailySendLimit),
      max_automations:
        payload.maxAutomations === null || payload.maxAutomations === undefined || payload.maxAutomations === ""
          ? null
          : Number(payload.maxAutomations),
    };

    // Validate requested allocation with current parent and sibling capacity.
    const { error: allocationError } = await admin.rpc('workspace_validate_invite_allocation', {
      p_parent_user_id: parentUserId,
      p_credits_allocated: allocationMetadata.credits_allocated,
      p_max_active_campaigns: allocationMetadata.max_active_campaigns,
      p_max_sender_accounts: allocationMetadata.max_sender_accounts,
      p_daily_send_limit: allocationMetadata.daily_send_limit,
      p_max_automations: allocationMetadata.max_automations,
    });

    if (allocationError) {
      return jsonResponse({ error: getErrorMessage(allocationError) }, 400, req);
    }

    const inviteData = {
      workspace_id: actorMembership.workspace_id,
      workspace_role: role,
      invited_by_user_id: actor.id,
      parent_user_id: parentUserId,
      assigned_reviewer_user_id: assignedReviewerUserId || null,
      full_name: fullName || null,
      can_manage_billing: payload.canManageBilling === true,
      can_manage_workspace: payload.canManageWorkspace === true,
      extra_permissions: Array.isArray(payload.extraPermissions) ? payload.extraPermissions : [],
      revoked_permissions: Array.isArray(payload.revokedPermissions) ? payload.revokedPermissions : [],
      require_campaign_approval:
        payload.requireCampaignApproval === null || payload.requireCampaignApproval === undefined
          ? undefined
          : Boolean(payload.requireCampaignApproval),
      require_sender_approval:
        payload.requireSenderApproval === null || payload.requireSenderApproval === undefined
          ? undefined
          : Boolean(payload.requireSenderApproval),
      require_automation_approval:
        payload.requireAutomationApproval === null || payload.requireAutomationApproval === undefined
          ? undefined
          : Boolean(payload.requireAutomationApproval),
      ...allocationMetadata,
    };

    const inviteOptions: Record<string, unknown> = {
      data: inviteData,
    };
    const inviteRedirectTo = buildInviteRedirectTo(resolveAppUrl(req, appUrl));
    if (inviteRedirectTo) {
      inviteOptions.redirectTo = inviteRedirectTo;
    }

    const { data: inviteDataResult, error: inviteError } = await admin.auth.admin.inviteUserByEmail(
      email,
      inviteOptions,
    );

    if (inviteError) {
      throw new Error(inviteError.message);
    }

    return jsonResponse(
      {
        success: true,
        invitedUserId: inviteDataResult.user?.id || null,
        email,
        role,
        workspaceId: actorMembership.workspace_id,
      },
      200,
      req,
    );
  } catch (error) {
    console.error("workspace-invite-member failed", error);
    return jsonResponse({ error: getErrorMessage(error) }, 500, req);
  }
});

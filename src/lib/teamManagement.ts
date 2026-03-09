import { supabase } from "@/integrations/supabase/client";
export {
  approvalLabel,
  canActorInviteRole,
  getApprovalBadgeClass,
  getMemberStatusBadgeClass,
  getRoleBadgeClass,
  isValidApprovalTransition,
  normalizeTeamErrorMessage,
  roleLabel,
} from "./teamManagementHelpers.js";

export type WorkspaceRole = "owner" | "admin" | "sub_admin" | "user" | "reviewer";
export type MemberStatus = "active" | "invited" | "disabled";
export type ApprovalStatus =
  | "draft"
  | "pending_approval"
  | "approved"
  | "rejected"
  | "changes_requested";
export type ApprovalEntityType = "campaign" | "sender_account" | "automation";
export type ApprovalAction = "approved" | "rejected" | "changes_requested";

export type WorkspaceSnapshot = {
  creditsCap: number | null;
  creditsUsed: number;
  creditsRemaining: number;
  campaignCap: number | null;
  activeCampaigns: number;
  senderCap: number | null;
  activeSenders: number;
  dailySendCap: number | null;
  sendsToday: number;
  automationCap: number | null;
  liveAutomations: number;
};

export type WorkspaceContext = {
  workspaceId: string;
  workspaceName: string;
  approvalDelegateUserId: string | null;
  role: WorkspaceRole;
  status: MemberStatus;
  parentUserId: string | null;
  assignedReviewerUserId: string | null;
  canManageBilling: boolean;
  canManageWorkspace: boolean;
  permissions: string[];
  requiresApproval: {
    campaign: boolean;
    sender: boolean;
    automation: boolean;
  };
  snapshot: WorkspaceSnapshot;
};

export type WorkspaceMember = {
  user_id: string;
  email: string | null;
  full_name: string | null;
  role: WorkspaceRole;
  status: MemberStatus;
  parent_user_id: string | null;
  parent_name: string | null;
  parent_email: string | null;
  assigned_reviewer_user_id: string | null;
  credits_allocated: number | null;
  credits_used: number;
  credits_remaining: number;
  max_active_campaigns: number | null;
  active_campaigns: number;
  max_sender_accounts: number | null;
  active_senders: number;
  daily_send_limit: number | null;
  sends_today: number;
  max_automations: number | null;
  live_automations: number;
  permissions: string[];
  can_manage_billing: boolean;
  can_manage_workspace: boolean;
  require_campaign_approval: boolean;
  require_sender_approval: boolean;
  require_automation_approval: boolean;
  created_at: string;
};

export type WorkspaceApprovalRequest = {
  id: string;
  entity_type: ApprovalEntityType;
  entity_id: string;
  entity_name: string | null;
  requested_by_user_id: string;
  requested_by_name: string | null;
  requested_by_email: string | null;
  reviewer_user_id: string | null;
  reviewer_name: string | null;
  reviewer_email: string | null;
  status: ApprovalStatus;
  reason: string | null;
  comments: string | null;
  desired_status: string | null;
  created_at: string;
  resolved_at: string | null;
};

export type ApprovalTimelineEvent = {
  id: string;
  action_type: string;
  status_from: string | null;
  status_to: string | null;
  comment: string | null;
  actor_user_id: string;
  actor_name: string | null;
  actor_email: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

export type WorkspaceAuditEvent = {
  id: string;
  action_type: string;
  target_type: string;
  target_id: string;
  actor_user_id: string | null;
  actor_name: string | null;
  actor_email: string | null;
  before_json: Record<string, unknown> | null;
  after_json: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

export type WorkspaceDashboard = {
  scope: {
    workspaceId: string;
    days: number;
    since: string;
  };
  summary: {
    creditsCap: number | null;
    creditsUsed: number;
    creditsRemaining: number;
    campaignsDraft: number;
    campaignsActive: number;
    campaignsCompleted: number;
    senderAccounts: number;
    sendingVolume: number;
    openRate: number;
    replyRate: number;
    bounceRate: number;
    approvalPending: number;
    approvalChangesRequested: number;
  };
  members: Array<Record<string, unknown>>;
  approvalQueue: Array<Record<string, unknown>>;
  recentActivity: Array<Record<string, unknown>>;
};

export type WorkspaceSpendingRollup = {
  since: string;
  workspace: {
    creditsUsed: number;
    sends: number;
  };
  byManager: Array<{
    userId: string;
    name: string | null;
    email: string | null;
    role: WorkspaceRole;
    creditsUsed: number;
    sends: number;
  }>;
  byUser: Array<{
    userId: string;
    name: string | null;
    email: string | null;
    role: WorkspaceRole;
    creditsUsed: number;
    sends: number;
  }>;
};

export type InviteWorkspaceMemberInput = {
  email: string;
  fullName?: string;
  role: WorkspaceRole;
  parentUserId?: string | null;
  assignedReviewerUserId?: string | null;
  creditsAllocated?: number | null;
  maxActiveCampaigns?: number | null;
  maxSenderAccounts?: number | null;
  dailySendLimit?: number | null;
  maxAutomations?: number | null;
  canManageBilling?: boolean;
  canManageWorkspace?: boolean;
  extraPermissions?: string[];
  revokedPermissions?: string[];
  requireCampaignApproval?: boolean | null;
  requireSenderApproval?: boolean | null;
  requireAutomationApproval?: boolean | null;
};

export type UpdateWorkspaceMemberInput = {
  role?: WorkspaceRole | null;
  parentUserId?: string | null;
  status?: MemberStatus | null;
  assignedReviewerUserId?: string | null;
  canManageBilling?: boolean | null;
  canManageWorkspace?: boolean | null;
  extraPermissions?: string[] | null;
  revokedPermissions?: string[] | null;
  requireCampaignApproval?: boolean | null;
  requireSenderApproval?: boolean | null;
  requireAutomationApproval?: boolean | null;
  fullName?: string | null;
};

export type AllocationInput = {
  creditsAllocated?: number | null;
  maxActiveCampaigns?: number | null;
  maxSenderAccounts?: number | null;
  dailySendLimit?: number | null;
  maxAutomations?: number | null;
  metadata?: Record<string, unknown>;
};

const db = supabase as any;

const rewriteWorkspaceRpcError = (error: any, rpcName: string) => {
  const code = String(error?.code || "");
  const message = String(error?.message || "");

  if (code === "PGRST202" && message.includes(rpcName)) {
    throw new Error(
      "Workspace team-management migration is not applied on the connected Supabase database. Apply migration 20260309120000_add_workspace_team_management.sql and reload the schema cache."
    );
  }

  throw error;
};

const toSingle = <T>(value: unknown): T | null => {
  if (Array.isArray(value)) return (value[0] ?? null) as T | null;
  return (value ?? null) as T | null;
};

const toArray = <T>(value: unknown): T[] => {
  if (!value) return [];
  return Array.isArray(value) ? (value as T[]) : [value as T];
};

export async function getWorkspaceContext(): Promise<WorkspaceContext | null> {
  const { data, error } = await db.rpc("get_workspace_context");
  if (error) rewriteWorkspaceRpcError(error, "get_workspace_context");
  return toSingle<WorkspaceContext>(data);
}

export async function getWorkspaceMembers(): Promise<WorkspaceMember[]> {
  const { data, error } = await db.rpc("get_workspace_member_list");
  if (error) throw error;
  return toArray<WorkspaceMember>(data);
}

export async function getWorkspaceDashboard(filters: {
  days?: number;
  userFilter?: string | null;
  campaignStatus?: string | null;
  approvalStatus?: string | null;
} = {}): Promise<WorkspaceDashboard | null> {
  const { data, error } = await db.rpc("get_workspace_dashboard", {
    p_days: filters.days ?? 30,
    p_user_filter: filters.userFilter ?? null,
    p_campaign_status: filters.campaignStatus ?? null,
    p_approval_status: filters.approvalStatus ?? null,
  });
  if (error) throw error;
  return toSingle<WorkspaceDashboard>(data);
}

export async function getWorkspaceApprovalQueue(status?: string | null): Promise<WorkspaceApprovalRequest[]> {
  const { data, error } = await db.rpc("get_workspace_approval_queue", {
    p_status: status ?? null,
  });
  if (error) throw error;
  return toArray<WorkspaceApprovalRequest>(data);
}

export async function getApprovalRequestActions(requestId: string): Promise<ApprovalTimelineEvent[]> {
  const { data, error } = await db.rpc("get_approval_request_actions", {
    p_request_id: requestId,
  });
  if (error) throw error;
  return toArray<ApprovalTimelineEvent>(data);
}

export async function getWorkspaceAuditHistory(limit = 50): Promise<WorkspaceAuditEvent[]> {
  const { data, error } = await db.rpc("get_workspace_audit_history", {
    p_limit: limit,
  });
  if (error) throw error;
  return toArray<WorkspaceAuditEvent>(data);
}

export async function getWorkspaceSpendingRollup(days = 30): Promise<WorkspaceSpendingRollup | null> {
  const { data, error } = await db.rpc("get_workspace_spending_rollup", {
    p_days: days,
  });
  if (error) throw error;
  return toSingle<WorkspaceSpendingRollup>(data);
}

export async function inviteWorkspaceMember(input: InviteWorkspaceMemberInput) {
  const { data, error } = await supabase.functions.invoke("workspace-invite-member", {
    body: {
      email: input.email,
      fullName: input.fullName ?? "",
      role: input.role,
      parentUserId: input.parentUserId ?? null,
      assignedReviewerUserId: input.assignedReviewerUserId ?? null,
      creditsAllocated: input.creditsAllocated ?? null,
      maxActiveCampaigns: input.maxActiveCampaigns ?? null,
      maxSenderAccounts: input.maxSenderAccounts ?? null,
      dailySendLimit: input.dailySendLimit ?? null,
      maxAutomations: input.maxAutomations ?? null,
      canManageBilling: input.canManageBilling ?? false,
      canManageWorkspace: input.canManageWorkspace ?? false,
      extraPermissions: input.extraPermissions ?? [],
      revokedPermissions: input.revokedPermissions ?? [],
      requireCampaignApproval: input.requireCampaignApproval ?? null,
      requireSenderApproval: input.requireSenderApproval ?? null,
      requireAutomationApproval: input.requireAutomationApproval ?? null,
    },
  });

  if (error) throw error;
  if ((data as any)?.error) {
    throw new Error(String((data as any).error));
  }
  return data;
}

export async function updateWorkspaceMember(userId: string, input: UpdateWorkspaceMemberInput) {
  const { data, error } = await db.rpc("update_workspace_member", {
    p_target_user_id: userId,
    p_role: input.role ?? null,
    p_parent_user_id: input.parentUserId ?? null,
    p_status: input.status ?? null,
    p_assigned_reviewer_user_id: input.assignedReviewerUserId ?? null,
    p_can_manage_billing: input.canManageBilling ?? null,
    p_can_manage_workspace: input.canManageWorkspace ?? null,
    p_extra_permissions: input.extraPermissions ?? null,
    p_revoked_permissions: input.revokedPermissions ?? null,
    p_require_campaign_approval: input.requireCampaignApproval ?? null,
    p_require_sender_approval: input.requireSenderApproval ?? null,
    p_require_automation_approval: input.requireAutomationApproval ?? null,
    p_full_name: input.fullName ?? null,
  });
  if (error) throw error;
  return toSingle<WorkspaceMember>(data);
}

export async function setWorkspaceMemberAllocation(userId: string, input: AllocationInput) {
  const { data, error } = await db.rpc("set_workspace_member_allocation", {
    p_target_user_id: userId,
    p_credits_allocated: input.creditsAllocated ?? null,
    p_max_active_campaigns: input.maxActiveCampaigns ?? null,
    p_max_sender_accounts: input.maxSenderAccounts ?? null,
    p_daily_send_limit: input.dailySendLimit ?? null,
    p_max_automations: input.maxAutomations ?? null,
    p_metadata: input.metadata ?? {},
  });
  if (error) throw error;
  return data;
}

export async function submitApprovalRequest(
  entityType: ApprovalEntityType,
  entityId: string,
  options: {
    reason?: string | null;
    comments?: string | null;
    reviewerUserId?: string | null;
    metadata?: Record<string, unknown>;
  } = {},
) {
  const { data, error } = await db.rpc("submit_approval_request", {
    p_entity_type: entityType,
    p_entity_id: entityId,
    p_reason: options.reason ?? null,
    p_comments: options.comments ?? null,
    p_reviewer_user_id: options.reviewerUserId ?? null,
    p_metadata: options.metadata ?? {},
  });
  if (error) throw error;
  return toSingle<WorkspaceApprovalRequest>(data);
}

export async function reviewApprovalRequest(
  requestId: string,
  action: ApprovalAction,
  comment?: string | null,
) {
  const { data, error } = await db.rpc("review_approval_request", {
    p_request_id: requestId,
    p_action: action,
    p_comment: comment ?? null,
  });
  if (error) throw error;
  return toSingle<WorkspaceApprovalRequest>(data);
}

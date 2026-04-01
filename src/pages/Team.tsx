import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Activity,
  ArrowUpRight,
  BarChart3,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FileText,
  Filter,
  Loader2,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  TrendingUp,
  Users,
  Wallet,
  XCircle,
} from "lucide-react";
import DashboardLayout from "@/components/Layout/DashboardLayout";
import MemberEditorDialog from "@/components/team/MemberEditorDialog";
import ApprovalReviewDialog from "@/components/team/ApprovalReviewDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/providers/AuthProvider";
import { useWorkspace } from "@/providers/WorkspaceProvider";
import {
  getApprovalBadgeClass,
  getApprovalRequestActions,
  getMemberStatusBadgeClass,
  getRoleBadgeClass,
  getWorkspaceApprovalQueue,
  getWorkspaceAuditHistory,
  getWorkspaceDashboard,
  getWorkspaceMembers,
  getWorkspaceSpendingRollup,
  inviteWorkspaceMember,
  normalizeTeamErrorMessage,
  reviewApprovalRequest,
  roleLabel,
  setWorkspaceMemberAllocation,
  updateWorkspaceMember,
  type ApprovalAction,
  type ApprovalTimelineEvent,
  type WorkspaceApprovalRequest,
  type WorkspaceAuditEvent,
  type WorkspaceDashboard,
  type WorkspaceMember,
  type WorkspaceSpendingRollup,
} from "@/lib/teamManagement";

/* ─────────────────────────────────────────────
   DUMMY DATA — remove this block when wiring real APIs
   ───────────────────────────────────────────── */
const DUMMY_MEMBERS: WorkspaceMember[] = [
  {
    user_id: "u1",
    email: "sarah.chen@company.com",
    full_name: "Sarah Chen",
    role: "owner",
    status: "active",
    parent_user_id: null,
    parent_name: null,
    parent_email: null,
    assigned_reviewer_user_id: null,
    credits_allocated: 50000,
    credits_used: 12400,
    credits_remaining: 37600,
    max_active_campaigns: 20,
    active_campaigns: 8,
    max_sender_accounts: 10,
    active_senders: 5,
    daily_send_limit: 5000,
    sends_today: 1230,
    max_automations: 15,
    live_automations: 6,
    permissions: ["manage_workspace"],
    can_manage_billing: true,
    can_manage_workspace: true,
    require_campaign_approval: false,
    require_sender_approval: false,
    require_automation_approval: false,
    created_at: "2024-01-15T10:00:00Z",
    invited_by_user_id: null,
  },
  {
    user_id: "u2",
    email: "marcus.johnson@company.com",
    full_name: "Marcus Johnson",
    role: "admin",
    status: "active",
    parent_user_id: "u1",
    parent_name: "Sarah Chen",
    parent_email: "sarah.chen@company.com",
    assigned_reviewer_user_id: "u1",
    credits_allocated: 20000,
    credits_used: 17800,
    credits_remaining: 2200,
    max_active_campaigns: 10,
    active_campaigns: 9,
    max_sender_accounts: 5,
    active_senders: 4,
    daily_send_limit: 2000,
    sends_today: 1850,
    max_automations: 8,
    live_automations: 7,
    permissions: ["create_user", "approve_campaign"],
    can_manage_billing: false,
    can_manage_workspace: false,
    require_campaign_approval: false,
    require_sender_approval: true,
    require_automation_approval: true,
    created_at: "2024-02-20T10:00:00Z",
    invited_by_user_id: "u1",
  },
  {
    user_id: "u3",
    email: "priya.patel@company.com",
    full_name: "Priya Patel",
    role: "sub_admin",
    status: "active",
    parent_user_id: "u2",
    parent_name: "Marcus Johnson",
    parent_email: "marcus.johnson@company.com",
    assigned_reviewer_user_id: "u2",
    credits_allocated: 8000,
    credits_used: 4200,
    credits_remaining: 3800,
    max_active_campaigns: 5,
    active_campaigns: 3,
    max_sender_accounts: 3,
    active_senders: 2,
    daily_send_limit: 800,
    sends_today: 320,
    max_automations: 4,
    live_automations: 2,
    permissions: ["create_user"],
    can_manage_billing: false,
    can_manage_workspace: false,
    require_campaign_approval: true,
    require_sender_approval: true,
    require_automation_approval: true,
    created_at: "2024-03-10T10:00:00Z",
    invited_by_user_id: "u2",
  },
  {
    user_id: "u4",
    email: "alex.rivera@company.com",
    full_name: "Alex Rivera",
    role: "user",
    status: "active",
    parent_user_id: "u2",
    parent_name: "Marcus Johnson",
    parent_email: "marcus.johnson@company.com",
    assigned_reviewer_user_id: "u2",
    credits_allocated: 5000,
    credits_used: 1200,
    credits_remaining: 3800,
    max_active_campaigns: 3,
    active_campaigns: 1,
    max_sender_accounts: 2,
    active_senders: 1,
    daily_send_limit: 500,
    sends_today: 89,
    max_automations: 2,
    live_automations: 0,
    permissions: [],
    can_manage_billing: false,
    can_manage_workspace: false,
    require_campaign_approval: true,
    require_sender_approval: true,
    require_automation_approval: true,
    created_at: "2024-04-05T10:00:00Z",
    invited_by_user_id: "u2",
  },
  {
    user_id: "u5",
    email: "emma.wilson@company.com",
    full_name: "Emma Wilson",
    role: "reviewer",
    status: "active",
    parent_user_id: "u1",
    parent_name: "Sarah Chen",
    parent_email: "sarah.chen@company.com",
    assigned_reviewer_user_id: null,
    credits_allocated: null,
    credits_used: 0,
    credits_remaining: 0,
    max_active_campaigns: null,
    active_campaigns: 0,
    max_sender_accounts: null,
    active_senders: 0,
    daily_send_limit: null,
    sends_today: 0,
    max_automations: null,
    live_automations: 0,
    permissions: ["approve_campaign", "approve_sender"],
    can_manage_billing: false,
    can_manage_workspace: false,
    require_campaign_approval: false,
    require_sender_approval: false,
    require_automation_approval: false,
    created_at: "2024-05-12T10:00:00Z",
    invited_by_user_id: "u1",
  },
  {
    user_id: "u6",
    email: "tom.bradley@company.com",
    full_name: "Tom Bradley",
    role: "user",
    status: "invited",
    parent_user_id: "u3",
    parent_name: "Priya Patel",
    parent_email: "priya.patel@company.com",
    assigned_reviewer_user_id: "u3",
    credits_allocated: 3000,
    credits_used: 0,
    credits_remaining: 3000,
    max_active_campaigns: 2,
    active_campaigns: 0,
    max_sender_accounts: 1,
    active_senders: 0,
    daily_send_limit: 300,
    sends_today: 0,
    max_automations: 1,
    live_automations: 0,
    permissions: [],
    can_manage_billing: false,
    can_manage_workspace: false,
    require_campaign_approval: true,
    require_sender_approval: true,
    require_automation_approval: true,
    created_at: "2025-03-28T10:00:00Z",
    invited_by_user_id: "u3",
  },
  {
    user_id: "u7",
    email: "nina.kowalski@company.com",
    full_name: "Nina Kowalski",
    role: "user",
    status: "disabled",
    parent_user_id: "u2",
    parent_name: "Marcus Johnson",
    parent_email: "marcus.johnson@company.com",
    assigned_reviewer_user_id: "u2",
    credits_allocated: 4000,
    credits_used: 3900,
    credits_remaining: 100,
    max_active_campaigns: 3,
    active_campaigns: 0,
    max_sender_accounts: 2,
    active_senders: 0,
    daily_send_limit: 400,
    sends_today: 0,
    max_automations: 2,
    live_automations: 0,
    permissions: [],
    can_manage_billing: false,
    can_manage_workspace: false,
    require_campaign_approval: true,
    require_sender_approval: true,
    require_automation_approval: true,
    created_at: "2024-06-01T10:00:00Z",
    invited_by_user_id: "u2",
  },
];

const DUMMY_APPROVALS: WorkspaceApprovalRequest[] = [
  {
    id: "a1",
    entity_type: "campaign" as any,
    entity_id: "c1",
    entity_name: "Q1 Product Launch Outreach",
    status: "pending_approval" as any,
    requested_by_user_id: "u4",
    requested_by_name: "Alex Rivera",
    requested_by_email: "alex.rivera@company.com",
    reviewer_user_id: "u2",
    created_at: "2025-03-29T14:30:00Z",
    updated_at: "2025-03-29T14:30:00Z",
  },
  {
    id: "a2",
    entity_type: "sender_account" as any,
    entity_id: "s1",
    entity_name: "support@outreach.io",
    status: "pending_approval" as any,
    requested_by_user_id: "u3",
    requested_by_name: "Priya Patel",
    requested_by_email: "priya.patel@company.com",
    reviewer_user_id: "u2",
    created_at: "2025-03-28T09:15:00Z",
    updated_at: "2025-03-28T09:15:00Z",
  },
  {
    id: "a3",
    entity_type: "automation" as any,
    entity_id: "auto1",
    entity_name: "Welcome Drip Sequence",
    status: "changes_requested" as any,
    requested_by_user_id: "u4",
    requested_by_name: "Alex Rivera",
    requested_by_email: "alex.rivera@company.com",
    reviewer_user_id: "u5",
    created_at: "2025-03-26T11:00:00Z",
    updated_at: "2025-03-27T16:45:00Z",
  },
  {
    id: "a4",
    entity_type: "campaign" as any,
    entity_id: "c2",
    entity_name: "Partner Re-engagement Series",
    status: "approved" as any,
    requested_by_user_id: "u3",
    requested_by_name: "Priya Patel",
    requested_by_email: "priya.patel@company.com",
    reviewer_user_id: "u5",
    created_at: "2025-03-25T08:00:00Z",
    updated_at: "2025-03-26T10:30:00Z",
  },
  {
    id: "a5",
    entity_type: "campaign" as any,
    entity_id: "c3",
    entity_name: "Cold Outreach — EMEA Tier 2",
    status: "rejected" as any,
    requested_by_user_id: "u4",
    requested_by_name: "Alex Rivera",
    requested_by_email: "alex.rivera@company.com",
    reviewer_user_id: "u2",
    created_at: "2025-03-22T13:00:00Z",
    updated_at: "2025-03-23T09:00:00Z",
  },
];

const DUMMY_AUDIT: WorkspaceAuditEvent[] = [
  { id: "ev1", action_type: "member_invited", target_type: "member", target_id: "u6", actor_name: "Priya Patel", actor_email: "priya.patel@company.com", created_at: "2025-03-28T10:00:00Z", metadata: {} },
  { id: "ev2", action_type: "role_changed", target_type: "member", target_id: "u3", actor_name: "Sarah Chen", actor_email: "sarah.chen@company.com", created_at: "2025-03-27T15:30:00Z", metadata: { from: "user", to: "sub_admin" } },
  { id: "ev3", action_type: "approval_reviewed", target_type: "campaign", target_id: "c2", actor_name: "Emma Wilson", actor_email: "emma.wilson@company.com", created_at: "2025-03-26T10:30:00Z", metadata: { action: "approved" } },
  { id: "ev4", action_type: "allocation_updated", target_type: "member", target_id: "u4", actor_name: "Marcus Johnson", actor_email: "marcus.johnson@company.com", created_at: "2025-03-25T14:00:00Z", metadata: {} },
  { id: "ev5", action_type: "member_disabled", target_type: "member", target_id: "u7", actor_name: "Marcus Johnson", actor_email: "marcus.johnson@company.com", created_at: "2025-03-24T09:00:00Z", metadata: {} },
  { id: "ev6", action_type: "approval_reviewed", target_type: "campaign", target_id: "c3", actor_name: "Marcus Johnson", actor_email: "marcus.johnson@company.com", created_at: "2025-03-23T09:00:00Z", metadata: { action: "rejected" } },
];

const DUMMY_SPENDING: WorkspaceSpendingRollup = {
  workspace: { creditsUsed: 39500, sends: 28400 },
  since: "2025-03-01T00:00:00Z",
  byManager: [
    { userId: "u1", name: "Sarah Chen", email: "sarah.chen@company.com", role: "owner" as any, creditsUsed: 12400, sends: 8900 },
    { userId: "u2", name: "Marcus Johnson", email: "marcus.johnson@company.com", role: "admin" as any, creditsUsed: 17800, sends: 12500 },
    { userId: "u3", name: "Priya Patel", email: "priya.patel@company.com", role: "sub_admin" as any, creditsUsed: 4200, sends: 3200 },
  ],
  byUser: [
    { userId: "u1", name: "Sarah Chen", email: "sarah.chen@company.com", role: "owner" as any, creditsUsed: 12400, sends: 8900 },
    { userId: "u2", name: "Marcus Johnson", email: "marcus.johnson@company.com", role: "admin" as any, creditsUsed: 17800, sends: 12500 },
    { userId: "u3", name: "Priya Patel", email: "priya.patel@company.com", role: "sub_admin" as any, creditsUsed: 4200, sends: 3200 },
    { userId: "u4", name: "Alex Rivera", email: "alex.rivera@company.com", role: "user" as any, creditsUsed: 1200, sends: 890 },
    { userId: "u7", name: "Nina Kowalski", email: "nina.kowalski@company.com", role: "user" as any, creditsUsed: 3900, sends: 2910 },
  ],
};

const DUMMY_DASHBOARD: WorkspaceDashboard = {
  summary: {
    creditsRemaining: 37600,
    creditsUsed: 39500,
    campaignsActive: 12,
    campaignsDraft: 4,
    approvalPending: 2,
    approvalChangesRequested: 1,
  },
  recentActivity: [
    { id: "ra1", actionType: "campaign_launched", actorName: "Alex Rivera", actorEmail: "alex.rivera@company.com" },
    { id: "ra2", actionType: "member_invited", actorName: "Priya Patel", actorEmail: "priya.patel@company.com" },
    { id: "ra3", actionType: "sender_verified", actorName: "Marcus Johnson", actorEmail: "marcus.johnson@company.com" },
    { id: "ra4", actionType: "approval_submitted", actorName: "Alex Rivera", actorEmail: "alex.rivera@company.com" },
  ],
};

const USE_DUMMY = false;
/* ───────────────── END DUMMY DATA ───────────────── */

// ─── Helpers ────────────────────────────────────────
const initials = (name: string | null, email: string | null) => {
  if (name) {
    const parts = name.trim().split(/\s+/);
    return parts.length >= 2
      ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : parts[0].slice(0, 2).toUpperCase();
  }
  return (email || "??").slice(0, 2).toUpperCase();
};

const avatarColor = (id: string) => {
  const colors = [
    "bg-gradient-to-br from-violet-500 to-purple-600",
    "bg-gradient-to-br from-sky-500 to-blue-600",
    "bg-gradient-to-br from-emerald-500 to-teal-600",
    "bg-gradient-to-br from-amber-500 to-orange-600",
    "bg-gradient-to-br from-rose-500 to-pink-600",
    "bg-gradient-to-br from-cyan-500 to-blue-500",
    "bg-gradient-to-br from-fuchsia-500 to-purple-500",
  ];
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
};

const timeAgo = (dateStr: string) => {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
};

const utilizationColor = (pct: number) => {
  if (pct >= 90) return "text-rose-600";
  if (pct >= 75) return "text-amber-600";
  return "text-emerald-600";
};

const utilizationBarColor = (pct: number) => {
  if (pct >= 90) return "bg-rose-500";
  if (pct >= 75) return "bg-amber-500";
  return "bg-emerald-500";
};

const roleIconColor = (role: string) => {
  switch (role) {
    case "owner": return "from-amber-400 to-amber-600";
    case "admin": return "from-emerald-400 to-emerald-600";
    case "sub_admin": return "from-sky-400 to-sky-600";
    case "reviewer": return "from-violet-400 to-violet-600";
    default: return "from-slate-400 to-slate-500";
  }
};

// ─── Circular Progress Component ─────────────────
const CircleProgress = ({ value, size = 44, strokeWidth = 4, className = "" }: { value: number; size?: number; strokeWidth?: number; className?: string }) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.min(value, 100) / 100) * circumference;
  const color = value >= 90 ? "stroke-rose-500" : value >= 75 ? "stroke-amber-500" : "stroke-emerald-500";

  return (
    <svg width={size} height={size} className={className}>
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={strokeWidth} className="stroke-slate-100" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        className={`${color} transition-all duration-700 ease-out`}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" className="fill-slate-700 text-[10px] font-semibold">
        {Math.round(value)}%
      </text>
    </svg>
  );
};

// ─── Avatar Component ────────────────────────────
const Avatar = ({ name, email, id, size = "md" }: { name: string | null; email: string | null; id: string; size?: "sm" | "md" | "lg" }) => {
  const sizeClasses = { sm: "h-8 w-8 text-xs", md: "h-10 w-10 text-sm", lg: "h-12 w-12 text-base" };
  return (
    <div className={`${sizeClasses[size]} ${avatarColor(id)} rounded-full flex items-center justify-center text-white font-semibold shadow-sm ring-2 ring-white shrink-0`}>
      {initials(name, email)}
    </div>
  );
};

// ─── Stat Card Component ─────────────────────────
const StatCard = ({ icon: Icon, label, value, helper, trend }: { icon: any; label: string; value: string; helper: string; trend?: "up" | "down" | null }) => (
  <div className="group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm hover:shadow-md transition-all duration-300">
    <div className="flex items-start justify-between">
      <div className="space-y-3">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        <p className="text-3xl font-bold tracking-tight text-slate-900">{value}</p>
        <div className="flex items-center gap-1.5">
          {trend === "up" && <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />}
          {trend === "down" && <TrendingUp className="h-3.5 w-3.5 text-rose-500 rotate-180" />}
          <p className="text-xs text-slate-500">{helper}</p>
        </div>
      </div>
      <div className="rounded-xl bg-slate-50 p-2.5 group-hover:bg-slate-100 transition-colors">
        <Icon className="h-5 w-5 text-slate-400" />
      </div>
    </div>
  </div>
);

// ─── Main Component ──────────────────────────────
const Team = () => {
  const { user, loading: authLoading } = useAuth();
  const { workspace, loading: workspaceLoading, error: workspaceError, refresh: refreshWorkspace, hasPermission } = useWorkspace();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [members, setMembers] = useState<WorkspaceMember[]>(USE_DUMMY ? DUMMY_MEMBERS : []);
  const [dashboard, setDashboard] = useState<WorkspaceDashboard | null>(USE_DUMMY ? DUMMY_DASHBOARD : null);
  const [approvals, setApprovals] = useState<WorkspaceApprovalRequest[]>(USE_DUMMY ? DUMMY_APPROVALS : []);
  const [auditEvents, setAuditEvents] = useState<WorkspaceAuditEvent[]>(USE_DUMMY ? DUMMY_AUDIT : []);
  const [spendingRollup, setSpendingRollup] = useState<WorkspaceSpendingRollup | null>(USE_DUMMY ? DUMMY_SPENDING : null);
  const [approvalTimeline, setApprovalTimeline] = useState<ApprovalTimelineEvent[]>([]);
  const [selectedApproval, setSelectedApproval] = useState<WorkspaceApprovalRequest | null>(null);
  const [selectedMember, setSelectedMember] = useState<WorkspaceMember | null>(null);

  const [days, setDays] = useState("30");
  const [approvalFilter, setApprovalFilter] = useState("all");
  const [memberSearch, setMemberSearch] = useState("");
  const [memberRoleFilter, setMemberRoleFilter] = useState("all");
  const [memberStatusFilter, setMemberStatusFilter] = useState("all");
  const [loadingData, setLoadingData] = useState(false);
  const [memberDialogMode, setMemberDialogMode] = useState<"invite" | "edit">("invite");
  const [memberDialogOpen, setMemberDialogOpen] = useState(false);
  const [memberDialogBusy, setMemberDialogBusy] = useState(false);
  const [approvalDialogOpen, setApprovalDialogOpen] = useState(false);
  const [approvalDialogBusy, setApprovalDialogBusy] = useState(false);

  const activeTab = searchParams.get("tab") || "overview";
  const teamRolesEnabled = workspace ? workspace.planFeatures?.teamRoles !== false : true;
  const teamApprovalsEnabled = workspace ? workspace.planFeatures?.teamApprovals !== false : true;
  const auditLogsEnabled = workspace ? workspace.planFeatures?.auditLogs !== false : true;
  const canViewDashboard =
    teamRolesEnabled &&
    (hasPermission("view_workspace_dashboard") ||
      hasPermission("view_team_dashboard") ||
      hasPermission("manage_workspace"));
  const canManageMembers =
    teamRolesEnabled &&
    (workspace?.role === "owner" || workspace?.role === "admin") &&
    (hasPermission("manage_workspace") || hasPermission("create_user") || hasPermission("create_admin"));
  const canReviewApprovals =
    teamApprovalsEnabled &&
    (hasPermission("manage_workspace") ||
      hasPermission("approve_campaign") ||
      hasPermission("approve_sender"));
  const canViewAudit =
    auditLogsEnabled && (hasPermission("manage_workspace") || hasPermission("view_audit_logs"));
  const availableTabs = useMemo(() => {
    const tabs = ["overview", "members", "spending"];
    if (teamApprovalsEnabled) tabs.push("approvals");
    if (auditLogsEnabled) tabs.push("audit");
    return tabs;
  }, [auditLogsEnabled, teamApprovalsEnabled]);

  const handleTabChange = useCallback(
    (tab: string) => {
      if (tab === "home") navigate("/dashboard");
      else if (tab === "campaigns") navigate("/campaigns");
      else if (tab === "inbox") navigate("/inbox");
      else if (tab === "automations") navigate("/automations");
      else if (tab === "pipeline") navigate("/pipeline");
      else if (
        tab === "contacts" ||
        tab === "segments" ||
        tab === "templates" ||
        tab === "connect" ||
        tab === "settings"
      ) {
        navigate(`/dashboard?tab=${tab}`);
      } else {
        navigate(`/${tab}`);
      }
    },
    [navigate],
  );

  const loadData = useCallback(async () => {
    if (USE_DUMMY) return;
    if (!user?.id || !workspace) return;

    setLoadingData(true);
    try {
      const [memberRows, dashboardRow, approvalRows, auditRows, spendingRow] = await Promise.all([
        canManageMembers || canViewDashboard ? getWorkspaceMembers() : Promise.resolve([]),
        canViewDashboard
          ? getWorkspaceDashboard({
              days: Number(days),
              approvalStatus: approvalFilter === "all" ? null : approvalFilter,
            })
          : Promise.resolve(null),
        teamApprovalsEnabled && (canViewDashboard || canReviewApprovals)
          ? getWorkspaceApprovalQueue(approvalFilter === "all" ? null : approvalFilter)
          : Promise.resolve([]),
        canViewAudit ? getWorkspaceAuditHistory(80) : Promise.resolve([]),
        canViewDashboard ? getWorkspaceSpendingRollup(Number(days)) : Promise.resolve(null),
      ]);

      setMembers(memberRows);
      setDashboard(dashboardRow);
      setApprovals(approvalRows);
      setAuditEvents(auditRows);
      setSpendingRollup(spendingRow);
    } catch (error) {
      toast({
        title: "Failed to load workspace data",
        description: normalizeTeamErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setLoadingData(false);
    }
  }, [approvalFilter, canManageMembers, canReviewApprovals, canViewAudit, canViewDashboard, days, teamApprovalsEnabled, user?.id, workspace]);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth");
    }
  }, [authLoading, navigate, user]);

  useEffect(() => {
    if (user && workspace) {
      void loadData();
    }
  }, [loadData, user, workspace]);

  useEffect(() => {
    if (availableTabs.includes(activeTab)) return;
    setSearchParams({ tab: availableTabs[0] || "overview" }, { replace: true });
  }, [activeTab, availableTabs, setSearchParams]);

  // ─── Computed Data ──────────────────────────────
  const summaryCards = useMemo(() => {
    const summary = dashboard?.summary;
    return [
      {
        label: "Credits Remaining",
        value: Number(summary?.creditsRemaining ?? workspace?.snapshot.creditsRemaining ?? 0).toLocaleString(),
        helper: `${Number(summary?.creditsUsed ?? workspace?.snapshot.creditsUsed ?? 0).toLocaleString()} used this period`,
        icon: Wallet,
        trend: "up" as const,
      },
      {
        label: "Active Campaigns",
        value: Number(summary?.campaignsActive ?? 0).toLocaleString(),
        helper: `${Number(summary?.campaignsDraft ?? 0).toLocaleString()} in draft`,
        icon: Activity,
        trend: "up" as const,
      },
      teamApprovalsEnabled
        ? {
            label: "Pending Approvals",
            value: Number(summary?.approvalPending ?? 0).toLocaleString(),
            helper: `${Number(summary?.approvalChangesRequested ?? 0).toLocaleString()} need changes`,
            icon: ShieldCheck,
            trend: null,
          }
        : {
            label: "Sends Today",
            value: Number(workspace?.snapshot.sendsToday ?? 0).toLocaleString(),
            helper:
              workspace?.snapshot.dailySendCap == null
                ? "Unlimited daily cap"
                : `${Number(workspace.snapshot.dailySendCap).toLocaleString()} daily cap`,
            icon: Clock3,
            trend: null,
          },
      {
        label: "Team Members",
        value: members.length.toLocaleString(),
        helper: `${members.filter((m) => m.status === "active").length} active`,
        icon: Users,
        trend: null,
      },
    ];
  }, [dashboard?.summary, members, teamApprovalsEnabled, workspace]);

  const highUtilizationMembers = useMemo(
    () =>
      members.filter((m) => {
        if (!m.credits_allocated || m.credits_allocated <= 0) return false;
        return (m.credits_used / m.credits_allocated) * 100 >= 80;
      }),
    [members],
  );

  const filteredMembers = useMemo(() => {
    let list = members;
    if (memberSearch) {
      const q = memberSearch.toLowerCase();
      list = list.filter(
        (m) =>
          (m.full_name || "").toLowerCase().includes(q) ||
          (m.email || "").toLowerCase().includes(q),
      );
    }
    if (memberRoleFilter !== "all") list = list.filter((m) => m.role === memberRoleFilter);
    if (memberStatusFilter !== "all") list = list.filter((m) => m.status === memberStatusFilter);
    return list;
  }, [members, memberSearch, memberRoleFilter, memberStatusFilter]);

  const filteredApprovals = useMemo(() => {
    if (approvalFilter === "all") return approvals;
    return approvals.filter((a) => a.status === approvalFilter);
  }, [approvals, approvalFilter]);

  // ─── Handlers ───────────────────────────────────
  const openInviteDialog = () => {
    setSelectedMember(null);
    setMemberDialogMode("invite");
    setMemberDialogOpen(true);
  };

  const openEditDialog = (member: WorkspaceMember) => {
    setSelectedMember(member);
    setMemberDialogMode("edit");
    setMemberDialogOpen(true);
  };

  const canEditMember = useCallback(
    (member: WorkspaceMember) => {
      if (!canManageMembers) return false;
      if (workspace?.role === "owner") return true;
      return workspace?.role === "admin" && member.role === "user";
    },
    [canManageMembers, workspace?.role],
  );

  const handleInvite = async (payload: Parameters<typeof inviteWorkspaceMember>[0]) => {
    setMemberDialogBusy(true);
    try {
      await inviteWorkspaceMember(payload);
      toast({ title: "Invite sent", description: `${payload.email} was invited to the workspace.` });
      try {
        await Promise.all([refreshWorkspace(), loadData()]);
      } catch (refreshError) {
        toast({ title: "Invite sent, refresh failed", description: normalizeTeamErrorMessage(refreshError), variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Invite failed", description: normalizeTeamErrorMessage(error), variant: "destructive" });
      throw error;
    } finally {
      setMemberDialogBusy(false);
    }
  };

  const handleMemberUpdate = async (
    userId: string,
    memberInput: Parameters<typeof updateWorkspaceMember>[1],
    allocationInput: Parameters<typeof setWorkspaceMemberAllocation>[1],
  ) => {
    setMemberDialogBusy(true);
    try {
      const currentMember = members.find((m) => m.user_id === userId) || null;
      const currentSenderAllocation = currentMember?.max_sender_accounts ?? null;
      const nextSenderAllocation = allocationInput.maxSenderAccounts === undefined ? currentSenderAllocation : allocationInput.maxSenderAccounts;
      const isParentChanging = memberInput.parentUserId !== undefined && (memberInput.parentUserId ?? null) !== (currentMember?.parent_user_id ?? null);
      const isSenderAllocationReducing = currentSenderAllocation !== null && nextSenderAllocation !== null && nextSenderAllocation < currentSenderAllocation;

      if (isParentChanging && isSenderAllocationReducing) {
        await setWorkspaceMemberAllocation(userId, allocationInput);
        await updateWorkspaceMember(userId, memberInput);
      } else {
        await updateWorkspaceMember(userId, memberInput);
        await setWorkspaceMemberAllocation(userId, allocationInput);
      }
      await Promise.all([refreshWorkspace(), loadData()]);
      toast({ title: "Member updated", description: "Role, hierarchy, and allocation changes were saved." });
    } catch (error) {
      toast({ title: "Update failed", description: normalizeTeamErrorMessage(error), variant: "destructive" });
      throw error;
    } finally {
      setMemberDialogBusy(false);
    }
  };

  const openApprovalDialog = async (request: WorkspaceApprovalRequest) => {
    setSelectedApproval(request);
    setApprovalDialogOpen(true);
    try {
      setApprovalTimeline(await getApprovalRequestActions(request.id));
    } catch {
      setApprovalTimeline([]);
    }
  };

  const handleApprovalReview = async (action: ApprovalAction, comment: string) => {
    if (!selectedApproval) return;
    setApprovalDialogBusy(true);
    try {
      await reviewApprovalRequest(selectedApproval.id, action, comment);
      await Promise.all([refreshWorkspace(), loadData()]);
      toast({ title: "Approval updated", description: `${selectedApproval.entity_name || selectedApproval.entity_type} was ${action.replace(/_/g, " ")}.` });
    } catch (error) {
      toast({ title: "Review failed", description: normalizeTeamErrorMessage(error), variant: "destructive" });
      throw error;
    } finally {
      setApprovalDialogBusy(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  // ─── Loading / Auth Guards ──────────────────────
  if (authLoading || workspaceLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
          <p className="text-sm text-slate-500 animate-pulse">Loading workspace…</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  if (!workspace) {
    return (
      <DashboardLayout activeTab="team" onTabChange={handleTabChange} user={user} onLogout={handleLogout}>
        <div className="flex min-h-[60vh] items-center justify-center">
          <Card className="max-w-md border-slate-200">
            <CardContent className="pt-8 pb-8 text-center space-y-4">
              <div className="mx-auto w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center">
                <Users className="h-6 w-6 text-slate-400" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Workspace Unavailable</h3>
                <p className="text-sm text-slate-500 mt-2">{workspaceError || "We couldn't load your workspace. Please refresh or sign in again."}</p>
              </div>
              <Button onClick={() => window.location.reload()}>Refresh Page</Button>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  if (!teamRolesEnabled) {
    return (
      <DashboardLayout activeTab="team" onTabChange={handleTabChange} user={user} onLogout={handleLogout}>
        <div className="flex min-h-[60vh] items-center justify-center">
          <Card className="max-w-md border-slate-200">
            <CardContent className="pt-8 pb-8 text-center space-y-4">
              <div className="mx-auto w-14 h-14 rounded-full bg-gradient-to-br from-amber-100 to-amber-200 flex items-center justify-center">
                <ShieldCheck className="h-7 w-7 text-amber-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Upgrade to Unlock Teams</h3>
                <p className="text-sm text-slate-500 mt-2">Team roles, scoped allocations, and workspace management start on the Growth plan.</p>
              </div>
              <div className="flex gap-3 justify-center">
                <Button onClick={() => navigate("/subscription")}>View Plans</Button>
                <Button variant="outline" onClick={() => navigate("/dashboard")}>Back to Dashboard</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  // ─── Render ─────────────────────────────────────
  return (
    <DashboardLayout activeTab="team" onTabChange={handleTabChange} user={user} onLogout={handleLogout}>
      <div className="space-y-6 pb-8">
        {/* ━━━ Page Header ━━━ */}
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5 mb-2">
              <Badge className={`${getRoleBadgeClass(workspace.role)} text-xs`}>{roleLabel(workspace.role)}</Badge>
              <span className="text-xs text-slate-400">•</span>
              <span className="text-xs text-slate-500 font-medium">{workspace.workspaceName}</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">Team</h1>
            <p className="text-sm text-slate-500 max-w-lg">Manage members, review approvals, and monitor resource utilization across your workspace.</p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={days} onValueChange={setDays}>
              <SelectTrigger className="w-[130px] bg-white border-slate-200 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Last 7 days</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
                <SelectItem value="90">Last 90 days</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon" onClick={() => void loadData()} disabled={loadingData} className="shrink-0">
              <RefreshCw className={`h-4 w-4 ${loadingData ? "animate-spin" : ""}`} />
            </Button>
            {canManageMembers && (
              <Button onClick={openInviteDialog} className="gap-2">
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline">Invite</span>
              </Button>
            )}
          </div>
        </div>

        {/* ━━━ Stat Cards ━━━ */}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {summaryCards.map((card) => (
            <StatCard key={card.label} {...card} />
          ))}
        </div>

        {/* ━━━ Alerts ━━━ */}
        {highUtilizationMembers.length > 0 && (
          <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3">
            <div className="rounded-full bg-amber-100 p-1.5 mt-0.5">
              <Activity className="h-3.5 w-3.5 text-amber-600" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-amber-800">{highUtilizationMembers.length} member{highUtilizationMembers.length > 1 ? "s" : ""} at high utilization</p>
              <p className="text-xs text-amber-600 mt-0.5">
                {highUtilizationMembers.slice(0, 3).map((m) => m.full_name || m.email).join(", ")}
                {highUtilizationMembers.length > 3 ? ` +${highUtilizationMembers.length - 3} more` : ""}
              </p>
            </div>
            <Button variant="ghost" size="sm" className="text-amber-700 hover:text-amber-800 hover:bg-amber-100 shrink-0 text-xs" onClick={() => setSearchParams({ tab: "members" })}>
              Review <ChevronRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          </div>
        )}

        {teamApprovalsEnabled && approvals.filter((a) => a.status === "pending_approval").length > 0 && (
          <div className="flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50/80 px-4 py-3">
            <div className="rounded-full bg-blue-100 p-1.5 mt-0.5">
              <ShieldCheck className="h-3.5 w-3.5 text-blue-600" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-blue-800">{approvals.filter((a) => a.status === "pending_approval").length} approval{approvals.filter((a) => a.status === "pending_approval").length > 1 ? "s" : ""} awaiting review</p>
            </div>
            <Button variant="ghost" size="sm" className="text-blue-700 hover:text-blue-800 hover:bg-blue-100 shrink-0 text-xs" onClick={() => setSearchParams({ tab: "approvals" })}>
              Review <ChevronRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          </div>
        )}

        {/* ━━━ Tabs ━━━ */}
        <Tabs value={activeTab} onValueChange={(v) => setSearchParams({ tab: v })} className="space-y-5">
          <div className="border-b border-slate-200">
            <TabsList className="h-auto bg-transparent p-0 gap-0">
              {[
                { value: "overview", icon: Activity, label: "Overview" },
                { value: "members", icon: Users, label: "Members" },
                ...(teamApprovalsEnabled ? [{ value: "approvals", icon: ShieldCheck, label: "Approvals" }] : []),
                { value: "spending", icon: BarChart3, label: "Spending" },
                ...(auditLogsEnabled ? [{ value: "audit", icon: FileText, label: "Audit Log" }] : []),
              ].map(({ value, icon: Icon, label }) => (
                <TabsTrigger
                  key={value}
                  value={value}
                  className="relative rounded-none border-b-2 border-transparent px-4 py-3 text-sm font-medium text-slate-500 hover:text-slate-700 data-[state=active]:border-slate-900 data-[state=active]:text-slate-900 data-[state=active]:shadow-none transition-colors"
                >
                  <Icon className="h-4 w-4 mr-2" />
                  <span className="hidden sm:inline">{label}</span>
                  {value === "approvals" && approvals.filter((a) => a.status === "pending_approval").length > 0 && (
                    <span className="ml-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white">
                      {approvals.filter((a) => a.status === "pending_approval").length}
                    </span>
                  )}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          {/* ━━━ OVERVIEW TAB ━━━ */}
          <TabsContent value="overview" className="space-y-5">
            <div className="grid gap-5 lg:grid-cols-5">
              {/* Team Overview — Left */}
              <div className="lg:col-span-3 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-semibold text-slate-900">Team Utilization</h3>
                  <Button variant="ghost" size="sm" className="text-xs text-slate-500" onClick={() => setSearchParams({ tab: "members" })}>
                    View all <ArrowUpRight className="h-3 w-3 ml-1" />
                  </Button>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-100">
                  {members.filter((m) => m.status === "active" && m.credits_allocated).slice(0, 6).map((member) => {
                    const creditPct = member.credits_allocated ? (member.credits_used / member.credits_allocated) * 100 : 0;
                    const campaignPct = member.max_active_campaigns ? (member.active_campaigns / member.max_active_campaigns) * 100 : 0;

                    return (
                      <div key={member.user_id} className="flex items-center gap-4 px-4 py-3.5 hover:bg-slate-50/60 transition-colors group">
                        <Avatar name={member.full_name} email={member.email} id={member.user_id} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-slate-900 truncate">{member.full_name || member.email}</p>
                            <span className={`inline-block h-1.5 w-1.5 rounded-full bg-gradient-to-r ${roleIconColor(member.role)}`} title={roleLabel(member.role)} />
                          </div>
                          <p className="text-xs text-slate-500 truncate">{member.email}</p>
                        </div>
                        <div className="flex items-center gap-4">
                          {member.credits_allocated && (
                            <div className="hidden sm:flex items-center gap-2">
                              <CircleProgress value={creditPct} size={40} strokeWidth={3.5} />
                              <div className="text-right">
                                <p className={`text-xs font-semibold ${utilizationColor(creditPct)}`}>Credits</p>
                                <p className="text-[10px] text-slate-400">{member.credits_used.toLocaleString()}/{member.credits_allocated.toLocaleString()}</p>
                              </div>
                            </div>
                          )}
                          {member.max_active_campaigns && (
                            <div className="hidden md:flex items-center gap-2">
                              <CircleProgress value={campaignPct} size={40} strokeWidth={3.5} />
                              <div className="text-right">
                                <p className="text-xs font-semibold text-slate-600">Campaigns</p>
                                <p className="text-[10px] text-slate-400">{member.active_campaigns}/{member.max_active_campaigns}</p>
                              </div>
                            </div>
                          )}
                        </div>
                        {canEditMember(member) && (
                          <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => openEditDialog(member)}>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Right Column */}
              <div className="lg:col-span-2 space-y-4">
                {/* Pending Approvals */}
                {teamApprovalsEnabled && (
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-base font-semibold text-slate-900">Approvals</h3>
                      <Button variant="ghost" size="sm" className="text-xs text-slate-500" onClick={() => setSearchParams({ tab: "approvals" })}>
                        View all <ArrowUpRight className="h-3 w-3 ml-1" />
                      </Button>
                    </div>
                    <div className="space-y-2">
                      {approvals.filter((a) => a.status === "pending_approval" || a.status === "changes_requested").slice(0, 4).map((request) => (
                        <div
                          key={request.id}
                          onClick={() => void openApprovalDialog(request)}
                          className="rounded-xl border border-slate-200 bg-white px-4 py-3 cursor-pointer hover:shadow-sm hover:border-slate-300 transition-all group"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-slate-900 truncate group-hover:text-slate-700">{request.entity_name || request.entity_type}</p>
                              <div className="flex items-center gap-2 mt-1">
                                <span className="text-xs text-slate-400">{request.entity_type.replace(/_/g, " ")}</span>
                                <span className="text-xs text-slate-300">•</span>
                                <span className="text-xs text-slate-400">{timeAgo(request.created_at)}</span>
                              </div>
                            </div>
                            <Badge className={`${getApprovalBadgeClass(request.status)} text-[10px] shrink-0`}>
                              {request.status === "pending_approval" ? "Pending" : "Changes"}
                            </Badge>
                          </div>
                        </div>
                      ))}
                      {approvals.filter((a) => a.status === "pending_approval" || a.status === "changes_requested").length === 0 && (
                        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-4 py-8 text-center">
                          <CheckCircle2 className="h-8 w-8 text-emerald-300 mx-auto mb-2" />
                          <p className="text-sm font-medium text-slate-500">All caught up!</p>
                          <p className="text-xs text-slate-400 mt-1">No pending approvals</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Recent Activity */}
                <div>
                  <h3 className="text-base font-semibold text-slate-900 mb-3">Recent Activity</h3>
                  <div className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-100">
                    {(dashboard?.recentActivity || []).slice(0, 5).map((activity, i) => (
                      <div key={String(activity.id)} className="flex items-center gap-3 px-4 py-3">
                        <div className="h-2 w-2 rounded-full bg-slate-300 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-slate-700 capitalize">{String(activity.actionType || "activity").replace(/_/g, " ")}</p>
                          <p className="text-[11px] text-slate-400">{String(activity.actorName || activity.actorEmail || "System")}</p>
                        </div>
                      </div>
                    ))}
                    {!dashboard?.recentActivity?.length && (
                      <div className="px-4 py-8 text-center">
                        <p className="text-sm text-slate-400">No recent activity</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* ━━━ MEMBERS TAB ━━━ */}
          <TabsContent value="members" className="space-y-4">
            {/* Search & Filters */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search members…"
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white pl-9 pr-4 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200 focus:border-slate-300 transition-all"
                />
              </div>
              <div className="flex items-center gap-2">
                <Select value={memberRoleFilter} onValueChange={setMemberRoleFilter}>
                  <SelectTrigger className="w-[120px] bg-white border-slate-200 text-sm">
                    <Filter className="h-3.5 w-3.5 mr-1.5 text-slate-400" />
                    <SelectValue placeholder="Role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All roles</SelectItem>
                    <SelectItem value="owner">Owner</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="sub_admin">Sub Admin</SelectItem>
                    <SelectItem value="reviewer">Reviewer</SelectItem>
                    <SelectItem value="user">User</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={memberStatusFilter} onValueChange={setMemberStatusFilter}>
                  <SelectTrigger className="w-[120px] bg-white border-slate-200 text-sm">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All status</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="invited">Invited</SelectItem>
                    <SelectItem value="disabled">Disabled</SelectItem>
                  </SelectContent>
                </Select>
                {canManageMembers && (
                  <Button onClick={openInviteDialog} size="sm" className="gap-1.5 shrink-0">
                    <Plus className="h-3.5 w-3.5" /> Invite
                  </Button>
                )}
              </div>
            </div>

            {/* Results Count */}
            <p className="text-xs text-slate-400">{filteredMembers.length} member{filteredMembers.length !== 1 ? "s" : ""}</p>

            {/* Member Cards (responsive grid) */}
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {filteredMembers.map((member) => {
                const creditPct = member.credits_allocated ? (member.credits_used / member.credits_allocated) * 100 : 0;

                return (
                  <div key={member.user_id} className="rounded-xl border border-slate-200 bg-white p-4 hover:shadow-md transition-all group">
                    {/* Top row */}
                    <div className="flex items-start gap-3 mb-4">
                      <Avatar name={member.full_name} email={member.email} id={member.user_id} size="lg" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-900 truncate">{member.full_name || member.email}</p>
                        <p className="text-xs text-slate-500 truncate">{member.email}</p>
                        <div className="flex items-center gap-1.5 mt-2">
                          <Badge className={`${getRoleBadgeClass(member.role)} text-[10px] px-2 py-0`}>{roleLabel(member.role)}</Badge>
                          <Badge className={`${getMemberStatusBadgeClass(member.status)} text-[10px] px-2 py-0`}>{member.status}</Badge>
                        </div>
                      </div>
                      {canEditMember(member) && (
                        <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => openEditDialog(member)}>
                          <MoreHorizontal className="h-4 w-4 text-slate-400" />
                        </Button>
                      )}
                    </div>

                    {/* Reports to */}
                    <div className="text-xs text-slate-500 mb-3">
                      <span className="text-slate-400">Reports to</span>{" "}
                      <span className="font-medium text-slate-600">{member.parent_name || member.parent_email || "Workspace owner"}</span>
                    </div>

                    {/* Utilization bars */}
                    <div className="space-y-2.5">
                      {member.credits_allocated != null && member.credits_allocated > 0 && (
                        <div>
                          <div className="flex justify-between text-xs mb-1">
                            <span className="text-slate-500">Credits</span>
                            <span className={`font-medium ${utilizationColor(creditPct)}`}>
                              {member.credits_used.toLocaleString()} / {member.credits_allocated.toLocaleString()}
                            </span>
                          </div>
                          <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                            <div className={`h-full rounded-full ${utilizationBarColor(creditPct)} transition-all duration-500`} style={{ width: `${Math.min(creditPct, 100)}%` }} />
                          </div>
                        </div>
                      )}

                      {/* Compact resource row */}
                      <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100">
                        <div className="text-center">
                          <p className="text-lg font-bold text-slate-900">{member.active_campaigns}</p>
                          <p className="text-[10px] text-slate-400">Campaigns</p>
                        </div>
                        <div className="text-center">
                          <p className="text-lg font-bold text-slate-900">{member.active_senders}</p>
                          <p className="text-[10px] text-slate-400">Senders</p>
                        </div>
                        <div className="text-center">
                          <p className="text-lg font-bold text-slate-900">{member.sends_today}</p>
                          <p className="text-[10px] text-slate-400">Sends today</p>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {filteredMembers.length === 0 && (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 py-12 text-center">
                <Search className="h-8 w-8 text-slate-300 mx-auto mb-3" />
                <p className="text-sm font-medium text-slate-500">No members found</p>
                <p className="text-xs text-slate-400 mt-1">Try adjusting your search or filters</p>
              </div>
            )}
          </TabsContent>

          {/* ━━━ APPROVALS TAB ━━━ */}
          {teamApprovalsEnabled && (
            <TabsContent value="approvals" className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-base font-semibold text-slate-900">Approval Queue</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Review campaigns, senders, and automations before they go live.</p>
                </div>
                <Select value={approvalFilter} onValueChange={setApprovalFilter}>
                  <SelectTrigger className="w-full sm:w-[180px] bg-white border-slate-200 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    <SelectItem value="pending_approval">Pending</SelectItem>
                    <SelectItem value="changes_requested">Changes requested</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                {filteredApprovals.length > 0 ? (
                  filteredApprovals.map((request) => {
                    const isPending = request.status === "pending_approval";
                    const isChanges = request.status === "changes_requested";

                    return (
                      <div
                        key={request.id}
                        onClick={() => void openApprovalDialog(request)}
                        className={`rounded-xl border bg-white px-5 py-4 cursor-pointer transition-all hover:shadow-sm ${
                          isPending ? "border-amber-200 hover:border-amber-300" : isChanges ? "border-sky-200 hover:border-sky-300" : "border-slate-200 hover:border-slate-300"
                        }`}
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <Avatar name={request.requested_by_name || null} email={request.requested_by_email || null} id={request.requested_by_user_id} size="sm" />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="text-sm font-medium text-slate-900 truncate">{request.entity_name || request.entity_type}</p>
                                <Badge className={`${getApprovalBadgeClass(request.status)} text-[10px]`}>
                                  {request.status === "pending_approval" ? "Pending" : request.status === "changes_requested" ? "Changes" : request.status.replace(/_/g, " ")}
                                </Badge>
                              </div>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-xs text-slate-400 capitalize">{request.entity_type.replace(/_/g, " ")}</span>
                                <span className="text-xs text-slate-300">•</span>
                                <span className="text-xs text-slate-400">{request.requested_by_name || request.requested_by_email}</span>
                                <span className="text-xs text-slate-300">•</span>
                                <span className="text-xs text-slate-400">{timeAgo(request.created_at)}</span>
                              </div>
                            </div>
                          </div>
                          {canReviewApprovals && isPending && (
                            <Button
                              size="sm"
                              onClick={(e) => { e.stopPropagation(); void openApprovalDialog(request); }}
                              className="shrink-0"
                            >
                              Review
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 py-12 text-center">
                    <CheckCircle2 className="h-10 w-10 text-emerald-300 mx-auto mb-3" />
                    <p className="text-sm font-medium text-slate-500">No approval requests</p>
                    <p className="text-xs text-slate-400 mt-1">Everything is up to date.</p>
                  </div>
                )}
              </div>
            </TabsContent>
          )}

          {/* ━━━ SPENDING TAB ━━━ */}
          <TabsContent value="spending" className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-3">
              {[
                { label: "Credits Used", value: Number(spendingRollup?.workspace.creditsUsed || 0).toLocaleString() },
                { label: "Total Sends", value: Number(spendingRollup?.workspace.sends || 0).toLocaleString() },
                { label: "Since", value: spendingRollup?.since ? new Date(spendingRollup.since).toLocaleDateString() : "—" },
              ].map((s) => (
                <div key={s.label} className="rounded-xl border border-slate-200 bg-white p-5">
                  <p className="text-xs font-medium text-slate-500 mb-1">{s.label}</p>
                  <p className="text-2xl font-bold text-slate-900">{s.value}</p>
                </div>
              ))}
            </div>

            {/* Spending tables */}
            {[
              { title: "By Manager", data: spendingRollup?.byManager || [] },
              { title: "By User", data: spendingRollup?.byUser || [] },
            ].map(({ title, data }) => (
              <div key={title} className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100">
                  <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
                </div>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="text-xs">Member</TableHead>
                        <TableHead className="text-xs">Role</TableHead>
                        <TableHead className="text-xs text-right">Credits</TableHead>
                        <TableHead className="text-xs text-right">Sends</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.map((row) => (
                        <TableRow key={row.userId}>
                          <TableCell>
                            <div className="flex items-center gap-2.5">
                              <Avatar name={row.name || null} email={row.email || null} id={row.userId} size="sm" />
                              <div>
                                <p className="text-sm font-medium text-slate-900 truncate">{row.name || row.email}</p>
                                <p className="text-xs text-slate-400 truncate">{row.email}</p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge className={`${getRoleBadgeClass(row.role)} text-[10px]`}>{roleLabel(row.role)}</Badge>
                          </TableCell>
                          <TableCell className="text-right text-sm font-medium">{Number(row.creditsUsed || 0).toLocaleString()}</TableCell>
                          <TableCell className="text-right text-sm font-medium">{Number(row.sends || 0).toLocaleString()}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            ))}
          </TabsContent>

          {/* ━━━ AUDIT TAB ━━━ */}
          {auditLogsEnabled && (
            <TabsContent value="audit" className="space-y-4">
              <h3 className="text-base font-semibold text-slate-900">Audit History</h3>

              <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                {/* Desktop */}
                <div className="hidden lg:block overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="text-xs">Action</TableHead>
                        <TableHead className="text-xs">Target</TableHead>
                        <TableHead className="text-xs">Actor</TableHead>
                        <TableHead className="text-xs">When</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {auditEvents.map((event) => (
                        <TableRow key={event.id}>
                          <TableCell>
                            <span className="text-sm font-medium text-slate-900 capitalize">{event.action_type.replace(/_/g, " ")}</span>
                          </TableCell>
                          <TableCell className="text-sm text-slate-600 capitalize">{event.target_type}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Avatar name={event.actor_name || null} email={event.actor_email || null} id={event.id} size="sm" />
                              <span className="text-sm">{event.actor_name || event.actor_email || "System"}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm text-slate-500">{timeAgo(event.created_at)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Mobile */}
                <div className="lg:hidden divide-y divide-slate-100">
                  {auditEvents.map((event) => (
                    <div key={event.id} className="px-4 py-3.5">
                      <div className="flex items-center gap-2.5 mb-1">
                        <Avatar name={event.actor_name || null} email={event.actor_email || null} id={event.id} size="sm" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-900 capitalize truncate">{event.action_type.replace(/_/g, " ")}</p>
                          <p className="text-xs text-slate-400">{event.actor_name || event.actor_email || "System"} • {timeAgo(event.created_at)}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {auditEvents.length === 0 && (
                  <div className="py-12 text-center">
                    <FileText className="h-8 w-8 text-slate-200 mx-auto mb-2" />
                    <p className="text-sm text-slate-400">No audit events yet</p>
                  </div>
                )}
              </div>
            </TabsContent>
          )}
        </Tabs>
      </div>

      <MemberEditorDialog
        open={memberDialogOpen}
        onOpenChange={setMemberDialogOpen}
        mode={memberDialogMode}
        actorRole={workspace.role}
        supportsApprovalFlows={teamApprovalsEnabled}
        members={members}
        targetMember={selectedMember}
        defaultParentUserId={workspace.role === "owner" ? workspace.parentUserId || user.id : user.id}
        loading={memberDialogBusy}
        onInvite={handleInvite}
        onUpdate={handleMemberUpdate}
      />

      <ApprovalReviewDialog
        open={approvalDialogOpen}
        onOpenChange={setApprovalDialogOpen}
        request={selectedApproval}
        timeline={approvalTimeline}
        loading={approvalDialogBusy}
        onSubmit={handleApprovalReview}
      />
    </DashboardLayout>
  );
};

export default Team;

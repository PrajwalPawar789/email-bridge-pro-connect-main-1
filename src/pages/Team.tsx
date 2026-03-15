import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Activity, Clock3, BarChart3, FileText, Loader2, Plus, ShieldCheck, Users, Wallet } from "lucide-react";
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

const Team = () => {
  const { user, loading: authLoading } = useAuth();
  const { workspace, loading: workspaceLoading, error: workspaceError, refresh: refreshWorkspace, hasPermission } = useWorkspace();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [dashboard, setDashboard] = useState<WorkspaceDashboard | null>(null);
  const [approvals, setApprovals] = useState<WorkspaceApprovalRequest[]>([]);
  const [auditEvents, setAuditEvents] = useState<WorkspaceAuditEvent[]>([]);
  const [spendingRollup, setSpendingRollup] = useState<WorkspaceSpendingRollup | null>(null);
  const [approvalTimeline, setApprovalTimeline] = useState<ApprovalTimelineEvent[]>([]);
  const [selectedApproval, setSelectedApproval] = useState<WorkspaceApprovalRequest | null>(null);
  const [selectedMember, setSelectedMember] = useState<WorkspaceMember | null>(null);

  const [days, setDays] = useState("30");
  const [approvalFilter, setApprovalFilter] = useState("all");
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
    (workspace.role === "owner" || workspace.role === "admin") &&
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

  const summaryCards = useMemo(() => {
    const summary = dashboard?.summary;
    return [
      {
        label: "Credits remaining",
        value: Number(summary?.creditsRemaining ?? workspace?.snapshot.creditsRemaining ?? 0).toLocaleString(),
        helper: `${Number(summary?.creditsUsed ?? workspace?.snapshot.creditsUsed ?? 0).toLocaleString()} used`,
        icon: Wallet,
      },
      {
        label: "Active campaigns",
        value: Number(summary?.campaignsActive ?? 0).toLocaleString(),
        helper: `${Number(summary?.campaignsDraft ?? 0).toLocaleString()} drafts`,
        icon: Activity,
      },
      teamApprovalsEnabled
        ? {
            label: "Pending approvals",
            value: Number(summary?.approvalPending ?? 0).toLocaleString(),
            helper: `${Number(summary?.approvalChangesRequested ?? 0).toLocaleString()} changes requested`,
            icon: ShieldCheck,
          }
        : {
            label: "Sends today",
            value: Number(workspace?.snapshot.sendsToday ?? 0).toLocaleString(),
            helper:
              workspace?.snapshot.dailySendCap == null
                ? "Unlimited daily cap"
                : `${Number(workspace.snapshot.dailySendCap).toLocaleString()} daily cap`,
            icon: Clock3,
          },
      {
        label: "Scoped members",
        value: members.length.toLocaleString(),
        helper: `${members.filter((member) => member.status === "active").length.toLocaleString()} active`,
        icon: Users,
      },
    ];
  }, [
    dashboard?.summary,
    members,
    teamApprovalsEnabled,
    workspace?.snapshot.creditsRemaining,
    workspace?.snapshot.creditsUsed,
    workspace?.snapshot.dailySendCap,
    workspace?.snapshot.sendsToday,
  ]);

  const highUtilizationMembers = useMemo(
    () =>
      members.filter((member) => {
        if (!member.credits_allocated || member.credits_allocated <= 0) return false;
        return (member.credits_used / member.credits_allocated) * 100 >= 80;
      }),
    [members],
  );

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
      if (workspace.role === "owner") return true;
      return workspace.role === "admin" && member.role === "user";
    },
    [canManageMembers, workspace.role],
  );

  const handleInvite = async (payload: Parameters<typeof inviteWorkspaceMember>[0]) => {
    setMemberDialogBusy(true);
    try {
      await inviteWorkspaceMember(payload);
      toast({
        title: "Invite sent",
        description: `${payload.email} was invited to the workspace.`,
      });
      try {
        await Promise.all([refreshWorkspace(), loadData()]);
      } catch (refreshError) {
        toast({
          title: "Invite sent, refresh failed",
          description: normalizeTeamErrorMessage(refreshError),
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Invite failed",
        description: normalizeTeamErrorMessage(error),
        variant: "destructive",
      });
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
      const currentMember = members.find((member) => member.user_id === userId) || null;
      const currentSenderAllocation = currentMember?.max_sender_accounts ?? null;
      const nextSenderAllocation =
        allocationInput.maxSenderAccounts === undefined
          ? currentSenderAllocation
          : allocationInput.maxSenderAccounts;
      const isParentChanging =
        memberInput.parentUserId !== undefined &&
        (memberInput.parentUserId ?? null) !== (currentMember?.parent_user_id ?? null);
      const isSenderAllocationReducing =
        currentSenderAllocation !== null &&
        nextSenderAllocation !== null &&
        nextSenderAllocation < currentSenderAllocation;

      // When re-parenting and reducing sender allocation in the same save,
      // apply the lower allocation first so the parent-change validation does not run against the stale higher limit.
      if (isParentChanging && isSenderAllocationReducing) {
        await setWorkspaceMemberAllocation(userId, allocationInput);
        await updateWorkspaceMember(userId, memberInput);
      } else {
        await updateWorkspaceMember(userId, memberInput);
        await setWorkspaceMemberAllocation(userId, allocationInput);
      }
      await Promise.all([refreshWorkspace(), loadData()]);
      toast({
        title: "Member updated",
        description: "Role, hierarchy, and allocation changes were saved.",
      });
    } catch (error) {
      toast({
        title: "Update failed",
        description: normalizeTeamErrorMessage(error),
        variant: "destructive",
      });
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
    } catch (error) {
      setApprovalTimeline([]);
      toast({
        title: "History unavailable",
        description: normalizeTeamErrorMessage(error),
        variant: "destructive",
      });
    }
  };

  const handleApprovalReview = async (action: ApprovalAction, comment: string) => {
    if (!selectedApproval) return;
    setApprovalDialogBusy(true);
    try {
      await reviewApprovalRequest(selectedApproval.id, action, comment);
      await Promise.all([refreshWorkspace(), loadData()]);
      toast({
        title: "Approval updated",
        description: `${selectedApproval.entity_name || selectedApproval.entity_type} was ${action.replace(/_/g, " ")}.`,
      });
    } catch (error) {
      toast({
        title: "Review failed",
        description: normalizeTeamErrorMessage(error),
        variant: "destructive",
      });
      throw error;
    } finally {
      setApprovalDialogBusy(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  if (authLoading || workspaceLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  if (!user) return null;

  if (!workspace) {
    return (
      <DashboardLayout activeTab="team" onTabChange={handleTabChange} user={user} onLogout={handleLogout}>
        <Card>
          <CardHeader>
            <CardTitle>Workspace unavailable</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-slate-600">
            {workspaceError || "We could not load your workspace context. Refresh the page or sign in again."}
          </CardContent>
        </Card>
      </DashboardLayout>
    );
  }

  if (!teamRolesEnabled) {
    return (
      <DashboardLayout activeTab="team" onTabChange={handleTabChange} user={user} onLogout={handleLogout}>
        <Card>
          <CardHeader>
            <CardTitle>Team access locked on this plan</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-slate-600">
            <p>
              Team roles, scoped allocations, and workspace member management start on the Growth plan.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button onClick={() => navigate("/subscription")}>View plans</Button>
              <Button variant="outline" onClick={() => navigate("/dashboard")}>
                Back to dashboard
              </Button>
            </div>
          </CardContent>
        </Card>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout activeTab="team" onTabChange={handleTabChange} user={user} onLogout={handleLogout}>
      <div className="space-y-6">
        <section className="rounded-[28px] border border-[var(--shell-border)] bg-[var(--shell-surface-strong)] p-6 shadow-[0_18px_42px_rgba(15,23,42,0.08)]">
          <div className="flex flex-col gap-6">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className={getRoleBadgeClass(workspace.role)}>{roleLabel(workspace.role)}</Badge>
                <Badge className={getMemberStatusBadgeClass(workspace.status)}>{workspace.status}</Badge>
                <Badge variant="outline" className="hidden sm:inline-block">{workspace.workspaceName}</Badge>
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-semibold text-[var(--shell-ink)]" style={{ fontFamily: "var(--shell-font-display)" }}>
                  Team Command Center
                </h1>
                <p className="mt-1 max-w-2xl text-sm text-[var(--shell-muted)]">
                  Manage hierarchy, allocations, approvals, and performance across your workspace.
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Select value={days} onValueChange={setDays}>
                  <SelectTrigger className="w-full sm:w-[140px] bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7">Last 7 days</SelectItem>
                    <SelectItem value="30">Last 30 days</SelectItem>
                    <SelectItem value="90">Last 90 days</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="outline" onClick={() => void loadData()} disabled={loadingData} className="w-full sm:w-auto">
                  {loadingData ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Clock3 className="mr-2 h-4 w-4" />}
                  Refresh
                </Button>
              </div>
              {canManageMembers ? (
                <Button onClick={openInviteDialog} className="w-full sm:w-auto">
                  <Plus className="mr-2 h-4 w-4" />
                  Invite member
                </Button>
              ) : null}
            </div>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {summaryCards.map((card) => (
              <Card key={card.label} className="border-[var(--shell-border)] bg-white/80">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm font-medium text-slate-500">
                    <card.icon className="h-4 w-4" />
                    {card.label}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-semibold text-slate-900">{card.value}</p>
                  <p className="mt-1 text-xs text-slate-500">{card.helper}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <Tabs value={activeTab} onValueChange={(value) => setSearchParams({ tab: value })} className="space-y-4">
          <TabsList className="flex h-auto flex-wrap justify-start gap-2 bg-transparent p-0">
            <TabsTrigger value="overview" className="flex items-center gap-2">
              <Activity className="h-4 w-4" />
              <span className="hidden sm:inline">Overview</span>
            </TabsTrigger>
            <TabsTrigger value="members" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              <span className="hidden sm:inline">Members</span>
            </TabsTrigger>
            {teamApprovalsEnabled ? (
              <TabsTrigger value="approvals" className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4" />
                <span className="hidden sm:inline">Approvals</span>
              </TabsTrigger>
            ) : null}
            <TabsTrigger value="spending" className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              <span className="hidden sm:inline">Spending</span>
            </TabsTrigger>
            {auditLogsEnabled ? (
              <TabsTrigger value="audit" className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                <span className="hidden sm:inline">Audit</span>
              </TabsTrigger>
            ) : null}
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            {/* Alerts Section - High Priority */}
            {highUtilizationMembers.length > 0 && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                <p className="font-medium">⚠️ Action needed</p>
                <p>{highUtilizationMembers.length} member(s) at {">"}80% credit utilization. <span className="underline cursor-pointer">View allocation →</span></p>
              </div>
            )}

            {teamApprovalsEnabled && approvals.filter(a => a.status === "pending_approval").length > 0 && (
              <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
                <p className="font-medium">✓ Approvals pending</p>
                <p>{approvals.filter(a => a.status === "pending_approval").length} item(s) waiting for review. <span className="underline cursor-pointer">Review now →</span></p>
              </div>
            )}

            <div className="grid gap-4 lg:grid-cols-3">
              {/* Member Utilization - Simplified */}
              <div className="lg:col-span-2">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      <span>Team Overview</span>
                      <Button variant="ghost" size="sm" onClick={() => setSearchParams({ tab: "members" })}>View all →</Button>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {members.slice(0, 5).map((member) => {
                      const creditUtilization = member.credits_allocated ? (member.credits_used / member.credits_allocated) * 100 : 0;
                      const campaignUtilization = member.max_active_campaigns ? (member.active_campaigns / member.max_active_campaigns) * 100 : 0;
                      const isHighUtilization = creditUtilization >= 80;

                      return (
                        <div key={member.user_id} className="space-y-2 pb-4 border-b last:border-b-0">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <p className="font-medium text-slate-900 truncate">{member.full_name || member.email}</p>
                                <Badge className={`${getRoleBadgeClass(member.role)} text-xs`} variant="outline">{roleLabel(member.role)}</Badge>
                              </div>
                              <p className="text-xs text-slate-500">{member.email}</p>
                            </div>
                            {canEditMember(member) && (
                              <Button variant="outline" size="sm" onClick={() => openEditDialog(member)}>Edit</Button>
                            )}
                          </div>

                          {/* Utilization Bars */}
                          <div className="space-y-2">
                            {member.credits_allocated && (
                              <div>
                                <div className="flex justify-between text-xs mb-1">
                                  <span className="text-slate-600">Credits</span>
                                  <span className={isHighUtilization ? "text-amber-600 font-medium" : "text-slate-600"}>
                                    {Math.round(creditUtilization)}%
                                  </span>
                                </div>
                                <div className="w-full bg-slate-200 rounded-full h-2">
                                  <div
                                    className={isHighUtilization ? "bg-amber-500" : "bg-emerald-500"}
                                    style={{ width: `${Math.min(creditUtilization, 100)}%` }}
                                  />
                                </div>
                              </div>
                            )}

                            {member.max_active_campaigns && (
                              <div>
                                <div className="flex justify-between text-xs mb-1">
                                  <span className="text-slate-600">Campaigns</span>
                                  <span className="text-slate-600">{member.active_campaigns} / {member.max_active_campaigns}</span>
                                </div>
                                <div className="w-full bg-slate-200 rounded-full h-2">
                                  <div
                                    className="bg-blue-500"
                                    style={{ width: `${Math.min(campaignUtilization, 100)}%` }}
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
              </div>

              {/* Right Sidebar - Approvals & Activity */}
              <div className="space-y-4">
                {teamApprovalsEnabled && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Pending Approvals</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {approvals.slice(0, 4).map((request) => (
                        <div
                          key={request.id}
                          onClick={() => void openApprovalDialog(request)}
                          className="rounded-lg border border-slate-200 hover:border-slate-300 hover:bg-slate-50 p-3 cursor-pointer transition-colors"
                        >
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <p className="font-medium text-sm text-slate-900 truncate flex-1">{request.entity_name || request.entity_type}</p>
                            <Badge className={`${getApprovalBadgeClass(request.status)} text-xs shrink-0`}>
                              {request.status === "pending_approval" ? "Pending" : request.status.replace(/_/g, " ")}
                            </Badge>
                          </div>
                          <p className="text-xs text-slate-500">{request.requested_by_name || request.requested_by_email}</p>
                        </div>
                      ))}
                      {approvals.length === 0 && (
                        <p className="text-sm text-slate-500 text-center py-4">No approvals in scope</p>
                      )}
                      {approvals.length > 4 && (
                        <Button variant="ghost" size="sm" className="w-full mt-2" onClick={() => setSearchParams({ tab: "approvals" })}>
                          View all ({approvals.length})
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                )}

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Recent Activity</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {(dashboard?.recentActivity || []).slice(0, 4).map((activity) => (
                      <div key={String(activity.id)} className="text-sm pb-2 border-b last:border-b-0">
                        <p className="font-medium text-slate-900 text-xs">{String(activity.actionType || "activity").replace(/_/g, " ")}</p>
                        <p className="text-xs text-slate-500">{String(activity.actorName || activity.actorEmail || "System")}</p>
                      </div>
                    ))}
                    {!dashboard?.recentActivity?.length && (
                      <p className="text-sm text-slate-500 text-center py-4">No recent activity</p>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="members" className="space-y-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="font-medium text-slate-900">Workspace Members</h3>
                <p className="text-sm text-slate-500 mt-1">Hierarchy, allocations, and policy state for your scope.</p>
              </div>
              {canManageMembers ? (
                <Button onClick={openInviteDialog} className="shrink-0">
                  <Plus className="mr-2 h-4 w-4" />
                  Invite member
                </Button>
              ) : null}
            </div>

            {/* Desktop Table View - Hidden on mobile */}
            <div className="hidden lg:block">
              <Card>
                <CardContent className="overflow-x-auto pt-6">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Member</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Parent</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Credits</TableHead>
                        <TableHead>Campaigns</TableHead>
                        <TableHead>Senders</TableHead>
                        <TableHead>Daily sends</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {members.map((member) => (
                        <TableRow key={member.user_id}>
                          <TableCell>
                            <div>
                              <p className="font-medium text-slate-900">{member.full_name || member.email || member.user_id}</p>
                              <p className="text-xs text-slate-500">{member.email}</p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge className={getRoleBadgeClass(member.role)}>{roleLabel(member.role)}</Badge>
                          </TableCell>
                          <TableCell className="text-sm text-slate-600">{member.parent_name || member.parent_email || "Workspace owner"}</TableCell>
                          <TableCell>
                            <Badge className={getMemberStatusBadgeClass(member.status)}>{member.status}</Badge>
                          </TableCell>
                          <TableCell>{member.credits_remaining.toLocaleString()} remaining</TableCell>
                          <TableCell>{member.active_campaigns} / {member.max_active_campaigns ?? "Unlimited"}</TableCell>
                          <TableCell>{member.active_senders} / {member.max_sender_accounts ?? "Unlimited"}</TableCell>
                          <TableCell>{member.sends_today} / {member.daily_send_limit ?? "Unlimited"}</TableCell>
                          <TableCell>
                            {canEditMember(member) ? (
                              <Button variant="outline" size="sm" onClick={() => openEditDialog(member)}>
                                Edit
                              </Button>
                            ) : (
                              <span className="text-xs text-slate-400">Read only</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>

            {/* Mobile Card View - Visible on mobile only */}
            <div className="space-y-3 lg:hidden">
              {members.map((member) => {
                const creditUtilization = member.credits_allocated ? (member.credits_used / member.credits_allocated) * 100 : 0;
                const campaignUtilization = member.max_active_campaigns ? (member.active_campaigns / member.max_active_campaigns) * 100 : 0;
                const isHighUtilization = creditUtilization >= 80;

                return (
                  <Card key={member.user_id}>
                    <CardContent className="pt-6">
                      <div className="space-y-4">
                        {/* Member Info */}
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-slate-900 truncate">{member.full_name || member.email}</p>
                            <p className="text-xs text-slate-500">{member.email}</p>
                            <div className="flex items-center gap-2 mt-2">
                              <Badge className={getRoleBadgeClass(member.role)} variant="outline">{roleLabel(member.role)}</Badge>
                              <Badge className={getMemberStatusBadgeClass(member.status)} variant="outline">{member.status}</Badge>
                            </div>
                          </div>
                          {canEditMember(member) && (
                            <Button variant="outline" size="sm" onClick={() => openEditDialog(member)}>Edit</Button>
                          )}
                        </div>

                        {/* Hierarchy */}
                        <div className="text-sm">
                          <p className="text-slate-500">Reports to</p>
                          <p className="font-medium text-slate-900">{member.parent_name || member.parent_email || "Workspace owner"}</p>
                        </div>

                        {/* Utilization Visualizations */}
                        <div className="space-y-3 pt-2 border-t">
                          {member.credits_allocated && (
                            <div>
                              <div className="flex justify-between items-center mb-2">
                                <span className="text-sm font-medium text-slate-700">Credits</span>
                                <span className={`text-sm font-medium ${isHighUtilization ? "text-amber-600" : "text-slate-600"}`}>
                                  {member.credits_used.toLocaleString()} / {member.credits_allocated.toLocaleString()}
                                </span>
                              </div>
                              <div className="w-full bg-slate-200 rounded-full h-2">
                                <div
                                  className={isHighUtilization ? "bg-amber-500" : "bg-emerald-500"}
                                  style={{ width: `${Math.min(creditUtilization, 100)}%` }}
                                />
                              </div>
                              <p className="text-xs text-slate-500 mt-1">{Math.round(creditUtilization)}% utilized</p>
                            </div>
                          )}

                          {member.max_active_campaigns && (
                            <div>
                              <div className="flex justify-between items-center mb-2">
                                <span className="text-sm font-medium text-slate-700">Campaigns</span>
                                <span className="text-sm font-medium text-slate-600">{member.active_campaigns} / {member.max_active_campaigns}</span>
                              </div>
                              <div className="w-full bg-slate-200 rounded-full h-2">
                                <div
                                  className="bg-blue-500"
                                  style={{ width: `${Math.min(campaignUtilization, 100)}%` }}
                                />
                              </div>
                            </div>
                          )}

                          {member.max_sender_accounts && (
                            <div>
                              <div className="flex justify-between items-center mb-2">
                                <span className="text-sm font-medium text-slate-700">Senders</span>
                                <span className="text-sm font-medium text-slate-600">{member.active_senders} / {member.max_sender_accounts}</span>
                              </div>
                              <div className="w-full bg-slate-200 rounded-full h-2">
                                <div
                                  className="bg-purple-500"
                                  style={{ width: `${Math.min((member.active_senders / member.max_sender_accounts) * 100, 100)}%` }}
                                />
                              </div>
                            </div>
                          )}

                          {member.daily_send_limit && (
                            <div>
                              <div className="flex justify-between items-center mb-2">
                                <span className="text-sm font-medium text-slate-700">Daily sends</span>
                                <span className="text-sm font-medium text-slate-600">{member.sends_today} / {member.daily_send_limit}</span>
                              </div>
                              <div className="w-full bg-slate-200 rounded-full h-2">
                                <div
                                  className="bg-pink-500"
                                  style={{ width: `${Math.min((member.sends_today / member.daily_send_limit) * 100, 100)}%` }}
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </TabsContent>

          {teamApprovalsEnabled ? (
          <TabsContent value="approvals" className="space-y-4">
            {/* Filter Section */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="font-medium text-slate-900">Approval Inbox</h3>
                <p className="text-sm text-slate-500 mt-1">Review pending launches, sender activations, and workflow activations.</p>
              </div>
              <Select value={approvalFilter} onValueChange={setApprovalFilter}>
                <SelectTrigger className="w-full sm:w-[200px] bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="pending_approval">⏳ Pending approval</SelectItem>
                  <SelectItem value="changes_requested">📝 Changes requested</SelectItem>
                  <SelectItem value="approved">✓ Approved</SelectItem>
                  <SelectItem value="rejected">✗ Rejected</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Approval Items - Card Layout */}
            <div className="space-y-3">
              {approvals.length > 0 ? (
                approvals.map((request) => (
                  <Card
                    key={request.id}
                    className="cursor-pointer hover:shadow-md transition-shadow"
                    onClick={() => void openApprovalDialog(request)}
                  >
                    <CardContent className="pt-6">
                      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="font-medium text-slate-900 truncate">{request.entity_name || request.entity_type}</p>
                            <Badge className={`${getApprovalBadgeClass(request.status)} shrink-0`}>
                              {request.status === "pending_approval" ? "⏳ Pending" : request.status === "changes_requested" ? "📝 Changes" : request.status.replace(/_/g, " ")}
                            </Badge>
                          </div>
                          <p className="text-sm text-slate-600 mb-2">{request.entity_type.replace(/_/g, " ")}</p>
                          <div className="flex flex-col gap-1 text-xs text-slate-500">
                            <p><span className="font-medium">Requested by:</span> {request.requested_by_name || request.requested_by_email || "Member"}</p>
                            <p><span className="font-medium">Submitted:</span> {new Date(request.created_at).toLocaleDateString()}</p>
                          </div>
                        </div>
                        {canReviewApprovals && request.status === "pending_approval" && (
                          <Button
                            onClick={(e) => {
                              e.stopPropagation();
                              void openApprovalDialog(request);
                            }}
                            className="shrink-0"
                          >
                            Review Now
                          </Button>
                        )}
                        {canReviewApprovals && request.status !== "pending_approval" && (
                          <Button
                            variant="outline"
                            onClick={(e) => {
                              e.stopPropagation();
                              void openApprovalDialog(request);
                            }}
                            className="shrink-0"
                          >
                            View Details
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))
              ) : (
                <Card>
                  <CardContent className="pt-6 text-center">
                    <p className="text-slate-500">No approval requests match the current filter.</p>
                    <p className="text-sm text-slate-400 mt-1">Great job! Everything is up to date.</p>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>
          ) : null}

          <TabsContent value="spending" className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-slate-500">Scoped credits used</CardTitle>
                </CardHeader>
                <CardContent className="text-2xl font-semibold">{Number(spendingRollup?.workspace.creditsUsed || 0).toLocaleString()}</CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-slate-500">Scoped sends</CardTitle>
                </CardHeader>
                <CardContent className="text-2xl font-semibold">{Number(spendingRollup?.workspace.sends || 0).toLocaleString()}</CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-slate-500">Window</CardTitle>
                </CardHeader>
                <CardContent className="text-sm font-medium text-slate-700">
                  Since {spendingRollup?.since ? new Date(spendingRollup.since).toLocaleDateString() : "n/a"}
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>By Manager</CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Manager</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead className="text-right">Credits used</TableHead>
                      <TableHead className="text-right">Sends</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(spendingRollup?.byManager || []).map((row) => (
                      <TableRow key={row.userId}>
                        <TableCell>
                          <div className="max-w-[200px]">
                            <p className="font-medium text-slate-900 truncate">{row.name || row.email || row.userId}</p>
                            <p className="text-xs text-slate-500 truncate">{row.email || ""}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className={getRoleBadgeClass(row.role)} variant="outline">{roleLabel(row.role)}</Badge>
                        </TableCell>
                        <TableCell className="text-right">{Number(row.creditsUsed || 0).toLocaleString()}</TableCell>
                        <TableCell className="text-right">{Number(row.sends || 0).toLocaleString()}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>By User</CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead className="text-right">Credits used</TableHead>
                      <TableHead className="text-right">Sends</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(spendingRollup?.byUser || []).map((row) => (
                      <TableRow key={row.userId}>
                        <TableCell>
                          <div className="max-w-[200px]">
                            <p className="font-medium text-slate-900 truncate">{row.name || row.email || row.userId}</p>
                            <p className="text-xs text-slate-500 truncate">{row.email || ""}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className={getRoleBadgeClass(row.role)} variant="outline">{roleLabel(row.role)}</Badge>
                        </TableCell>
                        <TableCell className="text-right">{Number(row.creditsUsed || 0).toLocaleString()}</TableCell>
                        <TableCell className="text-right">{Number(row.sends || 0).toLocaleString()}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {auditLogsEnabled ? (
          <TabsContent value="audit" className="space-y-4">
            {/* Desktop Table View */}
            <div className="hidden lg:block">
              <Card>
                <CardHeader>
                  <CardTitle>Audit History</CardTitle>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Action</TableHead>
                        <TableHead>Target</TableHead>
                        <TableHead>Actor</TableHead>
                        <TableHead>Timestamp</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {auditEvents.map((event) => (
                        <TableRow key={event.id}>
                          <TableCell className="font-medium text-slate-900">{event.action_type.replace(/_/g, " ")}</TableCell>
                          <TableCell className="text-sm">{event.target_type} • {event.target_id}</TableCell>
                          <TableCell>{event.actor_name || event.actor_email || "System"}</TableCell>
                          <TableCell className="text-sm text-slate-600">{new Date(event.created_at).toLocaleString()}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {auditEvents.length === 0 ? <p className="pt-4 text-sm text-slate-500">No audit events available for your scope.</p> : null}
                </CardContent>
              </Card>
            </div>

            {/* Mobile Card View */}
            <div className="space-y-3 lg:hidden">
              {auditEvents.length > 0 ? (
                auditEvents.map((event) => (
                  <Card key={event.id}>
                    <CardContent className="pt-6">
                      <div className="space-y-3">
                        <div>
                          <p className="text-xs text-slate-500">Action</p>
                          <p className="font-medium text-slate-900">{event.action_type.replace(/_/g, " ")}</p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-500">Target</p>
                          <p className="text-sm text-slate-900">{event.target_type}</p>
                          <p className="text-xs text-slate-500 break-all">{event.target_id}</p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-500">Actor</p>
                          <p className="text-sm text-slate-900">{event.actor_name || event.actor_email || "System"}</p>
                        </div>
                        <div className="pt-2 border-t">
                          <p className="text-xs text-slate-500">{new Date(event.created_at).toLocaleString()}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              ) : (
                <Card>
                  <CardContent className="pt-6 text-center">
                    <p className="text-sm text-slate-500">No audit events available for your scope.</p>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>
          ) : null}
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

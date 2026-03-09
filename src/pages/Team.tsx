import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Activity, Clock3, Loader2, Plus, ShieldCheck, Users, Wallet } from "lucide-react";
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
  const canViewDashboard =
    hasPermission("view_workspace_dashboard") ||
    hasPermission("view_team_dashboard") ||
    hasPermission("manage_workspace");
  const canManageMembers =
    hasPermission("manage_workspace") ||
    hasPermission("create_admin") ||
    hasPermission("create_user");
  const canReviewApprovals =
    hasPermission("manage_workspace") ||
    hasPermission("approve_campaign") ||
    hasPermission("approve_sender");
  const canViewAudit = hasPermission("manage_workspace") || hasPermission("view_audit_logs");

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
        canViewDashboard || canReviewApprovals
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
  }, [approvalFilter, canManageMembers, canReviewApprovals, canViewAudit, canViewDashboard, days, user?.id, workspace]);

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
      {
        label: "Pending approvals",
        value: Number(summary?.approvalPending ?? 0).toLocaleString(),
        helper: `${Number(summary?.approvalChangesRequested ?? 0).toLocaleString()} changes requested`,
        icon: ShieldCheck,
      },
      {
        label: "Scoped members",
        value: members.length.toLocaleString(),
        helper: `${members.filter((member) => member.status === "active").length.toLocaleString()} active`,
        icon: Users,
      },
    ];
  }, [dashboard?.summary, members, workspace?.snapshot.creditsRemaining, workspace?.snapshot.creditsUsed]);

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

  const handleInvite = async (payload: Parameters<typeof inviteWorkspaceMember>[0]) => {
    setMemberDialogBusy(true);
    try {
      await inviteWorkspaceMember(payload);
      await Promise.all([refreshWorkspace(), loadData()]);
      toast({
        title: "Invite sent",
        description: `${payload.email} was invited to the workspace.`,
      });
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
      await updateWorkspaceMember(userId, memberInput);
      await setWorkspaceMemberAllocation(userId, allocationInput);
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

  return (
    <DashboardLayout activeTab="team" onTabChange={handleTabChange} user={user} onLogout={handleLogout}>
      <div className="space-y-6">
        <section className="rounded-[28px] border border-[var(--shell-border)] bg-[var(--shell-surface-strong)] p-6 shadow-[0_18px_42px_rgba(15,23,42,0.08)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className={getRoleBadgeClass(workspace.role)}>{roleLabel(workspace.role)}</Badge>
                <Badge className={getMemberStatusBadgeClass(workspace.status)}>{workspace.status}</Badge>
                <Badge variant="outline">{workspace.workspaceName}</Badge>
              </div>
              <div>
                <h1 className="text-3xl font-semibold text-[var(--shell-ink)]" style={{ fontFamily: "var(--shell-font-display)" }}>
                  Team Command Center
                </h1>
                <p className="mt-1 max-w-2xl text-sm text-[var(--shell-muted)]">
                  Manage hierarchy, allocations, approvals, and scoped performance across your workspace.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Select value={days} onValueChange={setDays}>
                <SelectTrigger className="w-[120px] bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">Last 7 days</SelectItem>
                  <SelectItem value="30">Last 30 days</SelectItem>
                  <SelectItem value="90">Last 90 days</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" onClick={() => void loadData()} disabled={loadingData}>
                {loadingData ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Clock3 className="mr-2 h-4 w-4" />}
                Refresh
              </Button>
              {canManageMembers ? (
                <Button onClick={openInviteDialog}>
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
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="members">Members</TabsTrigger>
            <TabsTrigger value="approvals">Approvals</TabsTrigger>
            <TabsTrigger value="spending">Spending</TabsTrigger>
            <TabsTrigger value="audit">Audit</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
              <Card>
                <CardHeader>
                  <CardTitle>Member Utilization</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Member</TableHead>
                          <TableHead>Role</TableHead>
                          <TableHead>Credits</TableHead>
                          <TableHead>Campaigns</TableHead>
                          <TableHead>Senders</TableHead>
                          <TableHead>Daily sends</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {members.slice(0, 8).map((member) => (
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
                            <TableCell>{member.credits_used.toLocaleString()} / {member.credits_allocated?.toLocaleString() || "Unlimited"}</TableCell>
                            <TableCell>{member.active_campaigns} / {member.max_active_campaigns ?? "Unlimited"}</TableCell>
                            <TableCell>{member.active_senders} / {member.max_sender_accounts ?? "Unlimited"}</TableCell>
                            <TableCell>{member.sends_today} / {member.daily_send_limit ?? "Unlimited"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  {highUtilizationMembers.length > 0 ? (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                      {highUtilizationMembers.length} member(s) are above 80% credit utilization and may need a reallocation soon.
                    </div>
                  ) : null}
                </CardContent>
              </Card>

              <div className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Approval Queue</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {approvals.slice(0, 5).map((request) => (
                      <div key={request.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="font-medium text-slate-900">{request.entity_name || request.entity_type}</p>
                            <p className="text-xs text-slate-500">
                              {request.requested_by_name || request.requested_by_email || "Member"} • {new Date(request.created_at).toLocaleString()}
                            </p>
                          </div>
                          <Badge className={getApprovalBadgeClass(request.status)}>{request.status.replace(/_/g, " ")}</Badge>
                        </div>
                      </div>
                    ))}
                    {approvals.length === 0 ? <p className="text-sm text-slate-500">No approvals in scope.</p> : null}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Recent Activity</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {(dashboard?.recentActivity || []).slice(0, 6).map((activity) => (
                      <div key={String(activity.id)} className="rounded-2xl border border-slate-200 bg-white p-3">
                        <p className="text-sm font-medium text-slate-900">{String(activity.actionType || "activity").replace(/_/g, " ")}</p>
                        <p className="text-xs text-slate-500">
                          {String(activity.actorName || activity.actorEmail || "System")} • {new Date(String(activity.createdAt)).toLocaleString()}
                        </p>
                      </div>
                    ))}
                    {!dashboard?.recentActivity?.length ? <p className="text-sm text-slate-500">No recent audit events.</p> : null}
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="members" className="space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Workspace Members</CardTitle>
                  <p className="mt-1 text-sm text-slate-500">Hierarchy, allocations, and policy state for your scope.</p>
                </div>
                {canManageMembers ? (
                  <Button onClick={openInviteDialog}>
                    <Plus className="mr-2 h-4 w-4" />
                    Invite member
                  </Button>
                ) : null}
              </CardHeader>
              <CardContent className="overflow-x-auto">
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
                          {canManageMembers ? (
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
          </TabsContent>

          <TabsContent value="approvals" className="space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Approval Inbox</CardTitle>
                  <p className="mt-1 text-sm text-slate-500">Review pending launches, sender activations, and workflow activations.</p>
                </div>
                <Select value={approvalFilter} onValueChange={setApprovalFilter}>
                  <SelectTrigger className="w-[180px] bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    <SelectItem value="pending_approval">Pending approval</SelectItem>
                    <SelectItem value="changes_requested">Changes requested</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                  </SelectContent>
                </Select>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Entity</TableHead>
                      <TableHead>Requested by</TableHead>
                      <TableHead>Reviewer</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Submitted</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {approvals.map((request) => (
                      <TableRow key={request.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium text-slate-900">{request.entity_name || request.entity_type}</p>
                            <p className="text-xs text-slate-500">{request.entity_type.replace(/_/g, " ")}</p>
                          </div>
                        </TableCell>
                        <TableCell>{request.requested_by_name || request.requested_by_email || "Member"}</TableCell>
                        <TableCell>{request.reviewer_name || request.reviewer_email || "Unassigned"}</TableCell>
                        <TableCell>
                          <Badge className={getApprovalBadgeClass(request.status)}>{request.status.replace(/_/g, " ")}</Badge>
                        </TableCell>
                        <TableCell>{new Date(request.created_at).toLocaleString()}</TableCell>
                        <TableCell>
                          {canReviewApprovals ? (
                            <Button variant="outline" size="sm" onClick={() => void openApprovalDialog(request)}>
                              Review
                            </Button>
                          ) : (
                            <span className="text-xs text-slate-400">Read only</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {approvals.length === 0 ? <p className="pt-4 text-sm text-slate-500">No approval requests match the current filter.</p> : null}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="spending" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
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
                      <TableHead>Credits used</TableHead>
                      <TableHead>Sends</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(spendingRollup?.byManager || []).map((row) => (
                      <TableRow key={row.userId}>
                        <TableCell>{row.name || row.email || row.userId}</TableCell>
                        <TableCell>
                          <Badge className={getRoleBadgeClass(row.role)}>{roleLabel(row.role)}</Badge>
                        </TableCell>
                        <TableCell>{Number(row.creditsUsed || 0).toLocaleString()}</TableCell>
                        <TableCell>{Number(row.sends || 0).toLocaleString()}</TableCell>
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
                      <TableHead>Credits used</TableHead>
                      <TableHead>Sends</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(spendingRollup?.byUser || []).map((row) => (
                      <TableRow key={row.userId}>
                        <TableCell>{row.name || row.email || row.userId}</TableCell>
                        <TableCell>
                          <Badge className={getRoleBadgeClass(row.role)}>{roleLabel(row.role)}</Badge>
                        </TableCell>
                        <TableCell>{Number(row.creditsUsed || 0).toLocaleString()}</TableCell>
                        <TableCell>{Number(row.sends || 0).toLocaleString()}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="audit" className="space-y-4">
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
                        <TableCell>{event.target_type} • {event.target_id}</TableCell>
                        <TableCell>{event.actor_name || event.actor_email || "System"}</TableCell>
                        <TableCell>{new Date(event.created_at).toLocaleString()}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {auditEvents.length === 0 ? <p className="pt-4 text-sm text-slate-500">No audit events available for your scope.</p> : null}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <MemberEditorDialog
        open={memberDialogOpen}
        onOpenChange={setMemberDialogOpen}
        mode={memberDialogMode}
        actorRole={workspace.role}
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

import React, { useEffect, useMemo, useState } from "react";
import { Loader2, AlertCircle } from "lucide-react";
import {
  canActorInviteRole,
  roleLabel,
  type InviteWorkspaceMemberInput,
  type MemberStatus,
  type UpdateWorkspaceMemberInput,
  type WorkspaceMember,
  type WorkspaceRole,
} from "@/lib/teamManagement";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

type AllocationState = {
  creditsAllocated: string;
  maxActiveCampaigns: string;
  maxSenderAccounts: string;
  dailySendLimit: string;
  maxAutomations: string;
};

type MemberEditorDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "invite" | "edit";
  actorRole: WorkspaceRole | null | undefined;
  supportsApprovalFlows?: boolean;
  members: WorkspaceMember[];
  targetMember?: WorkspaceMember | null;
  defaultParentUserId?: string | null;
  loading?: boolean;
  onInvite: (payload: InviteWorkspaceMemberInput) => Promise<void>;
  onUpdate: (
    userId: string,
    memberInput: UpdateWorkspaceMemberInput,
    allocationInput: {
      creditsAllocated?: number | null;
      maxActiveCampaigns?: number | null;
      maxSenderAccounts?: number | null;
      dailySendLimit?: number | null;
      maxAutomations?: number | null;
    },
  ) => Promise<void>;
};

const toOptionalNumber = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
};

const toInitialAllocation = (member?: WorkspaceMember | null): AllocationState => ({
  creditsAllocated: member?.credits_allocated?.toString() || "",
  maxActiveCampaigns: member?.max_active_campaigns?.toString() || "",
  maxSenderAccounts: member?.max_sender_accounts?.toString() || "",
  dailySendLimit: member?.daily_send_limit?.toString() || "",
  maxAutomations: member?.max_automations?.toString() || "",
});

const SectionHeader = ({ title, description }: { title: string; description?: string }) => (
  <div className="space-y-1 mb-4">
    <h3 className="font-semibold text-slate-900 text-sm">{title}</h3>
    {description && <p className="text-xs text-slate-500">{description}</p>}
  </div>
);

const FormSection = ({ children }: { children: React.ReactNode }) => (
  <div className="space-y-4 pb-6 border-b border-slate-200 last:border-b-0">{children}</div>
);

const FormField = ({ label, helper, children }: { label: string; helper?: string; children: React.ReactNode }) => (
  <div className="space-y-2">
    <Label className="text-sm font-medium text-slate-900">{label}</Label>
    {children}
    {helper && <p className="text-xs text-slate-500">{helper}</p>}
  </div>
);

const MemberEditorDialog = ({
  open,
  onOpenChange,
  mode,
  actorRole,
  supportsApprovalFlows = true,
  members,
  targetMember,
  defaultParentUserId,
  loading = false,
  onInvite,
  onUpdate,
}: MemberEditorDialogProps) => {
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<WorkspaceRole>("user");
  const [status, setStatus] = useState<MemberStatus>("active");
  const [parentUserId, setParentUserId] = useState<string>("");
  const [assignedReviewerUserId, setAssignedReviewerUserId] = useState<string>("");
  const [canManageBilling, setCanManageBilling] = useState(false);
  const [canManageWorkspace, setCanManageWorkspace] = useState(false);
  const [requireCampaignApproval, setRequireCampaignApproval] = useState<boolean | null>(null);
  const [requireSenderApproval, setRequireSenderApproval] = useState<boolean | null>(null);
  const [requireAutomationApproval, setRequireAutomationApproval] = useState<boolean | null>(null);
  const [allocation, setAllocation] = useState<AllocationState>(toInitialAllocation());

  useEffect(() => {
    if (!open) return;

    if (mode === "edit" && targetMember) {
      setEmail(targetMember.email || "");
      setFullName(targetMember.full_name || "");
      setRole(targetMember.role);
      setStatus(targetMember.status);
      setParentUserId(targetMember.parent_user_id || "");
      setAssignedReviewerUserId(targetMember.assigned_reviewer_user_id || "");
      setCanManageBilling(Boolean(targetMember.can_manage_billing));
      setCanManageWorkspace(Boolean(targetMember.can_manage_workspace));
      setRequireCampaignApproval(targetMember.require_campaign_approval);
      setRequireSenderApproval(targetMember.require_sender_approval);
      setRequireAutomationApproval(targetMember.require_automation_approval);
      setAllocation(toInitialAllocation(targetMember));
      return;
    }

    setEmail("");
    setFullName("");
    setRole(actorRole === "owner" ? "user" : "user");
    setStatus("active");
    setParentUserId(defaultParentUserId || "");
    setAssignedReviewerUserId("");
    setCanManageBilling(false);
    setCanManageWorkspace(false);
    setRequireCampaignApproval(null);
    setRequireSenderApproval(null);
    setRequireAutomationApproval(null);
    setAllocation(toInitialAllocation());
  }, [actorRole, defaultParentUserId, mode, open, targetMember]);

  const parentOptions = useMemo(() => {
    const managers = members.filter((member) => ["owner", "admin", "sub_admin"].includes(member.role));
    if (actorRole === "admin") {
      return managers.filter((member) => member.user_id === defaultParentUserId);
    }
    return managers;
  }, [actorRole, defaultParentUserId, members]);

  const reviewerOptions = useMemo(
    () => members.filter((member) => ["owner", "admin", "sub_admin", "reviewer"].includes(member.role)),
    [members],
  );

  const roleOptions = useMemo(() => {
    const values: WorkspaceRole[] = ["owner", "admin", "sub_admin", "user", "reviewer"];
    const allowed = values.filter(
      (value) => canActorInviteRole(actorRole, value) && (supportsApprovalFlows || value !== "reviewer"),
    );
    if (mode === "edit" && targetMember?.role && !allowed.includes(targetMember.role)) {
      return [targetMember.role, ...allowed];
    }
    return allowed;
  }, [actorRole, mode, supportsApprovalFlows, targetMember?.role]);

  const approvalControlsLocked = role === "owner" || role === "admin" || role === "reviewer";

  const handleSubmit = async () => {
    if (!fullName.trim()) return;
    if (mode === "invite" && !email.trim()) return;

    const allocationPayload = {
      creditsAllocated: toOptionalNumber(allocation.creditsAllocated),
      maxActiveCampaigns: toOptionalNumber(allocation.maxActiveCampaigns),
      maxSenderAccounts: toOptionalNumber(allocation.maxSenderAccounts),
      dailySendLimit: toOptionalNumber(allocation.dailySendLimit),
      maxAutomations: toOptionalNumber(allocation.maxAutomations),
    };

    if (mode === "invite") {
      await onInvite({
        email,
        fullName,
        role,
        parentUserId: parentUserId || null,
        assignedReviewerUserId: supportsApprovalFlows ? assignedReviewerUserId || null : null,
        canManageBilling,
        canManageWorkspace,
        requireCampaignApproval: supportsApprovalFlows && !approvalControlsLocked ? requireCampaignApproval : null,
        requireSenderApproval: supportsApprovalFlows && !approvalControlsLocked ? requireSenderApproval : null,
        requireAutomationApproval: supportsApprovalFlows && !approvalControlsLocked ? requireAutomationApproval : null,
        ...allocationPayload,
      });
      onOpenChange(false);
      return;
    }

    if (!targetMember) return;

    await onUpdate(
      targetMember.user_id,
      {
        fullName,
        role,
        status,
        parentUserId: parentUserId || null,
        assignedReviewerUserId: supportsApprovalFlows ? assignedReviewerUserId || null : undefined,
        canManageBilling,
        canManageWorkspace,
        requireCampaignApproval: supportsApprovalFlows && !approvalControlsLocked ? requireCampaignApproval : null,
        requireSenderApproval: supportsApprovalFlows && !approvalControlsLocked ? requireSenderApproval : null,
        requireAutomationApproval: supportsApprovalFlows && !approvalControlsLocked ? requireAutomationApproval : null,
      },
      allocationPayload,
    );
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:w-[500px] sm:max-w-none flex flex-col p-0">
        {/* Fixed Header */}
        <SheetHeader className="border-b border-slate-200 px-6 py-5">
          <SheetTitle className="text-xl font-semibold">
            {mode === "invite" ? "Invite Team Member" : "Update Team Member"}
          </SheetTitle>
          <SheetDescription className="mt-1 text-sm">
            {mode === "invite"
              ? "Set role, allocations, and approval policies."
              : "Adjust role, hierarchy, allocations, and approval settings."}
          </SheetDescription>
        </SheetHeader>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
          {/* Basic Information Section */}
          <FormSection>
            <SectionHeader 
              title="Basic Information" 
              description={mode === "invite" ? "Email and name of the team member" : "Member details"}
            />
            
            <FormField label="Full name" helper="Required">
              <Input
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                placeholder="John Doe"
                className="bg-white"
              />
            </FormField>

            <FormField label="Email">
              <Input
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                disabled={mode === "edit"}
                placeholder="john@company.com"
                className="bg-white disabled:bg-slate-50"
              />
            </FormField>
          </FormSection>

          {/* Role & Status Section */}
          <FormSection>
            <SectionHeader 
              title="Role & Status" 
              description="Team member permissions and access level"
            />
            
            <FormField label="Role" helper="Determines what actions they can perform">
              <Select value={role} onValueChange={(value) => setRole(value as WorkspaceRole)}>
                <SelectTrigger className="bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {roleOptions.map((value) => (
                    <SelectItem key={value} value={value}>
                      {roleLabel(value)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>

            {mode === "edit" && (
              <FormField label="Status">
                <Select value={status} onValueChange={(value) => setStatus(value as MemberStatus)}>
                  <SelectTrigger className="bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="invited">Invited</SelectItem>
                    <SelectItem value="disabled">Disabled</SelectItem>
                  </SelectContent>
                </Select>
              </FormField>
            )}
          </FormSection>

          {/* Hierarchy Section */}
          <FormSection>
            <SectionHeader 
              title="Hierarchy & Approval" 
              description="Who manages this member and reviews their work"
            />
            
            <FormField label="Reports to" helper="Their direct admin manager">
              <Select value={parentUserId || "__none"} onValueChange={(value) => setParentUserId(value === "__none" ? "" : value)}>
                <SelectTrigger className="bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">Workspace owner</SelectItem>
                  {parentOptions.map((member) => (
                    <SelectItem key={member.user_id} value={member.user_id}>
                      {member.full_name || member.email || member.user_id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>

            {supportsApprovalFlows && (
              <FormField label="Approval Reviewer" helper="Who reviews their requests">
                <Select
                  value={assignedReviewerUserId || "__none"}
                  onValueChange={(value) => setAssignedReviewerUserId(value === "__none" ? "" : value)}
                >
                  <SelectTrigger className="bg-white">
                    <SelectValue placeholder="Auto-assign reviewer" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">Auto-assign reviewer</SelectItem>
                    {reviewerOptions.map((member) => (
                      <SelectItem key={member.user_id} value={member.user_id}>
                        {member.full_name || member.email || member.user_id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
            )}
          </FormSection>

          {/* Allocations Section */}
          <FormSection>
            <SectionHeader 
              title="Resource Allocations" 
              description="Set limits for credits, campaigns, and sending"
            />
            
            <div className="space-y-4">
              <FormField label="Credits allocation" helper="Leave blank for unlimited">
                <Input
                  type="number"
                  min="0"
                  value={allocation.creditsAllocated}
                  onChange={(event) =>
                    setAllocation((prev) => ({ ...prev, creditsAllocated: event.target.value }))
                  }
                  placeholder="e.g., 10000"
                  className="bg-white"
                />
              </FormField>

              <FormField label="Max active campaigns" helper="Leave blank for unlimited">
                <Input
                  type="number"
                  min="0"
                  value={allocation.maxActiveCampaigns}
                  onChange={(event) =>
                    setAllocation((prev) => ({ ...prev, maxActiveCampaigns: event.target.value }))
                  }
                  placeholder="e.g., 5"
                  className="bg-white"
                />
              </FormField>

              <FormField label="Max sender accounts" helper="Leave blank for unlimited">
                <Input
                  type="number"
                  min="0"
                  value={allocation.maxSenderAccounts}
                  onChange={(event) =>
                    setAllocation((prev) => ({ ...prev, maxSenderAccounts: event.target.value }))
                  }
                  placeholder="e.g., 3"
                  className="bg-white"
                />
              </FormField>

              <FormField label="Daily send limit" helper="Leave blank for unlimited">
                <Input
                  type="number"
                  min="0"
                  value={allocation.dailySendLimit}
                  onChange={(event) =>
                    setAllocation((prev) => ({ ...prev, dailySendLimit: event.target.value }))
                  }
                  placeholder="e.g., 100000"
                  className="bg-white"
                />
              </FormField>

              <FormField label="Max automations" helper="Leave blank for unlimited">
                <Input
                  type="number"
                  min="0"
                  value={allocation.maxAutomations}
                  onChange={(event) =>
                    setAllocation((prev) => ({ ...prev, maxAutomations: event.target.value }))
                  }
                  placeholder="e.g., 10"
                  className="bg-white"
                />
              </FormField>
            </div>
          </FormSection>

          {/* Permissions Section */}
          <FormSection>
            <SectionHeader 
              title="Permissions" 
              description="Additional capabilities and access"
            />
            
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors">
                <div className="flex-1">
                  <p className="font-medium text-sm text-slate-900">Billing Management</p>
                  <p className="text-xs text-slate-500">Plan and payment access</p>
                </div>
                <Switch checked={canManageBilling} onCheckedChange={setCanManageBilling} />
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors">
                <div className="flex-1">
                  <p className="font-medium text-sm text-slate-900">Workspace Management</p>
                  <p className="text-xs text-slate-500">Team governance and settings</p>
                </div>
                <Switch checked={canManageWorkspace} onCheckedChange={setCanManageWorkspace} />
              </div>
            </div>
          </FormSection>

          {/* Approval Requirements Section */}
          {supportsApprovalFlows && (
            <FormSection>
              <SectionHeader 
                title="Approval Requirements" 
                description={approvalControlsLocked ? "Admins are exempt from approvals" : "Routes their requests through approval queue"}
              />
              
              {approvalControlsLocked && (
                <div className="flex gap-3 p-3 rounded-lg border border-amber-200 bg-amber-50">
                  <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-700">Owners, admins, and reviewers bypass approval gates</p>
                </div>
              )}

              <div className="space-y-4">
                <div className="flex items-center justify-between p-3 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors">
                  <div className="flex-1">
                    <p className="font-medium text-sm text-slate-900">Campaign Approval</p>
                    <p className="text-xs text-slate-500">Require approval for launches</p>
                  </div>
                  <Switch
                    checked={Boolean(requireCampaignApproval)}
                    onCheckedChange={(checked) => setRequireCampaignApproval(checked)}
                    disabled={approvalControlsLocked}
                  />
                </div>

                <div className="flex items-center justify-between p-3 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors">
                  <div className="flex-1">
                    <p className="font-medium text-sm text-slate-900">Sender Approval</p>
                    <p className="text-xs text-slate-500">Require approval for sender setup</p>
                  </div>
                  <Switch
                    checked={Boolean(requireSenderApproval)}
                    onCheckedChange={(checked) => setRequireSenderApproval(checked)}
                    disabled={approvalControlsLocked}
                  />
                </div>

                <div className="flex items-center justify-between p-3 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors">
                  <div className="flex-1">
                    <p className="font-medium text-sm text-slate-900">Automation Approval</p>
                    <p className="text-xs text-slate-500">Require approval for workflows</p>
                  </div>
                  <Switch
                    checked={Boolean(requireAutomationApproval)}
                    onCheckedChange={(checked) => setRequireAutomationApproval(checked)}
                    disabled={approvalControlsLocked}
                  />
                </div>
              </div>
            </FormSection>
          )}

          {!supportsApprovalFlows && (
            <div className="flex gap-3 p-3 rounded-lg border border-slate-200 bg-slate-50">
              <AlertCircle className="h-4 w-4 text-slate-500 shrink-0 mt-0.5" />
              <p className="text-xs text-slate-600">Approval routing available on Growth plan and above</p>
            </div>
          )}
        </div>

        {/* Fixed Footer */}
        <SheetFooter className="border-t border-slate-200 px-6 py-4 bg-white">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button
            onClick={() => void handleSubmit()}
            disabled={loading || !fullName.trim() || (mode === "invite" && !email.trim())}
          >
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {mode === "invite" ? "Send invite" : "Save changes"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};

export default MemberEditorDialog;

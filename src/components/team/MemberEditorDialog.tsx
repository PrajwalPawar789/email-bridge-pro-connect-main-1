import React, { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
        requireCampaignApproval: supportsApprovalFlows ? requireCampaignApproval : null,
        requireSenderApproval: supportsApprovalFlows ? requireSenderApproval : null,
        requireAutomationApproval: supportsApprovalFlows ? requireAutomationApproval : null,
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
        requireCampaignApproval: supportsApprovalFlows ? requireCampaignApproval : undefined,
        requireSenderApproval: supportsApprovalFlows ? requireSenderApproval : undefined,
        requireAutomationApproval: supportsApprovalFlows ? requireAutomationApproval : undefined,
      },
      allocationPayload,
    );
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{mode === "invite" ? "Invite Team Member" : "Update Team Member"}</DialogTitle>
          <DialogDescription>
            {mode === "invite"
              ? "Create a scoped team member with an allocation and approval policy."
              : "Adjust hierarchy, limits, and approval requirements for this member."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Full name</Label>
            <Input value={fullName} onChange={(event) => setFullName(event.target.value)} />
          </div>

          <div className="space-y-2">
            <Label>Email</Label>
            <Input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={mode === "edit"}
              placeholder="teammate@company.com"
            />
          </div>

          <div className="space-y-2">
            <Label>Role</Label>
            <Select value={role} onValueChange={(value) => setRole(value as WorkspaceRole)}>
              <SelectTrigger>
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
          </div>

          {mode === "edit" ? (
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={status} onValueChange={(value) => setStatus(value as MemberStatus)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="invited">Invited</SelectItem>
                  <SelectItem value="disabled">Disabled</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ) : null}

          <div className="space-y-2">
            <Label>Parent admin</Label>
            <Select value={parentUserId || "__none"} onValueChange={(value) => setParentUserId(value === "__none" ? "" : value)}>
              <SelectTrigger>
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
          </div>

          {supportsApprovalFlows ? (
            <div className="space-y-2">
              <Label>Reviewer</Label>
              <Select
                value={assignedReviewerUserId || "__none"}
                onValueChange={(value) => setAssignedReviewerUserId(value === "__none" ? "" : value)}
              >
                <SelectTrigger>
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
            </div>
          ) : null}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Credits allocation</Label>
            <Input
              type="number"
              min="0"
              value={allocation.creditsAllocated}
              onChange={(event) =>
                setAllocation((prev) => ({ ...prev, creditsAllocated: event.target.value }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label>Max active campaigns</Label>
            <Input
              type="number"
              min="0"
              value={allocation.maxActiveCampaigns}
              onChange={(event) =>
                setAllocation((prev) => ({ ...prev, maxActiveCampaigns: event.target.value }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label>Max sender accounts</Label>
            <Input
              type="number"
              min="0"
              value={allocation.maxSenderAccounts}
              onChange={(event) =>
                setAllocation((prev) => ({ ...prev, maxSenderAccounts: event.target.value }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label>Daily send limit</Label>
            <Input
              type="number"
              min="0"
              value={allocation.dailySendLimit}
              onChange={(event) =>
                setAllocation((prev) => ({ ...prev, dailySendLimit: event.target.value }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label>Max automations</Label>
            <Input
              type="number"
              min="0"
              value={allocation.maxAutomations}
              onChange={(event) =>
                setAllocation((prev) => ({ ...prev, maxAutomations: event.target.value }))
              }
            />
          </div>
        </div>

        <div className="grid gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-2">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="font-medium text-slate-900">Billing permission</p>
              <p className="text-xs text-slate-500">Allow plan and payment management.</p>
            </div>
            <Switch checked={canManageBilling} onCheckedChange={setCanManageBilling} />
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="font-medium text-slate-900">Workspace permission</p>
              <p className="text-xs text-slate-500">Allow broader team governance actions.</p>
            </div>
            <Switch checked={canManageWorkspace} onCheckedChange={setCanManageWorkspace} />
          </div>
          {supportsApprovalFlows ? (
            <>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="font-medium text-slate-900">Campaign approval required</p>
                  <p className="text-xs text-slate-500">Route launches through the approval queue.</p>
                </div>
                <Switch
                  checked={Boolean(requireCampaignApproval)}
                  onCheckedChange={(checked) => setRequireCampaignApproval(checked)}
                />
              </div>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="font-medium text-slate-900">Sender approval required</p>
                  <p className="text-xs text-slate-500">Block sender activation until approved.</p>
                </div>
                <Switch
                  checked={Boolean(requireSenderApproval)}
                  onCheckedChange={(checked) => setRequireSenderApproval(checked)}
                />
              </div>
              <div className="flex items-center justify-between gap-4 md:col-span-2">
                <div>
                  <p className="font-medium text-slate-900">Automation approval required</p>
                  <p className="text-xs text-slate-500">Hold workflow activation until approved.</p>
                </div>
                <Switch
                  checked={Boolean(requireAutomationApproval)}
                  onCheckedChange={(checked) => setRequireAutomationApproval(checked)}
                />
              </div>
            </>
          ) : (
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 md:col-span-2">
              Approval routing becomes available on plans with advanced team governance.
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={loading || !fullName.trim() || (mode === "invite" && !email.trim())}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {mode === "invite" ? "Send invite" : "Save member"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default MemberEditorDialog;

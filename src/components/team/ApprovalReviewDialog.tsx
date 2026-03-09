import React, { useEffect, useState } from "react";
import { CheckCircle2, Loader2, MessageSquareText, XCircle } from "lucide-react";
import {
  approvalLabel,
  getApprovalBadgeClass,
  type ApprovalAction,
  type ApprovalTimelineEvent,
  type WorkspaceApprovalRequest,
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

type ApprovalReviewDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  request: WorkspaceApprovalRequest | null;
  timeline: ApprovalTimelineEvent[];
  loading?: boolean;
  onSubmit: (action: ApprovalAction, comment: string) => Promise<void>;
};

const ApprovalReviewDialog = ({
  open,
  onOpenChange,
  request,
  timeline,
  loading = false,
  onSubmit,
}: ApprovalReviewDialogProps) => {
  const [comment, setComment] = useState("");

  useEffect(() => {
    if (!open) {
      setComment("");
    }
  }, [open]);

  const handleAction = async (action: ApprovalAction) => {
    await onSubmit(action, comment);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Review Approval Request</DialogTitle>
          <DialogDescription>
            {request
              ? `${request.entity_name || request.entity_type} requested by ${request.requested_by_name || request.requested_by_email || "a workspace member"}`
              : "Review the request details and leave guidance for the requester."}
          </DialogDescription>
        </DialogHeader>

        {request ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className={getApprovalBadgeClass(request.status)}>{approvalLabel(request.status)}</Badge>
              <Badge variant="outline">{request.entity_type.replace(/_/g, " ")}</Badge>
              {request.desired_status ? <Badge variant="outline">Desired: {request.desired_status}</Badge> : null}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
              <p>
                <span className="font-medium text-slate-900">Reason:</span> {request.reason || "No reason provided"}
              </p>
              <p className="mt-2">
                <span className="font-medium text-slate-900">Requester notes:</span> {request.comments || "None"}
              </p>
            </div>

            <div className="space-y-2">
              <Label>Reviewer comment</Label>
              <Textarea
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                placeholder="Add feedback, requested changes, or approval notes..."
                className="min-h-[100px]"
              />
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <MessageSquareText className="h-4 w-4 text-slate-500" />
                <p className="text-sm font-medium text-slate-900">Timeline</p>
              </div>
              <div className="max-h-[220px] space-y-3 overflow-auto rounded-2xl border border-slate-200 bg-white p-4">
                {timeline.length === 0 ? (
                  <p className="text-sm text-slate-500">No approval actions recorded yet.</p>
                ) : (
                  timeline.map((entry) => (
                    <div key={entry.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium text-slate-900">
                          {approvalLabel(entry.action_type)}
                        </p>
                        <p className="text-xs text-slate-500">
                          {new Date(entry.created_at).toLocaleString()}
                        </p>
                      </div>
                      <p className="mt-1 text-xs text-slate-600">
                        {entry.actor_name || entry.actor_email || "System"}
                      </p>
                      {entry.comment ? <p className="mt-2 text-sm text-slate-700">{entry.comment}</p> : null}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        ) : null}

        <DialogFooter className="flex flex-wrap justify-between gap-2">
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => void handleAction("changes_requested")} disabled={loading || !request}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Request changes
            </Button>
            <Button variant="outline" className="border-rose-200 text-rose-700 hover:bg-rose-50" onClick={() => void handleAction("rejected")} disabled={loading || !request}>
              <XCircle className="mr-2 h-4 w-4" />
              Reject
            </Button>
          </div>
          <Button onClick={() => void handleAction("approved")} disabled={loading || !request}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
            Approve
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ApprovalReviewDialog;

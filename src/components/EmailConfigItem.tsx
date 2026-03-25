import React, { useCallback } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { MoreHorizontal } from 'lucide-react';
import { approvalLabel, getApprovalBadgeClass } from '@/lib/teamManagement';

interface EmailConfigItemProps {
  config: any;
  providerLabel: string;
  approvalStatus: string;
  canSubmitForApproval: boolean;
  approvalSubmitting: boolean;
  onEdit: (config: any) => void;
  onDelete: (config: any) => void;
  onSubmitApproval: (config: any) => void;
}

const EmailConfigItem: React.FC<EmailConfigItemProps> = React.memo(({
  config,
  providerLabel,
  approvalStatus,
  canSubmitForApproval,
  approvalSubmitting,
  onEdit,
  onDelete,
  onSubmitApproval
}) => {
  const displayName = config.sender_name || 'Sender name missing';
  const activationLabel = config.is_active === false ? 'Inactive' : 'Active';

  const handleEdit = useCallback(() => {
    onEdit(config);
  }, [config, onEdit]);

  const handleDelete = useCallback(() => {
    onDelete(config);
  }, [config, onDelete]);

  const handleSubmitApproval = useCallback(() => {
    onSubmitApproval(config);
  }, [config, onSubmitApproval]);

  return (
    <div className="group flex flex-col gap-3 rounded-2xl border border-transparent bg-white px-4 py-3 shadow-sm ring-1 ring-slate-100 transition hover:border-slate-200 hover:bg-slate-50 md:flex-row md:items-center md:justify-between">
      <div className="flex items-center gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-emerald-100 to-sky-100 text-sm font-semibold text-emerald-700">
          {(displayName || config.smtp_username || 'E').charAt(0).toUpperCase()}
        </div>
        <div className="space-y-1">
          <p className="text-sm font-semibold text-slate-900">{displayName}</p>
          <p className="text-xs text-slate-500">{config.smtp_username}</p>
          <p className="text-[11px] text-slate-400">
            {providerLabel} | {config.smtp_host}:{config.smtp_port}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Badge className={getApprovalBadgeClass(approvalStatus)}>{approvalLabel(approvalStatus)}</Badge>
        <Badge
          className={
            config.is_active === false
              ? 'border border-slate-200 bg-slate-50 text-slate-700'
              : 'border border-emerald-200 bg-emerald-50 text-emerald-700'
          }
        >
          {activationLabel}
        </Badge>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={handleEdit}>
              Edit Configuration
            </DropdownMenuItem>
            {canSubmitForApproval ? (
              <DropdownMenuItem
                disabled={approvalSubmitting}
                onSelect={handleSubmitApproval}
              >
                {approvalSubmitting ? 'Submitting...' : 'Submit for approval'}
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-rose-600" onSelect={handleDelete}>
              Disconnect Account
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
});

EmailConfigItem.displayName = 'EmailConfigItem';

export default EmailConfigItem;

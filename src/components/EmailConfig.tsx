import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { toast } from '@/hooks/use-toast';
import { ChevronLeft, ChevronRight, Download, FileSpreadsheet, Loader2, MoreHorizontal, Search } from 'lucide-react';
import { getBillingSnapshot, type BillingSnapshot } from '@/lib/billing';
import { useWorkspace } from '@/providers/WorkspaceProvider';
import {
  approvalLabel,
  getApprovalBadgeClass,
  normalizeTeamErrorMessage,
  submitApprovalRequest
} from '@/lib/teamManagement';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog';
import EmailConfigPanel from '@/components/EmailConfigPanel';
import EmailConfigItem from '@/components/EmailConfigItem';

interface EmailConfigProps {
  onConfigAdded?: () => void;
}

type BulkImportSummary = {
  total: number;
  inserted: number;
  skipped: number;
  errors: number;
  failedRows: number[];
};

const resolveProviderLabel = (host: string) => {
  if (!host) return 'Custom SMTP';
  if (host.includes('gmail')) return 'Gmail';
  if (host.includes('office365') || host.includes('outlook')) return 'Outlook';
  if (host.includes('titan')) return 'Titan';
  if (host.includes('hostinger')) return 'Hostinger';
  return 'Custom SMTP';
};

const emptyForm: FormState = {
  sender_name: '',
  smtp_username: '',
  smtp_password: '',
  smtp_host: 'smtp.titan.email',
  smtp_port: 465,
  imap_host: 'imap.titan.email',
  imap_port: 993,
  security: 'SSL'
};

const normalizeCell = (value: unknown) => String(value ?? '').trim();

const normalizeHeader = (value: unknown) =>
  normalizeCell(value)
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/-/g, '_');

const parsePort = (value: string) => {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
};

const resolvePresetFromProvider = (value: string) => {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return undefined;

  if (normalized.includes('gmail')) return providerPresets.find((preset) => preset.id === 'gmail');
  if (normalized.includes('outlook') || normalized.includes('office365') || normalized.includes('microsoft')) {
    return providerPresets.find((preset) => preset.id === 'outlook');
  }
  if (normalized.includes('titan')) return providerPresets.find((preset) => preset.id === 'titan');
  if (normalized.includes('hostinger')) return providerPresets.find((preset) => preset.id === 'hostinger');

  return providerPresets.find((preset) => preset.id === normalized);
};

const EmailConfig: React.FC<EmailConfigProps> = ({ onConfigAdded }) => {
  const { workspace } = useWorkspace();
  const [configs, setConfigs] = useState<any[]>([]);
  const [billingSnapshot, setBillingSnapshot] = useState<BillingSnapshot | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelMode, setPanelMode] = useState<'create' | 'edit'>('create');
  const [activeConfig, setActiveConfig] = useState<any | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
  const [bulkImporting, setBulkImporting] = useState(false);
  const [bulkImportSummary, setBulkImportSummary] = useState<BulkImportSummary | null>(null);
  const [approvalSubmitting, setApprovalSubmitting] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const itemsPerPage = 8;
  const requiresSenderApproval = Boolean(workspace?.requiresApproval.sender);

  useEffect(() => {
    fetchConfigs();
  }, []);

  const senderLimitReached = useMemo(() => {
    if (!billingSnapshot || billingSnapshot.unlimited_mailboxes) return false;
    const used = Number(billingSnapshot.mailboxes_used || 0);
    const limit = Number(billingSnapshot.mailbox_limit || 0);
    return limit > 0 && used >= limit;
  }, [billingSnapshot]);

  const getSenderApprovalStatus = (config: any) => {
    const explicitStatus = String(config?.approval_status || '').trim();
    if (explicitStatus) return explicitStatus;
    return config?.is_active === false ? 'draft' : 'approved';
  };

  const requestSenderApproval = useCallback(async (
    config: any,
    options: {
      silent?: boolean;
      refreshAfter?: boolean;
      source?: string;
    } = {}
  ) => {
    if (!config?.id || approvalSubmitting.has(config.id)) {
      return;
    }

    setApprovalSubmitting((prev) => new Set(prev).add(config.id));
    try {
      await submitApprovalRequest('sender_account', config.id, {
        reason: 'Sender activation review',
        comments: options.source || `Submitted sender ${config.smtp_username || config.id} for activation approval.`,
      });

      if (!options.silent) {
        toast({
          title: 'Submitted for approval',
          description: 'Sender activation is now waiting in the approval queue.',
        });
      }
    } catch (error) {
      if (!options.silent) {
        toast({
          title: 'Approval request failed',
          description: normalizeTeamErrorMessage(error),
          variant: 'destructive',
        });
      }
      throw error;
    } finally {
      setApprovalSubmitting((prev) => {
        const next = new Set(prev);
        next.delete(config.id);
        return next;
      });

      if (options.refreshAfter !== false) {
        await fetchConfigs();
      }
    }
  }, [approvalSubmitting]);

  const fetchConfigs = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const [configsResult, snapshot] = await Promise.all([
        supabase
          .from('email_configs')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false }),
        getBillingSnapshot(user.id),
      ]);

      const { data, error } = configsResult;
      if (error) throw error;
      setConfigs(data || []);
      setBillingSnapshot(snapshot);
    } catch (error: any) {
      console.error('Error fetching configs:', error);
    }
  };

  const openCreateForm = useCallback(() => {
    if (senderLimitReached) {
      toast({
        title: 'Sender limit reached',
        description:
          billingSnapshot?.unlimited_mailboxes
            ? 'Upgrade required to add more sender accounts.'
            : `Mailbox limit reached for your current plan (${billingSnapshot?.mailbox_limit ?? 0} mailboxes). Upgrade to add more inboxes.`,
        variant: 'destructive',
      });
      return;
    }

    setPanelMode('create');
    setActiveConfig(null);
    setPanelOpen(true);
  }, [senderLimitReached, billingSnapshot]);

  const openEditForm = useCallback((config: any) => {
    setPanelMode('edit');
    setActiveConfig(config);
    setPanelOpen(true);
  }, []);



  const handleDelete = async (id: string) => {
    try {
      const { data: messages, error: checkError } = await supabase
        .from('email_messages')
        .select('id')
        .eq('config_id', id)
        .limit(1);

      if (checkError) throw checkError;

      if (messages && messages.length > 0) {
        const { error: deleteMessagesError } = await supabase
          .from('email_messages')
          .delete()
          .eq('config_id', id);

        if (deleteMessagesError) throw deleteMessagesError;
      }

      const { error } = await supabase
        .from('email_configs')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Email configuration and associated messages deleted successfully!',
      });

      await fetchConfigs();
      if (onConfigAdded) onConfigAdded();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const downloadSampleWorkbook = () => {
    const link = document.createElement('a');
    link.href = '/templates/email-accounts-sample.xlsx';
    link.download = 'email-accounts-sample.xlsx';
    link.click();
  };

  const handleBulkFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setBulkImporting(true);
    setBulkImportSummary(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const XLSX = await import('xlsx');
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      if (!firstSheetName) throw new Error('No worksheet found in file.');

      const sheet = workbook.Sheets[firstSheetName];
      const rows = XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        defval: '',
        blankrows: false
      }) as unknown[][];

      const headerRowIndex = rows.findIndex(
        (row) => Array.isArray(row) && row.some((cell) => normalizeCell(cell) !== '')
      );

      if (headerRowIndex === -1) {
        throw new Error('Could not find a header row in the uploaded file.');
      }

      const headers = (rows[headerRowIndex] || []).map((value) => normalizeHeader(value));
      const findColumnIndex = (aliases: string[]) => headers.findIndex((header) => aliases.includes(header));

      const columnMap = {
        sender_name: findColumnIndex(['sender_name', 'sender', 'sender_display_name', 'display_name', 'name']),
        smtp_username: findColumnIndex(['smtp_username', 'smtp_email', 'email', 'email_address', 'username']),
        smtp_password: findColumnIndex(['smtp_password', 'password', 'app_password', 'app_pass']),
        provider: findColumnIndex(['provider', 'preset']),
        smtp_host: findColumnIndex(['smtp_host']),
        smtp_port: findColumnIndex(['smtp_port']),
        imap_host: findColumnIndex(['imap_host']),
        imap_port: findColumnIndex(['imap_port']),
        security: findColumnIndex(['security', 'encryption', 'ssl_tls'])
      };

      const missingRequiredColumns: string[] = [];
      if (columnMap.sender_name === -1) missingRequiredColumns.push('sender_name');
      if (columnMap.smtp_username === -1) missingRequiredColumns.push('smtp_username');
      if (columnMap.smtp_password === -1) missingRequiredColumns.push('smtp_password');

      if (missingRequiredColumns.length > 0) {
        throw new Error(`Missing required column(s): ${missingRequiredColumns.join(', ')}`);
      }

      const dataRows = rows.slice(headerRowIndex + 1);
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

      const { data: existingConfigs, error: existingError } = await supabase
        .from('email_configs')
        .select('smtp_username')
        .eq('user_id', user.id);

      if (existingError) throw existingError;

      const existingEmails = new Set(
        (existingConfigs || [])
          .map((config) => normalizeCell(config.smtp_username).toLowerCase())
          .filter(Boolean)
      );

      const seenInFile = new Set<string>();
      const failedRows: number[] = [];
      const parsedRows: Array<{ rowNumber: number; payload: FormState }> = [];
      let skipped = 0;
      let total = 0;

      const getValue = (row: unknown[], index: number) => {
        if (index === -1) return '';
        return normalizeCell(row[index]);
      };

      for (let index = 0; index < dataRows.length; index += 1) {
        const row = dataRows[index] || [];
        const rowNumber = headerRowIndex + index + 2;

        if (!row.some((cell) => normalizeCell(cell) !== '')) {
          continue;
        }

        total += 1;

        const senderName = getValue(row, columnMap.sender_name);
        const smtpUsername = getValue(row, columnMap.smtp_username).toLowerCase();
        const smtpPassword = getValue(row, columnMap.smtp_password);
        const providerValue = getValue(row, columnMap.provider);
        const smtpHostValue = getValue(row, columnMap.smtp_host);
        const imapHostValue = getValue(row, columnMap.imap_host);
        const securityValue = getValue(row, columnMap.security).toUpperCase();

        if (!senderName || !smtpUsername || !smtpPassword) {
          failedRows.push(rowNumber);
          continue;
        }

        if (!emailRegex.test(smtpUsername)) {
          failedRows.push(rowNumber);
          continue;
        }

        if (existingEmails.has(smtpUsername) || seenInFile.has(smtpUsername)) {
          skipped += 1;
          continue;
        }

        const providerPreset = resolvePresetFromProvider(providerValue) || presetByHost[smtpHostValue];
        const smtpHost = smtpHostValue || providerPreset?.smtp_host || '';
        const imapHost = imapHostValue || providerPreset?.imap_host || '';

        const smtpPort =
          parsePort(getValue(row, columnMap.smtp_port)) ??
          providerPreset?.smtp_port ??
          null;
        const imapPort =
          parsePort(getValue(row, columnMap.imap_port)) ??
          providerPreset?.imap_port ??
          null;

        const normalizedSecurity = securityValue || providerPreset?.security || '';

        if (
          !smtpHost ||
          !imapHost ||
          !smtpPort ||
          !imapPort ||
          (normalizedSecurity !== 'SSL' && normalizedSecurity !== 'TLS')
        ) {
          failedRows.push(rowNumber);
          continue;
        }

        const security: 'SSL' | 'TLS' = normalizedSecurity;

        parsedRows.push({
          rowNumber,
          payload: {
            sender_name: senderName,
            smtp_username: smtpUsername,
            smtp_password: smtpPassword,
            smtp_host: smtpHost,
            smtp_port: smtpPort,
            imap_host: imapHost,
            imap_port: imapPort,
            security
          }
        });
        seenInFile.add(smtpUsername);
      }

      let inserted = 0;
      const dbFailedRows: number[] = [];

      if (parsedRows.length > 0) {
        const batchPayload = parsedRows.map((row) => ({
          user_id: user.id,
          ...row.payload
        }));

        const { error: batchError } = await supabase.from('email_configs').insert(batchPayload);

        if (!batchError) {
          inserted = parsedRows.length;
        } else {
          for (const row of parsedRows) {
            const { error } = await supabase.from('email_configs').insert({
              user_id: user.id,
              ...row.payload
            });

            if (error) {
              dbFailedRows.push(row.rowNumber);
            } else {
              inserted += 1;
            }
          }
        }
      }

      const allFailedRows = [...failedRows, ...dbFailedRows].sort((a, b) => a - b);
      const summary: BulkImportSummary = {
        total,
        inserted,
        skipped,
        errors: allFailedRows.length,
        failedRows: allFailedRows
      };

      setBulkImportSummary(summary);

      if (inserted > 0) {
        await fetchConfigs();
        if (onConfigAdded) onConfigAdded();
      }

      const failurePreview = allFailedRows.slice(0, 6).join(', ');
      const failureSuffix = allFailedRows.length > 6 ? ', ...' : '';

      toast({
        title: inserted > 0 ? 'Bulk import completed' : 'Bulk import finished',
        description:
          allFailedRows.length > 0
            ? `Added ${inserted}, skipped ${skipped}, failed ${allFailedRows.length} (rows: ${failurePreview}${failureSuffix}).`
            : `Added ${inserted} account(s). Skipped ${skipped} duplicate row(s).`,
        variant: inserted === 0 && allFailedRows.length > 0 ? 'destructive' : 'default'
      });
    } catch (error: any) {
      toast({
        title: 'Import failed',
        description: error.message || 'Could not process this file.',
        variant: 'destructive'
      });
    } finally {
      setBulkImporting(false);
      event.target.value = '';
    }
  };

  const filteredConfigs = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return configs;
    return configs.filter((config) => {
      const haystack = `${config.sender_name || ''} ${config.smtp_username || ''}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [configs, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredConfigs.length / itemsPerPage));
  const clampedPage = Math.min(currentPage, totalPages);
  const pageStart = (clampedPage - 1) * itemsPerPage;
  const pagedConfigs = filteredConfigs.slice(pageStart, pageStart + itemsPerPage);
  const showingFrom = filteredConfigs.length === 0 ? 0 : pageStart + 1;
  const showingTo = Math.min(pageStart + itemsPerPage, filteredConfigs.length);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const handleRequestDelete = (config: any) => {
    setDeleteTarget(config);
    setDeleteDialogOpen(true);
  };

  return (
    <div className="space-y-8">
      <Card className="relative overflow-hidden border border-slate-200 bg-gradient-to-br from-emerald-50 via-white to-sky-50">
        <div className="pointer-events-none absolute -right-16 top-6 h-40 w-40 rounded-full bg-emerald-200/50 blur-3xl" />
        <div className="pointer-events-none absolute -left-12 bottom-4 h-32 w-32 rounded-full bg-sky-200/40 blur-3xl" />
        <CardContent className="relative space-y-3 p-6 md:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-emerald-700">Email configuration</p>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-2">
              <h2 className="text-2xl font-semibold text-slate-900">Connect your sending inboxes</h2>
              <p className="text-sm text-slate-600">
                Add a sender display name for every email account so your recipients see the right name instead of the campaign title.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6">
        <Card className="border border-slate-200 bg-white/80">
          <CardHeader className="space-y-4">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="space-y-1">
                <CardTitle>Your connected accounts</CardTitle>
                <p className="text-sm text-slate-500">
                  Keep your sender inboxes organized and ready to rotate.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={handleBulkFileUpload}
                />
                <Badge className="border border-emerald-200 bg-emerald-50 text-emerald-700">
                  {configs.length.toLocaleString()} total
                </Badge>
                {billingSnapshot && (
                  <Badge
                    className={
                      senderLimitReached
                        ? 'border border-rose-200 bg-rose-50 text-rose-700'
                        : 'border border-sky-200 bg-sky-50 text-sky-700'
                    }
                  >
                    Senders: {Number(billingSnapshot.mailboxes_used || 0).toLocaleString()}
                    {billingSnapshot.unlimited_mailboxes
                      ? ' / Unlimited'
                      : ` / ${Number(billingSnapshot.mailbox_limit || 0).toLocaleString()}`}
                  </Badge>
                )}
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-full"
                  onClick={downloadSampleWorkbook}
                  disabled={bulkImporting}
                >
                  <Download className="mr-2 h-4 w-4" />
                  Sample Excel
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-full"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={bulkImporting}
                >
                  {bulkImporting ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <FileSpreadsheet className="mr-2 h-4 w-4" />
                  )}
                  {bulkImporting ? 'Importing...' : 'Bulk Upload Excel'}
                </Button>
                <Button onClick={openCreateForm} className="rounded-full shadow-sm" disabled={senderLimitReached}>
                  Add email account
                </Button>
              </div>
            </div>
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="relative w-full md:max-w-sm">
                <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Search by sender or address..."
                  className="h-10 rounded-full border-slate-200 bg-white pl-10"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <div className="text-xs text-slate-500">
                Showing {showingFrom}-{showingTo} of {filteredConfigs.length}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {bulkImportSummary && (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                <p className="font-medium text-slate-800">
                  Last import: {bulkImportSummary.inserted} added, {bulkImportSummary.skipped} skipped, {bulkImportSummary.errors} failed.
                </p>
                <p className="text-xs text-slate-500">
                  Processed {bulkImportSummary.total} rows.
                  {bulkImportSummary.failedRows.length > 0
                    ? ` Failed row numbers: ${bulkImportSummary.failedRows.slice(0, 10).join(', ')}${bulkImportSummary.failedRows.length > 10 ? ', ...' : ''}.`
                    : ''}
                </p>
              </div>
            )}
            {requiresSenderApproval && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                New sender accounts stay inactive until an approver activates them.
              </div>
            )}
            {configs.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-white/70 p-6 text-sm text-slate-500">
                No email accounts yet. Add one to start sending campaigns.
              </div>
            ) : filteredConfigs.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-white/70 p-6 text-sm text-slate-500">
                No email accounts match your search. Try a different name or address.
              </div>
            ) : (
              <div className="space-y-2">
                {pagedConfigs.map((config) => {
                  const providerLabel = resolveProviderLabel(config.smtp_host || '');
                  const approvalStatus = getSenderApprovalStatus(config);
                  const canSubmitForApproval =
                    requiresSenderApproval && ['draft', 'changes_requested', 'rejected'].includes(approvalStatus);
                  return (
                    <EmailConfigItem
                      key={config.id}
                      config={config}
                      providerLabel={providerLabel}
                      approvalStatus={approvalStatus}
                      canSubmitForApproval={canSubmitForApproval}
                      approvalSubmitting={approvalSubmitting.has(config.id)}
                      onEdit={openEditForm}
                      onDelete={handleRequestDelete}
                      onSubmitApproval={(cfg) => {
                        void requestSenderApproval(cfg, {
                          source: `Submitted sender ${cfg.smtp_username || cfg.id} for activation approval.`
                        });
                      }}
                    />
                  );
                })}
              </div>
            )}

            {filteredConfigs.length > itemsPerPage && (
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <div className="text-xs text-slate-500">
                  Page {clampedPage} of {totalPages}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-full"
                    onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                    disabled={clampedPage === 1}
                  >
                    <ChevronLeft className="mr-1 h-4 w-4" />
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-full"
                    onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                    disabled={clampedPage === totalPages}
                  >
                    Next
                    <ChevronRight className="ml-1 h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

      </div>

      <EmailConfigPanel
        open={panelOpen}
        onOpenChange={setPanelOpen}
        mode={panelMode}
        config={activeConfig}
        requiresSenderApproval={requiresSenderApproval}
        senderLimitReached={senderLimitReached}
        onSuccess={() => {
          fetchConfigs();
          if (onConfigAdded) onConfigAdded();
        }}
      />

      <AlertDialog
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          setDeleteDialogOpen(open);
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Email Configuration</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the email configuration and all associated email messages.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteTarget) {
                  handleDelete(deleteTarget.id);
                }
                setDeleteDialogOpen(false);
                setDeleteTarget(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default EmailConfig;

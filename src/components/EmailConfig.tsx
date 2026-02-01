import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { ChevronDown, ChevronLeft, ChevronRight, MoreHorizontal, Search } from 'lucide-react';
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

interface EmailConfigProps {
  onConfigAdded?: () => void;
}

type ProviderPreset = {
  id: string;
  label: string;
  description: string;
  smtp_host: string;
  smtp_port: number;
  imap_host: string;
  imap_port: number;
  security: 'SSL' | 'TLS';
};

type FormState = {
  sender_name: string;
  smtp_username: string;
  smtp_password: string;
  smtp_host: string;
  smtp_port: number;
  imap_host: string;
  imap_port: number;
  security: 'SSL' | 'TLS';
};

const providerPresets: ProviderPreset[] = [
  {
    id: 'gmail',
    label: 'Gmail',
    description: 'Personal or Workspace accounts',
    smtp_host: 'smtp.gmail.com',
    smtp_port: 465,
    imap_host: 'imap.gmail.com',
    imap_port: 993,
    security: 'SSL'
  },
  {
    id: 'titan',
    label: 'Titan / Hostinger',
    description: 'Professional inbox on custom domains',
    smtp_host: 'smtp.titan.email',
    smtp_port: 465,
    imap_host: 'imap.titan.email',
    imap_port: 993,
    security: 'SSL'
  },
  {
    id: 'outlook',
    label: 'Outlook / Microsoft 365',
    description: 'GoDaddy domains and Office 365 mailboxes',
    smtp_host: 'smtp.office365.com',
    smtp_port: 587,
    imap_host: 'outlook.office365.com',
    imap_port: 993,
    security: 'TLS'
  },
  {
    id: 'hostinger',
    label: 'Hostinger (Legacy)',
    description: 'Older Hostinger inbox settings',
    smtp_host: 'smtp.hostinger.com',
    smtp_port: 465,
    imap_host: 'imap.hostinger.com',
    imap_port: 993,
    security: 'SSL'
  }
];

const presetByHost = providerPresets.reduce<Record<string, ProviderPreset>>((acc, preset) => {
  acc[preset.smtp_host] = preset;
  return acc;
}, {});

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

const EmailConfig: React.FC<EmailConfigProps> = ({ onConfigAdded }) => {
  const [form, setForm] = useState<FormState>({ ...emptyForm });
  const [loading, setLoading] = useState(false);
  const [configs, setConfigs] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [activeConfig, setActiveConfig] = useState<any | null>(null);
  const [mode, setMode] = useState<'create' | 'edit'>('create');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [isGuidanceOpen, setIsGuidanceOpen] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
  const itemsPerPage = 8;

  useEffect(() => {
    fetchConfigs();
  }, []);

  const activePreset = useMemo(
    () => providerPresets.find((preset) => preset.smtp_host === form.smtp_host),
    [form.smtp_host]
  );

  const fetchConfigs = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('email_configs')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      setConfigs(data || []);
    } catch (error: any) {
      console.error('Error fetching configs:', error);
    }
  };

  const openCreateForm = () => {
    setMode('create');
    setActiveConfig(null);
    setForm({ ...emptyForm });
    setShowForm(true);
  };

  const openEditForm = (config: any) => {
    setMode('edit');
    setActiveConfig(config);
    setForm({
      sender_name: config.sender_name || '',
      smtp_username: config.smtp_username || '',
      smtp_password: '',
      smtp_host: config.smtp_host || emptyForm.smtp_host,
      smtp_port: config.smtp_port || emptyForm.smtp_port,
      imap_host: config.imap_host || emptyForm.imap_host,
      imap_port: config.imap_port || emptyForm.imap_port,
      security: (config.security as 'SSL' | 'TLS') || emptyForm.security
    });
    setShowForm(true);
  };

  const applyPreset = (preset: ProviderPreset) => {
    setForm((prev) => ({
      ...prev,
      smtp_host: preset.smtp_host,
      smtp_port: preset.smtp_port,
      imap_host: preset.imap_host,
      imap_port: preset.imap_port,
      security: preset.security
    }));
  };

  const handleSave = async () => {
    if (!form.sender_name || !form.smtp_username) {
      toast({
        title: 'Missing details',
        description: 'Please add a sender name and email address.',
        variant: 'destructive',
      });
      return;
    }

    if (mode === 'create' && !form.smtp_password) {
      toast({
        title: 'Password required',
        description: 'Please add your email or app password.',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      if (mode === 'create') {
        const { error } = await supabase.from('email_configs').insert({
          user_id: user.id,
          sender_name: form.sender_name.trim(),
          smtp_username: form.smtp_username.trim(),
          smtp_password: form.smtp_password,
          smtp_host: form.smtp_host,
          smtp_port: form.smtp_port,
          imap_host: form.imap_host,
          imap_port: form.imap_port,
          security: form.security
        });

        if (error) throw error;

        toast({
          title: 'Success',
          description: 'Email configuration saved successfully!',
        });
      } else if (activeConfig) {
        const updates: any = {
          sender_name: form.sender_name.trim(),
          smtp_username: form.smtp_username.trim(),
          smtp_host: form.smtp_host,
          smtp_port: form.smtp_port,
          imap_host: form.imap_host,
          imap_port: form.imap_port,
          security: form.security
        };

        if (form.smtp_password) {
          updates.smtp_password = form.smtp_password;
        }

        const { error } = await supabase
          .from('email_configs')
          .update(updates)
          .eq('id', activeConfig.id);

        if (error) throw error;

        toast({
          title: 'Updated',
          description: 'Email configuration updated successfully!',
        });
      }

      setForm({ ...emptyForm });
      setShowForm(false);
      setActiveConfig(null);
      setMode('create');
      await fetchConfigs();
      if (onConfigAdded) onConfigAdded();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

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

  const helpTitle = mode === 'edit' ? 'Edit sender configuration' : 'Add a new sender';
  const helpBody = mode === 'edit'
    ? 'Update the sender name, credentials, or provider settings. Leave password empty to keep the current one.'
    : 'Connect Gmail, Titan, Outlook/Microsoft 365, or any custom SMTP inbox.';
  
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
                <Badge className="border border-emerald-200 bg-emerald-50 text-emerald-700">
                  {configs.length.toLocaleString()} total
                </Badge>
                <Button onClick={openCreateForm} className="rounded-full shadow-sm">
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
                  const displayName = config.sender_name || 'Sender name missing';
                  const statusLabel = config.sender_name ? 'Active' : 'Needs info';
                  const statusStyles = config.sender_name
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : 'border-amber-200 bg-amber-50 text-amber-700';
                  return (
                    <div
                      key={config.id}
                      className="group flex flex-col gap-3 rounded-2xl border border-transparent bg-white px-4 py-3 shadow-sm ring-1 ring-slate-100 transition hover:border-slate-200 hover:bg-slate-50 md:flex-row md:items-center md:justify-between"
                    >
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
                        <Badge className={statusStyles}>{statusLabel}</Badge>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={() => openEditForm(config)}>
                              Edit Configuration
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-rose-600" onSelect={() => handleRequestDelete(config)}>
                              Disconnect Account
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
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

        <div className="space-y-4">
          {/* <Card className="border border-slate-200 bg-slate-50/80">
            <CardContent className="p-5">
              <Collapsible open={isGuidanceOpen} onOpenChange={setIsGuidanceOpen}>
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">Guidance</p>
                    <h3 className="text-lg font-semibold text-slate-900">{helpTitle}</h3>
                  </div>
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full">
                      <ChevronDown className={`h-4 w-4 transition-transform ${isGuidanceOpen ? 'rotate-180' : ''}`} />
                    </Button>
                  </CollapsibleTrigger>
                </div>
                <CollapsibleContent className="mt-3 space-y-3 text-sm text-slate-600">
                  <p>{helpBody}</p>
                  {!showForm && (
                    <Button variant="outline" onClick={openCreateForm} className="rounded-full">
                      Add configuration
                    </Button>
                  )}
                </CollapsibleContent>
              </Collapsible>
            </CardContent>
          </Card> */}
        </div>
      </div>

      {showForm && (
        <Card className="border border-slate-200">
          <CardHeader>
            <CardTitle>{mode === 'edit' ? 'Edit Email Configuration' : 'Add Email Configuration'}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="sender_name">Sender name</Label>
                  <Input
                    id="sender_name"
                    placeholder="e.g. Joe Parker"
                    value={form.sender_name}
                    onChange={(e) => setForm({ ...form, sender_name: e.target.value })}
                  />
                  <p className="text-xs text-slate-500">This appears in the inbox From name.</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="smtp_username">Email address</Label>
                  <Input
                    id="smtp_username"
                    type="email"
                    placeholder="your-email@domain.com"
                    value={form.smtp_username}
                    onChange={(e) => setForm({ ...form, smtp_username: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="smtp_password">Password</Label>
                <Input
                  id="smtp_password"
                  type="password"
                  placeholder={mode === 'edit' ? 'Leave blank to keep current password' : 'Your email or app password'}
                  value={form.smtp_password}
                  onChange={(e) => setForm({ ...form, smtp_password: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-slate-900">Provider presets</h4>
                {activePreset && (
                  <span className="text-xs text-emerald-700">Selected: {activePreset.label}</span>
                )}
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {providerPresets.map((preset) => {
                  const isActive = activePreset?.id === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => applyPreset(preset)}
                      className={`flex flex-col items-start gap-1 rounded-2xl border p-4 text-left transition ${isActive ? 'border-emerald-500 bg-emerald-50/70 shadow-sm' : 'border-slate-200 bg-white hover:border-emerald-300'}`}
                    >
                      <span className="text-sm font-semibold text-slate-900">{preset.label}</span>
                      <span className="text-xs text-slate-500">{preset.description}</span>
                      <span className="text-xs text-slate-400">{preset.smtp_host}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="smtp_host">SMTP Host</Label>
                <Select
                  value={form.smtp_host}
                  onValueChange={(value) => {
                    const preset = presetByHost[value];
                    if (preset) {
                      applyPreset(preset);
                      return;
                    }
                    setForm({ ...form, smtp_host: value });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="smtp.gmail.com">smtp.gmail.com (Gmail)</SelectItem>
                    <SelectItem value="smtp.office365.com">smtp.office365.com (Outlook/Microsoft 365)</SelectItem>
                    <SelectItem value="smtp.titan.email">smtp.titan.email (Hostinger/Titan)</SelectItem>
                    <SelectItem value="smtp.hostinger.com">smtp.hostinger.com (Legacy)</SelectItem>
                    <SelectItem value="mail.hostinger.com">mail.hostinger.com (Old)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="smtp_port">SMTP Port</Label>
                <Input
                  id="smtp_port"
                  type="number"
                  value={form.smtp_port}
                  onChange={(e) => setForm({ ...form, smtp_port: parseInt(e.target.value) })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="security">Security</Label>
                <Select value={form.security} onValueChange={(value) => setForm({ ...form, security: value as 'SSL' | 'TLS' })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SSL">SSL</SelectItem>
                    <SelectItem value="TLS">TLS</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="imap_host">IMAP Host</Label>
                <Select value={form.imap_host} onValueChange={(value) => setForm({ ...form, imap_host: value })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="imap.gmail.com">imap.gmail.com (Gmail)</SelectItem>
                    <SelectItem value="outlook.office365.com">outlook.office365.com (Outlook/Microsoft 365)</SelectItem>
                    <SelectItem value="imap.titan.email">imap.titan.email (Hostinger/Titan)</SelectItem>
                    <SelectItem value="imap.hostinger.com">imap.hostinger.com (Legacy)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="imap_port">IMAP Port</Label>
                <Input
                  id="imap_port"
                  type="number"
                  value={form.imap_port}
                  onChange={(e) => setForm({ ...form, imap_port: parseInt(e.target.value) })}
                />
              </div>
            </div>

            {form.smtp_host === 'smtp.gmail.com' && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                <h4 className="text-sm font-semibold text-amber-900">Gmail requires an App Password</h4>
                <p className="mt-2 text-sm text-amber-800">
                  Enable 2-Step Verification and generate a 16-character App Password for Mail. Use that password here instead of your normal login.
                </p>
              </div>
            )}

            {form.smtp_host.includes('titan') && (
              <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4">
                <h4 className="text-sm font-semibold text-sky-900">Titan / Hostinger accounts</h4>
                <p className="mt-2 text-sm text-sky-800">
                  Most Hostinger business emails use smtp.titan.email with port 465 (SSL). Your domain login works here.
                </p>
              </div>
            )}

            {(form.smtp_host.includes('office365') || form.smtp_host.includes('outlook')) && (
              <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4">
                <h4 className="text-sm font-semibold text-indigo-900">Outlook / Microsoft 365 (GoDaddy)</h4>
                <p className="mt-2 text-sm text-indigo-800">
                  Use smtp.office365.com with port 587 (TLS). IMAP is outlook.office365.com on port 993. If MFA is enabled, create an App Password.
                </p>
              </div>
            )}

            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  setShowForm(false);
                  setMode('create');
                  setActiveConfig(null);
                  setForm({ ...emptyForm });
                }}
                className="flex-1 rounded-full"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                disabled={loading}
                className="flex-1 rounded-full"
              >
                {loading ? 'Saving...' : mode === 'edit' ? 'Save changes' : 'Save configuration'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

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

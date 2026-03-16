import React, { useState, useMemo, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { toast } from '@/hooks/use-toast';
import { Loader2, Mail, Lock, Settings, CheckCircle2, AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react';

interface EmailConfigPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'create' | 'edit';
  config?: any;
  requiresSenderApproval: boolean;
  senderLimitReached: boolean;
  onSuccess: () => void;
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
  icon?: string;
  guidance?: string;
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
    security: 'SSL',
    guidance: 'Enable 2-Step Verification and generate a 16-character App Password for Mail in your Google Account settings.'
  },
  {
    id: 'titan',
    label: 'Titan / Hostinger',
    description: 'Professional inbox on custom domains',
    smtp_host: 'smtp.titan.email',
    smtp_port: 465,
    imap_host: 'imap.titan.email',
    imap_port: 993,
    security: 'SSL',
    guidance: 'Use your domain email credentials. Most accounts use smtp.titan.email with port 465 (SSL).'
  },
  {
    id: 'outlook',
    label: 'Outlook / Microsoft 365',
    description: 'GoDaddy domains and Office 365 mailboxes',
    smtp_host: 'smtp.office365.com',
    smtp_port: 587,
    imap_host: 'outlook.office365.com',
    imap_port: 993,
    security: 'TLS',
    guidance: 'If MFA is enabled, create an App Password in your Microsoft account security settings instead of using your regular password.'
  },
  {
    id: 'hostinger',
    label: 'Hostinger (Legacy)',
    description: 'Older Hostinger inbox settings',
    smtp_host: 'smtp.hostinger.com',
    smtp_port: 465,
    imap_host: 'imap.hostinger.com',
    imap_port: 993,
    security: 'SSL',
    guidance: 'For newer Hostinger accounts, use Titan settings instead. Use this only if your setup is older.'
  }
];

const presetByHost = providerPresets.reduce<Record<string, ProviderPreset>>((acc, preset) => {
  acc[preset.smtp_host] = preset;
  return acc;
}, {});

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

const resolveEmailConfigErrorMessage = (error: any) => {
  const message = String(error?.message || error?.details || '').trim();
  if (message.toLowerCase().includes('mailbox limit reached')) {
    return message;
  }
  if (message.toLowerCase().includes('approval')) {
    return message;
  }
  return message || 'Failed to save email configuration.';
};

const STEPS = [
  { id: 'basic', label: 'Basic Info', icon: Mail },
  { id: 'provider', label: 'Provider', icon: Lock },
  { id: 'advanced', label: 'Advanced', icon: Settings }
];

const EmailConfigPanel: React.FC<EmailConfigPanelProps> = ({
  open,
  onOpenChange,
  mode,
  config,
  requiresSenderApproval,
  senderLimitReached,
  onSuccess
}) => {
  const [form, setForm] = useState<FormState>({ ...emptyForm });
  const [loading, setLoading] = useState(false);
  const [activeTabIndex, setActiveTabIndex] = useState(0);

  React.useEffect(() => {
    if (open) {
      setActiveTabIndex(0);
      if (mode === 'edit' && config) {
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
      } else {
        setForm({ ...emptyForm });
      }
    }
  }, [open, mode, config]);

  const activePreset = useMemo(
    () => providerPresets.find((preset) => preset.smtp_host === form.smtp_host),
    [form.smtp_host]
  );

  // Step validation
  const isStep0Complete = form.sender_name && form.smtp_username && (mode === 'edit' || form.smtp_password);
  const isStep1Complete = activePreset !== undefined;
  const isStep2Complete = true; // Advanced is optional

  const stepStatus = [
    { complete: isStep0Complete, disabled: false },
    { complete: isStep1Complete, disabled: !isStep0Complete },
    { complete: isStep2Complete, disabled: !isStep1Complete }
  ];

  const canAdvance = stepStatus[activeTabIndex].complete && activeTabIndex < STEPS.length - 1;
  const canGoBack = activeTabIndex > 0;
  const canSave = isStep0Complete && isStep1Complete;

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

  const handleNextStep = () => {
    if (canAdvance) {
      setActiveTabIndex(activeTabIndex + 1);
    }
  };

  const handlePrevStep = () => {
    if (canGoBack) {
      setActiveTabIndex(activeTabIndex - 1);
    }
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
        const { error } = await supabase
          .from('email_configs')
          .insert({
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
          description: requiresSenderApproval
            ? 'Email configuration saved and sent for approval.'
            : 'Email configuration saved successfully!',
        });
      } else if (config) {
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
          .eq('id', config.id);

        if (error) throw error;

        toast({
          title: 'Updated',
          description: 'Email configuration updated successfully!',
        });
      }

      setForm({ ...emptyForm });
      onOpenChange(false);
      onSuccess();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: resolveEmailConfigErrorMessage(error),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const title = mode === 'edit' ? 'Edit Email Configuration' : 'Add Email Configuration';
  const description = mode === 'edit'
    ? 'Update your email settings'
    : 'Connect your email account to start sending campaigns';

  const getProviderGuidance = () => {
    const preset = providerPresets.find(p => p.smtp_host === form.smtp_host);
    return preset?.guidance;
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="!max-w-none !w-[40%] flex flex-col p-0 overflow-hidden">
        {/* Progress Header - Fixed */}
        <div className="bg-gradient-to-b from-slate-50 to-white px-8 py-5 border-b border-slate-200 flex-shrink-0">
          <div className="flex items-start justify-between mb-4 gap-4">
            <div className="flex-1">
              <SheetTitle className="text-2xl font-bold text-slate-900 mb-1">{title}</SheetTitle>
              <SheetDescription className="text-xs text-slate-600">{description}</SheetDescription>
            </div>
            <div className="text-right flex-shrink-0 bg-blue-600 text-white rounded-lg px-3 py-2 shadow-md">
              <div className="text-3xl font-bold leading-none">{activeTabIndex + 1}</div>
              <div className="text-xs font-medium opacity-90">of {STEPS.length}</div>
            </div>
          </div>

          {/* Step Indicators */}
          <div className="space-y-3">
            <div className="flex gap-1.5 flex-wrap">
              {STEPS.map((step, idx) => {
                const Icon = step.icon;
                const status = stepStatus[idx];
                const isCurrent = idx === activeTabIndex;

                return (
                  <button
                    key={step.id}
                    onClick={() => !status.disabled && setActiveTabIndex(idx)}
                    disabled={status.disabled}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all duration-200 ${
                      isCurrent
                        ? 'bg-blue-600 text-white shadow-lg ring-1 ring-blue-300'
                        : status.complete
                        ? 'bg-green-50 text-green-700 border border-green-200 hover:bg-green-100'
                        : status.disabled
                        ? 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
                        : 'bg-white text-slate-600 border border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    {status.complete && !isCurrent ? (
                      <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
                    ) : (
                      <Icon className="h-4 w-4 flex-shrink-0" />
                    )}
                    <span className="hidden sm:inline">{step.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Progress Bar */}
            <div className="space-y-1 pt-1">
              <div className="flex justify-between items-center">
                <span className="text-xs font-semibold text-slate-600">Progress</span>
                <span className="text-xs font-semibold text-slate-600">{Math.round(((activeTabIndex + 1) / STEPS.length) * 100)}%</span>
              </div>
              <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                <div
                  className="bg-gradient-to-r from-blue-600 via-blue-500 to-indigo-600 h-full transition-all duration-500"
                  style={{ width: `${((activeTabIndex + 1) / STEPS.length) * 100}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Content Area - Scrollable */}
        <div className="flex-1 overflow-y-auto">
          {/* Step 1: Basic Info */}
          {activeTabIndex === 0 && (
            <div className="space-y-4 px-8 py-6">
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="sender_name" className="text-sm font-semibold text-slate-900">Display Name</Label>
                  <Input
                    id="sender_name"
                    placeholder="e.g. Joe Parker"
                    value={form.sender_name}
                    onChange={(e) => setForm({ ...form, sender_name: e.target.value })}
                    className="h-9 text-sm border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
                  />
                  <p className="text-xs text-slate-500">How your name appears in recipients' inboxes</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="smtp_username" className="text-sm font-semibold text-slate-900">Email Address</Label>
                  <Input
                    id="smtp_username"
                    type="email"
                    placeholder="your-email@domain.com"
                    value={form.smtp_username}
                    onChange={(e) => setForm({ ...form, smtp_username: e.target.value })}
                    className="h-9 text-sm border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
                  />
                  <p className="text-xs text-slate-500">The email address that will send campaigns</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="smtp_password" className="text-sm font-semibold text-slate-900">Password or App Password</Label>
                  <Input
                    id="smtp_password"
                    type="password"
                    placeholder={mode === 'edit' ? 'Leave blank to keep current' : 'Enter your password'}
                    value={form.smtp_password}
                    onChange={(e) => setForm({ ...form, smtp_password: e.target.value })}
                    className="h-9 text-sm border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
                  />
                  <p className="text-xs text-slate-500">
                    {mode === 'edit'
                      ? 'Optional: leave blank to keep your current password'
                      : 'Use an app-specific password if your provider requires it'}
                  </p>
                </div>
              </div>

              {/* Validation Indicators */}
              <div className="space-y-3 pt-4 border-t border-slate-200 bg-blue-50 -mx-6 px-6 py-4 rounded-b-lg">
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide">Step Requirements</h4>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    {form.sender_name ? (
                      <div className="flex-shrink-0 p-0.5 bg-green-100 rounded-full">
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                      </div>
                    ) : (
                      <div className="h-4 w-4 rounded-full border-2 border-slate-300 flex-shrink-0" />
                    )}
                    <span className={`text-xs font-medium ${form.sender_name ? 'text-slate-900' : 'text-slate-600'}`}>Display name</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {form.smtp_username ? (
                      <div className="flex-shrink-0 p-0.5 bg-green-100 rounded-full">
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                      </div>
                    ) : (
                      <div className="h-4 w-4 rounded-full border-2 border-slate-300 flex-shrink-0" />
                    )}
                    <span className={`text-xs font-medium ${form.smtp_username ? 'text-slate-900' : 'text-slate-600'}`}>Email address</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {(mode === 'edit' || form.smtp_password) ? (
                      <div className="flex-shrink-0 p-0.5 bg-green-100 rounded-full">
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                      </div>
                    ) : (
                      <div className="h-4 w-4 rounded-full border-2 border-slate-300 flex-shrink-0" />
                    )}
                    <span className={`text-xs font-medium ${(mode === 'edit' || form.smtp_password) ? 'text-slate-900' : 'text-slate-600'}`}>Password</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Provider Selection */}
          {activeTabIndex === 1 && (
            <div className="space-y-4 px-8 py-6">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 mb-1">Select Your Email Provider</h3>
                <p className="text-xs text-slate-600">Choose your provider and we'll configure the settings automatically</p>
              </div>

              <div className="grid gap-2 grid-cols-1 sm:grid-cols-2">
                {providerPresets.map((preset) => {
                  const isActive = activePreset?.id === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => applyPreset(preset)}
                      className={`flex flex-col items-start gap-2 rounded-lg border-2 p-4 text-left transition-all duration-200 cursor-pointer group ${
                        isActive
                          ? 'border-blue-600 bg-blue-50 shadow-md ring-1 ring-blue-300'
                          : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-start justify-between w-full gap-2">
                        <div className="flex-1">
                          <span className="font-bold text-slate-900 text-sm block">{preset.label}</span>
                          <span className={`text-xs ${isActive ? 'text-blue-600' : 'text-slate-500'}`}>{preset.description}</span>
                        </div>
                        {isActive && <CheckCircle2 className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Provider Guidance */}
              {getProviderGuidance() && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm mt-4">
                  <div className="flex gap-3">
                    <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <h4 className="font-bold text-amber-900 mb-1 text-xs">Setup Tips</h4>
                      <p className="text-amber-800 text-xs">{getProviderGuidance()}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 3: Advanced Settings */}
          {activeTabIndex === 2 && (
            <div className="space-y-4 px-8 py-6">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 mb-1">SMTP Settings</h3>
                <p className="text-xs text-slate-600">For sending emails. Usually auto-configured by provider selection.</p>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="smtp_host" className="text-sm font-semibold text-slate-900">Host</Label>
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
                    <SelectTrigger className="h-9 text-sm border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="smtp.gmail.com">smtp.gmail.com</SelectItem>
                      <SelectItem value="smtp.office365.com">smtp.office365.com</SelectItem>
                      <SelectItem value="smtp.titan.email">smtp.titan.email</SelectItem>
                      <SelectItem value="smtp.hostinger.com">smtp.hostinger.com</SelectItem>
                      <SelectItem value="mail.hostinger.com">mail.hostinger.com</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="smtp_port" className="text-sm font-semibold text-slate-900">Port</Label>
                  <Input
                    id="smtp_port"
                    type="number"
                    value={form.smtp_port}
                    onChange={(e) => setForm({ ...form, smtp_port: parseInt(e.target.value) })}
                    className="h-9 text-sm border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="security" className="text-sm font-semibold text-slate-900">Security</Label>
                  <Select value={form.security} onValueChange={(value) => setForm({ ...form, security: value as 'SSL' | 'TLS' })}>
                    <SelectTrigger className="h-9 text-sm border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="SSL">SSL</SelectItem>
                      <SelectItem value="TLS">TLS</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="pt-2">
                <h3 className="text-sm font-semibold text-slate-900 mb-1">IMAP Settings</h3>
                <p className="text-xs text-slate-600">For receiving and syncing emails. Usually auto-configured by provider selection.</p>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="imap_host" className="text-sm font-semibold text-slate-900">Host</Label>
                  <Select value={form.imap_host} onValueChange={(value) => setForm({ ...form, imap_host: value })}>
                    <SelectTrigger className="h-9 text-sm border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="imap.gmail.com">imap.gmail.com</SelectItem>
                      <SelectItem value="outlook.office365.com">outlook.office365.com</SelectItem>
                      <SelectItem value="imap.titan.email">imap.titan.email</SelectItem>
                      <SelectItem value="imap.hostinger.com">imap.hostinger.com</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="imap_port" className="text-sm font-semibold text-slate-900">Port</Label>
                  <Input
                    id="imap_port"
                    type="number"
                    value={form.imap_port}
                    onChange={(e) => setForm({ ...form, imap_port: parseInt(e.target.value) })}
                    className="h-9 text-sm border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Actions Footer - Fixed */}
        <div className="flex gap-3 px-6 py-4 border-t border-slate-200 bg-gradient-to-r from-slate-50 to-white flex-shrink-0 shadow-lg">
          <Button
            variant="outline"
            onClick={handlePrevStep}
            disabled={!canGoBack || loading}
            className="flex-1 h-10 text-sm font-semibold border-slate-300 text-slate-700 hover:bg-slate-100 hover:border-slate-400 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            size="sm"
          >
            <ChevronLeft className="mr-1 h-4 w-4" />
            Previous
          </Button>

          {activeTabIndex === STEPS.length - 1 ? (
            <Button
              onClick={handleSave}
              disabled={loading || senderLimitReached || !canSave}
              className="flex-1 h-10 text-sm font-semibold bg-gradient-to-r from-blue-600 to-blue-700 text-white hover:from-blue-700 hover:to-blue-800 shadow-md hover:shadow-lg disabled:opacity-60 disabled:cursor-not-allowed transition-all disabled:from-blue-600 disabled:to-blue-600"
              size="sm"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                mode === 'edit' ? 'Save changes' : 'Save & Connect'
              )}
            </Button>
          ) : (
            <Button
              onClick={handleNextStep}
              disabled={!canAdvance || loading}
              className="flex-1 h-10 text-sm font-semibold bg-gradient-to-r from-blue-600 to-blue-700 text-white hover:from-blue-700 hover:to-blue-800 shadow-md hover:shadow-lg disabled:opacity-60 disabled:cursor-not-allowed transition-all disabled:from-blue-600 disabled:to-blue-600"
              size="sm"
            >
              Next
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default EmailConfigPanel;

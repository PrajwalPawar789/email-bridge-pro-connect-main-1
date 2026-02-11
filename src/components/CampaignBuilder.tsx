import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { toast } from '@/hooks/use-toast';
import { 
  Plus, Clock, Info, Trash2, ArrowRight, ArrowLeft, CheckCircle2, 
  Users, Mail, Send, Calendar,
  AlertCircle, Eye, Zap, Check, X, Loader2
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { PIPELINE_TEMPLATES, getPipelineTemplateById } from '@/lib/pipeline';
import { ensurePipelineForTemplate } from '@/lib/pipelineStore';

interface CampaignBuilderProps {
  emailConfigs: any[];
}

interface FollowupStep {
  step_number: number;
  delay_days: number;
  delay_hours: number;
  subject: string;
  body: string;
  template_id?: string;
}

const STEPS = [
  { id: 1, title: 'Setup', description: 'Campaign Details' },
  { id: 2, title: 'Audience', description: 'Select Recipients' },
  { id: 3, title: 'Content', description: 'Email Message' },
  { id: 4, title: 'Follow-ups', description: 'Sequence Steps' },
  { id: 5, title: 'Review', description: 'Final Check' },
];

const builderStyles = {
  ['--builder-bg' as any]:
    'radial-gradient(circle at 12% 18%, rgba(16, 185, 129, 0.18), transparent 55%), radial-gradient(circle at 88% 12%, rgba(245, 158, 11, 0.18), transparent 50%), linear-gradient(180deg, #f7f4ee 0%, #f1f6f2 60%, #ffffff 100%)',
  ['--builder-surface' as any]: 'rgba(255, 255, 255, 0.9)',
  ['--builder-surface-strong' as any]: 'rgba(255, 255, 255, 0.98)',
  ['--builder-border' as any]: 'rgba(148, 163, 184, 0.35)',
  ['--builder-ink' as any]: '#0f172a',
  ['--builder-muted' as any]: '#64748b',
  ['--builder-accent' as any]: '#0f766e',
  ['--builder-warm' as any]: '#f59e0b',
  ['--builder-font-display' as any]: '"Sora", sans-serif',
  ['--builder-font-body' as any]: '"IBM Plex Sans", sans-serif',
  fontFamily: 'var(--builder-font-body)'
} as React.CSSProperties;

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const renderPlainTextPreviewHtml = (value: string) => {
  if (!value) return '';
  const escaped = escapeHtml(value);

  const formatInline = (text: string) => {
    const withBold = text.replace(/\*\*([\s\S]+?)\*\*/g, '<strong>$1</strong>');
    return withBold.replace(/__([\s\S]+?)__/g, '<u>$1</u>');
  };

  const lines = escaped.split(/\r?\n/);
  const chunks: string[] = [];
  const paragraphLines: string[] = [];
  let activeList: 'ul' | 'ol' | null = null;

  const bulletRegex = /^\s*(?:[-*]|\u2022)\s+(.*)$/;
  const orderedRegex = /^\s*(\d+)[.)]\s+(.*)$/;

  const closeList = () => {
    if (!activeList) return;
    chunks.push(activeList === 'ul' ? '</ul>' : '</ol>');
    activeList = null;
  };

  const flushParagraph = () => {
    if (paragraphLines.length === 0) return;
    const html = paragraphLines.map(line => formatInline(line)).join('<br />');
    chunks.push(`<p>${html}</p>`);
    paragraphLines.length = 0;
  };

  lines.forEach((line) => {
    const bulletMatch = line.match(bulletRegex);
    if (bulletMatch) {
      flushParagraph();
      if (activeList !== 'ul') {
        closeList();
        chunks.push('<ul>');
        activeList = 'ul';
      }
      chunks.push(`<li>${formatInline(bulletMatch[1])}</li>`);
      return;
    }

    const orderedMatch = line.match(orderedRegex);
    if (orderedMatch) {
      flushParagraph();
      const startValue = Number.parseInt(orderedMatch[1], 10);
      if (activeList !== 'ol') {
        closeList();
        const startAttr = Number.isFinite(startValue) ? ` start="${startValue}"` : '';
        chunks.push(`<ol${startAttr}>`);
        activeList = 'ol';
      }
      chunks.push(`<li>${formatInline(orderedMatch[2])}</li>`);
      return;
    }

    if (line.trim() === '') {
      flushParagraph();
      return;
    }

    closeList();
    paragraphLines.push(line);
  });

  flushParagraph();
  closeList();
  return chunks.join('');
};

const looksLikeHtml = (value: string) => /<\s*[a-z][\w-]*(\s[^>]*)?>/i.test(value);

const CampaignBuilder: React.FC<CampaignBuilderProps> = ({ emailConfigs }) => {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(1);
  const [form, setForm] = useState({
    name: '',
    subject: '',
    content: '',
    send_delay_minutes: 3, // Default to 3 mins for better deliverability
    is_html: false
  });
  const [selectedConfigs, setSelectedConfigs] = useState<{ configId: string; dailyLimit: number }[]>([]);
  const [senderAssignment, setSenderAssignment] = useState<'random' | 'list'>('random');
  const [recipients, setRecipients] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [templates, setTemplates] = useState<any[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [selectedListId, setSelectedListId] = useState<string>('');
  const [allLists, setAllLists] = useState<{ id: string, name: string }[]>([]);
  const [followups, setFollowups] = useState<FollowupStep[]>([]);
  const [listCount, setListCount] = useState(0);
  const [audienceType, setAudienceType] = useState<'list' | 'manual'>('list');
  const [scheduledAt, setScheduledAt] = useState<string>('');
  const [pipelineConfig, setPipelineConfig] = useState({
    enabled: false,
    templateId: PIPELINE_TEMPLATES[0].id,
    createOn: 'positive',
    initialStageId: 'qualified',
    ownerRule: 'sender',
    fixedOwner: '',
    stopOnInterested: true,
    stopOnNotInterested: true
  });
  const contentBodyRef = useRef<HTMLTextAreaElement | null>(null);
  const totalRecipients = audienceType === 'list'
    ? listCount
    : recipients.split('\n').filter((line) => line.trim()).length;
  const totalDailyLimit = selectedConfigs.reduce((acc, curr) => acc + curr.dailyLimit, 0);
  const estimatedDays = totalDailyLimit > 0 ? Math.ceil(totalRecipients / totalDailyLimit) : 0;
  const scheduleLabel = scheduledAt ? new Date(scheduledAt).toLocaleString() : 'Not scheduled';
  const selectedPipelineTemplate = getPipelineTemplateById(pipelineConfig.templateId);
  const headerStats = [
    {
      label: 'Recipients',
      value: totalRecipients,
      helper: totalDailyLimit > 0 ? `${estimatedDays} days @ ${totalDailyLimit}/day` : 'Add sender capacity',
      icon: Users,
      tone: 'bg-emerald-100/80 text-emerald-700'
    },
    {
      label: 'Senders',
      value: selectedConfigs.length,
      helper: totalDailyLimit > 0 ? `${totalDailyLimit} / day` : 'No senders yet',
      icon: Mail,
      tone: 'bg-slate-100 text-slate-700'
    },
    {
      label: 'Follow-ups',
      value: followups.length,
      helper: followups.length > 0 ? `${followups.length} steps` : 'No follow-ups',
      icon: Zap,
      tone: 'bg-amber-100/80 text-amber-700'
    },
    {
      label: 'Schedule',
      value: scheduledAt ? 'Scheduled' : 'Instant',
      helper: scheduleLabel,
      icon: Calendar,
      tone: 'bg-teal-100/80 text-teal-700'
    }
  ];

  useEffect(() => {
    fetchTemplates();
    fetchLists();
  }, []);

  useEffect(() => {
    if (currentStep !== 3) return;
    const textarea = contentBodyRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [form.content, currentStep, selectedTemplate]);

  useEffect(() => {
    if (selectedListId) {
      const fetchCount = async () => {
        const { count } = await supabase
          .from('email_list_prospects')
          .select('*', { count: 'exact', head: true })
          .eq('list_id', selectedListId);
        setListCount(count || 0);
      };
      fetchCount();
    } else {
      setListCount(0);
    }
  }, [selectedListId]);

  const fetchTemplates = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('email_templates')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      setTemplates(data || []);
    } catch (error: any) {
      console.error('Error fetching templates:', error);
    }
  };

  const fetchLists = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase
      .from('email_lists')
      .select('id, name')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    if (!error && data) setAllLists(data);
  };

  const handleTemplateSelect = (templateId: string) => {
    const template = templates.find(t => t.id === templateId);
    if (template) {
      const normalizedContent = (template.content || "").replace(/\s+$/, "");
      setForm(prev => ({
        ...prev,
        subject: template.subject || '',
        content: normalizedContent,
        is_html: !!template.is_html
      }));
    }
    setSelectedTemplate(templateId);
    requestAnimationFrame(() => {
      const textarea = contentBodyRef.current;
      if (!textarea) return;
      textarea.scrollTop = 0;
      textarea.focus();
      textarea.setSelectionRange(0, 0);
    });
  };

  const addFollowupStep = () => {
    setFollowups([...followups, {
      step_number: followups.length + 1,
      delay_days: 3,
      delay_hours: 0,
      subject: '',
      body: '',
    }]);
  };

  const removeFollowupStep = (index: number) => {
    const newFollowups = [...followups];
    newFollowups.splice(index, 1);
    newFollowups.forEach((f, i) => f.step_number = i + 1);
    setFollowups(newFollowups);
  };

  const updateFollowupStep = (index: number, field: keyof FollowupStep, value: any) => {
    const newFollowups = [...followups];
    newFollowups[index] = { ...newFollowups[index], [field]: value };
    setFollowups(newFollowups);
  };

  const validateStep = (step: number) => {
    switch (step) {
      case 1: // Setup
        if (!form.name) {
          toast({ title: "Missing Information", description: "Please enter a campaign name.", variant: "destructive" });
          return false;
        }
        if (selectedConfigs.length === 0) {
          toast({ title: "Missing Information", description: "Please select at least one sender account.", variant: "destructive" });
          return false;
        }
        return true;
      case 2: // Audience
        if (audienceType === 'list' && !selectedListId) {
          toast({ title: "Missing Information", description: "Please select an email list.", variant: "destructive" });
          return false;
        }
        if (audienceType === 'manual' && !recipients.trim()) {
          toast({ title: "Missing Information", description: "Please enter at least one recipient.", variant: "destructive" });
          return false;
        }
        return true;
      case 3: // Content
        if (!form.subject) {
          toast({ title: "Missing Information", description: "Please enter a subject line.", variant: "destructive" });
          return false;
        }
        if (!form.content) {
          toast({ title: "Missing Information", description: "Please enter email content.", variant: "destructive" });
          return false;
        }
        return true;
      default:
        return true;
    }
  };

  const handleNext = () => {
    if (validateStep(currentStep)) {
      setCurrentStep(prev => Math.min(prev + 1, STEPS.length));
    }
  };

  const handleBack = () => {
    setCurrentStep(prev => Math.max(prev - 1, 1));
  };

  const handleSave = async (isDraft = true) => {
    const statusToUse = scheduledAt ? 'scheduled' : (isDraft ? 'draft' : 'ready');
    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Create campaign
      const { data: campaign, error: campaignError } = await supabase
        .from('campaigns')
        .insert({
          user_id: user.id,
          name: form.name,
          subject: form.subject,
          body: form.content,
          status: statusToUse,
          send_delay_minutes: form.send_delay_minutes,
          email_config_id: selectedConfigs[0].configId,
          email_list_id: selectedListId || null,
          scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null,
        })
        .select()
        .single();

      if (campaignError) throw campaignError;

      // Save Campaign Email Configurations
      const configInserts = selectedConfigs.map(c => ({
        campaign_id: campaign.id,
        email_config_id: c.configId,
        daily_limit: c.dailyLimit
      }));

      await supabase.from('campaign_email_configurations' as any).insert(configInserts);

      // Save Follow-ups
      if (followups.length > 0) {
        const followupInserts = followups.map(f => ({
          campaign_id: campaign.id,
          step_number: f.step_number,
          delay_days: f.delay_days,
          delay_hours: f.delay_hours,
          subject: f.subject || null,
          body: f.body,
          template_id: f.template_id || null
        }));
        await supabase.from('campaign_followups').insert(followupInserts);
      }

      if (pipelineConfig.enabled) {
        const { pipeline, stages } = await ensurePipelineForTemplate(user.id, pipelineConfig.templateId);
        const initialStage = stages.find((stage) => stage.template_stage_id === pipelineConfig.initialStageId) || stages[0];

        const { error: pipelineSettingsError } = await supabase
          .from('campaign_pipeline_settings')
          .insert({
            campaign_id: campaign.id,
            pipeline_id: pipeline.id,
            create_on: pipelineConfig.createOn,
            initial_stage_id: initialStage?.id || null,
            initial_stage_template_id: pipelineConfig.initialStageId,
            owner_rule: pipelineConfig.ownerRule,
            fixed_owner: pipelineConfig.ownerRule === 'fixed' ? (pipelineConfig.fixedOwner || null) : null,
            stop_on_interested: pipelineConfig.stopOnInterested,
            stop_on_not_interested: pipelineConfig.stopOnNotInterested,
            enabled: true,
          });

        if (pipelineSettingsError) throw pipelineSettingsError;
      }

      // Helper to assign config
        const assignConfig = (index: number) => {
          return selectedConfigs[index % selectedConfigs.length].configId;
        };

        const pickRandomConfigId = () => {
          const choice = selectedConfigs[Math.floor(Math.random() * selectedConfigs.length)];
          return choice?.configId || selectedConfigs[0]?.configId;
        };

      const normalizeEmail = (value?: string | null) => (value || '').trim().toLowerCase();

      const selectedConfigByEmail = new Map<string, string>();
      selectedConfigs.forEach((selected) => {
        const config = emailConfigs.find((cfg) => cfg.id === selected.configId);
        if (config?.smtp_username) {
          selectedConfigByEmail.set(normalizeEmail(config.smtp_username), config.id);
        }
      });

        const resolveAssignedConfigId = (senderEmail: string | null | undefined, index: number) => {
          if (senderAssignment !== 'list') {
            return pickRandomConfigId();
          }

          const normalized = normalizeEmail(senderEmail);
          if (!normalized || normalized === '-') {
            return pickRandomConfigId();
          }

          const matchedConfigId = selectedConfigByEmail.get(normalized);
          return matchedConfigId || pickRandomConfigId() || assignConfig(index);
        };

        const insertRecipientsInBatches = async (rows: any[]) => {
          const batchSize = 500;
          let insertedCount = 0;

          for (let i = 0; i < rows.length; i += batchSize) {
            const batch = rows.slice(i, i + batchSize);
            const { error } = await supabase.from('recipients').insert(batch);
            if (error) throw error;
            insertedCount += batch.length;
          }

          return insertedCount;
        };

        // Process Recipients
        if (audienceType === 'list' && selectedListId) {
          // Fetch all prospects in batches of 1000
          let allProspects = [];
          let from = 0;
          const pageSize = 1000;
          let fetchMore = true;
        while (fetchMore) {
          const { data: batch, error } = await supabase
            .from('email_list_prospects')
            .select(`prospects (id, email, name, company, sender_email)`)
            .eq('list_id', selectedListId)
            .range(from, from + pageSize - 1);
          if (error) throw error;
          if (batch && batch.length > 0) {
            allProspects = allProspects.concat(batch);
            if (batch.length < pageSize) {
              fetchMore = false;
            } else {
              from += pageSize;
            }
          } else {
            fetchMore = false;
          }
          }
          if (allProspects.length > 0) {
            const flattenedProspects = allProspects.flatMap((item: any) => {
              const prospect = item.prospects;
              if (!prospect) return [];
              return Array.isArray(prospect) ? prospect : [prospect];
            });

            const validProspects = flattenedProspects.filter(
              (prospect: any) => prospect && prospect.email && prospect.email.trim()
            );

            const uniqueProspects = validProspects.filter((prospect, index, self) => {
              const currentEmail = prospect.email.toLowerCase().trim();
              return index === self.findIndex(p => p.email.toLowerCase().trim() === currentEmail);
            });

            const recipientsInserts = uniqueProspects.map((prospect, index) => {
              const senderEmail = normalizeEmail(prospect.sender_email);

              return {
                campaign_id: campaign.id,
                email: prospect.email.trim().toLowerCase(),
                name: prospect.name || '',
                status: 'pending' as const,
                replied: false,
                bounced: false,
                assigned_email_config_id: resolveAssignedConfigId(senderEmail, index)
              };
            });

            const insertedCount = await insertRecipientsInBatches(recipientsInserts);

            if (insertedCount > 0) {
              await supabase
                .from('campaigns')
                .update({ total_recipients: insertedCount })
                .eq('id', campaign.id);
            }
          }
        } else if (audienceType === 'manual' && recipients.trim()) {
          const recipientList = recipients.split('\n')
            .map(line => {
              const [email, name] = line.split(',').map(s => s.trim());
              return { email: email?.toLowerCase() || '', name: name || '' };
            })
            .filter(r => r.email && r.email.includes('@'));

          if (recipientList.length > 0) {
            const uniqueRecipients = recipientList.filter((recipient, index, self) => 
              index === self.findIndex(r => r.email === recipient.email)
            );

            const manualRows = uniqueRecipients.map((r, index) => ({
              campaign_id: campaign.id,
              email: r.email,
              name: r.name,
              status: 'pending',
              replied: false,
              bounced: false,
              assigned_email_config_id: pickRandomConfigId()
            }));

            const insertedCount = await insertRecipientsInBatches(manualRows);

            if (insertedCount > 0) {
              await supabase
                .from('campaigns')
                .update({ total_recipients: insertedCount })
                .eq('id', campaign.id);
            }
          }
        }

      toast({
        title: "Success",
        description: `Campaign ${isDraft ? 'saved as draft' : 'launched successfully'}!`,
      });

      // Reset form
      setForm({ name: '', subject: '', content: '', send_delay_minutes: 3, is_html: false });
        setSelectedConfigs([]);
        setSenderAssignment('random');
        setRecipients('');
        setSelectedTemplate('');
        setSelectedListId('');
        setFollowups([]);
        setPipelineConfig({
          enabled: false,
          templateId: PIPELINE_TEMPLATES[0].id,
          createOn: 'positive',
          initialStageId: 'qualified',
          ownerRule: 'sender',
          fixedOwner: '',
          stopOnInterested: true,
          stopOnNotInterested: true
        });
        setCurrentStep(1);
    } catch (error: any) {
      console.error('Error creating campaign:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to create campaign",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const renderStepIndicator = () => {
    const progress = ((currentStep - 1) / (STEPS.length - 1)) * 100;

    return (
      <div className="relative mt-6">
        <div className="absolute left-0 top-4 h-[2px] w-full rounded-full bg-slate-200/70"></div>
        <div
          className="absolute left-0 top-4 h-[2px] rounded-full bg-[var(--builder-accent)] transition-all duration-500 ease-in-out"
          style={{ width: `${progress}%` }}
        ></div>

        <div className="relative grid grid-cols-5 gap-2">
          {STEPS.map((step) => {
            const isActive = step.id === currentStep;
            const isCompleted = step.id < currentStep;
            const canJump = isCompleted;

            return (
              <div
                key={step.id}
                className={cn(
                  "flex flex-col items-center gap-2 text-center",
                  canJump ? "cursor-pointer" : "cursor-default"
                )}
                onClick={() => canJump && setCurrentStep(step.id)}
              >
                <div
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-full border bg-white/80 text-xs font-semibold transition-all",
                    isActive
                      ? "border-[var(--builder-accent)] text-[var(--builder-accent)] shadow-[0_0_0_4px_rgba(15,118,110,0.16)]"
                      : isCompleted
                      ? "border-[var(--builder-accent)] bg-[var(--builder-accent)] text-white"
                      : "border-slate-300 text-slate-400"
                  )}
                >
                  {isCompleted ? <Check className="h-4 w-4" /> : step.id}
                </div>
                <span
                  className={cn(
                    "text-[11px] font-semibold uppercase tracking-[0.2em]",
                    isActive
                      ? "text-[var(--builder-accent)]"
                      : isCompleted
                      ? "text-[var(--builder-ink)]"
                      : "text-slate-400"
                  )}
                >
                  {step.title}
                </span>
                <span className="text-[11px] text-[var(--builder-muted)]">{step.description}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderSetupStep = () => (
    <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
      {emailConfigs.length === 0 && (
        <div className="rounded-2xl border border-amber-200/70 bg-amber-50/80 p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-white/80 p-2 rounded-full border border-amber-200">
              <Info className="h-5 w-5 text-amber-700" />
            </div>
            <div>
              <h4 className="font-semibold text-amber-900">Connect a sender account</h4>
              <p className="text-sm text-amber-700">You need at least one email account to send campaigns.</p>
            </div>
          </div>
          <Button
            variant="outline"
            className="bg-white/80 text-amber-700 hover:bg-amber-100 border-amber-200"
            onClick={() => navigate('/dashboard?tab=settings')}
          >
            Add sender account
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
                <Label htmlFor="name" className="text-base font-semibold text-[var(--builder-ink)]">Campaign Name</Label>
                <span className="text-xs text-[var(--builder-muted)]">Internal use only</span>
            </div>
            <Input
              id="name"
              placeholder="e.g., Q4 Outreach - Tech Startups"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="h-12 text-lg bg-white/80 border-[var(--builder-border)] focus:bg-white transition-all"
            />
          </div>

            <div className="space-y-4">
              <Label className="text-base font-semibold text-[var(--builder-ink)]">Sender Accounts</Label>
              <div className="border border-[var(--builder-border)] rounded-2xl overflow-hidden bg-white/60">
              <ScrollArea className="h-[240px]">
                <div className="p-2 space-y-2">
                  {emailConfigs.map((config) => {
                    const isSelected = selectedConfigs.some(c => c.configId === config.id);
                    const selectedConfig = selectedConfigs.find(c => c.configId === config.id);
                    
                    return (
                      <div 
                        key={config.id} 
                        className={cn(
                          "flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer",
                          isSelected
                            ? "bg-white/90 border-emerald-200 shadow-sm ring-1 ring-emerald-100"
                            : "hover:bg-white/90 border-transparent hover:border-slate-200"
                        )}
                        onClick={() => {
                            if (isSelected) {
                                setSelectedConfigs(selectedConfigs.filter(c => c.configId !== config.id));
                            } else {
                                setSelectedConfigs([...selectedConfigs, { configId: config.id, dailyLimit: 100 }]);
                            }
                        }}
                      >
                        <div className="flex items-center space-x-3">
                          <div className={cn(
                              "w-5 h-5 rounded border flex items-center justify-center transition-colors",
                              isSelected ? "bg-[var(--builder-accent)] border-[var(--builder-accent)]" : "border-slate-300 bg-white/80"
                          )}>
                              {isSelected && <Check className="h-3 w-3 text-white" />}
                          </div>
                          <div className="flex flex-col">
                            <span className="font-medium text-[var(--builder-ink)]">{config.smtp_username}</span>
                            <span className="text-xs text-[var(--builder-muted)]">{config.smtp_host}</span>
                          </div>
                        </div>
                        {isSelected && (
                          <div className="flex items-center gap-2 bg-white/80 px-2 py-1 rounded-lg border border-[var(--builder-border)]" onClick={(e) => e.stopPropagation()}>
                            <span className="text-xs text-[var(--builder-muted)]">Limit:</span>
                            <Input 
                              type="number" 
                              className="w-16 h-7 text-center border-none p-0 focus-visible:ring-0 bg-transparent" 
                              value={selectedConfig?.dailyLimit || 100}
                                onChange={(e) => {
                                  const limit = Math.max(1, parseInt(e.target.value) || 0);
                                  setSelectedConfigs(selectedConfigs.map(c => 
                                    c.configId === config.id ? { ...c, dailyLimit: limit } : c
                                  ));
                                }}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
              </div>
              <div className="flex justify-between items-center text-sm px-2">
                  <span className="text-[var(--builder-muted)]">Total Daily Capacity</span>
                  <span className="font-bold text-[var(--builder-accent)]">{totalDailyLimit} emails/day</span>
              </div>
            </div>
            <div className="space-y-3">
              <Label className="text-base font-semibold text-[var(--builder-ink)]">Sender Routing</Label>
              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  className={cn(
                    "rounded-2xl border p-4 text-left transition-all",
                    senderAssignment === 'random'
                      ? "border-emerald-200 bg-emerald-50/80 text-emerald-900 shadow-[0_8px_20px_rgba(16,185,129,0.12)]"
                      : "border-[var(--builder-border)] bg-white/80 text-[var(--builder-muted)] hover:border-slate-300"
                  )}
                  onClick={() => setSenderAssignment('random')}
                >
                  <p className="text-sm font-semibold">Random distribution</p>
                  <p className="text-xs text-[var(--builder-muted)]">
                    Rotate emails across all selected senders.
                  </p>
                </button>
                <button
                  type="button"
                  className={cn(
                    "rounded-2xl border p-4 text-left transition-all",
                    senderAssignment === 'list'
                      ? "border-emerald-200 bg-emerald-50/80 text-emerald-900 shadow-[0_8px_20px_rgba(16,185,129,0.12)]"
                      : "border-[var(--builder-border)] bg-white/80 text-[var(--builder-muted)] hover:border-slate-300"
                  )}
                  onClick={() => setSenderAssignment('list')}
                >
                  <p className="text-sm font-semibold">Use sender_email column</p>
                  <p className="text-xs text-[var(--builder-muted)]">
                    Match each contact to their sender email when present.
                  </p>
                </button>
              </div>
              <p className="text-xs text-[var(--builder-muted)]">
                Missing or "-" sender emails fall back to random. Sender emails must match a selected account.
              </p>
            </div>
          </div>

        <div className="space-y-6">
            <div className="bg-emerald-50/60 rounded-2xl p-6 border border-emerald-100 space-y-4">
                <h4 className="font-semibold text-emerald-900 flex items-center gap-2">
                    <Zap className="h-4 w-4 text-emerald-600" />
                    Pro Tips
                </h4>
                <div className="space-y-3">
                    <div className="flex gap-3 items-start">
                        <div className="bg-white p-1.5 rounded-md shadow-sm mt-0.5">
                            <Clock className="h-3 w-3 text-emerald-600" />
                        </div>
                        <div>
                            <p className="text-sm font-medium text-emerald-900">Sending Delay</p>
                            <Select 
                                value={form.send_delay_minutes.toString()} 
                                onValueChange={(value) => setForm({ ...form, send_delay_minutes: parseInt(value) })}
                            >
                                <SelectTrigger className="h-8 text-xs mt-1 bg-white border-emerald-200">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="1">Fast (1 min)</SelectItem>
                                    <SelectItem value="3">Recommended (3 min)</SelectItem>
                                    <SelectItem value="5">Safe (5 min)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <div className="flex gap-3 items-start">
                        <div className="bg-white p-1.5 rounded-md shadow-sm mt-0.5">
                            <Info className="h-3 w-3 text-emerald-600" />
                        </div>
                        <p className="text-xs text-emerald-800 leading-relaxed">
                            We recommend a 3-5 minute delay between emails to maintain high deliverability rates.
                        </p>
                    </div>
                </div>
            </div>
        </div>
      </div>
    </div>
  );

  const renderAudienceStep = () => (
    <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          <Tabs value={audienceType} onValueChange={(v: any) => setAudienceType(v)} className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-6 rounded-full border border-[var(--builder-border)] bg-white/80 p-1">
              <TabsTrigger
                value="list"
                className="rounded-full text-sm font-semibold data-[state=active]:bg-[var(--builder-ink)] data-[state=active]:text-white"
              >
                Existing List
              </TabsTrigger>
              <TabsTrigger
                value="manual"
                className="rounded-full text-sm font-semibold data-[state=active]:bg-[var(--builder-ink)] data-[state=active]:text-white"
              >
                Manual Entry
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="list" className="space-y-4 mt-0">
              {allLists.length === 0 && (
                <div className="rounded-2xl border border-amber-200/70 bg-amber-50/80 p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="bg-white/80 p-2 rounded-full border border-amber-200">
                      <Users className="h-5 w-5 text-amber-700" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-amber-900">Add a prospect list</h4>
                      <p className="text-sm text-amber-700">Create or import prospects to target in this campaign.</p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    className="bg-white/80 text-amber-700 hover:bg-amber-100 border-amber-200"
                    onClick={() => navigate('/dashboard?tab=contacts')}
                  >
                    Add prospect list
                  </Button>
                </div>
              )}
              <div className="bg-white/80 border border-[var(--builder-border)] rounded-2xl p-6 space-y-4">
                <Label className="text-base font-semibold text-[var(--builder-ink)]">Select a Prospect List</Label>
                <Select value={selectedListId} onValueChange={setSelectedListId} disabled={allLists.length === 0}>
                  <SelectTrigger className="h-12 bg-white/90 border-[var(--builder-border)]">
                    <SelectValue placeholder="Choose a list..." />
                  </SelectTrigger>
                  <SelectContent>
                    {allLists.map(list => (
                      <SelectItem key={list.id} value={list.id}>{list.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedListId && (
                    <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50/80 p-3 rounded-xl border border-emerald-100">
                        <CheckCircle2 className="h-4 w-4" />
                        <span>List loaded successfully with {listCount} prospects.</span>
                    </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="manual" className="space-y-4 mt-0">
              <div className="bg-white/80 border border-[var(--builder-border)] rounded-2xl p-6 space-y-4">
                <div className="flex justify-between items-center">
                    <Label className="text-base font-semibold text-[var(--builder-ink)]">Paste Recipients</Label>
                    <span className="text-xs text-[var(--builder-muted)]">Format: email, name</span>
                </div>
                <Textarea
                  placeholder="email@example.com, Name&#10;another@example.com, John Doe"
                  className="min-h-[200px] font-mono text-sm bg-white/90 border-[var(--builder-border)] focus:ring-0"
                  value={recipients}
                  onChange={(e) => setRecipients(e.target.value)}
                />
              </div>
            </TabsContent>
          </Tabs>

          <div className="mt-6 bg-white/80 border border-[var(--builder-border)] rounded-2xl p-6 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h4 className="text-base font-semibold text-[var(--builder-ink)]">Pipeline & routing</h4>
                <p className="text-xs text-[var(--builder-muted)]">
                  Automatically create pipeline opportunities when replies show intent.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-[var(--builder-muted)]">Enable</span>
                <Switch
                  checked={pipelineConfig.enabled}
                  onCheckedChange={(checked) => setPipelineConfig((prev) => ({ ...prev, enabled: checked }))}
                />
              </div>
            </div>

            {pipelineConfig.enabled && (
              <div className="space-y-5">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-sm text-[var(--builder-muted)]">Pipeline template</Label>
                    <Select
                      value={pipelineConfig.templateId}
                      onValueChange={(value) => setPipelineConfig((prev) => ({
                        ...prev,
                        templateId: value,
                        initialStageId: getPipelineTemplateById(value).stages[0]?.id || prev.initialStageId
                      }))}
                    >
                      <SelectTrigger className="h-10 bg-white/90 border-[var(--builder-border)]">
                        <SelectValue placeholder="Choose pipeline" />
                      </SelectTrigger>
                      <SelectContent>
                        {PIPELINE_TEMPLATES.map((template) => (
                          <SelectItem key={template.id} value={template.id}>{template.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-[11px] text-[var(--builder-muted)]">
                      {selectedPipelineTemplate.description}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm text-[var(--builder-muted)]">Initial stage</Label>
                    <Select
                      value={pipelineConfig.initialStageId}
                      onValueChange={(value) => setPipelineConfig((prev) => ({ ...prev, initialStageId: value }))}
                    >
                      <SelectTrigger className="h-10 bg-white/90 border-[var(--builder-border)]">
                        <SelectValue placeholder="Select stage" />
                      </SelectTrigger>
                      <SelectContent>
                        {selectedPipelineTemplate.stages.map((stage) => (
                          <SelectItem key={stage.id} value={stage.id}>{stage.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-3">
                  <Label className="text-sm text-[var(--builder-muted)]">Create opportunity when</Label>
                  <RadioGroup
                    value={pipelineConfig.createOn}
                    onValueChange={(value) => setPipelineConfig((prev) => ({ ...prev, createOn: value }))}
                    className="grid gap-3 md:grid-cols-3"
                  >
                    {[
                      { value: 'positive', label: 'Positive reply', helper: 'Recommended' },
                      { value: 'any', label: 'Any reply', helper: 'Includes neutral replies' },
                      { value: 'manual', label: 'Manually only', helper: 'No auto-create' },
                    ].map((option) => (
                      <label
                        key={option.value}
                        className={cn(
                          "flex items-start gap-3 rounded-2xl border p-4 text-sm transition-all cursor-pointer",
                          pipelineConfig.createOn === option.value
                            ? "border-emerald-200 bg-emerald-50/80 text-emerald-900"
                            : "border-[var(--builder-border)] bg-white/80 text-[var(--builder-muted)] hover:border-slate-300"
                        )}
                      >
                        <RadioGroupItem value={option.value} className="mt-0.5" />
                        <div>
                          <p className="font-semibold">{option.label}</p>
                          <p className="text-xs text-[var(--builder-muted)]">{option.helper}</p>
                        </div>
                      </label>
                    ))}
                  </RadioGroup>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-sm text-[var(--builder-muted)]">Owner assignment</Label>
                    <Select
                      value={pipelineConfig.ownerRule}
                      onValueChange={(value) => setPipelineConfig((prev) => ({ ...prev, ownerRule: value }))}
                    >
                      <SelectTrigger className="h-10 bg-white/90 border-[var(--builder-border)]">
                        <SelectValue placeholder="Select owner rule" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="sender">Sender who emailed</SelectItem>
                        <SelectItem value="round_robin">Round-robin team</SelectItem>
                        <SelectItem value="fixed">Fixed owner</SelectItem>
                      </SelectContent>
                    </Select>
                    {pipelineConfig.ownerRule === 'fixed' && (
                      <Input
                        placeholder="Owner name or email"
                        value={pipelineConfig.fixedOwner}
                        onChange={(e) => setPipelineConfig((prev) => ({ ...prev, fixedOwner: e.target.value }))}
                        className="h-10 bg-white/90 border-[var(--builder-border)]"
                      />
                    )}
                  </div>

                  <div className="space-y-3">
                    <Label className="text-sm text-[var(--builder-muted)]">Auto-actions</Label>
                    <div className="space-y-3 rounded-2xl border border-[var(--builder-border)] bg-white/80 p-4">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-[var(--builder-ink)]">Stop sequence on Interested</span>
                        <Switch
                          checked={pipelineConfig.stopOnInterested}
                          onCheckedChange={(checked) => setPipelineConfig((prev) => ({ ...prev, stopOnInterested: checked }))}
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-[var(--builder-ink)]">Stop sequence + DNC on Not Interested</span>
                        <Switch
                          checked={pipelineConfig.stopOnNotInterested}
                          onCheckedChange={(checked) => setPipelineConfig((prev) => ({ ...prev, stopOnNotInterested: checked }))}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {!pipelineConfig.enabled && (
              <div className="rounded-xl border border-dashed border-[var(--builder-border)] bg-white/60 p-4 text-xs text-[var(--builder-muted)]">
                Pipeline is off for this campaign. Enable it to auto-route replies into stages.
              </div>
            )}
          </div>
        </div>

        <div>
          <div className="bg-[var(--builder-surface)] border border-[var(--builder-border)] rounded-2xl p-6 shadow-[0_12px_28px_rgba(15,23,42,0.08)] h-full flex flex-col">
            <h4 className="text-sm font-semibold text-[var(--builder-muted)] uppercase tracking-wider mb-6">Summary</h4>
            
            <div className="flex-1 flex flex-col items-center justify-center text-center space-y-2 mb-8">
                <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mb-2">
                    <Users className="h-8 w-8 text-emerald-600" />
                </div>
                <span className="text-4xl font-bold text-[var(--builder-ink)]">
                  {totalRecipients}
                </span>
                <span className="text-sm text-[var(--builder-muted)]">Total Recipients</span>
            </div>

            <Separator className="my-4" />

            <div className="space-y-4">
                <div className="flex justify-between text-sm">
                    <span className="text-[var(--builder-muted)]">Daily Limit</span>
                    <span className="font-medium text-[var(--builder-ink)]">{totalDailyLimit} / day</span>
                </div>
                <div className="bg-white/80 rounded-xl p-3 text-xs text-[var(--builder-muted)] leading-relaxed border border-[var(--builder-border)]">
                    Based on your daily limit, this campaign will take approximately 
                    <strong className="text-[var(--builder-ink)] mx-1">{estimatedDays}</strong> 
                    days to complete.
                </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderContentStep = () => (
    <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-500 flex flex-col">
      {templates.length === 0 && (
        <div className="rounded-2xl border border-amber-200/70 bg-amber-50/80 p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-white/80 p-2 rounded-full border border-amber-200">
              <Mail className="h-5 w-5 text-amber-700" />
            </div>
            <div>
              <h4 className="font-semibold text-amber-900">Add an email template</h4>
              <p className="text-sm text-amber-700">Create a reusable template to load into this campaign.</p>
            </div>
          </div>
          <Button
            variant="outline"
            className="bg-white/80 text-amber-700 hover:bg-amber-100 border-amber-200"
            onClick={() => navigate('/dashboard?tab=templates')}
          >
            Add template
          </Button>
        </div>
      )}
      <div className="flex justify-between items-center mb-2 shrink-0">
        <div className="flex items-center gap-2">
            <Select value={selectedTemplate} onValueChange={handleTemplateSelect} disabled={templates.length === 0}>
                <SelectTrigger className="w-[200px] h-9 text-xs bg-white/80 border-[var(--builder-border)] text-[var(--builder-ink)] cursor-pointer">
                    <SelectValue placeholder="Load Template..." />
                </SelectTrigger>
                <SelectContent>
                    {templates.map((template) => (
                    <SelectItem key={template.id} value={template.id} className="cursor-pointer">
                        {template.name}
                    </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
        <div className="flex items-center gap-2">
            <span className="text-xs text-[var(--builder-muted)] mr-2">Insert Variable:</span>
            {['{first_name}', '{company}', '{email}'].map(variable => (
                <Badge 
                key={variable}
                variant="outline" 
                className="cursor-pointer hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200 transition-all bg-white/90 border-[var(--builder-border)] text-[var(--builder-ink)]"
                onClick={() => setForm(f => ({...f, content: f.content + variable}))}
                >
                {variable}
                </Badge>
            ))}
            
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="ml-2 gap-2 h-7 text-xs border-[var(--builder-border)] bg-white/80 text-[var(--builder-ink)]">
                  <Eye className="h-3 w-3" /> Preview
                </Button>
              </DialogTrigger>
              <DialogContent
                className="max-w-3xl h-[80vh] flex flex-col rounded-[24px] border border-[var(--builder-border)] bg-[var(--builder-surface-strong)] text-[var(--builder-ink)] shadow-[0_20px_40px_rgba(15,23,42,0.15)]"
                style={builderStyles}
              >
                <DialogHeader>
                  <DialogTitle className="text-xl font-semibold text-[var(--builder-ink)]">Email Preview</DialogTitle>
                </DialogHeader>
                <div className="flex-1 overflow-y-auto bg-white/70 p-4 rounded-2xl border border-[var(--builder-border)]">
                    <div className="bg-white/90 rounded-2xl border border-[var(--builder-border)] shadow-sm p-8 max-w-2xl mx-auto min-h-[400px]">
                        <div className="border-b border-[var(--builder-border)] pb-4 mb-6 space-y-1">
                            <p className="text-lg font-semibold text-[var(--builder-ink)]">{form.subject || <span className="text-slate-300">Subject</span>}</p>
                            <div className="flex items-center gap-2 text-xs text-[var(--builder-muted)]">
                                <div className="w-6 h-6 rounded-full bg-slate-200" />
                                <span>Me</span>
                                <span className="text-slate-300">to</span>
                                <span>John Doe</span>
                            </div>
                        </div>
                          {form.content ? (
                            form.is_html && looksLikeHtml(form.content) ? (
                              <div
                                className="builder-preview prose prose-sm max-w-none text-slate-800"
                                dangerouslySetInnerHTML={{ __html: form.content }}
                              />
                            ) : (
                              <div
                                className="builder-preview prose prose-sm max-w-none text-slate-800"
                                dangerouslySetInnerHTML={{ __html: renderPlainTextPreviewHtml(form.content) }}
                              />
                            )
                          ) : (
                            <div className="prose prose-sm max-w-none text-slate-300 italic">
                              Start typing to see how your email will look...
                            </div>
                          )}
                    </div>
                </div>
              </DialogContent>
            </Dialog>
        </div>
      </div>

      <div>
        {/* Editor */}
        <div className="flex flex-col border border-[var(--builder-border)] rounded-2xl bg-white/90 shadow-[0_12px_24px_rgba(15,23,42,0.06)]">
            <div className="p-3 border-b border-[var(--builder-border)] bg-white/70 shrink-0">
                <Input
                  placeholder="Subject Line"
                  value={form.subject}
                  onChange={(e) => setForm({ ...form, subject: e.target.value })}
                  className="border-0 bg-transparent text-lg font-medium px-0 focus-visible:ring-0 placeholder:text-gray-400 h-auto py-1"
                />
            </div>
            <div className="relative">
                <Textarea
                  placeholder="Hi {first_name},&#10;&#10;I'm writing to you because..."
                  className="w-full resize-none border-0 p-4 focus-visible:ring-0 font-mono text-sm leading-relaxed text-[var(--builder-ink)] overflow-hidden"
                  value={form.content}
                  onChange={(e) => setForm({ ...form, content: e.target.value })}
                  ref={contentBodyRef}
                />
            </div>
        </div>
      </div>
    </div>
  );

  const renderFollowupsStep = () => (
    <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500 max-w-4xl mx-auto">
      <div className="relative pl-8 space-y-12">
        {/* Vertical Line */}
        <div className="absolute left-[15px] top-4 bottom-0 w-0.5 bg-[var(--builder-border)]" />

        {/* Initial Email Node */}
        <div className="relative">
          <div className="absolute -left-[29px] top-0 w-8 h-8 rounded-full bg-[var(--builder-accent)] border-4 border-white shadow-sm flex items-center justify-center z-10">
            <Mail className="h-4 w-4 text-white" />
          </div>
          <div className="ml-6 bg-white/90 border border-[var(--builder-border)] rounded-2xl p-6 shadow-[0_12px_24px_rgba(15,23,42,0.06)]">
            <div className="flex justify-between items-start mb-2">
                <h4 className="font-semibold text-[var(--builder-ink)]">Initial Email</h4>
                <Badge variant="outline" className="border-[var(--builder-border)] text-[var(--builder-muted)]">Step 1</Badge>
            </div>
            <p className="text-sm text-[var(--builder-muted)] truncate">{form.subject || '(No Subject)'}</p>
          </div>
        </div>

        {/* Follow-up Nodes */}
        {followups.map((step, index) => (
          <div key={index} className="relative">
            <div className="absolute -left-[29px] top-6 w-8 h-8 rounded-full bg-white border-2 border-[var(--builder-border)] flex items-center justify-center z-10">
              <span className="text-xs font-bold text-[var(--builder-muted)]">{index + 1}</span>
            </div>
            
            <div className="ml-6">
              <div className="flex items-center gap-2 mb-4">
                <div className="bg-white/80 text-[var(--builder-muted)] text-xs font-medium px-3 py-1 rounded-full border border-[var(--builder-border)]">
                  Wait {step.delay_days} days, {step.delay_hours} hours
                </div>
                <span className="text-xs text-[var(--builder-muted)]">if no reply</span>
              </div>
              
              <div className="bg-white/90 border border-[var(--builder-border)] rounded-2xl p-6 shadow-[0_12px_24px_rgba(15,23,42,0.06)] group hover:border-emerald-200 transition-colors">
                <div className="flex justify-between items-start mb-4">
                    <h4 className="font-semibold text-[var(--builder-ink)]">Follow-up #{step.step_number}</h4>
                    <Button variant="ghost" size="icon" onClick={() => removeFollowupStep(index)} className="text-slate-400 hover:text-rose-500 hover:bg-rose-50">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                </div>
                
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs text-[var(--builder-muted)]">Wait Days</Label>
                      <Input 
                        type="number" min="0"
                        value={step.delay_days}
                        onChange={(e) => updateFollowupStep(index, 'delay_days', parseInt(e.target.value) || 0)}
                        className="h-9 border-[var(--builder-border)] bg-white/90"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-[var(--builder-muted)]">Wait Hours</Label>
                      <Input 
                        type="number" min="0" max="23"
                        value={step.delay_hours}
                        onChange={(e) => updateFollowupStep(index, 'delay_hours', parseInt(e.target.value) || 0)}
                        className="h-9 border-[var(--builder-border)] bg-white/90"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-[var(--builder-muted)]">Message Body</Label>
                    <Textarea 
                      placeholder="Just bumping this to the top of your inbox..."
                      className="min-h-[100px] resize-none border-[var(--builder-border)] bg-white/90"
                      value={step.body}
                      onChange={(e) => updateFollowupStep(index, 'body', e.target.value)}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}

        {/* Add Step Button */}
        <div className="relative pt-4 pb-8">
          <div className="absolute -left-[29px] top-4 w-8 h-8 rounded-full bg-white/80 border-2 border-dashed border-[var(--builder-border)] flex items-center justify-center z-10">
            <Plus className="h-4 w-4 text-slate-400" />
          </div>
          <Button
            onClick={addFollowupStep}
            variant="outline"
            className="ml-6 border-dashed w-full justify-start text-[var(--builder-muted)] hover:text-emerald-700 hover:border-emerald-300 hover:bg-emerald-50 h-12"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Follow-up Step
          </Button>
        </div>
      </div>
    </div>
  );

  const renderReviewStep = () => (
    <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-emerald-50/80 border border-emerald-100 rounded-2xl p-6 text-center">
            <p className="text-sm font-medium text-emerald-700 mb-1">Recipients</p>
            <p className="text-3xl font-bold text-emerald-900">
              {totalRecipients}
            </p>
        </div>
        <div className="bg-amber-50/80 border border-amber-100 rounded-2xl p-6 text-center">
            <p className="text-sm font-medium text-amber-700 mb-1">Daily Volume</p>
            <p className="text-3xl font-bold text-amber-900">
              {totalDailyLimit}
            </p>
        </div>
        <div className="bg-teal-50/80 border border-teal-100 rounded-2xl p-6 text-center">
            <p className="text-sm font-medium text-teal-700 mb-1">Follow-ups</p>
            <p className="text-3xl font-bold text-teal-900">{followups.length}</p>
        </div>
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 text-center">
            <p className="text-sm font-medium text-slate-600 mb-1">Delay</p>
            <p className="text-3xl font-bold text-slate-900">
              {form.send_delay_minutes}<span className="text-sm font-normal ml-1">m</span>
            </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
            <div className="bg-white/90 border border-[var(--builder-border)] rounded-2xl p-6 space-y-6">
              <h4 className="font-semibold text-[var(--builder-ink)] border-b border-[var(--builder-border)] pb-4">Campaign Configuration</h4>
              <div className="grid grid-cols-2 gap-6 text-sm">
                <div>
                  <span className="text-[var(--builder-muted)] block mb-1">Campaign Name</span>
                  <span className="font-medium text-[var(--builder-ink)]">{form.name}</span>
                </div>
                <div>
                  <span className="text-[var(--builder-muted)] block mb-1">Subject Line</span>
                  <span className="font-medium text-[var(--builder-ink)]">{form.subject}</span>
                </div>
                <div>
                  <span className="text-[var(--builder-muted)] block mb-1">Sender Accounts</span>
                  <span className="font-medium text-[var(--builder-ink)]">{selectedConfigs.length} accounts selected</span>
                </div>
                  <div>
                    <span className="text-[var(--builder-muted)] block mb-1">Audience Source</span>
                    <span className="font-medium text-[var(--builder-ink)] capitalize">{audienceType}</span>
                  </div>
                    <div>
                      <span className="text-[var(--builder-muted)] block mb-1">Sender Routing</span>
                      <span className="font-medium text-[var(--builder-ink)]">
                        {senderAssignment === 'list' ? 'Use sender_email column' : 'Random distribution'}
                      </span>
                    </div>
              </div>
            </div>

            <div className="bg-white/90 border border-[var(--builder-border)] rounded-2xl p-6 space-y-4">
              <h4 className="font-semibold text-[var(--builder-ink)]">Pipeline & Routing</h4>
              {pipelineConfig.enabled ? (
                <div className="grid grid-cols-2 gap-6 text-sm">
                  <div>
                    <span className="text-[var(--builder-muted)] block mb-1">Pipeline</span>
                    <span className="font-medium text-[var(--builder-ink)]">{selectedPipelineTemplate.name}</span>
                  </div>
                  <div>
                    <span className="text-[var(--builder-muted)] block mb-1">Create opportunity</span>
                    <span className="font-medium text-[var(--builder-ink)]">
                      {pipelineConfig.createOn === 'positive'
                        ? 'Positive replies'
                        : pipelineConfig.createOn === 'any'
                        ? 'Any reply'
                        : 'Manual only'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[var(--builder-muted)] block mb-1">Initial stage</span>
                    <span className="font-medium text-[var(--builder-ink)]">
                      {selectedPipelineTemplate.stages.find((stage) => stage.id === pipelineConfig.initialStageId)?.name || 'Not set'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[var(--builder-muted)] block mb-1">Owner rule</span>
                    <span className="font-medium text-[var(--builder-ink)]">
                      {pipelineConfig.ownerRule === 'sender'
                        ? 'Sender who emailed'
                        : pipelineConfig.ownerRule === 'round_robin'
                        ? 'Round-robin team'
                        : pipelineConfig.fixedOwner || 'Fixed owner'}
                    </span>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-[var(--builder-muted)]">Pipeline routing is disabled for this campaign.</p>
              )}
            </div>

          <div className="bg-white/90 border border-[var(--builder-border)] rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
                <h4 className="font-semibold text-[var(--builder-ink)]">Schedule Launch</h4>
                <Switch checked={!!scheduledAt} onCheckedChange={(c) => setScheduledAt(c ? new Date().toISOString().slice(0, 16) : '')} />
            </div>
            {scheduledAt && (
                <div className="pt-2">
                    <Label htmlFor="scheduledAt" className="mb-2 block text-[var(--builder-muted)]">Start Date & Time</Label>
                    <Input
                    id="scheduledAt"
                    type="datetime-local"
                    value={scheduledAt}
                    onChange={(e) => setScheduledAt(e.target.value)}
                    className="max-w-md border-[var(--builder-border)] bg-white/90"
                    />
                    <p className="text-sm text-[var(--builder-muted)] mt-2">
                    Campaign will automatically start on {scheduleLabel}
                    </p>
                </div>
            )}
          </div>
        </div>

        <div>
          <div className="bg-white/90 border border-[var(--builder-border)] rounded-2xl p-6 h-full">
            <h4 className="font-semibold text-[var(--builder-ink)] mb-4">Pre-flight Checklist</h4>
            <div className="space-y-3">
              {[
                  { label: 'Subject line set', valid: !!form.subject },
                  { label: 'Content added', valid: !!form.content },
                  { label: 'Recipients selected', valid: totalRecipients > 0 },
                  { label: 'Senders configured', valid: selectedConfigs.length > 0 },
              ].map((item, i) => (
                  <div key={i} className="flex items-center gap-3 text-sm">
                    <div className={cn("w-5 h-5 rounded-full flex items-center justify-center", item.valid ? "bg-emerald-100 text-emerald-600" : "bg-slate-200 text-slate-400")}>
                        {item.valid ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                    </div>
                    <span className={item.valid ? "text-slate-700" : "text-slate-400"}>{item.label}</span>
                  </div>
              ))}
              
              <Separator className="my-4" />
              
              <div className="p-4 bg-amber-50 text-amber-800 rounded-xl text-xs border border-amber-100 leading-relaxed">
                <p className="font-medium mb-1 flex items-center gap-1"><AlertCircle className="h-3 w-3" /> Important</p>
                <p>Emails will be queued immediately. Ensure your sender accounts are warmed up and ready.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div
      className="relative -my-8 min-h-[calc(100vh-4rem)] bg-[var(--builder-bg)] text-[var(--builder-ink)]"
      style={builderStyles}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=Sora:wght@500;600;700&display=swap');
        @keyframes builder-rise {
          from { opacity: 0; transform: translateY(14px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes builder-float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-12px); }
        }
        .builder-rise { animation: builder-rise 0.6s ease-out both; }
        .builder-float { animation: builder-float 8s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .builder-rise, .builder-float { animation: none; }
        }
        .builder-preview ul,
        .builder-preview ol {
          list-style-position: outside;
          margin: 0.6rem 0;
          padding-left: 1.4rem;
        }
        .builder-preview ul {
          list-style-type: disc;
        }
        .builder-preview ol {
          list-style-type: decimal;
        }
        .builder-preview li {
          margin: 0.2rem 0;
        }
        .builder-preview p {
          margin: 0.65rem 0;
        }
        .builder-preview p:first-child {
          margin-top: 0;
        }
        .builder-preview p:last-child {
          margin-bottom: 0;
        }
      `}</style>

      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -right-24 -top-24 h-64 w-64 rounded-full bg-emerald-200/40 blur-3xl builder-float"></div>
        <div className="absolute -left-24 top-1/3 h-72 w-72 rounded-full bg-amber-200/40 blur-3xl builder-float" style={{ animationDelay: '1.6s' }}></div>
      </div>

      <div className="relative mx-auto w-full max-w-6xl space-y-5 px-5 py-6 lg:px-8 lg:py-8">
        <section className="builder-rise relative overflow-hidden rounded-[28px] border border-[var(--builder-border)] bg-[var(--builder-surface-strong)] p-5 shadow-[0_18px_40px_rgba(15,23,42,0.08)]">
          <div className="absolute -right-24 -top-32 h-72 w-72 rounded-full bg-emerald-200/40 blur-3xl"></div>
          <div className="absolute -left-24 bottom-0 h-64 w-64 rounded-full bg-amber-200/40 blur-3xl"></div>
          <div className="relative z-10 space-y-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.28em] text-[var(--builder-muted)]">
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-[var(--builder-accent)] shadow-[0_0_12px_rgba(15,118,110,0.6)]"></span>
                    Campaign builder
                  </span>
                  <span className="flex items-center gap-1 text-[10px] font-medium tracking-[0.2em] text-[var(--builder-muted)]">
                    <Send className="h-3 w-3" />
                    Multi-step workflow
                  </span>
                  <Badge
                    variant="outline"
                    className="h-6 rounded-full border-[var(--builder-border)] bg-white/70 px-3 text-[10px] font-semibold text-[var(--builder-ink)]"
                  >
                    Step {currentStep} of {STEPS.length}
                  </Badge>
                </div>
                <h1
                  className="text-3xl font-semibold text-[var(--builder-ink)] md:text-4xl"
                  style={{ fontFamily: 'var(--builder-font-display)' }}
                >
                  Create Campaign
                </h1>
                <p className="max-w-xl text-sm text-[var(--builder-muted)]">
                  Shape your outreach, define the audience, and launch with confidence.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {headerStats.map((stat, index) => (
                  <div
                    key={stat.label}
                    className="builder-rise rounded-2xl border border-[var(--builder-border)] bg-white/80 p-4 shadow-[0_10px_22px_rgba(15,23,42,0.06)]"
                    style={{ animationDelay: `${140 + index * 70}ms` }}
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--builder-muted)]">
                        {stat.label}
                      </p>
                      <div className={`rounded-xl p-2 ${stat.tone}`}>
                        <stat.icon className="h-4 w-4" />
                      </div>
                    </div>
                    <div
                      className="mt-2 text-2xl font-semibold text-[var(--builder-ink)]"
                      style={{ fontFamily: 'var(--builder-font-display)' }}
                    >
                      {typeof stat.value === 'number' ? stat.value.toLocaleString() : stat.value}
                    </div>
                    <p className="text-xs text-[var(--builder-muted)]">{stat.helper}</p>
                  </div>
                ))}
              </div>
            </div>

            {renderStepIndicator()}
          </div>
        </section>

        <section
          className="builder-rise rounded-[28px] border border-[var(--builder-border)] bg-[var(--builder-surface)] shadow-[0_18px_40px_rgba(15,23,42,0.08)] overflow-hidden"
          style={{ animationDelay: '120ms' }}
        >
          {/* Header */}
          <div className="px-6 py-4 border-b border-[var(--builder-border)] flex justify-between items-center bg-white/70 shrink-0">
            <div>
              <h2 className="text-lg font-semibold text-[var(--builder-ink)]">{STEPS[currentStep - 1].title}</h2>
              <p className="text-xs text-[var(--builder-muted)]">{STEPS[currentStep - 1].description}</p>
            </div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--builder-muted)] bg-white/80 px-3 py-1 rounded-full border border-[var(--builder-border)]">
              Step {currentStep} of {STEPS.length}
            </div>
          </div>

          {/* Content Body */}
          <div className="p-6 flex-1 overflow-y-auto min-h-0">
            {currentStep === 1 && renderSetupStep()}
            {currentStep === 2 && renderAudienceStep()}
            {currentStep === 3 && renderContentStep()}
            {currentStep === 4 && renderFollowupsStep()}
            {currentStep === 5 && renderReviewStep()}
          </div>

          {/* Footer Actions */}
          <div className="px-6 py-4 bg-white/70 border-t border-[var(--builder-border)] flex justify-between items-center shrink-0">
            <Button
              variant="ghost"
              onClick={handleBack}
              disabled={currentStep === 1 || loading}
              className="text-[var(--builder-muted)] hover:text-[var(--builder-ink)] hover:bg-white/80"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>

            <div className="flex gap-3">
              {currentStep === 5 && (
                <Button
                  variant="outline"
                  onClick={() => handleSave(true)}
                  disabled={loading}
                  className="border-[var(--builder-border)] bg-white/80 text-[var(--builder-ink)]"
                >
                  Save Draft
                </Button>
              )}

              {currentStep < 5 ? (
                <Button
                  onClick={handleNext}
                  className="bg-[var(--builder-accent)] hover:bg-emerald-900/90 text-white px-8 shadow-[0_12px_24px_rgba(15,118,110,0.2)]"
                >
                  Next Step
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              ) : (
                <Button
                  onClick={() => handleSave(false)}
                  disabled={loading}
                  className="bg-[var(--builder-ink)] hover:bg-black/90 text-white px-8 shadow-[0_12px_24px_rgba(15,23,42,0.25)]"
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
                  {loading ? 'Launching...' : 'Launch Campaign'}
                </Button>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default CampaignBuilder;

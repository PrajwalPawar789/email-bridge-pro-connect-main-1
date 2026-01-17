import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import DashboardLayout from '@/components/Layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import {
  Brain,
  CheckCircle2,
  Clock,
  FileText,
  GitBranch,
  GripVertical,
  Mail,
  MessageSquare,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Sparkles,
  Tag,
  Trash2,
  Wand2,
  Zap,
  type LucideIcon
} from 'lucide-react';
import { useAuth } from '@/providers/AuthProvider';

const SONAR_API_KEY = 'REDACTED_PERPLEXITY_KEY';
const SONAR_ENDPOINT = 'https://api.perplexity.ai/chat/completions';
const DEFAULT_SONAR_PROXY_URL = 'http://localhost:8787/sonar';
const SONAR_PROXY_URL = import.meta.env.VITE_SONAR_PROXY_URL || DEFAULT_SONAR_PROXY_URL;
const STORAGE_PREFIX = 'emailbridge.automations';

type TriggerType =
  | 'list_join'
  | 'tag_added'
  | 'segment_entered'
  | 'email_opened'
  | 'link_clicked'
  | 'reply_received'
  | 'webhook'
  | 'ai_selected';

type StepType =
  | 'send_email'
  | 'wait'
  | 'follow_up'
  | 'condition'
  | 'tag'
  | 'webhook';

interface TriggerConfig {
  type: TriggerType;
  description: string;
  detail: string;
  aiManaged: boolean;
}

interface WorkflowStep {
  id: string;
  type: StepType;
  name: string;
  description: string;
  delayHours?: number;
  template?: string;
  condition?: string;
  tag?: string;
  webhookUrl?: string;
  aiSuggestedTime?: string;
}

interface SavedWorkflow {
  id: string;
  name: string;
  status: 'draft' | 'active';
  trigger: TriggerConfig;
  steps: WorkflowStep[];
  campaignId?: string | null;
  replyAutomation?: ReplyAutomationConfig;
  createdAt: string;
  updatedAt: string;
}

interface SonarMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface AiRecommendation {
  stepIndex: number;
  sendWindow?: string;
  delayHours?: number;
  note?: string;
}

type ReplyIntent = 'positive' | 'question' | 'objection' | 'pricing' | 'unsubscribe' | 'out_of_office';

type ReplyAction = 'send_reply' | 'send_reply_stop' | 'notify_only' | 'stop_campaign';

interface ReplyRule {
  id: string;
  intent: ReplyIntent;
  keywords: string;
  action: ReplyAction;
  templateId?: string;
}

interface ReplyAutomationConfig {
  enabled: boolean;
  pauseOnReply: boolean;
  notifyOnReply: boolean;
  replyWindowHours: number;
  mailboxConfigId?: string;
  fallbackTemplateId?: string;
  rules: ReplyRule[];
}

interface AiCampaignDraft {
  name: string;
  subject: string;
  body: string;
  summary?: string;
  sendDelayMinutes?: number;
  followups?: Array<{
    delayDays?: number;
    delayHours?: number;
    subject?: string;
    body?: string;
  }>;
}

interface AiTemplateDraft {
  name: string;
  subject: string;
  content: string;
  isHtml: boolean;
  summary?: string;
}

interface CampaignSummary {
  id: string;
  name: string | null;
  subject: string | null;
  status: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  sent_count?: number | null;
  replied_count?: number | null;
}

interface TemplateSummary {
  id: string;
  name?: string | null;
  subject?: string | null;
  is_html?: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
}

interface EmailConfigSummary {
  id: string;
  smtp_username?: string | null;
}

const triggerOptions: { value: TriggerType; label: string; description: string }[] = [
  { value: 'list_join', label: 'New subscriber joins a list', description: 'Starts when someone joins a list.' },
  { value: 'tag_added', label: 'Tag added to contact', description: 'Starts when a tag is applied.' },
  { value: 'segment_entered', label: 'Contact enters a segment', description: 'Starts when a segment condition is met.' },
  { value: 'email_opened', label: 'Email opened', description: 'Starts after a specific email is opened.' },
  { value: 'link_clicked', label: 'Link clicked', description: 'Starts after a link click.' },
  { value: 'reply_received', label: 'Reply received', description: 'Starts when a recipient replies.' },
  { value: 'webhook', label: 'Webhook received', description: 'Starts from an external webhook.' },
  { value: 'ai_selected', label: 'AI picks the trigger', description: 'AI chooses the highest impact trigger.' },
];

const replyIntentOptions: { value: ReplyIntent; label: string; description: string; suggestedKeywords: string }[] = [
  {
    value: 'positive',
    label: 'Positive',
    description: 'Interested, positive, or confirming reply.',
    suggestedKeywords: 'sounds good, interested, yes, let us do it, great',
  },
  {
    value: 'question',
    label: 'Question',
    description: 'Asks for clarification or next steps.',
    suggestedKeywords: 'how does, can you, what about, questions, details',
  },
  {
    value: 'objection',
    label: 'Objection',
    description: 'Not interested or needs more convincing.',
    suggestedKeywords: 'not interested, maybe later, no thanks, not now',
  },
  {
    value: 'pricing',
    label: 'Pricing',
    description: 'Mentions price, budget, or cost concerns.',
    suggestedKeywords: 'pricing, cost, budget, too expensive, rate',
  },
  {
    value: 'unsubscribe',
    label: 'Unsubscribe',
    description: 'Requests removal or opt-out.',
    suggestedKeywords: 'unsubscribe, stop, remove me, opt out',
  },
  {
    value: 'out_of_office',
    label: 'Out of office',
    description: 'Automatic reply or away notice.',
    suggestedKeywords: 'out of office, away until, vacation, auto reply',
  },
];

const replyActionOptions: { value: ReplyAction; label: string; description: string }[] = [
  { value: 'send_reply', label: 'Send reply', description: 'Send an automatic reply using a template.' },
  {
    value: 'send_reply_stop',
    label: 'Reply and stop',
    description: 'Reply and stop further campaign sends.',
  },
  { value: 'notify_only', label: 'Notify only', description: 'Notify a teammate, no auto reply.' },
  { value: 'stop_campaign', label: 'Stop campaign', description: 'Stop further sends for this recipient.' },
];

const stepCatalog: Record<StepType, { label: string; description: string; icon: LucideIcon; accent: string }> = {
  send_email: {
    label: 'Send email',
    description: 'Deliver a campaign or welcome email.',
    icon: Mail,
    accent: 'bg-emerald-100 text-emerald-700',
  },
  wait: {
    label: 'Wait',
    description: 'Pause before the next action.',
    icon: Clock,
    accent: 'bg-amber-100 text-amber-700',
  },
  follow_up: {
    label: 'Follow-up email',
    description: 'Send a follow-up message.',
    icon: Sparkles,
    accent: 'bg-teal-100 text-teal-700',
  },
  condition: {
    label: 'Condition split',
    description: 'Branch based on engagement.',
    icon: GitBranch,
    accent: 'bg-slate-100 text-slate-700',
  },
  tag: {
    label: 'Apply tag',
    description: 'Update contact metadata.',
    icon: Tag,
    accent: 'bg-blue-100 text-blue-700',
  },
  webhook: {
    label: 'Webhook',
    description: 'Send data to another system.',
    icon: Zap,
    accent: 'bg-purple-100 text-purple-700',
  },
};
const createId = (prefix: string) =>
  `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const replyActionRequiresTemplate = (action: ReplyAction) =>
  action === 'send_reply' || action === 'send_reply_stop';

const createReplyRule = (intent: ReplyIntent, overrides: Partial<ReplyRule> = {}): ReplyRule => {
  const intentMeta = replyIntentOptions.find((option) => option.value === intent);
  return {
    id: createId('reply'),
    intent,
    keywords: intentMeta?.suggestedKeywords || '',
    action: 'send_reply',
    templateId: '',
    ...overrides,
  };
};

const createDefaultReplyAutomation = (): ReplyAutomationConfig => ({
  enabled: true,
  pauseOnReply: true,
  notifyOnReply: true,
  replyWindowHours: 48,
  mailboxConfigId: '',
  fallbackTemplateId: '',
  rules: [
    createReplyRule('positive', { action: 'send_reply' }),
    createReplyRule('question', { action: 'send_reply' }),
    createReplyRule('pricing', { action: 'send_reply' }),
    createReplyRule('unsubscribe', { action: 'stop_campaign' }),
  ],
});

const normalizeReplyAutomation = (config?: ReplyAutomationConfig | null): ReplyAutomationConfig => {
  if (!config) return createDefaultReplyAutomation();
  const fallback = createDefaultReplyAutomation();
  const rules =
    Array.isArray(config.rules) && config.rules.length > 0
      ? config.rules.map((rule) => ({
          ...rule,
          id: rule.id || createId('reply'),
          templateId: rule.templateId || '',
          keywords: rule.keywords || '',
        }))
      : fallback.rules;

  return {
    ...fallback,
    ...config,
    mailboxConfigId: config.mailboxConfigId || '',
    fallbackTemplateId: config.fallbackTemplateId || '',
    rules,
  };
};

const createStep = (type: StepType): WorkflowStep => {
  const base = {
    id: createId('step'),
    type,
    name: '',
    description: '',
  };

  switch (type) {
    case 'send_email':
      return {
        ...base,
        name: 'Send welcome email',
        description: 'Introduce the brand and set expectations.',
        template: 'Welcome series - email 1',
      };
    case 'wait':
      return {
        ...base,
        name: 'Wait before next email',
        description: 'Delay to respect inbox timing.',
        delayHours: 24,
      };
    case 'follow_up':
      return {
        ...base,
        name: 'Send follow-up email',
        description: 'Continue the onboarding story.',
        template: 'Welcome series - follow-up',
      };
    case 'condition':
      return {
        ...base,
        name: 'Branch by engagement',
        description: 'Split contacts based on opens or clicks.',
        condition: 'If the welcome email was opened.',
      };
    case 'tag':
      return {
        ...base,
        name: 'Apply tag',
        description: 'Label the contact for segmentation.',
        tag: 'Engaged - onboarding',
      };
    case 'webhook':
      return {
        ...base,
        name: 'Webhook',
        description: 'Notify downstream systems.',
        webhookUrl: 'https://example.com/webhook',
      };
    default:
      return base;
  }
};

const formatDelay = (hours?: number) => {
  if (!hours && hours !== 0) return 'No delay';
  if (hours === 0) return 'No delay';
  if (hours % 24 === 0) {
    const days = hours / 24;
    return `${days} day${days === 1 ? '' : 's'}`;
  }
  return `${hours} hour${hours === 1 ? '' : 's'}`;
};

const extractJsonFromText = (text: string) => {
  const fencedMatch =
    text.match(/```json\s*([\s\S]*?)```/i) ||
    text.match(/```\s*([\s\S]*?)```/i);
  const candidate = fencedMatch ? fencedMatch[1] : text;
  const firstBrace = candidate.indexOf('{');
  const lastBrace = candidate.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1) return null;
  const jsonText = candidate.slice(firstBrace, lastBrace + 1);
  try {
    return JSON.parse(jsonText);
  } catch {
    return null;
  }
};

const mapTriggerType = (value?: string): TriggerType => {
  const normalized = (value || '').toLowerCase().replace(/[^a-z]/g, '');
  if (normalized.includes('list') || normalized.includes('subscriber')) return 'list_join';
  if (normalized.includes('tag')) return 'tag_added';
  if (normalized.includes('segment')) return 'segment_entered';
  if (normalized.includes('open')) return 'email_opened';
  if (normalized.includes('click')) return 'link_clicked';
  if (normalized.includes('reply')) return 'reply_received';
  if (normalized.includes('webhook')) return 'webhook';
  return 'ai_selected';
};

const mapStepType = (value?: string): StepType => {
  const normalized = (value || '').toLowerCase().replace(/[^a-z]/g, '');
  if (normalized.includes('wait') || normalized.includes('delay')) return 'wait';
  if (normalized.includes('follow')) return 'follow_up';
  if (normalized.includes('condition') || normalized.includes('branch')) return 'condition';
  if (normalized.includes('tag')) return 'tag';
  if (normalized.includes('webhook') || normalized.includes('notify')) return 'webhook';
  return 'send_email';
};

const getSonarContent = (payload: any) =>
  (payload?.choices?.[0]?.message?.content as string | undefined)?.trim() || '';

const callSonar = async (messages: SonarMessage[]) => {
  const payload = {
    model: 'sonar',
    messages,
    temperature: 0.2,
    top_p: 0.9,
    stream: false,
  };

  const makeRequest = async (url: string, headers: Record<string, string>) => {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || `Request failed with ${response.status}`);
    }

    return response.json();
  };

  try {
    return await makeRequest(SONAR_PROXY_URL, {});
  } catch (error) {
    return await makeRequest(SONAR_ENDPOINT, { Authorization: `Bearer ${SONAR_API_KEY}` });
  }
};

const Automations = () => {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [workflowName, setWorkflowName] = useState('Welcome automation');
  const [workflowStatus, setWorkflowStatus] = useState<'draft' | 'active'>('draft');
  const [triggerConfig, setTriggerConfig] = useState<TriggerConfig>({
    type: 'list_join',
    description: 'Starts when someone joins the main list.',
    detail: 'Main newsletter list',
    aiManaged: false,
  });
  const [steps, setSteps] = useState<WorkflowStep[]>(() => [
    createStep('send_email'),
    createStep('wait'),
    createStep('follow_up'),
  ]);
  const [newStepType, setNewStepType] = useState<StepType>('send_email');
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const [savedWorkflows, setSavedWorkflows] = useState<SavedWorkflow[]>([]);
  const [activeWorkflowId, setActiveWorkflowId] = useState<string | null>(null);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiWorkflowLoading, setAiWorkflowLoading] = useState(false);
  const [aiTriggerLoading, setAiTriggerLoading] = useState(false);
  const [aiSummary, setAiSummary] = useState('');
  const [aiTimingLoading, setAiTimingLoading] = useState(false);
  const [aiTimingSummary, setAiTimingSummary] = useState('');
  const [aiRecommendations, setAiRecommendations] = useState<AiRecommendation[]>([]);
  const [autoApplyTiming, setAutoApplyTiming] = useState(true);
  const [engagementNotes, setEngagementNotes] = useState(
    'Top engagement window: Tue-Thu 9am-11am. Secondary window: Sun 6pm-8pm. Mobile opens are 70 percent.'
  );
  const [audienceTimezone, setAudienceTimezone] = useState('America/New_York');
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([]);
  const [campaignsLoading, setCampaignsLoading] = useState(false);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [emailConfigs, setEmailConfigs] = useState<EmailConfigSummary[]>([]);
  const [emailConfigsLoading, setEmailConfigsLoading] = useState(false);
  const [replyAutomation, setReplyAutomation] = useState<ReplyAutomationConfig>(() => createDefaultReplyAutomation());
  const [replyScanLoading, setReplyScanLoading] = useState(false);
  const [replyScanSummary, setReplyScanSummary] = useState('');
  const [aiCampaignPrompt, setAiCampaignPrompt] = useState('');
  const [aiCampaignDraft, setAiCampaignDraft] = useState<AiCampaignDraft | null>(null);
  const [aiCampaignLoading, setAiCampaignLoading] = useState(false);
  const [campaignCreateLoading, setCampaignCreateLoading] = useState(false);
  const [aiTemplatePrompt, setAiTemplatePrompt] = useState('');
  const [aiTemplateDraft, setAiTemplateDraft] = useState<AiTemplateDraft | null>(null);
  const [aiTemplateLoading, setAiTemplateLoading] = useState(false);
  const [templateSaveLoading, setTemplateSaveLoading] = useState(false);
  const [campaignSenderConfigId, setCampaignSenderConfigId] = useState('');

  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth');
    }
  }, [loading, user, navigate]);

  useEffect(() => {
    if (!user?.id) return;
    try {
      const stored = localStorage.getItem(`${STORAGE_PREFIX}.${user.id}`);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setSavedWorkflows(parsed);
        }
      }
    } catch (error) {
      console.error('Failed to load automations from storage', error);
    }
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    try {
      localStorage.setItem(`${STORAGE_PREFIX}.${user.id}`, JSON.stringify(savedWorkflows));
    } catch (error) {
      console.error('Failed to persist automations', error);
    }
  }, [savedWorkflows, user?.id]);

  const refreshCampaigns = async (userId?: string) => {
    const resolvedId = userId || user?.id;
    if (!resolvedId) return;
    setCampaignsLoading(true);
    try {
      const { data, error } = await supabase
        .from('campaigns')
        .select('id, name, subject, status, created_at, updated_at, sent_count, replied_count')
        .eq('user_id', resolvedId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setCampaigns((data || []) as CampaignSummary[]);
    } catch (error) {
      console.error('Failed to load campaigns', error);
    } finally {
      setCampaignsLoading(false);
    }
  };

  const refreshTemplates = async (userId?: string) => {
    const resolvedId = userId || user?.id;
    if (!resolvedId) return;
    setTemplatesLoading(true);
    try {
      const { data, error } = await supabase
        .from('email_templates')
        .select('id, name, subject, is_html, created_at, updated_at')
        .eq('user_id', resolvedId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setTemplates((data || []) as TemplateSummary[]);
    } catch (error) {
      console.error('Failed to load templates', error);
    } finally {
      setTemplatesLoading(false);
    }
  };

  const refreshEmailConfigs = async (userId?: string) => {
    const resolvedId = userId || user?.id;
    if (!resolvedId) return;
    setEmailConfigsLoading(true);
    try {
      const { data, error } = await supabase
        .from('email_configs')
        .select('id, smtp_username')
        .eq('user_id', resolvedId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setEmailConfigs((data || []) as EmailConfigSummary[]);
    } catch (error) {
      console.error('Failed to load email configs', error);
    } finally {
      setEmailConfigsLoading(false);
    }
  };

  useEffect(() => {
    if (!user?.id) return;
    refreshCampaigns(user.id);
    refreshTemplates(user.id);
    refreshEmailConfigs(user.id);
  }, [user?.id]);

  const workflowStats = useMemo(() => {
    const emailSteps = steps.filter((step) => step.type === 'send_email' || step.type === 'follow_up');
    const waitHours = steps.reduce((sum, step) => sum + (step.delayHours || 0), 0);
    const optimized = steps.some((step) => step.aiSuggestedTime);
    return {
      emailCount: emailSteps.length,
      waitHours,
      optimized,
    };
  }, [steps]);

  const selectedCampaign = useMemo(
    () => campaigns.find((campaign) => campaign.id === selectedCampaignId) || null,
    [campaigns, selectedCampaignId]
  );

  const replyStats = useMemo(() => {
    const total = replyAutomation.rules.length;
    const configured = replyAutomation.rules.filter(
      (rule) => !replyActionRequiresTemplate(rule.action) || !!rule.templateId
    ).length;
    return {
      total,
      configured,
      coverage: total ? Math.round((configured / total) * 100) : 0,
    };
  }, [replyAutomation]);

  const templateById = useMemo(
    () => new Map(templates.map((template) => [template.id, template])),
    [templates]
  );

  const triggerDetailLabel = useMemo(() => {
    switch (triggerConfig.type) {
      case 'list_join':
        return 'List name';
      case 'tag_added':
        return 'Tag name';
      case 'segment_entered':
        return 'Segment name';
      case 'email_opened':
        return 'Email or campaign';
      case 'link_clicked':
        return 'Link URL';
      case 'reply_received':
        return 'Campaign or inbox';
      case 'webhook':
        return 'Webhook URL';
      case 'ai_selected':
      default:
        return 'AI focus';
    }
  }, [triggerConfig.type]);

  const handleTabChange = (tab: string) => {
    if (tab === 'home') {
      navigate('/dashboard');
    } else if (tab === 'campaigns') {
      navigate('/campaigns');
    } else if (tab === 'inbox') {
      navigate('/inbox');
    } else if (tab === 'automations') {
      navigate('/automations');
    } else if (
      tab === 'contacts' ||
      tab === 'segments' ||
      tab === 'templates' ||
      tab === 'connect' ||
      tab === 'settings'
    ) {
      navigate(`/dashboard?tab=${tab}`);
    } else {
      navigate(`/${tab}`);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/auth');
  };

  const updateStep = (id: string, updates: Partial<WorkflowStep>) => {
    setSteps((prev) => prev.map((step) => (step.id === id ? { ...step, ...updates } : step)));
  };

  const handleAddStep = () => {
    setSteps((prev) => [...prev, createStep(newStepType)]);
  };

  const handleRemoveStep = (id: string) => {
    setSteps((prev) => prev.filter((step) => step.id !== id));
  };

  const handleReorder = (targetIndex: number) => {
    if (dragIndex === null || dragIndex === targetIndex) {
      setDragIndex(null);
      setDropIndex(null);
      return;
    }

    setSteps((prev) => {
      const next = [...prev];
      const [moved] = next.splice(dragIndex, 1);
      next.splice(targetIndex, 0, moved);
      return next;
    });
    setDragIndex(null);
    setDropIndex(null);
  };

  const handleSaveWorkflow = () => {
    if (!workflowName.trim()) {
      toast({
        title: 'Name required',
        description: 'Give your workflow a clear name before saving.',
        variant: 'destructive',
      });
      return;
    }

    const now = new Date().toISOString();
    const nextId = activeWorkflowId || createId('workflow');
    const existing = savedWorkflows.find((workflow) => workflow.id === nextId);
    const nextWorkflow: SavedWorkflow = {
      id: nextId,
      name: workflowName.trim(),
      status: workflowStatus,
      trigger: triggerConfig,
      steps,
      campaignId: selectedCampaignId,
      replyAutomation,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };

    setSavedWorkflows((prev) => {
      const hasExisting = prev.some((workflow) => workflow.id === nextId);
      if (hasExisting) {
        return prev.map((workflow) => (workflow.id === nextId ? nextWorkflow : workflow));
      }
      return [nextWorkflow, ...prev];
    });
    setActiveWorkflowId(nextId);

    toast({
      title: 'Workflow saved',
      description: workflowStatus === 'active' ? 'Automation is live.' : 'Workflow stored as draft.',
    });
  };

  const handleLoadWorkflow = (workflow: SavedWorkflow) => {
    setWorkflowName(workflow.name);
    setWorkflowStatus(workflow.status);
    setTriggerConfig(workflow.trigger);
    setSteps(workflow.steps);
    setSelectedCampaignId(workflow.campaignId || null);
    setReplyAutomation(normalizeReplyAutomation(workflow.replyAutomation));
    setActiveWorkflowId(workflow.id);
  };

  const handleNewWorkflow = () => {
    setWorkflowName('New automation');
    setWorkflowStatus('draft');
    setTriggerConfig({
      type: 'list_join',
      description: 'Starts when someone joins the main list.',
      detail: 'Main newsletter list',
      aiManaged: false,
    });
    setSteps([createStep('send_email'), createStep('wait'), createStep('follow_up')]);
    setSelectedCampaignId(null);
    setReplyAutomation(createDefaultReplyAutomation());
    setReplyScanSummary('');
    setActiveWorkflowId(null);
    setAiSummary('');
    setAiTimingSummary('');
    setAiRecommendations([]);
  };

  const handleDeleteWorkflow = (workflowId: string) => {
    setSavedWorkflows((prev) => prev.filter((workflow) => workflow.id !== workflowId));
    if (activeWorkflowId === workflowId) {
      handleNewWorkflow();
    }
  };

  const updateReplyAutomation = (updates: Partial<ReplyAutomationConfig>) => {
    setReplyAutomation((prev) => ({ ...prev, ...updates }));
  };

  const updateReplyRule = (id: string, updates: Partial<ReplyRule>) => {
    setReplyAutomation((prev) => ({
      ...prev,
      rules: prev.rules.map((rule) => (rule.id === id ? { ...rule, ...updates } : rule)),
    }));
  };

  const handleAddReplyRule = () => {
    setReplyAutomation((prev) => ({
      ...prev,
      rules: [...prev.rules, createReplyRule('question')],
    }));
  };

  const handleRemoveReplyRule = (id: string) => {
    setReplyAutomation((prev) => ({
      ...prev,
      rules: prev.rules.filter((rule) => rule.id !== id),
    }));
  };

  const handleApplyReplyTrigger = () => {
    if (!selectedCampaign) {
      toast({
        title: 'Select a campaign',
        description: 'Choose the campaign this reply automation should follow.',
        variant: 'destructive',
      });
      return;
    }

    setTriggerConfig({
      type: 'reply_received',
      description: `Starts when a recipient replies to ${selectedCampaign.name || 'the selected campaign'}.`,
      detail: selectedCampaign.name || '',
      aiManaged: false,
    });

    toast({
      title: 'Trigger updated',
      description: 'Automation now starts when replies arrive.',
    });
  };

  const handleRunReplyScan = async () => {
    if (!replyAutomation.mailboxConfigId) {
      toast({
        title: 'Select a mailbox',
        description: 'Pick an email account to scan for replies.',
        variant: 'destructive',
      });
      return;
    }

    setReplyScanLoading(true);
    setReplyScanSummary('');

    try {
      const { data, error } = await supabase.functions.invoke('check-email-replies', {
        body: {
          config_id: replyAutomation.mailboxConfigId,
          lookback_days: 7,
          use_db_scan: true,
        },
      });

      if (error) throw error;

      const result = data?.results?.[0]?.result;
      const summary = result
        ? `Processed ${result.processed || 0} messages, replies ${result.replies || 0}, bounces ${result.bounces || 0}.`
        : 'Scan completed successfully.';

      setReplyScanSummary(summary);
      toast({
        title: 'Reply scan complete',
        description: summary,
      });
    } catch (error: any) {
      toast({
        title: 'Reply scan failed',
        description: error?.message || 'Unable to scan replies.',
        variant: 'destructive',
      });
    } finally {
      setReplyScanLoading(false);
    }
  };

  const handleGenerateCampaignDraft = async () => {
    if (!aiCampaignPrompt.trim()) {
      toast({
        title: 'Describe your campaign',
        description: 'Add a short prompt so AI can draft the campaign.',
        variant: 'destructive',
      });
      return;
    }

    setAiCampaignLoading(true);
    setAiCampaignDraft(null);

    try {
      const response = await callSonar([
        {
          role: 'system',
          content:
            'You create outbound email campaigns. Return only JSON with keys name, subject, body, summary, sendDelayMinutes, followups. Followups should be an array of { delayDays, delayHours, subject, body }.',
        },
        {
          role: 'user',
          content: `Create a campaign based on: ${aiCampaignPrompt}. Keep tone professional and clear.`,
        },
      ]);
      const content = getSonarContent(response);
      const parsed = extractJsonFromText(content);

      if (!parsed) {
        throw new Error('AI did not return valid JSON.');
      }

      const followups = Array.isArray(parsed.followups)
        ? parsed.followups.map((step: any) => ({
            delayDays: typeof step.delayDays === 'number' ? step.delayDays : undefined,
            delayHours: typeof step.delayHours === 'number' ? step.delayHours : undefined,
            subject: step.subject,
            body: step.body,
          }))
        : [];

      setAiCampaignDraft({
        name: parsed?.name || 'AI campaign draft',
        subject: parsed?.subject || '',
        body: parsed?.body || parsed?.content || '',
        summary: parsed?.summary || 'AI drafted a campaign for you.',
        sendDelayMinutes: typeof parsed?.sendDelayMinutes === 'number' ? parsed.sendDelayMinutes : 3,
        followups,
      });

      toast({
        title: 'Campaign drafted',
        description: 'Review the draft and create it when ready.',
      });
    } catch (error: any) {
      toast({
        title: 'Campaign draft failed',
        description: error?.message || 'Unable to generate a campaign draft.',
        variant: 'destructive',
      });
    } finally {
      setAiCampaignLoading(false);
    }
  };

  const handleCreateDraftCampaign = async () => {
    if (!aiCampaignDraft) {
      toast({
        title: 'No campaign draft',
        description: 'Generate a campaign draft first.',
        variant: 'destructive',
      });
      return;
    }

    if (!campaignSenderConfigId) {
      toast({
        title: 'Select a sender',
        description: 'Choose an email account to use for the campaign.',
        variant: 'destructive',
      });
      return;
    }

    if (!user?.id) return;

    setCampaignCreateLoading(true);

    try {
      const { data: campaign, error } = await supabase
        .from('campaigns')
        .insert({
          user_id: user.id,
          name: aiCampaignDraft.name,
          subject: aiCampaignDraft.subject,
          body: aiCampaignDraft.body,
          status: 'draft',
          send_delay_minutes: aiCampaignDraft.sendDelayMinutes ?? 3,
          email_config_id: campaignSenderConfigId,
        })
        .select()
        .single();

      if (error) throw error;

      if (aiCampaignDraft.followups && aiCampaignDraft.followups.length > 0) {
        const followupInserts = aiCampaignDraft.followups.map((step, index) => ({
          campaign_id: campaign.id,
          step_number: index + 1,
          delay_days: step.delayDays ?? 0,
          delay_hours: step.delayHours ?? 0,
          subject: step.subject || null,
          body: step.body || '',
        }));

        await supabase.from('campaign_followups').insert(followupInserts);
      }

      await refreshCampaigns();
      setSelectedCampaignId(campaign.id);

      toast({
        title: 'Campaign created',
        description: 'Draft campaign added to your campaigns list.',
      });
    } catch (error: any) {
      toast({
        title: 'Campaign creation failed',
        description: error?.message || 'Unable to create campaign.',
        variant: 'destructive',
      });
    } finally {
      setCampaignCreateLoading(false);
    }
  };

  const handleGenerateTemplateDraft = async () => {
    if (!aiTemplatePrompt.trim()) {
      toast({
        title: 'Describe the template',
        description: 'Add a short prompt so AI can draft a reply template.',
        variant: 'destructive',
      });
      return;
    }

    setAiTemplateLoading(true);
    setAiTemplateDraft(null);

    try {
      const response = await callSonar([
        {
          role: 'system',
          content:
            'You create reply email templates. Return only JSON with keys name, subject, content, isHtml, summary.',
        },
        {
          role: 'user',
          content: `Create a reply template for: ${aiTemplatePrompt}. Keep it concise and helpful.`,
        },
      ]);
      const content = getSonarContent(response);
      const parsed = extractJsonFromText(content);

      if (!parsed) {
        throw new Error('AI did not return valid JSON.');
      }

      setAiTemplateDraft({
        name: parsed?.name || 'AI reply template',
        subject: parsed?.subject || '',
        content: parsed?.content || parsed?.body || '',
        isHtml: Boolean(parsed?.isHtml ?? parsed?.is_html),
        summary: parsed?.summary || 'AI drafted a reply template.',
      });

      toast({
        title: 'Template drafted',
        description: 'Review and save the template when ready.',
      });
    } catch (error: any) {
      toast({
        title: 'Template draft failed',
        description: error?.message || 'Unable to generate template.',
        variant: 'destructive',
      });
    } finally {
      setAiTemplateLoading(false);
    }
  };

  const handleSaveTemplateDraft = async () => {
    if (!aiTemplateDraft) {
      toast({
        title: 'No template draft',
        description: 'Generate a template draft first.',
        variant: 'destructive',
      });
      return;
    }

    if (!aiTemplateDraft.name || !aiTemplateDraft.subject || !aiTemplateDraft.content) {
      toast({
        title: 'Complete the template',
        description: 'Add a name, subject, and content before saving.',
        variant: 'destructive',
      });
      return;
    }

    if (!user?.id) return;

    setTemplateSaveLoading(true);

    try {
      const { error } = await supabase.from('email_templates').insert({
        user_id: user.id,
        name: aiTemplateDraft.name,
        subject: aiTemplateDraft.subject,
        content: aiTemplateDraft.content,
        is_html: aiTemplateDraft.isHtml,
      });

      if (error) throw error;

      await refreshTemplates();

      toast({
        title: 'Template saved',
        description: 'Your reply template is ready to use.',
      });
    } catch (error: any) {
      toast({
        title: 'Template save failed',
        description: error?.message || 'Unable to save template.',
        variant: 'destructive',
      });
    } finally {
      setTemplateSaveLoading(false);
    }
  };

  const handleGenerateWorkflow = async () => {
    if (!aiPrompt.trim()) {
      toast({
        title: 'Describe your automation',
        description: 'Add a short prompt so AI can build the workflow.',
        variant: 'destructive',
      });
      return;
    }

    setAiWorkflowLoading(true);
    setAiSummary('');

    try {
      const response = await callSonar([
        {
          role: 'system',
          content:
            'You build email marketing automations. Return only JSON with keys name, summary, trigger, steps. Trigger keys: type, description, detail. Steps keys: type, name, description, delayHours, template, condition, tag, webhookUrl, sendWindow.',
        },
        {
          role: 'user',
          content: `Create an automation for: ${aiPrompt}. Use 3 to 6 steps with wait steps between emails.`,
        },
      ]);
      const content = getSonarContent(response);
      const parsed = extractJsonFromText(content);

      if (!parsed) {
        throw new Error('AI did not return valid JSON.');
      }

      const nextTrigger: TriggerConfig = {
        type: mapTriggerType(parsed?.trigger?.type),
        description: parsed?.trigger?.description || 'AI selected trigger.',
        detail: parsed?.trigger?.detail || parsed?.trigger?.list || parsed?.trigger?.segment || '',
        aiManaged: true,
      };

      const nextSteps = Array.isArray(parsed?.steps)
        ? parsed.steps.map((step: any) => {
            const stepType = mapStepType(step?.type);
            return {
              id: createId('step'),
              type: stepType,
              name: step?.name || stepCatalog[stepType].label,
              description: step?.description || stepCatalog[stepType].description,
              delayHours: typeof step?.delayHours === 'number' ? step.delayHours : undefined,
              template: step?.template,
              condition: step?.condition,
              tag: step?.tag,
              webhookUrl: step?.webhookUrl,
              aiSuggestedTime: step?.sendWindow,
            } as WorkflowStep;
          })
        : steps;

      setWorkflowName(parsed?.name || workflowName);
      setTriggerConfig(nextTrigger);
      setSteps(nextSteps);
      setAiSummary(parsed?.summary || 'AI generated a workflow based on your prompt.');

      toast({
        title: 'Workflow generated',
        description: 'Review the steps and save when ready.',
      });
    } catch (error: any) {
      toast({
        title: 'AI generation failed',
        description: error?.message || 'Unable to generate workflow.',
        variant: 'destructive',
      });
    } finally {
      setAiWorkflowLoading(false);
    }
  };

  const handleGenerateTrigger = async () => {
    if (!aiPrompt.trim()) {
      toast({
        title: 'Describe your automation',
        description: 'Add a short prompt so AI can suggest a trigger.',
        variant: 'destructive',
      });
      return;
    }

    setAiTriggerLoading(true);

    try {
      const response = await callSonar([
        {
          role: 'system',
          content:
            'You recommend automation triggers. Return only JSON with trigger: { type, description, detail }. Allowed types: list_join, tag_added, segment_entered, email_opened, link_clicked, webhook, ai_selected.',
        },
        {
          role: 'user',
          content: `Suggest the best trigger for: ${aiPrompt}`,
        },
      ]);
      const content = getSonarContent(response);
      const parsed = extractJsonFromText(content);

      if (!parsed?.trigger) {
        throw new Error('AI did not return a trigger.');
      }

      setTriggerConfig({
        type: mapTriggerType(parsed.trigger.type),
        description: parsed.trigger.description || 'AI selected trigger.',
        detail: parsed.trigger.detail || '',
        aiManaged: true,
      });

      toast({
        title: 'Trigger updated',
        description: 'AI suggested a new trigger for your workflow.',
      });
    } catch (error: any) {
      toast({
        title: 'Trigger generation failed',
        description: error?.message || 'Unable to generate a trigger.',
        variant: 'destructive',
      });
    } finally {
      setAiTriggerLoading(false);
    }
  };

  const applyTimingRecommendations = (recommendations: AiRecommendation[]) => {
    setSteps((prev) =>
      prev.map((step, index) => {
        const recommendation = recommendations.find((rec) => rec.stepIndex === index);
        if (!recommendation) return step;
        const updates: Partial<WorkflowStep> = {
          aiSuggestedTime: recommendation.sendWindow || step.aiSuggestedTime,
        };
        if (step.type === 'wait' && typeof recommendation.delayHours === 'number') {
          updates.delayHours = recommendation.delayHours;
        }
        return { ...step, ...updates };
      })
    );
  };

  const handleAnalyzeTiming = async () => {
    setAiTimingLoading(true);
    setAiTimingSummary('');
    setAiRecommendations([]);

    try {
      const stepSummary = steps.map((step, index) => ({
        stepIndex: index,
        type: step.type,
        name: step.name,
        delayHours: step.delayHours || 0,
      }));

      const response = await callSonar([
        {
          role: 'system',
          content:
            'You are an engagement analyst. Return only JSON with summary and recommendations. Each recommendation should include stepIndex, sendWindow, delayHours, and note.',
        },
        {
          role: 'user',
          content: `Workflow steps: ${JSON.stringify(stepSummary)}. Audience timezone: ${audienceTimezone}. Engagement notes: ${engagementNotes}. Suggest best timing for email steps and waits.`,
        },
      ]);
      const content = getSonarContent(response);
      const parsed = extractJsonFromText(content);

      if (!parsed?.recommendations) {
        throw new Error('AI did not return recommendations.');
      }

      const normalized: AiRecommendation[] = parsed.recommendations
        .map((rec: any) => {
          const parsedIndex = Number(rec.stepIndex);
          return {
            stepIndex: Number.isFinite(parsedIndex) ? parsedIndex : -1,
            sendWindow: rec.sendWindow,
            delayHours: typeof rec.delayHours === 'number' ? rec.delayHours : undefined,
            note: rec.note,
          };
        })
        .filter((rec: AiRecommendation) => rec.stepIndex >= 0);

      setAiTimingSummary(parsed.summary || 'AI provided timing updates.');
      setAiRecommendations(normalized);

      if (autoApplyTiming) {
        applyTimingRecommendations(normalized);
      }

      toast({
        title: 'Timing optimized',
        description: 'AI recommendations are ready.',
      });
    } catch (error: any) {
      toast({
        title: 'Timing analysis failed',
        description: error?.message || 'Unable to analyze timing.',
        variant: 'destructive',
      });
    } finally {
      setAiTimingLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <DashboardLayout
      activeTab="automations"
      onTabChange={handleTabChange}
      user={user}
      onLogout={handleLogout}
    >
      <div className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-emerald-600">
              <Sparkles className="h-4 w-4" />
              Automation Studio
            </div>
            <h1 className="text-3xl font-bold text-[var(--shell-ink)]">Automation Flow for Email Marketing</h1>
            <p className="text-sm text-[var(--shell-muted)] mt-1">
              Build automated workflows, then let AI refine triggers and timing.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={handleNewWorkflow}>
              <RefreshCw className="h-4 w-4 mr-2" />
              New workflow
            </Button>
            <Button onClick={handleSaveWorkflow}>
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Save workflow
            </Button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card className="border-[var(--shell-border)] bg-white/80">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wide text-[var(--shell-muted)]">Emails in flow</p>
                  <p className="text-2xl font-semibold">{workflowStats.emailCount}</p>
                </div>
                <div className="h-10 w-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700">
                  <Mail className="h-5 w-5" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-[var(--shell-border)] bg-white/80">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wide text-[var(--shell-muted)]">Total wait time</p>
                  <p className="text-2xl font-semibold">{formatDelay(workflowStats.waitHours)}</p>
                </div>
                <div className="h-10 w-10 rounded-full bg-amber-100 flex items-center justify-center text-amber-700">
                  <Clock className="h-5 w-5" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-[var(--shell-border)] bg-white/80">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wide text-[var(--shell-muted)]">AI optimized</p>
                  <p className="text-2xl font-semibold">{workflowStats.optimized ? 'Yes' : 'Not yet'}</p>
                </div>
                <div className="h-10 w-10 rounded-full bg-teal-100 flex items-center justify-center text-teal-700">
                  <Brain className="h-5 w-5" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-[var(--shell-border)] bg-white/80">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wide text-[var(--shell-muted)]">Reply rules</p>
                  <p className="text-2xl font-semibold">{replyStats.total}</p>
                </div>
                <div className="h-10 w-10 rounded-full bg-sky-100 flex items-center justify-center text-sky-700">
                  <MessageSquare className="h-5 w-5" />
                </div>
              </div>
              {replyStats.total > 0 && (
                <p className="mt-2 text-xs text-[var(--shell-muted)]">
                  {replyStats.configured}/{replyStats.total} templates mapped
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-6">
            <Card className="border-[var(--shell-border)] bg-white/90">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Mail className="h-4 w-4 text-emerald-600" />
                  Campaign attachment
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Linked campaign</Label>
                    <Select
                      value={selectedCampaignId || ''}
                      onValueChange={(value) => setSelectedCampaignId(value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select a campaign" />
                      </SelectTrigger>
                      <SelectContent>
                        {campaignsLoading ? (
                          <SelectItem value="loading" disabled>
                            Loading campaigns...
                          </SelectItem>
                        ) : campaigns.length === 0 ? (
                          <SelectItem value="none" disabled>
                            No campaigns available
                          </SelectItem>
                        ) : (
                          campaigns.map((campaign) => (
                            <SelectItem key={campaign.id} value={campaign.id}>
                              {campaign.name || 'Untitled campaign'}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Reply trigger</Label>
                    <div className="flex flex-wrap items-center gap-2">
                      <Input
                        value={
                          selectedCampaign
                            ? `Replies for ${selectedCampaign.name || 'campaign'}`
                            : ''
                        }
                        placeholder="Select a campaign to set replies"
                        disabled
                      />
                      <Button variant="outline" size="sm" onClick={handleApplyReplyTrigger} disabled={!selectedCampaign}>
                        Use reply trigger
                      </Button>
                    </div>
                  </div>
                </div>

                {selectedCampaign ? (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-[var(--shell-ink)]">
                          {selectedCampaign.name || 'Untitled campaign'}
                        </p>
                        <p className="text-xs text-[var(--shell-muted)]">
                          {selectedCampaign.subject || 'No subject set'}
                        </p>
                      </div>
                      <Badge variant="secondary" className="bg-slate-100 text-slate-700">
                        {selectedCampaign.status || 'draft'}
                      </Badge>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-[var(--shell-muted)]">
                      <span>Sent {selectedCampaign.sent_count ?? 0}</span>
                      <span>Replies {selectedCampaign.replied_count ?? 0}</span>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-xs text-slate-500">
                    Select a campaign to link this automation and track replies.
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-[var(--shell-muted)]">
                  <span>Automation runs only for the linked campaign.</span>
                  <Button variant="outline" size="sm" onClick={() => navigate('/campaigns')}>
                    Open campaigns
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="border-[var(--shell-border)] bg-white/90">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-emerald-600" />
                  Reply automation
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-[var(--shell-ink)]">Auto-handle replies</p>
                    <p className="text-xs text-[var(--shell-muted)]">
                      Route replies to templates and pause sequences automatically.
                    </p>
                  </div>
                  <Switch
                    checked={replyAutomation.enabled}
                    onCheckedChange={(checked) => updateReplyAutomation({ enabled: checked })}
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <div className="flex items-center justify-between rounded-xl border border-[var(--shell-border)] bg-white/80 px-4 py-3">
                    <div>
                      <p className="text-xs text-[var(--shell-muted)]">Pause on reply</p>
                      <p className="text-sm font-semibold text-[var(--shell-ink)]">
                        {replyAutomation.pauseOnReply ? 'On' : 'Off'}
                      </p>
                    </div>
                    <Switch
                      checked={replyAutomation.pauseOnReply}
                      onCheckedChange={(checked) => updateReplyAutomation({ pauseOnReply: checked })}
                      disabled={!replyAutomation.enabled}
                    />
                  </div>
                  <div className="flex items-center justify-between rounded-xl border border-[var(--shell-border)] bg-white/80 px-4 py-3">
                    <div>
                      <p className="text-xs text-[var(--shell-muted)]">Notify team</p>
                      <p className="text-sm font-semibold text-[var(--shell-ink)]">
                        {replyAutomation.notifyOnReply ? 'On' : 'Off'}
                      </p>
                    </div>
                    <Switch
                      checked={replyAutomation.notifyOnReply}
                      onCheckedChange={(checked) => updateReplyAutomation({ notifyOnReply: checked })}
                      disabled={!replyAutomation.enabled}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Reply window (hours)</Label>
                    <Input
                      type="number"
                      min="1"
                      value={replyAutomation.replyWindowHours}
                      onChange={(event) =>
                        updateReplyAutomation({ replyWindowHours: Number(event.target.value) })
                      }
                      disabled={!replyAutomation.enabled}
                    />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Mailbox for reply scan</Label>
                    <Select
                      value={replyAutomation.mailboxConfigId || ''}
                      onValueChange={(value) => updateReplyAutomation({ mailboxConfigId: value })}
                      disabled={!replyAutomation.enabled}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={emailConfigsLoading ? 'Loading mailboxes' : 'Select mailbox'} />
                      </SelectTrigger>
                      <SelectContent>
                        {emailConfigsLoading ? (
                          <SelectItem value="loading" disabled>
                            Loading accounts...
                          </SelectItem>
                        ) : emailConfigs.length === 0 ? (
                          <SelectItem value="none" disabled>
                            No email accounts connected
                          </SelectItem>
                        ) : (
                          emailConfigs.map((config) => (
                            <SelectItem key={config.id} value={config.id}>
                              {config.smtp_username || 'Mailbox'}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Fallback reply template</Label>
                    <Select
                      value={replyAutomation.fallbackTemplateId || ''}
                      onValueChange={(value) => updateReplyAutomation({ fallbackTemplateId: value })}
                      disabled={!replyAutomation.enabled}
                    >
                      <SelectTrigger>
                        <SelectValue
                          placeholder={templatesLoading ? 'Loading templates' : 'Select template'}
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {templatesLoading ? (
                          <SelectItem value="loading" disabled>
                            Loading templates...
                          </SelectItem>
                        ) : templates.length === 0 ? (
                          <SelectItem value="none" disabled>
                            No templates yet
                          </SelectItem>
                        ) : (
                          templates.map((template) => (
                            <SelectItem key={template.id} value={template.id}>
                              {template.name || template.subject || 'Template'}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-[var(--shell-muted)]">
                  <span>Templates can use variables like {'{first_name}'} and {'{company}'}. </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRunReplyScan}
                    disabled={!replyAutomation.enabled || replyScanLoading}
                  >
                    {replyScanLoading ? 'Scanning...' : 'Scan replies'}
                  </Button>
                </div>

                {replyScanSummary && (
                  <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-3 text-xs text-emerald-700">
                    {replyScanSummary}
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-[var(--shell-ink)]">Reply rules</p>
                    <p className="text-xs text-[var(--shell-muted)]">
                      Match replies to templates and actions.
                    </p>
                  </div>
                  <Button variant="outline" size="sm" onClick={handleAddReplyRule} disabled={!replyAutomation.enabled}>
                    Add rule
                  </Button>
                </div>

                <div className="space-y-3">
                  {replyAutomation.rules.map((rule) => {
                    const requiresTemplate = replyActionRequiresTemplate(rule.action);
                    const selectedTemplate = rule.templateId ? templateById.get(rule.templateId) : null;

                    return (
                      <div key={rule.id} className="rounded-xl border border-[var(--shell-border)] bg-white/90 p-4 space-y-3">
                        <div className="flex items-center justify-between gap-3">
                          <Badge variant="secondary" className="bg-slate-100 text-slate-700">
                            {replyIntentOptions.find((option) => option.value === rule.intent)?.label ||
                              'Reply'}
                          </Badge>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-slate-400 hover:text-red-500"
                            onClick={() => handleRemoveReplyRule(rule.id)}
                            disabled={!replyAutomation.enabled}
                          >
                            Remove
                          </Button>
                        </div>

                        <div className="grid gap-3 md:grid-cols-2">
                          <div className="space-y-2">
                            <Label>Intent</Label>
                            <Select
                              value={rule.intent}
                              onValueChange={(value) => updateReplyRule(rule.id, { intent: value as ReplyIntent })}
                              disabled={!replyAutomation.enabled}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select intent" />
                              </SelectTrigger>
                              <SelectContent>
                                {replyIntentOptions.map((option) => (
                                  <SelectItem key={option.value} value={option.value}>
                                    {option.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label>Action</Label>
                            <Select
                              value={rule.action}
                              onValueChange={(value) => updateReplyRule(rule.id, { action: value as ReplyAction })}
                              disabled={!replyAutomation.enabled}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select action" />
                              </SelectTrigger>
                              <SelectContent>
                                {replyActionOptions.map((option) => (
                                  <SelectItem key={option.value} value={option.value}>
                                    {option.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        <div className="grid gap-3 md:grid-cols-2">
                          <div className="space-y-2">
                            <Label>Keywords</Label>
                            <Input
                              value={rule.keywords}
                              onChange={(event) => updateReplyRule(rule.id, { keywords: event.target.value })}
                              placeholder="pricing, budget, timeline"
                              disabled={!replyAutomation.enabled}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Reply template</Label>
                            <Select
                              value={rule.templateId || ''}
                              onValueChange={(value) => updateReplyRule(rule.id, { templateId: value })}
                              disabled={!replyAutomation.enabled || !requiresTemplate}
                            >
                              <SelectTrigger>
                                <SelectValue
                                  placeholder={
                                    requiresTemplate
                                      ? templatesLoading
                                        ? 'Loading templates'
                                        : 'Select template'
                                      : 'No template needed'
                                  }
                                />
                              </SelectTrigger>
                              <SelectContent>
                                {templatesLoading ? (
                                  <SelectItem value="loading" disabled>
                                    Loading templates...
                                  </SelectItem>
                                ) : templates.length === 0 ? (
                                  <SelectItem value="none" disabled>
                                    No templates yet
                                  </SelectItem>
                                ) : (
                                  templates.map((template) => (
                                    <SelectItem key={template.id} value={template.id}>
                                      {template.name || template.subject || 'Template'}
                                    </SelectItem>
                                  ))
                                )}
                              </SelectContent>
                            </Select>
                            {selectedTemplate && (
                              <p className="text-xs text-[var(--shell-muted)]">
                                Subject: {selectedTemplate.subject || 'No subject'}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            <Card className="border-[var(--shell-border)] bg-white/90">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Workflow basics</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="workflow-name">Workflow name</Label>
                    <Input
                      id="workflow-name"
                      value={workflowName}
                      onChange={(event) => setWorkflowName(event.target.value)}
                      placeholder="Onboarding welcome series"
                    />
                  </div>
                  <div className="flex items-end justify-between gap-3 rounded-xl border border-[var(--shell-border)] bg-emerald-50/60 px-4 py-3">
                    <div>
                      <p className="text-xs text-emerald-700 uppercase tracking-wide">Status</p>
                      <p className="font-semibold text-emerald-900">
                        {workflowStatus === 'active' ? 'Active' : 'Draft'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {workflowStatus === 'active' ? (
                        <Play className="h-4 w-4 text-emerald-600" />
                      ) : (
                        <Pause className="h-4 w-4 text-emerald-600" />
                      )}
                      <Switch
                        checked={workflowStatus === 'active'}
                        onCheckedChange={(checked) => setWorkflowStatus(checked ? 'active' : 'draft')}
                      />
                    </div>
                  </div>
                </div>

                <Separator />

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-[var(--shell-ink)]">Trigger event</p>
                      <p className="text-xs text-[var(--shell-muted)]">
                        Select what starts the automation.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-[var(--shell-muted)]">AI managed</span>
                      <Switch
                        checked={triggerConfig.aiManaged}
                        onCheckedChange={(checked) =>
                          setTriggerConfig((prev) => ({ ...prev, aiManaged: checked }))
                        }
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Trigger type</Label>
                      <Select
                        value={triggerConfig.type}
                        onValueChange={(value) => {
                          const selected = triggerOptions.find((option) => option.value === value);
                          setTriggerConfig((prev) => ({
                            ...prev,
                            type: value as TriggerType,
                            description: selected?.description || prev.description,
                          }));
                        }}
                        disabled={triggerConfig.aiManaged}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select trigger" />
                        </SelectTrigger>
                        <SelectContent>
                          {triggerOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>{triggerDetailLabel}</Label>
                      <Input
                        value={triggerConfig.detail}
                        onChange={(event) =>
                          setTriggerConfig((prev) => ({ ...prev, detail: event.target.value }))
                        }
                        placeholder="Main list"
                        disabled={triggerConfig.aiManaged}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Description</Label>
                    <Textarea
                      value={triggerConfig.description}
                      onChange={(event) =>
                        setTriggerConfig((prev) => ({ ...prev, description: event.target.value }))
                      }
                      placeholder="Explain the trigger conditions"
                      rows={2}
                      disabled={triggerConfig.aiManaged}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-[var(--shell-border)] bg-white/90">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Visual workflow editor</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="rounded-2xl border border-dashed border-emerald-200 bg-emerald-50/60 p-4">
                  <p className="text-xs text-emerald-700 font-semibold uppercase tracking-wide">Canvas</p>
                  <p className="text-sm text-emerald-900 mt-1">
                    Drag steps to reorder. AI suggestions appear on each step.
                  </p>
                </div>

                <div className="space-y-4">
                  {steps.map((step, index) => {
                    const stepMeta = stepCatalog[step.type];
                    const StepIcon = stepMeta.icon;
                    const isDragging = dragIndex === index;
                    const isDropTarget = dropIndex === index;

                    return (
                      <div key={step.id} className="space-y-4">
                        <div
                          className={cn(
                            "rounded-2xl border bg-white/90 shadow-sm transition-all",
                            isDragging && "opacity-60",
                            isDropTarget && "ring-2 ring-emerald-400"
                          )}
                          draggable
                          onDragStart={() => setDragIndex(index)}
                          onDragOver={(event) => {
                            event.preventDefault();
                            setDropIndex(index);
                          }}
                          onDragEnd={() => {
                            setDragIndex(null);
                            setDropIndex(null);
                          }}
                          onDrop={() => handleReorder(index)}
                        >
                          <div className="flex items-start gap-4 p-4">
                            <div className="flex flex-col items-center gap-2">
                              <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center", stepMeta.accent)}>
                                <StepIcon className="h-5 w-5" />
                              </div>
                              <GripVertical className="h-4 w-4 text-slate-300" />
                            </div>

                            <div className="flex-1 space-y-3">
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge variant="secondary" className="bg-slate-100 text-slate-700">
                                  Step {index + 1}: {stepMeta.label}
                                </Badge>
                                {step.aiSuggestedTime && (
                                  <Badge className="bg-emerald-100 text-emerald-700">
                                    AI time: {step.aiSuggestedTime}
                                  </Badge>
                                )}
                              </div>

                              <div className="grid gap-3 md:grid-cols-2">
                                <div className="space-y-2">
                                  <Label>Step name</Label>
                                  <Input
                                    value={step.name}
                                    onChange={(event) => updateStep(step.id, { name: event.target.value })}
                                  />
                                </div>
                                {step.type !== 'wait' && step.type !== 'condition' && (
                                  <div className="space-y-2">
                                    <Label>Template or destination</Label>
                                    <Input
                                      value={step.template || step.tag || step.webhookUrl || ''}
                                      onChange={(event) => {
                                        const value = event.target.value;
                                        if (step.type === 'tag') {
                                          updateStep(step.id, { tag: value });
                                        } else if (step.type === 'webhook') {
                                          updateStep(step.id, { webhookUrl: value });
                                        } else {
                                          updateStep(step.id, { template: value });
                                        }
                                      }}
                                      placeholder={step.type === 'tag' ? 'Tag name' : step.type === 'webhook' ? 'Webhook URL' : 'Email template'}
                                    />
                                  </div>
                                )}
                                {step.type === 'wait' && (
                                  <div className="space-y-2">
                                    <Label>Wait (hours)</Label>
                                    <Input
                                      type="number"
                                      min="0"
                                      value={step.delayHours ?? 0}
                                      onChange={(event) =>
                                        updateStep(step.id, { delayHours: Number(event.target.value) })
                                      }
                                    />
                                  </div>
                                )}
                              </div>

                              <div className="space-y-2">
                                <Label>Notes</Label>
                                <Textarea
                                  value={step.description}
                                  onChange={(event) => updateStep(step.id, { description: event.target.value })}
                                  rows={2}
                                />
                              </div>

                              {step.type === 'condition' && (
                                <div className="space-y-2">
                                  <Label>Condition logic</Label>
                                  <Input
                                    value={step.condition || ''}
                                    onChange={(event) => updateStep(step.id, { condition: event.target.value })}
                                    placeholder="If the contact opened the welcome email"
                                  />
                                </div>
                              )}
                            </div>

                            <div className="flex flex-col items-center gap-2">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-slate-400 hover:text-red-500"
                                onClick={() => handleRemoveStep(step.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        </div>

                        {index < steps.length - 1 && (
                          <div className="flex items-center gap-3 pl-6 text-xs text-emerald-600">
                            <div className="h-8 border-l-2 border-dashed border-emerald-200"></div>
                            <span>Then</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--shell-border)] bg-white/70 p-4">
                  <div className="flex-1 min-w-[180px] space-y-2">
                    <Label>Add step</Label>
                    <Select value={newStepType} onValueChange={(value) => setNewStepType(value as StepType)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select step type" />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(stepCatalog).map(([key, meta]) => (
                          <SelectItem key={key} value={key}>
                            {meta.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button onClick={handleAddStep} className="mt-6">
                    <Plus className="h-4 w-4 mr-2" />
                    Add step
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="border-[var(--shell-border)] bg-white/90">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Saved workflows</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {savedWorkflows.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">
                    Save your first automation to build a library.
                  </div>
                ) : (
                  savedWorkflows.map((workflow) => (
                    <div
                      key={workflow.id}
                      className={cn(
                        "rounded-xl border p-4 transition-all",
                        workflow.id === activeWorkflowId
                          ? "border-emerald-200 bg-emerald-50/60"
                          : "border-[var(--shell-border)] bg-white"
                      )}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="font-semibold text-[var(--shell-ink)]">{workflow.name}</p>
                          <p className="text-xs text-[var(--shell-muted)]">{workflow.trigger.description}</p>
                        </div>
                        <Badge variant="secondary" className={workflow.status === 'active' ? 'bg-emerald-100 text-emerald-700' : ''}>
                          {workflow.status}
                        </Badge>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-[var(--shell-muted)]">
                        <span>Updated {new Date(workflow.updatedAt).toLocaleString()}</span>
                        <span>•</span>
                        <span>{workflow.steps.length} steps</span>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => handleLoadWorkflow(workflow)}>
                          Open
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleDeleteWorkflow(workflow.id)}>
                          Delete
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card className="border-[var(--shell-border)] bg-white/90">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Wand2 className="h-4 w-4 text-emerald-600" />
                  AI campaign builder
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Describe the campaign</Label>
                  <Textarea
                    value={aiCampaignPrompt}
                    onChange={(event) => setAiCampaignPrompt(event.target.value)}
                    placeholder="Example: Launch a SaaS onboarding campaign for new trial users with a friendly tone and a short follow-up."
                    rows={3}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Sender account</Label>
                  <Select value={campaignSenderConfigId} onValueChange={setCampaignSenderConfigId}>
                    <SelectTrigger>
                      <SelectValue
                        placeholder={emailConfigsLoading ? 'Loading accounts' : 'Select sender'}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {emailConfigsLoading ? (
                        <SelectItem value="loading" disabled>
                          Loading accounts...
                        </SelectItem>
                      ) : emailConfigs.length === 0 ? (
                        <SelectItem value="none" disabled>
                          No email accounts connected
                        </SelectItem>
                      ) : (
                        emailConfigs.map((config) => (
                          <SelectItem key={config.id} value={config.id}>
                            {config.smtp_username || 'Sender account'}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={handleGenerateCampaignDraft} disabled={aiCampaignLoading}>
                    {aiCampaignLoading ? 'Drafting...' : 'Generate campaign'}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleCreateDraftCampaign}
                    disabled={!aiCampaignDraft || campaignCreateLoading}
                  >
                    {campaignCreateLoading ? 'Creating...' : 'Create draft campaign'}
                  </Button>
                </div>
                {aiCampaignDraft && (
                  <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-4 space-y-3">
                    <div className="space-y-2">
                      <Label>Campaign name</Label>
                      <Input
                        value={aiCampaignDraft.name}
                        onChange={(event) =>
                          setAiCampaignDraft((prev) =>
                            prev ? { ...prev, name: event.target.value } : prev
                          )
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Subject line</Label>
                      <Input
                        value={aiCampaignDraft.subject}
                        onChange={(event) =>
                          setAiCampaignDraft((prev) =>
                            prev ? { ...prev, subject: event.target.value } : prev
                          )
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Body</Label>
                      <Textarea
                        value={aiCampaignDraft.body}
                        onChange={(event) =>
                          setAiCampaignDraft((prev) =>
                            prev ? { ...prev, body: event.target.value } : prev
                          )
                        }
                        rows={4}
                      />
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Send delay (minutes)</Label>
                        <Input
                          type="number"
                          min="1"
                          value={aiCampaignDraft.sendDelayMinutes ?? 3}
                          onChange={(event) =>
                            setAiCampaignDraft((prev) =>
                              prev
                                ? { ...prev, sendDelayMinutes: Number(event.target.value) }
                                : prev
                            )
                          }
                        />
                      </div>
                      <div className="rounded-lg border border-emerald-100 bg-white/70 p-3 text-xs text-emerald-700">
                        Follow-ups: {aiCampaignDraft.followups?.length || 0}
                      </div>
                    </div>
                    {aiCampaignDraft.followups && aiCampaignDraft.followups.length > 0 && (
                      <div className="space-y-2 text-xs text-emerald-700">
                        {aiCampaignDraft.followups.map((step, index) => (
                          <div key={`followup-${index}`} className="rounded-lg border border-emerald-100 bg-white/70 p-2">
                            <p className="font-semibold">Follow-up {index + 1}</p>
                            <p>
                              Delay: {step.delayDays || 0}d {step.delayHours || 0}h
                            </p>
                            <p>Subject: {step.subject || 'No subject'}</p>
                          </div>
                        ))}
                      </div>
                    )}
                    {aiCampaignDraft.summary && (
                      <p className="text-xs text-emerald-700">{aiCampaignDraft.summary}</p>
                    )}
                    <p className="text-xs text-emerald-600">
                      Drafts are saved to campaigns. Add recipients in Campaigns before sending.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-[var(--shell-border)] bg-white/90">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <FileText className="h-4 w-4 text-emerald-600" />
                  AI reply template
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Describe the reply template</Label>
                  <Textarea
                    value={aiTemplatePrompt}
                    onChange={(event) => setAiTemplatePrompt(event.target.value)}
                    placeholder="Example: Reply to pricing questions with a short overview and a CTA to book a call."
                    rows={3}
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={handleGenerateTemplateDraft} disabled={aiTemplateLoading}>
                    {aiTemplateLoading ? 'Drafting...' : 'Generate template'}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleSaveTemplateDraft}
                    disabled={!aiTemplateDraft || templateSaveLoading}
                  >
                    {templateSaveLoading ? 'Saving...' : 'Save template'}
                  </Button>
                </div>
                {aiTemplateDraft && (
                  <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-4 space-y-3">
                    <div className="space-y-2">
                      <Label>Template name</Label>
                      <Input
                        value={aiTemplateDraft.name}
                        onChange={(event) =>
                          setAiTemplateDraft((prev) =>
                            prev ? { ...prev, name: event.target.value } : prev
                          )
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Subject line</Label>
                      <Input
                        value={aiTemplateDraft.subject}
                        onChange={(event) =>
                          setAiTemplateDraft((prev) =>
                            prev ? { ...prev, subject: event.target.value } : prev
                          )
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Content</Label>
                      <Textarea
                        value={aiTemplateDraft.content}
                        onChange={(event) =>
                          setAiTemplateDraft((prev) =>
                            prev ? { ...prev, content: event.target.value } : prev
                          )
                        }
                        rows={4}
                      />
                    </div>
                    <div className="flex items-center justify-between text-xs text-[var(--shell-muted)]">
                      <span>HTML template</span>
                      <Switch
                        checked={aiTemplateDraft.isHtml}
                        onCheckedChange={(checked) =>
                          setAiTemplateDraft((prev) => (prev ? { ...prev, isHtml: checked } : prev))
                        }
                      />
                    </div>
                    {aiTemplateDraft.summary && (
                      <p className="text-xs text-emerald-700">{aiTemplateDraft.summary}</p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-[var(--shell-border)] bg-white/90">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Wand2 className="h-4 w-4 text-emerald-600" />
                  AI workflow builder
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Describe the automation goal</Label>
                  <Textarea
                    value={aiPrompt}
                    onChange={(event) => setAiPrompt(event.target.value)}
                    placeholder="Example: When a new subscriber joins the trial list, send a welcome email, wait 2 days, send a follow-up with a discount if they did not click."
                    rows={4}
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={handleGenerateWorkflow} disabled={aiWorkflowLoading}>
                    {aiWorkflowLoading ? 'Generating...' : 'Generate workflow'}
                  </Button>
                  <Button variant="outline" onClick={handleGenerateTrigger} disabled={aiTriggerLoading}>
                    {aiTriggerLoading ? 'Thinking...' : 'Suggest trigger'}
                  </Button>
                </div>
                {aiSummary && (
                  <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-4 text-sm text-emerald-700">
                    {aiSummary}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-[var(--shell-border)] bg-white/90">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Brain className="h-4 w-4 text-emerald-600" />
                  AI timing recommendations
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Audience timezone</Label>
                  <Select value={audienceTimezone} onValueChange={setAudienceTimezone}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select timezone" />
                    </SelectTrigger>
                    <SelectContent>
                      {['America/New_York', 'Europe/London', 'Asia/Singapore', 'Australia/Sydney', 'UTC'].map(
                        (zone) => (
                          <SelectItem key={zone} value={zone}>
                            {zone}
                          </SelectItem>
                        )
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Engagement notes</Label>
                  <Textarea
                    value={engagementNotes}
                    onChange={(event) => setEngagementNotes(event.target.value)}
                    rows={3}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs text-[var(--shell-muted)]">
                    <span>Auto-apply updates</span>
                    <Switch checked={autoApplyTiming} onCheckedChange={setAutoApplyTiming} />
                  </div>
                  <Button onClick={handleAnalyzeTiming} disabled={aiTimingLoading}>
                    {aiTimingLoading ? 'Analyzing...' : 'Analyze timing'}
                  </Button>
                </div>
                {aiTimingSummary && (
                  <div className="rounded-xl border border-amber-100 bg-amber-50/60 p-4 text-sm text-amber-700">
                    {aiTimingSummary}
                  </div>
                )}
                <div className="space-y-2">
                  {aiRecommendations.length === 0 ? (
                    <p className="text-xs text-[var(--shell-muted)]">Run analysis to see AI timing suggestions.</p>
                  ) : (
                    aiRecommendations.map((recommendation, index) => (
                      <div key={`${recommendation.stepIndex}-${index}`} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                        <div className="flex items-center justify-between text-xs text-slate-500">
                          <span>Step {recommendation.stepIndex + 1}</span>
                          {recommendation.delayHours != null && (
                            <span>Wait: {formatDelay(recommendation.delayHours)}</span>
                          )}
                        </div>
                        <p className="text-sm font-semibold text-slate-700">{recommendation.sendWindow}</p>
                        {recommendation.note && (
                          <p className="text-xs text-slate-500 mt-1">{recommendation.note}</p>
                        )}
                      </div>
                    ))
                  )}
                </div>
                {aiRecommendations.length > 0 && !autoApplyTiming && (
                  <Button variant="outline" onClick={() => applyTimingRecommendations(aiRecommendations)}>
                    Apply recommendations
                  </Button>
                )}
              </CardContent>
            </Card>

            <Card className="border-[var(--shell-border)] bg-white/90">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Zap className="h-4 w-4 text-emerald-600" />
                  Launch checklist
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-[var(--shell-muted)]">
                <div className="flex items-center justify-between">
                  <span>Trigger configured</span>
                  <Badge variant="outline">{triggerConfig.aiManaged ? 'AI managed' : 'Manual'}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span>Steps added</span>
                  <Badge variant="outline">{steps.length}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span>AI timing applied</span>
                  <Badge variant="outline">{workflowStats.optimized ? 'Yes' : 'No'}</Badge>
                </div>
                <Button
                  variant="outline"
                  onClick={() =>
                    toast({
                      title: 'Workflow ready',
                      description: 'Test send queued for the next contact in line.',
                    })
                  }
                >
                  Send test run
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Automations;

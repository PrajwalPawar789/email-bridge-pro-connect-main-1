import { type ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  buildEmailEmbeddingText,
  generateAiBuilderDraft,
  generateAiBuilderDraftStream,
  indexAiBuilderObject,
  type AiOptimizeFor,
  type AiProvider,
} from '@/lib/aiBuilder';
import type { EmailTemplate } from '@/stores/emailBuilderStore';
import {
  Bot,
  ChevronDown,
  Loader2,
  MessageSquare,
  Paperclip,
  Plus,
  RotateCcw,
  Send,
  Settings2,
  Sparkles,
  Trash2,
  User,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { mapHtmlToEmailBuilderBlocks } from '@/lib/emailBuilderImport';
import { DEFAULT_EMAIL_BUILDER_THEME } from '@/lib/emailBuilderPersistence';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  isError?: boolean;
  createdAt: number;
};

type ThreadListItem = {
  id: string;
  title: string;
  updatedAt?: string;
  updatedLabel?: string;
};

type Props = {
  open: boolean;
  currentTemplate: EmailTemplate | null;
  threadId: string;
  onThreadIdChange: (threadId: string) => void;
  onGenerated: (payload: { threadId: string; result: Record<string, any> }) => void;
  onThreadActivity?: () => void;
  threads?: ThreadListItem[];
  isThreadsLoading?: boolean;
  deletingThreadId?: string;
  onStartNewThread?: () => void;
  onSelectThread?: (threadId: string) => void;
  onDeleteThread?: (threadId: string) => void;
};

type ProviderSelection = AiProvider | 'auto';
type ModelSelection = '__auto__' | string;

type ModelOption = {
  value: string;
  label: string;
  provider: AiProvider;
};

type InputImageAttachment = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  base64: string;
  previewUrl: string;
};

const buildTemplateForIndexing = (
  result: Record<string, any>,
  currentTemplate: EmailTemplate | null,
  fallbackId: string
) => {
  const rawHtml = String(result?.html || result?.bodyHtml || result?.contentHtml || '').trim();
  const importedFromHtml = rawHtml ? mapHtmlToEmailBuilderBlocks(rawHtml) : null;
  const explicitBlocks = Array.isArray(result?.blocks)
    ? result.blocks.map((block: any) => ({
        id: String(block?.id || crypto.randomUUID()),
        type: String(block?.type || 'text'),
        content: block?.content && typeof block.content === 'object' ? block.content : {},
        styles: block?.styles && typeof block.styles === 'object' ? block.styles : {},
      }))
    : [];
  const blocks =
    explicitBlocks.length > 0
      ? explicitBlocks
      : importedFromHtml?.blocks ||
        (rawHtml
          ? [{
              id: crypto.randomUUID(),
              type: 'text',
              content: {
                html: rawHtml,
                text: rawHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
              },
              styles: {},
            }]
          : []);

  return {
    id: currentTemplate?.id || fallbackId,
    name: String(result?.name || importedFromHtml?.name || currentTemplate?.name || 'AI Email Draft'),
    subject: String(result?.subject || importedFromHtml?.subject || currentTemplate?.subject || ''),
    preheader: String(result?.preheader || currentTemplate?.preheader || ''),
    audience: String(result?.audience || currentTemplate?.audience || 'All'),
    voice: String(result?.voice || currentTemplate?.voice || 'Professional'),
    goal: String(result?.goal || currentTemplate?.goal || 'Engagement'),
    blocks,
    rawHtml: rawHtml || currentTemplate?.rawHtml,
    theme: currentTemplate?.theme || { ...DEFAULT_EMAIL_BUILDER_THEME },
  };
};

const buildAssistantSummary = (
  result: Record<string, any>,
  fallbackText = 'Template updated.'
) => {
  const blocks = Array.isArray(result?.blocks) ? result.blocks : [];
  const heading = blocks.find((block: any) => String(block?.type || '').toLowerCase() === 'heading');
  const firstText = blocks.find((block: any) => String(block?.type || '').toLowerCase() === 'text');
  const headingText = String(heading?.content?.text || '').trim();
  const firstTextValue = String(firstText?.content?.text || '').trim();
  const rawHtml = String(result?.html || '').trim();

  const lines: string[] = [];
  const templateName = String(result?.name || '').trim();
  const subject = String(result?.subject || '').trim();
  const reasoning = String(result?.reasoning || '')
    .replace(/Post-processed to align block structure and content depth with user prompt\./gi, '')
    .trim();

  if (templateName) lines.push(`Updated template: ${templateName}`);
  if (subject) lines.push(`Subject: ${subject}`);
  if (headingText) lines.push(`Heading: ${headingText}`);
  if (firstTextValue) lines.push(firstTextValue.slice(0, 260));
  if (!firstTextValue && rawHtml) {
    const htmlText = rawHtml
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|h1|h2|h3|h4|h5|h6|li|tr)>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (htmlText) lines.push(htmlText.slice(0, 260));
  }
  if (reasoning) lines.push(reasoning);

  if (lines.length === 0) return fallbackText;
  return lines.join('\n');
};

const resolveAssistantChatText = (
  assistantMessage: unknown,
  result: Record<string, any> | null,
  fallbackText = 'Template updated.'
) => {
  const directMessage = String(assistantMessage || '').trim();
  if (directMessage) return directMessage;
  return buildAssistantSummary(result || {}, fallbackText);
};

const QUICK_PROMPTS = [
  'Create a high-converting welcome email for new SaaS users.',
  'Write a product update email with one clear CTA and concise copy.',
  'Draft a re-engagement email for inactive trial users with friendly tone.',
];

const MODEL_AUTO_VALUE = '__auto__' as const;
const MAX_IMAGE_ATTACHMENTS = 4;
const MAX_IMAGE_SIZE_BYTES = 4 * 1024 * 1024;
const IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif']);

const MODEL_OPTIONS: ModelOption[] = [
  { value: 'gpt-4o-mini', label: 'OpenAI GPT-4o Mini', provider: 'openai' },
  { value: 'gpt-4o', label: 'OpenAI GPT-4o', provider: 'openai' },
  { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5', provider: 'claude' },
  { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6', provider: 'claude' },
  { value: 'claude-opus-4-6', label: 'Claude Opus 4.6', provider: 'claude' },
];

const normalizeImageMimeType = (value: string) => {
  const normalized = value.toLowerCase().trim();
  if (normalized === 'image/jpg') return 'image/jpeg';
  return normalized;
};

const readFileAsBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const base64 = result.includes('base64,') ? result.split('base64,').pop() || '' : '';
      if (!base64) {
        reject(new Error('Unable to read image file.'));
        return;
      }
      resolve(base64);
    };
    reader.readAsDataURL(file);
  });

const formatBytes = (bytes: number) => {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const idx = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, idx);
  return `${value.toFixed(value >= 10 || idx === 0 ? 0 : 1)} ${units[idx]}`;
};

const formatRelativeTime = (isoDate?: string) => {
  if (!isoDate) return '';
  const timestamp = Date.parse(isoDate);
  if (!Number.isFinite(timestamp)) return '';
  const diffMs = Date.now() - timestamp;
  const diffMins = Math.max(0, Math.floor(diffMs / 60000));
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Date(isoDate).toLocaleDateString();
};

export function AiEmailThreadPanel({
  open,
  currentTemplate,
  threadId,
  onThreadIdChange,
  onGenerated,
  onThreadActivity,
  threads = [],
  isThreadsLoading = false,
  deletingThreadId = '',
  onStartNewThread,
  onSelectThread,
  onDeleteThread,
}: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [streamStatus, setStreamStatus] = useState('');
  const [provider, setProvider] = useState<ProviderSelection>('auto');
  const [optimizeFor, setOptimizeFor] = useState<AiOptimizeFor>('quality');
  const [model, setModel] = useState<ModelSelection>(MODEL_AUTO_VALUE);
  const [goal, setGoal] = useState('');
  const [audience, setAudience] = useState('');
  const [tone, setTone] = useState('Professional');
  const [cta, setCta] = useState('');
  const [constraints, setConstraints] = useState('');
  const [includeCurrentTemplate, setIncludeCurrentTemplate] = useState(true);
  const [imageAttachments, setImageAttachments] = useState<InputImageAttachment[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showSessions, setShowSessions] = useState(false);

  const endRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const latestThreadIdRef = useRef(threadId);
  const historyRequestIdRef = useRef(0);
  const onGeneratedRef = useRef(onGenerated);

  const canSend = useMemo(
    () => (input.trim().length > 0 || imageAttachments.length > 0) && !isSending,
    [imageAttachments.length, input, isSending]
  );

  const availableModelOptions = useMemo(() => {
    if (provider === 'auto') return MODEL_OPTIONS;
    return MODEL_OPTIONS.filter((option) => option.provider === provider);
  }, [provider]);

  const selectedModelProvider = useMemo(
    () => MODEL_OPTIONS.find((option) => option.value === model)?.provider,
    [model]
  );

  useEffect(() => {
    if (!open) return;
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, isSending, open]);

  useEffect(() => {
    latestThreadIdRef.current = threadId;
  }, [threadId]);

  useEffect(() => {
    onGeneratedRef.current = onGenerated;
  }, [onGenerated]);

  useEffect(() => {
    if (model === MODEL_AUTO_VALUE) return;
    const isAvailable = availableModelOptions.some((option) => option.value === model);
    if (!isAvailable) {
      setModel(MODEL_AUTO_VALUE);
    }
  }, [availableModelOptions, model]);

  useEffect(() => {
    const loadThreadHistory = async () => {
      if (!open) return;
      if (!threadId) {
        setMessages([]);
        return;
      }

      const requestId = historyRequestIdRef.current + 1;
      historyRequestIdRef.current = requestId;
      const targetThreadId = threadId;
      const { data, error } = await (supabase as any)
        .from('ai_builder_messages')
        .select('id, role, content, metadata, created_at')
        .eq('thread_id', threadId)
        .order('created_at', { ascending: true })
        .limit(60);

      if (error || !Array.isArray(data)) return;
      if (historyRequestIdRef.current !== requestId || latestThreadIdRef.current !== targetThreadId) return;

      let latestAssistantResult: Record<string, any> | null = null;
      const mapped = data
        .map((row: any) => {
          const role = String(row?.role || '').toLowerCase();
          if (role !== 'user' && role !== 'assistant') return null;
          const metadata = row?.metadata && typeof row.metadata === 'object' ? row.metadata : {};
          const result = metadata?.result && typeof metadata.result === 'object' ? metadata.result : null;
          if (role === 'assistant' && result) latestAssistantResult = result;
          return {
            id: String(row?.id || crypto.randomUUID()),
            role: role as 'user' | 'assistant',
            text:
              role === 'assistant'
                ? resolveAssistantChatText(
                    String(row?.content || ''),
                    result,
                    String(row?.content || 'Template updated.')
                  )
                : String(row?.content || ''),
            createdAt: row?.created_at ? Date.parse(String(row.created_at)) : Date.now(),
          } satisfies ChatMessage;
        })
        .filter(Boolean) as ChatMessage[];

      setMessages(mapped);

      if (latestAssistantResult) {
        onGeneratedRef.current({
          threadId: targetThreadId,
          result: latestAssistantResult,
        });
      }
    };

    void loadThreadHistory();
  }, [open, threadId]);

  if (!open) return null;

  const updateAssistantText = (assistantId: string, updater: (text: string) => string) => {
    setMessages((prev) =>
      prev.map((message) =>
        message.id === assistantId
          ? {
              ...message,
              text: updater(message.text || ''),
            }
          : message
      )
    );
  };

  const handleImageSelect = async (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files || []);
    event.target.value = '';
    if (selectedFiles.length === 0) return;

    const openSlots = Math.max(0, MAX_IMAGE_ATTACHMENTS - imageAttachments.length);
    if (openSlots <= 0) {
      toast({
        title: 'Attachment limit reached',
        description: `You can attach up to ${MAX_IMAGE_ATTACHMENTS} images per prompt.`,
        variant: 'destructive',
      });
      return;
    }

    const filesToProcess = selectedFiles.slice(0, openSlots);
    const skippedType: string[] = [];
    const skippedSize: string[] = [];
    const uploaded: InputImageAttachment[] = [];

    for (const file of filesToProcess) {
      const mimeType = normalizeImageMimeType(file.type);
      if (!IMAGE_MIME_TYPES.has(mimeType)) {
        skippedType.push(file.name || 'Unnamed file');
        continue;
      }
      if (file.size > MAX_IMAGE_SIZE_BYTES) {
        skippedSize.push(file.name || 'Unnamed file');
        continue;
      }

      try {
        const base64 = await readFileAsBase64(file);
        const previewUrl = `data:${mimeType};base64,${base64}`;
        uploaded.push({
          id: crypto.randomUUID(),
          name: file.name || `image-${Date.now()}`,
          mimeType,
          size: file.size,
          base64,
          previewUrl,
        });
      } catch {
        skippedType.push(file.name || 'Unnamed file');
      }
    }

    if (uploaded.length > 0) {
      setImageAttachments((prev) => [...prev, ...uploaded].slice(0, MAX_IMAGE_ATTACHMENTS));
      toast({
        title: 'Images added',
        description: `${uploaded.length} image${uploaded.length === 1 ? '' : 's'} attached.`,
      });
    }

    if (selectedFiles.length > openSlots) {
      toast({
        title: 'Some files were skipped',
        description: `Only ${MAX_IMAGE_ATTACHMENTS} images are allowed per prompt.`,
        variant: 'destructive',
      });
    }
    if (skippedType.length > 0) {
      toast({
        title: 'Unsupported file type',
        description: 'Only PNG, JPG, WEBP, and GIF images are supported.',
        variant: 'destructive',
      });
    }
    if (skippedSize.length > 0) {
      toast({
        title: 'Image too large',
        description: `Each image must be ${formatBytes(MAX_IMAGE_SIZE_BYTES)} or smaller.`,
        variant: 'destructive',
      });
    }
  };

  const handleRemoveImage = (attachmentId: string) => {
    setImageAttachments((prev) => prev.filter((attachment) => attachment.id !== attachmentId));
  };

  const submitPrompt = async ({
    instruction,
    userText,
    attachments,
  }: {
    instruction: string;
    userText: string;
    attachments: InputImageAttachment[];
  }) => {
    if (!instruction.trim() || isSending) return;

    const effectiveProvider =
      provider === 'auto'
        ? selectedModelProvider || undefined
        : provider;
    const selectedModel = model === MODEL_AUTO_VALUE ? undefined : model;
    // Keep lightweight guardrails but preserve model-crafted structure/copy.
    const postProcessMode = 'minimal' as const;

    const assistantId = crypto.randomUUID();
    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        role: 'user',
        text: userText.trim() || instruction.trim(),
        createdAt: Date.now(),
      },
      { id: assistantId, role: 'assistant', text: '', createdAt: Date.now() },
    ]);
    setIsSending(true);
    setStreamStatus('Starting generation...');

    const payload = {
      mode: 'email' as const,
      outputMode: 'blocks' as const,
      threadId: threadId || undefined,
      provider: effectiveProvider,
      optimizeFor,
      model: selectedModel,
      postProcessMode,
      topK: 6,
      instruction,
      images: attachments.map((image) => ({
        name: image.name,
        mimeType: image.mimeType,
        base64: image.base64,
      })),
      brief: {
        subject: currentTemplate?.subject || '',
        templateName: currentTemplate?.name || '',
        goal: goal || currentTemplate?.goal || '',
        audience: audience || currentTemplate?.audience || '',
        tone: tone || currentTemplate?.voice || '',
        cta,
        constraints,
      },
      current:
        includeCurrentTemplate && currentTemplate
          ? { template: currentTemplate }
          : undefined,
    };

    try {
      const response = await generateAiBuilderDraftStream(payload, {
        onStatus: (status) => {
          setStreamStatus(String(status?.message || 'Generating...'));
        },
        onDelta: (delta) => {
          updateAssistantText(assistantId, (text) => `${text}${delta.text}`);
        },
      });

      if (response.threadId) onThreadIdChange(response.threadId);
      const result = response.result || {};
      onGenerated({ threadId: response.threadId || '', result });

      const indexedTemplate = buildTemplateForIndexing(result, currentTemplate, response.threadId || crypto.randomUUID());
      void indexAiBuilderObject({
        mode: 'email',
        objectId: indexedTemplate.id,
        threadId: response.threadId || undefined,
        text: buildEmailEmbeddingText(indexedTemplate),
        metadata: {
          name: indexedTemplate.name,
          subject: indexedTemplate.subject,
          audience: indexedTemplate.audience,
          voice: indexedTemplate.voice,
          goal: indexedTemplate.goal,
          source: 'ai_chat',
          ...(response.threadId ? { thread_id: response.threadId, threadId: response.threadId } : {}),
        },
      }).catch((indexError) => {
        console.warn('AI chat indexing skipped:', indexError?.message || indexError);
      });

      updateAssistantText(
        assistantId,
        (text) => text.trim() || resolveAssistantChatText(response.assistantMessage, result)
      );
      onThreadActivity?.();
    } catch (streamError: any) {
      try {
        const fallbackResponse = await generateAiBuilderDraft(payload);
        if (fallbackResponse.threadId) onThreadIdChange(fallbackResponse.threadId);
        const result = fallbackResponse.result || {};
        onGenerated({ threadId: fallbackResponse.threadId || '', result });

        const indexedTemplate = buildTemplateForIndexing(
          result,
          currentTemplate,
          fallbackResponse.threadId || crypto.randomUUID()
        );
        void indexAiBuilderObject({
          mode: 'email',
          objectId: indexedTemplate.id,
          threadId: fallbackResponse.threadId || undefined,
          text: buildEmailEmbeddingText(indexedTemplate),
          metadata: {
            name: indexedTemplate.name,
            subject: indexedTemplate.subject,
            audience: indexedTemplate.audience,
            voice: indexedTemplate.voice,
            goal: indexedTemplate.goal,
            source: 'ai_chat',
            ...(fallbackResponse.threadId
              ? { thread_id: fallbackResponse.threadId, threadId: fallbackResponse.threadId }
              : {}),
          },
        }).catch((indexError) => {
          console.warn('AI chat indexing skipped:', indexError?.message || indexError);
        });

        updateAssistantText(
          assistantId,
          () => resolveAssistantChatText(fallbackResponse.assistantMessage, result)
        );
        onThreadActivity?.();
      } catch (fallbackError: any) {
        updateAssistantText(
          assistantId,
          () =>
            fallbackError?.message ||
            streamError?.message ||
            'Sorry, something went wrong. Please try again.'
        );
        setMessages((prev) =>
          prev.map((message) =>
            message.id === assistantId ? { ...message, isError: true } : message
          )
        );
      }
    } finally {
      setStreamStatus('');
      setIsSending(false);
    }
  };

  const handleSend = async () => {
    const instructionText = input.trim();
    const attachments = imageAttachments.slice();
    if ((instructionText.length === 0 && attachments.length === 0) || isSending) return;

    const fallbackInstruction =
      attachments.length > 0
        ? 'Use the attached images as context and generate/update this email template.'
        : '';
    const instruction = instructionText || fallbackInstruction;
    const attachmentHint =
      attachments.length > 0
        ? `\n\nAttached image${attachments.length === 1 ? '' : 's'}: ${attachments
            .map((image) => image.name)
            .join(', ')}`
        : '';
    const userText = `${instructionText || 'Use attached image context.'}${attachmentHint}`.trim();

    setInput('');
    if (attachments.length > 0) {
      setImageAttachments([]);
    }
    await submitPrompt({
      instruction,
      userText,
      attachments,
    });
  };

  const handleUndoToPreviousVersion = async () => {
    if (!threadId || isSending) return;
    await submitPrompt({
      instruction: 'go to prev version',
      userText: 'go to prev version',
      attachments: [],
    });
  };

  return (
    <div className="flex h-full min-w-0 flex-col bg-white">
      <div className="border-b border-slate-200 bg-slate-50/80 px-4 py-3">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-emerald-600" />
            <p className="text-sm font-semibold text-slate-900">AI Template Chat</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowAdvanced((value) => !value)}
            className="h-7 px-2 text-xs text-slate-600 hover:text-slate-900"
          >
            <Settings2 className="mr-1 h-3.5 w-3.5" />
            {showAdvanced ? 'Hide Options' : 'Options'}
          </Button>
        </div>

        {showAdvanced ? (
          <div className="mt-3 space-y-2 rounded-lg border border-slate-200 bg-white p-3">
            <p className="text-[11px] text-slate-500">
              Select provider, quality mode, and model from the controls above the prompt box.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-[11px] text-slate-700">Goal</Label>
                <Input value={goal} onChange={(event) => setGoal(event.target.value)} className="h-8 border-slate-200 text-xs" />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] text-slate-700">Audience</Label>
                <Input value={audience} onChange={(event) => setAudience(event.target.value)} className="h-8 border-slate-200 text-xs" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-[11px] text-slate-700">Tone</Label>
                <Input value={tone} onChange={(event) => setTone(event.target.value)} className="h-8 border-slate-200 text-xs" />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] text-slate-700">CTA</Label>
                <Input value={cta} onChange={(event) => setCta(event.target.value)} className="h-8 border-slate-200 text-xs" />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] text-slate-700">Constraints</Label>
              <Textarea
                value={constraints}
                onChange={(event) => setConstraints(event.target.value)}
                rows={2}
                className="border-slate-200 text-xs"
                placeholder="Keep copy concise, premium tone, one CTA..."
              />
            </div>
            <label className="flex items-center gap-2 text-[11px] text-slate-600">
              <input
                type="checkbox"
                className="h-3.5 w-3.5"
                checked={includeCurrentTemplate}
                onChange={(event) => setIncludeCurrentTemplate(event.target.checked)}
              />
              Use current draft as context for follow-up edits
            </label>
          </div>
        ) : null}
      </div>

      <div className="border-b border-slate-200 bg-white px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setShowSessions((value) => !value)}
            className="h-7 gap-1.5 px-2 text-[11px] font-medium uppercase tracking-[0.08em] text-slate-600 hover:text-slate-900"
            aria-expanded={showSessions}
            aria-label="Toggle session history"
          >
            <ChevronDown
              className={cn(
                'h-3.5 w-3.5 transition-transform duration-200',
                showSessions ? 'rotate-180' : ''
              )}
            />
            History
            {threads.length > 0 ? (
              <span className="rounded-full border border-slate-300 px-1.5 py-0 text-[10px] normal-case text-slate-500">
                {threads.length}
              </span>
            ) : null}
          </Button>
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-[11px] text-slate-600 hover:text-slate-900"
              onClick={() => {
                void handleUndoToPreviousVersion();
              }}
              disabled={!threadId || isSending}
              title={threadId ? 'Restore previous AI version in this thread' : 'Start a thread to enable undo'}
            >
              <RotateCcw className="mr-1 h-3.5 w-3.5" />
              Undo
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-[11px] text-slate-600 hover:text-slate-900"
              onClick={() => {
                onStartNewThread?.();
                setShowSessions(false);
              }}
              disabled={!onStartNewThread}
            >
              <Plus className="mr-1 h-3.5 w-3.5" />
              New
            </Button>
          </div>
        </div>
        {showSessions ? (
          <div className="mt-2 max-h-40 space-y-1 overflow-y-auto pr-1">
            {!threadId ? (
              <div className="flex items-center gap-2 rounded-md border border-emerald-200/80 bg-emerald-50/60 px-2 py-1.5 text-[11px] text-emerald-700">
                <MessageSquare className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate font-medium">New Template</span>
              </div>
            ) : null}
            {isThreadsLoading ? (
              <p className="px-2 py-2 text-[11px] text-slate-500">Loading sessions...</p>
            ) : threads.length === 0 ? (
              <p className="px-2 py-2 text-[11px] text-slate-500">No previous sessions.</p>
            ) : (
              threads.map((thread) => {
                const isActive = thread.id === threadId;
                const activityLabel = thread.updatedLabel || formatRelativeTime(thread.updatedAt);
                return (
                  <div
                    key={thread.id}
                    className={cn(
                      'group flex items-start gap-1 rounded-md px-1 py-0.5 transition-colors',
                      isActive ? 'bg-slate-100' : 'hover:bg-slate-50'
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        onSelectThread?.(thread.id);
                        setShowSessions(false);
                      }}
                      className="min-w-0 flex-1 rounded px-1 py-1 text-left"
                    >
                      <p
                        className={cn(
                          'truncate text-xs font-medium',
                          isActive ? 'text-slate-900' : 'text-slate-700'
                        )}
                      >
                        {thread.title || 'New Template'}
                      </p>
                      <p className="mt-0.5 text-[10px] text-slate-500">{activityLabel || 'Recently updated'}</p>
                    </button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className={cn(
                        'h-6 w-6 shrink-0 text-slate-500 opacity-0 transition-opacity hover:text-slate-900 group-hover:opacity-100',
                        deletingThreadId === thread.id ? 'opacity-100' : ''
                      )}
                      onClick={() => onDeleteThread?.(thread.id)}
                      disabled={!onDeleteThread || Boolean(deletingThreadId)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                );
              })
            )}
          </div>
        ) : null}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto bg-gradient-to-b from-slate-50 to-white px-4 py-6">
        {messages.length === 0 ? (
          <div className="py-12">
            <div className="mb-5 flex items-center justify-center">
              <div className="rounded-2xl bg-emerald-50 p-3">
                <Sparkles className="h-8 w-8 text-emerald-600" />
              </div>
            </div>
            <div className="text-center">
              <p className="font-medium text-slate-900">What email template would you like?</p>
              <p className="mt-1 text-sm text-slate-500">
                Start with one prompt, then iterate with focused follow-ups.
              </p>
            </div>
            <div className="mt-5 space-y-2">
              {QUICK_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => setInput(prompt)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-xs text-slate-600 transition-colors hover:border-emerald-200 hover:bg-emerald-50/40 hover:text-slate-900"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {messages.map((message) => (
          <div
            key={message.id}
            className={cn('mb-4 flex gap-3', message.role === 'user' ? 'flex-row-reverse' : 'flex-row')}
          >
            <div
              className={cn(
                'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                message.role === 'user' ? 'bg-slate-900 text-white' : 'bg-slate-200 text-slate-600'
              )}
            >
              {message.role === 'user' ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
            </div>
            <div
              className={cn(
                'max-h-[22rem] max-w-[84%] overflow-y-auto whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm',
                message.role === 'user'
                  ? 'rounded-tr-md bg-slate-900 text-white'
                  : message.isError
                    ? 'rounded-tl-md border border-red-200 bg-red-50 text-red-700'
                    : 'rounded-tl-md border border-slate-200 bg-slate-100 text-slate-800'
              )}
            >
              {message.text || (isSending && message.role === 'assistant' ? '...' : '')}
            </div>
          </div>
        ))}

        {isSending ? (
          <div className="mb-4 flex gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-200 text-slate-600">
              <Bot className="h-4 w-4" />
            </div>
            <div className="max-h-32 overflow-y-auto rounded-2xl rounded-tl-md border border-slate-200 bg-slate-100 px-4 py-3 text-xs text-slate-600">
              {streamStatus || 'Streaming response...'}
            </div>
          </div>
        ) : null}
        <div ref={endRef} />
      </div>

      <div className="border-t border-slate-200 bg-white p-3">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          multiple
          className="hidden"
          onChange={handleImageSelect}
        />
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-600 transition-colors hover:bg-slate-100"
          >
            <Paperclip className="h-3.5 w-3.5" />
            Add Context...
          </button>
          <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1">
            {(['auto', 'openai', 'claude'] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setProvider(value)}
                className={cn(
                  'rounded-md px-2 py-1 text-[11px] uppercase transition-colors',
                  provider === value ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-900'
                )}
              >
                {value}
              </button>
            ))}
          </div>
          <div className="min-w-[178px]">
            <Select value={model} onValueChange={(value) => setModel(value)}>
              <SelectTrigger className="h-7 border-slate-200 bg-white px-2 text-[11px]">
                <SelectValue placeholder="Model" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={MODEL_AUTO_VALUE}>Auto model</SelectItem>
                {availableModelOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1">
            {(['cost', 'balanced', 'quality'] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setOptimizeFor(value)}
                className={cn(
                  'rounded-md px-2 py-1 text-[11px] capitalize transition-colors',
                  optimizeFor === value ? 'bg-emerald-50 text-emerald-700' : 'text-slate-500 hover:text-slate-900'
                )}
              >
                {value}
              </button>
            ))}
          </div>
          {threadId ? (
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
              Thread Active
            </span>
          ) : null}
        </div>
        {imageAttachments.length > 0 ? (
          <div className="mb-2 flex flex-wrap gap-2">
            {imageAttachments.map((attachment) => (
              <div
                key={attachment.id}
                className="relative flex w-[170px] items-center gap-2 rounded-md border border-slate-200 bg-slate-50 p-1.5"
              >
                <img
                  src={attachment.previewUrl}
                  alt={attachment.name}
                  className="h-12 w-12 rounded object-cover"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[11px] font-medium text-slate-700">{attachment.name}</p>
                  <p className="text-[10px] text-slate-500">{formatBytes(attachment.size)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveImage(attachment.id)}
                  className="absolute right-1 top-1 rounded p-0.5 text-slate-500 transition-colors hover:bg-slate-200 hover:text-slate-800"
                  aria-label={`Remove ${attachment.name}`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        ) : null}
        <div className="relative">
          <Textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Describe your email template..."
            rows={2}
            className="resize-none border-slate-200 bg-white pr-12 text-sm"
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void handleSend();
              }
            }}
          />
          <Button onClick={() => void handleSend()} disabled={!canSend} size="icon" className="absolute bottom-2 right-2 h-8 w-8 rounded-md bg-slate-900 hover:bg-slate-800">
            {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}

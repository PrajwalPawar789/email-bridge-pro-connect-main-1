import { type CSSProperties, useCallback, useEffect, useMemo, useState } from 'react';
import { useEmailBuilderStore } from '@/stores/emailBuilderStore';
import { Button } from '@/components/ui/button';
import { AiEmailThreadPanel } from '@/components/ai/AiEmailThreadPanel';
import { AiEmailPreviewPanel } from '@/components/ai/AiEmailPreviewPanel';
import { EmailTemplateList } from '@/components/email/EmailTemplateList';
import { EmailBlocksPanel } from '@/components/email/EmailBlocksPanel';
import { EmailCanvas } from '@/components/email/EmailCanvas';
import { EmailSettingsPanel } from '@/components/email/EmailSettingsPanel';
import { PlainTextEmailComposer } from '@/components/email/PlainTextEmailComposer';
import { mapHtmlToEmailBuilderBlocks } from '@/lib/emailBuilderImport';
import { DEFAULT_EMAIL_BUILDER_THEME } from '@/lib/emailBuilderPersistence';
import { cn } from '@/lib/utils';
import { Monitor, Smartphone } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

type AiThreadSummary = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};

const formatRelativeTime = (isoDate: string) => {
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

const extractModelEmailHtml = (value: unknown) => {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  if (typeof DOMParser === 'undefined') return raw;
  try {
    const doc = new DOMParser().parseFromString(raw, 'text/html');
    const bodyHtml = String(doc?.body?.innerHTML || '')
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
      .trim();
    return bodyHtml || raw;
  } catch {
    return raw;
  }
};

export default function EmailBuilderPage() {
  const {
    currentTemplate,
    saveTemplate,
    createNewTemplate,
    previewMode,
    setPreviewMode,
    setCurrentTemplate,
    loadTemplates,
    hasLoaded,
    isLoading,
    isSaving,
  } = useEmailBuilderStore();

  const [threads, setThreads] = useState<AiThreadSummary[]>([]);
  const [isThreadsLoading, setIsThreadsLoading] = useState(false);
  const [activeThreadId, setActiveThreadId] = useState('');
  const [deletingThreadId, setDeletingThreadId] = useState('');
  const [workspaceMode, setWorkspaceMode] = useState<'assistant' | 'builder' | 'preview'>('assistant');
  const [surfaceView, setSurfaceView] = useState<'list' | 'workspace'>('list');

  const workspaceStyles = {
    '--mail-bg':
      'radial-gradient(circle at 10% 10%, rgba(16, 185, 129, 0.18), transparent 52%), radial-gradient(circle at 90% 8%, rgba(14, 165, 233, 0.16), transparent 48%), linear-gradient(180deg, #f8fafc 0%, #eef2ff 48%, #f8fafc 100%)',
    '--mail-surface': 'rgba(255, 255, 255, 0.96)',
    '--mail-surface-soft': 'rgba(248, 250, 252, 0.9)',
    '--mail-border': 'rgba(148, 163, 184, 0.34)',
    '--mail-ink': '#0f172a',
    '--mail-muted': '#64748b',
    '--mail-accent': '#0f766e',
  } as CSSProperties;

  useEffect(() => {
    if (!hasLoaded) {
      void loadTemplates();
    }
  }, [hasLoaded, loadTemplates]);

  const loadThreads = useCallback(async () => {
    setIsThreadsLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from('ai_builder_threads')
        .select('id, title, created_at, updated_at')
        .eq('mode', 'email')
        .order('updated_at', { ascending: false })
        .limit(100);

      if (error) throw error;

      const mapped = Array.isArray(data)
        ? data.map((row: any) => ({
            id: String(row?.id || ''),
            title: String(row?.title || 'New Template').trim() || 'New Template',
            createdAt: String(row?.created_at || ''),
            updatedAt: String(row?.updated_at || row?.created_at || ''),
          }))
        : [];
      setThreads(mapped.filter((row) => row.id));
    } catch (error) {
      console.warn('Unable to load AI builder threads', error);
    } finally {
      setIsThreadsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadThreads();
  }, [loadThreads]);

  useEffect(() => {
    try {
      const shouldOpen = window.sessionStorage.getItem('openAiEmailChat') === '1';
      if (shouldOpen) {
        setSurfaceView('workspace');
        setWorkspaceMode('assistant');
        setActiveThreadId('');
        setCurrentTemplate(null);
        window.sessionStorage.removeItem('openAiEmailChat');
      }
    } catch {
      // ignore storage issues
    }
  }, [setCurrentTemplate]);

  const applyAiTemplate = useCallback(
    (result: Record<string, any>, targetThreadId?: string) => {
      const rawHtml = extractModelEmailHtml(
        result?.html || result?.bodyHtml || result?.contentHtml || ''
      );
      const importedFromHtml = rawHtml ? mapHtmlToEmailBuilderBlocks(rawHtml) : null;
      const explicitBlocks = Array.isArray(result?.blocks)
        ? result.blocks.map((block: any) => ({
            id: String(block?.id || crypto.randomUUID()),
            type: String(block?.type || 'text') as any,
            content: block?.content && typeof block.content === 'object' ? block.content : {},
            styles: block?.styles && typeof block.styles === 'object' ? block.styles : {},
          }))
        : [];
      const blocks = explicitBlocks.length > 0 ? explicitBlocks : importedFromHtml?.blocks || [];

      const templateId = currentTemplate?.id || targetThreadId || crypto.randomUUID();
      const nextTemplate = {
        id: templateId,
        name: String(result?.name || importedFromHtml?.name || currentTemplate?.name || 'AI Email Template'),
        subject: String(result?.subject || importedFromHtml?.subject || currentTemplate?.subject || ''),
        preheader: String(result?.preheader || currentTemplate?.preheader || ''),
        format: 'html' as const,
        blocks,
        rawHtml: rawHtml || undefined,
        audience: String(result?.audience || currentTemplate?.audience || 'All'),
        voice: String(result?.voice || currentTemplate?.voice || 'Professional'),
        goal: String(result?.goal || currentTemplate?.goal || 'Engagement'),
        theme: currentTemplate?.theme || { ...DEFAULT_EMAIL_BUILDER_THEME },
        createdAt: currentTemplate?.createdAt || new Date(),
      };
      setCurrentTemplate(nextTemplate);
      return nextTemplate;
    },
    [currentTemplate, setCurrentTemplate]
  );

  const handleGenerated = useCallback(
    ({ threadId, result }: { threadId: string; result: Record<string, any> }) => {
      if (threadId) {
        setActiveThreadId(threadId);
      }
      applyAiTemplate(result, threadId);
      void loadThreads();
    },
    [applyAiTemplate, loadThreads]
  );

  const handleSelectThread = (threadId: string) => {
    setActiveThreadId(threadId);
    setCurrentTemplate(null);
  };

  const startNewThread = () => {
    setActiveThreadId('');
    setCurrentTemplate(null);
  };

  const handleCreateTemplateFromList = () => {
    createNewTemplate();
    setWorkspaceMode('builder');
    setSurfaceView('workspace');
  };

  const handleCreatePlainTextTemplateFromList = () => {
    createNewTemplate({ format: 'plain' });
    setWorkspaceMode('builder');
    setSurfaceView('workspace');
  };

  const handleCreateAiTemplateFromList = () => {
    setActiveThreadId('');
    setCurrentTemplate(null);
    setWorkspaceMode('assistant');
    setSurfaceView('workspace');
  };

  const handleEditTemplateFromList = (template: Parameters<typeof setCurrentTemplate>[0]) => {
    if (!template) return;
    setCurrentTemplate(template);
    setWorkspaceMode('builder');
    setSurfaceView('workspace');
  };

  const handlePreviewTemplateFromList = (template: Parameters<typeof setCurrentTemplate>[0]) => {
    if (!template) return;
    setCurrentTemplate(template);
    setWorkspaceMode('preview');
    setSurfaceView('workspace');
  };

  const handleDeleteThread = useCallback(
    async (threadIdToDelete: string) => {
      if (!threadIdToDelete || deletingThreadId) return;
      setDeletingThreadId(threadIdToDelete);
      try {
        const { error } = await (supabase as any)
          .from('ai_builder_threads')
          .delete()
          .eq('id', threadIdToDelete)
          .eq('mode', 'email');
        if (error) throw error;

        setThreads((prev) => prev.filter((thread) => thread.id !== threadIdToDelete));
        if (activeThreadId === threadIdToDelete) {
          setActiveThreadId('');
          setCurrentTemplate(null);
        }
      } catch (error) {
        console.warn('Unable to delete AI builder thread', error);
      } finally {
        setDeletingThreadId('');
      }
    },
    [activeThreadId, deletingThreadId, setCurrentTemplate]
  );

  const activeThreadTitle = useMemo(() => {
    if (!activeThreadId) return 'New Template';
    const found = threads.find((thread) => thread.id === activeThreadId);
    return found?.title || 'Template Conversation';
  }, [threads, activeThreadId]);

  const isAssistantMode = workspaceMode === 'assistant';
  const isPlainTextTemplate = currentTemplate?.format === 'plain';

  if (isLoading && threads.length === 0 && !currentTemplate) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  if (surfaceView === 'list') {
    return (
      <div
        className="relative h-[calc(100vh-4rem)] overflow-hidden bg-[var(--mail-bg)] text-[var(--mail-ink)]"
        style={workspaceStyles}
      >
        <div className="h-full overflow-y-auto">
          <EmailTemplateList
            onCreateTemplate={handleCreateTemplateFromList}
            onCreatePlainTextTemplate={handleCreatePlainTextTemplateFromList}
            onCreateAiTemplate={handleCreateAiTemplateFromList}
            onEditTemplate={handleEditTemplateFromList}
            onPreviewTemplate={handlePreviewTemplateFromList}
          />
        </div>
      </div>
    );
  }

  return (
    <div
      className="relative h-[calc(100vh-4rem)] overflow-hidden bg-[var(--mail-bg)] text-[var(--mail-ink)]"
      style={workspaceStyles}
    >
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-28 top-12 h-72 w-72 rounded-full bg-emerald-200/40 blur-3xl"></div>
        <div className="absolute -right-24 top-6 h-72 w-72 rounded-full bg-sky-200/40 blur-3xl"></div>
      </div>

      <div className="relative h-full w-full">
        <div className="flex h-full w-full flex-col overflow-hidden border border-[var(--mail-border)] bg-[var(--mail-surface)] shadow-[0_24px_64px_rgba(15,23,42,0.14)] lg:flex-row">
          {isAssistantMode ? (
            <div className="flex h-[470px] min-h-[470px] min-w-[320px] flex-col border-b border-[var(--mail-border)] bg-white/95 lg:h-auto lg:w-[380px] lg:border-b-0 lg:border-r">
              <AiEmailThreadPanel
                open
                currentTemplate={currentTemplate}
                threadId={activeThreadId}
                threads={threads.map((thread) => ({
                  id: thread.id,
                  title: thread.title,
                  updatedAt: thread.updatedAt,
                  updatedLabel: formatRelativeTime(thread.updatedAt),
                }))}
                isThreadsLoading={isThreadsLoading}
                deletingThreadId={deletingThreadId}
                onStartNewThread={startNewThread}
                onSelectThread={handleSelectThread}
                onDeleteThread={(threadId) => {
                  void handleDeleteThread(threadId);
                }}
                onThreadIdChange={(nextThreadId) => {
                  setActiveThreadId(nextThreadId);
                  void loadThreads();
                }}
                onGenerated={handleGenerated}
                onThreadActivity={() => {
                  void loadThreads();
                }}
              />
            </div>
          ) : null}

          <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-[var(--mail-surface-soft)]">
            <div className="border-b border-[var(--mail-border)] bg-white/85 px-4 py-3 backdrop-blur">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--mail-muted)]">
                    Template Workspace
                  </p>
                  <p className="mt-0.5 text-base font-semibold text-[var(--mail-ink)]">
                    {currentTemplate?.name || activeThreadTitle || 'New Template'}
                  </p>
                  <p className="mt-0.5 text-xs text-[var(--mail-muted)]">
                    {currentTemplate?.subject
                      ? `Subject: ${currentTemplate.subject}`
                      : 'Start with AI chat, then refine blocks and settings.'}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setSurfaceView('list')}
                    className="h-8 px-3 text-xs"
                  >
                    Templates
                  </Button>
                  <div className="flex items-center rounded-lg border border-[var(--mail-border)] bg-white p-1">
                    <button
                      type="button"
                      onClick={() => setWorkspaceMode('assistant')}
                      className={cn(
                        'rounded-md px-2.5 py-1 text-xs transition-colors',
                        workspaceMode === 'assistant'
                          ? 'bg-[var(--mail-accent)]/10 text-[var(--mail-accent)]'
                          : 'text-[var(--mail-muted)] hover:text-[var(--mail-ink)]'
                      )}
                    >
                      AI Chat
                    </button>
                    <button
                      type="button"
                      onClick={() => setWorkspaceMode('builder')}
                      className={cn(
                        'rounded-md px-2.5 py-1 text-xs transition-colors',
                        workspaceMode === 'builder'
                          ? 'bg-[var(--mail-accent)]/10 text-[var(--mail-accent)]'
                          : 'text-[var(--mail-muted)] hover:text-[var(--mail-ink)]'
                      )}
                    >
                      Builder
                    </button>
                    <button
                      type="button"
                      onClick={() => setWorkspaceMode('preview')}
                      className={cn(
                        'rounded-md px-2.5 py-1 text-xs transition-colors',
                        workspaceMode === 'preview'
                          ? 'bg-[var(--mail-accent)]/10 text-[var(--mail-accent)]'
                          : 'text-[var(--mail-muted)] hover:text-[var(--mail-ink)]'
                      )}
                    >
                      Preview
                    </button>
                  </div>

                  {workspaceMode !== 'assistant' && !(workspaceMode === 'builder' && isPlainTextTemplate) ? (
                    <div className="flex items-center rounded-lg border border-[var(--mail-border)] bg-white p-1">
                      <button
                        type="button"
                        onClick={() => setPreviewMode('desktop')}
                        className={cn(
                          'rounded-md px-2.5 py-1 text-xs transition-colors',
                          previewMode === 'desktop'
                            ? 'bg-[var(--mail-accent)]/10 text-[var(--mail-accent)]'
                            : 'text-[var(--mail-muted)] hover:text-[var(--mail-ink)]'
                        )}
                      >
                        <span className="inline-flex items-center gap-1">
                          <Monitor className="h-3.5 w-3.5" />
                          Desktop
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setPreviewMode('mobile')}
                        className={cn(
                          'rounded-md px-2.5 py-1 text-xs transition-colors',
                          previewMode === 'mobile'
                            ? 'bg-[var(--mail-accent)]/10 text-[var(--mail-accent)]'
                            : 'text-[var(--mail-muted)] hover:text-[var(--mail-ink)]'
                        )}
                      >
                        <span className="inline-flex items-center gap-1">
                          <Smartphone className="h-3.5 w-3.5" />
                          Mobile
                        </span>
                      </button>
                    </div>
                  ) : null}

                  <Button
                    size="sm"
                    onClick={() => void saveTemplate()}
                    disabled={isSaving || !currentTemplate}
                    className="h-8 px-3 text-xs"
                  >
                    {isSaving ? 'Saving...' : 'Save Template'}
                  </Button>
                </div>
              </div>

            </div>

            <div className="flex-1 min-h-0">
              {workspaceMode === 'assistant' ? (
                <AiEmailPreviewPanel
                  template={currentTemplate}
                  onSave={() => void saveTemplate()}
                  isSaving={isSaving}
                />
              ) : workspaceMode === 'preview' ? (
                <AiEmailPreviewPanel
                  template={currentTemplate}
                  onSave={() => void saveTemplate()}
                  isSaving={isSaving}
                />
              ) : currentTemplate ? (
                <div className="h-full overflow-auto">
                  {isPlainTextTemplate ? (
                    <div className="grid h-full min-h-[620px] min-w-[980px] grid-cols-[minmax(0,1fr),18rem] overflow-hidden bg-background">
                      <PlainTextEmailComposer />
                      <EmailSettingsPanel />
                    </div>
                  ) : (
                    <div className="grid h-full min-h-[620px] min-w-[980px] grid-cols-[15rem,minmax(0,1fr),18rem] overflow-hidden bg-background">
                      <EmailBlocksPanel />
                      <EmailCanvas />
                      <EmailSettingsPanel />
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex h-full items-center justify-center bg-slate-100/40 p-8">
                  <div className="max-w-md rounded-2xl border border-[var(--mail-border)] bg-white p-6 text-center shadow-[0_12px_32px_rgba(15,23,42,0.08)]">
                    <p className="text-base font-semibold text-[var(--mail-ink)]">Start Building a Template</p>
                    <p className="mt-2 text-sm text-[var(--mail-muted)]">
                      Generate with AI first, or create a blank drag-and-drop template and build manually.
                    </p>
                    <div className="mt-4 flex items-center justify-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          createNewTemplate({ format: 'plain' });
                          setWorkspaceMode('builder');
                        }}
                      >
                        Create Plain Text
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setWorkspaceMode('preview');
                        }}
                      >
                        Open Preview
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => {
                          createNewTemplate();
                          setWorkspaceMode('builder');
                        }}
                      >
                        Create Blank Template
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

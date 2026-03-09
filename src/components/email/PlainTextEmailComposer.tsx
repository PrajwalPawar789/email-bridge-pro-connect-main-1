import { useEffect, useMemo, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { renderEmailTemplateText } from '@/lib/emailBuilderPersistence';
import { createEmailBuilderBlock } from '@/lib/emailBuilderBlocks';
import { useEmailBuilderStore } from '@/stores/emailBuilderStore';
import { Badge } from '@/components/ui/badge';
import { Sparkles, UserRound, MessageSquareText, CheckCircle2 } from 'lucide-react';

const PERSONALIZATION_TOKENS = ['{first_name}', '{last_name}', '{company}', '{job_title}', '{sender_name}', '{sender_email}'];

const QUICK_SNIPPETS = [
  { label: 'Greeting', value: 'Hi {first_name},\n\n' },
  { label: 'Observation', value: 'I noticed {company} is focused on ...\n\n' },
  { label: 'Value prop', value: 'We help teams like {company} improve ...\n\n' },
  { label: 'CTA', value: 'Would you be open to a quick conversation next week?\n\n' },
  { label: 'Follow-up', value: 'Just following up in case this got buried.\n\n' },
  { label: 'Signature', value: 'Best,\n{sender_name}\n{sender_email}\n' },
];

const PLAIN_TEXT_STARTERS = [
  {
    id: 'cold-outreach',
    label: 'Cold outreach',
    description: 'Short first-touch email with one clear ask.',
    subject: 'Quick question about {company}',
    body:
      'Hi {first_name},\n\nI noticed {company} is focused on growth and wanted to share an idea that could help your team move faster without adding extra overhead.\n\nWould you be open to a quick conversation next week?\n\nBest,\n{sender_name}',
  },
  {
    id: 'follow-up',
    label: 'Follow-up',
    description: 'Simple reminder without sounding pushy.',
    subject: 'Following up on my note',
    body:
      'Hi {first_name},\n\nJust following up in case my last note got buried.\n\nHappy to send over a short summary if that is easier.\n\nBest,\n{sender_name}',
  },
  {
    id: 're-engage',
    label: 'Re-engage',
    description: 'Restart a conversation with context and a low-friction CTA.',
    subject: 'Still relevant for {company}?',
    body:
      'Hi {first_name},\n\nWanted to circle back in case this is more relevant now.\n\nIf helpful, I can send a concise outline tailored to {company}.\n\nBest,\n{sender_name}',
  },
];

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const bodyToBlocks = (body: string) => {
  const normalized = String(body || '');
  if (!normalized.trim()) return [];
  return [
    createEmailBuilderBlock('text', {
      content: {
        text: normalized,
        html: escapeHtml(normalized).replace(/\n/g, '<br />'),
      },
      styles: {
        padding: '0',
        backgroundColor: 'transparent',
      },
    }),
  ];
};

const applySamplePersonalization = (value: string) =>
  String(value || '')
    .replace(/\{\{?\s*first_name\s*\}?\}/gi, 'Avery')
    .replace(/\{\{?\s*last_name\s*\}?\}/gi, 'Johnson')
    .replace(/\{\{?\s*company\s*\}?\}/gi, 'Northstar Labs')
    .replace(/\{\{?\s*job_title\s*\}?\}/gi, 'Revenue Operations')
    .replace(/\{\{?\s*sender_name\s*\}?\}/gi, 'Jordan Lee')
    .replace(/\{\{?\s*sender_email\s*\}?\}/gi, 'jordan@sender.com');

export function PlainTextEmailComposer() {
  const { currentTemplate, updateTemplateField, selectBlock } = useEmailBuilderStore();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    selectBlock(null);
  }, [selectBlock]);

  const body = useMemo(() => {
    if (!currentTemplate) return '';
    return renderEmailTemplateText(currentTemplate);
  }, [currentTemplate]);

  const wordCount = body.trim().split(/\s+/).filter(Boolean).length;
  const paragraphCount = body.split(/\n\s*\n/).filter((part) => part.trim().length > 0).length;
  const charCount = body.length;
  const readingTime = Math.max(1, Math.round(wordCount / 180));
  const previewSubject = applySamplePersonalization(currentTemplate?.subject || 'No subject');
  const previewBody = applySamplePersonalization(body);

  const suggestions = useMemo(() => {
    const items: string[] = [];
    if (wordCount > 130) items.push('Trim this closer to 80-120 words if this is a first-touch email.');
    if (!/\{(?:\{|)?\s*(first_name|company)\s*(?:\}|)?\}/i.test(body)) {
      items.push('Add {first_name} or {company} so the message feels personalized.');
    }
    if (!/\?\s*$|reply|open to|would you|let me know/i.test(body)) {
      items.push('End with one clear CTA so the recipient knows what to do next.');
    }
    if (paragraphCount < 2 && wordCount > 60) {
      items.push('Break the body into shorter paragraphs so it scans faster.');
    }
    return items.slice(0, 3);
  }, [body, paragraphCount, wordCount]);

  if (!currentTemplate) return null;

  const syncBody = (nextBody: string) => {
    updateTemplateField('blocks', bodyToBlocks(nextBody));
  };

  const insertAtCursor = (snippet: string) => {
    const textarea = textareaRef.current;
    if (!textarea) {
      syncBody(`${body}${snippet}`);
      return;
    }

    const start = textarea.selectionStart || 0;
    const end = textarea.selectionEnd || 0;
    const nextBody = `${body.slice(0, start)}${snippet}${body.slice(end)}`;
    syncBody(nextBody);

    requestAnimationFrame(() => {
      textarea.focus();
      const nextCursor = start + snippet.length;
      textarea.setSelectionRange(nextCursor, nextCursor);
    });
  };

  const applyStarter = (starter: (typeof PLAIN_TEXT_STARTERS)[number]) => {
    if (!currentTemplate.subject.trim()) {
      updateTemplateField('subject', starter.subject);
    }
    syncBody(starter.body);
    requestAnimationFrame(() => textareaRef.current?.focus());
  };

  return (
    <div className="h-full overflow-auto bg-canvas-bg p-6">
      <div className="mx-auto grid max-w-6xl gap-6 xl:grid-cols-[minmax(0,1fr),20rem]">
        <div className="space-y-5">
          <div className="rounded-2xl border border-border bg-card shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Plain Text Composer</p>
                <p className="mt-1 text-sm text-muted-foreground">Write a clean text-first email without dealing with block layout or HTML styling.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="bg-background text-xs">{wordCount} words</Badge>
                <Badge variant="outline" className="bg-background text-xs">{charCount} chars</Badge>
                <Badge variant="outline" className="bg-background text-xs">~{readingTime} min read</Badge>
              </div>
            </div>

            <div className="border-b border-border px-5 py-3">
              <div className="flex flex-wrap gap-2">
                {QUICK_SNIPPETS.map((snippet) => (
                  <Button key={snippet.label} type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={() => insertAtCursor(snippet.value)}>
                    {snippet.label}
                  </Button>
                ))}
              </div>
            </div>

            <div className="p-5">
              <Textarea
                ref={textareaRef}
                value={body}
                onChange={(event) => syncBody(event.target.value)}
                placeholder="Hi {first_name},&#10;&#10;I noticed {company} is working on..."
                className="min-h-[360px] resize-none border-0 bg-transparent p-0 font-mono text-[15px] leading-7 focus-visible:ring-0"
              />
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card shadow-sm">
            <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Live Preview</p>
                <p className="mt-1 text-sm text-muted-foreground">Sample data is injected so you can judge readability and tone quickly.</p>
              </div>
              <div className="rounded-full border border-border bg-muted/30 px-3 py-1 text-[11px] font-medium text-muted-foreground">
                {paragraphCount} paragraphs
              </div>
            </div>
            <div className="space-y-4 p-5">
              <div className="rounded-xl border border-border bg-muted/20 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Subject</p>
                <p className="mt-2 text-sm font-semibold text-foreground">{previewSubject}</p>
                {currentTemplate.preheader ? (
                  <>
                    <p className="mt-4 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Preheader</p>
                    <p className="mt-2 text-sm text-muted-foreground">{applySamplePersonalization(currentTemplate.preheader)}</p>
                  </>
                ) : null}
              </div>

              <div className="rounded-xl border border-border bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
                <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-7 text-foreground">{previewBody || 'Start typing to preview your message.'}</pre>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <p className="text-sm font-semibold text-foreground">Starter Templates</p>
            </div>
            <div className="mt-3 space-y-2">
              {PLAIN_TEXT_STARTERS.map((starter) => (
                <button
                  key={starter.id}
                  type="button"
                  onClick={() => applyStarter(starter)}
                  className="w-full rounded-xl border border-border bg-muted/20 p-3 text-left transition-colors hover:border-primary/30 hover:bg-primary/5"
                >
                  <p className="text-sm font-medium text-foreground">{starter.label}</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{starter.description}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <div className="flex items-center gap-2">
              <UserRound className="h-4 w-4 text-primary" />
              <p className="text-sm font-semibold text-foreground">Personalization Tokens</p>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {PERSONALIZATION_TOKENS.map((token) => (
                <Button key={token} type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={() => insertAtCursor(token)}>
                  {token}
                </Button>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <div className="flex items-center gap-2">
              <MessageSquareText className="h-4 w-4 text-primary" />
              <p className="text-sm font-semibold text-foreground">Writing Tips</p>
            </div>
            <div className="mt-3 space-y-2">
              {suggestions.length > 0 ? (
                suggestions.map((suggestion) => (
                  <div key={suggestion} className="rounded-xl border border-amber-200 bg-amber-50/80 p-3 text-xs leading-5 text-amber-800">
                    {suggestion}
                  </div>
                ))
              ) : (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-3 text-xs leading-5 text-emerald-800">
                  The structure looks solid. Keep the CTA specific and the next step easy to answer.
                </div>
              )}

              <div className="rounded-xl border border-border bg-muted/20 p-3 text-xs leading-5 text-muted-foreground">
                Normal text emails work best when they feel personal, short, and direct. Aim for one idea per paragraph and one CTA at the end.
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-primary" />
              <p className="text-sm font-semibold text-foreground">Quick Checks</p>
            </div>
            <ul className="mt-3 space-y-2 text-xs leading-5 text-muted-foreground">
              <li>Use a short subject line that reads naturally.</li>
              <li>Keep the body skimmable with blank lines between ideas.</li>
              <li>End with one low-friction CTA, not multiple asks.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

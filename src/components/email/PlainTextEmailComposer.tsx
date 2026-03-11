import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { renderEmailTemplateText } from '@/lib/emailBuilderPersistence';
import { createEmailBuilderBlock } from '@/lib/emailBuilderBlocks';
import { useEmailBuilderStore } from '@/stores/emailBuilderStore';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Keyboard } from 'lucide-react';
import { RichTextToolbar } from './RichTextToolbar';

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

const TRACKABLE_URL_REGEX = /(?:https?:\/\/|www\.)[^\s<>"']+/gi;

const TRACKING_MODE_OPTIONS = [
  { id: 'all', label: 'Track all links' },
  { id: 'selected', label: 'Track selected links' },
  { id: 'none', label: 'Do not track clicks' },
] as const;

const SHORTCUT_HINTS = [
  'Ctrl/Cmd+B for bold',
  'Ctrl/Cmd+I for italic',
  'Ctrl/Cmd+U for underline',
  'Ctrl/Cmd+K for link',
] as const;

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const textToComposerHtml = (value: string) => {
  const normalized = String(value || '');
  if (!normalized.trim()) return '';
  return normalized
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br />')}</p>`)
    .join('');
};

const bodyToBlocks = (body: string, html?: string) => {
  const normalizedText = String(body || '');
  const normalizedHtml = String(html || '').trim();
  if (normalizedText.length === 0 && normalizedHtml.length === 0) return [];
  return [
    createEmailBuilderBlock('text', {
      content: {
        text: normalizedText,
        html: normalizedHtml || textToComposerHtml(normalizedText),
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

const extractLinkCandidates = (html: string, text: string) => {
  const links = new Set<string>();

  Array.from(String(text || '').matchAll(TRACKABLE_URL_REGEX)).forEach((match) => {
    const value = String(match[0] || '').trim();
    if (value) links.add(value);
  });

  if (typeof DOMParser !== 'undefined') {
    try {
      const doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
      Array.from(doc.querySelectorAll('a[href]')).forEach((anchor) => {
        const href = String(anchor.getAttribute('href') || '').trim();
        if (href) links.add(href);
      });
    } catch {
      // Ignore parsing issues and fall back to text matches only.
    }
  }

  return Array.from(links);
};

const readComposerState = (editor: HTMLDivElement | null) => {
  if (!editor) {
    return { html: '', text: '' };
  }
  const html = editor.innerHTML;
  const text = (editor.innerText || editor.textContent || '').replace(/\r\n/g, '\n');
  return { html, text };
};

const focusEditor = (editor: HTMLDivElement | null) => {
  if (!editor) return;
  editor.focus();
};

const execEditorCommand = (command: string, value?: string) => {
  document.execCommand(command, false, value);
};

export function PlainTextEmailComposer() {
  const { currentTemplate, updateTemplateField, selectBlock } = useEmailBuilderStore();
  const editorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    selectBlock(null);
  }, [selectBlock]);

  const primaryBlock = useMemo(() => {
    if (!currentTemplate) return null;
    return (
      currentTemplate.blocks.find((block) =>
        block.type === 'text' || block.type === 'signature' || block.type === 'quote' || block.type === 'heading'
      ) || null
    );
  }, [currentTemplate]);

  const bodyText = useMemo(() => {
    if (!currentTemplate) return '';
    if (primaryBlock && typeof primaryBlock.content?.text === 'string') {
      return primaryBlock.content.text;
    }
    return renderEmailTemplateText(currentTemplate);
  }, [currentTemplate, primaryBlock]);

  const bodyHtml = useMemo(() => {
    if (!currentTemplate) return '';
    if (primaryBlock && typeof primaryBlock.content?.html === 'string' && primaryBlock.content.html.trim()) {
      return primaryBlock.content.html;
    }
    return textToComposerHtml(bodyText);
  }, [bodyText, currentTemplate, primaryBlock]);

  useLayoutEffect(() => {
    if (!editorRef.current) return;
    if (document.activeElement === editorRef.current) return;
    if (editorRef.current.innerHTML !== bodyHtml) {
      editorRef.current.innerHTML = bodyHtml;
    }
  }, [bodyHtml]);

  const wordCount = bodyText.trim().split(/\s+/).filter(Boolean).length;
  const paragraphCount = bodyText.split(/\n\s*\n/).filter((part) => part.trim().length > 0).length;
  const charCount = bodyText.length;
  const readingTime = Math.max(1, Math.round(wordCount / 180));
  const previewSubject = applySamplePersonalization(currentTemplate?.subject || 'No subject');
  const previewBodyHtml = applySamplePersonalization(bodyHtml);
  const clickTrackingMode = currentTemplate?.clickTrackingMode || 'all';
  const trackedLinkUrls = useMemo(
    () => Array.from(new Set((currentTemplate?.trackedLinkUrls || []).map((item) => String(item || '').trim()).filter(Boolean))),
    [currentTemplate?.trackedLinkUrls]
  );
  const detectedLinks = useMemo(() => extractLinkCandidates(bodyHtml, bodyText), [bodyHtml, bodyText]);
  const activeTrackedLinks = clickTrackingMode === 'all'
    ? detectedLinks
    : clickTrackingMode === 'selected'
      ? trackedLinkUrls.filter((url) => detectedLinks.includes(url))
      : [];

  const suggestions = useMemo(() => {
    const items: string[] = [];
    if (wordCount > 130) items.push('Trim this closer to 80-120 words if this is a first-touch email.');
    if (!/\{(?:\{|)?\s*(first_name|company)\s*(?:\}|)?\}/i.test(bodyText)) {
      items.push('Add {first_name} or {company} so the message feels personalized.');
    }
    if (!/\?\s*$|reply|open to|would you|let me know/i.test(bodyText)) {
      items.push('End with one clear CTA so the recipient knows what to do next.');
    }
    if (paragraphCount < 2 && wordCount > 60) {
      items.push('Break the body into shorter paragraphs so it scans faster.');
    }
    if (detectedLinks.length > 1 && clickTrackingMode === 'all') {
      items.push('If only some links should be tracked, switch click tracking to "Track selected links".');
    }
    return items.slice(0, 3);
  }, [bodyText, clickTrackingMode, detectedLinks.length, paragraphCount, wordCount]);

  const syncComposerState = useCallback(() => {
    const { html, text } = readComposerState(editorRef.current);
    updateTemplateField('blocks', bodyToBlocks(text, html));

    const nextDetectedLinks = extractLinkCandidates(html, text);
    if (clickTrackingMode === 'all') {
      updateTemplateField('trackedLinkUrls', nextDetectedLinks);
      return;
    }
    if (clickTrackingMode === 'selected') {
      updateTemplateField(
        'trackedLinkUrls',
        trackedLinkUrls.filter((url) => nextDetectedLinks.includes(url))
      );
    }
  }, [clickTrackingMode, trackedLinkUrls, updateTemplateField]);

  const updateTrackedLinks = useCallback((nextLinks: string[]) => {
    updateTemplateField(
      'trackedLinkUrls',
      Array.from(new Set(nextLinks.map((item) => String(item || '').trim()).filter(Boolean)))
    );
  }, [updateTemplateField]);

  const insertTextSnippet = useCallback((snippet: string) => {
    focusEditor(editorRef.current);
    execEditorCommand('insertText', snippet);
    syncComposerState();
  }, [syncComposerState]);

  const insertToken = useCallback((token: string) => {
    insertTextSnippet(token);
  }, [insertTextSnippet]);

  const applyStarter = useCallback((starter: (typeof PLAIN_TEXT_STARTERS)[number]) => {
    if (!currentTemplate?.subject.trim()) {
      updateTemplateField('subject', starter.subject);
    }
    updateTemplateField('blocks', bodyToBlocks(starter.body, textToComposerHtml(starter.body)));
    requestAnimationFrame(() => focusEditor(editorRef.current));
  }, [currentTemplate?.subject, updateTemplateField]);

  const updateClickTrackingMode = useCallback((mode: 'all' | 'selected' | 'none') => {
    updateTemplateField('clickTrackingMode', mode);
    if (mode === 'all') {
      updateTrackedLinks(detectedLinks);
      return;
    }
    if (mode === 'none') {
      updateTrackedLinks([]);
      return;
    }
    const preserved = trackedLinkUrls.filter((url) => detectedLinks.includes(url));
    updateTrackedLinks(preserved.length > 0 ? preserved : detectedLinks.slice(0, 1));
  }, [detectedLinks, trackedLinkUrls, updateTemplateField, updateTrackedLinks]);

  const toggleTrackedLink = useCallback((url: string) => {
    if (clickTrackingMode !== 'selected') {
      updateClickTrackingMode('selected');
    }
    const nextLinks = trackedLinkUrls.includes(url)
      ? trackedLinkUrls.filter((item) => item !== url)
      : [...trackedLinkUrls, url];
    updateTrackedLinks(nextLinks);
  }, [clickTrackingMode, trackedLinkUrls, updateClickTrackingMode, updateTrackedLinks]);

  const handleEditorKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    const isPrimary = event.ctrlKey || event.metaKey;
    if (!isPrimary) return;

    const key = event.key.toLowerCase();
    if (key === 'k') {
      event.preventDefault();
      const url = window.prompt('Enter link URL', 'https://');
      if (url) {
        execEditorCommand('createLink', url.trim());
        syncComposerState();
      }
      return;
    }

    if (key === 'b' || key === 'i' || key === 'u') {
      event.preventDefault();
      execEditorCommand(key === 'b' ? 'bold' : key === 'i' ? 'italic' : 'underline');
      syncComposerState();
      return;
    }

    if (event.shiftKey && event.key === '7') {
      event.preventDefault();
      execEditorCommand('insertOrderedList');
      syncComposerState();
      return;
    }

    if (event.shiftKey && event.key === '8') {
      event.preventDefault();
      execEditorCommand('insertUnorderedList');
      syncComposerState();
    }
  }, [syncComposerState]);

  if (!currentTemplate) return null;

  return (
    <div className="h-full overflow-auto bg-canvas-bg p-6">
      <div className="grid h-full w-full gap-6">
        <div className="space-y-5">
          <div className="rounded-2xl border border-border bg-card shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Plain Text Composer</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Outlook-style writing surface with keyboard shortcuts, rich formatting, and a cleaner compose flow.
                </p>
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
                  <Button key={snippet.label} type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={() => insertTextSnippet(snippet.value)}>
                    {snippet.label}
                  </Button>
                ))}
              </div>
            </div>

            <div className="border-b border-border px-5 py-4">
              <RichTextToolbar
                editorRef={editorRef}
                className="w-full rounded-xl border-border/80 bg-background/95 shadow-none"
              />
              <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/20 px-2.5 py-1">
                  <Keyboard className="h-3.5 w-3.5" />
                  Shortcuts
                </span>
                {SHORTCUT_HINTS.map((hint) => (
                  <span key={hint} className="rounded-full border border-border bg-background px-2.5 py-1">
                    {hint}
                  </span>
                ))}
              </div>
            </div>

            <div className="p-5">
              <div className="rounded-2xl border border-border bg-white shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
                <div className="border-b border-border px-4 py-3">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Compose</div>
                </div>
                <div className="p-4">
                  <div
                    ref={editorRef}
                    contentEditable
                    suppressContentEditableWarning
                    onInput={syncComposerState}
                    onBlur={syncComposerState}
                    onKeyDown={handleEditorKeyDown}
                    className={cn(
                      'min-h-[360px] rounded-xl px-1 py-1 text-[15px] leading-7 text-foreground outline-none',
                      'focus:ring-0',
                      'prose prose-sm max-w-none',
                      '[&_p]:my-0 [&_p+p]:mt-4',
                      '[&_ul]:my-3 [&_ul]:pl-5 [&_ul]:list-disc',
                      '[&_ol]:my-3 [&_ol]:pl-5 [&_ol]:list-decimal',
                      '[&_li]:my-1',
                      '[&_blockquote]:border-l-[3px] [&_blockquote]:border-primary/25 [&_blockquote]:pl-3 [&_blockquote]:italic [&_blockquote]:text-muted-foreground',
                      '[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2',
                      '[&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-3 [&_pre]:font-mono [&_pre]:text-xs',
                      '[&_font]:font-inherit'
                    )}
                    data-placeholder="Write your email here. Use Ctrl/Cmd+B, I, U, or K just like a standard mail editor."
                  />
                  {!bodyText.trim() ? (
                    <div className="pointer-events-none -mt-[22.5rem] px-1 text-[15px] leading-7 text-muted-foreground/70">
                      Write your email here. Use Ctrl/Cmd+B, I, U, or K just like a standard mail editor.
                    </div>
                  ) : null}
                </div>
              </div>
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
                {previewBodyHtml ? (
                  <div
                    className="prose prose-sm max-w-none text-foreground [&_a]:text-primary [&_a]:underline [&_ol]:my-3 [&_ol]:pl-5 [&_ul]:my-3 [&_ul]:pl-5 [&_p]:my-0 [&_p+p]:mt-4"
                    dangerouslySetInnerHTML={{ __html: previewBodyHtml }}
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">Start typing to preview your message.</p>
                )}
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

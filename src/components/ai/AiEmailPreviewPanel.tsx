import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { renderEmailTemplateHtml, renderEmailTemplateText } from '@/lib/emailBuilderPersistence';
import type { EmailTemplate } from '@/stores/emailBuilderStore';
import { Check, Code, Copy, Monitor, Smartphone } from 'lucide-react';
import { cn } from '@/lib/utils';

type ViewMode = 'desktop' | 'mobile' | 'code';

type Props = {
  template: EmailTemplate | null;
  onSave: () => void;
  isSaving: boolean;
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const renderPlainTextPreview = (template: EmailTemplate, text: string) => `
  <div style="margin:0;padding:28px 12px;background:#f8fafc;font-family:${template.theme?.fontFamily || 'Arial, Helvetica, sans-serif'};">
    <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid rgba(148,163,184,0.18);border-radius:20px;overflow:hidden;box-shadow:0 14px 40px rgba(15,23,42,0.08);">
      <div style="padding:20px 24px;border-bottom:1px solid rgba(226,232,240,1);">
        <div style="font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:0.12em;">Subject</div>
        <div style="margin-top:8px;font-size:15px;font-weight:600;color:#0f172a;">${escapeHtml(template.subject || 'No subject')}</div>
        ${template.preheader ? `<div style="margin-top:12px;font-size:13px;color:#64748b;">${escapeHtml(template.preheader)}</div>` : ''}
      </div>
      <div style="padding:24px;">
        <pre style="margin:0;white-space:pre-wrap;word-break:break-word;font-family:${template.theme?.fontFamily || 'Arial, Helvetica, sans-serif'};font-size:15px;line-height:1.7;color:#0f172a;">${escapeHtml(
          text
        )}</pre>
      </div>
    </div>
  </div>
`;

export function AiEmailPreviewPanel({ template, onSave, isSaving }: Props) {
  const [viewMode, setViewMode] = useState<ViewMode>('desktop');
  const [copied, setCopied] = useState(false);
  const isPlainText = template?.format === 'plain';

  const previewText = useMemo(() => {
    if (!template) return '';
    return renderEmailTemplateText(template);
  }, [template]);

  const previewHtml = useMemo(() => {
    if (!template) return '';
    if (template.format === 'plain') return renderPlainTextPreview(template, previewText);
    const directHtml = String(template.rawHtml || '').trim();
    if (directHtml) return directHtml;
    if (!Array.isArray(template.blocks) || template.blocks.length === 0) return '';
    return renderEmailTemplateHtml(template);
  }, [previewText, template]);

  const handleCopy = async () => {
    const valueToCopy = isPlainText ? previewText : previewHtml;
    if (!valueToCopy) return;
    await navigator.clipboard.writeText(valueToCopy);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  if (!(isPlainText ? previewText : previewHtml)) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 bg-muted/30 p-8">
        <div className="flex h-32 w-48 items-center justify-center rounded-xl border-2 border-dashed border-border">
          <Monitor className="h-12 w-12 text-muted-foreground/30" />
        </div>
        <div className="text-center">
          <p className="font-medium text-muted-foreground">No Preview Yet</p>
          <p className="mt-1 text-sm text-muted-foreground/70">Generated templates will appear here</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-muted/30">
      <div className="flex items-center justify-between border-b border-border bg-card px-4 py-2">
        <div className="flex items-center gap-1">
          {(['desktop', 'mobile', 'code'] as ViewMode[]).map((mode) => (
            <Button
              key={mode}
              variant={viewMode === mode ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setViewMode(mode)}
              className="h-8 gap-1.5 px-3 text-xs"
            >
              {mode === 'desktop' ? <Monitor className="h-3.5 w-3.5" /> : null}
              {mode === 'mobile' ? <Smartphone className="h-3.5 w-3.5" /> : null}
              {mode === 'code' ? <Code className="h-3.5 w-3.5" /> : null}
              {mode.charAt(0).toUpperCase() + mode.slice(1)}
            </Button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={handleCopy} className="h-8 gap-1.5 px-3 text-xs">
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? 'Copied' : isPlainText ? 'Copy Text' : 'Copy HTML'}
          </Button>
          <Button size="sm" onClick={onSave} disabled={isSaving} className="h-8 px-3 text-xs">
            {isSaving ? 'Saving...' : 'Save Template'}
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {viewMode === 'code' ? (
          <pre className="h-full overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border bg-card p-4 text-xs font-mono">
            <code>{isPlainText ? previewText : previewHtml}</code>
          </pre>
        ) : (
          <div className="flex justify-center">
            <div
              className={cn(
                'w-full overflow-hidden rounded-lg border border-border bg-card shadow-lg transition-all',
                viewMode === 'mobile' ? 'max-w-[375px]' : 'max-w-[680px]'
              )}
            >
              <iframe
                srcDoc={previewHtml}
                className="w-full border-0"
                style={{ minHeight: '760px', height: '100%' }}
                title="Email Preview"
                sandbox="allow-same-origin"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

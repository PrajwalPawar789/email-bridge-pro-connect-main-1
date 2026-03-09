import { useEffect, useState } from 'react';
import { useEmailBuilderStore } from '@/stores/emailBuilderStore';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const fontFamilies = [
  'Arial, Helvetica, sans-serif',
  'Helvetica, Arial, sans-serif',
  'Georgia, serif',
  'Verdana, sans-serif',
  'Tahoma, sans-serif',
  '"Trebuchet MS", sans-serif',
];

const safeStringify = (value: unknown) => {
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return '{}';
  }
};

const stripHtml = (value: string) =>
  String(value || '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h1|h2|h3|h4|h5|h6|li|tr|blockquote)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const plainTextToRichHtml = (value: string, type: string) => {
  const lines = String(value || '').split('\n');
  if (type === 'heading') {
    return escapeHtml(lines.join(' '));
  }

  return lines
    .map((line) => line.trim())
    .reduce<string[]>((acc, line) => {
      if (!line) {
        acc.push('');
        return acc;
      }
      const previous = acc[acc.length - 1];
      if (previous === '') {
        acc[acc.length - 1] = `<p>${escapeHtml(line)}</p>`;
      } else {
        acc.push(`<p>${escapeHtml(line)}</p>`);
      }
      return acc;
    }, [])
    .filter(Boolean)
    .join('');
};

const resizeTableData = (data: string[][], rows: number, cols: number) =>
  Array.from({ length: rows }, (_, rowIndex) =>
    Array.from({ length: cols }, (_, colIndex) => data?.[rowIndex]?.[colIndex] || '')
  );

const normalizeSwatchColor = (value: string) =>
  /^#(?:[0-9a-fA-F]{3}){1,2}$/.test(String(value || '').trim()) ? String(value).trim() : '#ffffff';

export function EmailSettingsPanel() {
  const { currentTemplate, selectedBlockId } = useEmailBuilderStore();
  const selectedBlock = currentTemplate?.blocks.find((block) => block.id === selectedBlockId);

  return (
    <div className="h-full w-full overflow-y-auto border-l border-border bg-card scrollbar-thin">
      {selectedBlock ? <BlockSettings /> : <TemplateSettings />}
    </div>
  );
}

function TemplateSettings() {
  const { currentTemplate, updateTemplateField } = useEmailBuilderStore();
  if (!currentTemplate) return null;

  const wordCount = currentTemplate.blocks
    .map((block) => String(block.content?.text || ''))
    .join(' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;

  const readingTime = Math.max(1, Math.round(wordCount / 180));
  const theme = currentTemplate.theme;

  const updateTheme = (patch: Record<string, any>) =>
    updateTemplateField('theme', {
      ...theme,
      ...patch,
    });

  return (
    <div>
      <div className="border-b border-border p-4">
        <h3 className="text-sm font-semibold text-foreground">Template Blueprint</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">Configure message strategy, design, and output settings.</p>
      </div>

      <Accordion
        type="multiple"
        defaultValue={currentTemplate.format === 'plain' ? ['basics', 'strategy', 'plain-text', 'insights'] : ['basics', 'strategy', 'design', 'insights']}
        className="px-4"
      >
        <AccordionItem value="basics">
          <AccordionTrigger className="text-sm font-medium">Basics</AccordionTrigger>
          <AccordionContent className="space-y-3">
            <Field label="Template Name">
              <Input
                placeholder="e.g., Cold Outreach - Follow Up 1"
                value={currentTemplate.name}
                onChange={(event) => updateTemplateField('name', event.target.value)}
                className="mt-1 text-sm"
              />
            </Field>

            <Field label="Subject Line" hint="Aim for clarity first. Keep it short enough to scan on mobile.">
              <Input
                placeholder="Quick question for {{company}}..."
                value={currentTemplate.subject}
                onChange={(event) => updateTemplateField('subject', event.target.value)}
                className="mt-1 text-sm"
              />
              <p className="mt-1 text-xs text-muted-foreground">{currentTemplate.subject.length} chars</p>
            </Field>

            <Field label="Preheader" hint="This appears next to or under the subject in many inboxes.">
              <Textarea
                placeholder="Preview text that complements the subject line"
                value={currentTemplate.preheader}
                onChange={(event) => updateTemplateField('preheader', event.target.value)}
                className="text-sm"
                rows={3}
              />
            </Field>

            <Field label="Format">
              <ToggleGroup
                options={[
                  ['plain', 'Plain text'],
                  ['html', 'HTML'],
                ]}
                value={currentTemplate.format}
                onChange={(value) => updateTemplateField('format', value)}
              />
            </Field>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="strategy">
          <AccordionTrigger className="text-sm font-medium">Audience and Goal</AccordionTrigger>
          <AccordionContent className="space-y-3">
            <Field label="Audience">
              <Input
                placeholder="Startup founders, RevOps teams, enterprise buyers..."
                value={currentTemplate.audience}
                onChange={(event) => updateTemplateField('audience', event.target.value)}
                className="text-sm"
              />
            </Field>

            <Field label="Voice">
              <ToggleGroup
                options={['Professional', 'Casual', 'Friendly', 'Formal'].map((item) => [item, item])}
                value={currentTemplate.voice}
                onChange={(value) => updateTemplateField('voice', value)}
              />
            </Field>

            <Field label="Goal">
              <Input
                placeholder="Cold outreach, nurture, re-engage, activation..."
                value={currentTemplate.goal}
                onChange={(event) => updateTemplateField('goal', event.target.value)}
                className="text-sm"
              />
            </Field>
          </AccordionContent>
        </AccordionItem>

        {currentTemplate.format === 'html' ? (
          <AccordionItem value="design">
            <AccordionTrigger className="text-sm font-medium">Email Design</AccordionTrigger>
            <AccordionContent className="space-y-4">
              <Field label="Canvas Width">
                <div className="flex items-center gap-3">
                  <Slider
                    value={[Number(theme.width || 640)]}
                    onValueChange={([value]) => updateTheme({ width: value })}
                    min={360}
                    max={960}
                    step={10}
                    className="flex-1"
                  />
                  <span className="w-12 text-right text-xs text-muted-foreground">{theme.width}px</span>
                </div>
              </Field>

              <Field label="Font Family">
                <select
                  value={theme.fontFamily}
                  onChange={(event) => updateTheme({ fontFamily: event.target.value })}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none"
                >
                  {fontFamilies.map((font) => (
                    <option key={font} value={font}>
                      {font}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Page Background">
                <ColorInput value={theme.bodyBackground} onChange={(value) => updateTheme({ bodyBackground: value })} />
              </Field>

              <Field label="Card Background">
                <ColorInput value={theme.contentBackground} onChange={(value) => updateTheme({ contentBackground: value })} />
              </Field>

              <Field label="Body Text Color">
                <ColorInput value={theme.textColor} onChange={(value) => updateTheme({ textColor: value })} />
              </Field>

              <Field label="Heading Color">
                <ColorInput value={theme.headingColor} onChange={(value) => updateTheme({ headingColor: value })} />
              </Field>

              <Field label="Link Accent">
                <ColorInput value={theme.linkColor} onChange={(value) => updateTheme({ linkColor: value })} />
              </Field>
            </AccordionContent>
          </AccordionItem>
        ) : (
          <AccordionItem value="plain-text">
            <AccordionTrigger className="text-sm font-medium">Plain Text Tips</AccordionTrigger>
            <AccordionContent className="space-y-3">
              <div className="rounded-lg border border-emerald-200 bg-emerald-50/80 p-3 text-xs leading-5 text-emerald-800">
                Keep plain text emails short, personal, and easy to reply to. Think conversational note, not newsletter.
              </div>
              <MetricCard label="Ideal Length" value="80-120 words" />
              <MetricCard label="Best CTA" value="One simple question" />
              <MetricCard label="Formatting" value="Short paragraphs, no heavy styling" />
            </AccordionContent>
          </AccordionItem>
        )}

        <AccordionItem value="insights">
          <AccordionTrigger className="text-sm font-medium">Build Insights</AccordionTrigger>
          <AccordionContent className="space-y-3">
            <MetricCard label="Blocks" value={String(currentTemplate.blocks.length)} />
            <MetricCard label="Words" value={String(wordCount)} />
            <MetricCard label="Read Time" value={`~${readingTime} min`} />
            <div className="rounded-lg border border-border bg-accent p-3">
              <p className="text-xs font-semibold text-accent-foreground">Guidance Snapshot</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Audience: {currentTemplate.audience || 'Not set'} | Goal: {currentTemplate.goal || 'Not set'} | Tone:{' '}
                {currentTemplate.voice}
              </p>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}

function BlockSettings() {
  const { selectedBlockId, currentTemplate, updateBlock, selectBlock } = useEmailBuilderStore();
  const block = currentTemplate?.blocks.find((item) => item.id === selectedBlockId);
  const [rawContent, setRawContent] = useState('{}');
  const [rawStyles, setRawStyles] = useState('{}');

  useEffect(() => {
    if (!block) return;
    setRawContent(safeStringify(block.content));
    setRawStyles(safeStringify(block.styles));
  }, [block?.id]);

  if (!block) return null;

  const update = (content: Record<string, any>) => updateBlock(block.id, { content: { ...block.content, ...content } });
  const updateStyles = (styles: Record<string, any>) => updateBlock(block.id, { styles: { ...block.styles, ...styles } });
  const updateRichText = (value: string) =>
    update({
      text: value,
      html: plainTextToRichHtml(value, block.type),
    });
  const updateRichHtml = (value: string) =>
    update({
      html: value,
      text: stripHtml(value),
    });

  const applyRawContent = () => {
    try {
      const parsed = JSON.parse(rawContent);
      if (parsed && typeof parsed === 'object') {
        updateBlock(block.id, { content: parsed });
      }
    } catch {
      return;
    }
  };

  const applyRawStyles = () => {
    try {
      const parsed = JSON.parse(rawStyles);
      if (parsed && typeof parsed === 'object') {
        updateBlock(block.id, { styles: parsed });
      }
    } catch {
      return;
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between border-b border-border p-4">
        <div>
          <h3 className="text-sm font-semibold capitalize text-foreground">{block.type} Block</h3>
          <p className="text-xs text-muted-foreground">Adjust content, styling, and advanced properties.</p>
        </div>
        <button onClick={() => selectBlock(null)} className="text-xs font-medium text-primary hover:underline">
          Done
        </button>
      </div>

      <div className="space-y-4 p-4">
        {(block.type === 'heading' || block.type === 'text' || block.type === 'quote' || block.type === 'signature') && (
          <>
            <Field label="Quick Rewrite" hint="This is the fastest way to rewrite the visible content.">
              <Textarea value={String(block.content.text || '')} onChange={(event) => updateRichText(event.target.value)} rows={6} className="text-sm" />
            </Field>
            <Field label="Rich HTML" hint="Use this if you need links, bold text, lists, or custom markup.">
              <Textarea value={String(block.content.html || '')} onChange={(event) => updateRichHtml(event.target.value)} rows={6} className="text-xs font-mono" />
            </Field>
          </>
        )}

        {block.type === 'heading' && (
          <Field label="Heading Level">
            <ToggleGroup
              options={[
                ['h1', 'H1'],
                ['h2', 'H2'],
                ['h3', 'H3'],
                ['h4', 'H4'],
              ]}
              value={String(block.content.level || 'h2')}
              onChange={(value) => update({ level: value })}
            />
          </Field>
        )}

        {block.type === 'button' && (
          <>
            <Field label="Button Text">
              <Input value={block.content.text} onChange={(event) => update({ text: event.target.value })} className="text-sm" />
            </Field>
            <Field label="URL">
              <Input value={block.content.url} onChange={(event) => update({ url: event.target.value })} className="text-sm" placeholder="https://..." />
            </Field>
            <Field label="Alignment">
              <ToggleGroup
                options={[
                  ['left', 'Left'],
                  ['center', 'Center'],
                  ['right', 'Right'],
                ]}
                value={String(block.content.align || 'center')}
                onChange={(value) => update({ align: value })}
              />
            </Field>
            <Field label="Button Color">
              <ColorInput value={block.content.bgColor || '#2a9d6e'} onChange={(value) => update({ bgColor: value })} />
            </Field>
            <Field label="Text Color">
              <ColorInput value={block.content.textColor || '#ffffff'} onChange={(value) => update({ textColor: value })} />
            </Field>
            <Field label="Border Radius">
              <Input value={block.content.borderRadius || '8px'} onChange={(event) => update({ borderRadius: event.target.value })} className="text-sm" placeholder="8px" />
            </Field>
            <Field label="Padding">
              <Input value={block.content.buttonPadding || '10px 24px'} onChange={(event) => update({ buttonPadding: event.target.value })} className="text-sm" placeholder="10px 24px" />
            </Field>
          </>
        )}

        {block.type === 'image' && (
          <>
            <Field label="Image URL">
              <Input value={block.content.src} onChange={(event) => update({ src: event.target.value })} className="text-sm" placeholder="https://..." />
            </Field>
            <Field label="Alt Text">
              <Input value={block.content.alt} onChange={(event) => update({ alt: event.target.value })} className="text-sm" />
            </Field>
            <Field label="Width">
              <Input value={block.content.width || '100%'} onChange={(event) => update({ width: event.target.value })} className="text-sm" placeholder="100%" />
            </Field>
          </>
        )}

        {block.type === 'divider' && (
          <>
            <Field label="Color">
              <ColorInput value={block.content.color || '#e5e5e5'} onChange={(value) => update({ color: value })} />
            </Field>
            <Field label="Thickness (px)">
              <Input
                type="number"
                value={block.content.thickness || 1}
                onChange={(event) => update({ thickness: parseInt(event.target.value, 10) || 1 })}
                className="text-sm"
              />
            </Field>
            <Field label="Style">
              <ToggleGroup
                options={[
                  ['solid', 'Solid'],
                  ['dashed', 'Dashed'],
                  ['dotted', 'Dotted'],
                ]}
                value={String(block.content.style || 'solid')}
                onChange={(value) => update({ style: value })}
              />
            </Field>
          </>
        )}

        {block.type === 'spacer' && (
          <Field label="Height (px)">
            <div className="flex items-center gap-3">
              <Slider
                value={[block.content.height || 24]}
                onValueChange={([value]) => update({ height: value })}
                min={8}
                max={160}
                step={4}
                className="flex-1"
              />
              <span className="w-10 text-right text-xs text-muted-foreground">{block.content.height || 24}</span>
            </div>
          </Field>
        )}

        {block.type === 'columns' && (
          <>
            <Field label="Columns">
              <ToggleGroup
                options={[
                  ['2', '2'],
                  ['3', '3'],
                ]}
                value={String(block.content.count || 2)}
                onChange={(value) => {
                  const count = parseInt(value, 10);
                  const content = Array.from({ length: count }, (_, index) => block.content.content?.[index] || { text: `Column ${index + 1}` });
                  update({ count, content });
                }}
              />
            </Field>

            {(block.content.content || []).map((column: any, index: number) => (
              <Field key={index} label={`Column ${index + 1}`}>
                <Textarea
                  value={String(column?.text || '')}
                  onChange={(event) => {
                    const content = [...(block.content.content || [])];
                    content[index] = {
                      ...(content[index] || {}),
                      text: event.target.value,
                      html: plainTextToRichHtml(event.target.value, 'text'),
                    };
                    update({ content });
                  }}
                  rows={4}
                  className="text-sm"
                />
              </Field>
            ))}
          </>
        )}

        {block.type === 'table' && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Rows">
                <Input
                  type="number"
                  value={block.content.rows || 3}
                  onChange={(event) => {
                    const rows = Math.max(1, parseInt(event.target.value, 10) || 1);
                    const cols = Math.max(1, parseInt(String(block.content.cols || 3), 10) || 1);
                    update({ rows, data: resizeTableData(block.content.data || [], rows, cols) });
                  }}
                  className="text-sm"
                />
              </Field>
              <Field label="Columns">
                <Input
                  type="number"
                  value={block.content.cols || 3}
                  onChange={(event) => {
                    const cols = Math.max(1, parseInt(event.target.value, 10) || 1);
                    const rows = Math.max(1, parseInt(String(block.content.rows || 3), 10) || 1);
                    update({ cols, data: resizeTableData(block.content.data || [], rows, cols) });
                  }}
                  className="text-sm"
                />
              </Field>
            </div>
            <div className="space-y-2">
              {(block.content.data || []).map((row: string[], rowIndex: number) => (
                <div key={rowIndex} className="grid gap-2" style={{ gridTemplateColumns: `repeat(${row.length || 1}, minmax(0, 1fr))` }}>
                  {row.map((cell: string, cellIndex: number) => (
                    <Input
                      key={cellIndex}
                      value={cell}
                      onChange={(event) => {
                        const totalRows = Math.max(1, parseInt(String(block.content.rows || (block.content.data || []).length || 1), 10) || 1);
                        const totalCols = Math.max(1, parseInt(String(block.content.cols || row.length || 1), 10) || 1);
                        const data = resizeTableData(block.content.data || [], totalRows, totalCols);
                        data[rowIndex][cellIndex] = event.target.value;
                        update({ data });
                      }}
                      className="text-sm"
                      placeholder={rowIndex === 0 ? 'Header' : 'Cell'}
                    />
                  ))}
                </div>
              ))}
            </div>
          </>
        )}

        {block.type === 'social' && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold">Social Links</Label>
              <Button
                size="sm"
                variant="outline"
                onClick={() => update({ links: [...(block.content.links || []), { platform: 'new', url: '' }] })}
              >
                Add Link
              </Button>
            </div>
            {(block.content.links || []).map((link: any, index: number) => (
              <div key={index} className="grid grid-cols-[5rem,minmax(0,1fr),auto] gap-2">
                <Input
                  value={link.platform}
                  onChange={(event) => {
                    const links = [...(block.content.links || [])];
                    links[index] = { ...links[index], platform: event.target.value };
                    update({ links });
                  }}
                  className="text-sm"
                  placeholder="Platform"
                />
                <Input
                  value={link.url}
                  onChange={(event) => {
                    const links = [...(block.content.links || [])];
                    links[index] = { ...links[index], url: event.target.value };
                    update({ links });
                  }}
                  className="text-sm"
                  placeholder="https://..."
                />
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    const links = [...(block.content.links || [])];
                    links.splice(index, 1);
                    update({ links });
                  }}
                >
                  Remove
                </Button>
              </div>
            ))}
          </div>
        )}

        {block.type === 'bookmark' && (
          <>
            <Field label="Title">
              <Input value={block.content.title} onChange={(event) => update({ title: event.target.value })} className="text-sm" />
            </Field>
            <Field label="URL">
              <Input value={block.content.url} onChange={(event) => update({ url: event.target.value })} className="text-sm" placeholder="https://..." />
            </Field>
            <Field label="Description">
              <Textarea value={block.content.description} onChange={(event) => update({ description: event.target.value })} className="text-sm" rows={3} />
            </Field>
          </>
        )}

        {block.type === 'code' && (
          <>
            <Field label="Language">
              <Input value={block.content.language || 'plain'} onChange={(event) => update({ language: event.target.value })} className="text-sm" />
            </Field>
            <Field label="Code">
              <Textarea
                value={block.content.text}
                onChange={(event) => update({ text: event.target.value, html: `<code>${escapeHtml(event.target.value)}</code>` })}
                className="text-sm font-mono"
                rows={7}
              />
            </Field>
          </>
        )}

        {block.type === 'video' && (
          <>
            <Field label="Video URL">
              <Input value={block.content.url || ''} onChange={(event) => update({ url: event.target.value })} className="text-sm" placeholder="https://..." />
            </Field>
            <Field label="Title">
              <Input value={block.content.title || ''} onChange={(event) => update({ title: event.target.value })} className="text-sm" placeholder="Watch video" />
            </Field>
            <Field label="Thumbnail URL">
              <Input
                value={block.content.thumbnail || ''}
                onChange={(event) => update({ thumbnail: event.target.value })}
                className="text-sm"
                placeholder="https://..."
              />
            </Field>
          </>
        )}

        {block.type === 'countdown' && (
          <>
            <Field label="Label">
              <Input value={block.content.label} onChange={(event) => update({ label: event.target.value })} className="text-sm" />
            </Field>
            <Field label="Target Date">
              <Input
                type="datetime-local"
                value={block.content.targetDate}
                onChange={(event) => update({ targetDate: event.target.value })}
                className="text-sm"
              />
            </Field>
          </>
        )}

        <div className="space-y-3 border-t border-border pt-3">
          <p className="text-xs font-semibold text-foreground">Styles</p>
          <Field label="Padding">
            <Input value={block.styles.padding || '16px'} onChange={(event) => updateStyles({ padding: event.target.value })} className="text-sm" placeholder="16px" />
          </Field>
          <Field label="Margin">
            <Input value={block.styles.margin || '0'} onChange={(event) => updateStyles({ margin: event.target.value })} className="text-sm" placeholder="0" />
          </Field>
          <Field label="Background">
              <ColorInput value={block.styles.backgroundColor || 'transparent'} onChange={(value) => updateStyles({ backgroundColor: value })} allowTransparent />
            </Field>
          <Field label="Text Color">
            <ColorInput value={block.styles.color || '#0f172a'} onChange={(value) => updateStyles({ color: value })} />
          </Field>
          <Field label="Border Radius">
            <Input value={block.styles.borderRadius || '0'} onChange={(event) => updateStyles({ borderRadius: event.target.value })} className="text-sm" placeholder="0" />
          </Field>
          <Field label="Border">
            <Input
              value={block.styles.border || ''}
              onChange={(event) => updateStyles({ border: event.target.value })}
              className="text-sm"
              placeholder="1px solid #e2e8f0"
            />
          </Field>
          <Field label="Text Alignment">
            <ToggleGroup
              options={[
                ['left', 'Left'],
                ['center', 'Center'],
                ['right', 'Right'],
              ]}
              value={String(block.styles.textAlign || 'left')}
              onChange={(value) => updateStyles({ textAlign: value })}
            />
          </Field>
        </div>

        <Accordion type="multiple" defaultValue={[]} className="rounded-lg border border-border px-3">
          <AccordionItem value="advanced-content">
            <AccordionTrigger className="text-xs font-medium">Advanced JSON</AccordionTrigger>
            <AccordionContent className="space-y-4 pb-3">
              <Field label="Content JSON" hint="Use this for fields not exposed in the UI.">
                <Textarea value={rawContent} onChange={(event) => setRawContent(event.target.value)} rows={8} className="text-xs font-mono" />
                <Button size="sm" variant="outline" onClick={applyRawContent} className="mt-2">
                  Apply Content JSON
                </Button>
              </Field>
              <Field label="Style JSON" hint="Apply advanced style overrides directly.">
                <Textarea value={rawStyles} onChange={(event) => setRawStyles(event.target.value)} rows={8} className="text-xs font-mono" />
                <Button size="sm" variant="outline" onClick={applyRawStyles} className="mt-2">
                  Apply Style JSON
                </Button>
              </Field>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="block text-xs">{label}</Label>
      {children}
      {hint ? <p className="text-[11px] leading-4 text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function ToggleGroup({
  options,
  value,
  onChange,
}: {
  options: Array<[string, string]>;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(([rawValue, label]) => (
        <button
          key={rawValue}
          onClick={() => onChange(rawValue)}
          className={cn(
            'rounded-md border px-3 py-1.5 text-xs font-medium transition-colors',
            value === rawValue ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted'
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function ColorInput({
  value,
  onChange,
  allowTransparent = false,
}: {
  value: string;
  onChange: (value: string) => void;
  allowTransparent?: boolean;
}) {
  const swatchValue = value === 'transparent' ? '#ffffff' : normalizeSwatchColor(value);

  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={swatchValue}
        onChange={(event) => onChange(event.target.value)}
        className="h-8 w-8 cursor-pointer rounded border border-border"
      />
      <Input value={value} onChange={(event) => onChange(event.target.value)} className="flex-1 text-sm" />
      {allowTransparent && value !== 'transparent' ? (
        <Button size="sm" variant="outline" onClick={() => onChange('transparent')}>
          Clear
        </Button>
      ) : null}
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/20 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}

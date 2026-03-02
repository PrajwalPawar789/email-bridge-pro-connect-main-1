import { useEmailBuilderStore } from '@/stores/emailBuilderStore';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';

export function EmailSettingsPanel() {
  const { currentTemplate, selectedBlockId } = useEmailBuilderStore();
  const selectedBlock = currentTemplate?.blocks.find(b => b.id === selectedBlockId);

  return (
    <div className="h-full w-full border-l border-border bg-card overflow-y-auto scrollbar-thin">
      {selectedBlock ? <BlockSettings /> : <TemplateSettings />}
    </div>
  );
}

function TemplateSettings() {
  const { currentTemplate, updateTemplateField } = useEmailBuilderStore();
  if (!currentTemplate) return null;

  return (
    <div>
      <div className="p-4 border-b border-border">
        <h3 className="text-sm font-semibold text-foreground">Template Blueprint</h3>
        <p className="text-xs text-muted-foreground mt-0.5">Configure your template settings</p>
      </div>
      <Accordion type="multiple" defaultValue={["basics", "audience", "voice"]} className="px-4">
        <AccordionItem value="basics">
          <AccordionTrigger className="text-sm font-medium">Basics</AccordionTrigger>
          <AccordionContent className="space-y-3">
            <div>
              <Label className="text-xs">Template Name</Label>
              <Input placeholder="e.g., Cold Outreach - Follow Up 1" value={currentTemplate.name} onChange={(e) => updateTemplateField('name', e.target.value)} className="mt-1 text-sm" />
            </div>
            <div>
              <Label className="text-xs">Subject Line</Label>
              <Input placeholder="Quick question for {company}..." value={currentTemplate.subject} onChange={(e) => updateTemplateField('subject', e.target.value)} className="mt-1 text-sm" />
              <p className="text-xs text-muted-foreground mt-1">{currentTemplate.subject.length} chars</p>
            </div>
            <div>
              <Label className="text-xs">Format</Label>
              <div className="flex gap-2 mt-1">
                {['plain', 'html'].map(f => (
                  <button key={f} onClick={() => updateTemplateField('format', f)} className={cn("px-3 py-1.5 rounded-md text-xs font-medium border transition-colors", currentTemplate.format === f ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted')}>
                    {f === 'plain' ? 'Plain text' : 'HTML'}
                  </button>
                ))}
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="audience">
          <AccordionTrigger className="text-sm font-medium">Audience</AccordionTrigger>
          <AccordionContent>
            <Input placeholder="All industries, any size..." value={currentTemplate.audience} onChange={(e) => updateTemplateField('audience', e.target.value)} className="text-sm" />
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="voice">
          <AccordionTrigger className="text-sm font-medium">Voice and Length</AccordionTrigger>
          <AccordionContent className="space-y-2">
            {['Professional', 'Casual', 'Friendly', 'Formal'].map(v => (
              <button key={v} onClick={() => updateTemplateField('voice', v)} className={cn("w-full px-3 py-2 rounded-md text-xs text-left font-medium border transition-colors", currentTemplate.voice === v ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted')}>
                {v}
              </button>
            ))}
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="goal">
          <AccordionTrigger className="text-sm font-medium">Goal and CTA</AccordionTrigger>
          <AccordionContent>
            <Input placeholder="Cold outreach, nurture, re-engage..." value={currentTemplate.goal} onChange={(e) => updateTemplateField('goal', e.target.value)} className="text-sm" />
          </AccordionContent>
        </AccordionItem>
      </Accordion>
      <div className="mx-4 my-4 p-3 rounded-lg bg-accent border border-block-border">
        <p className="text-xs font-semibold text-accent-foreground mb-1">Guidance</p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Audience: {currentTemplate.audience || 'Not set'} | Goal: {currentTemplate.goal || 'Not set'} | Tone: {currentTemplate.voice}
        </p>
      </div>
    </div>
  );
}

function BlockSettings() {
  const { selectedBlockId, currentTemplate, updateBlock, selectBlock } = useEmailBuilderStore();
  const block = currentTemplate?.blocks.find(b => b.id === selectedBlockId);
  if (!block) return null;

  const update = (content: Record<string, any>) => updateBlock(block.id, { content: { ...block.content, ...content } });
  const updateStyles = (styles: Record<string, any>) => updateBlock(block.id, { styles: { ...block.styles, ...styles } });

  return (
    <div>
      <div className="p-4 border-b border-border flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground capitalize">{block.type} Block</h3>
          <p className="text-xs text-muted-foreground">Edit block properties</p>
        </div>
        <button onClick={() => selectBlock(null)} className="text-xs text-primary hover:underline font-medium">Done</button>
      </div>

      <div className="p-4 space-y-4">
        {/* Rich text blocks - no content textarea since they have inline editing */}
        {(block.type === 'heading' || block.type === 'text' || block.type === 'quote' || block.type === 'signature') && (
          <div className="p-3 bg-accent/50 rounded-lg">
            <p className="text-xs text-muted-foreground">
              Tip: click the block in the canvas to edit content with the rich text toolbar. Use <b>Ctrl+B</b> for bold, <b>Ctrl+I</b> for italic, <b>Ctrl+U</b> for underline.
            </p>
          </div>
        )}

        {block.type === 'button' && (
          <>
            <Field label="Button Text">
              <Input value={block.content.text} onChange={(e) => update({ text: e.target.value })} className="text-sm" />
            </Field>
            <Field label="URL">
              <Input value={block.content.url} onChange={(e) => update({ url: e.target.value })} className="text-sm" placeholder="https://..." />
            </Field>
            <Field label="Alignment">
              <ToggleGroup options={['left', 'center', 'right']} value={block.content.align} onChange={(v) => update({ align: v })} />
            </Field>
            <Field label="Button Color">
              <div className="flex gap-2 items-center">
                <input type="color" value={block.content.bgColor || '#2a9d6e'} onChange={(e) => update({ bgColor: e.target.value })} className="w-8 h-8 rounded border border-border cursor-pointer" />
                <Input value={block.content.bgColor || '#2a9d6e'} onChange={(e) => update({ bgColor: e.target.value })} className="text-sm flex-1" />
              </div>
            </Field>
            <Field label="Text Color">
              <div className="flex gap-2 items-center">
                <input type="color" value={block.content.textColor || '#ffffff'} onChange={(e) => update({ textColor: e.target.value })} className="w-8 h-8 rounded border border-border cursor-pointer" />
                <Input value={block.content.textColor || '#ffffff'} onChange={(e) => update({ textColor: e.target.value })} className="text-sm flex-1" />
              </div>
            </Field>
            <Field label="Border Radius">
              <Input value={block.content.borderRadius || '8px'} onChange={(e) => update({ borderRadius: e.target.value })} className="text-sm" placeholder="8px" />
            </Field>
          </>
        )}

        {block.type === 'image' && (
          <>
            <Field label="Image URL">
              <Input value={block.content.src} onChange={(e) => update({ src: e.target.value })} className="text-sm" placeholder="https://..." />
            </Field>
            <Field label="Alt Text">
              <Input value={block.content.alt} onChange={(e) => update({ alt: e.target.value })} className="text-sm" />
            </Field>
            <Field label="Width">
              <Input value={block.content.width || '100%'} onChange={(e) => update({ width: e.target.value })} className="text-sm" placeholder="100%" />
            </Field>
          </>
        )}

        {block.type === 'divider' && (
          <>
            <Field label="Color">
              <div className="flex gap-2 items-center">
                <input type="color" value={block.content.color || '#e5e5e5'} onChange={(e) => update({ color: e.target.value })} className="w-8 h-8 rounded border border-border cursor-pointer" />
                <Input value={block.content.color || '#e5e5e5'} onChange={(e) => update({ color: e.target.value })} className="text-sm flex-1" />
              </div>
            </Field>
            <Field label="Thickness (px)">
              <Input type="number" value={block.content.thickness || 1} onChange={(e) => update({ thickness: parseInt(e.target.value) || 1 })} className="text-sm" />
            </Field>
            <Field label="Style">
              <ToggleGroup options={['solid', 'dashed', 'dotted']} value={block.content.style || 'solid'} onChange={(v) => update({ style: v })} />
            </Field>
          </>
        )}

        {block.type === 'spacer' && (
          <Field label="Height (px)">
            <div className="flex items-center gap-3">
              <Slider value={[block.content.height || 24]} onValueChange={([v]) => update({ height: v })} min={8} max={120} step={4} className="flex-1" />
              <span className="text-xs text-muted-foreground w-8 text-right">{block.content.height || 24}</span>
            </div>
          </Field>
        )}

        {block.type === 'columns' && (
          <Field label="Columns">
            <ToggleGroup options={['2', '3']} value={String(block.content.count || 2)} onChange={(v) => {
              const count = parseInt(v);
              const content = Array.from({ length: count }, (_, i) => block.content.content?.[i] || { text: `Column ${i + 1}` });
              update({ count, content });
            }} />
          </Field>
        )}

        {block.type === 'countdown' && (
          <>
            <Field label="Label">
              <Input value={block.content.label} onChange={(e) => update({ label: e.target.value })} className="text-sm" />
            </Field>
            <Field label="Target Date">
              <Input type="datetime-local" value={block.content.targetDate} onChange={(e) => update({ targetDate: e.target.value })} className="text-sm" />
            </Field>
          </>
        )}

        {block.type === 'social' && (
          <div className="space-y-2">
            <Label className="text-xs font-semibold">Social Links</Label>
            {block.content.links?.map((link: any, i: number) => (
              <div key={i} className="flex gap-2">
                <Input value={link.platform} onChange={(e) => {
                  const links = [...block.content.links];
                  links[i] = { ...links[i], platform: e.target.value };
                  update({ links });
                }} className="text-sm w-24" placeholder="Platform" />
                <Input value={link.url} onChange={(e) => {
                  const links = [...block.content.links];
                  links[i] = { ...links[i], url: e.target.value };
                  update({ links });
                }} className="text-sm flex-1" placeholder="URL" />
              </div>
            ))}
          </div>
        )}

        {block.type === 'bookmark' && (
          <>
            <Field label="Title"><Input value={block.content.title} onChange={(e) => update({ title: e.target.value })} className="text-sm" /></Field>
            <Field label="URL"><Input value={block.content.url} onChange={(e) => update({ url: e.target.value })} className="text-sm" placeholder="https://..." /></Field>
            <Field label="Description"><Textarea value={block.content.description} onChange={(e) => update({ description: e.target.value })} className="text-sm" rows={2} /></Field>
          </>
        )}

        {block.type === 'code' && (
          <Field label="Code">
            <Textarea value={block.content.text} onChange={(e) => update({ text: e.target.value, html: `<code>${e.target.value}</code>` })} className="text-sm font-mono" rows={5} />
          </Field>
        )}

        {/* Common style settings */}
        <div className="pt-3 border-t border-border space-y-3">
          <p className="text-xs font-semibold text-foreground">Styles</p>
          <Field label="Padding">
            <Input value={block.styles.padding || '16px'} onChange={(e) => updateStyles({ padding: e.target.value })} className="text-sm" placeholder="16px" />
          </Field>
          <Field label="Background">
            <div className="flex gap-2 items-center">
              <input type="color" value={block.styles.backgroundColor === 'transparent' ? '#ffffff' : (block.styles.backgroundColor || '#ffffff')} onChange={(e) => updateStyles({ backgroundColor: e.target.value })} className="w-8 h-8 rounded border border-border cursor-pointer" />
              <Input value={block.styles.backgroundColor || 'transparent'} onChange={(e) => updateStyles({ backgroundColor: e.target.value })} className="text-sm flex-1" />
            </div>
          </Field>
          <Field label="Border Radius">
            <Input value={block.styles.borderRadius || '0'} onChange={(e) => updateStyles({ borderRadius: e.target.value })} className="text-sm" placeholder="0" />
          </Field>
          <Field label="Margin">
            <Input value={block.styles.margin || '0'} onChange={(e) => updateStyles({ margin: e.target.value })} className="text-sm" placeholder="0" />
          </Field>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-xs mb-1 block">{label}</Label>
      {children}
    </div>
  );
}

function ToggleGroup({ options, value, onChange }: { options: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex gap-1.5">
      {options.map(o => (
        <button key={o} onClick={() => onChange(o)} className={cn("px-3 py-1.5 rounded-md text-xs font-medium border transition-colors capitalize", value === o ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted')}>
          {o}
        </button>
      ))}
    </div>
  );
}


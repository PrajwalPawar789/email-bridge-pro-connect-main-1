import { useEffect, useMemo, useState } from 'react';
import { useLandingPageStore, LPBlockType, LPBlock } from '@/stores/landingPageStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Plus,
  FileText,
  ArrowLeft,
  Save,
  Monitor,
  Tablet,
  Smartphone,
  Trash2,
  GripVertical,
  Layout,
  Type,
  Image,
  MousePointer,
  Star,
  CreditCard,
  HelpCircle,
  Mail,
  Menu,
  BarChart3,
  Video,
  ExternalLink,
  Sparkles,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { DndContext, closestCenter, DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  LANDING_PAGE_TEMPLATES,
  DEFAULT_LANDING_PAGE_TEMPLATE_ID,
  buildLandingPageTemplateBlocks,
  createLandingPageBlock,
  getLandingPageTemplateById,
} from '@/lib/landingPageTemplates';
import { AiLandingPageDialog } from '@/components/ai/AiLandingPageDialog';

const lpBlockTypes: { type: LPBlockType; label: string; icon: any }[] = [
  { type: 'navbar', label: 'Navbar', icon: Menu },
  { type: 'hero', label: 'Hero', icon: Layout },
  { type: 'features', label: 'Features', icon: Star },
  { type: 'text', label: 'Text', icon: Type },
  { type: 'image', label: 'Image', icon: Image },
  { type: 'cta', label: 'CTA', icon: MousePointer },
  { type: 'testimonial', label: 'Testimonials', icon: Star },
  { type: 'pricing', label: 'Pricing', icon: CreditCard },
  { type: 'faq', label: 'FAQ', icon: HelpCircle },
  { type: 'form', label: 'Form', icon: Mail },
  { type: 'stats', label: 'Stats', icon: BarChart3 },
  { type: 'gallery', label: 'Gallery', icon: Image },
  { type: 'video', label: 'Video', icon: Video },
  { type: 'footer', label: 'Footer', icon: Layout },
];

const slugifyValue = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

const splitByComma = (value: string) =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

const safeStringify = (value: unknown) => {
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return '{}';
  }
};

function SortableLPBlock({ block }: { block: LPBlock }) {
  const { selectedBlockId, selectBlock, removeBlock } = useLandingPageStore();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id });
  const isSelected = selectedBlockId === block.id;

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn('group relative', isDragging && 'opacity-50')}
      onClick={(event) => {
        event.stopPropagation();
        selectBlock(block.id);
      }}
    >
      <div className="absolute -left-10 top-4 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
        <button {...attributes} {...listeners} className="p-1 rounded hover:bg-muted text-muted-foreground" title="Drag section">
          <GripVertical className="w-3 h-3" />
        </button>
        <button
          onClick={(event) => {
            event.stopPropagation();
            removeBlock(block.id);
          }}
          className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
          title="Delete section"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
      <div
        className={cn(
          'border-2 rounded-xl transition-all',
          isSelected ? 'border-primary shadow-[0_0_0_2px_hsl(var(--primary)/0.12)]' : 'border-transparent hover:border-border'
        )}
        style={block.styles as React.CSSProperties}
      >
        <LPBlockRenderer block={block} />
      </div>
    </div>
  );
}

function LPBlockRenderer({ block }: { block: LPBlock }) {
  switch (block.type) {
    case 'navbar':
      return (
        <div className="flex flex-wrap items-center justify-between gap-3 px-8 py-4 bg-card">
          <span className="font-bold text-foreground">{block.content.brand}</span>
          <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
            {block.content.links?.map((item: string) => <span key={item}>{item}</span>)}
          </div>
        </div>
      );
    case 'hero':
      return (
        <div className="px-8 py-20 text-center bg-gradient-to-b from-accent to-card">
          <h1 className="text-4xl font-bold text-foreground mb-4">{block.content.headline}</h1>
          <p className="text-lg text-muted-foreground mb-6 max-w-xl mx-auto">{block.content.subheadline}</p>
          <span className="inline-block px-8 py-3 bg-primary text-primary-foreground rounded-lg font-medium">{block.content.ctaText}</span>
        </div>
      );
    case 'features':
      return (
        <div className="px-8 py-12">
          <h2 className="text-2xl font-bold text-foreground text-center mb-8">{block.content.title}</h2>
          <div className="grid gap-6 md:grid-cols-3">
            {(block.content.items || []).map((item: any, index: number) => (
              <div key={index} className="p-4 rounded-xl bg-muted/50 text-center">
                <h3 className="font-semibold text-foreground mb-1">{item.title}</h3>
                <p className="text-sm text-muted-foreground">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      );
    case 'text':
      return <div className="px-8 py-10 text-base text-foreground whitespace-pre-wrap">{block.content.content}</div>;
    case 'image':
      return (
        <div className="px-8 py-10 text-center">
          {block.content.src ? (
            <img src={block.content.src} alt={block.content.alt || 'Image'} className="mx-auto max-w-full rounded-xl border border-border" />
          ) : (
            <div className="mx-auto h-40 max-w-xl rounded-xl border-2 border-dashed border-border bg-muted/40 flex items-center justify-center text-sm text-muted-foreground">
              Add an image URL in settings
            </div>
          )}
        </div>
      );
    case 'cta':
      return (
        <div className="px-8 py-16 text-center bg-primary/5">
          <h2 className="text-2xl font-bold text-foreground mb-4">{block.content.headline}</h2>
          <span className="inline-block px-8 py-3 bg-primary text-primary-foreground rounded-lg font-medium">{block.content.buttonText}</span>
        </div>
      );
    case 'testimonial':
      return (
        <div className="px-8 py-12">
          {(block.content.items || []).map((item: any, index: number) => (
            <div key={index} className="max-w-lg mx-auto text-center">
              <p className="text-lg text-foreground italic mb-3">"{item.quote}"</p>
              <p className="text-sm font-medium text-foreground">{item.name}</p>
              <p className="text-xs text-muted-foreground">{item.role}</p>
            </div>
          ))}
        </div>
      );
    case 'pricing':
      return (
        <div className="px-8 py-12">
          <h2 className="text-2xl font-bold text-foreground text-center mb-8">{block.content.title}</h2>
          <div className="grid gap-6 max-w-4xl mx-auto md:grid-cols-2 lg:grid-cols-3">
            {(block.content.plans || []).map((plan: any, index: number) => (
              <div key={index} className="border border-border rounded-xl p-6 bg-card">
                <h3 className="font-semibold text-foreground">{plan.name}</h3>
                <p className="text-2xl font-bold text-primary my-2">{plan.price}</p>
              </div>
            ))}
          </div>
        </div>
      );
    case 'faq':
      return (
        <div className="px-8 py-12 space-y-3">
          <h2 className="text-2xl font-bold text-foreground">{block.content.title || 'FAQ'}</h2>
          {(block.content.items || []).map((item: any, index: number) => (
            <details key={index} className="rounded-lg border border-border bg-card p-4">
              <summary className="cursor-pointer font-medium text-foreground">{item.q}</summary>
              <p className="mt-2 text-sm text-muted-foreground">{item.a}</p>
            </details>
          ))}
        </div>
      );
    case 'form':
      return <div className="px-8 py-12 text-muted-foreground">{block.content.title || 'Contact form'}</div>;
    case 'stats':
      return (
        <div className="px-8 py-12 flex flex-wrap justify-center gap-12">
          {(block.content.items || []).map((item: any, index: number) => (
            <div key={index} className="text-center">
              <div className="text-3xl font-bold text-primary">{item.value}</div>
              <div className="text-sm text-muted-foreground">{item.label}</div>
            </div>
          ))}
        </div>
      );
    case 'video':
      return <div className="px-8 py-12 text-center text-muted-foreground">{block.content.title || 'Video section'}</div>;
    case 'footer':
      return <div className="px-8 py-6 bg-muted/50 text-sm text-muted-foreground">© {block.content.brand}</div>;
    default:
      return <div className="px-8 py-8 text-sm text-muted-foreground">{block.type} section</div>;
  }
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold text-foreground">{label}</Label>
      {children}
      {hint ? <p className="text-[11px] leading-4 text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function LandingPageSettingsPanel({
  block,
  sectionCount,
  onClose,
  onUpdate,
}: {
  block: LPBlock | null;
  sectionCount: number;
  onClose: () => void;
  onUpdate: (id: string, updates: Partial<LPBlock>) => void;
}) {
  const [rawContent, setRawContent] = useState('{}');

  useEffect(() => {
    if (!block) {
      setRawContent('{}');
      return;
    }
    setRawContent(safeStringify(block.content));
  }, [block]);

  if (!block) {
    return (
      <div className="h-full w-80 border-l border-border bg-card overflow-y-auto scrollbar-thin shrink-0">
        <div className="p-4 border-b border-border">
          <h3 className="text-sm font-semibold text-foreground">Section Settings</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Select a section to edit.</p>
        </div>
        <div className="p-4">
          <p className="text-xs text-muted-foreground">{sectionCount} sections on this page.</p>
        </div>
      </div>
    );
  }

  const updateContent = (patch: Record<string, any>) => onUpdate(block.id, { content: { ...(block.content || {}), ...patch } });
  const updateStyles = (patch: Record<string, any>) => onUpdate(block.id, { styles: { ...(block.styles || {}), ...patch } });

  const applyRawContent = () => {
    try {
      const parsed = JSON.parse(rawContent);
      if (parsed && typeof parsed === 'object') {
        onUpdate(block.id, { content: parsed as Record<string, any> });
      }
    } catch {
      // keep user on current value if JSON is invalid
    }
  };

  return (
    <div className="h-full w-80 border-l border-border bg-card overflow-y-auto scrollbar-thin shrink-0">
      <div className="p-4 border-b border-border flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-foreground capitalize">{block.type} Section</h3>
          <p className="text-xs text-muted-foreground">Edit this section content.</p>
        </div>
        <button onClick={onClose} className="text-xs text-primary hover:underline">Done</button>
      </div>

      <div className="p-4 space-y-4">
        {block.type === 'hero' && (
          <>
            <Field label="Headline">
              <Input value={String(block.content.headline || '')} onChange={(event) => updateContent({ headline: event.target.value })} className="h-8 text-sm" />
            </Field>
            <Field label="Subheadline">
              <Textarea value={String(block.content.subheadline || '')} onChange={(event) => updateContent({ subheadline: event.target.value })} rows={3} className="text-sm" />
            </Field>
            <Field label="CTA Text">
              <Input value={String(block.content.ctaText || '')} onChange={(event) => updateContent({ ctaText: event.target.value })} className="h-8 text-sm" />
            </Field>
            <Field label="CTA URL">
              <Input value={String(block.content.ctaUrl || '')} onChange={(event) => updateContent({ ctaUrl: event.target.value })} className="h-8 text-sm" placeholder="https://..." />
            </Field>
          </>
        )}

        {block.type === 'navbar' && (
          <>
            <Field label="Brand">
              <Input value={String(block.content.brand || '')} onChange={(event) => updateContent({ brand: event.target.value })} className="h-8 text-sm" />
            </Field>
            <Field label="Links" hint="Comma separated">
              <Textarea value={Array.isArray(block.content.links) ? block.content.links.join(', ') : ''} onChange={(event) => updateContent({ links: splitByComma(event.target.value) })} rows={2} className="text-sm" />
            </Field>
          </>
        )}

        {block.type === 'text' && (
          <Field label="Text Content">
            <Textarea value={String(block.content.content || '')} onChange={(event) => updateContent({ content: event.target.value })} rows={6} className="text-sm" />
          </Field>
        )}

        {block.type === 'cta' && (
          <>
            <Field label="Headline">
              <Input value={String(block.content.headline || '')} onChange={(event) => updateContent({ headline: event.target.value })} className="h-8 text-sm" />
            </Field>
            <Field label="Button Text">
              <Input value={String(block.content.buttonText || '')} onChange={(event) => updateContent({ buttonText: event.target.value })} className="h-8 text-sm" />
            </Field>
            <Field label="Button URL">
              <Input value={String(block.content.buttonUrl || '')} onChange={(event) => updateContent({ buttonUrl: event.target.value })} className="h-8 text-sm" />
            </Field>
          </>
        )}

        {block.type === 'image' && (
          <>
            <Field label="Image URL">
              <Input value={String(block.content.src || '')} onChange={(event) => updateContent({ src: event.target.value })} className="h-8 text-sm" />
            </Field>
            <Field label="Alt Text">
              <Input value={String(block.content.alt || '')} onChange={(event) => updateContent({ alt: event.target.value })} className="h-8 text-sm" />
            </Field>
          </>
        )}

        <Field label="Raw Content JSON" hint="Use for advanced section fields.">
          <Textarea value={rawContent} onChange={(event) => setRawContent(event.target.value)} rows={7} className="text-xs font-mono" />
          <Button size="sm" variant="outline" onClick={applyRawContent}>Apply JSON</Button>
        </Field>

        <div className="pt-3 border-t border-border space-y-3">
          <p className="text-xs font-semibold text-foreground">Style Overrides</p>
          <Field label="Padding">
            <Input value={String(block.styles?.padding || '')} onChange={(event) => updateStyles({ padding: event.target.value })} className="h-8 text-sm" placeholder="32px" />
          </Field>
          <Field label="Background Color">
            <Input value={String(block.styles?.backgroundColor || '')} onChange={(event) => updateStyles({ backgroundColor: event.target.value })} className="h-8 text-sm" placeholder="#ffffff" />
          </Field>
          <Field label="Text Color">
            <Input value={String(block.styles?.color || '')} onChange={(event) => updateStyles({ color: event.target.value })} className="h-8 text-sm" placeholder="#0f172a" />
          </Field>
        </div>
      </div>
    </div>
  );
}

export default function LandingPagesPage() {
  const {
    pages,
    currentPage,
    createNewPage,
    setCurrentPage,
    addBlock,
    reorderBlocks,
    selectBlock,
    selectedBlockId,
    updatePageField,
    updateBlock,
    savePage,
    deletePage,
    previewMode,
    setPreviewMode,
    loadPages,
    hasLoaded,
    isLoading,
    isSaving,
  } = useLandingPageStore();

  const [templateId, setTemplateId] = useState(DEFAULT_LANDING_PAGE_TEMPLATE_ID);
  const [isAiDialogOpen, setIsAiDialogOpen] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  useEffect(() => {
    if (!hasLoaded) {
      void loadPages();
    }
  }, [hasLoaded, loadPages]);

  const selectedBlock = useMemo(() => {
    if (!currentPage || !selectedBlockId) return null;
    return currentPage.blocks.find((item) => item.id === selectedBlockId) || null;
  }, [currentPage, selectedBlockId]);

  const openLivePage = (slug: string) => {
    window.open(`/pages/${slug}`, '_blank', 'noopener,noreferrer');
  };

  const applyAiPageResult = (result: Record<string, any>) => {
    const blocks = Array.isArray(result?.blocks)
      ? result.blocks.map((block: any) => ({
          id: String(block?.id || crypto.randomUUID()),
          type: String(block?.type || 'text') as any,
          content: block?.content && typeof block.content === 'object' ? block.content : {},
          styles: block?.styles && typeof block.styles === 'object' ? block.styles : {},
        }))
      : [];

    const generatedName = String(result?.name || currentPage?.name || 'AI Landing Page');
    const generatedSlug = slugifyValue(String(result?.slug || generatedName));

    if (currentPage) {
      if (currentPage.blocks.length > 0) {
        const shouldReplace = window.confirm('Replace current sections with the AI-generated draft?');
        if (!shouldReplace) return;
      }

      updatePageField('name', generatedName);
      updatePageField('slug', generatedSlug);
      updatePageField('blocks', blocks);
      updatePageField('published', false);
      selectBlock(null);
      return;
    }

    createNewPage({
      name: generatedName,
      slug: generatedSlug,
      blocks,
      published: false,
      createdAt: new Date(),
    });
  };

  const applyTemplateToCurrentPage = () => {
    if (!currentPage) return;
    const template = getLandingPageTemplateById(templateId);
    if (!template) return;

    if (currentPage.blocks.length > 0) {
      const shouldReplace = window.confirm('Apply template and replace all existing sections on this page?');
      if (!shouldReplace) return;
    }

    updatePageField('blocks', buildLandingPageTemplateBlocks(template));
    if (!String(currentPage.name || '').trim()) updatePageField('name', template.name);
    if (!String(currentPage.slug || '').trim()) updatePageField('slug', slugifyValue(template.name));
    selectBlock(null);
  };

  const createFromTemplate = (id: string) => {
    const template = getLandingPageTemplateById(id);
    if (!template) return;

    setTemplateId(id);
    createNewPage({
      name: template.name,
      slug: slugifyValue(template.name),
      blocks: buildLandingPageTemplateBlocks(template),
      published: false,
      createdAt: new Date(),
    });
  };

  if (!currentPage) {
    if (isLoading) {
      return (
        <div className="flex h-full items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-emerald-600"></div>
        </div>
      );
    }

    return (
      <div className="p-8 max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6 gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Landing Pages</h1>
            <p className="text-sm text-muted-foreground mt-1">Build, edit, and publish landing pages</p>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={() => setIsAiDialogOpen(true)} disabled={isSaving} variant="outline">
              <Sparkles className="w-4 h-4 mr-1" /> AI Generate
            </Button>
            <Button onClick={() => createNewPage()} disabled={isSaving} variant="outline">
              <Plus className="w-4 h-4 mr-1" /> Blank Page
            </Button>
            <Button onClick={() => createFromTemplate(templateId)} disabled={isSaving}>
              <Sparkles className="w-4 h-4 mr-1" /> Use Template
            </Button>
          </div>
        </div>

        {pages.length === 0 ? (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="border-2 border-dashed border-border rounded-xl p-10 text-center bg-card">
            <div className="w-12 h-12 rounded-xl bg-info/10 flex items-center justify-center mx-auto mb-4">
              <FileText className="w-6 h-6 text-info" />
            </div>
            <h3 className="font-semibold text-foreground mb-2">No pages yet</h3>
            <p className="text-sm text-muted-foreground mb-4">Start from a template or create a blank page</p>
            <div className="flex items-center justify-center gap-2">
              <Button onClick={() => setIsAiDialogOpen(true)} disabled={isSaving} variant="outline">
                <Sparkles className="w-4 h-4 mr-1" /> Generate With AI
              </Button>
              <Button onClick={() => createFromTemplate(templateId)} disabled={isSaving}>
                <Sparkles className="w-4 h-4 mr-1" /> Start From Template
              </Button>
              <Button onClick={() => createNewPage()} disabled={isSaving} variant="outline">
                <Plus className="w-4 h-4 mr-1" /> Blank Page
              </Button>
            </div>
          </motion.div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {pages.map((page) => (
              <div
                key={page.id}
                className="bg-card border border-border rounded-xl p-5 hover:border-primary/30 hover:shadow-md transition-all cursor-pointer"
                onClick={() => setCurrentPage(page)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-semibold text-foreground truncate">{page.name || 'Untitled'}</h3>
                    <p className="text-xs text-muted-foreground mt-1 truncate">/pages/{page.slug || 'unsaved-slug'}</p>
                    <p className="text-xs text-muted-foreground mt-1">{page.blocks.length} sections | {page.published ? 'Published' : 'Draft'}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    {page.published && page.slug && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={(event) => {
                          event.stopPropagation();
                          openLivePage(page.slug);
                        }}
                      >
                        <ExternalLink className="w-4 h-4" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={(event) => {
                        event.stopPropagation();
                        const shouldDelete = window.confirm(`Delete "${page.name || 'Untitled'}"?`);
                        if (!shouldDelete) return;
                        void deletePage(page.id);
                      }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-8">
          <div className="flex items-center justify-between mb-3 gap-2">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Starter Templates</h2>
              <p className="text-xs text-muted-foreground">Pick a layout and customize every section in the editor.</p>
            </div>
            <Select value={templateId} onValueChange={setTemplateId}>
              <SelectTrigger className="w-56 h-8 text-sm"><SelectValue placeholder="Template" /></SelectTrigger>
              <SelectContent>
                {LANDING_PAGE_TEMPLATES.map((template) => (
                  <SelectItem key={template.id} value={template.id}>{template.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            {LANDING_PAGE_TEMPLATES.map((template) => (
              <div key={template.id} className="rounded-xl border border-border bg-card p-4">
                <p className="text-sm font-semibold text-foreground">{template.name}</p>
                <p className="mt-1 text-xs text-muted-foreground min-h-[36px]">{template.description}</p>
                <Button size="sm" className="mt-3 w-full" variant={templateId === template.id ? 'default' : 'outline'} onClick={() => createFromTemplate(template.id)}>
                  Use Template
                </Button>
              </div>
            ))}
          </div>
        </div>

        <AiLandingPageDialog
          open={isAiDialogOpen}
          onOpenChange={setIsAiDialogOpen}
          onGenerated={({ result }) => applyAiPageResult(result)}
        />
      </div>
    );
  }

  const blocks = currentPage.blocks;

  const handleAddBlock = (type: LPBlockType) => {
    addBlock(createLandingPageBlock(type));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = blocks.findIndex((item) => item.id === active.id);
    const newIdx = blocks.findIndex((item) => item.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    reorderBlocks(arrayMove(blocks, oldIdx, newIdx));
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-4 h-14 border-b border-border bg-card shrink-0 gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="ghost" size="sm" onClick={() => setCurrentPage(null)}>
            <ArrowLeft className="w-4 h-4 mr-1" /> Back
          </Button>
          <div className="h-5 w-px bg-border" />
          <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">Page Editor</span>
          <Input value={currentPage.name} onChange={(event) => updatePageField('name', event.target.value)} placeholder="Page name..." className="w-40 h-8 text-sm" />
          <Input value={currentPage.slug} onChange={(event) => updatePageField('slug', event.target.value)} placeholder="page-slug" className="w-40 h-8 text-sm" />
          <Select value={templateId} onValueChange={setTemplateId}>
            <SelectTrigger className="w-44 h-8 text-sm"><SelectValue placeholder="Template" /></SelectTrigger>
            <SelectContent>
              {LANDING_PAGE_TEMPLATES.map((template) => (
                <SelectItem key={template.id} value={template.id}>{template.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" onClick={applyTemplateToCurrentPage} disabled={isSaving}>
            <Sparkles className="w-4 h-4 mr-1" /> Apply Template
          </Button>
          <Button size="sm" variant="outline" onClick={() => setIsAiDialogOpen(true)} disabled={isSaving}>
            <Sparkles className="w-4 h-4 mr-1" /> AI Assist
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-muted rounded-lg p-0.5">
            {([
              ['desktop', Monitor],
              ['tablet', Tablet],
              ['mobile', Smartphone],
            ] as const).map(([mode, Icon]) => (
              <button
                key={mode}
                onClick={() => setPreviewMode(mode)}
                className={`p-1.5 rounded-md transition-colors ${previewMode === mode ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground'}`}
              >
                <Icon className="w-4 h-4" />
              </button>
            ))}
          </div>
          {currentPage.published && currentPage.slug && (
            <Button size="sm" variant="outline" onClick={() => openLivePage(currentPage.slug)}>
              <ExternalLink className="w-4 h-4 mr-1" /> View Live
            </Button>
          )}
          <Button size="sm" variant={currentPage.published ? 'outline' : 'default'} onClick={() => {
            updatePageField('published', !currentPage.published);
            void savePage();
          }} disabled={isSaving}>
            {currentPage.published ? 'Unpublish' : 'Publish'}
          </Button>
          <Button size="sm" onClick={() => void savePage()} disabled={isSaving}>
            <Save className="w-4 h-4 mr-1" /> {isSaving ? 'Saving...' : 'Save'}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => {
            const shouldDelete = window.confirm(`Delete "${currentPage.name || 'Untitled'}"?`);
            if (!shouldDelete) return;
            void deletePage(currentPage.id);
          }} className="text-destructive hover:text-destructive" disabled={isSaving}>
            <Trash2 className="w-4 h-4 mr-1" /> Delete
          </Button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="w-56 border-r border-border bg-card overflow-y-auto scrollbar-thin shrink-0">
          <div className="p-4 border-b border-border"><h3 className="text-sm font-semibold text-foreground">Sections</h3></div>
          <div className="p-3 grid grid-cols-2 gap-2">
            {lpBlockTypes.map((item) => (
              <button
                key={item.type}
                onClick={() => handleAddBlock(item.type)}
                className="flex flex-col items-center gap-1.5 p-3 rounded-lg border border-border hover:bg-block-hover hover:border-block-border transition-all text-muted-foreground hover:text-foreground"
              >
                <item.icon className="w-4 h-4" />
                <span className="text-xs font-medium">{item.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 bg-canvas-bg overflow-y-auto p-6" onClick={() => selectBlock(null)}>
          <div
            className={cn(
              'mx-auto bg-card rounded-xl shadow-sm border border-border transition-all overflow-hidden',
              previewMode === 'mobile' ? 'max-w-sm' : previewMode === 'tablet' ? 'max-w-2xl' : 'max-w-5xl'
            )}
            onClick={(event) => event.stopPropagation()}
          >
            {blocks.length === 0 ? (
              <div className="h-64 flex flex-col items-center justify-center text-muted-foreground px-6 text-center">
                <Layout className="w-8 h-8 mb-3" />
                <p className="text-sm font-medium">Add sections from the left panel</p>
                <p className="text-xs mt-1">Or apply a full template to quickly build the page structure.</p>
              </div>
            ) : (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={blocks.map((item) => item.id)} strategy={verticalListSortingStrategy}>
                  <div className="pl-10 pr-3 py-2 space-y-2">
                    {blocks.map((item) => <SortableLPBlock key={item.id} block={item} />)}
                  </div>
                </SortableContext>
              </DndContext>
            )}
          </div>
        </div>

        <LandingPageSettingsPanel
          block={selectedBlock}
          sectionCount={blocks.length}
          onClose={() => selectBlock(null)}
          onUpdate={updateBlock}
        />
      </div>

      <AiLandingPageDialog
        open={isAiDialogOpen}
        onOpenChange={setIsAiDialogOpen}
        currentPage={currentPage}
        onGenerated={({ result }) => applyAiPageResult(result)}
      />
    </div>
  );
}


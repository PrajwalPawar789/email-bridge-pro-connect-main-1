import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  ArrowLeft,
  BarChart3,
  Boxes,
  Clock3,
  Copy,
  CreditCard,
  ExternalLink,
  FileText,
  GripVertical,
  HelpCircle,
  Image,
  Layout,
  Mail,
  Menu,
  Monitor,
  MousePointer,
  Plus,
  Save,
  Smartphone,
  Sparkles,
  Star,
  Table2,
  Tablet,
  TrendingUp,
  Trash2,
  Type,
  Video,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import LandingPageLeadForm from '@/components/landing-pages/LandingPageLeadForm';
import { AiLandingPageDialog } from '@/components/ai/AiLandingPageDialog';
import { cn } from '@/lib/utils';
import {
  DEFAULT_LANDING_PAGE_TEMPLATE_ID,
  LANDING_PAGE_TEMPLATES,
  buildLandingPageTemplateBlocks,
  buildLandingPageTemplateSettings,
  createLandingPageBlock,
  getLandingPageTemplateById,
} from '@/lib/landingPageTemplates';
import { listLandingPageAnalyticsSummaries, type LandingPageAnalyticsSummary } from '@/lib/landingPageAnalytics';
import {
  createLandingPageEmailList,
  listLandingPageEmailLists,
  listLandingPageLeadStats,
  listRecentLandingPageLeads,
  type LandingPageEmailListOption,
  type LandingPageLeadSubmission,
} from '@/lib/landingPageLeads';
import {
  createLandingPageFormField,
  getLandingPageFormPublishError,
  normalizeLandingPageFormContent,
} from '@/lib/landingPageForms';
import { useLandingPageStore, type LPBlock, type LPBlockType } from '@/stores/landingPageStore';
import { LANDING_PAGE_THEME_PRESETS, updateLandingPageThemePreset } from '@/lib/landingPageSettings';

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
  { type: 'logos', label: 'Logos', icon: Boxes },
  { type: 'steps', label: 'Steps', icon: TrendingUp },
  { type: 'comparison', label: 'Compare', icon: Table2 },
  { type: 'countdown', label: 'Countdown', icon: Clock3 },
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

const getPageLeadSummary = (leadCount: number, lastSubmittedAt?: string) => {
  if (!leadCount) return 'No leads yet';
  if (!lastSubmittedAt) return `${leadCount} lead${leadCount === 1 ? '' : 's'}`;
  return `${leadCount} lead${leadCount === 1 ? '' : 's'} - last ${formatDistanceToNow(new Date(lastSubmittedAt), { addSuffix: true })}`;
};

const getAnalyticsSummaryText = (analytics?: LandingPageAnalyticsSummary) => {
  if (!analytics) return 'No visits tracked yet';
  if (!analytics.views) return 'No visits tracked yet';
  return `${analytics.views} views${analytics.ctaClicks ? ` · ${analytics.ctaClicks} CTA clicks` : ''}${analytics.leads ? ` · ${analytics.conversionRate}% conversion` : ''}`;
};

const getFirstFormPublishIssue = (blocks: LPBlock[]) => {
  for (const block of blocks) {
    if (block.type !== 'form') continue;
    const message = getLandingPageFormPublishError(block.content);
    if (message) return { blockId: block.id, message };
  }
  return null;
};

function SortableLPBlock({ block }: { block: LPBlock }) {
  const { selectedBlockId, selectBlock, removeBlock, duplicateBlock } = useLandingPageStore();
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
      <div className="absolute -left-10 top-4 z-10 flex flex-col gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <button {...attributes} {...listeners} className="rounded p-1 text-muted-foreground hover:bg-muted" title="Drag section">
          <GripVertical className="h-3 w-3" />
        </button>
        <button
          onClick={(event) => {
            event.stopPropagation();
            duplicateBlock(block.id);
          }}
          className="rounded p-1 text-muted-foreground hover:bg-muted"
          title="Duplicate section"
        >
          <Copy className="h-3 w-3" />
        </button>
        <button
          onClick={(event) => {
            event.stopPropagation();
            removeBlock(block.id);
          }}
          className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          title="Delete section"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
      <div
        className={cn(
          'overflow-hidden rounded-xl border-2 transition-all',
          isSelected ? 'border-primary shadow-[0_0_0_2px_hsl(var(--primary)/0.12)]' : 'border-transparent hover:border-border'
        )}
        style={block.styles as CSSProperties}
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
        <div className="flex flex-wrap items-center justify-between gap-3 bg-card px-8 py-4">
          <span className="font-bold text-foreground">{block.content.brand}</span>
          <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
            {block.content.links?.map((item: string) => <span key={item}>{item}</span>)}
          </div>
        </div>
      );
    case 'hero':
      return (
        <div className="bg-gradient-to-b from-accent to-card px-8 py-20 text-center">
          {block.content.badge ? <p className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-primary">{block.content.badge}</p> : null}
          <h1 className="mb-4 text-4xl font-bold text-foreground">{block.content.headline}</h1>
          <p className="mx-auto mb-6 max-w-xl text-lg text-muted-foreground">{block.content.subheadline}</p>
          <span className="inline-block rounded-lg bg-primary px-8 py-3 font-medium text-primary-foreground">{block.content.ctaText}</span>
          {Array.isArray(block.content.highlights) && block.content.highlights.length > 0 ? (
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              {block.content.highlights.map((item: string) => (
                <span key={item} className="rounded-full border border-border bg-card px-3 py-1 text-xs uppercase tracking-[0.16em] text-muted-foreground">
                  {item}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      );
    case 'features':
      return (
        <div className="px-8 py-12">
          <h2 className="mb-8 text-center text-2xl font-bold text-foreground">{block.content.title}</h2>
          <div className="grid gap-6 md:grid-cols-3">
            {(block.content.items || []).map((item: any, index: number) => (
              <div key={index} className="rounded-xl bg-muted/50 p-4 text-center">
                <h3 className="mb-1 font-semibold text-foreground">{item.title}</h3>
                <p className="text-sm text-muted-foreground">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      );
    case 'text':
      return <div className="whitespace-pre-wrap px-8 py-10 text-base text-foreground">{block.content.content}</div>;
    case 'image':
      return (
        <div className="px-8 py-10 text-center">
          {block.content.src ? (
            <img src={block.content.src} alt={block.content.alt || 'Image'} className="mx-auto max-w-full rounded-xl border border-border" />
          ) : (
            <div className="mx-auto flex h-40 max-w-xl items-center justify-center rounded-xl border-2 border-dashed border-border bg-muted/40 text-sm text-muted-foreground">
              Add an image URL in settings
            </div>
          )}
        </div>
      );
    case 'cta':
      return (
        <div className="bg-primary/5 px-8 py-16 text-center">
          <h2 className="mb-4 text-2xl font-bold text-foreground">{block.content.headline}</h2>
          <span className="inline-block rounded-lg bg-primary px-8 py-3 font-medium text-primary-foreground">{block.content.buttonText}</span>
        </div>
      );
    case 'testimonial':
      return (
        <div className="px-8 py-12">
          {(block.content.items || []).map((item: any, index: number) => (
            <div key={index} className="mx-auto max-w-lg text-center">
              <p className="mb-3 text-lg italic text-foreground">"{item.quote}"</p>
              <p className="text-sm font-medium text-foreground">{item.name}</p>
              <p className="text-xs text-muted-foreground">{item.role}</p>
            </div>
          ))}
        </div>
      );
    case 'pricing':
      return (
        <div className="px-8 py-12">
          <h2 className="mb-8 text-center text-2xl font-bold text-foreground">{block.content.title}</h2>
          <div className="mx-auto grid max-w-4xl gap-6 md:grid-cols-2 lg:grid-cols-3">
            {(block.content.plans || []).map((plan: any, index: number) => (
              <div key={index} className="rounded-xl border border-border bg-card p-6">
                <h3 className="font-semibold text-foreground">{plan.name}</h3>
                <p className="my-2 text-2xl font-bold text-primary">{plan.price}</p>
              </div>
            ))}
          </div>
        </div>
      );
    case 'faq':
      return (
        <div className="space-y-3 px-8 py-12">
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
      return <LandingPageLeadForm pageId="preview" pageSlug="preview" blockId={block.id} content={block.content} preview />;
    case 'stats':
      return (
        <div className="flex flex-wrap justify-center gap-12 px-8 py-12">
          {(block.content.items || []).map((item: any, index: number) => (
            <div key={index} className="text-center">
              <div className="text-3xl font-bold text-primary">{item.value}</div>
              <div className="text-sm text-muted-foreground">{item.label}</div>
            </div>
          ))}
        </div>
      );
    case 'logos':
      return (
        <div className="grid gap-3 px-8 py-10 md:grid-cols-4">
          {(block.content.items || []).map((item: any, index: number) => (
            <div key={`${item?.name || 'logo'}_${index}`} className="rounded-xl border border-border bg-card px-4 py-6 text-center text-sm font-semibold text-muted-foreground">
              {item?.name || 'Logo'}
            </div>
          ))}
        </div>
      );
    case 'steps':
      return (
        <div className="grid gap-4 px-8 py-12 md:grid-cols-3">
          {(block.content.items || []).map((item: any, index: number) => (
            <div key={`${item?.title || 'step'}_${index}`} className="rounded-xl border border-border bg-card p-5">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-sm font-semibold text-primary">
                {index + 1}
              </div>
              <h3 className="font-semibold text-foreground">{item?.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{item?.desc}</p>
            </div>
          ))}
        </div>
      );
    case 'comparison':
      return (
        <div className="overflow-x-auto px-8 py-12">
          <table className="min-w-full overflow-hidden rounded-xl border border-border bg-card text-left text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Feature</th>
                {(block.content.columns || []).map((column: any, index: number) => (
                  <th key={`${column?.key || 'column'}_${index}`} className="px-4 py-3">{column?.label || 'Column'}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(block.content.rows || []).map((row: any, index: number) => (
                <tr key={`${row?.feature || 'row'}_${index}`} className="border-t border-border">
                  <td className="px-4 py-3 font-medium text-foreground">{row?.feature}</td>
                  {(block.content.columns || []).map((column: any, columnIndex: number) => (
                    <td key={`${column?.key || 'cell'}_${columnIndex}`} className="px-4 py-3 text-muted-foreground">
                      {row?.[String(column?.key || '')]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case 'countdown':
      return (
        <div className="px-8 py-12 text-center">
          <div className="inline-flex flex-col items-center rounded-xl border border-border bg-card px-8 py-6">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">{block.content.label || 'Countdown'}</p>
            <p className="mt-3 text-2xl font-bold text-foreground">{block.content.endDate || 'Set an end date'}</p>
          </div>
        </div>
      );
    case 'gallery':
      return (
        <div className="grid gap-3 px-8 py-10 md:grid-cols-3">
          {(block.content.images || []).map((image: string, index: number) => (
            <img key={`${image}_${index}`} src={image} alt={`Gallery ${index + 1}`} className="h-44 w-full rounded-xl object-cover" />
          ))}
        </div>
      );
    case 'video':
      return <div className="px-8 py-12 text-center text-muted-foreground">{block.content.title || 'Video section'}</div>;
    case 'footer':
      return <div className="bg-muted/50 px-8 py-6 text-sm text-muted-foreground">(c) {block.content.brand}</div>;
    default:
      return <div className="px-8 py-8 text-sm text-muted-foreground">{block.type} section</div>;
  }
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold text-foreground">{label}</Label>
      {children}
      {hint ? <p className="text-[11px] leading-4 text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function LandingPageSettingsPanel({
  page,
  block,
  analytics,
  sectionCount,
  hasFormBlock,
  leadCount,
  recentLeads,
  emailLists,
  onClose,
  onUpdate,
  onUpdatePageSettings,
  onCreateEmailList,
}: {
  page: { settings?: Record<string, any> } | null;
  block: LPBlock | null;
  analytics?: LandingPageAnalyticsSummary | null;
  sectionCount: number;
  hasFormBlock: boolean;
  leadCount: number;
  recentLeads: LandingPageLeadSubmission[];
  emailLists: LandingPageEmailListOption[];
  onClose: () => void;
  onUpdate: (id: string, updates: Partial<LPBlock>) => void;
  onUpdatePageSettings: (nextSettings: any) => void;
  onCreateEmailList: (name: string, description?: string) => Promise<LandingPageEmailListOption>;
}) {
  const [rawContent, setRawContent] = useState('{}');
  const [newListName, setNewListName] = useState('');
  const [newListDescription, setNewListDescription] = useState('');
  const [isCreatingList, setIsCreatingList] = useState(false);

  useEffect(() => {
    if (!block) {
      setRawContent('{}');
      setNewListName('');
      setNewListDescription('');
      return;
    }

    setRawContent(safeStringify(block.content));
    setNewListName('');
    setNewListDescription('');
  }, [block]);

  const pageSettings = page?.settings;
  const updateSettings = (patch: Record<string, any>) => {
    if (!pageSettings) return;
    onUpdatePageSettings({ ...pageSettings, ...patch });
  };

  if (!block) {
    return (
      <div className="h-full w-96 shrink-0 overflow-y-auto border-l border-border bg-card">
        <div className="border-b border-border p-4">
          <h3 className="text-sm font-semibold text-foreground">Section Settings</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">Select a section to edit, or use this panel for page-level strategy and settings.</p>
        </div>
        <div className="space-y-5 p-4">
          <div className="rounded-xl border border-border bg-muted/30 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Page summary</p>
            <div className="mt-3 space-y-2 text-sm text-foreground">
              <p>{sectionCount} section{sectionCount === 1 ? '' : 's'} on this page.</p>
              <p>{hasFormBlock ? `${leadCount} captured lead${leadCount === 1 ? '' : 's'}.` : 'No form block on this page yet.'}</p>
              <p>{getAnalyticsSummaryText(analytics || undefined)}</p>
              {analytics?.topSource ? <p>Top source: {analytics.topSource}</p> : null}
            </div>
          </div>

          {pageSettings ? (
            <>
              <div className="space-y-3 rounded-xl border border-border bg-card p-4">
                <div>
                  <h4 className="text-sm font-semibold text-foreground">Theme & conversion UI</h4>
                  <p className="text-xs text-muted-foreground">Inspired by modern builders: theme presets, announcement bars, and sticky CTA controls live here.</p>
                </div>

                <Field label="Theme Preset">
                  <Select
                    value={pageSettings.themePresetId}
                    onValueChange={(value) => onUpdatePageSettings(updateLandingPageThemePreset(pageSettings, value))}
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LANDING_PAGE_THEME_PRESETS.map((preset) => (
                        <SelectItem key={preset.id} value={preset.id}>
                          {preset.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>

                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Accent Color">
                    <Input
                      value={pageSettings.theme.accent}
                      onChange={(event) =>
                        updateSettings({ theme: { ...pageSettings.theme, accent: event.target.value } })
                      }
                      className="h-8 text-sm"
                    />
                  </Field>
                  <Field label="Accent Alt">
                    <Input
                      value={pageSettings.theme.accentAlt}
                      onChange={(event) =>
                        updateSettings({ theme: { ...pageSettings.theme, accentAlt: event.target.value } })
                      }
                      className="h-8 text-sm"
                    />
                  </Field>
                  <Field label="Background">
                    <Input
                      value={pageSettings.theme.background}
                      onChange={(event) =>
                        updateSettings({ theme: { ...pageSettings.theme, background: event.target.value } })
                      }
                      className="h-8 text-sm"
                    />
                  </Field>
                  <Field label="Surface">
                    <Input
                      value={pageSettings.theme.surface}
                      onChange={(event) =>
                        updateSettings({ theme: { ...pageSettings.theme, surface: event.target.value } })
                      }
                      className="h-8 text-sm"
                    />
                  </Field>
                </div>

                <label className="flex items-center gap-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={pageSettings.announcementBar.enabled}
                    onChange={(event) =>
                      updateSettings({
                        announcementBar: {
                          ...pageSettings.announcementBar,
                          enabled: event.target.checked,
                        },
                      })
                    }
                  />
                  Enable announcement bar
                </label>
                {pageSettings.announcementBar.enabled ? (
                  <div className="grid gap-3 rounded-xl border border-border bg-muted/20 p-3">
                    <Field label="Announcement Text">
                      <Textarea
                        value={pageSettings.announcementBar.text}
                        onChange={(event) =>
                          updateSettings({
                            announcementBar: { ...pageSettings.announcementBar, text: event.target.value },
                          })
                        }
                        rows={2}
                        className="text-sm"
                      />
                    </Field>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Announcement CTA">
                        <Input
                          value={pageSettings.announcementBar.ctaText}
                          onChange={(event) =>
                            updateSettings({
                              announcementBar: { ...pageSettings.announcementBar, ctaText: event.target.value },
                            })
                          }
                          className="h-8 text-sm"
                        />
                      </Field>
                      <Field label="Announcement URL">
                        <Input
                          value={pageSettings.announcementBar.ctaUrl}
                          onChange={(event) =>
                            updateSettings({
                              announcementBar: { ...pageSettings.announcementBar, ctaUrl: event.target.value },
                            })
                          }
                          className="h-8 text-sm"
                        />
                      </Field>
                    </div>
                  </div>
                ) : null}

                <label className="flex items-center gap-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={pageSettings.stickyCta.enabled}
                    onChange={(event) =>
                      updateSettings({
                        stickyCta: {
                          ...pageSettings.stickyCta,
                          enabled: event.target.checked,
                        },
                      })
                    }
                  />
                  Enable sticky CTA
                </label>
                {pageSettings.stickyCta.enabled ? (
                  <div className="grid gap-3 rounded-xl border border-border bg-muted/20 p-3">
                    <Field label="Sticky Label">
                      <Input
                        value={pageSettings.stickyCta.label}
                        onChange={(event) =>
                          updateSettings({
                            stickyCta: { ...pageSettings.stickyCta, label: event.target.value },
                          })
                        }
                        className="h-8 text-sm"
                      />
                    </Field>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Button Text">
                        <Input
                          value={pageSettings.stickyCta.buttonText}
                          onChange={(event) =>
                            updateSettings({
                              stickyCta: { ...pageSettings.stickyCta, buttonText: event.target.value },
                            })
                          }
                          className="h-8 text-sm"
                        />
                      </Field>
                      <Field label="Button URL">
                        <Input
                          value={pageSettings.stickyCta.buttonUrl}
                          onChange={(event) =>
                            updateSettings({
                              stickyCta: { ...pageSettings.stickyCta, buttonUrl: event.target.value },
                            })
                          }
                          className="h-8 text-sm"
                        />
                      </Field>
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="space-y-3 rounded-xl border border-border bg-card p-4">
                <div>
                  <h4 className="text-sm font-semibold text-foreground">SEO & personalization</h4>
                  <p className="text-xs text-muted-foreground">
                    Use token syntax like <code>{'{{company|your team}}'}</code> in headlines, CTAs, or form placeholders.
                  </p>
                </div>
                <Field label="SEO Title">
                  <Input
                    value={pageSettings.seo.title}
                    onChange={(event) =>
                      updateSettings({ seo: { ...pageSettings.seo, title: event.target.value } })
                    }
                    className="h-8 text-sm"
                  />
                </Field>
                <Field label="SEO Description">
                  <Textarea
                    value={pageSettings.seo.description}
                    onChange={(event) =>
                      updateSettings({ seo: { ...pageSettings.seo, description: event.target.value } })
                    }
                    rows={3}
                    className="text-sm"
                  />
                </Field>
                <Field label="Keywords" hint="Comma separated keywords for meta data">
                  <Textarea
                    value={pageSettings.seo.keywords.join(', ')}
                    onChange={(event) =>
                      updateSettings({
                        seo: { ...pageSettings.seo, keywords: splitByComma(event.target.value) },
                      })
                    }
                    rows={2}
                    className="text-sm"
                  />
                </Field>
                <Field label="OG Image URL">
                  <Input
                    value={pageSettings.seo.ogImageUrl}
                    onChange={(event) =>
                      updateSettings({ seo: { ...pageSettings.seo, ogImageUrl: event.target.value } })
                    }
                    className="h-8 text-sm"
                  />
                </Field>
                <Field label="Canonical URL">
                  <Input
                    value={pageSettings.seo.canonicalUrl}
                    onChange={(event) =>
                      updateSettings({ seo: { ...pageSettings.seo, canonicalUrl: event.target.value } })
                    }
                    className="h-8 text-sm"
                  />
                </Field>
                <div className="rounded-xl border border-dashed border-border p-3 text-xs leading-5 text-muted-foreground">
                  Useful tokens:
                  <div className="mt-2 flex flex-wrap gap-2">
                    <code>{'{{utm_source|newsletter}}'}</code>
                    <code>{'{{company|your team}}'}</code>
                    <code>{'{{first_name|there}}'}</code>
                    <code>{'{{host}}'}</code>
                  </div>
                </div>
              </div>
            </>
          ) : null}

          {hasFormBlock ? (
            <div className="space-y-3">
              <div>
                <h4 className="text-sm font-semibold text-foreground">Recent leads</h4>
                <p className="text-xs text-muted-foreground">Submissions land in your selected list and are also logged here.</p>
              </div>
              {recentLeads.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                  No submissions yet. Publish the page and send traffic to the form.
                </div>
              ) : (
                recentLeads.map((lead) => (
                  <div key={lead.id} className="rounded-xl border border-border p-3">
                    <p className="text-sm font-semibold text-foreground">{lead.fullName || lead.email}</p>
                    <p className="text-xs text-muted-foreground">{lead.email}</p>
                    {lead.company ? <p className="mt-1 text-xs text-muted-foreground">{lead.company}</p> : null}
                    <p className="mt-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                      {formatDistanceToNow(new Date(lead.submittedAt), { addSuffix: true })}
                    </p>
                  </div>
                ))
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
              Add a form block if you want to capture leads from this page.
            </div>
          )}
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
      toast.error('Fix invalid JSON before applying it.');
    }
  };

  const handleCreateList = async () => {
    const trimmedName = newListName.trim();
    if (!trimmedName) {
      toast.error('List name is required');
      return;
    }

    setIsCreatingList(true);
    try {
      const created = await onCreateEmailList(trimmedName, newListDescription.trim());
      updateContent({ targetListId: created.id, targetListName: created.name });
      setNewListName('');
      setNewListDescription('');
    } finally {
      setIsCreatingList(false);
    }
  };

  const formContent = block.type === 'form' ? normalizeLandingPageFormContent(block.content) : null;

  const updateFormField = (fieldId: string, patch: Record<string, any>) => {
    if (!formContent) return;
    updateContent({
      fields: formContent.fields.map((field) => (field.id === fieldId ? { ...field, ...patch } : field)),
    });
  };

  const removeFormField = (fieldId: string) => {
    if (!formContent) return;
    updateContent({
      fields: formContent.fields.filter((field) => field.id !== fieldId),
    });
  };

  return (
    <div className="h-full w-96 shrink-0 overflow-y-auto border-l border-border bg-card">
      <div className="flex items-start justify-between gap-2 border-b border-border p-4">
        <div>
          <h3 className="text-sm font-semibold capitalize text-foreground">{block.type} Section</h3>
          <p className="text-xs text-muted-foreground">Edit this section content.</p>
        </div>
        <button onClick={onClose} className="text-xs text-primary hover:underline">
          Done
        </button>
      </div>

      <div className="space-y-5 p-4">
        {block.type === 'hero' && (
          <>
            <Field label="Badge / Eyebrow">
              <Input value={String(block.content.badge || '')} onChange={(event) => updateContent({ badge: event.target.value })} className="h-8 text-sm" />
            </Field>
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
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Secondary CTA Text">
                <Input value={String(block.content.secondaryCtaText || '')} onChange={(event) => updateContent({ secondaryCtaText: event.target.value })} className="h-8 text-sm" />
              </Field>
              <Field label="Secondary CTA URL">
                <Input value={String(block.content.secondaryCtaUrl || '')} onChange={(event) => updateContent({ secondaryCtaUrl: event.target.value })} className="h-8 text-sm" />
              </Field>
            </div>
            <Field label="Highlights" hint="Comma separated chips shown below the hero buttons.">
              <Textarea value={Array.isArray(block.content.highlights) ? block.content.highlights.join(', ') : ''} onChange={(event) => updateContent({ highlights: splitByComma(event.target.value) })} rows={2} className="text-sm" />
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
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="CTA Text">
                <Input value={String(block.content.ctaText || '')} onChange={(event) => updateContent({ ctaText: event.target.value })} className="h-8 text-sm" />
              </Field>
              <Field label="CTA URL">
                <Input value={String(block.content.ctaUrl || '')} onChange={(event) => updateContent({ ctaUrl: event.target.value })} className="h-8 text-sm" />
              </Field>
            </div>
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
            <Field label="Body">
              <Textarea value={String(block.content.body || '')} onChange={(event) => updateContent({ body: event.target.value })} rows={3} className="text-sm" />
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

        {block.type === 'logos' && (
          <>
            <Field label="Section Label">
              <Input value={String(block.content.title || '')} onChange={(event) => updateContent({ title: event.target.value })} className="h-8 text-sm" />
            </Field>
            <Field label="Logos" hint="One per line as Name|Image URL. Image URL is optional.">
              <Textarea
                value={Array.isArray(block.content.items) ? block.content.items.map((item: any) => `${item?.name || ''}|${item?.imageUrl || ''}`).join('\n') : ''}
                onChange={(event) =>
                  updateContent({
                    items: event.target.value
                      .split('\n')
                      .map((line) => line.trim())
                      .filter(Boolean)
                      .map((line) => {
                        const [name, imageUrl] = line.split('|');
                        return { name: String(name || '').trim(), imageUrl: String(imageUrl || '').trim() };
                      }),
                  })
                }
                rows={5}
                className="text-sm"
              />
            </Field>
          </>
        )}

        {block.type === 'steps' && (
          <>
            <Field label="Title">
              <Input value={String(block.content.title || '')} onChange={(event) => updateContent({ title: event.target.value })} className="h-8 text-sm" />
            </Field>
            <Field label="Description">
              <Textarea value={String(block.content.description || '')} onChange={(event) => updateContent({ description: event.target.value })} rows={3} className="text-sm" />
            </Field>
            <Field label="Steps" hint="One per line as Title|Description">
              <Textarea
                value={Array.isArray(block.content.items) ? block.content.items.map((item: any) => `${item?.title || ''}|${item?.desc || ''}`).join('\n') : ''}
                onChange={(event) =>
                  updateContent({
                    items: event.target.value
                      .split('\n')
                      .map((line) => line.trim())
                      .filter(Boolean)
                      .map((line) => {
                        const [title, desc] = line.split('|');
                        return { title: String(title || '').trim(), desc: String(desc || '').trim() };
                      }),
                  })
                }
                rows={5}
                className="text-sm"
              />
            </Field>
          </>
        )}

        {block.type === 'comparison' && (
          <>
            <Field label="Title">
              <Input value={String(block.content.title || '')} onChange={(event) => updateContent({ title: event.target.value })} className="h-8 text-sm" />
            </Field>
            <Field label="Columns" hint="Comma separated labels. Keys are auto-generated from labels.">
              <Textarea
                value={Array.isArray(block.content.columns) ? block.content.columns.map((column: any) => column?.label || '').join(', ') : ''}
                onChange={(event) => {
                  const labels = splitByComma(event.target.value);
                  updateContent({
                    columns: labels.map((label) => ({
                      label,
                      key: label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, ''),
                    })),
                  });
                }}
                rows={2}
                className="text-sm"
              />
            </Field>
            <Field label="Rows" hint="One per line as Feature|Value 1|Value 2|Value 3">
              <Textarea
                value={Array.isArray(block.content.rows)
                  ? block.content.rows
                      .map((row: any) => {
                        const columns = Array.isArray(block.content.columns) ? block.content.columns : [];
                        return [row?.feature || '', ...columns.map((column: any) => row?.[String(column?.key || '')] || '')].join('|');
                      })
                      .join('\n')
                  : ''}
                onChange={(event) => {
                  const columns = Array.isArray(block.content.columns) ? block.content.columns : [];
                  updateContent({
                    rows: event.target.value
                      .split('\n')
                      .map((line) => line.trim())
                      .filter(Boolean)
                      .map((line) => {
                        const [feature, ...values] = line.split('|');
                        const row: Record<string, string> = { feature: String(feature || '').trim() };
                        columns.forEach((column: any, index: number) => {
                          row[String(column?.key || `column_${index + 1}`)] = String(values[index] || '').trim();
                        });
                        return row;
                      }),
                  });
                }}
                rows={6}
                className="font-mono text-xs"
              />
            </Field>
          </>
        )}

        {block.type === 'countdown' && (
          <>
            <Field label="Label">
              <Input value={String(block.content.label || '')} onChange={(event) => updateContent({ label: event.target.value })} className="h-8 text-sm" />
            </Field>
            <Field label="End Date" hint="ISO date or any browser-friendly date string.">
              <Input value={String(block.content.endDate || '')} onChange={(event) => updateContent({ endDate: event.target.value })} className="h-8 text-sm" placeholder="2026-03-26T16:00:00.000Z" />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Button Text">
                <Input value={String(block.content.buttonText || '')} onChange={(event) => updateContent({ buttonText: event.target.value })} className="h-8 text-sm" />
              </Field>
              <Field label="Button URL">
                <Input value={String(block.content.buttonUrl || '')} onChange={(event) => updateContent({ buttonUrl: event.target.value })} className="h-8 text-sm" />
              </Field>
            </div>
          </>
        )}

        {block.type === 'form' && formContent ? (
          <div className="space-y-5 rounded-xl border border-emerald-100 bg-emerald-50/40 p-4">
            <div>
              <h4 className="text-sm font-semibold text-foreground">Lead Capture Setup</h4>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Keep the form short, connect it to one list, and let UTMs plus referrer be captured automatically.
              </p>
            </div>

            <Field label="Destination List" hint="Every submission is saved into this contact list.">
              <Select
                value={formContent.targetListId || '__none'}
                onValueChange={(value) => {
                  if (value === '__none') {
                    updateContent({ targetListId: '', targetListName: '' });
                    return;
                  }
                  const list = emailLists.find((item) => item.id === value);
                  updateContent({ targetListId: value, targetListName: list?.name || '' });
                }}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Select a list" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">Not connected yet</SelectItem>
                  {emailLists.map((list) => (
                    <SelectItem key={list.id} value={list.id}>
                      {list.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <div className="rounded-lg border border-border bg-card p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Create a list here</p>
              <div className="mt-3 space-y-3">
                <Input value={newListName} onChange={(event) => setNewListName(event.target.value)} placeholder="Q2 Webinar Registrations" className="h-9 text-sm" />
                <Textarea value={newListDescription} onChange={(event) => setNewListDescription(event.target.value)} rows={2} placeholder="Optional note about where these leads came from" className="text-sm" />
                <Button size="sm" variant="outline" onClick={() => void handleCreateList()} disabled={isCreatingList}>
                  <Plus className="mr-1 h-4 w-4" /> {isCreatingList ? 'Creating...' : 'Create & Connect'}
                </Button>
              </div>
            </div>

            <Field label="Heading">
              <Input value={formContent.title} onChange={(event) => updateContent({ title: event.target.value })} className="h-8 text-sm" />
            </Field>
            <Field label="Description">
              <Textarea value={formContent.description} onChange={(event) => updateContent({ description: event.target.value })} rows={3} className="text-sm" />
            </Field>
            <Field label="Submit Button">
              <Input value={formContent.buttonText} onChange={(event) => updateContent({ buttonText: event.target.value })} className="h-8 text-sm" />
            </Field>
            <Field label="Success Message">
              <Textarea value={formContent.successMessage} onChange={(event) => updateContent({ successMessage: event.target.value })} rows={2} className="text-sm" />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Success Redirect URL" hint="Optional redirect after a successful submit.">
                <Input value={formContent.successRedirectUrl} onChange={(event) => updateContent({ successRedirectUrl: event.target.value })} className="h-8 text-sm" />
              </Field>
              <Field label="Success Asset URL" hint="Optional file or resource link shown after submit.">
                <Input value={formContent.successAssetUrl} onChange={(event) => updateContent({ successAssetUrl: event.target.value })} className="h-8 text-sm" />
              </Field>
            </div>
            <Field label="Anchor ID" hint="Use this to connect CTA buttons like #contact or #register.">
              <Input value={formContent.anchorId} onChange={(event) => updateContent({ anchorId: event.target.value })} className="h-8 text-sm" placeholder="contact" />
            </Field>
            <Field label="Privacy Note">
              <Textarea value={formContent.privacyNote} onChange={(event) => updateContent({ privacyNote: event.target.value })} rows={2} className="text-sm" />
            </Field>
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={formContent.requireConsent}
                onChange={(event) => updateContent({ requireConsent: event.target.checked })}
              />
              Require consent checkbox
            </label>
            {formContent.requireConsent ? (
              <Field label="Consent Label">
                <Textarea value={formContent.consentLabel} onChange={(event) => updateContent({ consentLabel: event.target.value })} rows={2} className="text-sm" />
              </Field>
            ) : null}

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Fields</p>
                  <p className="text-xs text-muted-foreground">Most high-intent pages convert best with 2-4 fields.</p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => updateContent({ fields: [...formContent.fields, createLandingPageFormField({ label: 'New field', key: `field_${formContent.fields.length + 1}` })] })}
                >
                  <Plus className="mr-1 h-4 w-4" /> Add Field
                </Button>
              </div>

              {formContent.fields.map((field, index) => (
                <div key={field.id} className="space-y-3 rounded-xl border border-border bg-card p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-foreground">Field {index + 1}</p>
                    <Button size="sm" variant="ghost" className="h-8 px-2 text-destructive hover:text-destructive" onClick={() => removeFormField(field.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Label">
                      <Input value={field.label} onChange={(event) => updateFormField(field.id, { label: event.target.value })} className="h-8 text-sm" />
                    </Field>
                    <Field label="Field Key" hint="Use values like email, company, or job_title for prospect mapping.">
                      <Input value={field.key} onChange={(event) => updateFormField(field.id, { key: event.target.value })} className="h-8 text-sm" />
                    </Field>
                    <Field label="Field Type">
                      <Select value={field.type} onValueChange={(value) => updateFormField(field.id, { type: value })}>
                        <SelectTrigger className="h-8 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="text">Text</SelectItem>
                          <SelectItem value="email">Email</SelectItem>
                          <SelectItem value="tel">Phone</SelectItem>
                          <SelectItem value="textarea">Textarea</SelectItem>
                          <SelectItem value="select">Select</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label="Placeholder">
                      <Input value={field.placeholder} onChange={(event) => updateFormField(field.id, { placeholder: event.target.value })} className="h-8 text-sm" />
                    </Field>
                  </div>

                  {field.type === 'select' ? (
                    <Field label="Options" hint="Comma separated">
                      <Textarea value={field.options.join(', ')} onChange={(event) => updateFormField(field.id, { options: splitByComma(event.target.value) })} rows={2} className="text-sm" />
                    </Field>
                  ) : null}

                  <label className="flex items-center gap-2 text-sm text-foreground">
                    <input type="checkbox" checked={field.required} onChange={(event) => updateFormField(field.id, { required: event.target.checked })} />
                    Required field
                  </label>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <Field label="Raw Content JSON" hint="Use this for advanced section fields or bulk edits.">
          <Textarea value={rawContent} onChange={(event) => setRawContent(event.target.value)} rows={7} className="font-mono text-xs" />
          <Button size="sm" variant="outline" onClick={applyRawContent}>Apply JSON</Button>
        </Field>

        <div className="space-y-3 border-t border-border pt-3">
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
  const [emailLists, setEmailLists] = useState<LandingPageEmailListOption[]>([]);
  const [leadStats, setLeadStats] = useState<Record<string, { total: number; lastSubmittedAt?: string }>>({});
  const [analyticsByPage, setAnalyticsByPage] = useState<Record<string, LandingPageAnalyticsSummary>>({});
  const [recentLeads, setRecentLeads] = useState<LandingPageLeadSubmission[]>([]);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  useEffect(() => {
    if (!hasLoaded) void loadPages();
  }, [hasLoaded, loadPages]);

  useEffect(() => {
    let cancelled = false;

    const loadLeadWorkspaceData = async () => {
      try {
        const [lists, stats, analytics] = await Promise.all([
          listLandingPageEmailLists(),
          listLandingPageLeadStats(),
          listLandingPageAnalyticsSummaries(),
        ]);
        if (cancelled) return;
        setEmailLists(lists);
        setLeadStats(stats);
        setAnalyticsByPage(analytics);
      } catch (error: any) {
        if (!cancelled) toast.error(error?.message || 'Unable to load landing page lead settings');
      }
    };

    void loadLeadWorkspaceData();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadRecentLeads = async () => {
      if (!currentPage?.id) {
        setRecentLeads([]);
        return;
      }

      try {
        const submissions = await listRecentLandingPageLeads(currentPage.id);
        if (!cancelled) setRecentLeads(submissions);
      } catch (error: any) {
        if (!cancelled) {
          setRecentLeads([]);
          toast.error(error?.message || 'Unable to load recent landing page leads');
        }
      }
    };

    void loadRecentLeads();

    return () => {
      cancelled = true;
    };
  }, [currentPage?.id]);

  const selectedBlock = useMemo(() => {
    if (!currentPage || !selectedBlockId) return null;
    return currentPage.blocks.find((item) => item.id === selectedBlockId) || null;
  }, [currentPage, selectedBlockId]);

  const currentPageLeadStat = currentPage?.id ? leadStats[currentPage.id] : null;
  const currentPageAnalytics = currentPage?.id ? analyticsByPage[currentPage.id] : null;
  const hasFormBlock = Boolean(currentPage?.blocks.some((block) => block.type === 'form'));

  const openLivePage = (slug: string) => {
    window.open(`/pages/${slug}`, '_blank', 'noopener,noreferrer');
  };

  const refreshEmailLists = async () => {
    const lists = await listLandingPageEmailLists();
    setEmailLists(lists);
  };

  const applyAiPageResult = (result: Record<string, any>) => {
    const blocks = Array.isArray(result?.blocks)
      ? result.blocks.map((block: any) => ({
          id: String(block?.id || crypto.randomUUID()),
          type: String(block?.type || 'text') as LPBlockType,
          content: block?.content && typeof block.content === 'object' ? block.content : {},
          styles: block?.styles && typeof block.styles === 'object' ? block.styles : {},
        }))
      : [];

    const generatedName = String(result?.name || currentPage?.name || 'AI Landing Page');
    const generatedSlug = slugifyValue(String(result?.slug || generatedName));
    const generatedSettings = result?.settings && typeof result.settings === 'object'
      ? { ...(currentPage?.settings || buildLandingPageTemplateSettings(LANDING_PAGE_TEMPLATES[0])), ...result.settings }
      : currentPage?.settings;

    if (currentPage) {
      if (currentPage.blocks.length > 0 && !window.confirm('Replace current sections with the AI-generated draft?')) return;
      updatePageField('name', generatedName);
      updatePageField('slug', generatedSlug);
      updatePageField('blocks', blocks);
      if (generatedSettings) updatePageField('settings', generatedSettings);
      updatePageField('published', false);
      selectBlock(null);
      return;
    }

    createNewPage({
      name: generatedName,
      slug: generatedSlug,
      blocks,
      settings: generatedSettings || buildLandingPageTemplateSettings(LANDING_PAGE_TEMPLATES[0]),
      published: false,
      createdAt: new Date(),
    });
  };

  const applyTemplateToCurrentPage = () => {
    if (!currentPage) return;
    const template = getLandingPageTemplateById(templateId);
    if (!template) return;
    if (currentPage.blocks.length > 0 && !window.confirm('Apply template and replace all existing sections on this page?')) return;
    updatePageField('blocks', buildLandingPageTemplateBlocks(template));
    updatePageField('settings', buildLandingPageTemplateSettings(template));
    if (!String(currentPage.name || '').trim()) updatePageField('name', template.name);
    if (!String(currentPage.slug || '').trim()) updatePageField('slug', slugifyValue(template.name));
    updatePageField('published', false);
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
      settings: buildLandingPageTemplateSettings(template),
      published: false,
      createdAt: new Date(),
    });
  };

  const handleAddBlock = (type: LPBlockType) => addBlock(createLandingPageBlock(type));

  const handleDragEnd = (event: DragEndEvent) => {
    if (!currentPage) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = currentPage.blocks.findIndex((item) => item.id === active.id);
    const newIndex = currentPage.blocks.findIndex((item) => item.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    reorderBlocks(arrayMove(currentPage.blocks, oldIndex, newIndex));
  };

  const handleCreateEmailList = async (name: string, description?: string) => {
    const created = await createLandingPageEmailList(name, description);
    await refreshEmailLists();
    toast.success(`Connected list "${created.name}" is ready`);
    return created;
  };

  const handlePublishToggle = async () => {
    if (!currentPage) return;
    if (!currentPage.published) {
      const issue = getFirstFormPublishIssue(currentPage.blocks);
      if (issue) {
        toast.error(issue.message);
        selectBlock(issue.blockId);
        return;
      }
    }
    updatePageField('published', !currentPage.published);
    await savePage();
  };

  if (!currentPage) {
    if (isLoading) {
      return <div className="flex h-full items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-b-2 border-emerald-600"></div></div>;
    }

    return (
      <div className="mx-auto max-w-6xl p-8">
        <div className="mb-6 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Landing Pages</h1>
            <p className="mt-1 text-sm text-muted-foreground">Build, publish, and route captured leads into the right list.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={() => setIsAiDialogOpen(true)} disabled={isSaving} variant="outline"><Sparkles className="mr-1 h-4 w-4" /> AI Generate</Button>
            <Button onClick={() => createNewPage()} disabled={isSaving} variant="outline"><Plus className="mr-1 h-4 w-4" /> Blank Page</Button>
            <Button onClick={() => createFromTemplate(templateId)} disabled={isSaving}><Sparkles className="mr-1 h-4 w-4" /> Use Template</Button>
          </div>
        </div>

        {pages.length === 0 ? (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl border-2 border-dashed border-border bg-card p-10 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-info/10"><FileText className="h-6 w-6 text-info" /></div>
            <h3 className="mb-2 font-semibold text-foreground">No pages yet</h3>
            <p className="mb-4 text-sm text-muted-foreground">Start from a template or create a blank page.</p>
            <div className="flex items-center justify-center gap-2">
              <Button onClick={() => setIsAiDialogOpen(true)} disabled={isSaving} variant="outline"><Sparkles className="mr-1 h-4 w-4" /> Generate With AI</Button>
              <Button onClick={() => createFromTemplate(templateId)} disabled={isSaving}><Sparkles className="mr-1 h-4 w-4" /> Start From Template</Button>
              <Button onClick={() => createNewPage()} disabled={isSaving} variant="outline"><Plus className="mr-1 h-4 w-4" /> Blank Page</Button>
            </div>
          </motion.div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {pages.map((page) => {
              const issue = getFirstFormPublishIssue(page.blocks);
              const stat = leadStats[page.id];
              const analytics = analyticsByPage[page.id];
              const formCount = page.blocks.filter((block) => block.type === 'form').length;

              return (
                <div key={page.id} className="cursor-pointer rounded-xl border border-border bg-card p-5 transition-all hover:border-primary/30 hover:shadow-md" onClick={() => setCurrentPage(page)}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate font-semibold text-foreground">{page.name || 'Untitled'}</h3>
                      <p className="mt-1 truncate text-xs text-muted-foreground">/pages/{page.slug || 'unsaved-slug'}</p>
                      <div className="mt-3 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                        <span>{page.blocks.length} section{page.blocks.length === 1 ? '' : 's'}</span>
                        <span>{formCount} form{formCount === 1 ? '' : 's'}</span>
                        <span>{page.published ? 'Published' : 'Draft'}</span>
                        {analytics?.views ? <span>{analytics.views} views</span> : null}
                      </div>
                      <p className="mt-3 text-sm text-foreground">{getPageLeadSummary(stat?.total || 0, stat?.lastSubmittedAt)}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{issue ? `Needs attention: ${issue.message}` : formCount > 0 ? `Analytics: ${getAnalyticsSummaryText(analytics)}` : 'Add a form to capture leads.'}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      {page.published && page.slug ? (
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(event) => { event.stopPropagation(); openLivePage(page.slug); }}>
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      ) : null}
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={(event) => { event.stopPropagation(); if (!window.confirm(`Delete "${page.name || 'Untitled'}"?`)) return; void deletePage(page.id); }}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-8">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Starter Templates</h2>
              <p className="text-xs text-muted-foreground">Each template is ready for a single conversion goal and one connected form.</p>
            </div>
            <Select value={templateId} onValueChange={setTemplateId}>
              <SelectTrigger className="h-8 w-56 text-sm"><SelectValue placeholder="Template" /></SelectTrigger>
              <SelectContent>{LANDING_PAGE_TEMPLATES.map((template) => <SelectItem key={template.id} value={template.id}>{template.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            {LANDING_PAGE_TEMPLATES.map((template) => (
              <div key={template.id} className="rounded-xl border border-border bg-card p-4">
                <p className="text-sm font-semibold text-foreground">{template.name}</p>
                <p className="mt-1 min-h-[36px] text-xs text-muted-foreground">{template.description}</p>
                <Button size="sm" className="mt-3 w-full" variant={templateId === template.id ? 'default' : 'outline'} onClick={() => createFromTemplate(template.id)}>Use Template</Button>
              </div>
            ))}
          </div>
        </div>

        <AiLandingPageDialog open={isAiDialogOpen} onOpenChange={setIsAiDialogOpen} onGenerated={({ result }) => applyAiPageResult(result)} />
      </div>
    );
  }

  const issue = getFirstFormPublishIssue(currentPage.blocks);

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border bg-card px-4">
        <div className="flex min-w-0 items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setCurrentPage(null)}><ArrowLeft className="mr-1 h-4 w-4" /> Back</Button>
          <div className="h-5 w-px bg-border" />
          <span className="whitespace-nowrap text-sm font-medium text-muted-foreground">Page Editor</span>
          <Input value={currentPage.name} onChange={(event) => updatePageField('name', event.target.value)} placeholder="Page name..." className="h-8 w-40 text-sm" />
          <Input value={currentPage.slug} onChange={(event) => updatePageField('slug', event.target.value)} placeholder="page-slug" className="h-8 w-40 text-sm" />
          <Select value={templateId} onValueChange={setTemplateId}>
            <SelectTrigger className="h-8 w-44 text-sm"><SelectValue placeholder="Template" /></SelectTrigger>
            <SelectContent>{LANDING_PAGE_TEMPLATES.map((template) => <SelectItem key={template.id} value={template.id}>{template.name}</SelectItem>)}</SelectContent>
          </Select>
          <Button size="sm" variant="outline" onClick={applyTemplateToCurrentPage} disabled={isSaving}><Sparkles className="mr-1 h-4 w-4" /> Apply Template</Button>
          <Button size="sm" variant="outline" onClick={() => setIsAiDialogOpen(true)} disabled={isSaving}><Sparkles className="mr-1 h-4 w-4" /> AI Assist</Button>
          <span className="hidden text-xs text-muted-foreground xl:inline">{getPageLeadSummary(currentPageLeadStat?.total || 0, currentPageLeadStat?.lastSubmittedAt)} · {getAnalyticsSummaryText(currentPageAnalytics || undefined)}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-lg bg-muted p-0.5">
            {([
              ['desktop', Monitor],
              ['tablet', Tablet],
              ['mobile', Smartphone],
            ] as const).map(([mode, Icon]) => (
              <button key={mode} onClick={() => setPreviewMode(mode)} className={cn('rounded-md p-1.5 transition-colors', previewMode === mode ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground')}>
                <Icon className="h-4 w-4" />
              </button>
            ))}
          </div>
          {currentPage.published && currentPage.slug ? <Button size="sm" variant="outline" onClick={() => openLivePage(currentPage.slug)}><ExternalLink className="mr-1 h-4 w-4" /> View Live</Button> : null}
          <Button size="sm" variant={currentPage.published ? 'outline' : 'default'} onClick={() => void handlePublishToggle()} disabled={isSaving}>{currentPage.published ? 'Unpublish' : 'Publish'}</Button>
          <Button size="sm" onClick={() => void savePage()} disabled={isSaving}><Save className="mr-1 h-4 w-4" /> {isSaving ? 'Saving...' : 'Save'}</Button>
          <Button variant="ghost" size="sm" onClick={() => { if (!window.confirm(`Delete "${currentPage.name || 'Untitled'}"?`)) return; void deletePage(currentPage.id); }} className="text-destructive hover:text-destructive" disabled={isSaving}><Trash2 className="mr-1 h-4 w-4" /> Delete</Button>
        </div>
      </div>

      {issue ? <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">Publish check: {issue.message}</div> : null}

      <div className="flex flex-1 overflow-hidden">
        <div className="w-56 shrink-0 overflow-y-auto border-r border-border bg-card">
          <div className="border-b border-border p-4"><h3 className="text-sm font-semibold text-foreground">Sections</h3></div>
          <div className="grid grid-cols-2 gap-2 p-3">
            {lpBlockTypes.map((item) => (
              <button key={item.type} onClick={() => handleAddBlock(item.type)} className="flex flex-col items-center gap-1.5 rounded-lg border border-border p-3 text-muted-foreground transition-all hover:border-block-border hover:bg-block-hover hover:text-foreground">
                <item.icon className="h-4 w-4" />
                <span className="text-xs font-medium">{item.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto bg-canvas-bg p-6" onClick={() => selectBlock(null)}>
          <div
            className={cn('mx-auto overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-all', previewMode === 'mobile' ? 'max-w-sm' : previewMode === 'tablet' ? 'max-w-2xl' : 'max-w-5xl')}
            onClick={(event) => event.stopPropagation()}
            style={{
              backgroundColor: currentPage.settings?.theme?.background,
              color: currentPage.settings?.theme?.text,
            }}
          >
            {currentPage.settings?.announcementBar?.enabled ? (
              <div
                className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-[0.18em]"
                style={{
                  background: `linear-gradient(90deg, ${currentPage.settings.theme.accent}, ${currentPage.settings.theme.accentAlt})`,
                  color: currentPage.settings.theme.accentContrast,
                }}
              >
                {currentPage.settings.announcementBar.text}
              </div>
            ) : null}
            {currentPage.blocks.length === 0 ? (
              <div className="flex h-64 flex-col items-center justify-center px-6 text-center text-muted-foreground">
                <Layout className="mb-3 h-8 w-8" />
                <p className="text-sm font-medium">Add sections from the left panel</p>
                <p className="mt-1 text-xs">Apply a template to get a conversion-ready structure faster.</p>
              </div>
            ) : (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={currentPage.blocks.map((item) => item.id)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-2 px-3 py-2 pl-10">{currentPage.blocks.map((item) => <SortableLPBlock key={item.id} block={item} />)}</div>
                </SortableContext>
              </DndContext>
            )}
            {currentPage.settings?.stickyCta?.enabled ? (
              <div className="px-4 pb-4">
                <div className="ml-auto flex w-fit items-center gap-3 rounded-full border px-4 py-3 text-xs shadow-sm" style={{ borderColor: currentPage.settings.theme.border, backgroundColor: currentPage.settings.theme.surface }}>
                  <span>{currentPage.settings.stickyCta.label}</span>
                  <span className="rounded-full px-3 py-1 font-semibold" style={{ backgroundColor: currentPage.settings.theme.accent, color: currentPage.settings.theme.accentContrast }}>
                    {currentPage.settings.stickyCta.buttonText}
                  </span>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <LandingPageSettingsPanel
          page={currentPage}
          block={selectedBlock}
          analytics={currentPageAnalytics}
          sectionCount={currentPage.blocks.length}
          hasFormBlock={hasFormBlock}
          leadCount={currentPageLeadStat?.total || 0}
          recentLeads={recentLeads}
          emailLists={emailLists}
          onClose={() => selectBlock(null)}
          onUpdate={updateBlock}
          onUpdatePageSettings={(nextSettings) => updatePageField('settings', nextSettings)}
          onCreateEmailList={handleCreateEmailList}
        />
      </div>

      <AiLandingPageDialog open={isAiDialogOpen} onOpenChange={setIsAiDialogOpen} currentPage={currentPage} onGenerated={({ result }) => applyAiPageResult(result)} />
    </div>
  );
}

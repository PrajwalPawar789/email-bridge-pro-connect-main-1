import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { toast } from '@/hooks/use-toast';
import { 
  Plus,
  Edit,
  Trash2,
  Save,
  Info,
  Eye,
  Search,
  LayoutTemplate,
  FileText,
  ArrowLeft,
  Sparkles,
  Code,
  Clock,
  PenLine,
  Zap,
  ListChecks
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';

const TEMPLATE_INDUSTRIES = [
  { value: 'all', label: 'All industries' },
  { value: 'saas', label: 'SaaS' },
  { value: 'ecommerce', label: 'Ecommerce' },
  { value: 'real_estate', label: 'Real estate' },
  { value: 'healthcare', label: 'Healthcare' },
  { value: 'finance', label: 'Finance' },
  { value: 'education', label: 'Education' },
  { value: 'agency', label: 'Agency' },
  { value: 'recruiting', label: 'Recruiting' },
  { value: 'nonprofit', label: 'Nonprofit' },
  { value: 'manufacturing', label: 'Manufacturing' },
  { value: 'hospitality', label: 'Hospitality' },
  { value: 'other', label: 'Other' },
];

const TEMPLATE_GOALS = [
  { value: 'cold_outreach', label: 'Cold outreach' },
  { value: 'follow_up', label: 'Follow up' },
  { value: 'newsletter', label: 'Newsletter' },
  { value: 'product_update', label: 'Product update' },
  { value: 'event_invite', label: 'Event invite' },
  { value: 'reengagement', label: 'Re-engagement' },
  { value: 'partnership', label: 'Partnership' },
  { value: 'support', label: 'Support update' },
];

const TEMPLATE_TONES = [
  { value: 'professional', label: 'Professional' },
  { value: 'friendly', label: 'Friendly' },
  { value: 'direct', label: 'Direct' },
  { value: 'warm', label: 'Warm' },
  { value: 'bold', label: 'Bold' },
];

const TEMPLATE_LENGTHS = [
  { value: 'short', label: 'Short' },
  { value: 'standard', label: 'Standard' },
  { value: 'detailed', label: 'Detailed' },
];

const TEMPLATE_CTAS = [
  { value: 'reply', label: 'Reply to this email' },
  { value: 'book_call', label: 'Book a call' },
  { value: 'visit_link', label: 'Visit a link' },
  { value: 'download', label: 'Download resource' },
  { value: 'rsvp', label: 'RSVP to event' },
  { value: 'start_trial', label: 'Start a trial' },
];

const TEMPLATE_COMPANY_SIZES = [
  { value: 'any', label: 'Any size' },
  { value: '1-10', label: '1-10' },
  { value: '11-50', label: '11-50' },
  { value: '51-200', label: '51-200' },
  { value: '201-1000', label: '201-1000' },
  { value: '1000+', label: '1000+' },
];

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const renderPlainTextPreviewHtml = (value: string) => {
  if (!value) return '';
  const escaped = escapeHtml(value);

  const formatInline = (text: string) => {
    const withBold = text.replace(/\*\*([\s\S]+?)\*\*/g, '<strong>$1</strong>');
    return withBold.replace(/__([\s\S]+?)__/g, '<u>$1</u>');
  };

  const lines = escaped.split(/\r?\n/);
  const chunks: string[] = [];
  const paragraphLines: string[] = [];
  let activeList: 'ul' | 'ol' | null = null;

  const bulletRegex = /^\s*(?:[-*]|\u2022)\s+(.*)$/;
  const orderedRegex = /^\s*(\d+)[.)]\s+(.*)$/;

  const closeList = () => {
    if (!activeList) return;
    chunks.push(activeList === 'ul' ? '</ul>' : '</ol>');
    activeList = null;
  };

  const flushParagraph = () => {
    if (paragraphLines.length === 0) return;
    const html = paragraphLines.map(line => formatInline(line)).join('<br />');
    chunks.push(`<p>${html}</p>`);
    paragraphLines.length = 0;
  };

  lines.forEach((line) => {
    const bulletMatch = line.match(bulletRegex);
    if (bulletMatch) {
      flushParagraph();
      if (activeList !== 'ul') {
        closeList();
        chunks.push('<ul>');
        activeList = 'ul';
      }
      chunks.push(`<li>${formatInline(bulletMatch[1])}</li>`);
      return;
    }

    const orderedMatch = line.match(orderedRegex);
    if (orderedMatch) {
      flushParagraph();
      const startValue = Number.parseInt(orderedMatch[1], 10);
      if (activeList !== 'ol') {
        closeList();
        const startAttr = Number.isFinite(startValue) ? ` start="${startValue}"` : '';
        chunks.push(`<ol${startAttr}>`);
        activeList = 'ol';
      }
      chunks.push(`<li>${formatInline(orderedMatch[2])}</li>`);
      return;
    }

    if (line.trim() === '') {
      flushParagraph();
      return;
    }

    closeList();
    paragraphLines.push(line);
  });

  flushParagraph();
  closeList();
  return chunks.join('');
};

const TemplateShell = ({ children }: { children: React.ReactNode }) => (
  <div className="relative -my-8 min-h-[calc(100vh-4rem)] bg-[var(--shell-bg)] text-[var(--shell-ink)]">
    <style>{`
      @keyframes template-rise {
        from { opacity: 0; transform: translateY(14px); }
        to { opacity: 1; transform: translateY(0); }
      }
      @keyframes template-float {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-12px); }
      }
      .template-rise { animation: template-rise 0.6s ease-out both; }
      .template-float { animation: template-float 10s ease-in-out infinite; }
      @media (prefers-reduced-motion: reduce) {
        .template-rise, .template-float { animation: none; }
      }
      .template-preview ul,
      .template-preview ol {
        list-style-position: outside;
        margin: 0.6rem 0;
        padding-left: 1.4rem;
      }
      .template-preview ul {
        list-style-type: disc;
      }
      .template-preview ol {
        list-style-type: decimal;
      }
      .template-preview li {
        margin: 0.2rem 0;
      }
      .template-preview p {
        margin: 0.65rem 0;
      }
      .template-preview p:first-child {
        margin-top: 0;
      }
      .template-preview p:last-child {
        margin-bottom: 0;
      }
    `}</style>
    <div className="pointer-events-none absolute inset-0">
      <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-emerald-200/40 blur-3xl template-float"></div>
      <div className="absolute -left-24 top-1/3 h-72 w-72 rounded-full bg-amber-200/35 blur-3xl template-float" style={{ animationDelay: "1.2s" }}></div>
      <div className="absolute bottom-0 right-1/3 h-56 w-56 rounded-full bg-sky-200/30 blur-3xl template-float" style={{ animationDelay: "2.2s" }}></div>
    </div>
    <div className="relative mx-auto w-full max-w-7xl space-y-6 px-5 py-6 lg:px-8 lg:py-8">
      {children}
    </div>
  </div>
);

const TemplateManager = () => {
  const [templates, setTemplates] = useState<any[]>([]);
  const [view, setView] = useState<'list' | 'editor'>('list');
  const [editingTemplate, setEditingTemplate] = useState<any>(null);
  const [form, setForm] = useState({
    name: '',
    subject: '',
    content: '',
    is_html: false
  });
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewContent, setPreviewContent] = useState<any>(null);
  const [templatePage, setTemplatePage] = useState(1);
  const [templatePageSize, setTemplatePageSize] = useState(6);
  const [templateSort, setTemplateSort] = useState('recent');
  const contentRef = useRef<HTMLTextAreaElement | null>(null);
  const [templateProfile, setTemplateProfile] = useState({
    industry: '',
    audienceRole: '',
    companySize: 'any',
    region: '',
    language: 'English',
    goal: 'cold_outreach',
    tone: 'professional',
    length: 'standard',
    cta: 'reply',
    ctaText: '',
    ctaLink: '',
  });
  const templatePageSizeOptions = [6, 9, 12];
  const templateSortOptions = [
    { value: 'recent', label: 'Newest first' },
    { value: 'name', label: 'Name A-Z' },
    { value: 'updated', label: 'Recently updated' },
    { value: 'type', label: 'HTML first' },
  ];

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('email_templates')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      setTemplates(data || []);
    } catch (error: any) {
      console.error('Error fetching templates:', error);
    }
  };

  const handleSave = async () => {
    if (!form.name || !form.subject || !form.content) {
      toast({
        title: "Missing Information",
        description: "Please fill in the template name, subject, and content.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      if (editingTemplate) {
        // Update existing template
        const { error } = await supabase
          .from('email_templates')
          .update({
            name: form.name,
            subject: form.subject,
            content: form.content,
            is_html: form.is_html,
            updated_at: new Date().toISOString()
          })
          .eq('id', editingTemplate.id);

        if (error) throw error;
        toast({ title: "Success", description: "Template updated successfully!" });
      } else {
        // Create new template
        const { error } = await supabase
          .from('email_templates')
          .insert({
            user_id: user.id,
            name: form.name,
            subject: form.subject,
            content: form.content,
            is_html: form.is_html
          });

        if (error) throw error;
        toast({ title: "Success", description: "Template created successfully!" });
      }

      resetForm();
      await fetchTemplates();
      setView('list');
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (template: any) => {
    setEditingTemplate(template);
    setForm({
      name: template.name,
      subject: template.subject,
      content: template.content,
      is_html: template.is_html
    });
    setView('editor');
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this template?")) return;

    try {
      const { error } = await supabase
        .from('email_templates')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast({ title: "Deleted", description: "Template removed." });
      await fetchTemplates();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const resetForm = () => {
    setForm({
      name: '',
      subject: '',
      content: '',
      is_html: false
    });
    setEditingTemplate(null);
  };

  const insertAtCursor = (value: string) => {
    const textarea = contentRef.current;
    if (!textarea) {
      setForm(prev => ({ ...prev, content: `${prev.content}${value}` }));
      return;
    }

    const start = textarea.selectionStart ?? 0;
    const end = textarea.selectionEnd ?? 0;
    const base = textarea.value || '';
    const before = base.slice(0, start);
    const after = base.slice(end);

    setForm(prev => ({
      ...prev,
      content: `${before}${value}${after}`,
    }));

    requestAnimationFrame(() => {
      textarea.focus();
      const nextPos = start + value.length;
      textarea.setSelectionRange(nextPos, nextPos);
    });
  };

  const insertVariable = (variable: string) => {
    insertAtCursor(variable);
    toast({
      title: "Variable Added",
      description: `${variable} added to content.`,
      duration: 1500,
    });
  };

  const applyBold = () => {
    const textarea = contentRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart ?? 0;
    const end = textarea.selectionEnd ?? 0;
    const isCollapsed = start === end;
    const useHtml = form.is_html;
    const openTag = useHtml ? '<strong>' : '**';
    const closeTag = useHtml ? '</strong>' : '**';

    setForm(prev => {
      const base = prev.content || '';
      const before = base.slice(0, start);
      const selected = base.slice(start, end);
      const after = base.slice(end);
      return {
        ...prev,
        content: `${before}${openTag}${selected}${closeTag}${after}`,
      };
    });

    if (!useHtml) {
      toast({
        title: "Bold added",
        description: "Plain text uses **bold** markers.",
        duration: 1500,
      });
    }

    requestAnimationFrame(() => {
      textarea.focus();
      const cursorStart = start + openTag.length;
      const cursorEnd = isCollapsed ? cursorStart : cursorStart + (end - start);
      textarea.setSelectionRange(cursorStart, cursorEnd);
    });
  };

  const applyUnderline = () => {
    const textarea = contentRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart ?? 0;
    const end = textarea.selectionEnd ?? 0;
    const isCollapsed = start === end;
    const useHtml = form.is_html;
    const openTag = useHtml ? '<u>' : '__';
    const closeTag = useHtml ? '</u>' : '__';

    setForm(prev => {
      const base = prev.content || '';
      const before = base.slice(0, start);
      const selected = base.slice(start, end);
      const after = base.slice(end);
      return {
        ...prev,
        content: `${before}${openTag}${selected}${closeTag}${after}`,
      };
    });

    if (!useHtml) {
      toast({
        title: "Underline added",
        description: "Plain text uses __underline__ markers.",
        duration: 1500,
      });
    }

    requestAnimationFrame(() => {
      textarea.focus();
      const cursorStart = start + openTag.length;
      const cursorEnd = isCollapsed ? cursorStart : cursorStart + (end - start);
      textarea.setSelectionRange(cursorStart, cursorEnd);
    });
  };

  const applyBullets = () => {
    const textarea = contentRef.current;
    const base = form.content || '';
    const useHtml = form.is_html;

    if (!textarea) {
      const fallback = useHtml
        ? '<ul>\n  <li>Item</li>\n</ul>'
        : '- Item';
      setForm(prev => ({ ...prev, content: `${prev.content}${fallback}` }));
      return;
    }

    const start = textarea.selectionStart ?? 0;
    const end = textarea.selectionEnd ?? 0;
    const selected = base.slice(start, end);
    const hasSelection = selected.trim().length > 0;
    const lines = hasSelection ? selected.split(/\r?\n/) : [];
    const items = lines.map(line => line.trim()).filter(Boolean);

    let insertion = '';
    let cursorStart = start;
    let cursorEnd = start;

    if (useHtml) {
      const listItems = (items.length ? items : ['Item']).map((line) => `  <li>${line}</li>`).join('\n');
      insertion = `<ul>\n${listItems}\n</ul>`;
      const firstItem = items.length ? items[0] : 'Item';
      const itemStart = insertion.indexOf('<li>') + 4;
      cursorStart = start + itemStart;
      cursorEnd = cursorStart + firstItem.length;
    } else {
      const listItems = (items.length ? items : ['Item']).map((line) => `- ${line}`).join('\n');
      insertion = listItems;
      const firstItem = items.length ? items[0] : 'Item';
      const itemStart = insertion.indexOf(firstItem);
      cursorStart = start + itemStart;
      cursorEnd = cursorStart + firstItem.length;
    }

    const before = base.slice(0, start);
    const after = base.slice(end);
    setForm(prev => ({
      ...prev,
      content: `${before}${insertion}${after}`,
    }));

    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(cursorStart, cursorEnd);
    });
  };

  const selectedGoal = TEMPLATE_GOALS.find((item) => item.value === templateProfile.goal) ?? TEMPLATE_GOALS[0];
  const selectedTone = TEMPLATE_TONES.find((item) => item.value === templateProfile.tone) ?? TEMPLATE_TONES[0];
  const selectedLength = TEMPLATE_LENGTHS.find((item) => item.value === templateProfile.length) ?? TEMPLATE_LENGTHS[0];
  const selectedCta = TEMPLATE_CTAS.find((item) => item.value === templateProfile.cta) ?? TEMPLATE_CTAS[0];
  const selectedCompanySize = TEMPLATE_COMPANY_SIZES.find((item) => item.value === templateProfile.companySize) ?? TEMPLATE_COMPANY_SIZES[0];
  const industryLabel = templateProfile.industry.trim() || 'All industries';
  const roleLabel = templateProfile.audienceRole.trim() || 'your audience';
  const regionLabel = templateProfile.region.trim() || 'any region';
  const languageLabel = templateProfile.language.trim() || 'English';

  const getPaginationItems = (page: number, total: number) => {
    if (total <= 7) {
      return Array.from({ length: total }, (_, i) => i + 1);
    }

    const pages = new Set<number>([1, total, page, page - 1, page + 1]);
    const sorted = Array.from(pages)
      .filter((p) => p >= 1 && p <= total)
      .sort((a, b) => a - b);

    const items: Array<number | "ellipsis"> = [];
    let previous = 0;

    sorted.forEach((p) => {
      if (p - previous > 1) {
        if (previous !== 0) items.push("ellipsis");
      }
      items.push(p);
      previous = p;
    });

    return items;
  };

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const sortedTemplates = [...templates].sort((a, b) => {
    if (templateSort === 'name') {
      return (a.name || '').localeCompare(b.name || '');
    }
    if (templateSort === 'type') {
      return (b.is_html ? 1 : 0) - (a.is_html ? 1 : 0);
    }
    if (templateSort === 'updated') {
      const aUpdated = new Date(a.updated_at || a.created_at || 0).getTime();
      const bUpdated = new Date(b.updated_at || b.created_at || 0).getTime();
      return bUpdated - aUpdated;
    }

    const aDate = new Date(a.created_at || 0).getTime();
    const bDate = new Date(b.created_at || 0).getTime();
    return bDate - aDate;
  });

  const filteredTemplates = sortedTemplates.filter((template) => {
    if (!normalizedQuery) return true;
    const name = template.name?.toLowerCase() || '';
    const subject = template.subject?.toLowerCase() || '';
    return name.includes(normalizedQuery) || subject.includes(normalizedQuery);
  });

  const htmlCount = templates.filter((template) => template.is_html).length;
  const textCount = templates.length - htmlCount;
  const lastUpdated = templates.reduce((latest, template) => {
    const stamp = new Date(template.updated_at || template.created_at || 0).getTime();
    return stamp > latest ? stamp : latest;
  }, 0);
  const lastUpdatedLabel = lastUpdated ? new Date(lastUpdated).toLocaleDateString() : 'N/A';
  const templateSummaryCards = [
    {
      label: 'Total templates',
      value: templates.length.toLocaleString(),
      helper: `${filteredTemplates.length.toLocaleString()} visible`,
      icon: LayoutTemplate,
      tone: 'bg-emerald-100/80 text-emerald-700',
    },
    {
      label: 'HTML templates',
      value: htmlCount.toLocaleString(),
      helper: 'Rich layouts',
      icon: Code,
      tone: 'bg-sky-100/80 text-sky-700',
    },
    {
      label: 'Text templates',
      value: textCount.toLocaleString(),
      helper: 'Plain text',
      icon: FileText,
      tone: 'bg-amber-100/80 text-amber-700',
    },
    {
      label: 'Last updated',
      value: lastUpdatedLabel,
      helper: 'Most recent edit',
      icon: Clock,
      tone: 'bg-teal-100/80 text-teal-700',
    },
  ];

  const templateTotalPages = Math.max(1, Math.ceil(filteredTemplates.length / templatePageSize));
  const templatePageStart = filteredTemplates.length === 0 ? 0 : (templatePage - 1) * templatePageSize + 1;
  const templatePageEnd = Math.min(templatePage * templatePageSize, filteredTemplates.length);
  const templatePaginationItems = getPaginationItems(templatePage, templateTotalPages);
  const pagedTemplates = filteredTemplates.slice(
    (templatePage - 1) * templatePageSize,
    templatePage * templatePageSize
  );

  const handleTemplatePageChange = (page: number) => {
    if (page < 1 || page > templateTotalPages || page === templatePage) return;
    setTemplatePage(page);
  };

  const handleTemplatePageSizeChange = (value: string) => {
    const nextSize = Number(value);
    if (!Number.isFinite(nextSize)) return;
    setTemplatePageSize(nextSize);
    setTemplatePage(1);
  };

  const handleTemplateSortChange = (value: string) => {
    setTemplateSort(value);
    setTemplatePage(1);
  };

  useEffect(() => {
    if (templatePage > templateTotalPages) {
      setTemplatePage(templateTotalPages);
    }
  }, [templatePage, templateTotalPages]);

  useEffect(() => {
    setTemplatePage(1);
  }, [searchQuery, templateSort, templatePageSize]);

  // --- RENDER HELPERS ---
  const renderListView = () => (
    <TemplateShell>
      <section className="template-rise relative overflow-hidden rounded-[28px] border border-[var(--shell-border)] bg-[var(--shell-surface-strong)] p-6 shadow-[0_18px_40px_rgba(15,23,42,0.12)]">
        <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--shell-muted)]">
              <span className="flex items-center gap-2">
                <Sparkles className="h-3 w-3" />
                Template studio
              </span>
              <Badge
                variant="outline"
                className="h-6 rounded-full border-[var(--shell-border)] bg-white/70 px-3 text-[10px] font-semibold text-[var(--shell-ink)]"
              >
                {templates.length.toLocaleString()} total
              </Badge>
            </div>
            <h2 className="text-3xl font-semibold text-[var(--shell-ink)] md:text-4xl" style={{ fontFamily: "var(--shell-font-display)" }}>
              Email Templates
            </h2>
            <p className="max-w-xl text-sm text-[var(--shell-muted)]">
              Build reusable messaging with subject lines, variables, and HTML or plain text content.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => { resetForm(); setView('editor'); }}
                className="h-10 rounded-full bg-emerald-600 px-5 text-xs font-semibold hover:bg-emerald-700"
              >
                <Plus className="h-4 w-4 mr-2" />
                Create Template
              </Button>
              <Button
                variant="outline"
                onClick={() => setSearchQuery('')}
                className="h-10 rounded-full border-[var(--shell-border)] bg-white/80 text-xs font-semibold text-[var(--shell-ink)]"
              >
                <Search className="h-4 w-4 mr-2" />
                Clear search
              </Button>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {templateSummaryCards.map((card) => {
              const Icon = card.icon;
              return (
                <div key={card.label} className="rounded-2xl border border-[var(--shell-border)] bg-white/80 p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--shell-muted)]">
                      {card.label}
                    </p>
                    <div className={`rounded-xl p-2 ${card.tone}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                  </div>
                  <p className="mt-2 text-lg font-semibold text-[var(--shell-ink)]">{card.value}</p>
                  <p className="text-xs text-[var(--shell-muted)]">{card.helper}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="grid gap-6">
        <div className="space-y-4">
          <Card className="rounded-[24px] border-[var(--shell-border)] bg-[var(--shell-surface-strong)] shadow-[0_12px_24px_rgba(15,23,42,0.08)]">
            <CardHeader className="space-y-3 pb-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <CardTitle className="text-lg font-semibold text-[var(--shell-ink)]">Template library</CardTitle>
                  <CardDescription className="text-xs text-[var(--shell-muted)]">
                    Search templates, preview content, and manage updates.
                  </CardDescription>
                </div>
                <Badge
                  variant="outline"
                  className="h-6 rounded-full border-[var(--shell-border)] bg-white/70 px-3 text-[10px] font-semibold text-[var(--shell-ink)]"
                >
                  {filteredTemplates.length.toLocaleString()} shown
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="relative w-full md:max-w-sm">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-[var(--shell-muted)]" />
                  <Input
                    placeholder="Search templates by name or subject..."
                    className="h-10 rounded-full border-[var(--shell-border)] bg-white/90 pl-10"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <Select value={templateSort} onValueChange={handleTemplateSortChange}>
                    <SelectTrigger className="h-9 w-[180px]">
                      <SelectValue placeholder="Sort by" />
                    </SelectTrigger>
                    <SelectContent>
                      {templateSortOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {filteredTemplates.length === 0 ? (
            <div className="rounded-[24px] border-2 border-dashed border-[var(--shell-border)] bg-white/80 p-10 text-center shadow-[0_10px_20px_rgba(15,23,42,0.06)]">
              <LayoutTemplate className="h-10 w-10 mx-auto text-emerald-500/70 mb-4" />
              <h3 className="text-lg font-semibold text-[var(--shell-ink)]">No templates yet</h3>
              <p className="text-sm text-[var(--shell-muted)] mb-5">
                Start with a new template, then reuse it across campaigns.
              </p>
              <Button
                onClick={() => { resetForm(); setView('editor'); }}
                className="h-9 rounded-full bg-emerald-600 px-4 text-xs font-semibold hover:bg-emerald-700"
              >
                <Plus className="h-4 w-4 mr-2" />
                Create Template
              </Button>
            </div>
          ) : (
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {pagedTemplates.map((template) => {
                const updatedAt = new Date(template.updated_at || template.created_at).toLocaleDateString();
                return (
                  <Card
                    key={template.id}
                    className="group relative overflow-hidden rounded-[22px] border border-[var(--shell-border)] bg-white/90 shadow-[0_10px_20px_rgba(15,23,42,0.08)] transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_16px_30px_rgba(15,23,42,0.12)]"
                  >
                    <CardHeader className="space-y-3 pb-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <CardTitle className="text-lg font-semibold text-[var(--shell-ink)] line-clamp-1" title={template.name}>
                            {template.name}
                          </CardTitle>
                          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[var(--shell-muted)]">
                            <Badge
                              variant="outline"
                              className="h-6 rounded-full border-[var(--shell-border)] bg-white/90 text-[10px] font-semibold text-[var(--shell-ink)]"
                            >
                              {template.is_html ? 'HTML' : 'Text'}
                            </Badge>
                            <span>Updated {updatedAt}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 rounded-full p-0"
                            onClick={() => {
                              setPreviewContent(template);
                              setPreviewOpen(true);
                            }}
                          >
                            <Eye className="h-4 w-4 text-[var(--shell-muted)]" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 rounded-full p-0"
                            onClick={() => handleEdit(template)}
                          >
                            <Edit className="h-4 w-4 text-emerald-700" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 rounded-full p-0 hover:bg-rose-50"
                            onClick={() => handleDelete(template.id)}
                          >
                            <Trash2 className="h-4 w-4 text-rose-500" />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="pb-4">
                      <div className="rounded-2xl border border-[var(--shell-border)] bg-white/70 p-3 text-xs text-[var(--shell-muted)]">
                        <p className="font-semibold text-[var(--shell-ink)] mb-1 truncate">
                          Subject: {template.subject}
                        </p>
                        <p className="line-clamp-3">{template.content}</p>
                      </div>
                    </CardContent>
                    <CardFooter className="pt-4 text-xs text-[var(--shell-muted)] flex justify-between items-center border-t border-[var(--shell-border)] bg-white/70">
                      <span className="uppercase tracking-[0.2em] text-[10px] text-[var(--shell-muted)]">
                        Ready to use
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-emerald-700 hover:text-emerald-800 p-0"
                        onClick={() => handleEdit(template)}
                      >
                        Edit template <ArrowLeft className="h-3 w-3 ml-1 rotate-180" />
                      </Button>
                    </CardFooter>
                  </Card>
                );
              })}
            </div>
          )}

          {filteredTemplates.length > 0 && (
            <div className="rounded-2xl border border-[var(--shell-border)] bg-[var(--shell-surface-strong)] px-4 py-3 shadow-[0_10px_22px_rgba(15,23,42,0.08)]">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--shell-muted)]">
                  <span className="font-semibold uppercase tracking-wide text-[var(--shell-muted)]">Templates per page</span>
                  <Select value={String(templatePageSize)} onValueChange={handleTemplatePageSizeChange}>
                    <SelectTrigger className="h-8 w-[120px]">
                      <SelectValue placeholder="Per page" />
                    </SelectTrigger>
                    <SelectContent>
                      {templatePageSizeOptions.map((size) => (
                        <SelectItem key={size} value={String(size)}>
                          {size} / page
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span className="text-[var(--shell-muted)]">
                    Showing {templatePageStart}-{templatePageEnd} of {filteredTemplates.length}
                  </span>
                </div>
                <Pagination className="w-auto justify-end">
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious
                        href="#"
                        onClick={(event) => {
                          event.preventDefault();
                          handleTemplatePageChange(templatePage - 1);
                        }}
                        className={templatePage === 1 ? "pointer-events-none opacity-50" : ""}
                      />
                    </PaginationItem>
                    {templatePaginationItems.map((item, index) =>
                      item === "ellipsis" ? (
                        <PaginationItem key={`template-ellipsis-${index}`}>
                          <PaginationEllipsis />
                        </PaginationItem>
                      ) : (
                        <PaginationItem key={`template-${item}`}>
                          <PaginationLink
                            href="#"
                            isActive={item === templatePage}
                            onClick={(event) => {
                              event.preventDefault();
                              handleTemplatePageChange(item);
                            }}
                          >
                            {item}
                          </PaginationLink>
                        </PaginationItem>
                      )
                    )}
                    <PaginationItem>
                      <PaginationNext
                        href="#"
                        onClick={(event) => {
                          event.preventDefault();
                          handleTemplatePageChange(templatePage + 1);
                        }}
                        className={templatePage === templateTotalPages ? "pointer-events-none opacity-50" : ""}
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              </div>
            </div>
          )}
        </div>

        {/* <aside className="space-y-4">
          <div className="rounded-[24px] border border-[var(--shell-border)] bg-[var(--shell-surface-strong)] p-5 shadow-[0_12px_24px_rgba(15,23,42,0.08)]">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--shell-muted)]">
              <Sparkles className="h-3 w-3" />
              On this page
            </div>
            <h3 className="mt-2 text-lg font-semibold text-[var(--shell-ink)]" style={{ fontFamily: "var(--shell-font-display)" }}>
              Template essentials
            </h3>
            <p className="text-sm text-[var(--shell-muted)]">
              Build, preview, and manage reusable emails from one place.
            </p>
            <div className="mt-4 space-y-4">
              <div className="flex items-start gap-3">
                <div className="rounded-xl bg-emerald-100/80 p-2 text-emerald-700">
                  <PenLine className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-[var(--shell-ink)]">Create and edit</p>
                  <p className="text-xs text-[var(--shell-muted)]">
                    Draft new templates or revise existing messaging quickly.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="rounded-xl bg-sky-100/80 p-2 text-sky-700">
                  <Eye className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-[var(--shell-ink)]">Preview output</p>
                  <p className="text-xs text-[var(--shell-muted)]">
                    Review plain text or HTML before deploying.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="rounded-xl bg-amber-100/80 p-2 text-amber-700">
                  <Zap className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-[var(--shell-ink)]">Personalize fast</p>
                  <p className="text-xs text-[var(--shell-muted)]">
                    Insert variables for names, companies, and domains.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="rounded-xl bg-teal-100/80 p-2 text-teal-700">
                  <Search className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-[var(--shell-ink)]">Search + pagination</p>
                  <p className="text-xs text-[var(--shell-muted)]">
                    Filter large libraries and move through pages.
                  </p>
                </div>
              </div>
            </div>
            <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50/80 p-3 text-xs text-emerald-700">
              <p className="font-semibold">Quick tip</p>
              <p>Keep subject lines under 60 characters for stronger open rates.</p>
            </div>
          </div>
        </aside> */}
      </section>
    </TemplateShell>
  );

  const renderEditorView = () => (
    <TemplateShell>
      <section className="template-rise relative overflow-hidden rounded-[28px] border border-[var(--shell-border)] bg-[var(--shell-surface-strong)] p-6 shadow-[0_18px_40px_rgba(15,23,42,0.12)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setView('list')}
              className="h-9 rounded-full border border-[var(--shell-border)] bg-white/80 px-4 text-xs font-semibold text-[var(--shell-ink)]"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to List
            </Button>
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--shell-muted)]">
                <span className="flex items-center gap-2">
                  <ListChecks className="h-3 w-3" />
                  Template editor
                </span>
                <Badge
                  variant="outline"
                  className="h-6 rounded-full border-[var(--shell-border)] bg-white/70 px-3 text-[10px] font-semibold text-[var(--shell-ink)]"
                >
                  {editingTemplate ? 'Editing' : 'New'}
                </Badge>
              </div>
              <h2 className="text-3xl font-semibold text-[var(--shell-ink)]" style={{ fontFamily: "var(--shell-font-display)" }}>
                {editingTemplate ? 'Edit Template' : 'New Template'}
              </h2>
              <p className="text-sm text-[var(--shell-muted)]">
                Define your subject line, write the body, and preview the final output.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => setView('list')}
              className="h-10 rounded-full border-[var(--shell-border)] bg-white/80 text-xs font-semibold text-[var(--shell-ink)]"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={loading}
              className="h-10 rounded-full bg-emerald-600 px-5 text-xs font-semibold hover:bg-emerald-700"
            >
              <Save className="h-4 w-4 mr-2" />
              {loading ? 'Saving...' : 'Save Template'}
            </Button>
          </div>
        </div>
      </section>

      <section className="template-rise rounded-[28px] border border-[var(--shell-border)] bg-[var(--shell-surface-strong)] shadow-[0_18px_40px_rgba(15,23,42,0.08)] overflow-hidden">
        <ResizablePanelGroup direction="horizontal" className="min-h-[72vh]">
          <ResizablePanel defaultSize={36} minSize={24} maxSize={46}>
            <div className="h-full p-5 border-r border-[var(--shell-border)] overflow-y-auto">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--shell-muted)]">
                  <Sparkles className="h-3 w-3" />
                  Template blueprint
                </div>
                <h3 className="text-lg font-semibold text-[var(--shell-ink)]" style={{ fontFamily: "var(--shell-font-display)" }}>
                  Audience, intent, format
                </h3>
                <p className="text-sm text-[var(--shell-muted)]">
                  Set the audience, voice, and CTA, then craft the message.
                </p>
              </div>

              <Accordion
                type="multiple"
                defaultValue={['basics', 'audience', 'voice', 'cta', 'personalize', 'snippets']}
                className="mt-4 space-y-3"
              >
                <AccordionItem value="basics" className="rounded-2xl border border-[var(--shell-border)] bg-white/90 px-4 border-b-0">
                  <AccordionTrigger className="text-sm font-semibold text-[var(--shell-ink)] hover:no-underline">
                    Basics
                  </AccordionTrigger>
                  <AccordionContent className="space-y-3">
                    <div className="space-y-2">
                      <Label htmlFor="name">Template Name</Label>
                      <Input
                        id="name"
                        placeholder="e.g., Cold Outreach - Follow Up 1"
                        value={form.name}
                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                        className="h-10 rounded-full border-[var(--shell-border)] bg-white/90 font-medium"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="subject">Subject Line</Label>
                      <div className="relative">
                        <Input
                          id="subject"
                          placeholder="Quick question for {company}..."
                          value={form.subject}
                          onChange={(e) => setForm({ ...form, subject: e.target.value })}
                          className="h-10 rounded-full border-[var(--shell-border)] bg-white/90 pr-24"
                        />
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--shell-muted)]">
                          {form.subject.length} chars
                        </div>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-[var(--shell-muted)]">Format</Label>
                      <ToggleGroup
                        type="single"
                        variant="outline"
                        size="sm"
                        value={form.is_html ? 'html' : 'text'}
                        onValueChange={(value) => {
                          if (!value) return;
                          setForm((prev) => ({ ...prev, is_html: value === 'html' }));
                        }}
                        className="justify-start"
                      >
                        <ToggleGroupItem value="text">Plain text</ToggleGroupItem>
                        <ToggleGroupItem value="html">HTML</ToggleGroupItem>
                      </ToggleGroup>
                    </div>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="audience" className="rounded-2xl border border-[var(--shell-border)] bg-white/90 px-4 border-b-0">
                  <AccordionTrigger className="text-sm font-semibold text-[var(--shell-ink)] hover:no-underline">
                    Audience
                  </AccordionTrigger>
                  <AccordionContent className="space-y-3">
                    <div className="space-y-2">
                      <Label className="text-xs text-[var(--shell-muted)]">Industry</Label>
                      <Input
                        placeholder="e.g., SaaS, Real Estate"
                        value={templateProfile.industry}
                        onChange={(e) => setTemplateProfile(prev => ({ ...prev, industry: e.target.value }))}
                        className="h-9 rounded-full border-[var(--shell-border)] bg-white/90"
                      />
                      <div className="flex flex-wrap gap-2">
                        {TEMPLATE_INDUSTRIES.filter((option) => option.value !== 'all').map((option) => (
                          <Button
                            key={option.value}
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 rounded-full border-[var(--shell-border)] bg-white/80 text-[10px] font-semibold text-[var(--shell-ink)]"
                            onClick={() => setTemplateProfile(prev => ({ ...prev, industry: option.label }))}
                          >
                            {option.label}
                          </Button>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-[var(--shell-muted)]">Audience role</Label>
                      <Input
                        placeholder="e.g., VP Sales, Founder, Marketing Lead"
                        value={templateProfile.audienceRole}
                        onChange={(e) => setTemplateProfile(prev => ({ ...prev, audienceRole: e.target.value }))}
                        className="h-9 rounded-full border-[var(--shell-border)] bg-white/90"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label className="text-xs text-[var(--shell-muted)]">Company size</Label>
                        <Select
                          value={templateProfile.companySize}
                          onValueChange={(value) => setTemplateProfile(prev => ({ ...prev, companySize: value }))}
                        >
                          <SelectTrigger className="h-9">
                            <SelectValue placeholder="Size" />
                          </SelectTrigger>
                          <SelectContent>
                            {TEMPLATE_COMPANY_SIZES.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs text-[var(--shell-muted)]">Region</Label>
                        <Input
                          placeholder="e.g., North America"
                          value={templateProfile.region}
                          onChange={(e) => setTemplateProfile(prev => ({ ...prev, region: e.target.value }))}
                          className="h-9 rounded-full border-[var(--shell-border)] bg-white/90"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-[var(--shell-muted)]">Language</Label>
                      <Input
                        placeholder="e.g., English"
                        value={templateProfile.language}
                        onChange={(e) => setTemplateProfile(prev => ({ ...prev, language: e.target.value }))}
                        className="h-9 rounded-full border-[var(--shell-border)] bg-white/90"
                      />
                    </div>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="voice" className="rounded-2xl border border-[var(--shell-border)] bg-white/90 px-4 border-b-0">
                  <AccordionTrigger className="text-sm font-semibold text-[var(--shell-ink)] hover:no-underline">
                    Voice and length
                  </AccordionTrigger>
                  <AccordionContent className="space-y-3">
                    <div className="space-y-2">
                      <Label className="text-xs text-[var(--shell-muted)]">Tone</Label>
                      <ToggleGroup
                        type="single"
                        variant="outline"
                        size="sm"
                        value={templateProfile.tone}
                        onValueChange={(value) => value && setTemplateProfile(prev => ({ ...prev, tone: value }))}
                        className="flex flex-wrap justify-start"
                      >
                        {TEMPLATE_TONES.map((option) => (
                          <ToggleGroupItem key={option.value} value={option.value}>
                            {option.label}
                          </ToggleGroupItem>
                        ))}
                      </ToggleGroup>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-[var(--shell-muted)]">Length</Label>
                      <ToggleGroup
                        type="single"
                        variant="outline"
                        size="sm"
                        value={templateProfile.length}
                        onValueChange={(value) => value && setTemplateProfile(prev => ({ ...prev, length: value }))}
                        className="flex flex-wrap justify-start"
                      >
                        {TEMPLATE_LENGTHS.map((option) => (
                          <ToggleGroupItem key={option.value} value={option.value}>
                            {option.label}
                          </ToggleGroupItem>
                        ))}
                      </ToggleGroup>
                    </div>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="cta" className="rounded-2xl border border-[var(--shell-border)] bg-white/90 px-4 border-b-0">
                  <AccordionTrigger className="text-sm font-semibold text-[var(--shell-ink)] hover:no-underline">
                    Goal and CTA
                  </AccordionTrigger>
                  <AccordionContent className="space-y-3">
                    <div className="space-y-2">
                      <Label className="text-xs text-[var(--shell-muted)]">Use case</Label>
                      <Select
                        value={templateProfile.goal}
                        onValueChange={(value) => setTemplateProfile(prev => ({ ...prev, goal: value }))}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="Select goal" />
                        </SelectTrigger>
                        <SelectContent>
                          {TEMPLATE_GOALS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-[var(--shell-muted)]">Primary CTA</Label>
                      <Select
                        value={templateProfile.cta}
                        onValueChange={(value) => setTemplateProfile(prev => ({ ...prev, cta: value }))}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="Select CTA" />
                        </SelectTrigger>
                        <SelectContent>
                          {TEMPLATE_CTAS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-[var(--shell-muted)]">CTA text</Label>
                      <Input
                        placeholder="e.g., Would you be open to a quick call?"
                        value={templateProfile.ctaText}
                        onChange={(e) => setTemplateProfile(prev => ({ ...prev, ctaText: e.target.value }))}
                        className="h-9 rounded-full border-[var(--shell-border)] bg-white/90"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-[var(--shell-muted)]">CTA link (optional)</Label>
                      <Input
                        placeholder="https://..."
                        value={templateProfile.ctaLink}
                        onChange={(e) => setTemplateProfile(prev => ({ ...prev, ctaLink: e.target.value }))}
                        className="h-9 rounded-full border-[var(--shell-border)] bg-white/90"
                      />
                    </div>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="personalize" className="rounded-2xl border border-[var(--shell-border)] bg-white/90 px-4 border-b-0">
                  <AccordionTrigger className="text-sm font-semibold text-[var(--shell-ink)] hover:no-underline">
                    Personalize
                  </AccordionTrigger>
                  <AccordionContent className="space-y-3">
                    <div className="flex flex-wrap gap-2">
                      {[
                        '{first_name}',
                        '{last_name}',
                        '{company}',
                        '{email}',
                        '{domain}',
                        '{name}',
                      ].map((variable) => (
                        <Button
                          key={variable}
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 rounded-full border-[var(--shell-border)] bg-white/80 text-[10px] font-semibold text-[var(--shell-ink)]"
                          onClick={() => insertVariable(variable)}
                        >
                          {variable}
                        </Button>
                      ))}
                    </div>
                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-3 text-xs text-emerald-700">
                      <p className="font-semibold">Tip</p>
                      <p>Use {'{first_name}'} in your subject line for higher opens.</p>
                    </div>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="snippets" className="rounded-2xl border border-[var(--shell-border)] bg-white/90 px-4 border-b-0">
                  <AccordionTrigger className="text-sm font-semibold text-[var(--shell-ink)] hover:no-underline">
                    Quick snippets
                  </AccordionTrigger>
                  <AccordionContent className="space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 rounded-full border-[var(--shell-border)] bg-white/80 text-xs font-semibold text-[var(--shell-ink)]"
                        onClick={() => insertAtCursor('Hi {first_name},\\n\\n')}
                      >
                        Greeting
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 rounded-full border-[var(--shell-border)] bg-white/80 text-xs font-semibold text-[var(--shell-ink)]"
                        onClick={() => insertAtCursor('I noticed {company} is ...\\n\\n')}
                      >
                        Observation
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 rounded-full border-[var(--shell-border)] bg-white/80 text-xs font-semibold text-[var(--shell-ink)]"
                        onClick={() => insertAtCursor('We helped {company} achieve ...\\n\\n')}
                      >
                        Proof
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 rounded-full border-[var(--shell-border)] bg-white/80 text-xs font-semibold text-[var(--shell-ink)]"
                        onClick={() => {
                          const ctaText = templateProfile.ctaText.trim() || selectedCta.label;
                          const link = templateProfile.ctaLink.trim();
                          const snippet = form.is_html && link
                            ? `<a href="${link}">${ctaText}</a>\\n\\n`
                            : link
                              ? `${ctaText}: ${link}\\n\\n`
                              : `${ctaText}\\n\\n`;
                          insertAtCursor(snippet);
                        }}
                      >
                        CTA
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 rounded-full border-[var(--shell-border)] bg-white/80 text-xs font-semibold text-[var(--shell-ink)]"
                        onClick={() => insertAtCursor('\\nBest,\\n{name}\\n{company}\\n')}
                      >
                        Signature
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 rounded-full border-[var(--shell-border)] bg-white/80 text-xs font-semibold text-[var(--shell-ink)]"
                        onClick={() => insertAtCursor('\\nIf this is not relevant, reply and I will stop reaching out.')}
                      >
                        Unsubscribe
                      </Button>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>

              <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50/80 p-3 text-xs text-emerald-700">
                <p className="font-semibold">Guidance</p>
                <p>Audience: {industryLabel} | {roleLabel} | {selectedCompanySize.label} | {regionLabel}</p>
                <p>Goal: {selectedGoal.label} | Tone: {selectedTone.label} | Length: {selectedLength.label}</p>
                <p>Primary CTA: {selectedCta.label} | Language: {languageLabel}</p>
              </div>
            </div>
          </ResizablePanel>

          <ResizableHandle withHandle />

          <ResizablePanel defaultSize={64} minSize={54}>
            <div className="h-full p-5">
              <ResizablePanelGroup direction="vertical" className="h-full min-h-[70vh]">
                <ResizablePanel defaultSize={60} minSize={45}>
                  <div className="h-full rounded-2xl border border-[var(--shell-border)] bg-white/90 shadow-[0_12px_24px_rgba(15,23,42,0.06)] flex flex-col">
                    <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-[var(--shell-border)] bg-white/80">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--shell-muted)]">Compose</p>
                        <p className="text-sm text-[var(--shell-muted)]">Write the message body below.</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 px-3 text-xs border-[var(--shell-border)] bg-white/90 text-[var(--shell-ink)]"
                          onClick={applyBold}
                        >
                          <span className="font-semibold">B</span>
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 px-3 text-xs border-[var(--shell-border)] bg-white/90 text-[var(--shell-ink)]"
                          onClick={applyUnderline}
                        >
                          <span className="underline">U</span>
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 px-3 text-xs border-[var(--shell-border)] bg-white/90 text-[var(--shell-ink)]"
                          onClick={applyBullets}
                        >
                          <ListChecks className="h-4 w-4" />
                        </Button>
                        <span className="text-xs text-[var(--shell-muted)]">
                          Plain text uses **bold**, __underline__, - bullets, and 1) lists.
                        </span>
                      </div>
                    </div>
                    <Textarea
                      id="content"
                      placeholder={form.is_html ? "<html><body>...</body></html>" : "Hi {first_name},..."}
                      className="flex-1 min-h-[360px] font-mono text-sm resize-none border-0 p-4 focus-visible:ring-0 text-[var(--shell-ink)]"
                      value={form.content}
                      onChange={(e) => setForm({ ...form, content: e.target.value })}
                      ref={contentRef}
                    />
                  </div>
                </ResizablePanel>

                <ResizableHandle withHandle />

                <ResizablePanel defaultSize={40} minSize={25}>
                  <div className="h-full rounded-2xl border border-[var(--shell-border)] bg-white/80 shadow-[0_12px_24px_rgba(15,23,42,0.06)] flex flex-col">
                    <div className="flex items-center justify-between p-4 border-b border-[var(--shell-border)] bg-white/80">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--shell-muted)]">Preview</p>
                        <p className="text-sm text-[var(--shell-muted)]">{form.is_html ? 'HTML output' : 'Plain text output'}</p>
                      </div>
                      <Badge variant="outline" className="text-[10px] border-[var(--shell-border)] bg-white/90 text-[var(--shell-ink)]">
                        {form.is_html ? 'HTML' : 'Text'}
                      </Badge>
                    </div>
                    <div className="flex-1 overflow-auto p-4">
                      <div className="rounded-2xl border border-[var(--shell-border)] bg-white/95 p-5 shadow-sm">
                        <div className="border-b border-[var(--shell-border)] pb-3 mb-4 space-y-1">
                          <p className="text-base font-semibold text-[var(--shell-ink)]">
                            {form.subject || <span className="text-slate-300">Subject</span>}
                          </p>
                          <div className="flex items-center gap-2 text-xs text-[var(--shell-muted)]">
                            <div className="w-6 h-6 rounded-full bg-slate-200" />
                            <span>{templateProfile.audienceRole || 'Recipient'}</span>
                            <span className="text-slate-300">to</span>
                            <span>You</span>
                          </div>
                        </div>
                        {form.is_html ? (
                          <div
                            className="template-preview prose prose-sm max-w-none text-slate-800"
                            dangerouslySetInnerHTML={{ __html: form.content }}
                          />
                        ) : form.content ? (
                          <div
                            className="template-preview prose max-w-none text-sm text-[var(--shell-ink)]"
                            dangerouslySetInnerHTML={{ __html: renderPlainTextPreviewHtml(form.content) }}
                          />
                        ) : (
                          <div className="text-sm text-[var(--shell-muted)]">Nothing to preview yet.</div>
                        )}
                      </div>
                    </div>
                  </div>
                </ResizablePanel>
              </ResizablePanelGroup>
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </section>
    </TemplateShell>
  );

  return (
    <>
      {view === 'list' ? renderListView() : renderEditorView()}

      {/* Preview Dialog for List View */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{previewContent?.name}</DialogTitle>
            <DialogDescription>Subject: {previewContent?.subject}</DialogDescription>
          </DialogHeader>
          <div className="mt-4 p-4 border rounded-md bg-gray-50 min-h-[200px]">
            {previewContent?.is_html ? (
              <div dangerouslySetInnerHTML={{ __html: previewContent.content }} className="template-preview prose max-w-none text-sm" />
            ) : previewContent?.content ? (
              <div
                className="template-preview prose max-w-none text-sm"
                dangerouslySetInnerHTML={{ __html: renderPlainTextPreviewHtml(previewContent.content) }}
              />
            ) : (
              <div className="text-sm text-gray-400">No content yet.</div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default TemplateManager;



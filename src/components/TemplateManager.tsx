import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
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
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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

  const insertVariable = (variable: string) => {
    setForm(prev => ({
      ...prev,
      content: prev.content + variable
    }));
    toast({
      title: "Variable Added",
      description: `${variable} added to content.`,
      duration: 1500,
    });
  };

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
  const Shell = ({ children }: { children: React.ReactNode }) => (
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

  const renderListView = () => (
    <Shell>
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

      <section className="grid gap-6 lg:grid-cols-[1.7fr_0.8fr]">
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

        <aside className="space-y-4">
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
        </aside>
      </section>
    </Shell>
  );

  const renderEditorView = () => (
    <Shell>
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

      <section className="grid gap-6 lg:grid-cols-[1.8fr_0.9fr]">
        <div className="space-y-4">
          <Card className="overflow-hidden rounded-[24px] border-[var(--shell-border)] bg-[var(--shell-surface-strong)] shadow-[0_16px_32px_rgba(15,23,42,0.1)]">
            <CardContent className="p-6 flex flex-col gap-4">
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

              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <Label htmlFor="content">Email Content</Label>
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="html-mode"
                      checked={form.is_html}
                      onCheckedChange={(checked) => setForm({ ...form, is_html: checked })}
                    />
                    <Label htmlFor="html-mode" className="text-xs font-normal text-[var(--shell-muted)]">
                      {form.is_html ? 'HTML Mode' : 'Plain Text'}
                    </Label>
                  </div>
                </div>
                <Tabs defaultValue="edit" className="flex flex-col">
                  <TabsList className="w-full justify-start border-b border-[var(--shell-border)] rounded-none bg-transparent p-0 h-auto">
                    <TabsTrigger value="edit" className="rounded-none border-b-2 border-transparent data-[state=active]:border-emerald-600 data-[state=active]:bg-transparent">
                      Editor
                    </TabsTrigger>
                    <TabsTrigger value="preview" className="rounded-none border-b-2 border-transparent data-[state=active]:border-emerald-600 data-[state=active]:bg-transparent">
                      Preview
                    </TabsTrigger>
                  </TabsList>
                  <TabsContent value="edit" className="mt-4">
                    <Textarea
                      id="content"
                      placeholder={form.is_html ? "<html><body>...</body></html>" : "Hi {first_name},..."}
                      className="min-h-[320px] font-mono text-sm resize-none p-4 rounded-2xl border-[var(--shell-border)] bg-white/90"
                      value={form.content}
                      onChange={(e) => setForm({ ...form, content: e.target.value })}
                    />
                  </TabsContent>
                  <TabsContent value="preview" className="mt-4 border border-[var(--shell-border)] rounded-2xl bg-white/80 p-4 overflow-auto min-h-[320px]">
                    {form.is_html ? (
                      <div dangerouslySetInnerHTML={{ __html: form.content }} className="prose max-w-none" />
                    ) : (
                      <div className="whitespace-pre-wrap font-sans text-sm">{form.content}</div>
                    )}
                  </TabsContent>
                </Tabs>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="rounded-[24px] border border-[var(--shell-border)] bg-[var(--shell-surface-strong)] p-5 shadow-[0_12px_24px_rgba(15,23,42,0.08)]">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--shell-muted)]">
              <ListChecks className="h-3 w-3" />
              Checklist
            </div>
            <h3 className="mt-2 text-lg font-semibold text-[var(--shell-ink)]" style={{ fontFamily: "var(--shell-font-display)" }}>
              Template readiness
            </h3>
            <p className="text-sm text-[var(--shell-muted)]">
              Make sure each template has a clear subject, body, and personalization.
            </p>
            <div className="mt-4 space-y-3 text-xs text-[var(--shell-muted)]">
              <div className="flex items-start gap-2">
                <span className="mt-1 h-2 w-2 rounded-full bg-emerald-500"></span>
                Name the template for quick reuse.
              </div>
              <div className="flex items-start gap-2">
                <span className="mt-1 h-2 w-2 rounded-full bg-emerald-500"></span>
                Keep subject lines short and specific.
              </div>
              <div className="flex items-start gap-2">
                <span className="mt-1 h-2 w-2 rounded-full bg-emerald-500"></span>
                Add variables to personalize outreach.
              </div>
              <div className="flex items-start gap-2">
                <span className="mt-1 h-2 w-2 rounded-full bg-emerald-500"></span>
                Preview before you save.
              </div>
            </div>
          </Card>

          <Card className="rounded-[24px] border border-[var(--shell-border)] bg-white/90 shadow-[0_12px_24px_rgba(15,23,42,0.08)]">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <LayoutTemplate className="h-4 w-4" />
                Personalization Variables
              </CardTitle>
              <CardDescription className="text-xs">
                Click to insert into content
              </CardDescription>
            </CardHeader>
            <CardContent className="flex-1">
              <div className="space-y-2">
                {[
                  { key: '{first_name}', label: 'First Name', desc: 'John' },
                  { key: '{last_name}', label: 'Last Name', desc: 'Doe' },
                  { key: '{company}', label: 'Company', desc: 'Acme Inc' },
                  { key: '{email}', label: 'Email', desc: 'john@example.com' },
                  { key: '{domain}', label: 'Website', desc: 'example.com' },
                  { key: '{name}', label: 'Full Name', desc: 'John Doe' },
                ].map((variable) => (
                  <div
                    key={variable.key}
                    className="group flex items-center justify-between rounded-2xl border border-[var(--shell-border)] bg-white/80 p-3 hover:border-emerald-300 hover:shadow-sm cursor-pointer transition-all"
                    onClick={() => insertVariable(variable.key)}
                  >
                    <div>
                      <div className="font-mono text-xs font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded inline-block mb-1">
                        {variable.key}
                      </div>
                      <div className="text-xs text-[var(--shell-muted)]">{variable.label}</div>
                    </div>
                    <Plus className="h-4 w-4 text-gray-300 group-hover:text-emerald-500" />
                  </div>
                ))}
              </div>

              <div className="mt-6 p-4 bg-emerald-50 rounded-2xl border border-emerald-100">
                <h4 className="text-xs font-semibold text-emerald-800 mb-2 flex items-center gap-1">
                  <Info className="h-3 w-3" />
                  Pro Tip
                </h4>
                <p className="text-xs text-emerald-700 leading-relaxed">
                  Use <strong>{'{first_name}'}</strong> in your subject line to increase open rates by up to 20%.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>
    </Shell>
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
              <div dangerouslySetInnerHTML={{ __html: previewContent.content }} className="prose max-w-none text-sm" />
            ) : (
              <div className="whitespace-pre-wrap text-sm font-sans">{previewContent?.content}</div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default TemplateManager;

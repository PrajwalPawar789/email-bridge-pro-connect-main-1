import { useEmailBuilderStore, type EmailTemplate } from '@/stores/emailBuilderStore';
import { Button } from '@/components/ui/button';
import { Eye, Mail, Pencil, Plus, Sparkles, Trash2 } from 'lucide-react';
import { motion } from 'framer-motion';

type EmailTemplateListProps = {
  onCreateTemplate: () => void;
  onCreatePlainTextTemplate: () => void;
  onCreateAiTemplate: () => void;
  onEditTemplate: (template: EmailTemplate) => void;
  onPreviewTemplate: (template: EmailTemplate) => void;
};

export function EmailTemplateList({
  onCreateTemplate,
  onCreatePlainTextTemplate,
  onCreateAiTemplate,
  onEditTemplate,
  onPreviewTemplate,
}: EmailTemplateListProps) {
  const { templates, deleteTemplate, isLoading } = useEmailBuilderStore();

  return (
    <div className="mx-auto max-w-4xl p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Email Templates</h1>
          <p className="mt-1 text-sm text-muted-foreground">Create and manage your email templates</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={onCreateAiTemplate}>
            <Sparkles className="mr-1 h-4 w-4" /> Create Email Template Using AI
          </Button>
          <Button variant="outline" onClick={onCreatePlainTextTemplate}>
            <Mail className="mr-1 h-4 w-4" /> Plain Text
          </Button>
          <Button onClick={onCreateTemplate}>
            <Plus className="mr-1 h-4 w-4" /> Create Template
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex h-56 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-emerald-600"></div>
        </div>
      ) : templates.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl border-2 border-dashed border-border p-12 text-center"
        >
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
            <Mail className="h-6 w-6 text-primary" />
          </div>
          <h3 className="mb-2 font-semibold text-foreground">No templates yet</h3>
          <p className="mb-4 text-sm text-muted-foreground">Create your first email template to get started</p>
          <div className="flex items-center justify-center gap-2">
            <Button variant="outline" onClick={onCreateAiTemplate}>
              <Sparkles className="mr-1 h-4 w-4" /> Create Email Template Using AI
            </Button>
            <Button variant="outline" onClick={onCreatePlainTextTemplate}>
              <Mail className="mr-1 h-4 w-4" /> Plain Text
            </Button>
            <Button onClick={onCreateTemplate}>
              <Plus className="mr-1 h-4 w-4" /> Create Template
            </Button>
          </div>
        </motion.div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {templates.map((template) => (
            <div
              key={template.id}
              className="rounded-xl border border-border bg-card p-5 transition-all hover:border-primary/30 hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-foreground">{template.name || 'Untitled'}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {template.blocks.length} blocks | {template.format}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={() => {
                    const shouldDelete = window.confirm(`Delete "${template.name || 'Untitled'}"?`);
                    if (!shouldDelete) return;
                    void deleteTemplate(template.id);
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>

              {template.subject ? (
                <p className="mt-2 truncate text-sm text-muted-foreground">Subject: {template.subject}</p>
              ) : null}

              <div className="mt-4 flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => onEditTemplate(template)}>
                  <Pencil className="mr-1 h-3.5 w-3.5" />
                  Edit
                </Button>
                <Button size="sm" variant="outline" onClick={() => onPreviewTemplate(template)}>
                  <Eye className="mr-1 h-3.5 w-3.5" />
                  Preview
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

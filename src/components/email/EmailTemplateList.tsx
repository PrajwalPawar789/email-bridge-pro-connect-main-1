import { useEmailBuilderStore } from '@/stores/emailBuilderStore';
import { Button } from '@/components/ui/button';
import { Plus, Mail, Trash2 } from 'lucide-react';
import { motion } from 'framer-motion';

export function EmailTemplateList() {
  const { templates, createNewTemplate, setCurrentTemplate, deleteTemplate, isLoading } = useEmailBuilderStore();

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Email Templates</h1>
          <p className="text-sm text-muted-foreground mt-1">Create and manage your email templates</p>
        </div>
        <Button onClick={createNewTemplate}>
          <Plus className="w-4 h-4 mr-1" /> New Template
        </Button>
      </div>

      {isLoading ? (
        <div className="flex h-56 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-emerald-600"></div>
        </div>
      ) : templates.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="border-2 border-dashed border-border rounded-xl p-12 text-center"
        >
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Mail className="w-6 h-6 text-primary" />
          </div>
          <h3 className="font-semibold text-foreground mb-2">No templates yet</h3>
          <p className="text-sm text-muted-foreground mb-4">Create your first email template to get started</p>
          <Button onClick={createNewTemplate}>
            <Plus className="w-4 h-4 mr-1" /> Create Template
          </Button>
        </motion.div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {templates.map((t) => (
            <div
              key={t.id}
              className="bg-card border border-border rounded-xl p-5 hover:border-primary/30 hover:shadow-md transition-all cursor-pointer"
              onClick={() => setCurrentTemplate(t)}
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-foreground">{t.name || 'Untitled'}</h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t.blocks.length} blocks | {t.format}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0 h-8 w-8"
                  onClick={(event) => {
                    event.stopPropagation();
                    const shouldDelete = window.confirm(`Delete "${t.name || 'Untitled'}"?`);
                    if (!shouldDelete) return;
                    void deleteTemplate(t.id);
                  }}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
              {t.subject && (
                <p className="text-sm text-muted-foreground mt-2 truncate">Subject: {t.subject}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


import { useEffect } from 'react';
import { useEmailBuilderStore } from '@/stores/emailBuilderStore';
import { EmailBlocksPanel } from '@/components/email/EmailBlocksPanel';
import { EmailCanvas } from '@/components/email/EmailCanvas';
import { EmailSettingsPanel } from '@/components/email/EmailSettingsPanel';
import { EmailTemplateList } from '@/components/email/EmailTemplateList';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Save, Monitor, Smartphone } from 'lucide-react';

export default function EmailBuilderPage() {
  const {
    currentTemplate,
    saveTemplate,
    previewMode,
    setPreviewMode,
    setCurrentTemplate,
    loadTemplates,
    hasLoaded,
    isLoading,
    isSaving,
  } = useEmailBuilderStore();

  useEffect(() => {
    if (!hasLoaded) {
      void loadTemplates();
    }
  }, [hasLoaded, loadTemplates]);

  if (!currentTemplate) {
    if (isLoading) {
      return (
        <div className="flex h-full items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-emerald-600"></div>
        </div>
      );
    }
    return <EmailTemplateList />;
  }

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 h-14 border-b border-border bg-card shrink-0">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setCurrentTemplate(null)}>
            <ArrowLeft className="w-4 h-4 mr-1" /> Back
          </Button>
          <div className="h-5 w-px bg-border" />
          <span className="text-sm font-medium text-muted-foreground">Template Editor</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
            {currentTemplate.name || 'Untitled'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-muted rounded-lg p-0.5">
            <button
              onClick={() => setPreviewMode('desktop')}
              className={`p-1.5 rounded-md transition-colors ${previewMode === 'desktop' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground'}`}
            >
              <Monitor className="w-4 h-4" />
            </button>
            <button
              onClick={() => setPreviewMode('mobile')}
              className={`p-1.5 rounded-md transition-colors ${previewMode === 'mobile' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground'}`}
            >
              <Smartphone className="w-4 h-4" />
            </button>
          </div>
          <Button variant="ghost" size="sm">Cancel</Button>
          <Button size="sm" onClick={() => void saveTemplate()} disabled={isSaving}>
            <Save className="w-4 h-4 mr-1" /> {isSaving ? 'Saving...' : 'Save Template'}
          </Button>
        </div>
      </div>

      {/* 3-Panel Layout */}
      <div className="grid flex-1 min-h-0 min-w-0 grid-cols-[16rem,minmax(0,1fr),18rem] overflow-hidden">
        <EmailBlocksPanel />
        <EmailCanvas />
        <EmailSettingsPanel />
      </div>
    </div>
  );
}

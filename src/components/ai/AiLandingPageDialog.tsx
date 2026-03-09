import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  buildLandingEmbeddingText,
  generateAiBuilderDraft,
  indexAiBuilderObject,
  type AiOptimizeFor,
  type AiProvider,
} from '@/lib/aiBuilder';
import type { LandingPage } from '@/stores/landingPageStore';
import { toast } from 'sonner';
import { Sparkles } from 'lucide-react';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentPage?: LandingPage | null;
  onGenerated: (payload: { threadId: string; result: Record<string, any> }) => void;
};

export function AiLandingPageDialog({
  open,
  onOpenChange,
  currentPage,
  onGenerated,
}: Props) {
  const [instruction, setInstruction] = useState('');
  const [business, setBusiness] = useState('');
  const [audience, setAudience] = useState('');
  const [offer, setOffer] = useState('');
  const [headline, setHeadline] = useState('');
  const [cta, setCta] = useState('');
  const [tone, setTone] = useState('Confident and clear');
  const [seoKeywords, setSeoKeywords] = useState('');
  const [constraints, setConstraints] = useState('');
  const [optimizeFor, setOptimizeFor] = useState<AiOptimizeFor>('balanced');
  const [provider, setProvider] = useState<AiProvider>('openai');
  const [model, setModel] = useState('');
  const [threadId, setThreadId] = useState('');
  const [includeCurrentPage, setIncludeCurrentPage] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);

  const buildPageForIndexing = (result: Record<string, any>, fallbackThreadId: string) => ({
    id: currentPage?.id || fallbackThreadId || crypto.randomUUID(),
    name: String(result?.name || currentPage?.name || 'AI Landing Page'),
    slug: String(result?.slug || currentPage?.slug || 'ai-landing-page'),
    published: Boolean(result?.published ?? currentPage?.published ?? false),
    blocks: Array.isArray(result?.blocks)
      ? result.blocks.map((block: any) => ({
          id: String(block?.id || crypto.randomUUID()),
          type: String(block?.type || 'text'),
          content: block?.content && typeof block.content === 'object' ? block.content : {},
          styles: block?.styles && typeof block.styles === 'object' ? block.styles : {},
        }))
      : [],
  });

  const canSubmit = useMemo(() => {
    return Boolean(instruction.trim() || business.trim() || offer.trim() || headline.trim());
  }, [instruction, business, offer, headline]);

  const handleGenerate = async () => {
    if (!canSubmit || isGenerating) return;
    setIsGenerating(true);
    try {
      const response = await generateAiBuilderDraft({
        mode: 'landing',
        threadId: threadId || undefined,
        optimizeFor,
        provider,
        model: model.trim() || undefined,
        instruction: instruction.trim() || 'Create a conversion-focused landing page draft.',
        brief: {
          business,
          audience,
          offer,
          headline,
          cta,
          tone,
          seoKeywords,
          constraints,
        },
        current: includeCurrentPage && currentPage ? { page: currentPage } : undefined,
      });

      const nextThreadId = response.threadId || '';
      if (nextThreadId) setThreadId(nextThreadId);
      onGenerated({
        threadId: nextThreadId,
        result: response.result || {},
      });
      const indexedPage = buildPageForIndexing(response.result || {}, nextThreadId);
      void indexAiBuilderObject({
        mode: 'landing',
        objectId: indexedPage.id,
        threadId: nextThreadId || undefined,
        text: buildLandingEmbeddingText(indexedPage),
        metadata: {
          name: indexedPage.name,
          slug: indexedPage.slug,
          published: indexedPage.published,
          source: 'ai_dialog',
          ...(nextThreadId ? { thread_id: nextThreadId, threadId: nextThreadId } : {}),
        },
      }).catch((indexError) => {
        console.warn('AI landing indexing skipped:', indexError?.message || indexError);
      });
      toast.success('AI landing page draft generated');
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error?.message || 'Unable to generate AI landing page');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            AI Landing Page Builder
          </DialogTitle>
          <DialogDescription>
            Generate an editable landing page structure aligned with your current section-based editor.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 py-2">
          <div className="grid gap-1.5">
            <Label className="text-xs">Instruction</Label>
            <Textarea
              value={instruction}
              onChange={(event) => setInstruction(event.target.value)}
              rows={3}
              placeholder="Example: Build a SaaS demo-booking page targeting operations leaders with social proof and FAQ."
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label className="text-xs">Business / Product</Label>
              <Input value={business} onChange={(event) => setBusiness(event.target.value)} placeholder="EmailBridge Pro" />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">Target Audience</Label>
              <Input value={audience} onChange={(event) => setAudience(event.target.value)} placeholder="RevOps teams at B2B SaaS" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label className="text-xs">Offer</Label>
              <Input value={offer} onChange={(event) => setOffer(event.target.value)} placeholder="14-day free trial + onboarding" />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">Primary CTA</Label>
              <Input value={cta} onChange={(event) => setCta(event.target.value)} placeholder="Book Demo / Start Free Trial" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label className="text-xs">Hero Headline</Label>
              <Input value={headline} onChange={(event) => setHeadline(event.target.value)} placeholder="Short and specific value proposition" />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">Tone</Label>
              <Input value={tone} onChange={(event) => setTone(event.target.value)} placeholder="Direct, premium, trustworthy" />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label className="text-xs">SEO Keywords</Label>
            <Input value={seoKeywords} onChange={(event) => setSeoKeywords(event.target.value)} placeholder="email automation platform, outbound sequence tool" />
          </div>

          <div className="grid gap-1.5">
            <Label className="text-xs">Constraints</Label>
            <Textarea
              value={constraints}
              onChange={(event) => setConstraints(event.target.value)}
              rows={2}
              placeholder="Avoid aggressive claims. Keep copy concise. Include compliance-safe language."
            />
          </div>

          <div className="flex items-center gap-2">
            <Label className="text-xs">Provider</Label>
            <div className="flex items-center gap-1 rounded-lg border border-border p-1">
              {(['openai', 'claude'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setProvider(value)}
                  className={`rounded-md px-2.5 py-1 text-xs uppercase transition-colors ${
                    provider === value ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {value}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label className="text-xs">Model Override (Optional)</Label>
            <Input
              value={model}
              onChange={(event) => setModel(event.target.value)}
              placeholder={provider === 'claude' ? 'claude-sonnet-4-6' : 'gpt-4o-mini'}
            />
          </div>

          <div className="flex items-center gap-2">
            <Label className="text-xs">Optimize For</Label>
            <div className="flex items-center gap-1 rounded-lg border border-border p-1">
              {(['cost', 'balanced', 'quality'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setOptimizeFor(value)}
                  className={`rounded-md px-2.5 py-1 text-xs capitalize transition-colors ${
                    optimizeFor === value ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {value}
                </button>
              ))}
            </div>
          </div>

          {currentPage ? (
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                className="h-3.5 w-3.5"
                checked={includeCurrentPage}
                onChange={(event) => setIncludeCurrentPage(event.target.checked)}
              />
              Use current page as context for iterative improvements
            </label>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isGenerating}>
            Cancel
          </Button>
          <Button onClick={handleGenerate} disabled={!canSubmit || isGenerating}>
            <Sparkles className="mr-1 h-4 w-4" />
            {isGenerating ? 'Generating...' : 'Generate with AI'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

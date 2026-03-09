import { useMemo, useState } from 'react';
import { useEmailBuilderStore, BlockType } from '@/stores/emailBuilderStore';
import { Input } from '@/components/ui/input';
import { createEmailBuilderBlock, EMAIL_BUILDER_STARTER_PRESETS } from '@/lib/emailBuilderBlocks';
import {
  Type,
  Image,
  MousePointer,
  Minus,
  ArrowUpDown,
  Columns,
  Heading,
  Video,
  Share2,
  Timer,
  Table,
  Quote,
  Code,
  FileText,
  Bookmark,
  Search,
  LayoutTemplate,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type BlockLibraryItem = {
  type: BlockType;
  label: string;
  icon: any;
  category: string;
  keywords: string[];
};

const blockTypes: BlockLibraryItem[] = [
  { type: 'heading', label: 'Heading', icon: Heading, category: 'Basic', keywords: ['title', 'headline'] },
  { type: 'text', label: 'Text', icon: Type, category: 'Basic', keywords: ['paragraph', 'body', 'copy'] },
  { type: 'image', label: 'Image', icon: Image, category: 'Basic', keywords: ['hero', 'photo', 'logo'] },
  { type: 'button', label: 'Button', icon: MousePointer, category: 'Basic', keywords: ['cta', 'link', 'action'] },
  { type: 'divider', label: 'Divider', icon: Minus, category: 'Basic', keywords: ['line', 'separator'] },
  { type: 'spacer', label: 'Spacer', icon: ArrowUpDown, category: 'Basic', keywords: ['gap', 'padding', 'space'] },
  { type: 'columns', label: 'Columns', icon: Columns, category: 'Layout', keywords: ['two column', 'three column', 'grid'] },
  { type: 'table', label: 'Table', icon: Table, category: 'Layout', keywords: ['pricing', 'rows', 'data'] },
  { type: 'quote', label: 'Quote', icon: Quote, category: 'Content', keywords: ['testimonial', 'pull quote'] },
  { type: 'code', label: 'Code', icon: Code, category: 'Content', keywords: ['snippet', 'technical'] },
  { type: 'signature', label: 'Signature', icon: FileText, category: 'Content', keywords: ['closing', 'footer'] },
  { type: 'video', label: 'Video', icon: Video, category: 'Media', keywords: ['youtube', 'loom', 'thumbnail'] },
  { type: 'social', label: 'Social', icon: Share2, category: 'Media', keywords: ['icons', 'follow'] },
  { type: 'countdown', label: 'Countdown', icon: Timer, category: 'Advanced', keywords: ['offer', 'timer', 'deadline'] },
  { type: 'bookmark', label: 'Bookmark', icon: Bookmark, category: 'Advanced', keywords: ['article', 'resource', 'card'] },
];

const categories = [...new Set(blockTypes.map((item) => item.category))];

export function EmailBlocksPanel() {
  const { addBlock, insertBlocks, currentTemplate } = useEmailBuilderStore();
  const [query, setQuery] = useState('');

  const filteredBlocks = useMemo(() => {
    const search = query.trim().toLowerCase();
    if (!search) return blockTypes;
    return blockTypes.filter((item) =>
      [item.label, item.category, ...item.keywords].some((value) => value.toLowerCase().includes(search))
    );
  }, [query]);

  const blocksByCategory = useMemo(
    () =>
      categories.map((category) => ({
        category,
        items: filteredBlocks.filter((item) => item.category === category),
      })),
    [filteredBlocks]
  );

  const handleAdd = (type: BlockType) => {
    addBlock(createEmailBuilderBlock(type));
  };

  return (
    <div className="h-full w-full overflow-y-auto border-r border-border bg-card scrollbar-thin">
      <div className="border-b border-border p-4">
        <h3 className="text-sm font-semibold text-foreground">Blocks</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">Start from a section, then insert or reorder blocks on the canvas.</p>
        <div className="relative mt-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search blocks..."
            className="h-9 pl-9 text-sm"
          />
        </div>
      </div>

      <div className="border-b border-border px-4 py-4">
        <div className="mb-2 flex items-center gap-2">
          <LayoutTemplate className="h-4 w-4 text-primary" />
          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Starter Flows</span>
        </div>
        <div className="space-y-2">
          {EMAIL_BUILDER_STARTER_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => insertBlocks(preset.blocks(), { index: currentTemplate?.blocks.length || 0 })}
              className="w-full rounded-xl border border-border bg-muted/20 p-3 text-left transition-colors hover:border-primary/30 hover:bg-primary/5"
            >
              <p className="text-sm font-medium text-foreground">{preset.label}</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{preset.description}</p>
            </button>
          ))}
        </div>
      </div>

      {blocksByCategory.map(({ category, items }) =>
        items.length === 0 ? null : (
          <div key={category}>
            <div className="px-4 pb-1 pt-3">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{category}</span>
            </div>
            <div className="grid grid-cols-2 gap-1.5 px-3 pb-2">
              {items.map((item) => (
                <button
                  key={item.type}
                  onClick={() => handleAdd(item.type)}
                  className={cn(
                    'flex flex-col items-center gap-1 rounded-lg border border-border p-2.5 text-center',
                    'text-muted-foreground transition-all hover:border-primary/25 hover:bg-block-hover hover:text-foreground'
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  <span className="text-[10px] font-medium leading-tight">{item.label}</span>
                </button>
              ))}
            </div>
          </div>
        )
      )}

      {filteredBlocks.length === 0 ? (
        <div className="px-4 py-6 text-center">
          <p className="text-sm font-medium text-foreground">No matching blocks</p>
          <p className="mt-1 text-xs text-muted-foreground">Try another keyword like CTA, image, quote, or footer.</p>
        </div>
      ) : null}
    </div>
  );
}

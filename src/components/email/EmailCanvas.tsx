import {
  useRef,
  useCallback,
  useLayoutEffect,
  useEffect,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type RefObject,
} from 'react';
import { useEmailBuilderStore, type EmailBlock, type BlockType } from '@/stores/emailBuilderStore';
import { createEmailBuilderBlock, duplicateEmailBuilderBlock, EMAIL_BUILDER_STARTER_PRESETS } from '@/lib/emailBuilderBlocks';
import { DndContext, closestCenter, DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { cn } from '@/lib/utils';
import {
  GripVertical,
  Trash2,
  Type,
  Image,
  Copy,
  Plus,
  MousePointer,
  Minus,
  Columns,
  FileText,
  Timer,
  Table,
  Quote,
  Video,
} from 'lucide-react';
import { RichTextToolbar } from './RichTextToolbar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';

const inlineInsertOptions: { type: BlockType; label: string; icon: any }[] = [
  { type: 'text', label: 'Text', icon: Type },
  { type: 'button', label: 'Button', icon: MousePointer },
  { type: 'image', label: 'Image', icon: Image },
  { type: 'divider', label: 'Divider', icon: Minus },
  { type: 'columns', label: 'Columns', icon: Columns },
  { type: 'signature', label: 'Signature', icon: FileText },
  { type: 'countdown', label: 'Countdown', icon: Timer },
  { type: 'table', label: 'Table', icon: Table },
];

const headingClassByLevel: Record<string, string> = {
  h1: 'text-3xl font-bold',
  h2: 'text-2xl font-bold',
  h3: 'text-xl font-semibold',
  h4: 'text-lg font-semibold',
  h5: 'text-base font-semibold',
  h6: 'text-sm font-semibold uppercase tracking-wide',
};

const blockLabel = (type: string) => type.charAt(0).toUpperCase() + type.slice(1);

const getCountdownPreview = (targetDate: string) => {
  const target = Date.parse(targetDate);
  if (!Number.isFinite(target)) {
    return ['00', '00', '00', '00'];
  }

  const diff = Math.max(0, target - Date.now());
  const totalSeconds = Math.floor(diff / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return [days, hours, minutes, seconds].map((value) => String(value).padStart(2, '0'));
};

function EditorToolbarDock({ editorRef }: { editorRef: RefObject<HTMLDivElement> }) {
  return (
    <div className="sticky top-4 z-20 mb-4" onClick={(event) => event.stopPropagation()} onMouseDown={(event) => event.stopPropagation()}>
      <RichTextToolbar
        editorRef={editorRef}
        className="w-full rounded-xl border-border/80 bg-background/95 shadow-[0_18px_38px_rgba(15,23,42,0.12)] backdrop-blur"
      />
    </div>
  );
}

function RichTextBlock({
  block,
  isSelected,
  onToolbarTargetChange,
}: {
  block: EmailBlock;
  isSelected: boolean;
  onToolbarTargetChange?: (ref: RefObject<HTMLDivElement> | null) => void;
}) {
  const { updateBlock } = useEmailBuilderStore();
  const editorRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!editorRef.current) return;
    const nextHtml = block.content.html || block.content.text || '';
    if (document.activeElement === editorRef.current) return;
    if (editorRef.current.innerHTML !== nextHtml) {
      editorRef.current.innerHTML = nextHtml;
    }
  }, [block.id, block.content.html, block.content.text]);

  const saveContent = useCallback(() => {
    if (!editorRef.current) return;
    const html = editorRef.current.innerHTML;
    const text = editorRef.current.textContent || '';
    const previousHtml = block.content.html || block.content.text || '';
    const previousText = block.content.text || '';
    if (html === previousHtml && text === previousText) return;
    updateBlock(block.id, { content: { ...block.content, html, text } });
  }, [block.id, block.content, updateBlock]);

  const headingLevel = String(block.content.level || 'h2').toLowerCase();
  const richTextClass = block.type === 'heading' ? headingClassByLevel[headingLevel] || headingClassByLevel.h2 : 'text-sm leading-relaxed';

  useEffect(() => {
    if (!onToolbarTargetChange || !isSelected) return;
    onToolbarTargetChange(editorRef);
    return () => onToolbarTargetChange(null);
  }, [isSelected, onToolbarTargetChange]);

  return (
    <div className="relative">
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onBlur={saveContent}
        className={cn(
          'min-h-[1.5em] min-w-0 max-w-full break-words rounded px-1 text-foreground outline-none',
          'focus:ring-1 focus:ring-primary/20',
          richTextClass,
          '[&_ul]:my-1 [&_ul]:ml-5 [&_ul]:list-disc',
          '[&_ol]:my-1 [&_ol]:ml-5 [&_ol]:list-decimal',
          '[&_li]:mb-0.5',
          '[&_a]:break-all [&_a]:text-primary [&_a]:underline',
          '[&_img]:h-auto [&_img]:max-w-full',
          '[&_table]:w-full [&_table]:max-w-full [&_table]:table-fixed',
          '[&_th]:break-words [&_td]:break-words',
          '[&_pre]:whitespace-pre-wrap [&_pre]:break-words',
          '[&_*]:max-w-full',
          '[&_blockquote]:border-l-[3px] [&_blockquote]:border-primary/30 [&_blockquote]:pl-3 [&_blockquote]:italic [&_blockquote]:text-muted-foreground',
          '[&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-2 [&_pre]:font-mono [&_pre]:text-xs'
        )}
      />
    </div>
  );
}

function InlineInsertMenu({ index }: { index: number }) {
  const { addBlock } = useEmailBuilderStore();

  const insertBlock = (type: BlockType) => {
    addBlock(createEmailBuilderBlock(type), { index });
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="rounded-full border border-border bg-background p-1 text-muted-foreground shadow-sm transition-colors hover:border-primary/30 hover:text-foreground"
          onClick={(event) => event.stopPropagation()}
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3" align="start">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Insert Block</p>
        <div className="grid grid-cols-2 gap-2">
          {inlineInsertOptions.map((option) => (
            <button
              key={option.type}
              type="button"
              onClick={() => insertBlock(option.type)}
              className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-left text-xs font-medium text-foreground transition-colors hover:border-primary/30 hover:bg-primary/5"
            >
              <option.icon className="h-3.5 w-3.5 text-muted-foreground" />
              {option.label}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function BlockRenderer({
  block,
  isSelected,
  onToolbarTargetChange,
}: {
  block: EmailBlock;
  isSelected: boolean;
  onToolbarTargetChange?: (ref: RefObject<HTMLDivElement> | null) => void;
}) {
  switch (block.type) {
    case 'heading':
    case 'text':
    case 'quote':
    case 'signature':
      return <RichTextBlock block={block} isSelected={isSelected} onToolbarTargetChange={onToolbarTargetChange} />;
    case 'image':
      return block.content.src ? (
        <div style={{ textAlign: block.styles.textAlign || 'left' }}>
          <img
            src={block.content.src}
            alt={block.content.alt}
            className="inline-block max-w-full rounded"
            style={{ width: block.content.width || '100%' }}
          />
        </div>
      ) : (
        <div className="flex h-32 items-center justify-center rounded-lg border-2 border-dashed border-border bg-muted text-muted-foreground">
          <div className="text-center">
            <Image className="mx-auto mb-1 h-8 w-8" />
            <span className="text-xs">Add an image URL in the settings panel</span>
          </div>
        </div>
      );
    case 'button':
      return (
        <div style={{ textAlign: (block.content.align as any) || block.styles.textAlign || 'center' }}>
          <span
            className="inline-block cursor-default rounded-lg text-sm font-medium"
            style={{
              padding: block.content.buttonPadding || '10px 24px',
              backgroundColor: block.content.bgColor || 'hsl(160, 60%, 40%)',
              color: block.content.textColor || '#ffffff',
              borderRadius: block.content.borderRadius || '8px',
            }}
          >
            {block.content.text}
          </span>
        </div>
      );
    case 'divider':
      return (
        <hr
          style={{
            borderColor: block.content.color || '#e5e5e5',
            borderWidth: `${block.content.thickness || 1}px`,
            borderStyle: block.content.style || 'solid',
          }}
        />
      );
    case 'spacer':
      return <div style={{ height: block.content.height }} className="rounded border border-dashed border-border bg-muted/20" />;
    case 'columns':
      return (
        <div className={cn('grid gap-4', block.content.count === 3 ? 'grid-cols-3' : 'grid-cols-2')}>
          {block.content.content?.map((column: any, index: number) => (
            <div key={index} className="min-h-[72px] rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">
              {typeof column?.html === 'string' && column.html.trim().length > 0 ? (
                <div
                  className="[&_ul]:ml-4 [&_ul]:list-disc [&_ol]:ml-4 [&_ol]:list-decimal [&_a]:text-primary [&_a]:underline [&_img]:h-auto [&_img]:max-w-full"
                  dangerouslySetInnerHTML={{ __html: column.html }}
                />
              ) : (
                <div className="whitespace-pre-wrap">{column?.text}</div>
              )}
            </div>
          ))}
        </div>
      );
    case 'social':
      return (
        <div className="flex items-center justify-center gap-3">
          {block.content.links?.map((link: any, index: number) => (
            <span
              key={index}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-xs font-bold uppercase text-muted-foreground transition-colors hover:bg-primary/10"
              title={link.platform}
            >
              {String(link.platform || 'S').slice(0, 2)}
            </span>
          ))}
        </div>
      );
    case 'video':
      return (
        <div className="overflow-hidden rounded-xl border border-border bg-muted/30">
          {block.content.thumbnail ? (
            <img src={block.content.thumbnail} alt={block.content.title || 'Video thumbnail'} className="max-h-64 w-full object-cover" />
          ) : (
            <div className="flex h-48 items-center justify-center border-b border-dashed border-border bg-muted text-muted-foreground">
              <Video className="h-10 w-10" />
            </div>
          )}
          <div className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
              <div className="ml-0.5 h-0 w-0 border-b-[8px] border-l-[14px] border-t-[8px] border-b-transparent border-l-primary border-t-transparent" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">{block.content.title || 'Watch video'}</p>
              <p className="text-xs text-muted-foreground">{block.content.url || 'Add a video URL to make this clickable.'}</p>
            </div>
          </div>
        </div>
      );
    case 'countdown': {
      const [days, hours, minutes, seconds] = getCountdownPreview(String(block.content.targetDate || ''));
      return (
        <div className="text-center">
          <p className="mb-3 text-sm text-muted-foreground">{block.content.label}</p>
          <div className="flex justify-center gap-3">
            {[
              ['Days', days],
              ['Hrs', hours],
              ['Min', minutes],
              ['Sec', seconds],
            ].map(([label, value]) => (
              <div key={label} className="text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-muted text-xl font-bold text-foreground">{value}</div>
                <span className="mt-1 block text-xs text-muted-foreground">{label}</span>
              </div>
            ))}
          </div>
        </div>
      );
    }
    case 'code':
      return (
        <div className="overflow-x-auto rounded-lg bg-muted p-4 font-mono text-xs text-foreground">
          <pre>{block.content.text}</pre>
        </div>
      );
    case 'table':
      return (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <tbody>
              {block.content.data?.map((row: string[], rowIndex: number) => (
                <tr key={rowIndex}>
                  {row.map((cell: string, cellIndex: number) =>
                    rowIndex === 0 ? (
                      <th key={cellIndex} className="border border-border bg-muted px-3 py-2 text-left font-semibold text-foreground">
                        {cell}
                      </th>
                    ) : (
                      <td key={cellIndex} className="border border-border px-3 py-2 text-muted-foreground">
                        {cell}
                      </td>
                    )
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case 'bookmark':
      return (
        <div className="rounded-lg border border-border p-4 transition-colors hover:bg-muted/50">
          <h4 className="mb-1 text-sm font-semibold text-primary">{block.content.title}</h4>
          <p className="text-xs text-muted-foreground">{block.content.description}</p>
          <span className="mt-1 block text-xs text-primary/70">{block.content.url}</span>
        </div>
      );
    default:
      return <div className="text-sm text-muted-foreground">Unknown block: {block.type}</div>;
  }
}

function SortableBlock({
  block,
  index,
  onToolbarTargetChange,
}: {
  block: EmailBlock;
  index: number;
  onToolbarTargetChange?: (ref: RefObject<HTMLDivElement> | null) => void;
}) {
  const { selectedBlockId, selectBlock, removeBlock, addBlock } = useEmailBuilderStore();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id });
  const isSelected = selectedBlockId === block.id;

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const duplicateBlock = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    addBlock(duplicateEmailBuilderBlock(block), { index: index + 1 });
  };

  const quickInsertText = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    addBlock(createEmailBuilderBlock('text'), { index: index + 1 });
  };

  return (
    <div className="relative">
      <div className="absolute -left-4 top-0 z-10 -translate-x-full">
        <InlineInsertMenu index={index} />
      </div>
      <div
        ref={setNodeRef}
        style={style}
        className={cn(
          'group relative min-w-0 cursor-pointer rounded-xl border transition-all',
          isDragging && 'opacity-50',
          isSelected ? 'border-primary ring-2 ring-primary/20' : 'border-transparent hover:border-border'
        )}
        onClick={(event) => {
          event.stopPropagation();
          selectBlock(block.id);
        }}
      >
        <div className="pointer-events-none absolute right-3 top-3 z-10 rounded-full bg-background/95 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground shadow-sm">
          {blockLabel(block.type)}
        </div>

        <div className="absolute -left-9 top-3 z-10 flex flex-col gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <button {...attributes} {...listeners} className="rounded bg-background p-1 text-muted-foreground shadow-sm hover:bg-muted" title="Drag">
            <GripVertical className="h-3.5 w-3.5" />
          </button>
          <button onClick={quickInsertText} className="rounded bg-background p-1 text-muted-foreground shadow-sm hover:bg-muted" title="Add text below">
            <Plus className="h-3.5 w-3.5" />
          </button>
          <button onClick={duplicateBlock} className="rounded bg-background p-1 text-muted-foreground shadow-sm hover:bg-muted" title="Duplicate">
            <Copy className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={(event) => {
              event.stopPropagation();
              removeBlock(block.id);
            }}
            className="rounded bg-background p-1 text-muted-foreground shadow-sm hover:bg-destructive/10 hover:text-destructive"
            title="Delete"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>

        <div
          className="min-w-0 max-w-full overflow-x-hidden rounded-xl"
          style={block.styles as CSSProperties}
        >
          <BlockRenderer block={block} isSelected={isSelected} onToolbarTargetChange={onToolbarTargetChange} />
        </div>
      </div>
    </div>
  );
}

function CanvasEmptyState() {
  const { addBlock, insertBlocks } = useEmailBuilderStore();

  return (
    <div className="rounded-2xl border-2 border-dashed border-border bg-muted/20 p-6 text-center">
      <Type className="mx-auto mb-3 h-9 w-9 text-muted-foreground" />
      <p className="text-sm font-semibold text-foreground">Start with a block or a ready-made layout</p>
      <p className="mt-1 text-xs text-muted-foreground">You can drag to reorder, insert blocks between sections, and edit content inline.</p>

      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
        {[
          ['heading', 'Heading'],
          ['text', 'Text'],
          ['button', 'Button'],
          ['image', 'Image'],
        ].map(([type, label]) => (
          <Button key={type} size="sm" variant="outline" onClick={() => addBlock(createEmailBuilderBlock(type as BlockType))}>
            {label}
          </Button>
        ))}
      </div>

      <div className="mt-5 grid gap-2 md:grid-cols-3">
        {EMAIL_BUILDER_STARTER_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            onClick={() => insertBlocks(preset.blocks())}
            className="rounded-xl border border-border bg-background p-3 text-left transition-colors hover:border-primary/30 hover:bg-primary/5"
          >
            <p className="text-sm font-medium text-foreground">{preset.label}</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{preset.description}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

function CanvasShell({
  isMobilePreview,
  subject,
  preheader,
  children,
}: {
  isMobilePreview: boolean;
  subject: string;
  preheader: string;
  children: React.ReactNode;
}) {
  if (isMobilePreview) {
    return (
      <div className="relative mx-auto w-full max-w-[390px] rounded-[2.2rem] border-[10px] border-slate-900 bg-slate-900 p-1.5 shadow-2xl">
        <div className="absolute left-1/2 top-0 h-5 w-24 -translate-x-1/2 rounded-b-2xl bg-slate-900" />
        <div className="h-[74vh] min-h-[540px] max-h-[780px] overflow-y-auto overflow-x-hidden rounded-[1.65rem] border border-border bg-card">
          <div className="border-b border-border px-6 py-4">
            <p className="mb-1 text-xs text-muted-foreground">Subject</p>
            <p className="text-sm font-medium text-foreground">{subject || 'No subject'}</p>
            {preheader ? <p className="mt-2 text-xs text-muted-foreground">Preheader: {preheader}</p> : null}
          </div>
          <div className="min-h-[400px] overflow-x-hidden p-6 pb-10">{children}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-full overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-all">
      <div className="border-b border-border px-6 py-4">
        <p className="mb-1 text-xs text-muted-foreground">Subject</p>
        <p className="text-sm font-medium text-foreground">{subject || 'No subject'}</p>
        {preheader ? <p className="mt-2 text-xs text-muted-foreground">Preheader: {preheader}</p> : null}
      </div>
      <div className="min-h-[400px] overflow-x-hidden p-6">{children}</div>
    </div>
  );
}

export function EmailCanvas() {
  const { currentTemplate, reorderBlocks, selectBlock, previewMode } = useEmailBuilderStore();
  const [activeToolbarEditorRef, setActiveToolbarEditorRef] = useState<RefObject<HTMLDivElement> | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const isMobilePreview = previewMode === 'mobile';

  const blocks = currentTemplate?.blocks || [];

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = blocks.findIndex((block) => block.id === active.id);
    const newIndex = blocks.findIndex((block) => block.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    reorderBlocks(arrayMove(blocks, oldIndex, newIndex));
  };

  return (
    <div className="h-full min-w-0 overflow-auto bg-canvas-bg p-8" onClick={() => selectBlock(null)}>
      <div className={cn('mx-auto w-full', isMobilePreview ? 'max-w-[420px]' : 'max-w-3xl')} onClick={(event) => event.stopPropagation()}>
        {activeToolbarEditorRef ? <EditorToolbarDock editorRef={activeToolbarEditorRef} /> : null}
        <CanvasShell
          isMobilePreview={isMobilePreview}
          subject={currentTemplate?.subject || ''}
          preheader={currentTemplate?.preheader || ''}
        >
          {blocks.length === 0 ? (
            <CanvasEmptyState />
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={blocks.map((block) => block.id)} strategy={verticalListSortingStrategy}>
                <div className={cn('min-w-0 space-y-3', isMobilePreview ? 'pl-4 pr-2' : 'pl-9')}>
                  {blocks.map((block, index) => (
                    <SortableBlock
                      key={block.id}
                      block={block}
                      index={index}
                      onToolbarTargetChange={setActiveToolbarEditorRef}
                    />
                  ))}
                  <div className="flex items-center gap-3 pl-4 pt-1">
                    <div className="h-px flex-1 bg-border" />
                    <InlineInsertMenu index={blocks.length} />
                    <div className="h-px flex-1 bg-border" />
                  </div>
                </div>
              </SortableContext>
            </DndContext>
          )}
        </CanvasShell>
      </div>
    </div>
  );
}

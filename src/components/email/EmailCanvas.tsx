import { useRef, useCallback, useLayoutEffect } from 'react';
import { useEmailBuilderStore, EmailBlock } from '@/stores/emailBuilderStore';
import { DndContext, closestCenter, DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { cn } from '@/lib/utils';
import { GripVertical, Trash2, Type, Image, Copy } from 'lucide-react';
import { RichTextToolbar } from './RichTextToolbar';

function RichTextBlock({ block, isSelected }: { block: EmailBlock; isSelected: boolean }) {
  const { updateBlock } = useEmailBuilderStore();
  const editorRef = useRef<HTMLDivElement>(null);
  const lastSyncedHtmlRef = useRef('');

  // Keep editor DOM in sync with store updates, but never while the user is typing.
  useLayoutEffect(() => {
    if (!editorRef.current) return;
    const nextHtml = block.content.html || block.content.text || '';
    if (document.activeElement === editorRef.current) return;
    if (editorRef.current.innerHTML !== nextHtml) {
      editorRef.current.innerHTML = nextHtml;
    }
    lastSyncedHtmlRef.current = nextHtml;
  }, [block.id, block.content.html, block.content.text]);

  const handleInput = useCallback(() => {
    if (!editorRef.current) return;
    lastSyncedHtmlRef.current = editorRef.current.innerHTML;
  }, []);

  const saveContent = useCallback(() => {
    if (editorRef.current) {
      const html = editorRef.current.innerHTML;
      const text = editorRef.current.textContent || '';
      const previousHtml = block.content.html || block.content.text || '';
      const previousText = block.content.text || '';
      if (html === previousHtml && text === previousText) return;
      updateBlock(block.id, { content: { ...block.content, html, text } });
    }
  }, [block.id, block.content, updateBlock]);

  const isHeading = block.type === 'heading';

  return (
    <div>
      {isSelected && (
        <div className="mb-2 max-w-full overflow-x-auto">
          <RichTextToolbar editorRef={editorRef} />
        </div>
      )}
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onBlur={saveContent}
        onInput={handleInput}
        className={cn(
          "outline-none rounded px-1 min-h-[1.5em] min-w-0 max-w-full break-words text-foreground",
          "focus:ring-1 focus:ring-primary/20",
          isHeading ? "text-2xl font-bold" : "text-sm leading-relaxed",
          "[&_ul]:list-disc [&_ul]:ml-5 [&_ul]:my-1",
          "[&_ol]:list-decimal [&_ol]:ml-5 [&_ol]:my-1",
          "[&_li]:mb-0.5",
          "[&_a]:break-all [&_a]:text-primary [&_a]:underline",
          "[&_img]:max-w-full [&_img]:h-auto",
          "[&_table]:max-w-full [&_table]:w-full [&_table]:table-fixed",
          "[&_th]:break-words [&_td]:break-words",
          "[&_pre]:whitespace-pre-wrap [&_pre]:break-words",
          "[&_*]:max-w-full",
          "[&_blockquote]:border-l-[3px] [&_blockquote]:border-primary/30 [&_blockquote]:pl-3 [&_blockquote]:italic [&_blockquote]:text-muted-foreground",
          "[&_pre]:bg-muted [&_pre]:rounded-md [&_pre]:p-2 [&_pre]:font-mono [&_pre]:text-xs",
        )}
      />
    </div>
  );
}

function SortableBlock({ block }: { block: EmailBlock }) {
  const { selectedBlockId, selectBlock, removeBlock, addBlock } = useEmailBuilderStore();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id });
  const isSelected = selectedBlockId === block.id;

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const duplicateBlock = (e: React.MouseEvent) => {
    e.stopPropagation();
    const newBlock: EmailBlock = {
      ...block,
      id: crypto.randomUUID(),
      content: { ...block.content },
      styles: { ...block.styles },
    };
    addBlock(newBlock);
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group relative min-w-0 border rounded-lg transition-all cursor-pointer",
        isDragging && "opacity-50",
        isSelected ? "border-primary ring-2 ring-primary/20" : "border-transparent hover:border-border"
      )}
      onClick={(e) => { e.stopPropagation(); selectBlock(block.id); }}
    >
      {/* Controls */}
      <div className={cn(
        "absolute -left-9 top-2 flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity z-10",
      )}>
        <button {...attributes} {...listeners} className="p-1 rounded hover:bg-muted text-muted-foreground" title="Drag">
          <GripVertical className="w-3.5 h-3.5" />
        </button>
        <button onClick={duplicateBlock} className="p-1 rounded hover:bg-muted text-muted-foreground" title="Duplicate">
          <Copy className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); removeBlock(block.id); }}
          className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
          title="Delete"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Block content */}
      <div
        className="min-w-0 max-w-full overflow-x-hidden"
        style={{ padding: block.styles.padding || '16px', backgroundColor: block.styles.backgroundColor || 'transparent' }}
      >
        <BlockRenderer block={block} isSelected={isSelected} />
      </div>
    </div>
  );
}

function BlockRenderer({ block, isSelected }: { block: EmailBlock; isSelected: boolean }) {

  switch (block.type) {
    case 'heading':
    case 'text':
      return <RichTextBlock block={block} isSelected={isSelected} />;
    case 'image':
      return block.content.src ? (
        <img src={block.content.src} alt={block.content.alt} className="max-w-full rounded" style={{ width: block.content.width || '100%' }} />
      ) : (
        <div className="h-32 bg-muted rounded-lg flex items-center justify-center text-muted-foreground border-2 border-dashed border-border">
          <div className="text-center">
            <Image className="w-8 h-8 mx-auto mb-1" />
            <span className="text-xs">Click to add image URL in settings -&gt;</span>
          </div>
        </div>
      );
    case 'button':
      return (
        <div style={{ textAlign: (block.content.align as any) || 'center' }}>
          <span
            className="inline-block rounded-lg text-sm font-medium cursor-default"
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
      return <div style={{ height: block.content.height }} className="bg-muted/20 rounded border border-dashed border-border" />;
    case 'columns':
      return (
        <div className={cn("grid gap-4", block.content.count === 3 ? "grid-cols-3" : "grid-cols-2")}>
          {block.content.content?.map((col: any, i: number) => (
            <div key={i} className="p-3 border border-dashed border-border rounded-lg text-sm text-muted-foreground min-h-[60px]">
              {col.text}
            </div>
          ))}
        </div>
      );
    case 'social':
      return (
        <div className="flex items-center justify-center gap-3">
          {block.content.links?.map((l: any, i: number) => (
            <span key={i} className="w-9 h-9 rounded-full bg-muted flex items-center justify-center text-xs text-muted-foreground uppercase font-bold hover:bg-primary/10 transition-colors">
              {l.platform[0]}
            </span>
          ))}
        </div>
      );
    case 'video':
      return (
        <div className="bg-muted rounded-lg flex items-center justify-center h-48 text-muted-foreground border-2 border-dashed border-border">
          <div className="text-center">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-2">
              <div className="w-0 h-0 border-t-[8px] border-t-transparent border-b-[8px] border-b-transparent border-l-[14px] border-l-primary ml-1" />
            </div>
            <span className="text-xs">Video Thumbnail</span>
          </div>
        </div>
      );
    case 'countdown':
      return (
        <div className="text-center">
          <p className="text-sm text-muted-foreground mb-3">{block.content.label}</p>
          <div className="flex justify-center gap-3">
            {['Days', 'Hrs', 'Min', 'Sec'].map(u => (
              <div key={u} className="text-center">
                <div className="w-14 h-14 bg-muted rounded-lg flex items-center justify-center text-xl font-bold text-foreground">00</div>
                <span className="text-xs text-muted-foreground mt-1 block">{u}</span>
              </div>
            ))}
          </div>
        </div>
      );
    case 'quote':
      return <RichTextBlock block={block} isSelected={isSelected} />;
    case 'code':
      return (
        <div className="bg-muted rounded-lg p-4 font-mono text-xs text-foreground overflow-x-auto">
          <pre>{block.content.text}</pre>
        </div>
      );
    case 'signature':
      return <RichTextBlock block={block} isSelected={isSelected} />;
    case 'table':
      return (
        <table className="w-full border-collapse text-sm">
          <tbody>
            {block.content.data?.map((row: string[], ri: number) => (
              <tr key={ri}>
                {row.map((cell: string, ci: number) => (
                  ri === 0 ? (
                    <th key={ci} className="border border-border bg-muted px-3 py-2 text-left font-semibold text-foreground">{cell}</th>
                  ) : (
                    <td key={ci} className="border border-border px-3 py-2 text-muted-foreground">{cell}</td>
                  )
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );
    case 'bookmark':
      return (
        <div className="border border-border rounded-lg p-4 hover:bg-muted/50 transition-colors">
          <h4 className="text-sm font-semibold text-primary mb-1">{block.content.title}</h4>
          <p className="text-xs text-muted-foreground">{block.content.description}</p>
          <span className="text-xs text-primary/70 mt-1 block">{block.content.url}</span>
        </div>
      );
    default:
      return <div className="text-sm text-muted-foreground">Unknown block: {block.type}</div>;
  }
}

export function EmailCanvas() {
  const { currentTemplate, reorderBlocks, selectBlock, previewMode } = useEmailBuilderStore();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const isMobilePreview = previewMode === 'mobile';

  const blocks = currentTemplate?.blocks || [];

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = blocks.findIndex(b => b.id === active.id);
    const newIndex = blocks.findIndex(b => b.id === over.id);
    reorderBlocks(arrayMove(blocks, oldIndex, newIndex));
  };

  return (
    <div className="h-full min-w-0 bg-canvas-bg overflow-auto p-8" onClick={() => selectBlock(null)}>
      <div className={cn("mx-auto w-full", isMobilePreview ? "max-w-[420px]" : "max-w-2xl")} onClick={(e) => e.stopPropagation()}>
        {isMobilePreview ? (
          <div className="relative mx-auto w-full max-w-[390px] rounded-[2.2rem] border-[10px] border-slate-900 bg-slate-900 p-1.5 shadow-2xl">
            <div className="absolute left-1/2 top-0 h-5 w-24 -translate-x-1/2 rounded-b-2xl bg-slate-900" />
            <div className="h-[74vh] min-h-[540px] max-h-[780px] overflow-y-auto overflow-x-hidden rounded-[1.65rem] border border-border bg-card">
              {/* Email header */}
              <div className="px-6 py-4 border-b border-border">
                <p className="text-xs text-muted-foreground mb-1">Subject</p>
                <p className="text-sm font-medium text-foreground">{currentTemplate?.subject || 'No subject'}</p>
              </div>

              {/* Email body */}
              <div className="min-h-[400px] overflow-x-hidden p-6 pb-10">
                {blocks.length === 0 ? (
                  <div className="h-64 border-2 border-dashed border-border rounded-xl flex flex-col items-center justify-center text-muted-foreground">
                    <Type className="w-8 h-8 mb-3" />
                    <p className="text-sm font-medium">Click blocks on the left to add content</p>
                    <p className="text-xs mt-1">Drag to reorder, click to edit with rich text toolbar</p>
                  </div>
                ) : (
                  <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                    <SortableContext items={blocks.map(b => b.id)} strategy={verticalListSortingStrategy}>
                      <div className="min-w-0 space-y-2 pl-4 pr-2">
                        {blocks.map(block => (
                          <SortableBlock key={block.id} block={block} />
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="mx-auto w-full max-w-full overflow-hidden bg-card rounded-xl shadow-sm border border-border transition-all">
            {/* Email header */}
            <div className="px-6 py-4 border-b border-border">
              <p className="text-xs text-muted-foreground mb-1">Subject</p>
              <p className="text-sm font-medium text-foreground">{currentTemplate?.subject || 'No subject'}</p>
            </div>

            {/* Email body */}
            <div className="min-h-[400px] overflow-x-hidden p-6">
              {blocks.length === 0 ? (
                <div className="h-64 border-2 border-dashed border-border rounded-xl flex flex-col items-center justify-center text-muted-foreground">
                  <Type className="w-8 h-8 mb-3" />
                  <p className="text-sm font-medium">Click blocks on the left to add content</p>
                  <p className="text-xs mt-1">Drag to reorder, click to edit with rich text toolbar</p>
                </div>
              ) : (
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                  <SortableContext items={blocks.map(b => b.id)} strategy={verticalListSortingStrategy}>
                    <div className="min-w-0 space-y-2 pl-9">
                      {blocks.map(block => (
                        <SortableBlock key={block.id} block={block} />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


import { useMemo, useState } from "react";
import { useDraggable } from "@dnd-kit/core";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { nodePlugins } from "@/workflow/nodes/nodeRegistry";
import type { WorkflowNodeKind } from "@/workflow/types/schema";

interface WorkflowBlockLibraryProps {
  onQuickAdd: (kind: WorkflowNodeKind) => void;
  compact?: boolean;
}

const BlockItem = ({
  kind,
  title,
  description,
  icon: Icon,
  toneClass,
  onQuickAdd,
}: {
  kind: WorkflowNodeKind;
  title: string;
  description: string;
  icon: LucideIcon;
  toneClass: string;
  onQuickAdd: (kind: WorkflowNodeKind) => void;
}) => {
  const draggable = useDraggable({
    id: `block_${kind}`,
    data: { kind },
  });

  const style = useMemo(() => {
    if (!draggable.isDragging) return undefined;
    return { opacity: 0.45 };
  }, [draggable.isDragging]);

  return (
    <div
      ref={draggable.setNodeRef}
      style={style}
      {...draggable.listeners}
      {...draggable.attributes}
      className={cn(
        "cursor-grab rounded-xl border border-slate-200 bg-white/90 p-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md",
        draggable.isDragging && "cursor-grabbing"
      )}
    >
      <div className={cn("rounded-lg border bg-gradient-to-br p-2", toneClass)}>
        <Icon className="h-4 w-4 text-slate-700" />
      </div>
      <p className="mt-2 text-sm font-semibold text-slate-900">{title}</p>
      <p className="mt-1 text-xs text-slate-600">{description}</p>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="mt-2 h-7 px-2 text-xs"
        onClick={(event) => {
          event.stopPropagation();
          onQuickAdd(kind);
        }}
      >
        Add to canvas
      </Button>
    </div>
  );
};

const WorkflowBlockLibrary = ({ onQuickAdd, compact = false }: WorkflowBlockLibraryProps) => {
  const [query, setQuery] = useState("");
  const filteredPlugins = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return nodePlugins;
    return nodePlugins.filter((plugin) => {
      const haystack = `${plugin.title} ${plugin.description} ${plugin.kind}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [query]);

  return (
    <aside
      className={cn(
        "h-full",
        compact
          ? "bg-transparent p-0"
          : "rounded-2xl border border-slate-200 bg-gradient-to-b from-white to-slate-50 p-3 shadow-sm"
      )}
    >
      <div className={cn("mb-2", compact ? "" : "px-1")}>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Block Library</p>
        <p className="text-sm text-slate-700">Drag blocks to the canvas or click to add.</p>
      </div>
      <Input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        className="mb-2 h-8"
        placeholder="Search blocks"
      />
      <div className={cn("overflow-auto pr-1", compact ? "h-[calc(100%-88px)]" : "h-[calc(100%-80px)]")}>
        <div className="space-y-2">
          {filteredPlugins.map((plugin) => (
            <BlockItem
              key={plugin.kind}
              kind={plugin.kind}
              title={plugin.title}
              description={plugin.description}
              icon={plugin.icon}
              toneClass={plugin.toneClass}
              onQuickAdd={onQuickAdd}
            />
          ))}
          {filteredPlugins.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-200 p-3 text-xs text-slate-500">No blocks found.</p>
          ) : null}
        </div>
      </div>
    </aside>
  );
};

export default WorkflowBlockLibrary;

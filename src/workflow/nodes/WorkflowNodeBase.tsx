import { memo } from "react";
import { useDndContext, useDroppable } from "@dnd-kit/core";
import { Handle, NodeProps, Position } from "@xyflow/react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { getConditionPorts, nodePluginMap } from "@/workflow/nodes/nodeRegistry";
import type { NodePort } from "@/workflow/nodes/nodeRegistry";
import type { WorkflowCanvasNodeData } from "@/workflow/types/reactflow";
import type { WorkflowNodeKind } from "@/workflow/types/schema";
import { createSourceDropTargetId } from "@/workflow/utils/dropTargets";
import { normalizeConditionConfig } from "@/workflow/utils/condition";

const statusTone = {
  draft: "border-slate-200 bg-slate-100 text-slate-700",
  live: "border-emerald-200 bg-emerald-100 text-emerald-700",
  error: "border-rose-200 bg-rose-100 text-rose-700",
} as const;

const kindAccent: Record<WorkflowNodeKind, string> = {
  trigger: "bg-emerald-500",
  send_email: "bg-indigo-500",
  wait: "bg-orange-500",
  condition: "bg-sky-500",
  split: "bg-violet-500",
  webhook: "bg-teal-500",
  exit: "bg-slate-500",
};

const summaryForNode = (kind: string, config: Record<string, unknown>) => {
  if (kind === "send_email") {
    return String(config.subject || "No subject");
  }
  if (kind === "wait") {
    return `${config.duration || 1} ${config.unit || "days"}`;
  }
  if (kind === "condition") {
    const normalized = normalizeConditionConfig(config);
    const primary = normalized.clauses[0];
    const elseIfCount = Math.max(0, normalized.clauses.length - 1);
    const baseLabel = String(primary?.rule || "condition").replaceAll("_", " ");
    return elseIfCount > 0 ? `${baseLabel} + ${elseIfCount} else-if` : baseLabel;
  }
  if (kind === "webhook") {
    return String(config.url || "No URL");
  }
  if (kind === "split") {
    return `${config.percentageA || 50}% / ${config.percentageB || 50}%`;
  }
  return "";
};

const sourceDropTargetStyle = (port: NodePort) => ({
  left:
    port.style?.left ??
    (port.position === Position.Right ? "100%" : port.position === Position.Left ? "0%" : "50%"),
  top:
    port.style?.top ??
    (port.position === Position.Top ? "0%" : port.position === Position.Bottom ? "100%" : "50%"),
  transform:
    port.position === Position.Top
      ? "translate(-50%, -55%)"
      : port.position === Position.Bottom
        ? "translate(-50%, -45%)"
        : port.position === Position.Left
          ? "translate(-55%, -50%)"
          : "translate(-45%, -50%)",
});

const SourceDropTarget = ({ nodeId, port }: { nodeId: string; port: NodePort }) => {
  const { setNodeRef, isOver } = useDroppable({
    id: createSourceDropTargetId(nodeId, port.id),
    data: {
      nodeId,
      handleId: port.id,
      type: "workflow-source-port",
    },
  });

  return (
    <div
      ref={setNodeRef}
      style={sourceDropTargetStyle(port)}
      className={cn(
        "pointer-events-auto absolute z-20 flex h-8 min-w-[84px] items-center justify-center rounded-md border px-2 text-[10px] font-semibold shadow-sm transition-all",
        isOver
          ? "border-emerald-300 bg-emerald-50 text-emerald-700 ring-2 ring-emerald-200"
          : "border-slate-200 bg-white/95 text-slate-500"
      )}
      aria-hidden
    >
      Drop to {port.label || "next"}
    </div>
  );
};

const WorkflowNodeBase = ({ data, selected }: NodeProps<WorkflowCanvasNodeData>) => {
  const node = data.node;
  const plugin = nodePluginMap[node.kind];
  const Icon = plugin.icon;
  const summary = summaryForNode(node.kind, (node.config || {}) as Record<string, unknown>);
  const enrollment = node.meta?.enrollmentCount;
  const ports = node.kind === "condition" ? getConditionPorts(node.config) : plugin.ports;
  const { active } = useDndContext();
  const isBlockDragging = typeof active?.id === "string" && active.id.startsWith("block_");

  return (
    <div
      className={cn(
        "group relative min-w-[260px] rounded-lg border bg-white px-3 py-3 shadow-sm transition-all",
        "hover:-translate-y-0.5 hover:shadow-md",
        selected ? "border-emerald-400 ring-2 ring-emerald-100" : "border-slate-200"
      )}
    >
      <div className={cn("absolute bottom-0 left-0 top-0 w-1 rounded-l-lg", kindAccent[node.kind])} />
      <div className="relative ml-1 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="rounded-md border border-slate-200 bg-slate-50 p-1.5 text-slate-700">
              <Icon className="h-4 w-4" />
            </span>
            <div>
              <p className="text-sm font-semibold text-slate-900">{node.title}</p>
              <p className="text-[11px] uppercase tracking-[0.12em] text-slate-500">{plugin.kind.replaceAll("_", " ")}</p>
            </div>
          </div>
          <Badge className={cn("border text-[10px] uppercase", statusTone[node.status])}>{node.status}</Badge>
        </div>

        <p className="line-clamp-2 min-h-[32px] text-xs text-slate-700">{summary || plugin.description}</p>

        <div className="flex items-center justify-between text-[11px] text-slate-500">
          <span>{plugin.supportsRunner ? "Runner ready" : "Visual only"}</span>
          {typeof enrollment === "number" ? <span>{enrollment.toLocaleString()} enrolled</span> : null}
        </div>
      </div>

      {ports.map((port) => (
        <Handle
          key={`${node.id}_${port.type}_${port.id}`}
          id={port.id}
          type={port.type}
          position={port.position}
          className="!h-3 !w-3 !border-2 !border-white !bg-slate-700"
          style={port.style}
        >
          {port.label ? (
            <span className="absolute -top-6 left-1/2 -translate-x-1/2 rounded border border-slate-200 bg-white/95 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 shadow-sm">
              {port.label}
            </span>
          ) : null}
        </Handle>
      ))}

      {isBlockDragging
        ? ports
            .filter((port) => port.type === "source")
            .map((port) => <SourceDropTarget key={`${node.id}_drop_${port.id}`} nodeId={node.id} port={port} />)
        : null}
    </div>
  );
};

export default memo(WorkflowNodeBase);

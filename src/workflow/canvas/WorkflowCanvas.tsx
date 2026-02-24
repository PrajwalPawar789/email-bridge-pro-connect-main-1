import { useMemo } from "react";
import {
  Background,
  BackgroundVariant,
  Connection,
  Controls,
  Edge,
  ReactFlow,
  ReactFlowInstance,
  SelectionMode,
} from "@xyflow/react";
import { useDroppable } from "@dnd-kit/core";
import "@xyflow/react/dist/style.css";
import type { EdgeChange, NodeChange, OnSelectionChangeParams } from "@xyflow/react";
import { workflowEdgeTypes } from "@/workflow/edges/edgeTypes";
import { workflowNodeTypes } from "@/workflow/nodes/nodeTypes";
import type { WorkflowEdge, WorkflowNode } from "@/workflow/types/schema";
import WorkflowErrorsOverlay from "@/workflow/canvas/WorkflowErrorsOverlay";

interface WorkflowCanvasProps {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  selectedNodeIds?: string[];
  selectedEdgeIds?: string[];
  errors?: string[];
  onInit?: (instance: ReactFlowInstance) => void;
  onConnect?: (connection: Connection) => void;
  onReconnect?: (oldEdge: Edge, connection: Connection) => void;
  onNodesChange?: (changes: NodeChange[]) => void;
  onEdgesChange?: (changes: EdgeChange[]) => void;
  onSelectionChange?: (params: OnSelectionChangeParams) => void;
  readOnly?: boolean;
  dropzoneId?: string;
}

const GRID = 24;

const WorkflowCanvas = ({
  nodes,
  edges,
  selectedNodeIds = [],
  selectedEdgeIds = [],
  errors = [],
  onInit,
  onConnect,
  onReconnect,
  onNodesChange,
  onEdgesChange,
  onSelectionChange,
  readOnly = false,
  dropzoneId = "workflow-canvas-dropzone",
}: WorkflowCanvasProps) => {
  const { setNodeRef, isOver } = useDroppable({ id: dropzoneId, disabled: readOnly });

  const flowNodes = useMemo(
    () =>
      nodes.map((node) => ({
        id: node.id,
        type: node.kind,
        position: node.position,
        selected: selectedNodeIds.includes(node.id),
        draggable: !readOnly,
        data: {
          node,
          selected: selectedNodeIds.includes(node.id),
        },
      })),
    [nodes, readOnly, selectedNodeIds]
  );

  const flowEdges = useMemo(
    () =>
      edges.map((edge) => ({
        ...edge,
        type: "workflow",
        selected: selectedEdgeIds.includes(edge.id),
        label: edge.label,
        animated: edge.animated !== false,
        markerEnd: {
          type: "arrowclosed",
          color:
            typeof edge.data === "object" &&
            edge.data !== null &&
            "highlighted" in edge.data &&
            Boolean((edge.data as { highlighted?: boolean }).highlighted)
              ? "#059669"
              : "#64748b",
        },
      })),
    [edges, selectedEdgeIds]
  );

  return (
    <div
      id={dropzoneId}
      ref={setNodeRef}
      className={`relative h-full rounded-2xl border bg-white shadow-sm transition ${
        !readOnly && isOver ? "border-[var(--shell-accent)] ring-2 ring-emerald-200" : "border-slate-200"
      }`}
    >
      <WorkflowErrorsOverlay errors={errors} />
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        onInit={onInit}
        onConnect={readOnly ? undefined : onConnect}
        onReconnect={readOnly ? undefined : onReconnect}
        onNodesChange={readOnly ? undefined : onNodesChange}
        onEdgesChange={readOnly ? undefined : onEdgesChange}
        onSelectionChange={readOnly ? undefined : onSelectionChange}
        nodeTypes={workflowNodeTypes}
        edgeTypes={workflowEdgeTypes}
        fitView
        panOnDrag
        panOnScroll
        zoomOnScroll
        zoomOnPinch
        zoomOnDoubleClick={false}
        minZoom={0.2}
        maxZoom={1.8}
        nodesDraggable={!readOnly}
        nodesConnectable={!readOnly}
        elementsSelectable={!readOnly}
        selectionOnDrag={!readOnly}
        selectionMode={SelectionMode.Partial}
        multiSelectionKeyCode={["Meta", "Control"]}
        snapToGrid
        snapGrid={[GRID, GRID]}
        edgesReconnectable={!readOnly}
        onlyRenderVisibleElements
        proOptions={{ hideAttribution: true }}
        defaultEdgeOptions={{ type: "workflow", animated: true }}
      >
        <Background color="#dbe3ef" gap={16} size={1.2} variant={BackgroundVariant.Dots} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
};

export default WorkflowCanvas;

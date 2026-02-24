import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent } from "@dnd-kit/core";
import type { Connection, Edge as FlowEdge, ReactFlowInstance } from "@xyflow/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import type { AutomationDependencyData, AutomationStep } from "@/lib/automations";
import WorkflowCanvas from "@/workflow/canvas/WorkflowCanvas";
import { useWorkflowAutosave } from "@/workflow/hooks/useWorkflowAutosave";
import { useWorkflowKeyboardShortcuts } from "@/workflow/hooks/useWorkflowKeyboardShortcuts";
import WorkflowInspector from "@/workflow/inspector/WorkflowInspector";
import WorkflowReviewChecklist from "@/workflow/inspector/WorkflowReviewChecklist";
import WorkflowRuntimePanel from "@/workflow/inspector/WorkflowRuntimePanel";
import { nodePluginMap } from "@/workflow/nodes/nodeRegistry";
import WorkflowBlockLibrary from "@/workflow/sidebar/WorkflowBlockLibrary";
import { useWorkflowBuilderStore } from "@/workflow/state/useWorkflowBuilderStore";
import type { WorkflowEdge, WorkflowGraph, WorkflowNode, WorkflowNodeKind, WorkflowRuntimeEvent } from "@/workflow/types/schema";
import { autoLayoutGraph } from "@/workflow/utils/autoLayout";
import { parseSourceDropTargetId } from "@/workflow/utils/dropTargets";
import { findTriggerNode, makeEdgeFromConnection } from "@/workflow/utils/graph";
import { createEdgeId } from "@/workflow/utils/id";
import { buildPublishChecklist, canPublishWorkflow } from "@/workflow/utils/review";
import { compileGraphToLegacyFlow } from "@/workflow/services/workflowAdapter";

interface WorkflowBuilderStatePayload {
  graph: WorkflowGraph;
  compiledFlow: AutomationStep[];
  compileErrors: string[];
  checklistPass: boolean;
}

interface WorkflowBuilderProps {
  workflowId: string;
  initialGraph: WorkflowGraph;
  workflowStatus: "draft" | "live" | "paused" | "archived";
  dependencies: AutomationDependencyData;
  runtimeEvents: WorkflowRuntimeEvent[];
  onPersist: (payload: WorkflowBuilderStatePayload) => Promise<void>;
  onStateChange?: (payload: WorkflowBuilderStatePayload) => void;
}

interface AddNodeOptions {
  position?: { x: number; y: number };
  sourceNodeId?: string | null;
  sourceHandle?: string | null;
}

const GRID = 24;

const isDefaultPathEdge = (edge: WorkflowEdge) => !edge.sourceHandle || edge.sourceHandle === "out";

const nodeHasDefaultOutput = (kind: WorkflowNodeKind) =>
  kind === "trigger" || kind === "send_email" || kind === "wait" || kind === "webhook";

const nodeSupportsDefaultInput = (kind: WorkflowNodeKind) => kind !== "trigger";

const snapPoint = (position: { x: number; y: number }) => ({
  x: Math.round(position.x / GRID) * GRID,
  y: Math.round(position.y / GRID) * GRID,
});

const findLinearInsertSource = (graph: WorkflowGraph, preferredSourceId?: string | null) => {
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const preferred = preferredSourceId ? nodeById.get(preferredSourceId) : null;
  if (preferred && nodeHasDefaultOutput(preferred.kind)) return preferred.id;

  const trigger = findTriggerNode(graph.nodes);
  if (!trigger) {
    return graph.nodes.find((node) => nodeHasDefaultOutput(node.kind))?.id || null;
  }

  let current: WorkflowNode | null = trigger;
  let previous: WorkflowNode | null = null;
  const visited = new Set<string>();

  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    const nextEdge = graph.edges.find((edge) => edge.source === current!.id && isDefaultPathEdge(edge));
    if (!nextEdge) {
      if (current.kind === "exit") {
        return previous && nodeHasDefaultOutput(previous.kind) ? previous.id : null;
      }
      return nodeHasDefaultOutput(current.kind) ? current.id : previous?.id || null;
    }

    const nextNode = nodeById.get(nextEdge.target) || null;
    if (!nextNode) {
      return nodeHasDefaultOutput(current.kind) ? current.id : previous?.id || null;
    }

    previous = current;
    current = nextNode;
  }

  return previous && nodeHasDefaultOutput(previous.kind) ? previous.id : null;
};

const pickDropSourceNodeId = (graph: WorkflowGraph, position: { x: number; y: number }) => {
  const candidates = graph.nodes.filter((node) => nodeHasDefaultOutput(node.kind));
  if (!candidates.length) return null;

  let bestNode = candidates[0];
  let bestScore = Number.POSITIVE_INFINITY;

  candidates.forEach((node) => {
    const score = Math.abs(node.position.y - position.y) + Math.abs(node.position.x - position.x) * 0.35;
    if (score < bestScore) {
      bestScore = score;
      bestNode = node;
    }
  });

  return bestNode.id;
};

const buildLinearInsertGraph = (graph: WorkflowGraph, newNode: WorkflowNode, preferredSourceId?: string | null): WorkflowGraph => {
  const sourceId = findLinearInsertSource(graph, preferredSourceId);
  const nodes = [...graph.nodes, newNode];
  const nodeById = new Map(nodes.map((node) => [node.id, node]));

  if (!sourceId || !nodeSupportsDefaultInput(newNode.kind)) {
    return {
      ...graph,
      nodes: autoLayoutGraph({
        ...graph,
        nodes,
      }),
    };
  }

  const sourceNode = nodeById.get(sourceId);
  if (!sourceNode || !nodeHasDefaultOutput(sourceNode.kind)) {
    return {
      ...graph,
      nodes: autoLayoutGraph({
        ...graph,
        nodes,
      }),
    };
  }

  const edges = [...graph.edges];
  const displacedEdgeIndex = edges.findIndex((edge) => edge.source === sourceId && isDefaultPathEdge(edge));
  let displacedTargetId: string | null = null;

  if (displacedEdgeIndex >= 0) {
    displacedTargetId = edges[displacedEdgeIndex].target;
    edges.splice(displacedEdgeIndex, 1);
  }

  edges.push({
    id: createEdgeId(sourceId, newNode.id),
    source: sourceId,
    target: newNode.id,
    sourceHandle: "out",
    targetHandle: "in",
    animated: true,
  });

  if (displacedTargetId && nodeHasDefaultOutput(newNode.kind)) {
    const displacedTarget = nodeById.get(displacedTargetId);
    if (displacedTarget && nodeSupportsDefaultInput(displacedTarget.kind)) {
      edges.push({
        id: createEdgeId(newNode.id, displacedTargetId),
        source: newNode.id,
        target: displacedTargetId,
        sourceHandle: "out",
        targetHandle: "in",
        animated: true,
      });
    }
  }

  const laidOutNodes = autoLayoutGraph({
    ...graph,
    nodes,
    edges,
  });

  return {
    ...graph,
    nodes: laidOutNodes,
    edges,
  };
};

const buildBranchInsertGraph = (
  graph: WorkflowGraph,
  newNode: WorkflowNode,
  sourceNodeId: string,
  sourceHandle: string
): WorkflowGraph => {
  const nodes = [...graph.nodes, newNode];
  const nodeById = new Map(nodes.map((node) => [node.id, node]));

  if (!nodeSupportsDefaultInput(newNode.kind)) {
    return {
      ...graph,
      nodes: autoLayoutGraph({
        ...graph,
        nodes,
      }),
    };
  }

  const sourceNode = nodeById.get(sourceNodeId);
  if (!sourceNode) {
    return {
      ...graph,
      nodes: autoLayoutGraph({
        ...graph,
        nodes,
      }),
    };
  }

  const edges = [...graph.edges];
  const displacedEdgeIndex = edges.findIndex((edge) => {
    if (edge.source !== sourceNodeId) return false;
    if (sourceHandle === "out") {
      return !edge.sourceHandle || edge.sourceHandle === "out";
    }
    return (edge.sourceHandle || "") === sourceHandle;
  });
  let displacedEdge: WorkflowEdge | null = null;

  if (displacedEdgeIndex >= 0) {
    [displacedEdge] = edges.splice(displacedEdgeIndex, 1);
  }

  const sourceToNew = makeEdgeFromConnection(
    {
      source: sourceNodeId,
      target: newNode.id,
      sourceHandle,
      targetHandle: "in",
    },
    nodes,
    edges
  );

  if (!sourceToNew.edge || sourceToNew.error) {
    if (displacedEdge) edges.push(displacedEdge);
    return {
      ...graph,
      nodes: autoLayoutGraph({
        ...graph,
        nodes,
        edges,
      }),
      edges,
    };
  }

  edges.push(sourceToNew.edge);

  if (displacedEdge?.target && nodeHasDefaultOutput(newNode.kind)) {
    const displacedTarget = nodeById.get(displacedEdge.target);
    if (displacedTarget && nodeSupportsDefaultInput(displacedTarget.kind)) {
      const reconnect = makeEdgeFromConnection(
        {
          source: newNode.id,
          target: displacedEdge.target,
          sourceHandle: "out",
          targetHandle: displacedEdge.targetHandle || "in",
        },
        nodes,
        edges
      );

      if (reconnect.edge && !reconnect.error) {
        edges.push(reconnect.edge);
      } else {
        edges.push({
          id: createEdgeId(newNode.id, displacedEdge.target),
          source: newNode.id,
          target: displacedEdge.target,
          sourceHandle: "out",
          targetHandle: displacedEdge.targetHandle || "in",
          animated: true,
        });
      }
    }
  }

  const laidOutNodes = autoLayoutGraph({
    ...graph,
    nodes,
    edges,
  });

  return {
    ...graph,
    nodes: laidOutNodes,
    edges,
  };
};

const WorkflowBuilder = ({
  workflowId,
  initialGraph,
  workflowStatus,
  dependencies,
  runtimeEvents,
  onPersist,
  onStateChange,
}: WorkflowBuilderProps) => {
  const graph = useWorkflowBuilderStore((state) => state.graph);
  const selectedNodeIds = useWorkflowBuilderStore((state) => state.selectedNodeIds);
  const selectedEdgeIds = useWorkflowBuilderStore((state) => state.selectedEdgeIds);
  const runtime = useWorkflowBuilderStore((state) => state.runtimeEvents);
  const dirty = useWorkflowBuilderStore((state) => state.dirty);
  const lastSavedAt = useWorkflowBuilderStore((state) => state.lastSavedAt);

  const setGraph = useWorkflowBuilderStore((state) => state.setGraph);
  const setRuntimeEvents = useWorkflowBuilderStore((state) => state.setRuntimeEvents);
  const markSaved = useWorkflowBuilderStore((state) => state.markSaved);
  const setSelection = useWorkflowBuilderStore((state) => state.setSelection);
  const updateNode = useWorkflowBuilderStore((state) => state.updateNode);
  const updateNodeConfig = useWorkflowBuilderStore((state) => state.updateNodeConfig);
  const replaceGraph = useWorkflowBuilderStore((state) => state.replaceGraph);
  const applyNodeChanges = useWorkflowBuilderStore((state) => state.applyNodeChanges);
  const applyEdgeChanges = useWorkflowBuilderStore((state) => state.applyEdgeChanges);
  const addEdge = useWorkflowBuilderStore((state) => state.addEdge);
  const removeSelection = useWorkflowBuilderStore((state) => state.removeSelection);
  const undo = useWorkflowBuilderStore((state) => state.undo);
  const redo = useWorkflowBuilderStore((state) => state.redo);
  const canUndo = useWorkflowBuilderStore((state) => state.canUndo);
  const canRedo = useWorkflowBuilderStore((state) => state.canRedo);
  const runSimulation = useWorkflowBuilderStore((state) => state.runSimulation);
  const clearSimulation = useWorkflowBuilderStore((state) => state.clearSimulation);

  const [overlayErrors, setOverlayErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [activeDragKind, setActiveDragKind] = useState<keyof typeof nodePluginMap | null>(null);
  const [insightsMode, setInsightsMode] = useState<"runtime" | "review">("review");
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(false);
  const [rightPanelTouched, setRightPanelTouched] = useState(false);
  const flowRef = useRef<ReactFlowInstance | null>(null);
  const mountedWorkflowId = useRef<string | null>(null);
  const onStateChangeRef = useRef(onStateChange);
  const runtimeEventsRef = useRef(runtimeEvents);

  useEffect(() => {
    onStateChangeRef.current = onStateChange;
  }, [onStateChange]);

  useEffect(() => {
    runtimeEventsRef.current = runtimeEvents;
  }, [runtimeEvents]);

  useEffect(() => {
    if (rightPanelTouched || typeof window === "undefined") return;

    const mediaQuery = window.matchMedia("(max-width: 1440px)");
    const apply = () => setRightPanelCollapsed(mediaQuery.matches);
    apply();

    const onChange = (event: MediaQueryListEvent) => {
      setRightPanelCollapsed(event.matches);
    };

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", onChange);
      return () => mediaQuery.removeEventListener("change", onChange);
    }

    mediaQuery.addListener(onChange);
    return () => mediaQuery.removeListener(onChange);
  }, [rightPanelTouched]);

  useEffect(() => {
    if (mountedWorkflowId.current === workflowId) return;
    mountedWorkflowId.current = workflowId;
    setGraph(initialGraph, { resetHistory: true, markDirty: false });
  }, [initialGraph, setGraph, workflowId]);

  const runtimeEventsSignature = useMemo(
    () => runtimeEvents.map((event) => `${event.id}:${event.createdAt}`).join("|"),
    [runtimeEvents]
  );

  useEffect(() => {
    setRuntimeEvents(runtimeEventsRef.current);
  }, [runtimeEventsSignature, setRuntimeEvents]);

  const compile = useMemo(() => compileGraphToLegacyFlow(graph), [graph]);
  const checklist = useMemo(() => buildPublishChecklist(graph), [graph]);
  const checklistPass = useMemo(() => canPublishWorkflow(graph), [graph]);

  useEffect(() => {
    onStateChangeRef.current?.({
      graph,
      compiledFlow: compile.flow,
      compileErrors: compile.errors,
      checklistPass,
    });
  }, [checklistPass, compile.errors, compile.flow, graph]);

  const onSave = useCallback(async () => {
    setSaving(true);
    try {
      await onPersist({
        graph,
        compiledFlow: compile.flow,
        compileErrors: compile.errors,
        checklistPass,
      });
      markSaved();
      setOverlayErrors(compile.errors);
    } finally {
      setSaving(false);
    }
  }, [checklistPass, compile.errors, compile.flow, graph, markSaved, onPersist]);

  useWorkflowKeyboardShortcuts({ onSave, enabled: true });
  useWorkflowAutosave({ enabled: true, onSave });

  const onConnect = useCallback(
    (connection: Connection) => {
      const result = makeEdgeFromConnection(connection, graph.nodes, graph.edges);
      if (result.error || !result.edge) {
        setOverlayErrors((prev) => [result.error || "Invalid connection", ...prev].slice(0, 4));
        toast({ title: "Invalid connection", description: result.error || "Could not connect nodes.", variant: "destructive" });
        return;
      }
      addEdge(result.edge);
      setOverlayErrors([]);
    },
    [addEdge, graph.edges, graph.nodes]
  );

  const onReconnect = useCallback(
    (oldEdge: FlowEdge, connection: Connection) => {
      const existing = graph.edges.find((edge) => edge.id === oldEdge.id);
      if (!existing) return;

      const remainingEdges = graph.edges.filter((edge) => edge.id !== oldEdge.id);
      const result = makeEdgeFromConnection(connection, graph.nodes, remainingEdges);

      if (result.error || !result.edge) {
        setOverlayErrors((prev) => [result.error || "Invalid reconnection", ...prev].slice(0, 4));
        toast({
          title: "Invalid reconnection",
          description: result.error || "Could not reconnect edge.",
          variant: "destructive",
        });
        return;
      }

      const nextEdge: WorkflowEdge = {
        ...result.edge,
        id: oldEdge.id,
      };

      replaceGraph(
        {
          ...graph,
          edges: [...remainingEdges, nextEdge],
        },
        {
          nodeIds: selectedNodeIds,
          edgeIds: [nextEdge.id],
        }
      );
      setOverlayErrors([]);
    },
    [graph, replaceGraph, selectedNodeIds]
  );

  const selectedNodeId = selectedNodeIds[0] || null;

  const handleAddNode = useCallback(
    (kind: keyof typeof nodePluginMap, options?: AddNodeOptions) => {
      const plugin = nodePluginMap[kind];
      if (!plugin) return;

      if (kind === "trigger" && graph.nodes.some((node) => node.kind === "trigger")) {
        toast({
          title: "Trigger already exists",
          description: "This workflow already has a trigger block.",
          variant: "destructive",
        });
        return;
      }

      const fallbackPosition = flowRef.current
        ? flowRef.current.screenToFlowPosition({ x: window.innerWidth * 0.45, y: window.innerHeight * 0.42 })
        : { x: 220, y: 220 };

      const nextNode = plugin.create(snapPoint(options?.position || fallbackPosition));
      const nextGraph =
        options?.sourceNodeId && options?.sourceHandle
          ? buildBranchInsertGraph(graph, nextNode, options.sourceNodeId, options.sourceHandle)
          : buildLinearInsertGraph(graph, nextNode, options?.sourceNodeId || selectedNodeId);

      replaceGraph(nextGraph, { nodeIds: [nextNode.id], edgeIds: [] });
      setOverlayErrors([]);
    },
    [graph, replaceGraph, selectedNodeId]
  );

  const onDragStart = useCallback((event: DragStartEvent) => {
    const kind = (event.active.data.current?.kind || "") as keyof typeof nodePluginMap;
    if (kind && nodePluginMap[kind]) {
      setActiveDragKind(kind);
    }
  }, []);

  const onDragCancel = useCallback(() => {
    setActiveDragKind(null);
  }, []);

  const onDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveDragKind(null);
      const overId = String(event.over?.id || "");
      const sourceDropTarget = parseSourceDropTargetId(overId);

      const kind = (event.active.data.current?.kind || "") as keyof typeof nodePluginMap;
      if (!kind || !nodePluginMap[kind]) return;

      const translated = event.active.rect.current.translated;
      const activator = event.activatorEvent;

      const fallbackX =
        activator instanceof MouseEvent || activator instanceof PointerEvent ? activator.clientX : window.innerWidth * 0.45;
      const fallbackY =
        activator instanceof MouseEvent || activator instanceof PointerEvent ? activator.clientY : window.innerHeight * 0.42;

      const clientX = translated ? translated.left + translated.width / 2 : fallbackX;
      const clientY = translated ? translated.top + translated.height / 2 : fallbackY;

      const canvasElement = document.getElementById("workflow-canvas-dropzone");
      const canvasRect = canvasElement?.getBoundingClientRect();
      const insideCanvas =
        Boolean(sourceDropTarget) ||
        overId === "workflow-canvas-dropzone" ||
        (canvasRect
          ? clientX >= canvasRect.left &&
            clientX <= canvasRect.right &&
            clientY >= canvasRect.top &&
            clientY <= canvasRect.bottom
          : false);

      if (!insideCanvas) return;

      const position = flowRef.current ? flowRef.current.screenToFlowPosition({ x: clientX, y: clientY }) : undefined;
      const sourceNodeId = sourceDropTarget
        ? sourceDropTarget.nodeId
        : position
          ? selectedNodeId || pickDropSourceNodeId(graph, position)
          : selectedNodeId || null;
      const sourceHandle = sourceDropTarget ? sourceDropTarget.handleId : null;

      handleAddNode(kind, { position, sourceNodeId, sourceHandle });
    },
    [graph, handleAddNode, selectedNodeId]
  );

  const selectedNode = useMemo(
    () => (selectedNodeId ? graph.nodes.find((node) => node.id === selectedNodeId) || null : null),
    [graph.nodes, selectedNodeId]
  );

  const handleSelectionChange = useCallback(
    (params: { nodes: Array<{ id: string }>; edges: Array<{ id: string }> }) => {
      setSelection(
        params.nodes.map((node) => node.id),
        params.edges.map((edge) => edge.id)
      );
    },
    [setSelection]
  );

  const handleInspectorTitleChange = useCallback(
    (value: string) => {
      if (!selectedNodeId) return;
      updateNode(selectedNodeId, { title: value });
    },
    [selectedNodeId, updateNode]
  );

  const handleInspectorStatusChange = useCallback(
    (value: WorkflowGraph["nodes"][number]["status"]) => {
      if (!selectedNodeId) return;
      updateNode(selectedNodeId, { status: value });
    },
    [selectedNodeId, updateNode]
  );

  const handleInspectorConfigChange = useCallback(
    (patch: Record<string, unknown>) => {
      if (!selectedNodeId) return;
      updateNodeConfig(selectedNodeId, patch);
    },
    [selectedNodeId, updateNodeConfig]
  );

  const handleInspectorTestSend = useCallback(() => {
    toast({ title: "Test send queued", description: "Sample test send endpoint can be wired from this hook." });
  }, []);

  const allErrors = useMemo(
    () => Array.from(new Set([...compile.errors, ...overlayErrors])),
    [compile.errors, overlayErrors]
  );
  const hasSelection = selectedNodeIds.length > 0 || selectedEdgeIds.length > 0;
  const dragPlugin = activeDragKind ? nodePluginMap[activeDragKind] : null;

  const dragOverlay = (
    <DragOverlay zIndex={5000} dropAnimation={null}>
      {dragPlugin ? (
        <div className="pointer-events-none w-[240px] rounded-xl border border-slate-300 bg-white/95 p-3 shadow-xl">
          <div className="flex items-center gap-2">
            <span className={`rounded-lg border bg-gradient-to-br p-2 ${dragPlugin.toneClass}`}>
              <dragPlugin.icon className="h-4 w-4 text-slate-700" />
            </span>
            <p className="text-sm font-semibold text-slate-900">{dragPlugin.title}</p>
          </div>
          <p className="mt-2 text-xs text-slate-600">{dragPlugin.description}</p>
        </div>
      ) : null}
    </DragOverlay>
  );

  return (
    <DndContext onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={onDragCancel}>
      <div className="space-y-3">
        <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-2">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={workflowStatus === "live" ? "default" : "secondary"}>
                {workflowStatus === "live" ? "Live mode" : workflowStatus}
              </Badge>
              <Badge variant="secondary">{dirty ? "Unsaved changes" : "Saved"}</Badge>
              {lastSavedAt ? (
                <span className="text-xs text-slate-500">Last saved {new Date(lastSavedAt).toLocaleTimeString()}</span>
              ) : null}
              {compile.errors.length > 0 ? (
                <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-700">
                  {compile.errors.length} compatibility issue(s)
                </Badge>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  replaceGraph(
                    {
                      ...graph,
                      nodes: autoLayoutGraph(graph),
                    },
                    {
                      nodeIds: selectedNodeIds,
                      edgeIds: selectedEdgeIds,
                    }
                  )
                }
              >
                Auto layout
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => runSimulation()}>
                Simulate
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => clearSimulation()}>
                Clear simulation
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={undo} disabled={!canUndo()}>
                Undo
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={redo} disabled={!canRedo()}>
                Redo
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={removeSelection} disabled={!hasSelection}>
                Remove selected
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  setRightPanelTouched(true);
                  setRightPanelCollapsed((value) => !value);
                }}
              >
                {rightPanelCollapsed ? "Show panels" : "Focus canvas"}
              </Button>
              <Button type="button" size="sm" onClick={() => void onSave()} disabled={saving}>
                {saving ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>

          <div
            className={`mt-2 grid h-[calc(100vh-280px)] min-h-[720px] gap-2 ${
              rightPanelCollapsed ? "grid-cols-1" : "grid-cols-[minmax(0,1fr)_320px]"
            }`}
          >
            <div className="relative min-h-0 rounded-xl border border-slate-200 bg-white p-2">
              {rightPanelCollapsed ? (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="absolute right-3 top-3 z-20"
                  onClick={() => {
                    setRightPanelTouched(true);
                    setRightPanelCollapsed(false);
                  }}
                >
                  Show panels
                </Button>
              ) : null}
              <WorkflowCanvas
                nodes={graph.nodes}
                edges={graph.edges}
                selectedNodeIds={selectedNodeIds}
                selectedEdgeIds={selectedEdgeIds}
                errors={allErrors}
                onInit={(instance) => {
                  flowRef.current = instance;
                }}
                onConnect={onConnect}
                onReconnect={onReconnect}
                onNodesChange={applyNodeChanges}
                onEdgesChange={applyEdgeChanges}
                onSelectionChange={handleSelectionChange}
              />
            </div>

            {!rightPanelCollapsed ? (
              <aside className="grid min-h-0 grid-rows-[300px_minmax(0,1fr)_240px] gap-2">
                <WorkflowBlockLibrary
                  onQuickAdd={(kind) => handleAddNode(kind, { sourceNodeId: selectedNodeId })}
                />
                <WorkflowInspector
                  node={selectedNode}
                  dependencies={dependencies}
                  onChangeTitle={handleInspectorTitleChange}
                  onChangeStatus={handleInspectorStatusChange}
                  onPatchConfig={handleInspectorConfigChange}
                  onTestSend={handleInspectorTestSend}
                />
                <section className="min-h-0 rounded-xl border border-slate-200 bg-white p-2">
                  <div className="mb-2 grid grid-cols-2 gap-1 rounded-md bg-slate-100 p-1">
                    <button
                      type="button"
                      onClick={() => setInsightsMode("review")}
                      className={`h-8 rounded text-xs font-medium transition-colors ${
                        insightsMode === "review" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"
                      }`}
                    >
                      Review
                    </button>
                    <button
                      type="button"
                      onClick={() => setInsightsMode("runtime")}
                      className={`h-8 rounded text-xs font-medium transition-colors ${
                        insightsMode === "runtime" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"
                      }`}
                    >
                      Runtime
                    </button>
                  </div>
                  <div className="h-[calc(100%-42px)]">
                    {insightsMode === "review" ? (
                      <WorkflowReviewChecklist items={checklist} compact />
                    ) : (
                      <WorkflowRuntimePanel events={runtime} compact />
                    )}
                  </div>
                </section>
              </aside>
            ) : null}
          </div>
        </div>
      </div>
      {typeof document === "undefined" ? dragOverlay : createPortal(dragOverlay, document.body)}
    </DndContext>
  );
};

export default WorkflowBuilder;

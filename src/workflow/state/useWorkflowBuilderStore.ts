import { create } from "zustand";
import type { EdgeChange, NodeChange } from "@xyflow/react";
import type {
  WorkflowClipboard,
  WorkflowEdge,
  WorkflowGraph,
  WorkflowNode,
  WorkflowRuntimeEvent,
  WorkflowSimulationResult,
} from "@/workflow/types/schema";
import type { SimulationContext } from "@/workflow/utils/simulation";
import { createNodeId } from "@/workflow/utils/id";
import { simulateWorkflow } from "@/workflow/utils/simulation";

interface HistorySnapshot {
  graph: WorkflowGraph;
  selectedNodeIds: string[];
  selectedEdgeIds: string[];
}

interface WorkflowBuilderState {
  graph: WorkflowGraph;
  selectedNodeIds: string[];
  selectedEdgeIds: string[];
  clipboard: WorkflowClipboard | null;
  dirty: boolean;
  lastSavedAt: string | null;
  runtimeEvents: WorkflowRuntimeEvent[];
  simulation: WorkflowSimulationResult | null;
  historyPast: HistorySnapshot[];
  historyFuture: HistorySnapshot[];
  revision: number;
  setGraph: (graph: WorkflowGraph, options?: { resetHistory?: boolean; markDirty?: boolean }) => void;
  replaceGraph: (
    graph: WorkflowGraph,
    options?: {
      nodeIds?: string[];
      edgeIds?: string[];
    }
  ) => void;
  updateGraphMeta: (patch: Partial<Pick<WorkflowGraph, "name" | "status" | "version">>) => void;
  setRuntimeEvents: (events: WorkflowRuntimeEvent[]) => void;
  markSaved: () => void;
  setSelection: (nodeIds: string[], edgeIds: string[]) => void;
  updateNode: (nodeId: string, patch: Partial<WorkflowNode>) => void;
  updateNodeConfig: (nodeId: string, patch: Record<string, unknown>) => void;
  setNodes: (nodes: WorkflowNode[], options?: { markDirty?: boolean }) => void;
  setEdges: (edges: WorkflowEdge[], options?: { markDirty?: boolean }) => void;
  addNode: (node: WorkflowNode) => void;
  addEdge: (edge: WorkflowEdge) => void;
  removeNode: (nodeId: string) => void;
  removeEdge: (edgeId: string) => void;
  removeSelection: () => void;
  applyNodeChanges: (changes: NodeChange[]) => void;
  applyEdgeChanges: (changes: EdgeChange[]) => void;
  copySelection: () => void;
  pasteClipboard: () => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  runSimulation: (context?: SimulationContext) => WorkflowSimulationResult;
  clearSimulation: () => void;
  highlightExecutionPath: (result: WorkflowSimulationResult) => void;
  clearExecutionHighlight: () => void;
}

const deepClone = <T>(value: T): T => {
  try {
    return structuredClone(value);
  } catch {
    return JSON.parse(JSON.stringify(value));
  }
};

const equalStringCollection = (a: string[], b: string[]) => {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  const left = new Set(a);
  if (left.size !== b.length) return false;
  for (let i = 0; i < b.length; i += 1) {
    if (!left.has(b[i])) return false;
  }
  return true;
};

const snapshotFromState = (state: WorkflowBuilderState): HistorySnapshot => ({
  graph: deepClone(state.graph),
  selectedNodeIds: [...state.selectedNodeIds],
  selectedEdgeIds: [...state.selectedEdgeIds],
});

const withHistory = (
  set: (fn: (state: WorkflowBuilderState) => Partial<WorkflowBuilderState>) => void,
  updater: (state: WorkflowBuilderState) => Partial<WorkflowBuilderState>
) => {
  set((state) => {
    const current = snapshotFromState(state);
    const patch = updater(state);
    return {
      ...patch,
      historyPast: [...state.historyPast.slice(-99), current],
      historyFuture: [],
      revision: state.revision + 1,
      dirty: patch.dirty ?? true,
    };
  });
};

const initialGraph: WorkflowGraph = {
  id: "wf_initial",
  name: "Untitled workflow",
  status: "draft",
  version: 1,
  nodes: [],
  edges: [],
  settings: {},
  runtimeMap: {},
};

export const useWorkflowBuilderStore = create<WorkflowBuilderState>((set, get) => ({
  graph: initialGraph,
  selectedNodeIds: [],
  selectedEdgeIds: [],
  clipboard: null,
  dirty: false,
  lastSavedAt: null,
  runtimeEvents: [],
  simulation: null,
  historyPast: [],
  historyFuture: [],
  revision: 0,

  setGraph: (graph, options) => {
    const resetHistory = options?.resetHistory !== false;
    const markDirty = options?.markDirty ?? false;

    set((state) => ({
      graph: deepClone(graph),
      selectedNodeIds: [],
      selectedEdgeIds: [],
      dirty: markDirty,
      simulation: null,
      runtimeEvents: [],
      historyPast: resetHistory ? [] : state.historyPast,
      historyFuture: resetHistory ? [] : state.historyFuture,
      revision: state.revision + 1,
    }));
  },

  replaceGraph: (graph, options) =>
    withHistory(set, () => ({
      graph: deepClone(graph),
      selectedNodeIds: [...(options?.nodeIds || [])],
      selectedEdgeIds: [...(options?.edgeIds || [])],
    })),

  updateGraphMeta: (patch) =>
    withHistory(set, (state) => ({
      graph: {
        ...state.graph,
        ...patch,
      },
    })),

  setRuntimeEvents: (events) =>
    set((state) => {
      if (state.runtimeEvents === events) return state;
      if (
        state.runtimeEvents.length === events.length &&
        state.runtimeEvents.every((event, index) => event.id === events[index]?.id)
      ) {
        return state;
      }
      return {
        runtimeEvents: events,
      };
    }),

  markSaved: () => set(() => ({ dirty: false, lastSavedAt: new Date().toISOString() })),

  setSelection: (nodeIds, edgeIds) =>
    set((state) => {
      if (
        equalStringCollection(state.selectedNodeIds, nodeIds) &&
        equalStringCollection(state.selectedEdgeIds, edgeIds)
      ) {
        return state;
      }
      return {
        selectedNodeIds: [...nodeIds],
        selectedEdgeIds: [...edgeIds],
      };
    }),

  updateNode: (nodeId, patch) =>
    withHistory(set, (state) => ({
      graph: {
        ...state.graph,
        nodes: state.graph.nodes.map((node) =>
          node.id === nodeId
            ? {
                ...node,
                ...patch,
              }
            : node
        ),
      },
    })),

  updateNodeConfig: (nodeId, patch) =>
    withHistory(set, (state) => ({
      graph: {
        ...state.graph,
        nodes: state.graph.nodes.map((node) =>
          node.id === nodeId
            ? {
                ...node,
                config: {
                  ...(node.config as Record<string, unknown>),
                  ...patch,
                } as WorkflowNode["config"],
              }
            : node
        ),
      },
    })),

  setNodes: (nodes, options) =>
    set((state) => ({
      graph: {
        ...state.graph,
        nodes,
      },
      revision: state.revision + 1,
      dirty: options?.markDirty ?? true,
    })),

  setEdges: (edges, options) =>
    set((state) => ({
      graph: {
        ...state.graph,
        edges,
      },
      revision: state.revision + 1,
      dirty: options?.markDirty ?? true,
    })),

  addNode: (node) =>
    withHistory(set, (state) => ({
      graph: {
        ...state.graph,
        nodes: [...state.graph.nodes, node],
      },
      selectedNodeIds: [node.id],
      selectedEdgeIds: [],
    })),

  addEdge: (edge) =>
    withHistory(set, (state) => ({
      graph: {
        ...state.graph,
        edges: [...state.graph.edges, edge],
      },
      selectedEdgeIds: [edge.id],
      selectedNodeIds: [],
    })),

  removeNode: (nodeId) =>
    withHistory(set, (state) => ({
      graph: {
        ...state.graph,
        nodes: state.graph.nodes.filter((node) => node.id !== nodeId),
        edges: state.graph.edges.filter((edge) => edge.source !== nodeId && edge.target !== nodeId),
      },
      selectedNodeIds: state.selectedNodeIds.filter((id) => id !== nodeId),
    })),

  removeEdge: (edgeId) =>
    withHistory(set, (state) => ({
      graph: {
        ...state.graph,
        edges: state.graph.edges.filter((edge) => edge.id !== edgeId),
      },
      selectedEdgeIds: state.selectedEdgeIds.filter((id) => id !== edgeId),
    })),

  removeSelection: () =>
    withHistory(set, (state) => {
      const selectedNodeSet = new Set(state.selectedNodeIds);
      const selectedEdgeSet = new Set(state.selectedEdgeIds);

      return {
        graph: {
          ...state.graph,
          nodes: state.graph.nodes.filter((node) => !selectedNodeSet.has(node.id)),
          edges: state.graph.edges.filter(
            (edge) =>
              !selectedEdgeSet.has(edge.id) &&
              !selectedNodeSet.has(edge.source) &&
              !selectedNodeSet.has(edge.target)
          ),
        },
        selectedNodeIds: [],
        selectedEdgeIds: [],
      };
    }),

  applyNodeChanges: (changes) => {
    if (!changes.length) return;

    const actionable = changes.filter(
      (change) => change.type === "remove" || (change.type === "position" && Boolean(change.position))
    );
    if (!actionable.length) return;

    const shouldTrack = actionable.some((change) => change.type === "remove");
    const apply = (state: WorkflowBuilderState) => {
      let nodes = [...state.graph.nodes];
      let mutated = false;

      actionable.forEach((change) => {
        if (change.type === "remove") {
          const nextNodes = nodes.filter((node) => node.id !== change.id);
          if (nextNodes.length !== nodes.length) {
            nodes = nextNodes;
            mutated = true;
          }
          return;
        }

        if (change.type === "position" && change.position) {
          const nextX = change.position.x;
          const nextY = change.position.y;
          nodes = nodes.map((node) => {
            if (node.id !== change.id) return node;
            if (node.position.x === nextX && node.position.y === nextY) return node;
            mutated = true;
            return {
              ...node,
              position: {
                x: nextX,
                y: nextY,
              },
            };
          });
        }
      });

      if (!mutated) return null;

      const nodeSet = new Set(nodes.map((node) => node.id));
      const edges = state.graph.edges.filter((edge) => nodeSet.has(edge.source) && nodeSet.has(edge.target));

      return {
        graph: {
          ...state.graph,
          nodes,
          edges,
        },
      };
    };

    if (shouldTrack) {
      const patch = apply(get());
      if (!patch) return;
      withHistory(set, () => patch);
      return;
    }

    set((state) => {
      const patch = apply(state);
      if (!patch) return state;
      return {
        ...patch,
        dirty: true,
        revision: state.revision + 1,
      };
    });
  },

  applyEdgeChanges: (changes) => {
    if (!changes.length) return;

    const actionable = changes.filter((change) => change.type === "remove");
    if (!actionable.length) return;

    const shouldTrack = actionable.some((change) => change.type === "remove");
    const apply = (state: WorkflowBuilderState) => {
      let edges = [...state.graph.edges];
      let mutated = false;

      actionable.forEach((change) => {
        if (change.type === "remove") {
          const nextEdges = edges.filter((edge) => edge.id !== change.id);
          if (nextEdges.length !== edges.length) {
            edges = nextEdges;
            mutated = true;
          }
        }
      });

      if (!mutated) return null;

      return {
        graph: {
          ...state.graph,
          edges,
        },
      };
    };

    if (shouldTrack) {
      const patch = apply(get());
      if (!patch) return;
      withHistory(set, () => patch);
      return;
    }

    set((state) => {
      const patch = apply(state);
      if (!patch) return state;
      return {
        ...patch,
        dirty: true,
        revision: state.revision + 1,
      };
    });
  },

  copySelection: () => {
    const state = get();
    const selectedNodeSet = new Set(state.selectedNodeIds);
    const nodes = state.graph.nodes.filter((node) => selectedNodeSet.has(node.id));
    const nodeSet = new Set(nodes.map((node) => node.id));
    const edges = state.graph.edges.filter((edge) => nodeSet.has(edge.source) && nodeSet.has(edge.target));

    if (!nodes.length) return;

    set(() => ({
      clipboard: {
        nodes: deepClone(nodes),
        edges: deepClone(edges),
      },
    }));
  },

  pasteClipboard: () => {
    const state = get();
    if (!state.clipboard) return;

    withHistory(set, (prev) => {
      const idMap = new Map<string, string>();
      const pastedNodes: WorkflowNode[] = state.clipboard!.nodes.map((node) => {
        const id = createNodeId(node.kind);
        idMap.set(node.id, id);
        return {
          ...deepClone(node),
          id,
          position: {
            x: node.position.x + 44,
            y: node.position.y + 44,
          },
        };
      });

      const pastedEdges: WorkflowEdge[] = state.clipboard!.edges
        .map((edge) => {
          const source = idMap.get(edge.source);
          const target = idMap.get(edge.target);
          if (!source || !target) return null;
          return {
            ...deepClone(edge),
            id: `${source}_${target}_${Math.random().toString(36).slice(2, 7)}`,
            source,
            target,
          };
        })
        .filter(Boolean) as WorkflowEdge[];

      return {
        graph: {
          ...prev.graph,
          nodes: [...prev.graph.nodes, ...pastedNodes],
          edges: [...prev.graph.edges, ...pastedEdges],
        },
        selectedNodeIds: pastedNodes.map((node) => node.id),
        selectedEdgeIds: pastedEdges.map((edge) => edge.id),
      };
    });
  },

  undo: () => {
    const state = get();
    if (!state.historyPast.length) return;

    const previous = state.historyPast[state.historyPast.length - 1];
    const current = snapshotFromState(state);

    set(() => ({
      graph: deepClone(previous.graph),
      selectedNodeIds: [...previous.selectedNodeIds],
      selectedEdgeIds: [...previous.selectedEdgeIds],
      historyPast: state.historyPast.slice(0, -1),
      historyFuture: [...state.historyFuture, current],
      dirty: true,
      revision: state.revision + 1,
    }));
  },

  redo: () => {
    const state = get();
    if (!state.historyFuture.length) return;

    const next = state.historyFuture[state.historyFuture.length - 1];
    const current = snapshotFromState(state);

    set(() => ({
      graph: deepClone(next.graph),
      selectedNodeIds: [...next.selectedNodeIds],
      selectedEdgeIds: [...next.selectedEdgeIds],
      historyPast: [...state.historyPast, current],
      historyFuture: state.historyFuture.slice(0, -1),
      dirty: true,
      revision: state.revision + 1,
    }));
  },

  canUndo: () => get().historyPast.length > 0,
  canRedo: () => get().historyFuture.length > 0,

  runSimulation: (context) => {
    const state = get();
    const result = simulateWorkflow(state.graph, context);

    set(() => ({
      simulation: result,
      runtimeEvents: result.events,
    }));

    get().highlightExecutionPath(result);

    return result;
  },

  clearSimulation: () =>
    set((state) => ({
      simulation: null,
      runtimeEvents: [],
      graph: {
        ...state.graph,
        edges: state.graph.edges.map((edge) => ({
          ...edge,
          data: {
            ...(edge.data || {}),
            highlighted: false,
          },
        })),
      },
    })),

  highlightExecutionPath: (result) =>
    set((state) => ({
      graph: {
        ...state.graph,
        edges: state.graph.edges.map((edge) => ({
          ...edge,
          data: {
            ...(edge.data || {}),
            highlighted: result.visitedEdgeIds.includes(edge.id),
          },
        })),
      },
    })),

  clearExecutionHighlight: () =>
    set((state) => ({
      graph: {
        ...state.graph,
        edges: state.graph.edges.map((edge) => ({
          ...edge,
          data: {
            ...(edge.data || {}),
            highlighted: false,
          },
        })),
      },
    })),
}));

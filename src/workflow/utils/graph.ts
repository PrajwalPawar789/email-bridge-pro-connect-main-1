import type { Connection } from "@xyflow/react";
import type {
  WorkflowEdge,
  WorkflowGraph,
  WorkflowNode,
  WorkflowNodeKind,
  WorkflowNodeStatus,
} from "@/workflow/types/schema";
import { createEdgeId } from "@/workflow/utils/id";
import { createStarterGraph } from "@/workflow/utils/defaults";
import {
  getConditionBranchLabel,
  isConditionBranchHandle,
  normalizeConditionConfig,
} from "@/workflow/utils/condition";

const toObject = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
};

const toNodeStatus = (value: unknown): WorkflowNodeStatus => {
  const safe = String(value || "draft").toLowerCase();
  if (safe === "live" || safe === "error") return safe;
  return "draft";
};

const toNodeKind = (value: unknown): WorkflowNodeKind => {
  const safe = String(value || "").toLowerCase();
  if (
    safe === "trigger" ||
    safe === "send_email" ||
    safe === "wait" ||
    safe === "condition" ||
    safe === "split" ||
    safe === "webhook" ||
    safe === "exit"
  ) {
    return safe;
  }
  return "wait";
};

export const normalizeGraph = (value: unknown, fallbackName = "Untitled workflow"): WorkflowGraph => {
  const base = createStarterGraph(fallbackName);
  const raw = toObject(value);

  const rawNodes = Array.isArray(raw.nodes) ? raw.nodes : [];
  const rawEdges = Array.isArray(raw.edges) ? raw.edges : [];

  if (!rawNodes.length) return base;

  const nodes: WorkflowNode[] = rawNodes.map((item, index) => {
    const row = toObject(item);
    const kind = toNodeKind(row.kind);
    const rawConfig = toObject(row.config);
    return {
      id: String(row.id || `node_${index + 1}`),
      kind,
      title: String(row.title || kind.replace("_", " ")),
      position: {
        x: Number(toObject(row.position).x ?? index * 280),
        y: Number(toObject(row.position).y ?? 120),
      },
      status: toNodeStatus(row.status),
      config:
        kind === "condition"
          ? (normalizeConditionConfig(rawConfig) as WorkflowNode["config"])
          : (rawConfig as WorkflowNode["config"]),
      meta: toObject(row.meta) as WorkflowNode["meta"],
    };
  });

  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const nodeIdSet = new Set(nodes.map((n) => n.id));

  const edges: WorkflowEdge[] = rawEdges
    .map((item) => {
      const row = toObject(item);
      const rawData = toObject(row.data) as WorkflowEdge["data"];
      let sourceHandle = row.sourceHandle ? String(row.sourceHandle) : undefined;
      let branch = typeof rawData.branch === "string" ? rawData.branch : undefined;

      const sourceNode = nodeById.get(String(row.source || ""));
      if (sourceNode?.kind === "condition") {
        if (sourceHandle === "yes") sourceHandle = "if";
        if (sourceHandle === "no") sourceHandle = "else";
        if (branch === "yes") branch = "if";
        if (branch === "no") branch = "else";
      }

      const rawLabel = String(row.label || "").trim();
      const shouldRemapLegacyConditionLabel =
        sourceNode?.kind === "condition" &&
        (rawLabel.toLowerCase() === "yes" || rawLabel.toLowerCase() === "no");
      const label =
        sourceNode?.kind === "condition" && sourceHandle && (rawLabel.length === 0 || shouldRemapLegacyConditionLabel)
          ? getConditionBranchLabel(sourceNode.config, sourceHandle)
          : rawLabel || undefined;

      return {
        id: String(row.id || createEdgeId(String(row.source || "src"), String(row.target || "dst"))),
        source: String(row.source || ""),
        target: String(row.target || ""),
        sourceHandle,
        targetHandle: row.targetHandle ? String(row.targetHandle) : undefined,
        label,
        animated: row.animated !== false,
        data: {
          ...rawData,
          branch,
        },
      };
    })
    .filter((edge) => nodeIdSet.has(edge.source) && nodeIdSet.has(edge.target));

  return {
    id: String(raw.id || base.id),
    name: String(raw.name || fallbackName),
    status: (String(raw.status || "draft") as WorkflowGraph["status"]) || "draft",
    version: Number(raw.version || 1),
    nodes,
    edges,
    settings: toObject(raw.settings),
    runtimeMap: toObject(raw.runtimeMap),
  };
};

export const getNodeById = (nodes: WorkflowNode[], id: string) => nodes.find((node) => node.id === id) || null;

export const getOutgoingEdges = (edges: WorkflowEdge[], sourceId: string) => edges.filter((edge) => edge.source === sourceId);

export const getIncomingEdges = (edges: WorkflowEdge[], targetId: string) => edges.filter((edge) => edge.target === targetId);

const hasPath = (
  edges: WorkflowEdge[],
  startNodeId: string,
  targetNodeId: string,
  visited: Set<string> = new Set()
): boolean => {
  if (startNodeId === targetNodeId) return true;
  if (visited.has(startNodeId)) return false;
  visited.add(startNodeId);

  for (const edge of edges) {
    if (edge.source !== startNodeId) continue;
    if (hasPath(edges, edge.target, targetNodeId, visited)) {
      return true;
    }
  }
  return false;
};

export const createsCycle = (edges: WorkflowEdge[], sourceId: string, targetId: string) => {
  const nextEdges = [...edges, { id: "tmp", source: sourceId, target: targetId }];
  return hasPath(nextEdges, targetId, sourceId);
};

const handleLabel = (sourceNode: WorkflowNode, sourceHandle?: string | null) => {
  if (sourceNode.kind === "condition") {
    if (!sourceHandle) return undefined;
    return getConditionBranchLabel(sourceNode.config, sourceHandle);
  }
  if (sourceNode.kind === "split") {
    if (sourceHandle === "a") return "Variant A";
    if (sourceHandle === "b") return "Variant B";
  }
  return undefined;
};

export const makeEdgeFromConnection = (
  connection: Connection,
  nodes: WorkflowNode[],
  edges: WorkflowEdge[]
): { edge?: WorkflowEdge; error?: string } => {
  if (!connection.source || !connection.target) {
    return { error: "Connection requires source and target." };
  }

  const sourceNode = getNodeById(nodes, connection.source);
  const targetNode = getNodeById(nodes, connection.target);

  if (!sourceNode || !targetNode) {
    return { error: "Connection endpoint no longer exists." };
  }

  if (sourceNode.kind === "exit") {
    return { error: "Exit nodes cannot have outgoing connections." };
  }
  if (targetNode.kind === "trigger") {
    return { error: "Trigger nodes cannot receive incoming connections." };
  }
  if (connection.source === connection.target) {
    return { error: "Self loops are not allowed." };
  }

  const duplicate = edges.some(
    (edge) =>
      edge.source === connection.source &&
      edge.target === connection.target &&
      (edge.sourceHandle || "") === (connection.sourceHandle || "")
  );
  if (duplicate) {
    return { error: "This connection already exists." };
  }

  if (createsCycle(edges, connection.source, connection.target)) {
    return { error: "This connection would create a loop." };
  }

  if (sourceNode.kind === "condition") {
    const sourceHandle = connection.sourceHandle || "";
    if (!isConditionBranchHandle(sourceNode.config, sourceHandle)) {
      return { error: "Condition blocks must connect from If / Else If / Else outputs." };
    }
    const alreadyUsed = edges.some(
      (edge) => edge.source === connection.source && (edge.sourceHandle || "") === sourceHandle
    );
    if (alreadyUsed) {
      const label = getConditionBranchLabel(sourceNode.config, sourceHandle) || sourceHandle;
      return { error: `Condition branch "${label}" is already connected.` };
    }
  }

  if (sourceNode.kind === "split") {
    const sourceHandle = connection.sourceHandle || "";
    if (sourceHandle !== "a" && sourceHandle !== "b") {
      return { error: "Split blocks must use Variant A/B outputs." };
    }
    const alreadyUsed = edges.some(
      (edge) => edge.source === connection.source && (edge.sourceHandle || "") === sourceHandle
    );
    if (alreadyUsed) {
      return { error: `Split ${sourceHandle.toUpperCase()} branch already connected.` };
    }
  }

  const incoming = edges.filter((edge) => edge.target === connection.target);
  if (targetNode.kind !== "exit" && incoming.length >= 1) {
    return { error: "Only one incoming edge is allowed per node." };
  }

  const label = handleLabel(sourceNode, connection.sourceHandle);

  return {
    edge: {
      id: createEdgeId(connection.source, connection.target),
      source: connection.source,
      target: connection.target,
      sourceHandle: connection.sourceHandle || undefined,
      targetHandle: connection.targetHandle || undefined,
      label,
      animated: true,
      data: {
        highlighted: false,
        branch: connection.sourceHandle || undefined,
      },
    },
  };
};

export const isValidConnection = (
  connection: Connection,
  nodes: WorkflowNode[],
  edges: WorkflowEdge[]
) => !makeEdgeFromConnection(connection, nodes, edges).error;

export const findTriggerNode = (nodes: WorkflowNode[]) => nodes.find((node) => node.kind === "trigger") || null;

export const getNodeMap = (nodes: WorkflowNode[]) => {
  const map = new Map<string, WorkflowNode>();
  nodes.forEach((node) => map.set(node.id, node));
  return map;
};

export const sortOutgoingByBranch = (edges: WorkflowEdge[]) => {
  const rank = (handle?: string) => {
    if (handle === "if" || handle === "yes" || handle === "a") return 1;
    if (handle?.startsWith("else_if_")) {
      const index = Number(handle.split("_")[2] || 0);
      return 10 + index;
    }
    if (handle === "else" || handle === "no" || handle === "b") return 90;
    return 100;
  };

  return [...edges].sort((a, b) => rank(a.sourceHandle) - rank(b.sourceHandle));
};

export const computeReachable = (graph: WorkflowGraph) => {
  const trigger = findTriggerNode(graph.nodes);
  if (!trigger) return new Set<string>();

  const visited = new Set<string>();
  const stack = [trigger.id];

  while (stack.length) {
    const current = stack.pop() as string;
    if (visited.has(current)) continue;
    visited.add(current);

    for (const edge of graph.edges) {
      if (edge.source === current && !visited.has(edge.target)) {
        stack.push(edge.target);
      }
    }
  }

  return visited;
};

export const graphHasCycle = (graph: WorkflowGraph) => {
  const adjacency = new Map<string, string[]>();
  graph.nodes.forEach((node) => adjacency.set(node.id, []));
  graph.edges.forEach((edge) => {
    if (!adjacency.has(edge.source)) adjacency.set(edge.source, []);
    adjacency.get(edge.source)?.push(edge.target);
  });

  const visiting = new Set<string>();
  const visited = new Set<string>();

  const dfs = (nodeId: string): boolean => {
    if (visiting.has(nodeId)) return true;
    if (visited.has(nodeId)) return false;

    visiting.add(nodeId);
    for (const next of adjacency.get(nodeId) || []) {
      if (dfs(next)) return true;
    }
    visiting.delete(nodeId);
    visited.add(nodeId);
    return false;
  };

  for (const node of graph.nodes) {
    if (dfs(node.id)) return true;
  }

  return false;
};

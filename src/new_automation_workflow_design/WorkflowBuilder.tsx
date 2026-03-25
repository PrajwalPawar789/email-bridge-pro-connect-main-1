import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  ArrowDown,
  ArrowLeft,
  Clock,
  Copy,
  GitBranch,
  Loader2,
  Mail,
  MessageSquare,
  Plus,
  Save,
  Shuffle,
  Square,
  Timer,
  Trash2,
  Users,
  Zap,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import type {
  AutomationDependencyData,
  AutomationStep,
  AutomationTriggerType,
  AutomationWorkflow,
  AutomationTestEmailRequest,
} from "@/lib/automations";
import { sendAutomationTestEmail } from "@/lib/automations";
import { cn } from "@/lib/utils";
import { compileGraphToLegacyFlow, withGraphInSettings } from "@/workflow/services/workflowAdapter";
import type { WorkflowEdge, WorkflowGraph, WorkflowNode } from "@/workflow/types/schema";
import { autoLayoutGraph } from "@/workflow/utils/autoLayout";
import {
  conditionLabelForHandle,
  createDefaultConditionClause,
  createNextElseIfClause,
  getConditionBranches,
  normalizeConditionConfig,
} from "@/workflow/utils/condition";
import { createDefaultNodeConfig, createNode } from "@/workflow/utils/defaults";
import { findTriggerNode, graphHasCycle, sortOutgoingByBranch } from "@/workflow/utils/graph";
import { createEdgeId } from "@/workflow/utils/id";
import { canPublishWorkflow } from "@/workflow/utils/review";

export interface WorkflowDesignerPayload {
  graph: WorkflowGraph;
  compiledFlow: AutomationStep[];
  compileErrors: string[];
  checklistPass: boolean;
}

export interface WorkflowDesignerSaveRequest {
  workflowPatch: Partial<AutomationWorkflow>;
  payload: WorkflowDesignerPayload;
}

interface WorkflowBuilderProps {
  workflow: AutomationWorkflow;
  initialGraph: WorkflowGraph;
  dependencies: AutomationDependencyData;
  saving?: boolean;
  defaultTestRecipient?: string | null;
  onClose: () => void;
  onSave: (request: WorkflowDesignerSaveRequest) => Promise<AutomationWorkflow | null>;
}

type DesignerNodeKind = "send_email" | "wait" | "condition" | "split" | "webhook";

type AsyncState = {
  status: "idle" | "running" | "success" | "error";
  message: string;
  testedAt: string | null;
};

type SelectionState =
  | { type: "trigger" }
  | { type: "node"; nodeId: string };

type GraphAnalysis = {
  compatible: boolean;
  orderedNodeIds: string[];
  reason?: string;
};

type AddStepContext = {
  sourceNodeId: string;
  sourceHandle?: string | null;
  mode?: "branch" | "shared";
};

type DesignLayoutEntry = {
  x: number;
  y: number;
  depth: number;
  lane: number;
};

type CanvasEdge = {
  key: string;
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
};

type CanvasLabel = {
  key: string;
  label: string;
  x: number;
  y: number;
};

type CanvasLeafPlaceholder = {
  key: string;
  sourceNodeId: string;
  sourceHandle: string;
  x: number;
  label?: string;
  labelY: number;
  buttonY: number;
  endY: number;
};

type SharedInsertPlaceholder = {
  key: string;
  sourceNodeId: string;
  x: number;
  y: number;
};

const SUPPORTED_NODE_KINDS = new Set<DesignerNodeKind>([
  "send_email",
  "wait",
  "condition",
  "split",
  "webhook",
]);

const STEP_TYPE_CONFIG: Record<
  DesignerNodeKind,
  {
    label: string;
    icon: typeof Mail;
    color: string;
    bgColor: string;
  }
> = {
  send_email: {
    label: "Send Email",
    icon: Mail,
    color: "text-blue-600",
    bgColor: "bg-blue-50 border-blue-200",
  },
  wait: {
    label: "Wait / Delay",
    icon: Timer,
    color: "text-amber-600",
    bgColor: "bg-amber-50 border-amber-200",
  },
  condition: {
    label: "Condition",
    icon: GitBranch,
    color: "text-violet-600",
    bgColor: "bg-violet-50 border-violet-200",
  },
  split: {
    label: "A/B Split",
    icon: Shuffle,
    color: "text-fuchsia-600",
    bgColor: "bg-fuchsia-50 border-fuchsia-200",
  },
  webhook: {
    label: "Webhook",
    icon: MessageSquare,
    color: "text-indigo-600",
    bgColor: "bg-indigo-50 border-indigo-200",
  },
};

const STATUS_CONFIG: Record<
  AutomationWorkflow["status"],
  { label: string; color: string; dotColor: string; bgColor: string }
> = {
  live: {
    label: "Live",
    color: "text-emerald-700",
    dotColor: "bg-emerald-500",
    bgColor: "bg-emerald-50 border-emerald-200",
  },
  paused: {
    label: "Paused",
    color: "text-amber-700",
    dotColor: "bg-amber-500",
    bgColor: "bg-amber-50 border-amber-200",
  },
  draft: {
    label: "Draft",
    color: "text-slate-500",
    dotColor: "bg-slate-400",
    bgColor: "bg-slate-50 border-slate-200",
  },
  archived: {
    label: "Archived",
    color: "text-neutral-500",
    dotColor: "bg-neutral-400",
    bgColor: "bg-neutral-50 border-neutral-200",
  },
};

const TRIGGER_ICONS: Record<AutomationTriggerType, typeof Zap> = {
  custom_event: Zap,
  list_joined: Users,
  manual: Clock,
};

const TRIGGER_LABELS: Record<AutomationTriggerType, string> = {
  custom_event: "Webhook",
  list_joined: "List / Segment",
  manual: "Manual",
};

const CONDITION_RULE_OPTIONS = [
  { value: "email_replied", label: "Email replied" },
  { value: "email_opened", label: "Email opened" },
  { value: "email_clicked", label: "Email clicked" },
  { value: "email_reply_contains", label: "Reply contains" },
  { value: "user_property", label: "User property" },
  { value: "tag_exists", label: "Tag exists" },
  { value: "custom_event", label: "Custom event" },
] as const;

const CONDITION_COMPARATOR_OPTIONS = [
  { value: "contains", label: "Contains" },
  { value: "equals", label: "Equals" },
  { value: "exists", label: "Exists" },
] as const;

const WEBHOOK_LEAD_BEHAVIOR_NOTES = [
  "Only the contact in the webhook payload enters the workflow.",
  "Contacts are deduped by email inside each workflow.",
  "A matching active contact keeps the workflow moving with refreshed data.",
  "Completed, failed, or paused contacts restart from the beginning.",
  "Webhook leads are synced into your contacts for later campaigns and segmentation.",
] as const;

const STEP_CARD_WIDTH = 320;
const STEP_CARD_HEIGHT = 94;
const TRIGGER_CARD_WIDTH = 320;
const TRIGGER_CARD_HEIGHT = 76;
const END_CAP_WIDTH = 120;
const END_CAP_HEIGHT = 36;
const DESIGN_H_SPACING = 380;
const DESIGN_V_SPACING = 188;
const CANVAS_PADDING_X = 120;
const CANVAS_PADDING_Y = 36;

const deepClone = <T,>(value: T): T => {
  try {
    return structuredClone(value);
  } catch {
    return JSON.parse(JSON.stringify(value)) as T;
  }
};

const toObject = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const sanitizeEmailHtml = (value: string) =>
  String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .trim();

const renderPlainTextPreviewHtml = (value: string) => {
  if (!value) return "";

  const escaped = escapeHtml(value);
  const html = escaped
    .split(/\r?\n/)
    .map((line) => (line.trim() ? line : "&nbsp;"))
    .join("<br />");

  return `<p>${html}</p>`;
};

const looksLikeHtml = (value: string) => /<\/?[a-z][\s\S]*>/i.test(value);

const buildWebhookEndpoint = (
  workflowId: string,
  secret: string,
  eventName: string,
) => {
  const baseUrl = String(import.meta.env.VITE_SUPABASE_URL || "").trim();
  if (!baseUrl || !workflowId) return "";

  const params = new URLSearchParams({ workflowId });
  if (secret) params.set("secret", secret);
  if (eventName) params.set("event", eventName);

  return `${baseUrl.replace(/\/+$/, "")}/functions/v1/automation-webhook?${params.toString()}`;
};

const generateWebhookSecret = () => {
  const randomValue =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID().replace(/-/g, "")
      : `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  return `whsec_${randomValue.slice(0, 36)}`;
};

const getOutgoingEdges = (graph: WorkflowGraph, nodeId: string) =>
  sortOutgoingByBranch(graph.edges.filter((edge) => edge.source === nodeId));

const isDefaultOutputHandle = (handle?: string | null) =>
  !handle || handle === "out";

const edgeMatchesOutputHandle = (edge: WorkflowEdge, handle?: string | null) =>
  isDefaultOutputHandle(handle)
    ? isDefaultOutputHandle(edge.sourceHandle)
    : edge.sourceHandle === handle;

const getBranchHandles = (node: WorkflowNode) => {
  if (node.kind === "condition") {
    return getConditionBranches(node.config).map((branch) => branch.handle);
  }
  if (node.kind === "split") {
    return ["a", "b"];
  }
  return ["out"];
};

const getBranchLabel = (node: WorkflowNode, handle: string) => {
  if (node.kind === "condition") {
    return conditionLabelForHandle(handle);
  }
  if (node.kind === "split") {
    return handle === "a" ? "Variant A" : "Variant B";
  }
  return undefined;
};

const getNodeCanvasSize = (kind: WorkflowNode["kind"]) =>
  kind === "trigger"
    ? { width: TRIGGER_CARD_WIDTH, height: TRIGGER_CARD_HEIGHT }
    : { width: STEP_CARD_WIDTH, height: STEP_CARD_HEIGHT };

const laneOffsetForOutput = (
  sourceHandle: string | undefined,
  index: number,
  total: number,
) => {
  if (sourceHandle === "if" || sourceHandle === "yes" || sourceHandle === "a") return -1;
  if (sourceHandle === "else" || sourceHandle === "no" || sourceHandle === "b") return 1;
  if (total <= 1) return 0;
  if (total === 2) return index === 0 ? -1 : 1;
  return index - Math.floor(total / 2);
};

const getHandleLaneOffset = (node: WorkflowNode, handle: string) => {
  const handles = getBranchHandles(node);
  const index = handles.findIndex((candidate) => candidate === handle);
  return laneOffsetForOutput(handle, index >= 0 ? index : 0, handles.length);
};

const getOutputEdge = (
  graph: WorkflowGraph,
  sourceNodeId: string,
  sourceHandle?: string | null,
) =>
  getOutgoingEdges(graph, sourceNodeId).find((edge) =>
    edgeMatchesOutputHandle(edge, sourceHandle),
  );

const buildDesignLayout = (graph: WorkflowGraph) => {
  const trigger = findTriggerNode(graph.nodes);
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  const layout = new Map<string, DesignLayoutEntry>();

  if (!trigger) {
    graph.nodes.forEach((node, index) => {
      layout.set(node.id, {
        x: (index % 3) * DESIGN_H_SPACING,
        y: Math.floor(index / 3) * DESIGN_V_SPACING,
        depth: Math.floor(index / 3),
        lane: index % 3,
      });
    });
    return layout;
  }

  const depthById = new Map<string, number>([[trigger.id, 0]]);
  const laneSamplesById = new Map<string, number[]>([[trigger.id, [0]]]);
  const queue: Array<{ id: string; depth: number; lane: number }> = [
    { id: trigger.id, depth: 0, lane: 0 },
  ];
  const visitBudget = Math.max(graph.nodes.length * Math.max(graph.edges.length, 1) * 6, 48);
  let iterations = 0;

  while (queue.length > 0 && iterations < visitBudget) {
    const current = queue.shift() as { id: string; depth: number; lane: number };
    iterations += 1;

    const outgoing = getOutgoingEdges(graph, current.id).filter((edge) =>
      nodesById.has(edge.target),
    );

    outgoing.forEach((edge, index) => {
      const nextDepth = current.depth + 1;
      const nextLane =
        current.lane + laneOffsetForOutput(edge.sourceHandle, index, outgoing.length);
      const existingDepth = depthById.get(edge.target);

      if (typeof existingDepth !== "number" || nextDepth > existingDepth) {
        depthById.set(edge.target, nextDepth);
        laneSamplesById.set(edge.target, [nextLane]);
        queue.push({ id: edge.target, depth: nextDepth, lane: nextLane });
        return;
      }

      if (nextDepth === existingDepth) {
        const samples = laneSamplesById.get(edge.target) || [];
        if (!samples.includes(nextLane)) {
          laneSamplesById.set(edge.target, [...samples, nextLane]);
          queue.push({ id: edge.target, depth: nextDepth, lane: nextLane });
        }
      }
    });
  }

  let orphanLane = 1;

  graph.nodes.forEach((node) => {
    const depth = depthById.get(node.id);
    const laneSamples = laneSamplesById.get(node.id);

    if (typeof depth !== "number" || !laneSamples?.length) {
      layout.set(node.id, {
        x: orphanLane * DESIGN_H_SPACING,
        y: DESIGN_V_SPACING,
        depth: 1,
        lane: orphanLane,
      });
      orphanLane += 1;
      return;
    }

    const laneAverage =
      laneSamples.reduce((total, sample) => total + sample, 0) / laneSamples.length;

    layout.set(node.id, {
      x: laneAverage * DESIGN_H_SPACING,
      y: depth * DESIGN_V_SPACING,
      depth,
      lane: laneAverage,
    });
  });

  return layout;
};

const analyzeGraph = (graph: WorkflowGraph): GraphAnalysis => {
  const trigger = findTriggerNode(graph.nodes);
  if (!trigger) {
    return {
      compatible: false,
      orderedNodeIds: [],
      reason: "Missing trigger node.",
    };
  }

  const unsupported = graph.nodes.find(
    (node) =>
      node.kind !== "trigger" &&
      node.kind !== "exit" &&
      !SUPPORTED_NODE_KINDS.has(node.kind as DesignerNodeKind),
  );
  if (unsupported) {
    return {
      compatible: false,
      orderedNodeIds: [],
      reason: `Unsupported step type: ${unsupported.kind}.`,
    };
  }

  if (graphHasCycle(graph)) {
    return {
      compatible: false,
      orderedNodeIds: [],
      reason: "Loop detected in workflow graph.",
    };
  }

  const layout = buildDesignLayout(graph);
  const orderedNodeIds = graph.nodes
    .filter((node) => node.kind !== "trigger" && node.kind !== "exit")
    .sort((left, right) => {
      const leftLayout = layout.get(left.id);
      const rightLayout = layout.get(right.id);
      if (!leftLayout || !rightLayout) return left.id.localeCompare(right.id);
      if (leftLayout.depth !== rightLayout.depth) {
        return leftLayout.depth - rightLayout.depth;
      }
      if (leftLayout.lane !== rightLayout.lane) {
        return leftLayout.lane - rightLayout.lane;
      }
      return left.id.localeCompare(right.id);
    })
    .map((node) => node.id);

  return {
    compatible: true,
    orderedNodeIds,
  };
};

const getDefaultSelection = (graph: WorkflowGraph): SelectionState => {
  const analysis = analyzeGraph(graph);
  if (analysis.orderedNodeIds[0]) {
    return { type: "node", nodeId: analysis.orderedNodeIds[0] };
  }
  return { type: "trigger" };
};

const updateNode = (
  graph: WorkflowGraph,
  nodeId: string,
  updater: (node: WorkflowNode) => WorkflowNode,
) => ({
  ...graph,
  nodes: graph.nodes.map((node) => (node.id === nodeId ? updater(node) : node)),
});

const relayoutGraph = (graph: WorkflowGraph): WorkflowGraph => ({
  ...graph,
  nodes: autoLayoutGraph(graph),
});

const ensureExitNode = (graph: WorkflowGraph) => {
  const existing = graph.nodes.find((node) => node.kind === "exit");
  if (existing) return { graph, exitId: existing.id };

  const exitNode = createNode("exit", { x: 360, y: 560 });
  const nextGraph = {
    ...graph,
    nodes: [...graph.nodes, exitNode],
  };
  return {
    graph: relayoutGraph(nextGraph),
    exitId: exitNode.id,
  };
};

const buildEdgeFromSource = (
  sourceNode: WorkflowNode,
  targetId: string,
  sourceHandle: string,
): WorkflowEdge => ({
  id: createEdgeId(`${sourceNode.id}_${sourceHandle}`, targetId),
  source: sourceNode.id,
  target: targetId,
  sourceHandle,
  targetHandle: "in",
  animated: true,
  label:
    sourceNode.kind === "condition" || sourceNode.kind === "split"
      ? getBranchLabel(sourceNode, sourceHandle)
      : undefined,
  data:
    sourceNode.kind === "condition" || sourceNode.kind === "split"
      ? { branch: sourceHandle }
      : undefined,
});

const buildNewNodeOutgoingEdges = (
  newNode: WorkflowNode,
  targetId: string,
) => {
  const handles =
    newNode.kind === "condition" || newNode.kind === "split"
      ? getBranchHandles(newNode)
      : ["out"];

  return handles.map((handle) => buildEdgeFromSource(newNode, targetId, handle));
};

const resolveInsertHandle = (
  sourceNode: WorkflowNode,
  preferredHandle?: string | null,
) => {
  if (sourceNode.kind === "condition" || sourceNode.kind === "split") {
    const handles = getBranchHandles(sourceNode);
    const safeHandle = String(preferredHandle || "").trim();
    if (!handles.includes(safeHandle)) {
      throw new Error("Choose a specific branch before adding a step.");
    }
    return safeHandle;
  }

  if (sourceNode.kind === "exit") {
    throw new Error("Exit nodes cannot have outgoing steps.");
  }

  return "out";
};

const insertNodeOnHandle = (
  graph: WorkflowGraph,
  kind: DesignerNodeKind,
  sourceNodeId: string,
  sourceHandle?: string | null,
) => {
  const ensured = ensureExitNode(graph);
  const exitId = ensured.exitId;
  const nextGraph = deepClone(ensured.graph);
  const sourceNode = nextGraph.nodes.find((node) => node.id === sourceNodeId);
  if (!sourceNode) {
    throw new Error("Could not find the source step.");
  }

  const resolvedHandle = resolveInsertHandle(sourceNode, sourceHandle);
  const displacedEdge = getOutputEdge(nextGraph, sourceNodeId, resolvedHandle);
  const displacedTargetId = displacedEdge?.target || exitId;
  const newNode = createNode(kind, { x: sourceNode.position.x, y: sourceNode.position.y });

  const trimmedEdges = nextGraph.edges.filter(
    (edge) => !displacedEdge || edge.id !== displacedEdge.id,
  );

  const updatedGraph: WorkflowGraph = {
    ...nextGraph,
    nodes: [...nextGraph.nodes, newNode],
    edges: [
      ...trimmedEdges,
      buildEdgeFromSource(sourceNode, newNode.id, resolvedHandle),
      ...buildNewNodeOutgoingEdges(newNode, displacedTargetId),
    ],
  };

  return {
    graph: relayoutGraph(updatedGraph),
    nodeId: newNode.id,
  };
};

const insertSharedNodeAfterBranch = (
  graph: WorkflowGraph,
  kind: DesignerNodeKind,
  sourceNodeId: string,
) => {
  const ensured = ensureExitNode(graph);
  const exitId = ensured.exitId;
  const nextGraph = deepClone(ensured.graph);
  const sourceNode = nextGraph.nodes.find((node) => node.id === sourceNodeId);
  if (!sourceNode || (sourceNode.kind !== "condition" && sourceNode.kind !== "split")) {
    throw new Error("Shared continuation is only available on condition or split blocks.");
  }

  const branchHandles = getBranchHandles(sourceNode);
  const branchTargets = branchHandles.map(
    (handle) => getOutputEdge(nextGraph, sourceNodeId, handle)?.target || exitId,
  );
  const uniqueTargets = Array.from(new Set(branchTargets));
  const allEmptyBranches = uniqueTargets.every((targetId) => targetId === exitId);

  if (!allEmptyBranches) {
    throw new Error(
      "Add shared steps before branches diverge, or add a step on a specific branch.",
    );
  }

  const newNode = createNode(kind, { x: sourceNode.position.x, y: sourceNode.position.y });
  const trimmedEdges = nextGraph.edges.filter(
    (edge) =>
      edge.source !== sourceNodeId ||
      !branchHandles.some((handle) => edgeMatchesOutputHandle(edge, handle)),
  );

  const updatedGraph: WorkflowGraph = {
    ...nextGraph,
    nodes: [...nextGraph.nodes, newNode],
    edges: [
      ...trimmedEdges,
      ...branchHandles.map((handle) => buildEdgeFromSource(sourceNode, newNode.id, handle)),
      ...buildNewNodeOutgoingEdges(newNode, exitId),
    ],
  };

  return {
    graph: relayoutGraph(updatedGraph),
    nodeId: newNode.id,
  };
};

const syncConditionBranchEdges = (
  graph: WorkflowGraph,
  nodeId: string,
  nextConfig: WorkflowNode["config"],
) => {
  const ensured = ensureExitNode(graph);
  const exitId = ensured.exitId;
  const nextGraph = deepClone(ensured.graph);
  const node = nextGraph.nodes.find((item) => item.id === nodeId);
  if (!node || node.kind !== "condition") {
    return graph;
  }

  const normalizedConfig = normalizeConditionConfig(nextConfig);
  const updatedNode = {
    ...node,
    config: normalizedConfig as WorkflowNode["config"],
  };
  const nextHandles = getBranchHandles(updatedNode);
  const existingTargets = new Map(
    getOutgoingEdges(nextGraph, nodeId).map((edge) => [
      String(edge.sourceHandle || ""),
      edge.target,
    ]),
  );

  const nextEdges = nextGraph.edges.filter((edge) => edge.source !== nodeId);

  nextHandles.forEach((handle) => {
    nextEdges.push(
      buildEdgeFromSource(updatedNode, existingTargets.get(handle) || exitId, handle),
    );
  });

  return relayoutGraph({
    ...nextGraph,
    nodes: nextGraph.nodes.map((item) => (item.id === nodeId ? updatedNode : item)),
    edges: nextEdges,
  });
};

const appendNode = (graph: WorkflowGraph, kind: DesignerNodeKind) => {
  const trigger = findTriggerNode(graph.nodes);
  if (!trigger) {
    throw new Error("Missing trigger node.");
  }

  const analysis = analyzeGraph(graph);
  const layout = buildDesignLayout(graph);
  const actionableNodes = analysis.orderedNodeIds
    .map((nodeId) => graph.nodes.find((node) => node.id === nodeId))
    .filter(Boolean) as WorkflowNode[];
  const lastNode = actionableNodes.at(-1) || trigger;

  if (lastNode.kind === "condition" || lastNode.kind === "split") {
    const emptyHandle = getBranchHandles(lastNode).find((handle) => {
      const edge = getOutputEdge(graph, lastNode.id, handle);
      const targetNode = edge ? graph.nodes.find((node) => node.id === edge.target) : null;
      return !targetNode || targetNode.kind === "exit";
    });

    if (!emptyHandle) {
      throw new Error("Choose the branch where this step should be inserted.");
    }

    return insertNodeOnHandle(graph, kind, lastNode.id, emptyHandle);
  }

  const fallbackSource =
    actionableNodes.at(-1)?.id ||
    graph.nodes
      .filter((node) => node.kind !== "exit")
      .sort((left, right) => {
        const leftLayout = layout.get(left.id);
        const rightLayout = layout.get(right.id);
        if (!leftLayout || !rightLayout) return 0;
        return leftLayout.depth - rightLayout.depth;
      })
      .at(-1)?.id ||
    trigger.id;

  return insertNodeOnHandle(graph, kind, fallbackSource, "out");
};

const resolveCommonContinueTarget = (
  node: WorkflowNode,
  graph: WorkflowGraph,
) => {
  const nodeById = new Map(graph.nodes.map((graphNode) => [graphNode.id, graphNode]));
  const outgoing = getOutgoingEdges(graph, node.id);
  const targets = getBranchHandles(node)
    .map((handle) => outgoing.find((edge) => edge.sourceHandle === handle)?.target || null)
    .filter(Boolean) as string[];
  const unique = Array.from(
    new Set(
      targets.filter((targetId) => {
        const target = nodeById.get(targetId);
        return target && target.kind !== "exit";
      }),
    ),
  ) as string[];

  return {
    nextTargetId: unique[0] || null,
    divergent: unique.length > 1,
  };
};

const deleteNodeFromGraph = (graph: WorkflowGraph, nodeId: string) => {
  const node = graph.nodes.find((item) => item.id === nodeId);
  if (!node) return graph;

  const exitId = graph.nodes.find((item) => item.kind === "exit")?.id || null;
  const incoming = graph.edges.filter((edge) => edge.target === nodeId);
  const outgoing = getOutgoingEdges(graph, nodeId);

  if (node.kind === "condition" || node.kind === "split") {
    const resolution = resolveCommonContinueTarget(node, graph);
    const branches = outgoing.filter((edge) => edge.target !== exitId);
    if (resolution.divergent || (branches.length > 1 && !resolution.nextTargetId)) {
      throw new Error(
        node.kind === "condition"
          ? "Delete this condition in the advanced builder."
          : "Delete this split in the advanced builder.",
      );
    }
  }

  let successorId: string | null = null;

  if (node.kind === "condition" || node.kind === "split") {
    successorId = resolveCommonContinueTarget(node, graph).nextTargetId || exitId;
  } else {
    successorId = outgoing[0]?.target || exitId;
  }

  const nextEdges = graph.edges.filter(
    (edge) => edge.source !== nodeId && edge.target !== nodeId,
  );
  incoming.forEach((predecessor) => {
    if (
      !successorId ||
      predecessor.source === successorId ||
      nextEdges.some(
        (edge) =>
          edge.source === predecessor.source &&
          edge.target === successorId &&
          (edge.sourceHandle || "") === (predecessor.sourceHandle || "out"),
      )
    ) {
      return;
    }

    nextEdges.push({
      id: createEdgeId(`${predecessor.source}_${predecessor.sourceHandle || "out"}`, successorId),
      source: predecessor.source,
      target: successorId,
      sourceHandle: predecessor.sourceHandle || "out",
      targetHandle: "in",
      animated: true,
      label: predecessor.label,
      data: predecessor.data,
    });
  });

  return relayoutGraph({
    ...graph,
    nodes: graph.nodes.filter((item) => item.id !== nodeId),
    edges: nextEdges,
  });
};

const changeNodeKind = (
  graph: WorkflowGraph,
  nodeId: string,
  nextKind: DesignerNodeKind,
) => {
  const node = graph.nodes.find((item) => item.id === nodeId);
  if (!node || node.kind === nextKind) return graph;

  const nextConfig = createDefaultNodeConfig(nextKind);
  const existingEdges = graph.edges.filter((edge) => edge.source === nodeId);
  const otherEdges = graph.edges.filter((edge) => edge.source !== nodeId);
  const exitId = graph.nodes.find((item) => item.kind === "exit")?.id || null;

  let nextEdges: WorkflowEdge[] = otherEdges;

  if (nextKind === "condition") {
    const defaultTarget = existingEdges[0]?.target || exitId;
    if (defaultTarget) {
      nextEdges = [
        ...otherEdges,
        {
          id: createEdgeId(nodeId, defaultTarget),
          source: nodeId,
          target: defaultTarget,
          sourceHandle: "if",
          targetHandle: "in",
          animated: true,
          label: "If",
          data: { branch: "if" },
        },
        {
          id: createEdgeId(`${nodeId}_else`, exitId || defaultTarget),
          source: nodeId,
          target: exitId || defaultTarget,
          sourceHandle: "else",
          targetHandle: "in",
          animated: true,
          label: "Else",
          data: { branch: "else" },
        },
      ];
    }
  } else if (nextKind === "split") {
    const defaultTarget = existingEdges[0]?.target || exitId;
    if (defaultTarget) {
      nextEdges = [
        ...otherEdges,
        {
          id: createEdgeId(`${nodeId}_a`, defaultTarget),
          source: nodeId,
          target: defaultTarget,
          sourceHandle: "a",
          targetHandle: "in",
          animated: true,
          label: "Variant A",
          data: { branch: "a" },
        },
        {
          id: createEdgeId(`${nodeId}_b`, exitId || defaultTarget),
          source: nodeId,
          target: exitId || defaultTarget,
          sourceHandle: "b",
          targetHandle: "in",
          animated: true,
          label: "Variant B",
          data: { branch: "b" },
        },
      ];
    }
  } else {
    const nextTarget =
      node.kind === "condition" || node.kind === "split"
        ? resolveCommonContinueTarget(node, graph).nextTargetId || exitId
        : existingEdges[0]?.target || exitId;

    if (nextTarget) {
      nextEdges = [
        ...otherEdges,
        {
          id: createEdgeId(nodeId, nextTarget),
          source: nodeId,
          target: nextTarget,
          sourceHandle: "out",
          targetHandle: "in",
          animated: true,
        },
      ];
    }
  }

  const nextGraph = updateNode(graph, nodeId, (current) => ({
    ...current,
    kind: nextKind,
    config: nextConfig,
  })) as WorkflowGraph;

  return relayoutGraph({
    ...nextGraph,
    edges: nextEdges,
  });
};

const buildNodeDescription = (node: WorkflowNode) => {
  const config = toObject(node.config);
  if (node.kind === "send_email") {
    const subject = String(config.subject || "").trim();
    return subject || "Send personalized email";
  }

  if (node.kind === "wait") {
    const duration = String(config.duration || 1).trim();
    const unit = String(config.unit || "days").trim();
    return `Pause for ${duration} ${unit}`;
  }

  if (node.kind === "condition") {
    const normalized = normalizeConditionConfig(node.config);
    const clause = toObject(normalized.clauses[0]);
    const rule = String(clause.rule || "user_property");
    if (rule === "email_replied") return "Check if the contact replied";
    if (rule === "email_opened") return "Check if the email was opened";
    if (rule === "email_clicked") return "Check if the email was clicked";
    if (rule === "tag_exists") return "Check whether a tag exists";
    if (rule === "custom_event") return "Check whether a custom event fired";
    const key = String(clause.propertyKey || "property").replace(/_/g, " ");
    return `Check ${key}`;
  }

  if (node.kind === "split") {
    const percentageA = Number(config.percentageA || 50);
    const percentageB = Number(config.percentageB || 50);
    return `Route ${percentageA}% to A and ${percentageB}% to B`;
  }

  const method = String(config.method || "POST").trim();
  const url = String(config.url || "").trim();
  return url ? `${method} ${url}` : "Call external webhook";
};

const StepNode = ({
  node,
  index,
  isSelected,
  onClick,
  onDelete,
  disableDelete,
  showConnector = true,
  className,
}: {
  node: WorkflowNode;
  index: number;
  isSelected: boolean;
  onClick: () => void;
  onDelete: () => void;
  disableDelete: boolean;
  showConnector?: boolean;
  className?: string;
}) => {
  const config = STEP_TYPE_CONFIG[node.kind as DesignerNodeKind];
  const Icon = config.icon;

  return (
    <div className={cn("flex flex-col items-center", className)}>
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.22, delay: index * 0.04 }}
        className={cn(
          "group relative w-[320px] cursor-pointer rounded-xl border p-4 transition-all duration-200",
          isSelected
            ? "border-primary bg-primary/[0.04] shadow-md ring-2 ring-primary/20"
            : "border-border bg-card hover:border-primary/30 hover:shadow-md",
        )}
        onClick={onClick}
      >
        <div className="flex items-start gap-3">
          <div className={cn("rounded-lg border p-2 shrink-0", config.bgColor)}>
            <Icon className={cn("h-4 w-4", config.color)} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Step {index + 1}
              </span>
              <Badge
                variant="outline"
                className={cn(
                  "h-4 border px-1.5 py-0 text-[9px]",
                  config.bgColor,
                  config.color,
                )}
              >
                {config.label}
              </Badge>
            </div>
            <h4 className="mt-1 truncate text-sm font-semibold text-foreground">
              {node.title}
            </h4>
            <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
              {buildNodeDescription(node)}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive"
            disabled={disableDelete}
            onClick={(event) => {
              event.stopPropagation();
              onDelete();
            }}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </motion.div>
      {showConnector ? (
        <div className="flex flex-col items-center py-1">
          <div className="h-6 w-px bg-border" />
          <ArrowDown className="-mt-0.5 h-3.5 w-3.5 text-muted-foreground" />
        </div>
      ) : null}
    </div>
  );
};

const AddStepButton = ({
  onAdd,
  context,
  buttonLabel = "Add step",
  showConnector = true,
  className,
}: {
  onAdd: (kind: DesignerNodeKind, context?: AddStepContext) => void;
  context?: AddStepContext;
  buttonLabel?: string;
  showConnector?: boolean;
  className?: string;
}) => (
  <div className={cn("flex flex-col items-center py-1", className)}>
    {showConnector ? <div className="h-4 w-px bg-border" /> : null}
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-8 rounded-full border-2 border-dashed px-4 text-xs transition-all hover:border-primary hover:bg-primary/[0.04]"
        >
          <Plus className="mr-1 h-3 w-3" />
          {buttonLabel}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center" className="w-48">
        {(Object.entries(STEP_TYPE_CONFIG) as Array<
          [DesignerNodeKind, (typeof STEP_TYPE_CONFIG)[DesignerNodeKind]]
        >).map(([kind, config]) => {
          const Icon = config.icon;
          return (
            <DropdownMenuItem key={kind} onSelect={() => onAdd(kind, context)}>
              <Icon className={cn("mr-2 h-3.5 w-3.5", config.color)} />
              {config.label}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  </div>
);

const EndCap = ({
  className,
  style,
}: {
  className?: string;
  style?: CSSProperties;
}) => (
  <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    className={cn(
      "w-[120px] rounded-full border border-border bg-muted/50 py-2 text-center",
      className,
    )}
    style={style}
  >
    <div className="flex items-center justify-center gap-1.5">
      <Square className="h-3 w-3 text-muted-foreground" />
      <span className="text-xs font-medium text-muted-foreground">End</span>
    </div>
  </motion.div>
);

const buildCanvasConnectorPath = (edge: CanvasEdge) => {
  if (Math.abs(edge.sourceX - edge.targetX) < 2) {
    return `M ${edge.sourceX} ${edge.sourceY} V ${edge.targetY}`;
  }

  const distanceY = Math.max(edge.targetY - edge.sourceY, 48);
  const midY = edge.sourceY + Math.min(72, Math.max(32, distanceY / 2));
  return `M ${edge.sourceX} ${edge.sourceY} V ${midY} H ${edge.targetX} V ${edge.targetY}`;
};

const WorkflowBuilder = ({
  workflow,
  initialGraph,
  dependencies,
  saving = false,
  defaultTestRecipient = "",
  onClose,
  onSave,
}: WorkflowBuilderProps) => {
  const [draft, setDraft] = useState<AutomationWorkflow>(() => deepClone(workflow));
  const [graph, setGraph] = useState<WorkflowGraph>(() => deepClone(initialGraph));
  const [selection, setSelection] = useState<SelectionState>(() =>
    getDefaultSelection(initialGraph),
  );
  const [hasChanges, setHasChanges] = useState(false);
  const [webhookTestState, setWebhookTestState] = useState<AsyncState>({
    status: "idle",
    message: "",
    testedAt: null,
  });
  const [testEmailRecipient, setTestEmailRecipient] = useState(
    String(defaultTestRecipient || "").trim(),
  );
  const [sendingTestEmail, setSendingTestEmail] = useState(false);

  useEffect(() => {
    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;

    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, []);

  useEffect(() => {
    setDraft(deepClone(workflow));
    setGraph(deepClone(initialGraph));
    setSelection(getDefaultSelection(initialGraph));
    setHasChanges(false);
    setWebhookTestState({ status: "idle", message: "", testedAt: null });
    setTestEmailRecipient(String(defaultTestRecipient || "").trim());
    setSendingTestEmail(false);
  }, [defaultTestRecipient, initialGraph, workflow]);

  useEffect(() => {
    const normalizedDefault = String(defaultTestRecipient || "").trim();
    if (!normalizedDefault) return;
    setTestEmailRecipient((current) => current || normalizedDefault);
  }, [defaultTestRecipient]);

  const graphAnalysis = useMemo(() => analyzeGraph(graph), [graph]);
  const designLayout = useMemo(() => buildDesignLayout(graph), [graph]);
  const nodeById = useMemo(
    () => new Map(graph.nodes.map((node) => [node.id, node])),
    [graph.nodes],
  );
  const orderedDesignNodes = useMemo(
    () =>
      graphAnalysis.orderedNodeIds
        .map((nodeId) => nodeById.get(nodeId))
        .filter(Boolean) as WorkflowNode[],
    [graphAnalysis.orderedNodeIds, nodeById],
  );
  const stepIndexById = useMemo(
    () =>
      new Map(
        orderedDesignNodes.map((node, index) => [node.id, index] as const),
      ),
    [orderedDesignNodes],
  );
  const selectedNode =
    selection.type === "node" ? nodeById.get(selection.nodeId) || null : null;
  const selectedNodeConfig = useMemo(
    () => toObject(selectedNode?.config),
    [selectedNode],
  );
  const canvasData = useMemo(() => {
    const edges: CanvasEdge[] = [];
    const labels: CanvasLabel[] = [];
    const leafPlaceholders: CanvasLeafPlaceholder[] = [];
    const sharedInsertPlaceholders: SharedInsertPlaceholder[] = [];
    const nodeBounds: Array<{ left: number; right: number; bottom: number }> = [];

    graph.nodes.forEach((node) => {
      if (node.kind === "exit") return;
      const layoutEntry = designLayout.get(node.id);
      if (!layoutEntry) return;

      const size = getNodeCanvasSize(node.kind);
      nodeBounds.push({
        left: layoutEntry.x - size.width / 2,
        right: layoutEntry.x + size.width / 2,
        bottom: layoutEntry.y + size.height,
      });

      const handles = getBranchHandles(node);
      const branching = node.kind === "condition" || node.kind === "split";
      const emptyHandles = handles.filter((handle) => {
        const edge = getOutputEdge(graph, node.id, handle);
        const targetNode = edge ? nodeById.get(edge.target) : null;
        return !targetNode || targetNode.kind === "exit";
      });
      const allowSharedInsert =
        branching && handles.length === 2 && emptyHandles.length === handles.length;

      if (allowSharedInsert) {
        sharedInsertPlaceholders.push({
          key: `shared_${node.id}`,
          sourceNodeId: node.id,
          x: layoutEntry.x,
          y: layoutEntry.y + size.height + 18,
        });
      }

      handles.forEach((handle) => {
        const edge = getOutputEdge(graph, node.id, handle);
        const targetNode = edge ? nodeById.get(edge.target) : null;
        const label = branching ? getBranchLabel(node, handle) : undefined;

        if (targetNode && targetNode.kind !== "exit") {
          const targetLayout = designLayout.get(targetNode.id);
          if (!targetLayout) return;

          edges.push({
            key: edge?.id || `${node.id}_${handle}_${targetNode.id}`,
            sourceX: layoutEntry.x,
            sourceY: layoutEntry.y + size.height,
            targetX: targetLayout.x,
            targetY: targetLayout.y,
          });

          if (label) {
            labels.push({
              key: `label_${edge?.id || `${node.id}_${handle}`}`,
              label,
              x: (layoutEntry.x + targetLayout.x) / 2,
              y: layoutEntry.y + size.height + 10,
            });
          }
          return;
        }

        const x = layoutEntry.x + getHandleLaneOffset(node, handle) * DESIGN_H_SPACING;
        const buttonY =
          layoutEntry.y +
          size.height +
          (allowSharedInsert ? 60 : branching ? 36 : 20);
        const endY = buttonY + 54;

        leafPlaceholders.push({
          key: `leaf_${node.id}_${handle}`,
          sourceNodeId: node.id,
          sourceHandle: handle,
          x,
          label,
          labelY: buttonY - 24,
          buttonY,
          endY,
        });

        edges.push({
          key: `edge_${node.id}_${handle}_end`,
          sourceX: layoutEntry.x,
          sourceY: layoutEntry.y + size.height,
          targetX: x,
          targetY: endY,
        });
      });
    });

    const minLeft = Math.min(
      0,
      ...nodeBounds.map((bound) => bound.left),
      ...leafPlaceholders.map((placeholder) => placeholder.x - END_CAP_WIDTH / 2),
      ...sharedInsertPlaceholders.map((placeholder) => placeholder.x - 80),
    );
    const maxRight = Math.max(
      STEP_CARD_WIDTH / 2,
      ...nodeBounds.map((bound) => bound.right),
      ...leafPlaceholders.map((placeholder) => placeholder.x + END_CAP_WIDTH / 2),
      ...sharedInsertPlaceholders.map((placeholder) => placeholder.x + 80),
    );
    const maxBottom = Math.max(
      TRIGGER_CARD_HEIGHT,
      ...nodeBounds.map((bound) => bound.bottom),
      ...leafPlaceholders.map((placeholder) => placeholder.endY + END_CAP_HEIGHT),
      ...sharedInsertPlaceholders.map((placeholder) => placeholder.y + 32),
    );

    return {
      edges,
      labels,
      leafPlaceholders,
      sharedInsertPlaceholders,
      offsetX: CANVAS_PADDING_X - minLeft,
      width: Math.max(maxRight - minLeft + CANVAS_PADDING_X * 2, STEP_CARD_WIDTH + 240),
      height: maxBottom + CANVAS_PADDING_Y * 2,
    };
  }, [designLayout, graph, nodeById]);

  const payload = useMemo<WorkflowDesignerPayload>(() => {
    const compiled = compileGraphToLegacyFlow(graph);
    return {
      graph,
      compiledFlow: compiled.flow,
      compileErrors: compiled.errors,
      checklistPass: canPublishWorkflow(graph),
    };
  }, [graph]);

  const availableTriggerSegments = useMemo(() => {
    if (draft.trigger_type !== "list_joined" || !draft.trigger_list_id) {
      return dependencies.contactSegments;
    }
    return dependencies.contactSegments.filter(
      (segment) =>
        !segment.source_list_id ||
        segment.source_list_id === draft.trigger_list_id,
    );
  }, [dependencies.contactSegments, draft.trigger_list_id, draft.trigger_type]);

  const triggerFilters = useMemo(() => toObject(draft.trigger_filters), [draft.trigger_filters]);
  const webhookSecret = String(triggerFilters.webhook_secret || "").trim();
  const webhookEventName = String(triggerFilters.event_name || "").trim();
  const webhookEndpoint =
    draft.trigger_type === "custom_event"
      ? buildWebhookEndpoint(draft.id, webhookSecret, webhookEventName)
      : "";
  const webhookSamplePayload = useMemo(
    () =>
      JSON.stringify(
        {
          event: webhookEventName || "contact_created",
          email: "prospect@example.com",
          name: "Avery Johnson",
          phone: "+1 415 555 0182",
          data: {
            company: "Acme Inc",
            job_title: "Head of Growth",
            country: "United States",
            industry: "SaaS",
            plan: "trial",
          },
        },
        null,
        2,
      ),
    [webhookEventName],
  );

  const updateDraft = useCallback(
    (updater: (current: AutomationWorkflow) => AutomationWorkflow) => {
      setDraft((current) => updater(current));
      setHasChanges(true);
    },
    [],
  );

  const copyToClipboard = useCallback(async (value: string, label: string) => {
    const trimmed = String(value || "").trim();
    if (!trimmed) return;

    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
      toast({
        title: "Clipboard unavailable",
        description: "Copy is not supported in this browser session.",
        variant: "destructive",
      });
      return;
    }

    try {
      await navigator.clipboard.writeText(trimmed);
      toast({
        title: "Copied",
        description: `${label} copied to clipboard.`,
      });
    } catch (error) {
      toast({
        title: "Copy failed",
        description: error instanceof Error ? error.message : "Could not copy value.",
        variant: "destructive",
      });
    }
  }, []);

  const updateGraphState = useCallback(
    (updater: (current: WorkflowGraph) => WorkflowGraph) => {
      setGraph((current) => updater(current));
      setHasChanges(true);
    },
    [],
  );

  const handleTriggerTypeChange = useCallback(
    (value: AutomationTriggerType) => {
      const nextListId =
        value === "list_joined"
          ? draft.trigger_list_id || dependencies.emailLists[0]?.id || null
          : null;

      updateDraft((current) => {
        const nextFilters = { ...toObject(current.trigger_filters) };
        if (value !== "list_joined") {
          delete nextFilters.segment_id;
        }
        if (value === "custom_event" && !String(nextFilters.webhook_secret || "").trim()) {
          nextFilters.webhook_secret = generateWebhookSecret();
        }
        return {
          ...current,
          trigger_type: value,
          trigger_list_id: nextListId,
          trigger_filters: nextFilters,
        };
      });

      updateGraphState((current) => {
        const trigger = findTriggerNode(current.nodes);
        if (!trigger) return current;
        return updateNode(current, trigger.id, (node) => ({
          ...node,
          config: {
            ...toObject(node.config),
            triggerType: value,
            listId: nextListId || undefined,
            eventName:
              value === "custom_event" ? webhookEventName || undefined : undefined,
          } as WorkflowNode["config"],
        })) as WorkflowGraph;
      });
    },
    [
      dependencies.emailLists,
      draft.trigger_list_id,
      updateDraft,
      updateGraphState,
      webhookEventName,
    ],
  );

  const handleTriggerListChange = useCallback(
    (value: string) => {
      const nextValue = value === "__none" ? null : value;
      updateDraft((current) => ({
        ...current,
        trigger_list_id: nextValue,
        trigger_filters: {
          ...toObject(current.trigger_filters),
          segment_id: null,
        },
      }));
      updateGraphState((current) => {
        const trigger = findTriggerNode(current.nodes);
        if (!trigger) return current;
        return updateNode(current, trigger.id, (node) => ({
          ...node,
          config: {
            ...toObject(node.config),
            listId: nextValue || undefined,
          } as WorkflowNode["config"],
        })) as WorkflowGraph;
      });
    },
    [updateDraft, updateGraphState],
  );

  const handleTriggerSegmentChange = useCallback(
    (value: string) => {
      updateDraft((current) => ({
        ...current,
        trigger_filters: {
          ...toObject(current.trigger_filters),
          segment_id: value === "__none" ? null : value,
        },
      }));
    },
    [updateDraft],
  );

  const handleWebhookEventNameChange = useCallback(
    (value: string) => {
      updateDraft((current) => ({
        ...current,
        trigger_filters: {
          ...toObject(current.trigger_filters),
          event_name: value,
        },
      }));
      updateGraphState((current) => {
        const trigger = findTriggerNode(current.nodes);
        if (!trigger) return current;
        return updateNode(current, trigger.id, (node) => ({
          ...node,
          config: {
            ...toObject(node.config),
            eventName: value || undefined,
          } as WorkflowNode["config"],
        })) as WorkflowGraph;
      });
    },
    [updateDraft, updateGraphState],
  );

  const handleWebhookSecretChange = useCallback(
    (value: string) => {
      updateDraft((current) => ({
        ...current,
        trigger_filters: {
          ...toObject(current.trigger_filters),
          webhook_secret: value.trim(),
        },
      }));
    },
    [updateDraft],
  );

  const handleWebhookSecretRegenerate = useCallback(() => {
    handleWebhookSecretChange(generateWebhookSecret());
  }, [handleWebhookSecretChange]);

  const handleWorkflowNameChange = useCallback(
    (value: string) => {
      updateDraft((current) => ({
        ...current,
        name: value,
      }));
    },
    [updateDraft],
  );

  const handleNodeTitleChange = useCallback(
    (value: string) => {
      if (!selectedNode) return;
      updateGraphState((current) =>
        updateNode(current, selectedNode.id, (node) => ({
          ...node,
          title: value,
        })) as WorkflowGraph,
      );
    },
    [selectedNode, updateGraphState],
  );

  const handleNodeKindChange = useCallback(
    (value: string) => {
      if (!selectedNode) return;
      if (!SUPPORTED_NODE_KINDS.has(value as DesignerNodeKind)) return;

      try {
        updateGraphState((current) =>
          changeNodeKind(current, selectedNode.id, value as DesignerNodeKind),
        );
      } catch (error) {
        toast({
          title: "Step type unchanged",
          description:
            error instanceof Error ? error.message : "Could not change step type.",
          variant: "destructive",
        });
      }
    },
    [selectedNode, updateGraphState],
  );

  const handleNodeConfigChange = useCallback(
    (patch: Record<string, unknown>) => {
      if (!selectedNode) return;
      updateGraphState((current) => {
        const currentNode = current.nodes.find((node) => node.id === selectedNode.id);
        if (!currentNode) return current;

        const nextConfig = {
          ...toObject(currentNode.config),
          ...patch,
        } as WorkflowNode["config"];

        if (currentNode.kind === "condition") {
          return syncConditionBranchEdges(current, selectedNode.id, nextConfig);
        }

        return updateNode(current, selectedNode.id, (node) => ({
          ...node,
          config: nextConfig,
        })) as WorkflowGraph;
      });
    },
    [selectedNode, updateGraphState],
  );

  const handleAddStep = useCallback(
    (kind: DesignerNodeKind, context?: AddStepContext) => {
      try {
        const result = context?.mode === "shared"
          ? insertSharedNodeAfterBranch(graph, kind, context.sourceNodeId)
          : context?.sourceNodeId
            ? insertNodeOnHandle(graph, kind, context.sourceNodeId, context.sourceHandle)
            : appendNode(graph, kind);

        setGraph(result.graph);
        setSelection(
          result.nodeId ? { type: "node", nodeId: result.nodeId } : { type: "trigger" },
        );
        setHasChanges(true);
      } catch (error) {
        toast({
          title: "Add step unavailable",
          description:
            error instanceof Error ? error.message : "Could not add a step.",
          variant: "destructive",
        });
      }
    },
    [graph],
  );

  const handleDeleteNode = useCallback(
    (nodeId: string) => {
      try {
        const nextGraph = deleteNodeFromGraph(graph, nodeId);
        setGraph(nextGraph);
        setSelection(getDefaultSelection(nextGraph));
        setHasChanges(true);
      } catch (error) {
        toast({
          title: "Delete unavailable",
          description:
            error instanceof Error ? error.message : "Could not delete this step.",
          variant: "destructive",
        });
      }
    },
    [graph],
  );

  const handleSave = useCallback(async () => {
    const updated = await onSave({
      workflowPatch: {
        name: draft.name,
        trigger_type: draft.trigger_type,
        trigger_list_id: draft.trigger_list_id,
        trigger_filters: toObject(draft.trigger_filters),
        settings: withGraphInSettings(
          (draft.settings as Record<string, unknown>) || {},
          payload.graph,
        ),
      },
      payload,
    });
    if (updated) {
      setDraft(deepClone(updated));
      setHasChanges(false);
    }
    return updated;
  }, [draft, onSave, payload]);

  const handleTestWebhook = useCallback(async () => {
    if (draft.trigger_type !== "custom_event") return;

    if (!webhookEndpoint) {
      const message =
        "Webhook endpoint is unavailable. Set VITE_SUPABASE_URL and save the workflow first.";
      setWebhookTestState({
        status: "error",
        message,
        testedAt: new Date().toISOString(),
      });
      toast({
        title: "Webhook test failed",
        description: message,
        variant: "destructive",
      });
      return;
    }

    setWebhookTestState({
      status: "running",
      message: "Sending test payload...",
      testedAt: null,
    });

    try {
      const savedWorkflow = hasChanges ? await handleSave() : draft;
      if (!savedWorkflow) {
        throw new Error("Save the workflow successfully before running the webhook test.");
      }

      const response = await fetch(webhookEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(webhookSecret ? { "x-vintro-webhook-secret": webhookSecret } : {}),
        },
        body: JSON.stringify({
          event: webhookEventName || "contact_created",
          email: `webhook-test-${Date.now()}@example.com`,
          name: "Webhook Test Contact",
          phone: "+1 415 555 0182",
          data: {
            source: "workflow_builder_test",
            company: "Acme Inc",
            plan: "trial",
            workflow_id: savedWorkflow.id,
          },
        }),
      });

      const responsePayload = (await response
        .json()
        .catch(() => ({}))) as Record<string, unknown>;

      if (!response.ok) {
        throw new Error(
          String(
            responsePayload.error || `Webhook endpoint returned ${response.status}.`,
          ),
        );
      }

      const acceptedButIgnored = responsePayload.ignored === true;
      const message = acceptedButIgnored
        ? `Endpoint reachable, but payload was ignored (${String(responsePayload.reason || "event mismatch")}).`
        : `Endpoint reachable and accepted the test payload (${response.status}).`;
      const testedAt = new Date().toISOString();

      setWebhookTestState({
        status: "success",
        message,
        testedAt,
      });
      toast({
        title: "Webhook test passed",
        description: message,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not reach the webhook endpoint.";
      setWebhookTestState({
        status: "error",
        message,
        testedAt: new Date().toISOString(),
      });
      toast({
        title: "Webhook test failed",
        description: message,
        variant: "destructive",
      });
    }
  }, [
    draft,
    handleSave,
    hasChanges,
    webhookEndpoint,
    webhookEventName,
    webhookSecret,
  ]);

  const handleTestSend = useCallback(async () => {
    if (!selectedNode || selectedNode.kind !== "send_email") return;

    const toEmail = String(testEmailRecipient || "").trim();
    if (!toEmail) {
      toast({
        title: "Recipient required",
        description: "Enter a recipient email to send a workflow test email.",
        variant: "destructive",
      });
      return;
    }

    const senderConfigId = String(selectedNodeConfig.senderConfigId || "").trim();
    if (!senderConfigId) {
      toast({
        title: "Sender required",
        description: "Choose a sender account before sending a test email.",
        variant: "destructive",
      });
      return;
    }

    const subject = String(selectedNodeConfig.subject || "").trim();
    const body = String(selectedNodeConfig.body || "").trim();
    const templateId = String(selectedNodeConfig.templateId || "").trim() || null;
    const request: AutomationTestEmailRequest = {
      toEmail,
      senderConfigId,
      subject,
      body,
      templateId,
      workflowName: draft.name,
      previewData: {
        full_name: "Avery Johnson",
        email: toEmail,
        company: "Acme Inc",
        job_title: "Head of Growth",
      },
    };

    setSendingTestEmail(true);
    try {
      const response = (await sendAutomationTestEmail(request)) as Record<string, unknown>;
      toast({
        title: "Test email sent",
        description: `Sent to ${String(response.toEmail || toEmail)} from ${String(
          response.senderName || response.senderEmail || "the selected sender",
        )}.`,
      });
    } catch (error) {
      toast({
        title: "Test email failed",
        description:
          error instanceof Error ? error.message : "Could not send the test email.",
        variant: "destructive",
      });
    } finally {
      setSendingTestEmail(false);
    }
  }, [draft.name, selectedNode, selectedNodeConfig, testEmailRecipient]);

  const status = STATUS_CONFIG[draft.status];
  const TriggerIcon = TRIGGER_ICONS[draft.trigger_type];
  const selectedConditionConfig =
    selectedNode?.kind === "condition"
      ? normalizeConditionConfig(selectedNode.config)
      : null;
  const selectedEmailPreviewHtml = useMemo(() => {
    if (!selectedNode || selectedNode.kind !== "send_email") return "";

    const body = String(selectedNodeConfig.body || "").trim();
    const templateId = String(selectedNodeConfig.templateId || "").trim();
    const template =
      templateId && templateId !== "__none"
        ? dependencies.emailTemplates.find((item) => item.id === templateId)
        : null;
    const previewSource = body || String(template?.content || "").trim();

    if (!previewSource) return "";

    if (looksLikeHtml(previewSource) || template?.is_html) {
      return sanitizeEmailHtml(previewSource);
    }

    return renderPlainTextPreviewHtml(previewSource);
  }, [dependencies.emailTemplates, selectedNode, selectedNodeConfig]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[70] flex flex-col bg-background"
    >
      <div className="flex shrink-0 items-center justify-between border-b border-border bg-background/95 px-4 py-3 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <Separator orientation="vertical" className="h-6" />
          <div className="flex items-center gap-2">
            <Input
              value={draft.name}
              onChange={(event) => handleWorkflowNameChange(event.target.value)}
              className="h-8 w-[280px] border-transparent bg-transparent px-0 text-sm font-semibold shadow-none hover:border-border focus-visible:border-border focus-visible:ring-0"
            />
            {hasChanges ? (
              <Badge
                variant="outline"
                className="border-amber-200 bg-amber-50 text-[10px] text-amber-600"
              >
                Unsaved
              </Badge>
            ) : null}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className={cn("px-2 py-0.5 text-[11px]", status.bgColor, status.color)}
          >
            <span className={cn("mr-1.5 inline-block h-1.5 w-1.5 rounded-full", status.dotColor)} />
            {status.label}
          </Badge>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={() => void handleSave()}
            disabled={saving || !hasChanges}
          >
            <Save className="mr-1.5 h-3 w-3" />
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="flex-1 overflow-auto">
          <div className="min-h-full px-6 py-8">
            <div
              className="relative mx-auto"
              style={{
                width: `${canvasData.width}px`,
                height: `${canvasData.height}px`,
              }}
            >
              <svg
                className="absolute inset-0 h-full w-full"
                aria-hidden="true"
              >
                {canvasData.edges.map((edge) => (
                  <path
                    key={edge.key}
                    d={buildCanvasConnectorPath({
                      ...edge,
                      sourceX: edge.sourceX + canvasData.offsetX,
                      sourceY: edge.sourceY + CANVAS_PADDING_Y,
                      targetX: edge.targetX + canvasData.offsetX,
                      targetY: edge.targetY + CANVAS_PADDING_Y,
                    })}
                    fill="none"
                    stroke="hsl(var(--border))"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                ))}
              </svg>

              {canvasData.labels.map((label) => (
                <Badge
                  key={label.key}
                  variant="outline"
                  className="absolute z-[2] border-border bg-background/95 px-2 py-0 text-[10px] text-muted-foreground shadow-sm"
                  style={{
                    left: `${label.x + canvasData.offsetX}px`,
                    top: `${label.y + CANVAS_PADDING_Y}px`,
                    transform: "translateX(-50%)",
                  }}
                >
                  {label.label}
                </Badge>
              ))}

              {[...graph.nodes.filter((node) => node.kind !== "exit")]
                .sort((left, right) => {
                  const leftLayout = designLayout.get(left.id);
                  const rightLayout = designLayout.get(right.id);
                  if (!leftLayout || !rightLayout) return left.id.localeCompare(right.id);
                  if (leftLayout.depth !== rightLayout.depth) {
                    return leftLayout.depth - rightLayout.depth;
                  }
                  if (leftLayout.lane !== rightLayout.lane) {
                    return leftLayout.lane - rightLayout.lane;
                  }
                  return left.id.localeCompare(right.id);
                })
                .map((node) => {
                  const layoutEntry = designLayout.get(node.id);
                  if (!layoutEntry) return null;

                  const size = getNodeCanvasSize(node.kind);
                  const left = layoutEntry.x + canvasData.offsetX - size.width / 2;
                  const top = layoutEntry.y + CANVAS_PADDING_Y;

                  if (node.kind === "trigger") {
                    return (
                      <motion.button
                        key={node.id}
                        type="button"
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        onClick={() => setSelection({ type: "trigger" })}
                        className={cn(
                          "absolute rounded-xl border-2 border-dashed p-4 text-left transition-all",
                          selection.type === "trigger"
                            ? "border-primary/60 bg-primary/[0.04] shadow-md ring-2 ring-primary/20"
                            : "border-primary/30 bg-primary/[0.03]",
                        )}
                        style={{
                          left: `${left}px`,
                          top: `${top}px`,
                          width: `${TRIGGER_CARD_WIDTH}px`,
                        }}
                      >
                        <div className="flex items-center justify-center gap-2">
                          <div className="rounded-lg bg-primary/10 p-2">
                            <TriggerIcon className="h-4 w-4 text-primary" />
                          </div>
                          <div className="text-left">
                            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                              Trigger
                            </span>
                            <p className="text-sm font-semibold text-foreground">
                              {TRIGGER_LABELS[draft.trigger_type]}
                            </p>
                          </div>
                        </div>
                      </motion.button>
                    );
                  }

                  return (
                    <div
                      key={node.id}
                      className="absolute"
                      style={{
                        left: `${left}px`,
                        top: `${top}px`,
                        width: `${STEP_CARD_WIDTH}px`,
                      }}
                    >
                      <StepNode
                        node={node}
                        index={stepIndexById.get(node.id) || 0}
                        isSelected={selection.type === "node" && selection.nodeId === node.id}
                        onClick={() => setSelection({ type: "node", nodeId: node.id })}
                        onDelete={() => handleDeleteNode(node.id)}
                        disableDelete={false}
                        showConnector={false}
                      />
                    </div>
                  );
                })}

              {canvasData.sharedInsertPlaceholders.map((placeholder) => (
                <div
                  key={placeholder.key}
                  className="absolute z-[2]"
                  style={{
                    left: `${placeholder.x + canvasData.offsetX - 74}px`,
                    top: `${placeholder.y + CANVAS_PADDING_Y}px`,
                    width: "148px",
                  }}
                >
                  <AddStepButton
                    onAdd={handleAddStep}
                    context={{
                      sourceNodeId: placeholder.sourceNodeId,
                      mode: "shared",
                    }}
                    buttonLabel="Add shared step"
                    showConnector={false}
                  />
                </div>
              ))}

              {canvasData.leafPlaceholders.map((placeholder) => (
                <div key={placeholder.key}>
                  {placeholder.label ? (
                    <Badge
                      variant="outline"
                      className="absolute z-[2] border-border bg-background/95 px-2 py-0 text-[10px] text-muted-foreground shadow-sm"
                      style={{
                        left: `${placeholder.x + canvasData.offsetX}px`,
                        top: `${placeholder.labelY + CANVAS_PADDING_Y}px`,
                        transform: "translateX(-50%)",
                      }}
                    >
                      {placeholder.label}
                    </Badge>
                  ) : null}

                  <div
                    className="absolute z-[2]"
                    style={{
                      left: `${placeholder.x + canvasData.offsetX - 70}px`,
                      top: `${placeholder.buttonY + CANVAS_PADDING_Y}px`,
                      width: "140px",
                    }}
                  >
                    <AddStepButton
                      onAdd={handleAddStep}
                      context={{
                        sourceNodeId: placeholder.sourceNodeId,
                        sourceHandle: placeholder.sourceHandle,
                        mode: "branch",
                      }}
                      showConnector={false}
                    />
                  </div>

                  <EndCap
                    className="absolute z-[2]"
                    style={{
                      left: `${placeholder.x + canvasData.offsetX - END_CAP_WIDTH / 2}px`,
                      top: `${placeholder.endY + CANVAS_PADDING_Y}px`,
                    }}
                  />
                </div>
              ))}
            </div>

            {!graphAnalysis.compatible ? (
              <p className="mx-auto mt-6 max-w-md text-center text-xs text-muted-foreground">
                {graphAnalysis.reason ||
                  "This workflow includes an unsupported graph pattern for this design view."}
              </p>
            ) : null}
          </div>
        </div>

        <AnimatePresence mode="wait">
          {selection.type === "trigger" ? (
            <motion.aside
              key="trigger-inspector"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="h-full w-[340px] overflow-y-auto border-l border-border bg-card"
            >
              <div className="flex items-center justify-between border-b border-border p-4">
                <div className="flex items-center gap-2">
                  <div className="rounded-md border bg-primary/10 p-1.5">
                    <TriggerIcon className="h-3.5 w-3.5 text-primary" />
                  </div>
                  <span className="text-sm font-semibold text-foreground">
                    Edit Trigger
                  </span>
                </div>
              </div>

              <div className="space-y-4 p-4">
                <div>
                  <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Trigger Type
                  </label>
                  <Select
                    value={draft.trigger_type}
                    onValueChange={(value) =>
                      handleTriggerTypeChange(value as AutomationTriggerType)
                    }
                  >
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="custom_event">Webhook</SelectItem>
                      <SelectItem value="list_joined">List / Segment</SelectItem>
                      <SelectItem value="manual">Manual</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {draft.trigger_type === "list_joined" ? (
                  <>
                    <div>
                      <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        List
                      </label>
                      <Select
                        value={draft.trigger_list_id || "__none"}
                        onValueChange={handleTriggerListChange}
                      >
                        <SelectTrigger className="h-9 text-sm">
                          <SelectValue placeholder="Select a list" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none">No list selected</SelectItem>
                          {dependencies.emailLists.map((list) => (
                            <SelectItem key={list.id} value={list.id}>
                              {list.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        Segment
                      </label>
                      <Select
                        value={String(triggerFilters.segment_id || "__none")}
                        onValueChange={handleTriggerSegmentChange}
                      >
                        <SelectTrigger className="h-9 text-sm">
                          <SelectValue placeholder="All contacts in list" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none">All contacts in list</SelectItem>
                          {availableTriggerSegments.map((segment) => (
                            <SelectItem key={segment.id} value={segment.id}>
                              {segment.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                ) : null}

                {draft.trigger_type === "custom_event" ? (
                  <>
                    <div>
                      <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        Event Name
                      </label>
                      <Input
                        value={webhookEventName}
                        onChange={(event) =>
                          handleWebhookEventNameChange(event.target.value)
                        }
                        className="h-9 text-sm"
                        placeholder="contact_created"
                      />
                    </div>

                    <div>
                      <div className="mb-1.5 flex items-center justify-between gap-2">
                        <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                          Webhook Secret
                        </label>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-[11px]"
                          onClick={handleWebhookSecretRegenerate}
                        >
                          Regenerate
                        </Button>
                      </div>
                      <div className="flex gap-2">
                        <Input
                          value={webhookSecret}
                          onChange={(event) =>
                            handleWebhookSecretChange(event.target.value)
                          }
                          className="h-9 font-mono text-xs"
                          placeholder="whsec_..."
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="h-9 w-9 shrink-0"
                          onClick={() =>
                            void copyToClipboard(webhookSecret, "Webhook secret")
                          }
                          disabled={!webhookSecret}
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>

                    <div>
                      <div className="mb-1.5 flex items-center justify-between gap-2">
                        <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                          Endpoint
                        </label>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-[11px]"
                          onClick={() =>
                            void copyToClipboard(webhookEndpoint, "Webhook URL")
                          }
                          disabled={!webhookEndpoint}
                        >
                          Copy URL
                        </Button>
                      </div>
                      <Textarea
                        readOnly
                        value={
                          webhookEndpoint ||
                          "Set VITE_SUPABASE_URL to generate the webhook endpoint."
                        }
                        className="min-h-[90px] text-xs"
                      />
                    </div>

                    <div>
                      <div className="mb-1.5 flex items-center justify-between gap-2">
                        <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                          Sample JSON Payload
                        </label>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-[11px]"
                          onClick={() =>
                            void copyToClipboard(webhookSamplePayload, "Sample payload")
                          }
                        >
                          Copy JSON
                        </Button>
                      </div>
                      <Textarea
                        readOnly
                        value={webhookSamplePayload}
                        className="min-h-[160px] font-mono text-xs"
                      />
                    </div>

                    <div className="rounded-xl border border-border bg-muted/30 p-3">
                      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        Lead Handling
                      </p>
                      <ul className="mt-2 space-y-2 text-xs text-muted-foreground">
                        {WEBHOOK_LEAD_BEHAVIOR_NOTES.map((note) => (
                          <li key={note}>{note}</li>
                        ))}
                      </ul>
                    </div>

                    <div className="rounded-xl border border-border bg-card p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs"
                          onClick={() => void handleTestWebhook()}
                          disabled={webhookTestState.status === "running" || !webhookEndpoint}
                        >
                          {webhookTestState.status === "running" ? (
                            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                          ) : null}
                          {webhookTestState.status === "running"
                            ? "Testing..."
                            : "Test webhook"}
                        </Button>
                        {webhookTestState.status !== "idle" ? (
                          <span
                            className={cn(
                              "text-xs",
                              webhookTestState.status === "success"
                                ? "text-emerald-600"
                                : webhookTestState.status === "error"
                                  ? "text-destructive"
                                  : "text-muted-foreground",
                            )}
                          >
                            {webhookTestState.message}
                          </span>
                        ) : null}
                      </div>
                      {webhookTestState.testedAt ? (
                        <p className="mt-2 text-[11px] text-muted-foreground">
                          Last tested {new Date(webhookTestState.testedAt).toLocaleString()}
                        </p>
                      ) : null}
                    </div>
                  </>
                ) : null}

                {draft.trigger_type === "manual" ? (
                  <p className="rounded-lg border border-border bg-muted/40 px-3 py-3 text-xs text-muted-foreground">
                    Manual workflows only run when you start them from the automation
                    page.
                  </p>
                ) : null}
              </div>
            </motion.aside>
          ) : selectedNode ? (
            <motion.aside
              key={selectedNode.id}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="h-full w-[340px] overflow-y-auto border-l border-border bg-card"
            >
              <div className="flex items-center justify-between border-b border-border p-4">
                <div className="flex items-center gap-2">
                  <div
                    className={cn(
                      "rounded-md border p-1.5",
                      STEP_TYPE_CONFIG[selectedNode.kind as DesignerNodeKind].bgColor,
                    )}
                  >
                    {(() => {
                      const Icon =
                        STEP_TYPE_CONFIG[selectedNode.kind as DesignerNodeKind].icon;
                      return (
                        <Icon
                          className={cn(
                            "h-3.5 w-3.5",
                            STEP_TYPE_CONFIG[selectedNode.kind as DesignerNodeKind].color,
                          )}
                        />
                      );
                    })()}
                  </div>
                  <span className="text-sm font-semibold text-foreground">
                    Edit Step
                  </span>
                </div>
              </div>

              <div className="space-y-4 p-4">
                <div>
                  <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Step Name
                  </label>
                  <Input
                    value={selectedNode.title}
                    onChange={(event) => handleNodeTitleChange(event.target.value)}
                    className="h-9 text-sm"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Description
                  </label>
                  <Input
                    readOnly
                    value={buildNodeDescription(selectedNode)}
                    className="h-9 text-sm"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Step Type
                  </label>
                  <Select
                    value={selectedNode.kind}
                    onValueChange={handleNodeKindChange}
                  >
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(
                        Object.entries(STEP_TYPE_CONFIG) as Array<
                          [DesignerNodeKind, (typeof STEP_TYPE_CONFIG)[DesignerNodeKind]]
                        >
                      ).map(([kind, config]) => {
                        const Icon = config.icon;
                        return (
                          <SelectItem key={kind} value={kind}>
                            <span className="flex items-center gap-2">
                              <Icon className={cn("h-3.5 w-3.5", config.color)} />
                              {config.label}
                            </span>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>

                <Separator />

                <div>
                  <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Configuration
                  </label>
                  {selectedNode.kind === "send_email" ? (
                    <div className="space-y-3">
                      <div>
                        <label className="text-xs text-muted-foreground">Template</label>
                        <Select
                          value={String(selectedNodeConfig.templateId || "__none")}
                          onValueChange={(value) => {
                            if (value === "__none") {
                              handleNodeConfigChange({ templateId: "" });
                              return;
                            }
                            const template = dependencies.emailTemplates.find(
                              (item) => item.id === value,
                            );
                            handleNodeConfigChange({
                              templateId: value,
                              subject:
                                String(template?.subject || "").trim() ||
                                String(selectedNodeConfig.subject || ""),
                              body:
                                String(template?.content || "").trim() ||
                                String(selectedNodeConfig.body || ""),
                            });
                          }}
                        >
                          <SelectTrigger className="mt-1 h-9 text-sm">
                            <SelectValue placeholder="Select template" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none">No template</SelectItem>
                            {dependencies.emailTemplates.map((template) => (
                              <SelectItem key={template.id} value={template.id}>
                                {template.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <label className="text-xs text-muted-foreground">Sender</label>
                        <Select
                          value={String(selectedNodeConfig.senderConfigId || "__none")}
                          onValueChange={(value) =>
                            handleNodeConfigChange({
                              senderConfigId: value === "__none" ? "" : value,
                            })
                          }
                        >
                          <SelectTrigger className="mt-1 h-9 text-sm">
                            <SelectValue placeholder="Select sender" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none">No sender</SelectItem>
                            {dependencies.emailConfigs.map((config) => (
                              <SelectItem key={config.id} value={config.id}>
                                {config.sender_name || config.smtp_username}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <label className="text-xs text-muted-foreground">Subject</label>
                        <Input
                          value={String(selectedNodeConfig.subject || "")}
                          onChange={(event) =>
                            handleNodeConfigChange({ subject: event.target.value })
                          }
                          className="mt-1 h-9 text-sm"
                        />
                      </div>

                      <div>
                        <label className="text-xs text-muted-foreground">Body</label>
                        <Textarea
                          value={String(selectedNodeConfig.body || "")}
                          onChange={(event) =>
                            handleNodeConfigChange({ body: event.target.value })
                          }
                          className="mt-1 min-h-[120px] text-sm"
                        />
                      </div>

                      <div className="rounded-xl border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                        Tokens:{" "}
                        {Array.isArray(selectedNodeConfig.personalizationTokens) &&
                        selectedNodeConfig.personalizationTokens.length > 0
                          ? (selectedNodeConfig.personalizationTokens as string[]).join(", ")
                          : "{first_name}, {company}, {sender_name}"}
                      </div>

                      <div className="flex items-center justify-between rounded-xl border border-border px-3 py-2">
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            Thread with previous email
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Keep replies in the same conversation thread.
                          </p>
                        </div>
                        <Switch
                          checked={selectedNodeConfig.threadWithPrevious !== false}
                          onCheckedChange={(checked) =>
                            handleNodeConfigChange({ threadWithPrevious: checked })
                          }
                        />
                      </div>

                      <div>
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <label className="text-xs text-muted-foreground">
                            HTML Preview
                          </label>
                          <span className="text-[11px] text-muted-foreground">
                            Rendered output
                          </span>
                        </div>
                        <div className="rounded-xl border border-border bg-white p-4 shadow-sm">
                          {selectedEmailPreviewHtml ? (
                            <div
                              className="prose prose-sm max-w-none break-words text-slate-800"
                              dangerouslySetInnerHTML={{
                                __html: selectedEmailPreviewHtml,
                              }}
                            />
                          ) : (
                            <p className="text-sm text-muted-foreground">
                              Add body content or choose a template to preview the
                              email.
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="rounded-xl border border-border bg-card p-3">
                        <div className="space-y-2">
                          <label className="text-xs text-muted-foreground">
                            Test Recipient
                          </label>
                          <Input
                            type="email"
                            value={testEmailRecipient}
                            onChange={(event) => setTestEmailRecipient(event.target.value)}
                            className="h-9 text-sm"
                            placeholder={String(defaultTestRecipient || "you@example.com")}
                          />
                        </div>
                        <Button
                          type="button"
                          className="mt-3 h-9 w-full text-sm"
                          onClick={() => void handleTestSend()}
                          disabled={sendingTestEmail}
                        >
                          {sendingTestEmail ? (
                            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                          ) : null}
                          {sendingTestEmail ? "Sending..." : "Test send"}
                        </Button>
                      </div>
                    </div>
                  ) : null}

                  {selectedNode.kind === "wait" ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-[1fr_120px] gap-3">
                        <div>
                          <label className="text-xs text-muted-foreground">Duration</label>
                          <Input
                            type="number"
                            min="1"
                            value={String(selectedNodeConfig.duration || 1)}
                            onChange={(event) =>
                              handleNodeConfigChange({
                                duration: Number(event.target.value || 1),
                              })
                            }
                            className="mt-1 h-9 text-sm"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground">Unit</label>
                          <Select
                            value={String(selectedNodeConfig.unit || "days")}
                            onValueChange={(value) =>
                              handleNodeConfigChange({ unit: value })
                            }
                          >
                            <SelectTrigger className="mt-1 h-9 text-sm">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="seconds">Seconds</SelectItem>
                              <SelectItem value="minutes">Minutes</SelectItem>
                              <SelectItem value="hours">Hours</SelectItem>
                              <SelectItem value="days">Days</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs text-muted-foreground">
                            Window Start
                          </label>
                          <Input
                            type="time"
                            value={String(selectedNodeConfig.timeWindowStart || "09:00")}
                            onChange={(event) =>
                              handleNodeConfigChange({
                                timeWindowStart: event.target.value,
                              })
                            }
                            className="mt-1 h-9 text-sm"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground">
                            Window End
                          </label>
                          <Input
                            type="time"
                            value={String(selectedNodeConfig.timeWindowEnd || "18:00")}
                            onChange={(event) =>
                              handleNodeConfigChange({
                                timeWindowEnd: event.target.value,
                              })
                            }
                            className="mt-1 h-9 text-sm"
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-between rounded-xl border border-border px-3 py-2">
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            Randomized delay
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Add a random buffer before the next step.
                          </p>
                        </div>
                        <Switch
                          checked={selectedNodeConfig.randomized === true}
                          onCheckedChange={(checked) =>
                            handleNodeConfigChange({ randomized: checked })
                          }
                        />
                      </div>

                      {selectedNodeConfig.randomized ? (
                        <div>
                          <label className="text-xs text-muted-foreground">
                            Max Random Minutes
                          </label>
                          <Input
                            type="number"
                            min="1"
                            value={String(selectedNodeConfig.randomMaxMinutes || 60)}
                            onChange={(event) =>
                              handleNodeConfigChange({
                                randomMaxMinutes: Number(event.target.value || 60),
                              })
                            }
                            className="mt-1 h-9 text-sm"
                          />
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {selectedNode.kind === "condition" && selectedConditionConfig ? (
                    <div className="space-y-3">
                      {selectedConditionConfig.clauses.map((clause, index) => {
                        const label = conditionLabelForHandle(clause.id, index);
                        const isUserProperty = clause.rule === "user_property";
                        const requiresValue =
                          clause.rule === "user_property" ||
                          clause.rule === "tag_exists" ||
                          clause.rule === "custom_event" ||
                          clause.rule === "email_reply_contains";

                        const updateClause = (patch: Record<string, unknown>) => {
                          handleNodeConfigChange({
                            clauses: selectedConditionConfig.clauses.map((item, itemIndex) =>
                              itemIndex === index
                                ? {
                                    ...item,
                                    ...patch,
                                  }
                                : item,
                            ),
                          });
                        };

                        const removeClause = () => {
                          const nextClauses = selectedConditionConfig.clauses.filter(
                            (_, itemIndex) => itemIndex !== index,
                          );
                          handleNodeConfigChange({
                            clauses:
                              nextClauses.length > 0
                                ? nextClauses
                                : [createDefaultConditionClause(0)],
                          });
                        };

                        return (
                          <div
                            key={`${clause.id}_${index}`}
                            className="space-y-3 rounded-xl border border-border p-3"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                                {label}
                              </span>
                              {index > 0 ? (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 text-xs"
                                  onClick={removeClause}
                                >
                                  Remove
                                </Button>
                              ) : null}
                            </div>

                            <div>
                              <label className="text-xs text-muted-foreground">Rule</label>
                              <Select
                                value={clause.rule}
                                onValueChange={(value) =>
                                  updateClause({
                                    rule: value,
                                    propertyKey:
                                      value === "user_property"
                                        ? String(clause.propertyKey || "")
                                        : "",
                                    comparator:
                                      value === "user_property"
                                        ? String(clause.comparator || "contains")
                                        : "exists",
                                    value:
                                      value === "email_replied" ||
                                      value === "email_opened" ||
                                      value === "email_clicked"
                                        ? ""
                                        : String(clause.value || ""),
                                  })
                                }
                              >
                                <SelectTrigger className="mt-1 h-9 text-sm">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {CONDITION_RULE_OPTIONS.map((option) => (
                                    <SelectItem key={option.value} value={option.value}>
                                      {option.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>

                            {isUserProperty ? (
                              <>
                                <div>
                                  <label className="text-xs text-muted-foreground">
                                    Property
                                  </label>
                                  <Input
                                    value={String(clause.propertyKey || "")}
                                    onChange={(event) =>
                                      updateClause({ propertyKey: event.target.value })
                                    }
                                    className="mt-1 h-9 text-sm"
                                    placeholder="company"
                                  />
                                </div>

                                <div>
                                  <label className="text-xs text-muted-foreground">
                                    Comparator
                                  </label>
                                  <Select
                                    value={String(clause.comparator || "contains")}
                                    onValueChange={(value) =>
                                      updateClause({ comparator: value })
                                    }
                                  >
                                    <SelectTrigger className="mt-1 h-9 text-sm">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {CONDITION_COMPARATOR_OPTIONS.map((option) => (
                                        <SelectItem key={option.value} value={option.value}>
                                          {option.label}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                              </>
                            ) : null}

                            {requiresValue ? (
                              <div>
                                <label className="text-xs text-muted-foreground">
                                  {clause.rule === "custom_event"
                                    ? "Event Name"
                                    : clause.rule === "email_reply_contains"
                                      ? "Reply Text"
                                      : "Value"}
                                </label>
                                <Input
                                  value={String(clause.value || "")}
                                  onChange={(event) =>
                                    updateClause({ value: event.target.value })
                                  }
                                  className="mt-1 h-9 text-sm"
                                  placeholder={
                                    clause.rule === "custom_event"
                                      ? "trial_started"
                                      : clause.rule === "email_reply_contains"
                                        ? "pricing details"
                                        : "enterprise"
                                  }
                                />
                              </div>
                            ) : null}
                          </div>
                        );
                      })}

                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs"
                        onClick={() =>
                          handleNodeConfigChange({
                            clauses: [
                              ...selectedConditionConfig.clauses,
                              createNextElseIfClause(selectedConditionConfig.clauses),
                            ],
                          })
                        }
                      >
                        Add Else If
                      </Button>

                      <div className="rounded-xl border border-dashed border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                        Else branch is always available and runs when no condition
                        matches.
                      </div>
                    </div>
                  ) : null}

                  {selectedNode.kind === "split" ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs text-muted-foreground">
                            Variant A %
                          </label>
                          <Input
                            type="number"
                            min="0"
                            max="100"
                            value={String(selectedNodeConfig.percentageA ?? 50)}
                            onChange={(event) => {
                              const nextA = Math.max(
                                0,
                                Math.min(100, Number(event.target.value)),
                              );
                              const safeA = Number.isFinite(nextA) ? nextA : 50;
                              handleNodeConfigChange({
                                percentageA: safeA,
                                percentageB: 100 - safeA,
                              });
                            }}
                            className="mt-1 h-9 text-sm"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground">
                            Variant B %
                          </label>
                          <Input
                            type="number"
                            min="0"
                            max="100"
                            value={String(selectedNodeConfig.percentageB ?? 50)}
                            onChange={(event) => {
                              const nextB = Math.max(
                                0,
                                Math.min(100, Number(event.target.value)),
                              );
                              const safeB = Number.isFinite(nextB) ? nextB : 50;
                              handleNodeConfigChange({
                                percentageB: safeB,
                                percentageA: 100 - safeB,
                              });
                            }}
                            className="mt-1 h-9 text-sm"
                          />
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Variant A and Variant B always total 100%.
                      </p>
                    </div>
                  ) : null}

                  {selectedNode.kind === "webhook" ? (
                    <div className="space-y-3">
                      <div>
                        <label className="text-xs text-muted-foreground">URL</label>
                        <Input
                          value={String(selectedNodeConfig.url || "")}
                          onChange={(event) =>
                            handleNodeConfigChange({ url: event.target.value })
                          }
                          className="mt-1 h-9 text-sm"
                        />
                      </div>

                      <div>
                        <label className="text-xs text-muted-foreground">Method</label>
                        <Select
                          value={String(selectedNodeConfig.method || "POST")}
                          onValueChange={(value) =>
                            handleNodeConfigChange({ method: value })
                          }
                        >
                          <SelectTrigger className="mt-1 h-9 text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="GET">GET</SelectItem>
                            <SelectItem value="POST">POST</SelectItem>
                            <SelectItem value="PUT">PUT</SelectItem>
                            <SelectItem value="PATCH">PATCH</SelectItem>
                            <SelectItem value="DELETE">DELETE</SelectItem>
                            <SelectItem value="HEAD">HEAD</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <label className="text-xs text-muted-foreground">Auth</label>
                        <Select
                          value={String(selectedNodeConfig.authType || "none")}
                          onValueChange={(value) =>
                            handleNodeConfigChange({ authType: value })
                          }
                        >
                          <SelectTrigger className="mt-1 h-9 text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">None</SelectItem>
                            <SelectItem value="bearer">Bearer token</SelectItem>
                            <SelectItem value="api_key">API key header</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {String(selectedNodeConfig.authType || "none") !== "none" ? (
                        <div>
                          <label className="text-xs text-muted-foreground">
                            {String(selectedNodeConfig.authType || "none") === "api_key"
                              ? "API Key"
                              : "Bearer Token"}
                          </label>
                          <Input
                            value={String(selectedNodeConfig.authToken || "")}
                            onChange={(event) =>
                              handleNodeConfigChange({ authToken: event.target.value })
                            }
                            className="mt-1 h-9 text-sm"
                            placeholder="Paste secret token"
                          />
                        </div>
                      ) : null}

                      {String(selectedNodeConfig.authType || "none") === "api_key" ? (
                        <div>
                          <label className="text-xs text-muted-foreground">
                            API Key Header
                          </label>
                          <Input
                            value={String(selectedNodeConfig.authHeader || "x-api-key")}
                            onChange={(event) =>
                              handleNodeConfigChange({ authHeader: event.target.value })
                            }
                            className="mt-1 h-9 text-sm"
                            placeholder="x-api-key"
                          />
                        </div>
                      ) : null}

                      <div>
                        <label className="text-xs text-muted-foreground">
                          Payload Template
                        </label>
                        <Textarea
                          value={String(selectedNodeConfig.payloadTemplate || "")}
                          onChange={(event) =>
                            handleNodeConfigChange({
                              payloadTemplate: event.target.value,
                            })
                          }
                          className="mt-1 min-h-[120px] text-sm"
                        />
                      </div>

                      <div>
                        <label className="text-xs text-muted-foreground">
                          Timeout (ms)
                        </label>
                        <Input
                          type="number"
                          min="1000"
                          max="30000"
                          value={String(selectedNodeConfig.timeoutMs || 12000)}
                          onChange={(event) =>
                            handleNodeConfigChange({
                              timeoutMs: Number(event.target.value || 12000),
                            })
                          }
                          className="mt-1 h-9 text-sm"
                        />
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            </motion.aside>
          ) : null}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};

export default WorkflowBuilder;

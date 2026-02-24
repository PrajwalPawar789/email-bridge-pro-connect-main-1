import type { WorkflowGraph, WorkflowRuntimeEvent, WorkflowSimulationResult } from "@/workflow/types/schema";
import { findTriggerNode, getNodeById, getOutgoingEdges } from "@/workflow/utils/graph";
import { pickConditionBranch } from "@/workflow/utils/condition";

export interface SimulationContext {
  userProperties?: Record<string, string>;
  opened?: boolean;
  clicked?: boolean;
  tags?: string[];
  customEvents?: string[];
}

const now = () => new Date().toISOString();

const toConfigObject = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const pickSplitBranch = (config: Record<string, unknown>) => {
  const a = Number(config.percentageA ?? 50);
  const clampedA = Math.max(0, Math.min(100, a));
  const roll = Math.random() * 100;
  return roll <= clampedA ? "a" : "b";
};

const findOutgoingForHandle = (graph: WorkflowGraph, nodeId: string, handle: string) =>
  getOutgoingEdges(graph.edges, nodeId).find((edge) => edge.sourceHandle === handle) || null;

const firstOutgoing = (graph: WorkflowGraph, nodeId: string) => getOutgoingEdges(graph.edges, nodeId)[0] || null;

export const simulateWorkflow = (graph: WorkflowGraph, context: SimulationContext = {}): WorkflowSimulationResult => {
  const trigger = findTriggerNode(graph.nodes);
  if (!trigger) {
    return {
      visitedNodeIds: [],
      visitedEdgeIds: [],
      completed: false,
      events: [
        {
          id: "simulation_no_trigger",
          type: "error",
          level: "error",
          message: "No trigger node found.",
          createdAt: now(),
        },
      ],
    };
  }

  const visitedNodeIds: string[] = [];
  const visitedEdgeIds: string[] = [];
  const events: WorkflowRuntimeEvent[] = [];

  let currentNodeId: string | null = trigger.id;
  let guard = 0;

  while (currentNodeId && guard < 48) {
    guard += 1;
    const node = getNodeById(graph.nodes, currentNodeId);
    if (!node) break;

    visitedNodeIds.push(node.id);

    if (node.kind === "trigger") {
      events.push({ id: `e_${node.id}_${guard}`, nodeId: node.id, type: "trigger", message: "Trigger fired.", createdAt: now() });
      const next = firstOutgoing(graph, node.id);
      if (!next) break;
      visitedEdgeIds.push(next.id);
      currentNodeId = next.target;
      continue;
    }

    if (node.kind === "send_email") {
      const config = toConfigObject(node.config);
      events.push({
        id: `e_${node.id}_${guard}`,
        nodeId: node.id,
        type: "send_email",
        message: `Would send email: ${String(config.subject || "Untitled")}`,
        createdAt: now(),
      });
      const next = firstOutgoing(graph, node.id);
      if (!next) break;
      visitedEdgeIds.push(next.id);
      currentNodeId = next.target;
      continue;
    }

    if (node.kind === "wait") {
      const cfg = toConfigObject(node.config);
      events.push({
        id: `e_${node.id}_${guard}`,
        nodeId: node.id,
        type: "wait",
        message: `Wait ${(cfg.duration || 1)} ${(cfg.unit || "days")}`,
        createdAt: now(),
      });
      const next = firstOutgoing(graph, node.id);
      if (!next) break;
      visitedEdgeIds.push(next.id);
      currentNodeId = next.target;
      continue;
    }

    if (node.kind === "condition") {
      const branchDecision = pickConditionBranch(toConfigObject(node.config), context);
      events.push({
        id: `e_${node.id}_${guard}`,
        nodeId: node.id,
        type: "condition",
        message: branchDecision.matched
          ? `Condition matched ${branchDecision.label}.`
          : "Condition fell through to Else.",
        createdAt: now(),
      });

      const next =
        findOutgoingForHandle(graph, node.id, branchDecision.handle) || firstOutgoing(graph, node.id);
      if (!next) break;
      visitedEdgeIds.push(next.id);
      currentNodeId = next.target;
      continue;
    }

    if (node.kind === "split") {
      const branch = pickSplitBranch(toConfigObject(node.config));
      events.push({
        id: `e_${node.id}_${guard}`,
        nodeId: node.id,
        type: "split",
        message: `Split selected variant ${branch.toUpperCase()}.`,
        createdAt: now(),
      });
      const next = findOutgoingForHandle(graph, node.id, branch) || firstOutgoing(graph, node.id);
      if (!next) break;
      visitedEdgeIds.push(next.id);
      currentNodeId = next.target;
      continue;
    }

    if (node.kind === "webhook") {
      const config = toConfigObject(node.config);
      events.push({
        id: `e_${node.id}_${guard}`,
        nodeId: node.id,
        type: "webhook",
        message: `Webhook call queued to ${String(config.url || "URL missing")}`,
        createdAt: now(),
      });
      const next = firstOutgoing(graph, node.id);
      if (!next) break;
      visitedEdgeIds.push(next.id);
      currentNodeId = next.target;
      continue;
    }

    if (node.kind === "exit") {
      events.push({ id: `e_${node.id}_${guard}`, nodeId: node.id, type: "exit", message: "Workflow completed.", createdAt: now() });
      return {
        visitedNodeIds,
        visitedEdgeIds,
        events,
        completed: true,
      };
    }

    const next = firstOutgoing(graph, node.id);
    if (!next) break;
    visitedEdgeIds.push(next.id);
    currentNodeId = next.target;
  }

  if (guard >= 48) {
    events.push({ id: "simulation_guard", type: "warning", level: "warning", message: "Simulation stopped by loop guard.", createdAt: now() });
  }

  return {
    visitedNodeIds,
    visitedEdgeIds,
    events,
    completed: visitedNodeIds.some((id) => getNodeById(graph.nodes, id)?.kind === "exit"),
  };
};

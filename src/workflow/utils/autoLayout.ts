import type { WorkflowGraph, WorkflowNode } from "@/workflow/types/schema";
import { findTriggerNode, getOutgoingEdges, sortOutgoingByBranch } from "@/workflow/utils/graph";

const H_SPACING = 260;
const V_SPACING = 164;
const BASE_X = 360;

const laneOffsetForEdge = (sourceHandle: string | undefined, index: number, total: number) => {
  if (sourceHandle === "if" || sourceHandle === "yes" || sourceHandle === "a") return -1;
  if (sourceHandle === "else" || sourceHandle === "no" || sourceHandle === "b") return 1;
  if (total <= 1) return 0;
  if (total === 2) return index === 0 ? -1 : 1;
  return index - Math.floor(total / 2);
};

export const autoLayoutGraph = (graph: WorkflowGraph): WorkflowNode[] => {
  const trigger = findTriggerNode(graph.nodes);
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));

  if (!trigger) {
    return graph.nodes.map((node, index) => ({
      ...node,
      position: {
        x: BASE_X + (index % 3) * H_SPACING,
        y: 80 + Math.floor(index / 3) * V_SPACING,
      },
    }));
  }

  const depthMap = new Map<string, number>();
  const laneMap = new Map<string, number>();
  const queue: Array<{ id: string; depth: number; lane: number }> = [{ id: trigger.id, depth: 0, lane: 0 }];
  const visited = new Set<string>();

  while (queue.length) {
    const current = queue.shift() as { id: string; depth: number; lane: number };
    if (visited.has(current.id)) continue;
    visited.add(current.id);

    depthMap.set(current.id, Math.max(depthMap.get(current.id) || 0, current.depth));
    laneMap.set(current.id, current.lane);

    const outgoing = sortOutgoingByBranch(getOutgoingEdges(graph.edges, current.id));
    outgoing.forEach((edge, index) => {
      const nextLane = current.lane + laneOffsetForEdge(edge.sourceHandle, index, outgoing.length);
      queue.push({ id: edge.target, depth: current.depth + 1, lane: nextLane });
    });
  }

  let orphanLane = 0;

  return graph.nodes.map((node) => {
    const depth = depthMap.get(node.id);
    const lane = laneMap.get(node.id);

    if (typeof depth !== "number" || typeof lane !== "number") {
      orphanLane += 1;
      return {
        ...node,
        position: {
          x: BASE_X + orphanLane * H_SPACING,
          y: 80,
        },
      };
    }

    return {
      ...node,
      position: {
        x: BASE_X + lane * H_SPACING,
        y: 80 + depth * V_SPACING,
      },
    };
  });
};

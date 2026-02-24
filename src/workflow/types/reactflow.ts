import type { Edge, Node } from "@xyflow/react";
import type { WorkflowEdge, WorkflowNode } from "@/workflow/types/schema";

export interface WorkflowCanvasNodeData {
  node: WorkflowNode;
  selected: boolean;
}

export type WorkflowFlowNode = Node<WorkflowCanvasNodeData, "workflowNode">;
export type WorkflowFlowEdge = Edge<WorkflowEdge["data"]> & {
  label?: string;
};

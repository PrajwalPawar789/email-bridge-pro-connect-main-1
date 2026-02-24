import type { WorkflowGraph, WorkflowRuntimeEvent } from "@/workflow/types/schema";
import { createStarterGraph } from "@/workflow/utils/defaults";

export const mockWorkflowGraph = (): WorkflowGraph => {
  const graph = createStarterGraph("Welcome Journey");
  const emailNode = graph.nodes.find((node) => node.kind === "send_email");
  const waitNode = graph.nodes.find((node) => node.kind === "wait");

  if (emailNode) {
    emailNode.meta = { enrollmentCount: 1240 };
  }
  if (waitNode) {
    waitNode.meta = { enrollmentCount: 730 };
  }

  return graph;
};

export const mockRuntimeEvents: WorkflowRuntimeEvent[] = [
  {
    id: "runtime_1",
    nodeId: "send_email_1",
    type: "email_sent",
    message: "Welcome email sent to maria@acme.com",
    createdAt: new Date(Date.now() - 1000 * 60 * 8).toISOString(),
    level: "info",
  },
  {
    id: "runtime_2",
    nodeId: "wait_1",
    type: "wait_scheduled",
    message: "Wait step scheduled for 24h",
    createdAt: new Date(Date.now() - 1000 * 60 * 6).toISOString(),
    level: "info",
  },
  {
    id: "runtime_3",
    nodeId: "condition_1",
    type: "condition_failed",
    message: "Missing condition value for user_property",
    createdAt: new Date(Date.now() - 1000 * 60 * 2).toISOString(),
    level: "error",
  },
];

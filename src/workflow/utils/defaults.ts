import type {
  WorkflowGraph,
  WorkflowNode,
  WorkflowNodeConfigByKind,
  WorkflowNodeKind,
  WorkflowNodeStatus,
} from "@/workflow/types/schema";
import { createNodeId, createWorkflowId } from "@/workflow/utils/id";
import { createDefaultConditionClause } from "@/workflow/utils/condition";

export const NODE_TITLES: Record<WorkflowNodeKind, string> = {
  trigger: "Trigger",
  send_email: "Send Email",
  wait: "Wait",
  condition: "Condition",
  split: "A/B Split",
  webhook: "Webhook",
  exit: "Exit",
};

export const createDefaultNodeConfig = <K extends WorkflowNodeKind>(kind: K): WorkflowNodeConfigByKind[K] => {
  if (kind === "trigger") {
    return {
      triggerType: "list_joined",
    } as WorkflowNodeConfigByKind[K];
  }

  if (kind === "send_email") {
    return {
      subject: "Quick question about {company}",
      body: "Hi {first_name},\n\nI wanted to follow up on {company}.\n\nBest,\n{sender_name}",
      personalizationTokens: ["{first_name}", "{company}", "{sender_name}"],
      threadWithPrevious: true,
    } as WorkflowNodeConfigByKind[K];
  }

  if (kind === "wait") {
    return {
      duration: 1,
      unit: "days",
      randomized: false,
      randomMaxMinutes: 0,
      timeWindowStart: "09:00",
      timeWindowEnd: "18:00",
    } as WorkflowNodeConfigByKind[K];
  }

  if (kind === "condition") {
    return {
      clauses: [createDefaultConditionClause(0)],
    } as WorkflowNodeConfigByKind[K];
  }

  if (kind === "split") {
    return {
      percentageA: 50,
      percentageB: 50,
    } as WorkflowNodeConfigByKind[K];
  }

  if (kind === "webhook") {
    return {
      url: "https://api.example.com/webhook",
      method: "POST",
      payloadTemplate: "{\"email\":\"{email}\"}",
    } as WorkflowNodeConfigByKind[K];
  }

  return {
    reason: "completed",
  } as WorkflowNodeConfigByKind[K];
};

export const createNode = <K extends WorkflowNodeKind>(
  kind: K,
  position: { x: number; y: number },
  status: WorkflowNodeStatus = "draft"
): WorkflowNode<K> => ({
  id: createNodeId(kind),
  kind,
  title: NODE_TITLES[kind],
  position,
  status,
  config: createDefaultNodeConfig(kind),
});

export const createStarterGraph = (name = "Untitled workflow"): WorkflowGraph => {
  const trigger = createNode("trigger", { x: 360, y: 80 });
  const email = createNode("send_email", { x: 360, y: 240 });
  const wait = createNode("wait", { x: 360, y: 400 });
  const exit = createNode("exit", { x: 360, y: 560 });

  return {
    id: createWorkflowId(),
    name,
    status: "draft",
    version: 1,
    nodes: [trigger, email, wait, exit],
    edges: [
      { id: `edge_${trigger.id}_${email.id}`, source: trigger.id, target: email.id, sourceHandle: "out", targetHandle: "in", animated: true },
      { id: `edge_${email.id}_${wait.id}`, source: email.id, target: wait.id, sourceHandle: "out", targetHandle: "in", animated: true },
      { id: `edge_${wait.id}_${exit.id}`, source: wait.id, target: exit.id, sourceHandle: "out", targetHandle: "in", animated: true },
    ],
    settings: {
      snapToGrid: true,
      gridSize: 24,
    },
    runtimeMap: {},
  };
};

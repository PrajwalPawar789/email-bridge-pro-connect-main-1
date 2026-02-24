import type { WorkflowGraph, WorkflowReviewItem } from "@/workflow/types/schema";
import { computeReachable, findTriggerNode, getIncomingEdges, getOutgoingEdges } from "@/workflow/utils/graph";
import { getConditionBranches } from "@/workflow/utils/condition";

export const buildPublishChecklist = (graph: WorkflowGraph): WorkflowReviewItem[] => {
  const trigger = findTriggerNode(graph.nodes);
  const reachable = computeReachable(graph);

  const emailNodes = graph.nodes.filter((node) => node.kind === "send_email");
  const invalidEmails = emailNodes.filter((node) => {
    const config = node.config as Record<string, unknown>;
    return !String(config.subject || "").trim() || !String(config.body || "").trim();
  });

  const conditionNodes = graph.nodes.filter((node) => node.kind === "condition");
  const invalidConditions = conditionNodes.filter((node) => {
    const outgoing = getOutgoingEdges(graph.edges, node.id);
    const expectedBranches = getConditionBranches(node.config);
    return expectedBranches.some((branch) => !outgoing.some((edge) => edge.sourceHandle === branch.handle));
  });

  const unsupported = graph.nodes.filter((node) => node.kind === "split" || node.kind === "webhook");

  const disconnected = graph.nodes.filter((node) => {
    if (node.kind === "trigger") return false;
    return getIncomingEdges(graph.edges, node.id).length === 0;
  });

  const unreachable = graph.nodes.filter((node) => !reachable.has(node.id));
  const exitReachable = graph.nodes.some((node) => node.kind === "exit" && reachable.has(node.id));

  const items: WorkflowReviewItem[] = [
    {
      id: "trigger",
      label: "Workflow has a trigger block",
      pass: Boolean(trigger),
      detail: trigger ? "Ready" : "Add exactly one trigger node.",
    },
    {
      id: "exit",
      label: "At least one reachable exit path",
      pass: exitReachable,
      detail: exitReachable ? "Ready" : "Connect a path to an Exit block.",
    },
    {
      id: "emails",
      label: "All email blocks have subject and body",
      pass: invalidEmails.length === 0,
      detail:
        invalidEmails.length === 0
          ? "Ready"
          : `${invalidEmails.length} email block(s) need subject/body content.`,
    },
    {
      id: "conditions",
      label: "Condition nodes map If / Else If / Else branches",
      pass: invalidConditions.length === 0,
      detail:
        invalidConditions.length === 0
          ? "Ready"
          : `${invalidConditions.length} condition block(s) are missing one or more branch connections.`,
    },
    {
      id: "connections",
      label: "All non-trigger nodes are connected",
      pass: disconnected.length === 0,
      detail:
        disconnected.length === 0
          ? "Ready"
          : `${disconnected.length} node(s) are not connected to an inbound path.`,
    },
    {
      id: "unreachable",
      label: "No unreachable nodes on the canvas",
      pass: unreachable.length === 0,
      detail:
        unreachable.length === 0
          ? "Ready"
          : `${unreachable.length} node(s) are unreachable from the trigger.`,
    },
    {
      id: "runner",
      label: "Runner-compatible blocks only (email/wait/condition/exit)",
      pass: unsupported.length === 0,
      detail:
        unsupported.length === 0
          ? "Ready"
          : `${unsupported.length} block(s) need runner support before publish (split/webhook).`,
    },
  ];

  return items;
};

export const canPublishWorkflow = (graph: WorkflowGraph) =>
  buildPublishChecklist(graph).every((item) => item.pass);

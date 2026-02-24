import type {
  AutomationStep,
  AutomationStepType,
  AutomationWorkflow,
  ConditionRule as LegacyConditionRule,
} from "@/lib/automations";
import type { WorkflowGraph, WorkflowNode, WorkflowNodeKind } from "@/workflow/types/schema";
import { createEdgeId, createNodeId, createWorkflowId } from "@/workflow/utils/id";
import { normalizeGraph } from "@/workflow/utils/graph";
import { normalizeConditionConfig } from "@/workflow/utils/condition";

const toObject = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
};

const mapLegacyTypeToKind = (type: AutomationStepType): WorkflowNodeKind => {
  if (type === "send_email") return "send_email";
  if (type === "wait") return "wait";
  if (type === "condition") return "condition";
  return "exit";
};

const mapLegacyRuleToGraphRule = (rule: LegacyConditionRule) => {
  if (rule === "has_replied") return "email_opened";
  if (rule === "email_domain_contains") return "user_property";
  if (rule === "company_contains") return "user_property";
  return "user_property";
};

const mapGraphRuleToLegacy = (
  config: Record<string, unknown>
): { rule: LegacyConditionRule; value: string; errors: string[] } => {
  const errors: string[] = [];
  const rule = String(config.rule || "user_property");

  if (rule === "user_property") {
    const property = String(config.propertyKey || "").toLowerCase();
    const value = String(config.value || "");

    if (property.includes("domain")) {
      return { rule: "email_domain_contains", value, errors };
    }

    if (property.includes("company")) {
      return { rule: "company_contains", value, errors };
    }

    if (property.includes("job")) {
      return { rule: "job_title_contains", value, errors };
    }

    errors.push(`Condition property "${property || "unknown"}" is not supported by the current runner.`);
    return { rule: "has_replied", value: "", errors };
  }

  if (rule === "email_opened") {
    errors.push("Email opened condition is not yet supported by runner; fallback uses has_replied.");
    return { rule: "has_replied", value: "", errors };
  }

  if (rule === "email_clicked") {
    errors.push("Email clicked condition is not yet supported by runner; fallback uses has_replied.");
    return { rule: "has_replied", value: "", errors };
  }

  if (rule === "tag_exists") {
    errors.push("Tag based condition is not yet supported by runner; fallback uses has_replied.");
    return { rule: "has_replied", value: "", errors };
  }

  if (rule === "custom_event") {
    errors.push("Custom event condition is not yet supported by runner; fallback uses has_replied.");
    return { rule: "has_replied", value: "", errors };
  }

  return { rule: "has_replied", value: "", errors };
};

const createLegacyStep = (kind: WorkflowNodeKind, node: WorkflowNode): AutomationStep => {
  if (kind === "send_email") {
    const cfg = toObject(node.config);
    return {
      id: node.id,
      name: node.title || "Send email",
      type: "send_email",
      config: {
        sender_config_id: String(cfg.senderConfigId || ""),
        template_id: String(cfg.templateId || ""),
        subject: String(cfg.subject || ""),
        body: String(cfg.body || ""),
        thread_with_previous: cfg.threadWithPrevious !== false,
      },
    };
  }

  if (kind === "wait") {
    const cfg = toObject(node.config);
    return {
      id: node.id,
      name: node.title || "Wait",
      type: "wait",
      config: {
        duration: Number(cfg.duration || 1),
        unit: String(cfg.unit || "days"),
      },
    };
  }

  if (kind === "condition") {
    const cfg = normalizeConditionConfig(node.config);
    const primaryClause = toObject(cfg.clauses[0]);
    const mappedRule = mapGraphRuleToLegacy(primaryClause);
    return {
      id: node.id,
      name: node.title || "Condition",
      type: "condition",
      config: {
        rule: mappedRule.rule,
        value: mappedRule.value,
        if_true: "continue",
        if_false: "continue",
      },
    };
  }

  return {
    id: node.id,
    name: "Stop",
    type: "stop",
    config: {},
  };
};

export const legacyFlowToGraph = (
  flow: AutomationStep[],
  workflowMeta: { id?: string; name?: string; status?: string }
): WorkflowGraph => {
  const workflowStatus =
    workflowMeta.status === "live" ||
    workflowMeta.status === "paused" ||
    workflowMeta.status === "archived"
      ? workflowMeta.status
      : "draft";
  const graphId = workflowMeta.id || createWorkflowId();
  const triggerId = createNodeId("trigger");
  const exitId = createNodeId("exit");

  const nodes: WorkflowNode[] = [
    {
      id: triggerId,
      kind: "trigger",
      title: "Trigger",
      status: "draft",
      position: { x: 120, y: 120 },
      config: { triggerType: "list_joined" },
    },
  ];

  const edges: WorkflowGraph["edges"] = [];
  const stepNodeIds: string[] = [];

  const actionableSteps = flow.filter((step) => step.type !== "stop");

  actionableSteps.forEach((step, index) => {
    const kind = mapLegacyTypeToKind(step.type);
    const nodeId = String(step.id || createNodeId(kind));
    stepNodeIds.push(nodeId);

    if (kind === "send_email") {
      const config = toObject(step.config);
      nodes.push({
        id: nodeId,
        kind,
        title: String(step.name || "Send Email"),
        status: "draft",
        position: { x: 420 + index * 280, y: 120 },
        config: {
          subject: String(config.subject || ""),
          body: String(config.body || ""),
          senderConfigId: String(config.sender_config_id || ""),
          templateId: String(config.template_id || ""),
          personalizationTokens: ["{first_name}", "{company}", "{sender_name}"],
          threadWithPrevious: config.thread_with_previous !== false,
        },
      });
      return;
    }

    if (kind === "wait") {
      const config = toObject(step.config);
      nodes.push({
        id: nodeId,
        kind,
        title: String(step.name || "Wait"),
        status: "draft",
        position: { x: 420 + index * 280, y: 120 },
        config: {
          duration: Number(config.duration || 1),
          unit: (String(config.unit || "days") as "minutes" | "hours" | "days"),
          randomized: false,
          randomMaxMinutes: 0,
          timeWindowStart: "09:00",
          timeWindowEnd: "18:00",
        },
      });
      return;
    }

    if (kind === "condition") {
      const config = toObject(step.config);
      const legacyRule = String(config.rule || "has_replied") as LegacyConditionRule;
      nodes.push({
        id: nodeId,
        kind,
        title: String(step.name || "Condition"),
        status: "draft",
        position: { x: 420 + index * 280, y: 120 },
        config: {
          clauses: [
            {
              id: "if",
              rule: mapLegacyRuleToGraphRule(legacyRule),
              propertyKey:
                legacyRule === "email_domain_contains"
                  ? "email_domain"
                  : legacyRule === "company_contains"
                    ? "company"
                    : legacyRule === "job_title_contains"
                      ? "job_title"
                      : "",
              comparator: legacyRule === "has_replied" ? "exists" : "contains",
              value: String(config.value || ""),
            },
          ],
        },
      });
    }
  });

  nodes.push({
    id: exitId,
    kind: "exit",
    title: "Exit",
    status: "draft",
    position: { x: 420 + actionableSteps.length * 280, y: 120 },
    config: { reason: "completed" },
  });

  if (stepNodeIds.length === 0) {
    edges.push({ id: createEdgeId(triggerId, exitId), source: triggerId, target: exitId, animated: true });
  } else {
    edges.push({ id: createEdgeId(triggerId, stepNodeIds[0]), source: triggerId, target: stepNodeIds[0], animated: true });

    actionableSteps.forEach((step, index) => {
      const currentNodeId = stepNodeIds[index];
      const nextNodeId = stepNodeIds[index + 1] || exitId;

      if (step.type === "condition") {
        const cfg = toObject(step.config);
        const ifTrueStop = String(cfg.if_true || "continue") === "stop";
        const ifFalseStop = String(cfg.if_false || "continue") === "stop";

        edges.push({
          id: createEdgeId(currentNodeId, ifTrueStop ? exitId : nextNodeId),
          source: currentNodeId,
          target: ifTrueStop ? exitId : nextNodeId,
          sourceHandle: "if",
          label: "If",
          animated: true,
          data: { branch: "if" },
        });

        edges.push({
          id: createEdgeId(currentNodeId, ifFalseStop ? exitId : nextNodeId),
          source: currentNodeId,
          target: ifFalseStop ? exitId : nextNodeId,
          sourceHandle: "else",
          label: "Else",
          animated: true,
          data: { branch: "else" },
        });
      } else {
        edges.push({
          id: createEdgeId(currentNodeId, nextNodeId),
          source: currentNodeId,
          target: nextNodeId,
          animated: true,
        });
      }
    });
  }

  return {
    id: graphId,
    name: workflowMeta.name || "Untitled workflow",
    status: workflowStatus,
    version: 1,
    nodes,
    edges,
    settings: {},
    runtimeMap: {},
  };
};

export const compileGraphToLegacyFlow = (graph: WorkflowGraph): { flow: AutomationStep[]; errors: string[] } => {
  const errors: string[] = [];
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  const trigger = graph.nodes.find((node) => node.kind === "trigger");

  if (!trigger) {
    return {
      flow: [
        {
          id: createNodeId("stop"),
          name: "Stop",
          type: "stop",
          config: {},
        },
      ],
      errors: ["No trigger node found."],
    };
  }

  const outgoingFor = (nodeId: string) => graph.edges.filter((edge) => edge.source === nodeId);

  const flow: AutomationStep[] = [];
  let currentNodeId: string | null = (outgoingFor(trigger.id)[0] || null)?.target || null;
  const visited = new Set<string>();
  let guard = 0;

  while (currentNodeId && guard < 64) {
    guard += 1;
    if (visited.has(currentNodeId)) {
      errors.push("Loop detected while compiling workflow.");
      break;
    }
    visited.add(currentNodeId);

    const node = nodesById.get(currentNodeId);
    if (!node) break;

    if (node.kind === "exit") {
      flow.push({ id: node.id, name: "Stop", type: "stop", config: {} });
      return { flow, errors };
    }

    if (node.kind === "split" || node.kind === "webhook") {
      errors.push(`Node type ${node.kind} is not supported by the current automation runner.`);
      flow.push({ id: `${node.id}_stop`, name: "Stop", type: "stop", config: {} });
      return { flow, errors };
    }

    if (node.kind === "send_email" || node.kind === "wait") {
      flow.push(createLegacyStep(node.kind, node));
      const next = outgoingFor(node.id)[0];
      currentNodeId = next?.target || null;
      continue;
    }

    if (node.kind === "condition") {
      const base = createLegacyStep("condition", node);
      const outgoing = outgoingFor(node.id);
      const ifEdge =
        outgoing.find((edge) => edge.sourceHandle === "if") ||
        outgoing.find((edge) => edge.sourceHandle === "yes");
      const elseEdge =
        outgoing.find((edge) => edge.sourceHandle === "else") ||
        outgoing.find((edge) => edge.sourceHandle === "no");

      const normalizedConfig = normalizeConditionConfig(node.config);
      const hasElseIfBranches = normalizedConfig.clauses.length > 1;
      if (hasElseIfBranches) {
        errors.push(
          `Condition node "${node.title}" uses else-if branches; legacy flow fallback only preserves If/Else behavior.`
        );
      }

      if (!ifEdge || !elseEdge) {
        errors.push(`Condition node "${node.title}" must connect both If and Else outputs.`);
      }

      const ifNode = ifEdge ? nodesById.get(ifEdge.target) : null;
      const elseNode = elseEdge ? nodesById.get(elseEdge.target) : null;

      const ifStop = !ifNode || ifNode.kind === "exit";
      const elseStop = !elseNode || elseNode.kind === "exit";

      const mappedRule = mapGraphRuleToLegacy(toObject(normalizedConfig.clauses[0]));
      mappedRule.errors.forEach((error) => errors.push(error));

      base.config = {
        rule: mappedRule.rule,
        value: mappedRule.value,
        if_true: ifStop ? "stop" : "continue",
        if_false: elseStop ? "stop" : "continue",
      };

      flow.push(base);

      const continueTargets = [
        ifStop ? null : ifNode?.id,
        elseStop ? null : elseNode?.id,
      ].filter(Boolean) as string[];

      if (continueTargets.length > 1 && continueTargets[0] !== continueTargets[1]) {
        errors.push(
          `Condition node "${node.title}" has divergent continue branches that are not representable in linear runner.`
        );
        flow.push({ id: `${node.id}_stop`, name: "Stop", type: "stop", config: {} });
        return { flow, errors };
      }

      currentNodeId = continueTargets[0] || null;
      if (!currentNodeId) {
        flow.push({ id: `${node.id}_stop`, name: "Stop", type: "stop", config: {} });
        return { flow, errors };
      }
    }
  }

  if (guard >= 64) {
    errors.push("Compilation guard reached while resolving graph path.");
  }

  if (flow.length === 0 || flow[flow.length - 1].type !== "stop") {
    flow.push({ id: createNodeId("stop"), name: "Stop", type: "stop", config: {} });
  }

  return { flow, errors };
};

export const extractGraphFromWorkflow = (workflow: AutomationWorkflow): WorkflowGraph => {
  const settings = toObject(workflow.settings);
  const graphPayload = settings.workflow_graph;

  if (graphPayload) {
    return normalizeGraph(graphPayload, workflow.name);
  }

  return legacyFlowToGraph(workflow.flow || [], {
    id: workflow.id,
    name: workflow.name,
    status: workflow.status,
  });
};

export const withGraphInSettings = (settings: Record<string, unknown> | null, graph: WorkflowGraph) => ({
  ...(settings || {}),
  workflow_graph: graph,
});

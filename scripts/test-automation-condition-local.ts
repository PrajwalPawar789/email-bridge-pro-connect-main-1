import { compileGraphToLegacyFlow } from "../src/workflow/services/workflowAdapter";
import { simulateWorkflow } from "../src/workflow/utils/simulation";
import type { WorkflowGraph } from "../src/workflow/types/schema";

const graph: WorkflowGraph = {
  id: "local_test_condition_branches",
  name: "Local Condition Branch Test",
  status: "draft",
  version: 1,
  nodes: [
    {
      id: "trigger_1",
      kind: "trigger",
      title: "Trigger",
      status: "draft",
      position: { x: 80, y: 180 },
      config: { triggerType: "manual" },
    },
    {
      id: "condition_1",
      kind: "condition",
      title: "Executive Title?",
      status: "draft",
      position: { x: 360, y: 180 },
      config: {
        clauses: [
          {
            id: "if",
            rule: "user_property",
            propertyKey: "job_title",
            comparator: "contains",
            value: "chief",
          },
          {
            id: "else_if_1",
            rule: "user_property",
            propertyKey: "job_title",
            comparator: "contains",
            value: "manager",
          },
        ],
      },
    },
    {
      id: "exit_if",
      kind: "exit",
      title: "Exit If",
      status: "draft",
      position: { x: 700, y: 40 },
      config: { reason: "completed" },
    },
    {
      id: "exit_else_if",
      kind: "exit",
      title: "Exit Else If",
      status: "draft",
      position: { x: 700, y: 180 },
      config: { reason: "completed" },
    },
    {
      id: "exit_else",
      kind: "exit",
      title: "Exit Else",
      status: "draft",
      position: { x: 700, y: 320 },
      config: { reason: "completed" },
    },
  ],
  edges: [
    {
      id: "edge_trigger_condition",
      source: "trigger_1",
      target: "condition_1",
      sourceHandle: "out",
      targetHandle: "in",
      animated: true,
    },
    {
      id: "edge_condition_if",
      source: "condition_1",
      target: "exit_if",
      sourceHandle: "if",
      targetHandle: "in",
      animated: true,
    },
    {
      id: "edge_condition_else_if",
      source: "condition_1",
      target: "exit_else_if",
      sourceHandle: "else_if_1",
      targetHandle: "in",
      animated: true,
    },
    {
      id: "edge_condition_else",
      source: "condition_1",
      target: "exit_else",
      sourceHandle: "else",
      targetHandle: "in",
      animated: true,
    },
  ],
  settings: {},
  runtimeMap: {},
};

const assert = (condition: unknown, message: string) => {
  if (!condition) {
    throw new Error(message);
  }
};

const run = () => {
  const compile = compileGraphToLegacyFlow(graph);
  console.log("Legacy compatibility warnings:", compile.errors);

  const scenarios = [
    {
      id: "if",
      title: "Chief role",
      context: { userProperties: { job_title: "Chief Technology Officer" } },
      expectedExit: "exit_if",
      expectedText: "If",
    },
    {
      id: "else_if_1",
      title: "Manager role",
      context: { userProperties: { job_title: "Regional Manager" } },
      expectedExit: "exit_else_if",
      expectedText: "Else If 1",
    },
    {
      id: "else",
      title: "No match role",
      context: { userProperties: { job_title: "Software Engineer" } },
      expectedExit: "exit_else",
      expectedText: "Else",
    },
  ] as const;

  for (const scenario of scenarios) {
    const result = simulateWorkflow(graph, scenario.context);
    const conditionEvent = result.events.find((event) => event.nodeId === "condition_1");
    const reachedExpectedExit = result.visitedNodeIds.includes(scenario.expectedExit);

    assert(result.completed, `${scenario.title}: simulation did not complete.`);
    assert(Boolean(conditionEvent), `${scenario.title}: condition event missing.`);
    assert(
      reachedExpectedExit,
      `${scenario.title}: expected ${scenario.expectedExit}, got path ${result.visitedNodeIds.join(" -> ")}`
    );
    assert(
      String(conditionEvent?.message || "").includes(scenario.expectedText),
      `${scenario.title}: expected condition event to include "${scenario.expectedText}", got "${conditionEvent?.message || ""}".`
    );

    console.log(
      `${scenario.title}: OK -> ${conditionEvent?.message || "(missing event)"} | path ${result.visitedNodeIds.join(
        " -> "
      )}`
    );
  }

  console.log("Local condition branch test passed.");
};

run();

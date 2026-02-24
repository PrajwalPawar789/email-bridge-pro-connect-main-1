export type WorkflowStatus = "draft" | "live" | "paused" | "archived";
export type WorkflowNodeKind = "trigger" | "send_email" | "wait" | "condition" | "split" | "webhook" | "exit";
export type WorkflowNodeStatus = "draft" | "live" | "error";

export type ConditionRule =
  | "user_property"
  | "email_opened"
  | "email_clicked"
  | "tag_exists"
  | "custom_event";

export interface TriggerNodeConfig {
  triggerType: "list_joined" | "manual" | "custom_event";
  listId?: string;
  eventName?: string;
}

export interface SendEmailNodeConfig {
  subject: string;
  body: string;
  senderConfigId?: string;
  templateId?: string;
  personalizationTokens: string[];
  threadWithPrevious: boolean;
}

export interface WaitNodeConfig {
  duration: number;
  unit: "minutes" | "hours" | "days";
  timeWindowStart?: string;
  timeWindowEnd?: string;
  randomized: boolean;
  randomMaxMinutes?: number;
}

export interface ConditionClauseConfig {
  id: string;
  rule: ConditionRule;
  propertyKey?: string;
  comparator?: "equals" | "contains" | "exists";
  value?: string;
}

export interface ConditionNodeConfig {
  clauses: ConditionClauseConfig[];
  rule?: ConditionRule;
  propertyKey?: string;
  comparator?: "equals" | "contains" | "exists";
  value?: string;
}

export interface SplitNodeConfig {
  percentageA: number;
  percentageB: number;
}

export interface WebhookNodeConfig {
  url: string;
  method: "GET" | "POST";
  payloadTemplate?: string;
}

export interface ExitNodeConfig {
  reason: "completed" | "condition_met" | "manual";
}

export type WorkflowNodeConfigByKind = {
  trigger: TriggerNodeConfig;
  send_email: SendEmailNodeConfig;
  wait: WaitNodeConfig;
  condition: ConditionNodeConfig;
  split: SplitNodeConfig;
  webhook: WebhookNodeConfig;
  exit: ExitNodeConfig;
};

export type WorkflowNodeConfig = WorkflowNodeConfigByKind[keyof WorkflowNodeConfigByKind];

export interface WorkflowNode<K extends WorkflowNodeKind = WorkflowNodeKind> {
  id: string;
  kind: K;
  title: string;
  position: { x: number; y: number };
  status: WorkflowNodeStatus;
  config: WorkflowNodeConfigByKind[K];
  meta?: {
    enrollmentCount?: number;
    lastError?: string;
  };
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  label?: string;
  animated?: boolean;
  data?: {
    branch?: string;
    highlighted?: boolean;
  };
}

export interface WorkflowRuntimeEvent {
  id: string;
  nodeId?: string;
  edgeId?: string;
  type: string;
  message: string;
  createdAt: string;
  level?: "info" | "warning" | "error";
}

export interface WorkflowSimulationResult {
  visitedNodeIds: string[];
  visitedEdgeIds: string[];
  events: WorkflowRuntimeEvent[];
  completed: boolean;
}

export interface WorkflowReviewItem {
  id: string;
  label: string;
  pass: boolean;
  detail?: string;
}

export interface WorkflowSettings {
  timezone?: string;
  enrollmentCapPerHour?: number;
  graph?: WorkflowGraph;
}

export interface WorkflowGraph {
  id: string;
  name: string;
  status: WorkflowStatus;
  version: number;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  settings?: Record<string, unknown>;
  runtimeMap?: Record<string, unknown>;
}

export interface WorkflowClipboard {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

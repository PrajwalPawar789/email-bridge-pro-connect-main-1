/* ─── Automation Types & Helpers (No API / No Supabase) ─── */

export type AutomationWorkflowStatus = "draft" | "live" | "paused" | "archived";
export type AutomationTriggerType = "list_joined" | "manual" | "custom_event";
export type AutomationStepType = "send_email" | "wait" | "condition" | "stop";
export type WaitUnit = "seconds" | "minutes" | "hours" | "days";
export type ConditionRule =
  | "has_replied"
  | "email_domain_contains"
  | "company_contains"
  | "job_title_contains";
export type ConditionAction = "continue" | "stop";

export type AutomationStep = {
  id: string;
  name: string;
  type: AutomationStepType;
  config: Record<string, unknown>;
};

export type AutomationWorkflow = {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  status: AutomationWorkflowStatus;
  trigger_type: AutomationTriggerType;
  trigger_list_id: string | null;
  trigger_filters: Record<string, unknown> | null;
  flow: AutomationStep[];
  settings: Record<string, unknown> | null;
  run_summary: Record<string, unknown> | null;
  last_run_at: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

export type AutomationWorkflowTemplate = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  category: string;
  use_case: string | null;
  trigger_type: AutomationTriggerType;
  flow: AutomationStep[];
  tags: string[];
  is_featured: boolean;
  created_at: string;
  updated_at: string;
};

export type AutomationDependencyData = {
  emailLists: Array<{ id: string; name: string }>;
  contactSegments: Array<{ id: string; name: string }>;
  emailTemplates: Array<{ id: string; name: string; subject: string; content: string; is_html: boolean }>;
  emailConfigs: Array<{ id: string; smtp_username: string; sender_name: string | null }>;
};

/* ─── Status Labels ─── */

export const AUTOMATION_STATUS_LABELS: Record<AutomationWorkflowStatus, string> = {
  draft: "Draft",
  live: "Live",
  paused: "Paused",
  archived: "Archived",
};

export const CONDITION_RULE_OPTIONS: Array<{ value: ConditionRule; label: string; requiresValue: boolean }> = [
  { value: "has_replied", label: "Has replied to last email", requiresValue: false },
  { value: "email_domain_contains", label: "Email domain contains", requiresValue: true },
  { value: "company_contains", label: "Company contains", requiresValue: true },
  { value: "job_title_contains", label: "Job title contains", requiresValue: true },
];

export const STEP_TYPE_OPTIONS: Array<{ value: AutomationStepType; label: string }> = [
  { value: "send_email", label: "Send Email" },
  { value: "wait", label: "Wait" },
  { value: "condition", label: "Condition" },
  { value: "stop", label: "Stop" },
];

/* ─── Step Factories ─── */

export const createStepId = () =>
  `step_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

export const createDefaultStep = (type: AutomationStepType): AutomationStep => {
  if (type === "send_email") {
    return {
      id: createStepId(),
      name: "Send email",
      type,
      config: {
        sender_config_id: "",
        template_id: "",
        subject: "Quick question about {company}",
        body: "Hi {first_name},\n\nI wanted to reach out about {company}. Would you be open to a quick chat this week?\n\nBest,\n{sender_name}",
        is_html: false,
        thread_with_previous: true,
      },
    };
  }

  if (type === "wait") {
    return {
      id: createStepId(),
      name: "Wait",
      type,
      config: { duration: 2, unit: "days" as WaitUnit },
    };
  }

  if (type === "condition") {
    return {
      id: createStepId(),
      name: "Check condition",
      type,
      config: {
        rule: "has_replied" as ConditionRule,
        value: "",
        if_true: "stop" as ConditionAction,
        if_false: "continue" as ConditionAction,
      },
    };
  }

  return { id: createStepId(), name: "Stop", type: "stop", config: {} };
};

export const createDefaultFlow = (): AutomationStep[] => [
  createDefaultStep("send_email"),
  createDefaultStep("wait"),
  {
    ...createDefaultStep("send_email"),
    name: "Follow-up email",
    config: {
      sender_config_id: "",
      template_id: "",
      subject: "Following up on my note",
      body: "Hi {first_name},\n\nJust following up in case this slipped through.\n\nBest,\n{sender_name}",
      is_html: false,
      thread_with_previous: true,
    },
  },
  createDefaultStep("stop"),
];

const ensureStopStep = (steps: AutomationStep[]) => {
  const sanitized = steps.map((step) => {
    const safeType = STEP_TYPE_OPTIONS.some((item) => item.value === step.type)
      ? step.type
      : "wait";
    return {
      ...step,
      id: String(step.id || createStepId()),
      name: String(step.name || "Step"),
      type: safeType as AutomationStepType,
      config: step.config && typeof step.config === "object" ? step.config : {},
    };
  });

  if (sanitized.length === 0 || sanitized[sanitized.length - 1].type !== "stop") {
    sanitized.push(createDefaultStep("stop"));
  }

  return sanitized;
};

export const normalizeFlow = (value: unknown) => {
  if (!Array.isArray(value)) return createDefaultFlow();
  return ensureStopStep(value as AutomationStep[]);
};

/* ─── Dummy Data for Development ─── */

export const DUMMY_DEPENDENCIES: AutomationDependencyData = {
  emailLists: [
    { id: "list-1", name: "New Signups" },
    { id: "list-2", name: "Trial Users" },
    { id: "list-3", name: "Enterprise Leads" },
  ],
  contactSegments: [
    { id: "seg-1", name: "Active Users" },
    { id: "seg-2", name: "Churned Users" },
  ],
  emailTemplates: [
    { id: "tpl-1", name: "Welcome Email", subject: "Welcome to {{company}}!", content: "Hi {{first_name}},\n\nWelcome!", is_html: false },
    { id: "tpl-2", name: "Follow Up", subject: "Following up", content: "Hi {{first_name}},\n\nJust checking in.", is_html: false },
    { id: "tpl-3", name: "Re-engagement", subject: "We miss you!", content: "Hi {{first_name}},\n\nIt's been a while.", is_html: false },
  ],
  emailConfigs: [
    { id: "cfg-1", smtp_username: "hello@yourcompany.com", sender_name: "Your Company" },
    { id: "cfg-2", smtp_username: "sales@yourcompany.com", sender_name: "Sales Team" },
  ],
};

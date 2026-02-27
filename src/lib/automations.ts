import { supabase } from "@/integrations/supabase/client";

export type AutomationWorkflowStatus = "draft" | "live" | "paused" | "archived";
export type AutomationTriggerType = "list_joined" | "manual" | "custom_event";
export type AutomationStepType = "send_email" | "wait" | "condition" | "stop";
export type WaitUnit = "minutes" | "hours" | "days";
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
  trigger_filters: Record<string, unknown> | null;
  flow: AutomationStep[];
  settings: Record<string, unknown> | null;
  tags: string[];
  runner_compatible: boolean;
  is_featured: boolean;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type AutomationContactStats = {
  total: number;
  active: number;
  completed: number;
  failed: number;
  due: number;
};

export type AutomationLog = {
  id: string;
  workflow_id: string;
  contact_id: string | null;
  user_id: string;
  event_type: string;
  step_index: number | null;
  message: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

export type AutomationDependencyData = {
  emailLists: Array<{ id: string; name: string }>;
  contactSegments: Array<{ id: string; name: string; source_list_id: string | null }>;
  emailTemplates: Array<{ id: string; name: string; subject: string; content: string; is_html: boolean }>;
  emailConfigs: Array<{ id: string; smtp_username: string; sender_name: string | null }>;
};

const db = supabase as any;

const toObject = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
};

const cloneJson = <T>(value: T): T => JSON.parse(JSON.stringify(value));

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
      config: {
        duration: 2,
        unit: "days" as WaitUnit,
      },
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

  return {
    id: createStepId(),
    name: "Stop",
    type: "stop",
    config: {},
  };
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
  if (!Array.isArray(value)) {
    return createDefaultFlow();
  }
  return ensureStopStep(value as AutomationStep[]);
};

export const listAutomationWorkflows = async (userId: string): Promise<AutomationWorkflow[]> => {
  const { data, error } = await db
    .from("automation_workflows")
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });

  if (error) throw error;
  return (data || []).map((row: AutomationWorkflow) => ({
    ...row,
    flow: normalizeFlow(row.flow),
  }));
};

const normalizeAutomationTemplate = (row: Record<string, unknown>): AutomationWorkflowTemplate => ({
  id: String(row.id || ""),
  slug: String(row.slug || ""),
  name: String(row.name || "Untitled template"),
  description: row.description ? String(row.description) : null,
  category: String(row.category || "General"),
  use_case: row.use_case ? String(row.use_case) : null,
  trigger_type:
    row.trigger_type === "manual"
      ? "manual"
      : row.trigger_type === "custom_event"
        ? "custom_event"
        : "list_joined",
  trigger_filters: toObject(row.trigger_filters),
  flow: normalizeFlow(row.flow),
  settings: toObject(row.settings),
  tags: Array.isArray(row.tags) ? row.tags.map((value) => String(value || "")).filter(Boolean) : [],
  runner_compatible: row.runner_compatible !== false,
  is_featured: row.is_featured === true,
  sort_order: Number(row.sort_order || 0),
  is_active: row.is_active !== false,
  created_at: String(row.created_at || ""),
  updated_at: String(row.updated_at || ""),
});

const FALLBACK_AUTOMATION_TEMPLATES: AutomationWorkflowTemplate[] = [
  normalizeAutomationTemplate({
    id: "fallback_email_marketing",
    slug: "email-marketing",
    name: "Email Marketing",
    description: "General email marketing sequence for new leads with follow-up touches.",
    category: "Email Marketing",
    use_case: "Launch a list-based campaign in minutes.",
    trigger_type: "list_joined",
    trigger_filters: {},
    flow: [
      {
        id: "send_intro",
        name: "Send intro email",
        type: "send_email",
        config: {
          sender_config_id: "",
          template_id: "",
          subject: "Quick idea for {company}",
          body: "Hi {first_name},\n\nI wanted to share a quick idea for {company}.\n\nWould you be open to a short chat?\n\nBest,\n{sender_name}",
          is_html: false,
          thread_with_previous: true,
        },
      },
      {
        id: "wait_2_days",
        name: "Wait 2 days",
        type: "wait",
        config: {
          duration: 2,
          unit: "days",
        },
      },
      {
        id: "send_follow_up",
        name: "Send follow-up",
        type: "send_email",
        config: {
          sender_config_id: "",
          template_id: "",
          subject: "Following up on my note",
          body: "Hi {first_name},\n\nChecking in to see if this is relevant for {company}.\n\nBest,\n{sender_name}",
          is_html: false,
          thread_with_previous: true,
        },
      },
      {
        id: "wait_3_days",
        name: "Wait 3 days",
        type: "wait",
        config: {
          duration: 3,
          unit: "days",
        },
      },
      {
        id: "send_final",
        name: "Send final follow-up",
        type: "send_email",
        config: {
          sender_config_id: "",
          template_id: "",
          subject: "Should I close this out?",
          body: "Hi {first_name},\n\nIf this is not a priority right now, no worries.\n\nHappy to reconnect later.\n\nBest,\n{sender_name}",
          is_html: false,
          thread_with_previous: true,
        },
      },
      {
        id: "stop",
        name: "Stop",
        type: "stop",
        config: {},
      },
    ],
    settings: {},
    tags: ["email", "marketing", "follow-up"],
    runner_compatible: true,
    is_featured: true,
    sort_order: 10,
    is_active: true,
    created_at: "2026-02-24T00:00:00.000Z",
    updated_at: "2026-02-24T00:00:00.000Z",
  }),
  normalizeAutomationTemplate({
    id: "fallback_highly_personalized_email_marketing",
    slug: "highly-personalized-email-marketing",
    name: "Highly Personalized Email Marketing",
    description: "Account-level outreach template focused on personalization tokens.",
    category: "Email Marketing",
    use_case: "Send tailored messages by role, company, and context.",
    trigger_type: "list_joined",
    trigger_filters: {},
    flow: [
      {
        id: "send_personalized_intro",
        name: "Send personalized opener",
        type: "send_email",
        config: {
          sender_config_id: "",
          template_id: "",
          subject: "{first_name}, idea for {company}",
          body: "Hi {first_name},\n\nI noticed your role in {job_title} at {company}.\n\nI have a tailored idea that could help.\n\nBest,\n{sender_name}",
          is_html: false,
          thread_with_previous: true,
        },
      },
      {
        id: "wait_1_day",
        name: "Wait 1 day",
        type: "wait",
        config: {
          duration: 1,
          unit: "days",
        },
      },
      {
        id: "send_context_follow_up",
        name: "Send context follow-up",
        type: "send_email",
        config: {
          sender_config_id: "",
          template_id: "",
          subject: "Specific recommendation for {company}",
          body: "Hi {first_name},\n\nBased on your goals in {job_title}, here is a practical next step for {company}.\n\nWant me to share details?\n\nBest,\n{sender_name}",
          is_html: false,
          thread_with_previous: true,
        },
      },
      {
        id: "wait_2_days",
        name: "Wait 2 days",
        type: "wait",
        config: {
          duration: 2,
          unit: "days",
        },
      },
      {
        id: "send_personalized_final",
        name: "Send personalized final",
        type: "send_email",
        config: {
          sender_config_id: "",
          template_id: "",
          subject: "Last note for now",
          body: "Hi {first_name},\n\nIf this is not a fit for {company} right now, I can close the loop.\n\nBest,\n{sender_name}",
          is_html: false,
          thread_with_previous: true,
        },
      },
      {
        id: "stop",
        name: "Stop",
        type: "stop",
        config: {},
      },
    ],
    settings: {},
    tags: ["personalized", "email", "outreach"],
    runner_compatible: true,
    is_featured: true,
    sort_order: 20,
    is_active: true,
    created_at: "2026-02-24T00:00:00.000Z",
    updated_at: "2026-02-24T00:00:00.000Z",
  }),
  normalizeAutomationTemplate({
    id: "fallback_webhook_email_notification",
    slug: "webhook-email-notification",
    name: "Webhook Email Notification",
    description: "Event-driven email notification flow triggered from webhook events.",
    category: "Webhook Automation",
    use_case: "Send notification emails from external events.",
    trigger_type: "custom_event",
    trigger_filters: {},
    flow: [
      {
        id: "stop",
        name: "Stop",
        type: "stop",
        config: {},
      },
    ],
    settings: {
      workflow_graph: {
        id: "tpl_webhook_email_notification",
        name: "Webhook Email Notification",
        status: "draft",
        version: 1,
        nodes: [
          {
            id: "trigger",
            kind: "trigger",
            title: "Trigger",
            position: { x: 120, y: 240 },
            status: "draft",
            config: { triggerType: "custom_event" },
          },
          {
            id: "webhook_notification",
            kind: "webhook",
            title: "Receive Webhook Event",
            position: { x: 420, y: 240 },
            status: "draft",
            config: {
              url: "https://api.example.com/events/notify",
              method: "POST",
              payloadTemplate: "{\"email\":\"{email}\",\"event\":\"notification\"}",
            },
          },
          {
            id: "wait_10_minutes",
            kind: "wait",
            title: "Wait 10 Minutes",
            position: { x: 710, y: 240 },
            status: "draft",
            config: {
              duration: 10,
              unit: "minutes",
              randomized: false,
              randomMaxMinutes: 0,
              timeWindowStart: "00:00",
              timeWindowEnd: "23:59",
            },
          },
          {
            id: "send_notification_email",
            kind: "send_email",
            title: "Send Notification Email",
            position: { x: 1000, y: 240 },
            status: "draft",
            config: {
              senderConfigId: "",
              templateId: "",
              subject: "Notification from your webhook event",
              body: "Hi {first_name},\n\nA new webhook event was received for your account.\n\nBest,\n{sender_name}",
              personalizationTokens: ["{first_name}", "{sender_name}"],
              threadWithPrevious: true,
            },
          },
          {
            id: "exit",
            kind: "exit",
            title: "Exit",
            position: { x: 1290, y: 240 },
            status: "draft",
            config: { reason: "completed" },
          },
        ],
        edges: [
          { id: "edge_trigger_webhook", source: "trigger", target: "webhook_notification", sourceHandle: "out", targetHandle: "in", animated: true },
          { id: "edge_webhook_wait", source: "webhook_notification", target: "wait_10_minutes", sourceHandle: "out", targetHandle: "in", animated: true },
          { id: "edge_wait_email", source: "wait_10_minutes", target: "send_notification_email", sourceHandle: "out", targetHandle: "in", animated: true },
          { id: "edge_email_exit", source: "send_notification_email", target: "exit", sourceHandle: "out", targetHandle: "in", animated: true },
        ],
      },
    },
    tags: ["webhook", "notification", "event-driven"],
    runner_compatible: true,
    is_featured: true,
    sort_order: 30,
    is_active: true,
    created_at: "2026-02-24T00:00:00.000Z",
    updated_at: "2026-02-24T00:00:00.000Z",
  }),
];

export const listAutomationWorkflowTemplates = async (): Promise<AutomationWorkflowTemplate[]> => {
  const { data, error } = await db
    .from("automation_workflow_templates")
    .select("*")
    .eq("is_active", true)
    .order("is_featured", { ascending: false })
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    const pgError = error as { code?: string; status?: number; message?: string };
    const code = String(pgError.code || "");
    const status = Number(pgError.status || 0);
    const message = String(pgError.message || "").toLowerCase();

    if (
      code === "42P01" ||
      code === "PGRST205" ||
      status === 404 ||
      message.includes("could not find the table") ||
      message.includes("schema cache")
    ) {
      return cloneJson(FALLBACK_AUTOMATION_TEMPLATES);
    }
    throw error;
  }
  const templates = (data || []).map((row: Record<string, unknown>) => normalizeAutomationTemplate(row));
  if (templates.length === 0) {
    return cloneJson(FALLBACK_AUTOMATION_TEMPLATES);
  }
  return templates;
};

export const createAutomationWorkflow = async (
  userId: string,
  payload: Partial<AutomationWorkflow> = {}
): Promise<AutomationWorkflow> => {
  const { data, error } = await db
    .from("automation_workflows")
    .insert({
      user_id: userId,
      name: payload.name || "Untitled automation",
      description: payload.description || null,
      status: payload.status || "draft",
      trigger_type: payload.trigger_type || "list_joined",
      trigger_list_id: payload.trigger_list_id || null,
      trigger_filters: payload.trigger_filters || {},
      flow: normalizeFlow(payload.flow || createDefaultFlow()),
      settings: payload.settings || {},
      published_at: payload.published_at || null,
    })
    .select("*")
    .single();

  if (error) throw error;
  return {
    ...(data as AutomationWorkflow),
    flow: normalizeFlow(data.flow),
  };
};

type CreateAutomationFromTemplateOptions = {
  name?: string;
  description?: string | null;
  trigger_list_id?: string | null;
  status?: AutomationWorkflowStatus;
};

const normalizeTemplateSettings = (
  settings: Record<string, unknown> | null | undefined,
  workflowName: string
) => {
  const cloned = cloneJson(toObject(settings));
  const graph = toObject(cloned.workflow_graph);

  if (Object.keys(graph).length === 0) {
    return cloned;
  }

  const idSuffix = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  cloned.workflow_graph = {
    ...graph,
    id: `${String(graph.id || "wf_template")}_${idSuffix}`,
    name: workflowName,
    status: "draft",
  };

  return cloned;
};

export const createAutomationWorkflowFromTemplate = async (
  userId: string,
  template: AutomationWorkflowTemplate,
  options: CreateAutomationFromTemplateOptions = {}
): Promise<AutomationWorkflow> => {
  const resolvedName = (options.name || template.name || "Untitled automation").trim() || "Untitled automation";
  const resolvedDescription =
    options.description !== undefined
      ? options.description
      : template.description;
  const resolvedTriggerType: AutomationTriggerType =
    template.trigger_type === "manual"
      ? "manual"
      : template.trigger_type === "custom_event"
        ? "custom_event"
        : "list_joined";
  const resolvedTriggerListId =
    resolvedTriggerType === "list_joined"
      ? options.trigger_list_id || null
      : null;

  return createAutomationWorkflow(userId, {
    name: resolvedName,
    description: resolvedDescription || null,
    status: options.status || "draft",
    trigger_type: resolvedTriggerType,
    trigger_list_id: resolvedTriggerListId,
    trigger_filters: toObject(template.trigger_filters),
    flow: normalizeFlow(cloneJson(template.flow)),
    settings: normalizeTemplateSettings(template.settings, resolvedName),
    published_at: null,
  });
};

export const updateAutomationWorkflow = async (
  workflowId: string,
  payload: Partial<AutomationWorkflow>
): Promise<AutomationWorkflow> => {
  const updatePayload = {
    ...payload,
    flow: payload.flow ? normalizeFlow(payload.flow) : undefined,
  };

  const { data, error } = await db
    .from("automation_workflows")
    .update(updatePayload)
    .eq("id", workflowId)
    .select("*")
    .single();

  if (error) throw error;
  return {
    ...(data as AutomationWorkflow),
    flow: normalizeFlow(data.flow),
  };
};

export const deleteAutomationWorkflow = async (workflowId: string) => {
  const { error } = await db.from("automation_workflows").delete().eq("id", workflowId);
  if (error) throw error;
};

export const duplicateAutomationWorkflow = async (
  userId: string,
  source: AutomationWorkflow
): Promise<AutomationWorkflow> => {
  return createAutomationWorkflow(userId, {
    name: `${source.name} (Copy)`,
    description: source.description,
    status: "draft",
    trigger_type: source.trigger_type,
    trigger_list_id: source.trigger_list_id,
    trigger_filters: source.trigger_filters || {},
    flow: normalizeFlow(source.flow),
    settings: source.settings || {},
  });
};

const countContacts = async (
  workflowId: string,
  options: { status?: string; due?: boolean } = {}
) => {
  let query = db
    .from("automation_contacts")
    .select("*", { count: "exact", head: true })
    .eq("workflow_id", workflowId);

  if (options.status) {
    query = query.eq("status", options.status);
  }
  if (options.due) {
    query = query
      .eq("status", "active")
      .not("next_run_at", "is", null)
      .lte("next_run_at", new Date().toISOString());
  }

  const { count, error } = await query;
  if (error) throw error;
  return Number(count || 0);
};

export const getAutomationStats = async (workflowId: string): Promise<AutomationContactStats> => {
  const [total, active, completed, failed, due] = await Promise.all([
    countContacts(workflowId),
    countContacts(workflowId, { status: "active" }),
    countContacts(workflowId, { status: "completed" }),
    countContacts(workflowId, { status: "failed" }),
    countContacts(workflowId, { due: true }),
  ]);

  return {
    total,
    active,
    completed,
    failed,
    due,
  };
};

export const listAutomationLogs = async (workflowId: string, limit = 50): Promise<AutomationLog[]> => {
  const { data, error } = await db
    .from("automation_logs")
    .select("*")
    .eq("workflow_id", workflowId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data || []) as AutomationLog[];
};

export const runAutomationRunner = async (
  action: "tick" | "run_now" | "enroll_now" | "run_all",
  workflowId?: string | null
) => {
  const { data, error } = await supabase.functions.invoke("automation-runner", {
    body: {
      action,
      workflowId: workflowId || null,
    },
  });
  if (error) throw error;
  return data;
};

export const loadAutomationDependencies = async (userId: string): Promise<AutomationDependencyData> => {
  const [listsResponse, segmentsResponse, templatesResponse, configsResponse] = await Promise.all([
    db
      .from("email_lists")
      .select("id, name")
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),
    db
      .from("contact_segments")
      .select("id, name, source_list_id")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false }),
    db
      .from("email_templates")
      .select("id, name, subject, content, is_html")
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),
    db
      .from("email_configs")
      .select("id, smtp_username, sender_name")
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),
  ]);

  if (listsResponse.error) throw listsResponse.error;
  const segmentError = segmentsResponse.error as { code?: string; status?: number; message?: string } | null;
  const segmentTableMissing =
    !!segmentError &&
    (String(segmentError.code || "") === "42P01" ||
      String(segmentError.code || "") === "PGRST205" ||
      Number(segmentError.status || 0) === 404 ||
      String(segmentError.message || "").toLowerCase().includes("could not find the table"));
  if (segmentsResponse.error && !segmentTableMissing) throw segmentsResponse.error;
  if (templatesResponse.error) throw templatesResponse.error;
  if (configsResponse.error) throw configsResponse.error;

  return {
    emailLists: (listsResponse.data || []) as AutomationDependencyData["emailLists"],
    contactSegments: segmentTableMissing
      ? []
      : (segmentsResponse.data || []) as AutomationDependencyData["contactSegments"],
    emailTemplates: (templatesResponse.data || []) as AutomationDependencyData["emailTemplates"],
    emailConfigs: (configsResponse.data || []) as AutomationDependencyData["emailConfigs"],
  };
};

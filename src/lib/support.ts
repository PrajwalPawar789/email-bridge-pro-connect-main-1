import { addHours, formatDistanceToNowStrict } from "date-fns";
import { supabase } from "@/integrations/supabase/client";

export type SupportCategory =
  | "bug"
  | "billing"
  | "mailbox"
  | "campaigns"
  | "automations"
  | "landing_pages"
  | "team"
  | "deliverability"
  | "feature_request"
  | "other";

export type SupportSeverity = "low" | "medium" | "high" | "critical";
export type SupportStatus = "new" | "waiting_on_support" | "waiting_on_customer" | "resolved";
export type SupportContactPreference = "in_app" | "email";
export type SupportMessageAuthorRole = "customer" | "support" | "system";

export type SupportConversation = {
  id: string;
  workspace_id: string;
  requester_user_id: string;
  requester_email: string | null;
  requester_name: string | null;
  subject: string;
  category: SupportCategory;
  severity: SupportSeverity;
  status: SupportStatus;
  contact_preference: SupportContactPreference;
  source_page: string | null;
  source_url: string | null;
  source_metadata: Record<string, unknown> | null;
  response_due_at: string | null;
  first_response_at: string | null;
  last_customer_message_at: string | null;
  last_support_message_at: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
};

export type SupportMessage = {
  id: string;
  conversation_id: string;
  workspace_id: string;
  author_user_id: string | null;
  author_role: SupportMessageAuthorRole;
  author_name: string | null;
  body: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

export type SupportKnowledgeArticle = {
  id: string;
  title: string;
  category: SupportCategory;
  summary: string;
  recommendedFor: string;
  actions: string[];
  keywords: string[];
};

export type SupportBenchmarkNote = {
  id: string;
  title: string;
  description: string;
  whyItMatters: string;
};

export type CreateSupportConversationInput = {
  workspaceId: string;
  requesterUserId: string;
  requesterEmail?: string | null;
  requesterName?: string | null;
  subject: string;
  category: SupportCategory;
  severity: SupportSeverity;
  description: string;
  sourcePage?: string | null;
  sourceUrl?: string | null;
  contactPreference?: SupportContactPreference;
  sourceMetadata?: Record<string, unknown>;
};

const db = supabase as any;

export const SUPPORT_SLA_HOURS: Record<SupportSeverity, number> = {
  critical: 2,
  high: 8,
  medium: 24,
  low: 72,
};

export const SUPPORT_CATEGORY_OPTIONS: Array<{
  value: SupportCategory;
  label: string;
  description: string;
}> = [
  { value: "bug", label: "Bug", description: "Broken flows, crashes, or incorrect behavior." },
  { value: "billing", label: "Billing", description: "Invoices, plan changes, or payment issues." },
  { value: "mailbox", label: "Mailbox", description: "Inbox sync, account connection, or sender setup." },
  { value: "campaigns", label: "Campaigns", description: "Launch issues, replies, or send behavior." },
  { value: "automations", label: "Automations", description: "Workflow logic, triggers, or runner behavior." },
  { value: "landing_pages", label: "Landing Pages", description: "Publishing, forms, domains, or builder output." },
  { value: "team", label: "Team", description: "Permissions, approvals, seats, or workspace setup." },
  { value: "deliverability", label: "Deliverability", description: "Open rate, spam placement, or mailbox health." },
  { value: "feature_request", label: "Feature Request", description: "New capability or workflow requests." },
  { value: "other", label: "Other", description: "Anything that does not fit the above." },
];

export const SUPPORT_SEVERITY_OPTIONS: Array<{
  value: SupportSeverity;
  label: string;
  description: string;
}> = [
  { value: "low", label: "Low", description: "Minor friction or how-to guidance." },
  { value: "medium", label: "Medium", description: "Workflow blocked, but there is a workaround." },
  { value: "high", label: "High", description: "Critical team flow blocked for active work." },
  { value: "critical", label: "Critical", description: "Production outage or customer-facing failure." },
];

export const SUPPORT_STATUS_META: Record<
  SupportStatus,
  { label: string; tone: string; description: string }
> = {
  new: {
    label: "New",
    tone: "border-slate-200 bg-slate-50 text-slate-700",
    description: "Request created and ready for triage.",
  },
  waiting_on_support: {
    label: "Waiting on support",
    tone: "border-amber-200 bg-amber-50 text-amber-700",
    description: "Your latest update is with the support queue.",
  },
  waiting_on_customer: {
    label: "Waiting on you",
    tone: "border-sky-200 bg-sky-50 text-sky-700",
    description: "Support replied and is waiting for customer input.",
  },
  resolved: {
    label: "Resolved",
    tone: "border-emerald-200 bg-emerald-50 text-emerald-700",
    description: "Issue closed. Reply again to reopen if needed.",
  },
};

export const SUPPORT_KNOWLEDGE_ARTICLES: SupportKnowledgeArticle[] = [
  {
    id: "mailbox-sync-health",
    title: "Mailbox sync health checks before escalating",
    category: "mailbox",
    summary: "Verify sender status, last sync timestamp, and IMAP/SMTP health before opening a mailbox incident.",
    recommendedFor: "Missing messages, stale inboxes, or failed mailbox connections.",
    actions: [
      "Check sender account status and last synced time.",
      "Confirm mailbox credentials or OAuth token validity.",
      "Re-run sync after reconnecting the mailbox.",
    ],
    keywords: ["mailbox", "inbox", "sync", "imap", "smtp", "connection"],
  },
  {
    id: "campaign-launch-readiness",
    title: "Campaign launch readiness checklist",
    category: "campaigns",
    summary: "Confirm sender availability, audience state, scheduling, and pipeline rules before sending.",
    recommendedFor: "Launches that stall, under-send, or behave differently than expected.",
    actions: [
      "Check campaign status and schedule window.",
      "Confirm sender assignment and active mailbox state.",
      "Review list size, reply routing, and stop conditions.",
    ],
    keywords: ["campaign", "launch", "send", "schedule", "stuck"],
  },
  {
    id: "automation-debug",
    title: "Automation triage: trigger, guardrail, output",
    category: "automations",
    summary: "Review the trigger event, filter logic, and node support before escalating a workflow issue.",
    recommendedFor: "Automations that do not start, skip contacts, or stop mid-run.",
    actions: [
      "Confirm the selected trigger matches the expected event.",
      "Inspect filters and branch conditions for unexpected exclusions.",
      "Verify the workflow uses runner-supported steps.",
    ],
    keywords: ["automation", "workflow", "trigger", "branch", "runner"],
  },
  {
    id: "billing-seat-ownership",
    title: "Billing ownership and seat management",
    category: "billing",
    summary: "Clarify whether the user can manage billing directly or is on a managed workspace seat.",
    recommendedFor: "Plan changes, invoices, payment methods, or member seat confusion.",
    actions: [
      "Check whether the current user can manage billing.",
      "Confirm the active plan and workspace owner context.",
      "Review invoice, payment, or subscription history before escalating.",
    ],
    keywords: ["billing", "invoice", "plan", "subscription", "seat"],
  },
  {
    id: "landing-page-publishing",
    title: "Landing page and domain publishing checks",
    category: "landing_pages",
    summary: "Validate publish status, site connector setup, and domain state before routing to support.",
    recommendedFor: "Pages that fail to publish or custom domains that do not resolve.",
    actions: [
      "Confirm the page has a published version.",
      "Review domain connection state and DNS setup.",
      "Check form capture and recent page events if applicable.",
    ],
    keywords: ["landing", "page", "domain", "publish", "dns"],
  },
  {
    id: "deliverability-basics",
    title: "Deliverability baseline review",
    category: "deliverability",
    summary: "Separate product issues from mailbox reputation or sender warm-up issues before escalation.",
    recommendedFor: "Spam placement, poor opens, or inconsistent reply behavior.",
    actions: [
      "Check sender age, reputation, and recent volume changes.",
      "Review sending pace, targeting quality, and subject/body changes.",
      "Confirm mailbox sync and bounce behavior across recent sends.",
    ],
    keywords: ["deliverability", "spam", "open", "bounce", "reputation"],
  },
  {
    id: "team-permissions",
    title: "Team permissions and approval routing",
    category: "team",
    summary: "Verify role, permission, and approval constraints before filing a workspace access request.",
    recommendedFor: "Blocked actions that affect only some members or only specific roles.",
    actions: [
      "Check workspace role and active status.",
      "Review approval rules and reviewer assignment.",
      "Confirm whether the workspace plan includes the required feature.",
    ],
    keywords: ["team", "permission", "approval", "role", "workspace"],
  },
];

export const SUPPORT_BENCHMARK_NOTES: SupportBenchmarkNote[] = [
  {
    id: "self-serve-without-dead-ends",
    title: "Self-serve without dead ends",
    description: "Strong SaaS support funnels users into help content first, but never blocks escalation behind article walls or bots.",
    whyItMatters: "Users hate being forced through loops when they already know they need a human.",
  },
  {
    id: "single-thread-history",
    title: "Single thread history",
    description: "Top support products keep one visible conversation history with clear status, ownership, and timestamps.",
    whyItMatters: "Users should not have to repeat context every time they come back.",
  },
  {
    id: "account-context-at-intake",
    title: "Account context at intake",
    description: "Best support surfaces capture plan, workspace, current area, and impact level as part of the request.",
    whyItMatters: "Teams resolve issues faster when support does not need a second round just to gather basics.",
  },
  {
    id: "async-clarity",
    title: "Async clarity",
    description: "The best systems are explicit about response windows and whether support is waiting on the customer or the team.",
    whyItMatters: "Lack of ownership and timing is one of the fastest ways support trust erodes.",
  },
];

export function getSupportSlaLabel(severity: SupportSeverity) {
  const hours = SUPPORT_SLA_HOURS[severity];
  if (hours < 24) return `${hours}h first response target`;
  const days = Math.round(hours / 24);
  return `${days}d first response target`;
}

export function getSupportDueDistance(value: string | null) {
  if (!value) return "No SLA set";
  return formatDistanceToNowStrict(new Date(value), { addSuffix: true });
}

export function getSupportCategoryLabel(category: SupportCategory) {
  return SUPPORT_CATEGORY_OPTIONS.find((option) => option.value === category)?.label || "Other";
}

export function getSupportSeverityLabel(severity: SupportSeverity) {
  return SUPPORT_SEVERITY_OPTIONS.find((option) => option.value === severity)?.label || "Medium";
}

export function formatSupportTicketId(id: string) {
  return `SUP-${id.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

export function filterSupportArticles(search: string, category?: SupportCategory | "all") {
  const normalized = search.trim().toLowerCase();

  return SUPPORT_KNOWLEDGE_ARTICLES.filter((article) => {
    if (category && category !== "all" && article.category !== category) return false;
    if (!normalized) return true;

    return [
      article.title,
      article.summary,
      article.recommendedFor,
      ...article.actions,
      ...article.keywords,
    ]
      .join(" ")
      .toLowerCase()
      .includes(normalized);
  });
}

export async function listSupportConversations(workspaceId: string) {
  const { data, error } = await db
    .from("support_conversations")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("updated_at", { ascending: false });

  if (error) throw error;
  return (data || []) as SupportConversation[];
}

export async function listSupportMessages(conversationId: string) {
  const { data, error } = await db
    .from("support_messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data || []) as SupportMessage[];
}

export async function createSupportConversation(input: CreateSupportConversationInput) {
  const responseDueAt = addHours(new Date(), SUPPORT_SLA_HOURS[input.severity]).toISOString();
  const { data: conversation, error: conversationError } = await db
    .from("support_conversations")
    .insert({
      workspace_id: input.workspaceId,
      requester_user_id: input.requesterUserId,
      requester_email: input.requesterEmail || null,
      requester_name: input.requesterName || null,
      subject: input.subject.trim(),
      category: input.category,
      severity: input.severity,
      status: "waiting_on_support",
      contact_preference: input.contactPreference || "in_app",
      source_page: input.sourcePage || null,
      source_url: input.sourceUrl || null,
      source_metadata: input.sourceMetadata || {},
      response_due_at: responseDueAt,
    })
    .select("*")
    .single();

  if (conversationError) throw conversationError;

  const initialMessages = [
    {
      conversation_id: conversation.id,
      workspace_id: input.workspaceId,
      author_user_id: input.requesterUserId,
      author_role: "customer",
      author_name: input.requesterName || input.requesterEmail || "Customer",
      body: input.description.trim(),
      metadata: {
        source: "support-intake",
        category: input.category,
        severity: input.severity,
      },
    },
    {
      conversation_id: conversation.id,
      workspace_id: input.workspaceId,
      author_user_id: null,
      author_role: "system",
      author_name: "Support queue",
      body: `Request received. ${getSupportSlaLabel(input.severity)}. We will keep updates in this thread and follow up by email if needed.`,
      metadata: {
        source: "support-acknowledgement",
      },
    },
  ];

  const { error: messagesError } = await db.from("support_messages").insert(initialMessages);
  if (messagesError) throw messagesError;

  return conversation as SupportConversation;
}

export async function appendSupportMessage(input: {
  conversationId: string;
  workspaceId: string;
  authorUserId: string;
  authorName?: string | null;
  body: string;
}) {
  const { data, error } = await db
    .from("support_messages")
    .insert({
      conversation_id: input.conversationId,
      workspace_id: input.workspaceId,
      author_user_id: input.authorUserId,
      author_role: "customer",
      author_name: input.authorName || null,
      body: input.body.trim(),
      metadata: {
        source: "support-reply",
      },
    })
    .select("*")
    .single();

  if (error) throw error;
  return data as SupportMessage;
}

export async function resolveSupportConversation(conversationId: string) {
  const { data, error } = await db
    .from("support_conversations")
    .update({
      status: "resolved",
      resolved_at: new Date().toISOString(),
    })
    .eq("id", conversationId)
    .select("*")
    .single();

  if (error) throw error;
  return data as SupportConversation;
}

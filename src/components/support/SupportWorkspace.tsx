import React, { useEffect, useMemo, useState } from "react";
import { format, formatDistanceToNow } from "date-fns";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowUpRight,
  BookOpen,
  Bug,
  CircleDot,
  Clock3,
  CreditCard,
  LifeBuoy,
  Loader2,
  MessageSquareText,
  Send,
  ShieldCheck,
  Sparkles,
  UserRound,
  Workflow,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/providers/WorkspaceProvider";
import {
  SUPPORT_BENCHMARK_NOTES,
  SUPPORT_CATEGORY_OPTIONS,
  SUPPORT_SEVERITY_OPTIONS,
  SUPPORT_STATUS_META,
  appendSupportMessage,
  createSupportConversation,
  filterSupportArticles,
  formatSupportTicketId,
  getSupportCategoryLabel,
  getSupportDueDistance,
  getSupportSeverityLabel,
  getSupportSlaLabel,
  listSupportConversations,
  listSupportMessages,
  resolveSupportConversation,
  type SupportCategory,
  type SupportConversation,
  type SupportMessage,
  type SupportSeverity,
  type SupportStatus,
} from "@/lib/support";

type SupportWorkspaceProps = {
  user: any;
};

type IntakeDraft = {
  subject: string;
  category: SupportCategory;
  severity: SupportSeverity;
  sourcePage: string;
  contactPreference: "in_app" | "email";
  description: string;
};

const PRODUCT_AREA_OPTIONS = [
  "Dashboard",
  "Campaigns",
  "Inbox",
  "Automations",
  "Pipeline",
  "Find",
  "Email Builder",
  "Landing Pages",
  "Site Connector",
  "Billing",
  "Subscription",
  "Team",
  "Profile",
  "Other",
];

const QUICK_ACTIONS: Array<{
  category: SupportCategory;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  {
    category: "bug",
    title: "Report a bug",
    description: "Broken or inconsistent product behavior.",
    icon: Bug,
  },
  {
    category: "billing",
    title: "Billing help",
    description: "Invoices, plan changes, and payment issues.",
    icon: CreditCard,
  },
  {
    category: "automations",
    title: "Automation help",
    description: "Workflow logic, triggers, and runner issues.",
    icon: Workflow,
  },
  {
    category: "team",
    title: "Permissions",
    description: "Roles, approvals, workspace setup, and access.",
    icon: ShieldCheck,
  },
];

const SEVERITY_TONES: Record<SupportSeverity, string> = {
  low: "border-slate-200 bg-slate-50 text-slate-700",
  medium: "border-sky-200 bg-sky-50 text-sky-700",
  high: "border-amber-200 bg-amber-50 text-amber-700",
  critical: "border-rose-200 bg-rose-50 text-rose-700",
};

const FILTER_LABELS: Array<{ value: "all" | SupportStatus; label: string }> = [
  { value: "all", label: "All requests" },
  { value: "waiting_on_support", label: "Waiting on support" },
  { value: "waiting_on_customer", label: "Waiting on you" },
  { value: "resolved", label: "Resolved" },
];

function formatPlanLabel(planId?: string | null) {
  if (!planId) return "Starter";
  return planId
    .split(/[_-]+/)
    .filter(Boolean)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(" ");
}

function getDisplayName(user: any) {
  const firstName = user?.user_metadata?.first_name || "";
  const lastName = user?.user_metadata?.last_name || "";
  const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();
  if (fullName) return fullName;
  return user?.email?.split("@")[0] || "Customer";
}

function SummaryMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: string;
}) {
  return (
    <div className="rounded-2xl border border-[var(--shell-border)] bg-white/80 p-4 shadow-[0_14px_32px_-28px_rgba(15,23,42,0.45)]">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--shell-muted)]">{label}</p>
      <p className={cn("mt-2 text-2xl font-semibold", tone)} style={{ fontFamily: "var(--shell-font-display)" }}>
        {value}
      </p>
    </div>
  );
}

function ConversationCard({
  conversation,
  selected,
  onSelect,
}: {
  conversation: SupportConversation;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "w-full rounded-2xl border p-4 text-left transition-all",
        selected
          ? "border-emerald-300 bg-emerald-50/70 shadow-[0_18px_38px_-28px_rgba(16,185,129,0.55)]"
          : "border-[var(--shell-border)] bg-white/85 hover:border-emerald-200 hover:bg-white",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-[var(--shell-ink)]">{conversation.subject}</p>
          <p className="mt-1 text-xs text-[var(--shell-muted)]">
            {formatSupportTicketId(conversation.id)} · {getSupportCategoryLabel(conversation.category)}
          </p>
        </div>
        <Badge className={cn("border text-[10px] font-semibold uppercase", SUPPORT_STATUS_META[conversation.status].tone)}>
          {SUPPORT_STATUS_META[conversation.status].label}
        </Badge>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Badge variant="outline" className={cn("border text-[10px] uppercase", SEVERITY_TONES[conversation.severity])}>
          {getSupportSeverityLabel(conversation.severity)}
        </Badge>
        {conversation.source_page && (
          <Badge variant="outline" className="border-slate-200 bg-white text-[10px] uppercase text-slate-600">
            {conversation.source_page}
          </Badge>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between text-[11px] text-[var(--shell-muted)]">
        <span>Updated {formatDistanceToNow(new Date(conversation.updated_at), { addSuffix: true })}</span>
        <span>{getSupportDueDistance(conversation.response_due_at)}</span>
      </div>
    </button>
  );
}

function MessageBubble({ message, isCustomer }: { message: SupportMessage; isCustomer: boolean }) {
  return (
    <div className={cn("flex", isCustomer ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[82%] rounded-2xl border px-4 py-3 shadow-[0_14px_30px_-24px_rgba(15,23,42,0.4)]",
          isCustomer
            ? "border-emerald-200 bg-emerald-50/90 text-emerald-950"
            : "border-slate-200 bg-white text-slate-900",
        )}
      >
        <div className="flex items-center gap-2 text-[11px] text-slate-500">
          <span className="font-semibold text-slate-700">{message.author_name || "Support"}</span>
          <span>{format(new Date(message.created_at), "MMM d, h:mm a")}</span>
        </div>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{message.body}</p>
      </div>
    </div>
  );
}

function KnowledgeCard({
  title,
  summary,
  recommendedFor,
  actions,
  category,
}: {
  title: string;
  summary: string;
  recommendedFor: string;
  actions: string[];
  category: SupportCategory;
}) {
  return (
    <div className="rounded-2xl border border-[var(--shell-border)] bg-white/85 p-4 shadow-[0_14px_30px_-28px_rgba(15,23,42,0.4)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[var(--shell-ink)]">{title}</p>
          <p className="mt-1 text-xs text-[var(--shell-muted)]">{summary}</p>
        </div>
        <Badge variant="outline" className="border-slate-200 bg-white text-[10px] uppercase text-slate-600">
          {getSupportCategoryLabel(category)}
        </Badge>
      </div>
      <p className="mt-3 text-xs font-medium text-slate-700">Best for: {recommendedFor}</p>
      <div className="mt-3 space-y-2">
        {actions.map((action) => (
          <div key={action} className="flex gap-2 text-xs text-[var(--shell-muted)]">
            <CircleDot className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
            <span>{action}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const SupportWorkspace = ({ user }: SupportWorkspaceProps) => {
  const queryClient = useQueryClient();
  const { workspace, loading: workspaceLoading, error: workspaceError } = useWorkspace();
  const [search, setSearch] = useState("");
  const [requestFilter, setRequestFilter] = useState<"all" | SupportStatus>("all");
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [knowledgeCategory, setKnowledgeCategory] = useState<SupportCategory | "all">("all");
  const [replyDraft, setReplyDraft] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [draft, setDraft] = useState<IntakeDraft>({
    subject: "",
    category: "bug",
    severity: "medium",
    sourcePage: "Other",
    contactPreference: "in_app",
    description: "",
  });

  const displayName = useMemo(() => getDisplayName(user), [user]);
  const planLabel = formatPlanLabel(workspace?.planId);

  const conversationsQuery = useQuery({
    queryKey: ["support-conversations", workspace?.workspaceId],
    enabled: Boolean(workspace?.workspaceId),
    queryFn: async () => listSupportConversations(workspace!.workspaceId),
  });

  const conversations = conversationsQuery.data || [];
  const selectedConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === selectedConversationId) || null,
    [conversations, selectedConversationId],
  );

  useEffect(() => {
    if (!conversations.length) {
      setSelectedConversationId(null);
      return;
    }

    if (!selectedConversationId || !conversations.some((conversation) => conversation.id === selectedConversationId)) {
      setSelectedConversationId(conversations[0].id);
    }
  }, [conversations, selectedConversationId]);

  const messagesQuery = useQuery({
    queryKey: ["support-messages", selectedConversationId],
    enabled: Boolean(selectedConversationId),
    queryFn: async () => listSupportMessages(selectedConversationId!),
  });

  const createConversationMutation = useMutation({
    mutationFn: async () => {
      if (!workspace?.workspaceId) {
        throw new Error("Workspace not loaded");
      }
      if (!draft.subject.trim() || !draft.description.trim()) {
        throw new Error("Subject and description are required");
      }

      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      return createSupportConversation({
        workspaceId: workspace.workspaceId,
        requesterUserId: user.id,
        requesterEmail: user.email || null,
        requesterName: displayName,
        subject: draft.subject,
        category: draft.category,
        severity: draft.severity,
        description: draft.description,
        sourcePage: draft.sourcePage,
        sourceUrl: typeof window !== "undefined" ? window.location.href : null,
        contactPreference: draft.contactPreference,
        sourceMetadata: {
          workspaceName: workspace.workspaceName,
          workspaceRole: workspace.role,
          workspacePlan: workspace.planId || null,
          timezone,
          browser: typeof navigator !== "undefined" ? navigator.userAgent : null,
        },
      });
    },
    onSuccess: async (conversation) => {
      await queryClient.invalidateQueries({ queryKey: ["support-conversations", workspace?.workspaceId] });
      await queryClient.invalidateQueries({ queryKey: ["support-messages", conversation.id] });
      setSelectedConversationId(conversation.id);
      setDialogOpen(false);
      setDraft({
        subject: "",
        category: "bug",
        severity: "medium",
        sourcePage: "Other",
        contactPreference: "in_app",
        description: "",
      });
      toast({
        title: "Support request created",
        description: `${formatSupportTicketId(conversation.id)} is open with a ${getSupportSlaLabel(conversation.severity)}.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Could not create support request",
        description: error?.message || "Try again after refreshing the page.",
        variant: "destructive",
      });
    },
  });

  const replyMutation = useMutation({
    mutationFn: async () => {
      if (!selectedConversation || !workspace?.workspaceId) {
        throw new Error("Select a support thread first");
      }
      if (!replyDraft.trim()) {
        throw new Error("Message cannot be empty");
      }

      return appendSupportMessage({
        conversationId: selectedConversation.id,
        workspaceId: workspace.workspaceId,
        authorUserId: user.id,
        authorName: displayName,
        body: replyDraft,
      });
    },
    onSuccess: async () => {
      setReplyDraft("");
      await queryClient.invalidateQueries({ queryKey: ["support-conversations", workspace?.workspaceId] });
      await queryClient.invalidateQueries({ queryKey: ["support-messages", selectedConversationId] });
    },
    onError: (error: any) => {
      toast({
        title: "Could not send update",
        description: error?.message || "Try again after refreshing the page.",
        variant: "destructive",
      });
    },
  });

  const resolveMutation = useMutation({
    mutationFn: async () => {
      if (!selectedConversation) throw new Error("Select a support thread first");
      return resolveSupportConversation(selectedConversation.id);
    },
    onSuccess: async (conversation) => {
      await queryClient.invalidateQueries({ queryKey: ["support-conversations", workspace?.workspaceId] });
      await queryClient.invalidateQueries({ queryKey: ["support-messages", conversation.id] });
      toast({
        title: "Support request resolved",
        description: `${formatSupportTicketId(conversation.id)} has been marked resolved.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Could not resolve request",
        description: error?.message || "Try again after refreshing the page.",
        variant: "destructive",
      });
    },
  });

  const filteredConversations = useMemo(() => {
    const normalized = search.trim().toLowerCase();

    return conversations.filter((conversation) => {
      if (requestFilter !== "all" && conversation.status !== requestFilter) return false;
      if (!normalized) return true;

      return [
        conversation.subject,
        getSupportCategoryLabel(conversation.category),
        conversation.source_page || "",
        formatSupportTicketId(conversation.id),
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalized);
    });
  }, [conversations, requestFilter, search]);

  const recommendedArticles = useMemo(() => {
    const inferredCategory =
      knowledgeCategory === "all" ? selectedConversation?.category || "all" : knowledgeCategory;
    return filterSupportArticles(search, inferredCategory).slice(0, 4);
  }, [knowledgeCategory, search, selectedConversation?.category]);

  const queueStats = useMemo(() => {
    const openCount = conversations.filter((conversation) => conversation.status !== "resolved").length;
    const waitingOnSupport = conversations.filter(
      (conversation) => conversation.status === "waiting_on_support" || conversation.status === "new",
    ).length;
    const resolvedCount = conversations.filter((conversation) => conversation.status === "resolved").length;

    return { openCount, waitingOnSupport, resolvedCount };
  }, [conversations]);

  const openDialog = (category?: SupportCategory) => {
    setDraft((current) => ({
      ...current,
      category: category || current.category,
      sourcePage: selectedConversation?.source_page || current.sourcePage,
    }));
    setDialogOpen(true);
  };

  if (workspaceLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex items-center gap-3 rounded-full border border-[var(--shell-border)] bg-white/80 px-5 py-3 text-sm text-[var(--shell-muted)]">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading support center
        </div>
      </div>
    );
  }

  if (workspaceError || !workspace) {
    return (
      <Card className="border-rose-200 bg-rose-50/80">
        <CardHeader>
          <CardTitle className="text-rose-900">Support center is unavailable</CardTitle>
          <CardDescription className="text-rose-700">
            Workspace context did not load, so support requests cannot be attached to the correct account.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-rose-800">{workspaceError || "Workspace not found."}</CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="space-y-6">
        <section className="overflow-hidden rounded-[32px] border border-[var(--shell-border)] bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.16),transparent_34%),radial-gradient(circle_at_top_right,rgba(245,158,11,0.14),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,250,252,0.92))] p-6 shadow-[0_24px_70px_-42px_rgba(15,23,42,0.45)] lg:p-8">
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.9fr)]">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
                <LifeBuoy className="h-3.5 w-3.5" />
                Support Center
              </div>
              <h1
                className="mt-4 text-3xl font-semibold tracking-tight text-[var(--shell-ink)] lg:text-4xl"
                style={{ fontFamily: "var(--shell-font-display)" }}
              >
                Self-serve first, human support without losing context.
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-[var(--shell-muted)]">
                Strong support systems reduce dead-end chat loops, preserve conversation history, and attach account
                context at intake. This workspace does the same: one thread, visible status, and structured escalation.
              </p>

              <div className="mt-5 flex flex-wrap gap-2">
                <Badge variant="outline" className="border-white/80 bg-white/70 px-3 py-1 text-[11px] font-semibold text-slate-700">
                  Workspace context attached
                </Badge>
                <Badge variant="outline" className="border-white/80 bg-white/70 px-3 py-1 text-[11px] font-semibold text-slate-700">
                  Status and SLA visible
                </Badge>
                <Badge variant="outline" className="border-white/80 bg-white/70 px-3 py-1 text-[11px] font-semibold text-slate-700">
                  Knowledge base plus escalation
                </Badge>
              </div>

              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <div className="relative flex-1">
                  <BookOpen className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--shell-muted)]" />
                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search tickets, categories, or support guides"
                    className="h-12 rounded-full border-white/80 bg-white/80 pl-11 shadow-sm"
                  />
                </div>
                <Button
                  onClick={() => openDialog()}
                  className="h-12 rounded-full bg-emerald-600 px-5 font-semibold text-white hover:bg-emerald-700"
                >
                  <MessageSquareText className="mr-2 h-4 w-4" />
                  New request
                </Button>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
              <SummaryMetric label="Open" value={String(queueStats.openCount)} tone="text-slate-900" />
              <SummaryMetric label="Waiting on support" value={String(queueStats.waitingOnSupport)} tone="text-amber-700" />
              <SummaryMetric label="Baseline SLA" value={getSupportSlaLabel("medium")} tone="text-emerald-700" />
            </div>
          </div>

          <div className="mt-6 grid gap-3 lg:grid-cols-4">
            {QUICK_ACTIONS.map((action) => (
              <button
                key={action.category}
                type="button"
                onClick={() => openDialog(action.category)}
                className="rounded-2xl border border-white/80 bg-white/75 p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:bg-white"
              >
                <action.icon className="h-5 w-5 text-emerald-700" />
                <p className="mt-3 text-sm font-semibold text-[var(--shell-ink)]">{action.title}</p>
                <p className="mt-1 text-xs leading-6 text-[var(--shell-muted)]">{action.description}</p>
              </button>
            ))}
          </div>
        </section>

        <div className="grid gap-6 xl:grid-cols-[320px_360px_minmax(0,1fr)]">
          <div className="space-y-6">
            <Card className="border-[var(--shell-border)] bg-white/90 shadow-[0_24px_60px_-38px_rgba(15,23,42,0.42)]">
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <CardTitle className="text-lg text-[var(--shell-ink)]">Recommended guides</CardTitle>
                    <CardDescription>
                      Searchable help content, but escalation stays one click away.
                    </CardDescription>
                  </div>
                  <Select
                    value={knowledgeCategory}
                    onValueChange={(value) => setKnowledgeCategory(value as SupportCategory | "all")}
                  >
                    <SelectTrigger className="h-9 w-[150px] rounded-full bg-white text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All topics</SelectItem>
                      {SUPPORT_CATEGORY_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {recommendedArticles.length ? (
                  recommendedArticles.map((article) => (
                    <KnowledgeCard
                      key={article.id}
                      title={article.title}
                      summary={article.summary}
                      recommendedFor={article.recommendedFor}
                      actions={article.actions}
                      category={article.category}
                    />
                  ))
                ) : (
                  <div className="rounded-2xl border border-dashed border-[var(--shell-border)] bg-slate-50 p-4 text-sm text-[var(--shell-muted)]">
                    No guide matches the current search. Open a request and the thread will keep the context.
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-[var(--shell-border)] bg-white/90 shadow-[0_24px_60px_-38px_rgba(15,23,42,0.42)]">
              <CardHeader className="pb-4">
                <CardTitle className="text-lg text-[var(--shell-ink)]">Why this flow exists</CardTitle>
                <CardDescription>Patterns taken from strong SaaS support systems and common user complaints.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {SUPPORT_BENCHMARK_NOTES.map((item) => (
                  <div key={item.id} className="rounded-2xl border border-[var(--shell-border)] bg-slate-50/90 p-4">
                    <div className="flex items-start gap-3">
                      <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                      <div>
                        <p className="text-sm font-semibold text-[var(--shell-ink)]">{item.title}</p>
                        <p className="mt-1 text-xs leading-6 text-[var(--shell-muted)]">{item.description}</p>
                        <p className="mt-2 text-xs font-medium text-slate-700">{item.whyItMatters}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="border-[var(--shell-border)] bg-white/90 shadow-[0_24px_60px_-38px_rgba(15,23,42,0.42)]">
              <CardHeader className="pb-4">
                <CardTitle className="text-lg text-[var(--shell-ink)]">Context shared automatically</CardTitle>
                <CardDescription>Reducing the back-and-forth needed just to start triage.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-[var(--shell-muted)]">
                <div className="flex items-center justify-between rounded-xl border border-[var(--shell-border)] bg-slate-50 px-3 py-2">
                  <span>Workspace</span>
                  <span className="font-medium text-slate-800">{workspace.workspaceName}</span>
                </div>
                <div className="flex items-center justify-between rounded-xl border border-[var(--shell-border)] bg-slate-50 px-3 py-2">
                  <span>Plan</span>
                  <span className="font-medium text-slate-800">{planLabel}</span>
                </div>
                <div className="flex items-center justify-between rounded-xl border border-[var(--shell-border)] bg-slate-50 px-3 py-2">
                  <span>Role</span>
                  <span className="font-medium capitalize text-slate-800">{workspace.role.replace("_", " ")}</span>
                </div>
                <div className="flex items-center justify-between rounded-xl border border-[var(--shell-border)] bg-slate-50 px-3 py-2">
                  <span>Requester</span>
                  <span className="font-medium text-slate-800">{displayName}</span>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="flex min-h-[720px] flex-col border-[var(--shell-border)] bg-white/90 shadow-[0_24px_60px_-38px_rgba(15,23,42,0.42)]">
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-lg text-[var(--shell-ink)]">Requests</CardTitle>
                  <CardDescription>Every issue stays in one visible thread.</CardDescription>
                </div>
                <Button variant="outline" className="rounded-full" onClick={() => openDialog()}>
                  <ArrowUpRight className="mr-2 h-4 w-4" />
                  Open
                </Button>
              </div>
            </CardHeader>
            <CardContent className="flex min-h-0 flex-1 flex-col pt-0">
              <Tabs
                value={requestFilter}
                onValueChange={(value) => setRequestFilter(value as "all" | SupportStatus)}
                className="flex min-h-0 flex-1 flex-col"
              >
                <TabsList className="grid grid-cols-2 rounded-2xl bg-slate-100 p-1 text-xs lg:grid-cols-4">
                  {FILTER_LABELS.map((item) => (
                    <TabsTrigger key={item.value} value={item.value} className="rounded-xl text-xs">
                      {item.label}
                    </TabsTrigger>
                  ))}
                </TabsList>

                <TabsContent value={requestFilter} className="mt-4 min-h-0 flex-1">
                  <ScrollArea className="h-[560px] pr-4">
                    <div className="space-y-3">
                      {conversationsQuery.isLoading ? (
                        <div className="flex items-center gap-3 rounded-2xl border border-[var(--shell-border)] bg-slate-50 px-4 py-6 text-sm text-[var(--shell-muted)]">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Loading support requests
                        </div>
                      ) : filteredConversations.length ? (
                        filteredConversations.map((conversation) => (
                          <ConversationCard
                            key={conversation.id}
                            conversation={conversation}
                            selected={conversation.id === selectedConversationId}
                            onSelect={() => setSelectedConversationId(conversation.id)}
                          />
                        ))
                      ) : (
                        <div className="rounded-2xl border border-dashed border-[var(--shell-border)] bg-slate-50 px-4 py-8 text-center">
                          <LifeBuoy className="mx-auto h-8 w-8 text-slate-300" />
                          <p className="mt-3 text-sm font-medium text-slate-700">No support requests match this view.</p>
                          <p className="mt-1 text-xs text-[var(--shell-muted)]">
                            Search less narrowly or open a new request.
                          </p>
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          <Card className="flex min-h-[720px] flex-col border-[var(--shell-border)] bg-white/90 shadow-[0_24px_60px_-38px_rgba(15,23,42,0.42)]">
            {selectedConversation ? (
              <>
                <CardHeader className="pb-4">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge className={cn("border text-[10px] font-semibold uppercase", SUPPORT_STATUS_META[selectedConversation.status].tone)}>
                          {SUPPORT_STATUS_META[selectedConversation.status].label}
                        </Badge>
                        <Badge variant="outline" className={cn("border text-[10px] uppercase", SEVERITY_TONES[selectedConversation.severity])}>
                          {getSupportSeverityLabel(selectedConversation.severity)}
                        </Badge>
                        <Badge variant="outline" className="border-slate-200 bg-white text-[10px] uppercase text-slate-600">
                          {getSupportCategoryLabel(selectedConversation.category)}
                        </Badge>
                      </div>

                      <CardTitle className="mt-3 text-2xl text-[var(--shell-ink)]">{selectedConversation.subject}</CardTitle>
                      <CardDescription className="mt-2 flex flex-wrap items-center gap-3 text-xs">
                        <span>{formatSupportTicketId(selectedConversation.id)}</span>
                        <span>{selectedConversation.source_page || "General support"}</span>
                        <span>Opened {formatDistanceToNow(new Date(selectedConversation.created_at), { addSuffix: true })}</span>
                      </CardDescription>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        className="rounded-full"
                        onClick={() => resolveMutation.mutate()}
                        disabled={resolveMutation.isPending || selectedConversation.status === "resolved"}
                      >
                        {resolveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Mark resolved
                      </Button>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    <div className="rounded-2xl border border-[var(--shell-border)] bg-slate-50 px-4 py-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--shell-muted)]">
                        Response target
                      </p>
                      <p className="mt-2 text-sm font-semibold text-slate-900">
                        {getSupportSlaLabel(selectedConversation.severity)}
                      </p>
                      <p className="mt-1 text-xs text-[var(--shell-muted)]">
                        {getSupportDueDistance(selectedConversation.response_due_at)}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-[var(--shell-border)] bg-slate-50 px-4 py-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--shell-muted)]">Requester</p>
                      <p className="mt-2 text-sm font-semibold text-slate-900">{selectedConversation.requester_name || displayName}</p>
                      <p className="mt-1 text-xs text-[var(--shell-muted)]">{selectedConversation.requester_email || user.email}</p>
                    </div>
                    <div className="rounded-2xl border border-[var(--shell-border)] bg-slate-50 px-4 py-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--shell-muted)]">Support state</p>
                      <p className="mt-2 text-sm font-semibold text-slate-900">
                        {SUPPORT_STATUS_META[selectedConversation.status].description}
                      </p>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="flex min-h-0 flex-1 flex-col pt-0">
                  <ScrollArea className="h-[430px] rounded-3xl border border-[var(--shell-border)] bg-[linear-gradient(180deg,rgba(248,250,252,0.75),rgba(255,255,255,0.92))] p-5">
                    <div className="space-y-4 pr-4">
                      {messagesQuery.isLoading ? (
                        <div className="flex items-center gap-3 rounded-2xl border border-[var(--shell-border)] bg-white px-4 py-6 text-sm text-[var(--shell-muted)]">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Loading conversation history
                        </div>
                      ) : (messagesQuery.data || []).length ? (
                        (messagesQuery.data || []).map((message) => (
                          <MessageBubble
                            key={message.id}
                            message={message}
                            isCustomer={message.author_role === "customer"}
                          />
                        ))
                      ) : (
                        <div className="rounded-2xl border border-dashed border-[var(--shell-border)] bg-white px-4 py-8 text-center text-sm text-[var(--shell-muted)]">
                          This request does not have any conversation updates yet.
                        </div>
                      )}
                    </div>
                  </ScrollArea>

                  <div className="mt-5 rounded-[28px] border border-[var(--shell-border)] bg-white/95 p-4 shadow-[0_18px_40px_-34px_rgba(15,23,42,0.42)]">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-semibold text-[var(--shell-ink)]">
                          {selectedConversation.status === "resolved" ? "Reply to reopen this request" : "Add context or reply"}
                        </p>
                        <p className="mt-1 text-xs text-[var(--shell-muted)]">
                          Keep all updates in one thread so support does not lose the history.
                        </p>
                      </div>
                      <Badge variant="outline" className="border-slate-200 bg-slate-50 text-[10px] uppercase text-slate-600">
                        {selectedConversation.contact_preference === "email" ? "Email follow-up preferred" : "In-app thread"}
                      </Badge>
                    </div>

                    <Textarea
                      value={replyDraft}
                      onChange={(event) => setReplyDraft(event.target.value)}
                      placeholder="Share steps to reproduce, what changed, and the impact on your team."
                      className="mt-4 min-h-[132px] rounded-2xl border-slate-200 bg-slate-50"
                    />

                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--shell-muted)]">
                        <Clock3 className="h-3.5 w-3.5" />
                        <span>Last updated {formatDistanceToNow(new Date(selectedConversation.updated_at), { addSuffix: true })}</span>
                      </div>
                      <Button
                        onClick={() => replyMutation.mutate()}
                        disabled={replyMutation.isPending || !replyDraft.trim()}
                        className="rounded-full bg-slate-900 px-5 text-white hover:bg-slate-800"
                      >
                        {replyMutation.isPending ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Send className="mr-2 h-4 w-4" />
                        )}
                        {selectedConversation.status === "resolved" ? "Reply and reopen" : "Send update"}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </>
            ) : (
              <CardContent className="flex min-h-[720px] flex-col items-center justify-center text-center">
                <LifeBuoy className="h-12 w-12 text-slate-300" />
                <h2 className="mt-5 text-xl font-semibold text-[var(--shell-ink)]">No thread selected</h2>
                <p className="mt-2 max-w-md text-sm leading-7 text-[var(--shell-muted)]">
                  Open a support request to create a persistent thread with context, SLA, and conversation history.
                </p>
                <Button className="mt-6 rounded-full bg-emerald-600 text-white hover:bg-emerald-700" onClick={() => openDialog()}>
                  <MessageSquareText className="mr-2 h-4 w-4" />
                  Open support request
                </Button>
              </CardContent>
            )}
          </Card>
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl rounded-[28px] border-slate-200 p-0 shadow-[0_34px_100px_-38px_rgba(15,23,42,0.5)]">
          <DialogHeader className="border-b border-slate-200 bg-slate-50/80 px-6 py-5">
            <DialogTitle className="text-2xl text-slate-900">Open a support request</DialogTitle>
            <DialogDescription className="text-sm text-slate-600">
              Structured intake reduces the back-and-forth that usually slows down support.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-6 px-6 py-5 lg:grid-cols-[minmax(0,1.2fr)_280px]">
            <div className="space-y-5">
              <div className="grid gap-2">
                <Label htmlFor="support-subject">Subject</Label>
                <Input
                  id="support-subject"
                  value={draft.subject}
                  onChange={(event) => setDraft((current) => ({ ...current, subject: event.target.value }))}
                  placeholder="Example: Inbox stopped syncing replies after reconnecting Gmail"
                  className="h-11 rounded-xl"
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="grid gap-2">
                  <Label>Category</Label>
                  <Select
                    value={draft.category}
                    onValueChange={(value) => setDraft((current) => ({ ...current, category: value as SupportCategory }))}
                  >
                    <SelectTrigger className="h-11 rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SUPPORT_CATEGORY_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-slate-500">
                    {SUPPORT_CATEGORY_OPTIONS.find((option) => option.value === draft.category)?.description}
                  </p>
                </div>

                <div className="grid gap-2">
                  <Label>Severity</Label>
                  <Select
                    value={draft.severity}
                    onValueChange={(value) => setDraft((current) => ({ ...current, severity: value as SupportSeverity }))}
                  >
                    <SelectTrigger className="h-11 rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SUPPORT_SEVERITY_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-slate-500">
                    {SUPPORT_SEVERITY_OPTIONS.find((option) => option.value === draft.severity)?.description}
                  </p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="grid gap-2">
                  <Label>Product area</Label>
                  <Select
                    value={draft.sourcePage}
                    onValueChange={(value) => setDraft((current) => ({ ...current, sourcePage: value }))}
                  >
                    <SelectTrigger className="h-11 rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PRODUCT_AREA_OPTIONS.map((option) => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-2">
                  <Label>Preferred follow-up</Label>
                  <Select
                    value={draft.contactPreference}
                    onValueChange={(value) =>
                      setDraft((current) => ({ ...current, contactPreference: value as "in_app" | "email" }))
                    }
                  >
                    <SelectTrigger className="h-11 rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="in_app">Keep updates in app</SelectItem>
                      <SelectItem value="email">Email follow-up preferred</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="support-description">Describe the issue</Label>
                <Textarea
                  id="support-description"
                  value={draft.description}
                  onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
                  className="min-h-[220px] rounded-2xl"
                  placeholder="What were you trying to do? What happened instead? How many people are affected? Include reproduction steps and what changed recently."
                />
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Auto-attached context</p>
                <div className="mt-4 space-y-3 text-sm text-slate-600">
                  <div className="flex items-start gap-3">
                    <UserRound className="mt-0.5 h-4 w-4 text-slate-400" />
                    <div>
                      <p className="font-medium text-slate-900">{displayName}</p>
                      <p>{user.email}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <ShieldCheck className="mt-0.5 h-4 w-4 text-slate-400" />
                    <div>
                      <p className="font-medium text-slate-900">{workspace.workspaceName}</p>
                      <p>{planLabel} plan · {workspace.role.replace("_", " ")} role</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Clock3 className="mt-0.5 h-4 w-4 text-slate-400" />
                    <div>
                      <p className="font-medium text-slate-900">{getSupportSlaLabel(draft.severity)}</p>
                      <p>Used to set the initial response target.</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-3xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                <div className="flex items-start gap-3">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>
                    <p className="font-semibold">Before you submit</p>
                    <p className="mt-1 text-amber-800">
                      Include the product area, the exact impact, and whether the issue is repeatable. That is the
                      difference between one reply and four.
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
                <div className="flex items-start gap-3">
                  <BookOpen className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>
                    <p className="font-semibold">Self-serve still matters</p>
                    <p className="mt-1 text-emerald-800">
                      Strong SaaS support starts with guidance, but keeps escalation simple. This form is never hidden
                      behind article walls.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <Separator />
          <DialogFooter className="px-6 py-4">
            <Button variant="outline" className="rounded-full" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              className="rounded-full bg-emerald-600 text-white hover:bg-emerald-700"
              onClick={() => createConversationMutation.mutate()}
              disabled={createConversationMutation.isPending}
            >
              {createConversationMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <MessageSquareText className="mr-2 h-4 w-4" />
              )}
              Create request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default SupportWorkspace;

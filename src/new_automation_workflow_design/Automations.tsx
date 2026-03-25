import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Activity,
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Copy,
  Edit3,
  Eye,
  Filter,
  LayoutGrid,
  List,
  Loader2,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  TrendingUp,
  Users,
  Workflow,
  Zap,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import DashboardLayout from "@/components/Layout/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import type {
  AutomationContactStats,
  AutomationDependencyData,
  AutomationLog,
  AutomationWorkflow,
  AutomationWorkflowTemplate,
} from "@/lib/automations";
import {
  createAutomationWorkflow,
  createAutomationWorkflowFromTemplate,
  createDefaultFlow,
  deleteAutomationWorkflow,
  duplicateAutomationWorkflow,
  getAutomationStatsBatch,
  listAutomationWorkflowTemplates,
  listRecentAutomationLogsByWorkflow,
  listAutomationWorkflows,
  loadAutomationDependencies,
  runAutomationRunner,
  updateAutomationWorkflow,
} from "@/lib/automations";
import { cn } from "@/lib/utils";
import { useAuth } from "@/providers/AuthProvider";
import { useWorkspace } from "@/providers/WorkspaceProvider";
import { normalizeTeamErrorMessage, submitApprovalRequest } from "@/lib/teamManagement";
import WorkflowBuilder, { type WorkflowDesignerSaveRequest } from "./WorkflowBuilder";
import { compileGraphToLegacyFlow, extractGraphFromWorkflow, withGraphInSettings } from "@/workflow/services/workflowAdapter";
import { canPublishWorkflow } from "@/workflow/utils/review";

type WorkflowViewMode = "grid" | "list";
type AutomationTab = "workflows" | "templates" | "activity";
type RunStatus = "completed" | "failed" | "running" | "waiting";

type ActivityRow = {
  id: string;
  workflowId: string;
  workflowName: string;
  contactEmail: string;
  status: RunStatus;
  step: string;
  timestamp: string;
};

const emptyDependencies: AutomationDependencyData = {
  emailLists: [],
  contactSegments: [],
  emailTemplates: [],
  emailConfigs: [],
};

const emptyStats: AutomationContactStats = {
  total: 0,
  active: 0,
  completed: 0,
  failed: 0,
  due: 0,
};

const statusConfig: Record<
  AutomationWorkflow["status"],
  { label: string; color: string; dotColor: string; bgColor: string }
> = {
  live: {
    label: "Live",
    color: "text-emerald-700",
    dotColor: "bg-emerald-500",
    bgColor: "bg-emerald-50 border-emerald-200",
  },
  paused: {
    label: "Paused",
    color: "text-amber-700",
    dotColor: "bg-amber-500",
    bgColor: "bg-amber-50 border-amber-200",
  },
  draft: {
    label: "Draft",
    color: "text-slate-500",
    dotColor: "bg-slate-400",
    bgColor: "bg-slate-50 border-slate-200",
  },
  archived: {
    label: "Archived",
    color: "text-neutral-500",
    dotColor: "bg-neutral-400",
    bgColor: "bg-neutral-50 border-neutral-200",
  },
};

const runStatusConfig: Record<RunStatus, { icon: typeof CheckCircle2; color: string }> = {
  completed: { icon: CheckCircle2, color: "text-emerald-600" },
  failed: { icon: AlertCircle, color: "text-red-500" },
  running: { icon: Activity, color: "text-blue-500" },
  waiting: { icon: RefreshCw, color: "text-amber-500" },
};

const triggerIcons = {
  custom_event: Zap,
  list_joined: Users,
  manual: Play,
} as const;

const triggerLabels = {
  custom_event: "webhook",
  list_joined: "list",
  manual: "manual",
} as const;

const formatDate = (value: string | null | undefined) => {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Never";
  return `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, "0")}-${`${date.getDate()}`.padStart(2, "0")}`;
};

const formatRelativeShort = (value: string | null | undefined) => {
  if (!value) return null;
  const date = new Date(value);
  const timestamp = date.getTime();
  if (Number.isNaN(timestamp)) return null;
  const diffMs = Date.now() - timestamp;
  const diffSeconds = Math.max(0, Math.round(diffMs / 1000));
  if (diffSeconds < 60) return `${diffSeconds}s ago`;
  const diffMinutes = Math.round(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes} min ago`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
  const diffDays = Math.round(diffHours / 24);
  if (diffDays < 7) return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
  const diffWeeks = Math.round(diffDays / 7);
  if (diffWeeks < 5) return `${diffWeeks} week${diffWeeks === 1 ? "" : "s"} ago`;
  const diffMonths = Math.round(diffDays / 30);
  if (diffMonths < 12) return `${diffMonths} month${diffMonths === 1 ? "" : "s"} ago`;
  const diffYears = Math.round(diffDays / 365);
  return `${diffYears} year${diffYears === 1 ? "" : "s"} ago`;
};

const toObject = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
};

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Unexpected error.";
};

const successRateFromStats = (stats: AutomationContactStats) => {
  const total = stats.completed + stats.failed;
  if (total <= 0) return 0;
  return Number(((stats.completed / total) * 100).toFixed(1));
};

const getWorkflowStepCount = (workflow: AutomationWorkflow) =>
  extractGraphFromWorkflow(workflow).nodes.filter(
    (node) => node.kind !== "trigger" && node.kind !== "exit",
  ).length;

const getWorkflowTags = (workflow: AutomationWorkflow) => {
  const settingsTags = Array.isArray(toObject(workflow.settings).tags)
    ? (toObject(workflow.settings).tags as unknown[])
        .map((tag) => String(tag || "").trim())
        .filter(Boolean)
    : [];
  if (settingsTags.length > 0) {
    return settingsTags.slice(0, 3);
  }

  const flowTags = workflow.flow
    .map((step) => step.type.replace(/_/g, " "))
    .filter(Boolean);
  return Array.from(
    new Set([triggerLabels[workflow.trigger_type], ...flowTags]),
  ).slice(0, 3);
};

const getWorkflowApprovalStatus = (
  workflow: AutomationWorkflow,
  requiresApproval: boolean,
) => {
  const explicit = String(workflow.approval_status || "").trim();
  if (explicit) return explicit;
  return requiresApproval ? "draft" : "approved";
};

const buildActivityRows = (
  workflows: AutomationWorkflow[],
  logsByWorkflowId: Record<string, AutomationLog[]>,
) => {
  const workflowById = new Map(workflows.map((workflow) => [workflow.id, workflow]));

  const rows = Object.values(logsByWorkflowId)
    .flat()
    .sort(
      (left, right) =>
        new Date(right.created_at).getTime() - new Date(left.created_at).getTime(),
    )
    .slice(0, 10)
    .map((log) => {
      const workflow = workflowById.get(log.workflow_id);
      const metadata = toObject(log.metadata);
      const lowerType = String(log.event_type || "").toLowerCase();
      const status: RunStatus = lowerType.includes("fail") || lowerType.includes("error")
        ? "failed"
        : lowerType.includes("wait")
          ? "waiting"
          : lowerType.includes("complete") || lowerType.includes("sent")
            ? "completed"
            : "running";

      const stepName =
        typeof log.step_index === "number" && workflow?.flow[log.step_index]
          ? workflow.flow[log.step_index].name
          : log.message || "Workflow event";

      return {
        id: log.id,
        workflowId: log.workflow_id,
        workflowName: workflow?.name || "Automation",
        contactEmail:
          String(
            metadata.contact_email ||
              metadata.email ||
              metadata.to_email ||
              metadata.recipient ||
              "Unknown contact",
          ) || "Unknown contact",
        status,
        step: stepName,
        timestamp: formatRelativeShort(log.created_at) || "Just now",
      } satisfies ActivityRow;
    });

  return rows;
};

const buildSaveRequestFromWorkflow = (
  workflow: AutomationWorkflow,
): WorkflowDesignerSaveRequest => {
  const graph = extractGraphFromWorkflow(workflow);
  const compiled = compileGraphToLegacyFlow(graph);
  return {
    workflowPatch: {},
    payload: {
      graph,
      compiledFlow: compiled.flow,
      compileErrors: compiled.errors,
      checklistPass: canPublishWorkflow(graph),
    },
  };
};

const StatCard = ({
  label,
  value,
  icon: Icon,
  trend,
  trendLabel,
  accent = false,
}: {
  label: string;
  value: string | number;
  icon: typeof Workflow;
  trend?: number;
  trendLabel?: string;
  accent?: boolean;
}) => (
  <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
    <Card
      className={cn(
        "border transition-all duration-200 hover:shadow-md",
        accent ? "border-primary/20 bg-primary/[0.03]" : "border-border",
      )}
    >
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {label}
            </p>
            <p className="text-2xl font-bold tracking-tight text-foreground">{value}</p>
          </div>
          <div
            className={cn(
              "rounded-lg p-2.5",
              accent ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
            )}
          >
            <Icon className="h-5 w-5" />
          </div>
        </div>
        {trend !== undefined ? (
          <div className="mt-3 flex items-center gap-1.5">
            <TrendingUp
              className={cn(
                "h-3.5 w-3.5",
                trend >= 0 ? "text-emerald-600" : "text-red-500",
              )}
            />
            <span
              className={cn(
                "text-xs font-medium",
                trend >= 0 ? "text-emerald-600" : "text-red-500",
              )}
            >
              {trend > 0 ? "+" : ""}
              {trend}%
            </span>
            {trendLabel ? (
              <span className="text-xs text-muted-foreground">{trendLabel}</span>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  </motion.div>
);

const WorkflowCard = ({
  workflow,
  stats,
  approvalStatus,
  viewMode,
  busy,
  onOpen,
  onEdit,
  onDuplicate,
  onViewLogs,
  onToggleLive,
  onRunNow,
  onEnrollNow,
  onDelete,
}: {
  workflow: AutomationWorkflow;
  stats: AutomationContactStats;
  approvalStatus: string;
  viewMode: WorkflowViewMode;
  busy: boolean;
  onOpen: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onViewLogs: () => void;
  onToggleLive: () => void;
  onRunNow: () => void;
  onEnrollNow: () => void;
  onDelete: () => void;
}) => {
  const status = statusConfig[workflow.status];
  const TriggerIcon = triggerIcons[workflow.trigger_type];
  const successRate = successRateFromStats(stats);
  const tags = getWorkflowTags(workflow);
  const stepCount = getWorkflowStepCount(workflow);

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
      <Card
        className={cn(
          "group cursor-pointer border border-border transition-all duration-200 hover:border-primary/20 hover:shadow-lg",
          viewMode === "list" && "w-full",
        )}
        onClick={onOpen}
      >
        <CardContent className="p-0">
          <div className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="mb-1.5 flex items-center gap-2.5">
                  <Badge
                    variant="outline"
                    className={cn(
                      "border px-2 py-0.5 text-[11px] font-medium",
                      status.bgColor,
                      status.color,
                    )}
                  >
                    <span
                      className={cn(
                        "mr-1.5 inline-block h-1.5 w-1.5 rounded-full",
                        status.dotColor,
                        workflow.status === "live" && "animate-pulse",
                      )}
                    />
                    {status.label}
                  </Badge>
                  {approvalStatus === "pending_approval" ? (
                    <Badge
                      variant="outline"
                      className="border-orange-200 bg-orange-50 text-[11px] text-orange-600"
                    >
                      <AlertCircle className="mr-1 h-3 w-3" />
                      Pending
                    </Badge>
                  ) : null}
                </div>
                <h3 className="truncate text-sm font-semibold text-foreground transition-colors group-hover:text-primary">
                  {workflow.name}
                </h3>
                <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                  {workflow.description || "No description yet."}
                </p>
              </div>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 opacity-0 transition-opacity group-hover:opacity-100"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  <DropdownMenuItem onClick={onEdit} disabled={busy}>
                    <Edit3 className="mr-2 h-3.5 w-3.5" />
                    Edit workflow
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={onDuplicate} disabled={busy}>
                    <Copy className="mr-2 h-3.5 w-3.5" />
                    Duplicate
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={onViewLogs} disabled={busy}>
                    <Eye className="mr-2 h-3.5 w-3.5" />
                    View logs
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={onToggleLive} disabled={busy}>
                    {workflow.status === "live" ? (
                      <Pause className="mr-2 h-3.5 w-3.5" />
                    ) : (
                      <Play className="mr-2 h-3.5 w-3.5" />
                    )}
                    {workflow.status === "live" ? "Pause" : "Activate"}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={onRunNow} disabled={busy}>
                    <RefreshCw className="mr-2 h-3.5 w-3.5" />
                    Run now
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={onEnrollNow} disabled={busy}>
                    <Users className="mr-2 h-3.5 w-3.5" />
                    Enroll now
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive"
                    onClick={onDelete}
                    disabled={busy}
                  >
                    <Trash2 className="mr-2 h-3.5 w-3.5" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div className="mt-4 flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <TriggerIcon className="h-3.5 w-3.5" />
                {triggerLabels[workflow.trigger_type]}
              </span>
              <span className="flex items-center gap-1">
                <Workflow className="h-3.5 w-3.5" />
                {stepCount} steps
              </span>
              {workflow.last_run_at ? (
                <span className="flex items-center gap-1">
                  <RefreshCw className="h-3.5 w-3.5" />
                  {formatRelativeShort(workflow.last_run_at)}
                </span>
              ) : null}
            </div>

            {tags.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {tags.map((tag) => (
                  <Badge key={`${workflow.id}_${tag}`} variant="secondary" className="text-[10px]">
                    {tag}
                  </Badge>
                ))}
              </div>
            ) : null}
          </div>

          <Separator />
          <div className="flex items-center justify-between px-5 py-3">
            <div className="flex items-center gap-4">
              <div className="text-center">
                <p className="text-sm font-semibold text-foreground">
                  {stats.active.toLocaleString()}
                </p>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Active
                </p>
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-foreground">
                  {stats.completed.toLocaleString()}
                </p>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Completed
                </p>
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-red-500">
                  {stats.failed.toLocaleString()}
                </p>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Failed
                </p>
              </div>
            </div>
            {successRate > 0 ? (
              <div className="flex items-center gap-2">
                <Progress value={successRate} className="h-1.5 w-16" />
                <span className="text-xs font-medium text-emerald-600">
                  {successRate}%
                </span>
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
};

const TemplateCard = ({
  template,
  onUse,
}: {
  template: AutomationWorkflowTemplate;
  onUse: () => void;
}) => (
  <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
    <Card className="group h-full cursor-pointer border border-border transition-all duration-200 hover:border-primary/20 hover:shadow-lg">
      <CardContent className="flex h-full flex-col p-5">
        <div className="mb-3 flex items-start justify-between">
          <div className="rounded-lg bg-primary/10 p-2.5 text-primary">
            <Sparkles className="h-5 w-5" />
          </div>
          <Badge variant="secondary" className="text-[10px]">
            {template.category}
          </Badge>
        </div>
        <h3 className="text-sm font-semibold text-foreground transition-colors group-hover:text-primary">
          {template.name}
        </h3>
        <p className="mt-1.5 flex-1 text-xs text-muted-foreground">
          {template.description || template.use_case || "Automation template"}
        </p>
        <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Workflow className="h-3 w-3" />
              {extractGraphFromWorkflow({
                ...template,
                user_id: "",
                status: "draft",
                approval_status: null,
                approval_request_id: null,
                approved_at: null,
                approved_by_user_id: null,
                trigger_list_id: null,
                run_summary: null,
                last_run_at: null,
                published_at: null,
              } as AutomationWorkflow).nodes.filter(
                (node) => node.kind !== "trigger" && node.kind !== "exit",
              ).length}{" "}
              steps
            </span>
            <span className="flex items-center gap-1">
              <Zap className="h-3 w-3" />
              {triggerLabels[template.trigger_type]}
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs opacity-0 transition-opacity group-hover:opacity-100"
            onClick={onUse}
          >
            Use
            <ArrowRight className="ml-1 h-3 w-3" />
          </Button>
        </div>
      </CardContent>
    </Card>
  </motion.div>
);

const RunRow = ({ run }: { run: ActivityRow }) => {
  const config = runStatusConfig[run.status];
  const StatusIcon = config.icon;

  return (
    <div className="group flex items-center gap-3 rounded-md px-1 py-2.5 transition-colors hover:bg-muted/50">
      <StatusIcon className={cn("h-4 w-4 shrink-0", config.color)} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-foreground">
            {run.workflowName}
          </span>
          <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
          <span className="truncate text-xs text-muted-foreground">{run.step}</span>
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">{run.contactEmail}</p>
      </div>
      <span className="whitespace-nowrap text-xs text-muted-foreground">
        {run.timestamp}
      </span>
    </div>
  );
};

const Automations = () => {
  const { user, loading } = useAuth();
  const { workspace } = useWorkspace();
  const navigate = useNavigate();
  const userId = user?.id ?? null;
  const requiresAutomationApproval = Boolean(workspace?.requiresApproval.automation);
  const supportsApiWebhooks = workspace ? workspace.planFeatures?.apiWebhooks !== false : true;

  const [initializing, setInitializing] = useState(true);
  const [workflows, setWorkflows] = useState<AutomationWorkflow[]>([]);
  const [dependencies, setDependencies] =
    useState<AutomationDependencyData>(emptyDependencies);
  const [templates, setTemplates] = useState<AutomationWorkflowTemplate[]>([]);
  const [workflowStatsById, setWorkflowStatsById] = useState<
    Record<string, AutomationContactStats>
  >({});
  const [logsByWorkflowId, setLogsByWorkflowId] = useState<
    Record<string, AutomationLog[]>
  >({});
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [viewMode, setViewMode] = useState<WorkflowViewMode>("grid");
  const [activeTab, setActiveTab] = useState<AutomationTab>("workflows");
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [newWorkflowName, setNewWorkflowName] = useState("");
  const [editingWorkflowDraft, setEditingWorkflowDraft] =
    useState<AutomationWorkflow | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !userId) {
      navigate("/auth");
    }
  }, [loading, navigate, userId]);

  const handleTabChange = useCallback(
    (tab: string) => {
      if (tab === "home") navigate("/dashboard");
      else if (tab === "campaigns") navigate("/campaigns");
      else if (tab === "inbox") navigate("/inbox");
      else if (tab === "automations") navigate("/automations");
      else if (tab === "pipeline") navigate("/pipeline");
      else if (
        tab === "contacts" ||
        tab === "segments" ||
        tab === "templates" ||
        tab === "connect" ||
        tab === "settings"
      ) {
        navigate(`/dashboard?tab=${tab}`);
      } else {
        navigate(`/${tab}`);
      }
    },
    [navigate],
  );

  const refreshWorkflowInsights = useCallback(async (workflowId: string) => {
    if (!userId) return;

    const [statsByWorkflowId, logsByWorkflowId] = await Promise.all([
      getAutomationStatsBatch([workflowId]),
      listRecentAutomationLogsByWorkflow(userId, [workflowId], {
        totalLimit: 10,
        perWorkflowLimit: 5,
      }),
    ]);
    setWorkflowStatsById((current) => ({
      ...current,
      [workflowId]: statsByWorkflowId[workflowId] || emptyStats,
    }));
    setLogsByWorkflowId((current) => ({
      ...current,
      [workflowId]: logsByWorkflowId[workflowId] || [],
    }));
  }, [userId]);

  const loadData = useCallback(
    async ({ initial = false }: { initial?: boolean } = {}) => {
      if (!userId) return;
      if (initial) setInitializing(true);

      try {
        const [workflowRows, dependencyRows, templateRows] = await Promise.all([
          listAutomationWorkflows(userId),
          loadAutomationDependencies(userId),
          listAutomationWorkflowTemplates(),
        ]);

        const workflowIds = workflowRows.map((workflow) => workflow.id);
        const [statsByWorkflowId, logsByWorkflowId] = await Promise.all([
          getAutomationStatsBatch(workflowIds),
          listRecentAutomationLogsByWorkflow(userId, workflowIds, {
            totalLimit: Math.max(25, Math.min(workflowIds.length * 8, 100)),
            perWorkflowLimit: 5,
          }),
        ]);

        setWorkflows(workflowRows);
        setDependencies(dependencyRows);
        setTemplates(templateRows);
        setWorkflowStatsById(statsByWorkflowId);
        setLogsByWorkflowId(logsByWorkflowId);
      } catch (error) {
        toast({
          title: "Load failed",
          description: getErrorMessage(error),
          variant: "destructive",
        });
      } finally {
        if (initial) setInitializing(false);
      }
    },
    [userId],
  );

  useEffect(() => {
    if (userId) {
      void loadData({ initial: true });
    }
  }, [loadData, userId]);

  const runAction = useCallback(async (name: string, work: () => Promise<void>) => {
    setBusy(name);
    try {
      await work();
    } catch (error) {
      toast({
        title: "Action failed",
        description: normalizeTeamErrorMessage(error) || getErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  }, []);

  const persistWorkflow = useCallback(
    async (
      workflow: AutomationWorkflow,
      request: WorkflowDesignerSaveRequest,
      options: { statusOverride?: AutomationWorkflow["status"]; quiet?: boolean } = {},
    ) => {
      const nextTriggerType =
        (request.workflowPatch.trigger_type as AutomationWorkflow["trigger_type"]) ||
        workflow.trigger_type;

      if (!supportsApiWebhooks && nextTriggerType === "custom_event") {
        toast({
          title: "Webhook triggers require an upgrade",
          description: "Webhook automations are available on Growth plan or higher.",
          variant: "destructive",
        });
        return null;
      }

      if (options.statusOverride === "live" && !request.payload.checklistPass) {
        toast({
          title: "Publish blocked",
          description: "Fix the workflow checks before going live.",
          variant: "destructive",
        });
        return null;
      }

      const nextStatus = options.statusOverride || workflow.status;
      const nextSettings = withGraphInSettings(
        toObject(request.workflowPatch.settings || workflow.settings),
        request.payload.graph,
      );

      const updated = await updateAutomationWorkflow(workflow.id, {
        name: String(request.workflowPatch.name || workflow.name || "Untitled automation").trim(),
        description: workflow.description,
        trigger_type: nextTriggerType,
        trigger_list_id:
          nextTriggerType === "list_joined"
            ? (request.workflowPatch.trigger_list_id as string | null | undefined) ??
              workflow.trigger_list_id
            : null,
        trigger_filters: toObject(
          request.workflowPatch.trigger_filters ?? workflow.trigger_filters,
        ),
        flow: request.payload.compiledFlow,
        settings: nextSettings,
        status: nextStatus,
        published_at:
          nextStatus === "live"
            ? workflow.published_at || new Date().toISOString()
            : workflow.published_at,
      });

      setWorkflows((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      if (editingWorkflowDraft?.id === updated.id) {
        setEditingWorkflowDraft(updated);
      }
      await refreshWorkflowInsights(updated.id);

      if (!options.quiet) {
        toast({
          title: "Saved",
          description:
            request.payload.compileErrors.length > 0
              ? `Workflow saved with ${request.payload.compileErrors.length} compatibility note(s).`
              : "Workflow updated.",
        });
      }

      return updated;
    },
    [editingWorkflowDraft?.id, refreshWorkflowInsights, supportsApiWebhooks],
  );

  const selectedWorkflow = useMemo(
    () => workflows.find((workflow) => workflow.id === selectedWorkflowId) || null,
    [selectedWorkflowId, workflows],
  );
  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === selectedTemplateId) || null,
    [selectedTemplateId, templates],
  );
  const recentActivity = useMemo(
    () => buildActivityRows(workflows, logsByWorkflowId),
    [logsByWorkflowId, workflows],
  );

  const filteredWorkflows = useMemo(
    () =>
      workflows.filter((workflow) => {
        if (statusFilter !== "all" && workflow.status !== statusFilter) return false;
        const haystack = `${workflow.name} ${workflow.description || ""}`.toLowerCase();
        return !searchQuery || haystack.includes(searchQuery.toLowerCase());
      }),
    [searchQuery, statusFilter, workflows],
  );

  const totalActive = workflows.filter((workflow) => workflow.status === "live").length;
  const totalContacts = Object.values(workflowStatsById).reduce(
    (sum, stats) => sum + stats.active,
    0,
  );
  const avgSuccess = useMemo(() => {
    const values = Object.values(workflowStatsById)
      .map(successRateFromStats)
      .filter((value) => value > 0);
    if (values.length === 0) return 0;
    return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1));
  }, [workflowStatsById]);

  const openBuilder = useCallback((workflow: AutomationWorkflow) => {
    setEditingWorkflowDraft(workflow);
    setSelectedWorkflowId(null);
  }, []);

  const createNewAutomation = useCallback(async () => {
    if (!user) return;
    const created = await createAutomationWorkflow(user.id, {
      name: `Automation ${workflows.length + 1}`,
      flow: createDefaultFlow(),
      status: "draft",
      trigger_type: "list_joined",
      trigger_list_id: dependencies.emailLists[0]?.id || null,
    });
    setWorkflows((current) => [created, ...current]);
    setWorkflowStatsById((current) => ({ ...current, [created.id]: emptyStats }));
    setLogsByWorkflowId((current) => ({ ...current, [created.id]: [] }));
    setEditingWorkflowDraft(created);
  }, [dependencies.emailLists, user, workflows.length]);

  const duplicateWorkflow = useCallback(
    async (workflow: AutomationWorkflow) => {
      if (!user) return;
      const duplicate = await duplicateAutomationWorkflow(user.id, workflow);
      setWorkflows((current) => [duplicate, ...current]);
      setWorkflowStatsById((current) => ({ ...current, [duplicate.id]: emptyStats }));
      setLogsByWorkflowId((current) => ({ ...current, [duplicate.id]: [] }));
    },
    [user],
  );

  const deleteWorkflow = useCallback(async (workflow: AutomationWorkflow) => {
    if (!window.confirm(`Delete "${workflow.name}"?`)) return;
    await deleteAutomationWorkflow(workflow.id);
    setWorkflows((current) => current.filter((item) => item.id !== workflow.id));
    setWorkflowStatsById((current) => {
      const next = { ...current };
      delete next[workflow.id];
      return next;
    });
    setLogsByWorkflowId((current) => {
      const next = { ...current };
      delete next[workflow.id];
      return next;
    });
    setSelectedWorkflowId((current) => (current === workflow.id ? null : current));
  }, []);

  const toggleWorkflowLiveState = useCallback(
    async (workflow: AutomationWorkflow) => {
      if (workflow.status === "live") {
        await updateAutomationWorkflow(workflow.id, { status: "paused" });
        setWorkflows((current) =>
          current.map((item) =>
            item.id === workflow.id ? { ...item, status: "paused" } : item,
          ),
        );
        return;
      }

      const request = buildSaveRequestFromWorkflow(workflow);
      if (requiresAutomationApproval) {
        if (!request.payload.checklistPass) {
          toast({
            title: "Submit blocked",
            description: "Fix the workflow checks before requesting approval.",
            variant: "destructive",
          });
          return;
        }

        await submitApprovalRequest("automation", workflow.id, {
          reason: "Automation activation review",
          comments: `Submitted workflow "${workflow.name}" for go-live approval.`,
          metadata: { desired_status: "live" },
        });
        await loadData();
        return;
      }

      await persistWorkflow(workflow, request, { statusOverride: "live", quiet: true });
    },
    [loadData, persistWorkflow, requiresAutomationApproval],
  );

  const runWorkflowNow = useCallback(
    async (workflow: AutomationWorkflow) => {
      const result = await runAutomationRunner("run_now", workflow.id);
      toast({
        title: "Run complete",
        description: `Processed ${Number(result?.summary?.processed || 0)} contacts.`,
      });
      await loadData();
    },
    [loadData],
  );

  const enrollWorkflowNow = useCallback(
    async (workflow: AutomationWorkflow) => {
      const result = await runAutomationRunner("enroll_now", workflow.id);
      toast({
        title: "Enrollment complete",
        description: `Enrolled ${Number(result?.enrolled || 0)} contacts.`,
      });
      await loadData();
    },
    [loadData],
  );

  const handleUseTemplate = useCallback(
    async (template: AutomationWorkflowTemplate) => {
      if (!user) return;
      if (!supportsApiWebhooks && template.trigger_type === "custom_event") {
        toast({
          title: "Webhook templates require an upgrade",
          description: "Webhook templates are available on Growth plan or higher.",
          variant: "destructive",
        });
        return;
      }

      const created = await createAutomationWorkflowFromTemplate(user.id, template, {
        name: newWorkflowName.trim() || template.name,
        trigger_list_id:
          template.trigger_type === "list_joined"
            ? dependencies.emailLists[0]?.id || null
            : null,
      });

      const createdFilters = toObject(created.trigger_filters);
      const normalizedCreated =
        created.trigger_type === "custom_event" &&
        !String(createdFilters.webhook_secret || "").trim()
          ? await updateAutomationWorkflow(created.id, {
              trigger_filters: {
                ...createdFilters,
                webhook_secret: `whsec_${Math.random().toString(36).slice(2, 18)}`,
              },
            })
          : created;

      setWorkflows((current) => [normalizedCreated, ...current]);
      setWorkflowStatsById((current) => ({
        ...current,
        [normalizedCreated.id]: emptyStats,
      }));
      setLogsByWorkflowId((current) => ({ ...current, [normalizedCreated.id]: [] }));
      setSelectedTemplateId(null);
      setNewWorkflowName("");
      setEditingWorkflowDraft(normalizedCreated);
    },
    [dependencies.emailLists, newWorkflowName, supportsApiWebhooks, user],
  );

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <DashboardLayout
      activeTab="automations"
      onTabChange={handleTabChange}
      user={user}
      onLogout={async () => {
        await supabase.auth.signOut();
        navigate("/auth");
      }}
      contentClassName="max-w-[1440px]"
    >
      {initializing ? (
        <div className="flex min-h-[60vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex items-center justify-between border-b border-border pb-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-primary/10 p-2">
                <Workflow className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h1 className="text-lg font-bold tracking-tight text-foreground">
                  Automations
                </h1>
                <p className="text-xs text-muted-foreground">
                  Build, manage, and optimize your workflows
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-9"
                onClick={() => void runAction("refresh", () => loadData())}
                disabled={!!busy}
              >
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                Refresh
              </Button>
              <Button
                size="sm"
                className="h-9"
                onClick={() => void runAction("create", createNewAutomation)}
                disabled={!!busy}
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                New automation
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Total Workflows" value={workflows.length} icon={Workflow} trend={12} trendLabel="vs last month" />
            <StatCard label="Active Now" value={totalActive} icon={Activity} accent trend={8} trendLabel="vs last week" />
            <StatCard label="Contacts in Flow" value={totalContacts.toLocaleString()} icon={Users} trend={23} trendLabel="vs last month" />
            <StatCard label="Avg. Success Rate" value={`${avgSuccess.toFixed(1)}%`} icon={CheckCircle2} trend={2.1} trendLabel="improvement" />
          </div>

          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as AutomationTab)} className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <TabsList className="h-10">
                <TabsTrigger value="workflows" className="px-4 text-sm">
                  <Zap className="mr-1.5 h-3.5 w-3.5" />
                  Workflows
                </TabsTrigger>
                <TabsTrigger value="templates" className="px-4 text-sm">
                  <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                  Templates
                </TabsTrigger>
                <TabsTrigger value="activity" className="px-4 text-sm">
                  <Activity className="mr-1.5 h-3.5 w-3.5" />
                  Activity
                </TabsTrigger>
              </TabsList>

              {activeTab === "workflows" ? (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Search workflows..."
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.target.value)}
                      className="h-9 w-56 pl-9 text-sm"
                    />
                  </div>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="h-9 w-32 text-sm">
                      <Filter className="mr-1.5 h-3.5 w-3.5 text-muted-foreground" />
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All status</SelectItem>
                      <SelectItem value="live">Live</SelectItem>
                      <SelectItem value="paused">Paused</SelectItem>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="archived">Archived</SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="flex items-center rounded-md border border-border">
                    <Button
                      variant={viewMode === "grid" ? "secondary" : "ghost"}
                      size="icon"
                      className="h-9 w-9 rounded-r-none"
                      onClick={() => setViewMode("grid")}
                    >
                      <LayoutGrid className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant={viewMode === "list" ? "secondary" : "ghost"}
                      size="icon"
                      className="h-9 w-9 rounded-l-none"
                      onClick={() => setViewMode("list")}
                    >
                      <List className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </motion.div>
              ) : null}
            </div>

            <TabsContent value="workflows" className="mt-0">
              {filteredWorkflows.length === 0 ? (
                <div className="py-20 text-center">
                  <div className="mx-auto mb-4 w-fit rounded-full bg-muted p-4">
                    <Search className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <h3 className="text-sm font-medium text-foreground">No workflows found</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Try adjusting your search or filters
                  </p>
                </div>
              ) : (
                <div
                  className={cn(
                    viewMode === "grid"
                      ? "grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"
                      : "space-y-3",
                  )}
                >
                  {filteredWorkflows.map((workflow) => (
                    <WorkflowCard
                      key={workflow.id}
                      workflow={workflow}
                      stats={workflowStatsById[workflow.id] || emptyStats}
                      approvalStatus={getWorkflowApprovalStatus(
                        workflow,
                        requiresAutomationApproval,
                      )}
                      viewMode={viewMode}
                      busy={!!busy}
                      onOpen={() => setSelectedWorkflowId(workflow.id)}
                      onEdit={() => openBuilder(workflow)}
                      onDuplicate={() =>
                        void runAction("duplicate", () => duplicateWorkflow(workflow))
                      }
                      onViewLogs={() => {
                        setSelectedWorkflowId(null);
                        setActiveTab("activity");
                      }}
                      onToggleLive={() =>
                        void runAction("toggle", () => toggleWorkflowLiveState(workflow))
                      }
                      onRunNow={() =>
                        void runAction("run", () => runWorkflowNow(workflow))
                      }
                      onEnrollNow={() =>
                        void runAction("enroll", () => enrollWorkflowNow(workflow))
                      }
                      onDelete={() =>
                        void runAction("delete", () => deleteWorkflow(workflow))
                      }
                    />
                  ))}
                </div>
              )}
            </TabsContent>
            <TabsContent value="templates" className="mt-0">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {templates.map((template) => (
                  <TemplateCard
                    key={template.id}
                    template={template}
                    onUse={() => setSelectedTemplateId(template.id)}
                  />
                ))}
              </div>
            </TabsContent>

            <TabsContent value="activity" className="mt-0">
              <Card className="border border-border">
                <CardContent className="p-0">
                  <div className="flex items-center justify-between border-b border-border px-5 py-4">
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">
                        Recent Activity
                      </h3>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Real-time view of workflow executions
                      </p>
                    </div>
                    <Button variant="ghost" size="sm" className="text-xs" onClick={() => void runAction("refresh", () => loadData())}>
                      View all
                      <ArrowRight className="ml-1 h-3 w-3" />
                    </Button>
                  </div>
                  <div className="divide-y divide-border px-4 py-2">
                    {recentActivity.map((run) => (
                      <RunRow key={run.id} run={run} />
                    ))}
                    {recentActivity.length === 0 ? (
                      <div className="px-2 py-8 text-center text-sm text-muted-foreground">
                        No workflow activity yet.
                      </div>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      )}

      <Dialog open={!!selectedWorkflow} onOpenChange={(open) => !open && setSelectedWorkflowId(null)}>
        <DialogContent className="sm:max-w-lg">
          {selectedWorkflow ? (
            <>
              <DialogHeader>
                <div className="mb-1 flex items-center gap-2">
                  <Badge
                    variant="outline"
                    className={cn(
                      "border px-2 py-0.5 text-[11px] font-medium",
                      statusConfig[selectedWorkflow.status].bgColor,
                      statusConfig[selectedWorkflow.status].color,
                    )}
                  >
                    <span
                      className={cn(
                        "mr-1.5 inline-block h-1.5 w-1.5 rounded-full",
                        statusConfig[selectedWorkflow.status].dotColor,
                      )}
                    />
                    {statusConfig[selectedWorkflow.status].label}
                  </Badge>
                </div>
                <DialogTitle className="text-lg">{selectedWorkflow.name}</DialogTitle>
                <DialogDescription>
                  {selectedWorkflow.description || "No description yet."}
                </DialogDescription>
              </DialogHeader>

              <div className="mt-2 space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-lg bg-muted/50 p-3 text-center">
                    <p className="text-lg font-bold text-foreground">
                      {(workflowStatsById[selectedWorkflow.id] || emptyStats).active.toLocaleString()}
                    </p>
                    <p className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                      Active
                    </p>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-3 text-center">
                    <p className="text-lg font-bold text-foreground">
                      {(workflowStatsById[selectedWorkflow.id] || emptyStats).completed.toLocaleString()}
                    </p>
                    <p className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                      Completed
                    </p>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-3 text-center">
                    <p className="text-lg font-bold text-destructive">
                      {(workflowStatsById[selectedWorkflow.id] || emptyStats).failed}
                    </p>
                    <p className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                      Failed
                    </p>
                  </div>
                </div>

                <Separator />

                <div className="space-y-2.5 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Trigger</span>
                    <span className="font-medium capitalize text-foreground">
                      {triggerLabels[selectedWorkflow.trigger_type]}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Steps</span>
                    <span className="font-medium text-foreground">
                      {getWorkflowStepCount(selectedWorkflow)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Last run</span>
                    <span className="font-medium text-foreground">
                      {formatRelativeShort(selectedWorkflow.last_run_at) || "Never"}
                    </span>
                  </div>
                  {successRateFromStats(workflowStatsById[selectedWorkflow.id] || emptyStats) > 0 ? (
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Success rate</span>
                      <div className="flex items-center gap-2">
                        <Progress
                          value={successRateFromStats(workflowStatsById[selectedWorkflow.id] || emptyStats)}
                          className="h-1.5 w-20"
                        />
                        <span className="font-medium text-foreground">
                          {successRateFromStats(workflowStatsById[selectedWorkflow.id] || emptyStats)}%
                        </span>
                      </div>
                    </div>
                  ) : null}
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Created</span>
                    <span className="font-medium text-foreground">
                      {formatDate(selectedWorkflow.created_at)}
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {getWorkflowTags(selectedWorkflow).map((tag) => (
                    <Badge key={`${selectedWorkflow.id}_${tag}`} variant="secondary" className="text-[10px]">
                      {tag}
                    </Badge>
                  ))}
                </div>

                <div className="flex gap-2 pt-2">
                  <Button className="flex-1" onClick={() => openBuilder(selectedWorkflow)}>
                    <Edit3 className="mr-1.5 h-3.5 w-3.5" />
                    Edit Workflow
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSelectedWorkflowId(null);
                      setActiveTab("activity");
                    }}
                  >
                    <Eye className="mr-1.5 h-3.5 w-3.5" />
                    View Logs
                  </Button>
                </div>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedTemplate} onOpenChange={(open) => !open && setSelectedTemplateId(null)}>
        <DialogContent className="sm:max-w-md">
          {selectedTemplate ? (
            <>
              <DialogHeader>
                <div className="mb-1 flex items-center gap-3">
                  <div className="rounded-lg bg-primary/10 p-2.5 text-primary">
                    <Sparkles className="h-5 w-5" />
                  </div>
                  <div>
                    <DialogTitle>{selectedTemplate.name}</DialogTitle>
                    <Badge variant="secondary" className="mt-1 text-[10px]">
                      {selectedTemplate.category}
                    </Badge>
                  </div>
                </div>
                <DialogDescription className="mt-2">
                  {selectedTemplate.description || selectedTemplate.use_case || "Automation template"}
                </DialogDescription>
              </DialogHeader>
              <div className="mt-2 space-y-3">
                <div>
                  <label className="text-sm font-medium text-foreground">
                    Name your workflow
                  </label>
                  <Input
                    placeholder={selectedTemplate.name}
                    value={newWorkflowName}
                    onChange={(event) => setNewWorkflowName(event.target.value)}
                    className="mt-1.5"
                  />
                </div>
                <div className="flex gap-2 pt-2">
                    <Button className="flex-1" onClick={() => void runAction("template", () => handleUseTemplate(selectedTemplate))}>
                    <Plus className="mr-1.5 h-3.5 w-3.5" />
                    Use Template
                  </Button>
                  <Button variant="outline" onClick={() => setSelectedTemplateId(null)}>
                    Cancel
                  </Button>
                </div>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <AnimatePresence>
        {editingWorkflowDraft ? (
          <WorkflowBuilder
            workflow={editingWorkflowDraft}
            initialGraph={extractGraphFromWorkflow(editingWorkflowDraft)}
            dependencies={dependencies}
            saving={busy === "builder-save"}
            onClose={() => setEditingWorkflowDraft(null)}
            onSave={async (request) => {
              await runAction("builder-save", async () => {
                const updated = await persistWorkflow(editingWorkflowDraft, request);
                if (updated) {
                  setEditingWorkflowDraft(updated);
                }
              });
            }}
          />
        ) : null}
      </AnimatePresence>
    </DashboardLayout>
  );
};

export default Automations;

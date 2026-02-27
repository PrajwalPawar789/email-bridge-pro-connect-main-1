import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Loader2,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  Copy,
  Workflow,
  Zap,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Maximize2,
  Minimize2,
  Eye,
} from "lucide-react";
import DashboardLayout from "@/components/Layout/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  AUTOMATION_STATUS_LABELS,
  type AutomationContactStats,
  type AutomationDependencyData,
  type AutomationLog,
  type AutomationStep,
  type AutomationWorkflowTemplate,
  type AutomationWorkflow,
  createAutomationWorkflowFromTemplate,
  createAutomationWorkflow,
  createDefaultFlow,
  deleteAutomationWorkflow,
  duplicateAutomationWorkflow,
  getAutomationStats,
  listAutomationLogs,
  listAutomationWorkflowTemplates,
  listAutomationWorkflows,
  loadAutomationDependencies,
  runAutomationRunner,
  updateAutomationWorkflow,
} from "@/lib/automations";
import { getBillingSnapshot } from "@/lib/billing";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/providers/AuthProvider";
import WorkflowBuilder from "@/workflow/WorkflowBuilder";
import WorkflowCanvas from "@/workflow/canvas/WorkflowCanvas";
import {
  compileGraphToLegacyFlow,
  extractGraphFromWorkflow,
  legacyFlowToGraph,
  withGraphInSettings,
} from "@/workflow/services/workflowAdapter";
import { normalizeGraph } from "@/workflow/utils/graph";
import { canPublishWorkflow } from "@/workflow/utils/review";
import type { WorkflowGraph, WorkflowRuntimeEvent } from "@/workflow/types/schema";

const emptyDependencies: AutomationDependencyData = {
  emailLists: [],
  contactSegments: [],
  emailTemplates: [],
  emailConfigs: [],
};
const emptyStats: AutomationContactStats = { total: 0, active: 0, completed: 0, failed: 0, due: 0 };

const statusTone: Record<AutomationWorkflow["status"], string> = {
  draft: "bg-slate-100 text-slate-700 border-slate-200",
  live: "bg-emerald-100 text-emerald-700 border-emerald-200",
  paused: "bg-amber-100 text-amber-700 border-amber-200",
  archived: "bg-neutral-100 text-neutral-700 border-neutral-200",
};

type BuilderPayload = {
  graph: WorkflowGraph;
  compiledFlow: AutomationStep[];
  compileErrors: string[];
  checklistPass: boolean;
};

type WebhookTestState = {
  status: "idle" | "running" | "success" | "error";
  message: string;
  testedAt: string | null;
};

const formatDate = (value: string | null | undefined) => {
  if (!value) return "Never";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Never" : date.toLocaleString();
};

const levelFromEventType = (eventType: string): WorkflowRuntimeEvent["level"] => {
  const lowered = eventType.toLowerCase();
  if (lowered.includes("fail") || lowered.includes("error")) return "error";
  if (lowered.includes("warning") || lowered.includes("blocked")) return "warning";
  return "info";
};

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Unexpected error.";
};

const toObject = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
};

const triggerTypeLabel = (triggerType: AutomationWorkflow["trigger_type"]) => {
  if (triggerType === "list_joined") return "List trigger";
  if (triggerType === "custom_event") return "Webhook trigger";
  return "Manual trigger";
};

const generateWebhookSecret = () => {
  const randomValue =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID().replace(/-/g, "")
      : `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  return `whsec_${randomValue.slice(0, 36)}`;
};

const buildWebhookEndpoint = (
  workflowId: string,
  secret: string,
  eventName: string
) => {
  const baseUrl = String(import.meta.env.VITE_SUPABASE_URL || "").trim();
  if (!baseUrl || !workflowId) return "";

  const params = new URLSearchParams({ workflowId });
  if (secret) params.set("secret", secret);
  if (eventName) params.set("event", eventName);

  return `${baseUrl.replace(/\/+$/, "")}/functions/v1/automation-webhook?${params.toString()}`;
};

const getTemplatePreviewGraph = (template: AutomationWorkflowTemplate): WorkflowGraph => {
  const settings = toObject(template.settings);
  if (settings.workflow_graph) {
    return normalizeGraph(settings.workflow_graph, template.name);
  }

  return legacyFlowToGraph(template.flow || [], {
    id: template.id || template.slug || `tpl_${Date.now()}`,
    name: template.name || "Template preview",
    status: "draft",
  });
};

const Automations = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  const [initializing, setInitializing] = useState(true);
  const [workflows, setWorkflows] = useState<AutomationWorkflow[]>([]);
  const [templates, setTemplates] = useState<AutomationWorkflowTemplate[]>([]);
  const [templatePreviewId, setTemplatePreviewId] = useState<string | null>(null);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);
  const [editor, setEditor] = useState<AutomationWorkflow | null>(null);
  const [dependencies, setDependencies] = useState<AutomationDependencyData>(emptyDependencies);
  const [stats, setStats] = useState<AutomationContactStats>(emptyStats);
  const [logs, setLogs] = useState<AutomationLog[]>([]);
  const [billingCredits, setBillingCredits] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [builderPayload, setBuilderPayload] = useState<BuilderPayload | null>(null);
  const [webhookTestState, setWebhookTestState] = useState<WebhookTestState>({
    status: "idle",
    message: "",
    testedAt: null,
  });
  const [showWorkflowSettings, setShowWorkflowSettings] = useState(false);
  const [workspaceMode, setWorkspaceMode] = useState(false);
  const [workspaceModeTouched, setWorkspaceModeTouched] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth");
    }
  }, [loading, navigate, user]);

  useEffect(() => {
    if (workspaceModeTouched || typeof window === "undefined") return;

    const mediaQuery = window.matchMedia("(max-width: 1536px)");
    const apply = () => setWorkspaceMode(mediaQuery.matches);
    apply();

    const onChange = (event: MediaQueryListEvent) => {
      setWorkspaceMode(event.matches);
    };

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", onChange);
      return () => mediaQuery.removeEventListener("change", onChange);
    }

    mediaQuery.addListener(onChange);
    return () => mediaQuery.removeListener(onChange);
  }, [workspaceModeTouched]);

  const handleTabChange = (tab: string) => {
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
  };

  const selectedWorkflow = useMemo(
    () => workflows.find((workflow) => workflow.id === selectedWorkflowId) || null,
    [selectedWorkflowId, workflows]
  );

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === templatePreviewId) || null,
    [templatePreviewId, templates]
  );

  const selectedTemplatePreviewGraph = useMemo(
    () => (selectedTemplate ? getTemplatePreviewGraph(selectedTemplate) : null),
    [selectedTemplate]
  );

  const editorTriggerFilters = useMemo(
    () => toObject(editor?.trigger_filters),
    [editor?.trigger_filters]
  );
  const editorTriggerSegmentId = String(editorTriggerFilters.segment_id || "").trim();
  const availableTriggerSegments = useMemo(() => {
    if (!editor) return dependencies.contactSegments;
    if (editor.trigger_type !== "list_joined") return dependencies.contactSegments;
    if (!editor.trigger_list_id) return dependencies.contactSegments;
    return dependencies.contactSegments.filter(
      (segment) => !segment.source_list_id || segment.source_list_id === editor.trigger_list_id
    );
  }, [dependencies.contactSegments, editor]);
  const webhookSecret = String(editorTriggerFilters.webhook_secret || "").trim();
  const webhookEventName = String(editorTriggerFilters.event_name || "").trim();
  const webhookEndpoint = useMemo(
    () =>
      editor && editor.trigger_type === "custom_event"
        ? buildWebhookEndpoint(editor.id, webhookSecret, webhookEventName)
        : "",
    [editor, webhookEventName, webhookSecret]
  );
  const webhookSamplePayload = useMemo(
    () =>
      JSON.stringify(
        {
          event: webhookEventName || "contact_created",
          email: "prospect@example.com",
          name: "Alex Johnson",
          data: {
            company: "Acme Inc",
            job_title: "Head of Growth",
            plan: "trial",
          },
        },
        null,
        2
      ),
    [webhookEventName]
  );

  const copyToClipboard = useCallback(async (value: string, label: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
      toast({
        title: "Clipboard unavailable",
        description: "Copy is not supported in this browser session.",
        variant: "destructive",
      });
      return;
    }

    try {
      await navigator.clipboard.writeText(trimmed);
      toast({
        title: "Copied",
        description: `${label} copied to clipboard.`,
      });
    } catch (error: unknown) {
      toast({
        title: "Copy failed",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    }
  }, []);

  const setWebhookEventName = useCallback((value: string) => {
    setEditor((prev) =>
      prev
        ? {
            ...prev,
            trigger_filters: {
              ...toObject(prev.trigger_filters),
              event_name: value,
            },
          }
        : prev
    );
  }, []);

  const setTriggerSegmentId = useCallback((value: string) => {
    setEditor((prev) =>
      prev
        ? {
            ...prev,
            trigger_filters: {
              ...toObject(prev.trigger_filters),
              segment_id: value === "__none" ? null : value,
            },
          }
        : prev
    );
  }, []);

  const setTriggerType = useCallback((value: AutomationWorkflow["trigger_type"]) => {
    setEditor((prev) =>
      prev
        ? {
            ...prev,
            trigger_type: value,
            trigger_list_id: value === "list_joined" ? prev.trigger_list_id : null,
            trigger_filters: (() => {
              const nextFilters = { ...toObject(prev.trigger_filters) };
              if (value !== "list_joined") {
                delete nextFilters.segment_id;
              }

              if (value === "custom_event") {
                nextFilters.webhook_secret =
                  String(nextFilters.webhook_secret || "").trim() || generateWebhookSecret();
              }

              return nextFilters;
            })(),
          }
        : prev
    );
  }, []);

  const setWebhookSecret = useCallback((value: string) => {
    setEditor((prev) =>
      prev
        ? {
            ...prev,
            trigger_filters: {
              ...toObject(prev.trigger_filters),
              webhook_secret: value.trim(),
            },
          }
        : prev
    );
  }, []);

  const regenerateWebhookSecret = useCallback(() => {
    setEditor((prev) =>
      prev
        ? {
            ...prev,
            trigger_filters: {
              ...toObject(prev.trigger_filters),
              webhook_secret: generateWebhookSecret(),
            },
          }
        : prev
    );
  }, []);

  useEffect(() => {
    setWebhookTestState({ status: "idle", message: "", testedAt: null });
  }, [editor?.id]);

  useEffect(() => {
    if (!templatePreviewId) return;
    if (!templates.some((template) => template.id === templatePreviewId)) {
      setTemplatePreviewId(null);
    }
  }, [templatePreviewId, templates]);

  useEffect(() => {
    setEditor(selectedWorkflow);
    setBuilderPayload(null);
  }, [selectedWorkflow]);

  const loadInsights = useCallback(async (workflowId: string) => {
    const [nextStats, nextLogs] = await Promise.all([
      getAutomationStats(workflowId),
      listAutomationLogs(workflowId, 30),
    ]);
    setStats(nextStats);
    setLogs(nextLogs);
  }, []);

  const loadData = useCallback(async ({ initial = false }: { initial?: boolean } = {}) => {
    if (!user) return;
    if (initial) {
      setInitializing(true);
    }

    try {
      const [workflowRows, dependencyRows, templateRows, snapshot] = await Promise.all([
        listAutomationWorkflows(user.id),
        loadAutomationDependencies(user.id),
        listAutomationWorkflowTemplates(),
        getBillingSnapshot(user.id),
      ]);

      setWorkflows(workflowRows);
      setDependencies(dependencyRows);
      setTemplates(templateRows);
      setBillingCredits(Number(snapshot?.credits_remaining ?? 0));

      const nextId = workflowRows[0]?.id || null;
      const resolvedId =
        selectedWorkflowId && workflowRows.some((workflow) => workflow.id === selectedWorkflowId)
          ? selectedWorkflowId
          : nextId;
      setSelectedWorkflowId(resolvedId);
      if (resolvedId) {
        await loadInsights(resolvedId);
      }
    } catch (error: unknown) {
      toast({
        title: "Load failed",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      if (initial) {
        setInitializing(false);
      }
    }
  }, [loadInsights, selectedWorkflowId, user]);

  useEffect(() => {
    if (user) {
      void loadData({ initial: true });
    }
  }, [loadData, user]);

  useEffect(() => {
    if (!selectedWorkflowId) return;

    void loadInsights(selectedWorkflowId);
    const timer = setInterval(() => void loadInsights(selectedWorkflowId), 15000);
    return () => clearInterval(timer);
  }, [loadInsights, selectedWorkflowId]);

  const resolvePayload = useCallback((): BuilderPayload | null => {
    if (!editor) return null;
    if (builderPayload) return builderPayload;

    const graph = extractGraphFromWorkflow(editor);
    const compiled = compileGraphToLegacyFlow(graph);

    return {
      graph,
      compiledFlow: compiled.flow,
      compileErrors: compiled.errors,
      checklistPass: canPublishWorkflow(graph),
    };
  }, [builderPayload, editor]);

  const persistWorkflow = useCallback(
    async (
      options: {
        statusOverride?: AutomationWorkflow["status"];
        quiet?: boolean;
        payloadOverride?: BuilderPayload;
      } = {}
    ) => {
      if (!editor) return null;

      const payload = options.payloadOverride || resolvePayload();
      if (!payload) return null;

      if (options.statusOverride === "live" && !payload.checklistPass) {
        toast({
          title: "Publish blocked",
          description: "Fix the publish checklist before going live.",
          variant: "destructive",
        });
        return null;
      }

      const status = options.statusOverride || editor.status;

      const updated = await updateAutomationWorkflow(editor.id, {
        name: editor.name.trim() || "Untitled automation",
        description: (editor.description || "").trim() || null,
        trigger_type: editor.trigger_type,
        trigger_list_id: editor.trigger_type === "list_joined" ? editor.trigger_list_id : null,
        trigger_filters: toObject(editor.trigger_filters),
        flow: payload.compiledFlow,
        settings: withGraphInSettings((editor.settings as Record<string, unknown>) || {}, payload.graph),
        status,
        published_at: status === "live" ? editor.published_at || new Date().toISOString() : editor.published_at,
      });

      setWorkflows((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      setEditor(updated);

      if (!options.quiet) {
        toast({
          title: "Saved",
          description:
            payload.compileErrors.length > 0
              ? `Workflow saved with ${payload.compileErrors.length} compatibility warning(s).`
              : "Workflow updated.",
        });
      }

      return updated;
    },
    [editor, resolvePayload]
  );

  const action = async (name: string, work: () => Promise<void>) => {
    setBusy(name);
    try {
      await work();
    } catch (error: unknown) {
      toast({
        title: "Action failed",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  };

  const testWebhookConnection = useCallback(async () => {
    if (!editor || editor.trigger_type !== "custom_event") return;

    if (!webhookEndpoint) {
      const message = "Webhook endpoint is unavailable. Set VITE_SUPABASE_URL and save workflow first.";
      setWebhookTestState({
        status: "error",
        message,
        testedAt: new Date().toISOString(),
      });
      toast({
        title: "Webhook test failed",
        description: message,
        variant: "destructive",
      });
      return;
    }

    setWebhookTestState({ status: "running", message: "Sending test payload...", testedAt: null });

    try {
      await persistWorkflow({ quiet: true });

      const testEmail = `webhook-test-${Date.now()}@example.com`;
      const response = await fetch(webhookEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(webhookSecret ? { "x-vintro-webhook-secret": webhookSecret } : {}),
        },
        body: JSON.stringify({
          event: webhookEventName || "contact_created",
          email: testEmail,
          name: "Webhook Test Contact",
          data: {
            source: "webhook_connection_test",
            company: "Acme Inc",
            plan: "trial",
          },
        }),
      });

      const payload = await response.json().catch(() => ({} as Record<string, unknown>));
      if (!response.ok) {
        throw new Error(
          String(payload.error || `Webhook endpoint returned ${response.status}.`)
        );
      }

      const acceptedButIgnored = payload.ignored === true;
      const message = acceptedButIgnored
        ? `Endpoint reachable, but payload was ignored (${String(payload.reason || "event mismatch")}).`
        : `Endpoint reachable and accepted test payload (${response.status}).`;
      const testedAt = new Date().toISOString();

      setWebhookTestState({
        status: "success",
        message,
        testedAt,
      });
      toast({
        title: "Webhook test passed",
        description: message,
      });

      await loadInsights(editor.id);
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      setWebhookTestState({
        status: "error",
        message,
        testedAt: new Date().toISOString(),
      });
      toast({
        title: "Webhook test failed",
        description: message,
        variant: "destructive",
      });
    }
  }, [
    editor,
    loadInsights,
    persistWorkflow,
    webhookEndpoint,
    webhookEventName,
    webhookSecret,
  ]);

  const applyTemplate = (template: AutomationWorkflowTemplate) =>
    action("apply-template", async () => {
      if (!user) return;

      const created = await createAutomationWorkflowFromTemplate(user.id, template, {
        trigger_list_id:
          template.trigger_type === "list_joined"
            ? dependencies.emailLists[0]?.id || null
            : null,
      });

      const createdFilters = toObject(created.trigger_filters);
      const needsWebhookSecret =
        created.trigger_type === "custom_event" &&
        String(createdFilters.webhook_secret || "").trim().length === 0;

      const normalizedCreated = needsWebhookSecret
        ? await updateAutomationWorkflow(created.id, {
            trigger_filters: {
              ...createdFilters,
              webhook_secret: generateWebhookSecret(),
            },
          })
        : created;

      setWorkflows((prev) => [normalizedCreated, ...prev]);
      setSelectedWorkflowId(normalizedCreated.id);
      setTemplatePreviewId(null);

      toast({
        title: "Template copied",
        description: `"${template.name}" is now in your workflows.`,
      });
    });

  const initialGraph = useMemo(() => {
    if (!editor) return null;
    return extractGraphFromWorkflow(editor);
  }, [editor]);

  const runtimeFlow = useMemo(() => {
    if (!editor) return [];
    if (builderPayload?.compiledFlow) return builderPayload.compiledFlow;
    return compileGraphToLegacyFlow(extractGraphFromWorkflow(editor)).flow;
  }, [builderPayload?.compiledFlow, editor]);

  const runtimeEvents = useMemo<WorkflowRuntimeEvent[]>(() => {
    if (!editor) return [];

    return logs.map((entry) => {
      const metadata =
        entry.metadata && typeof entry.metadata === "object" && !Array.isArray(entry.metadata)
          ? (entry.metadata as Record<string, unknown>)
          : {};
      const nodeIdFromMetadata =
        typeof metadata.node_id === "string" && metadata.node_id.trim().length > 0
          ? metadata.node_id
          : undefined;

      const nodeIdFromStepIndex =
        typeof entry.step_index === "number" && entry.step_index >= 0
          ? runtimeFlow[entry.step_index]?.id
          : undefined;

      return {
        id: entry.id,
        nodeId: nodeIdFromMetadata || nodeIdFromStepIndex,
        type: entry.event_type,
        message: entry.message || "Runtime event",
        createdAt: entry.created_at,
        level: levelFromEventType(entry.event_type),
      };
    });
  }, [editor, logs, runtimeFlow]);

  const handleBuilderPersist = useCallback(
    async (payload: BuilderPayload) => {
      await persistWorkflow({
        quiet: true,
        payloadOverride: payload,
      });
    },
    [persistWorkflow]
  );

  const handleBuilderStateChange = useCallback((payload: BuilderPayload) => {
    setBuilderPayload((prev) => {
      if (!prev) return payload;

      const unchanged =
        prev.graph === payload.graph &&
        prev.compiledFlow === payload.compiledFlow &&
        prev.compileErrors === payload.compileErrors &&
        prev.checklistPass === payload.checklistPass;

      return unchanged ? prev : payload;
    });
  }, []);

  const runNow = () =>
    action("run", async () => {
      if (!editor) return;

      await persistWorkflow({ quiet: true });
      const result = await runAutomationRunner("run_now", editor.id);
      const summary = result?.summary || {};

      toast({
        title: "Run complete",
        description: `Processed ${Number(summary.processed || 0)} contacts.`,
      });

      await loadData();
    });

  const enrollNow = () =>
    action("enroll", async () => {
      if (!editor) return;

      await persistWorkflow({ quiet: true });
      const result = await runAutomationRunner("enroll_now", editor.id);

      toast({
        title: "Enrollment complete",
        description: `Enrolled ${Number(result?.enrolled || 0)} contacts.`,
      });

      await loadData();
    });

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--shell-accent)]" />
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
      contentClassName="max-w-[1880px]"
    >
      {initializing ? (
        <div className="flex min-h-[60vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-[var(--shell-accent)]" />
        </div>
      ) : (
      <div className="space-y-6">
        <Card className="border-[var(--shell-border)] bg-[var(--shell-surface)]">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--shell-muted)]">
                Automation Studio
              </p>
              <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold text-[var(--shell-ink)]">
                <Workflow className="h-5 w-5 text-[var(--shell-accent)]" />
                Workflow Builder
              </h1>
              <p className="text-sm text-[var(--shell-muted)]">
                Visual canvas editor with runtime simulation and publish review.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">
                {billingCredits === null ? "Credits unavailable" : `${billingCredits.toLocaleString()} credits`}
              </Badge>
              <Button variant="outline" onClick={() => action("refresh", loadData)} disabled={!!busy}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Refresh
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setWorkspaceModeTouched(true);
                  setWorkspaceMode((value) => !value);
                }}
                disabled={!!busy}
              >
                {workspaceMode ? (
                  <Minimize2 className="mr-2 h-4 w-4" />
                ) : (
                  <Maximize2 className="mr-2 h-4 w-4" />
                )}
                {workspaceMode ? "Standard layout" : "Workspace layout"}
              </Button>
              <Button
                onClick={() =>
                  action("create", async () => {
                    if (!user) return;
                    const created = await createAutomationWorkflow(user.id, {
                      name: `Automation ${workflows.length + 1}`,
                      flow: createDefaultFlow(),
                      status: "draft",
                      trigger_type: "list_joined",
                      trigger_list_id: dependencies.emailLists[0]?.id || null,
                    });
                    setWorkflows((prev) => [created, ...prev]);
                    setSelectedWorkflowId(created.id);
                  })
                }
                disabled={!!busy}
              >
                <Plus className="mr-2 h-4 w-4" />
                New
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border-[var(--shell-border)] bg-[var(--shell-surface)]">
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle>Automation Templates</CardTitle>
                <p className="mt-1 text-sm text-[var(--shell-muted)]">
                  Preview and copy pre-designed workflows into your account.
                </p>
              </div>
              <Badge variant="secondary">{templates.length} templates</Badge>
            </div>
          </CardHeader>
          <CardContent>
            {templates.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
                No templates are available yet.
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {templates.map((template) => {
                  const previewGraph = getTemplatePreviewGraph(template);
                  const previewSteps = previewGraph.nodes.filter(
                    (node) => node.kind !== "trigger" && node.kind !== "exit"
                  ).length;
                  return (
                    <div
                      key={template.id}
                      className="rounded-xl border border-[var(--shell-border)] bg-white/80 p-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-[var(--shell-ink)]">{template.name}</p>
                          <p className="text-xs text-[var(--shell-muted)]">{template.category}</p>
                        </div>
                        {template.is_featured ? <Badge variant="secondary">Featured</Badge> : null}
                      </div>

                      <p className="mt-2 line-clamp-3 text-xs text-[var(--shell-muted)]">
                        {template.description || template.use_case || "No template description available."}
                      </p>

                      <div className="mt-2 flex flex-wrap items-center gap-1">
                        <Badge variant="outline">{triggerTypeLabel(template.trigger_type)}</Badge>
                        <Badge variant="outline">{previewSteps} blocks</Badge>
                        {!template.runner_compatible ? (
                          <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800">
                            Runner-limited
                          </Badge>
                        ) : null}
                      </div>

                      {template.tags.length > 0 ? (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {template.tags.slice(0, 3).map((tag) => (
                            <span
                              key={`${template.id}_${tag}`}
                              className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em] text-slate-600"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      ) : null}

                      <div className="mt-3 flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setTemplatePreviewId(template.id)}
                          disabled={!!busy}
                        >
                          <Eye className="mr-2 h-3.5 w-3.5" />
                          Preview
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => applyTemplate(template)}
                          disabled={!!busy}
                        >
                          <Copy className="mr-2 h-3.5 w-3.5" />
                          Copy to workflow
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <div
          className={cn(
            "grid gap-6 xl:items-start",
            workspaceMode ? "grid-cols-1" : "xl:grid-cols-[280px_1fr]"
          )}
        >
          {!workspaceMode ? (
            <Card className="border-[var(--shell-border)] bg-[var(--shell-surface)] xl:sticky xl:top-20">
              <CardHeader>
                <CardTitle>Workflows</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[clamp(260px,42vh,520px)] overflow-auto pr-2">
                  <div className="space-y-2">
                    {workflows.map((workflow) => (
                      <button
                        key={workflow.id}
                        type="button"
                        onClick={() => setSelectedWorkflowId(workflow.id)}
                        className={cn(
                          "w-full rounded-xl border px-3 py-3 text-left",
                          workflow.id === selectedWorkflowId
                            ? "border-[var(--shell-accent)] bg-emerald-50/70"
                            : "border-[var(--shell-border)] bg-white/70"
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="line-clamp-1 text-sm font-semibold text-[var(--shell-ink)]">
                            {workflow.name}
                          </p>
                          <span
                            className={cn(
                              "rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase",
                              statusTone[workflow.status]
                            )}
                          >
                            {AUTOMATION_STATUS_LABELS[workflow.status]}
                          </span>
                        </div>
                        <p className="mt-1 line-clamp-2 text-xs text-[var(--shell-muted)]">
                          {workflow.description || "No description"}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>

                <Separator className="my-4" />

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
                    <p className="text-[var(--shell-muted)]">Total</p>
                    <p className="font-semibold">{stats.total}</p>
                  </div>
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2">
                    <p className="text-emerald-700/80">Active</p>
                    <p className="font-semibold text-emerald-700">{stats.active}</p>
                  </div>
                  <div className="rounded-lg border border-blue-200 bg-blue-50 p-2">
                    <p className="text-blue-700/80">Due</p>
                    <p className="font-semibold text-blue-700">{stats.due}</p>
                  </div>
                  <div className="rounded-lg border border-rose-200 bg-rose-50 p-2">
                    <p className="text-rose-700/80">Failed</p>
                    <p className="font-semibold text-rose-700">{stats.failed}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : null}

          {!editor || !initialGraph ? (
            <Card className="border-[var(--shell-border)] bg-[var(--shell-surface)]">
              <CardContent className="p-10 text-center text-sm text-[var(--shell-muted)]">
                Select or create a workflow to start editing.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {workspaceMode ? (
                <Card className="border-[var(--shell-border)] bg-[var(--shell-surface)]">
                  <CardContent className="flex flex-wrap items-center gap-3 p-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--shell-muted)]">
                      Workflow
                    </p>
                    <Select
                      value={selectedWorkflowId || "__none"}
                      onValueChange={(value) => setSelectedWorkflowId(value === "__none" ? null : value)}
                    >
                      <SelectTrigger className="h-9 w-[280px]">
                        <SelectValue placeholder="Select workflow" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none">No workflow</SelectItem>
                        {workflows.map((workflow) => (
                          <SelectItem key={workflow.id} value={workflow.id}>
                            {workflow.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Badge variant="secondary">{workflows.length} workflows</Badge>
                    <Badge variant="secondary">Active {stats.active}</Badge>
                    <Badge variant="secondary">Due {stats.due}</Badge>
                  </CardContent>
                </Card>
              ) : null}

              <Card className="border-[var(--shell-border)] bg-[var(--shell-surface)]">
                <CardContent className="space-y-3 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Badge className={cn("border", statusTone[editor.status])}>
                      {AUTOMATION_STATUS_LABELS[editor.status]}
                    </Badge>

                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        onClick={() =>
                          action("duplicate", async () => {
                            if (!user) return;
                            const dup = await duplicateAutomationWorkflow(user.id, editor);
                            setWorkflows((prev) => [dup, ...prev]);
                            setSelectedWorkflowId(dup.id);
                          })
                        }
                        disabled={!!busy}
                      >
                        <Copy className="mr-2 h-4 w-4" />
                        Duplicate
                      </Button>

                      <Button
                        variant="outline"
                        onClick={() =>
                          action("delete", async () => {
                            if (!window.confirm(`Delete "${editor.name}"?`)) return;
                            await deleteAutomationWorkflow(editor.id);
                            await loadData();
                          })
                        }
                        disabled={!!busy}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </Button>

                      <Button
                        variant="outline"
                        onClick={() =>
                          action("save", async () => {
                            await persistWorkflow({ quiet: false });
                          })
                        }
                        disabled={!!busy}
                      >
                        <Save className="mr-2 h-4 w-4" />
                        Save
                      </Button>

                      {editor.status !== "live" ? (
                        <Button
                          onClick={() =>
                            action("live", async () => {
                              await persistWorkflow({ statusOverride: "live", quiet: false });
                            })
                          }
                          disabled={!!busy || !!builderPayload && !builderPayload.checklistPass}
                        >
                          <Play className="mr-2 h-4 w-4" />
                          Go live
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          onClick={() =>
                            action("pause", async () => {
                              await persistWorkflow({ statusOverride: "paused", quiet: false });
                            })
                          }
                          disabled={!!busy}
                        >
                          <Pause className="mr-2 h-4 w-4" />
                          Pause
                        </Button>
                      )}

                      <Button variant="outline" onClick={enrollNow} disabled={!!busy}>
                        <Zap className="mr-2 h-4 w-4" />
                        Enroll
                      </Button>
                      <Button variant="outline" onClick={runNow} disabled={!!busy}>
                        <Zap className="mr-2 h-4 w-4" />
                        Run
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => setShowWorkflowSettings((value) => !value)}
                        disabled={!!busy}
                      >
                        {showWorkflowSettings ? (
                          <ChevronUp className="mr-2 h-4 w-4" />
                        ) : (
                          <ChevronDown className="mr-2 h-4 w-4" />
                        )}
                        {showWorkflowSettings ? "Hide settings" : "Show settings"}
                      </Button>
                    </div>
                  </div>

                  <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_220px_220px]">
                    <div className="space-y-2">
                      <Label>Name</Label>
                      <Input
                        value={editor.name}
                        onChange={(event) => setEditor((prev) => (prev ? { ...prev, name: event.target.value } : prev))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Trigger type</Label>
                      <Select
                        value={editor.trigger_type}
                        onValueChange={(value) => setTriggerType(value as AutomationWorkflow["trigger_type"])}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="list_joined">Contact enters list</SelectItem>
                          <SelectItem value="manual">Manual only</SelectItem>
                          <SelectItem value="custom_event">Webhook event</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Trigger list</Label>
                      <Select
                        value={editor.trigger_list_id || "__none"}
                        onValueChange={(value) =>
                          setEditor((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  trigger_list_id: value === "__none" ? null : value,
                                  trigger_filters: (() => {
                                    const nextFilters = { ...toObject(prev.trigger_filters) };
                                    const currentSegmentId = String(nextFilters.segment_id || "").trim();
                                    if (!currentSegmentId) return nextFilters;

                                    const matchedSegment = dependencies.contactSegments.find(
                                      (segment) => segment.id === currentSegmentId
                                    );
                                    const nextListId = value === "__none" ? null : value;
                                    if (matchedSegment?.source_list_id && matchedSegment.source_list_id !== nextListId) {
                                      nextFilters.segment_id = null;
                                    }
                                    return nextFilters;
                                  })(),
                                }
                              : prev
                          )
                        }
                      >
                        <SelectTrigger disabled={editor.trigger_type !== "list_joined"}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none">No list</SelectItem>
                          {dependencies.emailLists.map((list) => (
                            <SelectItem key={list.id} value={list.id}>
                              {list.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Trigger segment</Label>
                      <Select
                        value={editorTriggerSegmentId || "__none"}
                        onValueChange={setTriggerSegmentId}
                      >
                        <SelectTrigger
                          disabled={
                            editor.trigger_type !== "list_joined" || availableTriggerSegments.length === 0
                          }
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none">All contacts</SelectItem>
                          {availableTriggerSegments.map((segment) => (
                            <SelectItem key={segment.id} value={segment.id}>
                              {segment.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-[var(--shell-muted)]">Last run: {formatDate(editor.last_run_at)}</p>
                    </div>
                  </div>

                  {editor.trigger_type === "custom_event" ? (
                    <div className="space-y-3 rounded-xl border border-cyan-200 bg-cyan-50/60 p-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-cyan-700">
                        Webhook Trigger Setup
                      </p>

                      <div className="grid gap-3 lg:grid-cols-2">
                        <div className="space-y-2">
                          <Label>Event name (optional)</Label>
                          <Input
                            value={webhookEventName}
                            onChange={(event) => setWebhookEventName(event.target.value)}
                            placeholder="contact_created"
                          />
                          <p className="text-xs text-cyan-700/80">
                            If set, only matching webhook events will enroll contacts.
                          </p>
                        </div>

                        <div className="space-y-2">
                          <Label>Webhook secret</Label>
                          <div className="flex gap-2">
                            <Input
                              value={webhookSecret}
                              onChange={(event) => setWebhookSecret(event.target.value)}
                              placeholder="whsec_..."
                            />
                            <Button
                              type="button"
                              variant="outline"
                              onClick={regenerateWebhookSecret}
                              disabled={!!busy}
                            >
                              Regenerate
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => void copyToClipboard(webhookSecret, "Webhook secret")}
                              disabled={!webhookSecret}
                            >
                              Copy
                            </Button>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label>Webhook endpoint</Label>
                        <div className="flex gap-2">
                          <Input
                            readOnly
                            value={webhookEndpoint || "Set VITE_SUPABASE_URL and save workflow to use webhook endpoint."}
                            className="font-mono text-xs"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => void copyToClipboard(webhookEndpoint, "Webhook URL")}
                            disabled={!webhookEndpoint}
                          >
                            Copy URL
                          </Button>
                        </div>
                        <p className="text-xs text-cyan-700/80">
                          Send a JSON body with at least <code>email</code>. You can pass
                          <code>name</code> and <code>data</code> fields for personalization and conditions.
                        </p>
                      </div>

                      <div className="space-y-2">
                        <Label>Sample JSON payload</Label>
                        <Textarea readOnly value={webhookSamplePayload} className="min-h-[140px] font-mono text-xs" />
                      </div>

                      <div className="space-y-2">
                        <Label>Connection test</Label>
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => void testWebhookConnection()}
                            disabled={!!busy || webhookTestState.status === "running" || !webhookEndpoint}
                          >
                            {webhookTestState.status === "running" ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : null}
                            {webhookTestState.status === "running" ? "Testing..." : "Test webhook"}
                          </Button>

                          {webhookTestState.status !== "idle" ? (
                            <p
                              className={cn(
                                "text-xs",
                                webhookTestState.status === "success" ? "text-emerald-700" : "text-rose-700"
                              )}
                            >
                              {webhookTestState.message}
                              {webhookTestState.testedAt ? ` (${formatDate(webhookTestState.testedAt)})` : ""}
                            </p>
                          ) : (
                            <p className="text-xs text-cyan-700/80">
                              Sends a live test payload to verify the webhook endpoint is reachable.
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {showWorkflowSettings ? (
                    <div className="space-y-2">
                      <Label>Description</Label>
                      <Textarea
                        value={editor.description || ""}
                        onChange={(event) =>
                          setEditor((prev) => (prev ? { ...prev, description: event.target.value } : prev))
                        }
                        className="min-h-[90px]"
                      />
                    </div>
                  ) : null}

                  {builderPayload?.compileErrors?.length ? (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                      <p className="mb-1 flex items-center gap-1 font-semibold uppercase tracking-[0.12em]">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        Runner compatibility warnings
                      </p>
                      <div className="space-y-1">
                        {builderPayload.compileErrors.slice(0, 4).map((warning, index) => (
                          <p key={`${warning}_${index}`}>{warning}</p>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </CardContent>
              </Card>

              <WorkflowBuilder
                workflowId={editor.id}
                initialGraph={initialGraph}
                workflowStatus={editor.status}
                dependencies={dependencies}
                runtimeEvents={runtimeEvents}
                onPersist={handleBuilderPersist}
                onStateChange={handleBuilderStateChange}
                webhookSetup={{
                  triggerType: editor.trigger_type,
                  enabled: editor.trigger_type === "custom_event",
                  eventName: webhookEventName,
                  secret: webhookSecret,
                  endpoint: webhookEndpoint,
                  samplePayload: webhookSamplePayload,
                  testing: webhookTestState.status === "running",
                  testStatus: webhookTestState.status === "running" ? "idle" : webhookTestState.status,
                  testMessage: webhookTestState.message,
                  testedAt: webhookTestState.testedAt,
                }}
                onWebhookEventNameChange={setWebhookEventName}
                onWebhookSecretChange={setWebhookSecret}
                onWebhookSecretRegenerate={regenerateWebhookSecret}
                onWebhookCopy={(value, label) => void copyToClipboard(value, label)}
                onWebhookTest={testWebhookConnection}
                onTriggerTypeChange={setTriggerType}
              />
            </div>
          )}
        </div>

        <Dialog
          open={!!selectedTemplate}
          onOpenChange={(open) => {
            if (!open) setTemplatePreviewId(null);
          }}
        >
          <DialogContent className="sm:max-w-6xl">
            {selectedTemplate && selectedTemplatePreviewGraph ? (
              <>
                <DialogHeader>
                  <DialogTitle>{selectedTemplate.name}</DialogTitle>
                  <DialogDescription>
                    {selectedTemplate.description || selectedTemplate.use_case || "Template preview"}
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">{selectedTemplate.category}</Badge>
                    <Badge variant="outline">{triggerTypeLabel(selectedTemplate.trigger_type)}</Badge>
                    <Badge variant="outline">
                      {
                        selectedTemplatePreviewGraph.nodes.filter(
                          (node) => node.kind !== "trigger" && node.kind !== "exit"
                        ).length
                      }{" "}
                      blocks
                    </Badge>
                    {!selectedTemplate.runner_compatible ? (
                      <Badge className="border border-amber-300 bg-amber-50 text-amber-800">
                        Requires runner support
                      </Badge>
                    ) : null}
                  </div>

                  {!selectedTemplate.runner_compatible ? (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                      This template contains blocks that are not fully runner-compatible yet (for example split).
                      It can be edited now, but publish may stay blocked until those blocks are removed.
                    </div>
                  ) : null}

                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-2">
                    <p className="px-2 pb-2 pt-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                      Template Workflow Preview
                    </p>
                    <div className="h-[440px] min-h-[320px]">
                      <WorkflowCanvas
                        nodes={selectedTemplatePreviewGraph.nodes}
                        edges={selectedTemplatePreviewGraph.edges}
                        errors={[]}
                        readOnly
                        dropzoneId={`template-preview-canvas-${selectedTemplate.id}`}
                      />
                    </div>
                  </div>
                </div>

                <DialogFooter>
                  <Button variant="outline" onClick={() => setTemplatePreviewId(null)} disabled={!!busy}>
                    Close
                  </Button>
                  <Button onClick={() => applyTemplate(selectedTemplate)} disabled={!!busy}>
                    <Copy className="mr-2 h-4 w-4" />
                    Copy to workflow
                  </Button>
                </DialogFooter>
              </>
            ) : null}
          </DialogContent>
        </Dialog>
      </div>
      )}
    </DashboardLayout>
  );
};

export default Automations;

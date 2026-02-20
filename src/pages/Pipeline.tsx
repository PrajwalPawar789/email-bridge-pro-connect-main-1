
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import DashboardLayout from "@/components/Layout/DashboardLayout";
import PipelineBoard from "@/components/pipeline/PipelineBoard";
import PipelinePageHeader from "@/components/pipeline/PipelinePageHeader";
import PipelineInsightsStrip, { InsightItem } from "@/components/pipeline/PipelineInsightsStrip";
import PipelineFilterBar, { PipelineFilters, SavedView } from "@/components/pipeline/PipelineFilterBar";
import PipelineViewControls, { DensityMode, SwimlaneMode, ViewMode } from "@/components/pipeline/PipelineViewControls";
import PipelineListView from "@/components/pipeline/PipelineListView";
import PipelineAnalytics from "@/components/pipeline/PipelineAnalytics";
import PipelineDetailsPanel, { ActivityEntry } from "@/components/pipeline/PipelineDetailsPanel";
import PipelineCommandPalette from "@/components/pipeline/PipelineCommandPalette";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ToastAction } from "@/components/ui/toast";
import { useAuth } from "@/providers/AuthProvider";
import { useIsMobile } from "@/hooks/use-mobile";
import { useDebounce } from "@/hooks/useDebounce";
import {
  usePipelineBootstrap,
  usePipelineList,
  usePipelineOpportunities,
  usePipelineStages,
} from "@/hooks/usePipelineQueries";
import { toast } from "@/hooks/use-toast";
import {
  createOpportunity,
  createPipelineWithStages,
  deleteOpportunity,
  fetchPipelineStageKeywords,
  updatePipelineWithStages,
  updateOpportunity,
} from "@/lib/pipelineStore";
import type {
  DbOpportunity,
  DbPipelineStage,
  PipelineStageSeed,
  PipelineStageUpdateSeed,
} from "@/lib/pipelineStore";
import {
  formatCurrency,
  isOpportunityStale,
  PIPELINE_TEMPLATES,
  PipelineOpportunity,
  PipelineStage,
  STALE_DAYS,
} from "@/lib/pipeline";
import { supabase } from "@/integrations/supabase/client";
import {
  ArrowRight,
  ClipboardCheck,
  Command as CommandIcon,
  Filter,
  Sparkles,
} from "lucide-react";

const DEFAULT_FILTERS: PipelineFilters = {
  search: "",
  stage: "all",
  owner: "all",
  campaign: "all",
  staleOnly: false,
  valueMin: "",
  valueMax: "",
  dateFrom: "",
  dateTo: "",
};

type NewOpportunityDraft = {
  contactName: string;
  contactEmail: string;
  company: string;
  value: string;
  owner: string;
  stageId: string;
  nextStep: string;
  campaignId: string;
};

type NewPipelineDraft = {
  name: string;
  description: string;
  source: "template" | "clone" | "custom";
  templateId: string;
  stages: EditableStageDraft[];
};

type BulkActionType = "move" | "assign" | "next" | "tag";

type EditableStageDraft = {
  draftId: string;
  id?: string;
  templateStageId: string;
  name: string;
  description: string;
  keywordsText: string;
  tone: PipelineStage["tone"];
  isWon: boolean;
  isLost: boolean;
};

type PipelineSettingsDraft = {
  name: string;
  description: string;
  stages: EditableStageDraft[];
};

const STAGE_TONE_OPTIONS: Array<{ value: PipelineStage["tone"]; label: string }> = [
  { value: "sky", label: "Sky" },
  { value: "emerald", label: "Emerald" },
  { value: "amber", label: "Amber" },
  { value: "violet", label: "Violet" },
  { value: "slate", label: "Slate" },
  { value: "rose", label: "Rose" },
];

const makeStageDraftId = () => `stage-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const slugifyStageId = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const buildUniqueTemplateStageId = (used: Set<string>, candidate: string, index: number) => {
  const base = slugifyStageId(candidate) || `stage-${index + 1}`;
  let next = base;
  let suffix = 2;
  while (used.has(next)) {
    next = `${base}-${suffix}`;
    suffix += 1;
  }
  used.add(next);
  return next;
};

const normalizeKeywordsText = (value: string) =>
  Array.from(
    new Set(
      (value || "")
        .split(",")
        .map((item) => item.trim().toLowerCase())
        .filter((item) => item.length >= 2)
    )
  );

const createBlankStageDraft = (index: number): EditableStageDraft => ({
  draftId: makeStageDraftId(),
  templateStageId: `stage-${index + 1}`,
  name: "",
  description: "",
  keywordsText: "",
  tone: "slate",
  isWon: false,
  isLost: false,
});

const createTemplateStageDrafts = (templateId?: string): EditableStageDraft[] => {
  const template = PIPELINE_TEMPLATES.find((item) => item.id === templateId) || PIPELINE_TEMPLATES[0];
  if (!template) return [createBlankStageDraft(0)];
  return template.stages.map((stage) => ({
    draftId: makeStageDraftId(),
    templateStageId: stage.id,
    name: stage.name,
    description: stage.description || "",
    keywordsText: "",
    tone: stage.tone || "slate",
    isWon: stage.id === "closed-won",
    isLost: stage.id === "closed-lost",
  }));
};

const createStageDraftsFromRows = (
  stages: DbPipelineStage[],
  keywordsByStageId: Record<string, string[]> = {}
): EditableStageDraft[] => {
  if (!stages || stages.length === 0) return [createBlankStageDraft(0)];
  return stages.map((stage, index) => ({
    draftId: makeStageDraftId(),
    id: stage.id,
    templateStageId: stage.template_stage_id || slugifyStageId(stage.name) || `stage-${index + 1}`,
    name: stage.name,
    description: stage.description || "",
    keywordsText: (keywordsByStageId[stage.id] || []).join(", "),
    tone: (stage.tone as PipelineStage["tone"]) || "slate",
    isWon: !!stage.is_won,
    isLost: !!stage.is_lost,
  }));
};

const normalizeStageFlags = (stages: EditableStageDraft[]) => {
  const wonIndex = stages.findIndex((stage) => stage.isWon);
  const lostIndex = stages.findIndex((stage) => stage.isLost);
  return stages.map((stage, index) => {
    const isWon = wonIndex === -1 ? stage.isWon : wonIndex === index;
    const isLost = lostIndex === -1 ? stage.isLost : lostIndex === index;
    return {
      ...stage,
      isWon,
      isLost: isWon ? false : isLost,
    };
  });
};

const buildCreateStageSeeds = (stages: EditableStageDraft[]): PipelineStageSeed[] => {
  const used = new Set<string>();
  const normalized = normalizeStageFlags(stages)
    .map((stage, index) => {
      const name = stage.name.trim();
      if (!name) return null;
      return {
        templateStageId: buildUniqueTemplateStageId(
          used,
          stage.templateStageId || name,
          index
        ),
        name,
        description: stage.description.trim() || null,
        keywords: normalizeKeywordsText(stage.keywordsText),
        tone: stage.tone || "slate",
        is_won: stage.isWon,
        is_lost: stage.isLost,
      } as PipelineStageSeed;
    })
    .filter(Boolean) as PipelineStageSeed[];

  return normalized;
};

const buildUpdateStageSeeds = (stages: EditableStageDraft[]): PipelineStageUpdateSeed[] => {
  const used = new Set<string>();
  const normalized = normalizeStageFlags(stages)
    .map((stage, index) => {
      const name = stage.name.trim();
      if (!name) return null;
      return {
        id: stage.id,
        templateStageId: buildUniqueTemplateStageId(
          used,
          stage.templateStageId || name,
          index
        ),
        name,
        description: stage.description.trim() || null,
        keywords: normalizeKeywordsText(stage.keywordsText),
        tone: stage.tone || "slate",
        is_won: stage.isWon,
        is_lost: stage.isLost,
      } as PipelineStageUpdateSeed;
    })
    .filter(Boolean) as PipelineStageUpdateSeed[];

  return normalized;
};

const Pipeline = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const viewShortcutTimer = useRef<number | null>(null);
  const awaitingViewShortcut = useRef(false);

  const [activePipelineId, setActivePipelineId] = useState("");
  const [filters, setFilters] = useState<PipelineFilters>(DEFAULT_FILTERS);
  const [savedViews, setSavedViews] = useState<SavedView[]>([
    { id: "all", name: "All", filters: DEFAULT_FILTERS },
    { id: "stale", name: "Stale", filters: { ...DEFAULT_FILTERS, staleOnly: true } },
    { id: "unassigned", name: "Unassigned", filters: { ...DEFAULT_FILTERS, owner: "Unassigned" } },
    { id: "high-value", name: "High value", filters: { ...DEFAULT_FILTERS, valueMin: "25000" } },
  ]);
  const [activeViewId, setActiveViewId] = useState<string | null>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("board");
  const [density, setDensity] = useState<DensityMode>("comfortable");
  const [swimlane, setSwimlane] = useState<SwimlaneMode>("none");
  const [activeStagesOnly, setActiveStagesOnly] = useState(false);
  const [collapsedStageIds, setCollapsedStageIds] = useState<string[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [focusedOpportunityId, setFocusedOpportunityId] = useState<string | null>(null);
  const [selectedOpportunityId, setSelectedOpportunityId] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsFocusField, setDetailsFocusField] = useState<"owner" | "nextStep" | "value" | "stage">("owner");
  const [commandOpen, setCommandOpen] = useState(false);
  const [newOpportunityOpen, setNewOpportunityOpen] = useState(false);
  const [newPipelineOpen, setNewPipelineOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [bulkActionOpen, setBulkActionOpen] = useState(false);
  const [bulkActionType, setBulkActionType] = useState<BulkActionType>("move");
  const [bulkValue, setBulkValue] = useState("");
  const [bulkStageId, setBulkStageId] = useState("");
  const [tagsById, setTagsById] = useState<Record<string, string[]>>({});
  const [campaignOptions, setCampaignOptions] = useState<{ id: string; name: string }[]>([]);
  const [newOpportunityDraft, setNewOpportunityDraft] = useState<NewOpportunityDraft>({
    contactName: "",
    contactEmail: "",
    company: "",
    value: "",
    owner: "",
    stageId: "",
    nextStep: "",
    campaignId: "",
  });
  const [newPipelineDraft, setNewPipelineDraft] = useState<NewPipelineDraft>(() => {
    const defaultTemplateId = PIPELINE_TEMPLATES[0]?.id || "";
    return {
      name: "",
      description: "",
      source: "template",
      templateId: defaultTemplateId,
      stages: createTemplateStageDrafts(defaultTemplateId),
    };
  });
  const [settingsDraft, setSettingsDraft] = useState<PipelineSettingsDraft>({
    name: "",
    description: "",
    stages: [],
  });

  const debouncedSearch = useDebounce(filters.search, 250);

  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth");
    }
  }, [loading, user, navigate]);

  useEffect(() => {
    if (!user) return;
    const loadCampaigns = async () => {
      const { data, error } = await supabase
        .from("campaigns")
        .select("id, name")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (!error) setCampaignOptions(data || []);
    };
    loadCampaigns();
  }, [user]);

  const bootstrapQuery = usePipelineBootstrap(user?.id);
  const pipelinesQuery = usePipelineList(user?.id);

  useEffect(() => {
    if (!activePipelineId && bootstrapQuery.data?.pipeline) {
      setActivePipelineId(bootstrapQuery.data.pipeline.id);
    }
  }, [activePipelineId, bootstrapQuery.data]);

  const pipelineId = activePipelineId || bootstrapQuery.data?.pipeline?.id;
  const stagesQuery = usePipelineStages(pipelineId);
  const opportunitiesQuery = usePipelineOpportunities(user?.id, pipelineId);

  const pipelines = useMemo(() => {
    const list = pipelinesQuery.data || [];
    const bootstrapPipeline = bootstrapQuery.data?.pipeline;
    if (bootstrapPipeline && !list.find((pipeline) => pipeline.id === bootstrapPipeline.id)) {
      return [bootstrapPipeline, ...list];
    }
    return list;
  }, [pipelinesQuery.data, bootstrapQuery.data]);

  const stageRows = (stagesQuery.data || bootstrapQuery.data?.stages || []) as DbPipelineStage[];
  const mappedStages: PipelineStage[] = useMemo(
    () =>
      stageRows.map((stage) => ({
        id: stage.id,
        name: stage.name,
        description: stage.description || "",
        tone: (stage.tone as PipelineStage["tone"]) || "slate",
        isWon: stage.is_won,
        isLost: stage.is_lost,
      })),
    [stageRows]
  );

  const mappedOpportunities: PipelineOpportunity[] = useMemo(
    () =>
      (opportunitiesQuery.data || []).map((opp: DbOpportunity) => ({
        id: opp.id,
        contactName: opp.contact_name || opp.contact_email || "Unknown",
        company: opp.company || "",
        email: opp.contact_email || "",
        owner: opp.owner || "",
        value: typeof opp.value === "number" ? opp.value : opp.value ? Number(opp.value) : undefined,
        stageId: opp.stage_id || "",
        status: (opp.status as PipelineOpportunity["status"]) || "open",
        lastActivityAt: opp.last_activity_at,
        nextStep: opp.next_step || "",
        campaignId: opp.campaign_id || null,
        sourceCampaign: opp.campaigns?.name || undefined,
        tags: tagsById[opp.id] || [],
      })),
    [opportunitiesQuery.data, tagsById]
  );

  const normalizedSearch = debouncedSearch.trim().toLowerCase();

  const filteredOpportunities = useMemo(() => {
    return mappedOpportunities.filter((opp) => {
      if (filters.stage !== "all" && opp.stageId !== filters.stage) return false;
      if (filters.owner !== "all" && (opp.owner || "Unassigned") !== filters.owner) return false;
      if (filters.campaign !== "all" && (opp.sourceCampaign || "Unattributed") !== filters.campaign) return false;
      if (filters.staleOnly && !isOpportunityStale(opp)) return false;

      const minValue = Number(filters.valueMin || 0);
      const maxValue = Number(filters.valueMax || 0);
      if (filters.valueMin && Number.isFinite(minValue) && (opp.value || 0) < minValue) return false;
      if (filters.valueMax && Number.isFinite(maxValue) && (opp.value || 0) > maxValue) return false;

      if (filters.dateFrom) {
        if (new Date(opp.lastActivityAt) < new Date(filters.dateFrom)) return false;
      }
      if (filters.dateTo) {
        if (new Date(opp.lastActivityAt) > new Date(filters.dateTo)) return false;
      }

      if (!normalizedSearch) return true;
      return (
        opp.contactName.toLowerCase().includes(normalizedSearch) ||
        (opp.company || "").toLowerCase().includes(normalizedSearch) ||
        (opp.email || "").toLowerCase().includes(normalizedSearch)
      );
    });
  }, [filters, mappedOpportunities, normalizedSearch]);

  const stageIdsWithItems = useMemo(() => {
    const set = new Set<string>();
    filteredOpportunities.forEach((opp) => set.add(opp.stageId));
    return set;
  }, [filteredOpportunities]);

  const visibleStages = useMemo(() => {
    if (!activeStagesOnly) return mappedStages;
    return mappedStages.filter((stage) => stageIdsWithItems.has(stage.id));
  }, [activeStagesOnly, mappedStages, stageIdsWithItems]);

  const lanes = useMemo(() => {
    if (swimlane === "none") {
      return [{ id: "all", label: "All", opportunities: filteredOpportunities }];
    }
    const map = new Map<string, PipelineOpportunity[]>();
    filteredOpportunities.forEach((opp) => {
      const key = swimlane === "owner" ? (opp.owner || "Unassigned") : (opp.sourceCampaign || "Unattributed");
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(opp);
    });
    return Array.from(map.entries()).map(([label, opps]) => ({
      id: label,
      label,
      opportunities: opps,
    }));
  }, [filteredOpportunities, swimlane]);

  const allOwners = useMemo(
    () => Array.from(new Set(mappedOpportunities.map((opp) => opp.owner || "Unassigned"))).filter(Boolean),
    [mappedOpportunities]
  );

  const allCampaigns = useMemo(
    () => Array.from(new Set(mappedOpportunities.map((opp) => opp.sourceCampaign || "Unattributed"))).filter(Boolean),
    [mappedOpportunities]
  );

  const activePipeline = pipelines.find((pipeline) => pipeline.id === activePipelineId) || null;
  const defaultTemplateId = PIPELINE_TEMPLATES[0]?.id || "";

  const handleOpenNewPipeline = () => {
    setNewPipelineDraft({
      name: "",
      description: "",
      source: "template",
      templateId: defaultTemplateId,
      stages: createTemplateStageDrafts(defaultTemplateId),
    });
    setNewPipelineOpen(true);
  };

  const patchNewPipelineStage = (index: number, patch: Partial<EditableStageDraft>) => {
    setNewPipelineDraft((prev) => {
      const nextStages = prev.stages.map((stage, stageIndex) =>
        stageIndex === index ? { ...stage, ...patch } : stage
      );
      return { ...prev, stages: normalizeStageFlags(nextStages) };
    });
  };

  const setNewPipelineStageOutcome = (index: number, outcome: "isWon" | "isLost", checked: boolean) => {
    setNewPipelineDraft((prev) => {
      const nextStages = prev.stages.map((stage, stageIndex) => {
        if (stageIndex !== index) {
          if (!checked) return stage;
          return { ...stage, [outcome]: false };
        }
        if (outcome === "isWon") {
          return { ...stage, isWon: checked, isLost: checked ? false : stage.isLost };
        }
        return { ...stage, isLost: checked, isWon: checked ? false : stage.isWon };
      });
      return { ...prev, stages: normalizeStageFlags(nextStages) };
    });
  };

  const moveNewPipelineStage = (index: number, direction: "up" | "down") => {
    setNewPipelineDraft((prev) => {
      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= prev.stages.length) return prev;
      const nextStages = [...prev.stages];
      const [current] = nextStages.splice(index, 1);
      nextStages.splice(targetIndex, 0, current);
      return { ...prev, stages: normalizeStageFlags(nextStages) };
    });
  };

  const removeNewPipelineStage = (index: number) => {
    setNewPipelineDraft((prev) => {
      if (prev.stages.length <= 1) return prev;
      const nextStages = prev.stages.filter((_, stageIndex) => stageIndex !== index);
      return { ...prev, stages: normalizeStageFlags(nextStages) };
    });
  };

  const addNewPipelineStage = () => {
    setNewPipelineDraft((prev) => ({
      ...prev,
      stages: [
        ...prev.stages,
        createBlankStageDraft(prev.stages.length),
      ],
    }));
  };

  const patchSettingsStage = (index: number, patch: Partial<EditableStageDraft>) => {
    setSettingsDraft((prev) => {
      const nextStages = prev.stages.map((stage, stageIndex) =>
        stageIndex === index ? { ...stage, ...patch } : stage
      );
      return { ...prev, stages: normalizeStageFlags(nextStages) };
    });
  };

  const setSettingsStageOutcome = (index: number, outcome: "isWon" | "isLost", checked: boolean) => {
    setSettingsDraft((prev) => {
      const nextStages = prev.stages.map((stage, stageIndex) => {
        if (stageIndex !== index) {
          if (!checked) return stage;
          return { ...stage, [outcome]: false };
        }
        if (outcome === "isWon") {
          return { ...stage, isWon: checked, isLost: checked ? false : stage.isLost };
        }
        return { ...stage, isLost: checked, isWon: checked ? false : stage.isWon };
      });
      return { ...prev, stages: normalizeStageFlags(nextStages) };
    });
  };

  const moveSettingsStage = (index: number, direction: "up" | "down") => {
    setSettingsDraft((prev) => {
      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= prev.stages.length) return prev;
      const nextStages = [...prev.stages];
      const [current] = nextStages.splice(index, 1);
      nextStages.splice(targetIndex, 0, current);
      return { ...prev, stages: normalizeStageFlags(nextStages) };
    });
  };

  const removeSettingsStage = (index: number) => {
    setSettingsDraft((prev) => {
      if (prev.stages.length <= 1) return prev;
      const nextStages = prev.stages.filter((_, stageIndex) => stageIndex !== index);
      return { ...prev, stages: normalizeStageFlags(nextStages) };
    });
  };

  const addSettingsStage = () => {
    setSettingsDraft((prev) => ({
      ...prev,
      stages: [
        ...prev.stages,
        createBlankStageDraft(prev.stages.length),
      ],
    }));
  };

  const openOpportunities = mappedOpportunities.filter((opp) => opp.status === "open");
  const openValue = openOpportunities.reduce((sum, opp) => sum + (opp.value || 0), 0);
  const staleCount = openOpportunities.filter((opp) => isOpportunityStale(opp)).length;
  const winCount = mappedOpportunities.filter((opp) => opp.status === "won").length;
  const meetingStageIds = new Set(
    mappedStages
      .filter((stage) =>
        stage.name.toLowerCase().includes("meeting") || stage.name.toLowerCase().includes("demo")
      )
      .map((stage) => stage.id)
  );
  const meetingCount = openOpportunities.filter((opp) => meetingStageIds.has(opp.stageId)).length;

  const insightItems: InsightItem[] = [
    {
      id: "open-value",
      label: "Open pipeline",
      value: formatCurrency(openValue),
      helper: `${openOpportunities.length} active deals`,
      tone: "sky",
      icon: <Sparkles className="h-5 w-5" />,
      tooltip: "Sum of all open opportunities",
    },
    {
      id: "meetings",
      label: "Meetings booked",
      value: meetingCount,
      helper: "Discovery + demos",
      tone: "emerald",
      icon: <ArrowRight className="h-5 w-5" />,
    },
    {
      id: "stale",
      label: "Stale deals",
      value: staleCount,
      helper: `No activity in ${STALE_DAYS}+ days`,
      tone: "amber",
      icon: <Filter className="h-5 w-5" />,
    },
    {
      id: "won",
      label: "Closed won",
      value: winCount,
      helper: "This quarter",
      tone: "emerald",
      icon: <Sparkles className="h-5 w-5" />,
    },
  ];

  const selectedOpportunity = mappedOpportunities.find((opp) => opp.id === selectedOpportunityId) || null;

  const activityEntries: ActivityEntry[] = selectedOpportunity
    ? [
        {
          id: "stage",
          label: `Last touched ${selectedOpportunity.nextStep ? "after" : "during"} ${
            mappedStages.find((stage) => stage.id === selectedOpportunity.stageId)?.name || "current stage"
          }`,
          timestamp: selectedOpportunity.lastActivityAt,
        },
        {
          id: "email",
          label: "Recent email activity synced from Inbox",
          timestamp: selectedOpportunity.lastActivityAt,
        },
      ]
    : [];

  const pipelineOppsQueryKey = useMemo(
    () => ["pipeline-opps", user?.id, pipelineId],
    [pipelineId, user?.id]
  );

  const updateOpportunityMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Parameters<typeof updateOpportunity>[1] }) =>
      updateOpportunity(id, payload),
    onMutate: async ({ id, payload }) => {
      await queryClient.cancelQueries({ queryKey: pipelineOppsQueryKey, exact: false });
      const previous = queryClient.getQueriesData<DbOpportunity[]>({
        queryKey: pipelineOppsQueryKey,
        exact: false,
      });
      queryClient.setQueriesData<DbOpportunity[]>(
        { queryKey: pipelineOppsQueryKey, exact: false },
        (old) =>
          (old || []).map((opp) =>
            opp.id === id
              ? {
                  ...opp,
                  stage_id: payload.stageId ?? opp.stage_id,
                  status: payload.status ?? opp.status,
                  owner: payload.owner ?? opp.owner,
                  value: payload.value ?? opp.value,
                  next_step: payload.nextStep ?? opp.next_step,
                  last_activity_at: payload.lastActivityAt ?? opp.last_activity_at,
                }
              : opp
          )
      );
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) {
        context.previous.forEach(([key, data]) => {
          queryClient.setQueryData(key, data);
        });
      }
      toast({
        title: "Update failed",
        description: "We could not save this change. Please try again.",
        variant: "destructive",
      });
    },
    onSuccess: (data) => {
      queryClient.setQueriesData<DbOpportunity[]>(
        { queryKey: pipelineOppsQueryKey, exact: false },
        (old) => (old || []).map((opp) => (opp.id === data.id ? data : opp))
      );
    },
  });

  const createOpportunityMutation = useMutation({
    mutationFn: createOpportunity,
    onSuccess: (data) => {
      queryClient.setQueriesData<DbOpportunity[]>(
        { queryKey: pipelineOppsQueryKey, exact: false },
        (old) => [data, ...(old || [])]
      );
      toast({
        title: "Opportunity created",
        description: "The new deal is ready to triage.",
      });
    },
    onError: () => {
      toast({
        title: "Create failed",
        description: "We could not create this opportunity.",
        variant: "destructive",
      });
    },
  });

  const deleteOpportunityMutation = useMutation({
    mutationFn: deleteOpportunity,
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: pipelineOppsQueryKey, exact: false });
      const previous = queryClient.getQueriesData<DbOpportunity[]>({
        queryKey: pipelineOppsQueryKey,
        exact: false,
      });
      queryClient.setQueriesData<DbOpportunity[]>(
        { queryKey: pipelineOppsQueryKey, exact: false },
        (old) => (old || []).filter((opp) => opp.id !== id)
      );
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) {
        context.previous.forEach(([key, data]) => {
          queryClient.setQueryData(key, data);
        });
      }
      toast({
        title: "Remove failed",
        description: "We could not remove this opportunity.",
        variant: "destructive",
      });
    },
    onSuccess: () => {
      toast({
        title: "Opportunity removed",
        description: "Removed from the pipeline.",
      });
    },
  });

  const handleTabChange = (tab: string) => {
    if (tab === "home") {
      navigate("/dashboard");
    } else if (tab === "campaigns") {
      navigate("/campaigns");
    } else if (tab === "inbox") {
      navigate("/inbox");
    } else if (tab === "automations") {
      navigate("/automations");
    } else if (
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

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  useEffect(() => {
    if (isMobile && viewMode === "board") {
      setViewMode("list");
    }
  }, [isMobile, viewMode]);

  const clearFilters = () => {
    setFilters(DEFAULT_FILTERS);
    setActiveViewId("all");
  };

  const handleSelectView = (viewId: string) => {
    if (viewId === "none") return;
    const view = savedViews.find((item) => item.id === viewId);
    if (!view) return;
    setFilters(view.filters);
    setActiveViewId(view.id);
  };

  const handleSaveView = () => {
    const name = `View ${savedViews.length + 1}`;
    const newView: SavedView = {
      id: `view-${Date.now()}`,
      name,
      filters: { ...filters },
    };
    setSavedViews((prev) => [...prev, newView]);
    setActiveViewId(newView.id);
    toast({
      title: "View saved",
      description: `Saved "${name}" for quick access.`,
    });
  };

  const toggleCollapse = (stageId: string) => {
    setCollapsedStageIds((prev) =>
      prev.includes(stageId) ? prev.filter((id) => id !== stageId) : [...prev, stageId]
    );
  };

  const handleSelectOpportunity = (opportunity: PipelineOpportunity) => {
    setSelectedOpportunityId(opportunity.id);
    setFocusedOpportunityId(opportunity.id);
    setDetailsOpen(true);
  };

  const handleQuickAction = (action: "assign" | "next" | "schedule" | "open", opportunity: PipelineOpportunity) => {
    setSelectedOpportunityId(opportunity.id);
    setFocusedOpportunityId(opportunity.id);
    setDetailsOpen(true);
    if (action === "assign") {
      setDetailsFocusField("owner");
    }
    if (action === "next") {
      setDetailsFocusField("nextStep");
    }
    if (action === "schedule") {
      toast({
        title: "Schedule meeting",
        description: "Add a meeting in your calendar and update the next step.",
      });
    }
  };

  const handleMoveOpportunity = async (opportunityId: string, stageId: string) => {
    const opportunity = mappedOpportunities.find((opp) => opp.id === opportunityId);
    if (!opportunity) return;
    const previousStageId = opportunity.stageId;
    if (previousStageId === stageId) return;

    const stage = mappedStages.find((item) => item.id === stageId);
    if (!stage) return;

    const status = stage.isWon ? "won" : stage.isLost ? "lost" : "open";
    // Peak-End rule + user control: confirm the move and always offer undo.
    updateOpportunityMutation.mutate(
      {
        id: opportunityId,
        payload: {
          stageId,
          status,
          lastActivityAt: new Date().toISOString(),
        },
      },
      {
        onSuccess: () => {
          toast({
            title: `Moved to ${stage.name}`,
            description: "Stage updated.",
            action: (
              <ToastAction
                altText="Undo move"
                onClick={() =>
                  updateOpportunityMutation.mutate({
                    id: opportunityId,
                    payload: {
                      stageId: previousStageId,
                      status: opportunity.status,
                      lastActivityAt: new Date().toISOString(),
                    },
                  })
                }
              >
                Undo
              </ToastAction>
            ),
          });
        },
      }
    );
  };

  const handleBulkAction = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    if (bulkActionType === "move" && bulkStageId) {
      await Promise.all(ids.map((id) => handleMoveOpportunity(id, bulkStageId)));
      setBulkStageId("");
    }

    if (bulkActionType === "assign") {
      await Promise.all(
        ids.map((id) =>
          updateOpportunityMutation.mutateAsync({
            id,
            payload: { owner: bulkValue || null },
          })
        )
      );
    }

    if (bulkActionType === "next") {
      await Promise.all(
        ids.map((id) =>
          updateOpportunityMutation.mutateAsync({
            id,
            payload: { nextStep: bulkValue || null },
          })
        )
      );
    }

    if (bulkActionType === "tag") {
      setTagsById((prev) => {
        const next = { ...prev };
        ids.forEach((id) => {
          const existing = next[id] || [];
          if (!bulkValue) return;
          next[id] = Array.from(new Set([...existing, bulkValue]));
        });
        return next;
      });
      toast({
        title: "Tags added",
        description: "Tags applied to selected opportunities.",
      });
    }

    setBulkValue("");
    setBulkActionOpen(false);
  };

  const handleMarkStale = () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    const staleDate = new Date();
    staleDate.setDate(staleDate.getDate() - (STALE_DAYS + 1));

    ids.forEach((id) => {
      updateOpportunityMutation.mutate({
        id,
        payload: { lastActivityAt: staleDate.toISOString() },
      });
    });

    toast({
      title: "Marked stale",
      description: "Selected opportunities are now marked stale.",
    });
  };

  const handleSelectAll = (checked: boolean) => {
    if (!checked) {
      setSelectedIds(new Set());
      return;
    }
    setSelectedIds(new Set(filteredOpportunities.map((opp) => opp.id)));
  };

  const allSelected =
    filteredOpportunities.length > 0 &&
    filteredOpportunities.every((opp) => selectedIds.has(opp.id));
  const partiallySelected = selectedIds.size > 0 && !allSelected;

  const handleNewOpportunity = () => {
    setNewOpportunityDraft((prev) => ({
      ...prev,
      stageId: prev.stageId || (mappedStages[0]?.id || ""),
    }));
    setNewOpportunityOpen(true);
  };

  const handleCreateOpportunity = async () => {
    if (!user || !activePipelineId || !newOpportunityDraft.stageId) return;
    const selectedStage = mappedStages.find((stage) => stage.id === newOpportunityDraft.stageId);
    if (!selectedStage) return;
    const status = selectedStage.isWon ? "won" : selectedStage.isLost ? "lost" : "open";

    await createOpportunityMutation.mutateAsync({
      userId: user.id,
      pipelineId: activePipelineId,
      stageId: newOpportunityDraft.stageId,
      status,
      contactName: newOpportunityDraft.contactName || null,
      contactEmail: newOpportunityDraft.contactEmail || null,
      company: newOpportunityDraft.company || null,
      value: newOpportunityDraft.value ? Number(newOpportunityDraft.value) : null,
      owner: newOpportunityDraft.owner || null,
      nextStep: newOpportunityDraft.nextStep || null,
      campaignId: newOpportunityDraft.campaignId || null,
    });

    setNewOpportunityOpen(false);
    setNewOpportunityDraft({
      contactName: "",
      contactEmail: "",
      company: "",
      value: "",
      owner: "",
      stageId: selectedStage.id,
      nextStep: "",
      campaignId: "",
    });
  };

  const handleCreatePipeline = async () => {
    if (!user) return;
    const stageSeeds = buildCreateStageSeeds(newPipelineDraft.stages);
    if (stageSeeds.length === 0) {
      toast({
        title: "Add at least one stage",
        description: "Each pipeline needs at least one named stage.",
        variant: "destructive",
      });
      return;
    }

    try {
      const { pipeline } = await createPipelineWithStages({
        userId: user.id,
        name: newPipelineDraft.name || "New pipeline",
        description: newPipelineDraft.description,
        templateId: newPipelineDraft.source === "template" ? newPipelineDraft.templateId || null : null,
        stages: stageSeeds,
      });

      await pipelinesQuery.refetch();
      setActivePipelineId(pipeline.id);
      setNewPipelineOpen(false);
      setNewPipelineDraft({
        name: "",
        description: "",
        source: "template",
        templateId: defaultTemplateId,
        stages: createTemplateStageDrafts(defaultTemplateId),
      });
      toast({
        title: "Pipeline created",
        description: "The new pipeline is ready for opportunities.",
      });
    } catch (error) {
      toast({
        title: "Create failed",
        description: "We could not create a new pipeline.",
        variant: "destructive",
      });
    }
  };

  const handleUpdateSettings = async () => {
    if (!user || !activePipeline) return;
    const stageSeeds = buildUpdateStageSeeds(settingsDraft.stages);
    if (stageSeeds.length === 0) {
      toast({
        title: "Save failed",
        description: "At least one stage with a name is required.",
        variant: "destructive",
      });
      return;
    }

    try {
      await updatePipelineWithStages({
        pipelineId: activePipeline.id,
        name: settingsDraft.name,
        description: settingsDraft.description,
        stages: stageSeeds,
      });

      await Promise.all([
        pipelinesQuery.refetch(),
        stagesQuery.refetch(),
        opportunitiesQuery.refetch(),
      ]);

      setSettingsOpen(false);
      toast({
        title: "Pipeline updated",
        description: "Settings saved successfully.",
      });
    } catch (_error) {
      toast({
        title: "Save failed",
        description: "Could not update pipeline settings.",
        variant: "destructive",
      });
    }
  };

  const handleNewPipelineSourceChange = (source: NewPipelineDraft["source"]) => {
    setNewPipelineDraft((prev) => {
      if (source === "template") {
        const templateId = prev.templateId || defaultTemplateId;
        return {
          ...prev,
          source,
          templateId,
          stages: createTemplateStageDrafts(templateId),
        };
      }
      if (source === "clone") {
        const sourcePipelineId = activePipeline?.id || pipelineId;
        if (sourcePipelineId) {
          void fetchPipelineStageKeywords(sourcePipelineId)
            .then((keywordsByStageId) => {
              setNewPipelineDraft((draftPrev) => {
                if (draftPrev.source !== "clone") return draftPrev;
                return {
                  ...draftPrev,
                  stages: createStageDraftsFromRows(stageRows, keywordsByStageId),
                };
              });
            })
            .catch(() => {});
        }
        return {
          ...prev,
          source,
          stages: createStageDraftsFromRows(stageRows),
        };
      }
      return {
        ...prev,
        source,
        stages: [createBlankStageDraft(0)],
      };
    });
  };

  const handleNewPipelineTemplateChange = (templateId: string) => {
    setNewPipelineDraft((prev) => ({
      ...prev,
      templateId,
      stages: createTemplateStageDrafts(templateId),
    }));
  };

  const handleOpenSettings = async () => {
    if (!activePipeline) return;
    try {
      const keywordsByStageId = await fetchPipelineStageKeywords(activePipeline.id);
      setSettingsDraft({
        name: activePipeline.name,
        description: activePipeline.description || "",
        stages: createStageDraftsFromRows(stageRows, keywordsByStageId),
      });
      setSettingsOpen(true);
    } catch (_error) {
      setSettingsDraft({
        name: activePipeline.name,
        description: activePipeline.description || "",
        stages: createStageDraftsFromRows(stageRows),
      });
      setSettingsOpen(true);
      toast({
        title: "Keyword load warning",
        description: "Stage keywords could not be loaded. You can still edit pipeline stages.",
      });
    }
  };

  const openBulkDialog = (type: BulkActionType) => {
    setBulkActionType(type);
    setBulkActionOpen(true);
    setBulkValue("");
    setBulkStageId("");
  };

  const handleDetailsOpenChange = (open: boolean) => {
    setDetailsOpen(open);
    if (!open) {
      setSelectedOpportunityId(null);
    }
  };

  const handleKeyboardShortcut = useCallback(
    (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable;

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen(true);
        return;
      }

      if (event.key === "/" && !isTyping) {
        event.preventDefault();
        searchInputRef.current?.focus();
        return;
      }

      if (event.key.toLowerCase() === "g" && !isTyping) {
        awaitingViewShortcut.current = true;
        if (viewShortcutTimer.current) {
          window.clearTimeout(viewShortcutTimer.current);
        }
        viewShortcutTimer.current = window.setTimeout(() => {
          awaitingViewShortcut.current = false;
        }, 1000);
        return;
      }

      if (awaitingViewShortcut.current && !isTyping) {
        const key = event.key.toLowerCase();
        if (key === "b") setViewMode("board");
        if (key === "l") setViewMode("list");
        if (key === "a") setViewMode("analytics");
        awaitingViewShortcut.current = false;
        return;
      }

      if (isTyping) return;

      const visibleIds = filteredOpportunities.map((opp) => opp.id);
      const currentIndex = focusedOpportunityId ? visibleIds.indexOf(focusedOpportunityId) : -1;

      if (event.key === "ArrowDown" || event.key === "ArrowRight") {
        event.preventDefault();
        const nextIndex = Math.min(visibleIds.length - 1, currentIndex + 1);
        if (visibleIds[nextIndex]) setFocusedOpportunityId(visibleIds[nextIndex]);
      }

      if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
        event.preventDefault();
        const prevIndex = Math.max(0, currentIndex - 1);
        if (visibleIds[prevIndex]) setFocusedOpportunityId(visibleIds[prevIndex]);
      }

      if (event.key === "Enter" && focusedOpportunityId) {
        event.preventDefault();
        setSelectedOpportunityId(focusedOpportunityId);
        setDetailsOpen(true);
      }

      if (event.key.toLowerCase() === "m" && focusedOpportunityId) {
        event.preventDefault();
        const current = mappedOpportunities.find((opp) => opp.id === focusedOpportunityId);
        if (!current) return;
        const stageIndex = mappedStages.findIndex((stage) => stage.id === current.stageId);
        const nextStage = mappedStages[Math.min(mappedStages.length - 1, stageIndex + 1)];
        if (nextStage && nextStage.id !== current.stageId) {
          handleMoveOpportunity(current.id, nextStage.id);
        }
      }

      if (event.key === "Escape" && detailsOpen) {
        event.preventDefault();
        handleDetailsOpenChange(false);
      }
    },
    [
      filteredOpportunities,
      focusedOpportunityId,
      mappedOpportunities,
      mappedStages,
      detailsOpen,
      handleDetailsOpenChange,
    ]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyboardShortcut);
    return () => window.removeEventListener("keydown", handleKeyboardShortcut);
  }, [handleKeyboardShortcut]);

  useEffect(() => {
    if (activePipelineId) {
      setSelectedIds(new Set());
      setFocusedOpportunityId(null);
      setSelectedOpportunityId(null);
      setDetailsOpen(false);
    }
  }, [activePipelineId]);

  useEffect(() => {
    setSelectedIds(new Set());
  }, [
    filters.search,
    filters.stage,
    filters.owner,
    filters.campaign,
    filters.staleOnly,
    filters.valueMin,
    filters.valueMax,
    filters.dateFrom,
    filters.dateTo,
  ]);

  const handleCommandSelect = (action: string) => {
    if (action === "new-opportunity") handleNewOpportunity();
    if (action === "view-board") setViewMode("board");
    if (action === "view-list") setViewMode("list");
    if (action === "view-analytics") setViewMode("analytics");
    if (action === "toggle-stale") setFilters((prev) => ({ ...prev, staleOnly: !prev.staleOnly }));
    setCommandOpen(false);
  };

  return (
    <DashboardLayout
      activeTab="pipeline"
      onTabChange={handleTabChange}
      user={user}
      onLogout={handleLogout}
      contentClassName="max-w-[1440px]"
    >
      <div className="space-y-6">
        {/* Nielsen + Fitts: primary CTA is anchored near the title, secondary actions are tucked into overflow. */}
        <PipelinePageHeader
          pipelineId={activePipelineId}
          pipelines={pipelines}
          onPipelineChange={setActivePipelineId}
          onNewOpportunity={handleNewOpportunity}
          onNewPipeline={handleOpenNewPipeline}
          onOpenSettings={handleOpenSettings}
        />

        {bootstrapQuery.isLoading || stagesQuery.isLoading ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-28 w-full" />
            ))}
          </div>
        ) : (
          <PipelineInsightsStrip items={insightItems} />
        )}

        {/* Hick + Miller: filter bar stays lean, advanced filters tucked into popover. */}
        <PipelineFilterBar
          filters={filters}
          onFiltersChange={setFilters}
          stages={mappedStages}
          owners={allOwners}
          campaigns={allCampaigns}
          savedViews={savedViews}
          activeViewId={activeViewId}
          onSelectView={handleSelectView}
          onSaveView={handleSaveView}
          onClearFilters={clearFilters}
          searchRef={searchInputRef}
        />

        {/* <div className="rounded-2xl border border-dashed border-[var(--shell-border)] bg-white/70 p-4 text-sm text-[var(--shell-muted)]">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
              <ClipboardCheck className="h-4 w-4" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-[var(--shell-ink)]">Pipeline updates happen in the Inbox</p>
              <p className="text-xs text-[var(--shell-muted)]">
                Classify replies as Interested, Not Interested, or Meeting Booked. Each action updates stages automatically.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => navigate("/inbox")}>
              View inbox
            </Button>
          </div>
        </div> */}

        {/* Serial position: view + density controls are first in the board toolbar. */}
        <PipelineViewControls
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          density={density}
          onDensityChange={setDensity}
          activeStagesOnly={activeStagesOnly}
          onActiveStagesOnlyChange={setActiveStagesOnly}
          swimlane={swimlane}
          onSwimlaneChange={setSwimlane}
          collapsedCount={collapsedStageIds.length}
          onCollapseAll={() => setCollapsedStageIds(visibleStages.map((stage) => stage.id))}
          onExpandAll={() => setCollapsedStageIds([])}
        />

        {/* Hick's Law: bulk actions only appear after selection to reduce visible choices. */}
        {(selectedIds.size > 0 || partiallySelected) && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white/90 p-3">
            <div className="flex items-center gap-3">
              <Checkbox
                checked={allSelected ? true : partiallySelected ? "indeterminate" : false}
                onCheckedChange={(value) => handleSelectAll(value === true)}
                aria-label="Select all"
              />
              <span className="text-sm text-slate-600">{selectedIds.size} selected</span>
              <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
                Clear
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    Bulk actions
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => openBulkDialog("move")}>Move stage</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => openBulkDialog("assign")}>Assign owner</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => openBulkDialog("next")}>Set next step</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => openBulkDialog("tag")}>Add tag</DropdownMenuItem>
                  <DropdownMenuItem onSelect={handleMarkStale}>Mark stale</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button variant="outline" size="sm" onClick={() => setCommandOpen(true)} className="gap-2">
                <CommandIcon className="h-4 w-4" />
                Commands
              </Button>
            </div>
          </div>
        )}

        <div
          className={
            detailsOpen
              ? "grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]"
              : "grid min-w-0 gap-6"
          }
        >
          <div className="min-w-0 space-y-6">
            {opportunitiesQuery.isError ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
                We could not load opportunities. Please refresh.
              </div>
            ) : viewMode === "list" ? (
              <PipelineListView
                opportunities={filteredOpportunities}
                stages={mappedStages}
                density={density}
                selectedIds={selectedIds}
                onToggleSelect={(id, checked) =>
                  setSelectedIds((prev) => {
                    const next = new Set(prev);
                    if (checked) next.add(id);
                    else next.delete(id);
                    return next;
                  })
                }
                onSelectOpportunity={handleSelectOpportunity}
              />
            ) : viewMode === "analytics" ? (
              <PipelineAnalytics stages={mappedStages} opportunities={filteredOpportunities} />
            ) : (
              <div className="space-y-6">
                {lanes.map((lane) => (
                  <div key={lane.id} className="min-w-0 space-y-3">
                    {swimlane !== "none" && (
                      <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                        <span>{lane.label}</span>
                        <Badge variant="secondary" className="text-[10px]">
                          {lane.opportunities.length}
                        </Badge>
                      </div>
                    )}
                    <PipelineBoard
                      stages={visibleStages}
                      opportunities={lane.opportunities}
                      emptyLabel={
                        opportunitiesQuery.isLoading
                          ? "Loading opportunities..."
                          : "No opportunities match the current filters."
                      }
                      density={density}
                      collapsedStageIds={collapsedStageIds}
                      onToggleCollapse={toggleCollapse}
                      onAddOpportunity={(stageId) => {
                        setNewOpportunityDraft((prev) => ({ ...prev, stageId }));
                        setNewOpportunityOpen(true);
                      }}
                      onSelectOpportunity={handleSelectOpportunity}
                      focusedOpportunityId={focusedOpportunityId}
                      selectedIds={selectedIds}
                      onToggleSelect={(id, checked) =>
                        setSelectedIds((prev) => {
                          const next = new Set(prev);
                          if (checked) next.add(id);
                          else next.delete(id);
                          return next;
                        })
                      }
                      onQuickAction={handleQuickAction}
                      onMoveOpportunity={handleMoveOpportunity}
                      onRemoveOpportunity={(opp) => deleteOpportunityMutation.mutate(opp.id)}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          {detailsOpen && (
            <div className={isMobile ? "hidden" : "block"}>
            <PipelineDetailsPanel
              open={detailsOpen}
              onOpenChange={handleDetailsOpenChange}
              opportunity={selectedOpportunity}
              stages={mappedStages.map((stage) => ({ id: stage.id, name: stage.name }))}
              activity={activityEntries}
              onUpdate={(payload) => {
                if (!selectedOpportunity) return;
                updateOpportunityMutation.mutate({
                  id: selectedOpportunity.id,
                  payload: {
                    stageId: payload.stageId,
                    owner: payload.owner ?? null,
                    value: payload.value ?? null,
                    nextStep: payload.nextStep ?? null,
                    lastActivityAt: new Date().toISOString(),
                  },
                });
              }}
              onViewInbox={() => navigate("/inbox")}
              isMobile={false}
              focusField={detailsFocusField}
            />
            </div>
          )}
        </div>
      </div>

      {isMobile && (
        <PipelineDetailsPanel
          open={detailsOpen}
          onOpenChange={handleDetailsOpenChange}
          opportunity={selectedOpportunity}
          stages={mappedStages.map((stage) => ({ id: stage.id, name: stage.name }))}
          activity={activityEntries}
          onUpdate={(payload) => {
            if (!selectedOpportunity) return;
            updateOpportunityMutation.mutate({
              id: selectedOpportunity.id,
              payload: {
                stageId: payload.stageId,
                owner: payload.owner ?? null,
                value: payload.value ?? null,
                nextStep: payload.nextStep ?? null,
                lastActivityAt: new Date().toISOString(),
              },
            });
          }}
          onViewInbox={() => navigate("/inbox")}
          isMobile={isMobile}
          focusField={detailsFocusField}
        />
      )}

      <PipelineCommandPalette open={commandOpen} onOpenChange={setCommandOpen} onSelect={handleCommandSelect} />

      <Dialog open={newOpportunityOpen} onOpenChange={setNewOpportunityOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>New opportunity</DialogTitle>
            <DialogDescription>Add a qualified reply directly into the pipeline.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="grid gap-2">
                <Label>Contact name</Label>
                <Input
                  value={newOpportunityDraft.contactName}
                  onChange={(event) =>
                    setNewOpportunityDraft((prev) => ({ ...prev, contactName: event.target.value }))
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label>Contact email</Label>
                <Input
                  value={newOpportunityDraft.contactEmail}
                  onChange={(event) =>
                    setNewOpportunityDraft((prev) => ({ ...prev, contactEmail: event.target.value }))
                  }
                />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="grid gap-2">
                <Label>Company</Label>
                <Input
                  value={newOpportunityDraft.company}
                  onChange={(event) =>
                    setNewOpportunityDraft((prev) => ({ ...prev, company: event.target.value }))
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label>Deal value</Label>
                <Input
                  value={newOpportunityDraft.value}
                  onChange={(event) =>
                    setNewOpportunityDraft((prev) => ({ ...prev, value: event.target.value }))
                  }
                  placeholder="$12,000"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="grid gap-2">
                <Label>Owner</Label>
                <Input
                  value={newOpportunityDraft.owner}
                  onChange={(event) =>
                    setNewOpportunityDraft((prev) => ({ ...prev, owner: event.target.value }))
                  }
                  placeholder="Assigned rep"
                />
              </div>
              <div className="grid gap-2">
                <Label>Stage</Label>
                <Select
                  value={newOpportunityDraft.stageId}
                  onValueChange={(value) => setNewOpportunityDraft((prev) => ({ ...prev, stageId: value }))}
                >
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="Select stage" />
                  </SelectTrigger>
                  <SelectContent>
                    {mappedStages.map((stage) => (
                      <SelectItem key={stage.id} value={stage.id}>
                        {stage.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Next step</Label>
              <Input
                value={newOpportunityDraft.nextStep}
                onChange={(event) =>
                  setNewOpportunityDraft((prev) => ({ ...prev, nextStep: event.target.value }))
                }
                placeholder="Send meeting agenda"
              />
            </div>
            <div className="grid gap-2">
              <Label>Source campaign</Label>
              <Select
                value={newOpportunityDraft.campaignId || "none"}
                onValueChange={(value) =>
                  setNewOpportunityDraft((prev) => ({
                    ...prev,
                    campaignId: value === "none" ? "" : value,
                  }))
                }
              >
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="Optional" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No campaign</SelectItem>
                  {campaignOptions.map((campaign) => (
                    <SelectItem key={campaign.id} value={campaign.id}>
                      {campaign.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setNewOpportunityOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateOpportunity} disabled={!newOpportunityDraft.stageId}>
              Create opportunity
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={newPipelineOpen} onOpenChange={setNewPipelineOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New pipeline</DialogTitle>
            <DialogDescription>Create a flexible, user-owned pipeline template.</DialogDescription>
          </DialogHeader>
          <div className="space-y-5">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="grid gap-2">
                <Label>Pipeline name</Label>
                <Input
                  value={newPipelineDraft.name}
                  onChange={(event) =>
                    setNewPipelineDraft((prev) => ({ ...prev, name: event.target.value }))
                  }
                  placeholder="Enterprise outbound pipeline"
                />
              </div>
              <div className="grid gap-2">
                <Label>Description</Label>
                <Input
                  value={newPipelineDraft.description}
                  onChange={(event) =>
                    setNewPipelineDraft((prev) => ({ ...prev, description: event.target.value }))
                  }
                  placeholder="Use this pipeline for enterprise accounts."
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="grid gap-2">
                <Label>Start from</Label>
                <Select
                  value={newPipelineDraft.source}
                  onValueChange={(value) => handleNewPipelineSourceChange(value as NewPipelineDraft["source"])}
                >
                  <SelectTrigger className="h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="template">Built-in template</SelectItem>
                    {activePipeline && <SelectItem value="clone">Duplicate current pipeline</SelectItem>}
                    <SelectItem value="custom">Blank pipeline</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {newPipelineDraft.source === "template" && (
                <div className="grid gap-2">
                  <Label>Template</Label>
                  <Select value={newPipelineDraft.templateId} onValueChange={handleNewPipelineTemplateChange}>
                    <SelectTrigger className="h-10">
                      <SelectValue placeholder="Select template" />
                    </SelectTrigger>
                    <SelectContent>
                      {PIPELINE_TEMPLATES.map((template) => (
                        <SelectItem key={template.id} value={template.id}>
                          {template.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <div className="space-y-3 rounded-xl border border-slate-200 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Stages</p>
                  <p className="text-xs text-slate-500">
                    Fully editable: add, remove, reorder, and control won/lost stages.
                  </p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={addNewPipelineStage}>
                  Add stage
                </Button>
              </div>

              <div className="space-y-4">
                {newPipelineDraft.stages.map((stage, index) => (
                  <div key={stage.draftId} className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Stage {index + 1}</p>
                        <p className="text-sm font-semibold text-slate-900">{stage.name.trim() || "Untitled stage"}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => moveNewPipelineStage(index, "up")}
                          disabled={index === 0}
                        >
                          Move up
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => moveNewPipelineStage(index, "down")}
                          disabled={index === newPipelineDraft.stages.length - 1}
                        >
                          Move down
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeNewPipelineStage(index)}
                          disabled={newPipelineDraft.stages.length <= 1}
                        >
                          Remove
                        </Button>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                      <div className="grid gap-2">
                        <Label className="text-xs text-slate-600">Stage name</Label>
                        <Input
                          value={stage.name}
                          onChange={(event) => patchNewPipelineStage(index, { name: event.target.value })}
                          placeholder={`Stage ${index + 1}`}
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label className="text-xs text-slate-600">Internal key</Label>
                        <Input
                          value={stage.templateStageId}
                          onChange={(event) =>
                            patchNewPipelineStage(index, { templateStageId: event.target.value })
                          }
                          placeholder="qualified"
                        />
                      </div>
                    </div>
                    <div className="grid gap-3">
                      <div className="grid gap-2">
                        <Label className="text-xs text-slate-600">Description</Label>
                        <Input
                          value={stage.description}
                          onChange={(event) =>
                            patchNewPipelineStage(index, { description: event.target.value })
                          }
                          placeholder="Define what this stage means."
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label className="text-xs text-slate-600">Auto-match keywords</Label>
                        <Input
                          value={stage.keywordsText}
                          onChange={(event) =>
                            patchNewPipelineStage(index, { keywordsText: event.target.value })
                          }
                          placeholder="interested, need more information, pricing"
                        />
                        <p className="text-[11px] text-slate-500">
                          Use comma-separated phrases. Any match moves the lead to this stage.
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                      <div className="flex flex-wrap items-center gap-4 text-sm">
                        <label className="flex items-center gap-2">
                          <Checkbox
                            checked={stage.isWon}
                            onCheckedChange={(checked) =>
                              setNewPipelineStageOutcome(index, "isWon", checked === true)
                            }
                          />
                          Won stage
                        </label>
                        <label className="flex items-center gap-2">
                          <Checkbox
                            checked={stage.isLost}
                            onCheckedChange={(checked) =>
                              setNewPipelineStageOutcome(index, "isLost", checked === true)
                            }
                          />
                          Lost stage
                        </label>
                      </div>
                      <div className="flex items-center gap-2">
                        <Label className="text-xs text-slate-600">Tone</Label>
                        <Select
                          value={stage.tone}
                          onValueChange={(value) =>
                            patchNewPipelineStage(index, { tone: value as PipelineStage["tone"] })
                          }
                        >
                          <SelectTrigger className="h-9 w-[180px] bg-white">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {STAGE_TONE_OPTIONS.map((tone) => (
                              <SelectItem key={tone.value} value={tone.value}>
                                {tone.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setNewPipelineOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreatePipeline}>
              Create pipeline
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Pipeline settings</DialogTitle>
            <DialogDescription>Update the pipeline name, description, and stages.</DialogDescription>
          </DialogHeader>
          <div className="space-y-5">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="grid gap-2">
                <Label>Name</Label>
                <Input
                  value={settingsDraft.name}
                  onChange={(event) =>
                    setSettingsDraft((prev) => ({ ...prev, name: event.target.value }))
                  }
                />
              </div>
              <div className="grid gap-2">
                <Label>Description</Label>
                <Input
                  value={settingsDraft.description}
                  onChange={(event) =>
                    setSettingsDraft((prev) => ({ ...prev, description: event.target.value }))
                  }
                  placeholder="Describe who this pipeline is for."
                />
              </div>
            </div>

            <div className="space-y-3 rounded-xl border border-slate-200 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Stages</p>
                  <p className="text-xs text-slate-500">
                    Remove, rename, reorder, or add stages. Removed stage opportunities move to the first stage.
                  </p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={addSettingsStage}>
                  Add stage
                </Button>
              </div>

              <div className="space-y-4">
                {settingsDraft.stages.map((stage, index) => (
                  <div key={stage.draftId} className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Stage {index + 1}</p>
                        <p className="text-sm font-semibold text-slate-900">{stage.name.trim() || "Untitled stage"}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => moveSettingsStage(index, "up")}
                          disabled={index === 0}
                        >
                          Move up
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => moveSettingsStage(index, "down")}
                          disabled={index === settingsDraft.stages.length - 1}
                        >
                          Move down
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeSettingsStage(index)}
                          disabled={settingsDraft.stages.length <= 1}
                        >
                          Remove
                        </Button>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                      <div className="grid gap-2">
                        <Label className="text-xs text-slate-600">Stage name</Label>
                        <Input
                          value={stage.name}
                          onChange={(event) => patchSettingsStage(index, { name: event.target.value })}
                          placeholder={`Stage ${index + 1}`}
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label className="text-xs text-slate-600">Internal key</Label>
                        <Input
                          value={stage.templateStageId}
                          onChange={(event) =>
                            patchSettingsStage(index, { templateStageId: event.target.value })
                          }
                          placeholder="qualified"
                        />
                      </div>
                    </div>
                    <div className="grid gap-3">
                      <div className="grid gap-2">
                        <Label className="text-xs text-slate-600">Description</Label>
                        <Input
                          value={stage.description}
                          onChange={(event) =>
                            patchSettingsStage(index, { description: event.target.value })
                          }
                          placeholder="Define what this stage means."
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label className="text-xs text-slate-600">Auto-match keywords</Label>
                        <Input
                          value={stage.keywordsText}
                          onChange={(event) =>
                            patchSettingsStage(index, { keywordsText: event.target.value })
                          }
                          placeholder="interested, need more information, pricing"
                        />
                        <p className="text-[11px] text-slate-500">
                          Use comma-separated phrases. Any match moves the lead to this stage.
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                      <div className="flex flex-wrap items-center gap-4 text-sm">
                        <label className="flex items-center gap-2">
                          <Checkbox
                            checked={stage.isWon}
                            onCheckedChange={(checked) =>
                              setSettingsStageOutcome(index, "isWon", checked === true)
                            }
                          />
                          Won stage
                        </label>
                        <label className="flex items-center gap-2">
                          <Checkbox
                            checked={stage.isLost}
                            onCheckedChange={(checked) =>
                              setSettingsStageOutcome(index, "isLost", checked === true)
                            }
                          />
                          Lost stage
                        </label>
                      </div>
                      <div className="flex items-center gap-2">
                        <Label className="text-xs text-slate-600">Tone</Label>
                        <Select
                          value={stage.tone}
                          onValueChange={(value) =>
                            patchSettingsStage(index, { tone: value as PipelineStage["tone"] })
                          }
                        >
                          <SelectTrigger className="h-9 w-[180px] bg-white">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {STAGE_TONE_OPTIONS.map((tone) => (
                              <SelectItem key={tone.value} value={tone.value}>
                                {tone.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
              Pipeline access is user-level. Every user can create and edit their own pipeline templates.
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setSettingsOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdateSettings}>Save settings</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={bulkActionOpen} onOpenChange={setBulkActionOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Bulk action</DialogTitle>
            <DialogDescription>Apply an action to {selectedIds.size} opportunities.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            {bulkActionType === "move" ? (
              <div className="grid gap-2">
                <Label>Stage</Label>
                <Select value={bulkStageId} onValueChange={setBulkStageId}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Select stage" />
                  </SelectTrigger>
                  <SelectContent>
                    {mappedStages.map((stage) => (
                      <SelectItem key={stage.id} value={stage.id}>
                        {stage.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="grid gap-2">
                <Label>{bulkActionType === "assign" ? "Owner" : bulkActionType === "next" ? "Next step" : "Tag"}</Label>
                <Input value={bulkValue} onChange={(event) => setBulkValue(event.target.value)} />
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setBulkActionOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleBulkAction}>
              Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default Pipeline;

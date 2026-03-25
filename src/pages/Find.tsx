import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Briefcase,
  Building2,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Factory,
  FilterX,
  Globe2,
  Hash,
  Layers3,
  Loader2,
  Mail,
  MapPin,
  PanelLeftClose,
  PanelLeftOpen,
  Phone,
  Save,
  Search,
  ShieldAlert,
  Sparkles,
  Target,
  Users,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

import DashboardLayout from "@/components/Layout/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useDebounce } from "@/hooks/useDebounce";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { handleDashboardTabNavigation } from "@/lib/dashboardNavigation";
import {
  type CompanySearchFilters,
  type CompanySearchRow,
  type ProspectSearchFilters,
  type ProspectSearchRow,
  type SearchMode,
  getSearchFilterOptions,
  importSearchSelection,
  searchCompanies,
  searchProspects,
} from "@/lib/findApi";
import { useAuth } from "@/providers/AuthProvider";
import { useWorkspace } from "@/providers/WorkspaceProvider";

/* ───────────────────────── CONSTANTS ───────────────────────── */

const ROOT_CURSOR_SENTINEL = "~root~";
const PAGE_SIZE = 25;
const TEXT_FILTER_DEBOUNCE_MS = 500;

const DEFAULT_PROSPECT_FILTERS: ProspectSearchFilters = {
  jobTitle: "",
  companyName: "",
  exactCompanyName: "",
  companyDomain: "",
  naics: "",
  jobLevel: [],
  jobFunction: [],
  country: [],
  industry: [],
  subIndustry: [],
  employeeSize: [],
  region: [],
};

const DEFAULT_COMPANY_FILTERS: CompanySearchFilters = {
  companyName: "",
  naics: "",
  country: [],
  region: [],
  industry: [],
  subIndustry: [],
  employeeSize: [],
};

const PROSPECT_MULTI_FIELDS = [
  "jobLevel",
  "jobFunction",
  "country",
  "industry",
  "subIndustry",
  "employeeSize",
  "region",
] as const;
const COMPANY_MULTI_FIELDS = ["country", "region", "industry", "subIndustry", "employeeSize"] as const;

type ProspectMultiField = (typeof PROSPECT_MULTI_FIELDS)[number];
type CompanyMultiField = (typeof COMPANY_MULTI_FIELDS)[number];

type SavedList = {
  id: string;
  name: string;
  description: string | null;
  count: number;
};

type SavedListRow = {
  id: string;
  name: string;
  description: string | null;
  email_list_prospects: Array<{ count: number | string | null }> | null;
};

type DetailState =
  | { mode: "prospects"; catalogRef: string; summary: ProspectSearchRow }
  | { mode: "companies"; catalogRef: string; summary: CompanySearchRow }
  | null;

type ChipDescriptor = {
  key: string;
  label: string;
  value: string;
  remove: () => void;
};

type ProspectTextFilters = Pick<ProspectSearchFilters, "jobTitle" | "companyName" | "naics">;
type CompanyTextFilters = Pick<CompanySearchFilters, "companyName" | "naics">;

/* ───────────────────────── HELPERS ───────────────────────── */

const parseListParam = (searchParams: URLSearchParams, key: string) =>
  searchParams.getAll(key).map((value) => value.trim()).filter(Boolean);

const parseTextParam = (searchParams: URLSearchParams, key: string) => searchParams.get(key)?.trim() || "";

const getProspectTextFilters = (filters: ProspectSearchFilters): ProspectTextFilters => ({
  jobTitle: filters.jobTitle,
  companyName: filters.companyName,
  naics: filters.naics,
});

const getCompanyTextFilters = (filters: CompanySearchFilters): CompanyTextFilters => ({
  companyName: filters.companyName,
  naics: filters.naics,
});

const parseProspectFilters = (searchParams: URLSearchParams): ProspectSearchFilters => ({
  jobTitle: parseTextParam(searchParams, "p_jobTitle"),
  companyName: parseTextParam(searchParams, "p_companyName"),
  exactCompanyName: parseTextParam(searchParams, "p_exactCompanyName"),
  companyDomain: parseTextParam(searchParams, "p_companyDomain"),
  naics: parseTextParam(searchParams, "p_naics"),
  jobLevel: parseListParam(searchParams, "p_jobLevel"),
  jobFunction: parseListParam(searchParams, "p_jobFunction"),
  country: parseListParam(searchParams, "p_country"),
  industry: parseListParam(searchParams, "p_industry"),
  subIndustry: parseListParam(searchParams, "p_subIndustry"),
  employeeSize: parseListParam(searchParams, "p_employeeSize"),
  region: parseListParam(searchParams, "p_region"),
});

const parseCompanyFilters = (searchParams: URLSearchParams): CompanySearchFilters => ({
  companyName: parseTextParam(searchParams, "c_companyName"),
  naics: parseTextParam(searchParams, "c_naics"),
  country: parseListParam(searchParams, "c_country"),
  region: parseListParam(searchParams, "c_region"),
  industry: parseListParam(searchParams, "c_industry"),
  subIndustry: parseListParam(searchParams, "c_subIndustry"),
  employeeSize: parseListParam(searchParams, "c_employeeSize"),
});

const buildFindSearchParams = ({
  mode,
  prospectFilters,
  companyFilters,
  cursor,
  cursorTrail,
}: {
  mode: SearchMode;
  prospectFilters: ProspectSearchFilters;
  companyFilters: CompanySearchFilters;
  cursor: string | null;
  cursorTrail: string[];
}) => {
  const params = new URLSearchParams();
  params.set("mode", mode);
  if (prospectFilters.jobTitle) params.set("p_jobTitle", prospectFilters.jobTitle);
  if (prospectFilters.companyName) params.set("p_companyName", prospectFilters.companyName);
  if (prospectFilters.exactCompanyName) params.set("p_exactCompanyName", prospectFilters.exactCompanyName);
  if (prospectFilters.companyDomain) params.set("p_companyDomain", prospectFilters.companyDomain);
  if (prospectFilters.naics) params.set("p_naics", prospectFilters.naics);
  prospectFilters.jobLevel.forEach((v) => params.append("p_jobLevel", v));
  prospectFilters.jobFunction.forEach((v) => params.append("p_jobFunction", v));
  prospectFilters.country.forEach((v) => params.append("p_country", v));
  prospectFilters.industry.forEach((v) => params.append("p_industry", v));
  prospectFilters.subIndustry.forEach((v) => params.append("p_subIndustry", v));
  prospectFilters.employeeSize.forEach((v) => params.append("p_employeeSize", v));
  prospectFilters.region.forEach((v) => params.append("p_region", v));
  if (companyFilters.companyName) params.set("c_companyName", companyFilters.companyName);
  if (companyFilters.naics) params.set("c_naics", companyFilters.naics);
  companyFilters.country.forEach((v) => params.append("c_country", v));
  companyFilters.region.forEach((v) => params.append("c_region", v));
  companyFilters.industry.forEach((v) => params.append("c_industry", v));
  companyFilters.subIndustry.forEach((v) => params.append("c_subIndustry", v));
  companyFilters.employeeSize.forEach((v) => params.append("c_employeeSize", v));
  if (cursor) params.set("cursor", cursor);
  cursorTrail.filter(Boolean).forEach((v) => params.append("trail", v));
  return params;
};

const formatValue = (value: unknown) => getSafeText(value, "—");
const formatCompactNumber = (value: number) =>
  new Intl.NumberFormat("en-US", { notation: "compact" }).format(value);
const formatCount = (value: number | string | null | undefined) =>
  Number(value || 0).toLocaleString("en-US");

const getSafeText = (value: unknown, fallback = "") => {
  if (value == null) return fallback;
  const normalized = String(value).trim();
  return normalized || fallback;
};
const getLeadingCharacter = (value: string | null | undefined, fallback = "?") =>
  getSafeText(value).charAt(0).toUpperCase() || fallback;

const getInitials = (name: string | null | undefined) =>
  getSafeText(name, "Unknown")
    .split(" ")
    .map((n) => n[0] || "")
    .join("")
    .toUpperCase()
    .slice(0, 2) || "UN";

const AVATAR_GRADIENTS = [
  { from: "hsl(271, 91%, 65%)", to: "hsl(280, 87%, 53%)" },
  { from: "hsl(199, 89%, 58%)", to: "hsl(217, 91%, 60%)" },
  { from: "hsl(160, 84%, 39%)", to: "hsl(174, 84%, 32%)" },
  { from: "hsl(38, 92%, 50%)", to: "hsl(25, 95%, 53%)" },
  { from: "hsl(350, 89%, 60%)", to: "hsl(330, 81%, 60%)" },
  { from: "hsl(187, 85%, 53%)", to: "hsl(217, 91%, 60%)" },
];

const getAvatarGradient = (name: string | null | undefined) => {
  const safeName = getSafeText(name, "Unknown");
  let hash = 0;
  for (let i = 0; i < safeName.length; i++) hash = safeName.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_GRADIENTS[Math.abs(hash) % AVATAR_GRADIENTS.length];
};

/* ── Filter icon mapping ── */
const FILTER_ICONS: Record<string, React.ElementType> = {
  jobLevel: Briefcase,
  jobFunction: Layers3,
  country: Globe2,
  region: MapPin,
  industry: Factory,
  subIndustry: Target,
  employeeSize: Users,
};

const FILTER_LABELS: Record<string, string> = {
  jobLevel: "Job Level",
  jobFunction: "Job Function",
  country: "Country",
  region: "Region",
  industry: "Industry",
  subIndustry: "Sub-industry",
  employeeSize: "Employee Size",
};

/* ───────────────────────── FILTER MULTI-SELECT ───────────────────────── */

const FilterMultiSelect = ({
  label,
  icon: Icon,
  options,
  selected,
  onChange,
}: {
  label: string;
  icon: React.ElementType;
  options: string[];
  selected: string[];
  onChange: (v: string[]) => void;
}) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const filtered = options.filter((o) => o.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-1">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100"
      >
        <span className="flex items-center gap-2.5">
          <Icon className="h-4 w-4 text-slate-400" />
          {label}
          {selected.length > 0 && (
            <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-emerald-600 px-1.5 text-[10px] font-bold text-white">
              {selected.length}
            </span>
          )}
        </span>
        <ChevronDown
          className={`h-4 w-4 text-slate-400 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="space-y-1 pb-2 pl-9 pr-1">
              {options.length > 5 && (
                <div className="relative mb-1.5">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={`Search ${label.toLowerCase()}...`}
                    className="h-8 w-full rounded-lg border border-slate-200 bg-white pl-8 pr-3 text-xs outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
              )}
              <div className="max-h-40 space-y-0.5 overflow-y-auto">
                {filtered.map((opt) => {
                  const isSelected = selected.includes(opt);
                  return (
                    <button
                      key={opt}
                      onClick={() =>
                        onChange(isSelected ? selected.filter((s) => s !== opt) : [...selected, opt])
                      }
                      className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-xs transition-colors ${
                        isSelected
                          ? "bg-emerald-50 font-medium text-emerald-700"
                          : "text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      <div
                        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                          isSelected
                            ? "border-emerald-600 bg-emerald-600 text-white"
                            : "border-slate-300"
                        }`}
                      >
                        {isSelected && <Check className="h-3 w-3" />}
                      </div>
                      {opt}
                    </button>
                  );
                })}
                {filtered.length === 0 && (
                  <p className="py-2 text-center text-xs text-slate-400">No matches</p>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

/* ───────────────────────── MAIN COMPONENT ───────────────────────── */

const Find = () => {
  const { user, loading } = useAuth();
  const { hasPermission, loading: workspaceLoading } = useWorkspace();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedProspectsById, setSelectedProspectsById] = useState<Record<string, ProspectSearchRow>>({});
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [selectedListId, setSelectedListId] = useState("");
  const [detailState, setDetailState] = useState<DetailState>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => {
    if (!loading && !user) navigate("/auth");
  }, [loading, navigate, user]);

  const mode: SearchMode = searchParams.get("mode") === "companies" ? "companies" : "prospects";
  const prospectFilters = useMemo(() => parseProspectFilters(searchParams), [searchParams]);
  const companyFilters = useMemo(() => parseCompanyFilters(searchParams), [searchParams]);
  const cursor = searchParams.get("cursor") || null;
  const cursorTrail = useMemo(() => searchParams.getAll("trail"), [searchParams]);

  const [prospectTextFilters, setProspectTextFilters] = useState<ProspectTextFilters>(() =>
    getProspectTextFilters(prospectFilters),
  );
  const [companyTextFilters, setCompanyTextFilters] = useState<CompanyTextFilters>(() =>
    getCompanyTextFilters(companyFilters),
  );
  const debouncedProspectTextFilters = useDebounce(prospectTextFilters, TEXT_FILTER_DEBOUNCE_MS);
  const debouncedCompanyTextFilters = useDebounce(companyTextFilters, TEXT_FILTER_DEBOUNCE_MS);

  useEffect(() => {
    if (detailState && detailState.mode !== mode) setDetailState(null);
  }, [detailState, mode]);

  useEffect(() => {
    setProspectTextFilters({
      jobTitle: prospectFilters.jobTitle,
      companyName: prospectFilters.companyName,
      naics: prospectFilters.naics,
    });
  }, [prospectFilters.companyName, prospectFilters.jobTitle, prospectFilters.naics]);

  useEffect(() => {
    setCompanyTextFilters({
      companyName: companyFilters.companyName,
      naics: companyFilters.naics,
    });
  }, [companyFilters.companyName, companyFilters.naics]);

  const updateUrlState = useCallback(
    (
      nextState: {
        mode?: SearchMode;
        prospectFilters?: ProspectSearchFilters;
        companyFilters?: CompanySearchFilters;
        cursor?: string | null;
        cursorTrail?: string[];
      },
      replace = true,
    ) => {
      const params = buildFindSearchParams({
        mode: nextState.mode ?? mode,
        prospectFilters: nextState.prospectFilters ?? prospectFilters,
        companyFilters: nextState.companyFilters ?? companyFilters,
        cursor: nextState.cursor ?? null,
        cursorTrail: nextState.cursorTrail ?? [],
      });
      setSearchParams(params, { replace });
    },
    [companyFilters, mode, prospectFilters, setSearchParams],
  );

  const updateProspectFilters = useCallback(
    (patch: Partial<ProspectSearchFilters>) => {
      const nextFilters = { ...prospectFilters, ...patch };
      if (Object.prototype.hasOwnProperty.call(patch, "companyName") && patch.companyName !== prospectFilters.companyName) {
        nextFilters.exactCompanyName = "";
        nextFilters.companyDomain = "";
      }
      updateUrlState({ prospectFilters: nextFilters, cursor: null, cursorTrail: [] }, true);
    },
    [prospectFilters, updateUrlState],
  );

  const updateCompanyFilters = useCallback(
    (patch: Partial<CompanySearchFilters>) => {
      updateUrlState({ companyFilters: { ...companyFilters, ...patch }, cursor: null, cursorTrail: [] }, true);
    },
    [companyFilters, updateUrlState],
  );

  // Sync debounced text filters to URL
  useEffect(() => {
    if (mode !== "prospects") return;
    if (
      prospectFilters.jobTitle === debouncedProspectTextFilters.jobTitle &&
      prospectFilters.companyName === debouncedProspectTextFilters.companyName &&
      prospectFilters.naics === debouncedProspectTextFilters.naics
    )
      return;
    const companyNameChanged = prospectFilters.companyName !== debouncedProspectTextFilters.companyName;
    updateUrlState(
      {
        prospectFilters: {
          ...prospectFilters,
          ...debouncedProspectTextFilters,
          ...(companyNameChanged ? { exactCompanyName: "", companyDomain: "" } : {}),
        },
        cursor: null,
        cursorTrail: [],
      },
      true,
    );
  }, [debouncedProspectTextFilters, mode, prospectFilters, updateUrlState]);

  useEffect(() => {
    if (mode !== "companies") return;
    if (
      companyFilters.companyName === debouncedCompanyTextFilters.companyName &&
      companyFilters.naics === debouncedCompanyTextFilters.naics
    )
      return;
    updateUrlState(
      { companyFilters: { ...companyFilters, ...debouncedCompanyTextFilters }, cursor: null, cursorTrail: [] },
      true,
    );
  }, [companyFilters, debouncedCompanyTextFilters, mode, updateUrlState]);

  const toggleProspectMultiValue = (field: ProspectMultiField, values: string[]) => {
    updateProspectFilters({ [field]: values } as Partial<ProspectSearchFilters>);
  };

  const toggleCompanyMultiValue = (field: CompanyMultiField, values: string[]) => {
    updateCompanyFilters({ [field]: values } as Partial<CompanySearchFilters>);
  };

  const clearCurrentFilters = () => {
    updateUrlState(
      {
        prospectFilters: mode === "prospects" ? DEFAULT_PROSPECT_FILTERS : prospectFilters,
        companyFilters: mode === "companies" ? DEFAULT_COMPANY_FILTERS : companyFilters,
        cursor: null,
        cursorTrail: [],
      },
      true,
    );
  };

  const switchMode = (nextMode: string) => {
    updateUrlState({ mode: nextMode === "companies" ? "companies" : "prospects", cursor: null, cursorTrail: [] }, false);
  };

  /* ── Queries ── */

  const filterOptionsQuery = useQuery({
    queryKey: ["find-filter-options", mode],
    queryFn: () => getSearchFilterOptions(mode),
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const searchQuery = useQuery({
    queryKey: ["find-search", mode, mode === "prospects" ? prospectFilters : companyFilters, cursor],
    queryFn: ({ signal }) =>
      mode === "prospects"
        ? searchProspects({ filters: prospectFilters, cursor, pageSize: PAGE_SIZE, signal })
        : searchCompanies({ filters: companyFilters, cursor, pageSize: PAGE_SIZE, signal }),
    enabled: !!user,
    placeholderData: (previousData) => previousData,
    staleTime: 30 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
  });

  const listsQuery = useQuery({
    queryKey: ["find-lists", user?.id],
    enabled: !!user?.id && saveDialogOpen,
    queryFn: async (): Promise<SavedList[]> => {
      const { data, error } = await supabase
        .from("email_lists")
        .select("id, name, description, email_list_prospects(count)")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return ((data || []) as SavedListRow[]).map((row) => ({
        id: row.id,
        name: row.name,
        description: row.description ?? null,
        count: Number(row.email_list_prospects?.[0]?.count || 0),
      }));
    },
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const importMutation = useMutation({
    mutationFn: async ({ listId, items }: { listId: string; items: ProspectSearchRow[] }) =>
      importSearchSelection(listId, items),
    onSuccess: (result) => {
      toast({
        title: "Prospects saved",
        description: `${result.linked} linked to the list, ${result.reused} already existed.`,
      });
      setSaveDialogOpen(false);
      setSelectedListId("");
      setSelectedProspectsById({});
    },
    onError: (error: Error) => {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
    },
  });

  /* ── Derived ── */

  const currentOptions = filterOptionsQuery.data?.options || {};
  const searchData = searchQuery.data;
  const resultCount = Number(searchData?.totalApprox || 0);
  const totalIsExact = searchData?.totalIsExact === true;
  const canManageContacts = !workspaceLoading && (hasPermission("manage_contacts") || hasPermission("manage_workspace"));
  const pageNumber = cursorTrail.length + 1;

  const prospectRows = useMemo(
    () => (mode === "prospects" ? (searchData?.items as ProspectSearchRow[] | undefined) || [] : []),
    [mode, searchData],
  );
  const companyRows = useMemo(
    () => (mode === "companies" ? (searchData?.items as CompanySearchRow[] | undefined) || [] : []),
    [mode, searchData],
  );

  useEffect(() => {
    if (mode !== "prospects" || prospectRows.length === 0) return;
    setSelectedProspectsById((current) => {
      let next = current;
      prospectRows.forEach((row) => {
        if (!current[row.catalogRef] || current[row.catalogRef] === row) return;
        if (next === current) next = { ...current };
        next[row.catalogRef] = row;
      });
      return next;
    });
  }, [mode, prospectRows]);

  const selectedProspectRows = useMemo(() => Object.values(selectedProspectsById), [selectedProspectsById]);
  const selectedProspectCount = selectedProspectRows.length;
  const visibleSelectedCount = useMemo(
    () =>
      mode === "prospects"
        ? prospectRows.reduce((count, row) => count + (selectedProspectsById[row.catalogRef] ? 1 : 0), 0)
        : 0,
    [mode, prospectRows, selectedProspectsById],
  );
  const hiddenSelectedCount = Math.max(0, selectedProspectCount - visibleSelectedCount);
  const allVisibleSelected =
    mode === "prospects" &&
    prospectRows.length > 0 &&
    visibleSelectedCount === prospectRows.length;
  const someVisibleSelected =
    mode === "prospects" && visibleSelectedCount > 0 && visibleSelectedCount < prospectRows.length;

  const nextCursor = searchData?.nextCursor || null;
  const hasPreviousPage = cursorTrail.length > 0;
  const showLoadingOverlay = searchQuery.isFetching && !!searchData;

  const activeFilterCount = useMemo(() => {
    if (mode === "prospects") {
      return PROSPECT_MULTI_FIELDS.reduce((sum, f) => sum + prospectFilters[f].length, 0) +
        (prospectFilters.jobTitle ? 1 : 0) +
        (prospectFilters.companyName ? 1 : 0) +
        (prospectFilters.naics ? 1 : 0);
    }
    return COMPANY_MULTI_FIELDS.reduce((sum, f) => sum + companyFilters[f].length, 0) +
      (companyFilters.companyName ? 1 : 0) +
      (companyFilters.naics ? 1 : 0);
  }, [mode, prospectFilters, companyFilters]);

  /* ── Pagination ── */

  const goToNextPage = () => {
    if (!nextCursor) return;
    updateUrlState({ cursor: nextCursor, cursorTrail: [...cursorTrail, cursor || ROOT_CURSOR_SENTINEL] }, false);
  };

  const goToPreviousPage = () => {
    if (!hasPreviousPage) return;
    const nextTrail = [...cursorTrail];
    const previousCursor = nextTrail.pop() || ROOT_CURSOR_SENTINEL;
    updateUrlState(
      { cursor: previousCursor === ROOT_CURSOR_SENTINEL ? null : previousCursor, cursorTrail: nextTrail },
      false,
    );
  };

  /* ── Selection ── */

  const clearProspectSelection = () => {
    setSelectedProspectsById({});
    setSelectedListId("");
  };

  const toggleRowSelection = (row: ProspectSearchRow, checked: boolean) => {
    setSelectedProspectsById((current) => {
      const alreadySelected = Boolean(current[row.catalogRef]);
      if (checked) {
        if (alreadySelected && current[row.catalogRef] === row) return current;
        return { ...current, [row.catalogRef]: row };
      }
      if (!alreadySelected) return current;
      const { [row.catalogRef]: _removed, ...remaining } = current;
      return remaining;
    });
  };

  const toggleAllVisible = (checked: boolean) => {
    if (!checked) {
      const visibleRefs = new Set(prospectRows.map((row) => row.catalogRef));
      setSelectedProspectsById((current) => {
        let changed = false;
        const next: Record<string, ProspectSearchRow> = {};
        Object.entries(current).forEach(([catalogRef, row]) => {
          if (visibleRefs.has(catalogRef)) {
            changed = true;
            return;
          }
          next[catalogRef] = row;
        });
        return changed ? next : current;
      });
      return;
    }
    setSelectedProspectsById((current) => {
      let next = current;
      prospectRows.forEach((row) => {
        if (next[row.catalogRef] === row) return;
        if (next === current) next = { ...current };
        next[row.catalogRef] = row;
      });
      return next;
    });
  };

  /* ── Active filter chips ── */

  const activeChips = useMemo<ChipDescriptor[]>(() => {
    if (mode === "prospects") {
      const chips: ChipDescriptor[] = [];
      if (prospectFilters.jobTitle)
        chips.push({ key: "jobTitle", label: "Job title", value: prospectFilters.jobTitle, remove: () => updateProspectFilters({ jobTitle: "" }) });
      if (prospectFilters.companyName)
        chips.push({ key: "companyName", label: "Company", value: prospectFilters.companyName, remove: () => updateProspectFilters({ companyName: "" }) });
      if (prospectFilters.naics)
        chips.push({ key: "naics", label: "NAICS", value: prospectFilters.naics, remove: () => updateProspectFilters({ naics: "" }) });
      PROSPECT_MULTI_FIELDS.forEach((field) => {
        prospectFilters[field].forEach((value) => {
          chips.push({
            key: `${field}:${value}`,
            label: FILTER_LABELS[field] || field,
            value,
            remove: () =>
              updateProspectFilters({ [field]: prospectFilters[field].filter((e) => e !== value) } as Partial<ProspectSearchFilters>),
          });
        });
      });
      return chips;
    }

    const chips: ChipDescriptor[] = [];
    if (companyFilters.companyName)
      chips.push({ key: "companyName", label: "Company", value: companyFilters.companyName, remove: () => updateCompanyFilters({ companyName: "" }) });
    if (companyFilters.naics)
      chips.push({ key: "naics", label: "NAICS", value: companyFilters.naics, remove: () => updateCompanyFilters({ naics: "" }) });
    COMPANY_MULTI_FIELDS.forEach((field) => {
      companyFilters[field].forEach((value) => {
        chips.push({
          key: `${field}:${value}`,
          label: FILTER_LABELS[field] || field,
          value,
          remove: () =>
            updateCompanyFilters({ [field]: companyFilters[field].filter((e) => e !== value) } as Partial<CompanySearchFilters>),
        });
      });
    });
    return chips;
  }, [companyFilters, mode, prospectFilters, updateCompanyFilters, updateProspectFilters]);

  const detailItem = detailState?.summary || null;

  const openProspectViewFromCompany = (company: CompanySearchRow) => {
    updateUrlState(
      {
        mode: "prospects",
        prospectFilters: {
          ...DEFAULT_PROSPECT_FILTERS,
          companyName: company.companyName || "",
          exactCompanyName: company.companyName || "",
          companyDomain: company.domain || "",
          country: company.domain ? [] : company.country ? [company.country] : [],
        },
        cursor: null,
        cursorTrail: [],
      },
      false,
    );
  };

  const handleSaveSelection = () => {
    if (!selectedListId || selectedProspectCount === 0) return;
    importMutation.mutate({ listId: selectedListId, items: selectedProspectRows });
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  /* ── Loading / auth guard ── */

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  if (!user) return null;

  /* ── Render helper: which multi-fields to show ── */
  const multiFields = mode === "prospects" ? PROSPECT_MULTI_FIELDS : COMPANY_MULTI_FIELDS;

  return (
    <DashboardLayout
      activeTab="find"
      onTabChange={(tab) => handleDashboardTabNavigation(navigate, tab)}
      user={user}
      onLogout={handleLogout}
      contentClassName="p-0 max-w-full"
    >
      <div className="flex h-[calc(100vh-64px)] flex-col overflow-hidden">
        {/* ─── TOP BAR ─── */}
        <header className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600">
                <Sparkles className="h-4 w-4 text-white" />
              </div>
              <div>
                <h1 className="text-base font-semibold text-slate-900 leading-tight">Find</h1>
                <p className="text-[11px] text-slate-500">Shared Catalog</p>
              </div>
            </div>
            {searchData?.shardStatus && (
              <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
                <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
                {searchData.shardStatus.healthy}/{Math.max(searchData.shardStatus.configured, 1)} shards
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-right">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
                {totalIsExact ? "Results" : "Approx. Results"}
              </p>
              <p className="text-lg font-bold text-slate-900 leading-tight">
                {totalIsExact ? formatCompactNumber(resultCount) : `~${formatCompactNumber(resultCount)}`}
              </p>
            </div>
          </div>
        </header>

        {/* ─── MAIN CONTENT ─── */}
        <div className="flex flex-1 overflow-hidden">
          {/* ─── SIDEBAR ─── */}
          <AnimatePresence mode="wait">
            {sidebarOpen && (
              <motion.aside
                key="sidebar"
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: 300, opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                transition={{ duration: 0.25, ease: "easeInOut" }}
                className="shrink-0 overflow-hidden border-r border-slate-200 bg-white"
              >
                <div className="flex h-full w-[300px] flex-col">
                  <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                    <div className="flex items-center gap-2">
                      <h2 className="text-sm font-semibold text-slate-900">Filters</h2>
                      {activeFilterCount > 0 && (
                        <Badge variant="secondary" className="h-5 px-1.5 text-[10px] bg-emerald-100 text-emerald-700">
                          {activeFilterCount}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      {activeFilterCount > 0 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs text-slate-500 hover:text-slate-900"
                          onClick={clearCurrentFilters}
                        >
                          <FilterX className="mr-1 h-3.5 w-3.5" />
                          Clear
                        </Button>
                      )}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setSidebarOpen(false)}>
                            <PanelLeftClose className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="right">Hide filters</TooltipContent>
                      </Tooltip>
                    </div>
                  </div>

                  <ScrollArea className="flex-1 px-2 py-2">
                    <div className="space-y-1">
                      {/* Text inputs for prospect mode */}
                      {mode === "prospects" && (
                        <>
                          <div className="px-3 py-2">
                            <Label className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">Job title</Label>
                            <div className="relative mt-1.5">
                              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                              <Input
                                value={prospectTextFilters.jobTitle}
                                onChange={(e) => setProspectTextFilters((c) => ({ ...c, jobTitle: e.target.value }))}
                                placeholder="e.g. Chief Financial Officer"
                                className="h-9 rounded-lg border-slate-200 pl-8 text-xs"
                              />
                            </div>
                          </div>
                          <div className="px-3 py-2">
                            <Label className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">Company name</Label>
                            <Input
                              value={prospectTextFilters.companyName}
                              onChange={(e) => setProspectTextFilters((c) => ({ ...c, companyName: e.target.value }))}
                              placeholder="Acme"
                              className="mt-1.5 h-9 rounded-lg border-slate-200 text-xs"
                            />
                          </div>
                          <div className="px-3 py-2">
                            <Label className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">NAICS</Label>
                            <Input
                              value={prospectTextFilters.naics}
                              onChange={(e) => setProspectTextFilters((c) => ({ ...c, naics: e.target.value }))}
                              placeholder="541611"
                              className="mt-1.5 h-9 rounded-lg border-slate-200 text-xs"
                            />
                          </div>
                          <Separator className="my-2" />
                        </>
                      )}

                      {mode === "companies" && (
                        <>
                          <div className="px-3 py-2">
                            <Label className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">Company name</Label>
                            <Input
                              value={companyTextFilters.companyName}
                              onChange={(e) => setCompanyTextFilters((c) => ({ ...c, companyName: e.target.value }))}
                              placeholder="Acme"
                              className="mt-1.5 h-9 rounded-lg border-slate-200 text-xs"
                            />
                          </div>
                          <div className="px-3 py-2">
                            <Label className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">NAICS</Label>
                            <Input
                              value={companyTextFilters.naics}
                              onChange={(e) => setCompanyTextFilters((c) => ({ ...c, naics: e.target.value }))}
                              placeholder="541611"
                              className="mt-1.5 h-9 rounded-lg border-slate-200 text-xs"
                            />
                          </div>
                          <Separator className="my-2" />
                        </>
                      )}

                      {/* Multi-select filters */}
                      {multiFields.map((field) => (
                        <FilterMultiSelect
                          key={field}
                          label={FILTER_LABELS[field] || field}
                          icon={FILTER_ICONS[field] || Layers3}
                          options={currentOptions[field] || []}
                          selected={
                            mode === "prospects"
                              ? prospectFilters[field as ProspectMultiField]
                              : companyFilters[field as CompanyMultiField]
                          }
                          onChange={(values) =>
                            mode === "prospects"
                              ? toggleProspectMultiValue(field as ProspectMultiField, values)
                              : toggleCompanyMultiValue(field as CompanyMultiField, values)
                          }
                        />
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              </motion.aside>
            )}
          </AnimatePresence>

          {/* ─── TABLE AREA ─── */}
          <div className="flex flex-1 flex-col overflow-hidden">
            {/* Toolbar */}
            <div className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-slate-50/50 px-5 py-2.5">
              <div className="flex items-center gap-3">
                {!sidebarOpen && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="outline" size="sm" className="h-8 w-8 p-0 rounded-lg" onClick={() => setSidebarOpen(true)}>
                        <PanelLeftOpen className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Show filters</TooltipContent>
                  </Tooltip>
                )}

                <Tabs value={mode} onValueChange={switchMode}>
                  <TabsList className="h-8 rounded-lg bg-slate-200 p-0.5">
                    <TabsTrigger value="prospects" className="h-7 rounded-md px-3 text-xs data-[state=active]:bg-white">
                      <Users className="mr-1.5 h-3.5 w-3.5" />
                      Prospects
                    </TabsTrigger>
                    <TabsTrigger value="companies" className="h-7 rounded-md px-3 text-xs data-[state=active]:bg-white">
                      <Building2 className="mr-1.5 h-3.5 w-3.5" />
                      Companies
                    </TabsTrigger>
                  </TabsList>
                </Tabs>

                <span className="text-xs text-slate-500">
                  {totalIsExact ? resultCount.toLocaleString() : `~${resultCount.toLocaleString()}`} results · {PAGE_SIZE}/page
                </span>
              </div>

              <div className="flex items-center gap-2">
                {mode === "prospects" && (
                  <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="flex items-center gap-2"
                  >
                    {selectedProspectCount > 0 && (
                      <>
                        <Badge variant="secondary" className="text-xs bg-emerald-100 text-emerald-700">
                          {selectedProspectCount} selected
                        </Badge>
                        {hiddenSelectedCount > 0 && (
                          <span className="text-[11px] text-slate-500">{hiddenSelectedCount} outside current view</span>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 rounded-lg px-2 text-xs text-slate-500 hover:text-slate-900"
                          onClick={clearProspectSelection}
                        >
                          Clear selection
                        </Button>
                      </>
                    )}
                    <Button
                      size="sm"
                      onClick={() => setSaveDialogOpen(true)}
                      disabled={!canManageContacts || selectedProspectCount === 0}
                      className="h-8 rounded-lg bg-emerald-600 px-3 text-xs font-semibold text-white hover:bg-emerald-700"
                    >
                      <Save className="mr-1.5 h-3.5 w-3.5" />
                      Save selected
                    </Button>
                  </motion.div>
                )}
              </div>
            </div>

            {/* Active chips */}
            <AnimatePresence>
              {activeChips.length > 0 && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="shrink-0 overflow-hidden border-b border-slate-200 bg-slate-50/30"
                >
                  <div className="flex flex-wrap items-center gap-1.5 px-5 py-2">
                    <span className="mr-1 text-[11px] font-medium text-slate-500">Active:</span>
                    {activeChips.map((chip) => (
                      <motion.button
                        key={chip.key}
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.8, opacity: 0 }}
                        onClick={chip.remove}
                        className="group inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] transition-colors hover:border-red-300 hover:bg-red-50"
                      >
                        <span className="text-slate-500">{chip.label}:</span>
                        <span className="font-medium text-slate-700">{chip.value}</span>
                        <X className="h-3 w-3 text-slate-400 transition-colors group-hover:text-red-500" />
                      </motion.button>
                    ))}
                    <button
                      onClick={clearCurrentFilters}
                      className="ml-1 text-[11px] font-medium text-slate-500 underline-offset-2 hover:text-slate-900 hover:underline"
                    >
                      Clear all
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Shard warnings */}
            {searchData?.shardStatus?.warnings?.length ? (
              <div className="shrink-0 border-b border-amber-200 bg-amber-50 px-5 py-2.5">
                <div className="flex items-start gap-3 text-sm text-amber-800">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>
                    <p className="font-semibold">Partial shard failure — results from healthy shards only</p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {searchData.shardStatus.warnings.map((w) => (
                        <Badge key={w} variant="outline" className="border-amber-200 bg-white/80 text-amber-700 text-[10px]">
                          {w}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            {/* Table */}
            <div className="relative flex-1 overflow-auto">
              {searchQuery.isLoading && !searchData ? (
                <div className="flex h-full flex-col items-center justify-center gap-3 text-slate-500">
                  <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
                  <p className="text-sm">Loading catalog results...</p>
                </div>
              ) : searchQuery.isError && !searchData ? (
                <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
                  <div className="rounded-full bg-rose-50 p-4 text-rose-600">
                    <ShieldAlert className="h-6 w-6" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-lg font-semibold text-slate-900">Search is unavailable</h3>
                    <p className="max-w-md text-sm text-slate-500">
                      {(searchQuery.error as Error)?.message || "The search service could not return results."}
                    </p>
                  </div>
                  <Button variant="outline" className="rounded-lg" onClick={() => searchQuery.refetch()}>
                    Retry
                  </Button>
                </div>
              ) : (mode === "prospects" && prospectRows.length === 0) || (mode === "companies" && companyRows.length === 0) ? (
                <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
                  <div className="rounded-full bg-slate-100 p-4 text-slate-500">
                    {mode === "prospects" ? <Users className="h-6 w-6" /> : <Building2 className="h-6 w-6" />}
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-lg font-semibold text-slate-900">
                      No {mode === "prospects" ? "prospects" : "companies"} matched these filters
                    </h3>
                    <p className="max-w-md text-sm text-slate-500">
                      Try widening your filters to pull in more results from the active shards.
                    </p>
                  </div>
                </div>
              ) : (
                <Table>
                  <TableHeader className="sticky top-0 z-10">
                    {mode === "prospects" ? (
                      <TableRow className="border-slate-200 bg-slate-100/80 backdrop-blur">
                        <TableHead className="w-12 pl-5">
                          <Checkbox
                            checked={allVisibleSelected ? true : someVisibleSelected ? "indeterminate" : false}
                            onCheckedChange={(c) => toggleAllVisible(c === true)}
                          />
                        </TableHead>
                        <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Name</TableHead>
                        <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Title</TableHead>
                        <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Company</TableHead>
                        <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Level / Function</TableHead>
                        <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Location</TableHead>
                        <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Industry</TableHead>
                      </TableRow>
                    ) : (
                      <TableRow className="border-slate-200 bg-slate-100/80 backdrop-blur">
                        <TableHead className="pl-5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Company</TableHead>
                        <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Domain</TableHead>
                        <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Industry</TableHead>
                        <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Location</TableHead>
                        <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Size</TableHead>
                        <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Prospects</TableHead>
                        <TableHead className="pr-5 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-500">Action</TableHead>
                      </TableRow>
                    )}
                  </TableHeader>
                  <TableBody>
                    {mode === "prospects"
                      ? prospectRows.map((row) => {
                          const checked = Boolean(selectedProspectsById[row.catalogRef]);
                          const grad = getAvatarGradient(row.fullName);
                          return (
                            <TableRow
                              key={row.catalogRef}
                              className="group cursor-pointer border-slate-100 transition-colors hover:bg-emerald-50/40"
                              onClick={() => setDetailState({ mode: "prospects", catalogRef: row.catalogRef, summary: row })}
                            >
                              <TableCell className="pl-5" onClick={(e) => e.stopPropagation()}>
                                <Checkbox checked={checked} onCheckedChange={(v) => toggleRowSelection(row, v === true)} />
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-3">
                                  <div
                                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
                                    style={{ background: `linear-gradient(135deg, ${grad.from}, ${grad.to})` }}
                                  >
                                    {getInitials(row.fullName)}
                                  </div>
                                  <div className="min-w-0">
                                    <p className="truncate text-sm font-semibold text-slate-900">{formatValue(row.fullName)}</p>
                                    <p className="truncate text-xs text-slate-500">{formatValue(row.email)}</p>
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell>
                                <p className="text-sm font-medium text-slate-800 truncate max-w-[200px]">{formatValue(row.jobTitle)}</p>
                                <p className="text-xs text-slate-500 truncate max-w-[200px]">{formatValue(row.headline)}</p>
                              </TableCell>
                              <TableCell>
                                <p className="text-sm font-medium text-slate-800">{formatValue(row.companyName)}</p>
                                <p className="text-xs text-slate-500">{formatValue(row.companyDomain)}</p>
                              </TableCell>
                              <TableCell>
                                <p className="text-sm text-slate-800">{formatValue(row.jobLevel)}</p>
                                <p className="text-xs text-slate-500">{formatValue(row.jobFunction)}</p>
                              </TableCell>
                              <TableCell>
                                <p className="text-sm text-slate-800">{formatValue(row.country)}</p>
                                <p className="text-xs text-slate-500">{formatValue(row.region)}</p>
                              </TableCell>
                              <TableCell>
                                <p className="text-sm text-slate-800">{formatValue(row.industry)}</p>
                                <p className="text-xs text-slate-500">{formatValue(row.employeeSize)}</p>
                              </TableCell>
                            </TableRow>
                          );
                        })
                      : companyRows.map((row) => (
                          <TableRow
                            key={row.catalogRef}
                            className="group cursor-pointer border-slate-100 transition-colors hover:bg-emerald-50/40"
                            onClick={() => setDetailState({ mode: "companies", catalogRef: row.catalogRef, summary: row })}
                          >
                            <TableCell className="pl-5">
                              <div className="flex items-center gap-3">
                                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-sm font-bold text-slate-500">
                                  {getLeadingCharacter(row.companyName)}
                                </div>
                                <div>
                                  <p className="text-sm font-semibold text-slate-900">{row.companyName}</p>
                                  <p className="text-xs text-slate-500">Shard {row.sourceShard}</p>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="text-sm text-slate-700">{formatValue(row.domain)}</TableCell>
                            <TableCell>
                              <p className="text-sm text-slate-800">{formatValue(row.industry)}</p>
                              <p className="text-xs text-slate-500">{formatValue(row.subIndustry)}</p>
                            </TableCell>
                            <TableCell>
                              <p className="text-sm text-slate-800">{formatValue(row.country)}</p>
                              <p className="text-xs text-slate-500">{formatValue(row.region)}</p>
                            </TableCell>
                            <TableCell>
                              <Badge variant="secondary" className="rounded-md text-[11px] bg-slate-100">
                                {formatValue(row.employeeSize)}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <span className="text-sm font-semibold text-slate-900">{formatCount(row.prospectCount)}</span>
                            </TableCell>
                            <TableCell className="pr-5 text-right">
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 rounded-lg text-xs opacity-0 transition-opacity group-hover:opacity-100"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openProspectViewFromCompany(row);
                                }}
                              >
                                View prospects
                                <ChevronRight className="ml-1 h-3.5 w-3.5" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                  </TableBody>
                </Table>
              )}

              {showLoadingOverlay && (
                <div className="absolute inset-0 flex items-start justify-center bg-white/60 pt-12 backdrop-blur-[1px]">
                  <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm">
                    <Loader2 className="h-4 w-4 animate-spin text-emerald-600" />
                    Refreshing results
                  </div>
                </div>
              )}
            </div>

            {/* Pagination */}
            <div className="flex shrink-0 items-center justify-between border-t border-slate-200 bg-white px-5 py-2.5">
              <p className="text-xs text-slate-500">
                {mode === "prospects"
                  ? selectedProspectCount > 0
                    ? `${selectedProspectCount} selected · ${visibleSelectedCount} on this page${hiddenSelectedCount > 0 ? ` · ${hiddenSelectedCount} outside current view` : ""} · Page ${pageNumber}`
                    : `Page ${pageNumber}`
                  : `Page ${pageNumber}`}
              </p>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 rounded-lg px-2.5 text-xs"
                  disabled={!hasPreviousPage}
                  onClick={goToPreviousPage}
                >
                  <ChevronLeft className="mr-1 h-3.5 w-3.5" />
                  Prev
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 rounded-lg px-2.5 text-xs"
                  disabled={!nextCursor}
                  onClick={goToNextPage}
                >
                  Next
                  <ChevronRight className="ml-1 h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ─── SAVE DIALOG ─── */}
      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogContent className="max-w-lg rounded-2xl border-slate-200">
          <DialogHeader>
            <DialogTitle>Save selected prospects</DialogTitle>
            <DialogDescription>
              Import the selected catalog results into one of your existing contact lists, including prospects selected on other pages.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {!canManageContacts && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                You need the manage_contacts permission to save catalog results into workspace lists.
              </div>
            )}
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-sm font-medium text-slate-900">
                {selectedProspectCount} prospect{selectedProspectCount === 1 ? "" : "s"} ready to import
              </p>
              <p className="mt-1 text-sm text-slate-500">
                Existing snapshots are reused automatically when the same catalog reference is saved again.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Select a list</Label>
              <Select value={selectedListId} onValueChange={setSelectedListId}>
                <SelectTrigger className="h-10 rounded-xl">
                  <SelectValue placeholder={listsQuery.isLoading ? "Loading lists..." : "Choose a contact list"} />
                </SelectTrigger>
                <SelectContent>
                  {(listsQuery.data || []).map((list) => (
                    <SelectItem key={list.id} value={list.id}>
                      {list.name} ({list.count})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {listsQuery.isError && <p className="text-sm text-rose-600">{(listsQuery.error as Error).message}</p>}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setSaveDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={handleSaveSelection}
              disabled={!canManageContacts || !selectedListId || selectedProspectCount === 0 || importMutation.isPending}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {importMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Save to list
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── DETAIL SHEET ─── */}
      <Sheet open={!!detailState} onOpenChange={(open) => !open && setDetailState(null)}>
        <SheetContent side="right" className="w-full overflow-y-auto border-l border-slate-200 bg-white p-0 sm:max-w-[440px]">
          {detailState && detailItem ? (
            <>
              <SheetHeader className="border-b border-slate-200 px-6 py-5">
                <div className="flex items-center gap-4">
                  {detailState.mode === "prospects" ? (
                    <div
                      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
                      style={{
                        background: `linear-gradient(135deg, ${getAvatarGradient((detailItem as ProspectSearchRow).fullName).from}, ${getAvatarGradient((detailItem as ProspectSearchRow).fullName).to})`,
                      }}
                    >
                      {getInitials((detailItem as ProspectSearchRow).fullName)}
                    </div>
                  ) : (
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-lg font-bold text-slate-500">
                      {getLeadingCharacter((detailItem as CompanySearchRow).companyName)}
                    </div>
                  )}
                  <div className="min-w-0">
                    <SheetTitle className="text-lg text-slate-900">
                      {detailState.mode === "prospects"
                        ? formatValue((detailItem as ProspectSearchRow).fullName)
                        : (detailItem as CompanySearchRow).companyName}
                    </SheetTitle>
                    <SheetDescription className="text-sm">
                      {detailState.mode === "prospects"
                        ? formatValue((detailItem as ProspectSearchRow).jobTitle)
                        : formatValue((detailItem as CompanySearchRow).domain)}
                    </SheetDescription>
                  </div>
                </div>
              </SheetHeader>

              <div className="space-y-5 px-6 py-5">
                {detailState.mode === "prospects" ? (
                  <>
                    {/* Contact info */}
                    <div className="space-y-2">
                      <h3 className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">Contact</h3>
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-3 rounded-lg bg-slate-50 px-3 py-2.5">
                          <Mail className="h-4 w-4 text-slate-400" />
                          <span className="text-sm text-slate-700">{formatValue((detailItem as ProspectSearchRow).email)}</span>
                        </div>
                        {(detailItem as ProspectSearchRow).phone && (
                          <div className="flex items-center gap-3 rounded-lg bg-slate-50 px-3 py-2.5">
                            <Phone className="h-4 w-4 text-slate-400" />
                            <span className="text-sm text-slate-700">{(detailItem as ProspectSearchRow).phone}</span>
                          </div>
                        )}
                        {(detailItem as ProspectSearchRow).linkedin && (
                          <a
                            href={(detailItem as ProspectSearchRow).linkedin || "#"}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-3 rounded-lg bg-slate-50 px-3 py-2.5 transition-colors hover:bg-slate-100"
                          >
                            <ExternalLink className="h-4 w-4 text-slate-400" />
                            <span className="text-sm text-emerald-700">LinkedIn Profile</span>
                            <ExternalLink className="ml-auto h-3.5 w-3.5 text-slate-400" />
                          </a>
                        )}
                      </div>
                    </div>

                    <Separator />

                    {/* Role & Company cards */}
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
                        <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-900">
                          <Briefcase className="h-3.5 w-3.5 text-emerald-600" />
                          Role
                        </div>
                        <div className="space-y-1.5 text-xs text-slate-500">
                          <p>Title: <span className="text-slate-700">{formatValue((detailItem as ProspectSearchRow).jobTitle)}</span></p>
                          <p>Level: <span className="text-slate-700">{formatValue((detailItem as ProspectSearchRow).jobLevel)}</span></p>
                          <p>Function: <span className="text-slate-700">{formatValue((detailItem as ProspectSearchRow).jobFunction)}</span></p>
                        </div>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
                        <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-900">
                          <Building2 className="h-3.5 w-3.5 text-emerald-600" />
                          Company
                        </div>
                        <div className="space-y-1.5 text-xs text-slate-500">
                          <p>Name: <span className="text-slate-700">{formatValue((detailItem as ProspectSearchRow).companyName)}</span></p>
                          <p>Domain: <span className="text-slate-700">{formatValue((detailItem as ProspectSearchRow).companyDomain)}</span></p>
                        </div>
                      </div>
                    </div>

                    <Separator />

                    {/* Details */}
                    <div className="space-y-2">
                      <h3 className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">Details</h3>
                      <div className="grid gap-1.5">
                        <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                          <span className="flex items-center gap-2 text-xs text-slate-500"><MapPin className="h-3.5 w-3.5" /> Location</span>
                          <span className="text-xs font-medium text-slate-700">
                            {formatValue((detailItem as ProspectSearchRow).country)}, {formatValue((detailItem as ProspectSearchRow).region)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                          <span className="flex items-center gap-2 text-xs text-slate-500"><Factory className="h-3.5 w-3.5" /> Industry</span>
                          <span className="text-xs font-medium text-slate-700">{formatValue((detailItem as ProspectSearchRow).industry)}</span>
                        </div>
                        <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                          <span className="flex items-center gap-2 text-xs text-slate-500"><Users className="h-3.5 w-3.5" /> Company size</span>
                          <span className="text-xs font-medium text-slate-700">{formatValue((detailItem as ProspectSearchRow).employeeSize)}</span>
                        </div>
                        {(detailItem as ProspectSearchRow).naics && (
                          <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                            <span className="flex items-center gap-2 text-xs text-slate-500"><Hash className="h-3.5 w-3.5" /> NAICS</span>
                            <span className="text-xs font-medium text-slate-700">{(detailItem as ProspectSearchRow).naics}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
                        <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-900">
                          <Globe2 className="h-3.5 w-3.5 text-emerald-600" />
                          Geography
                        </div>
                        <div className="space-y-1.5 text-xs text-slate-500">
                          <p>Country: <span className="text-slate-700">{formatValue((detailItem as CompanySearchRow).country)}</span></p>
                          <p>Region: <span className="text-slate-700">{formatValue((detailItem as CompanySearchRow).region)}</span></p>
                          <p>Domain: <span className="text-slate-700">{formatValue((detailItem as CompanySearchRow).domain)}</span></p>
                        </div>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
                        <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-900">
                          <Layers3 className="h-3.5 w-3.5 text-emerald-600" />
                          Classification
                        </div>
                        <div className="space-y-1.5 text-xs text-slate-500">
                          <p>Industry: <span className="text-slate-700">{formatValue((detailItem as CompanySearchRow).industry)}</span></p>
                          <p>Sub: <span className="text-slate-700">{formatValue((detailItem as CompanySearchRow).subIndustry)}</span></p>
                          <p>Size: <span className="text-slate-700">{formatValue((detailItem as CompanySearchRow).employeeSize)}</span></p>
                        </div>
                      </div>
                    </div>
                    <div className="grid gap-1.5">
                      <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                        <span className="flex items-center gap-2 text-xs text-slate-500"><Target className="h-3.5 w-3.5" /> Prospects</span>
                        <span className="text-xs font-medium text-slate-700">{formatCount((detailItem as CompanySearchRow).prospectCount)}</span>
                      </div>
                      <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                        <span className="flex items-center gap-2 text-xs text-slate-500"><Hash className="h-3.5 w-3.5" /> NAICS</span>
                        <span className="text-xs font-medium text-slate-700">{formatValue((detailItem as CompanySearchRow).naics)}</span>
                      </div>
                    </div>
                    <Button
                      className="w-full rounded-xl bg-emerald-600 font-semibold text-white hover:bg-emerald-700"
                      onClick={() => openProspectViewFromCompany(detailItem as CompanySearchRow)}
                    >
                      View matching prospects
                    </Button>
                  </>
                )}

                <Separator />

                <div className="space-y-2">
                  <h3 className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">Catalog source</h3>
                  <p className="text-xs text-slate-600">Catalog ref: {detailState.catalogRef}</p>
                  <p className="text-xs text-slate-600">Shard: {detailState.summary.sourceShard}</p>
                  <p className="text-xs text-slate-600">Source record: {detailState.summary.sourceRecordId}</p>
                </div>
              </div>
            </>
          ) : (
            <div className="flex h-full items-center justify-center p-6 text-sm text-slate-500">
              Select a row to inspect details.
            </div>
          )}
        </SheetContent>
      </Sheet>
    </DashboardLayout>
  );
};

export default Find;

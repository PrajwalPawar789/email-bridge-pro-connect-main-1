
import React, { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { toast } from "@/hooks/use-toast";
import { 
  Activity,
  Plus,
  FileUp,
  Search,
  Users,
  Trash2,
  ArrowLeft,
  Loader2,
  Download,
  UserPlus,
  FileSpreadsheet,
  Mail,
  Building,
  Sparkles,
  ListChecks,
  BarChart3,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Globe2,
  ShieldCheck,
  Target,
  Webhook,
  LayoutGrid,
  LayoutList,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import * as XLSX from "xlsx";
import { useAuth } from "@/providers/AuthProvider";
import { runAutomationRunner } from "@/lib/automations";

interface Prospect {
  id: string;
  name: string;
  email: string;
  company?: string;
  job_title?: string;
  phone?: string;
  sender_name?: string;
  sender_email?: string;
  country?: string;
  industry?: string;
  webhook_first_received_at?: string | null;
  webhook_last_received_at?: string | null;
  last_activity_at?: string | null;
  last_activity_type?: string | null;
}

interface EmailList {
  id: string;
  name: string;
  description?: string;
  created_at: string;
  count?: number; // Optional count for UI
}

type AutomationKickoffResult = {
  matchedWorkflows: number;
  triggered: number;
  failed: number;
};

type WebhookActivityItem = {
  id: string;
  eventType: string;
  message: string;
  createdAt: string;
  prospectName: string;
  prospectEmail: string;
  prospectCompany?: string | null;
};

const formatDateTime = (value: string | null | undefined) => {
  if (!value) return "Never";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "Never" : parsed.toLocaleString();
};

const formatActivityLabel = (value: string | null | undefined) => {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return "Activity";
  if (normalized === "webhook_received") return "Webhook received";
  if (normalized === "automation_email_sent") return "Automation email sent";
  if (normalized === "automation_email_opened") return "Email opened";
  if (normalized === "automation_email_clicked") return "Email clicked";
  return normalized.replace(/_/g, " ");
};

const ProspectShell = ({ children }: { children: React.ReactNode }) => (
  <div className="relative -my-8 min-h-[calc(100vh-4rem)] bg-[var(--shell-bg)] text-[var(--shell-ink)]">
    <style>{`
      @keyframes list-rise {
        from { opacity: 0; transform: translateY(14px); }
        to { opacity: 1; transform: translateY(0); }
      }
      @keyframes list-float {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-12px); }
      }
      .list-rise { animation: list-rise 0.6s ease-out both; }
      .list-float { animation: list-float 10s ease-in-out infinite; }
      @media (prefers-reduced-motion: reduce) {
        .list-rise, .list-float { animation: none; }
      }
    `}</style>
    <div className="pointer-events-none absolute inset-0">
      <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-emerald-200/40 blur-3xl list-float"></div>
      <div className="absolute -left-24 top-1/3 h-72 w-72 rounded-full bg-amber-200/35 blur-3xl list-float" style={{ animationDelay: "1.2s" }}></div>
      <div className="absolute bottom-0 right-1/3 h-56 w-56 rounded-full bg-sky-200/30 blur-3xl list-float" style={{ animationDelay: "2.2s" }}></div>
    </div>
    <div className="relative mx-auto w-full max-w-7xl space-y-6 px-5 py-6 lg:px-8 lg:py-8">
      {children}
    </div>
  </div>
);

const ProspectListManager: React.FC = () => {
  const { user } = useAuth();
  const [lists, setLists] = useState<EmailList[]>([]);
  const [selectedList, setSelectedList] = useState<EmailList | null>(null);
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [prospectSearchQuery, setProspectSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);
  const [totalProspects, setTotalProspects] = useState(0);
  const [listPage, setListPage] = useState(1);
  const [listPageSize, setListPageSize] = useState(6);
  const [listSort, setListSort] = useState("recent");
  const [listViewMode, setListViewMode] = useState<"cards" | "list">("cards");
  const [listStatusFilter, setListStatusFilter] = useState<"all" | "ready" | "empty">("all");
  const pageSizeOptions = [100, 500, 1000];
  const listPageSizeOptions = [6, 9, 12];
  const listSortOptions = [
    { value: "recent", label: "Newest first" },
    { value: "name", label: "Name A-Z" },
    { value: "size", label: "Most prospects" },
    { value: "size-asc", label: "Smallest first" },
  ];

  // Dialog States
  const [isCreateListOpen, setIsCreateListOpen] = useState(false);
  const [isAddProspectOpen, setIsAddProspectOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);

  // Form States
  const [newListForm, setNewListForm] = useState({ name: "", description: "" });
  const [newProspectForm, setNewProspectForm] = useState({
    name: "",
    email: "",
    company: "",
    job_title: "",
    phone: "",
    sender_name: "",
    sender_email: "",
    country: "",
    industry: "",
  });
  const [excelUploading, setExcelUploading] = useState(false);
  const [importProgress, setImportProgress] = useState({ processed: 0, total: 0, errors: 0 });
  const [importResults, setImportResults] = useState<{ success: number; errors: number; skipped: number } | null>(null);
  const [importFileKey, setImportFileKey] = useState(0);
  const [webhookProspects, setWebhookProspects] = useState<Prospect[]>([]);
  const [webhookActivities, setWebhookActivities] = useState<WebhookActivityItem[]>([]);
  const [webhookLeadCount, setWebhookLeadCount] = useState(0);
  const [webhookHitsLast7Days, setWebhookHitsLast7Days] = useState(0);
  const [webhookWorkspaceLoading, setWebhookWorkspaceLoading] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    void fetchLists();
    void fetchWebhookWorkspaceData();
  }, [user?.id]);
  useEffect(() => {
    if (selectedList) {
      fetchProspects(selectedList.id, currentPage, pageSize, prospectSearchQuery);
    }
  }, [selectedList, currentPage, pageSize, prospectSearchQuery]);

  const fetchLists = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase
      .from("email_lists")
      .select("*, email_list_prospects(count)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      // Map the count correctly
      const formattedLists = data.map((list: any) => ({
        ...list,
        count: list.email_list_prospects?.[0]?.count || 0
      }));
      setLists(formattedLists || []);
    }
    setLoading(false);
  };

  const fetchWebhookWorkspaceData = async () => {
    if (!user?.id) return;

    setWebhookWorkspaceLoading(true);
    try {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

      const [countResponse, recentProspectsResponse, webhookHitsResponse, logResponse] = await Promise.all([
        supabase
          .from("prospects")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .not("webhook_first_received_at", "is", null),
        supabase
          .from("prospects")
          .select(
            "id, name, email, company, job_title, webhook_first_received_at, webhook_last_received_at, last_activity_at, last_activity_type"
          )
          .eq("user_id", user.id)
          .not("webhook_first_received_at", "is", null)
          .order("webhook_last_received_at", { ascending: false })
          .limit(6),
        (supabase as any)
          .from("automation_logs")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .eq("event_type", "webhook_received")
          .gte("created_at", sevenDaysAgo),
        (supabase as any)
          .from("automation_logs")
          .select("id, contact_id, event_type, message, created_at, metadata")
          .eq("user_id", user.id)
          .in("event_type", [
            "webhook_received",
            "email_sent",
            "email_opened",
            "email_clicked",
            "workflow_completed",
          ])
          .order("created_at", { ascending: false })
          .limit(40),
      ]);

      if (countResponse.error) throw countResponse.error;
      if (recentProspectsResponse.error) throw recentProspectsResponse.error;
      if (webhookHitsResponse.error) throw webhookHitsResponse.error;
      if (logResponse.error) throw logResponse.error;

      setWebhookLeadCount(countResponse.count ?? 0);
      setWebhookHitsLast7Days(webhookHitsResponse.count ?? 0);
      setWebhookProspects((recentProspectsResponse.data || []) as Prospect[]);

      const rawLogs = Array.isArray(logResponse.data) ? logResponse.data : [];
      const contactIds = [...new Set(rawLogs.map((row: any) => row.contact_id).filter(Boolean))];

      if (contactIds.length === 0) {
        setWebhookActivities([]);
        return;
      }

      const contactResponse = await (supabase as any)
        .from("automation_contacts")
        .select("id, prospect_id, email, full_name")
        .in("id", contactIds);

      if (contactResponse.error) throw contactResponse.error;

      const contacts = Array.isArray(contactResponse.data) ? contactResponse.data : [];
      const contactMap = new Map(contacts.map((row: any) => [row.id, row]));
      const prospectIds = [
        ...new Set(
          contacts
            .map((row: any) => row.prospect_id)
            .filter(Boolean)
        ),
      ];

      if (prospectIds.length === 0) {
        setWebhookActivities([]);
        return;
      }

      const prospectResponse = await supabase
        .from("prospects")
        .select("id, name, email, company, webhook_first_received_at")
        .in("id", prospectIds);

      if (prospectResponse.error) throw prospectResponse.error;

      const prospectMap = new Map(
        ((prospectResponse.data || []) as Prospect[]).map((row) => [row.id, row])
      );

      const activityItems = rawLogs
        .map((row: any) => {
          const contact = contactMap.get(row.contact_id);
          const prospect = contact?.prospect_id ? prospectMap.get(contact.prospect_id) : null;
          if (!prospect?.webhook_first_received_at) return null;

          return {
            id: String(row.id || `${row.contact_id}_${row.created_at}`),
            eventType: String(row.event_type || ""),
            message: String(row.message || ""),
            createdAt: String(row.created_at || ""),
            prospectName: String(prospect.name || contact?.full_name || "Webhook lead"),
            prospectEmail: String(prospect.email || contact?.email || ""),
            prospectCompany: prospect.company || null,
          } as WebhookActivityItem;
        })
        .filter((item): item is WebhookActivityItem => Boolean(item))
        .slice(0, 8);

      setWebhookActivities(activityItems);
    } catch (error) {
      console.error("Failed to load webhook workspace data:", error);
      setWebhookLeadCount(0);
      setWebhookHitsLast7Days(0);
      setWebhookProspects([]);
      setWebhookActivities([]);
    } finally {
      setWebhookWorkspaceLoading(false);
    }
  };

  const fetchProspects = async (
    listId: string,
    page = currentPage,
    size = pageSize,
    search = prospectSearchQuery
  ) => {
    setLoading(true);
    const from = (page - 1) * size;
    const to = from + size - 1;
    const trimmedSearch = search.trim();

    try {
      let query = supabase
        .from("prospects")
        .select(
          "id, name, email, company, job_title, phone, country, industry, sender_name, sender_email, email_list_prospects!inner(list_id, created_at)",
          { count: "exact" }
        )
        .eq("email_list_prospects.list_id", listId);

      if (trimmedSearch) {
        const pattern = `%${trimmedSearch}%`;
        query = query.or(
          `name.ilike.${pattern},email.ilike.${pattern},company.ilike.${pattern},job_title.ilike.${pattern},country.ilike.${pattern},industry.ilike.${pattern}`
        );
      }

      const { data, error, count } = await query
        .order("created_at", { foreignTable: "email_list_prospects", ascending: false })
        .range(from, to);

      if (error) throw error;

      setProspects((data || []) as Prospect[]);
      setTotalProspects(count ?? 0);
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      setProspects([]);
      setTotalProspects(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(totalProspects / pageSize));
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, pageSize, totalProspects]);

  const handlePageChange = (page: number) => {
    const totalPages = Math.max(1, Math.ceil(totalProspects / pageSize));
    if (page < 1 || page > totalPages || page === currentPage) return;
    setCurrentPage(page);
  };

  const handlePageSizeChange = (value: string) => {
    const nextSize = Number(value);
    if (!Number.isFinite(nextSize)) return;
    setPageSize(nextSize);
    setCurrentPage(1);
  };

  const handleListPageChange = (page: number) => {
    const totalPages = Math.max(1, Math.ceil(filteredLists.length / listPageSize));
    if (page < 1 || page > totalPages || page === listPage) return;
    setListPage(page);
  };

  const handleListPageSizeChange = (value: string) => {
    const nextSize = Number(value);
    if (!Number.isFinite(nextSize)) return;
    setListPageSize(nextSize);
    setListPage(1);
  };

  const handleListSortChange = (value: string) => {
    setListSort(value);
    setListPage(1);
  };

  const handleTemplateDownload = () => {
    const header = "name,email,company,job_title,phone,country,industry,sender_name,sender_email\n";
    const blob = new Blob([header], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "prospects-template.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const openList = (list: EmailList) => {
    setSelectedList(list);
    setCurrentPage(1);
    setTotalProspects(list.count || 0);
    setProspectSearchQuery("");
  };

  const handleCreateList = async () => {
    if (!newListForm.name) {
      toast({ title: "Error", description: "List name required", variant: "destructive" });
      return;
    }
    
    const { data: userData } = await supabase.auth.getUser();
    const user_id = userData?.user?.id;
    if (!user_id) return;

    const { error } = await supabase.from("email_lists").insert({
      user_id,
      name: newListForm.name,
      description: newListForm.description,
    });

    if (!error) {
      toast({ title: "Success", description: "List created successfully." });
      setNewListForm({ name: "", description: "" });
      setIsCreateListOpen(false);
      fetchLists();
    } else {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const handleDeleteList = async (listId: string) => {
    const confirmMessage =
      "Are you sure you want to delete this list? Prospects that are only in this list will be deleted. Prospects in other lists will be kept.";
    if (!confirm(confirmMessage)) return;

    const { data: userData } = await supabase.auth.getUser();
    const user_id = userData?.user?.id;

    try {
      const { data: listLinks, error: listLinksError } = await supabase
        .from("email_list_prospects")
        .select("prospect_id")
        .eq("list_id", listId);

      if (listLinksError) throw listLinksError;

      const prospectIds = (listLinks || []).map((row: any) => row.prospect_id).filter(Boolean);

      let orphanIds: string[] = [];
      if (prospectIds.length > 0) {
        const { data: otherLinks, error: otherLinksError } = await supabase
          .from("email_list_prospects")
          .select("prospect_id")
          .in("prospect_id", prospectIds)
          .neq("list_id", listId);

        if (otherLinksError) throw otherLinksError;

        const protectedIds = new Set((otherLinks || []).map((row: any) => row.prospect_id));
        orphanIds = prospectIds.filter((id) => !protectedIds.has(id));
      }

      const { error: deleteListError } = await supabase
        .from("email_lists")
        .delete()
        .eq("id", listId);

      if (deleteListError) throw deleteListError;

      let removedProspects = 0;
      if (orphanIds.length > 0 && user_id) {
        const { error: deleteProspectsError } = await supabase
          .from("prospects")
          .delete()
          .in("id", orphanIds)
          .eq("user_id", user_id);

        if (deleteProspectsError) {
          console.warn("Failed to delete orphan prospects:", deleteProspectsError);
        } else {
          removedProspects = orphanIds.length;
        }
      }

      const message =
        removedProspects > 0
          ? `List deleted. ${removedProspects} prospects removed.`
          : "List deleted successfully.";
      toast({ title: "Deleted", description: message });

      if (selectedList?.id === listId) {
        setSelectedList(null);
        setProspects([]);
        setTotalProspects(0);
      }
      fetchLists();
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "Failed to delete list.", variant: "destructive" });
    }
  };

  const kickoffListAutomations = async (listId: string): Promise<AutomationKickoffResult> => {
    const emptyResult: AutomationKickoffResult = {
      matchedWorkflows: 0,
      triggered: 0,
      failed: 0,
    };

    if (!listId || !user?.id) return emptyResult;

    try {
      const { data: workflows, error } = await supabase
        .from("automation_workflows")
        .select("id")
        .eq("user_id", user.id)
        .eq("trigger_type", "list_joined")
        .eq("trigger_list_id", listId)
        .eq("status", "live");

      if (error) {
        console.warn("Failed to query workflows for automation kickoff:", error.message);
        return emptyResult;
      }

      const workflowIds = (workflows || [])
        .map((workflow: { id: string }) => workflow.id)
        .filter(Boolean);

      if (workflowIds.length === 0) return emptyResult;

      const kickoffResults = await Promise.all(
        workflowIds.map(async (workflowId) => {
          try {
            await runAutomationRunner("run_now", workflowId);
            return true;
          } catch (runnerError) {
            console.warn(`Failed to run workflow ${workflowId} after list update:`, runnerError);
            return false;
          }
        })
      );

      const triggered = kickoffResults.filter(Boolean).length;
      return {
        matchedWorkflows: workflowIds.length,
        triggered,
        failed: workflowIds.length - triggered,
      };
    } catch (error) {
      console.warn("Unexpected automation kickoff error:", error);
      return emptyResult;
    }
  };

  const handleAddProspect = async () => {
    if (!selectedList) return;
    if (!newProspectForm.email || !newProspectForm.name) {
      toast({ title: "Error", description: "Name and email are required", variant: "destructive" });
      return;
    }

    const user_id = user?.id;
    if (!user_id) {
      toast({ title: "Error", description: "You must be logged in to add prospects.", variant: "destructive" });
      return;
    }

    const normalizedEmail = newProspectForm.email.trim().toLowerCase();

    // 1. Check/Create Prospect
    let { data: prospectData, error } = await supabase
      .from("prospects")
      .select("id, name, email, company, job_title, phone, sender_name, sender_email, country, industry")
      .eq("email", normalizedEmail)
      .eq("user_id", user_id)
      .limit(1)
      .maybeSingle();

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }

    let prospect = prospectData as any;

    if (!prospect) {
      const { data: newProspectData, error: insertErr } = await supabase
        .from("prospects")
        .insert({ 
          user_id, 
          name: newProspectForm.name, 
          email: normalizedEmail, 
          company: newProspectForm.company || null, 
          job_title: newProspectForm.job_title || null,
          phone: newProspectForm.phone || null,
          sender_name: newProspectForm.sender_name || null,
          sender_email: newProspectForm.sender_email || null,
          country: newProspectForm.country || null,
          industry: newProspectForm.industry || null
        } as any)
        .select("id, name, email, company, job_title, phone, sender_name, sender_email, country, industry")
        .single();
      
      if (insertErr) {
        toast({ title: "Error", description: insertErr.message, variant: "destructive" });
        return;
      }
      prospect = newProspectData;
    }

    // 2. Link to List
    if (prospect) {
      const { error: linkError } = await supabase
        .from("email_list_prospects")
        .insert({ list_id: selectedList.id, prospect_id: prospect.id });

      if (!linkError) {
        const kickoffResult = await kickoffListAutomations(selectedList.id);

        toast({ title: "Success", description: "Prospect added to list." });
        setNewProspectForm({ name: "", email: "", company: "", job_title: "", phone: "", sender_name: "", sender_email: "", country: "", industry: "" });
        setIsAddProspectOpen(false);
        setTotalProspects((prev) => prev + 1);
        setSelectedList((prev) =>
          prev ? { ...prev, count: (prev.count || 0) + 1 } : prev
        );
        setLists((prev) =>
          prev.map((list) =>
            list.id === selectedList.id ? { ...list, count: (list.count || 0) + 1 } : list
          )
        );
        if (currentPage === 1) {
          const newProspect: Prospect = {
            id: prospect.id,
            name: prospect.name || newProspectForm.name,
            email: prospect.email || normalizedEmail,
            company: prospect.company || undefined,
            job_title: prospect.job_title || undefined,
            phone: prospect.phone || undefined,
            sender_name: prospect.sender_name || undefined,
            sender_email: prospect.sender_email || undefined,
            country: prospect.country || undefined,
            industry: prospect.industry || undefined,
          };
          setProspects((prev) => {
            if (prev.some((p) => p.id === newProspect.id)) return prev;
            const next = [newProspect, ...prev];
            return next.slice(0, pageSize);
          });
        }

        if (kickoffResult.failed > 0) {
          toast({
            title: "Automation warning",
            description: `Added to list, but ${kickoffResult.failed} workflow run(s) failed. Check Automations logs.`,
            variant: "destructive",
          });
        }
      } else {
        if (linkError.code === '23505') { // Unique violation
           toast({ title: "Info", description: "Prospect is already in this list." });
        } else {
           toast({ title: "Error", description: linkError.message, variant: "destructive" });
        }
      }
    }
  };

  const handleExcelUpload = async (evt: React.ChangeEvent<HTMLInputElement>) => {
    const file = evt.target.files && evt.target.files[0];
    if (!selectedList || !file) {
      console.log('Missing selectedList or file:', { selectedList, file });
      toast({ title: "Error", description: "Please select a list first and choose a file.", variant: "destructive" });
      return;
    }

    setExcelUploading(true);
    setImportProgress({ processed: 0, total: 0, errors: 0 });
    setImportResults(null);
    
    console.log('Starting import for list:', selectedList.id, 'file:', file.name);
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = e.target?.result;
        console.log('File loaded, parsing with XLSX...');
        
        const workbook = XLSX.read(data, { type: "binary" });
        console.log('Workbook sheets:', workbook.SheetNames);
        
        // Find the first sheet with data
        let sheetName = workbook.SheetNames[0];
        let sheet = workbook.Sheets[sheetName];
        
        // If the first sheet is empty, try others
        if (!sheet || Object.keys(sheet).length === 0) {
          for (const name of workbook.SheetNames) {
            const testSheet = workbook.Sheets[name];
            if (testSheet && Object.keys(testSheet).length > 0) {
              sheetName = name;
              sheet = testSheet;
              break;
            }
          }
        }
        
        console.log('Using sheet:', sheetName);
        console.log('Sheet data keys:', Object.keys(sheet));
        
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", blankrows: false }) as (string | number | null)[][];
        console.log('Raw rows data:', rows);
        console.log('Number of rows:', rows.length);

        const headerRowIndex = rows.findIndex((row) =>
          Array.isArray(row) && row.some((cell) => (cell ?? "").toString().trim() !== "")
        );

        if (headerRowIndex === -1) {
          toast({ title: "Error", description: "No header row found. Please check your file format.", variant: "destructive" });
          setExcelUploading(false);
          return;
        }

        // Header mapping logic - prefer exact matches and avoid confusing sender_email with main email
        let headerIdx: { [k: string]: number } = {};
        const rawHeaderRow = rows[headerRowIndex] || [];
        const headerRow = rawHeaderRow.map(x => (x ?? "").toString().toLowerCase().trim());
        const headerLength = headerRow.length;

        console.log('Raw header row:', rawHeaderRow);
        console.log('Processed headers:', headerRow);

        const findExactIndex = (aliases: string[]) => {
          for (const alias of aliases) {
            const idx = headerRow.findIndex((c) => c === alias);
            if (idx !== -1) return idx;
          }
          return -1;
        };

        const findContainsIndex = (tokens: string[], excludeTokens: string[] = []) =>
          headerRow.findIndex((c) => tokens.some((t) => c.includes(t)) && !excludeTokens.some((ex) => c.includes(ex)));

        const findContainsAllIndex = (tokens: string[], excludeTokens: string[] = []) =>
          headerRow.findIndex((c) => tokens.every((t) => c.includes(t)) && !excludeTokens.some((ex) => c.includes(ex)));

        const pickIndex = (exactAliases: string[], containsTokens?: string[], excludeTokens?: string[]) => {
          const exactIdx = findExactIndex(exactAliases);
          if (exactIdx !== -1) return exactIdx;
          if (containsTokens && containsTokens.length > 0) {
            return findContainsIndex(containsTokens, excludeTokens);
          }
          return -1;
        };

        const setHeaderIndex = (key: string, idx: number) => {
          if (idx !== -1 && headerIdx[key] === undefined) {
            headerIdx[key] = idx;
          }
        };

        // Find main email column: prefer exact 'email' (not 'sender_email')
        const findEmailIndex = () => {
          if (!headerRow) return -1;
          // 1) exact matches
          const exactNames = ['email', 'e-mail', 'email address', 'mail'];
          for (const name of exactNames) {
            const idx = headerRow.findIndex(c => c === name);
            if (idx !== -1) return idx;
          }
          // 2) contains 'email' but not 'sender'
          let idx = headerRow.findIndex(c => c.includes('email') && !c.includes('sender'));
          if (idx !== -1) return idx;
          // 3) fallback to first header containing 'email'
          return headerRow.findIndex(c => c.includes('email'));
        };

        const emailIndex = findEmailIndex();
        console.log('Email index found:', emailIndex);
        if (emailIndex === -1 || emailIndex === undefined) {
          toast({ title: "Error", description: "Missing 'email' column in header. Please ensure your file has an 'email' column.", variant: "destructive" });
          setExcelUploading(false);
          return;
        }

        headerIdx['email'] = emailIndex;

        // Map all possible column variations with prioritization (exact > contains)
        setHeaderIndex('sender_name', pickIndex(['sender_name', 'sender name', 'from name']));
        if (headerIdx['sender_name'] === undefined) {
          setHeaderIndex('sender_name', findContainsAllIndex(['sender', 'name'], ['email']));
          setHeaderIndex('sender_name', findContainsAllIndex(['from', 'name'], ['email']));
        }

        setHeaderIndex('sender_email', pickIndex(['sender_email', 'sender email', 'from email']));
        if (headerIdx['sender_email'] === undefined) {
          setHeaderIndex('sender_email', findContainsAllIndex(['sender', 'email']));
          setHeaderIndex('sender_email', findContainsAllIndex(['from', 'email']));
        }

        setHeaderIndex(
          'name',
          pickIndex(
            ['name', 'full name', 'contact name', 'first name', 'contact'],
            ['name'],
            ['sender', 'company', 'email']
          )
        );
        setHeaderIndex(
          'company',
          pickIndex(
            ['company', 'company name', 'organization', 'organisation', 'business', 'employer'],
            ['company', 'organization', 'organisation', 'org'],
            ['email', 'website', 'domain', 'size']
          )
        );
        setHeaderIndex(
          'job_title',
          pickIndex(
            ['job_title', 'job title', 'title', 'role', 'position', 'job'],
            ['title', 'role', 'position', 'job'],
            ['email', 'sender']
          )
        );
        setHeaderIndex(
          'phone',
          pickIndex(
            ['phone', 'telephone', 'mobile', 'cell', 'phone number', 'tel'],
            ['phone', 'telephone', 'mobile', 'cell', 'tel'],
            ['fax']
          )
        );
        setHeaderIndex(
          'country',
          pickIndex(
            ['country', 'nation', 'location'],
            ['country', 'nation', 'location'],
            ['company', 'email']
          )
        );
        setHeaderIndex(
          'industry',
          pickIndex(
            ['industry', 'sector', 'business type', 'field', 'category'],
            ['industry', 'sector'],
            ['email']
          )
        );

        console.log('Final column mapping:', headerIdx);
        const { data: userData } = await supabase.auth.getUser();
        const user_id = userData?.user?.id;
        
        console.log('User data:', userData);
        console.log('User ID:', user_id);

        // Check which optional columns exist in the DB to avoid insert errors
        const columnAvailability: { [k: string]: boolean } = {
          job_title: true,
          country: true,
          industry: true,
          sender_name: true,
          sender_email: true,
        };

        // Helper to test a single column
        const testColumn = async (col: string) => {
          try {
            await supabase.from('prospects').select(col).limit(1);
            return true;
          } catch (err: any) {
            // If PostgREST returns an error about missing column, mark unavailable
            const msg = err?.message || '';
            if (msg.toLowerCase().includes('could not find') || msg.toLowerCase().includes('column')) {
              return false;
            }
            // For any other error, assume column might exist (we'll surface insert errors later)
            return true;
          }
        };

        // Test availability for each optional field (do them sequentially, cheap operations)
        columnAvailability.job_title = await testColumn('job_title');
        columnAvailability.country = await testColumn('country');
        columnAvailability.industry = await testColumn('industry');
        columnAvailability.sender_name = await testColumn('sender_name');
        columnAvailability.sender_email = await testColumn('sender_email');

        console.log('Column availability:', columnAvailability);
        
        if (!user_id) {
          toast({ title: "Error", description: "You must be logged in to import prospects.", variant: "destructive" });
          setExcelUploading(false);
          return;
        }

        const dataRows = rows.slice(headerRowIndex + 1);
        const totalRows = dataRows.length;
        setImportProgress({ processed: 0, total: totalRows, errors: 0 });
        
        let successCount = 0;
        let errorCount = 0;
        let skippedCount = 0;
        let linkedCount = 0;
        let columnMismatchCount = 0;

        // Process rows
        for (let i = 0; i < dataRows.length; i++) {
          const row = dataRows[i];
          const rowNumber = headerRowIndex + i + 2;
          
          // Skip empty rows
          if (!row || row.every(cell => !cell || cell.toString().trim() === '')) {
            console.log(`Skipping empty row ${rowNumber}`);
            continue;
          }

          const extraCells = Array.isArray(row) ? row.slice(headerLength) : [];
          const hasExtraData = extraCells.some((cell) => (cell ?? "").toString().trim() !== "");
          if (hasExtraData) {
            console.log(`Skipping row ${rowNumber}: extra columns detected`, row);
            columnMismatchCount++;
            errorCount++;
            setImportProgress(prev => ({ ...prev, processed: i + 1, errors: prev.errors + 1 }));
            continue;
          }

          const normalizedRow = Array.from({ length: headerLength }, (_, idx) => row?.[idx] ?? "");
          
          console.log(`Processing row ${rowNumber}:`, normalizedRow);
          
          const email = normalizedRow[headerIdx["email"]]?.toString().trim();
          console.log(`Email extracted: "${email}" from index ${headerIdx["email"]}`);
          
          if (!email) {
            console.log(`Skipping row ${rowNumber}: no email found`);
            skippedCount++;
            setImportProgress(prev => ({ ...prev, processed: i + 1, errors: prev.errors + 1 }));
            continue;
          }
          
          // Validate email format
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailRegex.test(email)) {
            console.log(`Skipping row ${rowNumber}: invalid email format: ${email}`);
            errorCount++;
            setImportProgress(prev => ({ ...prev, processed: i + 1, errors: prev.errors + 1 }));
            continue;
          }
          
          const name = normalizedRow[headerIdx["name"]]?.toString().trim() || email.split('@')[0] || "Unknown";

          console.log(`Processing row ${rowNumber}: ${name} <${email}>`);

          // Create/Get Prospect
          let { data: prospect } = await supabase
            .from("prospects")
            .select("id")
            .eq("email", email.toLowerCase())
            .eq("user_id", user_id)
            .maybeSingle();

          console.log('Existing prospect check result:', prospect);

          if (!prospect) {
            // Start with basic required fields
            const prospectData: any = {
              user_id,
              name,
              email: email.toLowerCase(),
            };

            // Add optional fields only if they exist in the data
            if (headerIdx["company"] !== undefined && normalizedRow[headerIdx["company"]]) {
              prospectData.company = normalizedRow[headerIdx["company"]]?.toString().trim();
            }
            if (headerIdx["job_title"] !== undefined && normalizedRow[headerIdx["job_title"]] && columnAvailability.job_title) {
              prospectData.job_title = normalizedRow[headerIdx["job_title"]]?.toString().trim();
            }
            if (headerIdx["phone"] !== undefined && normalizedRow[headerIdx["phone"]]) {
              prospectData.phone = normalizedRow[headerIdx["phone"]]?.toString().trim();
            }
            // Add optional fields only if present in the file, non-empty, and column exists in DB
            if (headerIdx["country"] !== undefined && normalizedRow[headerIdx["country"]] && columnAvailability.country) {
              prospectData.country = normalizedRow[headerIdx["country"]]?.toString().trim();
            }
            if (headerIdx["industry"] !== undefined && normalizedRow[headerIdx["industry"]] && columnAvailability.industry) {
              prospectData.industry = normalizedRow[headerIdx["industry"]]?.toString().trim();
            }
            if (headerIdx["sender_name"] !== undefined && normalizedRow[headerIdx["sender_name"]] && columnAvailability.sender_name) {
              prospectData.sender_name = normalizedRow[headerIdx["sender_name"]]?.toString().trim();
            }
            if (headerIdx["sender_email"] !== undefined && normalizedRow[headerIdx["sender_email"]] && columnAvailability.sender_email) {
              prospectData.sender_email = normalizedRow[headerIdx["sender_email"]]?.toString().trim();
            }

            console.log('Inserting prospect:', prospectData);

            const { data: newProspect, error: insertError } = await supabase
              .from("prospects")
              .insert(prospectData)
              .select("id")
              .single();
              
            if (insertError) {
              console.error('Error inserting prospect:', insertError, 'Data:', prospectData);
              errorCount++;
              setImportProgress(prev => ({ ...prev, processed: i + 1, errors: prev.errors + 1 }));
              continue; // Skip this row but continue with others
            }
            
            prospect = newProspect;
            console.log('New prospect created:', prospect);
          }

          // Link to List
          if (prospect) {
            console.log('Checking if prospect', prospect.id, 'is already linked to list', selectedList.id);
            
            // Check if already linked
            const { data: existingLink } = await supabase
              .from("email_list_prospects")
              .select("id")
              .eq("list_id", selectedList.id)
              .eq("prospect_id", prospect.id)
              .maybeSingle();

            if (existingLink) {
              console.log('Prospect already linked to list, skipping');
              successCount++; // Count as success since prospect exists and is linked
            } else {
              console.log('Linking prospect', prospect.id, 'to list', selectedList.id);
              const { error: linkError } = await supabase
                .from("email_list_prospects")
                .insert({ list_id: selectedList.id, prospect_id: prospect.id });

              if (!linkError) {
                successCount++;
                linkedCount++;
                console.log('Successfully linked prospect to list');
              } else {
                console.error('Error linking prospect to list:', linkError);
                errorCount++;
              }
            }
          }
          
          setImportProgress(prev => ({ ...prev, processed: i + 1 }));
        }

        setImportResults({ success: successCount, errors: errorCount, skipped: skippedCount });

        let kickoffResult: AutomationKickoffResult = { matchedWorkflows: 0, triggered: 0, failed: 0 };
        if (linkedCount > 0) {
          kickoffResult = await kickoffListAutomations(selectedList.id);
        }
        
        console.log('Import completed:', { successCount, errorCount, skippedCount, columnMismatchCount });
        
        if (successCount > 0) {
          const mismatchNote = columnMismatchCount > 0 ? ` ${columnMismatchCount} rows skipped due to column mismatch.` : '';
          toast({ title: "Import Complete", description: `Successfully processed ${successCount} prospects. ${errorCount > 0 ? `${errorCount} errors occurred.` : ''}${mismatchNote} Duplicates were automatically skipped.` });
          // Don't close dialog immediately so user can see results
          setTimeout(() => {
            setIsImportOpen(false);
            fetchProspects(selectedList.id);
            fetchLists();
          }, 2000);
        } else {
          toast({ title: "Import Warning", description: "No new prospects were added. All prospects may already exist in this list.", variant: "destructive" });
          // Keep dialog open so user can see the results and try again
        }

        if (kickoffResult.failed > 0) {
          toast({
            title: "Automation warning",
            description: `Imported prospects, but ${kickoffResult.failed} workflow run(s) failed. Check Automations logs.`,
            variant: "destructive",
          });
        }
      } catch (err: any) {
        console.error(err);
        toast({ title: "Import Failed", description: "Could not parse the file.", variant: "destructive" });
      } finally {
        setExcelUploading(false);
        setImportProgress({ processed: 0, total: 0, errors: 0 });
        setImportFileKey((prev) => prev + 1);
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleImportOpenChange = (open: boolean) => {
    setIsImportOpen(open);
    if (!open) {
      setImportResults(null);
      setImportProgress({ processed: 0, total: 0, errors: 0 });
      setImportFileKey((prev) => prev + 1);
    }
  };

  // --- RENDER HELPERS ---
  const getPaginationItems = (page: number, total: number) => {
    if (total <= 7) {
      return Array.from({ length: total }, (_, i) => i + 1);
    }

    const pages = new Set<number>([1, total, page, page - 1, page + 1]);
    const sorted = Array.from(pages)
      .filter((p) => p >= 1 && p <= total)
      .sort((a, b) => a - b);

    const items: Array<number | "ellipsis"> = [];
    let previous = 0;

    sorted.forEach((p) => {
      if (p - previous > 1) {
        if (previous !== 0) items.push("ellipsis");
      }
      items.push(p);
      previous = p;
    });

    return items;
  };

  const normalizedListQuery = searchQuery.trim().toLowerCase();
  const sortedLists = [...lists].sort((a, b) => {
    if (listSort === "name") {
      return (a.name || "").localeCompare(b.name || "");
    }
    if (listSort === "size") {
      return (b.count || 0) - (a.count || 0);
    }
    if (listSort === "size-asc") {
      return (a.count || 0) - (b.count || 0);
    }

    const aDate = new Date(a.created_at || 0).getTime();
    const bDate = new Date(b.created_at || 0).getTime();
    return bDate - aDate;
  });
  const filteredLists = sortedLists.filter((list) => {
    const matchesStatus =
      listStatusFilter === "all"
        ? true
        : listStatusFilter === "ready"
          ? (list.count || 0) > 0
          : (list.count || 0) === 0;
    if (!normalizedListQuery) return matchesStatus;
    const name = list.name?.toLowerCase() || "";
    const description = list.description?.toLowerCase() || "";
    return matchesStatus && (name.includes(normalizedListQuery) || description.includes(normalizedListQuery));
  });

  const filteredProspects = prospects;
  const visibleProspectCount = filteredProspects.length;
  const visibleCompanyCount = filteredProspects.filter((prospect) => Boolean(prospect.company)).length;
  const visibleJobTitleCount = filteredProspects.filter((prospect) => Boolean(prospect.job_title)).length;
  const visiblePhoneCount = filteredProspects.filter((prospect) => Boolean(prospect.phone)).length;
  const visibleLocationCount = filteredProspects.filter((prospect) => Boolean(prospect.country)).length;
  const visibleIndustryCount = filteredProspects.filter((prospect) => Boolean(prospect.industry)).length;
  const visibleSenderCount = filteredProspects.filter(
    (prospect) => Boolean(prospect.sender_name || prospect.sender_email)
  ).length;
  const visibleContextCount = filteredProspects.filter((prospect) =>
    Boolean(prospect.company || prospect.job_title || prospect.country || prospect.industry)
  ).length;
  const visibleContextCoverage = visibleProspectCount
    ? Math.round((visibleContextCount / visibleProspectCount) * 100)
    : 0;
  const visibleSenderCoverage = visibleProspectCount
    ? Math.round((visibleSenderCount / visibleProspectCount) * 100)
    : 0;

  const listTotalProspects = lists.reduce((sum, list) => sum + (list.count || 0), 0);
  const averageListSize = lists.length ? Math.round(listTotalProspects / lists.length) : 0;
  const largestList = lists.reduce<EmailList | null>((largest, list) => {
    if (!largest) return list;
    return (list.count || 0) > (largest.count || 0) ? list : largest;
  }, null);
  const newestList = sortedLists[0] || null;
  const populatedListsCount = lists.filter((list) => (list.count || 0) > 0).length;
  const emptyListsCount = Math.max(0, lists.length - populatedListsCount);
  const listSummaryCards = [
    {
      label: "Total lists",
      value: lists.length.toLocaleString(),
      helper: `${filteredLists.length.toLocaleString()} visible`,
      icon: ListChecks,
      tone: "bg-emerald-100/80 text-emerald-700",
    },
    {
      label: "Total prospects",
      value: listTotalProspects.toLocaleString(),
      helper: "Across all lists",
      icon: Users,
      tone: "bg-sky-100/80 text-sky-700",
    },
    {
      label: "Average list size",
      value: averageListSize.toLocaleString(),
      helper: "Prospects per list",
      icon: BarChart3,
      tone: "bg-amber-100/80 text-amber-700",
    },
    {
      label: "Largest list",
      value: largestList ? (largestList.count || 0).toLocaleString() : "N/A",
      helper: largestList?.name || "No lists yet",
      icon: TrendingUp,
      tone: "bg-teal-100/80 text-teal-700",
    },
  ];
  const webhookSummaryCards = [
    {
      label: "Webhook leads",
      value: webhookLeadCount.toLocaleString(),
      helper: "Prospects that entered from webhook traffic",
      icon: Webhook,
      tone: "bg-violet-100/80 text-violet-700",
    },
    {
      label: "Webhook hits (7d)",
      value: webhookHitsLast7Days.toLocaleString(),
      helper: "Webhook receipts in the last 7 days",
      icon: Clock3,
      tone: "bg-amber-100/80 text-amber-700",
    },
    {
      label: "Recent lead activity",
      value: webhookActivities.length.toLocaleString(),
      helper: "Latest stored webhook lead events",
      icon: Activity,
      tone: "bg-sky-100/80 text-sky-700",
    },
  ];
  const totalPages = Math.max(1, Math.ceil(totalProspects / pageSize));
  const pageStart = totalProspects === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const pageEnd = Math.min(currentPage * pageSize, totalProspects);
  const paginationItems = getPaginationItems(currentPage, totalPages);
  const activeListProspectCount = selectedList ? totalProspects : 0;
  const selectedListWorkspaceShare =
    selectedList && listTotalProspects > 0 && activeListProspectCount > 0
      ? Math.round((activeListProspectCount / listTotalProspects) * 100)
      : 0;
  const listSearchIsActive = normalizedListQuery.length > 0;
  const prospectSearchIsActive = prospectSearchQuery.trim().length > 0;
  const selectedListGuidance =
    activeListProspectCount === 0
      ? {
          title: "Start with an import",
          description: "Add prospects manually or upload a file so this list becomes useful for targeting.",
          tone: "border-sky-200 bg-sky-50/80 text-sky-700",
        }
      : visibleContextCoverage < 55
        ? {
            title: "Context is still thin",
            description: `Only ${visibleContextCoverage}% of visible prospects include company, role, location, or industry.`,
            tone: "border-amber-200 bg-amber-50/80 text-amber-700",
          }
        : visibleSenderCoverage < 35
          ? {
              title: "Sender coverage needs review",
              description: `Only ${visibleSenderCoverage}% of visible prospects include sender overrides on this page.`,
              tone: "border-sky-200 bg-sky-50/80 text-sky-700",
            }
          : prospectSearchIsActive
            ? {
                title: "Search is narrowing the review set",
                description: `${visibleProspectCount.toLocaleString()} visible result${visibleProspectCount === 1 ? "" : "s"} on the current page.`,
                tone: "border-emerald-200 bg-emerald-50/80 text-emerald-700",
              }
            : {
                title: "List is easy to review",
                description: "The current page has enough context to scan quickly before using it in campaigns.",
                tone: "border-emerald-200 bg-emerald-50/80 text-emerald-700",
              };
  const selectedListInsightCards = [
    {
      label: "Total prospects",
      value: activeListProspectCount.toLocaleString(),
      helper: "Contacts currently in this list",
      icon: Users,
      cardTone: "border-emerald-200 bg-emerald-50/80",
      iconTone: "bg-emerald-100 text-emerald-700",
    },
    {
      label: "Visible results",
      value: visibleProspectCount.toLocaleString(),
      helper: prospectSearchIsActive
        ? "Matches on this page"
        : pageStart === 0
          ? "No records loaded"
          : `${pageStart}-${pageEnd} currently in view`,
      icon: Search,
      cardTone: "border-sky-200 bg-sky-50/80",
      iconTone: "bg-sky-100 text-sky-700",
    },
    {
      label: "Context coverage",
      value: `${visibleContextCoverage}%`,
      helper: "Visible prospects with company, role, location, or industry",
      icon: Target,
      cardTone: "border-amber-200 bg-amber-50/80",
      iconTone: "bg-amber-100 text-amber-700",
    },
    {
      label: "Sender coverage",
      value: `${visibleSenderCoverage}%`,
      helper: "Visible prospects with sender overrides",
      icon: ShieldCheck,
      cardTone: "border-teal-200 bg-teal-50/80",
      iconTone: "bg-teal-100 text-teal-700",
    },
  ];
  const dataCoverageRows = [
    {
      label: "Company",
      count: visibleCompanyCount,
      helper: "Useful for personalization",
      barTone: "from-sky-500 to-sky-300",
    },
    {
      label: "Job title",
      count: visibleJobTitleCount,
      helper: "Clarifies role and intent",
      barTone: "from-emerald-500 to-emerald-300",
    },
    {
      label: "Country",
      count: visibleLocationCount,
      helper: "Helpful for routing and localization",
      barTone: "from-violet-500 to-fuchsia-300",
    },
    {
      label: "Industry",
      count: visibleIndustryCount,
      helper: "Supports segmentation and messaging",
      barTone: "from-amber-500 to-yellow-300",
    },
    {
      label: "Sender overrides",
      count: visibleSenderCount,
      helper: "Adds sender-level control",
      barTone: "from-teal-500 to-cyan-300",
    },
    {
      label: "Phone",
      count: visiblePhoneCount,
      helper: "Extra context for follow-up",
      barTone: "from-slate-500 to-slate-300",
    },
  ];
  const overviewGuideCards = [
    {
      title: "Create focused cohorts",
      description: "Smaller, clearly named lists are easier to scan and easier to target later.",
      icon: Target,
      actionLabel: "Create list",
      action: () => setIsCreateListOpen(true),
    },
    {
      title: "Import with context",
      description: "Use company, role, country, and sender columns so list review is more than a wall of emails.",
      icon: FileSpreadsheet,
      actionLabel: "Get template",
      action: handleTemplateDownload,
    },
    {
      title: "Review before launch",
      description: "Open the list, search edge cases, and confirm sender coverage before using it in a campaign.",
      icon: ShieldCheck,
      actionLabel: largestList ? "Open largest list" : "Create list",
      action: () => {
        if (largestList) {
          openList(largestList);
          return;
        }
        setIsCreateListOpen(true);
      },
    },
  ];

  const listTotalPages = Math.max(1, Math.ceil(filteredLists.length / listPageSize));
  const listPageStart = filteredLists.length === 0 ? 0 : (listPage - 1) * listPageSize + 1;
  const listPageEnd = Math.min(listPage * listPageSize, filteredLists.length);
  const listPaginationItems = getPaginationItems(listPage, listTotalPages);
  const pagedLists = filteredLists.slice((listPage - 1) * listPageSize, listPage * listPageSize);
  const listStatusOptions = [
    { value: "all", label: "All", count: lists.length },
    { value: "ready", label: "Ready", count: populatedListsCount },
    { value: "empty", label: "Needs import", count: emptyListsCount },
  ] as const;
  const latestWebhookLead = webhookProspects[0] || null;
  const latestWebhookActivity = webhookActivities[0] || null;
  const heroSummaryCards = [
    listSummaryCards[1],
    listSummaryCards[0],
    webhookSummaryCards[0],
    webhookSummaryCards[1],
  ].filter(Boolean);
  const featuredListCards = [
    largestList
      ? {
          label: "Largest list",
          title: largestList.name,
          helper: `${(largestList.count || 0).toLocaleString()} prospects ready for review`,
          actionLabel: "Open largest list",
          action: () => openList(largestList),
          tone: "border-emerald-200 bg-emerald-50/80",
          iconTone: "bg-emerald-100 text-emerald-700",
          icon: TrendingUp,
        }
      : null,
    newestList
      ? {
          label: "Newest list",
          title: newestList.name,
          helper: `Created ${new Date(newestList.created_at).toLocaleDateString()}`,
          actionLabel: "Open newest list",
          action: () => openList(newestList),
          tone: "border-sky-200 bg-sky-50/80",
          iconTone: "bg-sky-100 text-sky-700",
          icon: Sparkles,
        }
      : null,
  ].filter(
    (
      item
    ): item is {
      label: string;
      title: string;
      helper: string;
      actionLabel: string;
      action: () => void;
      tone: string;
      iconTone: string;
      icon: React.ComponentType<{ className?: string }>;
    } => Boolean(item)
  );
  const workspacePrinciples = [
    {
      title: "Recognition over recall",
      description: "Important counts, quick actions, and webhook health stay visible before you open a single list.",
      icon: Sparkles,
      tone: "text-emerald-700",
    },
    {
      title: "Progressive disclosure",
      description: "The overview stays simple. Detail only appears after you open a specific audience.",
      icon: ListChecks,
      tone: "text-sky-700",
    },
    {
      title: "Proximity and feedback",
      description: "Webhook leads and their latest activity sit together so teams can trust what just landed.",
      icon: Activity,
      tone: "text-violet-700",
    },
  ];
  const webhookLeadPreview = webhookProspects.slice(0, 4);
  const webhookActivityPreview = webhookActivities.slice(0, 5);

  useEffect(() => {
    const total = Math.max(1, Math.ceil(filteredLists.length / listPageSize));
    if (listPage > total) {
      setListPage(total);
    }
  }, [filteredLists.length, listPage, listPageSize]);

  useEffect(() => {
    setListPage(1);
  }, [searchQuery, listSort, listPageSize, listStatusFilter]);

  const renderWorkspaceOverview = () => {
    const hasActiveListFilter = listStatusFilter !== "all";
    const emptyStateTitle = listSearchIsActive
      ? "No lists match this search"
      : listStatusFilter === "ready"
        ? "No ready lists yet"
        : listStatusFilter === "empty"
          ? "No lists need import"
          : "Start your first list";
    const emptyStateDescription = listSearchIsActive || hasActiveListFilter
      ? "Try a broader search or reset filters to bring lists back into view."
      : "Create a list, import prospects, and keep the workspace ready for review.";

    return (
      <ProspectShell>
        <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="list-rise relative overflow-hidden rounded-[34px] border border-[var(--shell-border)] bg-[var(--shell-surface-strong)] p-6 shadow-[0_22px_46px_rgba(15,23,42,0.12)] md:p-7">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_8%_14%,rgba(16,185,129,0.18),transparent_34%),radial-gradient(circle_at_84%_18%,rgba(56,189,248,0.16),transparent_28%),linear-gradient(160deg,rgba(255,255,255,0.99),rgba(248,250,252,0.97))]" />
            <div className="relative space-y-6">
              <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--shell-muted)]">
                <span className="flex items-center gap-2 rounded-full border border-slate-200 bg-white/90 px-3 py-1">
                  <Sparkles className="h-3.5 w-3.5 text-emerald-600" />
                  Prospect workspace
                </span>
                <Badge
                  variant="outline"
                  className="h-6 rounded-full border-[var(--shell-border)] bg-white/90 px-3 text-[10px] font-semibold text-[var(--shell-ink)]"
                >
                  {filteredLists.length.toLocaleString()} visible
                </Badge>
                <span className="rounded-full border border-slate-200 bg-white/90 px-3 py-1 text-[10px] text-slate-600">
                  {populatedListsCount} ready, {emptyListsCount} need import
                </span>
              </div>

              <div className="flex flex-col gap-6 2xl:flex-row 2xl:items-start 2xl:justify-between">
                <div className="max-w-3xl space-y-4">
                  <div className="space-y-3">
                    <h2
                      className="text-4xl font-semibold tracking-tight text-[var(--shell-ink)] md:text-[3.15rem]"
                      style={{ fontFamily: "var(--shell-font-display)" }}
                    >
                      Prospect lists, cleaned up for fast review
                    </h2>
                    <p className="max-w-2xl text-sm leading-6 text-[var(--shell-muted)] md:text-base">
                      Search faster, keep the next action obvious, and open the right audience without scanning a heavy page.
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <Button
                      onClick={() => setIsCreateListOpen(true)}
                      className="h-11 rounded-full bg-emerald-600 px-6 text-sm font-semibold shadow-[0_14px_28px_rgba(5,150,105,0.22)] hover:bg-emerald-700"
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Create list
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleTemplateDownload}
                      className="h-11 rounded-full border-[var(--shell-border)] bg-white/90 px-6 text-sm font-semibold text-[var(--shell-ink)]"
                    >
                      <Download className="mr-2 h-4 w-4" />
                      Download template
                    </Button>
                  </div>

                  <div className="flex flex-wrap gap-2 text-xs text-slate-600">
                    <span className="rounded-full border border-slate-200 bg-white px-3 py-1">
                      Average size <span className="font-semibold text-slate-900">{averageListSize.toLocaleString()}</span>
                    </span>
                    {largestList && (
                      <button
                        type="button"
                        onClick={() => openList(largestList)}
                        className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 font-medium text-emerald-700 transition-colors hover:bg-emerald-100"
                      >
                        Largest: {largestList.name}
                      </button>
                    )}
                    {newestList && (
                      <button
                        type="button"
                        onClick={() => openList(newestList)}
                        className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 font-medium text-sky-700 transition-colors hover:bg-sky-100"
                      >
                        Newest: {newestList.name}
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 2xl:w-[420px]">
                  {heroSummaryCards.map((card) => {
                    const Icon = card.icon;
                    return (
                      <div
                        key={card.label}
                        className="rounded-[24px] border border-white/70 bg-white/92 p-4 shadow-[0_12px_24px_rgba(15,23,42,0.08)]"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--shell-muted)]">
                            {card.label}
                          </p>
                          <div className={`rounded-xl p-2 ${card.tone}`}>
                            <Icon className="h-4 w-4" />
                          </div>
                        </div>
                        <p className="mt-3 text-[1.9rem] font-semibold leading-none text-[var(--shell-ink)]">{card.value}</p>
                        <p className="mt-2 text-xs leading-5 text-[var(--shell-muted)]">{card.helper}</p>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-[28px] border border-white/70 bg-white/92 p-4 shadow-[0_14px_28px_rgba(15,23,42,0.08)] md:p-5">
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start">
                  <div className="space-y-4">
                    <div className="relative">
                      <Search className="absolute left-3 top-3.5 h-4 w-4 text-[var(--shell-muted)]" />
                      <Input
                        placeholder="Search list name or description"
                        className="h-11 rounded-full border-[var(--shell-border)] bg-white pl-10 pr-24"
                        value={searchQuery}
                        onChange={(event) => setSearchQuery(event.target.value)}
                      />
                      {listSearchIsActive && (
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => setSearchQuery("")}
                          className="absolute right-1 top-1 h-9 rounded-full px-4 text-xs font-semibold text-slate-600"
                        >
                          Clear
                        </Button>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {listStatusOptions.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => setListStatusFilter(option.value)}
                          className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                            listStatusFilter === option.value
                              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                              : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                          }`}
                        >
                          {option.label} {option.count.toLocaleString()}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 xl:justify-end">
                    <Select value={listSort} onValueChange={handleListSortChange}>
                      <SelectTrigger className="h-11 w-[190px] rounded-full bg-white">
                        <SelectValue placeholder="Sort by" />
                      </SelectTrigger>
                      <SelectContent>
                        {listSortOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <div className="inline-flex rounded-full border border-[var(--shell-border)] bg-white p-1 shadow-sm">
                      <button
                        type="button"
                        onClick={() => setListViewMode("cards")}
                        className={`inline-flex h-9 items-center gap-2 rounded-full px-4 text-xs font-semibold transition-colors ${
                          listViewMode === "cards"
                            ? "bg-emerald-600 text-white shadow-sm"
                            : "text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        <LayoutGrid className="h-4 w-4" />
                        Cards
                      </button>
                      <button
                        type="button"
                        onClick={() => setListViewMode("list")}
                        className={`inline-flex h-9 items-center gap-2 rounded-full px-4 text-xs font-semibold transition-colors ${
                          listViewMode === "list"
                            ? "bg-emerald-600 text-white shadow-sm"
                            : "text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        <LayoutList className="h-4 w-4" />
                        List
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <Card className="list-rise rounded-[30px] border-[var(--shell-border)] bg-[var(--shell-surface-strong)] shadow-[0_14px_28px_rgba(15,23,42,0.1)]">
            <CardHeader className="space-y-3">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                <Webhook className="h-3.5 w-3.5 text-violet-600" />
                Live intake
              </div>
              <div>
                <CardTitle className="text-xl font-semibold text-[var(--shell-ink)]">Recent webhook signal</CardTitle>
                <CardDescription className="mt-1 text-sm text-[var(--shell-muted)]">
                  New leads and latest activity, kept compact.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 px-4 py-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Stored leads</p>
                  <p className="mt-2 text-2xl font-semibold text-slate-900">{webhookLeadCount.toLocaleString()}</p>
                </div>
                <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 px-4 py-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Hits in 7 days</p>
                  <p className="mt-2 text-2xl font-semibold text-slate-900">{webhookHitsLast7Days.toLocaleString()}</p>
                </div>
              </div>

              <div className="rounded-[24px] border border-slate-200 bg-white/90 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Latest lead</p>
                <p className="mt-3 truncate text-sm font-semibold text-slate-900">{latestWebhookLead?.name || "No webhook lead yet"}</p>
                <p className="mt-1 truncate text-sm text-violet-700">{latestWebhookLead?.email || "Waiting for inbound traffic"}</p>
              </div>

              <div className="rounded-[24px] border border-slate-200 bg-white/90 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Latest activity</p>
                <p className="mt-3 text-sm font-semibold text-slate-900">
                  {latestWebhookActivity ? formatActivityLabel(latestWebhookActivity.eventType) : "No activity yet"}
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  {latestWebhookActivity?.message || "Activity events will show here once leads start moving."}
                </p>
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="space-y-4">
          {filteredLists.length === 0 ? (
            <div className="rounded-[28px] border-2 border-dashed border-[var(--shell-border)] bg-white/85 px-6 py-12 text-center shadow-[0_10px_22px_rgba(15,23,42,0.08)]">
              <Users className="mx-auto h-10 w-10 text-emerald-500/70" />
              <h3 className="mt-4 text-xl font-semibold text-[var(--shell-ink)]">{emptyStateTitle}</h3>
              <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-[var(--shell-muted)]">{emptyStateDescription}</p>
              <div className="mt-6 flex flex-wrap justify-center gap-3">
                {(listSearchIsActive || hasActiveListFilter) && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setSearchQuery("");
                      setListStatusFilter("all");
                    }}
                    className="h-10 rounded-full border-[var(--shell-border)] bg-white/90 px-5 text-sm font-semibold text-[var(--shell-ink)]"
                  >
                    Clear filters
                  </Button>
                )}
                <Button
                  onClick={() => setIsCreateListOpen(true)}
                  className="h-10 rounded-full bg-emerald-600 px-5 text-sm font-semibold hover:bg-emerald-700"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Create list
                </Button>
              </div>
            </div>
          ) : listViewMode === "cards" ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {pagedLists.map((list) => {
                const workspaceShare = listTotalProspects > 0 ? Math.round(((list.count || 0) / listTotalProspects) * 100) : 0;
                const isLargestList = largestList?.id === list.id;
                const isNewestList = newestList?.id === list.id;
                const needsImport = (list.count || 0) === 0;

                return (
                  <Card
                    key={list.id}
                    role="button"
                    tabIndex={0}
                    className="group relative cursor-pointer overflow-hidden rounded-[26px] border border-[var(--shell-border)] bg-white/92 shadow-[0_12px_24px_rgba(15,23,42,0.08)] transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_18px_32px_rgba(15,23,42,0.12)] focus:outline-none focus:ring-2 focus:ring-emerald-400/60"
                    onClick={() => openList(list)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        openList(list);
                      }
                    }}
                  >
                    <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-emerald-500 via-sky-400 to-amber-300 opacity-70" />
                    <CardHeader className="space-y-4 pb-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <CardTitle className="line-clamp-1 text-lg font-semibold text-[var(--shell-ink)]">
                              {list.name}
                            </CardTitle>
                            {isLargestList && (
                              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-700">
                                Largest
                              </span>
                            )}
                            {isNewestList && (
                              <span className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-sky-700">
                                New
                              </span>
                            )}
                          </div>
                          <CardDescription className="mt-2 line-clamp-2 text-sm leading-6 text-[var(--shell-muted)]">
                            {list.description || "No description added yet."}
                          </CardDescription>
                        </div>
                        <Badge
                          variant="outline"
                          className="h-7 rounded-full border-[var(--shell-border)] bg-white px-3 text-[10px] font-semibold text-[var(--shell-ink)]"
                        >
                          {(list.count || 0).toLocaleString()} prospects
                        </Badge>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-3">
                        <div className="rounded-[20px] border border-slate-200 bg-slate-50/80 px-3 py-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Created</p>
                          <p className="mt-2 text-sm font-medium text-slate-900">{new Date(list.created_at).toLocaleDateString()}</p>
                        </div>
                        <div className="rounded-[20px] border border-slate-200 bg-slate-50/80 px-3 py-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Share</p>
                          <p className="mt-2 text-sm font-medium text-slate-900">{workspaceShare}%</p>
                        </div>
                        <div className="rounded-[20px] border border-slate-200 bg-slate-50/80 px-3 py-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Status</p>
                          <p className="mt-2 text-sm font-medium text-slate-900">{needsImport ? "Needs import" : "Ready"}</p>
                        </div>
                      </div>
                    </CardHeader>
                    <CardFooter className="flex items-center justify-between border-t border-[var(--shell-border)] bg-white/80 pt-4">
                      <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600">
                        {needsImport ? "Import data" : "Ready to review"}
                      </span>
                      <span className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-700">
                        Open list
                        <ChevronRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                      </span>
                    </CardFooter>
                  </Card>
                );
              })}
            </div>
          ) : (
            <div className="space-y-3">
              {pagedLists.map((list) => {
                const workspaceShare = listTotalProspects > 0 ? Math.round(((list.count || 0) / listTotalProspects) * 100) : 0;
                const isLargestList = largestList?.id === list.id;
                const isNewestList = newestList?.id === list.id;
                const needsImport = (list.count || 0) === 0;

                return (
                  <button
                    key={list.id}
                    type="button"
                    onClick={() => openList(list)}
                    className="group w-full rounded-[24px] border border-[var(--shell-border)] bg-white/92 p-4 text-left shadow-[0_10px_22px_rgba(15,23,42,0.06)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_16px_30px_rgba(15,23,42,0.1)]"
                  >
                    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_150px_140px_150px_auto] xl:items-center">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-base font-semibold text-slate-900">{list.name}</p>
                          {isLargestList && (
                            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-700">
                              Largest
                            </span>
                          )}
                          {isNewestList && (
                            <span className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-sky-700">
                              New
                            </span>
                          )}
                        </div>
                        <p className="mt-2 line-clamp-1 text-sm text-slate-500">
                          {list.description || "No description added yet."}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-600">
                          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
                            {(list.count || 0).toLocaleString()} prospects
                          </span>
                          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
                            {workspaceShare}% of workspace
                          </span>
                        </div>
                      </div>
                      <div className="rounded-[18px] border border-slate-200 bg-slate-50/80 px-3 py-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Created</p>
                        <p className="mt-2 text-sm font-medium text-slate-900">{new Date(list.created_at).toLocaleDateString()}</p>
                      </div>
                      <div className="rounded-[18px] border border-slate-200 bg-slate-50/80 px-3 py-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Status</p>
                        <p className="mt-2 text-sm font-medium text-slate-900">{needsImport ? "Needs import" : "Ready"}</p>
                      </div>
                      <div className="rounded-[18px] border border-slate-200 bg-slate-50/80 px-3 py-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Focus</p>
                        <p className="mt-2 text-sm font-medium text-slate-900">{needsImport ? "Add prospects" : "Review audience"}</p>
                      </div>
                      <div className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-700 xl:justify-self-end">
                        Open list
                        <ChevronRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {filteredLists.length > 0 && (
            <div className="rounded-[24px] border border-[var(--shell-border)] bg-[var(--shell-surface-strong)] px-4 py-4 shadow-[0_10px_22px_rgba(15,23,42,0.08)]">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--shell-muted)]">
                  <span className="font-semibold uppercase tracking-wide text-[var(--shell-muted)]">Lists per page</span>
                  <Select value={String(listPageSize)} onValueChange={handleListPageSizeChange}>
                    <SelectTrigger className="h-9 w-[120px] rounded-full bg-white">
                      <SelectValue placeholder="Per page" />
                    </SelectTrigger>
                    <SelectContent>
                      {listPageSizeOptions.map((size) => (
                        <SelectItem key={size} value={String(size)}>
                          {size} / page
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span>
                    Showing {listPageStart}-{listPageEnd} of {filteredLists.length}
                  </span>
                </div>
                <Pagination className="w-auto justify-end">
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious
                        href="#"
                        onClick={(event) => {
                          event.preventDefault();
                          handleListPageChange(listPage - 1);
                        }}
                        className={listPage === 1 ? "pointer-events-none opacity-50" : ""}
                      />
                    </PaginationItem>
                    {listPaginationItems.map((item, index) =>
                      item === "ellipsis" ? (
                        <PaginationItem key={`list-ellipsis-${index}`}>
                          <PaginationEllipsis />
                        </PaginationItem>
                      ) : (
                        <PaginationItem key={`list-${item}`}>
                          <PaginationLink
                            href="#"
                            isActive={item === listPage}
                            onClick={(event) => {
                              event.preventDefault();
                              handleListPageChange(item);
                            }}
                          >
                            {item}
                          </PaginationLink>
                        </PaginationItem>
                      )
                    )}
                    <PaginationItem>
                      <PaginationNext
                        href="#"
                        onClick={(event) => {
                          event.preventDefault();
                          handleListPageChange(listPage + 1);
                        }}
                        className={listPage === listTotalPages ? "pointer-events-none opacity-50" : ""}
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              </div>
            </div>
          )}
        </section>

        <Dialog open={isCreateListOpen} onOpenChange={setIsCreateListOpen}>
          <DialogContent className="sm:max-w-[560px]">
            <DialogHeader>
              <DialogTitle>Create new list</DialogTitle>
              <DialogDescription>
                Use a clear name and short description so the right audience is recognizable without opening it.
              </DialogDescription>
            </DialogHeader>
            <form
              className="space-y-5 py-4"
              onSubmit={(event) => {
                event.preventDefault();
                handleCreateList();
              }}
            >
              <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 text-sm leading-6 text-slate-600">
                Good list names reduce scanning time later. Include audience, timeframe, or campaign intent when it helps.
              </div>
              <div className="space-y-2">
                <Label>List name</Label>
                <Input
                  placeholder="e.g. US SaaS founders - Q2 follow-up"
                  value={newListForm.name}
                  onChange={(event) => setNewListForm((prev) => ({ ...prev, name: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea
                  rows={4}
                  placeholder="Who belongs here, where they came from, and how this list will be used."
                  value={newListForm.description}
                  onChange={(event) => setNewListForm((prev) => ({ ...prev, description: event.target.value }))}
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsCreateListOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit">Create list</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </ProspectShell>
    );
  };

  if (selectedList) {
    // --- DETAIL VIEW ---
    return (
      <ProspectShell>
        <section className="list-rise relative overflow-hidden rounded-[32px] border border-[var(--shell-border)] bg-[var(--shell-surface-strong)] p-6 shadow-[0_22px_46px_rgba(15,23,42,0.12)]">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_8%_18%,rgba(16,185,129,0.18),transparent_32%),radial-gradient(circle_at_82%_16%,rgba(59,130,246,0.14),transparent_28%),linear-gradient(165deg,rgba(255,255,255,0.98),rgba(248,250,252,0.97))]" />
          <div className="relative space-y-6">
            <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
              <div className="min-w-0 flex-1 space-y-4">
                <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--shell-muted)]">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedList(null)}
                    className="h-9 rounded-full border border-[var(--shell-border)] bg-white/90 px-4 text-xs font-semibold text-[var(--shell-ink)]"
                  >
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    All lists
                  </Button>
                  <span className="rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-[10px] text-slate-600">
                    List detail
                  </span>
                  <Badge
                    variant="outline"
                    className="h-6 rounded-full border-[var(--shell-border)] bg-white/80 px-3 text-[10px] font-semibold text-[var(--shell-ink)]"
                  >
                    {activeListProspectCount.toLocaleString()} prospects
                  </Badge>
                  {selectedListWorkspaceShare > 0 && (
                    <Badge
                      variant="outline"
                      className="h-6 rounded-full border-emerald-200 bg-emerald-50 px-3 text-[10px] font-semibold text-emerald-700"
                    >
                      {selectedListWorkspaceShare}% of workspace
                    </Badge>
                  )}
                  <span className="rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-[10px] text-slate-600">
                    Created {new Date(selectedList.created_at).toLocaleDateString()}
                  </span>
                </div>

                <div className="space-y-3">
                  <h2
                    className="text-3xl font-semibold tracking-tight text-[var(--shell-ink)] md:text-4xl"
                    style={{ fontFamily: "var(--shell-font-display)" }}
                  >
                    {selectedList.name}
                  </h2>
                  <p className="max-w-3xl text-sm leading-6 text-[var(--shell-muted)]">
                    {selectedList.description || "Use a short description so anyone opening this list immediately understands who belongs here."}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    onClick={() => setIsAddProspectOpen(true)}
                    className="h-10 rounded-full bg-emerald-600 px-5 text-xs font-semibold shadow-[0_10px_20px_rgba(5,150,105,0.22)] hover:bg-emerald-700"
                  >
                    <UserPlus className="mr-2 h-4 w-4" />
                    Add manually
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => handleImportOpenChange(true)}
                    className="h-10 rounded-full border-[var(--shell-border)] bg-white/90 px-5 text-xs font-semibold text-[var(--shell-ink)]"
                  >
                    <FileSpreadsheet className="mr-2 h-4 w-4" />
                    Import file
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleTemplateDownload}
                    className="h-10 rounded-full border-[var(--shell-border)] bg-white/90 px-5 text-xs font-semibold text-[var(--shell-ink)]"
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Template
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => handleDeleteList(selectedList.id)}
                    className="h-10 rounded-full border-rose-200 bg-rose-50/80 px-5 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete list
                  </Button>
                </div>
              </div>

              <div className="w-full max-w-[360px] rounded-[28px] border border-white/70 bg-white/90 p-5 shadow-[0_16px_30px_rgba(15,23,42,0.08)]">
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                  Campaign-ready focus
                </div>
                <h3 className="mt-3 text-xl font-semibold text-slate-900">{selectedListGuidance.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">{selectedListGuidance.description}</p>
                <div className="mt-4 grid gap-3">
                  <div className={`rounded-2xl border px-4 py-3 ${selectedListGuidance.tone}`}>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em]">Current-page data</p>
                    <p className="mt-2 text-base font-semibold">
                      {visibleContextCoverage}% context coverage, {visibleSenderCoverage}% sender coverage
                    </p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-600">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Search scope</p>
                    <p className="mt-2 leading-6">
                      Search checks name, email, company, job title, country, and industry so you can resolve edge cases fast.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {selectedListInsightCards.map((card) => {
                const Icon = card.icon;
                return (
                  <div key={card.label} className={`rounded-2xl border px-4 py-4 ${card.cardTone}`}>
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-600">
                        {card.label}
                      </p>
                      <div className={`rounded-xl p-2 ${card.iconTone}`}>
                        <Icon className="h-4 w-4" />
                      </div>
                    </div>
                    <p className="mt-3 text-[1.9rem] font-semibold leading-none text-slate-900">{card.value}</p>
                    <p className="mt-2 text-xs leading-5 text-slate-600">{card.helper}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Search & Table */}
        <Card className="overflow-hidden rounded-[28px] border-[var(--shell-border)] bg-[var(--shell-surface-strong)] shadow-[0_16px_32px_rgba(15,23,42,0.1)]">
          <CardHeader className="space-y-4 border-b border-[var(--shell-border)] pb-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <CardTitle className="text-xl font-semibold text-[var(--shell-ink)]">Prospect roster</CardTitle>
                <CardDescription className="mt-1 text-sm text-[var(--shell-muted)]">
                  {prospectSearchIsActive
                    ? "Search narrows the current list without hiding the rest of your workspace."
                    : "Newest prospects appear first so recent imports are easier to review."}
                </CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--shell-muted)]">
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1">
                  {pageStart === 0 ? "No visible records" : `Showing ${pageStart}-${pageEnd} of ${activeListProspectCount}`}
                </span>
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1">Sorted by newest import</span>
              </div>
            </div>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="relative w-full lg:max-w-md">
                <Search className="absolute left-3 top-3 h-4 w-4 text-[var(--shell-muted)]" />
                <Input
                  placeholder="Search by name, email, company, role, country, or industry"
                  className="h-11 rounded-full border-[var(--shell-border)] bg-white/95 pl-10 pr-24"
                  value={prospectSearchQuery}
                  onChange={(event) => {
                    const nextValue = event.target.value;
                    setProspectSearchQuery(nextValue);
                    if (currentPage !== 1) setCurrentPage(1);
                  }}
                />
                {prospectSearchIsActive && (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setProspectSearchQuery("");
                      if (currentPage !== 1) setCurrentPage(1);
                    }}
                    className="absolute right-1 top-1 h-9 rounded-full px-4 text-xs font-semibold text-slate-600"
                  >
                    Clear
                  </Button>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--shell-muted)]">
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">Name + email required</span>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">Context fields improve review</span>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="relative">
              {loading && filteredProspects.length > 0 && (
                <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-white/55 backdrop-blur-[1.5px]">
                  <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 shadow-sm">
                    <Loader2 className="h-4 w-4 animate-spin text-emerald-600" />
                    Refreshing prospects
                  </div>
                </div>
              )}

              {loading && filteredProspects.length === 0 ? (
                <div className="grid gap-3 p-4">
                  {Array.from({ length: 4 }).map((_, index) => (
                    <div key={`prospect-skeleton-${index}`} className="animate-pulse rounded-2xl border border-slate-200 bg-white/80 p-4">
                      <div className="h-4 w-32 rounded bg-slate-200" />
                      <div className="mt-3 h-3 w-48 rounded bg-slate-100" />
                      <div className="mt-5 grid gap-3 sm:grid-cols-2">
                        <div className="h-16 rounded-2xl bg-slate-100" />
                        <div className="h-16 rounded-2xl bg-slate-100" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : filteredProspects.length === 0 ? (
                <div className="flex flex-col items-center gap-4 px-6 py-16 text-center">
                  {prospectSearchIsActive ? (
                    <Search className="h-10 w-10 text-slate-300" />
                  ) : (
                    <Users className="h-10 w-10 text-emerald-300" />
                  )}
                  <div className="space-y-2">
                    <h3 className="text-xl font-semibold text-slate-900">
                      {prospectSearchIsActive ? "No prospects match this search" : "This list is still empty"}
                    </h3>
                    <p className="max-w-md text-sm leading-6 text-slate-600">
                      {prospectSearchIsActive
                        ? "Try a broader keyword or clear the search to review the full list."
                        : "Import a CSV or add a single contact manually to start building this audience."}
                    </p>
                  </div>
                  <div className="flex flex-wrap justify-center gap-2">
                    {prospectSearchIsActive && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setProspectSearchQuery("");
                          if (currentPage !== 1) setCurrentPage(1);
                        }}
                        className="h-10 rounded-full border-[var(--shell-border)] bg-white px-5 text-xs font-semibold text-[var(--shell-ink)]"
                      >
                        Clear search
                      </Button>
                    )}
                    <Button
                      type="button"
                      onClick={() => setIsAddProspectOpen(true)}
                      className="h-10 rounded-full bg-emerald-600 px-5 text-xs font-semibold hover:bg-emerald-700"
                    >
                      <UserPlus className="mr-2 h-4 w-4" />
                      Add manually
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => handleImportOpenChange(true)}
                      className="h-10 rounded-full border-[var(--shell-border)] bg-white px-5 text-xs font-semibold text-[var(--shell-ink)]"
                    >
                      <FileSpreadsheet className="mr-2 h-4 w-4" />
                      Import file
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="rounded-md border-t border-[var(--shell-border)]">
                  <div className="grid gap-3 p-4 lg:hidden">
                    {filteredProspects.map((prospect) => (
                      <div key={prospect.id} className="rounded-[22px] border border-slate-200 bg-white/90 p-4 shadow-[0_10px_20px_rgba(15,23,42,0.06)]">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-base font-semibold text-slate-900">{prospect.name}</p>
                            <p className="truncate text-sm font-medium text-emerald-700">{prospect.email}</p>
                          </div>
                          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                            {prospect.country || "No region"}
                          </span>
                        </div>

                        <div className="mt-4 flex flex-wrap gap-2">
                          {prospect.company && (
                            <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-medium text-sky-700">
                              {prospect.company}
                            </span>
                          )}
                          {prospect.job_title && (
                            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                              {prospect.job_title}
                            </span>
                          )}
                          {prospect.industry && (
                            <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
                              {prospect.industry}
                            </span>
                          )}
                          {!prospect.company && !prospect.job_title && !prospect.industry && (
                            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-500">
                              Minimal profile
                            </span>
                          )}
                        </div>

                        <div className="mt-4 grid gap-3 sm:grid-cols-2">
                          <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-3 py-3">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Contact</p>
                            <p className="mt-2 text-sm font-medium text-slate-900">{prospect.phone || "No phone added"}</p>
                          </div>
                          <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-3 py-3">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Sender</p>
                            <p className="mt-2 text-sm font-medium text-slate-900">
                              {prospect.sender_email || prospect.sender_name || "Default sender"}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="relative hidden max-h-[60vh] w-full overflow-auto lg:block">
                    <table className="w-full min-w-[1440px] caption-bottom text-sm text-left">
                  <thead className="bg-white/95">
                    <tr className="border-b border-slate-200/70">
                      <th className="sticky top-0 z-30 h-11 min-w-[160px] bg-white/95 px-4 align-middle text-xs font-semibold uppercase tracking-wide text-slate-500 backdrop-blur-sm">Name</th>
                      <th className="sticky top-0 z-30 h-11 min-w-[240px] bg-white/95 px-4 align-middle text-xs font-semibold uppercase tracking-wide text-slate-500 backdrop-blur-sm">Email</th>
                      <th className="sticky top-0 z-30 h-11 min-w-[160px] bg-white/95 px-4 align-middle text-xs font-semibold uppercase tracking-wide text-slate-500 backdrop-blur-sm">Company</th>
                      <th className="sticky top-0 z-30 h-11 min-w-[180px] bg-white/95 px-4 align-middle text-xs font-semibold uppercase tracking-wide text-slate-500 backdrop-blur-sm">Job Title</th>
                      <th className="sticky top-0 z-30 h-11 min-w-[140px] bg-white/95 px-4 align-middle text-xs font-semibold uppercase tracking-wide text-slate-500 backdrop-blur-sm">Phone</th>
                      <th className="sticky top-0 z-30 h-11 min-w-[120px] bg-white/95 px-4 align-middle text-xs font-semibold uppercase tracking-wide text-slate-500 backdrop-blur-sm">Country</th>
                      <th className="sticky top-0 z-30 h-11 min-w-[140px] bg-white/95 px-4 align-middle text-xs font-semibold uppercase tracking-wide text-slate-500 backdrop-blur-sm">Industry</th>
                      <th className="sticky top-0 right-[220px] z-40 h-11 w-[180px] min-w-[180px] border-l border-slate-200/70 bg-white/95 px-4 align-middle text-xs font-semibold uppercase tracking-wide text-slate-500 shadow-[-4px_0_8px_rgba(15,23,42,0.06)] backdrop-blur-sm">Sender Name</th>
                      <th className="sticky top-0 right-0 z-40 h-11 w-[220px] min-w-[220px] border-l border-slate-200/70 bg-white/95 px-4 align-middle text-xs font-semibold uppercase tracking-wide text-slate-500 shadow-[-8px_0_12px_rgba(15,23,42,0.08)] backdrop-blur-sm">Sender Email</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredProspects.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="h-24 text-center text-muted-foreground">
                          No prospects found.
                        </td>
                      </tr>
                    ) : (
                      filteredProspects.map((p) => (
                        <tr key={p.id} className="group transition-colors hover:bg-slate-50/80">
                          <td className="px-4 py-3 align-middle font-medium text-slate-800">{p.name}</td>
                          <td className="px-4 py-3 align-middle text-emerald-700 whitespace-nowrap truncate max-w-[240px]" title={p.email}>
                            {p.email}
                          </td>
                          <td className="px-4 py-3 align-middle text-slate-600">{p.company || '-'}</td>
                          <td className="px-4 py-3 align-middle text-slate-600">{p.job_title || '-'}</td>
                          <td className="px-4 py-3 align-middle text-slate-600 whitespace-nowrap">{p.phone || '-'}</td>
                          <td className="px-4 py-3 align-middle text-slate-600">{p.country || '-'}</td>
                          <td className="px-4 py-3 align-middle text-slate-600">{p.industry || '-'}</td>
                          <td
                            className="sticky right-[220px] z-20 w-[180px] min-w-[180px] border-l border-slate-200/70 bg-white px-4 py-3 align-middle text-slate-600 shadow-[-4px_0_8px_rgba(15,23,42,0.06)] group-hover:bg-slate-50/80"
                            title={p.sender_name || '-'}
                          >
                            <span className="block truncate">{p.sender_name || '-'}</span>
                          </td>
                          <td
                            className="sticky right-0 z-20 w-[220px] min-w-[220px] border-l border-slate-200/70 bg-white px-4 py-3 align-middle text-slate-600 shadow-[-8px_0_12px_rgba(15,23,42,0.08)] group-hover:bg-slate-50/80"
                            title={p.sender_email || '-'}
                          >
                            <span className="block truncate">{p.sender_email || '-'}</span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-3 border-t border-[var(--shell-border)] bg-white/90 px-5 py-4 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--shell-muted)]">
              <span className="font-semibold uppercase tracking-[0.16em] text-slate-500">Items per page</span>
              <Select value={String(pageSize)} onValueChange={handlePageSizeChange}>
                <SelectTrigger className="h-8 w-[120px] bg-white">
                  <SelectValue placeholder="Per page" />
                </SelectTrigger>
                <SelectContent>
                  {pageSizeOptions.map((size) => (
                    <SelectItem key={size} value={String(size)}>
                      {size} / page
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-slate-500">
                {pageStart === 0 ? "Nothing visible yet" : `Showing ${pageStart}-${pageEnd} of ${activeListProspectCount}`}
              </span>
            </div>
            <Pagination className="w-auto justify-end">
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    href="#"
                    onClick={(event) => {
                      event.preventDefault();
                      handlePageChange(currentPage - 1);
                    }}
                    className={currentPage === 1 ? "pointer-events-none opacity-50" : ""}
                  />
                </PaginationItem>
                {paginationItems.map((item, index) =>
                  item === "ellipsis" ? (
                    <PaginationItem key={`detail-ellipsis-${index}`}>
                      <PaginationEllipsis />
                    </PaginationItem>
                  ) : (
                    <PaginationItem key={`detail-page-${item}`}>
                      <PaginationLink
                        href="#"
                        isActive={item === currentPage}
                        onClick={(event) => {
                          event.preventDefault();
                          handlePageChange(item);
                        }}
                      >
                        {item}
                      </PaginationLink>
                    </PaginationItem>
                  )
                )}
                <PaginationItem>
                  <PaginationNext
                    href="#"
                    onClick={(event) => {
                      event.preventDefault();
                      handlePageChange(currentPage + 1);
                    }}
                    className={currentPage === totalPages ? "pointer-events-none opacity-50" : ""}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          </CardFooter>
        </Card>

        <section className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-[24px] border border-[var(--shell-border)] bg-[var(--shell-surface-strong)] p-5 shadow-[0_12px_24px_rgba(15,23,42,0.08)]">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              <Target className="h-3.5 w-3.5 text-amber-600" />
              Current-page coverage
            </div>
            <h3 className="mt-2 text-lg font-semibold text-[var(--shell-ink)]">Spot missing context fast</h3>
            <p className="mt-2 text-sm leading-6 text-[var(--shell-muted)]">
              These counts reflect prospects currently loaded on this page, so you can see what still needs enrichment.
            </p>
            <div className="mt-5 space-y-4">
              {dataCoverageRows.map((row) => {
                const width = visibleProspectCount ? `${(row.count / visibleProspectCount) * 100}%` : "0%";
                return (
                  <div key={row.label}>
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <div>
                        <p className="font-semibold text-slate-900">{row.label}</p>
                        <p className="mt-0.5 text-slate-500">{row.helper}</p>
                      </div>
                      <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 font-medium text-slate-600">
                        {row.count}/{visibleProspectCount}
                      </span>
                    </div>
                    <div className="mt-2 h-2 rounded-full bg-slate-100">
                      <div className={`h-2 rounded-full bg-gradient-to-r ${row.barTone}`} style={{ width }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-[24px] border border-[var(--shell-border)] bg-[var(--shell-surface-strong)] p-5 shadow-[0_12px_24px_rgba(15,23,42,0.08)]">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              <Sparkles className="h-3.5 w-3.5 text-emerald-600" />
              Recommended flow
            </div>
            <h3 className="mt-2 text-lg font-semibold text-[var(--shell-ink)]">Keep the next action obvious</h3>
            <div className="mt-4 space-y-4">
              <div className="flex gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-sm font-semibold text-emerald-700">
                  1
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900">Add missing records</p>
                  <p className="text-xs leading-5 text-slate-500">Use manual add for one-off fixes and imports for batch updates.</p>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sm font-semibold text-sky-700">
                  2
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900">Search the exceptions</p>
                  <p className="text-xs leading-5 text-slate-500">Check missing companies, regions, or sender overrides before you send anything.</p>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100 text-sm font-semibold text-amber-700">
                  3
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900">Launch only from clean lists</p>
                  <p className="text-xs leading-5 text-slate-500">Focused, enriched lists are faster to personalize and safer to reuse in campaigns.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Add Prospect Dialog */}
        <Dialog open={isAddProspectOpen} onOpenChange={setIsAddProspectOpen}>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[720px]">
            <DialogHeader>
              <DialogTitle>Add prospect</DialogTitle>
              <DialogDescription>
                Name and email are required. Everything else improves search, segmentation, and personalization.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-5 py-4">
              <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 text-sm leading-6 text-slate-600">
                Add the minimum first, then enrich with company, role, geography, and sender details when they are available.
              </div>
              <div className="grid gap-5 lg:grid-cols-2">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Full name *</Label>
                    <Input
                      placeholder="Jane Doe"
                      value={newProspectForm.name}
                      onChange={(event) => setNewProspectForm({ ...newProspectForm, name: event.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Email address *</Label>
                    <Input
                      type="email"
                      placeholder="jane@company.com"
                      value={newProspectForm.email}
                      onChange={(event) => setNewProspectForm({ ...newProspectForm, email: event.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Company</Label>
                    <Input
                      placeholder="Acme Inc."
                      value={newProspectForm.company}
                      onChange={(event) => setNewProspectForm({ ...newProspectForm, company: event.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Job title</Label>
                    <Input
                      placeholder="Head of Growth"
                      value={newProspectForm.job_title}
                      onChange={(event) => setNewProspectForm({ ...newProspectForm, job_title: event.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Phone</Label>
                    <Input
                      placeholder="+1 555 000 0000"
                      value={newProspectForm.phone}
                      onChange={(event) => setNewProspectForm({ ...newProspectForm, phone: event.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Country</Label>
                    <Input
                      placeholder="United States"
                      value={newProspectForm.country}
                      onChange={(event) => setNewProspectForm({ ...newProspectForm, country: event.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Industry</Label>
                    <Input
                      placeholder="SaaS"
                      value={newProspectForm.industry}
                      onChange={(event) => setNewProspectForm({ ...newProspectForm, industry: event.target.value })}
                    />
                  </div>
                </div>
              </div>
              <Separator />
              <div className="space-y-3">
                <Label className="text-xs uppercase tracking-[0.18em] text-slate-500">Sender override</Label>
                <div className="grid gap-4 lg:grid-cols-2">
                  <Input
                    placeholder="Sender name"
                    value={newProspectForm.sender_name}
                    onChange={(event) => setNewProspectForm({ ...newProspectForm, sender_name: event.target.value })}
                  />
                  <Input
                    type="email"
                    placeholder="sender@yourdomain.com"
                    value={newProspectForm.sender_email}
                    onChange={(event) => setNewProspectForm({ ...newProspectForm, sender_email: event.target.value })}
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsAddProspectOpen(false)}>
                Cancel
              </Button>
              <Button type="button" onClick={handleAddProspect}>
                Add prospect
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Import Dialog */}
        <Dialog open={isImportOpen} onOpenChange={handleImportOpenChange}>
          <DialogContent className="sm:max-w-[680px]">
            <DialogHeader>
              <DialogTitle>Import prospects</DialogTitle>
              <DialogDescription>
                Upload a CSV or Excel file to add prospects in bulk. Duplicates are skipped automatically.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              {excelUploading && importProgress.total > 0 && (
                <div className="rounded-2xl border border-sky-200 bg-sky-50/80 p-4">
                  <div className="mb-3 flex items-center justify-between text-sm font-medium text-sky-900">
                    <span>Processing prospects</span>
                    <span>
                      {importProgress.processed}/{importProgress.total}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-white/80">
                    <div
                      className="h-2 rounded-full bg-sky-600 transition-all duration-300"
                      style={{ width: `${(importProgress.processed / importProgress.total) * 100}%` }}
                    ></div>
                  </div>
                  {importProgress.errors > 0 && (
                    <p className="mt-3 text-xs text-rose-600">{importProgress.errors} row(s) hit validation or import errors.</p>
                  )}
                </div>
              )}
              
              {importResults && (
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4">
                    <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700">
                      <CheckCircle2 className="h-4 w-4" />
                      Added
                    </div>
                    <p className="mt-3 text-2xl font-semibold text-emerald-900">{importResults.success}</p>
                  </div>
                  <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-4">
                    <div className="flex items-center gap-2 text-sm font-semibold text-amber-700">
                      <AlertTriangle className="h-4 w-4" />
                      Errors
                    </div>
                    <p className="mt-3 text-2xl font-semibold text-amber-900">{importResults.errors}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                      <Clock3 className="h-4 w-4" />
                      Skipped
                    </div>
                    <p className="mt-3 text-2xl font-semibold text-slate-900">{importResults.skipped}</p>
                  </div>
                </div>
              )}
              
              <div className="relative overflow-hidden rounded-[24px] border-2 border-dashed border-[var(--shell-border)] bg-slate-50/80 p-8 text-center transition-colors hover:bg-slate-50">
                <input
                  key={importFileKey}
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                  onChange={handleExcelUpload}
                  disabled={excelUploading}
                />
                <div className="flex flex-col items-center gap-3">
                  {excelUploading ? (
                    <Loader2 className="h-9 w-9 animate-spin text-sky-600" />
                  ) : (
                    <FileUp className="h-9 w-9 text-slate-400" />
                  )}
                  <div>
                    <p className="text-base font-semibold text-slate-900">
                      {excelUploading ? "Processing file..." : "Click to upload or drop a file here"}
                    </p>
                    <p className="mt-1 text-sm text-slate-500">CSV or Excel, up to 5MB</p>
                  </div>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Required column</p>
                  <p className="mt-2 text-sm font-medium text-slate-900">email</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">Aliases like e-mail, mail, and email address also work.</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Recommended columns</p>
                  <p className="mt-2 text-sm font-medium text-slate-900">name, company, job title, phone, country, industry, sender_name, sender_email</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">Column names are matched flexibly, so exact labels are not required.</p>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </ProspectShell>
    );
  }

  if (!selectedList) {
    return renderWorkspaceOverview();
  }

  if (false) {
    return (
      <ProspectShell>
        <section className="grid gap-6 xl:grid-cols-[1.24fr_0.76fr]">
          <div className="list-rise relative overflow-hidden rounded-[36px] border border-[var(--shell-border)] bg-[var(--shell-surface-strong)] p-6 shadow-[0_22px_46px_rgba(15,23,42,0.12)] md:p-8">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_8%_14%,rgba(16,185,129,0.18),transparent_32%),radial-gradient(circle_at_82%_18%,rgba(14,165,233,0.16),transparent_28%),linear-gradient(160deg,rgba(255,255,255,0.99),rgba(248,250,252,0.97))]" />
            <div className="relative space-y-7">
              <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--shell-muted)]">
                <span className="flex items-center gap-2 rounded-full border border-slate-200 bg-white/90 px-3 py-1">
                  <Sparkles className="h-3.5 w-3.5 text-emerald-600" />
                  Prospect command center
                </span>
                <Badge
                  variant="outline"
                  className="h-6 rounded-full border-[var(--shell-border)] bg-white/90 px-3 text-[10px] font-semibold text-[var(--shell-ink)]"
                >
                  {filteredLists.length.toLocaleString()} visible lists
                </Badge>
                <span className="rounded-full border border-slate-200 bg-white/90 px-3 py-1 text-[10px] text-slate-600">
                  {populatedListsCount} populated, {emptyListsCount} empty
                </span>
              </div>

              <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr] xl:items-start">
                <div className="space-y-5">
                  <div className="space-y-3">
                    <h2
                      className="max-w-3xl text-4xl font-semibold tracking-tight text-[var(--shell-ink)] md:text-[3.2rem] md:leading-[1]"
                      style={{ fontFamily: "var(--shell-font-display)" }}
                    >
                      Contacts workspace
                    </h2>
                    <p className="max-w-2xl text-base leading-7 text-[var(--shell-muted)]">
                      Search lists, review inbound webhook leads, and move from intake to action without switching screens.
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <Button
                      onClick={() => setIsCreateListOpen(true)}
                      className="h-11 rounded-full bg-emerald-600 px-6 text-sm font-semibold shadow-[0_14px_28px_rgba(5,150,105,0.22)] hover:bg-emerald-700"
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Create new list
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleTemplateDownload}
                      className="h-11 rounded-full border-[var(--shell-border)] bg-white/90 px-6 text-sm font-semibold text-[var(--shell-ink)]"
                    >
                      <Download className="mr-2 h-4 w-4" />
                      Download template
                    </Button>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    {heroSummaryCards.map((card) => {
                      const Icon = card.icon;
                      return (
                        <div
                          key={card.label}
                          className="rounded-[26px] border border-white/70 bg-white/90 p-5 shadow-[0_12px_24px_rgba(15,23,42,0.08)]"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--shell-muted)]">
                              {card.label}
                            </p>
                            <div className={`rounded-xl p-2 ${card.tone}`}>
                              <Icon className="h-4 w-4" />
                            </div>
                          </div>
                          <p className="mt-4 text-[2.1rem] font-semibold leading-none text-[var(--shell-ink)]">
                            {card.value}
                          </p>
                          <p className="mt-2 text-xs leading-5 text-[var(--shell-muted)]">{card.helper}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="rounded-[30px] border border-slate-200 bg-white/92 p-6 shadow-[0_16px_30px_rgba(15,23,42,0.08)]">
                  <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                    Workspace snapshot
                  </div>
                  <h3 className="mt-3 text-2xl font-semibold text-slate-900">Keep the overview calm and the next action obvious.</h3>
                  <div className="mt-5 grid gap-3">
                    {workspacePrinciples.map((principle) => {
                      const Icon = principle.icon;
                      return (
                        <div key={principle.title} className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-4">
                          <div className="flex items-start gap-3">
                            <div className={`rounded-xl bg-white p-2 shadow-sm ${principle.tone}`}>
                              <Icon className="h-4 w-4" />
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-slate-900">{principle.title}</p>
                              <p className="mt-1 text-xs leading-5 text-slate-500">{principle.description}</p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Latest lead</p>
                      <p className="mt-2 text-sm font-semibold text-slate-900">{latestWebhookLead?.name || "No lead yet"}</p>
                      <p className="mt-1 text-xs leading-5 text-slate-500">{latestWebhookLead?.email || "Webhook leads appear here once captured."}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Latest activity</p>
                      <p className="mt-2 text-sm font-semibold text-slate-900">
                        {latestWebhookActivity ? formatActivityLabel(latestWebhookActivity.eventType) : "No activity yet"}
                      </p>
                      <p className="mt-1 text-xs leading-5 text-slate-500">
                        {latestWebhookActivity?.message || "Events from webhook leads will land here."}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                {featuredListCards.length > 0 ? (
                  featuredListCards.map((card) => {
                    const Icon = card.icon;
                    return (
                      <button
                        key={card.label}
                        type="button"
                        onClick={card.action}
                        className={`group rounded-[28px] border px-5 py-5 text-left shadow-[0_10px_22px_rgba(15,23,42,0.08)] transition-all duration-200 hover:-translate-y-1 ${card.tone}`}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-600">{card.label}</p>
                            <p className="mt-3 text-xl font-semibold text-slate-900">{card.title}</p>
                            <p className="mt-2 text-sm leading-6 text-slate-600">{card.helper}</p>
                          </div>
                          <div className={`rounded-2xl p-3 ${card.iconTone}`}>
                            <Icon className="h-5 w-5" />
                          </div>
                        </div>
                        <div className="mt-5 inline-flex items-center gap-1 text-sm font-semibold text-slate-900">
                          {card.actionLabel}
                          <ChevronRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                        </div>
                      </button>
                    );
                  })
                ) : (
                  <div className="rounded-[28px] border border-dashed border-[var(--shell-border)] bg-white/85 px-5 py-6 text-sm leading-6 text-[var(--shell-muted)]">
                    Create the first list to unlock a stronger review flow. The workspace will then feature your newest and largest audience up here.
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="list-rise">
            <Card className="rounded-[30px] border-[var(--shell-border)] bg-[var(--shell-surface-strong)] shadow-[0_14px_28px_rgba(15,23,42,0.1)]">
              <CardHeader className="space-y-3">
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  <Target className="h-3.5 w-3.5 text-emerald-600" />
                  Quick launch
                </div>
                <div>
                  <CardTitle className="text-2xl font-semibold text-[var(--shell-ink)]">Keep the page action-first.</CardTitle>
                  <CardDescription className="mt-2 text-sm leading-6 text-[var(--shell-muted)]">
                    The fastest workflow is still the best one: create the cohort, import context, then open the exact list before sending anything.
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {overviewGuideCards.map((card, index) => {
                  const Icon = card.icon;
                  return (
                    <button
                      key={card.title}
                      type="button"
                      onClick={card.action}
                      className="w-full rounded-[24px] border border-slate-200 bg-white/90 px-4 py-4 text-left transition-colors hover:bg-slate-50"
                    >
                      <div className="flex items-start gap-4">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-sm font-semibold text-emerald-700">
                          {index + 1}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                                <Icon className="h-4 w-4 text-emerald-600" />
                                {card.title}
                              </p>
                              <p className="mt-2 text-xs leading-5 text-slate-500">{card.description}</p>
                            </div>
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                              {card.actionLabel}
                              <ChevronRight className="h-3.5 w-3.5" />
                            </span>
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 px-4 py-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Stored webhook leads</p>
                    <p className="mt-2 text-2xl font-semibold text-slate-900">{webhookLeadCount.toLocaleString()}</p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">All inbound webhook prospects now stay visible in the workspace.</p>
                  </div>
                  <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 px-4 py-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Recent webhook hits</p>
                    <p className="mt-2 text-2xl font-semibold text-slate-900">{webhookHitsLast7Days.toLocaleString()}</p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">Recent intake activity without switching screens.</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.28fr_0.72fr]">
          <div className="space-y-5">
            <Card className="rounded-[30px] border-[var(--shell-border)] bg-[var(--shell-surface-strong)] shadow-[0_14px_28px_rgba(15,23,42,0.1)]">
              <CardHeader className="space-y-4 pb-5">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                      <ListChecks className="h-3.5 w-3.5 text-sky-600" />
                      List library
                    </div>
                    <CardTitle className="mt-3 text-2xl font-semibold text-[var(--shell-ink)]">Find the right audience before you scan the full page.</CardTitle>
                    <CardDescription className="mt-2 text-sm leading-6 text-[var(--shell-muted)]">
                      Search first, sort second, then open the list that matches the job. The featured cards above keep your biggest and newest audiences one click away.
                    </CardDescription>
                  </div>
                  <Badge
                    variant="outline"
                    className="h-7 rounded-full border-[var(--shell-border)] bg-white/90 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--shell-ink)]"
                  >
                    {filteredLists.length.toLocaleString()} visible
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4 pt-0">
                <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                  <div className="relative w-full xl:max-w-xl">
                    <Search className="absolute left-3 top-3.5 h-4 w-4 text-[var(--shell-muted)]" />
                    <Input
                      placeholder="Search lists by name or description"
                      className="h-12 rounded-full border-[var(--shell-border)] bg-white/95 pl-10 pr-24"
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.target.value)}
                    />
                    {listSearchIsActive && (
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => setSearchQuery("")}
                        className="absolute right-1 top-1.5 h-9 rounded-full px-4 text-xs font-semibold text-slate-600"
                      >
                        Clear
                      </Button>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <Select value={listSort} onValueChange={handleListSortChange}>
                      <SelectTrigger className="h-11 w-[210px] rounded-full bg-white">
                        <SelectValue placeholder="Sort by" />
                      </SelectTrigger>
                      <SelectContent>
                        {listSortOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 px-4 py-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Largest list</p>
                    <p className="mt-2 text-sm font-semibold text-slate-900">{largestList?.name || "No lists yet"}</p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      {largestList ? `${(largestList.count || 0).toLocaleString()} prospects` : "Create a list to start building a library."}
                    </p>
                  </div>
                  <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 px-4 py-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Newest list</p>
                    <p className="mt-2 text-sm font-semibold text-slate-900">{newestList?.name || "No lists yet"}</p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      {newestList ? new Date(newestList.created_at).toLocaleDateString() : "Recent work will appear here first."}
                    </p>
                  </div>
                  <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 px-4 py-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Average size</p>
                    <p className="mt-2 text-sm font-semibold text-slate-900">{averageListSize.toLocaleString()} prospects</p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">Smaller lists are easier to review and easier to trust.</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {filteredLists.length === 0 ? (
              <div className="rounded-[28px] border-2 border-dashed border-[var(--shell-border)] bg-white/85 p-10 text-center shadow-[0_12px_24px_rgba(15,23,42,0.08)]">
                <Users className="mx-auto mb-4 h-11 w-11 text-emerald-500/70" />
                <h3 className="text-xl font-semibold text-[var(--shell-ink)]">Start your first list</h3>
                <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[var(--shell-muted)]">
                  Create a list, import a file, and the workspace will immediately surface your newest and largest audiences for faster review.
                </p>
                <div className="mt-5 flex flex-wrap justify-center gap-3">
                  <Button
                    onClick={() => setIsCreateListOpen(true)}
                    className="h-10 rounded-full bg-emerald-600 px-5 text-sm font-semibold hover:bg-emerald-700"
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Create list
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleTemplateDownload}
                    className="h-10 rounded-full border-[var(--shell-border)] bg-white/80 px-5 text-sm font-semibold text-[var(--shell-ink)]"
                  >
                    <Download className="mr-2 h-4 w-4" />
                    CSV template
                  </Button>
                </div>
              </div>
            ) : (
              <div className="grid gap-5 md:grid-cols-2">
                {pagedLists.map((list) => {
                  const workspaceShare = listTotalProspects > 0 ? Math.round(((list.count || 0) / listTotalProspects) * 100) : 0;
                  const isLargestList = largestList?.id === list.id;
                  const isNewestList = newestList?.id === list.id;
                  const needsImport = (list.count || 0) === 0;

                  return (
                    <Card
                      key={list.id}
                      role="button"
                      tabIndex={0}
                      className="group relative cursor-pointer overflow-hidden rounded-[28px] border border-[var(--shell-border)] bg-white/92 shadow-[0_12px_24px_rgba(15,23,42,0.08)] transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_18px_34px_rgba(15,23,42,0.12)] focus:outline-none focus:ring-2 focus:ring-emerald-400/60"
                      onClick={() => openList(list)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          openList(list);
                        }
                      }}
                    >
                      <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-emerald-500 via-sky-400 to-amber-300 opacity-85" />
                      <CardHeader className="space-y-5 pb-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              {isLargestList && (
                                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-700">
                                  Largest
                                </span>
                              )}
                              {isNewestList && (
                                <span className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-sky-700">
                                  Newest
                                </span>
                              )}
                              {needsImport && (
                                <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-700">
                                  Needs import
                                </span>
                              )}
                            </div>
                            <CardTitle className="mt-3 line-clamp-2 text-xl font-semibold text-[var(--shell-ink)]">
                              {list.name}
                            </CardTitle>
                            <CardDescription className="mt-2 line-clamp-3 text-sm leading-6 text-[var(--shell-muted)]">
                              {list.description || "Add a short description so this audience is recognizable without opening the list."}
                            </CardDescription>
                          </div>
                          <div className="rounded-[22px] border border-slate-200 bg-slate-50/90 px-4 py-3 text-right">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Prospects</p>
                            <p className="mt-2 text-2xl font-semibold leading-none text-slate-900">
                              {(list.count || 0).toLocaleString()}
                            </p>
                          </div>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-3">
                          <div className="rounded-[22px] border border-slate-200 bg-slate-50/80 px-3 py-3">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Created</p>
                            <p className="mt-2 text-sm font-medium text-slate-900">{new Date(list.created_at).toLocaleDateString()}</p>
                          </div>
                          <div className="rounded-[22px] border border-slate-200 bg-slate-50/80 px-3 py-3">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Workspace share</p>
                            <p className="mt-2 text-sm font-medium text-slate-900">{workspaceShare}% of all prospects</p>
                          </div>
                          <div className="rounded-[22px] border border-slate-200 bg-slate-50/80 px-3 py-3">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Status</p>
                            <p className="mt-2 text-sm font-medium text-slate-900">{needsImport ? "Needs import" : "Ready to review"}</p>
                          </div>
                        </div>
                      </CardHeader>
                      <CardFooter className="flex items-center justify-between border-t border-[var(--shell-border)] bg-white/80 pt-4">
                        <p className="text-sm text-slate-600">
                          {needsImport ? "Import data to make this usable." : "Open the list to review people and context."}
                        </p>
                        <span className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-700">
                          Open list
                          <ChevronRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                        </span>
                      </CardFooter>
                    </Card>
                  );
                })}
              </div>
            )}

            {filteredLists.length > 0 && (
              <div className="rounded-[24px] border border-[var(--shell-border)] bg-[var(--shell-surface-strong)] px-4 py-4 shadow-[0_10px_22px_rgba(15,23,42,0.08)]">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--shell-muted)]">
                    <span className="font-semibold uppercase tracking-wide text-[var(--shell-muted)]">Lists per page</span>
                    <Select value={String(listPageSize)} onValueChange={handleListPageSizeChange}>
                      <SelectTrigger className="h-9 w-[120px] rounded-full bg-white">
                        <SelectValue placeholder="Per page" />
                      </SelectTrigger>
                      <SelectContent>
                        {listPageSizeOptions.map((size) => (
                          <SelectItem key={size} value={String(size)}>
                            {size} / page
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <span>
                      Showing {listPageStart}-{listPageEnd} of {filteredLists.length}
                    </span>
                  </div>
                  <Pagination className="w-auto justify-end">
                    <PaginationContent>
                      <PaginationItem>
                        <PaginationPrevious
                          href="#"
                          onClick={(event) => {
                            event.preventDefault();
                            handleListPageChange(listPage - 1);
                          }}
                          className={listPage === 1 ? "pointer-events-none opacity-50" : ""}
                        />
                      </PaginationItem>
                      {listPaginationItems.map((item, index) =>
                        item === "ellipsis" ? (
                          <PaginationItem key={`list-ellipsis-${index}`}>
                            <PaginationEllipsis />
                          </PaginationItem>
                        ) : (
                          <PaginationItem key={`list-${item}`}>
                            <PaginationLink
                              href="#"
                              isActive={item === listPage}
                              onClick={(event) => {
                                event.preventDefault();
                                handleListPageChange(item);
                              }}
                            >
                              {item}
                            </PaginationLink>
                          </PaginationItem>
                        )
                      )}
                      <PaginationItem>
                        <PaginationNext
                          href="#"
                          onClick={(event) => {
                            event.preventDefault();
                            handleListPageChange(listPage + 1);
                          }}
                          className={listPage === listTotalPages ? "pointer-events-none opacity-50" : ""}
                        />
                      </PaginationItem>
                    </PaginationContent>
                  </Pagination>
                </div>
              </div>
            )}
          </div>
          <div className="space-y-5 xl:sticky xl:top-6 self-start">
            <Card className="rounded-[30px] border-[var(--shell-border)] bg-[var(--shell-surface-strong)] shadow-[0_14px_28px_rgba(15,23,42,0.1)]">
              <CardHeader className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                      <Webhook className="h-3.5 w-3.5 text-violet-600" />
                      Live lead feed
                    </div>
                    <CardTitle className="mt-3 text-2xl font-semibold text-[var(--shell-ink)]">Inbound leads and activity in one place.</CardTitle>
                    <CardDescription className="mt-2 text-sm leading-6 text-[var(--shell-muted)]">
                      This is the operational rail: newest webhook leads first, then the latest downstream activity tied back to those same leads.
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 px-4 py-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Stored leads</p>
                    <p className="mt-2 text-2xl font-semibold text-slate-900">{webhookLeadCount.toLocaleString()}</p>
                  </div>
                  <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 px-4 py-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Hits (7d)</p>
                    <p className="mt-2 text-2xl font-semibold text-slate-900">{webhookHitsLast7Days.toLocaleString()}</p>
                  </div>
                  <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 px-4 py-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Events</p>
                    <p className="mt-2 text-2xl font-semibold text-slate-900">{webhookActivities.length.toLocaleString()}</p>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Newest leads</p>
                    <span className="text-xs text-slate-500">{webhookLeadPreview.length.toLocaleString()} shown</span>
                  </div>
                  {webhookWorkspaceLoading ? (
                    <div className="grid gap-3">
                      {Array.from({ length: 3 }).map((_, index) => (
                        <div
                          key={`webhook-prospect-skeleton-${index}`}
                          className="animate-pulse rounded-[24px] border border-slate-200 bg-white/85 p-4"
                        >
                          <div className="h-4 w-32 rounded bg-slate-200" />
                          <div className="mt-3 h-3 w-48 rounded bg-slate-100" />
                        </div>
                      ))}
                    </div>
                  ) : webhookLeadPreview.length === 0 ? (
                    <div className="rounded-[24px] border border-dashed border-[var(--shell-border)] bg-white/80 p-5 text-center">
                      <Webhook className="mx-auto h-8 w-8 text-violet-400" />
                      <p className="mt-3 text-sm font-semibold text-slate-900">No webhook leads yet</p>
                      <p className="mt-1 text-xs leading-5 text-slate-500">The newest captured leads will appear here as they land.</p>
                    </div>
                  ) : (
                    webhookLeadPreview.map((prospect) => (
                      <div key={prospect.id} className="rounded-[24px] border border-slate-200 bg-white/90 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-900">{prospect.name}</p>
                            <p className="truncate text-sm text-violet-700">{prospect.email}</p>
                            <p className="mt-2 text-xs text-slate-500">
                              {prospect.company || "No company"}{prospect.job_title ? ` - ${prospect.job_title}` : ""}
                            </p>
                          </div>
                          <span className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-violet-700">
                            {formatActivityLabel(prospect.last_activity_type)}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Recent activity</p>
                    <span className="text-xs text-slate-500">{webhookActivityPreview.length.toLocaleString()} shown</span>
                  </div>
                  {webhookWorkspaceLoading ? (
                    <div className="grid gap-3">
                      {Array.from({ length: 4 }).map((_, index) => (
                        <div
                          key={`webhook-activity-skeleton-${index}`}
                          className="animate-pulse rounded-[24px] border border-slate-200 bg-white/85 p-4"
                        >
                          <div className="h-4 w-28 rounded bg-slate-200" />
                          <div className="mt-3 h-3 w-full rounded bg-slate-100" />
                        </div>
                      ))}
                    </div>
                  ) : webhookActivityPreview.length === 0 ? (
                    <div className="rounded-[24px] border border-dashed border-[var(--shell-border)] bg-white/80 p-5 text-center">
                      <Activity className="mx-auto h-8 w-8 text-sky-400" />
                      <p className="mt-3 text-sm font-semibold text-slate-900">No activity yet</p>
                      <p className="mt-1 text-xs leading-5 text-slate-500">Opens, clicks, and other events will collect here.</p>
                    </div>
                  ) : (
                    webhookActivityPreview.map((activity, index) => (
                      <div key={activity.id} className="relative rounded-[24px] border border-slate-200 bg-white/90 p-4 pl-6">
                        {index < webhookActivityPreview.length - 1 && (
                          <div className="absolute bottom-[-14px] left-[19px] top-[42px] w-px bg-slate-200" />
                        )}
                        <div className="absolute left-4 top-5 h-3 w-3 rounded-full border-2 border-sky-200 bg-sky-500" />
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-900">{formatActivityLabel(activity.eventType)}</p>
                            <p className="mt-1 text-sm leading-6 text-slate-600">{activity.message}</p>
                            <p className="mt-3 text-xs font-medium text-slate-700">
                              {activity.prospectName} - {activity.prospectEmail}
                            </p>
                          </div>
                          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                            {formatDateTime(activity.createdAt)}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-[30px] border-[var(--shell-border)] bg-[var(--shell-surface-strong)] shadow-[0_14px_28px_rgba(15,23,42,0.1)]">
              <CardHeader className="space-y-3">
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  <BarChart3 className="h-3.5 w-3.5 text-sky-600" />
                  Healthy lists
                </div>
                <div>
                  <CardTitle className="text-2xl font-semibold text-[var(--shell-ink)]">Keep lists small, named well, and easy to trust.</CardTitle>
                  <CardDescription className="mt-2 text-sm leading-6 text-[var(--shell-muted)]">
                    Good contact workspaces reduce decision fatigue. That usually comes from focused cohorts, enough context fields, and predictable sender rules.
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 px-4 py-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Populated</p>
                    <p className="mt-2 text-xl font-semibold text-slate-900">{populatedListsCount}</p>
                  </div>
                  <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 px-4 py-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Empty</p>
                    <p className="mt-2 text-xl font-semibold text-slate-900">{emptyListsCount}</p>
                  </div>
                  <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 px-4 py-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Average size</p>
                    <p className="mt-2 text-xl font-semibold text-slate-900">{averageListSize.toLocaleString()}</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex gap-3">
                    <Building className="mt-0.5 h-4 w-4 text-sky-600" />
                    <div>
                      <p className="text-sm font-semibold text-slate-900">Company plus role</p>
                      <p className="text-xs leading-5 text-slate-500">Enough context to recognize a lead without opening every record.</p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <Globe2 className="mt-0.5 h-4 w-4 text-amber-600" />
                    <div>
                      <p className="text-sm font-semibold text-slate-900">Location and industry</p>
                      <p className="text-xs leading-5 text-slate-500">Useful for segmentation, routing, and quickly spotting bad imports.</p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <Mail className="mt-0.5 h-4 w-4 text-emerald-600" />
                    <div>
                      <p className="text-sm font-semibold text-slate-900">Sender clarity</p>
                      <p className="text-xs leading-5 text-slate-500">Predictable sender rules keep campaigns easier to review and easier to debug.</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        <Dialog open={isCreateListOpen} onOpenChange={setIsCreateListOpen}>
          <DialogContent className="sm:max-w-[560px]">
            <DialogHeader>
              <DialogTitle>Create new list</DialogTitle>
              <DialogDescription>
                Use a clear name and short description so the right audience is recognizable without opening it.
              </DialogDescription>
            </DialogHeader>
            <form
              className="space-y-5 py-4"
              onSubmit={(event) => {
                event.preventDefault();
                handleCreateList();
              }}
            >
              <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 text-sm leading-6 text-slate-600">
                Good list names reduce scanning time later. Include audience, timeframe, or campaign intent when it helps.
              </div>
              <div className="space-y-2">
                <Label>List name</Label>
                <Input
                  placeholder="e.g. US SaaS founders - Q2 follow-up"
                  value={newListForm.name}
                  onChange={(event) => setNewListForm((prev) => ({ ...prev, name: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea
                  rows={4}
                  placeholder="Who belongs here, where they came from, and how this list will be used."
                  value={newListForm.description}
                  onChange={(event) => setNewListForm((prev) => ({ ...prev, description: event.target.value }))}
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsCreateListOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit">Create list</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </ProspectShell>
    );
  }

  // --- LIST GRID VIEW ---
  return (
    <ProspectShell>
      <section className="list-rise relative overflow-hidden rounded-[32px] border border-[var(--shell-border)] bg-[var(--shell-surface-strong)] p-6 shadow-[0_22px_46px_rgba(15,23,42,0.12)]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_8%_16%,rgba(16,185,129,0.18),transparent_32%),radial-gradient(circle_at_82%_18%,rgba(245,158,11,0.16),transparent_28%),linear-gradient(160deg,rgba(255,255,255,0.98),rgba(248,250,252,0.97))]" />
        <div className="relative grid gap-6 xl:grid-cols-[1.45fr_0.95fr]">
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--shell-muted)]">
              <span className="flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-3 py-1">
                <Sparkles className="h-3.5 w-3.5 text-emerald-600" />
                Prospect workspace
              </span>
              <Badge
                variant="outline"
                className="h-6 rounded-full border-[var(--shell-border)] bg-white/80 px-3 text-[10px] font-semibold text-[var(--shell-ink)]"
              >
                {filteredLists.length.toLocaleString()} visible lists
              </Badge>
              <span className="rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-[10px] text-slate-600">
                {populatedListsCount} populated, {emptyListsCount} empty
              </span>
            </div>
            <div className="space-y-3">
              <h2 className="text-4xl font-semibold tracking-tight text-[var(--shell-ink)] md:text-[3.35rem]" style={{ fontFamily: "var(--shell-font-display)" }}>
                Prospect lists built for fast review
              </h2>
              <p className="max-w-2xl text-sm leading-6 text-[var(--shell-muted)]">
                Organize contacts into focused cohorts, import clean data quickly, and keep the next action obvious from the moment someone lands here.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => setIsCreateListOpen(true)}
                className="h-10 rounded-full bg-emerald-600 px-5 text-xs font-semibold shadow-[0_10px_20px_rgba(5,150,105,0.22)] hover:bg-emerald-700"
              >
                <Plus className="mr-2 h-4 w-4" />
                Create new list
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handleTemplateDownload}
                className="h-10 rounded-full border-[var(--shell-border)] bg-white/90 px-5 text-xs font-semibold text-[var(--shell-ink)]"
              >
                <Download className="mr-2 h-4 w-4" />
                Download template
              </Button>
            </div>
            <div className="flex flex-wrap gap-2 text-xs text-slate-600">
              {largestList && (
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1">
                  Largest list: <span className="font-semibold text-slate-900">{largestList.name}</span>
                </span>
              )}
              {newestList && (
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1">
                  Newest list: <span className="font-semibold text-slate-900">{newestList.name}</span>
                </span>
              )}
              <span className="rounded-full border border-slate-200 bg-white px-3 py-1">
                Average size: <span className="font-semibold text-slate-900">{averageListSize.toLocaleString()}</span>
              </span>
            </div>
          </div>
          <div className="rounded-[28px] border border-white/70 bg-white/90 p-5 shadow-[0_16px_30px_rgba(15,23,42,0.08)]">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              <Sparkles className="h-3.5 w-3.5 text-emerald-600" />
              Action-first workflow
            </div>
            <h3 className="mt-3 text-xl font-semibold text-slate-900">Keep the next step obvious</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Create, import, then open the list to review context before anyone launches outreach.
            </p>
            <div className="mt-5 space-y-3">
              {overviewGuideCards.map((card, index) => {
                const Icon = card.icon;
                return (
                  <div key={card.title} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                    <div className="flex gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-sm font-semibold text-slate-700 shadow-sm">
                        {index + 1}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                              <Icon className="h-4 w-4 text-emerald-600" />
                              {card.title}
                            </p>
                            <p className="mt-1 text-xs leading-5 text-slate-500">{card.description}</p>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={card.action}
                            className="h-8 rounded-full px-3 text-xs font-semibold text-emerald-700 hover:text-emerald-800"
                          >
                            {card.actionLabel}
                            <ChevronRight className="ml-1 h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {listSummaryCards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              className="rounded-[24px] border border-[var(--shell-border)] bg-[var(--shell-surface-strong)] p-5 shadow-[0_12px_24px_rgba(15,23,42,0.08)]"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--shell-muted)]">
                  {card.label}
                </p>
                <div className={`rounded-xl p-2 ${card.tone}`}>
                  <Icon className="h-4 w-4" />
                </div>
              </div>
              <p className="mt-3 text-[2rem] font-semibold leading-none text-[var(--shell-ink)]">{card.value}</p>
              <p className="mt-2 text-xs leading-5 text-[var(--shell-muted)]">{card.helper}</p>
            </div>
          );
        })}
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        {webhookSummaryCards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              className="rounded-[24px] border border-[var(--shell-border)] bg-[var(--shell-surface-strong)] p-5 shadow-[0_12px_24px_rgba(15,23,42,0.08)]"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--shell-muted)]">
                  {card.label}
                </p>
                <div className={`rounded-xl p-2 ${card.tone}`}>
                  <Icon className="h-4 w-4" />
                </div>
              </div>
              <p className="mt-3 text-[2rem] font-semibold leading-none text-[var(--shell-ink)]">{card.value}</p>
              <p className="mt-2 text-xs leading-5 text-[var(--shell-muted)]">{card.helper}</p>
            </div>
          );
        })}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="rounded-[28px] border-[var(--shell-border)] bg-[var(--shell-surface-strong)] shadow-[0_12px_24px_rgba(15,23,42,0.08)]">
          <CardHeader className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle className="text-xl font-semibold text-[var(--shell-ink)]">Webhook leads</CardTitle>
                <CardDescription className="mt-1 text-sm text-[var(--shell-muted)]">
                  Leads captured through automation webhooks appear here even when they are not part of a manual list.
                </CardDescription>
              </div>
              <Badge
                variant="outline"
                className="h-6 rounded-full border-[var(--shell-border)] bg-white/80 px-3 text-[10px] font-semibold text-[var(--shell-ink)]"
              >
                {webhookLeadCount.toLocaleString()} stored
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {webhookWorkspaceLoading ? (
              <div className="grid gap-3">
                {Array.from({ length: 3 }).map((_, index) => (
                  <div
                    key={`webhook-prospect-skeleton-${index}`}
                    className="animate-pulse rounded-2xl border border-slate-200 bg-white/80 p-4"
                  >
                    <div className="h-4 w-40 rounded bg-slate-200" />
                    <div className="mt-3 h-3 w-56 rounded bg-slate-100" />
                  </div>
                ))}
              </div>
            ) : webhookProspects.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[var(--shell-border)] bg-white/80 p-6 text-center">
                <Webhook className="mx-auto h-9 w-9 text-violet-400" />
                <h3 className="mt-3 text-lg font-semibold text-[var(--shell-ink)]">No webhook leads yet</h3>
                <p className="mt-2 text-sm leading-6 text-[var(--shell-muted)]">
                  Once a webhook-triggered automation receives leads, they will show up here with their latest activity.
                </p>
              </div>
            ) : (
              webhookProspects.map((prospect) => (
                <div
                  key={prospect.id}
                  className="rounded-[22px] border border-slate-200 bg-white/90 p-4 shadow-[0_10px_20px_rgba(15,23,42,0.06)]"
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <p className="truncate text-base font-semibold text-slate-900">{prospect.name}</p>
                      <p className="truncate text-sm font-medium text-violet-700">{prospect.email}</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {prospect.company ? (
                          <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-medium text-sky-700">
                            {prospect.company}
                          </span>
                        ) : null}
                        {prospect.job_title ? (
                          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                            {prospect.job_title}
                          </span>
                        ) : null}
                        <span className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-medium text-violet-700">
                          {formatActivityLabel(prospect.last_activity_type)}
                        </span>
                      </div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-xs text-slate-600">
                      <p className="font-semibold uppercase tracking-[0.14em] text-slate-500">Latest timestamps</p>
                      <p className="mt-2">Webhook: {formatDateTime(prospect.webhook_last_received_at)}</p>
                      <p className="mt-1">Activity: {formatDateTime(prospect.last_activity_at)}</p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="rounded-[28px] border-[var(--shell-border)] bg-[var(--shell-surface-strong)] shadow-[0_12px_24px_rgba(15,23,42,0.08)]">
          <CardHeader className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle className="text-xl font-semibold text-[var(--shell-ink)]">Recent webhook lead activity</CardTitle>
                <CardDescription className="mt-1 text-sm text-[var(--shell-muted)]">
                  This feed combines webhook receipts and automation engagement tied back to webhook-originated leads.
                </CardDescription>
              </div>
              <Badge
                variant="outline"
                className="h-6 rounded-full border-[var(--shell-border)] bg-white/80 px-3 text-[10px] font-semibold text-[var(--shell-ink)]"
              >
                {webhookActivities.length.toLocaleString()} recent events
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {webhookWorkspaceLoading ? (
              <div className="grid gap-3">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div
                    key={`webhook-activity-skeleton-${index}`}
                    className="animate-pulse rounded-2xl border border-slate-200 bg-white/80 p-4"
                  >
                    <div className="h-4 w-32 rounded bg-slate-200" />
                    <div className="mt-3 h-3 w-full rounded bg-slate-100" />
                  </div>
                ))}
              </div>
            ) : webhookActivities.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[var(--shell-border)] bg-white/80 p-6 text-center">
                <Activity className="mx-auto h-9 w-9 text-sky-400" />
                <h3 className="mt-3 text-lg font-semibold text-[var(--shell-ink)]">No webhook activity yet</h3>
                <p className="mt-2 text-sm leading-6 text-[var(--shell-muted)]">
                  When webhook leads receive automation events like sends, opens, and clicks, the activity stream will update here.
                </p>
              </div>
            ) : (
              webhookActivities.map((activity) => (
                <div
                  key={activity.id}
                  className="rounded-[22px] border border-slate-200 bg-white/90 p-4 shadow-[0_10px_20px_rgba(15,23,42,0.06)]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900">{formatActivityLabel(activity.eventType)}</p>
                      <p className="mt-1 text-sm text-slate-600">{activity.message}</p>
                      <p className="mt-3 text-xs font-medium text-slate-700">
                        {activity.prospectName} • {activity.prospectEmail}
                      </p>
                      {activity.prospectCompany ? (
                        <p className="mt-1 text-xs text-slate-500">{activity.prospectCompany}</p>
                      ) : null}
                    </div>
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                      {formatDateTime(activity.createdAt)}
                    </span>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6 ">
        <div className="space-y-4">
          <Card className="rounded-[28px] border-[var(--shell-border)] bg-[var(--shell-surface-strong)] shadow-[0_12px_24px_rgba(15,23,42,0.08)]">
            <CardHeader className="space-y-4 pb-5">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <CardTitle className="text-xl font-semibold text-[var(--shell-ink)]">Your list library</CardTitle>
                  <CardDescription className="mt-1 text-sm text-[var(--shell-muted)]">
                    Search by list name or description, then open the right audience without scanning the whole page.
                  </CardDescription>
                </div>
                <Badge
                  variant="outline"
                  className="h-6 rounded-full border-[var(--shell-border)] bg-white/80 px-3 text-[10px] font-semibold text-[var(--shell-ink)]"
                >
                  {filteredLists.length.toLocaleString()} visible
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="relative w-full lg:max-w-md">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-[var(--shell-muted)]" />
                  <Input
                    placeholder="Search lists by name or description"
                    className="h-11 rounded-full border-[var(--shell-border)] bg-white/95 pl-10 pr-24"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                  />
                  {listSearchIsActive && (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setSearchQuery("")}
                      className="absolute right-1 top-1 h-9 rounded-full px-4 text-xs font-semibold text-slate-600"
                    >
                      Clear
                    </Button>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <Select value={listSort} onValueChange={handleListSortChange}>
                    <SelectTrigger className="h-10 w-[200px] bg-white">
                      <SelectValue placeholder="Sort by" />
                    </SelectTrigger>
                    <SelectContent>
                      {listSortOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {filteredLists.length === 0 ? (
            <div className="rounded-[24px] border-2 border-dashed border-[var(--shell-border)] bg-white/80 p-10 text-center shadow-[0_10px_20px_rgba(15,23,42,0.06)]">
              <Users className="h-10 w-10 mx-auto text-emerald-500/70 mb-4" />
              <h3 className="text-lg font-semibold text-[var(--shell-ink)]">Start your first list</h3>
              <p className="text-sm text-[var(--shell-muted)] mb-5">
                Create a list, import a CSV, and start building campaigns from clean data.
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                <Button
                  onClick={() => setIsCreateListOpen(true)}
                  className="h-9 rounded-full bg-emerald-600 px-4 text-xs font-semibold hover:bg-emerald-700"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Create List
                </Button>
                <Button
                  variant="outline"
                  onClick={handleTemplateDownload}
                  className="h-9 rounded-full border-[var(--shell-border)] bg-white/80 text-xs font-semibold text-[var(--shell-ink)]"
                >
                  <Download className="h-4 w-4 mr-2" />
                  CSV template
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {pagedLists.map((list) => {
                const workspaceShare = listTotalProspects > 0 ? Math.round(((list.count || 0) / listTotalProspects) * 100) : 0;
                const isLargestList = largestList?.id === list.id;
                const isNewestList = newestList?.id === list.id;
                return (
                  <Card
                    key={list.id}
                    role="button"
                    tabIndex={0}
                    className="group relative cursor-pointer overflow-hidden rounded-[24px] border border-[var(--shell-border)] bg-white/90 shadow-[0_10px_20px_rgba(15,23,42,0.08)] transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_16px_30px_rgba(15,23,42,0.12)] focus:outline-none focus:ring-2 focus:ring-emerald-400/60"
                    onClick={() => openList(list)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        openList(list);
                      }
                    }}
                  >
                    <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-emerald-500 via-sky-400 to-amber-300 opacity-70" />
                    <CardHeader className="space-y-4 pb-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <CardTitle className="line-clamp-1 text-lg font-semibold text-[var(--shell-ink)]">
                              {list.name}
                            </CardTitle>
                            {isLargestList && (
                              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-700">
                                Largest
                              </span>
                            )}
                            {isNewestList && (
                              <span className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-sky-700">
                                New
                              </span>
                            )}
                          </div>
                          <CardDescription className="mt-2 line-clamp-3 text-sm leading-6 text-[var(--shell-muted)]">
                            {list.description || "Add a short description so this audience is recognizable at a glance."}
                          </CardDescription>
                        </div>
                        <Badge
                          variant="outline"
                          className="h-6 rounded-full border-[var(--shell-border)] bg-white px-3 text-[10px] font-semibold text-[var(--shell-ink)]"
                        >
                          {(list.count || 0).toLocaleString()} prospects
                        </Badge>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-3 py-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Created</p>
                          <p className="mt-2 text-sm font-medium text-slate-900">{new Date(list.created_at).toLocaleDateString()}</p>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-3 py-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Workspace share</p>
                          <p className="mt-2 text-sm font-medium text-slate-900">{workspaceShare}% of all prospects</p>
                        </div>
                      </div>
                    </CardHeader>
                    <CardFooter className="flex items-center justify-between border-t border-[var(--shell-border)] bg-white/75 pt-4">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                        <span className="rounded-full border border-slate-200 bg-white px-3 py-1">
                          {(list.count || 0) > 0 ? "Ready to review" : "Needs import"}
                        </span>
                      </div>
                      <span className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-700">
                        Open list
                        <ChevronRight className="h-4 w-4" />
                      </span>
                    </CardFooter>
                  </Card>
                );
              })}
            </div>
          )}

          {filteredLists.length > 0 && (
            <div className="rounded-2xl border border-[var(--shell-border)] bg-[var(--shell-surface-strong)] px-4 py-3 shadow-[0_10px_22px_rgba(15,23,42,0.08)]">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--shell-muted)]">
                  <span className="font-semibold uppercase tracking-wide text-[var(--shell-muted)]">Lists per page</span>
                  <Select value={String(listPageSize)} onValueChange={handleListPageSizeChange}>
                    <SelectTrigger className="h-8 w-[120px]">
                      <SelectValue placeholder="Per page" />
                    </SelectTrigger>
                    <SelectContent>
                      {listPageSizeOptions.map((size) => (
                        <SelectItem key={size} value={String(size)}>
                          {size} / page
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span className="text-[var(--shell-muted)]">
                    Showing {listPageStart}-{listPageEnd} of {filteredLists.length}
                  </span>
                </div>
                <Pagination className="w-auto justify-end">
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious
                        href="#"
                        onClick={(event) => {
                          event.preventDefault();
                          handleListPageChange(listPage - 1);
                        }}
                        className={listPage === 1 ? "pointer-events-none opacity-50" : ""}
                      />
                    </PaginationItem>
                    {listPaginationItems.map((item, index) =>
                      item === "ellipsis" ? (
                        <PaginationItem key={`list-ellipsis-${index}`}>
                          <PaginationEllipsis />
                        </PaginationItem>
                      ) : (
                        <PaginationItem key={`list-${item}`}>
                          <PaginationLink
                            href="#"
                            isActive={item === listPage}
                            onClick={(event) => {
                              event.preventDefault();
                              handleListPageChange(item);
                            }}
                          >
                            {item}
                          </PaginationLink>
                        </PaginationItem>
                      )
                    )}
                    <PaginationItem>
                      <PaginationNext
                        href="#"
                        onClick={(event) => {
                          event.preventDefault();
                          handleListPageChange(listPage + 1);
                        }}
                        className={listPage === listTotalPages ? "pointer-events-none opacity-50" : ""}
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              </div>
            </div>
          )}
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-[24px] border border-[var(--shell-border)] bg-[var(--shell-surface-strong)] p-5 shadow-[0_12px_24px_rgba(15,23,42,0.08)]">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              <BarChart3 className="h-3.5 w-3.5 text-sky-600" />
              Library health
            </div>
            <h3 className="mt-2 text-lg font-semibold text-[var(--shell-ink)]">Balance size with clarity</h3>
            <p className="mt-2 text-sm leading-6 text-[var(--shell-muted)]">
              Strong list libraries are easy to scan, easy to recognize, and easy to reuse without second-guessing.
            </p>
            <div className="mt-5 space-y-3">
              <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Populated lists</p>
                <p className="mt-2 text-lg font-semibold text-slate-900">{populatedListsCount}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Empty lists</p>
                <p className="mt-2 text-lg font-semibold text-slate-900">{emptyListsCount}</p>
              </div>
              {largestList && (
                <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Largest list</p>
                  <p className="mt-2 text-sm font-semibold text-slate-900">{largestList.name}</p>
                  <p className="mt-1 text-xs text-slate-500">{(largestList.count || 0).toLocaleString()} prospects</p>
                </div>
              )}
            </div>
          </div>

          <div className="rounded-[24px] border border-[var(--shell-border)] bg-[var(--shell-surface-strong)] p-5 shadow-[0_12px_24px_rgba(15,23,42,0.08)]">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
              Strong list ingredients
            </div>
            <div className="mt-4 space-y-4">
              <div className="flex gap-3">
                <Building className="mt-0.5 h-4 w-4 text-sky-600" />
                <div>
                  <p className="text-sm font-semibold text-slate-900">Company plus role</p>
                  <p className="text-xs leading-5 text-slate-500">These two fields make campaigns easier to personalize and easier to sanity-check.</p>
                </div>
              </div>
              <div className="flex gap-3">
                <Globe2 className="mt-0.5 h-4 w-4 text-amber-600" />
                <div>
                  <p className="text-sm font-semibold text-slate-900">Location and industry</p>
                  <p className="text-xs leading-5 text-slate-500">Useful for segmentation, routing, and spotting mismatched imports quickly.</p>
                </div>
              </div>
              <div className="flex gap-3">
                <Mail className="mt-0.5 h-4 w-4 text-emerald-600" />
                <div>
                  <p className="text-sm font-semibold text-slate-900">Sender clarity</p>
                  <p className="text-xs leading-5 text-slate-500">Override sender details only when needed so campaigns remain predictable.</p>
                </div>
              </div>
              <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-3 text-xs leading-5 text-amber-700">
                Start with focused lists instead of dumping every contact into one giant audience. Smaller cohorts are easier to trust.
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Create List Dialog */}
      <Dialog open={isCreateListOpen} onOpenChange={setIsCreateListOpen}>
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>Create new list</DialogTitle>
            <DialogDescription>
              Use a clear name and short description so the right audience is recognizable without opening it.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-5 py-4"
            onSubmit={(event) => {
              event.preventDefault();
              handleCreateList();
            }}
          >
            <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 text-sm leading-6 text-slate-600">
              Good list names reduce scanning time later. Include audience, timeframe, or campaign intent when it helps.
            </div>
            <div className="space-y-2">
              <Label>List name</Label>
              <Input
                placeholder="e.g. US SaaS founders - Q2 follow-up"
                value={newListForm.name}
                onChange={(event) => setNewListForm((prev) => ({ ...prev, name: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                rows={4}
                placeholder="Who belongs here, where they came from, and how this list will be used."
                value={newListForm.description}
                onChange={(event) => setNewListForm((prev) => ({ ...prev, description: event.target.value }))}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsCreateListOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">Create list</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </ProspectShell>
  );
};

export default ProspectListManager;

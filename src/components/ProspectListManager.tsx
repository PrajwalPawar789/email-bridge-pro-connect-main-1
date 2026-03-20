import React, { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
  Phone,
  MapPin,
  Briefcase,
  Factory,
  Send,
  Hash,
  ChevronDown,
} from "lucide-react";
import * as XLSX from "xlsx";
import { useAuth } from "@/providers/AuthProvider";
import { runAutomationRunner } from "@/lib/automations";
import { motion, AnimatePresence } from "framer-motion";

/* ─────────────────────────── Types ─────────────────────────── */

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
  count?: number;
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

/* ─────────────────────────── Helpers ─────────────────────────── */

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

const timeAgo = (dateStr: string) => {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
};

/* ─────────────────────────── Sub-Components ─────────────────────────── */

const DetailField = ({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value?: string }) => {
  if (!value) return null;
  return (
    <div className="flex items-start gap-3 py-2.5">
      <Icon className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
      <div>
        <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</div>
        <div className="text-sm mt-0.5">{value}</div>
      </div>
    </div>
  );
};

/* ─────────────────────────── Main Component ─────────────────────────── */

const ProspectListManager: React.FC = () => {
  const { user } = useAuth();

  /* ── State ── */
  const [lists, setLists] = useState<EmailList[]>([]);
  const [selectedList, setSelectedList] = useState<EmailList | null>(null);
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [prospectSearchQuery, setProspectSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);
  const [totalProspects, setTotalProspects] = useState(0);
  const [listSort, setListSort] = useState("recent");

  const [isCreateListOpen, setIsCreateListOpen] = useState(false);
  const [isAddProspectOpen, setIsAddProspectOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);

  const [newListForm, setNewListForm] = useState({ name: "", description: "" });
  const [newProspectForm, setNewProspectForm] = useState({
    name: "", email: "", company: "", job_title: "", phone: "",
    sender_name: "", sender_email: "", country: "", industry: "",
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

  const [selectedProspect, setSelectedProspect] = useState<Prospect | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  /* ── Effects ── */
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

  /* ── Fetchers (unchanged business logic) ── */
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
        supabase.from("prospects").select("id", { count: "exact", head: true }).eq("user_id", user.id).not("webhook_first_received_at", "is", null),
        supabase.from("prospects").select("id, name, email, company, job_title, webhook_first_received_at, webhook_last_received_at, last_activity_at, last_activity_type").eq("user_id", user.id).not("webhook_first_received_at", "is", null).order("webhook_last_received_at", { ascending: false }).limit(6),
        (supabase as any).from("automation_logs").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("event_type", "webhook_received").gte("created_at", sevenDaysAgo),
        (supabase as any).from("automation_logs").select("id, contact_id, event_type, message, created_at, metadata").eq("user_id", user.id).in("event_type", ["webhook_received", "email_sent", "email_opened", "email_clicked", "workflow_completed"]).order("created_at", { ascending: false }).limit(40),
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
      if (contactIds.length === 0) { setWebhookActivities([]); return; }

      const contactResponse = await (supabase as any).from("automation_contacts").select("id, prospect_id, email, full_name").in("id", contactIds);
      if (contactResponse.error) throw contactResponse.error;
      const contacts = Array.isArray(contactResponse.data) ? contactResponse.data : [];
      const contactMap = new Map(contacts.map((row: any) => [row.id, row]));
      const prospectIds = [...new Set(contacts.map((row: any) => row.prospect_id).filter(Boolean))];
      if (prospectIds.length === 0) { setWebhookActivities([]); return; }

      const prospectResponse = await supabase.from("prospects").select("id, name, email, company, webhook_first_received_at").in("id", prospectIds);
      if (prospectResponse.error) throw prospectResponse.error;
      const prospectMap = new Map(((prospectResponse.data || []) as Prospect[]).map((row) => [row.id, row]));

      const activityItems = rawLogs.map((row: any) => {
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
      }).filter((item): item is WebhookActivityItem => Boolean(item)).slice(0, 8);
      setWebhookActivities(activityItems);
    } catch (error) {
      console.error("Failed to load webhook workspace data:", error);
      setWebhookLeadCount(0); setWebhookHitsLast7Days(0);
      setWebhookProspects([]); setWebhookActivities([]);
    } finally { setWebhookWorkspaceLoading(false); }
  };

  const fetchProspects = async (listId: string, page = currentPage, size = pageSize, search = prospectSearchQuery) => {
    setLoading(true);
    const from = (page - 1) * size;
    const to = from + size - 1;
    const trimmedSearch = search.trim();
    try {
      let query = supabase.from("prospects").select(
        "id, name, email, company, job_title, phone, country, industry, sender_name, sender_email, email_list_prospects!inner(list_id, created_at)",
        { count: "exact" }
      ).eq("email_list_prospects.list_id", listId);
      if (trimmedSearch) {
        const pattern = `%${trimmedSearch}%`;
        query = query.or(`name.ilike.${pattern},email.ilike.${pattern},company.ilike.${pattern},job_title.ilike.${pattern},country.ilike.${pattern},industry.ilike.${pattern}`);
      }
      const { data, error, count } = await query.order("created_at", { foreignTable: "email_list_prospects", ascending: false }).range(from, to);
      if (error) throw error;
      setProspects((data || []) as Prospect[]);
      setTotalProspects(count ?? 0);
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      setProspects([]); setTotalProspects(0);
    } finally { setLoading(false); }
  };

  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(totalProspects / pageSize));
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, pageSize, totalProspects]);

  /* ── Handlers (unchanged business logic) ── */
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

  const handleTemplateDownload = () => {
    const header = "name,email,company,job_title,phone,country,industry,sender_name,sender_email\n";
    const blob = new Blob([header], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = "prospects-template.csv"; link.click();
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
    const { error } = await supabase.from("email_lists").insert({ user_id, name: newListForm.name, description: newListForm.description });
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
    const confirmMessage = "Are you sure you want to delete this list? Prospects that are only in this list will be deleted. Prospects in other lists will be kept.";
    if (!confirm(confirmMessage)) return;
    const { data: userData } = await supabase.auth.getUser();
    const user_id = userData?.user?.id;
    try {
      const { data: listLinks, error: listLinksError } = await supabase.from("email_list_prospects").select("prospect_id").eq("list_id", listId);
      if (listLinksError) throw listLinksError;
      const prospectIds = (listLinks || []).map((row: any) => row.prospect_id).filter(Boolean);
      let orphanIds: string[] = [];
      if (prospectIds.length > 0) {
        const { data: otherLinks, error: otherLinksError } = await supabase.from("email_list_prospects").select("prospect_id").in("prospect_id", prospectIds).neq("list_id", listId);
        if (otherLinksError) throw otherLinksError;
        const protectedIds = new Set((otherLinks || []).map((row: any) => row.prospect_id));
        orphanIds = prospectIds.filter((id) => !protectedIds.has(id));
      }
      const { error: deleteListError } = await supabase.from("email_lists").delete().eq("id", listId);
      if (deleteListError) throw deleteListError;
      let removedProspects = 0;
      if (orphanIds.length > 0 && user_id) {
        const { error: deleteProspectsError } = await supabase.from("prospects").delete().in("id", orphanIds).eq("user_id", user_id);
        if (deleteProspectsError) { console.warn("Failed to delete orphan prospects:", deleteProspectsError); }
        else { removedProspects = orphanIds.length; }
      }
      toast({ title: "Deleted", description: removedProspects > 0 ? `List deleted. ${removedProspects} prospects removed.` : "List deleted successfully." });
      if (selectedList?.id === listId) { setSelectedList(null); setProspects([]); setTotalProspects(0); }
      fetchLists();
    } catch (err: any) {
      toast({ title: "Error", description: err?.message || "Failed to delete list.", variant: "destructive" });
    }
  };

  const kickoffListAutomations = async (listId: string): Promise<AutomationKickoffResult> => {
    const emptyResult: AutomationKickoffResult = { matchedWorkflows: 0, triggered: 0, failed: 0 };
    if (!listId || !user?.id) return emptyResult;
    try {
      const { data: workflows, error } = await supabase.from("automation_workflows").select("id").eq("user_id", user.id).eq("trigger_type", "list_joined").eq("trigger_list_id", listId).eq("status", "live");
      if (error) { console.warn("Failed to query workflows:", error.message); return emptyResult; }
      const workflowIds = (workflows || []).map((workflow: { id: string }) => workflow.id).filter(Boolean);
      if (workflowIds.length === 0) return emptyResult;
      const kickoffResults = await Promise.all(workflowIds.map(async (workflowId) => {
        try { await runAutomationRunner("run_now", workflowId); return true; }
        catch (runnerError) { console.warn(`Failed to run workflow ${workflowId}:`, runnerError); return false; }
      }));
      const triggered = kickoffResults.filter(Boolean).length;
      return { matchedWorkflows: workflowIds.length, triggered, failed: workflowIds.length - triggered };
    } catch (error) { console.warn("Unexpected automation kickoff error:", error); return emptyResult; }
  };

  const handleAddProspect = async () => {
    if (!selectedList) return;
    if (!newProspectForm.email || !newProspectForm.name) {
      toast({ title: "Error", description: "Name and email are required", variant: "destructive" });
      return;
    }
    const user_id = user?.id;
    if (!user_id) { toast({ title: "Error", description: "You must be logged in.", variant: "destructive" }); return; }
    const normalizedEmail = newProspectForm.email.trim().toLowerCase();
    let { data: prospectData, error } = await supabase.from("prospects").select("id, name, email, company, job_title, phone, sender_name, sender_email, country, industry").eq("email", normalizedEmail).eq("user_id", user_id).limit(1).maybeSingle();
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    let prospect = prospectData as any;
    if (!prospect) {
      const { data: newProspectData, error: insertErr } = await supabase.from("prospects").insert({
        user_id, name: newProspectForm.name, email: normalizedEmail,
        company: newProspectForm.company || null, job_title: newProspectForm.job_title || null,
        phone: newProspectForm.phone || null, sender_name: newProspectForm.sender_name || null,
        sender_email: newProspectForm.sender_email || null, country: newProspectForm.country || null,
        industry: newProspectForm.industry || null
      } as any).select("id, name, email, company, job_title, phone, sender_name, sender_email, country, industry").single();
      if (insertErr) { toast({ title: "Error", description: insertErr.message, variant: "destructive" }); return; }
      prospect = newProspectData;
    }
    if (prospect) {
      const { error: linkError } = await supabase.from("email_list_prospects").insert({ list_id: selectedList.id, prospect_id: prospect.id });
      if (!linkError) {
        const kickoffResult = await kickoffListAutomations(selectedList.id);
        toast({ title: "Success", description: "Prospect added to list." });
        setNewProspectForm({ name: "", email: "", company: "", job_title: "", phone: "", sender_name: "", sender_email: "", country: "", industry: "" });
        setIsAddProspectOpen(false);
        setTotalProspects((prev) => prev + 1);
        setSelectedList((prev) => prev ? { ...prev, count: (prev.count || 0) + 1 } : prev);
        setLists((prev) => prev.map((list) => list.id === selectedList.id ? { ...list, count: (list.count || 0) + 1 } : list));
        if (currentPage === 1) {
          const newProspect: Prospect = {
            id: prospect.id, name: prospect.name || newProspectForm.name, email: prospect.email || normalizedEmail,
            company: prospect.company || undefined, job_title: prospect.job_title || undefined,
            phone: prospect.phone || undefined, sender_name: prospect.sender_name || undefined,
            sender_email: prospect.sender_email || undefined, country: prospect.country || undefined,
            industry: prospect.industry || undefined,
          };
          setProspects((prev) => { if (prev.some((p) => p.id === newProspect.id)) return prev; return [newProspect, ...prev].slice(0, pageSize); });
        }
        if (kickoffResult.failed > 0) {
          toast({ title: "Automation warning", description: `Added but ${kickoffResult.failed} workflow run(s) failed.`, variant: "destructive" });
        }
      } else {
        if (linkError.code === '23505') { toast({ title: "Info", description: "Prospect is already in this list." }); }
        else { toast({ title: "Error", description: linkError.message, variant: "destructive" }); }
      }
    }
  };

  const handleExcelUpload = async (evt: React.ChangeEvent<HTMLInputElement>) => {
    const file = evt.target.files && evt.target.files[0];
    if (!selectedList || !file) {
      toast({ title: "Error", description: "Please select a list first and choose a file.", variant: "destructive" });
      return;
    }
    setExcelUploading(true);
    setImportProgress({ processed: 0, total: 0, errors: 0 });
    setImportResults(null);
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: "binary" });
        let sheetName = workbook.SheetNames[0];
        let sheet = workbook.Sheets[sheetName];
        if (!sheet || Object.keys(sheet).length === 0) {
          for (const name of workbook.SheetNames) {
            const testSheet = workbook.Sheets[name];
            if (testSheet && Object.keys(testSheet).length > 0) { sheetName = name; sheet = testSheet; break; }
          }
        }
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", blankrows: false }) as (string | number | null)[][];
        const headerRowIndex = rows.findIndex((row) => Array.isArray(row) && row.some((cell) => (cell ?? "").toString().trim() !== ""));
        if (headerRowIndex === -1) { toast({ title: "Error", description: "No header row found.", variant: "destructive" }); setExcelUploading(false); return; }

        let headerIdx: { [k: string]: number } = {};
        const rawHeaderRow = rows[headerRowIndex] || [];
        const headerRow = rawHeaderRow.map(x => (x ?? "").toString().toLowerCase().trim());
        const headerLength = headerRow.length;

        const findExactIndex = (aliases: string[]) => { for (const alias of aliases) { const idx = headerRow.findIndex((c) => c === alias); if (idx !== -1) return idx; } return -1; };
        const findContainsIndex = (tokens: string[], excludeTokens: string[] = []) => headerRow.findIndex((c) => tokens.some((t) => c.includes(t)) && !excludeTokens.some((ex) => c.includes(ex)));
        const findContainsAllIndex = (tokens: string[], excludeTokens: string[] = []) => headerRow.findIndex((c) => tokens.every((t) => c.includes(t)) && !excludeTokens.some((ex) => c.includes(ex)));
        const pickIndex = (exactAliases: string[], containsTokens?: string[], excludeTokens?: string[]) => {
          const exactIdx = findExactIndex(exactAliases);
          if (exactIdx !== -1) return exactIdx;
          if (containsTokens && containsTokens.length > 0) return findContainsIndex(containsTokens, excludeTokens);
          return -1;
        };
        const setHeaderIndex = (key: string, idx: number) => { if (idx !== -1 && headerIdx[key] === undefined) headerIdx[key] = idx; };

        const findEmailIndex = () => {
          const exactNames = ['email', 'e-mail', 'email address', 'mail'];
          for (const name of exactNames) { const idx = headerRow.findIndex(c => c === name); if (idx !== -1) return idx; }
          let idx = headerRow.findIndex(c => c.includes('email') && !c.includes('sender'));
          if (idx !== -1) return idx;
          return headerRow.findIndex(c => c.includes('email'));
        };
        const emailIndex = findEmailIndex();
        if (emailIndex === -1) { toast({ title: "Error", description: "Missing 'email' column.", variant: "destructive" }); setExcelUploading(false); return; }
        headerIdx['email'] = emailIndex;

        setHeaderIndex('sender_name', pickIndex(['sender_name', 'sender name', 'from name']));
        if (headerIdx['sender_name'] === undefined) { setHeaderIndex('sender_name', findContainsAllIndex(['sender', 'name'], ['email'])); }
        setHeaderIndex('sender_email', pickIndex(['sender_email', 'sender email', 'from email']));
        if (headerIdx['sender_email'] === undefined) { setHeaderIndex('sender_email', findContainsAllIndex(['sender', 'email'])); }
        setHeaderIndex('name', pickIndex(['name', 'full name', 'contact name', 'first name', 'contact'], ['name'], ['sender', 'company', 'email']));
        setHeaderIndex('company', pickIndex(['company', 'company name', 'organization', 'organisation', 'business', 'employer'], ['company', 'organization', 'organisation', 'org'], ['email', 'website', 'domain', 'size']));
        setHeaderIndex('job_title', pickIndex(['job_title', 'job title', 'title', 'role', 'position', 'job'], ['title', 'role', 'position', 'job'], ['email', 'sender']));
        setHeaderIndex('phone', pickIndex(['phone', 'telephone', 'mobile', 'cell', 'phone number', 'tel'], ['phone', 'telephone', 'mobile', 'cell', 'tel'], ['fax']));
        setHeaderIndex('country', pickIndex(['country', 'nation', 'location'], ['country', 'nation', 'location'], ['company', 'email']));
        setHeaderIndex('industry', pickIndex(['industry', 'sector', 'business type', 'field', 'category'], ['industry', 'sector'], ['email']));

        const { data: userData } = await supabase.auth.getUser();
        const user_id = userData?.user?.id;

        const columnAvailability: { [k: string]: boolean } = { job_title: true, country: true, industry: true, sender_name: true, sender_email: true };
        const testColumn = async (col: string) => { try { await supabase.from('prospects').select(col).limit(1); return true; } catch { return true; } };
        columnAvailability.job_title = await testColumn('job_title');
        columnAvailability.country = await testColumn('country');
        columnAvailability.industry = await testColumn('industry');
        columnAvailability.sender_name = await testColumn('sender_name');
        columnAvailability.sender_email = await testColumn('sender_email');

        if (!user_id) { toast({ title: "Error", description: "You must be logged in.", variant: "destructive" }); setExcelUploading(false); return; }

        const dataRows = rows.slice(headerRowIndex + 1);
        const totalRows = dataRows.length;
        setImportProgress({ processed: 0, total: totalRows, errors: 0 });
        let successCount = 0, errorCount = 0, skippedCount = 0, linkedCount = 0, columnMismatchCount = 0;

        for (let i = 0; i < dataRows.length; i++) {
          const row = dataRows[i];
          if (!row || row.every(cell => !cell || cell.toString().trim() === '')) continue;
          const extraCells = Array.isArray(row) ? row.slice(headerLength) : [];
          if (extraCells.some((cell) => (cell ?? "").toString().trim() !== "")) { columnMismatchCount++; errorCount++; setImportProgress(prev => ({ ...prev, processed: i + 1, errors: prev.errors + 1 })); continue; }
          const normalizedRow = Array.from({ length: headerLength }, (_, idx) => row?.[idx] ?? "");
          const email = normalizedRow[headerIdx["email"]]?.toString().trim();
          if (!email) { skippedCount++; setImportProgress(prev => ({ ...prev, processed: i + 1, errors: prev.errors + 1 })); continue; }
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { errorCount++; setImportProgress(prev => ({ ...prev, processed: i + 1, errors: prev.errors + 1 })); continue; }
          const name = normalizedRow[headerIdx["name"]]?.toString().trim() || email.split('@')[0] || "Unknown";

          let { data: prospect } = await supabase.from("prospects").select("id").eq("email", email.toLowerCase()).eq("user_id", user_id).maybeSingle();
          if (!prospect) {
            const prospectData: any = { user_id, name, email: email.toLowerCase() };
            if (headerIdx["company"] !== undefined && normalizedRow[headerIdx["company"]]) prospectData.company = normalizedRow[headerIdx["company"]]?.toString().trim();
            if (headerIdx["job_title"] !== undefined && normalizedRow[headerIdx["job_title"]] && columnAvailability.job_title) prospectData.job_title = normalizedRow[headerIdx["job_title"]]?.toString().trim();
            if (headerIdx["phone"] !== undefined && normalizedRow[headerIdx["phone"]]) prospectData.phone = normalizedRow[headerIdx["phone"]]?.toString().trim();
            if (headerIdx["country"] !== undefined && normalizedRow[headerIdx["country"]] && columnAvailability.country) prospectData.country = normalizedRow[headerIdx["country"]]?.toString().trim();
            if (headerIdx["industry"] !== undefined && normalizedRow[headerIdx["industry"]] && columnAvailability.industry) prospectData.industry = normalizedRow[headerIdx["industry"]]?.toString().trim();
            if (headerIdx["sender_name"] !== undefined && normalizedRow[headerIdx["sender_name"]] && columnAvailability.sender_name) prospectData.sender_name = normalizedRow[headerIdx["sender_name"]]?.toString().trim();
            if (headerIdx["sender_email"] !== undefined && normalizedRow[headerIdx["sender_email"]] && columnAvailability.sender_email) prospectData.sender_email = normalizedRow[headerIdx["sender_email"]]?.toString().trim();
            const { data: newProspect, error: insertError } = await supabase.from("prospects").insert(prospectData).select("id").single();
            if (insertError) { errorCount++; setImportProgress(prev => ({ ...prev, processed: i + 1, errors: prev.errors + 1 })); continue; }
            prospect = newProspect;
          }
          if (prospect) {
            const { data: existingLink } = await supabase.from("email_list_prospects").select("id").eq("list_id", selectedList.id).eq("prospect_id", prospect.id).maybeSingle();
            if (existingLink) { successCount++; }
            else {
              const { error: linkError } = await supabase.from("email_list_prospects").insert({ list_id: selectedList.id, prospect_id: prospect.id });
              if (!linkError) { successCount++; linkedCount++; } else { errorCount++; }
            }
          }
          setImportProgress(prev => ({ ...prev, processed: i + 1 }));
        }

        setImportResults({ success: successCount, errors: errorCount, skipped: skippedCount });
        let kickoffResult: AutomationKickoffResult = { matchedWorkflows: 0, triggered: 0, failed: 0 };
        if (linkedCount > 0) kickoffResult = await kickoffListAutomations(selectedList.id);
        if (successCount > 0) {
          toast({ title: "Import Complete", description: `${successCount} prospects processed. ${errorCount > 0 ? `${errorCount} errors.` : ''}` });
          setTimeout(() => { setIsImportOpen(false); fetchProspects(selectedList.id); fetchLists(); }, 2000);
        } else {
          toast({ title: "Import Warning", description: "No new prospects added.", variant: "destructive" });
        }
        if (kickoffResult.failed > 0) toast({ title: "Automation warning", description: `${kickoffResult.failed} workflow run(s) failed.`, variant: "destructive" });
      } catch (err: any) { toast({ title: "Import Failed", description: "Could not parse the file.", variant: "destructive" }); }
      finally { setExcelUploading(false); setImportProgress({ processed: 0, total: 0, errors: 0 }); setImportFileKey((prev) => prev + 1); }
    };
    reader.readAsBinaryString(file);
  };

  const handleImportOpenChange = (open: boolean) => {
    setIsImportOpen(open);
    if (!open) { setImportResults(null); setImportProgress({ processed: 0, total: 0, errors: 0 }); setImportFileKey((prev) => prev + 1); }
  };

  /* ── Derived data ── */
  const normalizedListQuery = searchQuery.trim().toLowerCase();
  const sortedLists = [...lists].sort((a, b) => {
    if (listSort === "name") return (a.name || "").localeCompare(b.name || "");
    if (listSort === "size") return (b.count || 0) - (a.count || 0);
    if (listSort === "size-asc") return (a.count || 0) - (b.count || 0);
    return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
  });
  const filteredLists = sortedLists.filter((list) => {
    if (!normalizedListQuery) return true;
    const name = list.name?.toLowerCase() || "";
    const description = list.description?.toLowerCase() || "";
    return name.includes(normalizedListQuery) || description.includes(normalizedListQuery);
  });

  const listTotalProspects = lists.reduce((sum, list) => sum + (list.count || 0), 0);
  const totalPages = Math.max(1, Math.ceil(totalProspects / pageSize));
  const pageStart = totalProspects === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const pageEnd = Math.min(currentPage * pageSize, totalProspects);
  const pageSizeOptions = [100, 500, 1000];

  const getPaginationItems = (page: number, total: number) => {
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
    const pages = new Set<number>([1, total, page, page - 1, page + 1]);
    const sorted = Array.from(pages).filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
    const items: Array<number | "ellipsis"> = [];
    let previous = 0;
    sorted.forEach((p) => { if (p - previous > 1 && previous !== 0) items.push("ellipsis"); items.push(p); previous = p; });
    return items;
  };
  const paginationItems = getPaginationItems(currentPage, totalPages);

  // Coverage stats
  const coverageFields = prospects.length > 0 ? [
    { label: "Company", count: prospects.filter(p => !!p.company).length },
    { label: "Job Title", count: prospects.filter(p => !!p.job_title).length },
    { label: "Country", count: prospects.filter(p => !!p.country).length },
    { label: "Industry", count: prospects.filter(p => !!p.industry).length },
    { label: "Sender", count: prospects.filter(p => !!(p.sender_name || p.sender_email)).length },
    { label: "Phone", count: prospects.filter(p => !!p.phone).length },
  ] : [];

  const addProspectFields = [
    { key: "name", label: "Name", required: true },
    { key: "email", label: "Email", required: true },
    { key: "company", label: "Company" },
    { key: "job_title", label: "Job Title" },
    { key: "phone", label: "Phone" },
    { key: "country", label: "Country" },
    { key: "industry", label: "Industry" },
    { key: "sender_name", label: "Sender Name" },
    { key: "sender_email", label: "Sender Email" },
  ];

  /* ════════════════════════════════════════════════════════════
     ██  R E N D E R
     ════════════════════════════════════════════════════════════ */

  return (
    <div className="flex h-[calc(100vh-64px)] overflow-hidden bg-background">

      {/* ── Sidebar ── */}
      <aside className="w-[280px] shrink-0 border-r border-border bg-muted/30 flex flex-col">
        {/* Sidebar header */}
        <div className="p-4 border-b border-border">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold tracking-tight">Lists</h2>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setIsCreateListOpen(true)}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search lists…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 pl-8 text-xs bg-background"
            />
          </div>
        </div>

        {/* Sidebar list items */}
        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {/* Overview item */}
          <button
            onClick={() => { setSelectedList(null); setProspects([]); }}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-left text-sm transition-colors ${
              !selectedList ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            <BarChart3 className="h-4 w-4 shrink-0" />
            <span className="truncate">Overview</span>
          </button>

          {loading && lists.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : (
            filteredLists.map((list) => (
              <button
                key={list.id}
                onClick={() => openList(list)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-left text-sm transition-colors group ${
                  selectedList?.id === list.id ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <ListChecks className="h-4 w-4 shrink-0" />
                <span className="truncate flex-1">{list.name}</span>
                <span className="text-[11px] font-mono tabular-nums opacity-60">{(list.count || 0).toLocaleString()}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDeleteList(list.id); }}
                  className="opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </button>
              </button>
            ))
          )}

          {!loading && filteredLists.length === 0 && lists.length > 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">No lists match "{searchQuery}"</p>
          )}
          {!loading && lists.length === 0 && (
            <div className="text-center py-8">
              <p className="text-xs text-muted-foreground mb-2">No lists yet</p>
              <Button size="sm" variant="outline" className="text-xs" onClick={() => setIsCreateListOpen(true)}>
                <Plus className="h-3.5 w-3.5 mr-1.5" /> Create List
              </Button>
            </div>
          )}
        </div>

        {/* Sidebar stats footer */}
        <div className="border-t border-border p-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="text-center">
              <div className="text-lg font-semibold tabular-nums">{lists.length}</div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Lists</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-semibold tabular-nums">{listTotalProspects.toLocaleString()}</div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Prospects</div>
            </div>
          </div>
        </div>
      </aside>

      {/* ── Main Stage ── */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <AnimatePresence mode="wait">
          {!selectedList ? (
            /* ──────── Overview View ──────── */
            <motion.div
              key="overview"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="flex-1 overflow-y-auto p-6"
            >
              <div className="max-w-4xl mx-auto">
                <div className="mb-6">
                  <h1 className="text-2xl font-bold tracking-tight">Prospects</h1>
                  <p className="text-sm text-muted-foreground mt-1">Manage your prospect lists and track webhook activity.</p>
                </div>

                {/* Summary cards */}
                <div className="grid grid-cols-4 gap-3 mb-6">
                  {[
                    { label: "Total Lists", value: lists.length, icon: ListChecks, color: "text-emerald-600" },
                    { label: "Total Prospects", value: listTotalProspects, icon: Users, color: "text-sky-600" },
                    { label: "Webhook Leads", value: webhookLeadCount, icon: Webhook, color: "text-violet-600" },
                    { label: "Hits (7d)", value: webhookHitsLast7Days, icon: Activity, color: "text-amber-600" },
                  ].map((card) => (
                    <div key={card.label} className="border rounded-lg p-4 bg-background">
                      <div className="flex items-center gap-2 mb-2">
                        <card.icon className={`h-4 w-4 ${card.color}`} />
                        <span className="text-[11px] text-muted-foreground uppercase tracking-wider">{card.label}</span>
                      </div>
                      <div className="text-2xl font-bold tabular-nums">{card.value.toLocaleString()}</div>
                    </div>
                  ))}
                </div>

                {/* Webhook activity feed */}
                {webhookActivities.length > 0 && (
                  <div className="border rounded-lg bg-background p-4">
                    <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                      <Activity className="h-4 w-4 text-muted-foreground" />
                      Recent Webhook Activity
                    </h3>
                    <div className="space-y-2">
                      {webhookActivities.map((item) => (
                        <div key={item.id} className="flex items-center gap-3 py-2 border-b border-border last:border-0">
                          <div className="h-2 w-2 rounded-full bg-primary shrink-0" />
                          <div className="flex-1 min-w-0">
                            <span className="text-sm font-medium">{item.prospectName}</span>
                            {item.prospectCompany && <span className="text-xs text-muted-foreground ml-2">· {item.prospectCompany}</span>}
                          </div>
                          <Badge variant="secondary" className="text-[10px] shrink-0">
                            {formatActivityLabel(item.eventType)}
                          </Badge>
                          <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">{timeAgo(item.createdAt)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          ) : (
            /* ──────── Prospect Grid View ──────── */
            <motion.div
              key={`list-${selectedList.id}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="flex-1 flex flex-col overflow-hidden"
            >
              {/* Header bar */}
              <div className="shrink-0 border-b border-border px-5 py-3 flex items-center gap-3">
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setSelectedList(null); setProspects([]); }}>
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <div className="flex-1 min-w-0">
                  <h2 className="text-base font-semibold tracking-tight truncate">{selectedList.name}</h2>
                  <p className="text-[11px] text-muted-foreground">
                    {totalProspects.toLocaleString()} prospect{totalProspects !== 1 ? "s" : ""}
                    {selectedList.description && ` · ${selectedList.description}`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setIsImportOpen(true)}>
                    <FileUp className="h-3.5 w-3.5 mr-1.5" /> Import
                  </Button>
                  <Button size="sm" className="h-8 text-xs" onClick={() => setIsAddProspectOpen(true)}>
                    <UserPlus className="h-3.5 w-3.5 mr-1.5" /> Add
                  </Button>
                </div>
              </div>

              {/* Search + page size row */}
              <div className="shrink-0 px-5 py-2 flex items-center gap-3 border-b border-border bg-muted/20">
                <div className="relative flex-1 max-w-xs">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Search prospects…"
                    value={prospectSearchQuery}
                    onChange={(e) => { setProspectSearchQuery(e.target.value); setCurrentPage(1); }}
                    className="h-8 pl-8 text-xs bg-background"
                  />
                </div>
                <Select value={String(pageSize)} onValueChange={handlePageSizeChange}>
                  <SelectTrigger className="h-8 w-[100px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {pageSizeOptions.map((size) => (
                      <SelectItem key={size} value={String(size)} className="text-xs">{size} / page</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="text-[11px] text-muted-foreground tabular-nums ml-auto">
                  {totalProspects > 0 ? `${pageStart}–${pageEnd} of ${totalProspects.toLocaleString()}` : "No results"}
                </span>
              </div>

              {/* Table + Coverage side-by-side */}
              <div className="flex-1 flex overflow-hidden">
                {/* Table */}
                <div className="flex-1 overflow-auto">
                  {loading ? (
                    <div className="flex items-center justify-center h-full">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : prospects.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center">
                      <Users className="h-8 w-8 text-muted-foreground/40 mb-3" />
                      <p className="text-sm text-muted-foreground">No prospects found</p>
                      <p className="text-xs text-muted-foreground/60 mt-1">Add or import prospects to get started.</p>
                    </div>
                  ) : (
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 z-10 bg-muted/60 backdrop-blur-sm">
                        <tr className="border-b border-border">
                          <th className="text-left text-[10px] uppercase tracking-wider text-muted-foreground font-medium px-4 py-2.5 w-8">#</th>
                          <th className="text-left text-[10px] uppercase tracking-wider text-muted-foreground font-medium px-4 py-2.5">Name</th>
                          <th className="text-left text-[10px] uppercase tracking-wider text-muted-foreground font-medium px-4 py-2.5">Email</th>
                          <th className="text-left text-[10px] uppercase tracking-wider text-muted-foreground font-medium px-4 py-2.5">Company</th>
                          <th className="text-left text-[10px] uppercase tracking-wider text-muted-foreground font-medium px-4 py-2.5">Title</th>
                          <th className="text-left text-[10px] uppercase tracking-wider text-muted-foreground font-medium px-4 py-2.5">Country</th>
                        </tr>
                      </thead>
                      <tbody>
                        {prospects.map((p, i) => (
                          <tr
                            key={p.id}
                            onClick={() => { setSelectedProspect(p); setSheetOpen(true); }}
                            className="border-b border-border/50 hover:bg-muted/30 cursor-pointer transition-colors group"
                          >
                            <td className="px-4 py-2 text-[11px] text-muted-foreground tabular-nums">{pageStart + i}</td>
                            <td className="px-4 py-2 font-medium truncate max-w-[180px]">{p.name}</td>
                            <td className="px-4 py-2 text-primary text-xs font-mono truncate max-w-[200px]">{p.email}</td>
                            <td className="px-4 py-2 text-muted-foreground text-xs truncate max-w-[140px]">{p.company || "—"}</td>
                            <td className="px-4 py-2 text-muted-foreground text-xs truncate max-w-[140px]">{p.job_title || "—"}</td>
                            <td className="px-4 py-2 text-muted-foreground text-xs truncate max-w-[100px]">{p.country || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                {/* Coverage sidebar */}
                {/* {prospects.length > 0 && (
                  <div className="w-[240px] shrink-0 border-l border-border overflow-y-auto p-4 bg-muted/10">
                    <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1">Coverage</div>
                    <p className="text-[10px] text-muted-foreground mb-4">Current page ({prospects.length} rows)</p>
                    <div className="space-y-3">
                      {coverageFields.map((f) => {
                        const pct = Math.round((f.count / prospects.length) * 100);
                        return (
                          <div key={f.label}>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs font-medium">{f.label}</span>
                              <span className="text-[10px] tabular-nums text-muted-foreground">{f.count}/{prospects.length}</span>
                            </div>
                            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all duration-500 ${
                                  pct === 100 ? "bg-emerald-500" : pct >= 80 ? "bg-primary" : "bg-amber-500"
                                }`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )} */}
              </div>

              {/* Pagination footer */}
              {totalPages > 1 && (
                <div className="shrink-0 border-t border-border px-5 py-2 flex items-center justify-center">
                  <Pagination>
                    <PaginationContent className="gap-1">
                      <PaginationItem>
                        <PaginationPrevious
                          onClick={() => handlePageChange(currentPage - 1)}
                          className={currentPage <= 1 ? "pointer-events-none opacity-40" : "cursor-pointer"}
                        />
                      </PaginationItem>
                      {paginationItems.map((item, idx) =>
                        item === "ellipsis" ? (
                          <PaginationItem key={`e-${idx}`}><PaginationEllipsis /></PaginationItem>
                        ) : (
                          <PaginationItem key={item}>
                            <PaginationLink
                              isActive={item === currentPage}
                              onClick={() => handlePageChange(item)}
                              className="cursor-pointer h-8 w-8 text-xs"
                            >
                              {item}
                            </PaginationLink>
                          </PaginationItem>
                        )
                      )}
                      <PaginationItem>
                        <PaginationNext
                          onClick={() => handlePageChange(currentPage + 1)}
                          className={currentPage >= totalPages ? "pointer-events-none opacity-40" : "cursor-pointer"}
                        />
                      </PaginationItem>
                    </PaginationContent>
                  </Pagination>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* ── Prospect Detail Sheet ── */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="w-[400px] sm:w-[440px] p-0 overflow-y-auto">
          {selectedProspect && (
            <>
              <SheetHeader className="px-6 pt-6 pb-4">
                <SheetTitle className="text-lg font-medium tracking-tight">{selectedProspect.name}</SheetTitle>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-sm text-primary font-mono">{selectedProspect.email}</span>
                </div>
              </SheetHeader>
              <Separator />
              <div className="px-6 py-4 space-y-1">
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-3 font-medium">Contact Details</div>
                <DetailField icon={Mail} label="Email" value={selectedProspect.email} />
                <DetailField icon={Phone} label="Phone" value={selectedProspect.phone} />
                <DetailField icon={Building} label="Company" value={selectedProspect.company} />
                <DetailField icon={Briefcase} label="Job Title" value={selectedProspect.job_title} />
                <DetailField icon={MapPin} label="Country" value={selectedProspect.country} />
                <DetailField icon={Factory} label="Industry" value={selectedProspect.industry} />
              </div>
              {(selectedProspect.sender_name || selectedProspect.sender_email) && (
                <>
                  <Separator />
                  <div className="px-6 py-4 space-y-1">
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-3 font-medium">Sender Override</div>
                    <DetailField icon={Send} label="Sender Name" value={selectedProspect.sender_name} />
                    <DetailField icon={Mail} label="Sender Email" value={selectedProspect.sender_email} />
                  </div>
                </>
              )}
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* ── Create List Dialog ── */}
      <Dialog open={isCreateListOpen} onOpenChange={setIsCreateListOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-medium">Create New List</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs">Name</Label>
              <Input value={newListForm.name} onChange={(e) => setNewListForm(prev => ({ ...prev, name: e.target.value }))} placeholder="e.g. Q2 Outreach" className="mt-1.5 h-9" />
            </div>
            <div>
              <Label className="text-xs">Description</Label>
              <Textarea value={newListForm.description} onChange={(e) => setNewListForm(prev => ({ ...prev, description: e.target.value }))} placeholder="Optional description…" className="mt-1.5 resize-none" rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setIsCreateListOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={handleCreateList}>Create List</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Add Prospect Dialog ── */}
      <Dialog open={isAddProspectOpen} onOpenChange={setIsAddProspectOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base font-medium">Add Prospect</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            {addProspectFields.map((f) => (
              <div key={f.key} className={f.key === "email" ? "col-span-2" : ""}>
                <Label className="text-xs">
                  {f.label} {f.required && <span className="text-destructive">*</span>}
                </Label>
                <Input
                  value={(newProspectForm as any)[f.key]}
                  onChange={(e) => setNewProspectForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                  className="mt-1 h-8 text-sm"
                  placeholder={f.label}
                />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setIsAddProspectOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={handleAddProspect}>Add Prospect</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Import Dialog ── */}
      <Dialog open={isImportOpen} onOpenChange={handleImportOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-medium">Import Prospects</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Upload a CSV or Excel file. Required column: <span className="font-medium text-foreground">email</span>.
            </p>
            <Input
              key={importFileKey}
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={handleExcelUpload}
              disabled={excelUploading}
              className="h-9 text-sm"
            />
            {excelUploading && importProgress.total > 0 && (
              <div className="space-y-2">
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-primary transition-all duration-300 rounded-full" style={{ width: `${Math.round((importProgress.processed / importProgress.total) * 100)}%` }} />
                </div>
                <p className="text-xs text-muted-foreground tabular-nums">
                  {importProgress.processed}/{importProgress.total} processed · {importProgress.errors} errors
                </p>
              </div>
            )}
            {importResults && (
              <div className="text-sm p-3 bg-muted/50 rounded-md border">
                <div className="font-medium mb-1">Import Complete</div>
                <div className="text-xs text-muted-foreground space-y-0.5">
                  <div>✓ {importResults.success} successful</div>
                  {importResults.errors > 0 && <div>✗ {importResults.errors} errors</div>}
                  {importResults.skipped > 0 && <div>⊘ {importResults.skipped} skipped</div>}
                </div>
              </div>
            )}
            <Button variant="outline" size="sm" className="text-xs" onClick={handleTemplateDownload}>
              Download Template
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ProspectListManager;

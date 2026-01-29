
import React, { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  TrendingUp
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import * as XLSX from "xlsx";
import { useAuth } from "@/providers/AuthProvider";

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
}

interface EmailList {
  id: string;
  name: string;
  description?: string;
  created_at: string;
  count?: number; // Optional count for UI
}

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

  useEffect(() => { fetchLists(); }, []);
  useEffect(() => {
    if (selectedList) {
      fetchProspects(selectedList.id, currentPage, pageSize);
    }
  }, [selectedList, currentPage, pageSize]);

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

  const fetchProspects = async (listId: string, page = currentPage, size = pageSize) => {
    setLoading(true);
    const from = (page - 1) * size;
    const to = from + size - 1;

    try {
      const { data, error, count } = await supabase
        .from("email_list_prospects")
        .select("id, prospect_id, prospects (id, name, email, company, job_title, phone, country, industry, sender_name, sender_email)", { count: "exact" })
        .eq("list_id", listId)
        .order("created_at", { ascending: false })
        .range(from, to);

      if (error) throw error;

      setProspects(
        (data || [])
          .map((row: any) => row.prospects)
          .filter((p: any) => !!p)
      );
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
        toast({ title: "Success", description: "Prospect added to list." });
        setNewProspectForm({ name: "", email: "", company: "", job_title: "", phone: "", sender_name: "", sender_email: "", country: "", industry: "" });
        setIsAddProspectOpen(false);
        setTotalProspects((prev) => prev + 1);
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
      } catch (err: any) {
        console.error(err);
        toast({ title: "Import Failed", description: "Could not parse the file.", variant: "destructive" });
      } finally {
        setExcelUploading(false);
        setImportProgress({ processed: 0, total: 0, errors: 0 });
      }
    };
    reader.readAsBinaryString(file);
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
    if (!normalizedListQuery) return true;
    const name = list.name?.toLowerCase() || "";
    const description = list.description?.toLowerCase() || "";
    return name.includes(normalizedListQuery) || description.includes(normalizedListQuery);
  });

  const filteredProspects = prospects.filter(p => 
    p.name.toLowerCase().includes(prospectSearchQuery.toLowerCase()) ||
    p.email.toLowerCase().includes(prospectSearchQuery.toLowerCase()) ||
    (p.company && p.company.toLowerCase().includes(prospectSearchQuery.toLowerCase())) ||
    (p.job_title && p.job_title.toLowerCase().includes(prospectSearchQuery.toLowerCase())) ||
    (p.country && p.country.toLowerCase().includes(prospectSearchQuery.toLowerCase())) ||
    (p.industry && p.industry.toLowerCase().includes(prospectSearchQuery.toLowerCase()))
  );

  const listTotalProspects = lists.reduce((sum, list) => sum + (list.count || 0), 0);
  const averageListSize = lists.length ? Math.round(listTotalProspects / lists.length) : 0;
  const largestList = lists.reduce<EmailList | null>((largest, list) => {
    if (!largest) return list;
    return (list.count || 0) > (largest.count || 0) ? list : largest;
  }, null);
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

  const listTotalPages = Math.max(1, Math.ceil(filteredLists.length / listPageSize));
  const listPageStart = filteredLists.length === 0 ? 0 : (listPage - 1) * listPageSize + 1;
  const listPageEnd = Math.min(listPage * listPageSize, filteredLists.length);
  const listPaginationItems = getPaginationItems(listPage, listTotalPages);
  const pagedLists = filteredLists.slice((listPage - 1) * listPageSize, listPage * listPageSize);

  const totalPages = Math.max(1, Math.ceil(totalProspects / pageSize));
  const pageStart = totalProspects === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const pageEnd = Math.min(currentPage * pageSize, totalProspects);
  const paginationItems = getPaginationItems(currentPage, totalPages);

  useEffect(() => {
    const total = Math.max(1, Math.ceil(filteredLists.length / listPageSize));
    if (listPage > total) {
      setListPage(total);
    }
  }, [filteredLists.length, listPage, listPageSize]);

  useEffect(() => {
    setListPage(1);
  }, [searchQuery, listSort, listPageSize]);

  if (selectedList) {
    // --- DETAIL VIEW ---
    return (
      <ProspectShell>
        <section className="list-rise relative overflow-hidden rounded-[28px] border border-[var(--shell-border)] bg-[var(--shell-surface-strong)] p-6 shadow-[0_18px_40px_rgba(15,23,42,0.12)]">
          <div className="space-y-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex items-start gap-4">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedList(null)}
                  className="h-9 rounded-full border border-[var(--shell-border)] bg-white/80 px-4 text-xs font-semibold text-[var(--shell-ink)]"
                >
                  <ArrowLeft className="h-4 w-4 mr-2" /> Back
                </Button>
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--shell-muted)]">
                    <span className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.6)]"></span>
                      List workspace
                    </span>
                    <Badge
                      variant="outline"
                      className="h-6 rounded-full border-[var(--shell-border)] bg-white/70 px-3 text-[10px] font-semibold text-[var(--shell-ink)]"
                    >
                      {totalProspects} prospects
                    </Badge>
                    <span className="text-[10px] font-medium tracking-[0.16em] text-[var(--shell-muted)]">
                      Created {new Date(selectedList.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <h2 className="text-3xl font-semibold text-[var(--shell-ink)]" style={{ fontFamily: "var(--shell-font-display)" }}>
                    {selectedList.name}
                  </h2>
                  <p className="text-sm text-[var(--shell-muted)]">
                    {selectedList.description || "No description provided."}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button className="h-10 rounded-full bg-emerald-600 px-5 text-xs font-semibold hover:bg-emerald-700">
                      <Plus className="h-4 w-4 mr-2" /> Add Prospects
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel>Add Options</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => setIsAddProspectOpen(true)}>
                      <UserPlus className="h-4 w-4 mr-2" /> Manually Add
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setIsImportOpen(true)}>
                      <FileSpreadsheet className="h-4 w-4 mr-2" /> Import from CSV/Excel
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => handleDeleteList(selectedList.id)}
                  className="h-10 w-10 rounded-full border-rose-200 text-rose-600 hover:bg-rose-50"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-2xl border border-[var(--shell-border)] bg-white/80 p-4">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--shell-muted)]">
                    Required fields
                  </p>
                  <Mail className="h-4 w-4 text-[var(--shell-muted)]" />
                </div>
                <p className="mt-2 text-sm font-semibold text-[var(--shell-ink)]">Name + Email</p>
                <p className="text-xs text-[var(--shell-muted)]">Every prospect needs these to send.</p>
              </div>
              <div className="rounded-2xl border border-[var(--shell-border)] bg-white/80 p-4">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--shell-muted)]">
                    Optional context
                  </p>
                  <Building className="h-4 w-4 text-[var(--shell-muted)]" />
                </div>
                <p className="mt-2 text-sm font-semibold text-[var(--shell-ink)]">
                  Company, job title, phone, country, industry, sender overrides
                </p>
                <p className="text-xs text-[var(--shell-muted)]">Add depth for personalization and filtering.</p>
              </div>
              <div className="rounded-2xl border border-[var(--shell-border)] bg-white/80 p-4">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--shell-muted)]">
                    Searchable fields
                  </p>
                  <Search className="h-4 w-4 text-[var(--shell-muted)]" />
                </div>
                <p className="mt-2 text-sm font-semibold text-[var(--shell-ink)]">
                  Name, email, company, job title, country, industry
                </p>
                <p className="text-xs text-[var(--shell-muted)]">Use search to narrow the current page.</p>
              </div>
            </div>
          </div>
        </section>

        {/* Search & Table */}
        <Card className="overflow-hidden rounded-[24px] border-[var(--shell-border)] bg-[var(--shell-surface-strong)] shadow-[0_16px_32px_rgba(15,23,42,0.1)]">
          <CardHeader className="space-y-3 pb-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <CardTitle className="text-lg font-semibold text-[var(--shell-ink)]">Prospects</CardTitle>
                <CardDescription className="text-xs text-[var(--shell-muted)]">
                  Search within the current page of results by name, email, company, job title, country, or industry.
                </CardDescription>
              </div>
              <div className="relative w-full md:w-72">
                <Search className="absolute left-3 top-3 h-4 w-4 text-[var(--shell-muted)]" />
                <Input
                  placeholder="Search prospects..."
                  className="h-10 rounded-full border-[var(--shell-border)] bg-white/90 pl-10"
                  value={prospectSearchQuery}
                  onChange={(e) => setProspectSearchQuery(e.target.value)}
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="rounded-md border-t border-[var(--shell-border)]">
              <div className="relative max-h-[60vh] w-full overflow-auto">
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
              <div className="border-t border-slate-200/70 bg-white/95 px-4 py-3 shadow-[0_-10px_18px_rgba(15,23,42,0.08)] backdrop-blur-sm">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    <span className="font-semibold uppercase tracking-wide text-slate-500">Items per page</span>
                    <Select value={String(pageSize)} onValueChange={handlePageSizeChange}>
                      <SelectTrigger className="h-8 w-[120px]">
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
                      Showing {pageStart}-{pageEnd} of {totalProspects}
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
                          <PaginationItem key={`ellipsis-${index}`}>
                            <PaginationEllipsis />
                          </PaginationItem>
                        ) : (
                          <PaginationItem key={item}>
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
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Add Prospect Dialog */}
        <Dialog open={isAddProspectOpen} onOpenChange={setIsAddProspectOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Prospect</DialogTitle>
              <DialogDescription>Manually add a single prospect to this list.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Full Name *</Label>
                  <Input 
                    value={newProspectForm.name} 
                    onChange={(e) => setNewProspectForm({...newProspectForm, name: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Email Address *</Label>
                  <Input 
                    value={newProspectForm.email} 
                    onChange={(e) => setNewProspectForm({...newProspectForm, email: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Company</Label>
                  <Input 
                    value={newProspectForm.company} 
                    onChange={(e) => setNewProspectForm({...newProspectForm, company: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Job Title</Label>
                  <Input 
                    value={newProspectForm.job_title} 
                    onChange={(e) => setNewProspectForm({...newProspectForm, job_title: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Phone</Label>
                  <Input 
                    value={newProspectForm.phone} 
                    onChange={(e) => setNewProspectForm({...newProspectForm, phone: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Country</Label>
                  <Input 
                    value={newProspectForm.country} 
                    onChange={(e) => setNewProspectForm({...newProspectForm, country: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Industry</Label>
                  <Input 
                    value={newProspectForm.industry} 
                    onChange={(e) => setNewProspectForm({...newProspectForm, industry: e.target.value})}
                  />
                </div>
              </div>
              <Separator />
              <div className="space-y-2">
                <Label className="text-xs text-gray-500 uppercase tracking-wider">Override Sender (Optional)</Label>
                <div className="grid grid-cols-2 gap-4">
                  <Input 
                    placeholder="Sender Name" 
                    value={newProspectForm.sender_name} 
                    onChange={(e) => setNewProspectForm({...newProspectForm, sender_name: e.target.value})}
                  />
                  <Input 
                    placeholder="Sender Email" 
                    value={newProspectForm.sender_email} 
                    onChange={(e) => setNewProspectForm({...newProspectForm, sender_email: e.target.value})}
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAddProspectOpen(false)}>Cancel</Button>
              <Button onClick={handleAddProspect}>Add Prospect</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Import Dialog */}
        <Dialog open={isImportOpen} onOpenChange={setIsImportOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Import Prospects</DialogTitle>
              <DialogDescription>Upload a CSV or Excel file to bulk import prospects.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              {excelUploading && importProgress.total > 0 && (
                <div className="bg-gray-50 p-4 rounded-md">
                  <div className="flex justify-between text-sm mb-2">
                    <span>Processing prospects...</span>
                    <span>{importProgress.processed}/{importProgress.total}</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div 
                      className="bg-blue-600 h-2 rounded-full transition-all duration-300" 
                      style={{ width: `${(importProgress.processed / importProgress.total) * 100}%` }}
                    ></div>
                  </div>
                  {importProgress.errors > 0 && (
                    <p className="text-xs text-red-600 mt-2">
                      {importProgress.errors} errors encountered
                    </p>
                  )}
                </div>
              )}
              
              {importResults && (
                <div className="bg-green-50 p-4 rounded-md">
                  <h4 className="font-semibold text-green-800 mb-2">Import Results</h4>
                  <div className="text-sm space-y-1">
                    <p className="text-green-700">✓ {importResults.success} prospects added successfully</p>
                    {importResults.errors > 0 && (
                      <p className="text-red-600">✗ {importResults.errors} errors occurred</p>
                    )}
                    {importResults.skipped > 0 && (
                      <p className="text-yellow-600">⚠ {importResults.skipped} rows skipped</p>
                    )}
                  </div>
                </div>
              )}
              
              <div className="border-2 border-dashed rounded-lg p-8 text-center hover:bg-gray-50 transition-colors cursor-pointer relative">
                <input 
                  type="file" 
                  accept=".csv,.xlsx,.xls" 
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  onChange={handleExcelUpload}
                  disabled={excelUploading}
                  key={Date.now()} // Force re-render to allow same file re-upload
                />
                <div className="flex flex-col items-center gap-2">
                  {excelUploading ? (
                    <Loader2 className="h-8 w-8 text-blue-600 animate-spin" />
                  ) : (
                    <FileUp className="h-8 w-8 text-gray-400" />
                  )}
                  <p className="text-sm font-medium text-gray-900">
                    {excelUploading ? "Processing file..." : "Click to upload or drag and drop"}
                  </p>
                  <p className="text-xs text-gray-500">CSV, Excel (max 5MB)</p>
                </div>
              </div>
                <div className="bg-blue-50 p-4 rounded-md text-xs text-blue-800 space-y-2">
                  <p className="font-semibold">Required Columns:</p>
                  <ul className="list-disc list-inside">
                    <li>email (or e-mail, mail, email address)</li>
                  </ul>
                  <p className="mt-2 font-semibold">Supported Optional Columns:</p>
                  <p>name (or full name, contact name), company (or organization), job title (or role, position), phone (or telephone, mobile)</p>
                  <p className="mt-2 text-xs italic">Column names are automatically matched with flexible variations.</p>
                  <p className="mt-2 text-xs text-green-600">Note: Duplicate prospects will be skipped automatically.</p>
                </div>
            </div>
          </DialogContent>
        </Dialog>
      </ProspectShell>
    );
  }

  // --- LIST GRID VIEW ---
  return (
    <ProspectShell>
      <section className="list-rise relative overflow-hidden rounded-[28px] border border-[var(--shell-border)] bg-[var(--shell-surface-strong)] p-6 shadow-[0_18px_40px_rgba(15,23,42,0.12)]">
        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--shell-muted)]">
              <span className="flex items-center gap-2">
                <Sparkles className="h-3 w-3" />
                Prospect workspace
              </span>
              <Badge
                variant="outline"
                className="h-6 rounded-full border-[var(--shell-border)] bg-white/70 px-3 text-[10px] font-semibold text-[var(--shell-ink)]"
              >
                {filteredLists.length.toLocaleString()} lists
              </Badge>
            </div>
            <h2 className="text-3xl font-semibold text-[var(--shell-ink)] md:text-4xl" style={{ fontFamily: "var(--shell-font-display)" }}>
              Prospect Lists
            </h2>
            <p className="max-w-xl text-sm text-[var(--shell-muted)]">
              Organize contacts into focused lists, import CSVs, and keep every prospect campaign-ready.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => setIsCreateListOpen(true)}
                className="h-10 rounded-full bg-emerald-600 px-5 text-xs font-semibold hover:bg-emerald-700"
              >
                <Plus className="h-4 w-4 mr-2" />
                Create New List
              </Button>
              <Button
                variant="outline"
                onClick={handleTemplateDownload}
                className="h-10 rounded-full border-[var(--shell-border)] bg-white/80 text-xs font-semibold text-[var(--shell-ink)]"
              >
                <Download className="h-4 w-4 mr-2" />
                Download CSV template
              </Button>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {listSummaryCards.map((card) => {
              const Icon = card.icon;
              return (
                <div
                  key={card.label}
                  className="rounded-2xl border border-[var(--shell-border)] bg-white/80 p-4"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--shell-muted)]">
                      {card.label}
                    </p>
                    <div className={`rounded-xl p-2 ${card.tone}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                  </div>
                  <p className="mt-2 text-lg font-semibold text-[var(--shell-ink)]">{card.value}</p>
                  <p className="text-xs text-[var(--shell-muted)]">{card.helper}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.7fr_0.8fr]">
        <div className="space-y-4">
          <Card className="rounded-[24px] border-[var(--shell-border)] bg-[var(--shell-surface-strong)] shadow-[0_12px_24px_rgba(15,23,42,0.08)]">
            <CardHeader className="space-y-3 pb-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <CardTitle className="text-lg font-semibold text-[var(--shell-ink)]">Your lists</CardTitle>
                  <CardDescription className="text-xs text-[var(--shell-muted)]">
                    Select a list to manage prospects and imports.
                  </CardDescription>
                </div>
                <Badge
                  variant="outline"
                  className="h-6 rounded-full border-[var(--shell-border)] bg-white/70 px-3 text-[10px] font-semibold text-[var(--shell-ink)]"
                >
                  {filteredLists.length.toLocaleString()} lists
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="relative w-full md:max-w-sm">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-[var(--shell-muted)]" />
                  <Input
                    placeholder="Search lists by name or description..."
                    className="h-10 rounded-full border-[var(--shell-border)] bg-white/90 pl-10"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <Select value={listSort} onValueChange={handleListSortChange}>
                    <SelectTrigger className="h-9 w-[180px]">
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
              {pagedLists.map((list) => (
                <Card
                  key={list.id}
                  className="group relative overflow-hidden rounded-[22px] border border-[var(--shell-border)] bg-white/90 shadow-[0_10px_20px_rgba(15,23,42,0.08)] transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_16px_30px_rgba(15,23,42,0.12)]"
                  onClick={() => {
                    setSelectedList(list);
                    setCurrentPage(1);
                    setTotalProspects(list.count || 0);
                    setProspectSearchQuery("");
                  }}
                >
                  <CardHeader className="space-y-3 pb-4">
                    <div className="flex items-start justify-between gap-3">
                      <CardTitle className="text-lg font-semibold text-[var(--shell-ink)] line-clamp-1">
                        {list.name}
                      </CardTitle>
                      <Badge
                        variant="outline"
                        className="h-6 rounded-full border-[var(--shell-border)] bg-white/90 text-[10px] font-semibold text-[var(--shell-ink)]"
                      >
                        {list.count || 0} prospects
                      </Badge>
                    </div>
                    <CardDescription className="text-sm text-[var(--shell-muted)] line-clamp-2">
                      {list.description || "No description yet."}
                    </CardDescription>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--shell-muted)]">
                      <span className="flex items-center gap-2">
                        <Mail className="h-3.5 w-3.5 text-emerald-600" />
                        {list.count || 0} contacts
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-400"></span>
                        Created {new Date(list.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </CardHeader>
                  <CardFooter className="pt-4 text-xs text-[var(--shell-muted)] flex justify-between items-center border-t border-[var(--shell-border)] bg-white/70">
                    <span className="uppercase tracking-[0.2em] text-[10px] text-[var(--shell-muted)]">Open list</span>
                    <Button variant="ghost" size="sm" className="h-6 text-emerald-700 hover:text-emerald-800 p-0">
                      View Details <ArrowLeft className="h-3 w-3 ml-1 rotate-180" />
                    </Button>
                  </CardFooter>
                </Card>
              ))}
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

        <aside className="space-y-4">
          <div className="rounded-[24px] border border-[var(--shell-border)] bg-[var(--shell-surface-strong)] p-5 shadow-[0_12px_24px_rgba(15,23,42,0.08)]">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--shell-muted)]">
              <Sparkles className="h-3 w-3" />
              On this page
            </div>
            <h3 className="mt-2 text-lg font-semibold text-[var(--shell-ink)]" style={{ fontFamily: "var(--shell-font-display)" }}>
              Prospect list hub
            </h3>
            <p className="text-sm text-[var(--shell-muted)]">
              Build lists, import contacts, and keep them campaign-ready.
            </p>
            <div className="mt-4 space-y-4">
              <div className="flex items-start gap-3">
                <div className="rounded-xl bg-emerald-100/80 p-2 text-emerald-700">
                  <ListChecks className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-[var(--shell-ink)]">Organize lists</p>
                  <p className="text-xs text-[var(--shell-muted)]">
                    Name lists, add descriptions, and track prospect counts.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="rounded-xl bg-sky-100/80 p-2 text-sky-700">
                  <FileSpreadsheet className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-[var(--shell-ink)]">Import data</p>
                  <p className="text-xs text-[var(--shell-muted)]">
                    Upload CSV or Excel files and map columns automatically.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="rounded-xl bg-amber-100/80 p-2 text-amber-700">
                  <UserPlus className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-[var(--shell-ink)]">Manual add + overrides</p>
                  <p className="text-xs text-[var(--shell-muted)]">
                    Add single prospects and override sender details when needed.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="rounded-xl bg-teal-100/80 p-2 text-teal-700">
                  <Search className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-[var(--shell-ink)]">Search + pagination</p>
                  <p className="text-xs text-[var(--shell-muted)]">
                    Filter lists quickly and browse using pages when your library grows.
                  </p>
                </div>
              </div>
            </div>
            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50/80 p-3 text-xs text-amber-700">
              <p className="font-semibold">Pagination tip</p>
              <p>Use list pages to keep navigation fast as your list count grows.</p>
            </div>
          </div>
        </aside>
      </section>

      {/* Create List Dialog */}
      <Dialog open={isCreateListOpen} onOpenChange={setIsCreateListOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New List</DialogTitle>
            <DialogDescription>Give your list a name and description to organize your prospects.</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4 py-4"
            onSubmit={(event) => {
              event.preventDefault();
              handleCreateList();
            }}
          >
            <div className="space-y-2">
              <Label>List Name</Label>
              <Input 
                placeholder="e.g., Tech Startups Q1" 
                value={newListForm.name}
                onChange={(e) => setNewListForm((prev) => ({ ...prev, name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input 
                placeholder="Optional description..." 
                value={newListForm.description}
                onChange={(e) => setNewListForm((prev) => ({ ...prev, description: e.target.value }))}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsCreateListOpen(false)}>Cancel</Button>
              <Button type="submit">Create List</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </ProspectShell>
  );
};

export default ProspectListManager;

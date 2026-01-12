
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
  Plus, FileUp, Search, Users, MoreVertical, 
  Trash2, ArrowLeft, Loader2, Download, UserPlus,
  FileSpreadsheet, Mail, Building, Phone
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import * as XLSX from "xlsx";

interface Prospect {
  id: string;
  name: string;
  email: string;
  company?: string;
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

const ProspectListManager: React.FC = () => {
  const [lists, setLists] = useState<EmailList[]>([]);
  const [selectedList, setSelectedList] = useState<EmailList | null>(null);
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [prospectSearchQuery, setProspectSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);
  const [totalProspects, setTotalProspects] = useState(0);
  const pageSizeOptions = [100, 500, 1000];

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
        .select("id, prospect_id, prospects (id, name, email, company, phone, country, industry, sender_name, sender_email)", { count: "exact" })
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
    if (!confirm("Are you sure you want to delete this list? This action cannot be undone.")) return;

    const { error } = await supabase
      .from("email_lists")
      .delete()
      .eq("id", listId);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Deleted", description: "List deleted successfully." });
      if (selectedList?.id === listId) setSelectedList(null);
      fetchLists();
    }
  };

  const handleAddProspect = async () => {
    if (!selectedList) return;
    if (!newProspectForm.email || !newProspectForm.name) {
      toast({ title: "Error", description: "Name and email are required", variant: "destructive" });
      return;
    }

    const { data: userData } = await supabase.auth.getUser();
    const user_id = userData?.user?.id;
    if (!user_id) return;

    // 1. Check/Create Prospect
    let { data: prospectData, error } = await supabase
      .from("prospects")
      .select("*")
      .eq("email", newProspectForm.email.trim().toLowerCase())
      .eq("user_id", user_id)
      .limit(1)
      .maybeSingle();

    let prospect = prospectData as any;

    if (!prospect) {
      const { data: newProspectData, error: insertErr } = await supabase
        .from("prospects")
        .insert({ 
          user_id, 
          name: newProspectForm.name, 
          email: newProspectForm.email.trim().toLowerCase(), 
          company: newProspectForm.company || null, 
          phone: newProspectForm.phone || null,
          sender_name: newProspectForm.sender_name || null,
          sender_email: newProspectForm.sender_email || null,
          country: newProspectForm.country || null,
          industry: newProspectForm.industry || null
        } as any)
        .select()
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
        setNewProspectForm({ name: "", email: "", company: "", phone: "", sender_name: "", sender_email: "", country: "", industry: "" });
        setIsAddProspectOpen(false);
        fetchProspects(selectedList.id);
        fetchLists(); // Update counts
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
        
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as string[][];
        console.log('Raw rows data:', rows);
        console.log('Number of rows:', rows.length);

        // Header mapping logic - prefer exact matches and avoid confusing sender_email with main email
        let headerIdx: { [k: string]: number } = {};
        const headerRow = rows[0]?.map(x => (x || "").toString().toLowerCase().trim());

        console.log('Raw header row:', rows[0]);
        console.log('Processed headers:', headerRow);

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

        // Map all possible column variations with prioritization (sender_* checked before general matches)
        headerRow?.forEach((col, idx) => {
          const lowerCol = (col || '').toLowerCase().trim();

          // Sender-specific first
          if ((lowerCol === 'sender_name' || lowerCol === 'sender name' || lowerCol === 'from name' || (lowerCol.includes('sender') && lowerCol.includes('name')))) {
            headerIdx['sender_name'] = idx;
            return;
          }
          if ((lowerCol === 'sender_email' || lowerCol === 'sender email' || lowerCol === 'from email' || (lowerCol.includes('sender') && lowerCol.includes('email')))) {
            headerIdx['sender_email'] = idx;
            return;
          }

          // General fields
          if (lowerCol === 'name' || lowerCol === 'full name' || lowerCol === 'contact name' || lowerCol === 'first name' || lowerCol === 'contact') headerIdx['name'] = idx;
          if (lowerCol === 'company' || lowerCol === 'organization' || lowerCol === 'organisation' || lowerCol.includes('company') || lowerCol.includes('org') || lowerCol === 'business' || lowerCol === 'employer') headerIdx['company'] = idx;
          if (lowerCol === 'phone' || lowerCol === 'telephone' || lowerCol === 'mobile' || lowerCol === 'cell' || lowerCol === 'phone number' || lowerCol.includes('phone') || lowerCol === 'tel') headerIdx['phone'] = idx;
          if (lowerCol === 'country' || lowerCol === 'nation' || lowerCol.includes('country') || lowerCol === 'location') headerIdx['country'] = idx;
          if (lowerCol === 'industry' || lowerCol === 'sector' || lowerCol === 'business type' || lowerCol.includes('industry') || lowerCol === 'field' || lowerCol === 'category') headerIdx['industry'] = idx;
        });

        console.log('Final column mapping:', headerIdx);
        const { data: userData } = await supabase.auth.getUser();
        const user_id = userData?.user?.id;
        
        console.log('User data:', userData);
        console.log('User ID:', user_id);

        // Check which optional columns exist in the DB to avoid insert errors
        const columnAvailability: { [k: string]: boolean } = {
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

        const totalRows = rows.length - 1; // Exclude header
        setImportProgress({ processed: 0, total: totalRows, errors: 0 });
        
        let successCount = 0;
        let errorCount = 0;
        let skippedCount = 0;

        // Process rows
        for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          
          // Skip empty rows
          if (!row || row.every(cell => !cell || cell.toString().trim() === '')) {
            console.log(`Skipping empty row ${i + 1}`);
            continue;
          }
          
          console.log(`Processing row ${i + 1}:`, row);
          
          const email = row[headerIdx["email"]]?.toString().trim();
          console.log(`Email extracted: "${email}" from index ${headerIdx["email"]}`);
          
          if (!email) {
            console.log(`Skipping row ${i + 1}: no email found`);
            skippedCount++;
            setImportProgress(prev => ({ ...prev, processed: i, errors: prev.errors + 1 }));
            continue;
          }
          
          // Validate email format
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailRegex.test(email)) {
            console.log(`Skipping row ${i + 1}: invalid email format: ${email}`);
            errorCount++;
            setImportProgress(prev => ({ ...prev, processed: i, errors: prev.errors + 1 }));
            continue;
          }
          
          const name = row[headerIdx["name"]]?.toString().trim() || email.split('@')[0] || "Unknown";

          console.log(`Processing row ${i + 1}: ${name} <${email}>`);

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
            if (headerIdx["company"] !== undefined && row[headerIdx["company"]]) {
              prospectData.company = row[headerIdx["company"]]?.toString().trim();
            }
            if (headerIdx["phone"] !== undefined && row[headerIdx["phone"]]) {
              prospectData.phone = row[headerIdx["phone"]]?.toString().trim();
            }
            // Add optional fields only if present in the file, non-empty, and column exists in DB
            if (headerIdx["country"] !== undefined && row[headerIdx["country"]] && columnAvailability.country) {
              prospectData.country = row[headerIdx["country"]]?.toString().trim();
            }
            if (headerIdx["industry"] !== undefined && row[headerIdx["industry"]] && columnAvailability.industry) {
              prospectData.industry = row[headerIdx["industry"]]?.toString().trim();
            }
            if (headerIdx["sender_name"] !== undefined && row[headerIdx["sender_name"]] && columnAvailability.sender_name) {
              prospectData.sender_name = row[headerIdx["sender_name"]]?.toString().trim();
            }
            if (headerIdx["sender_email"] !== undefined && row[headerIdx["sender_email"]] && columnAvailability.sender_email) {
              prospectData.sender_email = row[headerIdx["sender_email"]]?.toString().trim();
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
              setImportProgress(prev => ({ ...prev, processed: i, errors: prev.errors + 1 }));
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
          
          setImportProgress(prev => ({ ...prev, processed: i }));
        }

        setImportResults({ success: successCount, errors: errorCount, skipped: skippedCount });
        
        console.log('Import completed:', { successCount, errorCount, skippedCount });
        
        if (successCount > 0) {
          toast({ title: "Import Complete", description: `Successfully processed ${successCount} prospects. ${errorCount > 0 ? `${errorCount} errors occurred.` : ''} Duplicates were automatically skipped.` });
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

  const filteredLists = lists.filter(l => 
    l.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredProspects = prospects.filter(p => 
    p.name.toLowerCase().includes(prospectSearchQuery.toLowerCase()) ||
    p.email.toLowerCase().includes(prospectSearchQuery.toLowerCase()) ||
    (p.company && p.company.toLowerCase().includes(prospectSearchQuery.toLowerCase())) ||
    (p.country && p.country.toLowerCase().includes(prospectSearchQuery.toLowerCase())) ||
    (p.industry && p.industry.toLowerCase().includes(prospectSearchQuery.toLowerCase()))
  );

  const totalPages = Math.max(1, Math.ceil(totalProspects / pageSize));
  const pageStart = totalProspects === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const pageEnd = Math.min(currentPage * pageSize, totalProspects);
  const paginationItems = getPaginationItems(currentPage, totalPages);

  if (selectedList) {
    // --- DETAIL VIEW ---
    return (
      <div className="space-y-6 animate-in fade-in duration-300">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => setSelectedList(null)}>
              <ArrowLeft className="h-4 w-4 mr-2" /> Back
            </Button>
            <div>
              <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                {selectedList.name}
                <Badge variant="secondary" className="ml-2 text-sm font-normal">
                  {totalProspects} Prospects
                </Badge>
              </h2>
              <p className="text-gray-500 text-sm">{selectedList.description || "No description provided."}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button className="bg-blue-600 hover:bg-blue-700">
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
            <Button variant="outline" size="icon" onClick={() => handleDeleteList(selectedList.id)}>
              <Trash2 className="h-4 w-4 text-red-500" />
            </Button>
          </div>
        </div>

        {/* Search & Table */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-medium">Prospects</CardTitle>
              <div className="relative w-64">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search prospects..."
                  className="pl-8"
                  value={prospectSearchQuery}
                  onChange={(e) => setProspectSearchQuery(e.target.value)}
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="rounded-md border-t">
              <div className="relative max-h-[60vh] w-full overflow-auto">
                <table className="w-full min-w-[1280px] caption-bottom text-sm text-left">
                  <thead className="bg-white/95">
                    <tr className="border-b border-slate-200/70">
                      <th className="sticky top-0 z-30 h-11 min-w-[160px] bg-white/95 px-4 align-middle text-xs font-semibold uppercase tracking-wide text-slate-500 backdrop-blur-sm">Name</th>
                      <th className="sticky top-0 z-30 h-11 min-w-[240px] bg-white/95 px-4 align-middle text-xs font-semibold uppercase tracking-wide text-slate-500 backdrop-blur-sm">Email</th>
                      <th className="sticky top-0 z-30 h-11 min-w-[160px] bg-white/95 px-4 align-middle text-xs font-semibold uppercase tracking-wide text-slate-500 backdrop-blur-sm">Company</th>
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
                        <td colSpan={8} className="h-24 text-center text-muted-foreground">
                          No prospects found.
                        </td>
                      </tr>
                    ) : (
                      filteredProspects.map((p) => (
                        <tr key={p.id} className="group transition-colors hover:bg-slate-50/80">
                          <td className="px-4 py-3 align-middle font-medium text-slate-800">{p.name}</td>
                          <td className="px-4 py-3 align-middle text-blue-600 whitespace-nowrap truncate max-w-[240px]" title={p.email}>
                            {p.email}
                          </td>
                          <td className="px-4 py-3 align-middle text-slate-600">{p.company || '-'}</td>
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
                  <p>name (or full name, contact name), company (or organization), phone (or telephone, mobile)</p>
                  <p className="mt-2 text-xs italic">Column names are automatically matched with flexible variations.</p>
                  <p className="mt-2 text-xs text-orange-600">Note: Country, industry, and sender fields are temporarily disabled while database schema updates are applied.</p>
                  <p className="mt-2 text-xs text-green-600">Note: Duplicate prospects will be skipped automatically.</p>
                </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // --- LIST GRID VIEW ---
  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Prospect Lists</h2>
          <p className="text-gray-500">Manage your email lists and contacts.</p>
        </div>
        <Button onClick={() => setIsCreateListOpen(true)} className="bg-blue-600 hover:bg-blue-700">
          <Plus className="h-4 w-4 mr-2" />
          Create New List
        </Button>
      </div>

      <div className="flex items-center space-x-2 bg-white p-2 rounded-md border shadow-sm max-w-md">
        <Search className="h-4 w-4 text-gray-400 ml-2" />
        <Input 
          placeholder="Search lists..." 
          className="border-none shadow-none focus-visible:ring-0"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {filteredLists.length === 0 ? (
        <div className="text-center py-16 bg-gray-50 rounded-lg border-2 border-dashed">
          <Users className="h-12 w-12 mx-auto text-gray-300 mb-4" />
          <h3 className="text-lg font-medium text-gray-900">No lists found</h3>
          <p className="text-gray-500 mb-6">Create your first prospect list to get started.</p>
          <Button variant="outline" onClick={() => setIsCreateListOpen(true)}>
            Create List
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredLists.map((list) => (
            <Card 
              key={list.id} 
              className="group hover:shadow-md transition-all duration-200 cursor-pointer border-l-4 border-l-transparent hover:border-l-blue-600"
              onClick={() => {
                setSelectedList(list);
                setCurrentPage(1);
                setTotalProspects(list.count || 0);
                setProspectSearchQuery("");
              }}
            >
              <CardHeader className="pb-2">
                <div className="flex justify-between items-start">
                  <CardTitle className="text-lg font-semibold line-clamp-1">{list.name}</CardTitle>
                  <Badge variant="secondary" className="text-xs">
                    {list.count || 0} Prospects
                  </Badge>
                </div>
                <CardDescription className="line-clamp-2 h-10">
                  {list.description || "No description"}
                </CardDescription>
              </CardHeader>
              <CardFooter className="pt-4 text-xs text-gray-400 flex justify-between items-center border-t bg-gray-50/50">
                <span>Created {new Date(list.created_at).toLocaleDateString()}</span>
                <Button variant="ghost" size="sm" className="h-6 text-blue-600 hover:text-blue-700 p-0">
                  View Details <ArrowLeft className="h-3 w-3 ml-1 rotate-180" />
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}

      {/* Create List Dialog */}
      <Dialog open={isCreateListOpen} onOpenChange={setIsCreateListOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New List</DialogTitle>
            <DialogDescription>Give your list a name and description to organize your prospects.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>List Name</Label>
              <Input 
                placeholder="e.g., Tech Startups Q1" 
                value={newListForm.name}
                onChange={(e) => setNewListForm({...newListForm, name: e.target.value})}
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input 
                placeholder="Optional description..." 
                value={newListForm.description}
                onChange={(e) => setNewListForm({...newListForm, description: e.target.value})}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateListOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateList}>Create List</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ProspectListManager;

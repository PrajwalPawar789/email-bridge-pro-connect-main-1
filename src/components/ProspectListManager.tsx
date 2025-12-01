
import React, { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  });
  const [excelUploading, setExcelUploading] = useState(false);

  useEffect(() => { fetchLists(); }, []);
  useEffect(() => { if (selectedList) fetchProspects(selectedList.id); }, [selectedList]);

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

  const fetchProspects = async (listId: string) => {
    setLoading(true);
    const { data, error } = await supabase
      .from("email_list_prospects")
      .select("id, prospect_id, prospects (id, name, email, company, phone, sender_name, sender_email)")
      .eq("list_id", listId);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      setProspects([]);
    } else {
      setProspects(
        (data || [])
          .map((row: any) => row.prospects)
          .filter((p: any) => !!p)
      );
    }
    setLoading(false);
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
          sender_email: newProspectForm.sender_email || null
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
        setNewProspectForm({ name: "", email: "", company: "", phone: "", sender_name: "", sender_email: "" });
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
    if (!selectedList || !file) return;

    setExcelUploading(true);
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: "binary" });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as string[][];

        // Header mapping logic
        let headerIdx: { [k: string]: number } = {};
        const headerRow = rows[0]?.map(x => (x || "").toString().toLowerCase().trim());
        
        if (!headerRow?.includes("email")) {
          toast({ title: "Error", description: "Missing 'email' column in header", variant: "destructive" });
          setExcelUploading(false);
          return;
        }
        
        headerRow?.forEach((col, idx) => headerIdx[col] = idx);

        const { data: userData } = await supabase.auth.getUser();
        const user_id = userData?.user?.id;
        if (!user_id) return;

        let addedCount = 0;

        // Process rows
        for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          const email = row[headerIdx["email"]];
          const name = row[headerIdx["name"]] || email?.split('@')[0] || "Unknown"; // Fallback name

          if (!email) continue;

          // Create/Get Prospect
          let { data: prospect } = await supabase
            .from("prospects")
            .select("id")
            .eq("email", email.trim().toLowerCase())
            .eq("user_id", user_id)
            .maybeSingle();

          if (!prospect) {
            const { data: newProspect } = await supabase
              .from("prospects")
              .insert({
                user_id,
                name,
                email: email.trim().toLowerCase(),
                company: headerIdx["company"] !== undefined ? row[headerIdx["company"]] : null,
                phone: headerIdx["phone"] !== undefined ? row[headerIdx["phone"]] : null,
                sender_name: headerIdx["sender_name"] !== undefined ? row[headerIdx["sender_name"]] : null,
                sender_email: headerIdx["sender_email"] !== undefined ? row[headerIdx["sender_email"]] : null
              } as any)
              .select("id")
              .single();
            prospect = newProspect;
          }

          // Link to List
          if (prospect) {
            const { error: linkError } = await supabase
              .from("email_list_prospects")
              .insert({ list_id: selectedList.id, prospect_id: prospect.id });
            
            if (!linkError) addedCount++;
          }
        }

        toast({ title: "Import Complete", description: `Successfully added ${addedCount} prospects.` });
        setIsImportOpen(false);
        fetchProspects(selectedList.id);
        fetchLists();
      } catch (err: any) {
        console.error(err);
        toast({ title: "Import Failed", description: "Could not parse the file.", variant: "destructive" });
      } finally {
        setExcelUploading(false);
      }
    };
    reader.readAsBinaryString(file);
  };

  // --- RENDER HELPERS ---

  const filteredLists = lists.filter(l => 
    l.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredProspects = prospects.filter(p => 
    p.name.toLowerCase().includes(prospectSearchQuery.toLowerCase()) ||
    p.email.toLowerCase().includes(prospectSearchQuery.toLowerCase()) ||
    (p.company && p.company.toLowerCase().includes(prospectSearchQuery.toLowerCase()))
  );

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
                  {prospects.length} Prospects
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
              <div className="relative w-full overflow-auto">
                <table className="w-full caption-bottom text-sm text-left">
                  <thead className="[&_tr]:border-b">
                    <tr className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                      <th className="h-12 px-4 align-middle font-medium text-muted-foreground">Name</th>
                      <th className="h-12 px-4 align-middle font-medium text-muted-foreground">Email</th>
                      <th className="h-12 px-4 align-middle font-medium text-muted-foreground">Company</th>
                      <th className="h-12 px-4 align-middle font-medium text-muted-foreground">Phone</th>
                      <th className="h-12 px-4 align-middle font-medium text-muted-foreground">Sender Profile</th>
                    </tr>
                  </thead>
                  <tbody className="[&_tr:last-child]:border-0">
                    {filteredProspects.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="h-24 text-center text-muted-foreground">
                          No prospects found.
                        </td>
                      </tr>
                    ) : (
                      filteredProspects.map((p) => (
                        <tr key={p.id} className="border-b transition-colors hover:bg-muted/50">
                          <td className="p-4 align-middle font-medium">{p.name}</td>
                          <td className="p-4 align-middle text-blue-600">{p.email}</td>
                          <td className="p-4 align-middle">{p.company || '-'}</td>
                          <td className="p-4 align-middle">{p.phone || '-'}</td>
                          <td className="p-4 align-middle text-xs text-gray-500">
                            {p.sender_name ? (
                              <div className="flex flex-col">
                                <span>{p.sender_name}</span>
                                <span className="opacity-70">{p.sender_email}</span>
                              </div>
                            ) : '-'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
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
              <div className="border-2 border-dashed rounded-lg p-8 text-center hover:bg-gray-50 transition-colors cursor-pointer relative">
                <input 
                  type="file" 
                  accept=".csv,.xlsx,.xls" 
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  onChange={handleExcelUpload}
                  disabled={excelUploading}
                />
                <div className="flex flex-col items-center gap-2">
                  {excelUploading ? (
                    <Loader2 className="h-8 w-8 text-blue-600 animate-spin" />
                  ) : (
                    <FileUp className="h-8 w-8 text-gray-400" />
                  )}
                  <p className="text-sm font-medium text-gray-900">
                    {excelUploading ? "Uploading..." : "Click to upload or drag and drop"}
                  </p>
                  <p className="text-xs text-gray-500">CSV, Excel (max 5MB)</p>
                </div>
              </div>
              <div className="bg-blue-50 p-4 rounded-md text-xs text-blue-800 space-y-2">
                <p className="font-semibold">Required Columns:</p>
                <ul className="list-disc list-inside">
                  <li>email (Required)</li>
                  <li>name (Recommended)</li>
                </ul>
                <p className="mt-2 font-semibold">Optional Columns:</p>
                <p>company, phone, sender_name, sender_email</p>
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
              onClick={() => setSelectedList(list)}
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

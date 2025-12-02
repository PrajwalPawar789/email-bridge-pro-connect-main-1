
import React, { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { Plus, FileUp } from "lucide-react";
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
}

const ProspectListManager: React.FC = () => {
  const [lists, setLists] = useState<EmailList[]>([]);
  const [listName, setListName] = useState("");
  const [listDescription, setListDescription] = useState("");
  const [selectedList, setSelectedList] = useState<EmailList | null>(null);
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [prospectDetails, setProspectDetails] = useState({
    name: "",
    email: "",
    company: "",
    phone: "",
    sender_name: "",
    sender_email: "",
  });
  const [loading, setLoading] = useState(false);
  const [excelUploading, setExcelUploading] = useState(false);

  useEffect(() => { fetchLists(); }, []);
  useEffect(() => { if (selectedList) fetchProspects(selectedList.id); }, [selectedList]);

  const fetchLists = async () => {
    const { data, error } = await supabase
      .from("email_lists")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    setLists(data || []);
  };

  const handleCreateList = async () => {
    if (!listName) {
      toast({ title: "Error", description: "List name required", variant: "destructive" });
      return;
    }
    setLoading(true);
    const { data: userData } = await supabase.auth.getUser();
    const user_id = userData?.user?.id;
    if (!user_id) return;
    const { error } = await supabase.from("email_lists").insert({
      user_id,
      name: listName,
      description: listDescription,
    });
    if (!error) {
      toast({ title: "Success", description: "List created." });
      setListName("");
      setListDescription("");
      fetchLists();
    } else {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
    setLoading(false);
  };

  const fetchProspects = async (listId: string) => {
    setLoading(true);
    const { data, error } = await supabase
      .from("email_list_prospects")
      .select("id, prospect_id, prospects (id, name, email, company, phone, sender_name, sender_email)")
      .eq("list_id", listId)
      .limit(10000);

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

  // Import prospects from Excel
  const handleExcelUpload = async (evt: React.ChangeEvent<HTMLInputElement>) => {
    const file = evt.target.files && evt.target.files[0];
    if (!selectedList) {
      toast({ title: "Error", description: "Select a list first.", variant: "destructive" });
      return;
    }
    if (!file) return;

    setExcelUploading(true);
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: "binary" });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as string[][];

        let headerIdx: { [k: string]: number } = {};
        const headerRow = rows[0]?.map(x => (x || "").toString().toLowerCase().trim());
        
        const required = ["name", "email"];
        const missing = required.filter(req => !headerRow?.includes(req));
        if (missing.length > 0) {
            toast({ title: "Error", description: `Missing columns: ${missing.join(", ")}`, variant: "destructive" });
            setExcelUploading(false);
            return;
        }

        headerRow?.forEach((col, idx) => {
          headerIdx[col] = idx;
        });

        const { data: userData } = await supabase.auth.getUser();
        const user_id = userData?.user?.id;
        if (!user_id) {
          setExcelUploading(false);
          return;
        }

        // 1. Parse all valid rows
        const prospectsToProcess: any[] = [];
        for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          if (!row) continue;
          
          const email = row[headerIdx["email"]]?.toString().trim().toLowerCase();
          const name = row[headerIdx["name"]]?.toString().trim();
          
          if (!email || !name) continue;

          prospectsToProcess.push({
            user_id,
            name,
            email,
            company: headerIdx["company"] !== undefined ? row[headerIdx["company"]] : null,
            phone: headerIdx["phone"] !== undefined ? row[headerIdx["phone"]] : null,
            sender_name: headerIdx["sender_name"] !== undefined ? row[headerIdx["sender_name"]] : null,
            sender_email: headerIdx["sender_email"] !== undefined ? row[headerIdx["sender_email"]] : null
          });
        }

        // Remove duplicates within the file itself
        const uniqueProspects = Array.from(new Map(prospectsToProcess.map(item => [item.email, item])).values());
        const fileDuplicates = prospectsToProcess.length - uniqueProspects.length;

        console.log(`Processing ${uniqueProspects.length} unique prospects from file...`);

        // 2. Process in chunks
        const CHUNK_SIZE = 50;
        let addedCount = 0;
        let existingInListCount = 0;

        for (let i = 0; i < uniqueProspects.length; i += CHUNK_SIZE) {
            const chunk = uniqueProspects.slice(i, i + CHUNK_SIZE);
            const emails = chunk.map(p => p.email);

            // A. Find existing prospects
            const { data: existingProspects, error: fetchErr } = await supabase
                .from("prospects")
                .select("id, email")
                .eq("user_id", user_id)
                .in("email", emails);
            
            if (fetchErr) {
                console.error("Error fetching existing prospects", fetchErr);
                continue;
            }

            const existingEmailMap = new Map(existingProspects?.map(p => [p.email, p.id]));
            
            // B. Identify new prospects to insert
            const newProspects = chunk.filter(p => !existingEmailMap.has(p.email));
            
            let newProspectIds: { email: string, id: string }[] = [];

            if (newProspects.length > 0) {
                const { data: inserted, error: insertErr } = await supabase
                    .from("prospects")
                    .insert(newProspects)
                    .select("id, email");
                
                if (insertErr) {
                    console.error("Error inserting prospects", insertErr);
                } else if (inserted) {
                    inserted.forEach(p => newProspectIds.push({ email: p.email, id: p.id }));
                }
            }

            // C. Collect all IDs (existing + new)
            const allProspectIds: string[] = [];
            
            // Add existing IDs
            chunk.forEach(p => {
                if (existingEmailMap.has(p.email)) {
                    allProspectIds.push(existingEmailMap.get(p.email)!);
                }
            });
            // Add new IDs
            newProspectIds.forEach(p => allProspectIds.push(p.id));

            if (allProspectIds.length === 0) continue;

            // D. Link to list (avoid duplicates)
            // First check which are already linked
            const { data: existingLinks } = await supabase
                .from("email_list_prospects")
                .select("prospect_id")
                .eq("list_id", selectedList.id)
                .in("prospect_id", allProspectIds);
            
            const linkedIds = new Set(existingLinks?.map(l => l.prospect_id));
            existingInListCount += linkedIds.size;
            
            const linksToCreate = allProspectIds
                .filter(id => !linkedIds.has(id))
                .map(id => ({
                    list_id: selectedList.id,
                    prospect_id: id
                }));

            if (linksToCreate.length > 0) {
                const { error: linkErr } = await supabase
                    .from("email_list_prospects")
                    .insert(linksToCreate);
                
                if (!linkErr) {
                    addedCount += linksToCreate.length;
                } else {
                    console.error("Error linking prospects", linkErr);
                }
            }
        }

        let msg = `Imported ${addedCount} new prospects.`;
        if (existingInListCount > 0) msg += ` ${existingInListCount} were already in the list.`;
        if (fileDuplicates > 0) msg += ` ${fileDuplicates} duplicates removed from file.`;

        toast({ title: "Import Complete", description: msg });
        fetchProspects(selectedList.id);
      } catch (err: any) {
        console.error('Excel import error:', err);
        toast({ title: "Error", description: "Failed to import file.", variant: "destructive" });
      }
      setExcelUploading(false);
    };
    reader.readAsBinaryString(file);
  };

  // Internal reusable prospect add logic
  const handleAddProspectInternal = async (
    customDetails?: {
      name: string;
      email: string;
      company?: string;
      phone?: string;
      sender_name?: string;
      sender_email?: string;
    }
  ) => {
    if (!selectedList) return;
    const details = customDetails || prospectDetails;
    if (!details.email || !details.name) {
      if (!customDetails) {
        toast({ title: "Error", description: "Name and email required", variant: "destructive" });
      }
      return;
    }
    const { data: userData } = await supabase.auth.getUser();
    const user_id = userData?.user?.id;
    if (!user_id) return;

    let { data: prospectData, error } = await supabase
      .from("prospects")
      .select("*")
      .eq("email", details.email.trim().toLowerCase())
      .eq("user_id", user_id)
      .limit(1)
      .maybeSingle();

    let prospect = prospectData as any;

    if (!prospect) {
      const { data: newProspectData, error: insertErr } = await supabase
        .from("prospects")
        .insert({ 
          user_id, 
          name: details.name, 
          email: details.email.trim().toLowerCase(), 
          company: details.company || null, 
          phone: details.phone || null,
          sender_name: details.sender_name || null,
          sender_email: details.sender_email || null
        } as any)
        .select()
        .single();
      prospect = newProspectData;
      if (insertErr) error = insertErr;
    }

    if (prospect && !error) {
      // Update existing prospect if manual details are provided and different
      const updates: any = {};
      if (details.company && details.company !== prospect.company) updates.company = details.company;
      if (details.phone && details.phone !== prospect.phone) updates.phone = details.phone;
      if (details.name && details.name !== prospect.name) updates.name = details.name;
      if (details.sender_name && details.sender_name !== prospect.sender_name) updates.sender_name = details.sender_name;
      if (details.sender_email && details.sender_email !== prospect.sender_email) updates.sender_email = details.sender_email;

      if (Object.keys(updates).length > 0) {
        const { error: updateErr } = await supabase
          .from("prospects")
          .update(updates as any)
          .eq("id", prospect.id);
        
        if (updateErr) {
          console.error('Error updating prospect:', updateErr);
        } else {
          console.log('Updated existing prospect:', prospect.email, updates);
        }
      }

      // Check if already in list
      const { data: existingLink } = await supabase
        .from("email_list_prospects")
        .select("id")
        .eq("list_id", selectedList.id)
        .eq("prospect_id", prospect.id)
        .maybeSingle();

      if (!existingLink) {
        const { error: linkError } = await supabase
          .from("email_list_prospects")
          .insert({ list_id: selectedList.id, prospect_id: prospect.id });
        if (!linkError) {
          if (!customDetails) {
            toast({ title: "Success", description: "Prospect added to list." });
            fetchProspects(selectedList.id);
            setProspectDetails({ name: "", email: "", company: "", phone: "", sender_name: "", sender_email: "" });
          }
        } else {
          if (!customDetails) {
            toast({ title: "Error", description: linkError.message, variant: "destructive" });
          }
        }
      } else {
        if (!customDetails) {
          toast({ title: "Info", description: "Prospect already in this list.", variant: "default" });
        }
      }
    } else if (error && !customDetails) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  // Button click handler for manual add (calls handleAddProspectInternal)
  const handleAddProspect = async () => {
    setLoading(true);
    await handleAddProspectInternal();
    setLoading(false);
  };

  return (
    <div className="mx-auto max-w-4xl">
      <Card>
        <CardHeader>
          <CardTitle>Prospect Lists</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-6">
            {/* List Management */}
            <div className="md:w-1/2 space-y-4">
              <Label>New List Name</Label>
              <Input
                placeholder="e.g. My Prospects"
                value={listName}
                onChange={(e) => setListName(e.target.value)}
              />
              <Label>Description (optional)</Label>
              <Input
                placeholder="List description"
                value={listDescription}
                onChange={(e) => setListDescription(e.target.value)}
              />
              <Button onClick={handleCreateList} disabled={loading || !listName}>
                <Plus className="w-4 h-4 mr-1" /> Create List
              </Button>
              <hr className="my-4" />
              <Label>My Lists</Label>
              <div className="space-y-2">
                {lists.map((list) => (
                  <Button
                    key={list.id}
                    variant={selectedList?.id === list.id ? "default" : "outline"}
                    className="w-full justify-start"
                    onClick={() => setSelectedList(list)}
                  >
                    {list.name}
                  </Button>
                ))}
              </div>
            </div>
            {/* Prospect Management */}
            <div className="md:w-1/2 space-y-4">
              {selectedList ? (
                <>
                  <div className="mb-2 flex justify-between items-center">
                    <strong>Prospects in "{selectedList.name}" ({prospects.length})</strong>
                    <label className="flex items-center gap-1 cursor-pointer">
                      <FileUp className="w-5 h-5 text-green-600" />
                      <span className="text-xs text-gray-700">
                        Upload Excel
                      </span>
                      <input
                        type="file"
                        accept=".xlsx,.xls,.csv"
                        onChange={handleExcelUpload}
                        className="hidden"
                        disabled={excelUploading}
                      />
                    </label>
                  </div>
                  <div className="text-xs text-muted-foreground mb-2">
                    Excel columns required: <span className="font-medium">name,email</span>{' '}
                    (optional: company,phone,sender_name,sender_email). First row must be the header.
                  </div>
                  <div className="space-y-2 max-h-[300px] overflow-y-auto">
                    {prospects.length === 0
                      ? <span className="text-muted-foreground">No prospects yet.</span>
                      : (
                        <table className="w-full text-sm text-left">
                          <thead className="text-xs text-gray-700 uppercase bg-gray-50">
                            <tr>
                              <th className="px-2 py-1">Sr No</th>
                              <th className="px-2 py-1">ID</th>
                              <th className="px-2 py-1">Name</th>
                              <th className="px-2 py-1">Email</th>
                              <th className="px-2 py-1">Sender Name</th>
                              <th className="px-2 py-1">Sender Email</th>
                            </tr>
                          </thead>
                          <tbody>
                            {prospects.map((p, index) => (
                              <tr key={p.id} className="bg-white border-b">
                                <td className="px-2 py-1">{index + 1}</td>
                                <td className="px-2 py-1 font-mono text-xs">{p.id.slice(0, 8)}...</td>
                                <td className="px-2 py-1">{p.name}</td>
                                <td className="px-2 py-1">{p.email}</td>
                                <td className="px-2 py-1">{p.sender_name || '-'}</td>
                                <td className="px-2 py-1">{p.sender_email || '-'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )
                    }
                  </div>
                  <hr className="my-3" />
                  <Label>Add Prospect</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      placeholder="Name"
                      value={prospectDetails.name}
                      onChange={e => setProspectDetails({ ...prospectDetails, name: e.target.value })}
                    />
                    <Input
                      placeholder="Email"
                      value={prospectDetails.email}
                      type="email"
                      onChange={e => setProspectDetails({ ...prospectDetails, email: e.target.value })}
                    />
                    <Input
                      placeholder="Company (optional)"
                      value={prospectDetails.company}
                      onChange={e => setProspectDetails({ ...prospectDetails, company: e.target.value })}
                    />
                    <Input
                      placeholder="Phone (optional)"
                      value={prospectDetails.phone}
                      onChange={e => setProspectDetails({ ...prospectDetails, phone: e.target.value })}
                    />
                    <Input
                      placeholder="Sender Name (optional)"
                      value={prospectDetails.sender_name}
                      onChange={e => setProspectDetails({ ...prospectDetails, sender_name: e.target.value })}
                    />
                    <Input
                      placeholder="Sender Email (optional)"
                      value={prospectDetails.sender_email}
                      onChange={e => setProspectDetails({ ...prospectDetails, sender_email: e.target.value })}
                    />
                  </div>
                  <Button onClick={handleAddProspect} disabled={loading} className="mt-2">
                    <Plus className="h-4 w-4 mr-1" /> Add Prospect
                  </Button>
                  {excelUploading && (
                    <div className="text-xs text-blue-700 mt-2 animate-pulse">Uploading & importing...</div>
                  )}
                </>
              ) : (
                <span className="text-muted-foreground">Select a list to manage prospects.</span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ProspectListManager;

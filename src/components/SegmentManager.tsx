import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/providers/AuthProvider";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { Loader2, Plus, RefreshCcw, Save, Search, Sparkles, Trash2, Users } from "lucide-react";

const db = supabase as any;

type MatchType = "all" | "any";
type SegmentField =
  | "company"
  | "job_title"
  | "industry"
  | "country"
  | "name"
  | "email"
  | "email_domain"
  | "sender_email"
  | "sender_name"
  | "list_id"
  | "has_opened"
  | "has_clicked"
  | "has_replied"
  | "has_bounced";
type SegmentOperator =
  | "contains"
  | "not_contains"
  | "equals"
  | "not_equals"
  | "starts_with"
  | "ends_with"
  | "is_empty"
  | "is_not_empty"
  | "in_list"
  | "not_in_list"
  | "has"
  | "has_not";

type SegmentRule = { id: string; field: SegmentField; operator: SegmentOperator; value: string; lookback_days: string };
type SegmentRecord = {
  id: string;
  name: string;
  description: string | null;
  source_list_id: string | null;
  match_type: MatchType;
  conditions: unknown;
  exclusion_conditions: unknown;
  updated_at: string;
};
type SegmentItem = SegmentRecord & { matchCount: number };
type ListItem = { id: string; name: string; count: number };
type PreviewRow = { prospect_id: string; full_name: string | null; email: string; company: string | null; job_title: string | null; country: string | null };

type Editor = {
  id: string | null;
  name: string;
  description: string;
  source_list_id: string | null;
  match_type: MatchType;
  conditions: SegmentRule[];
  exclusions: SegmentRule[];
};

const fieldOptions: Array<{ value: SegmentField; label: string }> = [
  { value: "company", label: "Company" },
  { value: "job_title", label: "Job title" },
  { value: "industry", label: "Industry" },
  { value: "country", label: "Country" },
  { value: "name", label: "Name" },
  { value: "email", label: "Email" },
  { value: "email_domain", label: "Email domain" },
  { value: "sender_email", label: "Sender email" },
  { value: "sender_name", label: "Sender name" },
  { value: "list_id", label: "List membership" },
  { value: "has_opened", label: "Has opened" },
  { value: "has_clicked", label: "Has clicked" },
  { value: "has_replied", label: "Has replied" },
  { value: "has_bounced", label: "Has bounced" },
];
const textOps: Array<{ value: SegmentOperator; label: string }> = [
  { value: "contains", label: "contains" },
  { value: "not_contains", label: "does not contain" },
  { value: "equals", label: "equals" },
  { value: "not_equals", label: "does not equal" },
  { value: "starts_with", label: "starts with" },
  { value: "ends_with", label: "ends with" },
  { value: "is_empty", label: "is empty" },
  { value: "is_not_empty", label: "is not empty" },
];
const listOps: Array<{ value: SegmentOperator; label: string }> = [
  { value: "in_list", label: "is in list" },
  { value: "not_in_list", label: "is not in list" },
];
const behaviorOps: Array<{ value: SegmentOperator; label: string }> = [
  { value: "has", label: "has happened" },
  { value: "has_not", label: "has not happened" },
];
const behaviorSet = new Set<SegmentField>(["has_opened", "has_clicked", "has_replied", "has_bounced"]);

const ruleId = () => `r_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
const ruleKind = (field: SegmentField) => (field === "list_id" ? "list" : behaviorSet.has(field) ? "behavior" : "text");
const opsFor = (field: SegmentField) => (ruleKind(field) === "list" ? listOps : ruleKind(field) === "behavior" ? behaviorOps : textOps);
const newRule = (): SegmentRule => ({ id: ruleId(), field: "company", operator: "contains", value: "", lookback_days: "" });
const needsValue = (rule: SegmentRule) => ruleKind(rule.field) === "list" || !["is_empty", "is_not_empty"].includes(rule.operator);

const parseRules = (raw: unknown): SegmentRule[] => {
  if (!Array.isArray(raw)) return [];
  return raw.map((row) => {
    const value = row && typeof row === "object" ? (row as Record<string, unknown>) : {};
    const field = String(value.field || "company") as SegmentField;
    const allowed = opsFor(field);
    const operator = allowed.some((op) => op.value === value.operator) ? (value.operator as SegmentOperator) : allowed[0].value;
    const lookback = Number(value.lookback_days ?? value.lookbackDays);
    return {
      id: ruleId(),
      field,
      operator,
      value: String(value.value || ""),
      lookback_days: Number.isFinite(lookback) && lookback > 0 ? String(Math.floor(lookback)) : "",
    };
  });
};

const serializeRules = (rules: SegmentRule[]) =>
  rules.map((rule) => {
    const out: Record<string, unknown> = { field: rule.field, operator: rule.operator };
    if (needsValue(rule)) out.value = rule.value.trim();
    if (behaviorSet.has(rule.field) && rule.lookback_days.trim()) out.lookback_days = Number(rule.lookback_days);
    return out;
  });

const emptyEditor = (): Editor => ({
  id: null,
  name: "",
  description: "",
  source_list_id: null,
  match_type: "all",
  conditions: [newRule()],
  exclusions: [],
});

const SegmentManager: React.FC = () => {
  const { user } = useAuth();
  const [lists, setLists] = useState<ListItem[]>([]);
  const [segments, setSegments] = useState<SegmentItem[]>([]);
  const [editor, setEditor] = useState<Editor>(emptyEditor);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [estimate, setEstimate] = useState<number | null>(null);
  const [preview, setPreview] = useState<PreviewRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [estimating, setEstimating] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);

  const loadPreview = useCallback(async (segmentId: string) => {
    setPreviewLoading(true);
    try {
      const { data, error } = await db.rpc("fetch_segment_prospects", { p_segment_id: segmentId, p_limit: 20, p_offset: 0 });
      if (error) throw error;
      setPreview((data || []) as PreviewRow[]);
    } catch (error: any) {
      toast({ title: "Preview failed", description: error.message || "Could not load sample.", variant: "destructive" });
      setPreview([]);
    } finally {
      setPreviewLoading(false);
    }
  }, []);

  const toEditor = useCallback((segment: SegmentItem): Editor => {
    const includeRules = parseRules(segment.conditions);
    const excludeRules = parseRules(segment.exclusion_conditions);
    return {
      id: segment.id,
      name: segment.name,
      description: segment.description || "",
      source_list_id: segment.source_list_id || null,
      match_type: segment.match_type === "any" ? "any" : "all",
      conditions: includeRules.length > 0 ? includeRules : [newRule()],
      exclusions: excludeRules,
    };
  }, []);
  const loadData = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const [listResponse, segmentResponse] = await Promise.all([
        db.from("email_lists").select("id, name, email_list_prospects(count)").eq("user_id", user.id).order("created_at", { ascending: false }),
        db.from("contact_segments").select("*").eq("user_id", user.id).order("updated_at", { ascending: false }),
      ]);
      if (listResponse.error) throw listResponse.error;
      if (segmentResponse.error) throw segmentResponse.error;

      const nextLists = (listResponse.data || []).map((row: any) => ({
        id: String(row.id),
        name: String(row.name || "Untitled list"),
        count: Number(row.email_list_prospects?.[0]?.count || 0),
      })) as ListItem[];
      setLists(nextLists);

      const base = (segmentResponse.data || []) as SegmentRecord[];
      const counts = await Promise.all(
        base.map(async (segment) => {
          const { data, error } = await db.rpc("segment_match_count", { p_segment_id: segment.id });
          if (error) return 0;
          return Number(data || 0);
        })
      );
      const nextSegments = base.map((segment, index) => ({ ...segment, matchCount: counts[index] || 0 }));
      setSegments(nextSegments);

      if (selectedId) {
        const selected = nextSegments.find((segment) => segment.id === selectedId);
        if (selected) {
          setEditor(toEditor(selected));
          setEstimate(selected.matchCount);
          await loadPreview(selected.id);
        } else {
          setSelectedId(null);
          setEditor(emptyEditor());
          setEstimate(null);
          setPreview([]);
        }
      }
    } catch (error: any) {
      toast({ title: "Load failed", description: error.message || "Could not load segments.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [loadPreview, selectedId, toEditor, user?.id]);

  useEffect(() => {
    if (user?.id) void loadData();
  }, [loadData, user?.id]);

  const filtered = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return segments;
    return segments.filter((segment) =>
      segment.name.toLowerCase().includes(keyword) || String(segment.description || "").toLowerCase().includes(keyword)
    );
  }, [search, segments]);

  const patchRules = (section: "conditions" | "exclusions", index: number, next: SegmentRule) => {
    setEditor((prev) => {
      const arr = [...prev[section]];
      arr[index] = next;
      return { ...prev, [section]: arr };
    });
  };

  const validateRules = (rules: SegmentRule[], label: string) => {
    rules.forEach((rule, index) => {
      if (needsValue(rule) && !rule.value.trim()) {
        throw new Error(`${label} rule ${index + 1} requires a value.`);
      }
      if (rule.field === "list_id" && rule.value.trim() && !lists.some((list) => list.id === rule.value.trim())) {
        throw new Error(`${label} rule ${index + 1} references a missing list.`);
      }
      if (behaviorSet.has(rule.field) && rule.lookback_days.trim()) {
        const n = Number(rule.lookback_days);
        if (!Number.isFinite(n) || n < 1) {
          throw new Error(`${label} rule ${index + 1} has an invalid lookback.`);
        }
      }
    });
  };

  const estimateSize = async () => {
    try {
      validateRules(editor.conditions, "Include");
      validateRules(editor.exclusions, "Exclude");
    } catch (error: any) {
      toast({ title: "Fix rules", description: error.message, variant: "destructive" });
      return;
    }

    setEstimating(true);
    try {
      const { data, error } = await db.rpc("preview_segment_count", {
        p_source_list_id: editor.source_list_id || null,
        p_match_type: editor.match_type,
        p_conditions: serializeRules(editor.conditions),
        p_exclusion_conditions: serializeRules(editor.exclusions),
      });
      if (error) throw error;
      setEstimate(Number(data || 0));
    } catch (error: any) {
      toast({ title: "Estimate failed", description: error.message || "Could not estimate.", variant: "destructive" });
    } finally {
      setEstimating(false);
    }
  };

  const saveSegment = async () => {
    if (!user?.id) return;
    if (!editor.name.trim()) {
      toast({ title: "Name required", description: "Add a segment name.", variant: "destructive" });
      return;
    }

    try {
      validateRules(editor.conditions, "Include");
      validateRules(editor.exclusions, "Exclude");
    } catch (error: any) {
      toast({ title: "Fix rules", description: error.message, variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const payload = {
        user_id: user.id,
        name: editor.name.trim(),
        description: editor.description.trim() || null,
        source_list_id: editor.source_list_id || null,
        match_type: editor.match_type,
        conditions: serializeRules(editor.conditions),
        exclusion_conditions: serializeRules(editor.exclusions),
      };

      let savedId = editor.id;
      if (editor.id) {
        const { error } = await db.from("contact_segments").update(payload).eq("id", editor.id).eq("user_id", user.id);
        if (error) throw error;
      } else {
        const { data, error } = await db.from("contact_segments").insert(payload).select("id").single();
        if (error) throw error;
        savedId = String(data.id);
      }

      toast({ title: "Segment saved", description: "Available in campaigns and automations." });
      setSelectedId(savedId || null);
      await loadData();
      if (savedId) await loadPreview(savedId);
    } catch (error: any) {
      toast({ title: "Save failed", description: error.message || "Could not save segment.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const deleteSegment = async () => {
    if (!editor.id || !user?.id) return;
    if (!confirm("Delete this segment?")) return;
    setSaving(true);
    try {
      const { error } = await db.from("contact_segments").delete().eq("id", editor.id).eq("user_id", user.id);
      if (error) throw error;
      toast({ title: "Segment deleted" });
      setSelectedId(null);
      setEditor(emptyEditor());
      setEstimate(null);
      setPreview([]);
      await loadData();
    } catch (error: any) {
      toast({ title: "Delete failed", description: error.message || "Could not delete segment.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const selectSegment = async (segmentId: string) => {
    const selected = segments.find((segment) => segment.id === segmentId);
    if (!selected) return;
    setSelectedId(segmentId);
    setEditor(toEditor(selected));
    setEstimate(selected.matchCount);
    await loadPreview(segmentId);
  };

  const sourceLabel = editor.source_list_id ? lists.find((list) => list.id === editor.source_list_id)?.name || "List" : "All contacts";

  const renderRules = (section: "conditions" | "exclusions") => {
    const rules = editor[section];
    return (
      <div className="space-y-2">
        {rules.map((rule, index) => {
          const ops = opsFor(rule.field);
          const kind = ruleKind(rule.field);
          return (
            <div key={rule.id} className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 space-y-2">
              <div className="grid gap-2 lg:grid-cols-[minmax(180px,1fr)_minmax(170px,1fr)_minmax(220px,1fr)_48px]">
                <Select
                  value={rule.field}
                  onValueChange={(value) => {
                    const field = value as SegmentField;
                    patchRules(section, index, { ...rule, field, operator: opsFor(field)[0].value, value: "", lookback_days: "" });
                  }}
                >
                  <SelectTrigger className="h-9 bg-white"><SelectValue /></SelectTrigger>
                  <SelectContent>{fieldOptions.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
                </Select>
                <Select value={rule.operator} onValueChange={(value) => patchRules(section, index, { ...rule, operator: value as SegmentOperator })}>
                  <SelectTrigger className="h-9 bg-white"><SelectValue /></SelectTrigger>
                  <SelectContent>{ops.map((op) => <SelectItem key={op.value} value={op.value}>{op.label}</SelectItem>)}</SelectContent>
                </Select>
                {kind === "list" ? (
                  <Select value={rule.value} onValueChange={(value) => patchRules(section, index, { ...rule, value })}>
                    <SelectTrigger className="h-9 bg-white"><SelectValue placeholder="Select list" /></SelectTrigger>
                    <SelectContent>{lists.map((list) => <SelectItem key={list.id} value={list.id}>{list.name}</SelectItem>)}</SelectContent>
                  </Select>
                ) : needsValue(rule) ? (
                  <Input className="h-9 bg-white" value={rule.value} onChange={(event) => patchRules(section, index, { ...rule, value: event.target.value })} placeholder="Value" />
                ) : (
                  <div className="flex items-center rounded-md border border-dashed border-slate-300 px-3 text-xs text-slate-500">No value needed</div>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setEditor((prev) => {
                    const next = [...prev[section]];
                    next.splice(index, 1);
                    return { ...prev, [section]: section === "conditions" && next.length === 0 ? [newRule()] : next };
                  })}
                  disabled={section === "conditions" && rules.length === 1}
                ><Trash2 className="h-4 w-4" /></Button>
              </div>
              {kind === "behavior" ? (
                <div className="flex items-center gap-2">
                  <Label className="text-xs text-[var(--shell-muted)]">Lookback days</Label>
                  <Input type="number" min={1} className="h-8 w-24 bg-white" value={rule.lookback_days} onChange={(event) => patchRules(section, index, { ...rule, lookback_days: event.target.value })} />
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    );
  };
  return (
    <div className="relative -my-8 min-h-[calc(100vh-4rem)] bg-[var(--shell-bg)] text-[var(--shell-ink)]">
      <div className="relative mx-auto w-full max-w-7xl space-y-6 px-5 py-6 lg:px-8 lg:py-8">
        <div className="rounded-3xl border border-[var(--shell-border)] bg-white/80 p-5 shadow-[0_20px_45px_rgba(15,23,42,0.08)]">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--shell-muted)]">Dynamic Audience Segmentation</p>
              <h1 className="mt-1 text-2xl font-semibold text-[var(--shell-ink)]">Segments</h1>
              <p className="mt-1 text-sm text-[var(--shell-muted)]">Build reusable audiences for campaigns and automation enrollment.</p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => void loadData()} disabled={loading}>
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-2 h-4 w-4" />}Refresh
              </Button>
              <Button onClick={() => { setSelectedId(null); setEditor(emptyEditor()); setEstimate(null); setPreview([]); }}>
                <Plus className="mr-2 h-4 w-4" />New segment
              </Button>
            </div>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
          <Card className="border-[var(--shell-border)] bg-white/80">
            <CardHeader className="space-y-4">
              <div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-[var(--shell-muted)]" /><CardTitle className="text-base">Saved segments</CardTitle></div>
              <div className="relative"><Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search segments" className="pl-9" /></div>
              <CardDescription>{segments.length} segment{segments.length === 1 ? "" : "s"}</CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <ScrollArea className="h-[560px] pr-2">
                <div className="space-y-2">
                  {filtered.map((segment) => (
                    <button
                      type="button"
                      key={segment.id}
                      onClick={() => void selectSegment(segment.id)}
                      className={cn("w-full rounded-xl border p-3 text-left", selectedId === segment.id ? "border-emerald-300 bg-emerald-50/70" : "border-slate-200 bg-white")}
                    >
                      <div className="flex items-center justify-between gap-2"><p className="line-clamp-1 text-sm font-semibold text-[var(--shell-ink)]">{segment.name}</p><Badge variant="outline">{segment.matchCount.toLocaleString()}</Badge></div>
                      <p className="mt-1 line-clamp-2 text-xs text-[var(--shell-muted)]">{segment.description || "No description"}</p>
                      <p className="mt-1 text-[11px] text-[var(--shell-muted)]">Updated {new Date(segment.updated_at).toLocaleString()}</p>
                    </button>
                  ))}
                  {filtered.length === 0 ? <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/70 p-4 text-sm text-slate-500">No segments found.</div> : null}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card className="border-[var(--shell-border)] bg-white/85">
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <CardTitle className="text-xl">{editor.id ? "Edit segment" : "Create segment"}</CardTitle>
                    <CardDescription>Configure include and exclude rules.</CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    {estimate !== null ? <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100"><Users className="mr-1 h-3.5 w-3.5" />{estimate.toLocaleString()} matches</Badge> : null}
                    <Badge variant="outline">{sourceLabel}</Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="space-y-2"><Label>Segment name</Label><Input value={editor.name} onChange={(e) => setEditor((prev) => ({ ...prev, name: e.target.value }))} placeholder="High-intent leaders" /></div>
                  <div className="space-y-2">
                    <Label>Source list (optional)</Label>
                    <Select value={editor.source_list_id || "__all"} onValueChange={(value) => setEditor((prev) => ({ ...prev, source_list_id: value === "__all" ? null : value }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="__all">All contacts</SelectItem>{lists.map((list) => <SelectItem key={list.id} value={list.id}>{list.name} ({list.count.toLocaleString()})</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2"><Label>Description</Label><Textarea value={editor.description} onChange={(e) => setEditor((prev) => ({ ...prev, description: e.target.value }))} className="min-h-[84px]" /></div>
                <div className="space-y-2">
                  <Label>Rule logic</Label>
                  <Select value={editor.match_type} onValueChange={(value) => setEditor((prev) => ({ ...prev, match_type: value as MatchType }))}>
                    <SelectTrigger className="max-w-sm"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="all">All include rules must match (AND)</SelectItem><SelectItem value="any">At least one include rule matches (OR)</SelectItem></SelectContent>
                  </Select>
                </div>

                <Separator />
                <div className="flex items-center justify-between"><Label>Include rules</Label><Button type="button" variant="outline" size="sm" onClick={() => setEditor((prev) => ({ ...prev, conditions: [...prev.conditions, newRule()] }))}><Plus className="mr-1 h-3.5 w-3.5" />Add</Button></div>
                {renderRules("conditions")}

                <Separator />
                <div className="flex items-center justify-between"><Label>Exclude rules</Label><Button type="button" variant="outline" size="sm" onClick={() => setEditor((prev) => ({ ...prev, exclusions: [...prev.exclusions, newRule()] }))}><Plus className="mr-1 h-3.5 w-3.5" />Add</Button></div>
                {renderRules("exclusions")}

                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" variant="outline" onClick={estimateSize} disabled={estimating}>{estimating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Estimate size</Button>
                  <Button type="button" onClick={saveSegment} disabled={saving}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Save segment</Button>
                  {editor.id ? <Button type="button" variant="outline" onClick={deleteSegment} disabled={saving}><Trash2 className="mr-2 h-4 w-4" />Delete</Button> : null}
                </div>
              </CardContent>
            </Card>

            <Card className="border-[var(--shell-border)] bg-white/80">
              <CardHeader><CardTitle className="text-base">Matched contact sample</CardTitle><CardDescription>Top 20 contacts from this saved segment.</CardDescription></CardHeader>
              <CardContent>
                {!editor.id ? (
                  <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/70 p-4 text-sm text-slate-500">Save segment to preview matches.</div>
                ) : previewLoading ? (
                  <div className="flex items-center gap-2 text-sm text-[var(--shell-muted)]"><Loader2 className="h-4 w-4 animate-spin" />Loading sample contacts...</div>
                ) : preview.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/70 p-4 text-sm text-slate-500">No contacts match yet.</div>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <table className="w-full min-w-[680px] text-sm">
                      <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.12em] text-slate-500"><tr><th className="px-3 py-2">Name</th><th className="px-3 py-2">Email</th><th className="px-3 py-2">Company</th><th className="px-3 py-2">Title</th><th className="px-3 py-2">Country</th></tr></thead>
                      <tbody>{preview.map((row) => <tr key={row.prospect_id} className="border-t border-slate-100"><td className="px-3 py-2">{row.full_name || "Unknown"}</td><td className="px-3 py-2 font-mono text-xs">{row.email}</td><td className="px-3 py-2">{row.company || "-"}</td><td className="px-3 py-2">{row.job_title || "-"}</td><td className="px-3 py-2">{row.country || "-"}</td></tr>)}</tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SegmentManager;

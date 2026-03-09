import React from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AlertTriangle, CalendarCheck2, Clock3, MoreHorizontal, Plus, Settings, UserPlus } from "lucide-react";
import type { DbPipeline } from "@/lib/pipelineStore";

interface PipelinePageHeaderProps {
  pipelineId: string;
  pipelines: DbPipeline[];
  onPipelineChange: (id: string) => void;
  onNewOpportunity: () => void;
  onNewPipeline: () => void;
  onOpenSettings: () => void;
  openDeals: number;
  openValue: string;
  winCount: number;
  needsActionCount: number;
  unassignedCount: number;
  staleCount: number;
  meetingCount: number;
  canEdit?: boolean;
}

const PipelinePageHeader: React.FC<PipelinePageHeaderProps> = ({
  pipelineId,
  pipelines,
  onPipelineChange,
  onNewOpportunity,
  onNewPipeline,
  onOpenSettings,
  openDeals,
  openValue,
  winCount,
  needsActionCount,
  unassignedCount,
  staleCount,
  meetingCount,
  canEdit = true,
}) => {
  const activePipeline = pipelines.find((pipeline) => pipeline.id === pipelineId);
  const pipelineCountLabel = `${pipelines.length} pipeline${pipelines.length === 1 ? "" : "s"}`;

  return (
    <div className="relative overflow-hidden rounded-[22px] border border-[var(--shell-border)] bg-[var(--shell-surface-strong)] shadow-[0_14px_34px_rgba(15,23,42,0.08)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_10%_18%,rgba(16,185,129,0.14),transparent_36%),linear-gradient(165deg,rgba(255,255,255,0.98),rgba(248,250,252,0.95)_46%,rgba(255,255,255,0.98))]" />
      <div className="relative p-5 md:p-6">
        <div className="animate-[pipeline-fade-up_520ms_cubic-bezier(0.22,1,0.36,1)_both] flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <section className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Sales pipeline</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <h1
                className="text-[2rem] font-semibold tracking-tight text-[var(--shell-ink)] md:text-[2.3rem]"
                style={{ fontFamily: "var(--shell-font-display)" }}
              >
                {activePipeline?.name || "Pipeline"}
              </h1>
              <Badge
                variant="secondary"
                className="rounded-full border border-[var(--shell-border)] bg-white px-2.5 py-0.5 text-[10px] font-semibold text-[var(--shell-ink)]"
              >
                {pipelineCountLabel}
              </Badge>
              <Badge
                variant="secondary"
                className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500"
              >
                {canEdit ? "Ready to work" : "View only"}
              </Badge>
            </div>
            <p className="mt-2 text-sm text-[var(--shell-muted)]">
              Work the deals that need attention first, then move the rest down the pipeline.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600">
                Open deals: <span className="font-semibold text-[var(--shell-ink)]">{openDeals}</span>
              </span>
              <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600">
                Open value: <span className="font-semibold text-[var(--shell-ink)]">{openValue}</span>
              </span>
              <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600">
                Closed won: <span className="font-semibold text-[var(--shell-ink)]">{winCount}</span>
              </span>
            </div>
          </section>

          <section className="w-full xl:w-auto xl:min-w-[460px]">
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
              <Select value={pipelineId} onValueChange={onPipelineChange} disabled={pipelines.length === 0}>
                <SelectTrigger className="h-11 rounded-xl border-slate-300 bg-white text-slate-700">
                  <SelectValue placeholder="Select pipeline" />
                </SelectTrigger>
                <SelectContent>
                  {pipelines.map((pipeline) => (
                    <SelectItem key={pipeline.id} value={pipeline.id}>
                      {pipeline.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button
                className="h-11 rounded-xl bg-emerald-600 px-4 font-semibold text-white shadow-[0_8px_18px_rgba(5,150,105,0.25)] hover:bg-emerald-500"
                onClick={onNewOpportunity}
                disabled={!canEdit}
              >
                <Plus className="mr-1.5 h-4 w-4" />
                New opportunity
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="h-11 rounded-xl border-slate-300 bg-white px-3 text-slate-700 hover:bg-slate-50">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={onNewPipeline}>
                    <Plus className="mr-2 h-4 w-4" />
                    New pipeline
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={onOpenSettings}>
                    <Settings className="mr-2 h-4 w-4" />
                    Pipeline settings
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </section>
        </div>

        <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-amber-200 bg-[linear-gradient(180deg,rgba(255,251,235,0.95),rgba(255,255,255,0.96))] px-4 py-3">
            <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-700">
              <Clock3 className="h-3.5 w-3.5" />
              Needs follow-up
            </p>
            <p className="mt-2 text-[1.85rem] font-semibold leading-none text-slate-900">{needsActionCount}</p>
            <p className="mt-1 text-xs text-slate-500">Deals missing a next move or sitting too long.</p>
          </div>

          <div className="rounded-2xl border border-sky-200 bg-[linear-gradient(180deg,rgba(240,249,255,0.95),rgba(255,255,255,0.96))] px-4 py-3">
            <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-sky-700">
              <UserPlus className="h-3.5 w-3.5" />
              Unassigned
            </p>
            <p className="mt-2 text-[1.85rem] font-semibold leading-none text-slate-900">{unassignedCount}</p>
            <p className="mt-1 text-xs text-slate-500">Deals without an owner yet.</p>
          </div>

          <div className="rounded-2xl border border-orange-200 bg-[linear-gradient(180deg,rgba(255,247,237,0.95),rgba(255,255,255,0.96))] px-4 py-3">
            <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-orange-700">
              <AlertTriangle className="h-3.5 w-3.5" />
              Stale deals
            </p>
            <p className="mt-2 text-[1.85rem] font-semibold leading-none text-slate-900">{staleCount}</p>
            <p className="mt-1 text-xs text-slate-500">No activity within the stale window.</p>
          </div>

          <div className="rounded-2xl border border-emerald-200 bg-[linear-gradient(180deg,rgba(236,253,245,0.95),rgba(255,255,255,0.96))] px-4 py-3">
            <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-700">
              <CalendarCheck2 className="h-3.5 w-3.5" />
              Meetings booked
            </p>
            <p className="mt-2 text-[1.85rem] font-semibold leading-none text-slate-900">{meetingCount}</p>
            <p className="mt-1 text-xs text-slate-500">Discovery calls and demos already moving.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PipelinePageHeader;

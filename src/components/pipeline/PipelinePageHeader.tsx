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
import { MoreHorizontal, Plus, Settings } from "lucide-react";
import type { DbPipeline } from "@/lib/pipelineStore";

interface PipelinePageHeaderProps {
  pipelineId: string;
  pipelines: DbPipeline[];
  onPipelineChange: (id: string) => void;
  onNewOpportunity: () => void;
  onNewPipeline: () => void;
  onOpenSettings: () => void;
  canEdit?: boolean;
}

const PipelinePageHeader: React.FC<PipelinePageHeaderProps> = ({
  pipelineId,
  pipelines,
  onPipelineChange,
  onNewOpportunity,
  onNewPipeline,
  onOpenSettings,
  canEdit = true,
}) => {
  const activePipeline = pipelines.find((pipeline) => pipeline.id === pipelineId);
  const pipelineCountLabel = `${pipelines.length} pipeline${pipelines.length === 1 ? "" : "s"}`;

  return (
    <div className="relative overflow-hidden rounded-[30px] border border-[var(--shell-border)] bg-[var(--shell-surface-strong)] shadow-[0_22px_48px_rgba(15,23,42,0.12)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_9%_12%,rgba(16,185,129,0.18),transparent_34%),linear-gradient(155deg,rgba(255,255,255,0.96),rgba(248,250,252,0.92)_48%,rgba(255,255,255,0.96))]" />
      <div className="pointer-events-none absolute inset-0 opacity-40 [background-image:linear-gradient(135deg,rgba(148,163,184,0.14)_1px,transparent_1px)] [background-size:26px_26px]" />

      <div className="relative grid xl:grid-cols-[minmax(0,1fr)_420px]">
        <section className="relative p-6 md:p-8 xl:pr-10">
          <div className="pointer-events-none absolute bottom-8 left-0 top-8 hidden w-1.5 rounded-r-full bg-gradient-to-b from-emerald-500 via-teal-500 to-amber-400 xl:block" />

          <div className="animate-[pipeline-fade-up_500ms_cubic-bezier(0.22,1,0.36,1)_both] space-y-5">
            <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-slate-500">
              <span>Workspace</span>
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300/80 bg-emerald-50 px-2.5 py-1 text-[10px] text-emerald-700">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                Live
              </span>
              <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">{pipelineCountLabel}</span>
            </div>

            <div>
              <div className="flex flex-wrap items-center gap-3">
                <h1
                  className="text-4xl font-semibold tracking-tight text-[var(--shell-ink)] md:text-5xl"
                  style={{ fontFamily: "var(--shell-font-display)" }}
                >
                  Pipeline
                </h1>
                {activePipeline && (
                  <Badge
                    variant="secondary"
                    className="rounded-full border border-[var(--shell-border)] bg-white/85 px-3 py-1 text-[11px] font-semibold text-[var(--shell-ink)]"
                  >
                    {activePipeline.name}
                  </Badge>
                )}
              </div>
              <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-[var(--shell-muted)]">
                Turn replies into qualified opportunities and keep next steps moving.
              </p>
            </div>

            <div className="flex flex-wrap gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              <span className="rounded-full border border-[var(--shell-border)] bg-white/85 px-3 py-1.5">Conversion focused</span>
              <span className="rounded-full border border-[var(--shell-border)] bg-white/85 px-3 py-1.5">
                {canEdit ? "Editing enabled" : "View only"}
              </span>
            </div>
          </div>
        </section>

        <section className="relative overflow-hidden border-t border-white/20 bg-[linear-gradient(160deg,#0f766e_0%,#0f766e_35%,#115e59_100%)] p-5 text-emerald-50 xl:border-l xl:border-t-0 md:p-6">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_82%_14%,rgba(255,255,255,0.2),transparent_36%),linear-gradient(180deg,transparent,rgba(6,78,59,0.24))]" />
          <div className="relative animate-[pipeline-fade-up_660ms_cubic-bezier(0.22,1,0.36,1)_both] space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-100/90">Active pipeline</p>
              <span className="rounded-full border border-emerald-100/40 bg-white/15 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/90">
                {canEdit ? "Ready to update" : "Read only"}
              </span>
            </div>

            <p className="text-lg font-semibold leading-tight text-white">{activePipeline?.name || "Select pipeline"}</p>

            <Select value={pipelineId} onValueChange={onPipelineChange} disabled={pipelines.length === 0}>
              <SelectTrigger className="h-11 rounded-xl border-emerald-100/40 bg-white/92 text-slate-700">
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

            <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
              <Button
                className="h-11 rounded-xl bg-white px-5 font-semibold text-teal-800 shadow-[0_10px_24px_rgba(15,23,42,0.22)] hover:bg-emerald-50"
                onClick={onNewOpportunity}
                disabled={!canEdit}
              >
                <Plus className="mr-2 h-4 w-4" />
                New opportunity
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="h-11 rounded-xl border-emerald-100/40 bg-white/15 px-3 text-white hover:bg-white/25">
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
          </div>
        </section>
      </div>
    </div>
  );
};

export default PipelinePageHeader;

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

  return (
    <div className="relative overflow-hidden rounded-3xl border border-[var(--shell-border)] bg-gradient-to-br from-white via-white to-emerald-50/40 p-5 shadow-[0_14px_30px_rgba(15,23,42,0.08)] md:p-6">
      <div className="pointer-events-none absolute -right-14 -top-14 h-44 w-44 rounded-full bg-emerald-200/35 blur-3xl" />
      <div className="relative flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.24em] text-slate-400">
            <span>Workspace</span>
            <span className="flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] text-emerald-700">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Live
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-semibold tracking-tight text-[var(--shell-ink)]">Pipeline</h1>
            {activePipeline && (
              <Badge variant="secondary" className="border border-emerald-200 bg-emerald-50 text-emerald-700">
                {activePipeline.name}
              </Badge>
            )}
          </div>
          <p className="max-w-2xl text-sm text-[var(--shell-muted)]">
            Turn replies into qualified opportunities and keep next steps moving.
          </p>
        </div>

        <div className="w-full max-w-[560px] rounded-2xl border border-[var(--shell-border)] bg-white/90 p-3 backdrop-blur-sm sm:p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            Active pipeline
          </p>
          <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
            <Select value={pipelineId} onValueChange={onPipelineChange} disabled={pipelines.length === 0}>
              <SelectTrigger className="h-10 w-full border-[var(--shell-border)] bg-white">
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
              className="h-10 bg-emerald-600 px-4 hover:bg-emerald-700"
              onClick={onNewOpportunity}
              disabled={!canEdit}
            >
              <Plus className="mr-2 h-4 w-4" />
              New opportunity
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="h-10 border-[var(--shell-border)] bg-white px-3">
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
      </div>
    </div>
  );
};

export default PipelinePageHeader;

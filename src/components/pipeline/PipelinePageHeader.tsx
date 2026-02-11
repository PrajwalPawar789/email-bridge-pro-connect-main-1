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
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.24em] text-slate-400">
          <span>Workspace</span>
          <span className="flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] text-emerald-700">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Live
          </span>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-semibold text-[var(--shell-ink)]">Pipeline</h1>
          {activePipeline && (
            <Badge variant="secondary" className="bg-emerald-50 text-emerald-700">
              {activePipeline.name}
            </Badge>
          )}
        </div>
        <p className="mt-1 text-sm text-[var(--shell-muted)]">
          Turn replies into qualified opportunities and keep next steps moving.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={pipelineId} onValueChange={onPipelineChange} disabled={pipelines.length === 0}>
          <SelectTrigger className="h-9 w-[240px] bg-white/80 border-[var(--shell-border)]">
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
          className="bg-emerald-600 hover:bg-emerald-700"
          onClick={onNewOpportunity}
          disabled={!canEdit}
        >
          <Plus className="h-4 w-4 mr-2" />
          New opportunity
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="border-[var(--shell-border)] bg-white/80">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={onNewPipeline}>
              <Plus className="h-4 w-4 mr-2" />
              New pipeline
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onOpenSettings}>
              <Settings className="h-4 w-4 mr-2" />
              Pipeline settings
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
};

export default PipelinePageHeader;

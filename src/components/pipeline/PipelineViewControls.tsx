import React from "react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LayoutList, LayoutPanelLeft, PieChart, SlidersHorizontal } from "lucide-react";

export type ViewMode = "board" | "list" | "analytics";
export type DensityMode = "compact" | "comfortable";
export type SwimlaneMode = "none" | "owner" | "campaign";

interface PipelineViewControlsProps {
  viewMode: ViewMode;
  onViewModeChange: (value: ViewMode) => void;
  density: DensityMode;
  onDensityChange: (value: DensityMode) => void;
  activeStagesOnly: boolean;
  onActiveStagesOnlyChange: (value: boolean) => void;
  swimlane: SwimlaneMode;
  onSwimlaneChange: (value: SwimlaneMode) => void;
  collapsedCount: number;
  onCollapseAll: () => void;
  onExpandAll: () => void;
}

const PipelineViewControls: React.FC<PipelineViewControlsProps> = ({
  viewMode,
  onViewModeChange,
  density,
  onDensityChange,
  activeStagesOnly,
  onActiveStagesOnlyChange,
  swimlane,
  onSwimlaneChange,
  collapsedCount,
  onCollapseAll,
  onExpandAll,
}) => {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <ToggleGroup
          type="single"
          value={viewMode}
          onValueChange={(value) => value && onViewModeChange(value as ViewMode)}
          className="rounded-full border border-slate-200 bg-white px-1"
        >
          <ToggleGroupItem value="board" aria-label="Board view">
            <LayoutPanelLeft className="h-4 w-4" />
          </ToggleGroupItem>
          <ToggleGroupItem value="list" aria-label="List view">
            <LayoutList className="h-4 w-4" />
          </ToggleGroupItem>
          <ToggleGroupItem value="analytics" aria-label="Analytics view">
            <PieChart className="h-4 w-4" />
          </ToggleGroupItem>
        </ToggleGroup>

        <ToggleGroup
          type="single"
          value={density}
          onValueChange={(value) => value && onDensityChange(value as DensityMode)}
          className="rounded-full border border-slate-200 bg-white px-1"
        >
          <ToggleGroupItem value="compact" aria-label="Compact density">
            Compact
          </ToggleGroupItem>
          <ToggleGroupItem value="comfortable" aria-label="Comfortable density">
            Comfortable
          </ToggleGroupItem>
        </ToggleGroup>

        <Select value={swimlane} onValueChange={(value) => onSwimlaneChange(value as SwimlaneMode)}>
          <SelectTrigger className="h-9 w-[160px] bg-white/80 border-slate-200">
            <SelectValue placeholder="Swimlanes" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No swimlanes</SelectItem>
            <SelectItem value="owner">By owner</SelectItem>
            <SelectItem value="campaign">By campaign</SelectItem>
          </SelectContent>
        </Select>

        <Button
          variant={activeStagesOnly ? "secondary" : "outline"}
          className="h-9 border-slate-200"
          onClick={() => onActiveStagesOnlyChange(!activeStagesOnly)}
        >
          <SlidersHorizontal className="h-4 w-4 mr-2" />
          {activeStagesOnly ? "Active stages" : "All stages"}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="text-[10px] text-slate-500">
          {collapsedCount} collapsed
        </Badge>
        <Button variant="ghost" size="sm" onClick={onExpandAll}>
          Expand all
        </Button>
        <Button variant="ghost" size="sm" onClick={onCollapseAll}>
          Collapse all
        </Button>
      </div>
    </div>
  );
};

export default PipelineViewControls;

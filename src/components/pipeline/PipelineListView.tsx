import React from "react";
import { FixedSizeList as List } from "react-window";
import { useMeasure } from "@/hooks/useMeasure";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { formatDistanceToNow } from "date-fns";
import type { PipelineOpportunity, PipelineStage } from "@/lib/pipeline";
import { formatCurrency } from "@/lib/pipeline";

interface PipelineListViewProps {
  opportunities: PipelineOpportunity[];
  stages: PipelineStage[];
  density: "compact" | "comfortable";
  selectedIds: Set<string>;
  onToggleSelect: (id: string, checked: boolean) => void;
  onSelectOpportunity: (opportunity: PipelineOpportunity) => void;
}

const rowHeights = {
  compact: 56,
  comfortable: 72,
};

const PipelineListView: React.FC<PipelineListViewProps> = ({
  opportunities,
  stages,
  density,
  selectedIds,
  onToggleSelect,
  onSelectOpportunity,
}) => {
  const { ref, bounds } = useMeasure<HTMLDivElement>();
  const stageLookup = React.useMemo(() => {
    const map = new Map<string, string>();
    stages.forEach((stage) => map.set(stage.id, stage.name));
    return map;
  }, [stages]);

  const Row = ({ index, style }: { index: number; style: React.CSSProperties }) => {
    const opportunity = opportunities[index];
    const selected = selectedIds.has(opportunity.id);

    return (
      <div style={style} className="px-3">
        <div
          className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm"
          role="listitem"
          aria-selected={selected}
        >
          <Checkbox
            checked={selected}
            onCheckedChange={(value) => onToggleSelect(opportunity.id, value === true)}
            aria-label={`Select ${opportunity.contactName}`}
          />
          <button
            type="button"
            className="flex-1 text-left"
            onClick={() => onSelectOpportunity(opportunity)}
          >
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-slate-900">{opportunity.contactName}</p>
                <p className="text-xs text-slate-500">{opportunity.company || opportunity.email}</p>
              </div>
              <div className="flex items-center gap-2">
                {typeof opportunity.value === "number" && (
                  <Badge variant="outline" className="text-[10px]">
                    {formatCurrency(opportunity.value)}
                  </Badge>
                )}
                <Badge variant="secondary" className="text-[10px]">
                  {stageLookup.get(opportunity.stageId) || "Stage"}
                </Badge>
              </div>
            </div>
            <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500">
              <span>{opportunity.owner || "Unassigned"}</span>
              <span>{formatDistanceToNow(new Date(opportunity.lastActivityAt), { addSuffix: true })}</span>
            </div>
          </button>
        </div>
      </div>
    );
  };

  return (
    <div ref={ref} className="h-full min-h-[420px]" role="list">
      <div className="mb-2 grid grid-cols-[24px_2fr_1fr_1fr] gap-3 px-4 text-xs font-semibold uppercase tracking-wide text-slate-400">
        <span />
        <span>Opportunity</span>
        <span>Value</span>
        <span>Last activity</span>
      </div>
      <List
        height={Math.max(bounds.height - 40, 240)}
        width={Math.max(bounds.width, 1)}
        itemCount={opportunities.length}
        itemSize={rowHeights[density]}
        itemData={opportunities}
      >
        {Row}
      </List>
    </div>
  );
};

export default PipelineListView;

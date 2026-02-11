import React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Filter, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type PipelineFilters = {
  search: string;
  stage: string;
  owner: string;
  campaign: string;
  staleOnly: boolean;
  valueMin?: string;
  valueMax?: string;
  dateFrom?: string;
  dateTo?: string;
};

export type SavedView = {
  id: string;
  name: string;
  filters: PipelineFilters;
};

interface PipelineFilterBarProps {
  filters: PipelineFilters;
  onFiltersChange: (next: PipelineFilters) => void;
  stages: Array<{ id: string; name: string }>;
  owners: string[];
  campaigns: string[];
  savedViews: SavedView[];
  activeViewId?: string | null;
  onSelectView: (viewId: string) => void;
  onSaveView: () => void;
  onClearFilters: () => void;
  searchRef?: React.RefObject<HTMLInputElement>;
}

const PipelineFilterBar: React.FC<PipelineFilterBarProps> = ({
  filters,
  onFiltersChange,
  stages,
  owners,
  campaigns,
  savedViews,
  activeViewId,
  onSelectView,
  onSaveView,
  onClearFilters,
  searchRef,
}) => {
  const chips: Array<{ label: string; onRemove: () => void }> = [];

  if (filters.stage !== "all") {
    chips.push({
      label: `Stage: ${stages.find((stage) => stage.id === filters.stage)?.name || filters.stage}`,
      onRemove: () => onFiltersChange({ ...filters, stage: "all" }),
    });
  }
  if (filters.owner !== "all") {
    chips.push({
      label: `Owner: ${filters.owner}`,
      onRemove: () => onFiltersChange({ ...filters, owner: "all" }),
    });
  }
  if (filters.campaign !== "all") {
    chips.push({
      label: `Campaign: ${filters.campaign}`,
      onRemove: () => onFiltersChange({ ...filters, campaign: "all" }),
    });
  }
  if (filters.staleOnly) {
    chips.push({
      label: "Stale only",
      onRemove: () => onFiltersChange({ ...filters, staleOnly: false }),
    });
  }
  if (filters.valueMin || filters.valueMax) {
    chips.push({
      label: `Value: ${filters.valueMin || "0"} – ${filters.valueMax || "8"}`,
      onRemove: () => onFiltersChange({ ...filters, valueMin: "", valueMax: "" }),
    });
  }
  if (filters.dateFrom || filters.dateTo) {
    chips.push({
      label: `Date: ${filters.dateFrom || "Any"} ? ${filters.dateTo || "Any"}`,
      onRemove: () => onFiltersChange({ ...filters, dateFrom: "", dateTo: "" }),
    });
  }

  return (
    <div className="rounded-3xl border border-[var(--shell-border)] bg-[var(--shell-surface-strong)]/90 p-5 shadow-[0_12px_24px_rgba(15,23,42,0.08)]">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
            <Input
              ref={searchRef}
              placeholder="Search name, company, or email"
              className="pl-9 bg-white/80 border-[var(--shell-border)]"
              value={filters.search}
              onChange={(event) => onFiltersChange({ ...filters, search: event.target.value })}
            />
          </div>

          <Select value={activeViewId || "none"} onValueChange={onSelectView}>
            <SelectTrigger className="h-9 w-[200px] bg-white/80 border-[var(--shell-border)]">
              <SelectValue placeholder="Saved views" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Saved views</SelectItem>
              {savedViews.map((view) => (
                <SelectItem key={view.id} value={view.id}>
                  {view.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button variant="outline" className="h-9 border-[var(--shell-border)]" onClick={onSaveView}>
            Save view
          </Button>

          <Badge variant="outline" className="ml-auto text-[10px] text-slate-500">
            {filters.search ? "Searching" : "Ready"}
          </Badge>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Select value={filters.stage} onValueChange={(value) => onFiltersChange({ ...filters, stage: value })}>
            <SelectTrigger className="h-9 w-[200px] bg-white/80 border-[var(--shell-border)]">
              <SelectValue placeholder="All stages" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All stages</SelectItem>
              {stages.map((stage) => (
                <SelectItem key={stage.id} value={stage.id}>{stage.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filters.owner} onValueChange={(value) => onFiltersChange({ ...filters, owner: value })}>
            <SelectTrigger className="h-9 w-[180px] bg-white/80 border-[var(--shell-border)]">
              <SelectValue placeholder="All owners" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All owners</SelectItem>
              {owners.map((owner) => (
                <SelectItem key={owner} value={owner}>{owner}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filters.campaign} onValueChange={(value) => onFiltersChange({ ...filters, campaign: value })}>
            <SelectTrigger className="h-9 w-[200px] bg-white/80 border-[var(--shell-border)]">
              <SelectValue placeholder="All campaigns" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All campaigns</SelectItem>
              {campaigns.map((campaign) => (
                <SelectItem key={campaign} value={campaign}>{campaign}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant={filters.staleOnly ? "secondary" : "outline"}
            className="h-9 border-[var(--shell-border)] bg-white/80"
            onClick={() => onFiltersChange({ ...filters, staleOnly: !filters.staleOnly })}
          >
            <Filter className="h-4 w-4 mr-2" />
            {filters.staleOnly ? "Showing stale" : "Stale only"}
          </Button>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="h-9 border-[var(--shell-border)]">
                Advanced filters
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80" align="start">
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-2">
                    <Label className="text-xs text-slate-500">Value min</Label>
                    <Input
                      value={filters.valueMin || ""}
                      onChange={(event) => onFiltersChange({ ...filters, valueMin: event.target.value })}
                      placeholder="0"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-slate-500">Value max</Label>
                    <Input
                      value={filters.valueMax || ""}
                      onChange={(event) => onFiltersChange({ ...filters, valueMax: event.target.value })}
                      placeholder="100000"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-2">
                    <Label className="text-xs text-slate-500">From date</Label>
                    <Input
                      type="date"
                      value={filters.dateFrom || ""}
                      onChange={(event) => onFiltersChange({ ...filters, dateFrom: event.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-slate-500">To date</Label>
                    <Input
                      type="date"
                      value={filters.dateTo || ""}
                      onChange={(event) => onFiltersChange({ ...filters, dateTo: event.target.value })}
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-slate-500">Only stale</Label>
                  <Switch
                    checked={filters.staleOnly}
                    onCheckedChange={(value) => onFiltersChange({ ...filters, staleOnly: value })}
                  />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <Button variant="ghost" size="sm" onClick={onClearFilters}>
                    Reset
                  </Button>
                  <Button size="sm">Apply</Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>

          <Button variant="ghost" className="h-9 text-xs text-slate-500" onClick={onClearFilters}>
            Clear filters
          </Button>
        </div>

        {chips.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {chips.map((chip) => (
              <Badge key={chip.label} variant="secondary" className="gap-1 rounded-full px-3">
                {chip.label}
                <button
                  type="button"
                  onClick={chip.onRemove}
                  className="rounded-full p-0.5 hover:bg-slate-200"
                  aria-label={`Remove ${chip.label}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default PipelineFilterBar;

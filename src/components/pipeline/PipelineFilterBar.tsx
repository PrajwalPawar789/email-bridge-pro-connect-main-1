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
      label: `Value: ${filters.valueMin || "0"} - ${filters.valueMax || "8"}`,
      onRemove: () => onFiltersChange({ ...filters, valueMin: "", valueMax: "" }),
    });
  }
  if (filters.dateFrom || filters.dateTo) {
    chips.push({
      label: `Date: ${filters.dateFrom || "Any"} to ${filters.dateTo || "Any"}`,
      onRemove: () => onFiltersChange({ ...filters, dateFrom: "", dateTo: "" }),
    });
  }

  const hasSearch = filters.search.trim().length > 0;
  const activeCount = chips.length + (hasSearch ? 1 : 0);

  return (
    <div className="rounded-3xl border border-[var(--shell-border)] bg-[var(--shell-surface-strong)]/95 p-4 shadow-[0_12px_24px_rgba(15,23,42,0.08)] md:p-5">
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Filters</p>
            <p className="mt-1 text-sm text-[var(--shell-muted)]">
              Narrow your pipeline with saved views and quick filters.
            </p>
          </div>
          <Badge
            variant="outline"
            className={cn(
              "text-[10px]",
              activeCount > 0 ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "text-slate-500"
            )}
          >
            {activeCount > 0 ? `${activeCount} active` : "Ready"}
          </Badge>
        </div>

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_auto]">
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
            <Input
              ref={searchRef}
              placeholder="Search name, company, or email"
              className="h-10 border-[var(--shell-border)] bg-white pl-9"
              value={filters.search}
              onChange={(event) => onFiltersChange({ ...filters, search: event.target.value })}
            />
          </div>

          <Select value={activeViewId || "none"} onValueChange={onSelectView}>
            <SelectTrigger className="h-10 w-full border-[var(--shell-border)] bg-white">
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

          <div className="flex items-center gap-2 lg:justify-end">
            <Button variant="outline" className="h-10 border-[var(--shell-border)]" onClick={onSaveView}>
              Save view
            </Button>
            <Button
              variant="ghost"
              className="h-10 text-xs text-slate-500"
              onClick={onClearFilters}
              disabled={activeCount === 0}
            >
              Clear filters
            </Button>
          </div>
        </div>

        <div className="h-px bg-[var(--shell-border)]/80" />

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto_auto]">
          <Select value={filters.stage} onValueChange={(value) => onFiltersChange({ ...filters, stage: value })}>
            <SelectTrigger className="h-10 w-full border-[var(--shell-border)] bg-white">
              <SelectValue placeholder="All stages" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All stages</SelectItem>
              {stages.map((stage) => (
                <SelectItem key={stage.id} value={stage.id}>
                  {stage.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filters.owner} onValueChange={(value) => onFiltersChange({ ...filters, owner: value })}>
            <SelectTrigger className="h-10 w-full border-[var(--shell-border)] bg-white">
              <SelectValue placeholder="All owners" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All owners</SelectItem>
              {owners.map((owner) => (
                <SelectItem key={owner} value={owner}>
                  {owner}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filters.campaign} onValueChange={(value) => onFiltersChange({ ...filters, campaign: value })}>
            <SelectTrigger className="h-10 w-full border-[var(--shell-border)] bg-white">
              <SelectValue placeholder="All campaigns" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All campaigns</SelectItem>
              {campaigns.map((campaign) => (
                <SelectItem key={campaign} value={campaign}>
                  {campaign}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant={filters.staleOnly ? "secondary" : "outline"}
            className="h-10 border-[var(--shell-border)] bg-white px-4"
            onClick={() => onFiltersChange({ ...filters, staleOnly: !filters.staleOnly })}
          >
            <Filter className="mr-2 h-4 w-4" />
            {filters.staleOnly ? "Showing stale" : "Stale only"}
          </Button>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="h-10 border-[var(--shell-border)] px-4">
                Advanced filters
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[340px]" align="end">
              <div className="space-y-4">
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
                <div className="flex items-center justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={onClearFilters}>
                    Reset
                  </Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {chips.length > 0 && (
          <div className="flex flex-wrap gap-2 border-t border-dashed border-[var(--shell-border)] pt-4">
            {chips.map((chip) => (
              <Badge key={chip.label} variant="secondary" className="gap-1 rounded-full border border-slate-200 px-3 py-1">
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

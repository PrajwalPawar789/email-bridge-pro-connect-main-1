import React, { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import {
  CalendarClock,
  ChevronDown,
  ChevronRight,
  MoreHorizontal,
  Plus,
  UserPlus,
  ArrowRight,
} from 'lucide-react';
import {
  PipelineOpportunity,
  PipelineStage,
  formatCurrency,
  isOpportunityStale,
} from '@/lib/pipeline';

const toneClasses: Record<PipelineStage['tone'], string> = {
  emerald: 'border-emerald-200 text-emerald-700 bg-emerald-50',
  amber: 'border-amber-200 text-amber-700 bg-amber-50',
  sky: 'border-sky-200 text-sky-700 bg-sky-50',
  violet: 'border-violet-200 text-violet-700 bg-violet-50',
  slate: 'border-slate-200 text-slate-600 bg-slate-50',
  rose: 'border-rose-200 text-rose-700 bg-rose-50',
};

const statusClasses: Record<PipelineOpportunity['status'], string> = {
  open: 'border-slate-200 text-slate-600 bg-white',
  won: 'border-emerald-200 text-emerald-700 bg-emerald-50',
  lost: 'border-rose-200 text-rose-700 bg-rose-50',
};

interface PipelineBoardProps {
  stages: PipelineStage[];
  opportunities: PipelineOpportunity[];
  emptyLabel?: string;
  showStageDescriptions?: boolean;
  density?: 'compact' | 'comfortable';
  collapsedStageIds?: string[];
  onToggleCollapse?: (stageId: string) => void;
  onAddOpportunity?: (stageId: string) => void;
  onSelectOpportunity?: (opportunity: PipelineOpportunity) => void;
  focusedOpportunityId?: string | null;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string, checked: boolean) => void;
  onQuickAction?: (action: 'assign' | 'next' | 'schedule' | 'open', opportunity: PipelineOpportunity) => void;
  onMoveOpportunity?: (opportunityId: string, stageId: string) => void;
  onRemoveOpportunity?: (opportunity: PipelineOpportunity) => void;
}

const PipelineBoard = ({
  stages,
  opportunities,
  emptyLabel = 'No opportunities yet.',
  showStageDescriptions = true,
  density = 'comfortable',
  collapsedStageIds = [],
  onToggleCollapse,
  onAddOpportunity,
  onSelectOpportunity,
  focusedOpportunityId,
  selectedIds,
  onToggleSelect,
  onQuickAction,
  onMoveOpportunity,
  onRemoveOpportunity,
}: PipelineBoardProps) => {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverStageId, setDragOverStageId] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<PipelineOpportunity | null>(null);
  const canDrag = typeof onMoveOpportunity === 'function';
  const canRemove = typeof onRemoveOpportunity === 'function';

  const stageBuckets = useMemo(() => {
    const map = new Map<string, PipelineOpportunity[]>();
    stages.forEach((stage) => map.set(stage.id, []));
    opportunities.forEach((opportunity) => {
      const bucket = map.get(opportunity.stageId);
      if (bucket) bucket.push(opportunity);
    });
    return map;
  }, [opportunities, stages]);

  const removeLabel = removeTarget?.contactName || removeTarget?.email || 'this opportunity';

  return (
    <div className="w-full min-w-0 overflow-hidden rounded-2xl border border-[var(--shell-border)] bg-[var(--shell-surface-strong)]/90 p-4 shadow-[0_16px_32px_rgba(15,23,42,0.08)]">
      {opportunities.length === 0 && (
        <div className="rounded-xl border border-dashed border-[var(--shell-border)] bg-white/70 px-4 py-6 text-center text-sm text-[var(--shell-muted)]">
          {emptyLabel}
        </div>
      )}
      <div className="mt-4 flex w-full min-w-0 gap-4 overflow-x-auto pb-4" role="list">
        {stages.map((stage) => {
          const items = stageBuckets.get(stage.id) || [];
          const value = items.reduce((sum, opp) => sum + (opp.value || 0), 0);
          const collapsed = collapsedStageIds.includes(stage.id);
          return (
            <PipelineColumn
              key={stage.id}
              stage={stage}
              items={items}
              value={value}
              collapsed={collapsed}
              density={density}
              showStageDescriptions={showStageDescriptions}
              canDrag={canDrag}
              draggingId={draggingId}
              dragOverStageId={dragOverStageId}
              onDragOverStage={() => setDragOverStageId(stage.id)}
              onDragLeaveStage={() => setDragOverStageId((prev) => (prev === stage.id ? null : prev))}
              onDropOpportunity={(id) => {
                setDragOverStageId(null);
                setDraggingId(null);
                if (!id) return;
                onMoveOpportunity?.(id, stage.id);
              }}
              onStartDrag={(id) => setDraggingId(id)}
              onEndDrag={() => {
                setDraggingId(null);
                setDragOverStageId(null);
              }}
              onToggleCollapse={() => onToggleCollapse?.(stage.id)}
              onAddOpportunity={() => onAddOpportunity?.(stage.id)}
              onSelectOpportunity={onSelectOpportunity}
              focusedOpportunityId={focusedOpportunityId}
              selectedIds={selectedIds}
              onToggleSelect={onToggleSelect}
              onQuickAction={onQuickAction}
              onRemoveOpportunity={canRemove ? (opp) => setRemoveTarget(opp) : undefined}
            />
          );
        })}
      </div>

      <AlertDialog
        open={!!removeTarget}
        onOpenChange={(open) => {
          if (!open) setRemoveTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove opportunity?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove {removeLabel} from the pipeline. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-600 text-white hover:bg-rose-700"
              onClick={() => {
                if (removeTarget) {
                  onRemoveOpportunity?.(removeTarget);
                }
                setRemoveTarget(null);
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

const PipelineColumn = ({
  stage,
  items,
  value,
  collapsed,
  density,
  showStageDescriptions,
  canDrag,
  draggingId,
  dragOverStageId,
  onDragOverStage,
  onDragLeaveStage,
  onDropOpportunity,
  onStartDrag,
  onEndDrag,
  onToggleCollapse,
  onAddOpportunity,
  onSelectOpportunity,
  focusedOpportunityId,
  selectedIds,
  onToggleSelect,
  onQuickAction,
  onRemoveOpportunity,
}: {
  stage: PipelineStage;
  items: PipelineOpportunity[];
  value: number;
  collapsed: boolean;
  density: 'compact' | 'comfortable';
  showStageDescriptions: boolean;
  canDrag: boolean;
  draggingId: string | null;
  dragOverStageId: string | null;
  onDragOverStage: () => void;
  onDragLeaveStage: () => void;
  onDropOpportunity: (id: string) => void;
  onStartDrag: (id: string) => void;
  onEndDrag: () => void;
  onToggleCollapse?: () => void;
  onAddOpportunity?: () => void;
  onSelectOpportunity?: (opportunity: PipelineOpportunity) => void;
  focusedOpportunityId?: string | null;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string, checked: boolean) => void;
  onQuickAction?: (action: 'assign' | 'next' | 'schedule' | 'open', opportunity: PipelineOpportunity) => void;
  onRemoveOpportunity?: (opportunity: PipelineOpportunity) => void;
}) => {
  return (
    <div
      className="min-w-[280px] max-w-[340px] flex-1"
      onDragOver={canDrag ? (event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
      } : undefined}
      onDragEnter={canDrag ? onDragOverStage : undefined}
      onDragLeave={canDrag ? onDragLeaveStage : undefined}
      onDrop={canDrag ? (event) => {
        event.preventDefault();
        const opportunityId = event.dataTransfer.getData('text/plain');
        onDropOpportunity(opportunityId);
      } : undefined}
    >
      <div className={cn(
        "rounded-2xl border border-[var(--shell-border)] bg-white/95 p-3 shadow-sm transition",
        dragOverStageId === stage.id && "ring-2 ring-emerald-300 bg-emerald-50/50"
      )}>
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <div className={cn("h-2 w-2 rounded-full border", toneClasses[stage.tone])}></div>
              <h3 className="text-sm font-semibold text-[var(--shell-ink)]">{stage.name}</h3>
            </div>
            {showStageDescriptions && (
              <p className="mt-1 text-xs text-[var(--shell-muted)]">{stage.description}</p>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Badge variant="outline" className="text-[10px]">
              {items.length}
            </Badge>
            <Badge variant="secondary" className="text-[10px]">
              {formatCurrency(value)}
            </Badge>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={onAddOpportunity} className="h-7 gap-1">
            <Plus className="h-3 w-3" />
            Add
          </Button>
          <Button variant="ghost" size="sm" onClick={onToggleCollapse} className="h-7 gap-1">
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            {collapsed ? 'Expand' : 'Collapse'}
          </Button>
        </div>
      </div>

      {collapsed ? (
        <div className="mt-3 rounded-xl border border-dashed border-slate-200 bg-white/80 px-3 py-4 text-xs text-slate-500">
          Column collapsed
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          {items.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-white/80 px-3 py-4 text-xs text-slate-500">
              No opportunities in this stage.
            </div>
          ) : (
            items.map((_, index) => (
              <PipelineCardRow
                key={items[index]?.id || index}
                index={index}
                data={{
                  items,
                  density,
                  draggingId,
                  onStartDrag,
                  onEndDrag,
                  canDrag,
                  onSelectOpportunity,
                  focusedOpportunityId,
                  selectedIds,
                  onToggleSelect,
                  onQuickAction,
                  onRemoveOpportunity,
                }}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
};

const PipelineCardRow = ({ index, style, data }: any) => {
  const opportunity: PipelineOpportunity = data.items[index];
  const isStale = isOpportunityStale(opportunity);
  const selected = data.selectedIds?.has(opportunity.id);
  const isFocused = data.focusedOpportunityId === opportunity.id;
  const hasTags = opportunity.tags && opportunity.tags.length > 0;
  const isHighValue = typeof opportunity.value === 'number' && opportunity.value >= 25000;

  return (
    <div style={style} className="px-1">
      <div
        className={cn(
          'group rounded-xl border border-[var(--shell-border)] bg-white/95 p-3 shadow-sm transition',
          data.canDrag && 'cursor-grab active:cursor-grabbing',
          data.draggingId === opportunity.id && 'opacity-60',
          isFocused && 'ring-2 ring-emerald-300'
        )}
        draggable={data.canDrag}
        onDragStart={data.canDrag ? (event: React.DragEvent) => {
          event.dataTransfer.setData('text/plain', opportunity.id);
          event.dataTransfer.effectAllowed = 'move';
          data.onStartDrag(opportunity.id);
        } : undefined}
        onDragEnd={data.canDrag ? () => data.onEndDrag() : undefined}
        role="listitem"
        aria-selected={selected || isFocused}
        tabIndex={0}
        onClick={() => data.onSelectOpportunity?.(opportunity)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            data.onSelectOpportunity?.(opportunity);
          }
        }}
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-[var(--shell-ink)]">
              {opportunity.contactName}
            </p>
            {opportunity.company && (
              <p className="text-xs text-[var(--shell-muted)]">{opportunity.company}</p>
            )}
          </div>
          <div className="flex items-start gap-2">
            <div className="flex flex-col items-end gap-1">
              <Badge variant="outline" className={cn('text-[10px] uppercase', statusClasses[opportunity.status])}>
                {opportunity.status}
              </Badge>
              {!opportunity.owner && (
                <Badge variant="secondary" className="bg-slate-100 text-slate-600 text-[10px] uppercase">
                  Unassigned
                </Badge>
              )}
              {isStale && (
                <Badge variant="secondary" className="bg-amber-50 text-amber-700 text-[10px] uppercase">
                  Stale
                </Badge>
              )}
              {isHighValue && (
                <Badge variant="secondary" className="bg-emerald-50 text-emerald-700 text-[10px] uppercase">
                  High value
                </Badge>
              )}
            </div>
            {data.onRemoveOpportunity && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 rounded-full text-slate-500 hover:text-slate-700"
                    aria-label="Opportunity actions"
                    draggable={false}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => event.stopPropagation()}
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => data.onRemoveOpportunity(opportunity)}>
                    Remove
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>

        <div className="mt-2 space-y-2 text-xs text-[var(--shell-muted)]">
          <div className="font-semibold text-[var(--shell-ink)]">
            {typeof opportunity.value === 'number' ? formatCurrency(opportunity.value) : 'Set value'}
          </div>
          <div>
            <span className="font-semibold text-[var(--shell-ink)]">Next:</span>{' '}
            {opportunity.nextStep || 'Set next step'}
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between text-[11px] text-[var(--shell-muted)]">
          <span>{opportunity.owner || 'Unassigned'}</span>
          <span>{formatDistanceToNow(new Date(opportunity.lastActivityAt), { addSuffix: true })}</span>
        </div>

        {data.onToggleSelect && (
          <div className="mt-3 flex items-center justify-between gap-2">
            <Checkbox
              checked={selected}
              onCheckedChange={(value) => data.onToggleSelect(opportunity.id, value === true)}
              aria-label={`Select ${opportunity.contactName}`}
              onClick={(event) => event.stopPropagation()}
            />
            {data.onQuickAction && (
              <div className="flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  onClick={(event) => {
                    event.stopPropagation();
                    data.onQuickAction?.('assign', opportunity);
                  }}
                  aria-label="Assign"
                >
                  <UserPlus className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  onClick={(event) => {
                    event.stopPropagation();
                    data.onQuickAction?.('next', opportunity);
                  }}
                  aria-label="Set next step"
                >
                  <ArrowRight className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  onClick={(event) => {
                    event.stopPropagation();
                    data.onQuickAction?.('schedule', opportunity);
                  }}
                  aria-label="Schedule"
                >
                  <CalendarClock className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        )}

        {hasTags && (
          <div className="mt-2 flex flex-wrap gap-1">
            {opportunity.tags?.map((tag) => (
              <Badge key={tag} variant="secondary" className="text-[10px]">
                {tag}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default PipelineBoard;

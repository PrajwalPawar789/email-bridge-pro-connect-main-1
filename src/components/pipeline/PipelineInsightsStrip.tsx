import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export type InsightItem = {
  id: string;
  label: string;
  value: string | number;
  helper?: string;
  tone?: "emerald" | "amber" | "sky" | "slate";
  icon?: React.ReactNode;
  tooltip?: string;
};

interface PipelineInsightsStripProps {
  items: InsightItem[];
}

const toneClasses: Record<NonNullable<InsightItem["tone"]>, string> = {
  emerald: "bg-emerald-50 text-emerald-600",
  amber: "bg-amber-50 text-amber-600",
  sky: "bg-sky-50 text-sky-600",
  slate: "bg-slate-100 text-slate-600",
};

const toneAccentClasses: Record<NonNullable<InsightItem["tone"]>, string> = {
  emerald: "from-emerald-500/70 to-emerald-200/10",
  amber: "from-amber-500/70 to-amber-200/10",
  sky: "from-sky-500/70 to-sky-200/10",
  slate: "from-slate-500/70 to-slate-200/10",
};

const PipelineInsightsStrip: React.FC<PipelineInsightsStripProps> = ({ items }) => {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <Card
          key={item.id}
          className="group relative overflow-hidden rounded-2xl border-[var(--shell-border)] bg-[var(--shell-surface-strong)]/95 shadow-[0_10px_24px_rgba(15,23,42,0.08)]"
        >
          <div
            className={cn(
              "pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r",
              item.tone ? toneAccentClasses[item.tone] : "from-slate-500/70 to-slate-200/10"
            )}
          />
          <CardContent className="p-5 sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="min-h-[102px]">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--shell-muted)]">
                  {item.label}
                </p>
                <div className="mt-3 flex items-center gap-2">
                  <p className="text-3xl font-semibold leading-none tracking-tight text-[var(--shell-ink)]">
                    {item.value}
                  </p>
                  {item.tooltip && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className="h-6 w-6 rounded-full border border-slate-200 bg-white text-[10px] font-semibold text-slate-500"
                          aria-label={`${item.label} info`}
                        >
                          i
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>{item.tooltip}</TooltipContent>
                    </Tooltip>
                  )}
                </div>
                {item.helper && <p className="mt-2 text-sm text-[var(--shell-muted)]">{item.helper}</p>}
              </div>
              {item.icon && (
                <div
                  className={cn(
                    "flex h-11 w-11 shrink-0 items-center justify-center rounded-full",
                    item.tone ? toneClasses[item.tone] : "bg-slate-100 text-slate-600"
                  )}
                >
                  {item.icon}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

export default PipelineInsightsStrip;

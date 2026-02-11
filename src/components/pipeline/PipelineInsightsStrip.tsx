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

const PipelineInsightsStrip: React.FC<PipelineInsightsStripProps> = ({ items }) => {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <Card
          key={item.id}
          className="border-[var(--shell-border)] bg-[var(--shell-surface-strong)]/90 shadow-[0_12px_24px_rgba(15,23,42,0.08)]"
        >
          <CardContent className="p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--shell-muted)]">
                  {item.label}
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <p className="text-2xl font-semibold text-[var(--shell-ink)]">{item.value}</p>
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
                {item.helper && (
                  <p className="mt-1 text-xs text-[var(--shell-muted)]">{item.helper}</p>
                )}
              </div>
              {item.icon && (
                <div
                  className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-full",
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

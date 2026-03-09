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

const toneCardClasses: Record<NonNullable<InsightItem["tone"]>, string> = {
  emerald: "border-emerald-200/80 bg-[linear-gradient(145deg,rgba(236,253,245,0.9),rgba(255,255,255,0.98))]",
  amber: "border-amber-200/80 bg-[linear-gradient(145deg,rgba(255,251,235,0.9),rgba(255,255,255,0.98))]",
  sky: "border-sky-200/80 bg-[linear-gradient(145deg,rgba(240,249,255,0.9),rgba(255,255,255,0.98))]",
  slate: "border-slate-200/80 bg-[linear-gradient(145deg,rgba(248,250,252,0.94),rgba(255,255,255,0.98))]",
};

const toneRailClasses: Record<NonNullable<InsightItem["tone"]>, string> = {
  emerald: "bg-gradient-to-b from-emerald-500 to-emerald-300",
  amber: "bg-gradient-to-b from-amber-500 to-amber-300",
  sky: "bg-gradient-to-b from-sky-500 to-sky-300",
  slate: "bg-gradient-to-b from-slate-500 to-slate-300",
};

const toneIconClasses: Record<NonNullable<InsightItem["tone"]>, string> = {
  emerald: "border-emerald-300/80 bg-emerald-100/90 text-emerald-700",
  amber: "border-amber-300/80 bg-amber-100/90 text-amber-700",
  sky: "border-sky-300/80 bg-sky-100/90 text-sky-700",
  slate: "border-slate-300/80 bg-slate-100/90 text-slate-700",
};

const toneDotClasses: Record<NonNullable<InsightItem["tone"]>, string> = {
  emerald: "bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.55)]",
  amber: "bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.5)]",
  sky: "bg-sky-500 shadow-[0_0_10px_rgba(14,165,233,0.5)]",
  slate: "bg-slate-500 shadow-[0_0_10px_rgba(100,116,139,0.45)]",
};

const PipelineInsightsStrip: React.FC<PipelineInsightsStripProps> = ({ items }) => {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item, index) => {
        const tone = item.tone || "slate";
        return (
          <Card
            key={item.id}
            className={cn(
              "group relative overflow-hidden rounded-[18px] border shadow-[0_8px_22px_rgba(15,23,42,0.07)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_12px_28px_rgba(15,23,42,0.1)] animate-[pipeline-fade-up_620ms_cubic-bezier(0.22,1,0.36,1)_both]",
              toneCardClasses[tone]
            )}
            style={{ animationDelay: `${index * 85}ms` }}
          >
            <div className={cn("absolute inset-x-0 top-0 h-1", toneRailClasses[tone])} />
            <CardContent className="relative flex min-h-[104px] flex-col justify-between p-3.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.17em] text-[var(--shell-muted)]">
                  {item.label}
                </p>
                <span className="inline-flex items-center gap-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                  <span className={cn("h-1.5 w-1.5 rounded-full", toneDotClasses[tone])} />
                  Live
                </span>
              </div>

              <div className="mt-2 flex items-end justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <p className="text-[1.9rem] font-semibold leading-none tracking-tight text-[var(--shell-ink)]">{item.value}</p>
                  {item.tooltip && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className="h-5 w-5 rounded-full border border-slate-200 bg-white text-[9px] font-semibold text-slate-500"
                          aria-label={`${item.label} info`}
                        >
                          i
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>{item.tooltip}</TooltipContent>
                    </Tooltip>
                  )}
                </div>
                {item.icon && (
                  <div
                    className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border",
                      toneIconClasses[tone]
                    )}
                  >
                    {item.icon}
                  </div>
                )}
              </div>

              <p className="mt-1 truncate text-[11px] text-[var(--shell-muted)]">{item.helper || "No context yet"}</p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};

export default PipelineInsightsStrip;

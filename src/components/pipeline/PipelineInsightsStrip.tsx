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
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item, index) => {
        const tone = item.tone || "slate";
        return (
          <Card
            key={item.id}
            className={cn(
              "group relative overflow-hidden rounded-[24px] border shadow-[0_14px_30px_rgba(15,23,42,0.1)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_22px_40px_rgba(15,23,42,0.14)] animate-[pipeline-fade-up_620ms_cubic-bezier(0.22,1,0.36,1)_both]",
              toneCardClasses[tone]
            )}
            style={{ animationDelay: `${index * 85}ms` }}
          >
            <div className={cn("absolute inset-y-0 left-0 w-1.5", toneRailClasses[tone])} />
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.28),transparent_48%)]" />

            <CardContent className="relative flex min-h-[176px] flex-col p-5 pl-6 sm:p-6 sm:pl-7">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--shell-muted)]">
                    {item.label}
                  </p>
                  <span className="mt-2 inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                    <span className={cn("h-2 w-2 rounded-full", toneDotClasses[tone])} />
                    Updated live
                  </span>
                </div>
                {item.icon && (
                  <div
                    className={cn(
                      "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border",
                      toneIconClasses[tone]
                    )}
                  >
                    {item.icon}
                  </div>
                )}
              </div>

              <div className="mt-7 flex items-center gap-2">
                <p className="text-4xl font-semibold leading-none tracking-tight text-[var(--shell-ink)]">{item.value}</p>
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

              <p className="mt-auto pt-4 text-sm text-[var(--shell-muted)]">{item.helper || "No context yet"}</p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};

export default PipelineInsightsStrip;

import React, { useRef } from "react";
import WalkingProgress from "@/components/onboarding/WalkingProgress";

type StepProgressProps = {
  current: number;
  total: number;
  title: string;
  subtitle?: string;
  percentOverride?: number | null;
  hidePercent?: boolean;
};

export default function StepProgress({
  current,
  total,
  title,
  subtitle,
  percentOverride = null,
  hidePercent = false,
}: StepProgressProps) {
  // Use percentOverride from API if provided, otherwise calculate
  const value =
    percentOverride !== null
      ? Math.min(100, Math.max(0, Math.round(percentOverride)))
      : Math.min(100, Math.max(0, Math.round((current / total) * 100)));

  const prev = useRef(value);
  const isChange = prev.current !== value;
  prev.current = value;

  // Always show the progress bar below the question (even when percent is 0)
  const showProgressBar = true;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div style={{ width: "85%" }}>
          <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
          {subtitle ? <p className="text-sm text-slate-600">{subtitle}</p> : null}
        </div>
        <div className="text-sm text-slate-500">
          Step {current} of {total}
        </div>
      </div>
      {showProgressBar && (
        <div className="flex items-center gap-3">
          <WalkingProgress
            value={value}
            fromValue={Math.max(0, Math.round(((current - 1) / total) * 100))}
            className="flex-1"
            height={8}
            animateOnChange={isChange}
          />
          {!hidePercent && (
            <span className="text-sm font-medium text-slate-500 min-w-[3rem] text-right">
              {value}%
            </span>
          )}
        </div>
      )}
    </div>
  );
}

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { SummaryValues } from "./OnboardingSummaryPanel";

export default function OnboardingPersonalizationPanel({
  values,
  total,
  currentStep,
  completionPercentage,
}: {
  values: SummaryValues;
  total: number;
  currentStep: number;
  completionPercentage?: number;
}) {
  const groups: { key: keyof SummaryValues; label: string }[] = [
    { key: "role", label: "Role" },
    { key: "useCase", label: "Primary goal" },
    { key: "experience", label: "Experience" },
    { key: "targetIndustry", label: "Industry" },
    { key: "productCategory", label: "Product category" },
  ];

  const percentage =
    typeof completionPercentage === "number"
      ? completionPercentage
      : currentStep === total
        ? 100
        : Math.min(100, Math.max(0, Math.round(((currentStep - 1) / total) * 100)));

  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-5">
      <div className="flex items-center gap-4 mb-6">
        {/* Circular Progress Indicator */}
        <div className="relative flex-shrink-0">
          <svg className="w-20 h-20" viewBox="0 0 80 80">
            {/* Background circle */}
            <circle
              cx="40"
              cy="40"
              r="36"
              fill="none"
              stroke="#e2e8f0"
              strokeWidth="3"
            />
            {/* Progress circle */}
            <circle
              cx="40"
              cy="40"
              r="36"
              fill="none"
              stroke="#10b981"
              strokeWidth="3"
              strokeDasharray={`${(percentage / 100) * 226.2} 226.2`}
              strokeLinecap="round"
              className="transform -rotate-90 origin-center transition-all duration-500"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <div className="text-sm font-bold text-slate-900">{percentage}%</div>
            </div>
          </div>
        </div>

        {/* Header */}
        <div className="flex-1">
          <h3 className="text-base font-semibold text-slate-900">Personalization</h3>
          <p className="text-xs text-slate-600 mt-0.5">
            Answer a few questions to tailor your workspace
          </p>
        </div>
      </div>

      {/* Data Grid */}
      <div className="space-y-3">
        {groups.map(({ key, label }) => {
          const v = values[key];
          return (
            <div key={key} className="grid grid-cols-2 gap-2 items-start">
              <span className="text-xs text-slate-600 font-medium">{label}</span>
              <AnimatePresence mode="wait">
                {v ? (
                  <motion.span
                    key={`${key}-${v}`}
                    initial={{ opacity: 0, x: 8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -8 }}
                    transition={{ duration: 0.2 }}
                    className="text-xs font-semibold text-slate-900 text-right break-words whitespace-normal"
                  >
                    {v}
                  </motion.span>
                ) : (
                  <motion.span
                    key={`${key}-empty`}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="text-xs text-slate-400 text-right"
                  >
                    --
                  </motion.span>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>

      {/* Tip */}
      <div className="mt-4 pt-4 border-t border-slate-200">
        <p className="text-xs text-slate-500 leading-relaxed">
          Tip: Your selections personalize EmailBridge Pro. You can update them later in Settings.
        </p>
      </div>
    </div>
  );
}

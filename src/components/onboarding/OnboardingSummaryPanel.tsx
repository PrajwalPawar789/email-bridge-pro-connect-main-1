import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import ConfettiCanvas from "@/components/onboarding/ConfettiCanvas";
import { cn } from "@/lib/utils";

export type SummaryValues = {
  role?: string;
  useCase?: string;
  experience?: string;
  targetIndustry?: string;
  productCategory?: string;
};

export default function OnboardingSummaryPanel({
  values,
  total,
  className,
}: {
  values: SummaryValues;
  total: number;
  className?: string;
}) {
  const answered = Object.values(values).filter(Boolean).length;
  const complete = answered >= total;
  const percentage = Math.round((answered / total) * 100);

  const groups: { key: keyof SummaryValues; label: string }[] = [
    { key: "role", label: "Role" },
    { key: "useCase", label: "Primary goal" },
    { key: "experience", label: "Experience" },
    { key: "targetIndustry", label: "Industry" },
    { key: "productCategory", label: "Product category" },
  ];

  return (
    <div
      className={cn(
        "relative h-full w-full p-8 md:p-10",
        complete ? "glow" : "",
        className,
      )}
    >
      {complete ? (
        <div className="pointer-events-none absolute inset-0">
          <ConfettiCanvas mode="blast" />
        </div>
      ) : null}

      <div className="relative mx-auto h-full w-full max-w-xl">
        <div className="rounded-2xl bg-white/90 shadow-2xl ring-1 ring-emerald-200/60 backdrop-blur p-6 md:p-7">
          <div className="flex items-start gap-4">
            {/* Circular Progress Indicator */}
            <div className="relative flex-shrink-0 w-20 h-20">
              <svg className="w-full h-full" viewBox="0 0 80 80">
                {/* Background circle */}
                <circle
                  cx="40"
                  cy="40"
                  r="36"
                  fill="none"
                  stroke="#e2e8f0"
                  strokeWidth="2"
                />
                {/* Progress circle */}
                <circle
                  cx="40"
                  cy="40"
                  r="36"
                  fill="none"
                  stroke="#10b981"
                  strokeWidth="2"
                  strokeDasharray={`${(percentage / 100) * 226.2} 226.2`}
                  strokeLinecap="round"
                  className="transform -rotate-90 origin-center transition-all duration-500"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <div className="text-sm font-semibold text-slate-900">
                    {percentage}%
                  </div>
                </div>
              </div>
            </div>

            {/* Header */}
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-slate-900">Personalization</h3>
              <p className="mt-1 text-xs text-slate-600">
                Quick summary of your EmailBridge preferences
              </p>
            </div>
          </div>

          {/* Data Grid */}
          <div className="mt-6 space-y-3">
            {groups.map(({ key, label }) => {
              const v = values[key];
              return (
                <div key={key} className="flex justify-between items-center">
                  <span className="text-sm text-slate-500">{label}</span>
                  <AnimatePresence mode="wait">
                    {v ? (
                      <motion.span
                        key={`${key}-${v}`}
                        initial={{ opacity: 0, x: 8 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -8 }}
                        transition={{ duration: 0.2 }}
                        className="text-sm font-medium text-slate-900"
                      >
                        {v}
                      </motion.span>
                    ) : (
                      <motion.span
                        key={`${key}-empty`}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="text-xs text-slate-400 italic"
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
          <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
            <p className="text-xs text-slate-600">
              You can refine these preferences later from Settings. We use them to personalize onboarding tips and campaign templates.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

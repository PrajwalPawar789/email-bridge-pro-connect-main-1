import { addMonths, format, isAfter, parseISO, startOfMonth } from "date-fns";
import {
  PipelineForecastCategory,
  PipelineOpportunity,
  PipelineStage,
  formatCurrency,
  isOpportunityStale,
} from "@/lib/pipeline";

export const FORECAST_CATEGORY_OPTIONS: Array<{
  value: PipelineForecastCategory;
  label: string;
  description: string;
}> = [
  { value: "not_forecasted", label: "Not forecasted", description: "Open, but not included in the forecast." },
  { value: "pipeline", label: "Pipeline", description: "Early or mid-stage opportunity with uncertain timing." },
  { value: "best_case", label: "Best case", description: "Can close in-period, but still needs movement." },
  { value: "commit", label: "Commit", description: "Expected to close with strong confidence." },
  { value: "closed", label: "Closed", description: "Already won and no longer part of open forecast risk." },
];

export const FORECAST_CATEGORY_META: Record<
  PipelineForecastCategory,
  { label: string; tone: string }
> = {
  not_forecasted: {
    label: "Not forecasted",
    tone: "border-slate-200 bg-slate-50 text-slate-700",
  },
  pipeline: {
    label: "Pipeline",
    tone: "border-sky-200 bg-sky-50 text-sky-700",
  },
  best_case: {
    label: "Best case",
    tone: "border-violet-200 bg-violet-50 text-violet-700",
  },
  commit: {
    label: "Commit",
    tone: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
  closed: {
    label: "Closed",
    tone: "border-amber-200 bg-amber-50 text-amber-700",
  },
};

export type ForecastRisk = {
  label: string;
  severity: "medium" | "high";
};

export type ForecastBucket = {
  id: string;
  label: string;
  count: number;
  rawValue: number;
  weightedValue: number;
};

export type ForecastStageRollup = {
  stageId: string;
  stageName: string;
  count: number;
  rawValue: number;
  weightedValue: number;
  avgProbability: number;
};

export type ForecastSnapshot = {
  openValue: number;
  weightedValue: number;
  commitValue: number;
  bestCaseValue: number;
  pipelineValue: number;
  missingCloseDateCount: number;
  overdueCloseCount: number;
  atRiskCount: number;
  buckets: ForecastBucket[];
  stageRollups: ForecastStageRollup[];
  atRiskDeals: Array<{
    opportunity: PipelineOpportunity;
    rawValue: number;
    weightedValue: number;
    risks: ForecastRisk[];
  }>;
};

const clampProbability = (value?: number | null) => {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value as number)));
};

export const getForecastCategoryLabel = (category: PipelineForecastCategory) =>
  FORECAST_CATEGORY_META[category]?.label || "Pipeline";

export const getForecastProbability = (
  opportunity: PipelineOpportunity,
  stages: PipelineStage[]
) => {
  if (Number.isFinite(opportunity.forecastProbability)) {
    return clampProbability(opportunity.forecastProbability);
  }
  return getStageForecastDefaults(opportunity.stageId, stages).probability;
};

export const getForecastCategory = (
  opportunity: PipelineOpportunity,
  stages: PipelineStage[]
) => {
  if (opportunity.forecastCategory) {
    return normalizeForecastCategory(opportunity.status, opportunity.forecastCategory);
  }
  return getStageForecastDefaults(opportunity.stageId, stages).category;
};

export const normalizeForecastCategory = (
  status: PipelineOpportunity["status"],
  category?: PipelineForecastCategory | null
): PipelineForecastCategory => {
  if (status === "won") return "closed";
  if (status === "lost") return "not_forecasted";
  if (!category) return "pipeline";
  if (category === "closed") return "commit";
  return category;
};

export const getStageForecastDefaults = (
  stageId: string,
  stages: PipelineStage[]
): { category: PipelineForecastCategory; probability: number } => {
  const stage = stages.find((item) => item.id === stageId);
  if (!stage) return { category: "pipeline", probability: 40 };
  if (stage.isWon) return { category: "closed", probability: 100 };
  if (stage.isLost) return { category: "not_forecasted", probability: 0 };

  const forecastStages = stages.filter((item) => !item.isWon && !item.isLost);
  const index = Math.max(0, forecastStages.findIndex((item) => item.id === stageId));
  const progress = forecastStages.length <= 1 ? 1 : index / (forecastStages.length - 1);

  const probability = Math.round((15 + progress * 70) / 5) * 5;
  if (progress < 0.35) return { category: "pipeline", probability };
  if (progress < 0.75) return { category: "best_case", probability };
  return { category: "commit", probability: Math.max(probability, 70) };
};

export const getWeightedValue = (value?: number | null, probability?: number | null) =>
  (value || 0) * (clampProbability(probability) / 100);

export const isOpportunityCloseDateOverdue = (
  opportunity: PipelineOpportunity,
  referenceDate = new Date()
) => {
  if (!opportunity.expectedCloseDate || opportunity.status !== "open") return false;
  const closeDate = parseISO(opportunity.expectedCloseDate);
  return isAfter(referenceDate, closeDate);
};

export const getOpportunityForecastRisks = (
  opportunity: PipelineOpportunity,
  stages: PipelineStage[],
  referenceDate = new Date()
): ForecastRisk[] => {
  if (opportunity.status !== "open") return [];

  const category = getForecastCategory(opportunity, stages);
  const probability = getForecastProbability(opportunity, stages);
  const risks: ForecastRisk[] = [];

  if (!opportunity.owner) {
    risks.push({ label: "No owner", severity: "high" });
  }
  if (!opportunity.nextStep?.trim()) {
    risks.push({ label: "No next step", severity: "high" });
  }
  if (!opportunity.expectedCloseDate) {
    risks.push({ label: "Missing close date", severity: "medium" });
  }
  if (isOpportunityStale(opportunity, referenceDate)) {
    risks.push({ label: "Stale activity", severity: "high" });
  }
  if (isOpportunityCloseDateOverdue(opportunity, referenceDate)) {
    risks.push({ label: "Overdue close date", severity: "high" });
  }
  if (category === "commit" && probability < 70) {
    risks.push({ label: "Commit with weak confidence", severity: "medium" });
  }
  if ((opportunity.value || 0) >= 25000 && probability < 50) {
    risks.push({ label: "High value, low confidence", severity: "medium" });
  }

  return risks;
};

export const buildForecastSnapshot = (
  opportunities: PipelineOpportunity[],
  stages: PipelineStage[],
  referenceDate = new Date()
): ForecastSnapshot => {
  const openDeals = opportunities.filter((opportunity) => opportunity.status === "open");
  const buckets: ForecastBucket[] = Array.from({ length: 3 }, (_, index) => {
    const month = addMonths(startOfMonth(referenceDate), index);
    return {
      id: format(month, "yyyy-MM"),
      label: format(month, "MMM yyyy"),
      count: 0,
      rawValue: 0,
      weightedValue: 0,
    };
  });

  const stageRollups = stages.map((stage) => {
    const stageDeals = openDeals.filter((opportunity) => opportunity.stageId === stage.id);
    const totalProbability = stageDeals.reduce(
      (sum, opportunity) => sum + getForecastProbability(opportunity, stages),
      0
    );
    const rawValue = stageDeals.reduce((sum, opportunity) => sum + (opportunity.value || 0), 0);
    const weightedValue = stageDeals.reduce(
      (sum, opportunity) =>
        sum + getWeightedValue(opportunity.value, getForecastProbability(opportunity, stages)),
      0
    );

    return {
      stageId: stage.id,
      stageName: stage.name,
      count: stageDeals.length,
      rawValue,
      weightedValue,
      avgProbability: stageDeals.length ? totalProbability / stageDeals.length : 0,
    };
  });

  let openValue = 0;
  let weightedValue = 0;
  let commitValue = 0;
  let bestCaseValue = 0;
  let pipelineValue = 0;
  let missingCloseDateCount = 0;
  let overdueCloseCount = 0;

  const atRiskDeals = openDeals
    .map((opportunity) => {
      const probability = getForecastProbability(opportunity, stages);
      const category = getForecastCategory(opportunity, stages);
      const rawValue = opportunity.value || 0;
      const weighted = getWeightedValue(rawValue, probability);
      const risks = getOpportunityForecastRisks(opportunity, stages, referenceDate);

      openValue += rawValue;
      weightedValue += weighted;

      if (category === "commit") commitValue += rawValue;
      if (category === "best_case") bestCaseValue += rawValue;
      if (category === "pipeline") pipelineValue += rawValue;
      if (!opportunity.expectedCloseDate) {
        missingCloseDateCount += 1;
      }
      if (isOpportunityCloseDateOverdue(opportunity, referenceDate)) {
        overdueCloseCount += 1;
      }

      if (opportunity.expectedCloseDate) {
        const closeDate = parseISO(opportunity.expectedCloseDate);
        const bucket = buckets.find((item) => item.id === format(closeDate, "yyyy-MM"));
        if (bucket) {
          bucket.count += 1;
          bucket.rawValue += rawValue;
          bucket.weightedValue += weighted;
        }
      }

      return { opportunity, rawValue, weightedValue: weighted, risks };
    })
    .filter((item) => item.risks.length > 0)
    .sort((left, right) => {
      const severityScore = (risk: ForecastRisk) => (risk.severity === "high" ? 2 : 1);
      const leftScore = left.risks.reduce((sum, risk) => sum + severityScore(risk), 0);
      const rightScore = right.risks.reduce((sum, risk) => sum + severityScore(risk), 0);
      if (rightScore !== leftScore) return rightScore - leftScore;
      return (right.rawValue || 0) - (left.rawValue || 0);
    });

  return {
    openValue,
    weightedValue,
    commitValue,
    bestCaseValue,
    pipelineValue,
    missingCloseDateCount,
    overdueCloseCount,
    atRiskCount: atRiskDeals.length,
    buckets,
    stageRollups,
    atRiskDeals,
  };
};

export const formatForecastSummaryLine = (value: number, probability: number) =>
  `${formatCurrency(value)} at ${Math.round(probability)}% confidence`;

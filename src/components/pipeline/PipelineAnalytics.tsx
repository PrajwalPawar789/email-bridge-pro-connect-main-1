import React, { useMemo } from "react";
import { format, parseISO } from "date-fns";
import { AlertTriangle, CalendarClock, Gauge, Sparkles, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PipelineOpportunity, PipelineStage, formatCurrency, formatPercent } from "@/lib/pipeline";
import {
  FORECAST_CATEGORY_META,
  buildForecastSnapshot,
  getForecastCategory,
  getForecastCategoryLabel,
  getForecastProbability,
} from "@/lib/pipelineForecasting";

interface PipelineAnalyticsProps {
  stages: PipelineStage[];
  opportunities: PipelineOpportunity[];
}

const MetricCard = ({
  label,
  value,
  description,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: string;
}) => (
  <Card className="border-[var(--shell-border)] bg-white/90 shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
    <CardContent className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
          <p className={tone} style={{ fontFamily: "var(--shell-font-display)" }}>
            {value}
          </p>
          <p className="mt-2 text-xs text-slate-500">{description}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-2.5 text-slate-600">
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </CardContent>
  </Card>
);

const PipelineAnalytics: React.FC<PipelineAnalyticsProps> = ({ stages, opportunities }) => {
  const snapshot = useMemo(() => buildForecastSnapshot(opportunities, stages), [opportunities, stages]);
  const totalOpenDeals = opportunities.filter((opportunity) => opportunity.status === "open").length;

  if (!opportunities.length) {
    return (
      <Card className="border-[var(--shell-border)] bg-white/90">
        <CardContent className="p-8 text-center">
          <Sparkles className="mx-auto h-10 w-10 text-slate-300" />
          <p className="mt-4 text-sm font-semibold text-slate-900">Forecasting needs opportunities first</p>
          <p className="mt-2 text-sm text-slate-500">
            Add deals with value, close date, and next steps to unlock forecast intelligence.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="border-[var(--shell-border)] bg-[linear-gradient(180deg,rgba(255,255,255,0.97),rgba(248,250,252,0.94))] shadow-[0_18px_42px_rgba(15,23,42,0.06)]">
        <CardHeader>
          <CardTitle className="text-xl text-slate-900">Forecast workspace</CardTitle>
          <CardDescription>
            Raw pipeline is the top of funnel. Forecast is what has a realistic chance to close and what is putting the number at risk.
          </CardDescription>
        </CardHeader>
      </Card>

      <Tabs defaultValue="forecast" className="space-y-4">
        <TabsList className="rounded-2xl bg-white/90 p-1 shadow-sm">
          <TabsTrigger value="forecast">Forecast</TabsTrigger>
          <TabsTrigger value="health">Health</TabsTrigger>
          <TabsTrigger value="stages">Stage rollup</TabsTrigger>
        </TabsList>

        <TabsContent value="forecast" className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-4">
            <MetricCard
              label="Open pipeline"
              value={formatCurrency(snapshot.openValue)}
              description={`${totalOpenDeals} open opportunities currently in play.`}
              icon={TrendingUp}
              tone="mt-2 text-[2rem] font-semibold text-slate-900"
            />
            <MetricCard
              label="Weighted forecast"
              value={formatCurrency(snapshot.weightedValue)}
              description="Pipeline value adjusted by deal-level confidence."
              icon={Gauge}
              tone="mt-2 text-[2rem] font-semibold text-sky-700"
            />
            <MetricCard
              label="Commit"
              value={formatCurrency(snapshot.commitValue)}
              description="Deals reps should be comfortable standing behind."
              icon={Sparkles}
              tone="mt-2 text-[2rem] font-semibold text-emerald-700"
            />
            <MetricCard
              label="Best case"
              value={formatCurrency(snapshot.bestCaseValue)}
              description="Potential upside if late-stage work lands in period."
              icon={CalendarClock}
              tone="mt-2 text-[2rem] font-semibold text-violet-700"
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            {snapshot.buckets.map((bucket) => (
              <Card key={bucket.id} className="border-[var(--shell-border)] bg-white/90">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base text-slate-900">{bucket.label}</CardTitle>
                  <CardDescription>{bucket.count} expected closes in this bucket.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Raw value</span>
                    <span className="font-semibold text-slate-900">{formatCurrency(bucket.rawValue)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Weighted value</span>
                    <span className="font-semibold text-sky-700">{formatCurrency(bucket.weightedValue)}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="health" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="border-[var(--shell-border)] bg-white/90">
              <CardContent className="p-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Missing close date</p>
                <p className="mt-2 text-[2rem] font-semibold text-slate-900" style={{ fontFamily: "var(--shell-font-display)" }}>
                  {snapshot.missingCloseDateCount}
                </p>
                <p className="mt-2 text-xs text-slate-500">Forecasting is weak when open deals have no time commitment.</p>
              </CardContent>
            </Card>
            <Card className="border-[var(--shell-border)] bg-white/90">
              <CardContent className="p-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Overdue close date</p>
                <p className="mt-2 text-[2rem] font-semibold text-amber-700" style={{ fontFamily: "var(--shell-font-display)" }}>
                  {snapshot.overdueCloseCount}
                </p>
                <p className="mt-2 text-xs text-slate-500">Deals already past expected close should be reviewed before forecast calls.</p>
              </CardContent>
            </Card>
            <Card className="border-[var(--shell-border)] bg-white/90">
              <CardContent className="p-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">At-risk deals</p>
                <p className="mt-2 text-[2rem] font-semibold text-rose-700" style={{ fontFamily: "var(--shell-font-display)" }}>
                  {snapshot.atRiskCount}
                </p>
                <p className="mt-2 text-xs text-slate-500">Rules-based inspection: stale, no next step, no owner, or weak commit hygiene.</p>
              </CardContent>
            </Card>
          </div>

          <Card className="border-[var(--shell-border)] bg-white/90">
            <CardHeader>
              <CardTitle className="text-lg text-slate-900">Forecast inspection</CardTitle>
              <CardDescription>
                These are the deals most likely to distort the number if the team does not intervene.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {snapshot.atRiskDeals.length ? (
                snapshot.atRiskDeals.slice(0, 8).map(({ opportunity, rawValue, weightedValue, risks }) => {
                  const category = getForecastCategory(opportunity, stages);
                  const probability = getForecastProbability(opportunity, stages);

                  return (
                    <div
                      key={opportunity.id}
                      className="rounded-2xl border border-[var(--shell-border)] bg-slate-50/90 p-4"
                    >
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-semibold text-slate-900">{opportunity.contactName}</p>
                            <Badge
                              variant="outline"
                              className={FORECAST_CATEGORY_META[category].tone}
                            >
                              {getForecastCategoryLabel(category)}
                            </Badge>
                            <Badge variant="outline" className="border-slate-200 bg-white text-slate-600">
                              {formatPercent(probability)}
                            </Badge>
                          </div>
                          <p className="mt-1 text-xs text-slate-500">
                            {opportunity.company || opportunity.email || "Unnamed company"}
                            {opportunity.expectedCloseDate
                              ? ` · closes ${format(parseISO(opportunity.expectedCloseDate), "MMM d, yyyy")}`
                              : " · close date missing"}
                          </p>
                        </div>
                        <div className="text-sm">
                          <p className="font-semibold text-slate-900">{formatCurrency(rawValue)}</p>
                          <p className="text-xs text-slate-500">Weighted {formatCurrency(weightedValue)}</p>
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        {risks.map((risk) => (
                          <Badge
                            key={risk.label}
                            variant="outline"
                            className={
                              risk.severity === "high"
                                ? "border-rose-200 bg-rose-50 text-rose-700"
                                : "border-amber-200 bg-amber-50 text-amber-700"
                            }
                          >
                            <AlertTriangle className="mr-1 h-3 w-3" />
                            {risk.label}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="rounded-2xl border border-dashed border-[var(--shell-border)] bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                  Forecast hygiene looks healthy right now.
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="stages" className="space-y-4">
          <Card className="border-[var(--shell-border)] bg-white/90">
            <CardHeader>
              <CardTitle className="text-lg text-slate-900">Stage forecast rollup</CardTitle>
              <CardDescription>
                Use stage-level value, weighted value, and average confidence to see where forecast quality improves or decays.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {snapshot.stageRollups.map((stage) => (
                <div
                  key={stage.stageId}
                  className="grid gap-3 rounded-2xl border border-[var(--shell-border)] bg-slate-50/90 p-4 lg:grid-cols-[minmax(0,1.2fr)_repeat(4,minmax(0,0.8fr))]"
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{stage.stageName}</p>
                    <p className="mt-1 text-xs text-slate-500">{stage.count} open deals</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Raw</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">{formatCurrency(stage.rawValue)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Weighted</p>
                    <p className="mt-1 text-sm font-semibold text-sky-700">{formatCurrency(stage.weightedValue)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Confidence</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">{formatPercent(stage.avgProbability)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Yield</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">
                      {stage.rawValue > 0 ? formatPercent((stage.weightedValue / stage.rawValue) * 100) : "0%"}
                    </p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default PipelineAnalytics;

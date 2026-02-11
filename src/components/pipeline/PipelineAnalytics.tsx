import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency, PipelineOpportunity, PipelineStage } from "@/lib/pipeline";

interface PipelineAnalyticsProps {
  stages: PipelineStage[];
  opportunities: PipelineOpportunity[];
}

const PipelineAnalytics: React.FC<PipelineAnalyticsProps> = ({ stages, opportunities }) => {
  const totals = stages.map((stage) => {
    const items = opportunities.filter((opp) => opp.stageId === stage.id);
    const value = items.reduce((sum, opp) => sum + (opp.value || 0), 0);
    return { stage, count: items.length, value };
  });

  const maxCount = Math.max(...totals.map((item) => item.count), 1);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card className="border-[var(--shell-border)] bg-white/90">
        <CardContent className="p-5">
          <h3 className="text-sm font-semibold text-slate-900">Stage distribution</h3>
          <div className="mt-4 space-y-3">
            {totals.map((item) => (
              <div key={item.stage.id} className="space-y-1">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>{item.stage.name}</span>
                  <span>{item.count} deals</span>
                </div>
                <div className="h-2 rounded-full bg-slate-100">
                  <div
                    className="h-2 rounded-full bg-emerald-500"
                    style={{ width: `${(item.count / maxCount) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="border-[var(--shell-border)] bg-white/90">
        <CardContent className="p-5">
          <h3 className="text-sm font-semibold text-slate-900">Pipeline value by stage</h3>
          <div className="mt-4 space-y-3">
            {totals.map((item) => (
              <div key={item.stage.id} className="flex items-center justify-between text-sm">
                <span className="text-slate-600">{item.stage.name}</span>
                <span className="font-semibold text-slate-900">{formatCurrency(item.value)}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default PipelineAnalytics;

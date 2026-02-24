import { CheckCircle2, CircleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { WorkflowReviewItem } from "@/workflow/types/schema";

interface WorkflowReviewChecklistProps {
  items: WorkflowReviewItem[];
  compact?: boolean;
}

const WorkflowReviewChecklist = ({ items, compact = false }: WorkflowReviewChecklistProps) => {
  const passed = items.filter((item) => item.pass).length;

  return (
    <section
      className={cn(
        "bg-white",
        compact ? "h-full rounded-xl p-3" : "rounded-2xl border border-slate-200 p-3 shadow-sm"
      )}
    >
      <div className="mb-2 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Publish Review</p>
          <p className="text-sm text-slate-700">Checklist before switching workflow to live mode.</p>
        </div>
        <Badge variant={passed === items.length ? "default" : "secondary"}>
          {passed}/{items.length} passed
        </Badge>
      </div>

      <div className={cn("space-y-2", compact && "max-h-[calc(100%-44px)] overflow-auto pr-1")}>
        {items.map((item) => (
          <div
            key={item.id}
            className={`rounded-lg border px-2 py-1.5 text-xs ${
              item.pass ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"
            }`}
          >
            <div className="flex items-center gap-2">
              {item.pass ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
              ) : (
                <CircleAlert className="h-3.5 w-3.5 text-amber-700" />
              )}
              <p className="font-semibold text-slate-800">{item.label}</p>
            </div>
            {item.detail ? <p className="ml-5 mt-1 text-slate-600">{item.detail}</p> : null}
          </div>
        ))}
      </div>
    </section>
  );
};

export default WorkflowReviewChecklist;

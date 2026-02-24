import { formatDistanceToNowStrict } from "date-fns";
import { cn } from "@/lib/utils";
import type { WorkflowRuntimeEvent } from "@/workflow/types/schema";

interface WorkflowRuntimePanelProps {
  events: WorkflowRuntimeEvent[];
  compact?: boolean;
}

const tone = {
  info: "border-slate-200 bg-white text-slate-700",
  warning: "border-amber-200 bg-amber-50 text-amber-700",
  error: "border-rose-200 bg-rose-50 text-rose-700",
};

const WorkflowRuntimePanel = ({ events, compact = false }: WorkflowRuntimePanelProps) => {
  return (
    <section
      className={cn(
        "bg-white",
        compact ? "h-full rounded-xl p-3" : "rounded-2xl border border-slate-200 p-3 shadow-sm"
      )}
    >
      <div className="mb-2">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Runtime Events</p>
        <p className="text-sm text-slate-700">Step-level execution and simulation trail.</p>
      </div>

      <div className={cn("overflow-auto pr-1", compact ? "h-[calc(100%-46px)]" : "h-56")}>
        {events.length === 0 ? (
          <p className="text-xs text-slate-500">No runtime events available.</p>
        ) : (
          <div className="space-y-2">
            {events.map((event) => (
              <article
                key={event.id}
                className={cn(
                  "rounded-lg border p-2 text-xs",
                  tone[event.level || "info"]
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold uppercase tracking-[0.12em]">{event.type.replaceAll("_", " ")}</p>
                  <p className="text-[10px]">
                    {formatDistanceToNowStrict(new Date(event.createdAt), { addSuffix: true })}
                  </p>
                </div>
                <p className="mt-1 text-xs">{event.message}</p>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
};

export default WorkflowRuntimePanel;

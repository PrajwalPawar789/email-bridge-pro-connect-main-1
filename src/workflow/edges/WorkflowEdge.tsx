import { memo } from "react";
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from "@xyflow/react";
import { cn } from "@/lib/utils";

const WorkflowEdge = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  label,
  markerEnd,
  data,
}: EdgeProps) => {
  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    curvature: 0.35,
  });

  const highlighted =
    typeof data === "object" &&
    data !== null &&
    "highlighted" in data &&
    Boolean((data as { highlighted?: boolean }).highlighted);

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        style={{
          stroke: highlighted ? "#059669" : "#64748b",
          strokeWidth: highlighted ? 2.8 : 2,
          strokeDasharray: highlighted ? "0" : "6 4",
          animation: "workflow-edge-dash 1.6s linear infinite",
        }}
      />

      {label ? (
        <EdgeLabelRenderer>
          <div
            className={cn(
              "pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded border px-1.5 py-0.5 text-[10px] font-semibold",
              highlighted
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-slate-200 bg-white text-slate-600"
            )}
            style={{
              left: labelX,
              top: labelY,
            }}
          >
            {String(label)}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
};

export default memo(WorkflowEdge);

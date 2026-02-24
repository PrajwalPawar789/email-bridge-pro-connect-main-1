import type { NodeProps } from "@xyflow/react";
import WorkflowNodeBase from "@/workflow/nodes/WorkflowNodeBase";
import type { WorkflowCanvasNodeData } from "@/workflow/types/reactflow";

const GenericNode = (props: NodeProps<WorkflowCanvasNodeData>) => <WorkflowNodeBase {...props} />;

export default GenericNode;

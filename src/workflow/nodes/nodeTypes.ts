import type { NodeTypes } from "@xyflow/react";
import ConditionNode from "@/workflow/nodes/ConditionNode";
import EmailNode from "@/workflow/nodes/EmailNode";
import GenericNode from "@/workflow/nodes/GenericNode";
import WaitNode from "@/workflow/nodes/WaitNode";

export const workflowNodeTypes: NodeTypes = {
  trigger: GenericNode,
  send_email: EmailNode,
  wait: WaitNode,
  condition: ConditionNode,
  split: GenericNode,
  webhook: GenericNode,
  exit: GenericNode,
};

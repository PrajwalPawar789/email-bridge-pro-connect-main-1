import type { CSSProperties } from "react";
import type { LucideIcon } from "lucide-react";
import {
  BellRing,
  GitBranch,
  Mail,
  PauseCircle,
  PlayCircle,
  Shuffle,
  Webhook,
} from "lucide-react";
import { Position } from "@xyflow/react";
import type { WorkflowNodeKind } from "@/workflow/types/schema";
import { NODE_TITLES, createDefaultNodeConfig, createNode } from "@/workflow/utils/defaults";
import { getConditionBranches } from "@/workflow/utils/condition";

export interface NodePort {
  id: string;
  label?: string;
  type: "source" | "target";
  position: Position;
  style?: CSSProperties;
}

export interface NodePlugin {
  kind: WorkflowNodeKind;
  title: string;
  description: string;
  icon: LucideIcon;
  toneClass: string;
  supportsRunner: boolean;
  ports: NodePort[];
  create: (position: { x: number; y: number }) => ReturnType<typeof createNode>;
}

const createPlugin = (
  kind: WorkflowNodeKind,
  config: Omit<NodePlugin, "kind" | "title" | "create">
): NodePlugin => ({
  kind,
  title: NODE_TITLES[kind],
  ...config,
  create: (position) => {
    const node = createNode(kind, position);
    return {
      ...node,
      config: createDefaultNodeConfig(kind),
    };
  },
});

export const nodePlugins: NodePlugin[] = [
  createPlugin("trigger", {
    description: "Entry point for enrollment events.",
    icon: PlayCircle,
    toneClass: "from-emerald-500/20 to-emerald-100/80 border-emerald-300",
    supportsRunner: true,
    ports: [{ id: "out", type: "source", position: Position.Bottom }],
  }),
  createPlugin("send_email", {
    description: "Send personalized email content.",
    icon: Mail,
    toneClass: "from-sky-500/20 to-sky-100/80 border-sky-300",
    supportsRunner: true,
    ports: [
      { id: "in", type: "target", position: Position.Top },
      { id: "out", type: "source", position: Position.Bottom },
    ],
  }),
  createPlugin("wait", {
    description: "Pause contacts for a delay window.",
    icon: PauseCircle,
    toneClass: "from-amber-500/20 to-amber-100/80 border-amber-300",
    supportsRunner: true,
    ports: [
      { id: "in", type: "target", position: Position.Top },
      { id: "out", type: "source", position: Position.Bottom },
    ],
  }),
  createPlugin("condition", {
    description: "Branch flow by behavior or attributes.",
    icon: GitBranch,
    toneClass: "from-indigo-500/20 to-indigo-100/80 border-indigo-300",
    supportsRunner: true,
    ports: [
      { id: "in", type: "target", position: Position.Top },
      { id: "if", label: "If", type: "source", position: Position.Bottom, style: { left: "25%" } },
      { id: "else", label: "Else", type: "source", position: Position.Bottom, style: { left: "75%" } },
    ],
  }),
  createPlugin("split", {
    description: "Split traffic for A/B testing.",
    icon: Shuffle,
    toneClass: "from-fuchsia-500/20 to-fuchsia-100/80 border-fuchsia-300",
    supportsRunner: false,
    ports: [
      { id: "in", type: "target", position: Position.Top },
      { id: "a", label: "A", type: "source", position: Position.Right },
      { id: "b", label: "B", type: "source", position: Position.Left },
    ],
  }),
  createPlugin("webhook", {
    description: "Notify external systems in real time.",
    icon: Webhook,
    toneClass: "from-teal-500/20 to-teal-100/80 border-teal-300",
    supportsRunner: true,
    ports: [
      { id: "in", type: "target", position: Position.Top },
      { id: "out", type: "source", position: Position.Bottom },
    ],
  }),
  createPlugin("exit", {
    description: "End workflow execution.",
    icon: BellRing,
    toneClass: "from-slate-500/20 to-slate-100/80 border-slate-300",
    supportsRunner: true,
    ports: [{ id: "in", type: "target", position: Position.Top }],
  }),
];

export const nodePluginMap = Object.fromEntries(nodePlugins.map((plugin) => [plugin.kind, plugin])) as Record<
  WorkflowNodeKind,
  NodePlugin
>;

export const getConditionPorts = (config: unknown): NodePort[] => {
  const branches = getConditionBranches(config);

  return [
    { id: "in", type: "target", position: Position.Top },
    ...branches.map((branch, index) => ({
      id: branch.handle,
      label: branch.label,
      type: "source" as const,
      position: Position.Bottom,
      style: {
        left: `${((index + 1) / (branches.length + 1)) * 100}%`,
      },
    })),
  ];
};

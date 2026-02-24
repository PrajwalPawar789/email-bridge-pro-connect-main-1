export const createWorkflowId = () => `wf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
export const createNodeId = (kind: string) => `${kind}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
export const createEdgeId = (source: string, target: string) => `edge_${source}_${target}_${Math.random().toString(36).slice(2, 7)}`;

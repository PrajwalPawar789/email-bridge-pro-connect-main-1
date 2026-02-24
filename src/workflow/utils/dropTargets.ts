const SOURCE_DROP_TARGET_PREFIX = "workflow-source-drop";

export const createSourceDropTargetId = (nodeId: string, handleId: string) =>
  `${SOURCE_DROP_TARGET_PREFIX}:${nodeId}:${handleId}`;

export const parseSourceDropTargetId = (value: string | null | undefined) => {
  if (!value || !value.startsWith(`${SOURCE_DROP_TARGET_PREFIX}:`)) return null;

  const parts = value.split(":");
  if (parts.length !== 3) return null;

  return {
    nodeId: parts[1],
    handleId: parts[2],
  };
};

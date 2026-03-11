import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "./AuthProvider";
import {
  getWorkspaceContext,
  type WorkspaceContext,
} from "@/lib/teamManagement";
import { normalizeTeamErrorMessage } from "@/lib/teamManagementHelpers.js";

type WorkspaceContextValue = {
  workspace: WorkspaceContext | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  hasPermission: (permission: string) => boolean;
};

const WorkspaceContextObject = createContext<WorkspaceContextValue>({
  workspace: null,
  loading: true,
  error: null,
  refresh: async () => {},
  hasPermission: () => false,
});

export const WorkspaceProvider = ({ children }: { children: React.ReactNode }) => {
  const { user, loading: authLoading } = useAuth();
  const [workspace, setWorkspace] = useState<WorkspaceContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!user?.id) {
      setWorkspace(null);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    try {
      const nextWorkspace = await getWorkspaceContext();
      setWorkspace(nextWorkspace);
      setError(null);
    } catch (error) {
      const message = normalizeTeamErrorMessage(error) || "Failed to load workspace context.";
      console.error("Failed to load workspace context:", error);
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (authLoading) return;
    void refresh();
  }, [authLoading, refresh]);

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      workspace,
      loading,
      error,
      refresh,
      hasPermission: (permission: string) =>
        workspace?.permissions?.includes(permission) || false,
    }),
    [error, loading, refresh, workspace],
  );

  return <WorkspaceContextObject.Provider value={value}>{children}</WorkspaceContextObject.Provider>;
};

export const useWorkspace = () => useContext(WorkspaceContextObject);

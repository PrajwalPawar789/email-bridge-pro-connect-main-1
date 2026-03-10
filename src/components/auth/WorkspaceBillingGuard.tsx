import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '@/providers/AuthProvider';
import { useWorkspace } from '@/providers/WorkspaceProvider';

const WorkspaceBillingGuard = () => {
  const { user, loading: authLoading } = useAuth();
  const { workspace, loading: workspaceLoading } = useWorkspace();

  if (authLoading || workspaceLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-emerald-600" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  const canManageBilling = !workspace || workspace.role === 'owner' || workspace.canManageBilling;
  if (!canManageBilling) {
    return <Navigate to="/profile" replace />;
  }

  return <Outlet />;
};

export default WorkspaceBillingGuard;

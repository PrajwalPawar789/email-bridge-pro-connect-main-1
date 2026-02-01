import React, { useEffect, useRef, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/providers/AuthProvider";
import { fetchOnboardingStatus, OnboardingStatus } from "@/lib/onboarding";

export default function OnboardingGuard({ children }: { children?: React.ReactNode }) {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [checking, setChecking] = useState(true);
  const lastUserId = useRef<string | null>(null);

  useEffect(() => {
    let active = true;
    if (loading) return;

    if (!user) {
      navigate("/auth", { replace: true });
      return;
    }

    if (lastUserId.current === user.id && status) {
      setChecking(false);
      return;
    }

    setChecking(true);
    fetchOnboardingStatus(user.id)
      .then((result) => {
        if (active) setStatus(result);
      })
      .catch(() => {
        if (active) setStatus("missing");
      })
      .finally(() => {
        if (active) {
          lastUserId.current = user.id;
          setChecking(false);
        }
      });

    return () => {
      active = false;
    };
  }, [loading, user, navigate, status]);

  useEffect(() => {
    if (loading || checking) return;
    if (!user) return;
    if (status === "completed" || status === "skipped") return;
    if (location.pathname !== "/onboarding") {
      navigate("/onboarding", { replace: true });
    }
  }, [loading, checking, status, user, location.pathname, navigate]);

  if (loading || checking) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  if (status !== "completed" && status !== "skipped" && location.pathname !== "/onboarding") {
    return null;
  }

  return <>{children ?? <Outlet />}</>;
}

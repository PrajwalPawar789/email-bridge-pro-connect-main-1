import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "@/components/Layout/DashboardLayout";
import SupportWorkspace from "@/components/support/SupportWorkspace";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/providers/AuthProvider";

const Support = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth");
    }
  }, [loading, navigate, user]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <DashboardLayout
      activeTab="support"
      onTabChange={(tab) => {
        if (tab === "home") {
          navigate("/dashboard");
        } else if (tab === "campaigns") {
          navigate("/campaigns");
        } else if (tab === "automations") {
          navigate("/automations");
        } else if (tab === "pipeline") {
          navigate("/pipeline");
        } else if (
          tab === "contacts" ||
          tab === "segments" ||
          tab === "templates" ||
          tab === "connect" ||
          tab === "settings"
        ) {
          navigate(`/dashboard?tab=${tab}`);
        } else {
          navigate(`/${tab}`);
        }
      }}
      user={user}
      onLogout={handleLogout}
      contentClassName="max-w-none"
    >
      <SupportWorkspace user={user} />
    </DashboardLayout>
  );
};

export default Support;

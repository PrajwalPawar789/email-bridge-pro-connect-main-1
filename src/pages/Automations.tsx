import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import DashboardLayout from '@/components/Layout/DashboardLayout';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/providers/AuthProvider';

const Automations = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth');
    }
  }, [loading, user, navigate]);

  const handleTabChange = (tab: string) => {
    if (tab === 'home') {
      navigate('/dashboard');
    } else if (tab === 'campaigns') {
      navigate('/campaigns');
    } else if (tab === 'inbox') {
      navigate('/inbox');
    } else if (tab === 'automations') {
      navigate('/automations');
    } else if (
      tab === 'contacts' ||
      tab === 'segments' ||
      tab === 'templates' ||
      tab === 'connect' ||
      tab === 'settings'
    ) {
      navigate(`/dashboard?tab=${tab}`);
    } else {
      navigate(`/${tab}`);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/auth');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <DashboardLayout
      activeTab="automations"
      onTabChange={handleTabChange}
      user={user}
      onLogout={handleLogout}
    >
      <div className="max-w-3xl mx-auto">
        <Card className="border-[var(--shell-border)] bg-[var(--shell-surface)]">
          <CardHeader className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-2xl">Automations</CardTitle>
              <Badge variant="secondary">Coming soon</Badge>
            </div>
            <p className="text-sm text-[var(--shell-muted)]">
              Build multi-step workflows that trigger, wait, and respond to engagement.
            </p>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-[var(--shell-muted)]">
            <div className="rounded-lg border border-dashed border-[var(--shell-border)] bg-white/70 p-4">
              <p className="font-semibold text-[var(--shell-ink)]">Planned capabilities</p>
              <ul className="mt-2 space-y-1">
                <li>Trigger-based workflows for lists, tags, and segments.</li>
                <li>Send-window optimization and timing recommendations.</li>
                <li>Reply-driven routing and auto-replies.</li>
              </ul>
            </div>
            <p className="text-xs">
              Tell us which automation you want first and we will prioritize it.
            </p>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default Automations;

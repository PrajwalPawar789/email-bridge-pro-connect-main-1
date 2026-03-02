import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '@/components/Layout/DashboardLayout';
import { supabase } from '@/integrations/supabase/client';
import { handleDashboardTabNavigation } from '@/lib/dashboardNavigation';
import { useAuth } from '@/providers/AuthProvider';
import EmailBuilderPage from './EmailBuilderPage';

const EmailBuilder = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth');
    }
  }, [loading, user, navigate]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/auth');
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <DashboardLayout
      activeTab="email-builder"
      onTabChange={(tab) => handleDashboardTabNavigation(navigate, tab)}
      user={user}
      onLogout={handleLogout}
      contentClassName="max-w-none p-0"
    >
      <EmailBuilderPage />
    </DashboardLayout>
  );
};

export default EmailBuilder;

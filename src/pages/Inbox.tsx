import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import DashboardLayout from '@/components/Layout/DashboardLayout';
import InboxPage from '@/components/inbox/InboxPage';
import { useAuth } from '@/providers/AuthProvider';

const Inbox = () => {
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
      activeTab="inbox"
      onTabChange={(tab) => {
        if (tab === 'home') {
          navigate('/dashboard');
        } else if (tab === 'campaigns') {
          navigate('/campaigns');
        } else if (tab === 'automations') {
          navigate('/automations');
        } else if (tab === 'pipeline') {
          navigate('/pipeline');
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
      }}
      user={user}
      onLogout={handleLogout}
      contentClassName="max-w-[1400px]"
    >
      <InboxPage user={user} />
    </DashboardLayout>
  );
};

export default Inbox;

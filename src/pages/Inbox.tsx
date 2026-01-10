import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import DashboardLayout from '@/components/Layout/DashboardLayout';
import Mailbox from '@/components/Mailbox';

const Inbox = () => {
  const [user, setUser] = useState<any>(null);
  const [emailConfigs, setEmailConfigs] = useState<any[]>([]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setUser(session.user);
        fetchEmailConfigs(session.user.id);
      }
    });
  }, []);

  const fetchEmailConfigs = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('email_configs')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setEmailConfigs(data || []);
    } catch (error) {
      console.error('Error fetching email configs:', error);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/auth';
  };

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <DashboardLayout
      activeTab="inbox"
      onTabChange={(tab) => {
        if (tab === 'home') {
          window.location.href = '/dashboard';
        } else if (tab === 'campaigns') {
          window.location.href = '/campaigns';
        } else if (tab === 'automations' || tab === 'contacts' || tab === 'segments' || 
                   tab === 'templates' || tab === 'connect' || tab === 'settings') {
          window.location.href = '/dashboard';
        } else {
          window.location.href = `/${tab}`;
        }
      }}
      user={user}
      onLogout={handleLogout}
    >
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Inbox</h1>
            <p className="text-gray-600 mt-1">View and manage your email replies and conversations</p>
          </div>
        </div>

        <Mailbox emailConfigs={emailConfigs} />
      </div>
    </DashboardLayout>
  );
};

export default Inbox;
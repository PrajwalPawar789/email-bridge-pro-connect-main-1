import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import DashboardLayout from '@/components/Layout/DashboardLayout';
import CampaignList from '@/components/CampaignList';
import CampaignBuilder from '@/components/CampaignBuilder';

const Campaigns = () => {
  const [user, setUser] = useState<any>(null);
  const [emailConfigs, setEmailConfigs] = useState<any[]>([]);
  const [showBuilder, setShowBuilder] = useState(false);

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

  const handleCreateCampaign = () => {
    setShowBuilder(true);
  };

  const handleBackToList = () => {
    setShowBuilder(false);
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
      activeTab="campaigns"
      onTabChange={(tab) => {
        if (tab === 'home') {
          window.location.href = '/dashboard';
        } else if (tab === 'inbox') {
          window.location.href = '/inbox';
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
        {showBuilder ? (
          <div>
            <div className="flex items-center gap-4 mb-6">
              <button
                onClick={handleBackToList}
                className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
              >
                ← Back to Campaigns
              </button>
            </div>
            <CampaignBuilder emailConfigs={emailConfigs} />
          </div>
        ) : (
          <CampaignList onCreateCampaign={handleCreateCampaign} />
        )}
      </div>
    </DashboardLayout>
  );
};

export default Campaigns;
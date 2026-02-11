import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import DashboardLayout from '@/components/Layout/DashboardLayout';
import CampaignList from '@/components/CampaignList';
import CampaignBuilder from '@/components/CampaignBuilder';
import { useAuth } from '@/providers/AuthProvider';

const Campaigns = () => {
  const { user, loading } = useAuth();
  const [emailConfigs, setEmailConfigs] = useState<any[]>([]);
  const [showBuilder, setShowBuilder] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth');
    }
  }, [loading, user, navigate]);

  useEffect(() => {
    if (user) {
      fetchEmailConfigs(user.id);
    }
  }, [user]);

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
    navigate('/auth');
  };

  const handleCreateCampaign = () => {
    setShowBuilder(true);
  };

  const handleBackToList = () => {
    setShowBuilder(false);
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
      activeTab="campaigns"
      onTabChange={(tab) => {
        if (tab === 'home') {
          navigate('/dashboard');
        } else if (tab === 'inbox') {
          navigate('/inbox');
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
    >
      <div className="space-y-6">
        {showBuilder ? (
          <div>
            <div className="flex items-center gap-4 mb-6">
              <button
                onClick={handleBackToList}
                className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
              >
                Back to Campaigns
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

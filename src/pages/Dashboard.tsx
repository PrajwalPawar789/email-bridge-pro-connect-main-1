import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus } from 'lucide-react';
import EmailConfig from '@/components/EmailConfig';
import CampaignList from '@/components/CampaignList';
import CampaignBuilder from '@/components/CampaignBuilder';
import TemplateManager from '@/components/TemplateManager';
import Mailbox from '@/components/Mailbox';
import ProspectListManager from '@/components/ProspectListManager';
import EmailAnalyticsDashboard from '@/components/EmailAnalyticsDashboard';
import { toast } from '@/hooks/use-toast';
import DashboardLayout from '@/components/Layout/DashboardLayout';

const Dashboard = () => {
  const [user, setUser] = useState<any>(null);
  const [emailConfigs, setEmailConfigs] = useState([]);
  const [activeTab, setActiveTab] = useState('home');
  const navigate = useNavigate();

  useEffect(() => {
    // Check authentication
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        navigate('/auth');
      } else {
        setUser(session.user);
        fetchEmailConfigs();
      }
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session) {
        navigate('/auth');
      } else {
        setUser(session.user);
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const fetchEmailConfigs = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase
      .from('email_configs')
      .select('*')
      .eq('user_id', user.id);
    
    if (!error) {
      setEmailConfigs(data || []);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast({
      title: "Logged out",
      description: "You have been logged out successfully.",
    });
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const renderContent = () => {
    switch (activeTab) {
      case 'home':
      case 'analytics': return <EmailAnalyticsDashboard />;
      case 'campaigns': return <CampaignList onCreateCampaign={() => setActiveTab('builder')} />;
      case 'builder': return <CampaignBuilder emailConfigs={emailConfigs} />;
      case 'templates': return <TemplateManager />;
      case 'mailbox': return <Mailbox emailConfigs={emailConfigs} />;
      case 'config': return <EmailConfig onConfigAdded={fetchEmailConfigs} />;
      case 'contacts':
      case 'prospect-lists': return <ProspectListManager />;
      case 'settings': return <EmailConfig onConfigAdded={fetchEmailConfigs} />;
      case 'automations': return <div className="p-8 text-center text-gray-500">Automations feature coming soon</div>;
      case 'segments': return <div className="p-8 text-center text-gray-500">Segments feature coming soon</div>;
      case 'connect': return <div className="p-8 text-center text-gray-500">Connect site feature coming soon</div>;
      default: return <EmailAnalyticsDashboard />;
    }
  };

  return (
    <DashboardLayout 
      activeTab={activeTab} 
      onTabChange={setActiveTab} 
      user={user} 
      onLogout={handleLogout}
    >
      {emailConfigs.length === 0 && activeTab !== 'config' && activeTab !== 'settings' ? (
        <Card className="max-w-2xl mx-auto mt-8">
          <CardHeader>
            <CardTitle>Welcome to EmailBridge Pro!</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-600 mb-4">
              Get started by configuring your first email account.
            </p>
            <Button onClick={() => setActiveTab('config')}>
              <Plus className="h-4 w-4 mr-2" />
              Add Email Configuration
            </Button>
          </CardContent>
        </Card>
      ) : (
        renderContent()
      )}
    </DashboardLayout>
  );
};

export default Dashboard;

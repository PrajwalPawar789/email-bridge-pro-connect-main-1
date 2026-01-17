import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
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
import { useAuth } from '@/providers/AuthProvider';

const normalizeTab = (tab: string) => {
  if (tab === 'analytics') return 'home';
  if (tab === 'prospect-lists') return 'contacts';
  if (tab === 'settings') return 'config';
  return tab;
};

const Dashboard = () => {
  const { user, loading } = useAuth();
  const [emailConfigs, setEmailConfigs] = useState([]);
  const [searchParams, setSearchParams] = useSearchParams();
  const getInitialTab = () => {
    const tabParam = searchParams.get('tab');
    if (tabParam === 'config') return 'settings';
    return tabParam || 'home';
  };
  const [activeTab, setActiveTab] = useState(getInitialTab);
  const normalizedActiveTab = normalizeTab(activeTab);
  const [mountedTabs, setMountedTabs] = useState<string[]>(() => [normalizedActiveTab]);
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth');
    }
  }, [loading, user, navigate]);

  useEffect(() => {
    if (user) {
      fetchEmailConfigs();
    }
  }, [user]);

  useEffect(() => {
    setMountedTabs((prev) => (
      prev.includes(normalizedActiveTab) ? prev : [...prev, normalizedActiveTab]
    ));
  }, [normalizedActiveTab]);

  useEffect(() => {
    const tabParam = searchParams.get('tab');
    const nextTab = tabParam === 'config' ? 'settings' : (tabParam || 'home');
    if (nextTab !== activeTab) {
      setActiveTab(nextTab);
    }
  }, [searchParams, activeTab]);

  const fetchEmailConfigs = async () => {
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

  const handleTabChange = (tab: string) => {
    if (tab === 'campaigns') {
      navigate('/campaigns');
      return;
    }

    if (tab === 'inbox') {
      navigate('/inbox');
      return;
    }

    if (tab === 'automations') {
      navigate('/automations');
      return;
    }

    setActiveTab(tab);
    if (tab === 'home') {
      setSearchParams({});
    } else {
      setSearchParams({ tab });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const comingSoon = (label: string) => (
    <div className="p-8 text-center text-gray-500">{label} feature coming soon</div>
  );

  const tabContents: Record<string, React.ReactNode> = {
    home: <EmailAnalyticsDashboard />,
    builder: <CampaignBuilder emailConfigs={emailConfigs} />,
    templates: <TemplateManager />,
    mailbox: <Mailbox emailConfigs={emailConfigs} />,
    config: <EmailConfig onConfigAdded={fetchEmailConfigs} />,
    contacts: <ProspectListManager />,
    automations: comingSoon('Automations'),
    segments: comingSoon('Segments'),
    connect: comingSoon('Connect site')
  };

  return (
    <DashboardLayout 
      activeTab={activeTab} 
      onTabChange={handleTabChange} 
      user={user} 
      onLogout={handleLogout}
    >
      {emailConfigs.length === 0 && activeTab !== 'config' && activeTab !== 'settings' ? (
        <Card className="max-w-3xl mx-auto mt-8">
          <CardHeader className="space-y-2">
            <CardTitle>Welcome to EmailBridge Pro!</CardTitle>
            <p className="text-sm text-gray-600">
              Connect your first inbox to start sending campaigns and tracking replies.
            </p>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-gray-900">Quick start</h3>
                <ol className="list-decimal list-inside text-sm text-gray-600 space-y-1">
                  <li>Add an email account (SMTP + IMAP).</li>
                  <li>Build a campaign or template.</li>
                  <li>Monitor replies in Inbox and Analytics.</li>
                </ol>
                <p className="text-xs text-gray-500">
                  You can add more inboxes later from Email Configuration.
                </p>
              </div>
              <div className="rounded-lg border bg-gray-50 p-4">
                <h3 className="text-sm font-semibold text-gray-900 mb-2">Have this ready</h3>
                <ul className="text-sm text-gray-600 space-y-1">
                  <li>Email address and password.</li>
                  <li>SMTP host and port (we prefill common providers).</li>
                  <li>IMAP host and port for replies.</li>
                </ul>
                <p className="text-xs text-gray-500 mt-3">
                  Gmail users: you'll need an App Password instead of your normal password.
                </p>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <Button onClick={() => handleTabChange('settings')} className="sm:w-auto">
                <Plus className="h-4 w-4 mr-2" />
                Add Email Configuration
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        mountedTabs.map((tabKey) => (
          <section key={tabKey} hidden={tabKey !== normalizedActiveTab}>
            {tabContents[tabKey] ?? tabContents.home}
          </section>
        ))
      )}
    </DashboardLayout>
  );
};

export default Dashboard;

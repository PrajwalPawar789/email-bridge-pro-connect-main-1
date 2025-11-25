import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Mail, Send, Settings, LogOut, Plus, FileText, BarChart3 } from 'lucide-react';
import EmailConfig from '@/components/EmailConfig';
import CampaignList from '@/components/CampaignList';
import CampaignBuilder from '@/components/CampaignBuilder';
import TemplateManager from '@/components/TemplateManager';
import Mailbox from '@/components/Mailbox';
import ProspectListManager from '@/components/ProspectListManager';
import EmailAnalyticsDashboard from '@/components/EmailAnalyticsDashboard';
import { toast } from '@/hooks/use-toast';

const Dashboard = () => {
  const [user, setUser] = useState<any>(null);
  const [emailConfigs, setEmailConfigs] = useState([]);
  const [activeTab, setActiveTab] = useState('analytics');
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
    const { data, error } = await supabase
      .from('email_configs')
      .select('*');
    
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

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-4">
              <Mail className="h-8 w-8 text-blue-600" />
              <h1 className="text-xl font-bold text-gray-900">EmailBridge Pro</h1>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-600">{user.email}</span>
              <Button variant="outline" size="sm" onClick={handleLogout}>
                <LogOut className="h-4 w-4 mr-2" />
                Logout
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {emailConfigs.length === 0 ? (
          <Card className="max-w-2xl mx-auto">
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
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
            <TabsList className="grid w-full grid-cols-7">
              <TabsTrigger value="analytics" className="flex items-center space-x-2">
                <BarChart3 className="h-4 w-4" />
                <span>Analytics</span>
              </TabsTrigger>
              <TabsTrigger value="campaigns" className="flex items-center space-x-2">
                <Send className="h-4 w-4" />
                <span>Campaigns</span>
              </TabsTrigger>
              <TabsTrigger value="builder" className="flex items-center space-x-2">
                <Plus className="h-4 w-4" />
                <span>Create</span>
              </TabsTrigger>
              <TabsTrigger value="templates" className="flex items-center space-x-2">
                <FileText className="h-4 w-4" />
                <span>Templates</span>
              </TabsTrigger>
              <TabsTrigger value="mailbox" className="flex items-center space-x-2">
                <Mail className="h-4 w-4" />
                <span>Mailbox</span>
              </TabsTrigger>
              <TabsTrigger value="config" className="flex items-center space-x-2">
                <Settings className="h-4 w-4" />
                <span>Settings</span>
              </TabsTrigger>
              <TabsTrigger value="prospect-lists" className="flex items-center space-x-2">
                <Plus className="h-4 w-4" />
                <span>Prospect Lists</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="analytics">
              <EmailAnalyticsDashboard />
            </TabsContent>

            <TabsContent value="campaigns">
              <CampaignList />
            </TabsContent>

            <TabsContent value="builder">
              <CampaignBuilder emailConfigs={emailConfigs} />
            </TabsContent>

            <TabsContent value="templates">
              <TemplateManager />
            </TabsContent>

            <TabsContent value="mailbox">
              <Mailbox emailConfigs={emailConfigs} />
            </TabsContent>

            <TabsContent value="config">
              <EmailConfig onConfigAdded={fetchEmailConfigs} />
            </TabsContent>

            <TabsContent value="prospect-lists">
              <ProspectListManager />
            </TabsContent>
          </Tabs>
        )}
      </main>
    </div>
  );
};

export default Dashboard;

import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/hooks/use-toast';
import { 
  Plus, Clock, Info, Trash2, ArrowRight, ArrowLeft, CheckCircle2, 
  Users, Mail, Send, FileText, Settings, LayoutTemplate, Calendar
} from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

interface CampaignBuilderProps {
  emailConfigs: any[];
}

interface FollowupStep {
  step_number: number;
  delay_days: number;
  delay_hours: number;
  subject: string;
  body: string;
  template_id?: string;
}

const STEPS = [
  { id: 1, title: 'Setup', icon: Settings, description: 'Name & Configuration' },
  { id: 2, title: 'Audience', icon: Users, description: 'Select Recipients' },
  { id: 3, title: 'Content', icon: Mail, description: 'Email Message' },
  { id: 4, title: 'Follow-ups', icon: Calendar, description: 'Sequence Steps' },
  { id: 5, title: 'Review', icon: CheckCircle2, description: 'Final Check' },
];

const SUPABASE_PROJECT_URL = "https://lyerkyijpavilyufcrgb.supabase.co";

const generateOpenLink = (supabaseUrl: string, campaignId: string, recipientId: string) =>
  `${supabaseUrl}/functions/v1/track-email-open?campaign_id=${encodeURIComponent(
    campaignId
  )}&recipient_id=${encodeURIComponent(recipientId)}`;

const generateClickLink = (
  supabaseUrl: string,
  campaignId: string,
  recipientId: string,
  url: string
) =>
  `${supabaseUrl}/functions/v1/track-email-click?campaign_id=${encodeURIComponent(
    campaignId
  )}&recipient_id=${encodeURIComponent(recipientId)}&url=${encodeURIComponent(url)}`;

const CampaignBuilder: React.FC<CampaignBuilderProps> = ({ emailConfigs }) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [form, setForm] = useState({
    name: '',
    subject: '',
    content: '',
    send_delay_minutes: 3, // Default to 3 mins for better deliverability
    is_html: false
  });
  const [selectedConfigs, setSelectedConfigs] = useState<{ configId: string; dailyLimit: number }[]>([]);
  const [recipients, setRecipients] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [templates, setTemplates] = useState<any[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [selectedListId, setSelectedListId] = useState<string>('');
  const [allLists, setAllLists] = useState<{ id: string, name: string }[]>([]);
  const [followups, setFollowups] = useState<FollowupStep[]>([]);
  const [listCount, setListCount] = useState(0);
  const [audienceType, setAudienceType] = useState<'list' | 'manual'>('list');
  const [scheduledAt, setScheduledAt] = useState<string>('');

  useEffect(() => {
    fetchTemplates();
    fetchLists();
  }, []);

  useEffect(() => {
    if (selectedListId) {
      const fetchCount = async () => {
        const { count } = await supabase
          .from('email_list_prospects')
          .select('*', { count: 'exact', head: true })
          .eq('list_id', selectedListId);
        setListCount(count || 0);
      };
      fetchCount();
    } else {
      setListCount(0);
    }
  }, [selectedListId]);

  const fetchTemplates = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('email_templates')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      setTemplates(data || []);
    } catch (error: any) {
      console.error('Error fetching templates:', error);
    }
  };

  const fetchLists = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase
      .from('email_lists')
      .select('id, name')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    if (!error && data) setAllLists(data);
  };

  const handleTemplateSelect = (templateId: string) => {
    const template = templates.find(t => t.id === templateId);
    if (template) {
      setForm({
        ...form,
        subject: template.subject,
        content: template.content,
        is_html: false 
      });
    }
    setSelectedTemplate(templateId);
  };

  const addFollowupStep = () => {
    setFollowups([...followups, {
      step_number: followups.length + 1,
      delay_days: 3,
      delay_hours: 0,
      subject: '',
      body: '',
    }]);
  };

  const removeFollowupStep = (index: number) => {
    const newFollowups = [...followups];
    newFollowups.splice(index, 1);
    newFollowups.forEach((f, i) => f.step_number = i + 1);
    setFollowups(newFollowups);
  };

  const updateFollowupStep = (index: number, field: keyof FollowupStep, value: any) => {
    const newFollowups = [...followups];
    newFollowups[index] = { ...newFollowups[index], [field]: value };
    setFollowups(newFollowups);
  };

  const handleFollowupTemplateSelect = (index: number, templateId: string) => {
    const template = templates.find(t => t.id === templateId);
    if (template) {
      const newFollowups = [...followups];
      newFollowups[index] = {
        ...newFollowups[index],
        subject: template.subject,
        body: template.content,
        template_id: templateId
      };
      setFollowups(newFollowups);
    }
  };

  const validateStep = (step: number) => {
    switch (step) {
      case 1: // Setup
        if (!form.name) {
          toast({ title: "Missing Information", description: "Please enter a campaign name.", variant: "destructive" });
          return false;
        }
        if (selectedConfigs.length === 0) {
          toast({ title: "Missing Information", description: "Please select at least one sender account.", variant: "destructive" });
          return false;
        }
        return true;
      case 2: // Audience
        if (audienceType === 'list' && !selectedListId) {
          toast({ title: "Missing Information", description: "Please select an email list.", variant: "destructive" });
          return false;
        }
        if (audienceType === 'manual' && !recipients.trim()) {
          toast({ title: "Missing Information", description: "Please enter at least one recipient.", variant: "destructive" });
          return false;
        }
        return true;
      case 3: // Content
        if (!form.subject) {
          toast({ title: "Missing Information", description: "Please enter a subject line.", variant: "destructive" });
          return false;
        }
        if (!form.content) {
          toast({ title: "Missing Information", description: "Please enter email content.", variant: "destructive" });
          return false;
        }
        return true;
      default:
        return true;
    }
  };

  const handleNext = () => {
    if (validateStep(currentStep)) {
      setCurrentStep(prev => Math.min(prev + 1, STEPS.length));
    }
  };

  const handleBack = () => {
    setCurrentStep(prev => Math.max(prev - 1, 1));
  };

  const handleSave = async (isDraft = true) => {
    const statusToUse = scheduledAt ? 'scheduled' : (isDraft ? 'draft' : 'ready');
    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Create campaign
      const { data: campaign, error: campaignError } = await supabase
        .from('campaigns')
        .insert({
          user_id: user.id,
          name: form.name,
          subject: form.subject,
          body: form.content,
          status: statusToUse,
          send_delay_minutes: form.send_delay_minutes,
          email_config_id: selectedConfigs[0].configId,
          email_list_id: selectedListId || null,
          scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null,
        })
        .select()
        .single();

      if (campaignError) throw campaignError;

      // Save Campaign Email Configurations
      const configInserts = selectedConfigs.map(c => ({
        campaign_id: campaign.id,
        email_config_id: c.configId,
        daily_limit: c.dailyLimit
      }));

      await supabase.from('campaign_email_configurations' as any).insert(configInserts);

      // Save Follow-ups
      if (followups.length > 0) {
        const followupInserts = followups.map(f => ({
          campaign_id: campaign.id,
          step_number: f.step_number,
          delay_days: f.delay_days,
          delay_hours: f.delay_hours,
          subject: f.subject || null,
          body: f.body,
          template_id: f.template_id || null
        }));
        await supabase.from('campaign_followups').insert(followupInserts);
      }

      // Helper to assign config
      const assignConfig = (index: number) => {
        return selectedConfigs[index % selectedConfigs.length].configId;
      };

      // Process Recipients
      if (selectedListId) {
        const { data: listProspects } = await supabase
          .from('email_list_prospects')
          .select(`prospects (id, email, name, company)`)
          .eq('list_id', selectedListId);

        if (listProspects && listProspects.length > 0) {
          const validProspects = listProspects
            .map(item => item.prospects)
            .filter(prospect => prospect && prospect.email && prospect.email.trim());

          const uniqueProspects = validProspects.filter((prospect, index, self) => {
            const currentEmail = prospect.email.toLowerCase().trim();
            return index === self.findIndex(p => p.email.toLowerCase().trim() === currentEmail);
          });

          const recipientsInserts = uniqueProspects.map((prospect, index) => ({
            campaign_id: campaign.id,
            email: prospect.email.trim().toLowerCase(),
            name: prospect.name || '',
            status: 'pending' as const,
            assigned_email_config_id: assignConfig(index)
          }));

          const { data: insertedRecipients } = await supabase
            .from('recipients')
            .insert(recipientsInserts)
            .select();

          if (insertedRecipients && insertedRecipients.length > 0) {
            await Promise.all(
              insertedRecipients.map(async (recip) => {
                const openLink = generateOpenLink(SUPABASE_PROJECT_URL, campaign.id, recip.id);
                const clickLink = generateClickLink(SUPABASE_PROJECT_URL, campaign.id, recip.id, "https://example.com");
                await supabase
                  .from('recipients')
                  .update({ track_open_link: openLink, track_click_link: clickLink })
                  .eq('id', recip.id);
              })
            );
            await supabase.from('campaigns').update({ total_recipients: insertedRecipients.length }).eq('id', campaign.id);
          }
        }
      } else if (recipients.trim()) {
        const recipientList = recipients.split('\n')
          .map(line => {
            const [email, name] = line.split(',').map(s => s.trim());
            return { email: email?.toLowerCase() || '', name: name || '' };
          })
          .filter(r => r.email && r.email.includes('@'));

        if (recipientList.length > 0) {
          const uniqueRecipients = recipientList.filter((recipient, index, self) => 
            index === self.findIndex(r => r.email === recipient.email)
          );

          const { data: insertedRecipients } = await supabase
            .from('recipients')
            .insert(uniqueRecipients.map((r, index) => ({
              campaign_id: campaign.id,
              email: r.email,
              name: r.name,
              status: 'pending',
              assigned_email_config_id: assignConfig(index)
            })))
            .select();

          if (insertedRecipients && insertedRecipients.length > 0) {
            await Promise.all(
              insertedRecipients.map(async (recip) => {
                const openLink = generateOpenLink(SUPABASE_PROJECT_URL, campaign.id, recip.id);
                const clickLink = generateClickLink(SUPABASE_PROJECT_URL, campaign.id, recip.id, "https://example.com");
                await supabase
                  .from('recipients')
                  .update({ track_open_link: openLink, track_click_link: clickLink })
                  .eq('id', recip.id);
              })
            );
            await supabase.from('campaigns').update({ total_recipients: insertedRecipients.length }).eq('id', campaign.id);
          }
        }
      }

      toast({
        title: "Success",
        description: `Campaign ${isDraft ? 'saved as draft' : 'launched successfully'}!`,
      });

      // Reset form
      setForm({ name: '', subject: '', content: '', send_delay_minutes: 3, is_html: false });
      setSelectedConfigs([]);
      setRecipients('');
      setSelectedTemplate('');
      setSelectedListId('');
      setFollowups([]);
      setCurrentStep(1);
    } catch (error: any) {
      console.error('Error creating campaign:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to create campaign",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const renderStepIndicator = () => (
    <div className="mb-8">
      <div className="flex items-center justify-between relative">
        <div className="absolute left-0 top-1/2 transform -translate-y-1/2 w-full h-1 bg-gray-200 -z-10" />
        {STEPS.map((step) => {
          const isActive = step.id === currentStep;
          const isCompleted = step.id < currentStep;
          
          return (
            <div key={step.id} className="flex flex-col items-center bg-white px-2">
              <div 
                className={`
                  w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all duration-200
                  ${isActive ? 'border-blue-600 bg-blue-50 text-blue-600' : 
                    isCompleted ? 'border-green-500 bg-green-50 text-green-500' : 'border-gray-300 text-gray-400'}
                `}
              >
                {isCompleted ? <CheckCircle2 className="h-6 w-6" /> : <step.icon className="h-5 w-5" />}
              </div>
              <span className={`text-xs font-medium mt-2 ${isActive ? 'text-blue-600' : 'text-gray-500'}`}>
                {step.title}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );

  const renderSetupStep = () => (
    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name" className="text-base">Campaign Name</Label>
            <Input
              id="name"
              placeholder="e.g., Q4 Outreach - Tech Startups"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="h-11"
            />
            <p className="text-xs text-gray-500">Give your campaign a descriptive name to track it easily.</p>
          </div>

          <div className="space-y-2">
            <Label className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Sending Speed (Delay)
            </Label>
            <Select 
              value={form.send_delay_minutes.toString()} 
              onValueChange={(value) => setForm({ ...form, send_delay_minutes: parseInt(value) })}
            >
              <SelectTrigger className="h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Fast (1 min gap)</SelectItem>
                <SelectItem value="3">Recommended (3 min gap)</SelectItem>
                <SelectItem value="5">Safe (5 min gap)</SelectItem>
                <SelectItem value="10">Very Safe (10 min gap)</SelectItem>
                <SelectItem value="30">Slow (30 min gap)</SelectItem>
                <SelectItem value="60">Very Slow (1 hour gap)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-gray-500">Longer delays improve deliverability and reduce spam risk.</p>
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-base">Sender Accounts</Label>
          <Card className="h-[300px] flex flex-col">
            <ScrollArea className="flex-1 p-4">
              <div className="space-y-4">
                {emailConfigs.map((config) => {
                  const isSelected = selectedConfigs.some(c => c.configId === config.id);
                  const selectedConfig = selectedConfigs.find(c => c.configId === config.id);
                  
                  return (
                    <div key={config.id} className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${isSelected ? 'bg-blue-50 border-blue-200' : 'hover:bg-gray-50'}`}>
                      <div className="flex items-center space-x-3">
                        <Checkbox 
                          id={`config-${config.id}`}
                          checked={isSelected}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setSelectedConfigs([...selectedConfigs, { configId: config.id, dailyLimit: 100 }]);
                            } else {
                              setSelectedConfigs(selectedConfigs.filter(c => c.configId !== config.id));
                            }
                          }}
                        />
                        <div className="flex flex-col">
                          <Label htmlFor={`config-${config.id}`} className="font-medium cursor-pointer">
                            {config.smtp_username}
                          </Label>
                          <span className="text-xs text-gray-500">{config.smtp_host}</span>
                        </div>
                      </div>
                      {isSelected && (
                        <div className="flex items-center gap-2">
                          <Label className="text-xs whitespace-nowrap text-gray-500">Limit:</Label>
                          <Input 
                            type="number" 
                            className="w-16 h-8 text-center" 
                            value={selectedConfig?.dailyLimit || 100}
                            onChange={(e) => {
                              const limit = parseInt(e.target.value) || 0;
                              setSelectedConfigs(selectedConfigs.map(c => 
                                c.configId === config.id ? { ...c, dailyLimit: limit } : c
                              ));
                            }}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
            <div className="p-4 border-t bg-gray-50 rounded-b-lg">
              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-600">Total Daily Capacity:</span>
                <span className="font-bold text-blue-600">{selectedConfigs.reduce((acc, curr) => acc + curr.dailyLimit, 0)} emails/day</span>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );

  const renderAudienceStep = () => (
    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
      <Tabs value={audienceType} onValueChange={(v: any) => setAudienceType(v)} className="w-full">
        <TabsList className="grid w-full grid-cols-2 mb-6">
          <TabsTrigger value="list">Select Existing List</TabsTrigger>
          <TabsTrigger value="manual">Manual Entry</TabsTrigger>
        </TabsList>
        
        <TabsContent value="list" className="space-y-4">
          <div className="space-y-2">
            <Label>Choose a Prospect List</Label>
            <Select value={selectedListId} onValueChange={setSelectedListId}>
              <SelectTrigger className="h-12">
                <SelectValue placeholder="Select a list..." />
              </SelectTrigger>
              <SelectContent>
                {allLists.map(list => (
                  <SelectItem key={list.id} value={list.id}>{list.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          {selectedListId && (
            <Card className="bg-blue-50 border-blue-200">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="bg-blue-100 p-3 rounded-full">
                  <Users className="h-6 w-6 text-blue-600" />
                </div>
                <div>
                  <p className="font-medium text-blue-900">List Summary</p>
                  <p className="text-sm text-blue-700">{listCount} prospects found in this list.</p>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="manual" className="space-y-4">
          <div className="space-y-2">
            <Label>Enter Recipients</Label>
            <Textarea
              placeholder="email@example.com, Name&#10;another@example.com, John Doe"
              className="min-h-[200px] font-mono text-sm"
              value={recipients}
              onChange={(e) => setRecipients(e.target.value)}
            />
            <p className="text-xs text-gray-500">Format: email, name (one per line)</p>
          </div>
        </TabsContent>
      </Tabs>

      {/* Estimation Logic */}
      {((audienceType === 'list' && selectedListId) || (audienceType === 'manual' && recipients)) && selectedConfigs.length > 0 && (
        <div className="flex items-center gap-2 text-sm text-gray-600 bg-gray-100 p-3 rounded-md">
          <Info className="h-4 w-4" />
          {(() => {
            const totalRecipients = audienceType === 'list' ? listCount : recipients.split('\n').filter(r => r.trim()).length;
            const totalDailyLimit = selectedConfigs.reduce((acc, curr) => acc + curr.dailyLimit, 0);
            const estimatedDays = totalDailyLimit > 0 ? Math.ceil(totalRecipients / totalDailyLimit) : 0;
            return (
              <span>
                Estimated campaign duration: <strong>{estimatedDays} day{estimatedDays !== 1 ? 's' : ''}</strong> to reach {totalRecipients} recipients.
              </span>
            );
          })()}
        </div>
      )}
    </div>
  );

  const renderContentStep = () => (
    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
      <div className="flex gap-6">
        <div className="flex-1 space-y-6">
          {templates.length > 0 && (
            <div className="space-y-2">
              <Label>Load Template (Optional)</Label>
              <Select value={selectedTemplate} onValueChange={handleTemplateSelect}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a template..." />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((template) => (
                    <SelectItem key={template.id} value={template.id}>
                      {template.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="subject">Subject Line</Label>
            <Input
              id="subject"
              placeholder="Quick question for {company}..."
              value={form.subject}
              onChange={(e) => setForm({ ...form, subject: e.target.value })}
              className="h-11 font-medium"
            />
          </div>

          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <Label htmlFor="content">Email Body</Label>
              <div className="flex items-center space-x-2">
                <Switch
                  id="html-toggle"
                  checked={form.is_html}
                  onCheckedChange={(checked) => setForm({ ...form, is_html: checked })}
                />
                <Label htmlFor="html-toggle" className="text-xs font-normal text-gray-500">
                  {form.is_html ? 'HTML Mode' : 'Plain Text'}
                </Label>
              </div>
            </div>
            <Textarea
              id="content"
              placeholder={form.is_html ? "HTML content here..." : "Hi {first_name},\n\nI noticed that..."}
              className="min-h-[300px] font-mono text-sm leading-relaxed"
              value={form.content}
              onChange={(e) => setForm({ ...form, content: e.target.value })}
            />
          </div>
        </div>

        {/* Variables Sidebar */}
        <div className="w-64 hidden md:block space-y-4">
          <Card className="bg-gray-50">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <LayoutTemplate className="h-4 w-4" />
                Variables
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs">
              <div className="p-2 bg-white rounded border cursor-pointer hover:border-blue-400 transition-colors" onClick={() => setForm(f => ({...f, content: f.content + '{first_name}'}))}>
                <span className="font-mono font-bold">{'{first_name}'}</span>
                <p className="text-gray-500">First Name</p>
              </div>
              <div className="p-2 bg-white rounded border cursor-pointer hover:border-blue-400 transition-colors" onClick={() => setForm(f => ({...f, content: f.content + '{company}'}))}>
                <span className="font-mono font-bold">{'{company}'}</span>
                <p className="text-gray-500">Company Name</p>
              </div>
              <div className="p-2 bg-white rounded border cursor-pointer hover:border-blue-400 transition-colors" onClick={() => setForm(f => ({...f, content: f.content + '{email}'}))}>
                <span className="font-mono font-bold">{'{email}'}</span>
                <p className="text-gray-500">Email Address</p>
              </div>
              <div className="p-2 bg-white rounded border cursor-pointer hover:border-blue-400 transition-colors" onClick={() => setForm(f => ({...f, content: f.content + '{domain}'}))}>
                <span className="font-mono font-bold">{'{domain}'}</span>
                <p className="text-gray-500">Website Domain</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );

  const renderFollowupsStep = () => (
    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-medium">Follow-up Sequence</h3>
          <p className="text-sm text-gray-500">Automate replies if recipients don't respond.</p>
        </div>
        <Button onClick={addFollowupStep} variant="outline" className="border-dashed">
          <Plus className="h-4 w-4 mr-2" />
          Add Step
        </Button>
      </div>

      {followups.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed rounded-lg bg-gray-50">
          <Mail className="h-12 w-12 mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500 font-medium">No follow-ups configured</p>
          <p className="text-sm text-gray-400 mb-4">Add a follow-up to increase response rates.</p>
          <Button onClick={addFollowupStep} variant="secondary">Add First Follow-up</Button>
        </div>
      ) : (
        <div className="space-y-4">
          {followups.map((step, index) => (
            <Card key={index} className="relative overflow-hidden">
              <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-500" />
              <CardHeader className="pb-2 pt-4">
                <div className="flex justify-between items-center">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Badge variant="secondary">Step {step.step_number}</Badge>
                    <span className="text-sm font-normal text-gray-500">
                      Wait {step.delay_days} days, {step.delay_hours} hours
                    </span>
                  </CardTitle>
                  <Button variant="ghost" size="icon" onClick={() => removeFollowupStep(index)} className="text-gray-400 hover:text-red-500">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs">Wait Days</Label>
                    <Input 
                      type="number" min="0"
                      value={step.delay_days}
                      onChange={(e) => updateFollowupStep(index, 'delay_days', parseInt(e.target.value) || 0)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Wait Hours</Label>
                    <Input 
                      type="number" min="0" max="23"
                      value={step.delay_hours}
                      onChange={(e) => updateFollowupStep(index, 'delay_hours', parseInt(e.target.value) || 0)}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Message Body</Label>
                  <Textarea 
                    placeholder="Just bumping this to the top of your inbox..."
                    className="min-h-[100px]"
                    value={step.body}
                    onChange={(e) => updateFollowupStep(index, 'body', e.target.value)}
                  />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );

  const renderReviewStep = () => (
    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Campaign Overview</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="flex justify-between py-2 border-b">
              <span className="text-gray-500">Name</span>
              <span className="font-medium">{form.name}</span>
            </div>
            <div className="flex justify-between py-2 border-b">
              <span className="text-gray-500">Senders</span>
              <span className="font-medium">{selectedConfigs.length} accounts</span>
            </div>
            <div className="flex justify-between py-2 border-b">
              <span className="text-gray-500">Daily Limit</span>
              <span className="font-medium">{selectedConfigs.reduce((acc, curr) => acc + curr.dailyLimit, 0)} emails/day</span>
            </div>
            <div className="flex justify-between py-2 border-b">
              <span className="text-gray-500">Delay</span>
              <span className="font-medium">{form.send_delay_minutes} minutes</span>
            </div>
            <div className="flex justify-between py-2 border-b">
              <span className="text-gray-500">Follow-ups</span>
              <span className="font-medium">{followups.length} steps</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Audience Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="flex justify-between py-2 border-b">
              <span className="text-gray-500">Source</span>
              <span className="font-medium capitalize">{audienceType}</span>
            </div>
            <div className="flex justify-between py-2 border-b">
              <span className="text-gray-500">Total Recipients</span>
              <span className="font-medium">
                {audienceType === 'list' ? listCount : recipients.split('\n').filter(r => r.trim()).length}
              </span>
            </div>
            <div className="mt-4 p-3 bg-yellow-50 text-yellow-800 rounded-md text-xs">
              <p><strong>Note:</strong> Emails will be queued immediately upon launch. Ensure your sender accounts are warmed up.</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Schedule Campaign</CardTitle>
          <CardDescription>Optionally schedule this campaign to start at a later time.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col space-y-2">
            <Label htmlFor="scheduledAt">Start Date & Time</Label>
            <Input
              id="scheduledAt"
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              className="max-w-md"
            />
            <p className="text-sm text-muted-foreground">
              Leave blank to start immediately when you click "Launch Campaign".
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Content Preview</CardTitle>
          <CardDescription>Subject: {form.subject}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="bg-gray-50 p-4 rounded-md border min-h-[150px] whitespace-pre-wrap text-sm">
            {form.content || <span className="text-gray-400 italic">No content...</span>}
          </div>
        </CardContent>
      </Card>
    </div>
  );

  return (
    <div className="max-w-5xl mx-auto py-8 px-4">
      {renderStepIndicator()}

      <div className="mb-8">
        {currentStep === 1 && renderSetupStep()}
        {currentStep === 2 && renderAudienceStep()}
        {currentStep === 3 && renderContentStep()}
        {currentStep === 4 && renderFollowupsStep()}
        {currentStep === 5 && renderReviewStep()}
      </div>

      <div className="flex justify-between items-center pt-6 border-t">
        <Button
          variant="outline"
          onClick={handleBack}
          disabled={currentStep === 1 || loading}
          className="w-32"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>

        <div className="flex gap-3">
          {currentStep === 5 && (
            <Button 
              variant="outline" 
              onClick={() => handleSave(true)}
              disabled={loading}
            >
              Save Draft
            </Button>
          )}
          
          {currentStep < 5 ? (
            <Button onClick={handleNext} className="w-32">
              Next
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          ) : (
            <Button onClick={() => handleSave(false)} disabled={loading} className="w-40 bg-green-600 hover:bg-green-700">
              <Send className="h-4 w-4 mr-2" />
              {loading ? 'Launching...' : 'Launch Campaign'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default CampaignBuilder;

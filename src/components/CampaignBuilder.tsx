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
  Users, Mail, Send, FileText, Settings, LayoutTemplate, Calendar,
  ChevronRight, UserPlus, AlertCircle, Eye, Zap
} from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { cn } from '@/lib/utils';

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
      <div className="flex items-center justify-between relative max-w-3xl mx-auto">
        <div className="absolute left-0 top-1/2 transform -translate-y-1/2 w-full h-0.5 bg-gray-100 -z-10" />
        {STEPS.map((step) => {
          const isActive = step.id === currentStep;
          const isCompleted = step.id < currentStep;
          
          return (
            <div key={step.id} className="flex flex-col items-center bg-white px-4">
              <div 
                className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all duration-300 shadow-sm",
                  isActive ? "border-blue-600 bg-blue-600 text-white scale-110" : 
                  isCompleted ? "border-green-500 bg-green-500 text-white" : "border-gray-200 text-gray-400 bg-white"
                )}
              >
                {isCompleted ? <CheckCircle2 className="h-5 w-5" /> : <step.icon className="h-5 w-5" />}
              </div>
              <span className={cn(
                "text-xs font-medium mt-2 transition-colors duration-300",
                isActive ? "text-blue-600" : isCompleted ? "text-green-600" : "text-gray-400"
              )}>
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
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5 text-blue-500" />
                Campaign Details
              </CardTitle>
              <CardDescription>Basic information about your outreach campaign.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Campaign Name</Label>
                <Input
                  id="name"
                  placeholder="e.g., Q4 Outreach - Tech Startups"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="h-11"
                />
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2">
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
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5 text-blue-500" />
                Sender Accounts
              </CardTitle>
              <CardDescription>Select which email accounts to send from.</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[250px] pr-4">
                <div className="space-y-3">
                  {emailConfigs.map((config) => {
                    const isSelected = selectedConfigs.some(c => c.configId === config.id);
                    const selectedConfig = selectedConfigs.find(c => c.configId === config.id);
                    
                    return (
                      <div 
                        key={config.id} 
                        className={cn(
                          "flex items-center justify-between p-3 rounded-lg border transition-all",
                          isSelected ? "bg-blue-50 border-blue-200 shadow-sm" : "hover:bg-gray-50 border-gray-200"
                        )}
                      >
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
                          <div className="flex items-center gap-2 bg-white px-2 py-1 rounded border">
                            <Label className="text-xs whitespace-nowrap text-gray-500">Limit:</Label>
                            <Input 
                              type="number" 
                              className="w-16 h-7 text-center border-none p-0 focus-visible:ring-0" 
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
            </CardContent>
            <CardFooter className="bg-gray-50 border-t p-4">
              <div className="flex justify-between items-center w-full text-sm">
                <span className="text-gray-600">Total Daily Capacity:</span>
                <span className="font-bold text-blue-600">{selectedConfigs.reduce((acc, curr) => acc + curr.dailyLimit, 0)} emails/day</span>
              </div>
            </CardFooter>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-100">
            <CardHeader>
              <CardTitle className="text-blue-900 text-sm uppercase tracking-wider font-semibold">Quick Tips</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-3">
                <div className="bg-white p-2 rounded-full shadow-sm h-fit">
                  <Zap className="h-4 w-4 text-yellow-500" />
                </div>
                <div>
                  <p className="font-medium text-sm text-blue-900">Warm up your accounts</p>
                  <p className="text-xs text-blue-700 mt-1">Start with lower daily limits (20-50) for new accounts to build reputation.</p>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="bg-white p-2 rounded-full shadow-sm h-fit">
                  <Clock className="h-4 w-4 text-blue-500" />
                </div>
                <div>
                  <p className="font-medium text-sm text-blue-900">Spacing matters</p>
                  <p className="text-xs text-blue-700 mt-1">A 3-5 minute delay between emails mimics human behavior.</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );

  const renderAudienceStep = () => (
    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5 text-blue-500" />
                Select Audience
              </CardTitle>
              <CardDescription>Who should receive this campaign?</CardDescription>
            </CardHeader>
            <CardContent>
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
            </CardContent>
          </Card>
        </div>

        <div>
          <Card className="h-full">
            <CardHeader>
              <CardTitle className="text-sm uppercase tracking-wider text-gray-500">Audience Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="text-center p-6 bg-gray-50 rounded-lg border border-dashed">
                <p className="text-4xl font-bold text-gray-900">
                  {audienceType === 'list' ? listCount : recipients.split('\n').filter(r => r.trim()).length}
                </p>
                <p className="text-sm text-gray-500 mt-1">Total Recipients</p>
              </div>

              {selectedConfigs.length > 0 && (
                <div className="space-y-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Daily Capacity</span>
                    <span className="font-medium">{selectedConfigs.reduce((acc, curr) => acc + curr.dailyLimit, 0)} / day</span>
                  </div>
                  <Separator />
                  <div className="flex items-start gap-2 text-sm text-blue-600 bg-blue-50 p-3 rounded-md">
                    <Info className="h-4 w-4 mt-0.5 shrink-0" />
                    {(() => {
                      const totalRecipients = audienceType === 'list' ? listCount : recipients.split('\n').filter(r => r.trim()).length;
                      const totalDailyLimit = selectedConfigs.reduce((acc, curr) => acc + curr.dailyLimit, 0);
                      const estimatedDays = totalDailyLimit > 0 ? Math.ceil(totalRecipients / totalDailyLimit) : 0;
                      return (
                        <span>
                          Estimated campaign duration: <strong>{estimatedDays} day{estimatedDays !== 1 ? 's' : ''}</strong> to reach all recipients.
                        </span>
                      );
                    })()}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );

  const renderContentStep = () => (
    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-[600px]">
        {/* Editor Column */}
        <div className="flex flex-col h-full space-y-4">
          <Card className="flex-1 flex flex-col">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center justify-between">
                <span className="flex items-center gap-2"><FileText className="h-5 w-5 text-blue-500" /> Editor</span>
                {templates.length > 0 && (
                  <Select value={selectedTemplate} onValueChange={handleTemplateSelect}>
                    <SelectTrigger className="w-[180px] h-8 text-xs">
                      <SelectValue placeholder="Load Template" />
                    </SelectTrigger>
                    <SelectContent>
                      {templates.map((template) => (
                        <SelectItem key={template.id} value={template.id}>
                          {template.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col space-y-4">
              <div className="space-y-2">
                <Input
                  id="subject"
                  placeholder="Subject Line"
                  value={form.subject}
                  onChange={(e) => setForm({ ...form, subject: e.target.value })}
                  className="h-11 font-medium text-lg border-0 border-b rounded-none px-0 focus-visible:ring-0"
                />
              </div>

              <div className="flex-1 relative">
                <Textarea
                  id="content"
                  placeholder="Write your email content here..."
                  className="h-full resize-none border-0 p-0 focus-visible:ring-0 font-mono text-sm leading-relaxed"
                  value={form.content}
                  onChange={(e) => setForm({ ...form, content: e.target.value })}
                />
              </div>

              <div className="flex items-center gap-2 pt-2 border-t">
                <span className="text-xs text-gray-400 mr-2">Insert Variable:</span>
                {['{first_name}', '{company}', '{email}'].map(variable => (
                  <Badge 
                    key={variable}
                    variant="secondary" 
                    className="cursor-pointer hover:bg-blue-100 hover:text-blue-700 transition-colors"
                    onClick={() => setForm(f => ({...f, content: f.content + variable}))}
                  >
                    {variable}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Preview Column */}
        <div className="flex flex-col h-full">
          <Card className="flex-1 bg-gray-50/50 border-dashed flex flex-col">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-gray-500">
                <Eye className="h-5 w-5" /> Live Preview
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1">
              <div className="bg-white rounded-lg shadow-sm border p-6 h-full overflow-y-auto">
                <div className="border-b pb-4 mb-4 space-y-2">
                  <div className="flex gap-2 text-sm">
                    <span className="text-gray-500 w-16">To:</span>
                    <span className="text-gray-900">John Doe &lt;john@example.com&gt;</span>
                  </div>
                  <div className="flex gap-2 text-sm">
                    <span className="text-gray-500 w-16">Subject:</span>
                    <span className="font-medium text-gray-900">{form.subject || '(No Subject)'}</span>
                  </div>
                </div>
                <div className="prose prose-sm max-w-none text-gray-800 whitespace-pre-wrap">
                  {form.content || <span className="text-gray-400 italic">Start typing to see preview...</span>}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );

  const renderFollowupsStep = () => (
    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h3 className="text-lg font-medium">Follow-up Sequence</h3>
          <p className="text-sm text-gray-500">Automate replies if recipients don't respond.</p>
        </div>
      </div>

      <div className="relative pl-8 space-y-8">
        {/* Vertical Line */}
        <div className="absolute left-3.5 top-0 bottom-0 w-0.5 bg-gray-200" />

        {/* Initial Email Node */}
        <div className="relative">
          <div className="absolute -left-[29px] top-0 w-8 h-8 rounded-full bg-blue-100 border-2 border-blue-500 flex items-center justify-center z-10">
            <Mail className="h-4 w-4 text-blue-600" />
          </div>
          <Card className="ml-4 border-l-4 border-l-blue-500">
            <CardHeader className="py-3">
              <CardTitle className="text-sm font-medium text-gray-500">Initial Email</CardTitle>
              <p className="text-sm font-medium truncate">{form.subject || '(No Subject)'}</p>
            </CardHeader>
          </Card>
        </div>

        {/* Follow-up Nodes */}
        {followups.map((step, index) => (
          <div key={index} className="relative">
            <div className="absolute -left-[29px] top-6 w-8 h-8 rounded-full bg-white border-2 border-gray-300 flex items-center justify-center z-10">
              <span className="text-xs font-bold text-gray-500">{index + 1}</span>
            </div>
            
            <div className="ml-4">
              <div className="flex items-center gap-2 mb-2">
                <Badge variant="outline" className="bg-white">
                  Wait {step.delay_days} days, {step.delay_hours} hours
                </Badge>
                <span className="text-xs text-gray-400">if no reply</span>
              </div>
              
              <Card className="relative group">
                <CardHeader className="pb-2 pt-4">
                  <div className="flex justify-between items-start">
                    <div className="space-y-1">
                      <CardTitle className="text-base">Follow-up #{step.step_number}</CardTitle>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => removeFollowupStep(index)} className="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
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
            </div>
          </div>
        ))}

        {/* Add Step Button */}
        <div className="relative pt-4">
          <div className="absolute -left-[29px] top-4 w-8 h-8 rounded-full bg-gray-100 border-2 border-dashed border-gray-300 flex items-center justify-center z-10">
            <Plus className="h-4 w-4 text-gray-400" />
          </div>
          <Button onClick={addFollowupStep} variant="outline" className="ml-4 border-dashed w-full justify-start text-gray-500 hover:text-blue-600 hover:border-blue-300 hover:bg-blue-50">
            <Plus className="h-4 w-4 mr-2" />
            Add Follow-up Step
          </Button>
        </div>
      </div>
    </div>
  );

  const renderReviewStep = () => (
    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-blue-50 border-blue-100">
          <CardContent className="p-6">
            <p className="text-sm font-medium text-blue-600 mb-1">Total Recipients</p>
            <p className="text-2xl font-bold text-blue-900">
              {audienceType === 'list' ? listCount : recipients.split('\n').filter(r => r.trim()).length}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-green-50 border-green-100">
          <CardContent className="p-6">
            <p className="text-sm font-medium text-green-600 mb-1">Daily Volume</p>
            <p className="text-2xl font-bold text-green-900">
              {selectedConfigs.reduce((acc, curr) => acc + curr.dailyLimit, 0)}
              <span className="text-sm font-normal text-green-700 ml-1">/ day</span>
            </p>
          </CardContent>
        </Card>
        <Card className="bg-purple-50 border-purple-100">
          <CardContent className="p-6">
            <p className="text-sm font-medium text-purple-600 mb-1">Follow-up Steps</p>
            <p className="text-2xl font-bold text-purple-900">{followups.length}</p>
          </CardContent>
        </Card>
        <Card className="bg-orange-50 border-orange-100">
          <CardContent className="p-6">
            <p className="text-sm font-medium text-orange-600 mb-1">Send Delay</p>
            <p className="text-2xl font-bold text-orange-900">
              {form.send_delay_minutes}
              <span className="text-sm font-normal text-orange-700 ml-1">min</span>
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Campaign Configuration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-500 block mb-1">Campaign Name</span>
                  <span className="font-medium">{form.name}</span>
                </div>
                <div>
                  <span className="text-gray-500 block mb-1">Subject Line</span>
                  <span className="font-medium">{form.subject}</span>
                </div>
                <div>
                  <span className="text-gray-500 block mb-1">Sender Accounts</span>
                  <span className="font-medium">{selectedConfigs.length} accounts selected</span>
                </div>
                <div>
                  <span className="text-gray-500 block mb-1">Audience Source</span>
                  <span className="font-medium capitalize">{audienceType}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Schedule</CardTitle>
              <CardDescription>When should this campaign start?</CardDescription>
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
                  {scheduledAt 
                    ? `Campaign will start on ${new Date(scheduledAt).toLocaleString()}`
                    : 'Campaign will start immediately upon launch.'}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        <div>
          <Card className="h-full bg-gray-50">
            <CardHeader>
              <CardTitle className="text-base">Pre-flight Checklist</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-green-700">
                <CheckCircle2 className="h-4 w-4" />
                <span>Subject line set</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-green-700">
                <CheckCircle2 className="h-4 w-4" />
                <span>Content added</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-green-700">
                <CheckCircle2 className="h-4 w-4" />
                <span>Recipients selected</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-green-700">
                <CheckCircle2 className="h-4 w-4" />
                <span>Senders configured</span>
              </div>
              <Separator className="my-2" />
              <div className="p-3 bg-yellow-50 text-yellow-800 rounded-md text-xs border border-yellow-100">
                <p className="font-medium mb-1 flex items-center gap-1"><AlertCircle className="h-3 w-3" /> Important</p>
                <p>Emails will be queued immediately. Ensure your sender accounts are warmed up and ready.</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );

  return (
    <div className="max-w-6xl mx-auto py-8 px-4">
      {renderStepIndicator()}

      <div className="mb-8 min-h-[400px]">
        {currentStep === 1 && renderSetupStep()}
        {currentStep === 2 && renderAudienceStep()}
        {currentStep === 3 && renderContentStep()}
        {currentStep === 4 && renderFollowupsStep()}
        {currentStep === 5 && renderReviewStep()}
      </div>

      <div className="flex justify-between items-center pt-6 border-t bg-white sticky bottom-0 py-4 z-10">
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
            <Button onClick={handleNext} className="w-32 bg-blue-600 hover:bg-blue-700">
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

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
  ChevronRight, UserPlus, AlertCircle, Eye, Zap, Check, X, Loader2
} from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
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
  { id: 1, title: 'Setup', description: 'Campaign Details' },
  { id: 2, title: 'Audience', description: 'Select Recipients' },
  { id: 3, title: 'Content', description: 'Email Message' },
  { id: 4, title: 'Follow-ups', description: 'Sequence Steps' },
  { id: 5, title: 'Review', description: 'Final Check' },
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

  const renderStepIndicator = () => {
    const progress = ((currentStep - 1) / (STEPS.length - 1)) * 100;

    return (
      <div className="mb-6 relative max-w-3xl mx-auto px-4">
        <div className="absolute top-1/2 left-0 w-full h-1 bg-gray-100 -translate-y-1/2 rounded-full z-0" />
        <div 
          className="absolute top-1/2 left-0 h-1 bg-blue-600 -translate-y-1/2 rounded-full z-0 transition-all duration-500 ease-in-out"
          style={{ width: `${progress}%` }}
        />

        <div className="relative z-10 flex justify-between w-full">
          {STEPS.map((step) => {
            const isActive = step.id === currentStep;
            const isCompleted = step.id < currentStep;
            
            return (
              <div key={step.id} className="flex flex-col items-center group cursor-pointer" onClick={() => isCompleted && setCurrentStep(step.id)}>
                <div 
                  className={cn(
                    "w-3 h-3 rounded-full border-[2px] transition-all duration-300 bg-white box-content ring-2 ring-white",
                    isActive ? "border-blue-600 scale-125" : 
                    isCompleted ? "border-blue-600 bg-blue-600" : "border-gray-300"
                  )}
                />
                <span className={cn(
                  "absolute top-6 text-[10px] font-semibold tracking-wide uppercase transition-colors duration-300 w-32 text-center",
                  isActive ? "text-blue-600" : isCompleted ? "text-gray-900" : "text-gray-400"
                )}>
                  {step.title}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderSetupStep = () => (
    <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
      {emailConfigs.length === 0 && (
        <div className="bg-purple-50 border border-purple-100 rounded-xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-purple-100 p-2 rounded-full">
              <Info className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h4 className="font-semibold text-purple-900">Connect a sender account</h4>
              <p className="text-sm text-purple-700">You need at least one email account to send campaigns.</p>
            </div>
          </div>
          <Button variant="secondary" className="bg-white text-purple-700 hover:bg-purple-100 border-purple-200">Connect</Button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
                <Label htmlFor="name" className="text-base font-semibold text-gray-900">Campaign Name</Label>
                <span className="text-xs text-gray-500">Internal use only</span>
            </div>
            <Input
              id="name"
              placeholder="e.g., Q4 Outreach - Tech Startups"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="h-12 text-lg bg-gray-50 border-gray-200 focus:bg-white transition-all"
            />
          </div>

          <div className="space-y-4">
            <Label className="text-base font-semibold text-gray-900">Sender Accounts</Label>
            <div className="border border-gray-200 rounded-xl overflow-hidden bg-gray-50/50">
              <ScrollArea className="h-[240px]">
                <div className="p-2 space-y-2">
                  {emailConfigs.map((config) => {
                    const isSelected = selectedConfigs.some(c => c.configId === config.id);
                    const selectedConfig = selectedConfigs.find(c => c.configId === config.id);
                    
                    return (
                      <div 
                        key={config.id} 
                        className={cn(
                          "flex items-center justify-between p-3 rounded-lg border transition-all cursor-pointer",
                          isSelected ? "bg-white border-blue-200 shadow-sm ring-1 ring-blue-100" : "hover:bg-white border-transparent hover:border-gray-200"
                        )}
                        onClick={() => {
                            if (isSelected) {
                                setSelectedConfigs(selectedConfigs.filter(c => c.configId !== config.id));
                            } else {
                                setSelectedConfigs([...selectedConfigs, { configId: config.id, dailyLimit: 100 }]);
                            }
                        }}
                      >
                        <div className="flex items-center space-x-3">
                          <div className={cn(
                              "w-5 h-5 rounded border flex items-center justify-center transition-colors",
                              isSelected ? "bg-blue-600 border-blue-600" : "border-gray-300 bg-white"
                          )}>
                              {isSelected && <Check className="h-3 w-3 text-white" />}
                          </div>
                          <div className="flex flex-col">
                            <span className="font-medium text-gray-900">{config.smtp_username}</span>
                            <span className="text-xs text-gray-500">{config.smtp_host}</span>
                          </div>
                        </div>
                        {isSelected && (
                          <div className="flex items-center gap-2 bg-gray-50 px-2 py-1 rounded border" onClick={(e) => e.stopPropagation()}>
                            <span className="text-xs text-gray-500">Limit:</span>
                            <Input 
                              type="number" 
                              className="w-16 h-7 text-center border-none p-0 focus-visible:ring-0 bg-transparent" 
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
            </div>
            <div className="flex justify-between items-center text-sm px-2">
                <span className="text-gray-500">Total Daily Capacity</span>
                <span className="font-bold text-blue-600">{selectedConfigs.reduce((acc, curr) => acc + curr.dailyLimit, 0)} emails/day</span>
            </div>
          </div>
        </div>

        <div className="space-y-6">
            <div className="bg-blue-50/50 rounded-xl p-6 border border-blue-100 space-y-4">
                <h4 className="font-semibold text-blue-900 flex items-center gap-2">
                    <Zap className="h-4 w-4 text-blue-600" />
                    Pro Tips
                </h4>
                <div className="space-y-3">
                    <div className="flex gap-3 items-start">
                        <div className="bg-white p-1.5 rounded-md shadow-sm mt-0.5">
                            <Clock className="h-3 w-3 text-blue-500" />
                        </div>
                        <div>
                            <p className="text-sm font-medium text-blue-900">Sending Delay</p>
                            <Select 
                                value={form.send_delay_minutes.toString()} 
                                onValueChange={(value) => setForm({ ...form, send_delay_minutes: parseInt(value) })}
                            >
                                <SelectTrigger className="h-8 text-xs mt-1 bg-white border-blue-200">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="1">Fast (1 min)</SelectItem>
                                    <SelectItem value="3">Recommended (3 min)</SelectItem>
                                    <SelectItem value="5">Safe (5 min)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <div className="flex gap-3 items-start">
                        <div className="bg-white p-1.5 rounded-md shadow-sm mt-0.5">
                            <Info className="h-3 w-3 text-blue-500" />
                        </div>
                        <p className="text-xs text-blue-800 leading-relaxed">
                            We recommend a 3-5 minute delay between emails to maintain high deliverability rates.
                        </p>
                    </div>
                </div>
            </div>
        </div>
      </div>
    </div>
  );

  const renderAudienceStep = () => (
    <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          <Tabs value={audienceType} onValueChange={(v: any) => setAudienceType(v)} className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-6 p-1 bg-gray-100 rounded-xl">
              <TabsTrigger value="list" className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm">Existing List</TabsTrigger>
              <TabsTrigger value="manual" className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm">Manual Entry</TabsTrigger>
            </TabsList>
            
            <TabsContent value="list" className="space-y-4 mt-0">
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 space-y-4">
                <Label className="text-base font-semibold">Select a Prospect List</Label>
                <Select value={selectedListId} onValueChange={setSelectedListId}>
                  <SelectTrigger className="h-12 bg-white border-gray-200">
                    <SelectValue placeholder="Choose a list..." />
                  </SelectTrigger>
                  <SelectContent>
                    {allLists.map(list => (
                      <SelectItem key={list.id} value={list.id}>{list.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedListId && (
                    <div className="flex items-center gap-2 text-sm text-green-600 bg-green-50 p-3 rounded-lg border border-green-100">
                        <CheckCircle2 className="h-4 w-4" />
                        <span>List loaded successfully with {listCount} prospects.</span>
                    </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="manual" className="space-y-4 mt-0">
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 space-y-4">
                <div className="flex justify-between items-center">
                    <Label className="text-base font-semibold">Paste Recipients</Label>
                    <span className="text-xs text-gray-500">Format: email, name</span>
                </div>
                <Textarea
                  placeholder="email@example.com, Name&#10;another@example.com, John Doe"
                  className="min-h-[200px] font-mono text-sm bg-white border-gray-200 focus:ring-0"
                  value={recipients}
                  onChange={(e) => setRecipients(e.target.value)}
                />
              </div>
            </TabsContent>
          </Tabs>
        </div>

        <div>
          <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm h-full flex flex-col">
            <h4 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-6">Summary</h4>
            
            <div className="flex-1 flex flex-col items-center justify-center text-center space-y-2 mb-8">
                <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mb-2">
                    <Users className="h-8 w-8 text-blue-600" />
                </div>
                <span className="text-4xl font-bold text-gray-900">
                  {audienceType === 'list' ? listCount : recipients.split('\n').filter(r => r.trim()).length}
                </span>
                <span className="text-sm text-gray-500">Total Recipients</span>
            </div>

            <Separator className="my-4" />

            <div className="space-y-4">
                <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Daily Limit</span>
                    <span className="font-medium text-gray-900">{selectedConfigs.reduce((acc, curr) => acc + curr.dailyLimit, 0)} / day</span>
                </div>
                <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-600 leading-relaxed">
                    Based on your daily limit, this campaign will take approximately 
                    <strong className="text-gray-900 mx-1">
                        {(() => {
                            const total = audienceType === 'list' ? listCount : recipients.split('\n').filter(r => r.trim()).length;
                            const limit = selectedConfigs.reduce((acc, curr) => acc + curr.dailyLimit, 0);
                            return limit > 0 ? Math.ceil(total / limit) : 0;
                        })()}
                    </strong> 
                    days to complete.
                </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderContentStep = () => (
    <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-500 h-full flex flex-col">
      <div className="flex justify-between items-center mb-2 shrink-0">
        <div className="flex items-center gap-2">
            <Select value={selectedTemplate} onValueChange={handleTemplateSelect}>
                <SelectTrigger className="w-[200px] h-9 text-xs bg-white">
                    <SelectValue placeholder="Load Template..." />
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
        <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 mr-2">Insert Variable:</span>
            {['{first_name}', '{company}', '{email}'].map(variable => (
                <Badge 
                key={variable}
                variant="outline" 
                className="cursor-pointer hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition-all bg-white"
                onClick={() => setForm(f => ({...f, content: f.content + variable}))}
                >
                {variable}
                </Badge>
            ))}
            
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="ml-2 gap-2 h-7 text-xs">
                  <Eye className="h-3 w-3" /> Preview
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-3xl h-[80vh] flex flex-col">
                <DialogHeader>
                  <DialogTitle>Email Preview</DialogTitle>
                </DialogHeader>
                <div className="flex-1 overflow-y-auto bg-gray-50 p-4 rounded-md border">
                    <div className="bg-white rounded shadow-sm p-8 max-w-2xl mx-auto min-h-[400px]">
                        <div className="border-b pb-4 mb-6 space-y-1">
                            <p className="text-lg font-semibold text-gray-900">{form.subject || <span className="text-gray-300">Subject</span>}</p>
                            <div className="flex items-center gap-2 text-xs text-gray-500">
                                <div className="w-6 h-6 rounded-full bg-gray-200" />
                                <span>Me</span>
                                <span className="text-gray-300">to</span>
                                <span>John Doe</span>
                            </div>
                        </div>
                        <div className="prose prose-sm max-w-none text-gray-800 whitespace-pre-wrap font-sans">
                            {form.content || <span className="text-gray-300 italic">Start typing to see how your email will look...</span>}
                        </div>
                    </div>
                </div>
              </DialogContent>
            </Dialog>
        </div>
      </div>

      <div className="flex-1 min-h-0">
        {/* Editor */}
        <div className="flex flex-col h-full border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm">
            <div className="p-3 border-b border-gray-100 bg-gray-50/50 shrink-0">
                <Input
                  placeholder="Subject Line"
                  value={form.subject}
                  onChange={(e) => setForm({ ...form, subject: e.target.value })}
                  className="border-0 bg-transparent text-lg font-medium px-0 focus-visible:ring-0 placeholder:text-gray-400 h-auto py-1"
                />
            </div>
            <div className="flex-1 relative min-h-0">
                <Textarea
                  placeholder="Hi {first_name},&#10;&#10;I'm writing to you because..."
                  className="h-full w-full resize-none border-0 p-4 focus-visible:ring-0 font-mono text-sm leading-relaxed"
                  value={form.content}
                  onChange={(e) => setForm({ ...form, content: e.target.value })}
                />
            </div>
        </div>
      </div>
    </div>
  );

  const renderFollowupsStep = () => (
    <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500 max-w-4xl mx-auto">
      <div className="relative pl-8 space-y-12">
        {/* Vertical Line */}
        <div className="absolute left-[15px] top-4 bottom-0 w-0.5 bg-gray-200" />

        {/* Initial Email Node */}
        <div className="relative">
          <div className="absolute -left-[29px] top-0 w-8 h-8 rounded-full bg-blue-600 border-4 border-white shadow-sm flex items-center justify-center z-10">
            <Mail className="h-4 w-4 text-white" />
          </div>
          <div className="ml-6 bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
            <div className="flex justify-between items-start mb-2">
                <h4 className="font-semibold text-gray-900">Initial Email</h4>
                <Badge variant="secondary">Step 1</Badge>
            </div>
            <p className="text-sm text-gray-500 truncate">{form.subject || '(No Subject)'}</p>
          </div>
        </div>

        {/* Follow-up Nodes */}
        {followups.map((step, index) => (
          <div key={index} className="relative">
            <div className="absolute -left-[29px] top-6 w-8 h-8 rounded-full bg-white border-2 border-gray-300 flex items-center justify-center z-10">
              <span className="text-xs font-bold text-gray-500">{index + 1}</span>
            </div>
            
            <div className="ml-6">
              <div className="flex items-center gap-2 mb-4">
                <div className="bg-gray-100 text-gray-600 text-xs font-medium px-3 py-1 rounded-full border border-gray-200">
                  Wait {step.delay_days} days, {step.delay_hours} hours
                </div>
                <span className="text-xs text-gray-400">if no reply</span>
              </div>
              
              <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm group hover:border-blue-300 transition-colors">
                <div className="flex justify-between items-start mb-4">
                    <h4 className="font-semibold text-gray-900">Follow-up #{step.step_number}</h4>
                    <Button variant="ghost" size="icon" onClick={() => removeFollowupStep(index)} className="text-gray-400 hover:text-red-500 hover:bg-red-50">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                </div>
                
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs text-gray-500">Wait Days</Label>
                      <Input 
                        type="number" min="0"
                        value={step.delay_days}
                        onChange={(e) => updateFollowupStep(index, 'delay_days', parseInt(e.target.value) || 0)}
                        className="h-9"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-gray-500">Wait Hours</Label>
                      <Input 
                        type="number" min="0" max="23"
                        value={step.delay_hours}
                        onChange={(e) => updateFollowupStep(index, 'delay_hours', parseInt(e.target.value) || 0)}
                        className="h-9"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-gray-500">Message Body</Label>
                    <Textarea 
                      placeholder="Just bumping this to the top of your inbox..."
                      className="min-h-[100px] resize-none"
                      value={step.body}
                      onChange={(e) => updateFollowupStep(index, 'body', e.target.value)}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}

        {/* Add Step Button */}
        <div className="relative pt-4 pb-8">
          <div className="absolute -left-[29px] top-4 w-8 h-8 rounded-full bg-gray-50 border-2 border-dashed border-gray-300 flex items-center justify-center z-10">
            <Plus className="h-4 w-4 text-gray-400" />
          </div>
          <Button onClick={addFollowupStep} variant="outline" className="ml-6 border-dashed w-full justify-start text-gray-500 hover:text-blue-600 hover:border-blue-300 hover:bg-blue-50 h-12">
            <Plus className="h-4 w-4 mr-2" />
            Add Follow-up Step
          </Button>
        </div>
      </div>
    </div>
  );

  const renderReviewStep = () => (
    <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-6 text-center">
            <p className="text-sm font-medium text-blue-600 mb-1">Recipients</p>
            <p className="text-3xl font-bold text-blue-900">
              {audienceType === 'list' ? listCount : recipients.split('\n').filter(r => r.trim()).length}
            </p>
        </div>
        <div className="bg-green-50 border border-green-100 rounded-xl p-6 text-center">
            <p className="text-sm font-medium text-green-600 mb-1">Daily Volume</p>
            <p className="text-3xl font-bold text-green-900">
              {selectedConfigs.reduce((acc, curr) => acc + curr.dailyLimit, 0)}
            </p>
        </div>
        <div className="bg-purple-50 border border-purple-100 rounded-xl p-6 text-center">
            <p className="text-sm font-medium text-purple-600 mb-1">Follow-ups</p>
            <p className="text-3xl font-bold text-purple-900">{followups.length}</p>
        </div>
        <div className="bg-orange-50 border border-orange-100 rounded-xl p-6 text-center">
            <p className="text-sm font-medium text-orange-600 mb-1">Delay</p>
            <p className="text-3xl font-bold text-orange-900">
              {form.send_delay_minutes}<span className="text-sm font-normal ml-1">m</span>
            </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-6">
            <h4 className="font-semibold text-gray-900 border-b pb-4">Campaign Configuration</h4>
            <div className="grid grid-cols-2 gap-6 text-sm">
                <div>
                  <span className="text-gray-500 block mb-1">Campaign Name</span>
                  <span className="font-medium text-gray-900">{form.name}</span>
                </div>
                <div>
                  <span className="text-gray-500 block mb-1">Subject Line</span>
                  <span className="font-medium text-gray-900">{form.subject}</span>
                </div>
                <div>
                  <span className="text-gray-500 block mb-1">Sender Accounts</span>
                  <span className="font-medium text-gray-900">{selectedConfigs.length} accounts selected</span>
                </div>
                <div>
                  <span className="text-gray-500 block mb-1">Audience Source</span>
                  <span className="font-medium text-gray-900 capitalize">{audienceType}</span>
                </div>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
                <h4 className="font-semibold text-gray-900">Schedule Launch</h4>
                <Switch checked={!!scheduledAt} onCheckedChange={(c) => setScheduledAt(c ? new Date().toISOString().slice(0, 16) : '')} />
            </div>
            {scheduledAt && (
                <div className="pt-2">
                    <Label htmlFor="scheduledAt" className="mb-2 block">Start Date & Time</Label>
                    <Input
                    id="scheduledAt"
                    type="datetime-local"
                    value={scheduledAt}
                    onChange={(e) => setScheduledAt(e.target.value)}
                    className="max-w-md"
                    />
                    <p className="text-sm text-gray-500 mt-2">
                    Campaign will automatically start on {new Date(scheduledAt).toLocaleString()}
                    </p>
                </div>
            )}
          </div>
        </div>

        <div>
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 h-full">
            <h4 className="font-semibold text-gray-900 mb-4">Pre-flight Checklist</h4>
            <div className="space-y-3">
              {[
                  { label: 'Subject line set', valid: !!form.subject },
                  { label: 'Content added', valid: !!form.content },
                  { label: 'Recipients selected', valid: (audienceType === 'list' ? listCount > 0 : recipients.length > 0) },
                  { label: 'Senders configured', valid: selectedConfigs.length > 0 },
              ].map((item, i) => (
                  <div key={i} className="flex items-center gap-3 text-sm">
                    <div className={cn("w-5 h-5 rounded-full flex items-center justify-center", item.valid ? "bg-green-100 text-green-600" : "bg-gray-200 text-gray-400")}>
                        {item.valid ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                    </div>
                    <span className={item.valid ? "text-gray-700" : "text-gray-400"}>{item.label}</span>
                  </div>
              ))}
              
              <Separator className="my-4" />
              
              <div className="p-4 bg-yellow-50 text-yellow-800 rounded-lg text-xs border border-yellow-100 leading-relaxed">
                <p className="font-medium mb-1 flex items-center gap-1"><AlertCircle className="h-3 w-3" /> Important</p>
                <p>Emails will be queued immediately. Ensure your sender accounts are warmed up and ready.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="h-[calc(100vh-1rem)] bg-gray-50/50 p-4 font-sans flex flex-col overflow-hidden">
      <div className="max-w-6xl mx-auto w-full flex flex-col h-full">
        <div className="mb-4 text-center shrink-0">
           <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Create Campaign</h1>
        </div>

        <div className="shrink-0">
            {renderStepIndicator()}
        </div>

        <div className="bg-white rounded-2xl shadow-xl shadow-gray-200/50 border border-gray-100 overflow-hidden transition-all duration-500 relative flex flex-col flex-1 min-h-0">
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-50 flex justify-between items-center bg-white shrink-0">
                <div>
                    <h2 className="text-lg font-semibold text-gray-900">{STEPS[currentStep-1].title}</h2>
                    <p className="text-xs text-gray-500">{STEPS[currentStep-1].description}</p>
                </div>
                <div className="text-xs text-gray-400 font-medium bg-gray-50 px-3 py-1 rounded-full">
                    Step {currentStep} of {STEPS.length}
                </div>
            </div>

            {/* Content Body */}
            <div className="p-6 flex-1 overflow-y-auto min-h-0">
                {currentStep === 1 && renderSetupStep()}
                {currentStep === 2 && renderAudienceStep()}
                {currentStep === 3 && renderContentStep()}
                {currentStep === 4 && renderFollowupsStep()}
                {currentStep === 5 && renderReviewStep()}
            </div>

            {/* Footer Actions */}
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-between items-center shrink-0">
                <Button
                    variant="ghost"
                    onClick={handleBack}
                    disabled={currentStep === 1 || loading}
                    className="text-gray-500 hover:text-gray-900 hover:bg-gray-200/50"
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
                        className="border-gray-300"
                        >
                        Save Draft
                        </Button>
                    )}
                    
                    {currentStep < 5 ? (
                        <Button onClick={handleNext} className="bg-blue-600 hover:bg-blue-700 text-white px-8 shadow-lg shadow-blue-200">
                        Next Step
                        <ArrowRight className="h-4 w-4 ml-2" />
                        </Button>
                    ) : (
                        <Button onClick={() => handleSave(false)} disabled={loading} className="bg-green-600 hover:bg-green-700 text-white px-8 shadow-lg shadow-green-200">
                        {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
                        {loading ? 'Launching...' : 'Launch Campaign'}
                        </Button>
                    )}
                </div>
            </div>
        </div>
      </div>
    </div>
  );
};

export default CampaignBuilder;

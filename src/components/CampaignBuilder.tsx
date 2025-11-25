import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/hooks/use-toast';
import { Plus, Clock, Info, Trash2, ArrowDown } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Checkbox } from '@/components/ui/checkbox';

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

const ALLOWED_CAMPAIGN_STATUS = ['draft', 'pending', 'sending', 'paused', 'sent', 'failed'];

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

const SUPABASE_PROJECT_URL = "https://lyerkyijpavilyufcrgb.supabase.co";

const CampaignBuilder: React.FC<CampaignBuilderProps> = ({ emailConfigs }) => {
  const [form, setForm] = useState({
    name: '',
    subject: '',
    content: '',
    send_delay_minutes: 1,
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
      const { data, error } = await supabase
        .from('email_templates')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      setTemplates(data || []);
    } catch (error: any) {
      console.error('Error fetching templates:', error);
    }
  };

  const fetchLists = async () => {
    const { data, error } = await supabase
      .from('email_lists')
      .select('id, name')
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
        is_html: false // Templates don't have is_html field
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
    // Re-number steps
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

  const handleSave = async (isDraft = true) => {
    const statusToUse = isDraft ? 'draft' : 'ready';

    if (!form.name || !form.subject || !form.content || selectedConfigs.length === 0) {
      toast({
        title: "Error",
        description: "Please fill in all required fields and select at least one email account",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      console.log('Creating campaign with data:', {
        user_id: user.id,
        name: form.name,
        subject: form.subject,
        body: form.content,
        status: statusToUse,
        send_delay_minutes: form.send_delay_minutes,
        email_config_id: selectedConfigs[0].configId, // Fallback for legacy
        email_list_id: selectedListId || null,
      });

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
          email_config_id: selectedConfigs[0].configId, // Fallback
          email_list_id: selectedListId || null,
        })
        .select()
        .single();

      if (campaignError) {
        console.error('Campaign creation error:', campaignError);
        throw campaignError;
      }

      console.log('Campaign created successfully:', campaign);

      // Save Campaign Email Configurations
      const configInserts = selectedConfigs.map(c => ({
        campaign_id: campaign.id,
        email_config_id: c.configId,
        daily_limit: c.dailyLimit
      }));

      const { error: configError } = await supabase
        .from('campaign_email_configurations' as any)
        .insert(configInserts);

      if (configError) {
        console.error('Error saving email configs:', configError);
        toast({
          title: "Warning",
          description: "Campaign created but email configurations failed to save.",
          variant: "destructive",
        });
      }

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
        
        const { error: followupError } = await supabase
          .from('campaign_followups')
          .insert(followupInserts);
          
        if (followupError) {
           console.error('Error saving followups:', followupError);
           toast({
             title: "Warning",
             description: "Campaign created but follow-ups failed to save.",
             variant: "destructive",
           });
        }
      }

      // Helper to assign config
      const assignConfig = (index: number) => {
        return selectedConfigs[index % selectedConfigs.length].configId;
      };

      // If a list is selected, populate recipients from it
      if (selectedListId) {
        console.log('Fetching prospects for list:', selectedListId);
        
        const { data: listProspects, error: listProspectsError } = await supabase
          .from('email_list_prospects')
          .select(`
            prospects (
              id,
              email,
              name,
              company
            )
          `)
          .eq('list_id', selectedListId);

        if (listProspectsError) {
          console.error('Error fetching prospects for list:', listProspectsError);
          throw new Error('Failed to fetch prospects from the selected list.');
        }

        if (listProspects && listProspects.length > 0) {
          const validProspects = listProspects
            .map(item => item.prospects)
            .filter(prospect => prospect && prospect.email && prospect.email.trim());

          if (validProspects.length === 0) {
            throw new Error('No valid prospects found in the selected list.');
          }

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

          const { data: insertedRecipients, error: recipientsError } = await supabase
            .from('recipients')
            .insert(recipientsInserts)
            .select();

          if (recipientsError) throw recipientsError;

          if (insertedRecipients && insertedRecipients.length > 0) {
            await Promise.all(
              insertedRecipients.map(async (recip) => {
                const openLink = generateOpenLink(SUPABASE_PROJECT_URL, campaign.id, recip.id);
                const clickLink = generateClickLink(SUPABASE_PROJECT_URL, campaign.id, recip.id, "https://example.com");
                await supabase
                  .from('recipients')
                  .update({
                    track_open_link: openLink,
                    track_click_link: clickLink,
                  })
                  .eq('id', recip.id);
              })
            );

            await supabase
              .from('campaigns')
              .update({ total_recipients: insertedRecipients.length })
              .eq('id', campaign.id);
          }

        } else {
          throw new Error('No prospects found in the selected list.');
        }
      } else if (recipients.trim()) {
        const recipientList = recipients
          .split('\n')
          .map(line => {
            const [email, name] = line.split(',').map(s => s.trim());
            return { email: email?.toLowerCase() || '', name: name || '' };
          })
          .filter(r => r.email && r.email.includes('@'));

        if (recipientList.length > 0) {
          const uniqueRecipients = recipientList.filter((recipient, index, self) => 
            index === self.findIndex(r => r.email === recipient.email)
          );

          const { data: insertedRecipients, error: recipientsError } = await supabase
            .from('recipients')
            .insert(
              uniqueRecipients.map((r, index) => ({
                campaign_id: campaign.id,
                email: r.email,
                name: r.name,
                status: 'pending',
                assigned_email_config_id: assignConfig(index)
              }))
            )
            .select();

          if (recipientsError) throw recipientsError;

          if (insertedRecipients && insertedRecipients.length > 0) {
            await Promise.all(
              insertedRecipients.map(async (recip) => {
                const openLink = generateOpenLink(SUPABASE_PROJECT_URL, campaign.id, recip.id);
                const clickLink = generateClickLink(SUPABASE_PROJECT_URL, campaign.id, recip.id, "https://example.com");
                await supabase
                  .from('recipients')
                  .update({
                    track_open_link: openLink,
                    track_click_link: clickLink,
                  })
                  .eq('id', recip.id);
              })
            );

            await supabase
              .from('campaigns')
              .update({ total_recipients: insertedRecipients.length })
              .eq('id', campaign.id);
          }
        }
      }

      toast({
        title: "Success",
        description: `Campaign ${isDraft ? 'saved as draft' : 'created and ready to send'}!`,
      });

      setForm({
        name: '',
        subject: '',
        content: '',
        send_delay_minutes: 1,
        is_html: false
      });
      setSelectedConfigs([]);
      setRecipients('');
      setSelectedTemplate('');
      setSelectedListId('');
      setFollowups([]);
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

  const delayOptions = [
    { value: 1, label: '1 minute' },
    { value: 3, label: '3 minutes' },
    { value: 5, label: '5 minutes' },
    { value: 10, label: '10 minutes' },
    { value: 30, label: '30 minutes' },
    { value: 60, label: '1 hour' }
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Dynamic Variables Info Card */}
      <Card className="bg-green-50 border-green-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-green-800">
            <Info className="h-5 w-5" />
            Personalization Variables
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
            <div>
              <strong>{'{name}'}</strong> - Full name
            </div>
            <div>
              <strong>{'{first_name}'}</strong> - First name only
            </div>
            <div>
              <strong>{'{last_name}'}</strong> - Last name only
            </div>
            <div>
              <strong>{'{email}'}</strong> - Email address
            </div>
            <div>
              <strong>{'{company}'}</strong> - Company name
            </div>
            <div>
              <strong>{'{domain}'}</strong> - Email domain
            </div>
          </div>
          <p className="text-green-700 text-xs mt-3">
            Use these in subject lines and content for automatic personalization. Works with both templates and manual campaigns.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Create New Campaign</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Template Selection */}
          {templates.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="template">Load from Template (Optional)</Label>
              <Select value={selectedTemplate} onValueChange={handleTemplateSelect}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a template" />
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

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Campaign Name</Label>
              <Input
                id="name"
                placeholder="Enter campaign name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Email Accounts & Daily Limits</Label>
              <div className="border rounded-md p-4 space-y-4 max-h-60 overflow-y-auto">
                {emailConfigs.map((config) => {
                  const isSelected = selectedConfigs.some(c => c.configId === config.id);
                  const selectedConfig = selectedConfigs.find(c => c.configId === config.id);
                  
                  return (
                    <div key={config.id} className="flex items-center justify-between space-x-2">
                      <div className="flex items-center space-x-2">
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
                        <Label htmlFor={`config-${config.id}`} className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                          {config.smtp_username}
                        </Label>
                      </div>
                      {isSelected && (
                        <div className="flex items-center space-x-2">
                          <Label className="text-xs whitespace-nowrap">Limit/Day:</Label>
                          <Input 
                            type="number" 
                            className="w-20 h-8" 
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
              {selectedConfigs.length > 0 && (
                <div className="text-xs text-gray-500 space-y-1">
                  <p>Total Daily Capacity: {selectedConfigs.reduce((acc, curr) => acc + curr.dailyLimit, 0)} emails</p>
                  {(() => {
                    const totalRecipients = selectedListId ? listCount : recipients.split('\n').filter(r => r.trim()).length;
                    const totalDailyLimit = selectedConfigs.reduce((acc, curr) => acc + curr.dailyLimit, 0);
                    const estimatedDays = totalDailyLimit > 0 ? Math.ceil(totalRecipients / totalDailyLimit) : 0;
                    if (totalRecipients > 0 && totalDailyLimit > 0) {
                      return (
                        <p className="font-medium text-blue-600">
                          Estimated Duration: {estimatedDays} day{estimatedDays !== 1 ? 's' : ''} for {totalRecipients} recipients
                        </p>
                      );
                    }
                    return null;
                  })()}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="subject">Subject Line</Label>
            <Input
              id="subject"
              placeholder="Welcome to {company}, {first_name}!"
              value={form.subject}
              onChange={(e) => setForm({ ...form, subject: e.target.value })}
            />
            <p className="text-xs text-gray-500">Use variables like {'{name}'}, {'{first_name}'}, {'{company}'} for personalization</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="delay" className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Delay Between Emails
              </Label>
              <Select 
                value={form.send_delay_minutes.toString()} 
                onValueChange={(value) => setForm({ ...form, send_delay_minutes: parseInt(value) })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {delayOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value.toString()}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="html-toggle" className="flex items-center gap-2">
                HTML Email
              </Label>
              <div className="flex items-center space-x-2">
                <Switch
                  id="html-toggle"
                  checked={form.is_html}
                  onCheckedChange={(checked) => setForm({ ...form, is_html: checked })}
                />
                <span className="text-sm text-gray-600">
                  {form.is_html ? 'HTML enabled' : 'Plain text'}
                </span>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="content">Email Content</Label>
            <Textarea
              id="content"
              placeholder={form.is_html ? 
                "Dear {name},\n\n<p>Welcome to our amazing service at <strong>{company}</strong>!</p>\n\n<a href='https://example.com'>Click here to get started</a>" :
                "Dear {name},\n\nWelcome to our **amazing service** at {company}!\n\nBest regards,\nThe Team"
              }
              className="min-h-[200px]"
              value={form.content}
              onChange={(e) => setForm({ ...form, content: e.target.value })}
            />
            <p className="text-xs text-gray-500">
              Use dynamic variables for personalization. {form.is_html ? "HTML tags like <p>, <strong>, <a> are supported for tracking." : "Use **text** to make text bold in plain text emails."}
            </p>
          </div>

          {/* Follow-up Section */}
          <div className="space-y-4 border-t pt-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-medium">Follow-up Emails</h3>
              <Button variant="outline" size="sm" onClick={addFollowupStep}>
                <Plus className="h-4 w-4 mr-2" />
                Add Follow-up
              </Button>
            </div>
            
            {followups.length === 0 && (
              <p className="text-sm text-gray-500 italic">No follow-up emails configured. Add one to create a sequence.</p>
            )}

            <Accordion type="single" collapsible className="w-full">
              {followups.map((step, index) => (
                <AccordionItem key={index} value={`step-${index}`}>
                  <AccordionTrigger className="hover:no-underline">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">Step {step.step_number}</span>
                      <span className="text-sm text-gray-500">
                        (Wait {step.delay_days} days, {step.delay_hours} hours)
                      </span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="space-y-4 p-4 border rounded-md bg-gray-50">
                    <div className="flex justify-end">
                      <Button variant="ghost" size="sm" onClick={() => removeFollowupStep(index)} className="text-red-500 hover:text-red-700">
                        <Trash2 className="h-4 w-4 mr-2" />
                        Remove Step
                      </Button>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Wait Days</Label>
                        <Input 
                          type="number" 
                          min="0"
                          value={step.delay_days}
                          onChange={(e) => updateFollowupStep(index, 'delay_days', parseInt(e.target.value) || 0)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Wait Hours</Label>
                        <Input 
                          type="number" 
                          min="0" 
                          max="23"
                          value={step.delay_hours}
                          onChange={(e) => updateFollowupStep(index, 'delay_hours', parseInt(e.target.value) || 0)}
                        />
                      </div>
                    </div>

                    {templates.length > 0 && (
                      <div className="space-y-2">
                        <Label>Load Template</Label>
                        <Select onValueChange={(val) => handleFollowupTemplateSelect(index, val)}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a template" />
                          </SelectTrigger>
                          <SelectContent>
                            {templates.map((t) => (
                              <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    <div className="space-y-2">
                      <Label>Subject</Label>
                      <Input 
                        placeholder="Re: Previous Subject"
                        value={step.subject}
                        onChange={(e) => updateFollowupStep(index, 'subject', e.target.value)}
                      />
                      <p className="text-xs text-gray-500">Leave blank to use "Re: [Original Subject]"</p>
                    </div>

                    <div className="space-y-2">
                      <Label>Body</Label>
                      <Textarea 
                        placeholder="Follow-up content..."
                        className="min-h-[150px]"
                        value={step.body}
                        onChange={(e) => updateFollowupStep(index, 'body', e.target.value)}
                      />
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>

          <div className="space-y-2 border-t pt-4">
            <Label htmlFor="prospect-list">Use Prospect List (Optional)</Label>
            <select
              className="w-full border rounded p-2"
              value={selectedListId}
              onChange={e => setSelectedListId(e.target.value)}
              >
              <option value="">None</option>
              {allLists.map(list =>
                <option key={list.id} value={list.id}>{list.name}</option>
              )}
            </select>
            {selectedListId && (
              <p className="text-sm text-gray-600">
                All prospects from the selected list will be used as recipients. You cannot add individual recipients below.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="recipients">Recipients</Label>
            <Textarea
              id="recipients"
              placeholder="Enter recipients (one per line): email@example.com, Name"
              className="min-h-[100px]"
              value={recipients}
              onChange={(e) => setRecipients(e.target.value)}
              disabled={!!selectedListId}
            />
            <p className="text-sm text-gray-600">
              Format: email@example.com, Optional Name (one per line)
            </p>
          </div>

          <div className="flex space-x-4">
            <Button 
              variant="outline" 
              onClick={() => handleSave(true)} 
              disabled={loading}
            >
              Save as Draft
            </Button>
            <Button 
              onClick={() => handleSave(false)} 
              disabled={loading}
            >
              <Plus className="h-4 w-4 mr-2" />
              {loading ? 'Creating...' : 'Create Campaign'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default CampaignBuilder;

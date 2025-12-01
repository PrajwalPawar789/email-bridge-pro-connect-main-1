import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/hooks/use-toast';
import { 
  Plus, Edit, Trash2, Save, Info, Eye, Search, 
  LayoutTemplate, FileText, ArrowLeft, Check, Copy, X
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";

const TemplateManager = () => {
  const [templates, setTemplates] = useState<any[]>([]);
  const [view, setView] = useState<'list' | 'editor'>('list');
  const [editingTemplate, setEditingTemplate] = useState<any>(null);
  const [form, setForm] = useState({
    name: '',
    subject: '',
    content: '',
    is_html: false
  });
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewContent, setPreviewContent] = useState<any>(null);

  useEffect(() => {
    fetchTemplates();
  }, []);

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

  const handleSave = async () => {
    if (!form.name || !form.subject || !form.content) {
      toast({
        title: "Missing Information",
        description: "Please fill in the template name, subject, and content.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      if (editingTemplate) {
        // Update existing template
        const { error } = await supabase
          .from('email_templates')
          .update({
            name: form.name,
            subject: form.subject,
            content: form.content,
            is_html: form.is_html,
            updated_at: new Date().toISOString()
          })
          .eq('id', editingTemplate.id);

        if (error) throw error;
        toast({ title: "Success", description: "Template updated successfully!" });
      } else {
        // Create new template
        const { error } = await supabase
          .from('email_templates')
          .insert({
            user_id: user.id,
            name: form.name,
            subject: form.subject,
            content: form.content,
            is_html: form.is_html
          });

        if (error) throw error;
        toast({ title: "Success", description: "Template created successfully!" });
      }

      resetForm();
      await fetchTemplates();
      setView('list');
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (template: any) => {
    setEditingTemplate(template);
    setForm({
      name: template.name,
      subject: template.subject,
      content: template.content,
      is_html: template.is_html
    });
    setView('editor');
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this template?")) return;

    try {
      const { error } = await supabase
        .from('email_templates')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast({ title: "Deleted", description: "Template removed." });
      await fetchTemplates();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const resetForm = () => {
    setForm({
      name: '',
      subject: '',
      content: '',
      is_html: false
    });
    setEditingTemplate(null);
  };

  const insertVariable = (variable: string) => {
    setForm(prev => ({
      ...prev,
      content: prev.content + variable
    }));
    toast({
      title: "Variable Added",
      description: `${variable} added to content.`,
      duration: 1500,
    });
  };

  const filteredTemplates = templates.filter(t => 
    t.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    t.subject.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // --- RENDER HELPERS ---

  const renderListView = () => (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Email Templates</h2>
          <p className="text-gray-500">Manage your saved email designs and scripts.</p>
        </div>
        <Button onClick={() => { resetForm(); setView('editor'); }} className="bg-blue-600 hover:bg-blue-700">
          <Plus className="h-4 w-4 mr-2" />
          Create Template
        </Button>
      </div>

      <div className="flex items-center space-x-2 bg-white p-2 rounded-md border shadow-sm max-w-md">
        <Search className="h-4 w-4 text-gray-400 ml-2" />
        <Input 
          placeholder="Search templates..." 
          className="border-none shadow-none focus-visible:ring-0"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {filteredTemplates.length === 0 ? (
        <div className="text-center py-16 bg-gray-50 rounded-lg border-2 border-dashed">
          <LayoutTemplate className="h-12 w-12 mx-auto text-gray-300 mb-4" />
          <h3 className="text-lg font-medium text-gray-900">No templates found</h3>
          <p className="text-gray-500 mb-6">Get started by creating your first email template.</p>
          <Button variant="outline" onClick={() => { resetForm(); setView('editor'); }}>
            Create Template
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredTemplates.map((template) => (
            <Card key={template.id} className="group hover:shadow-md transition-all duration-200 flex flex-col">
              <CardHeader className="pb-3">
                <div className="flex justify-between items-start">
                  <div className="space-y-1">
                    <CardTitle className="text-base font-semibold line-clamp-1" title={template.name}>
                      {template.name}
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-xs font-normal">
                        {template.is_html ? 'HTML' : 'Text'}
                      </Badge>
                      <span className="text-xs text-gray-400">
                        {new Date(template.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex-1 pb-3">
                <div className="bg-gray-50 p-3 rounded text-xs text-gray-500 h-24 overflow-hidden relative">
                  <p className="font-medium text-gray-700 mb-1 truncate">Subject: {template.subject}</p>
                  <div className="opacity-70 line-clamp-3">
                    {template.content}
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-gray-50 to-transparent" />
                </div>
              </CardContent>
              <CardFooter className="pt-0 gap-2 justify-end border-t bg-gray-50/50 p-3">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() => {
                    setPreviewContent(template);
                    setPreviewOpen(true);
                  }}
                >
                  <Eye className="h-4 w-4 text-gray-500" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() => handleEdit(template)}
                >
                  <Edit className="h-4 w-4 text-blue-600" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 hover:bg-red-50"
                  onClick={() => handleDelete(template.id)}
                >
                  <Trash2 className="h-4 w-4 text-red-500" />
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  );

  const renderEditorView = () => (
    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => setView('list')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to List
          </Button>
          <h2 className="text-2xl font-bold tracking-tight">
            {editingTemplate ? 'Edit Template' : 'New Template'}
          </h2>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setView('list')}>Cancel</Button>
          <Button onClick={handleSave} disabled={loading} className="bg-green-600 hover:bg-green-700">
            <Save className="h-4 w-4 mr-2" />
            {loading ? 'Saving...' : 'Save Template'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-200px)]">
        {/* Main Editor Column */}
        <div className="lg:col-span-2 flex flex-col gap-4 h-full">
          <Card className="flex-1 flex flex-col overflow-hidden">
            <CardContent className="p-6 flex-1 flex flex-col gap-4 overflow-y-auto">
              <div className="space-y-2">
                <Label htmlFor="name">Template Name</Label>
                <Input
                  id="name"
                  placeholder="e.g., Cold Outreach - Follow Up 1"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="font-medium"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="subject">Subject Line</Label>
                <div className="relative">
                  <Input
                    id="subject"
                    placeholder="Quick question for {company}..."
                    value={form.subject}
                    onChange={(e) => setForm({ ...form, subject: e.target.value })}
                    className="pr-24"
                  />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">
                    {form.subject.length} chars
                  </div>
                </div>
              </div>

              <div className="flex-1 flex flex-col gap-2 min-h-[300px]">
                <div className="flex justify-between items-center">
                  <Label htmlFor="content">Email Content</Label>
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="html-mode"
                      checked={form.is_html}
                      onCheckedChange={(checked) => setForm({ ...form, is_html: checked })}
                    />
                    <Label htmlFor="html-mode" className="text-xs font-normal text-gray-500">
                      {form.is_html ? 'HTML Mode' : 'Plain Text'}
                    </Label>
                  </div>
                </div>
                <Tabs defaultValue="edit" className="flex-1 flex flex-col">
                  <TabsList className="w-full justify-start border-b rounded-none bg-transparent p-0 h-auto">
                    <TabsTrigger value="edit" className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:bg-transparent">
                      Editor
                    </TabsTrigger>
                    <TabsTrigger value="preview" className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:bg-transparent">
                      Preview
                    </TabsTrigger>
                  </TabsList>
                  <TabsContent value="edit" className="flex-1 mt-4">
                    <Textarea
                      id="content"
                      placeholder={form.is_html ? "<html><body>...</body></html>" : "Hi {first_name},..."}
                      className="h-full min-h-[300px] font-mono text-sm resize-none p-4"
                      value={form.content}
                      onChange={(e) => setForm({ ...form, content: e.target.value })}
                    />
                  </TabsContent>
                  <TabsContent value="preview" className="flex-1 mt-4 border rounded-md bg-gray-50 p-4 overflow-auto">
                    {form.is_html ? (
                      <div dangerouslySetInnerHTML={{ __html: form.content }} className="prose max-w-none" />
                    ) : (
                      <div className="whitespace-pre-wrap font-sans text-sm">{form.content}</div>
                    )}
                  </TabsContent>
                </Tabs>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar Column */}
        <div className="lg:col-span-1 h-full">
          <Card className="h-full flex flex-col bg-gray-50/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <LayoutTemplate className="h-4 w-4" />
                Personalization Variables
              </CardTitle>
              <CardDescription className="text-xs">
                Click to insert into content
              </CardDescription>
            </CardHeader>
            <CardContent className="flex-1 overflow-y-auto">
              <div className="space-y-2">
                {[
                  { key: '{first_name}', label: 'First Name', desc: 'John' },
                  { key: '{last_name}', label: 'Last Name', desc: 'Doe' },
                  { key: '{company}', label: 'Company', desc: 'Acme Inc' },
                  { key: '{email}', label: 'Email', desc: 'john@example.com' },
                  { key: '{domain}', label: 'Website', desc: 'example.com' },
                  { key: '{name}', label: 'Full Name', desc: 'John Doe' },
                ].map((variable) => (
                  <div 
                    key={variable.key}
                    className="group flex items-center justify-between p-3 bg-white rounded-md border hover:border-blue-400 hover:shadow-sm cursor-pointer transition-all"
                    onClick={() => insertVariable(variable.key)}
                  >
                    <div>
                      <div className="font-mono text-xs font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded inline-block mb-1">
                        {variable.key}
                      </div>
                      <div className="text-xs text-gray-500">{variable.label}</div>
                    </div>
                    <Plus className="h-4 w-4 text-gray-300 group-hover:text-blue-500" />
                  </div>
                ))}
              </div>

              <div className="mt-6 p-4 bg-blue-50 rounded-md border border-blue-100">
                <h4 className="text-xs font-semibold text-blue-800 mb-2 flex items-center gap-1">
                  <Info className="h-3 w-3" />
                  Pro Tip
                </h4>
                <p className="text-xs text-blue-700 leading-relaxed">
                  Use <strong>{'{first_name}'}</strong> in your subject line to increase open rates by up to 20%.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto p-6">
      {view === 'list' ? renderListView() : renderEditorView()}

      {/* Preview Dialog for List View */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{previewContent?.name}</DialogTitle>
            <DialogDescription>Subject: {previewContent?.subject}</DialogDescription>
          </DialogHeader>
          <div className="mt-4 p-4 border rounded-md bg-gray-50 min-h-[200px]">
            {previewContent?.is_html ? (
              <div dangerouslySetInnerHTML={{ __html: previewContent.content }} className="prose max-w-none text-sm" />
            ) : (
              <div className="whitespace-pre-wrap text-sm font-sans">{previewContent?.content}</div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TemplateManager;

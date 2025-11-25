import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/hooks/use-toast';
import { Plus, Edit, Trash2, Save, Info } from 'lucide-react';

const TemplateManager = () => {
  const [templates, setTemplates] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<any>(null);
  const [form, setForm] = useState({
    name: '',
    subject: '',
    content: '',
    is_html: false
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchTemplates();
  }, []);

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

  const handleSave = async () => {
    if (!form.name || !form.subject || !form.content) {
      toast({
        title: "Error",
        description: "Please fill in all fields",
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
        toast({
          title: "Success",
          description: "Template updated successfully!",
        });
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
        toast({
          title: "Success",
          description: "Template created successfully!",
        });
      }

      resetForm();
      await fetchTemplates();
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
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase
        .from('email_templates')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Template deleted successfully!",
      });

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
    setShowForm(false);
  };

  return (
    <div className="space-y-6">
      {/* Dynamic Variables Info Card */}
      <Card className="bg-blue-50 border-blue-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-blue-800">
            <Info className="h-5 w-5" />
            Dynamic Variables Available
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
          <p className="text-blue-700 text-xs mt-3">
            Use these variables in both subject lines and content to personalize your emails automatically.
          </p>
        </CardContent>
      </Card>

      {/* Templates List */}
      {templates.length > 0 && (
        <div className="grid gap-4">
          {templates.map((template) => (
            <Card key={template.id}>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-lg">{template.name}</CardTitle>
                    <p className="text-sm text-gray-600 mt-1">{template.subject}</p>
                  </div>
                  <div className="flex space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEdit(template)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDelete(template.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-sm text-gray-600">
                  <p className="mb-2">
                    Type: {template.is_html ? 'HTML' : 'Plain Text'}
                  </p>
                  <p className="truncate">
                    {template.content.substring(0, 150)}...
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add/Edit Template Form */}
      {!showForm ? (
        <Card>
          <CardContent className="p-6">
            <Button onClick={() => setShowForm(true)} className="w-full">
              <Plus className="h-4 w-4 mr-2" />
              Create New Template
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>
              {editingTemplate ? 'Edit Template' : 'Create New Template'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="template-name">Template Name</Label>
              <Input
                id="template-name"
                placeholder="Enter template name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="template-subject">Subject Line</Label>
              <Input
                id="template-subject"
                placeholder="Hello {first_name}, welcome to our service!"
                value={form.subject}
                onChange={(e) => setForm({ ...form, subject: e.target.value })}
              />
              <p className="text-xs text-gray-500">Use variables like {'{name}'}, {'{first_name}'}, {'{company}'} for personalization</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="html-toggle" className="flex items-center gap-2">
                HTML Template
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

            <div className="space-y-2">
              <Label htmlFor="template-content">Template Content</Label>
              <Textarea
                id="template-content"
                placeholder={form.is_html ? 
                  "Dear {name},\n\n<p>Welcome to our amazing service at <strong>{company}</strong>!</p>\n\n<a href='https://example.com'>Click here to get started</a>" : 
                  "Dear {name},\n\nWelcome to our amazing service!\n\nBest regards,\nThe Team"
                }
                className="min-h-[200px]"
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
              />
              <p className="text-xs text-gray-500">
                Use dynamic variables to personalize content. {form.is_html && "HTML tags like <p>, <strong>, <a> are supported."}
              </p>
            </div>

            <div className="flex space-x-4">
              <Button
                variant="outline"
                onClick={resetForm}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                disabled={loading}
                className="flex-1"
              >
                <Save className="h-4 w-4 mr-2" />
                {loading ? 'Saving...' : (editingTemplate ? 'Update Template' : 'Save Template')}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default TemplateManager;

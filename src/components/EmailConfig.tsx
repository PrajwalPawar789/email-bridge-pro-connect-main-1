
import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { Trash2 } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';

interface EmailConfigProps {
  onConfigAdded?: () => void;
}

const EmailConfig: React.FC<EmailConfigProps> = ({ onConfigAdded }) => {
  const [form, setForm] = useState({
    smtp_username: '',
    smtp_password: '',
    smtp_host: 'smtp.titan.email',
    smtp_port: 465,
    imap_host: 'imap.titan.email',
    imap_port: 993,
    security: 'SSL'
  });
  const [loading, setLoading] = useState(false);
  const [configs, setConfigs] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);

  React.useEffect(() => {
    fetchConfigs();
  }, []);

  const fetchConfigs = async () => {
    try {
      const { data, error } = await supabase
        .from('email_configs')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      setConfigs(data || []);
    } catch (error: any) {
      console.error('Error fetching configs:', error);
    }
  };

  const handleSave = async () => {
    if (!form.smtp_username || !form.smtp_password) {
      toast({
        title: "Error",
        description: "Please fill in email and password",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase.from('email_configs').insert({
        user_id: user.id,
        smtp_username: form.smtp_username,
        smtp_password: form.smtp_password,
        smtp_host: form.smtp_host,
        smtp_port: form.smtp_port,
        imap_host: form.imap_host,
        imap_port: form.imap_port,
        security: form.security
      });

      if (error) throw error;

      toast({
        title: "Success",
        description: "Email configuration saved successfully!",
      });

      setForm({
        smtp_username: '',
        smtp_password: '',
        smtp_host: 'smtp.titan.email',
        smtp_port: 465,
        imap_host: 'imap.titan.email',
        imap_port: 993,
        security: 'SSL'
      });

      setShowForm(false);
      await fetchConfigs();
      if (onConfigAdded) onConfigAdded();
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

  const handleDelete = async (id: string) => {
    try {
      // First, check if there are any email messages using this config
      const { data: messages, error: checkError } = await supabase
        .from('email_messages')
        .select('id')
        .eq('config_id', id)
        .limit(1);

      if (checkError) throw checkError;

      if (messages && messages.length > 0) {
        // Delete associated email messages first
        const { error: deleteMessagesError } = await supabase
          .from('email_messages')
          .delete()
          .eq('config_id', id);

        if (deleteMessagesError) throw deleteMessagesError;
      }

      // Now delete the config
      const { error } = await supabase
        .from('email_configs')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Email configuration and associated messages deleted successfully!",
      });

      await fetchConfigs();
      if (onConfigAdded) onConfigAdded();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Existing Configurations */}
      {configs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Your Email Accounts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {configs.map((config) => (
                <div key={config.id} className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <p className="font-medium">{config.smtp_username}</p>
                    <p className="text-sm text-gray-600">{config.smtp_host}:{config.smtp_port}</p>
                  </div>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" size="sm">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete Email Configuration</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will permanently delete the email configuration and all associated email messages. 
                          This action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleDelete(config.id)}>
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Add New Configuration */}
      {!showForm ? (
        <Card>
          <CardContent className="p-6">
            <Button onClick={() => setShowForm(true)} className="w-full">
              Add New Email Account
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Add Email Configuration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="smtp_username">Email Address</Label>
                <Input
                  id="smtp_username"
                  type="email"
                  placeholder="your-email@domain.com"
                  value={form.smtp_username}
                  onChange={(e) => setForm({ ...form, smtp_username: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="smtp_password">Password</Label>
                <Input
                  id="smtp_password"
                  type="password"
                  placeholder="Your email password"
                  value={form.smtp_password}
                  onChange={(e) => setForm({ ...form, smtp_password: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="smtp_host">SMTP Host</Label>
                <Select 
                  value={form.smtp_host} 
                  onValueChange={(value) => {
                    const updates: any = { smtp_host: value };
                    if (value === 'smtp.gmail.com') {
                      updates.smtp_port = 465;
                      updates.security = 'SSL';
                      updates.imap_host = 'imap.gmail.com';
                      updates.imap_port = 993;
                    } else if (value === 'smtp.titan.email') {
                      updates.smtp_port = 465;
                      updates.security = 'SSL';
                      updates.imap_host = 'imap.titan.email';
                      updates.imap_port = 993;
                    }
                    setForm({ ...form, ...updates });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="smtp.gmail.com">smtp.gmail.com (Gmail)</SelectItem>
                    <SelectItem value="smtp.titan.email">smtp.titan.email (Hostinger/Titan)</SelectItem>
                    <SelectItem value="smtp.hostinger.com">smtp.hostinger.com (Legacy)</SelectItem>
                    <SelectItem value="mail.hostinger.com">mail.hostinger.com (Old)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="smtp_port">SMTP Port</Label>
                <Input
                  id="smtp_port"
                  type="number"
                  value={form.smtp_port}
                  onChange={(e) => setForm({ ...form, smtp_port: parseInt(e.target.value) })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="security">Security</Label>
                <Select value={form.security} onValueChange={(value) => setForm({ ...form, security: value })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SSL">SSL</SelectItem>
                    <SelectItem value="TLS">TLS</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="imap_host">IMAP Host</Label>
                <Select value={form.imap_host} onValueChange={(value) => setForm({ ...form, imap_host: value })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="imap.gmail.com">imap.gmail.com (Gmail)</SelectItem>
                    <SelectItem value="imap.titan.email">imap.titan.email (Hostinger/Titan)</SelectItem>
                    <SelectItem value="imap.hostinger.com">imap.hostinger.com (Legacy)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="imap_port">IMAP Port</Label>
                <Input
                  id="imap_port"
                  type="number"
                  value={form.imap_port}
                  onChange={(e) => setForm({ ...form, imap_port: parseInt(e.target.value) })}
                />
              </div>
            </div>

            {form.smtp_host === 'smtp.gmail.com' && (
              <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
                <h4 className="font-medium text-yellow-900 mb-2">Gmail Configuration Required</h4>
                <p className="text-sm text-yellow-800 mb-2">
                  To use Gmail, you must use an <strong>App Password</strong>, not your regular login password.
                </p>
                <ol className="list-decimal list-inside text-sm text-yellow-800 space-y-1">
                  <li>Go to your Google Account settings</li>
                  <li>Enable 2-Step Verification if not already enabled</li>
                  <li>Search for "App Passwords"</li>
                  <li>Create a new App Password for "Mail"</li>
                  <li>Copy that 16-character password and paste it in the Password field above</li>
                </ol>
              </div>
            )}

            {form.smtp_host.includes('titan') && (
              <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                <h4 className="font-medium text-blue-900 mb-2">Hostinger Email Settings</h4>
                <p className="text-sm text-blue-800">
                  For Hostinger professional emails, use <strong>smtp.titan.email</strong> as the SMTP host. 
                  This is the recommended setting that works with most Hostinger email accounts.
                </p>
              </div>
            )}

            <div className="flex space-x-4">
              <Button
                variant="outline"
                onClick={() => setShowForm(false)}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                disabled={loading}
                className="flex-1"
              >
                {loading ? 'Saving...' : 'Save Configuration'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default EmailConfig;

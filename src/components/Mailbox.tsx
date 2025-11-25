
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Mail, RefreshCw, Eye, Trash2, Inbox } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface MailboxProps {
  emailConfigs: any[];
}

interface EmailMessage {
  id: string;
  config_id: string;
  from_email: string;
  to_email: string;
  subject: string | null;
  body: string | null;
  date: string;
  folder: string;
  read: boolean | null;
  uid: number;
  user_id: string;
}

interface SyncStats {
  processed: number;
  inserted: number;
  skipped: number;
}

const sortEmails = (list: EmailMessage[]) =>
  [...list].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

const DEFAULT_MAILBOX_SYNC_URL = 'http://localhost:8787/sync-mailbox';
const MAILBOX_SYNC_URL = import.meta.env.VITE_MAILBOX_SYNC_URL || DEFAULT_MAILBOX_SYNC_URL;

const Mailbox: React.FC<MailboxProps> = ({ emailConfigs }) => {
  const [emails, setEmails] = useState<EmailMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedConfig, setSelectedConfig] = useState<string>('');
  const [syncing, setSyncing] = useState(false);
  const [syncStats, setSyncStats] = useState<SyncStats | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

  useEffect(() => {
    if (emailConfigs.length > 0 && !selectedConfig) {
      setSelectedConfig(emailConfigs[0].id);
    }
  }, [emailConfigs, selectedConfig]);

  const fetchEmails = useCallback(async () => {
    if (!selectedConfig) return;
    
    setLoading(true);
    try {
      console.log('Fetching emails for config:', selectedConfig);
      
      const { data, error } = await supabase
        .from('email_messages')
        .select('*')
        .eq('config_id', selectedConfig)
        .order('date', { ascending: false })
        .limit(50);

      if (error) {
        console.error('Error fetching emails:', error);
        throw error;
      }

  console.log('Emails fetched:', data);
  setEmails(sortEmails((data as EmailMessage[] | null) ?? []));
    } catch (error: any) {
      console.error('Error fetching emails:', error);
      toast({
        title: "Error",
        description: "Failed to fetch emails: " + error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [selectedConfig]);

  useEffect(() => {
    if (selectedConfig) {
      fetchEmails();
    }
  }, [selectedConfig, fetchEmails]);

  useEffect(() => {
    if (!selectedConfig) return;

    const channel = supabase
      .channel(`mailbox-${selectedConfig}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'email_messages',
          filter: `config_id=eq.${selectedConfig}`
        },
        (payload) => {
          const newEmail = payload.new as EmailMessage;
          setEmails((prev) => {
            const without = prev.filter((email) => email.id !== newEmail.id);
            return sortEmails([newEmail, ...without]);
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'email_messages',
          filter: `config_id=eq.${selectedConfig}`
        },
        (payload) => {
          const updatedEmail = payload.new as EmailMessage;
          setEmails((prev) =>
            sortEmails(
              prev.map((email) =>
                email.id === updatedEmail.id ? updatedEmail : email
              )
            )
          );
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'email_messages',
          filter: `config_id=eq.${selectedConfig}`
        },
        (payload) => {
          const removedId = (payload.old as EmailMessage).id;
          setEmails((prev) => prev.filter((email) => email.id !== removedId));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedConfig]);

  const syncEmails = async () => {
    if (!selectedConfig) {
      toast({
        title: "Error",
        description: "Please select an email account first",
        variant: "destructive",
      });
      return;
    }

    setSyncing(true);
    setSyncStats(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('You must be logged in to sync emails');
      }

      const response = await fetch(MAILBOX_SYNC_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ configId: selectedConfig, limit: 50 }),
      });

      let payload: any = null;
      try {
        payload = await response.json();
      } catch (parseError) {
        console.error('Failed to parse mailbox sync response', parseError);
      }

      if (!response.ok || !payload?.success) {
        const message = payload?.error || `Mailbox sync failed (${response.status})`;
        throw new Error(message);
      }

      const stats: SyncStats = {
        processed: payload.processed ?? 0,
        inserted: payload.inserted ?? 0,
        skipped: payload.skipped ?? 0,
      };

      setSyncStats(stats);
      setLastSyncedAt(new Date().toISOString());

      toast({
        title: "Mailbox synced",
        description: `Processed ${stats.processed} messages, ${stats.inserted} new emails added.`,
      });

      await fetchEmails();
    } catch (error: any) {
      console.error('Error syncing emails:', error);
      let description = error.message || 'Failed to sync emails';
      if (error.message === 'Failed to fetch') {
        description = 'Could not connect to sync server. Please ensure the mailbox sync server is running on port 8787.';
      }
      toast({
        title: "Error",
        description,
        variant: "destructive",
      });
    } finally {
      setSyncing(false);
    }
  };

  const markAsRead = async (emailId: string) => {
    try {
      const { error } = await supabase
        .from('email_messages')
        .update({ read: true })
        .eq('id', emailId);

      if (error) throw error;

      setEmails((prev) =>
        prev.map((email) =>
          email.id === emailId ? { ...email, read: true } : email
        )
      );
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to mark email as read",
        variant: "destructive",
      });
    }
  };

  const deleteEmail = async (emailId: string) => {
    try {
      const { error } = await supabase
        .from('email_messages')
        .delete()
        .eq('id', emailId);

      if (error) throw error;

  setEmails((prev) => prev.filter((email) => email.id !== emailId));
      
      toast({
        title: "Success",
        description: "Email deleted successfully",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to delete email",
        variant: "destructive",
      });
    }
  };

  if (emailConfigs.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <Mail className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No email accounts configured</h3>
          <p className="text-gray-600">Please configure an email account first to view your mailbox.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Mailbox</h2>
        <div className="flex space-x-2">
          <select 
            value={selectedConfig} 
            onChange={(e) => setSelectedConfig(e.target.value)}
            className="px-3 py-2 border rounded-md"
          >
            {emailConfigs.map((config) => (
              <option key={config.id} value={config.id}>
                {config.smtp_username}
              </option>
            ))}
          </select>
          <Button onClick={syncEmails} disabled={syncing}>
            <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Syncing...' : 'Sync Mailbox'}
          </Button>
          <Button onClick={() => fetchEmails()} variant="outline" disabled={loading}>
            Refresh
          </Button>
        </div>
      </div>

      {(syncStats || lastSyncedAt) && (
        <div className="text-sm text-gray-500">
          {lastSyncedAt && (
            <span>Last sync: {new Date(lastSyncedAt).toLocaleString()}.</span>
          )}
          {syncStats && (
            <span className="ml-2">
              Processed {syncStats.processed} emails · {syncStats.inserted} new · {syncStats.skipped} skipped.
            </span>
          )}
        </div>
      )}

      {loading && emails.length === 0 ? (
        <div className="flex items-center justify-center p-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : emails.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <Inbox className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No emails found</h3>
            <p className="text-gray-600 mb-4">This folder is empty or emails haven't been synced yet.</p>
            <Button onClick={syncEmails} disabled={syncing || !MAILBOX_SYNC_URL}>
              <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Syncing...' : 'Sync Mailbox'}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {emails.map((email: any) => (
            <Card key={email.id} className={`cursor-pointer transition-colors ${email.read ? 'bg-gray-50' : 'bg-white'}`}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2 mb-1">
                      <span className={`text-sm font-medium ${email.read ? 'text-gray-600' : 'text-gray-900'}`}>
                        {email.from_email}
                      </span>
                      {!email.read && <Badge variant="secondary" className="text-xs">New</Badge>}
                    </div>
                    <h4 className={`text-sm ${email.read ? 'text-gray-600' : 'text-gray-900 font-medium'} truncate`}>
                      {email.subject || '(No Subject)'}
                    </h4>
                    <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                      {email.body ? email.body.substring(0, 100) + '...' : 'No content'}
                    </p>
                    <span className="text-xs text-gray-400">
                      {new Date(email.date).toLocaleDateString()} {new Date(email.date).toLocaleTimeString()}
                    </span>
                  </div>
                  <div className="flex space-x-1 ml-4">
                    {!email.read && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          markAsRead(email.id);
                        }}
                      >
                        <Eye className="h-3 w-3" />
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteEmail(email.id);
                      }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default Mailbox;

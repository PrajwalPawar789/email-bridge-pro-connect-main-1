
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { 
  Mail, RefreshCw, Trash2, Inbox, Search, 
  MoreVertical, Reply, Forward, Star, Archive,
  AlertCircle, CheckCircle2, User
} from 'lucide-react';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';

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

const DEFAULT_MAILBOX_SYNC_URL = 'http://localhost:8787/sync-mailbox';
const MAILBOX_SYNC_URL = import.meta.env.VITE_MAILBOX_SYNC_URL || DEFAULT_MAILBOX_SYNC_URL;

const Mailbox: React.FC<MailboxProps> = ({ emailConfigs }) => {
  const [emails, setEmails] = useState<EmailMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedConfig, setSelectedConfig] = useState<string>('');
  const [selectedEmailId, setSelectedEmailId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [syncStats, setSyncStats] = useState<SyncStats | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

  // Initialize selection
  useEffect(() => {
    if (emailConfigs.length > 0 && !selectedConfig) {
      setSelectedConfig(emailConfigs[0].id);
    }
  }, [emailConfigs, selectedConfig]);

  const fetchEmails = useCallback(async () => {
    if (!selectedConfig) return;
    
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('email_messages')
        .select('*')
        .eq('config_id', selectedConfig)
        .eq('user_id', user.id)
        .order('date', { ascending: false })
        .limit(100); // Increased limit for better UX

      if (error) throw error;

      setEmails(data as EmailMessage[] || []);
    } catch (error: any) {
      console.error('Error fetching emails:', error);
      toast({
        title: "Error",
        description: "Failed to fetch emails",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [selectedConfig]);

  useEffect(() => {
    if (selectedConfig) {
      fetchEmails();
      setSelectedEmailId(null); // Reset selection on account switch
    }
  }, [selectedConfig, fetchEmails]);

  // Real-time subscription
  useEffect(() => {
    if (!selectedConfig) return;

    const channel = supabase
      .channel(`mailbox-${selectedConfig}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'email_messages', filter: `config_id=eq.${selectedConfig}` }, 
        () => fetchEmails() // Simply refetch for simplicity and accuracy
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [selectedConfig, fetchEmails]);

  const syncEmails = async () => {
    if (!selectedConfig) return;
    setSyncing(true);
    setSyncStats(null);
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Not authenticated');

      const response = await fetch(MAILBOX_SYNC_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ configId: selectedConfig, limit: 50 }),
      });

      const payload = await response.json();
      if (!response.ok || !payload?.success) throw new Error(payload?.error || 'Sync failed');

      setSyncStats({
        processed: payload.processed ?? 0,
        inserted: payload.inserted ?? 0,
        skipped: payload.skipped ?? 0,
      });
      setLastSyncedAt(new Date().toISOString());
      
      toast({
        title: "Sync Complete",
        description: `Added ${payload.inserted} new emails.`,
      });

      await fetchEmails();
    } catch (error: any) {
      toast({
        title: "Sync Failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSyncing(false);
    }
  };

  const handleEmailClick = async (email: EmailMessage) => {
    setSelectedEmailId(email.id);
    if (!email.read) {
      // Optimistic update
      setEmails(prev => prev.map(e => e.id === email.id ? { ...e, read: true } : e));
      
      // Background update
      await supabase
        .from('email_messages')
        .update({ read: true })
        .eq('id', email.id);
    }
  };

  const handleDeleteEmail = async (emailId: string) => {
    try {
      const { error } = await supabase.from('email_messages').delete().eq('id', emailId);
      if (error) throw error;
      
      setEmails(prev => prev.filter(e => e.id !== emailId));
      if (selectedEmailId === emailId) setSelectedEmailId(null);
      
      toast({ title: "Deleted", description: "Email moved to trash" });
    } catch (error) {
      toast({ title: "Error", description: "Could not delete email", variant: "destructive" });
    }
  };

  // Filter emails
  const filteredEmails = emails.filter(email => 
    (email.subject?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
    (email.from_email?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
    (email.body?.toLowerCase() || '').includes(searchQuery.toLowerCase())
  );

  const selectedEmail = emails.find(e => e.id === selectedEmailId);
  const currentConfig = emailConfigs.find(c => c.id === selectedConfig);

  if (emailConfigs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center p-8 border-2 border-dashed rounded-lg bg-gray-50">
        <Mail className="h-16 w-16 text-gray-300 mb-4" />
        <h3 className="text-xl font-semibold text-gray-900">No Mailbox Connected</h3>
        <p className="text-gray-500 mt-2 mb-6 max-w-md">
          Connect an email account in the Settings tab to start sending and receiving emails directly from here.
        </p>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-140px)] flex flex-col bg-white rounded-lg border shadow-sm overflow-hidden">
      {/* Top Toolbar */}
      <div className="flex items-center justify-between p-4 border-b bg-gray-50/50">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="bg-blue-100 p-2 rounded-full">
              <Inbox className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold leading-none">Inbox</h2>
              <p className="text-xs text-gray-500 mt-1">
                {currentConfig?.smtp_username}
              </p>
            </div>
          </div>
          
          <Separator orientation="vertical" className="h-8" />
          
          <div className="flex items-center gap-2">
            <select 
              value={selectedConfig} 
              onChange={(e) => setSelectedConfig(e.target.value)}
              className="h-9 w-[200px] rounded-md border border-input bg-white px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              {emailConfigs.map((config) => (
                <option key={config.id} value={config.id}>
                  {config.smtp_username}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {syncStats && (
            <span className="text-xs text-green-600 flex items-center gap-1 mr-2 bg-green-50 px-2 py-1 rounded-full">
              <CheckCircle2 className="h-3 w-3" />
              Synced {formatDistanceToNow(new Date(lastSyncedAt!), { addSuffix: true })}
            </span>
          )}
          <Button 
            variant="outline" 
            size="sm" 
            onClick={syncEmails} 
            disabled={syncing}
            className={syncing ? "animate-pulse" : ""}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Syncing...' : 'Sync Now'}
          </Button>
        </div>
      </div>

      {/* Main Content Area */}
      <ResizablePanelGroup direction="horizontal" className="flex-1">
        
        {/* Left Panel: Email List */}
        <ResizablePanel defaultSize={35} minSize={25} maxSize={45}>
          <div className="h-full flex flex-col">
            <div className="p-4 border-b">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-400" />
                <Input 
                  placeholder="Search mail..." 
                  className="pl-8 bg-gray-50 border-gray-200" 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>
            
            <ScrollArea className="flex-1">
              {loading && emails.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                  <RefreshCw className="h-8 w-8 animate-spin mb-2" />
                  <p className="text-sm">Loading emails...</p>
                </div>
              ) : filteredEmails.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                  <Inbox className="h-12 w-12 mb-2 opacity-20" />
                  <p className="text-sm">No emails found</p>
                </div>
              ) : (
                <div className="flex flex-col">
                  {filteredEmails.map((email) => (
                    <div
                      key={email.id}
                      onClick={() => handleEmailClick(email)}
                      className={`
                        flex flex-col gap-1 p-4 border-b cursor-pointer transition-colors hover:bg-gray-50
                        ${selectedEmailId === email.id ? 'bg-blue-50/60 border-l-4 border-l-blue-600' : 'border-l-4 border-l-transparent'}
                        ${!email.read ? 'bg-gray-50' : ''}
                      `}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2 overflow-hidden">
                          {!email.read && (
                            <div className="h-2 w-2 rounded-full bg-blue-600 flex-shrink-0" />
                          )}
                          <span className={`text-sm truncate ${!email.read ? 'font-bold text-gray-900' : 'font-medium text-gray-700'}`}>
                            {email.from_email}
                          </span>
                        </div>
                        <span className="text-xs text-gray-400 flex-shrink-0">
                          {formatDistanceToNow(new Date(email.date), { addSuffix: false })}
                        </span>
                      </div>
                      
                      <h4 className={`text-sm truncate ${!email.read ? 'font-semibold text-gray-900' : 'text-gray-600'}`}>
                        {email.subject || '(No Subject)'}
                      </h4>
                      
                      <p className="text-xs text-gray-500 line-clamp-2">
                        {email.body ? email.body.substring(0, 120) : 'No content preview available'}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
        </ResizablePanel>

        <ResizableHandle />

        {/* Right Panel: Reading Pane */}
        <ResizablePanel defaultSize={65}>
          {selectedEmail ? (
            <div className="h-full flex flex-col bg-white">
              {/* Email Header */}
              <div className="p-6 border-b">
                <div className="flex items-start justify-between mb-4">
                  <h1 className="text-xl font-bold text-gray-900 leading-tight">
                    {selectedEmail.subject || '(No Subject)'}
                  </h1>
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="icon" title="Reply">
                      <Reply className="h-4 w-4 text-gray-500" />
                    </Button>
                    <Button variant="ghost" size="icon" title="Forward">
                      <Forward className="h-4 w-4 text-gray-500" />
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreVertical className="h-4 w-4 text-gray-500" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleDeleteEmail(selectedEmail.id)} className="text-red-600">
                          <Trash2 className="h-4 w-4 mr-2" /> Delete
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                          <Archive className="h-4 w-4 mr-2" /> Archive
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={`https://www.gravatar.com/avatar/${selectedEmail.from_email}?d=mp`} />
                    <AvatarFallback className="bg-blue-100 text-blue-700">
                      {selectedEmail.from_email.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <div className="flex items-baseline justify-between">
                      <span className="font-medium text-sm text-gray-900">
                        {selectedEmail.from_email}
                      </span>
                      <span className="text-xs text-gray-500">
                        {new Date(selectedEmail.date).toLocaleString()}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500">
                      to me
                    </div>
                  </div>
                </div>
              </div>

              {/* Email Body */}
              <ScrollArea className="flex-1 p-6">
                <div className="prose max-w-none text-sm text-gray-800">
                  {/* Simple text rendering for now, could be dangerouslySetInnerHTML if sanitized */}
                  <div className="whitespace-pre-wrap font-sans">
                    {selectedEmail.body}
                  </div>
                </div>
              </ScrollArea>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center bg-gray-50/50 text-gray-400">
              <div className="bg-gray-100 p-4 rounded-full mb-4">
                <Mail className="h-8 w-8 text-gray-300" />
              </div>
              <p className="text-sm font-medium text-gray-500">Select an email to read</p>
            </div>
          )}
        </ResizablePanel>

      </ResizablePanelGroup>
    </div>
  );
};

export default Mailbox;

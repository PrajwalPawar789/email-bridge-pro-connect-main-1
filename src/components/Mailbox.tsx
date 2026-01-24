
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  Mail, RefreshCw, Trash2, Inbox, Search, 
  MoreVertical, Reply, Forward, Archive,
  CheckCircle2
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
const MAX_PREVIEW_LENGTH = 140;
const MAX_MAILTO_BODY_LENGTH = 2000;

const HTML_TAG_REGEX = /<\s*(html|head|body|div|p|br|table|tbody|tr|td|th|span|img|a|style|meta|link|!doctype)\b/i;

const looksLikeHtml = (value: string) => HTML_TAG_REGEX.test(value);

const extractPlainText = (body: string) => {
  const withBreaks = body
    .replace(/\r\n/g, '\n')
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\s*\/p\s*>/gi, '\n')
    .replace(/<\s*\/div\s*>/gi, '\n');

  const stripped = withBreaks.replace(/<[^>]+>/g, ' ');
  return stripped
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n\n')
    .trim();
};

const buildPreviewText = (body: string | null) => {
  if (!body) return 'No content preview available';
  const plain = extractPlainText(body);
  if (!plain) return 'No content preview available';
  return plain.replace(/\s+/g, ' ').slice(0, MAX_PREVIEW_LENGTH);
};

const sanitizeEmailHtml = (html: string) => {
  if (typeof window === 'undefined') return html;

  const doc = new DOMParser().parseFromString(html, 'text/html');
  const blockedTags = ['script', 'style', 'iframe', 'object', 'embed', 'link', 'meta', 'base'];

  blockedTags.forEach((tag) => {
    doc.querySelectorAll(tag).forEach((el) => el.remove());
  });

  doc.querySelectorAll('*').forEach((el) => {
    Array.from(el.attributes).forEach((attr) => {
      const name = attr.name.toLowerCase();
      const value = attr.value || '';

      if (name.startsWith('on')) {
        el.removeAttribute(attr.name);
        return;
      }

      if ((name === 'href' || name === 'src') && value) {
        const trimmed = value.trim().toLowerCase();
        if (trimmed.startsWith('javascript:') || trimmed.startsWith('data:text/html')) {
          el.removeAttribute(attr.name);
        }
      }
    });
  });

  doc.querySelectorAll('a').forEach((el) => {
    el.setAttribute('target', '_blank');
    el.setAttribute('rel', 'noopener noreferrer');
  });

  return doc.body.innerHTML;
};

const buildReplySubject = (subject: string | null) => {
  const base = subject?.trim() || '(No Subject)';
  return /^re:/i.test(base) ? base : `Re: ${base}`;
};

const buildForwardSubject = (subject: string | null) => {
  const base = subject?.trim() || '(No Subject)';
  return /^(fwd|fw):/i.test(base) ? base : `Fwd: ${base}`;
};

const buildMailtoLink = (to: string | null, subject: string, body: string) => {
  const params = new URLSearchParams();
  if (subject) params.set('subject', subject);
  if (body) params.set('body', body);
  const query = params.toString();
  const address = to ? encodeURIComponent(to) : '';
  return `mailto:${address}${query ? `?${query}` : ''}`;
};

const buildReplyBody = (email: EmailMessage) => {
  const plain = extractPlainText(email.body || '');
  const clipped = plain.length > MAX_MAILTO_BODY_LENGTH ? `${plain.slice(0, MAX_MAILTO_BODY_LENGTH)}...` : plain;
  const quoted = clipped
    .split(/\r?\n/)
    .map((line) => `> ${line}`)
    .join('\n');
  const dateLabel = new Date(email.date).toLocaleString();
  return `\n\nOn ${dateLabel}, ${email.from_email} wrote:\n${quoted}`;
};

const buildForwardBody = (email: EmailMessage) => {
  const plain = extractPlainText(email.body || '');
  const clipped = plain.length > MAX_MAILTO_BODY_LENGTH ? `${plain.slice(0, MAX_MAILTO_BODY_LENGTH)}...` : plain;
  const dateLabel = new Date(email.date).toLocaleString();
  const subject = email.subject || '(No Subject)';
  const toEmail = email.to_email || '';
  return `\n\n---------- Forwarded message ----------\nFrom: ${email.from_email}\nDate: ${dateLabel}\nSubject: ${subject}\nTo: ${toEmail}\n\n${clipped}`;
};

const Mailbox: React.FC<MailboxProps> = ({ emailConfigs }) => {
  const [emails, setEmails] = useState<EmailMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedConfig, setSelectedConfig] = useState<string>('');
  const [selectedEmailId, setSelectedEmailId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'unread'>('all');
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

  const handleReplyEmail = (email: EmailMessage) => {
    if (!email.from_email) {
      toast({ title: "Reply unavailable", description: "Sender address is missing.", variant: "destructive" });
      return;
    }
    const subject = buildReplySubject(email.subject);
    const body = buildReplyBody(email);
    window.open(buildMailtoLink(email.from_email, subject, body));
  };

  const handleForwardEmail = (email: EmailMessage) => {
    const subject = buildForwardSubject(email.subject);
    const body = buildForwardBody(email);
    window.open(buildMailtoLink(null, subject, body));
  };

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const totalCount = emails.length;
  const unreadCount = emails.filter((email) => !email.read).length;
  const hasSearch = normalizedQuery.length > 0;

  const filteredEmails = emails.filter((email) => {
    if (activeFilter === 'unread' && email.read && email.id !== selectedEmailId) {
      return false;
    }

    if (!normalizedQuery) {
      return true;
    }

    return (
      (email.subject?.toLowerCase() || '').includes(normalizedQuery) ||
      (email.from_email?.toLowerCase() || '').includes(normalizedQuery) ||
      (email.body ? extractPlainText(email.body).toLowerCase() : '').includes(normalizedQuery)
    );
  });

  const selectedEmail = emails.find((email) => email.id === selectedEmailId);
  const currentConfig = emailConfigs.find((config) => config.id === selectedConfig);
  const lastSyncLabel = lastSyncedAt
    ? formatDistanceToNow(new Date(lastSyncedAt), { addSuffix: true })
    : null;

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
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 border-b bg-gray-50/50">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-blue-100 p-2 rounded-full">
              <Inbox className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold leading-none">Inbox</h2>
                <Badge variant="secondary" className="bg-blue-50 text-blue-700 border border-blue-100 hover:bg-blue-50">
                  Unread {unreadCount}
                </Badge>
                <Badge variant="outline" className="text-gray-600">
                  Total {totalCount}
                </Badge>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {currentConfig?.smtp_username}
              </p>
            </div>
          </div>

          <Separator orientation="vertical" className="h-10" />

          <div className="flex items-center gap-2">
            <Select value={selectedConfig} onValueChange={setSelectedConfig}>
              <SelectTrigger className="h-9 w-[220px] bg-white">
                <SelectValue placeholder="Select mailbox" />
              </SelectTrigger>
              <SelectContent>
                {emailConfigs.map((config) => (
                  <SelectItem key={config.id} value={config.id}>
                    {config.smtp_username}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden sm:flex flex-col items-end text-xs text-gray-500">
            <span className="font-medium text-gray-600">Mailbox sync</span>
            {syncing ? (
              <span className="flex items-center gap-1 text-blue-600">
                <RefreshCw className="h-3 w-3 animate-spin" />
                Syncing now...
              </span>
            ) : lastSyncLabel ? (
              <span className="flex items-center gap-1 text-emerald-700">
                <CheckCircle2 className="h-3 w-3" />
                Synced {lastSyncLabel}
              </span>
            ) : (
              <span>Not synced yet</span>
            )}
            {syncStats && !syncing && (
              <span className="text-gray-400">
                {syncStats.inserted} new emails added
              </span>
            )}
          </div>
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
            <div className="p-4 border-b bg-white">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-400" />
                <Input 
                  placeholder="Search sender, subject, or content" 
                  className="pl-8 bg-gray-50 border-gray-200" 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <div className="inline-flex items-center rounded-full border border-gray-200 bg-white p-1">
                  <Button
                    variant={activeFilter === 'all' ? 'secondary' : 'ghost'}
                    size="sm"
                    className="h-7 rounded-full px-3 text-xs"
                    onClick={() => setActiveFilter('all')}
                    aria-pressed={activeFilter === 'all'}
                  >
                    All
                    <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-600">
                      {totalCount}
                    </span>
                  </Button>
                  <Button
                    variant={activeFilter === 'unread' ? 'secondary' : 'ghost'}
                    size="sm"
                    className="h-7 rounded-full px-3 text-xs"
                    onClick={() => setActiveFilter('unread')}
                    aria-pressed={activeFilter === 'unread'}
                  >
                    Unread
                    <span className="ml-2 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                      {unreadCount}
                    </span>
                  </Button>
                </div>
                <span className="text-xs text-gray-500">
                  Showing {filteredEmails.length} of {totalCount}
                </span>
              </div>
            </div>
            
            <ScrollArea className="flex-1">
              {loading && emails.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                  <RefreshCw className="h-8 w-8 animate-spin mb-2" />
                  <p className="text-sm">Loading emails...</p>
                </div>
              ) : filteredEmails.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center text-gray-400 px-6">
                  {emails.length === 0 ? (
                    <>
                      <Inbox className="h-12 w-12 mb-2 opacity-20" />
                      <p className="text-sm font-medium text-gray-600">No messages yet</p>
                      <p className="text-xs text-gray-500 mt-1">
                        Sync your mailbox to pull in replies.
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={syncEmails}
                        disabled={syncing}
                        className="mt-4"
                      >
                        <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
                        {syncing ? 'Syncing...' : 'Sync mailbox'}
                      </Button>
                    </>
                  ) : hasSearch ? (
                    <>
                      <Search className="h-10 w-10 mb-2 text-gray-300" />
                      <p className="text-sm font-medium text-gray-600">
                        No results for "{searchQuery}"
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        Try a different keyword or clear the search.
                      </p>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSearchQuery('')}
                        className="mt-3"
                      >
                        Clear search
                      </Button>
                    </>
                  ) : activeFilter === 'unread' ? (
                    <>
                      <CheckCircle2 className="h-10 w-10 mb-2 text-gray-300" />
                      <p className="text-sm font-medium text-gray-600">No unread emails</p>
                      <p className="text-xs text-gray-500 mt-1">
                        You are all caught up.
                      </p>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setActiveFilter('all')}
                        className="mt-3"
                      >
                        Show all
                      </Button>
                    </>
                  ) : (
                    <>
                      <Inbox className="h-12 w-12 mb-2 opacity-20" />
                      <p className="text-sm">No emails found</p>
                    </>
                  )}
                </div>
              ) : (
                <div className="flex flex-col">
                  {filteredEmails.map((email) => {
                    const isSelected = selectedEmailId === email.id;
                    const isUnread = !email.read;
                    return (
                      <div
                        key={email.id}
                        onClick={() => handleEmailClick(email)}
                        className={`
                          group flex gap-3 p-4 border-b cursor-pointer transition-colors hover:bg-gray-50
                          ${isSelected ? 'bg-blue-50/60 border-l-4 border-l-blue-600' : 'border-l-4 border-l-transparent'}
                          ${isUnread && !isSelected ? 'bg-gray-50' : ''}
                        `}
                      >
                        <Avatar className="h-9 w-9 flex-shrink-0">
                          <AvatarFallback className={`text-xs font-semibold ${isUnread ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                            {(email.from_email || '?').charAt(0).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex min-w-0 items-center gap-2">
                              {isUnread && (
                                <div className="h-2 w-2 rounded-full bg-blue-600 flex-shrink-0" />
                              )}
                              <span className={`truncate text-sm ${isUnread ? 'font-semibold text-gray-900' : 'font-medium text-gray-700'}`}>
                                {email.from_email}
                              </span>
                            </div>
                            <span className="text-[11px] text-gray-400 flex-shrink-0">
                              {formatDistanceToNow(new Date(email.date), { addSuffix: false })}
                            </span>
                          </div>

                          <h4 className={`text-sm truncate ${isUnread ? 'font-semibold text-gray-900' : 'text-gray-600'}`}>
                            {email.subject || '(No Subject)'}
                          </h4>

                          <p className="text-xs text-gray-500 line-clamp-2">
                            {buildPreviewText(email.body)}
                          </p>
                        </div>
                      </div>
                    );
                  })}
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
                <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
                  <div className="space-y-2">
                    <h1 className="text-xl font-bold text-gray-900 leading-tight">
                      {selectedEmail.subject || '(No Subject)'}
                    </h1>
                    <div className="flex flex-wrap items-center gap-2">
                      {selectedEmail.folder && (
                        <Badge
                          variant="outline"
                          className="text-[10px] uppercase tracking-wide text-gray-500 border-gray-200"
                        >
                          {selectedEmail.folder}
                        </Badge>
                      )}
                      {!selectedEmail.read && (
                        <Badge variant="secondary" className="text-[10px] bg-blue-100 text-blue-700 border border-blue-200 hover:bg-blue-100">
                          Unread
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button variant="outline" size="sm" className="h-8" onClick={() => handleReplyEmail(selectedEmail)}>
                      <Reply className="h-4 w-4" />
                      Reply
                    </Button>
                    <Button variant="outline" size="sm" className="h-8" onClick={() => handleForwardEmail(selectedEmail)}>
                      <Forward className="h-4 w-4" />
                      Forward
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
                {selectedEmail.body && looksLikeHtml(selectedEmail.body) ? (
                  <div
                    className="prose max-w-none text-sm text-gray-800"
                    dangerouslySetInnerHTML={{ __html: sanitizeEmailHtml(selectedEmail.body) }}
                  />
                ) : (
                  <div className="whitespace-pre-wrap font-sans leading-relaxed text-sm text-gray-800">
                    {selectedEmail.body}
                  </div>
                )}
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

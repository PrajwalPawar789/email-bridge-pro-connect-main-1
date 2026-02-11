
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  Mail, RefreshCw, Trash2, Inbox, Search, 
  MoreVertical, Reply, ReplyAll, Forward, Archive,
  CheckCircle2, Paperclip, X
} from 'lucide-react';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from '@/hooks/use-toast';
import { differenceInDays, formatDistanceToNow } from 'date-fns';
import { STALE_DAYS } from '@/lib/pipeline';
import {
  createOpportunity,
  deleteOpportunity,
  ensureDefaultPipeline,
  findOpportunityByEmail,
  suggestOpportunityValueFromCampaign,
  updateOpportunity,
  DbOpportunity,
  DbPipelineStage,
} from '@/lib/pipelineStore';

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

interface ReplyDraft {
  to: string[];
  cc: string[];
  subject: string;
  text: string;
  html: string;
  includeOriginalAttachmentsAvailable?: boolean;
  originalAttachments?: Array<{
    filename?: string;
    contentType?: string;
    size?: number | null;
  }>;
  threadingLimited?: boolean;
}

interface ReplyAttachment {
  id: string;
  file: File;
}

interface SyncStats {
  processed: number;
  inserted: number;
  skipped: number;
}

const DEFAULT_MAILBOX_SYNC_URL = 'http://localhost:8787/sync-mailbox';
const DEFAULT_MAILBOX_API_URL = 'http://localhost:8787';
const syncUrl = import.meta.env.VITE_MAILBOX_SYNC_URL;
const MAILBOX_SYNC_URL = syncUrl || DEFAULT_MAILBOX_SYNC_URL;
const MAILBOX_API_URL =
  import.meta.env.VITE_MAILBOX_API_URL ||
  (syncUrl ? syncUrl.replace(/\/sync-mailbox\/?$/i, '') : DEFAULT_MAILBOX_API_URL);
const MAX_PREVIEW_LENGTH = 140;
const MAX_MAILTO_BODY_LENGTH = 2000;
const ALL_INBOXES_VALUE = 'all';

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

const formatBytes = (bytes: number) => {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const idx = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, idx);
  return `${value.toFixed(value >= 10 || idx === 0 ? 0 : 1)} ${units[idx]}`;
};

const parseAddressInput = (value: string) =>
  value
    .split(/[,;]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);

const buildHtmlFromText = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/\r?\n/g, '<br />');

const readFileAsBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      resolve(result.includes('base64,') ? result.split('base64,').pop() || '' : result);
    };
    reader.readAsDataURL(file);
  });

const createLocalId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const Mailbox: React.FC<MailboxProps> = ({ emailConfigs }) => {
  const [emails, setEmails] = useState<EmailMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedConfig, setSelectedConfig] = useState<string>('');
  const [selectedEmailId, setSelectedEmailId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncingAll, setSyncingAll] = useState(false);
  const [syncAllProgress, setSyncAllProgress] = useState<{ completed: number; total: number } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'unread'>('all');
  const [syncStats, setSyncStats] = useState<SyncStats | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [excludedConfigIds, setExcludedConfigIds] = useState<string[]>([]);
  const [pipelineId, setPipelineId] = useState<string | null>(null);
  const [pipelineStages, setPipelineStages] = useState<DbPipelineStage[]>([]);
  const [selectedOpportunity, setSelectedOpportunity] = useState<DbOpportunity | null>(null);
  const [pipelineBusy, setPipelineBusy] = useState(false);
  const [nextStepDraft, setNextStepDraft] = useState('');
  const [dealValueDraft, setDealValueDraft] = useState('');
  const [campaignDraft, setCampaignDraft] = useState('');
  const [campaignOptions, setCampaignOptions] = useState<{ id: string; name: string }[]>([]);
  const [isWide, setIsWide] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(min-width: 1024px)').matches;
  });
  const [viewMode, setViewMode] = useState<'message' | 'pipeline' | 'split'>(() => {
    if (typeof window === 'undefined') return 'message';
    return window.matchMedia('(min-width: 1024px)').matches ? 'split' : 'message';
  });
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [replyMode, setReplyMode] = useState<'reply' | 'replyAll'>('reply');
  const [replyDraft, setReplyDraft] = useState<ReplyDraft | null>(null);
  const [replyBody, setReplyBody] = useState('');
  const [replyToValue, setReplyToValue] = useState('');
  const [replyCcValue, setReplyCcValue] = useState('');
  const [replyBccValue, setReplyBccValue] = useState('');
  const [replySubject, setReplySubject] = useState('');
  const [replyLoading, setReplyLoading] = useState(false);
  const [replySending, setReplySending] = useState(false);
  const [includeOriginalAttachments, setIncludeOriginalAttachments] = useState(false);
  const [replyAttachments, setReplyAttachments] = useState<ReplyAttachment[]>([]);
  const replyFileInputRef = useRef<HTMLInputElement | null>(null);

  const isAllSelected = selectedConfig === ALL_INBOXES_VALUE;
  const allConfigIds = useMemo(
    () => emailConfigs.map((config) => config.id).filter(Boolean),
    [emailConfigs]
  );
  const includedConfigIds = useMemo(
    () => allConfigIds.filter((id) => !excludedConfigIds.includes(id)),
    [allConfigIds, excludedConfigIds]
  );
  const includedCount = includedConfigIds.length;

  const configLabelById = useMemo(() => {
    const map = new Map<string, string>();
    emailConfigs.forEach((config) => {
      if (config?.id && config?.smtp_username) {
        map.set(config.id, config.smtp_username);
      }
    });
    return map;
  }, [emailConfigs]);

  useEffect(() => {
    let active = true;
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (active) {
        setUserId(user?.id ?? null);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    const loadPipeline = async () => {
      try {
        const { pipeline, stages } = await ensureDefaultPipeline(userId);
        if (!active) return;
        setPipelineId(pipeline.id);
        setPipelineStages(stages);
      } catch (error) {
        console.error('Failed to load pipeline for inbox', error);
      }
    };
    loadPipeline();
    return () => {
      active = false;
    };
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    const loadCampaigns = async () => {
      const { data, error } = await supabase
        .from('campaigns')
        .select('id, name')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      if (!active) return;
      if (error) {
        console.error('Failed to load campaigns', error);
        return;
      }
      setCampaignOptions(data || []);
    };
    loadCampaigns();
    return () => {
      active = false;
    };
  }, [userId]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const media = window.matchMedia('(min-width: 1024px)');
    const handleChange = () => setIsWide(media.matches);
    handleChange();
    if (media.addEventListener) {
      media.addEventListener('change', handleChange);
      return () => media.removeEventListener('change', handleChange);
    }
    media.addListener(handleChange);
    return () => media.removeListener(handleChange);
  }, []);

  useEffect(() => {
    setExcludedConfigIds((prev) => {
      const next = prev.filter((id) => allConfigIds.includes(id));
      return next.length === prev.length ? prev : next;
    });
  }, [allConfigIds]);

  // Initialize selection
  useEffect(() => {
    if (emailConfigs.length === 0) return;

    if (!selectedConfig) {
      setSelectedConfig(emailConfigs.length > 1 ? ALL_INBOXES_VALUE : emailConfigs[0].id);
      return;
    }

    if (selectedConfig !== ALL_INBOXES_VALUE && !emailConfigs.some((config) => config.id === selectedConfig)) {
      setSelectedConfig(emailConfigs.length > 1 ? ALL_INBOXES_VALUE : emailConfigs[0].id);
    }
  }, [emailConfigs, selectedConfig]);

  const fetchEmails = useCallback(async () => {
    if (!selectedConfig) return;
    
    setLoading(true);
    try {
      let resolvedUserId = userId;
      if (!resolvedUserId) {
        const { data: { user } } = await supabase.auth.getUser();
        resolvedUserId = user?.id ?? null;
        if (resolvedUserId) {
          setUserId(resolvedUserId);
        }
      }

      if (!resolvedUserId) return;

      let query = supabase
        .from('email_messages')
        .select('*')
        .eq('user_id', resolvedUserId);

      if (selectedConfig !== ALL_INBOXES_VALUE) {
        query = query.eq('config_id', selectedConfig);
      } else {
        const configIds = includedConfigIds;
        if (configIds.length === 0) {
          setEmails([]);
          return;
        }
        query = query.in('config_id', configIds);
      }

      const { data, error } = await query
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
  }, [selectedConfig, emailConfigs, includedConfigIds, userId]);

  useEffect(() => {
    if (selectedConfig) {
      fetchEmails();
      setSelectedEmailId(null); // Reset selection on account switch
      setSyncStats(null);
    }
  }, [selectedConfig, fetchEmails]);

  useEffect(() => {
    if (selectedEmailId || emails.length === 0) return;
    setSelectedEmailId(emails[0].id);
  }, [emails, selectedEmailId]);

  // Real-time subscription
  useEffect(() => {
    if (!selectedConfig) return;

    const filter = selectedConfig === ALL_INBOXES_VALUE
      ? (userId ? `user_id=eq.${userId}` : null)
      : `config_id=eq.${selectedConfig}`;

    if (!filter) return;

    const channel = supabase
      .channel(`mailbox-${selectedConfig}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'email_messages', filter }, 
        () => fetchEmails() // Simply refetch for simplicity and accuracy
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [selectedConfig, userId, fetchEmails]);

  const triggerMailboxSync = async (configId: string, accessToken: string) => {
    const response = await fetch(MAILBOX_SYNC_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ configId, limit: 50 }),
    });

    const payload = await response.json();
    if (!response.ok || !payload?.success) throw new Error(payload?.error || 'Sync failed');
    return payload;
  };

  const syncEmails = async () => {
    if (!selectedConfig) return;
    if (selectedConfig === ALL_INBOXES_VALUE) {
      await syncAllMailboxes();
      return;
    }
    setSyncing(true);
    setSyncStats(null);
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Not authenticated');

      const payload = await triggerMailboxSync(selectedConfig, session.access_token);

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

  const syncAllMailboxes = async () => {
    const configsToSync = selectedConfig === ALL_INBOXES_VALUE
      ? emailConfigs.filter((config) => includedConfigIds.includes(config.id))
      : emailConfigs;

    if (configsToSync.length === 0) {
      toast({
        title: "No inboxes selected",
        description: "Choose at least one inbox to sync.",
      });
      return;
    }
    setSyncingAll(true);
    setSyncAllProgress({ completed: 0, total: configsToSync.length });
    let successCount = 0;
    let errorCount = 0;
    let insertedTotal = 0;
    let processedTotal = 0;
    let skippedTotal = 0;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Not authenticated');

      for (const config of configsToSync) {
        try {
          const payload = await triggerMailboxSync(config.id, session.access_token);
          successCount += 1;
          insertedTotal += payload.inserted ?? 0;
          processedTotal += payload.processed ?? 0;
          skippedTotal += payload.skipped ?? 0;

          if (config.id === selectedConfig) {
            setSyncStats({
              processed: payload.processed ?? 0,
              inserted: payload.inserted ?? 0,
              skipped: payload.skipped ?? 0,
            });
            setLastSyncedAt(new Date().toISOString());
          }
        } catch (error) {
          errorCount += 1;
        } finally {
          setSyncAllProgress((prev) => {
            const total = prev?.total ?? emailConfigs.length;
            const completed = (prev?.completed ?? 0) + 1;
            return { completed, total };
          });
        }
      }

      toast({
        title: "Sync All Complete",
        description: `Synced ${successCount}/${configsToSync.length} mailboxes. Added ${insertedTotal} new emails${errorCount ? `, ${errorCount} failed` : ''}.`,
      });

      if (selectedConfig === ALL_INBOXES_VALUE) {
        setSyncStats({
          processed: processedTotal,
          inserted: insertedTotal,
          skipped: skippedTotal,
        });
        setLastSyncedAt(new Date().toISOString());
      }

      if (selectedConfig) {
        await fetchEmails();
      }
    } catch (error: any) {
      toast({
        title: "Sync All Failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSyncingAll(false);
      setSyncAllProgress(null);
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

  const resetReplyComposer = () => {
    setReplyDraft(null);
    setReplyBody('');
    setReplyToValue('');
    setReplyCcValue('');
    setReplyBccValue('');
    setReplySubject('');
    setIncludeOriginalAttachments(false);
    setReplyAttachments([]);
  };

  const openReplyComposer = async (email: EmailMessage, mode: 'reply' | 'replyAll') => {
    if (!email.from_email) {
      toast({ title: "Reply unavailable", description: "Sender address is missing.", variant: "destructive" });
      return;
    }
    setReplyMode(mode);
    setReplyLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Not authenticated');

      const response = await fetch(
        `${MAILBOX_API_URL}/api/inbox/messages/${email.id}/reply-draft?mode=${mode}`,
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        }
      );
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || 'Failed to build reply draft');

      setReplyDraft(payload);
      setReplySubject(payload.subject || '');
      setReplyToValue((payload.to || []).join(', '));
      setReplyCcValue((payload.cc || []).join(', '));
      setReplyBccValue('');
      setReplyBody('');
      setIncludeOriginalAttachments(false);
      setReplyAttachments([]);
      setIsComposerOpen(true);
    } catch (error: any) {
      toast({
        title: "Reply unavailable",
        description: error.message || 'Failed to prepare reply.',
        variant: "destructive",
      });
    } finally {
      setReplyLoading(false);
    }
  };

  const handleReplyEmail = (email: EmailMessage) => {
    openReplyComposer(email, 'reply');
  };

  const handleReplyAllEmail = (email: EmailMessage) => {
    openReplyComposer(email, 'replyAll');
  };

  const handleReplyAttachmentChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;
    setReplyAttachments((prev) => [
      ...prev,
      ...files.map((file) => ({ id: createLocalId(), file })),
    ]);
    event.target.value = '';
  };

  const handleRemoveReplyAttachment = (id: string) => {
    setReplyAttachments((prev) => prev.filter((attachment) => attachment.id !== id));
  };

  const handleSendReply = async () => {
    if (!selectedEmail || !replyDraft) return;
    setReplySending(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Not authenticated');

      const attachmentPayload = await Promise.all(
        replyAttachments.map(async (attachment) => ({
          filename: attachment.file.name,
          contentType: attachment.file.type || 'application/octet-stream',
          size: attachment.file.size,
          content: await readFileAsBase64(attachment.file),
        }))
      );

      const replyText = replyBody.trim();
      const text = [replyText, replyDraft.text].filter(Boolean).join('\n\n');
      const html = [replyText ? buildHtmlFromText(replyText) : '', replyDraft.html].filter(Boolean).join('');

      const response = await fetch(
        `${MAILBOX_API_URL}/api/inbox/messages/${selectedEmail.id}/reply`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            mode: replyMode,
            text,
            html,
            ccOverride: parseAddressInput(replyCcValue),
            bcc: parseAddressInput(replyBccValue),
            attachments: attachmentPayload,
            includeOriginalAttachments,
          }),
        }
      );

      const payload = await response.json();
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || 'Failed to send reply');
      }

      toast({
        title: "Reply sent",
        description: payload.threadingLimited
          ? "Sent, but threading may be limited because the original message has no Message-ID."
          : "Your reply was sent.",
      });
      setIsComposerOpen(false);
      resetReplyComposer();
    } catch (error: any) {
      toast({
        title: "Reply failed",
        description: error.message || 'Unable to send reply.',
        variant: "destructive",
      });
    } finally {
      setReplySending(false);
    }
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

  useEffect(() => {
    if (!selectedEmail || !pipelineId) {
      setSelectedOpportunity(null);
      return;
    }
    let active = true;
    const loadOpportunity = async () => {
      try {
        const opportunity = await findOpportunityByEmail(pipelineId, selectedEmail.from_email);
        if (active) setSelectedOpportunity(opportunity);
      } catch (error) {
        console.error('Failed to load opportunity', error);
      }
    };
    loadOpportunity();
    return () => {
      active = false;
    };
  }, [selectedEmailId, pipelineId, selectedEmail]);

  useEffect(() => {
    setNextStepDraft(selectedOpportunity?.next_step || '');
  }, [selectedOpportunity]);

  useEffect(() => {
    const value = selectedOpportunity?.value;
    setDealValueDraft(value == null ? '' : String(value));
  }, [selectedOpportunity]);

  useEffect(() => {
    setCampaignDraft(selectedOpportunity?.campaign_id || '');
  }, [selectedOpportunity]);

  useEffect(() => {
    if (selectedOpportunity) return;
    if (!selectedEmail) {
      setCampaignDraft('');
      return;
    }
    let active = true;
    setCampaignDraft('');
    const fetchSuggestedCampaign = async () => {
      const { data, error } = await supabase
        .from('recipients')
        .select('campaign_id')
        .eq('email', selectedEmail.from_email)
        .limit(1);
      if (!active) return;
      if (error) return;
      const campaignId = data?.[0]?.campaign_id;
      if (campaignId) {
        setCampaignDraft(campaignId);
      }
    };
    fetchSuggestedCampaign();
    return () => {
      active = false;
    };
  }, [selectedEmail, selectedOpportunity]);

  useEffect(() => {
    if (!isWide && viewMode === 'split') {
      setViewMode('message');
    }
  }, [isWide, viewMode]);

  const selectedPipelineStageId = selectedOpportunity?.stage_id || '';
  const selectedPipelineStage = pipelineStages.find((stage) => stage.id === selectedPipelineStageId);
  const isProposalStage = (stageId: string) => {
    if (!stageId) return false;
    const stage = pipelineStages.find((item) => item.id === stageId);
    if (!stage) return false;
    if (stage.template_stage_id === 'proposal') return true;
    const name = stage.name.toLowerCase();
    return name.includes('proposal') || name.includes('pricing') || name.includes('quote');
  };
  const effectiveViewMode = isWide
    ? viewMode
    : viewMode === 'split'
      ? 'message'
      : viewMode;
  const showMessagePane = effectiveViewMode !== 'pipeline';
  const showPipelinePane = effectiveViewMode !== 'message';
  const isSplitView = isWide && showMessagePane && showPipelinePane;
  const isSelectedStale = selectedOpportunity?.last_activity_at
    ? differenceInDays(new Date(), new Date(selectedOpportunity.last_activity_at)) >= STALE_DAYS
    : (selectedEmail
      ? differenceInDays(new Date(), new Date(selectedEmail.date)) >= STALE_DAYS
      : false);
  const currentConfig = emailConfigs.find((config) => config.id === selectedConfig);
  const selectedMailboxLabel = selectedEmail ? (configLabelById.get(selectedEmail.config_id) || 'Mailbox') : null;
  const lastSyncLabel = lastSyncedAt
    ? formatDistanceToNow(new Date(lastSyncedAt), { addSuffix: true })
    : null;
  const pipelineDisabled = pipelineBusy || !pipelineId || pipelineStages.length === 0;
  const canSyncAll = emailConfigs.length > 1;
  const syncAllLabel = syncAllProgress
    ? `Syncing ${syncAllProgress.completed}/${syncAllProgress.total}`
    : 'Sync all';
  const syncNowBusy = isAllSelected ? syncingAll : syncing;
  const syncNowLabel = isAllSelected
    ? (syncingAll ? syncAllLabel : 'Sync all')
    : (syncing ? 'Syncing...' : 'Sync Now');
  const emptySyncLabel = isAllSelected
    ? (syncingAll ? syncAllLabel : 'Sync all')
    : (syncing ? 'Syncing...' : 'Sync mailbox');
  const allInboxesLabel = includedCount === emailConfigs.length
    ? `${emailConfigs.length}`
    : `${includedCount}/${emailConfigs.length}`;

  const resolveStageId = (value: string) => {
    if (!value) return '';
    const directMatch = pipelineStages.find((stage) => stage.id === value);
    if (directMatch) return directMatch.id;
    const templateMatch = pipelineStages.find((stage) => stage.template_stage_id === value);
    return templateMatch?.id || '';
  };

  const resolveOpportunityStatus = (stageId: string) => {
    const stage = pipelineStages.find((item) => item.id === stageId);
    if (stage?.is_won) return 'won';
    if (stage?.is_lost) return 'lost';
    return 'open';
  };

  const resolveContactDetails = async (email: string) => {
    const { data: recipientData } = await supabase
      .from('recipients')
      .select('name, campaign_id')
      .eq('email', email)
      .limit(1);

    const { data: prospectData } = await supabase
      .from('prospects')
      .select('name, company')
      .eq('email', email)
      .limit(1);

    const contactName = recipientData?.[0]?.name || prospectData?.[0]?.name || email;
    const company = prospectData?.[0]?.company || null;
    const campaignId = recipientData?.[0]?.campaign_id || null;
    return { contactName, company, campaignId };
  };

  const updatePipelineStage = async (stageValue: string) => {
    if (!selectedEmail || !pipelineId || !userId) return;
    const stageId = resolveStageId(stageValue);
    setPipelineBusy(true);
    try {
      if (!stageId) {
        if (selectedOpportunity) {
          await deleteOpportunity(selectedOpportunity.id);
        }
        setSelectedOpportunity(null);
        return;
      }

      const status = resolveOpportunityStatus(stageId);
      if (selectedOpportunity) {
        const updated = await updateOpportunity(selectedOpportunity.id, {
          stageId,
          status,
          lastActivityAt: new Date().toISOString(),
        });
        setSelectedOpportunity(updated);
        if (!updated.value && updated.campaign_id && isProposalStage(stageId)) {
          const suggested = await suggestOpportunityValueFromCampaign(updated.campaign_id);
          if (suggested != null) {
            const withValue = await updateOpportunity(updated.id, {
              value: suggested,
              lastActivityAt: new Date().toISOString(),
            });
            setSelectedOpportunity(withValue);
            setDealValueDraft(String(Math.round(suggested)));
          }
        }
        return;
      }

      const details = await resolveContactDetails(selectedEmail.from_email);
      const created = await createOpportunity({
        userId,
        pipelineId,
        stageId,
        status,
        contactName: details.contactName,
        contactEmail: selectedEmail.from_email,
        company: details.company,
        owner: '',
        nextStep: '',
        campaignId: campaignDraft || details.campaignId,
      });
      let nextOpportunity = created;
      if (!created.value && created.campaign_id && isProposalStage(stageId)) {
        const suggested = await suggestOpportunityValueFromCampaign(created.campaign_id);
        if (suggested != null) {
          nextOpportunity = await updateOpportunity(created.id, {
            value: suggested,
            lastActivityAt: new Date().toISOString(),
          });
          setDealValueDraft(String(Math.round(suggested)));
        }
      }
      setSelectedOpportunity(nextOpportunity);
    } catch (error) {
      console.error('Failed to update pipeline stage', error);
    } finally {
      setPipelineBusy(false);
    }
  };

  const updateNextStep = async (value: string) => {
    if (!selectedEmail || !pipelineId || !userId) return;
    if (!selectedOpportunity) {
      toast({
        title: "Select a pipeline stage first",
        description: "Add this reply to a pipeline stage before setting a next step.",
      });
      return;
    }
    setPipelineBusy(true);
    try {
      const updated = await updateOpportunity(selectedOpportunity.id, {
        nextStep: value,
        lastActivityAt: new Date().toISOString(),
      });
      setSelectedOpportunity(updated);
    } catch (error) {
      console.error('Failed to update next step', error);
    } finally {
      setPipelineBusy(false);
    }
  };

  const updateDealValue = async (value: string) => {
    if (!selectedEmail || !pipelineId || !userId) return;
    if (!selectedOpportunity) {
      toast({
        title: "Select a pipeline stage first",
        description: "Add this reply to a pipeline stage before setting a value.",
      });
      return;
    }
    const parsed = value ? Number(value.replace(/,/g, '')) : null;
    if (value && !Number.isFinite(parsed)) {
      toast({
        title: "Enter a valid number",
        description: "Use plain numbers like 12000 or 12,000.",
        variant: "destructive",
      });
      return;
    }
    setPipelineBusy(true);
    try {
      const updated = await updateOpportunity(selectedOpportunity.id, {
        value: parsed,
        lastActivityAt: new Date().toISOString(),
      });
      setSelectedOpportunity(updated);
    } catch (error) {
      console.error('Failed to update value', error);
    } finally {
      setPipelineBusy(false);
    }
  };

  const updateCampaign = async (campaignId: string) => {
    setCampaignDraft(campaignId);
    if (!selectedOpportunity) return;
    try {
      const updated = await updateOpportunity(selectedOpportunity.id, {
        campaignId: campaignId || null,
        lastActivityAt: new Date().toISOString(),
      });
      let nextOpportunity = updated;
      if (
        campaignId &&
        !updated.value &&
        updated.stage_id &&
        isProposalStage(updated.stage_id)
      ) {
        const suggested = await suggestOpportunityValueFromCampaign(campaignId);
        if (suggested != null) {
          nextOpportunity = await updateOpportunity(updated.id, {
            value: suggested,
            lastActivityAt: new Date().toISOString(),
          });
          setDealValueDraft(String(Math.round(suggested)));
        }
      }
      setSelectedOpportunity(nextOpportunity);
    } catch (error) {
      console.error('Failed to update campaign', error);
    }
  };

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
                {isAllSelected
                  ? `All inboxes · ${includedCount} of ${emailConfigs.length} accounts`
                  : currentConfig?.smtp_username}
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
                {emailConfigs.length > 1 && (
                  <SelectItem value={ALL_INBOXES_VALUE}>
                    All inboxes ({allInboxesLabel})
                  </SelectItem>
                )}
                {emailConfigs.map((config) => (
                  <SelectItem key={config.id} value={config.id}>
                    {config.smtp_username}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isAllSelected && emailConfigs.length > 1 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-9">
                    Filter inboxes
                    <span className="ml-2 text-xs text-gray-500">
                      {includedCount}/{emailConfigs.length}
                    </span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-[240px]">
                  <DropdownMenuLabel>Included inboxes</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={(event) => {
                      event.preventDefault();
                      setExcludedConfigIds([]);
                    }}
                  >
                    Select all
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={(event) => {
                      event.preventDefault();
                      setExcludedConfigIds(allConfigIds);
                    }}
                  >
                    Clear all
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {emailConfigs.map((config) => {
                    const isIncluded = !excludedConfigIds.includes(config.id);
                    return (
                      <DropdownMenuCheckboxItem
                        key={config.id}
                        checked={isIncluded}
                        onCheckedChange={(checked) => {
                          setExcludedConfigIds((prev) => {
                            const has = prev.includes(config.id);
                            if (checked && has) {
                              return prev.filter((id) => id !== config.id);
                            }
                            if (!checked && !has) {
                              return [...prev, config.id];
                            }
                            return prev;
                          });
                        }}
                        onSelect={(event) => event.preventDefault()}
                      >
                        {config.smtp_username}
                      </DropdownMenuCheckboxItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
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
            onClick={isAllSelected ? syncAllMailboxes : syncEmails} 
            disabled={syncing || syncingAll}
            className={syncNowBusy ? "animate-pulse" : ""}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${syncNowBusy ? 'animate-spin' : ''}`} />
            {syncNowLabel}
          </Button>
          {canSyncAll && !isAllSelected && (
            <Button
              variant="secondary"
              size="sm"
              onClick={syncAllMailboxes}
              disabled={syncing || syncingAll}
              className={syncingAll ? 'animate-pulse' : ''}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${syncingAll ? 'animate-spin' : ''}`} />
              {syncingAll ? syncAllLabel : 'Sync all'}
            </Button>
          )}
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
                  {isAllSelected && includedCount === 0 ? (
                    <>
                      <Inbox className="h-12 w-12 mb-2 opacity-20" />
                      <p className="text-sm font-medium text-gray-600">No inboxes selected</p>
                      <p className="text-xs text-gray-500 mt-1">
                        Choose at least one inbox to view emails.
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setExcludedConfigIds([])}
                        className="mt-4"
                      >
                        Select all inboxes
                      </Button>
                    </>
                  ) : emails.length === 0 ? (
                    <>
                      <Inbox className="h-12 w-12 mb-2 opacity-20" />
                      <p className="text-sm font-medium text-gray-600">No messages yet</p>
                      <p className="text-xs text-gray-500 mt-1">
                        Sync your mailbox to pull in replies.
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={isAllSelected ? syncAllMailboxes : syncEmails}
                        disabled={syncing || syncingAll}
                        className="mt-4"
                      >
                        <RefreshCw className={`h-4 w-4 mr-2 ${syncNowBusy ? 'animate-spin' : ''}`} />
                        {emptySyncLabel}
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
                              <span className="flex items-center gap-2">
                                {isAllSelected && (
                                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-600">
                                    {configLabelById.get(email.config_id) || 'Mailbox'}
                                  </span>
                                )}
                                {formatDistanceToNow(new Date(email.date), { addSuffix: false })}
                              </span>
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
                      {isAllSelected && selectedMailboxLabel && (
                        <Badge
                          variant="outline"
                          className="text-[10px] text-gray-500 border-gray-200"
                        >
                          {selectedMailboxLabel}
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
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8"
                      onClick={() => handleReplyEmail(selectedEmail)}
                      disabled={replyLoading}
                    >
                      <Reply className="h-4 w-4" />
                      Reply
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8"
                      onClick={() => handleReplyAllEmail(selectedEmail)}
                      disabled={replyLoading}
                    >
                      <ReplyAll className="h-4 w-4" />
                      Reply all
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

              <div className="flex-1 min-h-0 p-6">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      variant={effectiveViewMode === 'message' ? 'secondary' : 'outline'}
                      className="h-8"
                      onClick={() => setViewMode('message')}
                    >
                      Message
                    </Button>
                    <Button
                      size="sm"
                      variant={effectiveViewMode === 'pipeline' ? 'secondary' : 'outline'}
                      className="h-8"
                      onClick={() => setViewMode('pipeline')}
                    >
                      Pipeline
                    </Button>
                    {isWide && (
                      <Button
                        size="sm"
                        variant={effectiveViewMode === 'split' ? 'secondary' : 'outline'}
                        className="h-8"
                        onClick={() => setViewMode('split')}
                      >
                        Split view
                      </Button>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
                    <Badge variant="outline" className="border-slate-200 text-[11px] text-gray-600">
                      {selectedPipelineStage?.name || 'Not in pipeline'}
                    </Badge>
                    {selectedOpportunity?.next_step && (
                      <span className="text-[11px] text-gray-500">
                        Next: {selectedOpportunity.next_step}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex h-full min-h-0 flex-col gap-6 lg:flex-row">
                  {showMessagePane && (
                    <div className={`min-h-0 ${isSplitView ? 'lg:flex-1' : 'flex-1'}`}>
                      <ScrollArea className="h-full rounded-xl border border-slate-200 bg-slate-50/40 p-4">
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
                  )}

                  {showPipelinePane && (
                    <div className={`min-h-0 ${isSplitView ? 'lg:w-[360px] lg:flex-none' : 'flex-1'}`}>
                      <ScrollArea className="h-full rounded-xl border border-slate-200 bg-white/90 p-4 shadow-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="text-sm font-semibold text-gray-900">Prospect pipeline</h3>
                          <p className="text-xs text-gray-500">Track lifecycle, stage, and next step.</p>
                        </div>
                        {isSelectedStale && (
                          <Badge variant="secondary" className="bg-amber-50 text-amber-700 text-[10px] uppercase">
                            Stale
                          </Badge>
                        )}
                      </div>

                      <div className="mt-4 space-y-3 text-xs text-gray-600">
                        <div className="flex items-center justify-between">
                          <span className="text-gray-500">Lifecycle</span>
                          <Badge variant="secondary" className="bg-emerald-50 text-emerald-700">
                            Replied
                          </Badge>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-gray-500">Last activity</span>
                          <span className="text-gray-700">
                            {formatDistanceToNow(new Date(selectedEmail.date), { addSuffix: true })}
                          </span>
                        </div>
                      </div>

                      <div className="mt-4 space-y-2">
                        <Label className="text-xs text-gray-500">Pipeline stage</Label>
                        <Select
                          value={selectedPipelineStageId || 'none'}
                          onValueChange={(value) => updatePipelineStage(value === 'none' ? '' : value)}
                          disabled={pipelineDisabled}
                        >
                          <SelectTrigger className="h-9 bg-white">
                            <SelectValue placeholder="Not in pipeline" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Not in pipeline</SelectItem>
                            {pipelineStages.map((stage) => (
                              <SelectItem key={stage.id} value={stage.id}>{stage.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {selectedPipelineStage && (
                          <p className="text-[11px] text-gray-500">{selectedPipelineStage.description}</p>
                        )}
                        {!selectedPipelineStage && (
                          <p className="text-[11px] text-gray-500">
                            Pick a stage or use quick actions to start a deal.
                          </p>
                        )}
                      </div>

                      <div className="mt-4 space-y-2">
                        <Label className="text-xs text-gray-500">Campaign (optional)</Label>
                        <Select
                          value={campaignDraft || 'none'}
                          onValueChange={(value) => updateCampaign(value === 'none' ? '' : value)}
                          disabled={pipelineDisabled}
                        >
                          <SelectTrigger className="h-9 bg-white">
                            <SelectValue placeholder="No campaign" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">No campaign</SelectItem>
                            {campaignOptions.map((campaign) => (
                              <SelectItem key={campaign.id} value={campaign.id}>{campaign.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-[11px] text-gray-500">
                          Optional: link this reply to a campaign for reporting.
                        </p>
                      </div>

                      <div className="mt-4 space-y-2">
                        <Label className="text-xs text-gray-500">Next step</Label>
                        <Input
                          value={nextStepDraft}
                          onChange={(event) => setNextStepDraft(event.target.value)}
                          onBlur={() => updateNextStep(nextStepDraft)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              event.preventDefault();
                              updateNextStep(nextStepDraft);
                            }
                          }}
                          placeholder="e.g., Send pricing deck"
                          className="h-9 bg-white"
                          disabled={pipelineDisabled}
                        />
                      </div>

                      <div className="mt-4 space-y-2">
                        <Label className="text-xs text-gray-500">Deal value</Label>
                        <Input
                          value={dealValueDraft}
                          onChange={(event) => setDealValueDraft(event.target.value)}
                          onBlur={() => updateDealValue(dealValueDraft)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              event.preventDefault();
                              updateDealValue(dealValueDraft);
                            }
                          }}
                          placeholder="e.g., 12000"
                          className="h-9 bg-white"
                          disabled={pipelineDisabled}
                        />
                        <p className="text-[11px] text-gray-500">
                          Auto-filled from proposal emails when available.
                        </p>
                      </div>

                      <div className="mt-6 rounded-xl border border-slate-200 bg-white/95 p-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">Quick actions</p>
                        <div className="grid grid-cols-2 gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => updatePipelineStage('qualified')}
                            disabled={pipelineDisabled}
                          >
                            Interested
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => updatePipelineStage('meeting-booked')}
                            disabled={pipelineDisabled}
                          >
                            Meeting booked
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => updatePipelineStage('closed-lost')}
                            disabled={pipelineDisabled}
                          >
                            Not interested
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => updateNextStep('Follow up next week')}
                            disabled={pipelineDisabled}
                          >
                            Snooze
                          </Button>
                        </div>
                        <p className="mt-3 text-[11px] text-gray-500">
                          Updates are saved to your pipeline. CRM sync can be added later.
                        </p>
                      </div>
                      </ScrollArea>
                    </div>
                  )}
                </div>
              </div>
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

      <Dialog
        open={isComposerOpen}
        onOpenChange={(open) => {
          setIsComposerOpen(open);
          if (!open) {
            resetReplyComposer();
          }
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{replyMode === 'replyAll' ? 'Reply all' : 'Reply'}</DialogTitle>
          </DialogHeader>

          {replyDraft ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-xs text-slate-500">To</Label>
                <Input value={replyToValue} readOnly className="h-9" />
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-slate-500">Cc</Label>
                <Input
                  value={replyCcValue}
                  onChange={(event) => setReplyCcValue(event.target.value)}
                  placeholder="Add Cc recipients"
                  className="h-9"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-slate-500">Bcc</Label>
                <Input
                  value={replyBccValue}
                  onChange={(event) => setReplyBccValue(event.target.value)}
                  placeholder="Add Bcc recipients"
                  className="h-9"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-slate-500">Subject</Label>
                <Input value={replySubject} readOnly className="h-9" />
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-slate-500">Message</Label>
                <Textarea
                  value={replyBody}
                  onChange={(event) => setReplyBody(event.target.value)}
                  placeholder="Write your reply..."
                  rows={6}
                  className="resize-none"
                />
              </div>

              {replyDraft.text && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 whitespace-pre-wrap">
                  {replyDraft.text}
                </div>
              )}

              <div className="space-y-2">
                <Label className="text-xs text-slate-500">Attachments</Label>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    ref={replyFileInputRef}
                    type="file"
                    multiple
                    className="hidden"
                    onChange={handleReplyAttachmentChange}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9"
                    onClick={() => replyFileInputRef.current?.click()}
                  >
                    <Paperclip className="mr-2 h-4 w-4" />
                    Add files
                  </Button>
                  {replyAttachments.length > 0 && (
                    <span className="text-xs text-slate-500">
                      {replyAttachments.length} attachment{replyAttachments.length === 1 ? '' : 's'}
                    </span>
                  )}
                </div>

                {replyAttachments.length > 0 && (
                  <div className="space-y-2">
                    {replyAttachments.map((attachment) => (
                      <div
                        key={attachment.id}
                        className="flex items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600"
                      >
                        <div className="flex flex-col">
                          <span className="font-medium text-slate-700">{attachment.file.name}</span>
                          <span className="text-[11px] text-slate-400">{formatBytes(attachment.file.size)}</span>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => handleRemoveReplyAttachment(attachment.id)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {replyDraft.includeOriginalAttachmentsAvailable && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 space-y-2">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={includeOriginalAttachments}
                      onCheckedChange={(value) => setIncludeOriginalAttachments(value === true)}
                    />
                    <span>
                      Include original attachments ({replyDraft.originalAttachments?.length || 0})
                    </span>
                  </div>
                  {replyDraft.originalAttachments?.length ? (
                    <div className="flex flex-wrap gap-2">
                      {replyDraft.originalAttachments.map((attachment, index) => (
                        <span
                          key={`${attachment.filename || 'attachment'}-${index}`}
                          className="rounded-full bg-white px-2 py-1 text-[11px] text-slate-500 border border-slate-200"
                        >
                          {attachment.filename || 'attachment'}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              )}

              {replyDraft.threadingLimited && (
                <p className="text-xs text-amber-600">
                  This message is missing a Message-ID. The reply may not thread perfectly in Gmail or Outlook.
                </p>
              )}
            </div>
          ) : (
            <div className="py-6 text-sm text-slate-500">Preparing reply draft...</div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsComposerOpen(false);
                resetReplyComposer();
              }}
              disabled={replySending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSendReply}
              disabled={!replyDraft || replySending}
            >
              {replySending ? 'Sending...' : 'Send reply'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Mailbox;

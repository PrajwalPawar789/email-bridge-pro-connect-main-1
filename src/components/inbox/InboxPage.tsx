
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type InfiniteData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { FixedSizeList as List, type ListOnItemsRenderedProps } from "react-window";
import { differenceInDays, format, formatDistanceToNow } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useDebounce } from "@/hooks/useDebounce";
import { useMeasure } from "@/hooks/useMeasure";
import { toast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import type { InboxSavedViewId, InboxSearchFilters } from "@/types/inbox";
import { STALE_DAYS } from "@/lib/pipeline";
import {
  createOpportunity,
  deleteOpportunity,
  ensureDefaultPipeline,
  findOpportunityByEmail,
  suggestOpportunityValueFromCampaign,
  updateOpportunity,
  type DbOpportunity,
  type DbPipelineStage,
} from "@/lib/pipelineStore";
import {
  Archive,
  ArrowDownNarrowWide,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Command as CommandIcon,
  Filter,
  Forward,
  Inbox as InboxIcon,
  LayoutList,
  LayoutPanelLeft,
  LayoutPanelTop,
  MailPlus,
  MoreHorizontal,
  Paperclip,
  Reply,
  ReplyAll,
  Search,
  Send,
  Star,
  RefreshCw,
  Tag,
  UserCheck,
  X,
} from "lucide-react";

// ── Constants ──
const DEFAULT_MAILBOX_SYNC_URL = "http://localhost:8787/sync-mailbox";
const DEFAULT_MAILBOX_API_URL = "http://localhost:8787";
const MAILBOX_SYNC_URL =
  import.meta.env.VITE_MAILBOX_SYNC_URL || DEFAULT_MAILBOX_SYNC_URL;
const MAILBOX_API_URL =
  import.meta.env.VITE_MAILBOX_API_URL ||
  (MAILBOX_SYNC_URL ? MAILBOX_SYNC_URL.replace(/\/sync-mailbox\/?$/i, "") : DEFAULT_MAILBOX_API_URL);

const PAGE_SIZE = 50;
const ALL_INBOXES = "all";

type ViewMode = "split" | "list" | "detail";
type Density = "compact" | "comfortable";
type BulkAction = "archive" | "markRead" | "markUnread" | "assign";
type ComposerMode = "compose" | "reply" | "replyAll" | "forward";

interface EmailMessage {
  id: string;
  config_id: string;
  from_email: string;
  to_email: string;
  thread_id?: string | null;
  message_id?: string | null;
  in_reply_to?: string | null;
  subject: string | null;
  body: string | null;
  date: string;
  folder: string | null;
  read: boolean | null;
  uid: number;
  user_id: string;
}

interface MailboxConfig {
  id: string;
  smtp_username?: string | null;
  imap_username?: string | null;
  display_name?: string | null;
  provider?: string | null;
  status?: string | null;
  sync_error?: string | null;
  last_synced_at?: string | null;
  team_id?: string | null;
}

interface MessagesPage {
  data: EmailMessage[];
  nextPage?: number;
}

interface ThreadInfo {
  threadKey: string;
  latest: EmailMessage;
  messages: EmailMessage[];
}

interface ListItem {
  id: string;
  messageId: string;
  threadKey: string;
  subject: string;
  from: string;
  preview: string;
  date: string;
  read: boolean;
  hasAttachment: boolean;
  threadCount: number;
  mailboxId: string;
  needsReply: boolean;
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

// ── Helpers ──
const HTML_TAG_REGEX =
  /<\s*(html|head|body|div|p|br|table|tbody|tr|td|th|span|img|a|style|meta|link|!doctype)\b/i;

const looksLikeHtml = (value: string) => HTML_TAG_REGEX.test(value);

const extractPlainText = (body: string) => {
  const withBreaks = body
    .replace(/\r\n/g, "\n")
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\s*\/p\s*>/gi, "\n")
    .replace(/<\s*\/div\s*>/gi, "\n");
  const stripped = withBreaks.replace(/<[^>]+>/g, " ");
  return stripped
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n\n")
    .trim();
};

const buildPreviewText = (body: string | null) => {
  if (!body) return "No content preview available";
  const plain = extractPlainText(body);
  if (!plain) return "No content preview available";
  return plain.replace(/\s+/g, " ").slice(0, 160);
};

const sanitizeEmailHtml = (html: string) => {
  if (typeof window === "undefined") return html;
  const doc = new DOMParser().parseFromString(html, "text/html");
  const blockedTags = ["script", "style", "iframe", "object", "embed", "link", "meta", "base"];
  blockedTags.forEach((tag) => {
    doc.querySelectorAll(tag).forEach((el) => el.remove());
  });
  doc.querySelectorAll("*").forEach((el) => {
    Array.from(el.attributes).forEach((attr) => {
      const name = attr.name.toLowerCase();
      const value = attr.value || "";
      if (name.startsWith("on")) {
        el.removeAttribute(attr.name);
        return;
      }
      if ((name === "href" || name === "src") && value) {
        const trimmed = value.trim().toLowerCase();
        if (trimmed.startsWith("javascript:") || trimmed.startsWith("data:text/html")) {
          el.removeAttribute(attr.name);
        }
      }
    });
  });
  doc.querySelectorAll("a").forEach((el) => {
    el.setAttribute("target", "_blank");
    el.setAttribute("rel", "noopener noreferrer");
  });
  return doc.body.innerHTML;
};

const normalizeSubject = (subject: string | null) =>
  (subject || "(No Subject)").replace(/^(re|fwd|fw):/gi, "").trim().toLowerCase();

const normalizeEmail = (value: string | null | undefined) => (value || "").trim().toLowerCase();

const buildThreadKey = (message: EmailMessage) => {
  if (message.thread_id) return `thread:${message.thread_id}`;
  const participants = [normalizeEmail(message.from_email), normalizeEmail(message.to_email)]
    .filter(Boolean)
    .sort()
    .join("|");
  return `${normalizeSubject(message.subject)}::${participants || normalizeEmail(message.from_email)}`;
};

const getInitials = (value: string) =>
  value.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();

const buildReplySubject = (subject: string | null) => {
  const base = subject?.trim() || "(No Subject)";
  return /^re:/i.test(base) ? base : `Re: ${base}`;
};

const buildForwardSubject = (subject: string | null) => {
  const base = subject?.trim() || "(No Subject)";
  return /^(fwd|fw):/i.test(base) ? base : `Fwd: ${base}`;
};

const buildReplyBody = (email: EmailMessage) => {
  const plain = extractPlainText(email.body || "");
  const dateLabel = new Date(email.date).toLocaleString();
  const quoted = plain.split(/\r?\n/).map((line) => `> ${line}`).join("\n");
  return `\n\nOn ${dateLabel}, ${email.from_email} wrote:\n${quoted}`;
};

const buildForwardBody = (email: EmailMessage) => {
  const plain = extractPlainText(email.body || "");
  const dateLabel = new Date(email.date).toLocaleString();
  const subject = email.subject || "(No Subject)";
  const toEmail = email.to_email || "";
  return `\n\n---------- Forwarded message ----------\nFrom: ${email.from_email}\nDate: ${dateLabel}\nSubject: ${subject}\nTo: ${toEmail}\n\n${plain}`;
};

const buildMailtoLink = (to: string | null, subject: string, body: string) => {
  const params = new URLSearchParams();
  if (subject) params.set("subject", subject);
  if (body) params.set("body", body);
  const query = params.toString();
  const address = to ? encodeURIComponent(to) : "";
  return `mailto:${address}${query ? `?${query}` : ""}`;
};

const parseAddressInput = (value: string) =>
  value.split(/[,;]+/).map((entry) => entry.trim()).filter(Boolean);

const buildHtmlFromText = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/\r?\n/g, "<br />");

const readFileAsBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      resolve(result.includes("base64,") ? result.split("base64,").pop() || "" : result);
    };
    reader.readAsDataURL(file);
  });

const formatBytes = (bytes: number) => {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const idx = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, idx);
  return `${value.toFixed(value >= 10 || idx === 0 ? 0 : 1)} ${units[idx]}`;
};

const createLocalId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const useMediaQuery = (query: string) => {
  const [matches, setMatches] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia(query).matches;
  });
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const media = window.matchMedia(query);
    const listener = () => setMatches(media.matches);
    listener();
    if (media.addEventListener) {
      media.addEventListener("change", listener);
      return () => media.removeEventListener("change", listener);
    }
    media.addListener(listener);
    return () => media.removeListener(listener);
  }, [query]);
  return matches;
};

const savedViews: Array<{ id: InboxSavedViewId; label: string; description: string }> = [
  { id: "all", label: "All", description: "Every conversation" },
  { id: "unread", label: "Unread", description: "New or unseen" },
  { id: "needsReply", label: "Needs reply", description: "Awaiting action" },
  { id: "assigned", label: "Assigned", description: "Owned by you" },
  { id: "starred", label: "Starred", description: "Pinned follow-ups" },
];

const densityConfig: Record<Density, { rowHeight: number; padding: string }> = {
  compact: { rowHeight: 72, padding: "py-2" },
  comfortable: { rowHeight: 88, padding: "py-3" },
};

const buildMailboxLabel = (config: MailboxConfig) =>
  config.display_name || config.smtp_username || config.imap_username || "Inbox";

// ── Avatar Colors ──
const avatarColors = [
  "bg-blue-100 text-blue-700",
  "bg-emerald-100 text-emerald-700",
  "bg-amber-100 text-amber-700",
  "bg-violet-100 text-violet-700",
  "bg-rose-100 text-rose-700",
  "bg-cyan-100 text-cyan-700",
  "bg-orange-100 text-orange-700",
  "bg-pink-100 text-pink-700",
];

const getAvatarColor = (email: string) => {
  let hash = 0;
  for (let i = 0; i < email.length; i++) {
    hash = ((hash << 5) - hash + email.charCodeAt(i)) | 0;
  }
  return avatarColors[Math.abs(hash) % avatarColors.length];
};

// ═══════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════
const InboxPage: React.FC<{ user: any }> = ({ user }) => {
  const queryClient = useQueryClient();
  const isWide = useMediaQuery("(min-width: 1024px)");
  const [viewMode, setViewMode] = useState<ViewMode>("split");
  const [density, setDensity] = useState<Density>("comfortable");
  const [threadedView, setThreadedView] = useState(true);
  const [savedView, setSavedView] = useState<InboxSavedViewId>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [filters, setFilters] = useState<InboxSearchFilters>({});
  const [selectedMailboxId, setSelectedMailboxId] = useState(ALL_INBOXES);
  const [excludedMailboxIds, setExcludedMailboxIds] = useState<string[]>([]);
  const [mailboxMenuSearch, setMailboxMenuSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [contextOpen, setContextOpen] = useState(true);
  const [commandOpen, setCommandOpen] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [composerMode, setComposerMode] = useState<ComposerMode>("compose");
  const [composerConfigId, setComposerConfigId] = useState("");
  const [composerMessageId, setComposerMessageId] = useState<string | null>(null);
  const [composerTo, setComposerTo] = useState("");
  const [composerCc, setComposerCc] = useState("");
  const [composerBcc, setComposerBcc] = useState("");
  const [composerSubject, setComposerSubject] = useState("");
  const [composerBody, setComposerBody] = useState("");
  const [composerQuotedText, setComposerQuotedText] = useState("");
  const [composerQuotedHtml, setComposerQuotedHtml] = useState("");
  const [composerLoadingDraft, setComposerLoadingDraft] = useState(false);
  const [composerSending, setComposerSending] = useState(false);
  const [composerThreadingLimited, setComposerThreadingLimited] = useState(false);
  const [composerIncludeOriginalAttachments, setComposerIncludeOriginalAttachments] = useState(false);
  const [composerIncludeOriginalAttachmentsAvailable, setComposerIncludeOriginalAttachmentsAvailable] = useState(false);
  const [composerOriginalAttachments, setComposerOriginalAttachments] = useState<
    NonNullable<ReplyDraft["originalAttachments"]>
  >([]);
  const [composerAttachments, setComposerAttachments] = useState<ReplyAttachment[]>([]);
  const [pipelineId, setPipelineId] = useState<string | null>(null);
  const [pipelineStages, setPipelineStages] = useState<DbPipelineStage[]>([]);
  const [selectedOpportunity, setSelectedOpportunity] = useState<DbOpportunity | null>(null);
  const [pipelineBusy, setPipelineBusy] = useState(false);
  const [nextStepDraft, setNextStepDraft] = useState("");
  const [dealValueDraft, setDealValueDraft] = useState("");
  const [campaignDraft, setCampaignDraft] = useState("");
  const [campaignOptions, setCampaignOptions] = useState<{ id: string; name: string }[]>([]);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const [starredIds, setStarredIds] = useState<Set<string>>(new Set());
  const [assignedIds, setAssignedIds] = useState<Set<string>>(new Set());
  const [syncState, setSyncState] = useState<Record<string, { status: string; lastSyncedAt?: string; error?: string }>>({});

  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const composerFileInputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<List>(null);
  const { ref: listContainerRef, bounds: listBounds } = useMeasure<HTMLDivElement>();
  const debouncedSearch = useDebounce(searchQuery, 300);

  // ── Pipeline & Campaigns ──
  useEffect(() => {
    if (!user?.id) return;
    let active = true;
    const loadPipeline = async () => {
      try {
        const { pipeline, stages } = await ensureDefaultPipeline(user.id);
        if (!active) return;
        setPipelineId(pipeline.id);
        setPipelineStages(stages);
      } catch (error) {
        console.error("Failed to load pipeline for inbox", error);
      }
    };
    loadPipeline();
    return () => { active = false; };
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    let active = true;
    const loadCampaigns = async () => {
      const { data, error } = await supabase
        .from("campaigns")
        .select("id, name")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (!active) return;
      if (error) { console.error("Failed to load campaigns", error); return; }
      setCampaignOptions(data || []);
    };
    loadCampaigns();
    return () => { active = false; };
  }, [user?.id]);

  // ── Mailboxes ──
  const mailboxesQuery = useQuery({
    queryKey: ["inbox-mailboxes", user?.id],
    enabled: Boolean(user?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_configs")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as MailboxConfig[];
    },
  });

  const mailboxes = useMemo(() => mailboxesQuery.data ?? [], [mailboxesQuery.data]);
  const includedMailboxIds = useMemo(() => {
    if (selectedMailboxId !== ALL_INBOXES) return [selectedMailboxId];
    return mailboxes.map((config) => config.id).filter(Boolean).filter((id) => !excludedMailboxIds.includes(id));
  }, [mailboxes, selectedMailboxId, excludedMailboxIds]);
  const selectedMailboxLabel = useMemo(() => {
    if (selectedMailboxId === ALL_INBOXES) {
      if (!mailboxes.length) return "All inboxes";
      if (includedMailboxIds.length === mailboxes.length) return "All inboxes";
      return `All inboxes (${includedMailboxIds.length}/${mailboxes.length})`;
    }
    const current = mailboxes.find((config) => config.id === selectedMailboxId);
    return current ? buildMailboxLabel(current) : "Select inbox";
  }, [selectedMailboxId, mailboxes, includedMailboxIds]);
  const mailboxSearchTerm = mailboxMenuSearch.trim().toLowerCase();
  const filteredMailboxOptions = useMemo(() => {
    if (!mailboxSearchTerm) return mailboxes;
    return mailboxes.filter((config) => buildMailboxLabel(config).toLowerCase().includes(mailboxSearchTerm));
  }, [mailboxes, mailboxSearchTerm]);
  const allInboxesIncluded = useMemo(
    () => mailboxes.length > 0 && includedMailboxIds.length === mailboxes.length,
    [mailboxes.length, includedMailboxIds.length]
  );

  const resolveDefaultComposerConfigId = useCallback(() => {
    if (selectedMailboxId !== ALL_INBOXES && mailboxes.some((config) => config.id === selectedMailboxId)) return selectedMailboxId;
    if (includedMailboxIds.length > 0) return includedMailboxIds[0];
    return mailboxes[0]?.id || "";
  }, [includedMailboxIds, mailboxes, selectedMailboxId]);

  const mailboxScopeKey =
    selectedMailboxId === ALL_INBOXES
      ? `all:${includedMailboxIds.join(",")}`
      : selectedMailboxId;

  // ── Messages ──
  const messagesQueryKey = useMemo(
    () => ["inbox-messages", user?.id, mailboxScopeKey, savedView, debouncedSearch],
    [user?.id, mailboxScopeKey, savedView, debouncedSearch]
  );

  const messagesQuery = useInfiniteQuery<MessagesPage>({
    queryKey: messagesQueryKey,
    enabled: Boolean(user?.id) && includedMailboxIds.length > 0,
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      let query = supabase
        .from("email_messages")
        .select("*")
        .eq("user_id", user.id)
        .order("date", { ascending: false })
        .range((pageParam as number) * PAGE_SIZE, (pageParam as number) * PAGE_SIZE + PAGE_SIZE - 1);

      if (selectedMailboxId !== ALL_INBOXES) {
        query = query.eq("config_id", selectedMailboxId);
      } else if (includedMailboxIds.length > 0) {
        query = query.in("config_id", includedMailboxIds);
      }

      if (savedView === "unread") {
        query = query.eq("read", false);
      }

      if (debouncedSearch) {
        const safe = debouncedSearch.replace(/,/g, " ");
        query = query.or(`subject.ilike.*${safe}*,from_email.ilike.*${safe}*`);
      }

      const { data, error } = await query;
      if (error) throw error;

      return {
        data: (data || []) as EmailMessage[],
        nextPage: (data || []).length === PAGE_SIZE ? (pageParam as number) + 1 : undefined,
      };
    },
    getNextPageParam: (lastPage) => lastPage.nextPage,
  });

  const messages = useMemo(
    () => messagesQuery.data?.pages.flatMap((page) => page.data) ?? [],
    [messagesQuery.data]
  );

  const unreadCount = useMemo(() => messages.filter((message) => !message.read).length, [messages]);

  const filteredMessages = useMemo(() => {
    return messages.filter((message) => {
      if (savedView === "unread" && message.read) return false;
      if (savedView === "needsReply") {
        const needsReply = !message.read && !/^re:/i.test(message.subject || "");
        if (!needsReply) return false;
      }
      if (savedView === "assigned") return assignedIds.has(message.id);
      if (savedView === "starred" && !starredIds.has(message.id)) return false;
      if (filters.from && !message.from_email.toLowerCase().includes(filters.from.toLowerCase())) return false;
      if (filters.subject && !(message.subject || "").toLowerCase().includes(filters.subject.toLowerCase())) return false;
      if (filters.hasAttachment) {
        if (!/(attach|attachment|attached)/i.test(message.body || "")) return false;
      }
      if (filters.dateFrom && new Date(message.date) < new Date(filters.dateFrom)) return false;
      if (filters.dateTo && new Date(message.date) > new Date(filters.dateTo)) return false;
      return true;
    });
  }, [messages, savedView, filters, starredIds, assignedIds]);

  const threads = useMemo<ThreadInfo[]>(() => {
    const map = new Map<string, EmailMessage[]>();
    filteredMessages.forEach((message) => {
      const key = buildThreadKey(message);
      const existing = map.get(key) || [];
      existing.push(message);
      map.set(key, existing);
    });
    return Array.from(map.entries()).map(([threadKey, items]) => {
      const sorted = [...items].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      return { threadKey, latest: sorted[0], messages: sorted };
    });
  }, [filteredMessages]);

  const listItems = useMemo<ListItem[]>(() => {
    if (threadedView) {
      return threads
        .sort((a, b) => new Date(b.latest.date).getTime() - new Date(a.latest.date).getTime())
        .map((thread) => ({
          id: thread.threadKey,
          messageId: thread.latest.id,
          threadKey: thread.threadKey,
          subject: thread.latest.subject || "(No Subject)",
          from: thread.latest.from_email,
          preview: buildPreviewText(thread.latest.body),
          date: thread.latest.date,
          read: Boolean(thread.latest.read),
          hasAttachment: /(attach|attachment|attached)/i.test(thread.latest.body || ""),
          threadCount: thread.messages.length,
          mailboxId: thread.latest.config_id,
          needsReply: !thread.latest.read && !/^re:/i.test(thread.latest.subject || ""),
        }));
    }
    return filteredMessages.map((message) => ({
      id: message.id,
      messageId: message.id,
      threadKey: buildThreadKey(message),
      subject: message.subject || "(No Subject)",
      from: message.from_email,
      preview: buildPreviewText(message.body),
      date: message.date,
      read: Boolean(message.read),
      hasAttachment: /(attach|attachment|attached)/i.test(message.body || ""),
      threadCount: 1,
      mailboxId: message.config_id,
      needsReply: !message.read && !/^re:/i.test(message.subject || ""),
    }));
  }, [filteredMessages, threadedView, threads]);

  const selectedMessage = useMemo(
    () => messages.find((message) => message.id === selectedMessageId) || null,
    [messages, selectedMessageId]
  );

  const threadMessages = useMemo(() => {
    if (!selectedMessage) return [];
    const thread = threads.find((item) => item.threadKey === buildThreadKey(selectedMessage));
    return thread?.messages ?? [selectedMessage];
  }, [selectedMessage, threads]);

  // ── Pipeline side effects ──
  useEffect(() => {
    if (!selectedMessage || !pipelineId) { setSelectedOpportunity(null); return; }
    let active = true;
    const loadOpportunity = async () => {
      try {
        const opportunity = await findOpportunityByEmail(pipelineId, selectedMessage.from_email);
        if (active) setSelectedOpportunity(opportunity);
      } catch (error) { console.error("Failed to load opportunity", error); }
    };
    loadOpportunity();
    return () => { active = false; };
  }, [selectedMessage, pipelineId]);

  useEffect(() => { setNextStepDraft(selectedOpportunity?.next_step || ""); }, [selectedOpportunity]);
  useEffect(() => {
    const value = selectedOpportunity?.value;
    setDealValueDraft(value == null ? "" : String(value));
  }, [selectedOpportunity]);
  useEffect(() => { setCampaignDraft(selectedOpportunity?.campaign_id || ""); }, [selectedOpportunity]);

  useEffect(() => {
    if (selectedOpportunity) return;
    if (!selectedMessage) { setCampaignDraft(""); return; }
    let active = true;
    setCampaignDraft("");
    const fetchSuggestedCampaign = async () => {
      const { data, error } = await supabase
        .from("recipients")
        .select("campaign_id")
        .eq("email", selectedMessage.from_email)
        .limit(1);
      if (!active) return;
      if (error) return;
      const campaignId = data?.[0]?.campaign_id;
      if (campaignId) setCampaignDraft(campaignId);
    };
    fetchSuggestedCampaign();
    return () => { active = false; };
  }, [selectedMessage, selectedOpportunity]);

  const selectedIndex = useMemo(
    () => listItems.findIndex((item) => item.messageId === selectedMessageId),
    [listItems, selectedMessageId]
  );

  const selectedPipelineStageId = selectedOpportunity?.stage_id || "";
  const selectedPipelineStage = pipelineStages.find((stage) => stage.id === selectedPipelineStageId);
  const isProposalStage = (stageId: string) => {
    if (!stageId) return false;
    const stage = pipelineStages.find((item) => item.id === stageId);
    if (!stage) return false;
    if (stage.template_stage_id === "proposal") return true;
    const name = stage.name.toLowerCase();
    return name.includes("proposal") || name.includes("pricing") || name.includes("quote");
  };
  const isSelectedStale = selectedOpportunity?.last_activity_at
    ? differenceInDays(new Date(), new Date(selectedOpportunity.last_activity_at)) >= STALE_DAYS
    : selectedMessage
      ? differenceInDays(new Date(), new Date(selectedMessage.date)) >= STALE_DAYS
      : false;
  const pipelineDisabled = pipelineBusy || !pipelineId || pipelineStages.length === 0;

  const resolveStageId = (value: string) => {
    if (!value) return "";
    const directMatch = pipelineStages.find((stage) => stage.id === value);
    if (directMatch) return directMatch.id;
    const templateMatch = pipelineStages.find((stage) => stage.template_stage_id === value);
    return templateMatch?.id || "";
  };

  const resolveOpportunityStatus = (stageId: string) => {
    const stage = pipelineStages.find((item) => item.id === stageId);
    if (stage?.is_won) return "won";
    if (stage?.is_lost) return "lost";
    return "open";
  };

  const resolveContactDetails = async (email: string) => {
    const { data: recipientData } = await supabase.from("recipients").select("name, campaign_id").eq("email", email).limit(1);
    const { data: prospectData } = await supabase.from("prospects").select("name, company").eq("email", email).limit(1);
    const contactName = recipientData?.[0]?.name || prospectData?.[0]?.name || email;
    const company = prospectData?.[0]?.company || null;
    const campaignId = recipientData?.[0]?.campaign_id || null;
    return { contactName, company, campaignId };
  };

  const updatePipelineStage = async (stageValue: string) => {
    if (!selectedMessage || !pipelineId || !user?.id) return;
    const stageId = resolveStageId(stageValue);
    setPipelineBusy(true);
    try {
      if (!stageId) {
        if (selectedOpportunity) await deleteOpportunity(selectedOpportunity.id);
        setSelectedOpportunity(null);
        return;
      }
      const status = resolveOpportunityStatus(stageId);
      if (selectedOpportunity) {
        const updated = await updateOpportunity(selectedOpportunity.id, { stageId, status, lastActivityAt: new Date().toISOString() });
        setSelectedOpportunity(updated);
        if (!updated.value && updated.campaign_id && isProposalStage(stageId)) {
          const suggested = await suggestOpportunityValueFromCampaign(updated.campaign_id);
          if (suggested != null) {
            const withValue = await updateOpportunity(updated.id, { value: suggested, lastActivityAt: new Date().toISOString() });
            setSelectedOpportunity(withValue);
            setDealValueDraft(String(Math.round(suggested)));
          }
        }
        return;
      }
      const details = await resolveContactDetails(selectedMessage.from_email);
      const created = await createOpportunity({
        userId: user.id, pipelineId, stageId, status,
        contactName: details.contactName, contactEmail: selectedMessage.from_email,
        company: details.company, owner: "", nextStep: "",
        campaignId: campaignDraft || details.campaignId,
      });
      let nextOpportunity = created;
      if (!created.value && created.campaign_id && isProposalStage(stageId)) {
        const suggested = await suggestOpportunityValueFromCampaign(created.campaign_id);
        if (suggested != null) {
          nextOpportunity = await updateOpportunity(created.id, { value: suggested, lastActivityAt: new Date().toISOString() });
          setDealValueDraft(String(Math.round(suggested)));
        }
      }
      setSelectedOpportunity(nextOpportunity);
    } catch (error) {
      console.error("Failed to update pipeline stage", error);
    } finally {
      setPipelineBusy(false);
    }
  };

  const updateNextStep = async (value: string) => {
    if (!selectedMessage || !pipelineId || !user?.id) return;
    if (!selectedOpportunity) {
      toast({ title: "Select a pipeline stage first", description: "Add this reply to a pipeline stage before setting a next step." });
      return;
    }
    setPipelineBusy(true);
    try {
      const updated = await updateOpportunity(selectedOpportunity.id, { nextStep: value, lastActivityAt: new Date().toISOString() });
      setSelectedOpportunity(updated);
    } catch (error) { console.error("Failed to update next step", error); }
    finally { setPipelineBusy(false); }
  };

  const updateDealValue = async (value: string) => {
    if (!selectedMessage || !pipelineId || !user?.id) return;
    if (!selectedOpportunity) {
      toast({ title: "Select a pipeline stage first", description: "Add this reply to a pipeline stage before setting a value." });
      return;
    }
    const parsed = value ? Number(value.replace(/,/g, "")) : null;
    if (value && !Number.isFinite(parsed)) {
      toast({ title: "Enter a valid number", description: "Use plain numbers like 12000 or 12,000.", variant: "destructive" });
      return;
    }
    setPipelineBusy(true);
    try {
      const updated = await updateOpportunity(selectedOpportunity.id, { value: parsed, lastActivityAt: new Date().toISOString() });
      setSelectedOpportunity(updated);
    } catch (error) { console.error("Failed to update value", error); }
    finally { setPipelineBusy(false); }
  };

  const updateCampaign = async (campaignId: string) => {
    setCampaignDraft(campaignId);
    if (!selectedOpportunity) return;
    try {
      const updated = await updateOpportunity(selectedOpportunity.id, { campaignId: campaignId || null, lastActivityAt: new Date().toISOString() });
      let nextOpportunity = updated;
      if (campaignId && !updated.value && updated.stage_id && isProposalStage(updated.stage_id)) {
        const suggested = await suggestOpportunityValueFromCampaign(campaignId);
        if (suggested != null) {
          nextOpportunity = await updateOpportunity(updated.id, { value: suggested, lastActivityAt: new Date().toISOString() });
          setDealValueDraft(String(Math.round(suggested)));
        }
      }
      setSelectedOpportunity(nextOpportunity);
    } catch (error) { console.error("Failed to update campaign", error); }
  };

  // ── Auto-select & layout effects ──
  useEffect(() => {
    if (listItems.length === 0) { setSelectedMessageId(null); return; }
    if (!selectedMessageId || !listItems.some((item) => item.messageId === selectedMessageId)) {
      setSelectedMessageId(listItems[0].messageId);
    }
  }, [listItems, selectedMessageId]);

  useEffect(() => {
    if (selectedIndex >= 0 && listRef.current) listRef.current.scrollToItem(selectedIndex, "smart");
  }, [selectedIndex]);

  useEffect(() => {
    if (!mailboxes.length) return;
    if (selectedMailboxId !== ALL_INBOXES && mailboxes.some((box) => box.id === selectedMailboxId)) return;
    setSelectedMailboxId(mailboxes.length > 1 ? ALL_INBOXES : mailboxes[0].id);
  }, [mailboxes, selectedMailboxId]);

  useEffect(() => {
    if (!composeOpen || composerMode !== "compose") return;
    if (composerConfigId && mailboxes.some((config) => config.id === composerConfigId)) return;
    setComposerConfigId(resolveDefaultComposerConfigId());
  }, [composeOpen, composerConfigId, composerMode, mailboxes, resolveDefaultComposerConfigId]);

  useEffect(() => { if (!isWide) setContextOpen(false); }, [isWide]);
  useEffect(() => { if (!selectedMessageId) return; if (!isWide) setMobileDetailOpen(true); }, [selectedMessageId, isWide]);

  // ── Cache helpers ──
  const updateCachedMessages = useCallback(
    (updater: (message: EmailMessage) => EmailMessage | null, queryKey: Array<string | number | undefined>) => {
      queryClient.setQueryData<InfiniteData<MessagesPage>>(queryKey, (old) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            data: page.data.map((message) => updater(message)).filter((message): message is EmailMessage => Boolean(message)),
          })),
        };
      });
    },
    [queryClient]
  );

  const bulkActionMutation = useMutation({
    mutationFn: async ({ ids, action }: { ids: string[]; action: BulkAction }) => {
      if (ids.length === 0) return;
      if (action === "archive") {
        const { error } = await supabase.from("email_messages").update({ folder: "archive" }).in("id", ids);
        if (error) throw error;
      }
      if (action === "markRead") {
        const { error } = await supabase.from("email_messages").update({ read: true }).in("id", ids);
        if (error) throw error;
      }
      if (action === "markUnread") {
        const { error } = await supabase.from("email_messages").update({ read: false }).in("id", ids);
        if (error) throw error;
      }
    },
  });

  const performBulkAction = useCallback(
    (action: BulkAction, ids: string[], undoMessage?: string) => {
      if (ids.length === 0) return;
      if (action === "assign") {
        setAssignedIds((prev) => new Set([...prev, ...ids]));
        setSelectedIds(new Set());
        toast({ title: "Assigned", description: ids.length > 1 ? `${ids.length} conversations assigned to you.` : "Conversation assigned to you." });
        return;
      }
      const previous = queryClient.getQueryData(messagesQueryKey);
      updateCachedMessages((message) => {
        if (!ids.includes(message.id)) return message;
        if (action === "archive") return null;
        if (action === "markRead") return { ...message, read: true };
        if (action === "markUnread") return { ...message, read: false };
        return message;
      }, messagesQueryKey);
      bulkActionMutation.mutate({ ids, action }, {
        onError: () => {
          if (previous) queryClient.setQueryData(messagesQueryKey, previous);
          toast({ title: "Action failed", description: "We could not update those messages.", variant: "destructive" });
        },
      });
      toast({
        title: undoMessage || "Updated",
        description: ids.length > 1 ? `${ids.length} items updated` : "1 item updated",
        action: <ToastAction altText="Undo" onClick={() => { if (previous) queryClient.setQueryData(messagesQueryKey, previous); }}>Undo</ToastAction>,
      });
      setSelectedIds(new Set());
    },
    [bulkActionMutation, messagesQueryKey, queryClient, updateCachedMessages]
  );

  const handleSelectMessage = useCallback(
    (messageId: string) => {
      setSelectedMessageId(messageId);
      const message = messages.find((item) => item.id === messageId);
      if (!message || message.read) return;
      updateCachedMessages((item) => (item.id === messageId ? { ...item, read: true } : item), messagesQueryKey);
      void supabase.from("email_messages").update({ read: true }).eq("id", messageId).then(({ error }) => {
        if (!error) return;
        updateCachedMessages((item) => (item.id === messageId ? { ...item, read: false } : item), messagesQueryKey);
        console.error("Failed to mark message as read", error);
      });
    },
    [messages, messagesQueryKey, updateCachedMessages]
  );

  const toggleStar = (messageId: string) => {
    setStarredIds((prev) => {
      const next = new Set(prev);
      if (next.has(messageId)) next.delete(messageId); else next.add(messageId);
      return next;
    });
  };

  const handleSelectAll = (checked: boolean) => {
    if (!checked) { setSelectedIds(new Set()); return; }
    setSelectedIds(new Set(listItems.map((item) => item.messageId)));
  };

  const handleSelectMessageToggle = (messageId: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(messageId); else next.delete(messageId);
      return next;
    });
  };

  // ── Composer ──
  const resetComposerState = useCallback(() => {
    setComposerConfigId(""); setComposerMessageId(null); setComposerTo(""); setComposerCc(""); setComposerBcc("");
    setComposerSubject(""); setComposerBody(""); setComposerQuotedText(""); setComposerQuotedHtml("");
    setComposerLoadingDraft(false); setComposerSending(false); setComposerThreadingLimited(false);
    setComposerIncludeOriginalAttachments(false); setComposerIncludeOriginalAttachmentsAvailable(false);
    setComposerOriginalAttachments([]); setComposerAttachments([]);
    if (composerFileInputRef.current) composerFileInputRef.current.value = "";
  }, []);

  const openComposer = useCallback(
    async (mode: ComposerMode, message?: EmailMessage | null) => {
      setComposerMode(mode); setComposeOpen(true); setComposerSending(false);
      if (mode === "compose") { resetComposerState(); setComposerConfigId(resolveDefaultComposerConfigId()); return; }
      if (!message) {
        toast({ title: "Composer unavailable", description: "Select a message first.", variant: "destructive" });
        setComposeOpen(false); resetComposerState(); return;
      }
      if (mode === "forward") {
        setComposerConfigId(message.config_id || ""); setComposerMessageId(null);
        setComposerTo(""); setComposerCc(""); setComposerBcc("");
        setComposerSubject(buildForwardSubject(message.subject)); setComposerBody(buildForwardBody(message));
        setComposerQuotedText(""); setComposerQuotedHtml("");
        setComposerLoadingDraft(false); setComposerThreadingLimited(false);
        setComposerIncludeOriginalAttachments(false); setComposerIncludeOriginalAttachmentsAvailable(false);
        setComposerOriginalAttachments([]); setComposerAttachments([]);
        return;
      }
      // reply / replyAll
      setComposerConfigId(message.config_id || ""); setComposerMessageId(message.id);
      setComposerLoadingDraft(true); setComposerTo(message.from_email); setComposerCc(""); setComposerBcc("");
      setComposerSubject(buildReplySubject(message.subject)); setComposerBody("");
      setComposerQuotedText(buildReplyBody(message)); setComposerQuotedHtml("");
      setComposerThreadingLimited(false); setComposerIncludeOriginalAttachments(false);
      setComposerIncludeOriginalAttachmentsAvailable(false); setComposerOriginalAttachments([]); setComposerAttachments([]);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) throw new Error("Not authenticated");
        const response = await fetch(`${MAILBOX_API_URL}/api/inbox/messages/${message.id}/reply-draft?mode=${mode}`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        let payload: ReplyDraft | { error?: string } = {};
        try { payload = await response.json(); } catch { payload = {}; }
        if (!response.ok) throw new Error((payload as { error?: string }).error || "Failed to build reply draft");
        const draft = payload as ReplyDraft;
        setComposerTo((draft.to || []).join(", ")); setComposerCc((draft.cc || []).join(", ")); setComposerBcc("");
        setComposerSubject(draft.subject || buildReplySubject(message.subject));
        setComposerQuotedText(draft.text || buildReplyBody(message));
        setComposerQuotedHtml(draft.html || "");
        setComposerThreadingLimited(Boolean(draft.threadingLimited));
        setComposerIncludeOriginalAttachmentsAvailable(Boolean(draft.includeOriginalAttachmentsAvailable));
        setComposerOriginalAttachments(Array.isArray(draft.originalAttachments) ? draft.originalAttachments : []);
      } catch (error: any) {
        toast({ title: "Reply draft unavailable", description: error?.message || "Using fallback recipients for this reply.", variant: "destructive" });
      } finally { setComposerLoadingDraft(false); }
    },
    [resetComposerState, resolveDefaultComposerConfigId]
  );

  const handleComposerAttachmentChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;
    setComposerAttachments((prev) => [...prev, ...files.map((file) => ({ id: createLocalId(), file }))]);
    event.target.value = "";
  }, []);

  const handleRemoveComposerAttachment = useCallback((id: string) => {
    setComposerAttachments((prev) => prev.filter((attachment) => attachment.id !== id));
  }, []);

  // ── Keyboard shortcuts ──
  const handleKeyboardShortcut = useCallback(
    (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setCommandOpen(true); return; }
      if (event.key === "/" && !isTyping) { event.preventDefault(); searchInputRef.current?.focus(); return; }
      if (isTyping) return;
      if (event.key.toLowerCase() === "j") { event.preventDefault(); const nextIndex = Math.min(listItems.length - 1, selectedIndex + 1); if (listItems[nextIndex]) handleSelectMessage(listItems[nextIndex].messageId); }
      if (event.key.toLowerCase() === "k") { event.preventDefault(); const prevIndex = Math.max(0, selectedIndex - 1); if (listItems[prevIndex]) handleSelectMessage(listItems[prevIndex].messageId); }
      if (event.key.toLowerCase() === "r" && selectedMessageId) { event.preventDefault(); openComposer("reply", selectedMessage); }
      if (event.key.toLowerCase() === "a" && selectedMessageId) { event.preventDefault(); performBulkAction("archive", [selectedMessageId], "Archived"); }
      if (event.key.toLowerCase() === "f" && selectedMessageId) { event.preventDefault(); openComposer("forward", selectedMessage); }
      if (event.key.toLowerCase() === "e" && selectedMessageId) { event.preventDefault(); performBulkAction("archive", [selectedMessageId], "Archived"); }
      if (event.key === "Escape" && mobileDetailOpen) { event.preventDefault(); setMobileDetailOpen(false); }
    },
    [listItems, selectedIndex, handleSelectMessage, selectedMessageId, selectedMessage, performBulkAction, openComposer, mobileDetailOpen]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyboardShortcut);
    return () => window.removeEventListener("keydown", handleKeyboardShortcut);
  }, [handleKeyboardShortcut]);

  // ── Send ──
  const handleSend = useCallback(async () => {
    if (composerSending) return;
    if (composerMode === "forward") {
      const mailto = buildMailtoLink(composerTo || null, composerSubject, composerBody);
      window.open(mailto, "_blank", "noopener,noreferrer");
      setComposeOpen(false); resetComposerState();
      toast({ title: "Forward opened", description: "Your default mail app was opened for sending." });
      return;
    }
    if (composerMode === "compose") {
      const to = parseAddressInput(composerTo);
      if (!to.length) { toast({ title: "Recipient required", description: "Add at least one recipient in the To field.", variant: "destructive" }); return; }
      if (!composerBody.trim()) { toast({ title: "Message required", description: "Write your message before sending.", variant: "destructive" }); return; }
      if (!composerConfigId) { toast({ title: "Inbox required", description: "Choose which inbox to send from.", variant: "destructive" }); return; }
      setComposerSending(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) throw new Error("Not authenticated");
        const attachmentPayload = await Promise.all(composerAttachments.map(async (attachment) => ({
          filename: attachment.file.name, contentType: attachment.file.type || "application/octet-stream",
          size: attachment.file.size, content: await readFileAsBase64(attachment.file),
        })));
        const response = await fetch(`${MAILBOX_API_URL}/api/inbox/compose`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({
            configId: composerConfigId, to, cc: parseAddressInput(composerCc), bcc: parseAddressInput(composerBcc),
            subject: composerSubject, text: composerBody, html: buildHtmlFromText(composerBody), attachments: attachmentPayload,
          }),
        });
        let payload: { success?: boolean; error?: string } = {};
        try { payload = await response.json(); } catch { payload = {}; }
        if (!response.ok || !payload?.success) throw new Error(payload?.error || "Failed to send message");
        await queryClient.invalidateQueries({ queryKey: messagesQueryKey });
        setComposeOpen(false); resetComposerState();
        toast({ title: "Message sent", description: "Your email was sent successfully." });
      } catch (error: any) {
        toast({ title: "Send failed", description: error?.message || "Unable to send message.", variant: "destructive" });
      } finally { setComposerSending(false); }
      return;
    }
    if (!composerMessageId) { toast({ title: "Reply unavailable", description: "No message selected for this reply.", variant: "destructive" }); return; }
    setComposerSending(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Not authenticated");
      const attachmentPayload = await Promise.all(composerAttachments.map(async (attachment) => ({
        filename: attachment.file.name, contentType: attachment.file.type || "application/octet-stream",
        size: attachment.file.size, content: await readFileAsBase64(attachment.file),
      })));
      const replyText = composerBody.trim();
      const text = [replyText, composerQuotedText].filter(Boolean).join("\n\n");
      const html = [replyText ? buildHtmlFromText(replyText) : "", composerQuotedHtml].filter(Boolean).join("");
      const response = await fetch(`${MAILBOX_API_URL}/api/inbox/messages/${composerMessageId}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          mode: composerMode, text, html, ccOverride: parseAddressInput(composerCc),
          bcc: parseAddressInput(composerBcc), attachments: attachmentPayload,
          includeOriginalAttachments: composerIncludeOriginalAttachments,
        }),
      });
      let payload: { success?: boolean; error?: string; threadingLimited?: boolean } = {};
      try { payload = await response.json(); } catch { payload = {}; }
      if (!response.ok || !payload?.success) throw new Error(payload?.error || "Failed to send reply");
      await queryClient.invalidateQueries({ queryKey: messagesQueryKey });
      setComposeOpen(false); resetComposerState();
      toast({
        title: "Reply sent",
        description: payload.threadingLimited
          ? "Sent, but threading may be limited because the original message has no Message-ID."
          : "Your reply was sent successfully.",
      });
    } catch (error: any) {
      toast({ title: "Reply failed", description: error?.message || "Unable to send reply.", variant: "destructive" });
    } finally { setComposerSending(false); }
  }, [
    composerAttachments, composerBcc, composerBody, composerCc, composerConfigId,
    composerIncludeOriginalAttachments, composerMessageId, composerMode,
    composerQuotedHtml, composerQuotedText, composerSending, composerSubject, composerTo,
    messagesQueryKey, queryClient, resetComposerState,
  ]);

  useEffect(() => {
    const handleComposerKeys = (event: KeyboardEvent) => {
      if (!composeOpen) return;
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") { event.preventDefault(); void handleSend(); }
    };
    window.addEventListener("keydown", handleComposerKeys);
    return () => window.removeEventListener("keydown", handleComposerKeys);
  }, [composeOpen, handleSend]);

  // ── Sync ──
  const triggerMailboxSync = async (configId: string, accessToken: string) => {
    const response = await fetch(MAILBOX_SYNC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ configId, config_id: configId, mailboxId: configId, limit: 50 }),
    });
    let payload: any = null;
    try { payload = await response.json(); } catch { payload = null; }
    if (!response.ok || payload?.success === false) {
      const baseMessage = payload?.error || payload?.message || "Sync failed";
      const detailMessage = payload?.details || payload?.hint || "";
      throw new Error(detailMessage ? `${baseMessage}: ${detailMessage}` : baseMessage);
    }
    return payload;
  };

  const syncMailbox = async (mailboxId?: string) => {
    const targetIds = mailboxId ? [mailboxId]
      : selectedMailboxId === ALL_INBOXES ? includedMailboxIds
      : mailboxes.map((config) => config.id).filter(Boolean);
    if (targetIds.length === 0) { toast({ title: "No inboxes selected", description: "Choose at least one inbox to sync." }); return; }
    setSyncState((prev) => {
      const next = { ...prev };
      if (!mailboxId) next.all = { status: "syncing", lastSyncedAt: prev.all?.lastSyncedAt, error: undefined };
      for (const id of targetIds) next[id] = { status: "syncing", lastSyncedAt: prev[id]?.lastSyncedAt, error: undefined };
      return next;
    });
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Not authenticated");
      let successCount = 0, errorCount = 0;
      for (const id of targetIds) {
        try {
          await triggerMailboxSync(id, session.access_token);
          successCount++;
          setSyncState((prev) => ({ ...prev, [id]: { status: "success", lastSyncedAt: new Date().toISOString(), error: undefined } }));
        } catch (error: any) {
          errorCount++;
          setSyncState((prev) => ({ ...prev, [id]: { status: "error", lastSyncedAt: prev[id]?.lastSyncedAt, error: error?.message || "Sync failed" } }));
        }
      }
      if (!mailboxId) {
        const now = new Date().toISOString();
        setSyncState((prev) => ({ ...prev, all: { status: errorCount ? "error" : "success", lastSyncedAt: now, error: errorCount ? `${errorCount} mailbox${errorCount === 1 ? "" : "es"} failed` : undefined } }));
      }
      if (successCount > 0) messagesQuery.refetch();
      if (errorCount === 0) toast({ title: "Synced", description: mailboxId ? "Inbox is up to date." : `Synced ${successCount} mailbox${successCount === 1 ? "" : "es"}.` });
      else if (successCount > 0) toast({ title: "Sync completed with errors", description: `${errorCount} mailbox${errorCount === 1 ? "" : "es"} failed.`, variant: "destructive" });
      else toast({ title: "Sync failed", description: "All mailbox syncs failed. Try again in a moment.", variant: "destructive" });
    } catch (error: any) {
      const message = error?.message || "Try again in a moment.";
      setSyncState((prev) => {
        const next = { ...prev };
        if (!mailboxId) next.all = { status: "error", lastSyncedAt: prev.all?.lastSyncedAt, error: message };
        for (const id of targetIds) next[id] = { status: "error", lastSyncedAt: prev[id]?.lastSyncedAt, error: message };
        return next;
      });
      toast({ title: "Sync failed", description: message, variant: "destructive" });
    }
  };

  const onItemsRendered = ({ visibleStopIndex }: ListOnItemsRenderedProps) => {
    if (messagesQuery.hasNextPage && !messagesQuery.isFetchingNextPage) {
      if (visibleStopIndex >= listItems.length - 8) messagesQuery.fetchNextPage();
    }
  };

  const listData = useMemo(
    () => ({
      items: listItems, selectedId: selectedMessageId, density, selectedIds,
      onSelect: handleSelectMessage, onToggleSelect: handleSelectMessageToggle,
      onArchive: (id: string) => performBulkAction("archive", [id], "Archived"),
      onToggleRead: (id: string, isRead: boolean) => performBulkAction(isRead ? "markUnread" : "markRead", [id]),
      onToggleStar: toggleStar, starredIds, assignedIds,
    }),
    [listItems, selectedMessageId, density, selectedIds, handleSelectMessage, performBulkAction, toggleStar, starredIds, assignedIds]
  );

  const allSelected = selectedIds.size > 0 && selectedIds.size === listItems.length;
  const someSelected = selectedIds.size > 0 && selectedIds.size < listItems.length;

  const filterChips = useMemo(() => {
    const chips: Array<{ label: string; onRemove: () => void }> = [];
    if (filters.from) chips.push({ label: `From: ${filters.from}`, onRemove: () => setFilters((prev) => ({ ...prev, from: undefined })) });
    if (filters.subject) chips.push({ label: `Subject: ${filters.subject}`, onRemove: () => setFilters((prev) => ({ ...prev, subject: undefined })) });
    if (filters.hasAttachment) chips.push({ label: "Has attachment", onRemove: () => setFilters((prev) => ({ ...prev, hasAttachment: undefined })) });
    if (filters.dateFrom || filters.dateTo) chips.push({ label: `Date: ${filters.dateFrom || "Any"} → ${filters.dateTo || "Any"}`, onRemove: () => setFilters((prev) => ({ ...prev, dateFrom: undefined, dateTo: undefined })) });
    return chips;
  }, [filters]);

  const syncSummary = syncState[selectedMailboxId === ALL_INBOXES ? "all" : selectedMailboxId];
  const isSyncingSelection = useMemo(() => {
    if (selectedMailboxId === ALL_INBOXES) {
      if (syncState.all?.status === "syncing") return true;
      return includedMailboxIds.some((id) => syncState[id]?.status === "syncing");
    }
    return syncState[selectedMailboxId]?.status === "syncing";
  }, [selectedMailboxId, includedMailboxIds, syncState]);
  const syncLabel = syncSummary?.lastSyncedAt
    ? `Synced ${formatDistanceToNow(new Date(syncSummary.lastSyncedAt), { addSuffix: true })}`
    : "Sync status unknown";

  const effectiveViewMode = isWide ? viewMode : "list";
  const emptyMailboxes = !mailboxesQuery.isLoading && mailboxes.length === 0;
  const isLoadingList = messagesQuery.isLoading && listItems.length === 0;

  // ═══════════════════════════════════════════════════════
  // RENDER — New Matte Ceramic / Pro Tool Design
  // ═══════════════════════════════════════════════════════
  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col overflow-hidden bg-inbox-surface">
      {/* ── Top Header Bar ── */}
      <header className="flex items-center justify-between border-b border-inbox-border bg-inbox-surface-elevated px-6 py-3">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-semibold tracking-tight text-inbox-ink">Inbox</h1>
          {unreadCount > 0 && (
            <Badge className="rounded-full bg-primary/10 text-primary border-0 px-2.5 text-xs font-medium">
              {unreadCount} new
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => openComposer("compose")}
            className="gap-2 bg-accent text-accent-foreground hover:bg-inbox-accent-hover"
            size="sm"
          >
            <MailPlus className="h-4 w-4" />
            Compose
          </Button>
          <Button
            variant="outline" size="sm" className="gap-2 border-inbox-border"
            onClick={() => syncMailbox(selectedMailboxId === ALL_INBOXES ? undefined : selectedMailboxId)}
            disabled={isSyncingSelection}
          >
            <RefreshCw className={cn("h-3.5 w-3.5", isSyncingSelection && "animate-spin")} />
            {isSyncingSelection ? "Syncing..." : "Sync"}
          </Button>
        </div>
      </header>

      {/* ── Controls Bar ── */}
      <div className="border-b border-inbox-border bg-inbox-surface-elevated px-6 py-2.5">
        <div className="flex flex-wrap items-center gap-3">
          {/* Mailbox selector */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 gap-2 border-inbox-border bg-inbox-surface-elevated px-3 text-xs font-normal">
                <span className="text-inbox-ink-muted text-[10px] uppercase tracking-wider">Mailbox</span>
                <span className="font-medium text-inbox-ink">{selectedMailboxLabel}</span>
                <ChevronDown className="h-3 w-3 text-inbox-ink-subtle" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-80 max-h-[70vh] overflow-y-auto">
              <div className="px-2 pb-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-inbox-ink-subtle" />
                  <Input
                    value={mailboxMenuSearch}
                    onChange={(event) => setMailboxMenuSearch(event.target.value)}
                    placeholder="Search inboxes..."
                    className="h-9 border-inbox-border pl-9 text-sm"
                  />
                </div>
              </div>
              <DropdownMenuLabel className="text-xs">Mailbox scope</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuRadioGroup value={selectedMailboxId} onValueChange={setSelectedMailboxId}>
                <DropdownMenuRadioItem value={ALL_INBOXES}>All inboxes</DropdownMenuRadioItem>
                {filteredMailboxOptions.map((config) => (
                  <DropdownMenuRadioItem key={config.id} value={config.id}>{buildMailboxLabel(config)}</DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
              {selectedMailboxId === ALL_INBOXES && mailboxes.length > 1 && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>Included inboxes</DropdownMenuLabel>
                  <DropdownMenuItem onSelect={(event) => { event.preventDefault(); setExcludedMailboxIds([]); }}>
                    <Check className={cn("mr-2 h-4 w-4", allInboxesIncluded ? "opacity-100" : "opacity-0")} />
                    Select all
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={(event) => { event.preventDefault(); setExcludedMailboxIds(mailboxes.map((c) => c.id).filter((id): id is string => Boolean(id))); }}>
                    Deselect all
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <div className="max-h-56 overflow-y-auto">
                    {filteredMailboxOptions.map((config) => {
                      const checked = !excludedMailboxIds.includes(config.id);
                      return (
                        <DropdownMenuCheckboxItem
                          key={config.id} checked={checked}
                          onCheckedChange={(value) => {
                            setExcludedMailboxIds((prev) => {
                              const has = prev.includes(config.id);
                              if (value === true && has) return prev.filter((id) => id !== config.id);
                              if (value !== true && !has) return [...prev, config.id];
                              return prev;
                            });
                          }}
                          onSelect={(event) => event.preventDefault()}
                        >
                          {buildMailboxLabel(config)}
                        </DropdownMenuCheckboxItem>
                      );
                    })}
                    {filteredMailboxOptions.length === 0 && <DropdownMenuItem disabled>No inboxes found</DropdownMenuItem>}
                  </div>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Search */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-inbox-ink-subtle" />
            <Input
              ref={searchInputRef}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search conversations..."
              className="h-8 border-inbox-border bg-inbox-surface pl-8 pr-10 text-xs"
            />
            <kbd className="absolute right-2 top-1/2 -translate-y-1/2 rounded border border-inbox-border bg-inbox-surface px-1.5 py-0.5 text-[9px] text-inbox-ink-subtle font-mono">/</kbd>
          </div>

          {/* Filters */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 gap-1.5 border-inbox-border text-xs">
                <Filter className="h-3.5 w-3.5" />
                Filters
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-4" align="start">
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-[11px] text-inbox-ink-muted">From</Label>
                  <Input value={filters.from || ""} onChange={(e) => setFilters((p) => ({ ...p, from: e.target.value || undefined }))} placeholder="name@company.com" className="h-8 text-xs" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[11px] text-inbox-ink-muted">Subject</Label>
                  <Input value={filters.subject || ""} onChange={(e) => setFilters((p) => ({ ...p, subject: e.target.value || undefined }))} placeholder="Keyword..." className="h-8 text-xs" />
                </div>
                <div className="flex items-center justify-between">
                  <Label className="text-[11px] text-inbox-ink-muted">Has attachment</Label>
                  <Switch checked={Boolean(filters.hasAttachment)} onCheckedChange={(checked) => setFilters((p) => ({ ...p, hasAttachment: checked || undefined }))} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <Label className="text-[11px] text-inbox-ink-muted">From date</Label>
                    <Input type="date" value={filters.dateFrom || ""} onChange={(e) => setFilters((p) => ({ ...p, dateFrom: e.target.value || undefined }))} className="h-8 text-xs" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[11px] text-inbox-ink-muted">To date</Label>
                    <Input type="date" value={filters.dateTo || ""} onChange={(e) => setFilters((p) => ({ ...p, dateTo: e.target.value || undefined }))} className="h-8 text-xs" />
                  </div>
                </div>
                <div className="flex gap-2 pt-1">
                  <Button variant="ghost" size="sm" className="text-xs" onClick={() => setFilters({})}>Clear</Button>
                  <Button size="sm" className="text-xs">Apply</Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>

          <div className="h-4 w-px bg-inbox-border" />

          {/* View mode */}
          <ToggleGroup type="single" value={viewMode} onValueChange={(v) => v && setViewMode(v as ViewMode)} className="h-8">
            <ToggleGroupItem value="split" aria-label="Split" className="h-8 w-8 p-0 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">
              <LayoutPanelLeft className="h-3.5 w-3.5" />
            </ToggleGroupItem>
            <ToggleGroupItem value="list" aria-label="List" className="h-8 w-8 p-0 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">
              <LayoutList className="h-3.5 w-3.5" />
            </ToggleGroupItem>
            <ToggleGroupItem value="detail" aria-label="Detail" className="h-8 w-8 p-0 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">
              <LayoutPanelTop className="h-3.5 w-3.5" />
            </ToggleGroupItem>
          </ToggleGroup>

          {/* Density */}
          <ToggleGroup type="single" value={density} onValueChange={(v) => v && setDensity(v as Density)} className="h-8">
            <ToggleGroupItem value="compact" aria-label="Compact" className="h-8 w-8 p-0">
              <ArrowDownNarrowWide className="h-3.5 w-3.5" />
            </ToggleGroupItem>
            <ToggleGroupItem value="comfortable" aria-label="Comfortable" className="h-8 w-8 p-0">
              <ArrowDownNarrowWide className="h-3.5 w-3.5 rotate-180" />
            </ToggleGroupItem>
          </ToggleGroup>

          <div className="flex items-center gap-1.5 text-xs text-inbox-ink-muted">
            <Switch checked={threadedView} onCheckedChange={setThreadedView} id="threaded" className="scale-75" />
            <Label htmlFor="threaded" className="text-[11px] cursor-pointer">Threaded</Label>
          </div>

          {/* Sync details */}
          <div className="flex items-center gap-1.5 text-[11px] text-inbox-ink-subtle">
            <Badge variant="outline" className="text-[10px] border-inbox-border">
              {syncSummary?.status === "syncing" ? "Syncing" : "Healthy"}
            </Badge>
            <span>{syncLabel}</span>
          </div>

          {isWide && viewMode === "split" && (
            <Button variant="ghost" size="sm" className="h-8 gap-1 text-[11px] text-inbox-ink-muted" onClick={() => setContextOpen((p) => !p)}>
              {contextOpen ? <ChevronRight className="h-3 w-3" /> : <ChevronLeft className="h-3 w-3" />}
              {contextOpen ? "Hide context" : "Context"}
            </Button>
          )}

          <Button variant="ghost" size="sm" className="h-8 gap-1 text-[11px] text-inbox-ink-muted" onClick={() => setCommandOpen(true)}>
            <CommandIcon className="h-3 w-3" />
            <span className="hidden sm:inline">⌘K</span>
          </Button>
        </div>

        {filterChips.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {filterChips.map((chip) => (
              <Badge key={chip.label} variant="secondary" className="gap-1 rounded-full px-3 text-[11px]">
                {chip.label}
                <button type="button" onClick={chip.onRemove} className="rounded-full p-0.5 hover:bg-muted" aria-label={`Remove ${chip.label}`}>
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
      </div>

      {/* ── Tabs Bar ── */}
      <div className="flex items-center justify-between border-b border-inbox-border bg-inbox-surface-elevated px-6 py-1.5">
        <Tabs value={savedView} onValueChange={(v) => setSavedView(v as InboxSavedViewId)}>
          <TabsList className="h-8 bg-transparent p-0 gap-0">
            {savedViews.map((view) => (
              <TabsTrigger
                key={view.id} value={view.id}
                className="h-8 rounded-none border-b-2 border-transparent px-3 text-xs font-medium text-inbox-ink-muted data-[state=active]:border-primary data-[state=active]:text-inbox-ink data-[state=active]:shadow-none"
              >
                {view.label}
                {view.id === "unread" && unreadCount > 0 && (
                  <Badge className="ml-1.5 h-4 rounded-full bg-primary/10 text-primary border-0 px-1.5 text-[10px]">{unreadCount}</Badge>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <span className="text-[11px] text-inbox-ink-subtle tabular-nums">{listItems.length} conversation{listItems.length !== 1 ? "s" : ""}</span>
      </div>

      {/* ── Main Content ── */}
      <div className="flex-1 min-h-0">
        {emptyMailboxes ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center p-12">
            <InboxIcon className="h-10 w-10 text-inbox-ink-subtle/30" />
            <h3 className="text-lg font-semibold text-inbox-ink">Connect your first inbox</h3>
            <p className="text-sm text-inbox-ink-muted">Bring replies from Gmail, Outlook, or IMAP.</p>
            <Button className="mt-4">Connect mailbox</Button>
          </div>
        ) : effectiveViewMode === "split" ? (
          <ResizablePanelGroup direction="horizontal" className="h-full">
            <ResizablePanel defaultSize={32} minSize={24}>
              <InboxListPanel
                listData={listData} listBounds={listBounds} listContainerRef={listContainerRef}
                listRef={listRef} isLoading={isLoadingList} onItemsRendered={onItemsRendered}
                listItems={listItems} density={density} allSelected={allSelected} someSelected={someSelected}
                onSelectAll={handleSelectAll} selectedIds={selectedIds}
                onBulkAction={(action) => performBulkAction(action, Array.from(selectedIds))}
              />
            </ResizablePanel>
            <ResizableHandle className="bg-inbox-border w-px" />
            <ResizablePanel defaultSize={contextOpen ? 48 : 68} minSize={30}>
              <MessageDetailPanel
                message={selectedMessage} threadMessages={threadMessages}
                onReply={() => openComposer("reply", selectedMessage)}
                onReplyAll={() => openComposer("replyAll", selectedMessage)}
                onForward={() => openComposer("forward", selectedMessage)}
                onArchive={() => selectedMessageId && performBulkAction("archive", [selectedMessageId], "Archived")}
              />
            </ResizablePanel>
            {contextOpen && (
              <>
                <ResizableHandle className="bg-inbox-border w-px" />
                <ResizablePanel defaultSize={20} minSize={16} collapsible onCollapse={() => setContextOpen(false)}>
                  <ProspectPanel
                    message={selectedMessage} isSelectedStale={isSelectedStale}
                    pipelineDisabled={pipelineDisabled} pipelineStages={pipelineStages}
                    selectedPipelineStage={selectedPipelineStage} selectedPipelineStageId={selectedPipelineStageId}
                    campaignOptions={campaignOptions} campaignDraft={campaignDraft}
                    nextStepDraft={nextStepDraft} dealValueDraft={dealValueDraft}
                    onUpdateStage={updatePipelineStage} onCampaignChange={updateCampaign}
                    onNextStepChange={setNextStepDraft} onNextStepSave={updateNextStep}
                    onDealValueChange={setDealValueDraft} onDealValueSave={updateDealValue}
                    onCollapse={() => setContextOpen(false)}
                  />
                </ResizablePanel>
              </>
            )}
          </ResizablePanelGroup>
        ) : effectiveViewMode === "list" ? (
          <InboxListPanel
            listData={listData} listBounds={listBounds} listContainerRef={listContainerRef}
            listRef={listRef} isLoading={isLoadingList} onItemsRendered={onItemsRendered}
            listItems={listItems} density={density} allSelected={allSelected} someSelected={someSelected}
            onSelectAll={handleSelectAll} selectedIds={selectedIds}
            onBulkAction={(action) => performBulkAction(action, Array.from(selectedIds))}
          />
        ) : (
          <MessageDetailPanel
            message={selectedMessage} threadMessages={threadMessages}
            onReply={() => openComposer("reply", selectedMessage)}
            onReplyAll={() => openComposer("replyAll", selectedMessage)}
            onForward={() => openComposer("forward", selectedMessage)}
            onArchive={() => selectedMessageId && performBulkAction("archive", [selectedMessageId], "Archived")}
          />
        )}
      </div>

      {/* ── Mobile detail drawer ── */}
      {!isWide && (
        <Drawer open={mobileDetailOpen} onOpenChange={setMobileDetailOpen}>
          <DrawerContent className="h-[90vh]">
            <DrawerHeader className="border-b border-inbox-border">
              <DrawerTitle className="text-base font-semibold text-inbox-ink truncate">
                {selectedMessage?.subject || "Message"}
              </DrawerTitle>
              <DrawerClose asChild>
                <Button variant="ghost" size="icon" className="absolute right-4 top-4"><X className="h-4 w-4" /></Button>
              </DrawerClose>
            </DrawerHeader>
            <MessageDetailPanel
              message={selectedMessage} threadMessages={threadMessages} compact
              onReply={() => openComposer("reply", selectedMessage)}
              onReplyAll={() => openComposer("replyAll", selectedMessage)}
              onForward={() => openComposer("forward", selectedMessage)}
              onArchive={() => selectedMessageId && performBulkAction("archive", [selectedMessageId], "Archived")}
            />
          </DrawerContent>
        </Drawer>
      )}

      {/* ── Command Palette ── */}
      <CommandPalette
        open={commandOpen}
        onOpenChange={setCommandOpen}
        onSelect={(action) => {
          setCommandOpen(false);
          if (action === "compose") openComposer("compose");
          else if (action === "sync") syncMailbox(selectedMailboxId === ALL_INBOXES ? undefined : selectedMailboxId);
          else if (action === "archive" && selectedMessageId) performBulkAction("archive", [selectedMessageId], "Archived");
          else if (action === "split" || action === "list" || action === "detail") setViewMode(action);
          else if (action === "compact" || action === "comfortable") setDensity(action);
          else if (action === "threaded") setThreadedView((p) => !p);
        }}
      />

      {/* ── Composer Dialog ── */}
      <Dialog open={composeOpen} onOpenChange={(open) => { setComposeOpen(open); if (!open) resetComposerState(); }}>
        <DialogContent className="w-[min(96vw,640px)] max-h-[90vh] overflow-hidden border border-inbox-border bg-inbox-surface-elevated p-0 shadow-2xl">
          <DialogHeader className="px-6 pt-5 pb-3">
            <DialogTitle className="text-base font-semibold text-inbox-ink">
              {composerMode === "compose" ? "New message" : composerMode === "reply" ? "Reply" : composerMode === "replyAll" ? "Reply all" : "Forward"}
            </DialogTitle>
          </DialogHeader>

          <div className="max-h-[calc(90vh-160px)] overflow-y-auto px-6 pb-4 space-y-3">
            {composerMode === "compose" && mailboxes.length > 1 && (
              <div className="space-y-1.5">
                <Label className="text-[11px] text-inbox-ink-muted uppercase tracking-wider">From</Label>
                <Select value={composerConfigId} onValueChange={setComposerConfigId}>
                  <SelectTrigger className="h-9 text-sm border-inbox-border"><SelectValue placeholder="Select inbox" /></SelectTrigger>
                  <SelectContent>
                    {mailboxes.map((config) => (
                      <SelectItem key={config.id} value={config.id}>{buildMailboxLabel(config)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-[11px] text-inbox-ink-muted uppercase tracking-wider">To</Label>
              <Input value={composerTo} onChange={(e) => setComposerTo(e.target.value)} readOnly={composerMode === "reply" || composerMode === "replyAll"} className="h-9 text-sm border-inbox-border" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] text-inbox-ink-muted uppercase tracking-wider">Cc</Label>
              <Input value={composerCc} onChange={(e) => setComposerCc(e.target.value)} placeholder="Add Cc..." className="h-9 text-sm border-inbox-border" />
            </div>
            {(composerMode === "reply" || composerMode === "replyAll") && (
              <div className="space-y-1.5">
                <Label className="text-[11px] text-inbox-ink-muted uppercase tracking-wider">Bcc</Label>
                <Input value={composerBcc} onChange={(e) => setComposerBcc(e.target.value)} placeholder="Add Bcc..." className="h-9 text-sm border-inbox-border" />
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-[11px] text-inbox-ink-muted uppercase tracking-wider">Subject</Label>
              <Input value={composerSubject} onChange={(e) => setComposerSubject(e.target.value)} className="h-9 text-sm border-inbox-border" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] text-inbox-ink-muted uppercase tracking-wider">Message</Label>
              <Textarea
                value={composerBody} onChange={(e) => setComposerBody(e.target.value)} rows={8}
                placeholder={composerMode === "compose" ? "Write your message..." : "Write your reply..."}
                className="text-sm border-inbox-border resize-none"
              />
            </div>
            {composerQuotedText && (
              <div className="max-h-40 overflow-auto rounded-lg border border-inbox-border bg-inbox-surface p-3 text-xs text-inbox-ink-muted whitespace-pre-wrap font-mono">
                {composerQuotedText}
              </div>
            )}

            {/* Attachments */}
            {(composerMode === "reply" || composerMode === "replyAll" || composerMode === "compose") && (
              <div className="space-y-2">
                <Label className="text-[11px] text-inbox-ink-muted uppercase tracking-wider">Attachments</Label>
                <div className="flex flex-wrap items-center gap-2">
                  <input ref={composerFileInputRef} type="file" multiple className="hidden" onChange={handleComposerAttachmentChange} />
                  <Button variant="outline" size="sm" className="h-8 border-inbox-border text-xs" onClick={() => composerFileInputRef.current?.click()}>
                    <Paperclip className="mr-2 h-3.5 w-3.5" />
                    Add files
                  </Button>
                  {composerAttachments.length > 0 && (
                    <span className="text-[11px] text-inbox-ink-muted">{composerAttachments.length} attachment{composerAttachments.length === 1 ? "" : "s"}</span>
                  )}
                </div>
                {composerAttachments.length > 0 && (
                  <div className="space-y-2">
                    {composerAttachments.map((attachment) => (
                      <div key={attachment.id} className="flex items-center justify-between rounded-md border border-inbox-border bg-inbox-surface-elevated px-3 py-2 text-xs">
                        <div className="min-w-0">
                          <p className="truncate font-medium text-inbox-ink">{attachment.file.name}</p>
                          <p className="text-[11px] text-inbox-ink-muted">{formatBytes(attachment.file.size)}</p>
                        </div>
                        <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleRemoveComposerAttachment(attachment.id)}>
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {(composerMode === "reply" || composerMode === "replyAll") && composerIncludeOriginalAttachmentsAvailable && (
              <div className="rounded-lg border border-inbox-border bg-inbox-surface p-3 text-xs text-inbox-ink-muted">
                <div className="flex items-center gap-2">
                  <Checkbox checked={composerIncludeOriginalAttachments} onCheckedChange={(value) => setComposerIncludeOriginalAttachments(value === true)} />
                  <span>Include original attachments ({composerOriginalAttachments.length})</span>
                </div>
                {composerOriginalAttachments.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {composerOriginalAttachments.map((attachment, index) => (
                      <span key={`${attachment.filename || "attachment"}-${index}`} className="rounded-full border border-inbox-border bg-inbox-surface-elevated px-2 py-1 text-[11px]">
                        {attachment.filename || "attachment"}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {(composerMode === "reply" || composerMode === "replyAll") && composerThreadingLimited && (
              <p className="text-xs text-amber-700">This message is missing a Message-ID. Reply threading may be limited in Gmail or Outlook.</p>
            )}
          </div>

          <DialogFooter className="px-6 py-4 border-t border-inbox-border bg-inbox-surface">
            <Button variant="outline" size="sm" className="border-inbox-border" onClick={() => { setComposeOpen(false); resetComposerState(); }} disabled={composerSending}>
              Discard
            </Button>
            <Button
              size="sm" onClick={() => void handleSend()}
              className="gap-2 bg-inbox-ink text-inbox-surface-elevated hover:bg-inbox-ink/90 text-xs"
              disabled={composerLoadingDraft || composerSending || (composerMode === "compose" && !composerConfigId)}
            >
              <Send className="h-3.5 w-3.5" />
              {composerSending ? "Sending..." : composerMode === "reply" ? "Send reply" : composerMode === "replyAll" ? "Send reply all" : composerMode === "compose" ? "Send" : "Open in mail app"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// ═══════════════════════════════════════════════════════
// INBOX LIST PANEL
// ═══════════════════════════════════════════════════════
const InboxListPanel = ({
  listData, listBounds, listContainerRef, listRef, isLoading, onItemsRendered,
  listItems, density, allSelected, someSelected, onSelectAll, selectedIds, onBulkAction,
}: {
  listData: any;
  listBounds: { width: number; height: number };
  listContainerRef: React.RefObject<HTMLDivElement>;
  listRef: React.RefObject<List>;
  isLoading: boolean;
  onItemsRendered: (props: ListOnItemsRenderedProps) => void;
  listItems: ListItem[];
  density: Density;
  allSelected: boolean;
  someSelected: boolean;
  onSelectAll: (checked: boolean) => void;
  selectedIds: Set<string>;
  onBulkAction: (action: BulkAction) => void;
}) => {
  return (
    <div className="flex h-full flex-col bg-inbox-surface-elevated">
      {/* Bulk action bar */}
      <div className="flex items-center justify-between border-b border-inbox-border px-4 py-2 min-h-[40px]">
        <div className="flex items-center gap-2.5">
          <Checkbox
            checked={allSelected ? true : someSelected ? "indeterminate" : false}
            onCheckedChange={(v) => onSelectAll(v === true)}
            aria-label="Select all"
          />
          {selectedIds.size > 0 ? (
            <div className="flex items-center gap-1.5">
              <Badge className="rounded-full bg-primary/10 text-primary border-0 text-[10px] px-2">{selectedIds.size}</Badge>
              <Button size="sm" variant="ghost" className="h-7 text-[11px] px-2" onClick={() => onBulkAction("markRead")}>Read</Button>
              <Button size="sm" variant="ghost" className="h-7 text-[11px] px-2" onClick={() => onBulkAction("markUnread")}>Unread</Button>
              <Button size="sm" variant="ghost" className="h-7 text-[11px] px-2" onClick={() => onBulkAction("assign")}>Assign</Button>
              <Button size="sm" variant="ghost" className="h-7 text-[11px] px-2" onClick={() => onBulkAction("archive")}>Archive</Button>
            </div>
          ) : (
            <span className="text-[11px] text-inbox-ink-subtle flex items-center gap-1">
              <UserCheck className="h-3 w-3" />
              J/K to navigate
            </span>
          )}
        </div>
      </div>

      <div ref={listContainerRef} className="flex-1 min-h-0">
        {isLoading ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="space-y-2">
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-full" />
              </div>
            ))}
          </div>
        ) : listItems.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 py-20 text-center">
            <InboxIcon className="h-8 w-8 text-inbox-ink-subtle/50" />
            <p className="text-sm font-medium text-inbox-ink-muted">No messages found</p>
            <p className="text-xs text-inbox-ink-subtle">Try a different view or clear filters.</p>
          </div>
        ) : (
          <List
            ref={listRef}
            height={Math.max(listBounds.height, 240)}
            width={Math.max(listBounds.width, 1)}
            itemCount={listItems.length}
            itemData={listData}
            itemSize={densityConfig[density].rowHeight}
            onItemsRendered={onItemsRendered}
          >
            {InboxRow}
          </List>
        )}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════
// INBOX ROW (virtualized)
// ═══════════════════════════════════════════════════════
const InboxRow = ({ index, style, data }: any) => {
  const item: ListItem = data.items[index];
  const isSelected = data.selectedId === item.messageId;
  const isChecked = data.selectedIds.has(item.messageId);
  const isStarred = data.starredIds?.has(item.messageId);
  const compact = data.density === "compact";

  return (
    <div style={style} className="px-1">
      <div
        className={cn(
          "group relative flex items-start gap-3 px-4 cursor-pointer inbox-transition rounded-lg mx-1",
          compact ? "py-2.5" : "py-3.5",
          isSelected ? "bg-inbox-selected" : "hover:bg-inbox-hover",
        )}
        onClick={() => data.onSelect(item.messageId)}
      >
        {/* Active indicator */}
        {isSelected && (
          <motion.div
            layoutId="active-pill"
            className="absolute left-0 top-0 bottom-0 w-[3px] bg-inbox-active-pill rounded-r-full"
            transition={{ type: "spring", stiffness: 500, damping: 35 }}
          />
        )}

        {/* Checkbox */}
        <div className="pt-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
          <Checkbox
            checked={isChecked}
            onCheckedChange={(v) => data.onToggleSelect(item.messageId, v === true)}
            aria-label={`Select ${item.subject}`}
          />
        </div>

        {/* Avatar */}
        <Avatar className={cn("h-8 w-8 shrink-0 text-[11px] font-semibold", getAvatarColor(item.from))}>
          <AvatarFallback className={cn("text-[11px] font-semibold", getAvatarColor(item.from))}>
            {getInitials(item.from.split("@")[0])}
          </AvatarFallback>
        </Avatar>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              {!item.read && <span className="h-2 w-2 rounded-full bg-inbox-unread-dot shrink-0" />}
              <span className={cn("text-[13px] truncate", item.read ? "text-inbox-ink-muted font-medium" : "text-inbox-ink font-semibold")}>
                {item.from}
              </span>
              {item.needsReply && (
                <Badge className="shrink-0 rounded bg-amber-50 text-amber-700 border-amber-200 text-[9px] px-1.5 py-0 h-4 font-medium">Needs reply</Badge>
              )}
              {data.assignedIds?.has(item.messageId) && (
                <Badge variant="outline" className="shrink-0 text-[9px] px-1.5 py-0 h-4">Assigned</Badge>
              )}
            </div>
            <span className="text-[11px] tabular-nums text-inbox-ink-subtle shrink-0">
              {formatDistanceToNow(new Date(item.date), { addSuffix: false })}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className={cn("text-[12.5px] truncate", item.read ? "text-inbox-ink-muted" : "text-inbox-ink font-medium")}>
              {item.subject}
            </span>
            {item.threadCount > 1 && (
              <Badge variant="outline" className="shrink-0 text-[9px] px-1 py-0 h-4 rounded tabular-nums border-inbox-border">{item.threadCount}</Badge>
            )}
            {item.hasAttachment && <Paperclip className="h-3 w-3 text-inbox-ink-subtle shrink-0" />}
          </div>
          {!compact && (
            <p className="mt-0.5 text-[11.5px] text-inbox-ink-subtle truncate leading-relaxed">{item.preview}</p>
          )}
        </div>

        {/* Quick actions */}
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 pt-0.5" onClick={(e) => e.stopPropagation()}>
          <button className="p-1 rounded hover:bg-inbox-border transition-colors" onClick={() => data.onToggleStar(item.messageId)}>
            <Star className={cn("h-3.5 w-3.5", isStarred ? "fill-inbox-star text-inbox-star" : "text-inbox-ink-subtle")} />
          </button>
          <button className="p-1 rounded hover:bg-inbox-border transition-colors" onClick={() => data.onToggleRead(item.messageId, item.read)}>
            <Check className="h-3.5 w-3.5 text-inbox-ink-subtle" />
          </button>
          <button className="p-1 rounded hover:bg-inbox-border transition-colors" onClick={() => data.onArchive(item.messageId)}>
            <Archive className="h-3.5 w-3.5 text-inbox-ink-subtle" />
          </button>
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════
// MESSAGE DETAIL PANEL
// ═══════════════════════════════════════════════════════
const MessageDetailPanel = ({
  message, threadMessages, onReply, onReplyAll, onForward, onArchive, compact,
}: {
  message: EmailMessage | null;
  threadMessages: EmailMessage[];
  onReply: () => void;
  onReplyAll: () => void;
  onForward: () => void;
  onArchive: () => void;
  compact?: boolean;
}) => {
  const [showQuoted, setShowQuoted] = useState(false);

  useEffect(() => { setShowQuoted(false); }, [message?.id]);

  if (!message) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-inbox-surface text-center">
        <InboxIcon className="h-10 w-10 text-inbox-ink-subtle/30" />
        <p className="mt-4 text-sm font-medium text-inbox-ink-muted">Select a conversation</p>
        <p className="mt-1 text-xs text-inbox-ink-subtle">Use J/K to navigate</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-inbox-surface-elevated">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-inbox-border px-5 py-2.5 bg-inbox-toolbar">
        <div className="min-w-0 flex-1 mr-4">
          <h2 className="text-[15px] font-semibold text-inbox-ink truncate tracking-tight">
            {message.subject || "(No Subject)"}
          </h2>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[11px] text-inbox-ink-subtle tabular-nums">
              {format(new Date(message.date), "MMM d, yyyy 'at' h:mm a")}
            </span>
            {!message.read && (
              <Badge className="rounded bg-primary/10 text-primary border-0 text-[9px] px-1.5 py-0 h-4">Unread</Badge>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button size="sm" onClick={onReply} className="h-8 gap-1.5 bg-accent text-accent-foreground hover:bg-inbox-accent-hover text-xs">
            <Reply className="h-3.5 w-3.5" />
            Reply
          </Button>
          <Button size="sm" variant="outline" onClick={onReplyAll} className="h-8 gap-1.5 border-inbox-border text-xs">
            <ReplyAll className="h-3.5 w-3.5" />
            Reply all
          </Button>
          <Button size="sm" variant="outline" onClick={onForward} className="h-8 gap-1.5 border-inbox-border text-xs">
            <Forward className="h-3.5 w-3.5" />
            Forward
          </Button>
          <Button size="sm" variant="outline" onClick={onArchive} className="h-8 gap-1.5 border-inbox-border text-xs">
            <Archive className="h-3.5 w-3.5" />
            Archive
          </Button>
          <Button size="sm" variant="ghost" className="h-8 w-8 p-0">
            <MoreHorizontal className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Message body */}
      <ScrollArea className="flex-1 inbox-scrollbar">
        <div className="px-6 py-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={message.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.15, ease: [0.2, 0, 0, 1] }}
              className="max-w-3xl mx-auto space-y-6"
            >
              {threadMessages.map((msg, idx) => {
                const isLatest = idx === threadMessages.length - 1;
                const isSent = msg.from_email === msg.to_email ? false : !/inbox/i.test(msg.folder || "");
                const bodyContent = msg.body || "";
                const isHtml = looksLikeHtml(bodyContent);

                return (
                  <div
                    key={msg.id}
                    className={cn(
                      "rounded-xl border p-5",
                      isLatest ? "border-inbox-border bg-inbox-surface-elevated shadow-sm" : "border-inbox-border/50 bg-inbox-surface/50"
                    )}
                  >
                    {/* Sender header */}
                    <div className="flex items-start justify-between gap-3 mb-4">
                      <div className="flex items-center gap-3">
                        <Avatar className={cn("h-9 w-9 text-[11px] font-semibold", getAvatarColor(msg.from_email))}>
                          <AvatarFallback className={cn("text-[11px] font-semibold", getAvatarColor(msg.from_email))}>
                            {getInitials(msg.from_email.split("@")[0])}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-[13px] font-semibold text-inbox-ink">{msg.from_email}</span>
                            {msg.folder === "sent" && (
                              <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 border-inbox-border">You</Badge>
                            )}
                          </div>
                          <span className="text-[11px] text-inbox-ink-subtle">to {msg.to_email}</span>
                        </div>
                      </div>
                      <span className="text-[11px] text-inbox-ink-subtle tabular-nums shrink-0">
                        {format(new Date(msg.date), "MMM d, h:mm a")}
                      </span>
                    </div>

                    {/* Body */}
                    {isHtml ? (
                      <div
                        className="text-[13.5px] text-inbox-ink leading-relaxed tracking-[-0.01em] prose prose-sm max-w-none"
                        dangerouslySetInnerHTML={{ __html: sanitizeEmailHtml(bodyContent) }}
                      />
                    ) : (
                      <div className="text-[13.5px] text-inbox-ink leading-relaxed whitespace-pre-wrap tracking-[-0.01em]">
                        {extractPlainText(bodyContent)}
                      </div>
                    )}

                    {/* Attachment indicator */}
                    {/(attach|attachment|attached)/i.test(bodyContent) && (
                      <div className="mt-4 flex items-center gap-2 rounded-lg border border-inbox-border bg-inbox-surface px-3 py-2">
                        <Paperclip className="h-3.5 w-3.5 text-inbox-ink-subtle" />
                        <span className="text-[11px] text-inbox-ink-muted">Attachment referenced</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </motion.div>
          </AnimatePresence>
        </div>
      </ScrollArea>

      {/* Inline reply box */}
      <InlineReplyBox message={message} onReply={onReply} onReplyAll={onReplyAll} onForward={onForward} />
    </div>
  );
};

// ═══════════════════════════════════════════════════════
// INLINE REPLY BOX
// ═══════════════════════════════════════════════════════
const InlineReplyBox: React.FC<{
  message: EmailMessage;
  onReply: () => void;
  onReplyAll: () => void;
  onForward: () => void;
}> = ({ message, onReply }) => {
  const [text, setText] = useState("");
  const [focused, setFocused] = useState(false);

  return (
    <div className="border-t border-inbox-border bg-inbox-toolbar p-4">
      <div className={cn(
        "max-w-3xl mx-auto rounded-xl border overflow-hidden inbox-transition",
        focused ? "border-inbox-border-focus ring-2 ring-primary/10 shadow-sm" : "border-inbox-border"
      )}>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={`Reply to ${message.from_email}...`}
          className="w-full bg-inbox-surface-elevated px-4 py-3 text-[13px] outline-none resize-none min-h-[80px] placeholder:text-inbox-ink-subtle"
          rows={3}
        />
        <div className="flex items-center justify-between px-4 py-2.5 bg-inbox-surface border-t border-inbox-border">
          <div className="flex items-center gap-1">
            <button className="p-1.5 rounded hover:bg-inbox-border transition-colors">
              <Paperclip className="h-4 w-4 text-inbox-ink-subtle" />
            </button>
          </div>
          <Button
            size="sm"
            className="h-8 gap-2 bg-inbox-ink text-inbox-surface-elevated hover:bg-inbox-ink/90 text-xs"
            disabled={!text.trim()}
            onClick={() => { if (text.trim()) onReply(); }}
          >
            <Send className="h-3.5 w-3.5" />
            Send
          </Button>
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════
// PROSPECT PANEL
// ═══════════════════════════════════════════════════════
const ProspectPanel = ({
  message, isSelectedStale, pipelineDisabled, pipelineStages, selectedPipelineStage,
  selectedPipelineStageId, campaignOptions, campaignDraft, nextStepDraft, dealValueDraft,
  onUpdateStage, onCampaignChange, onNextStepChange, onNextStepSave, onDealValueChange,
  onDealValueSave, onCollapse,
}: {
  message: EmailMessage | null;
  isSelectedStale: boolean;
  pipelineDisabled: boolean;
  pipelineStages: DbPipelineStage[];
  selectedPipelineStage?: DbPipelineStage;
  selectedPipelineStageId: string;
  campaignOptions: { id: string; name: string }[];
  campaignDraft: string;
  nextStepDraft: string;
  dealValueDraft: string;
  onUpdateStage: (value: string) => void;
  onCampaignChange: (value: string) => void;
  onNextStepChange: (value: string) => void;
  onNextStepSave: (value: string) => void;
  onDealValueChange: (value: string) => void;
  onDealValueSave: (value: string) => void;
  onCollapse: () => void;
}) => {
  if (!message) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-inbox-surface text-center px-4">
        <InboxIcon className="h-8 w-8 text-inbox-ink-subtle/30" />
        <p className="mt-3 text-xs font-medium text-inbox-ink-muted">Select a conversation</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-inbox-surface">
      <div className="flex items-center justify-between border-b border-inbox-border px-4 py-3 bg-inbox-toolbar">
        <div>
          <h3 className="text-[13px] font-semibold text-inbox-ink">Prospect pipeline</h3>
          <p className="text-[11px] text-inbox-ink-subtle">Track lifecycle & stage</p>
        </div>
        <div className="flex items-center gap-2">
          {isSelectedStale && (
            <Badge className="bg-amber-50 text-amber-700 border-amber-200 text-[9px] px-1.5 py-0 h-4 font-medium uppercase">Stale</Badge>
          )}
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onCollapse}>
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1 inbox-scrollbar">
        <div className="p-4 space-y-4">
          {/* Lifecycle card */}
          <div className="rounded-lg border border-inbox-border bg-inbox-surface-elevated p-3 space-y-2">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-inbox-ink-subtle">Lifecycle</span>
              <Badge className="rounded bg-accent/10 text-accent border-0 text-[9px] px-1.5 py-0 h-4 font-medium">Replied</Badge>
            </div>
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-inbox-ink-subtle">Last activity</span>
              <span className="text-inbox-ink-muted tabular-nums">{formatDistanceToNow(new Date(message.date), { addSuffix: true })}</span>
            </div>
          </div>

          {/* Pipeline stage */}
          <div className="space-y-1.5">
            <Label className="text-[11px] text-inbox-ink-subtle">Pipeline stage</Label>
            <Select value={selectedPipelineStageId || "none"} onValueChange={(v) => onUpdateStage(v === "none" ? "" : v)} disabled={pipelineDisabled}>
              <SelectTrigger className="h-8 text-xs border-inbox-border bg-inbox-surface-elevated"><SelectValue placeholder="Not in pipeline" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Not in pipeline</SelectItem>
                {pipelineStages.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
            {selectedPipelineStage && <p className="text-[11px] text-inbox-ink-subtle">{selectedPipelineStage.description}</p>}
          </div>

          {/* Campaign */}
          <div className="space-y-1.5">
            <Label className="text-[11px] text-inbox-ink-subtle">Campaign</Label>
            <Select value={campaignDraft || "none"} onValueChange={(v) => onCampaignChange(v === "none" ? "" : v)} disabled={pipelineDisabled}>
              <SelectTrigger className="h-8 text-xs border-inbox-border bg-inbox-surface-elevated"><SelectValue placeholder="No campaign" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No campaign</SelectItem>
                {campaignOptions.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Next step */}
          <div className="space-y-1.5">
            <Label className="text-[11px] text-inbox-ink-subtle">Next step</Label>
            <Input
              value={nextStepDraft} onChange={(e) => onNextStepChange(e.target.value)}
              onBlur={() => onNextStepSave(nextStepDraft)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onNextStepSave(nextStepDraft); } }}
              placeholder="e.g., Send pricing deck"
              className="h-8 text-xs border-inbox-border bg-inbox-surface-elevated"
              disabled={pipelineDisabled}
            />
          </div>

          {/* Deal value */}
          <div className="space-y-1.5">
            <Label className="text-[11px] text-inbox-ink-subtle">Deal value</Label>
            <Input
              value={dealValueDraft} onChange={(e) => onDealValueChange(e.target.value)}
              onBlur={() => onDealValueSave(dealValueDraft)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onDealValueSave(dealValueDraft); } }}
              placeholder="e.g., 12000"
              className="h-8 text-xs border-inbox-border bg-inbox-surface-elevated"
              disabled={pipelineDisabled}
            />
            <p className="text-[10px] text-inbox-ink-subtle">Auto-filled from proposal emails when available.</p>
          </div>

          {/* Quick actions */}
          <div className="rounded-lg border border-inbox-border bg-inbox-surface-elevated p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-inbox-ink-subtle mb-2">Quick actions</p>
            <div className="grid grid-cols-2 gap-1.5">
              <Button variant="outline" size="sm" className="h-7 text-[11px] border-inbox-border" onClick={() => onUpdateStage("qualified")} disabled={pipelineDisabled}>Interested</Button>
              <Button variant="outline" size="sm" className="h-7 text-[11px] border-inbox-border" onClick={() => onUpdateStage("meeting-booked")} disabled={pipelineDisabled}>Meeting</Button>
              <Button variant="outline" size="sm" className="h-7 text-[11px] border-inbox-border" onClick={() => onUpdateStage("closed-lost")} disabled={pipelineDisabled}>Not interested</Button>
              <Button variant="outline" size="sm" className="h-7 text-[11px] border-inbox-border" onClick={() => onNextStepSave("Follow up next week")} disabled={pipelineDisabled}>Snooze</Button>
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
};

// ═══════════════════════════════════════════════════════
// COMMAND PALETTE
// ═══════════════════════════════════════════════════════
const CommandPalette = ({ open, onOpenChange, onSelect }: { open: boolean; onOpenChange: (open: boolean) => void; onSelect: (action: string) => void }) => {
  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Search actions..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Create">
          <CommandItem onSelect={() => onSelect("compose")}><MailPlus className="mr-2 h-4 w-4" />Compose<CommandShortcut>⌘C</CommandShortcut></CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="View">
          <CommandItem onSelect={() => onSelect("split")}><LayoutPanelLeft className="mr-2 h-4 w-4" />Split view</CommandItem>
          <CommandItem onSelect={() => onSelect("list")}><LayoutList className="mr-2 h-4 w-4" />List only</CommandItem>
          <CommandItem onSelect={() => onSelect("detail")}><LayoutPanelTop className="mr-2 h-4 w-4" />Detail only</CommandItem>
          <CommandItem onSelect={() => onSelect("compact")}><ArrowDownNarrowWide className="mr-2 h-4 w-4" />Compact density</CommandItem>
          <CommandItem onSelect={() => onSelect("comfortable")}><ArrowDownNarrowWide className="mr-2 h-4 w-4" />Comfortable density</CommandItem>
          <CommandItem onSelect={() => onSelect("threaded")}><Tag className="mr-2 h-4 w-4" />Toggle threaded</CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Actions">
          <CommandItem onSelect={() => onSelect("sync")}><RefreshCw className="mr-2 h-4 w-4" />Sync inbox</CommandItem>
          <CommandItem onSelect={() => onSelect("archive")}><Archive className="mr-2 h-4 w-4" />Archive selected</CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
};

export default InboxPage;

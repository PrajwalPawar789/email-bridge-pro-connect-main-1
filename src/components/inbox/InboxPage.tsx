
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

const DEFAULT_MAILBOX_SYNC_URL = "http://localhost:8787/sync-mailbox";
const MAILBOX_SYNC_URL =
  import.meta.env.VITE_MAILBOX_SYNC_URL || DEFAULT_MAILBOX_SYNC_URL;

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
  const blockedTags = [
    "script",
    "style",
    "iframe",
    "object",
    "embed",
    "link",
    "meta",
    "base",
  ];

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
        if (
          trimmed.startsWith("javascript:") ||
          trimmed.startsWith("data:text/html")
        ) {
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
  (subject || "(No Subject)")
    .replace(/^(re|fwd|fw):/gi, "")
    .trim()
    .toLowerCase();

const buildThreadKey = (message: EmailMessage) =>
  `${normalizeSubject(message.subject)}::${message.from_email}`;

const getInitials = (value: string) =>
  value
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

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
  const quoted = plain
    .split(/\r?\n/)
    .map((line) => `> ${line}`)
    .join("\n");
  return `\n\nOn ${dateLabel}, ${email.from_email} wrote:\n${quoted}`;
};

const buildForwardBody = (email: EmailMessage) => {
  const plain = extractPlainText(email.body || "");
  const dateLabel = new Date(email.date).toLocaleString();
  const subject = email.subject || "(No Subject)";
  const toEmail = email.to_email || "";
  return `\n\n---------- Forwarded message ----------\nFrom: ${email.from_email}\nDate: ${dateLabel}\nSubject: ${subject}\nTo: ${toEmail}\n\n${plain}`;
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
  compact: { rowHeight: 64, padding: "py-2" },
  comfortable: { rowHeight: 84, padding: "py-3" },
};

const buildMailboxLabel = (config: MailboxConfig) =>
  config.display_name || config.smtp_username || config.imap_username || "Inbox";

// Aesthetic-usability effect: soft surfaces + consistent depth reduce perceived complexity.
const inboxAccentClasses =
  "bg-white/80 border border-slate-200 shadow-[0_12px_40px_-28px_rgba(15,23,42,0.45)]";

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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [contextOpen, setContextOpen] = useState(true);
  const [commandOpen, setCommandOpen] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [composerMode, setComposerMode] = useState<ComposerMode>("compose");
  const [composerTo, setComposerTo] = useState("");
  const [composerCc, setComposerCc] = useState("");
  const [composerSubject, setComposerSubject] = useState("");
  const [composerBody, setComposerBody] = useState("");
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
  const listRef = useRef<List>(null);
  const { ref: listContainerRef, bounds: listBounds } = useMeasure<HTMLDivElement>();
  const debouncedSearch = useDebounce(searchQuery, 300);

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
    return () => {
      active = false;
    };
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
      if (error) {
        console.error("Failed to load campaigns", error);
        return;
      }
      setCampaignOptions(data || []);
    };
    loadCampaigns();
    return () => {
      active = false;
    };
  }, [user?.id]);

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
    return mailboxes
      .map((config) => config.id)
      .filter(Boolean)
      .filter((id) => !excludedMailboxIds.includes(id));
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

  const mailboxScopeKey =
    selectedMailboxId === ALL_INBOXES
      ? `all:${includedMailboxIds.join(",")}`
      : selectedMailboxId;

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
        .range(pageParam * PAGE_SIZE, pageParam * PAGE_SIZE + PAGE_SIZE - 1);

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
        query = query.or(
          `subject.ilike.*${safe}*,from_email.ilike.*${safe}*`
        );
      }

      const { data, error } = await query;
      if (error) throw error;

      return {
        data: (data || []) as EmailMessage[],
        nextPage: (data || []).length === PAGE_SIZE ? pageParam + 1 : undefined,
      };
    },
    getNextPageParam: (lastPage) => lastPage.nextPage,
  });

  const messages = useMemo(
    () => messagesQuery.data?.pages.flatMap((page) => page.data) ?? [],
    [messagesQuery.data]
  );

  const unreadCount = useMemo(
    () => messages.filter((message) => !message.read).length,
    [messages]
  );
  const filteredMessages = useMemo(() => {
    return messages.filter((message) => {
      if (savedView === "unread" && message.read) {
        return false;
      }

      if (savedView === "needsReply") {
        const needsReply = !message.read && !/^re:/i.test(message.subject || "");
        if (!needsReply) return false;
      }

      if (savedView === "assigned") {
        return assignedIds.has(message.id);
      }

      if (savedView === "starred" && !starredIds.has(message.id)) {
        return false;
      }

      if (filters.from) {
        if (!message.from_email.toLowerCase().includes(filters.from.toLowerCase())) {
          return false;
        }
      }

      if (filters.subject) {
        if (!(message.subject || "").toLowerCase().includes(filters.subject.toLowerCase())) {
          return false;
        }
      }

      if (filters.hasAttachment) {
        const hasAttachment = /(attach|attachment|attached)/i.test(message.body || "");
        if (!hasAttachment) return false;
      }

      if (filters.dateFrom) {
        if (new Date(message.date) < new Date(filters.dateFrom)) return false;
      }

      if (filters.dateTo) {
        if (new Date(message.date) > new Date(filters.dateTo)) return false;
      }

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
      const sorted = [...items].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      );
      return { threadKey, latest: sorted[0], messages: sorted };
    });
  }, [filteredMessages]);

  const listItems = useMemo<ListItem[]>(() => {
    if (threadedView) {
      return threads
        .sort(
          (a, b) =>
            new Date(b.latest.date).getTime() - new Date(a.latest.date).getTime()
        )
        .map((thread) => ({
          id: thread.threadKey,
          messageId: thread.latest.id,
          threadKey: thread.threadKey,
          subject: thread.latest.subject || "(No Subject)",
          from: thread.latest.from_email,
          preview: buildPreviewText(thread.latest.body),
          date: thread.latest.date,
          read: Boolean(thread.latest.read),
          hasAttachment: /(attach|attachment|attached)/i.test(
            thread.latest.body || ""
          ),
          threadCount: thread.messages.length,
          mailboxId: thread.latest.config_id,
          needsReply:
            !thread.latest.read && !/^re:/i.test(thread.latest.subject || ""),
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

  const selectedMessage = useMemo(() => {
    return messages.find((message) => message.id === selectedMessageId) || null;
  }, [messages, selectedMessageId]);

  const threadMessages = useMemo(() => {
    if (!selectedMessage) return [];
    const thread = threads.find((item) => item.threadKey === buildThreadKey(selectedMessage));
    return thread?.messages ?? [selectedMessage];
  }, [selectedMessage, threads]);

  useEffect(() => {
    if (!selectedMessage || !pipelineId) {
      setSelectedOpportunity(null);
      return;
    }
    let active = true;
    const loadOpportunity = async () => {
      try {
        const opportunity = await findOpportunityByEmail(pipelineId, selectedMessage.from_email);
        if (active) setSelectedOpportunity(opportunity);
      } catch (error) {
        console.error("Failed to load opportunity", error);
      }
    };
    loadOpportunity();
    return () => {
      active = false;
    };
  }, [selectedMessage, pipelineId]);

  useEffect(() => {
    setNextStepDraft(selectedOpportunity?.next_step || "");
  }, [selectedOpportunity]);

  useEffect(() => {
    const value = selectedOpportunity?.value;
    setDealValueDraft(value == null ? "" : String(value));
  }, [selectedOpportunity]);

  useEffect(() => {
    setCampaignDraft(selectedOpportunity?.campaign_id || "");
  }, [selectedOpportunity]);

  useEffect(() => {
    if (selectedOpportunity) return;
    if (!selectedMessage) {
      setCampaignDraft("");
      return;
    }
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
      if (campaignId) {
        setCampaignDraft(campaignId);
      }
    };
    fetchSuggestedCampaign();
    return () => {
      active = false;
    };
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
    const { data: recipientData } = await supabase
      .from("recipients")
      .select("name, campaign_id")
      .eq("email", email)
      .limit(1);

    const { data: prospectData } = await supabase
      .from("prospects")
      .select("name, company")
      .eq("email", email)
      .limit(1);

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

      const details = await resolveContactDetails(selectedMessage.from_email);
      const created = await createOpportunity({
        userId: user.id,
        pipelineId,
        stageId,
        status,
        contactName: details.contactName,
        contactEmail: selectedMessage.from_email,
        company: details.company,
        owner: "",
        nextStep: "",
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
      console.error("Failed to update pipeline stage", error);
    } finally {
      setPipelineBusy(false);
    }
  };

  const updateNextStep = async (value: string) => {
    if (!selectedMessage || !pipelineId || !user?.id) return;
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
      console.error("Failed to update next step", error);
    } finally {
      setPipelineBusy(false);
    }
  };

  const updateDealValue = async (value: string) => {
    if (!selectedMessage || !pipelineId || !user?.id) return;
    if (!selectedOpportunity) {
      toast({
        title: "Select a pipeline stage first",
        description: "Add this reply to a pipeline stage before setting a value.",
      });
      return;
    }
    const parsed = value ? Number(value.replace(/,/g, "")) : null;
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
      console.error("Failed to update value", error);
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
      console.error("Failed to update campaign", error);
    }
  };

  useEffect(() => {
    if (listItems.length === 0) {
      setSelectedMessageId(null);
      return;
    }
    if (!selectedMessageId || !listItems.some((item) => item.messageId === selectedMessageId)) {
      setSelectedMessageId(listItems[0].messageId);
    }
  }, [listItems, selectedMessageId]);

  useEffect(() => {
    if (selectedIndex >= 0 && listRef.current) {
      listRef.current.scrollToItem(selectedIndex, "smart");
    }
  }, [selectedIndex]);

  useEffect(() => {
    if (!mailboxes.length) return;
    if (selectedMailboxId !== ALL_INBOXES && mailboxes.some((box) => box.id === selectedMailboxId)) {
      return;
    }
    setSelectedMailboxId(mailboxes.length > 1 ? ALL_INBOXES : mailboxes[0].id);
  }, [mailboxes, selectedMailboxId]);

  useEffect(() => {
    if (!isWide) {
      setContextOpen(false);
    }
  }, [isWide]);

  useEffect(() => {
    if (!selectedMessageId) return;
    if (!isWide) {
      setMobileDetailOpen(true);
    }
  }, [selectedMessageId, isWide]);

  const updateCachedMessages = useCallback(
    (
      updater: (message: EmailMessage) => EmailMessage | null,
      queryKey: Array<string | number | undefined>
    ) => {
      queryClient.setQueryData<InfiniteData<MessagesPage>>(queryKey, (old) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            data: page.data
              .map((message) => updater(message))
              .filter((message): message is EmailMessage => Boolean(message)),
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
        const { error } = await supabase
          .from("email_messages")
          .update({ folder: "archive" })
          .in("id", ids);
        if (error) throw error;
      }

      if (action === "markRead") {
        const { error } = await supabase
          .from("email_messages")
          .update({ read: true })
          .in("id", ids);
        if (error) throw error;
      }

      if (action === "markUnread") {
        const { error } = await supabase
          .from("email_messages")
          .update({ read: false })
          .in("id", ids);
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
        toast({
          title: "Assigned",
          description: ids.length > 1 ? `${ids.length} conversations assigned to you.` : "Conversation assigned to you.",
        });
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

      bulkActionMutation.mutate(
        { ids, action },
        {
          onError: () => {
            if (previous) queryClient.setQueryData(messagesQueryKey, previous);
            toast({
              title: "Action failed",
              description: "We could not update those messages.",
              variant: "destructive",
            });
          },
        }
      );

      toast({
        title: undoMessage || "Updated",
        description: ids.length > 1 ? `${ids.length} items updated` : "1 item updated",
        action: (
          <ToastAction
            altText="Undo"
            onClick={() => {
              if (previous) queryClient.setQueryData(messagesQueryKey, previous);
            }}
          >
            Undo
          </ToastAction>
        ),
      });
      setSelectedIds(new Set());
    },
    [bulkActionMutation, messagesQueryKey, queryClient, updateCachedMessages]
  );

  const handleSelectMessage = (messageId: string) => {
    setSelectedMessageId(messageId);
  };

  const toggleStar = (messageId: string) => {
    setStarredIds((prev) => {
      const next = new Set(prev);
      if (next.has(messageId)) next.delete(messageId);
      else next.add(messageId);
      return next;
    });
  };

  const handleSelectAll = (checked: boolean) => {
    if (!checked) {
      setSelectedIds(new Set());
      return;
    }
    const next = new Set(listItems.map((item) => item.messageId));
    setSelectedIds(next);
  };

  const handleSelectMessageToggle = (messageId: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(messageId);
      else next.delete(messageId);
      return next;
    });
  };
  const openComposer = useCallback((mode: ComposerMode, message?: EmailMessage | null) => {
    setComposerMode(mode);
    if (mode === "compose" || !message) {
      setComposerTo("");
      setComposerCc("");
      setComposerSubject("");
      setComposerBody("");
    } else if (mode === "reply" || mode === "replyAll") {
      setComposerTo(message.from_email);
      setComposerCc("");
      setComposerSubject(buildReplySubject(message.subject));
      setComposerBody(buildReplyBody(message));
    } else if (mode === "forward") {
      setComposerTo("");
      setComposerCc("");
      setComposerSubject(buildForwardSubject(message.subject));
      setComposerBody(buildForwardBody(message));
    }

    setComposeOpen(true);
  }, []);

  const handleKeyboardShortcut = useCallback(
    (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable;

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen(true);
        return;
      }

      if (event.key === "/" && !isTyping) {
        event.preventDefault();
        searchInputRef.current?.focus();
        return;
      }

      if (isTyping) return;

      if (event.key.toLowerCase() === "j") {
        event.preventDefault();
        const nextIndex = Math.min(listItems.length - 1, selectedIndex + 1);
        if (listItems[nextIndex]) {
          setSelectedMessageId(listItems[nextIndex].messageId);
        }
      }

      if (event.key.toLowerCase() === "k") {
        event.preventDefault();
        const prevIndex = Math.max(0, selectedIndex - 1);
        if (listItems[prevIndex]) {
          setSelectedMessageId(listItems[prevIndex].messageId);
        }
      }

      if (event.key.toLowerCase() === "r" && selectedMessageId) {
        event.preventDefault();
        openComposer("reply", selectedMessage);
      }

      if (event.key.toLowerCase() === "a" && selectedMessageId) {
        event.preventDefault();
        performBulkAction("archive", [selectedMessageId], "Archived");
      }

      if (event.key.toLowerCase() === "f" && selectedMessageId) {
        event.preventDefault();
        openComposer("forward", selectedMessage);
      }

      if (event.key.toLowerCase() === "e" && selectedMessageId) {
        event.preventDefault();
        performBulkAction("archive", [selectedMessageId], "Archived");
      }

      if (event.key === "Escape" && mobileDetailOpen) {
        event.preventDefault();
        setMobileDetailOpen(false);
      }
    },
    [
      listItems,
      selectedIndex,
      selectedMessageId,
      selectedMessage,
      performBulkAction,
      openComposer,
      mobileDetailOpen,
    ]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyboardShortcut);
    return () => window.removeEventListener("keydown", handleKeyboardShortcut);
  }, [handleKeyboardShortcut]);

  const handleSend = useCallback(() => {
    setComposeOpen(false);
    // Peak-End rule: positive completion moment + undo option.
    toast({
      title: "Sent",
      description: "Message delivered. Undo send is available for 10 seconds.",
      action: (
        <ToastAction
          altText="Undo send"
          onClick={() =>
            toast({
              title: "Send canceled",
              description: "Message moved back to drafts.",
            })
          }
        >
          Undo send
        </ToastAction>
      ),
    });
  }, []);

  useEffect(() => {
    const handleComposerKeys = (event: KeyboardEvent) => {
      if (!composeOpen) return;
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        handleSend();
      }
    };
    window.addEventListener("keydown", handleComposerKeys);
    return () => window.removeEventListener("keydown", handleComposerKeys);
  }, [composeOpen, handleSend]);

  const triggerMailboxSync = async (configId: string, accessToken: string) => {
    const response = await fetch(MAILBOX_SYNC_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ configId, limit: 50 }),
    });

    let payload: any = null;
    try {
      payload = await response.json();
    } catch (error) {
      payload = null;
    }

    if (!response.ok || payload?.success === false) {
      throw new Error(payload?.error || "Sync failed");
    }

    return payload;
  };

  const syncMailbox = async (mailboxId?: string) => {
    const targetIds = mailboxId
      ? [mailboxId]
      : selectedMailboxId === ALL_INBOXES
        ? includedMailboxIds
        : mailboxes.map((config) => config.id).filter(Boolean);

    if (targetIds.length === 0) {
      toast({
        title: "No inboxes selected",
        description: "Choose at least one inbox to sync.",
      });
      return;
    }

    setSyncState((prev) => {
      const next = { ...prev };
      if (!mailboxId) {
        next.all = {
          status: "syncing",
          lastSyncedAt: prev.all?.lastSyncedAt,
          error: undefined,
        };
      }
      for (const id of targetIds) {
        next[id] = {
          status: "syncing",
          lastSyncedAt: prev[id]?.lastSyncedAt,
          error: undefined,
        };
      }
      return next;
    });

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Not authenticated");

      let successCount = 0;
      let errorCount = 0;

      for (const id of targetIds) {
        try {
          await triggerMailboxSync(id, session.access_token);
          successCount += 1;
          setSyncState((prev) => ({
            ...prev,
            [id]: { status: "success", lastSyncedAt: new Date().toISOString(), error: undefined },
          }));
        } catch (error: any) {
          errorCount += 1;
          setSyncState((prev) => ({
            ...prev,
            [id]: {
              status: "error",
              lastSyncedAt: prev[id]?.lastSyncedAt,
              error: error?.message || "Sync failed",
            },
          }));
        }
      }

      if (!mailboxId) {
        const now = new Date().toISOString();
        setSyncState((prev) => ({
          ...prev,
          all: {
            status: errorCount ? "error" : "success",
            lastSyncedAt: now,
            error: errorCount
              ? `${errorCount} mailbox${errorCount === 1 ? "" : "es"} failed`
              : undefined,
          },
        }));
      }

      if (successCount > 0) {
        messagesQuery.refetch();
      }

      if (errorCount === 0) {
        toast({
          title: "Synced",
          description: mailboxId
            ? "Inbox is up to date."
            : `Synced ${successCount} mailbox${successCount === 1 ? "" : "es"}.`,
        });
      } else if (successCount > 0) {
        toast({
          title: "Sync completed with errors",
          description: `${errorCount} mailbox${errorCount === 1 ? "" : "es"} failed.`,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Sync failed",
          description: "All mailbox syncs failed. Try again in a moment.",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      const message = error?.message || "Try again in a moment.";
      setSyncState((prev) => {
        const next = { ...prev };
        if (!mailboxId) {
          next.all = {
            status: "error",
            lastSyncedAt: prev.all?.lastSyncedAt,
            error: message,
          };
        }
        for (const id of targetIds) {
          next[id] = {
            status: "error",
            lastSyncedAt: prev[id]?.lastSyncedAt,
            error: message,
          };
        }
        return next;
      });

      // Nielsen: helpful error messages with next-step guidance.
      toast({
        title: "Sync failed",
        description: message,
        variant: "destructive",
      });
    }
  };

  const onItemsRendered = ({ visibleStopIndex }: ListOnItemsRenderedProps) => {
    if (messagesQuery.hasNextPage && !messagesQuery.isFetchingNextPage) {
      if (visibleStopIndex >= listItems.length - 8) {
        messagesQuery.fetchNextPage();
      }
    }
  };

  const listData = useMemo(
    () => ({
      items: listItems,
      selectedId: selectedMessageId,
      density,
      selectedIds,
      onSelect: handleSelectMessage,
      onToggleSelect: handleSelectMessageToggle,
      onArchive: (id: string) => performBulkAction("archive", [id], "Archived"),
      onToggleRead: (id: string, isRead: boolean) =>
        performBulkAction(isRead ? "markUnread" : "markRead", [id]),
      onToggleStar: toggleStar,
      starredIds,
      assignedIds,
    }),
    [
      listItems,
      selectedMessageId,
      density,
      selectedIds,
      handleSelectMessage,
      performBulkAction,
      toggleStar,
      starredIds,
      assignedIds,
    ]
  );

  const allSelected = selectedIds.size > 0 && selectedIds.size === listItems.length;
  const someSelected = selectedIds.size > 0 && selectedIds.size < listItems.length;

  const filterChips = useMemo(() => {
    const chips: Array<{ label: string; onRemove: () => void }> = [];

    if (filters.from) {
      chips.push({
        label: `From: ${filters.from}`,
        onRemove: () => setFilters((prev) => ({ ...prev, from: undefined })),
      });
    }

    if (filters.subject) {
      chips.push({
        label: `Subject: ${filters.subject}`,
        onRemove: () => setFilters((prev) => ({ ...prev, subject: undefined })),
      });
    }

    if (filters.hasAttachment) {
      chips.push({
        label: "Has attachment",
        onRemove: () => setFilters((prev) => ({ ...prev, hasAttachment: undefined })),
      });
    }

    if (filters.dateFrom || filters.dateTo) {
      chips.push({
        label: `Date: ${filters.dateFrom || "Any"} ? ${filters.dateTo || "Any"}`,
        onRemove: () => setFilters((prev) => ({ ...prev, dateFrom: undefined, dateTo: undefined })),
      });
    }

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

  return (
    <div className="flex flex-col gap-6">
      {/* Nielsen: visibility of system status via sync banner + unread count */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Inbox</h1>
            <Badge variant="secondary" className="rounded-full px-3 text-xs">
              {unreadCount} unread
            </Badge>
          </div>
          <p className="mt-1 text-sm text-slate-600">
            Triage conversations across every workspace and mailbox.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Von Restorff + Fitts: primary action is distinct, large, and near top-right */}
          <Button onClick={() => openComposer("compose")} className="gap-2">
            <MailPlus className="h-4 w-4" />
            Compose
          </Button>
          <Button
            variant="outline"
            onClick={() => syncMailbox(selectedMailboxId === ALL_INBOXES ? undefined : selectedMailboxId)}
            disabled={isSyncingSelection}
            className="gap-2"
          >
            <RefreshCw className={cn("h-4 w-4", isSyncingSelection && "animate-spin")} />
            {isSyncingSelection ? "Syncing..." : "Sync"}
          </Button>
        </div>
      </div>
      {/* Hick's Law + Miller: group controls into chunks and keep the first row focused */}
      <div className={cn("rounded-3xl p-5", inboxAccentClasses)}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600">
              <span className="text-[11px] uppercase tracking-wide text-slate-400">Workspace</span>
              <span className="font-medium">Acme Revenue</span>
              <Badge variant="outline" className="text-[10px]">Admin</Badge>
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  className="h-9 w-[220px] justify-between bg-white px-3 font-normal"
                >
                  <span className="truncate text-left">{selectedMailboxLabel}</span>
                  <ChevronDown className="h-3 w-3 text-slate-500" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-72" align="start">
                <DropdownMenuLabel>Mailbox scope</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuRadioGroup
                  value={selectedMailboxId}
                  onValueChange={setSelectedMailboxId}
                >
                  <DropdownMenuRadioItem value={ALL_INBOXES}>
                    All inboxes
                  </DropdownMenuRadioItem>
                  {mailboxes.map((config) => (
                    <DropdownMenuRadioItem key={config.id} value={config.id}>
                      {buildMailboxLabel(config)}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>

                {selectedMailboxId === ALL_INBOXES && mailboxes.length > 1 && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel>Filter included inboxes</DropdownMenuLabel>
                    <DropdownMenuItem
                      onSelect={(event) => {
                        event.preventDefault();
                        setExcludedMailboxIds([]);
                      }}
                    >
                      Select all
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={(event) => {
                        event.preventDefault();
                        setExcludedMailboxIds(mailboxes.map((config) => config.id));
                      }}
                    >
                      Clear all
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    {mailboxes.map((config) => {
                      const checked = !excludedMailboxIds.includes(config.id);
                      return (
                        <DropdownMenuCheckboxItem
                          key={config.id}
                          checked={checked}
                          onCheckedChange={(value) => {
                            setExcludedMailboxIds((prev) => {
                              const has = prev.includes(config.id);
                              if (value === true && has) {
                                return prev.filter((id) => id !== config.id);
                              }
                              if (value !== true && !has) {
                                return [...prev, config.id];
                              }
                              return prev;
                            });
                          }}
                          onSelect={(event) => event.preventDefault()}
                        >
                          {buildMailboxLabel(config)}
                        </DropdownMenuCheckboxItem>
                      );
                    })}
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <Badge variant="outline" className="text-[11px]">
              {syncSummary?.status === "syncing" ? "Syncing" : "Healthy"}
            </Badge>
            <span>{syncLabel}</span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-1 text-xs">
                  <RefreshCw className="h-3 w-3" />
                  Sync details
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72">
                <DropdownMenuLabel>Mailbox sync</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {mailboxes.map((config) => {
                  const mailboxSync = syncState[config.id];
                  const statusLabel = mailboxSync?.status || "idle";
                  return (
                    <DropdownMenuItem key={config.id} className="flex items-center justify-between gap-3">
                      <div className="flex flex-col">
                        <span className="text-xs font-medium text-slate-700">{buildMailboxLabel(config)}</span>
                        <span className="text-[10px] text-slate-400">
                          {mailboxSync?.lastSyncedAt
                            ? `Last synced ${formatDistanceToNow(new Date(mailboxSync.lastSyncedAt), { addSuffix: true })}`
                            : "Never synced"}
                        </span>
                        {mailboxSync?.error && (
                          <span className="text-[10px] text-rose-500">{mailboxSync.error}</span>
                        )}
                      </div>
                      <Badge variant="outline" className="text-[10px] capitalize">
                        {statusLabel}
                      </Badge>
                    </DropdownMenuItem>
                  );
                })}
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => syncMailbox(undefined)}>
                  Sync all mailboxes
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="ghost" size="sm" className="gap-1 text-xs" onClick={() => setCommandOpen(true)}>
              <CommandIcon className="h-3 w-3" />
              Cmd/Ctrl+K
            </Button>
          </div>
        </div>

        {/* Progressive disclosure: advanced filters sit in a popover */}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              ref={searchInputRef}
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search conversations, people, or subject"
              className="h-10 pl-10 pr-14"
            />
            <kbd className="absolute right-2 top-1/2 -translate-y-1/2 rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] text-slate-500">
              /
            </kbd>
          </div>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="gap-2">
                <Filter className="h-4 w-4" />
                Filters
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-4" align="start">
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label className="text-xs text-slate-500">From</Label>
                  <Input
                    value={filters.from || ""}
                    onChange={(event) => setFilters((prev) => ({ ...prev, from: event.target.value || undefined }))}
                    placeholder="name@company.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-slate-500">Subject</Label>
                  <Input
                    value={filters.subject || ""}
                    onChange={(event) => setFilters((prev) => ({ ...prev, subject: event.target.value || undefined }))}
                    placeholder="Proposal, follow up..."
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-slate-500">Has attachment</Label>
                  <Switch
                    checked={Boolean(filters.hasAttachment)}
                    onCheckedChange={(checked) =>
                      setFilters((prev) => ({ ...prev, hasAttachment: checked || undefined }))
                    }
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-2">
                    <Label className="text-xs text-slate-500">From date</Label>
                    <Input
                      type="date"
                      value={filters.dateFrom || ""}
                      onChange={(event) => setFilters((prev) => ({ ...prev, dateFrom: event.target.value || undefined }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-slate-500">To date</Label>
                    <Input
                      type="date"
                      value={filters.dateTo || ""}
                      onChange={(event) => setFilters((prev) => ({ ...prev, dateTo: event.target.value || undefined }))}
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between gap-2 pt-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setFilters({})}
                  >
                    Clear
                  </Button>
                  <Button size="sm">Apply</Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>

          <ToggleGroup
            type="single"
            value={viewMode}
            onValueChange={(value) => value && setViewMode(value as ViewMode)}
            className="rounded-full border border-slate-200 bg-white px-1"
          >
            <ToggleGroupItem
              value="split"
              aria-label="Split view"
              className="data-[state=on]:bg-slate-900 data-[state=on]:text-white"
            >
              <LayoutPanelLeft className="h-4 w-4" />
            </ToggleGroupItem>
            <ToggleGroupItem
              value="list"
              aria-label="List view"
              className="data-[state=on]:bg-slate-900 data-[state=on]:text-white"
            >
              <LayoutList className="h-4 w-4" />
            </ToggleGroupItem>
            <ToggleGroupItem
              value="detail"
              aria-label="Detail view"
              className="data-[state=on]:bg-slate-900 data-[state=on]:text-white"
            >
              <LayoutPanelTop className="h-4 w-4" />
            </ToggleGroupItem>
          </ToggleGroup>

          <ToggleGroup
            type="single"
            value={density}
            onValueChange={(value) => value && setDensity(value as Density)}
            className="rounded-full border border-slate-200 bg-white px-1"
          >
            <ToggleGroupItem value="compact" aria-label="Compact density">
              <ArrowDownNarrowWide className="h-4 w-4" />
            </ToggleGroupItem>
            <ToggleGroupItem value="comfortable" aria-label="Comfortable density">
              <ArrowDownNarrowWide className="h-4 w-4" />
            </ToggleGroupItem>
          </ToggleGroup>

          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Switch
              checked={threadedView}
              onCheckedChange={setThreadedView}
              id="threaded-view"
            />
            <Label htmlFor="threaded-view">Threaded</Label>
          </div>

          {isWide && viewMode === "split" && (
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => setContextOpen((prev) => !prev)}
            >
              {contextOpen ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
              {contextOpen ? "Hide context" : "Show context"}
            </Button>
          )}
        </div>

        {filterChips.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {filterChips.map((chip) => (
              <Badge
                key={chip.label}
                variant="secondary"
                className="gap-1 rounded-full px-3"
              >
                {chip.label}
                <button
                  type="button"
                  onClick={chip.onRemove}
                  className="rounded-full p-0.5 hover:bg-slate-200"
                  aria-label={`Remove ${chip.label}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
      </div>

      {/* Gestalt + Miller: tabs chunk the list into recognizable slices */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={savedView} onValueChange={(value) => setSavedView(value as InboxSavedViewId)}>
          <TabsList className="bg-white">
            {savedViews.map((view) => (
              <TabsTrigger key={view.id} value={view.id} className="gap-2">
                {view.label}
                {view.id === "unread" && unreadCount > 0 && (
                  <Badge variant="secondary" className="px-2 text-[10px]">
                    {unreadCount}
                  </Badge>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Badge variant="outline" className="text-[11px]">
            {threadedView ? "Threaded" : "Flat"}
          </Badge>
          <span>{listItems.length} conversations</span>
        </div>
      </div>
      <div className="min-h-[520px]">
        {emptyMailboxes ? (
          <div className="flex h-[420px] flex-col items-center justify-center rounded-3xl border border-dashed border-slate-200 bg-white/60 p-12 text-center">
            <InboxIcon className="h-10 w-10 text-slate-300" />
            <h3 className="mt-4 text-lg font-semibold text-slate-900">Connect your first inbox</h3>
            <p className="mt-2 text-sm text-slate-500">Bring replies from Gmail, Outlook, or IMAP.</p>
            <Button className="mt-6">Connect mailbox</Button>
          </div>
        ) : (
          <div className="h-[calc(100vh-22rem)] min-h-[520px] rounded-3xl bg-white/80 shadow-[0_18px_50px_-32px_rgba(15,23,42,0.5)]">
            {effectiveViewMode === "split" && (
              <ResizablePanelGroup direction="horizontal" className="h-full">
                <ResizablePanel defaultSize={36} minSize={25} className="border-r border-slate-200">
                  <InboxListPanel
                    listData={listData}
                    listBounds={listBounds}
                    listContainerRef={listContainerRef}
                    listRef={listRef}
                    isLoading={isLoadingList}
                    onItemsRendered={onItemsRendered}
                    listItems={listItems}
                    density={density}
                    allSelected={allSelected}
                    someSelected={someSelected}
                    onSelectAll={handleSelectAll}
                    selectedIds={selectedIds}
                    onBulkAction={(action) => performBulkAction(action, Array.from(selectedIds))}
                  />
                </ResizablePanel>
                <ResizableHandle />
                <ResizablePanel defaultSize={44} minSize={30} className="border-r border-slate-200">
                  <MessageDetailPanel
                    message={selectedMessage}
                    threadMessages={threadMessages}
                    onReply={() => openComposer("reply", selectedMessage)}
                    onReplyAll={() => openComposer("replyAll", selectedMessage)}
                    onForward={() => openComposer("forward", selectedMessage)}
                    onArchive={() =>
                      selectedMessageId && performBulkAction("archive", [selectedMessageId], "Archived")
                    }
                  />
                </ResizablePanel>
                {contextOpen && (
                  <>
                    <ResizableHandle />
                    <ResizablePanel defaultSize={20} minSize={18} collapsible onCollapse={() => setContextOpen(false)}>
                      <ProspectPanel
                        message={selectedMessage}
                        isSelectedStale={isSelectedStale}
                        pipelineDisabled={pipelineDisabled}
                        pipelineStages={pipelineStages}
                        selectedPipelineStage={selectedPipelineStage}
                        selectedPipelineStageId={selectedPipelineStageId}
                        campaignOptions={campaignOptions}
                        campaignDraft={campaignDraft}
                        nextStepDraft={nextStepDraft}
                        dealValueDraft={dealValueDraft}
                        onUpdateStage={updatePipelineStage}
                        onCampaignChange={updateCampaign}
                        onNextStepChange={setNextStepDraft}
                        onNextStepSave={updateNextStep}
                        onDealValueChange={setDealValueDraft}
                        onDealValueSave={updateDealValue}
                        onCollapse={() => setContextOpen(false)}
                      />
                    </ResizablePanel>
                  </>
                )}
              </ResizablePanelGroup>
            )}

            {effectiveViewMode === "list" && (
              <InboxListPanel
                listData={listData}
                listBounds={listBounds}
                listContainerRef={listContainerRef}
                listRef={listRef}
                isLoading={isLoadingList}
                onItemsRendered={onItemsRendered}
                listItems={listItems}
                density={density}
                allSelected={allSelected}
                someSelected={someSelected}
                onSelectAll={handleSelectAll}
                selectedIds={selectedIds}
                onBulkAction={(action) => performBulkAction(action, Array.from(selectedIds))}
              />
            )}

            {effectiveViewMode === "detail" && (
              <MessageDetailPanel
                message={selectedMessage}
                threadMessages={threadMessages}
                onReply={() => openComposer("reply", selectedMessage)}
                onReplyAll={() => openComposer("replyAll", selectedMessage)}
                onForward={() => openComposer("forward", selectedMessage)}
                onArchive={() =>
                  selectedMessageId && performBulkAction("archive", [selectedMessageId], "Archived")
                }
              />
            )}
          </div>
        )}
      </div>

      <Drawer open={mobileDetailOpen && !isWide} onOpenChange={setMobileDetailOpen}>
        <DrawerContent className="h-[90vh] overflow-hidden">
          <DrawerHeader className="flex items-center justify-between">
            <DrawerTitle>Message detail</DrawerTitle>
            <DrawerClose asChild>
              <Button variant="ghost" size="icon" aria-label="Close">
                <X className="h-4 w-4" />
              </Button>
            </DrawerClose>
          </DrawerHeader>
          <div className="h-full overflow-hidden px-4 pb-6">
            <MessageDetailPanel
              message={selectedMessage}
              threadMessages={threadMessages}
              onReply={() => openComposer("reply", selectedMessage)}
              onReplyAll={() => openComposer("replyAll", selectedMessage)}
              onForward={() => openComposer("forward", selectedMessage)}
              onArchive={() =>
                selectedMessageId && performBulkAction("archive", [selectedMessageId], "Archived")
              }
              compact
            />
          </div>
        </DrawerContent>
      </Drawer>

      <CommandPalette
        open={commandOpen}
        onOpenChange={setCommandOpen}
        onSelect={(action) => {
          if (action === "compose") openComposer("compose");
          if (action === "sync") syncMailbox(selectedMailboxId === ALL_INBOXES ? undefined : selectedMailboxId);
          if (action === "list") setViewMode("list");
          if (action === "split") setViewMode("split");
          if (action === "detail") setViewMode("detail");
          if (action === "compact") setDensity("compact");
          if (action === "comfortable") setDensity("comfortable");
          if (action === "threaded") setThreadedView((prev) => !prev);
          if (action === "archive" && selectedMessageId) performBulkAction("archive", [selectedMessageId], "Archived");
        }}
      />

      <Dialog open={composeOpen} onOpenChange={setComposeOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {composerMode === "compose" && "Compose"}
              {composerMode === "reply" && "Reply"}
              {composerMode === "replyAll" && "Reply all"}
              {composerMode === "forward" && "Forward"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs text-slate-500">To</Label>
              <Input value={composerTo} onChange={(event) => setComposerTo(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-slate-500">Cc</Label>
              <Input value={composerCc} onChange={(event) => setComposerCc(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-slate-500">Subject</Label>
              <Input value={composerSubject} onChange={(event) => setComposerSubject(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-slate-500">Message</Label>
              <Textarea
                value={composerBody}
                onChange={(event) => setComposerBody(event.target.value)}
                rows={8}
                placeholder="Write your reply..."
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setComposeOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSend} className="gap-2">
              <Send className="h-4 w-4" />
              Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const InboxListPanel = ({
  listData,
  listBounds,
  listContainerRef,
  listRef,
  isLoading,
  onItemsRendered,
  listItems,
  density,
  allSelected,
  someSelected,
  onSelectAll,
  selectedIds,
  onBulkAction,
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
    <div className="flex h-full flex-col">
      {/* Nielsen: user control and undo for bulk actions */}
      <div className="border-b border-slate-200 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Checkbox
              checked={allSelected ? true : someSelected ? "indeterminate" : false}
              onCheckedChange={(value) => onSelectAll(value === true)}
              aria-label="Select all"
            />
            <span className="text-sm text-slate-600">Select all</span>
          </div>

          {selectedIds.size > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="rounded-full">
                {selectedIds.size} selected
              </Badge>
              <Button size="sm" variant="outline" onClick={() => onBulkAction("markRead")}>
                Mark read
              </Button>
              <Button size="sm" variant="outline" onClick={() => onBulkAction("markUnread")}>
                Mark unread
              </Button>
              <Button size="sm" variant="outline" onClick={() => onBulkAction("assign")}>
                Assign to me
              </Button>
              <Button size="sm" onClick={() => onBulkAction("archive")}>Archive</Button>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <UserCheck className="h-3 w-3" />
              Tip: Use J/K to move between messages
            </div>
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
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-sm text-slate-500">
            <InboxIcon className="h-8 w-8 text-slate-300" />
            <div>
              <p className="font-medium text-slate-700">No messages found</p>
              <p className="text-xs text-slate-500">Try a different saved view or clear filters.</p>
            </div>
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

const InboxRow = ({ index, style, data }: any) => {
  const item: ListItem = data.items[index];
  const isSelected = data.selectedId === item.messageId;
  const isChecked = data.selectedIds.has(item.messageId);

  return (
    <div style={style} className="px-3">
      {/* Fitts: large row target with hover quick actions */}
      <div
        className={cn(
          "group flex h-full items-center gap-3 rounded-2xl border border-transparent px-3",
          data.density === "compact" ? "py-2" : "py-3",
          isSelected
            ? "border-slate-200 bg-slate-50"
            : "hover:border-slate-200 hover:bg-slate-50/60"
        )}
      >
        <Checkbox
          checked={isChecked}
          onCheckedChange={(value) => data.onToggleSelect(item.messageId, value === true)}
          aria-label={`Select ${item.subject}`}
        />
        <button
          type="button"
          className="flex-1 text-left"
          onClick={() => data.onSelect(item.messageId)}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {!item.read && <span className="h-2 w-2 rounded-full bg-emerald-500" />}
              <span className="text-sm font-semibold text-slate-900">{item.from}</span>
              {item.needsReply && (
                <Badge variant="secondary" className="text-[10px]">
                  Needs reply
                </Badge>
              )}
              {data.assignedIds?.has(item.messageId) && (
                <Badge variant="outline" className="text-[10px]">
                  Assigned
                </Badge>
              )}
            </div>
            <span className="text-xs text-slate-400">
              {formatDistanceToNow(new Date(item.date), { addSuffix: true })}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-2">
            <span className="text-sm text-slate-800 truncate">{item.subject}</span>
            {item.threadCount > 1 && (
              <Badge variant="outline" className="text-[10px]">
                {item.threadCount}
              </Badge>
            )}
          </div>
          <p className="mt-1 text-xs text-slate-500 truncate">{item.preview}</p>
        </button>
        <div className="flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => data.onToggleStar(item.messageId)}
            aria-label="Star"
          >
            <Star className={cn("h-4 w-4", data.starredIds.has(item.messageId) && "fill-amber-400 text-amber-500")} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => data.onToggleRead(item.messageId, item.read)}
            aria-label="Mark read"
          >
            <Check className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => data.onArchive(item.messageId)}
            aria-label="Archive"
          >
            <Archive className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};

const MessageDetailPanel = ({
  message,
  threadMessages,
  onReply,
  onReplyAll,
  onForward,
  onArchive,
  compact,
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

  if (!message) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-center text-sm text-slate-500">
        <InboxIcon className="h-8 w-8 text-slate-300" />
        <p className="mt-3 font-medium text-slate-700">Select a conversation</p>
        <p className="text-xs text-slate-500">Use J/K to navigate quickly.</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Fitts + consistency: sticky action bar keeps primary actions in reach */}
      <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{message.subject || "(No Subject)"}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span>Received {format(new Date(message.date), "PPP p")}</span>
              {!message.read && <Badge variant="secondary">Unread</Badge>}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={onReply} className="gap-1">
              <Reply className="h-4 w-4" />
              Reply
            </Button>
            <Button size="sm" variant="outline" onClick={onReplyAll} className="gap-1">
              <ReplyAll className="h-4 w-4" />
              Reply all
            </Button>
            <Button size="sm" variant="outline" onClick={onForward} className="gap-1">
              <Forward className="h-4 w-4" />
              Forward
            </Button>
            <Button size="sm" variant="outline" onClick={onArchive} className="gap-1">
              <Archive className="h-4 w-4" />
              Archive
            </Button>
            <Button size="sm" variant="ghost" className="gap-1">
              <MoreHorizontal className="h-4 w-4" />
              More
            </Button>
          </div>
        </div>
      </div>

      <ScrollArea className={cn("flex-1 px-4", compact ? "pb-6" : "pb-8")}> 
        <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <Avatar className="h-10 w-10">
                <AvatarImage src={`https://www.gravatar.com/avatar/${message.from_email}?d=mp`} />
                <AvatarFallback className="bg-slate-100 text-slate-600">
                  {getInitials(message.from_email)}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="text-sm font-semibold text-slate-900">{message.from_email}</p>
                <p className="text-xs text-slate-500">to {message.to_email}</p>
              </div>
            </div>
            <Badge variant="outline" className="text-[10px]">
              Primary inbox
            </Badge>
          </div>

          {/* Progressive disclosure: quoted text can be collapsed */}
          <div className={cn("mt-4 text-sm text-slate-700", !showQuoted && "max-h-[260px] overflow-hidden")}>
            {message.body && looksLikeHtml(message.body) ? (
              <div
                className="prose max-w-none text-sm text-slate-800"
                dangerouslySetInnerHTML={{ __html: sanitizeEmailHtml(message.body) }}
              />
            ) : (
              <div className="whitespace-pre-wrap leading-relaxed">{message.body}</div>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="mt-3"
            onClick={() => setShowQuoted((prev) => !prev)}
          >
            {showQuoted ? "Hide quoted text" : "Show quoted text"}
          </Button>

          <div className="mt-4 flex items-center gap-2 text-xs text-slate-500">
            <Paperclip className="h-4 w-4" />
            No attachments
          </div>
        </div>

        <div className="mt-6">
          <h3 className="text-sm font-semibold text-slate-900">Thread timeline</h3>
          <div className="mt-3 space-y-3">
            {threadMessages.map((item) => (
              <div key={item.id} className="rounded-2xl border border-slate-200 bg-white p-3">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>{item.from_email}</span>
                  <span>{format(new Date(item.date), "PP p")}</span>
                </div>
                <p className="mt-2 text-sm text-slate-700">
                  {buildPreviewText(item.body)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
};

const ProspectPanel = ({
  message,
  isSelectedStale,
  pipelineDisabled,
  pipelineStages,
  selectedPipelineStage,
  selectedPipelineStageId,
  campaignOptions,
  campaignDraft,
  nextStepDraft,
  dealValueDraft,
  onUpdateStage,
  onCampaignChange,
  onNextStepChange,
  onNextStepSave,
  onDealValueChange,
  onDealValueSave,
  onCollapse,
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
  return (
    <div className="flex h-full flex-col border-l border-slate-200 bg-slate-50/50">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Prospect pipeline</h3>
          <p className="text-xs text-slate-500">Track lifecycle, stage, and next step.</p>
        </div>
        <div className="flex items-center gap-2">
          {isSelectedStale && (
            <Badge variant="secondary" className="bg-amber-50 text-amber-700 text-[10px] uppercase">
              Stale
            </Badge>
          )}
          <Button variant="ghost" size="icon" onClick={onCollapse} aria-label="Collapse panel">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {!message ? (
        <div className="flex flex-1 flex-col items-center justify-center px-6 text-center text-sm text-slate-500">
          <InboxIcon className="h-8 w-8 text-slate-300" />
          <p className="mt-3 font-medium text-slate-700">Select a conversation</p>
          <p className="text-xs text-slate-500">Pipeline context appears here.</p>
        </div>
      ) : (
        <ScrollArea className="flex-1 px-4 py-4">
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-3 text-xs text-slate-600">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Lifecycle</span>
                <Badge variant="secondary" className="bg-emerald-50 text-emerald-700">
                  Replied
                </Badge>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-slate-500">Last activity</span>
                <span className="text-slate-700">
                  {formatDistanceToNow(new Date(message.date), { addSuffix: true })}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-slate-500">Pipeline stage</Label>
              <Select
                value={selectedPipelineStageId || "none"}
                onValueChange={(value) => onUpdateStage(value === "none" ? "" : value)}
                disabled={pipelineDisabled}
              >
                <SelectTrigger className="h-9 bg-white">
                  <SelectValue placeholder="Not in pipeline" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not in pipeline</SelectItem>
                  {pipelineStages.map((stage) => (
                    <SelectItem key={stage.id} value={stage.id}>
                      {stage.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedPipelineStage ? (
                <p className="text-[11px] text-slate-500">{selectedPipelineStage.description}</p>
              ) : (
                <p className="text-[11px] text-slate-500">
                  Pick a stage or use quick actions to start a deal.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-slate-500">Campaign (optional)</Label>
              <Select
                value={campaignDraft || "none"}
                onValueChange={(value) => onCampaignChange(value === "none" ? "" : value)}
                disabled={pipelineDisabled}
              >
                <SelectTrigger className="h-9 bg-white">
                  <SelectValue placeholder="No campaign" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No campaign</SelectItem>
                  {campaignOptions.map((campaign) => (
                    <SelectItem key={campaign.id} value={campaign.id}>
                      {campaign.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-slate-500">
                Optional: link this reply to a campaign for reporting.
              </p>
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-slate-500">Next step</Label>
              <Input
                value={nextStepDraft}
                onChange={(event) => onNextStepChange(event.target.value)}
                onBlur={() => onNextStepSave(nextStepDraft)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    onNextStepSave(nextStepDraft);
                  }
                }}
                placeholder="e.g., Send pricing deck"
                className="h-9 bg-white"
                disabled={pipelineDisabled}
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-slate-500">Deal value</Label>
              <Input
                value={dealValueDraft}
                onChange={(event) => onDealValueChange(event.target.value)}
                onBlur={() => onDealValueSave(dealValueDraft)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    onDealValueSave(dealValueDraft);
                  }
                }}
                placeholder="e.g., 12000"
                className="h-9 bg-white"
                disabled={pipelineDisabled}
              />
              <p className="text-[11px] text-slate-500">
                Auto-filled from proposal emails when available.
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white/95 p-3">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Quick actions
              </p>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onUpdateStage("qualified")}
                  disabled={pipelineDisabled}
                >
                  Interested
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onUpdateStage("meeting-booked")}
                  disabled={pipelineDisabled}
                >
                  Meeting booked
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onUpdateStage("closed-lost")}
                  disabled={pipelineDisabled}
                >
                  Not interested
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onNextStepSave("Follow up next week")}
                  disabled={pipelineDisabled}
                >
                  Snooze
                </Button>
              </div>
              <p className="mt-3 text-[11px] text-slate-500">
                Updates are saved to your pipeline. CRM sync can be added later.
              </p>
            </div>
          </div>
        </ScrollArea>
      )}
    </div>
  );
};

const CommandPalette = ({
  open,
  onOpenChange,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (action: string) => void;
}) => {
  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Search actions..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Create">
          <CommandItem onSelect={() => onSelect("compose")}>
            <MailPlus className="mr-2 h-4 w-4" />
            Compose
            <CommandShortcut>?C</CommandShortcut>
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="View">
          <CommandItem onSelect={() => onSelect("split")}>
            <LayoutPanelLeft className="mr-2 h-4 w-4" />
            Split view
          </CommandItem>
          <CommandItem onSelect={() => onSelect("list")}>
            <LayoutList className="mr-2 h-4 w-4" />
            List only
          </CommandItem>
          <CommandItem onSelect={() => onSelect("detail")}>
            <LayoutPanelTop className="mr-2 h-4 w-4" />
            Detail only
          </CommandItem>
          <CommandItem onSelect={() => onSelect("compact")}>
            <ArrowDownNarrowWide className="mr-2 h-4 w-4" />
            Compact density
          </CommandItem>
          <CommandItem onSelect={() => onSelect("comfortable")}>
            <ArrowDownNarrowWide className="mr-2 h-4 w-4" />
            Comfortable density
          </CommandItem>
          <CommandItem onSelect={() => onSelect("threaded")}>
            <Tag className="mr-2 h-4 w-4" />
            Toggle threaded
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Actions">
          <CommandItem onSelect={() => onSelect("sync")}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Sync inbox
          </CommandItem>
          <CommandItem onSelect={() => onSelect("archive")}>
            <Archive className="mr-2 h-4 w-4" />
            Archive selected
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
};

export default InboxPage;

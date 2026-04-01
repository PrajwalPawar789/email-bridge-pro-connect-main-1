import React, { useMemo, useState, useRef, useEffect, useCallback } from "react";
import { format, formatDistanceToNow } from "date-fns";
import {
  AlertTriangle,
  ArrowUpRight,
  BookOpen,
  Bot,
  Bug,
  Check,
  CheckCircle2,
  ChevronRight,
  Circle,
  Clock,
  CreditCard,
  ExternalLink,
  FileText,
  Headphones,
  Inbox,
  Info,
  Layers,
  LifeBuoy,
  Loader2,
  MessageCircle,
  MessageSquarePlus,
  Mic,
  Paperclip,
  Phone,
  Plus,
  Search,
  Send,
  Settings,
  Shield,
  ShieldCheck,
  Sparkles,
  Tag,
  TrendingUp,
  User,
  Video,
  Workflow,
  X,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────

type Category =
  | "bug"
  | "billing"
  | "mailbox"
  | "campaigns"
  | "automations"
  | "landing_pages"
  | "team"
  | "deliverability"
  | "feature_request"
  | "other";

type Severity = "low" | "medium" | "high" | "critical";
type Status = "new" | "in_progress" | "waiting_on_customer" | "resolved";

type Agent = {
  id: string;
  name: string;
  avatar: string;
  role: string;
  online: boolean;
};

type Ticket = {
  id: string;
  ticketNumber: string;
  subject: string;
  category: Category;
  severity: Severity;
  status: Status;
  area: string;
  assignedAgent: Agent | null;
  slaDeadline: string | null;
  slaPercentUsed: number;
  created_at: string;
  updated_at: string;
  lastMessagePreview: string;
  unread: boolean;
  messageCount: number;
};

type Message = {
  id: string;
  role: "customer" | "agent" | "system" | "bot";
  authorName: string;
  authorAvatar?: string;
  body: string;
  created_at: string;
  isInternal?: boolean;
};

type TimelineEvent = {
  id: string;
  type: "created" | "assigned" | "status_change" | "escalated" | "resolved";
  description: string;
  timestamp: string;
};

// ─────────────────────────────────────────────────────────────────
// Constants & Dummy Data
// ─────────────────────────────────────────────────────────────────

const AGENTS: Record<string, Agent> = {
  alex: {
    id: "a1",
    name: "Alex Rivera",
    avatar: "AR",
    role: "Senior Support Engineer",
    online: true,
  },
  jamie: {
    id: "a2",
    name: "Jamie Park",
    avatar: "JP",
    role: "Technical Account Manager",
    online: true,
  },
  morgan: {
    id: "a3",
    name: "Morgan Lee",
    avatar: "ML",
    role: "Billing Specialist",
    online: false,
  },
};

const SYSTEM_STATUS = {
  operational: true,
  message: "All systems operational",
  lastIncident: "32 days ago",
};

const DUMMY_TICKETS: Ticket[] = [
  {
    id: "t1",
    ticketNumber: "SUP-4821",
    subject: "Inbox stopped syncing after reconnecting Gmail",
    category: "mailbox",
    severity: "high",
    status: "in_progress",
    area: "Inbox",
    assignedAgent: AGENTS.alex,
    slaDeadline: new Date(Date.now() + 3.5 * 3600000).toISOString(),
    slaPercentUsed: 56,
    created_at: new Date(Date.now() - 4.5 * 3600000).toISOString(),
    updated_at: new Date(Date.now() - 12 * 60000).toISOString(),
    lastMessagePreview:
      "I've identified the sync issue — your OAuth token wasn't refreshed properly during reconnection...",
    unread: true,
    messageCount: 5,
  },
  {
    id: "t2",
    ticketNumber: "SUP-4819",
    subject: "Campaign sends stuck at 0% for 30+ minutes",
    category: "campaigns",
    severity: "critical",
    status: "waiting_on_customer",
    area: "Campaigns",
    assignedAgent: AGENTS.jamie,
    slaDeadline: new Date(Date.now() + 0.8 * 3600000).toISOString(),
    slaPercentUsed: 82,
    created_at: new Date(Date.now() - 5 * 3600000).toISOString(),
    updated_at: new Date(Date.now() - 8 * 60000).toISOString(),
    lastMessagePreview:
      "I need your campaign ID to unblock the send queue. You can find it in the URL...",
    unread: true,
    messageCount: 3,
  },
  {
    id: "t3",
    ticketNumber: "SUP-4815",
    subject: "Payment method declined during plan upgrade",
    category: "billing",
    severity: "medium",
    status: "in_progress",
    area: "Billing",
    assignedAgent: AGENTS.morgan,
    slaDeadline: new Date(Date.now() + 18 * 3600000).toISOString(),
    slaPercentUsed: 25,
    created_at: new Date(Date.now() - 26 * 3600000).toISOString(),
    updated_at: new Date(Date.now() - 3 * 3600000).toISOString(),
    lastMessagePreview:
      "We've flagged this with our payment processor. The 3DS verification flow may be timing out...",
    unread: false,
    messageCount: 4,
  },
  {
    id: "t4",
    ticketNumber: "SUP-4798",
    subject: "Automation skipping contacts in branch conditions",
    category: "automations",
    severity: "medium",
    status: "resolved",
    area: "Automations",
    assignedAgent: AGENTS.alex,
    slaDeadline: null,
    slaPercentUsed: 100,
    created_at: new Date(Date.now() - 72 * 3600000).toISOString(),
    updated_at: new Date(Date.now() - 48 * 3600000).toISOString(),
    lastMessagePreview:
      "The branch condition fix worked perfectly. All contacts are flowing through correctly now.",
    unread: false,
    messageCount: 6,
  },
  {
    id: "t5",
    ticketNumber: "SUP-4782",
    subject: "Feature request: Drag-and-drop email builder blocks",
    category: "feature_request",
    severity: "low",
    status: "in_progress",
    area: "Email Builder",
    assignedAgent: AGENTS.jamie,
    slaDeadline: new Date(Date.now() + 48 * 3600000).toISOString(),
    slaPercentUsed: 12,
    created_at: new Date(Date.now() - 96 * 3600000).toISOString(),
    updated_at: new Date(Date.now() - 72 * 3600000).toISOString(),
    lastMessagePreview:
      "Great suggestion — I've forwarded this to our product team with a priority flag...",
    unread: false,
    messageCount: 2,
  },
];

const DUMMY_MESSAGES: Record<string, Message[]> = {
  t1: [
    {
      id: "m1",
      role: "customer",
      authorName: "You",
      body: "After reconnecting my Gmail account, the inbox completely stopped syncing. I've been waiting for 2 hours and no new emails are appearing. This is blocking my entire team from responding to leads.\n\nWe have 3 active campaigns running that depend on inbox replies being tracked.",
      created_at: new Date(Date.now() - 4.5 * 3600000).toISOString(),
    },
    {
      id: "m2",
      role: "system",
      authorName: "System",
      body: "Ticket created · High severity · 8h response SLA · Assigned to Alex Rivera",
      created_at: new Date(Date.now() - 4.5 * 3600000 + 3000).toISOString(),
    },
    {
      id: "m3",
      role: "bot",
      authorName: "Support Assistant",
      body: "While you wait, here are some things you can check:\n\n• Go to Settings → Connected Accounts and verify your Gmail shows \"Connected\"\n• Check if there's a re-authorization banner at the top of your Inbox\n• Try sending a test email to yourself and see if it appears within 5 minutes\n\nYour assigned engineer Alex Rivera will follow up shortly.",
      created_at: new Date(Date.now() - 4.5 * 3600000 + 60000).toISOString(),
    },
    {
      id: "m4",
      role: "agent",
      authorName: "Alex Rivera",
      authorAvatar: "AR",
      body: "Hi Sarah — thanks for the detailed context, this helps a lot.\n\nI've already pulled up your account and I can see the issue: your OAuth token wasn't refreshed properly during the Gmail reconnection. This is a known edge case we're patching.\n\nHere's what I'm doing right now:\n1. Manually refreshing your token on our end\n2. Re-initiating the sync from the last successful checkpoint\n3. Verifying all 3 campaign reply tracking hooks are intact\n\nYou should see emails start flowing in within the next 15-20 minutes. I'll confirm once the sync catches up fully.",
      created_at: new Date(Date.now() - 45 * 60000).toISOString(),
    },
    {
      id: "m5",
      role: "agent",
      authorName: "Alex Rivera",
      authorAvatar: "AR",
      body: "Quick update — the token refresh is complete and I can see your inbox sync has resumed. 47 messages are being processed now. All 3 campaign tracking hooks are confirmed active.\n\nPlease check your inbox in the next few minutes and let me know if everything looks right.",
      created_at: new Date(Date.now() - 12 * 60000).toISOString(),
    },
  ],
  t2: [
    {
      id: "m6",
      role: "customer",
      authorName: "You",
      body: "My campaign 'Q1 Outreach - West Coast' has been stuck at 0% sent for over 30 minutes. I scheduled it for 9am PST and nothing has gone out. This is a critical launch for our team — 2,400 contacts are waiting.",
      created_at: new Date(Date.now() - 5 * 3600000).toISOString(),
    },
    {
      id: "m7",
      role: "system",
      authorName: "System",
      body: "Ticket created · Critical severity · 2h response SLA · Escalated to Jamie Park (TAM)",
      created_at: new Date(Date.now() - 5 * 3600000 + 3000).toISOString(),
    },
    {
      id: "m8",
      role: "agent",
      authorName: "Jamie Park",
      authorAvatar: "JP",
      body: "Sarah, I'm on this right now — critical sends get immediate attention.\n\nI need your campaign ID to unblock the send queue. You can find it in the URL when you open the campaign (it looks like `cmp_abc123`).\n\nWhile you grab that, I'm already checking the send infrastructure on our side to see if there's a queue-level issue affecting your workspace.",
      created_at: new Date(Date.now() - 8 * 60000).toISOString(),
    },
  ],
  t3: [
    {
      id: "m9",
      role: "customer",
      authorName: "You",
      body: "I'm trying to upgrade from Starter to Growth but my payment keeps getting declined. I've tried two different Visa cards and a Mastercard. All work fine on other services. We need the upgrade for additional seats before our new hires start Monday.",
      created_at: new Date(Date.now() - 26 * 3600000).toISOString(),
    },
    {
      id: "m10",
      role: "system",
      authorName: "System",
      body: "Ticket created · Medium severity · 24h response SLA · Assigned to Morgan Lee",
      created_at: new Date(Date.now() - 26 * 3600000 + 3000).toISOString(),
    },
    {
      id: "m11",
      role: "agent",
      authorName: "Morgan Lee",
      authorAvatar: "ML",
      body: "Hi Sarah — I understand the urgency with your new hires starting Monday.\n\nWe've flagged this with our payment processor. The 3DS verification flow may be timing out for your card issuer. I'm going to:\n\n1. Generate a direct invoice link that bypasses the checkout flow\n2. Check with our processor if there's a hold on your account\n\nI'll have the invoice link ready within the hour so you can complete the upgrade today.",
      created_at: new Date(Date.now() - 22 * 3600000).toISOString(),
    },
    {
      id: "m12",
      role: "agent",
      authorName: "Morgan Lee",
      authorAvatar: "ML",
      body: "Here's your direct upgrade invoice: https://billing.example.com/inv_xxxxx\n\nThis link uses an alternative payment flow that should work with your cards. It's valid for 48 hours. Let me know once you've completed it and I'll verify the seat addition immediately.",
      created_at: new Date(Date.now() - 3 * 3600000).toISOString(),
    },
  ],
  t4: [
    {
      id: "m13",
      role: "customer",
      authorName: "You",
      body: "My automation workflow 'Lead Nurture v3' is skipping about 40% of contacts when they hit the branch condition. The filter is set to 'opened email in last 7 days' but contacts who definitely opened are being excluded.",
      created_at: new Date(Date.now() - 72 * 3600000).toISOString(),
    },
    {
      id: "m14",
      role: "agent",
      authorName: "Alex Rivera",
      authorAvatar: "AR",
      body: "Found the root cause — two things were happening:\n\n1. The branch was using 'unique opens' instead of 'total opens'\n2. Your tracking domain had a brief DNS issue last Tuesday that caused ~35% of opens to not register in our analytics pipeline\n\nI've corrected the branch logic and re-queued the 847 affected contacts. They'll flow through the correct branch within the next 2 hours.",
      created_at: new Date(Date.now() - 50 * 3600000).toISOString(),
    },
    {
      id: "m15",
      role: "customer",
      authorName: "You",
      body: "Thanks! The branch condition fix worked perfectly. All contacts are flowing through correctly now. Appreciate the fast turnaround — the root cause analysis was really helpful too.",
      created_at: new Date(Date.now() - 48 * 3600000).toISOString(),
    },
    {
      id: "m16",
      role: "system",
      authorName: "System",
      body: "Ticket resolved · Resolution time: 24h · CSAT: ⭐⭐⭐⭐⭐",
      created_at: new Date(Date.now() - 48 * 3600000 + 60000).toISOString(),
    },
  ],
  t5: [
    {
      id: "m17",
      role: "customer",
      authorName: "You",
      body: "It would be great to be able to reorder blocks by dragging them in the email builder instead of having to delete and re-add them. Our marketing team builds complex emails with 10+ blocks and rearranging is painful right now.",
      created_at: new Date(Date.now() - 96 * 3600000).toISOString(),
    },
    {
      id: "m18",
      role: "agent",
      authorName: "Jamie Park",
      authorAvatar: "JP",
      body: "Great suggestion, Sarah — this is something we've heard from several teams.\n\nI've forwarded this to our product team with a priority flag given the workflow impact you described. I'll update this thread when we have a timeline. In the meantime, you can use the \"Duplicate block\" + delete workflow as a faster workaround.",
      created_at: new Date(Date.now() - 72 * 3600000).toISOString(),
    },
  ],
};

const TIMELINE_EVENTS: Record<string, TimelineEvent[]> = {
  t1: [
    { id: "e1", type: "created", description: "Ticket created", timestamp: new Date(Date.now() - 4.5 * 3600000).toISOString() },
    { id: "e2", type: "assigned", description: "Assigned to Alex Rivera", timestamp: new Date(Date.now() - 4.5 * 3600000 + 5000).toISOString() },
    { id: "e3", type: "status_change", description: "Status → In Progress", timestamp: new Date(Date.now() - 45 * 60000).toISOString() },
  ],
  t2: [
    { id: "e4", type: "created", description: "Ticket created", timestamp: new Date(Date.now() - 5 * 3600000).toISOString() },
    { id: "e5", type: "escalated", description: "Auto-escalated: Critical severity", timestamp: new Date(Date.now() - 5 * 3600000 + 3000).toISOString() },
    { id: "e6", type: "assigned", description: "Assigned to Jamie Park (TAM)", timestamp: new Date(Date.now() - 5 * 3600000 + 5000).toISOString() },
    { id: "e7", type: "status_change", description: "Status → Waiting on customer", timestamp: new Date(Date.now() - 8 * 60000).toISOString() },
  ],
};

const KB_ARTICLES = [
  { id: "kb1", title: "Reconnecting your mailbox", summary: "Re-authenticate Gmail, Outlook, or custom IMAP", category: "mailbox" as Category, readTime: "3 min" },
  { id: "kb2", title: "Campaign send troubleshooting", summary: "Why campaigns stall, under-send, or show 0%", category: "campaigns" as Category, readTime: "5 min" },
  { id: "kb3", title: "Billing & invoice management", summary: "Update payment, download invoices, change plans", category: "billing" as Category, readTime: "2 min" },
  { id: "kb4", title: "Automation branch logic", summary: "How conditions evaluate and common misconfigs", category: "automations" as Category, readTime: "4 min" },
  { id: "kb5", title: "Email deliverability guide", summary: "Warm-up, SPF/DKIM, reputation monitoring", category: "deliverability" as Category, readTime: "8 min" },
  { id: "kb6", title: "Team permissions & roles", summary: "Configure access, approvals, workspace settings", category: "team" as Category, readTime: "3 min" },
];

const CATEGORY_OPTIONS = [
  { value: "bug", label: "Bug Report", icon: Bug },
  { value: "billing", label: "Billing", icon: CreditCard },
  { value: "mailbox", label: "Mailbox", icon: Inbox },
  { value: "campaigns", label: "Campaigns", icon: Send },
  { value: "automations", label: "Automations", icon: Workflow },
  { value: "feature_request", label: "Feature Request", icon: Sparkles },
  { value: "other", label: "Other", icon: LifeBuoy },
];

const SEVERITY_CONFIG: Record<Severity, { label: string; sla: string; color: string; bg: string; border: string; ring: string }> = {
  low: { label: "Low", sla: "72h", color: "text-slate-600", bg: "bg-slate-50", border: "border-slate-200", ring: "ring-slate-200" },
  medium: { label: "Medium", sla: "24h", color: "text-blue-600", bg: "bg-blue-50", border: "border-blue-200", ring: "ring-blue-200" },
  high: { label: "High", sla: "8h", color: "text-amber-600", bg: "bg-amber-50", border: "border-amber-200", ring: "ring-amber-200" },
  critical: { label: "Critical", sla: "2h", color: "text-red-600", bg: "bg-red-50", border: "border-red-200", ring: "ring-red-200" },
};

const STATUS_CONFIG: Record<Status, { label: string; color: string; bgDot: string; description: string }> = {
  new: { label: "New", color: "text-slate-600", bgDot: "bg-slate-400", description: "Received — awaiting triage" },
  in_progress: { label: "In Progress", color: "text-emerald-600", bgDot: "bg-emerald-500", description: "An engineer is actively working on this" },
  waiting_on_customer: { label: "Needs Your Reply", color: "text-amber-600", bgDot: "bg-amber-500", description: "We've responded — waiting for your input" },
  resolved: { label: "Resolved", color: "text-muted-foreground", bgDot: "bg-muted-foreground", description: "Closed — reply to reopen" },
};

// ─────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────

function SLAProgressBar({ percent, severity }: { percent: number; severity: Severity }) {
  const isUrgent = percent > 75;
  const barColor = isUrgent
    ? "bg-red-500"
    : percent > 50
    ? "bg-amber-500"
    : "bg-emerald-500";

  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full transition-all duration-700 ease-out", barColor)}
          style={{ width: `${Math.min(percent, 100)}%` }}
        />
      </div>
      <span className={cn("text-[10px] font-semibold tabular-nums", isUrgent ? "text-red-600" : "text-muted-foreground")}>
        {Math.round(percent)}%
      </span>
    </div>
  );
}

function AgentPresence({ agent }: { agent: Agent }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="relative">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-foreground/10 text-xs font-bold text-foreground">
          {agent.avatar}
        </div>
        <span
          className={cn(
            "absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card",
            agent.online ? "bg-emerald-500" : "bg-muted-foreground/40"
          )}
        />
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-foreground">{agent.name}</p>
        <p className="text-[11px] text-muted-foreground">
          {agent.online ? (
            <span className="flex items-center gap-1">
              <span className="h-1 w-1 rounded-full bg-emerald-500" />
              Online · {agent.role}
            </span>
          ) : (
            <span>{agent.role} · Usually responds in 2h</span>
          )}
        </p>
      </div>
    </div>
  );
}

function TicketListItem({ ticket, selected, onSelect }: { ticket: Ticket; selected: boolean; onSelect: () => void }) {
  const severityConf = SEVERITY_CONFIG[ticket.severity];
  const statusConf = STATUS_CONFIG[ticket.status];

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "group relative w-full border-b border-border px-5 py-4 text-left transition-all duration-150",
        selected
          ? "bg-accent/50"
          : "hover:bg-accent/30",
        ticket.unread && "bg-accent/20"
      )}
    >
      {/* Selection indicator */}
      {selected && (
        <div className="absolute left-0 top-3 bottom-3 w-[3px] rounded-r-full bg-foreground" />
      )}

      <div className="flex items-start gap-3">
        {/* Status dot */}
        <div className="mt-1.5 flex flex-col items-center gap-1">
          <span className="relative flex h-2 w-2">
            {(ticket.status === "in_progress" || ticket.status === "waiting_on_customer") && (
              <span className={cn("absolute inline-flex h-full w-full animate-ping rounded-full opacity-30", statusConf.bgDot)} />
            )}
            <span className={cn("relative inline-flex h-2 w-2 rounded-full", statusConf.bgDot)} />
          </span>
        </div>

        <div className="min-w-0 flex-1">
          {/* Top row: ticket # + severity */}
          <div className="flex items-center gap-2 text-[11px]">
            <span className="font-mono font-medium text-muted-foreground">{ticket.ticketNumber}</span>
            <span className={cn("rounded px-1 py-0.5 text-[9px] font-bold uppercase tracking-wider", severityConf.bg, severityConf.color)}>
              {severityConf.label}
            </span>
            {ticket.unread && (
              <span className="ml-auto h-1.5 w-1.5 rounded-full bg-foreground" />
            )}
          </div>

          {/* Subject */}
          <p className={cn("mt-1 truncate text-[13px] leading-snug", ticket.unread ? "font-semibold text-foreground" : "font-medium text-foreground/80")}>
            {ticket.subject}
          </p>

          {/* Preview */}
          <p className="mt-1 truncate text-xs text-muted-foreground/70">
            {ticket.lastMessagePreview}
          </p>

          {/* Bottom row: agent + time + SLA */}
          <div className="mt-2.5 flex items-center gap-3">
            {ticket.assignedAgent && (
              <div className="flex items-center gap-1.5">
                <div className="relative">
                  <div className="flex h-4 w-4 items-center justify-center rounded-full bg-foreground/10 text-[8px] font-bold text-foreground/60">
                    {ticket.assignedAgent.avatar}
                  </div>
                  {ticket.assignedAgent.online && (
                    <span className="absolute -bottom-px -right-px h-1.5 w-1.5 rounded-full border border-card bg-emerald-500" />
                  )}
                </div>
                <span className="text-[11px] text-muted-foreground">{ticket.assignedAgent.name.split(" ")[0]}</span>
              </div>
            )}
            <span className="text-[10px] text-muted-foreground/60">
              {formatDistanceToNow(new Date(ticket.updated_at), { addSuffix: true })}
            </span>

            {/* SLA mini-bar */}
            {ticket.status !== "resolved" && ticket.slaDeadline && (
              <div className="ml-auto w-16">
                <SLAProgressBar percent={ticket.slaPercentUsed} severity={ticket.severity} />
              </div>
            )}
            {ticket.status === "resolved" && (
              <CheckCircle2 className="ml-auto h-3.5 w-3.5 text-emerald-500" />
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

function TimelineItem({ event }: { event: TimelineEvent }) {
  const icons: Record<string, React.ReactNode> = {
    created: <Plus className="h-3 w-3" />,
    assigned: <User className="h-3 w-3" />,
    status_change: <ArrowUpRight className="h-3 w-3" />,
    escalated: <AlertTriangle className="h-3 w-3" />,
    resolved: <CheckCircle2 className="h-3 w-3" />,
  };

  return (
    <div className="flex items-center gap-2.5 text-[11px] text-muted-foreground">
      <div className="flex h-5 w-5 items-center justify-center rounded-full bg-muted">
        {icons[event.type]}
      </div>
      <span>{event.description}</span>
      <span className="ml-auto shrink-0 text-muted-foreground/60">
        {format(new Date(event.timestamp), "MMM d, h:mm a")}
      </span>
    </div>
  );
}

function MessageItem({ message }: { message: Message }) {
  if (message.role === "system") {
    return (
      <div className="flex justify-center py-1">
        <div className="flex items-center gap-1.5 rounded-full bg-muted/60 px-3 py-1 text-[11px] text-muted-foreground">
          <Info className="h-3 w-3" />
          {message.body}
        </div>
      </div>
    );
  }

  if (message.role === "bot") {
    return (
      <div className="flex gap-3">
        <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted">
          <Bot className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="max-w-[80%]">
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <span className="font-medium">{message.authorName}</span>
            <span>{format(new Date(message.created_at), "h:mm a")}</span>
          </div>
          <div className="mt-1 rounded-xl rounded-tl-sm border border-border bg-muted/40 px-4 py-3">
            <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-foreground/80">
              {message.body}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const isCustomer = message.role === "customer";

  return (
    <div className={cn("flex gap-3", isCustomer ? "flex-row-reverse" : "flex-row")}>
      {/* Avatar */}
      <div className={cn(
        "mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold",
        isCustomer ? "bg-foreground text-background" : "bg-emerald-600/10 text-emerald-700"
      )}>
        {isCustomer ? "SC" : message.authorAvatar || "S"}
      </div>

      <div className={cn("max-w-[80%]", isCustomer && "text-right")}>
        <div className={cn("flex items-center gap-2 text-[11px] text-muted-foreground", isCustomer && "justify-end")}>
          <span className="font-medium">{isCustomer ? "You" : message.authorName}</span>
          <span>{format(new Date(message.created_at), "h:mm a")}</span>
        </div>
        <div className={cn(
          "mt-1 rounded-2xl px-4 py-3",
          isCustomer
            ? "rounded-tr-sm bg-foreground text-background"
            : "rounded-tl-sm border border-border bg-card"
        )}>
          <p className={cn("whitespace-pre-wrap text-[13px] leading-relaxed", !isCustomer && "text-foreground")}>
            {message.body}
          </p>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────

const SupportWorkspace = () => {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | Status>("all");
  const [selectedId, setSelectedId] = useState<string>("t1");
  const [replyDraft, setReplyDraft] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [showTimeline, setShowTimeline] = useState(false);
  const [showKB, setShowKB] = useState(false);
  const [draft, setDraft] = useState({
    subject: "",
    category: "bug" as Category,
    severity: "medium" as Severity,
    description: "",
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const selected = useMemo(
    () => DUMMY_TICKETS.find((t) => t.id === selectedId) || null,
    [selectedId]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return DUMMY_TICKETS.filter((t) => {
      if (statusFilter !== "all" && t.status !== statusFilter) return false;
      if (!q) return true;
      return (
        t.subject.toLowerCase().includes(q) ||
        t.ticketNumber.toLowerCase().includes(q) ||
        t.category.includes(q) ||
        (t.area || "").toLowerCase().includes(q)
      );
    });
  }, [search, statusFilter]);

  const messages = selectedId ? DUMMY_MESSAGES[selectedId] || [] : [];
  const timeline = selectedId ? TIMELINE_EVENTS[selectedId] || [] : [];

  const stats = useMemo(() => {
    const open = DUMMY_TICKETS.filter((t) => t.status !== "resolved").length;
    const needsReply = DUMMY_TICKETS.filter((t) => t.status === "waiting_on_customer").length;
    const avgSla = Math.round(DUMMY_TICKETS.filter((t) => t.status !== "resolved").reduce((sum, t) => sum + t.slaPercentUsed, 0) / Math.max(open, 1));
    return { open, needsReply, avgSla };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [selectedId]);

  const filterOptions: Array<{ value: "all" | Status; label: string; count?: number }> = [
    { value: "all", label: "All" },
    { value: "in_progress", label: "In Progress" },
    { value: "waiting_on_customer", label: "Needs Reply", count: stats.needsReply },
    { value: "resolved", label: "Resolved" },
  ];

  const contextualArticles = useMemo(() => {
    if (!selected) return KB_ARTICLES.slice(0, 3);
    return KB_ARTICLES.filter((a) => a.category === selected.category).slice(0, 3);
  }, [selected]);

  return (
    <>
      <div className="flex h-screen flex-col overflow-hidden bg-background">
        {/* ── System status bar ── */}
        <div className="flex h-8 items-center justify-between border-b border-border bg-card px-5">
          <div className="flex items-center gap-2 text-[11px]">
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500/10">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            </span>
            <span className="font-medium text-emerald-600">{SYSTEM_STATUS.message}</span>
            <span className="text-muted-foreground/50">·</span>
            <span className="text-muted-foreground/60">Last incident {SYSTEM_STATUS.lastIncident}</span>
          </div>
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground/60">
            <span className="hidden sm:inline">Plan: <span className="font-medium text-muted-foreground">Growth</span></span>
            <span className="hidden sm:inline">·</span>
            <span className="hidden sm:inline">Acme Inc.</span>
          </div>
        </div>

        {/* ── Main header ── */}
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Headphones className="h-5 w-5 text-foreground" />
              <h1 className="text-base font-semibold text-foreground">Support Center</h1>
            </div>
            <Separator orientation="vertical" className="h-5" />
            <div className="flex items-center gap-3 text-[12px]">
              <span className="text-muted-foreground">{stats.open} open</span>
              {stats.needsReply > 0 && (
                <span className="flex items-center gap-1 font-medium text-amber-600">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                  {stats.needsReply} needs reply
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="hidden gap-1.5 text-xs sm:flex"
              onClick={() => setShowKB(!showKB)}
            >
              <BookOpen className="h-3.5 w-3.5" />
              Help guides
            </Button>
            <Button
              onClick={() => setDialogOpen(true)}
              size="sm"
              className="gap-1.5 rounded-lg bg-foreground text-xs text-background hover:bg-foreground/90"
            >
              <Plus className="h-3.5 w-3.5" />
              New request
            </Button>
          </div>
        </div>

        {/* ── Content ── */}
        <div className="flex min-h-0 flex-1">
          {/* ── Ticket list panel ── */}
          <div className="flex w-[360px] shrink-0 flex-col border-r border-border">
            {/* Search */}
            <div className="border-b border-border px-3 py-2.5">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/50" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search tickets..."
                  className="h-8 border-0 bg-muted/40 pl-8 text-xs shadow-none focus-visible:ring-1"
                />
              </div>
            </div>

            {/* Filter tabs */}
            <div className="flex gap-0.5 border-b border-border px-3 py-1.5">
              {filterOptions.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setStatusFilter(opt.value)}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-[11px] font-medium transition-all",
                    statusFilter === opt.value
                      ? "bg-foreground text-background shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {opt.label}
                  {opt.count != null && opt.count > 0 && (
                    <span className={cn(
                      "ml-1 rounded-full px-1 text-[9px]",
                      statusFilter === opt.value ? "bg-background/20 text-background" : "bg-amber-100 text-amber-700"
                    )}>
                      {opt.count}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Ticket list */}
            <ScrollArea className="flex-1">
              {filtered.length > 0 ? (
                filtered.map((t) => (
                  <TicketListItem
                    key={t.id}
                    ticket={t}
                    selected={t.id === selectedId}
                    onSelect={() => setSelectedId(t.id)}
                  />
                ))
              ) : (
                <div className="flex flex-col items-center py-16 text-center">
                  <div className="rounded-xl bg-muted/50 p-4">
                    <Inbox className="h-8 w-8 text-muted-foreground/30" />
                  </div>
                  <p className="mt-4 text-sm font-medium text-foreground/70">No tickets match</p>
                  <p className="mt-1 text-xs text-muted-foreground">Try adjusting your search or filters</p>
                </div>
              )}
            </ScrollArea>
          </div>

          {/* ── Conversation panel ── */}
          <div className="flex min-w-0 flex-1 flex-col">
            {selected ? (
              <>
                {/* Conversation header */}
                <div className="shrink-0 border-b border-border px-6 py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      {/* Status + severity */}
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          "flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-semibold",
                          STATUS_CONFIG[selected.status].color
                        )}>
                          <span className={cn("h-1.5 w-1.5 rounded-full", STATUS_CONFIG[selected.status].bgDot)} />
                          {STATUS_CONFIG[selected.status].label}
                        </span>
                        <span className={cn(
                          "rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider",
                          SEVERITY_CONFIG[selected.severity].bg,
                          SEVERITY_CONFIG[selected.severity].color,
                        )}>
                          {SEVERITY_CONFIG[selected.severity].label}
                        </span>
                        <span className="text-[11px] text-muted-foreground/50">·</span>
                        <span className="font-mono text-[11px] text-muted-foreground">{selected.ticketNumber}</span>
                      </div>

                      {/* Subject */}
                      <h2 className="mt-2 text-lg font-semibold leading-tight text-foreground">
                        {selected.subject}
                      </h2>

                      {/* Meta */}
                      <div className="mt-1.5 flex items-center gap-3 text-[11px] text-muted-foreground">
                        <span>{selected.area}</span>
                        <span>·</span>
                        <span>{formatDistanceToNow(new Date(selected.created_at), { addSuffix: true })}</span>
                        <span>·</span>
                        <span>{selected.messageCount} messages</span>
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 gap-1.5 text-[11px]"
                        onClick={() => setShowTimeline(!showTimeline)}
                      >
                        <Layers className="h-3.5 w-3.5" />
                        Activity
                      </Button>
                      {selected.status !== "resolved" && (
                        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-[11px]">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Resolve
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Detail strip */}
                  <div className="mt-4 flex items-center gap-6 rounded-lg bg-muted/40 px-4 py-2.5">
                    {/* Agent */}
                    {selected.assignedAgent && (
                      <AgentPresence agent={selected.assignedAgent} />
                    )}

                    <Separator orientation="vertical" className="h-8" />

                    {/* SLA */}
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">SLA</p>
                      <div className="mt-1 flex items-center gap-2">
                        <span className="text-sm font-semibold text-foreground">
                          {SEVERITY_CONFIG[selected.severity].sla} target
                        </span>
                        {selected.status !== "resolved" && selected.slaDeadline && (
                          <div className="w-20">
                            <SLAProgressBar percent={selected.slaPercentUsed} severity={selected.severity} />
                          </div>
                        )}
                        {selected.status === "resolved" && (
                          <span className="flex items-center gap-1 text-[11px] text-emerald-600">
                            <Check className="h-3 w-3" />
                            Met
                          </span>
                        )}
                      </div>
                    </div>

                    <Separator orientation="vertical" className="h-8" />

                    {/* Status description */}
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Status</p>
                      <p className="mt-1 text-[12px] text-foreground/70">
                        {STATUS_CONFIG[selected.status].description}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Timeline sidebar overlay */}
                {showTimeline && timeline.length > 0 && (
                  <div className="shrink-0 border-b border-border bg-muted/20 px-6 py-3">
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Activity Timeline</p>
                      <button onClick={() => setShowTimeline(false)} className="text-muted-foreground hover:text-foreground">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="mt-2 space-y-2">
                      {timeline.map((e) => (
                        <TimelineItem key={e.id} event={e} />
                      ))}
                    </div>
                  </div>
                )}

                {/* Messages */}
                <ScrollArea className="flex-1 px-6 py-5">
                  <div className="mx-auto max-w-3xl space-y-5">
                    {messages.map((m) => (
                      <MessageItem key={m.id} message={m} />
                    ))}
                    <div ref={messagesEndRef} />
                  </div>
                </ScrollArea>

                {/* Reply composer */}
                <div className="shrink-0 border-t border-border px-6 py-4">
                  <div className="mx-auto max-w-3xl">
                    <div className="rounded-xl border border-border bg-card transition-all focus-within:border-foreground/20 focus-within:shadow-[0_0_0_3px_hsl(var(--foreground)/0.05)]">
                      <Textarea
                        value={replyDraft}
                        onChange={(e) => setReplyDraft(e.target.value)}
                        placeholder={
                          selected.status === "resolved"
                            ? "Reply to reopen this ticket..."
                            : "Type your reply..."
                        }
                        className="min-h-[72px] resize-none border-0 bg-transparent px-4 py-3 text-[13px] shadow-none focus-visible:ring-0"
                      />
                      <div className="flex items-center justify-between border-t border-border/50 px-3 py-2">
                        <div className="flex items-center gap-0.5">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground">
                                <Paperclip className="h-3.5 w-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="text-xs">Attach file</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground">
                                <FileText className="h-3.5 w-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="text-xs">Insert template</TooltipContent>
                          </Tooltip>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="hidden text-[10px] text-muted-foreground/50 sm:inline">⌘ Enter to send</span>
                          <Button
                            size="sm"
                            disabled={!replyDraft.trim()}
                            className="h-7 gap-1 rounded-md bg-foreground px-3 text-[11px] font-semibold text-background hover:bg-foreground/90"
                          >
                            <Send className="h-3 w-3" />
                            {selected.status === "resolved" ? "Reply & Reopen" : "Send"}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center text-center">
                <div className="rounded-2xl bg-muted/30 p-6">
                  <Headphones className="h-12 w-12 text-muted-foreground/20" />
                </div>
                <h2 className="mt-6 text-xl font-semibold text-foreground">Select a ticket</h2>
                <p className="mt-2 max-w-md text-sm text-muted-foreground">
                  Choose a ticket from the list to view the conversation, or create a new support request.
                </p>
                <Button
                  onClick={() => setDialogOpen(true)}
                  className="mt-6 gap-2 rounded-lg bg-foreground text-background hover:bg-foreground/90"
                >
                  <Plus className="h-4 w-4" />
                  New request
                </Button>
              </div>
            )}
          </div>

          {/* ── Knowledge base sidebar ── */}
          {showKB && (
            <div className="flex w-[280px] shrink-0 flex-col border-l border-border">
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <div className="flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-semibold text-foreground">Help Guides</span>
                </div>
                <button onClick={() => setShowKB(false)} className="text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              </div>

              {selected && (
                <div className="border-b border-border bg-muted/30 px-4 py-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Related to this ticket
                  </p>
                </div>
              )}

              <ScrollArea className="flex-1">
                <div className="space-y-0.5 p-2">
                  {contextualArticles.map((article) => (
                    <button
                      key={article.id}
                      className="group w-full rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-muted/60"
                    >
                      <p className="text-[13px] font-medium text-foreground group-hover:text-primary">{article.title}</p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground line-clamp-2">{article.summary}</p>
                      <div className="mt-1.5 flex items-center gap-2 text-[10px] text-muted-foreground/60">
                        <Clock className="h-3 w-3" />
                        <span>{article.readTime} read</span>
                        <ChevronRight className="ml-auto h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                      </div>
                    </button>
                  ))}
                </div>
              </ScrollArea>

              <div className="border-t border-border p-3">
                <Button variant="ghost" size="sm" className="w-full gap-1.5 text-xs text-muted-foreground">
                  <ExternalLink className="h-3.5 w-3.5" />
                  View all guides
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── New Request Dialog ── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-xl gap-0 overflow-hidden rounded-xl border-border p-0 shadow-2xl">
          <DialogHeader className="border-b border-border px-6 py-5">
            <DialogTitle className="text-lg font-semibold text-foreground">New support request</DialogTitle>
            <DialogDescription className="text-[13px] text-muted-foreground">
              Your account context is attached automatically — no need to repeat it.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 px-6 py-5">
            <div>
              <Label className="text-[13px] font-medium text-foreground">Subject</Label>
              <Input
                value={draft.subject}
                onChange={(e) => setDraft((d) => ({ ...d, subject: e.target.value }))}
                placeholder="Brief description of the issue"
                className="mt-1.5 rounded-lg"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label className="text-[13px] font-medium text-foreground">Category</Label>
                <Select
                  value={draft.category}
                  onValueChange={(v) => setDraft((d) => ({ ...d, category: v as Category }))}
                >
                  <SelectTrigger className="mt-1.5 rounded-lg">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORY_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        <div className="flex items-center gap-2">
                          <opt.icon className="h-3.5 w-3.5 text-muted-foreground" />
                          <span>{opt.label}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[13px] font-medium text-foreground">Severity</Label>
                <Select
                  value={draft.severity}
                  onValueChange={(v) => setDraft((d) => ({ ...d, severity: v as Severity }))}
                >
                  <SelectTrigger className="mt-1.5 rounded-lg">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(SEVERITY_CONFIG).map(([value, config]) => (
                      <SelectItem key={value} value={value}>
                        <div className="flex items-center gap-2">
                          <span className={cn("h-2 w-2 rounded-full", "bg" in config ? config.bg : "bg-muted")} />
                          <span>{config.label}</span>
                          <span className="text-muted-foreground">· {config.sla} SLA</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label className="text-[13px] font-medium text-foreground">Describe the issue</Label>
              <Textarea
                value={draft.description}
                onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                className="mt-1.5 min-h-[140px] rounded-lg text-[13px]"
                placeholder="What happened? What were you trying to do? How many people are affected?"
              />
            </div>

            {/* Auto-context */}
            <div className="rounded-lg border border-border bg-muted/30 px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Auto-attached context</p>
              <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[12px] text-muted-foreground">
                <span className="flex items-center gap-1.5"><User className="h-3 w-3" /> Sarah Chen · sarah@acme.io</span>
                <span className="flex items-center gap-1.5"><Shield className="h-3 w-3" /> Growth · Admin</span>
                <span className="flex items-center gap-1.5"><Clock className="h-3 w-3" /> {SEVERITY_CONFIG[draft.severity].sla} SLA</span>
                <span className="flex items-center gap-1.5"><Settings className="h-3 w-3" /> Browser + timezone</span>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-border px-6 py-3.5">
            <p className="text-[11px] text-muted-foreground">
              A support engineer will be assigned automatically
            </p>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button size="sm" className="gap-1.5 rounded-lg bg-foreground text-background hover:bg-foreground/90">
                <Send className="h-3.5 w-3.5" />
                Submit request
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default SupportWorkspace;

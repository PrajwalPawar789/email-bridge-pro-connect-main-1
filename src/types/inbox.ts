export type InboxMessageStatus = "unread" | "read" | "archived" | "draft";

export type InboxSavedViewId = "all" | "unread" | "needsReply" | "assigned" | "starred";

export interface InboxMailbox {
  id: string;
  address: string;
  displayName?: string | null;
  provider?: string | null;
  status: "connected" | "syncing" | "error" | "needs_auth";
  lastSyncAt?: string | null;
  error?: string | null;
  teamId?: string | null;
}

export interface InboxParticipant {
  name?: string | null;
  email: string;
}

export interface InboxAttachment {
  id: string;
  filename: string;
  contentType?: string | null;
  size?: number | null;
}

export interface InboxMessageSummary {
  id: string;
  mailboxId: string;
  subject: string;
  from: InboxParticipant;
  to: InboxParticipant[];
  preview: string;
  receivedAt: string;
  status: InboxMessageStatus;
  hasAttachments: boolean;
  threadCount?: number;
  assignedTo?: string | null;
  tags?: string[];
}

export interface InboxThreadMessage extends InboxMessageSummary {
  body?: string | null;
  html?: string | null;
  attachments?: InboxAttachment[];
}

export interface InboxMessageDetail extends InboxMessageSummary {
  body?: string | null;
  html?: string | null;
  attachments?: InboxAttachment[];
  thread?: InboxThreadMessage[];
  cc?: InboxParticipant[];
  bcc?: InboxParticipant[];
}

export interface InboxSearchFilters {
  from?: string;
  subject?: string;
  hasAttachment?: boolean;
  mailboxId?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface InboxMessagesResponse {
  data: InboxMessageSummary[];
  page: number;
  pageSize: number;
  total: number;
  nextPage?: number;
}

export interface InboxMessageResponse {
  data: InboxMessageDetail;
}

export interface InboxBulkActionRequest {
  ids: string[];
  action: "archive" | "markRead" | "markUnread" | "assign" | "move";
  mailboxId?: string;
  assignTo?: string;
}

export interface InboxBulkActionResponse {
  success: boolean;
  updated: number;
}

export interface InboxSyncRequest {
  mailboxId?: string;
}

export interface InboxSyncResponse {
  status: "queued" | "running" | "success" | "error";
  lastSyncAt?: string;
  mailboxes?: Array<{
    mailboxId: string;
    status: "syncing" | "success" | "error";
    lastSyncAt?: string;
    error?: string;
  }>;
}

export interface PipelineSummaryResponse {
  pipelineId: string;
  openCount: number;
  openValue: number;
  meetingsBooked: number;
  staleCount: number;
  closedWon: number;
  updatedAt: string;
}

export interface PipelineListResponse {
  data: Array<{
    id: string;
    name: string;
    description?: string | null;
    isDefault?: boolean;
  }>;
}

export interface PipelineOpportunitiesResponse {
  data: Array<{
    id: string;
    contactName: string;
    company?: string | null;
    email?: string | null;
    owner?: string | null;
    value?: number | null;
    stageId: string;
    status: "open" | "won" | "lost";
    lastActivityAt: string;
    nextStep?: string | null;
    campaignId?: string | null;
    tags?: string[];
  }>;
  page: number;
  pageSize: number;
  total: number;
  nextPage?: number;
}

export interface PipelineView {
  id: string;
  name: string;
  filters: {
    q?: string;
    stageId?: string;
    owner?: string;
    campaign?: string;
    staleOnly?: boolean;
    valueMin?: number;
    valueMax?: number;
    dateFrom?: string;
    dateTo?: string;
  };
}

export interface PipelineViewsResponse {
  data: PipelineView[];
}

export interface PipelinePatchOpportunityRequest {
  stageId?: string;
  owner?: string | null;
  value?: number | null;
  nextStep?: string | null;
  tags?: string[];
}

export interface PipelineBulkActionRequest {
  ids: string[];
  action: "move" | "assign" | "nextStep" | "stale" | "tag";
  stageId?: string;
  owner?: string | null;
  nextStep?: string | null;
  tag?: string;
}

export interface PipelineBulkActionResponse {
  success: boolean;
  updated: number;
}

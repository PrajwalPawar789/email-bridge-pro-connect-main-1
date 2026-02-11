import { differenceInDays } from 'date-fns';

export type PipelineStage = {
  id: string;
  name: string;
  description: string;
  tone: 'emerald' | 'amber' | 'sky' | 'violet' | 'slate' | 'rose';
  isWon?: boolean;
  isLost?: boolean;
};

export type PipelineTemplate = {
  id: string;
  name: string;
  description: string;
  stages: PipelineStage[];
};

export type PipelineOpportunityStatus = 'open' | 'won' | 'lost';

export type PipelineOpportunity = {
  id: string;
  contactName: string;
  company?: string;
  email?: string;
  owner?: string;
  value?: number;
  stageId: string;
  status: PipelineOpportunityStatus;
  lastActivityAt: string;
  nextStep?: string;
  campaignId?: string | null;
  sourceCampaign?: string;
  tags?: string[];
};

export const STALE_DAYS = 14;

export const PIPELINE_TEMPLATES: PipelineTemplate[] = [
  {
    id: 'outbound-default',
    name: 'Outbound Sales Pipeline',
    description: 'Designed for reply-driven outreach teams with clear qualification gates.',
    stages: [
      {
        id: 'engaged',
        name: 'Engaged',
        description: 'Reply received or intent detected.',
        tone: 'sky',
      },
      {
        id: 'qualified',
        name: 'Qualified',
        description: 'Confirmed interest and ICP fit.',
        tone: 'emerald',
      },
      {
        id: 'meeting-booked',
        name: 'Meeting Booked',
        description: 'Discovery or demo scheduled.',
        tone: 'amber',
      },
      {
        id: 'proposal',
        name: 'Proposal',
        description: 'Proposal or pricing shared.',
        tone: 'violet',
      },
      {
        id: 'negotiation',
        name: 'Negotiation',
        description: 'Working through terms or legal.',
        tone: 'slate',
      },
      {
        id: 'closed-won',
        name: 'Closed Won',
        description: 'Deal secured and handed off.',
        tone: 'emerald',
      },
      {
        id: 'closed-lost',
        name: 'Closed Lost',
        description: 'Not moving forward or disqualified.',
        tone: 'rose',
      },
    ],
  },
];

export const SAMPLE_OPPORTUNITIES: PipelineOpportunity[] = [
  {
    id: 'opp-neo-01',
    contactName: 'Maya Patel',
    company: 'NeonLabs',
    email: 'maya@neonlabs.io',
    owner: 'Ava',
    value: 18000,
    stageId: 'qualified',
    status: 'open',
    lastActivityAt: '2026-02-06T14:10:00Z',
    nextStep: 'Confirm demo agenda',
    sourceCampaign: 'Q1 SaaS Leaders',
  },
  {
    id: 'opp-aur-02',
    contactName: 'Jon Brooks',
    company: 'Aurora Health',
    email: 'jon@aurora.health',
    owner: 'Ravi',
    value: 32000,
    stageId: 'meeting-booked',
    status: 'open',
    lastActivityAt: '2026-02-04T09:20:00Z',
    nextStep: 'Send prep deck',
    sourceCampaign: 'Healthcare Execs',
  },
  {
    id: 'opp-hel-03',
    contactName: 'Renee Ellis',
    company: 'HelixWorks',
    email: 'renee@helixworks.com',
    owner: 'Sophia',
    value: 7600,
    stageId: 'engaged',
    status: 'open',
    lastActivityAt: '2026-02-02T18:35:00Z',
    nextStep: 'Qualify budget',
    sourceCampaign: 'Founders Warmup',
  },
  {
    id: 'opp-arc-04',
    contactName: 'Luis Gomez',
    company: 'Arcwise',
    email: 'luis@arcwise.ai',
    owner: 'Ava',
    value: 24000,
    stageId: 'proposal',
    status: 'open',
    lastActivityAt: '2026-01-24T11:15:00Z',
    nextStep: 'Follow up on proposal',
    sourceCampaign: 'Q1 SaaS Leaders',
  },
  {
    id: 'opp-pix-05',
    contactName: 'Ella Morgan',
    company: 'PixelBridge',
    email: 'ella@pixelbridge.io',
    owner: 'Ravi',
    value: 12500,
    stageId: 'negotiation',
    status: 'open',
    lastActivityAt: '2026-01-18T08:05:00Z',
    nextStep: 'Confirm legal review',
    sourceCampaign: 'RevOps Midmarket',
  },
  {
    id: 'opp-nov-06',
    contactName: 'Aaron Chen',
    company: 'Nova Freight',
    email: 'aaron@novafreight.com',
    owner: 'Sophia',
    value: 54000,
    stageId: 'closed-won',
    status: 'won',
    lastActivityAt: '2026-02-01T16:40:00Z',
    nextStep: 'Kickoff handoff',
    sourceCampaign: 'Logistics Growth',
  },
  {
    id: 'opp-sol-07',
    contactName: 'Priya Shah',
    company: 'Solstice AI',
    email: 'priya@solstice.ai',
    owner: 'Ava',
    value: 9800,
    stageId: 'closed-lost',
    status: 'lost',
    lastActivityAt: '2026-01-22T12:10:00Z',
    nextStep: 'Archive and mark DNC',
    sourceCampaign: 'Founders Warmup',
  },
];

export const formatCurrency = (value: number) => (
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value)
);

const CURRENCY_REGEX = /(?:\$|usd|us\$|eur|€|£|gbp|inr|₹)\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)\s*(k|m|b)?/gi;

export const extractCurrencyValues = (input: string) => {
  if (!input) return [];
  const values: number[] = [];
  let match: RegExpExecArray | null;
  while ((match = CURRENCY_REGEX.exec(input)) !== null) {
    const raw = match[1]?.replace(/,/g, '');
    const suffix = (match[2] || '').toLowerCase();
    const parsed = raw ? Number(raw) : NaN;
    if (!Number.isFinite(parsed)) continue;
    let value = parsed;
    if (suffix === 'k') value *= 1000;
    if (suffix === 'm') value *= 1000000;
    if (suffix === 'b') value *= 1000000000;
    values.push(value);
  }
  return values;
};

export const getLargestCurrencyValue = (input: string) => {
  const values = extractCurrencyValues(input);
  if (values.length === 0) return null;
  return Math.max(...values);
};

export const isOpportunityStale = (opportunity: PipelineOpportunity, now = new Date()) => (
  differenceInDays(now, new Date(opportunity.lastActivityAt)) >= STALE_DAYS
);

export const getPipelineTemplateById = (id: string) => (
  PIPELINE_TEMPLATES.find((template) => template.id === id) || PIPELINE_TEMPLATES[0]
);

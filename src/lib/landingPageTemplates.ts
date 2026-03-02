import { type LandingPageBlock, type LandingPageBlockType } from '@/lib/landingPagesPersistence';

export interface LandingPageTemplateDefinition {
  id: string;
  name: string;
  description: string;
  blocks: Array<{
    type: LandingPageBlockType;
    content?: Record<string, any>;
    styles?: Record<string, any>;
  }>;
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

export const DEFAULT_LANDING_BLOCK_CONTENT: Record<LandingPageBlockType, Record<string, any>> = {
  navbar: { brand: 'YourBrand', links: ['Home', 'Features', 'Pricing', 'Contact'] },
  hero: {
    headline: 'Build Something Amazing',
    subheadline: 'The fastest way to launch your next project.',
    ctaText: 'Get Started',
    ctaUrl: '#',
  },
  features: {
    title: 'Features',
    items: [
      { title: 'Fast', desc: 'Lightning fast performance' },
      { title: 'Secure', desc: 'Enterprise-grade security' },
      { title: 'Scalable', desc: 'Grows with your business' },
    ],
  },
  text: { content: 'Your content goes here...' },
  image: { src: '', alt: 'Image' },
  cta: { headline: 'Ready to get started?', buttonText: 'Sign Up Now', buttonUrl: '#' },
  testimonial: { items: [{ name: 'Jane Doe', role: 'CEO', quote: 'Amazing product!' }] },
  pricing: {
    title: 'Pricing',
    plans: [
      { name: 'Starter', price: '$9/mo', features: ['Feature 1', 'Feature 2'] },
      { name: 'Pro', price: '$29/mo', features: ['Everything in Starter', 'Feature 3', 'Feature 4'] },
    ],
  },
  faq: { title: 'FAQ', items: [{ q: 'How does it work?', a: 'It just works!' }] },
  form: { title: 'Contact Us', fields: ['Name', 'Email', 'Message'] },
  footer: { brand: 'YourBrand', links: ['Privacy', 'Terms', 'Contact'] },
  gallery: { images: [] },
  stats: {
    items: [
      { value: '10K+', label: 'Users' },
      { value: '99.9%', label: 'Uptime' },
      { value: '50+', label: 'Countries' },
    ],
  },
  video: { url: '', title: 'Watch Demo' },
};

const createBlockFromDefinition = (
  type: LandingPageBlockType,
  content?: Record<string, any>,
  styles?: Record<string, any>
): LandingPageBlock => ({
  id: crypto.randomUUID(),
  type,
  content: { ...clone(DEFAULT_LANDING_BLOCK_CONTENT[type] || {}), ...(content || {}) },
  styles: { ...(styles || {}) },
});

export const createLandingPageBlock = (
  type: LandingPageBlockType,
  overrides?: { content?: Record<string, any>; styles?: Record<string, any> }
) => createBlockFromDefinition(type, overrides?.content, overrides?.styles);

export const LANDING_PAGE_TEMPLATES: LandingPageTemplateDefinition[] = [
  {
    id: 'saas-launch',
    name: 'SaaS Launch',
    description: 'Product-focused page with value props, pricing, and FAQ.',
    blocks: [
      {
        type: 'navbar',
        content: { brand: 'FlowPilot', links: ['Product', 'Customers', 'Pricing', 'Login'] },
      },
      {
        type: 'hero',
        content: {
          headline: 'Run smarter outbound in one workspace',
          subheadline: 'Automate campaigns, enrich leads, and ship more pipeline without hiring more reps.',
          ctaText: 'Start Free Trial',
          ctaUrl: '/auth',
        },
      },
      {
        type: 'stats',
        content: {
          items: [
            { value: '2.1M', label: 'Emails sent' },
            { value: '43%', label: 'Average reply lift' },
            { value: '18 min', label: 'Setup time' },
          ],
        },
      },
      {
        type: 'features',
        content: {
          title: 'Everything your team needs',
          items: [
            { title: 'Smart Sequences', desc: 'Branching flows based on opens, replies, and events.' },
            { title: 'Inbox Co-Pilot', desc: 'AI drafting and suggested follow-ups inside one inbox.' },
            { title: 'Team Governance', desc: 'Shared templates, approvals, and workspace controls.' },
          ],
        },
      },
      {
        type: 'pricing',
        content: {
          title: 'Simple pricing',
          plans: [
            { name: 'Starter', price: '$49/mo', features: ['2 seats', '5k contacts', 'Basic automation'] },
            { name: 'Growth', price: '$129/mo', features: ['10 seats', '25k contacts', 'AI workflows'] },
            { name: 'Scale', price: 'Custom', features: ['Unlimited seats', 'SLA support', 'SSO + audit logs'] },
          ],
        },
      },
      {
        type: 'testimonial',
        content: {
          items: [
            {
              name: 'Avery Shaw',
              role: 'VP Revenue, Northline',
              quote: 'We replaced four tools and doubled booked meetings in six weeks.',
            },
          ],
        },
      },
      {
        type: 'faq',
        content: {
          title: 'Frequently asked questions',
          items: [
            { q: 'Do you offer onboarding?', a: 'Yes, every paid plan includes live onboarding.' },
            { q: 'Can I import from CSV?', a: 'Yes, import contacts and map fields in seconds.' },
            { q: 'Do you support custom domains?', a: 'Yes, connect and publish to your own domain.' },
          ],
        },
      },
      {
        type: 'cta',
        content: { headline: 'Ready to see it in action?', buttonText: 'Book Demo', buttonUrl: '/dashboard' },
      },
      {
        type: 'footer',
        content: { brand: 'FlowPilot', links: ['Privacy', 'Terms', 'Status'] },
      },
    ],
  },
  {
    id: 'agency-services',
    name: 'Agency Services',
    description: 'Consulting-style page with outcomes, proof, and lead form.',
    blocks: [
      {
        type: 'navbar',
        content: { brand: 'BrightForge', links: ['Services', 'Case Studies', 'Process', 'Contact'] },
      },
      {
        type: 'hero',
        content: {
          headline: 'We build outbound engines that scale',
          subheadline: 'Strategy, systems, and execution for B2B teams that need predictable pipeline.',
          ctaText: 'Get Proposal',
          ctaUrl: '#contact',
        },
      },
      {
        type: 'text',
        content: {
          content:
            'From ICP refinement to campaign operations, we run the full outbound motion and report weekly on results.',
        },
      },
      {
        type: 'features',
        content: {
          title: 'What we deliver',
          items: [
            { title: 'Market Positioning', desc: 'Tight messaging for each segment and persona.' },
            { title: 'Campaign Ops', desc: 'Multichannel sequencing with clean data and QA.' },
            { title: 'Sales Enablement', desc: 'Playbooks your team can own long-term.' },
          ],
        },
      },
      {
        type: 'testimonial',
        content: {
          items: [
            {
              name: 'Marcus Lee',
              role: 'Founder, SignalOps',
              quote: 'Their team became an extension of ours and tripled SQL volume.',
            },
          ],
        },
      },
      {
        type: 'cta',
        content: { headline: 'Want a pipeline audit?', buttonText: 'Request Audit', buttonUrl: '#contact' },
      },
      {
        type: 'form',
        content: { title: 'Tell us about your goals', fields: ['Name', 'Work Email', 'Company', 'Target ACV'] },
      },
      {
        type: 'footer',
        content: { brand: 'BrightForge', links: ['LinkedIn', 'Privacy', 'Terms'] },
      },
    ],
  },
  {
    id: 'event-webinar',
    name: 'Webinar Registration',
    description: 'Event signup page with video teaser, schedule, and FAQs.',
    blocks: [
      {
        type: 'hero',
        content: {
          headline: 'Join the 2026 Outbound Playbook Live',
          subheadline: 'A tactical 60-minute session on sequences, AI prompts, and conversion tuning.',
          ctaText: 'Reserve My Seat',
          ctaUrl: '#register',
        },
      },
      {
        type: 'stats',
        content: {
          items: [
            { value: 'Mar 26', label: 'Event Date' },
            { value: '60 min', label: 'Live Session' },
            { value: '3', label: 'Guest Speakers' },
          ],
        },
      },
      {
        type: 'video',
        content: {
          title: 'Watch the teaser',
          url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        },
      },
      {
        type: 'gallery',
        content: {
          images: [
            'https://images.unsplash.com/photo-1542744173-8e7e53415bb0?auto=format&fit=crop&w=800&q=80',
            'https://images.unsplash.com/photo-1511578314322-379afb476865?auto=format&fit=crop&w=800&q=80',
            'https://images.unsplash.com/photo-1552664730-d307ca884978?auto=format&fit=crop&w=800&q=80',
          ],
        },
      },
      {
        type: 'faq',
        content: {
          title: 'Before you register',
          items: [
            { q: 'Will there be a replay?', a: 'Yes, replay is sent to all attendees.' },
            { q: 'Is it beginner friendly?', a: 'Yes, we cover fundamentals and advanced tactics.' },
          ],
        },
      },
      {
        type: 'form',
        content: { title: 'Save your spot', fields: ['Name', 'Work Email', 'Company'] },
      },
      {
        type: 'footer',
        content: { brand: 'Outbound Summit', links: ['Contact', 'Terms', 'Privacy'] },
      },
    ],
  },
  {
    id: 'lead-magnet',
    name: 'Lead Magnet',
    description: 'Simple opt-in page for ebook, checklist, or downloadable asset.',
    blocks: [
      {
        type: 'hero',
        content: {
          headline: 'Download the GTM Playbook',
          subheadline: '50 pages of frameworks, scripts, and KPI targets used by top-performing teams.',
          ctaText: 'Get the Playbook',
          ctaUrl: '#download',
        },
      },
      {
        type: 'image',
        content: {
          src: 'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&w=1200&q=80',
          alt: 'Playbook preview',
        },
      },
      {
        type: 'features',
        content: {
          title: "What's inside",
          items: [
            { title: 'Positioning Matrix', desc: 'Nail value messaging by audience segment.' },
            { title: 'Sequence Blueprint', desc: '5-day email framework with personalization examples.' },
            { title: 'Reporting Stack', desc: 'Weekly dashboard metrics your team should track.' },
          ],
        },
      },
      {
        type: 'form',
        content: { title: 'Get instant access', fields: ['First Name', 'Work Email'] },
      },
      {
        type: 'testimonial',
        content: {
          items: [
            {
              name: 'Nina Patel',
              role: 'Growth Lead, Arcline',
              quote: 'This is the most practical outbound resource our team has used.',
            },
          ],
        },
      },
      {
        type: 'footer',
        content: { brand: 'GTM Labs', links: ['Privacy', 'Support'] },
      },
    ],
  },
];

export const DEFAULT_LANDING_PAGE_TEMPLATE_ID = LANDING_PAGE_TEMPLATES[0]?.id || '';

export const getLandingPageTemplateById = (templateId: string) =>
  LANDING_PAGE_TEMPLATES.find((template) => template.id === templateId);

export const buildLandingPageTemplateBlocks = (
  template: LandingPageTemplateDefinition
): LandingPageBlock[] => template.blocks.map((definition) => createBlockFromDefinition(definition.type, definition.content, definition.styles));

import { type LandingPageBlock, type LandingPageBlockType } from '@/lib/landingPagesPersistence';
import {
  DEFAULT_LANDING_PAGE_FORM_CONTENT,
  createLandingPageFormField,
} from '@/lib/landingPageForms';
import {
  buildLandingPageSettingsFromPreset,
  type LandingPageSettings,
} from '@/lib/landingPageSettings';

export interface LandingPageTemplateDefinition {
  id: string;
  name: string;
  description: string;
  settings?: Partial<LandingPageSettings> & { themePresetId?: string };
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
  form: { ...DEFAULT_LANDING_PAGE_FORM_CONTENT },
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
  logos: {
    title: 'Trusted by teams moving pipeline faster',
    items: [{ name: 'Northwind' }, { name: 'Atlas' }, { name: 'Harbor' }, { name: 'Crescent' }],
  },
  steps: {
    title: 'How it works',
    items: [
      { title: 'Capture intent', desc: 'Turn traffic into enriched leads with one form.' },
      { title: 'Qualify automatically', desc: 'Route high-intent submissions into the right list and workflow.' },
      { title: 'Convert faster', desc: 'Move context into your sales process without manual copy/paste.' },
    ],
  },
  comparison: {
    title: 'Why teams switch',
    columns: [
      { key: 'legacy', label: 'Legacy stack' },
      { key: 'modern', label: 'This flow' },
    ],
    rows: [
      { feature: 'Page launch speed', legacy: 'Days', modern: 'Minutes' },
      { feature: 'Lead routing', legacy: 'Manual', modern: 'Automatic' },
      { feature: 'Optimization', legacy: 'Guesswork', modern: 'Built-in analytics' },
    ],
  },
  countdown: {
    label: 'Launch window',
    endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    buttonText: 'Claim access',
    buttonUrl: '#contact',
  },
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

export const buildLandingPageTemplateSettings = (template: LandingPageTemplateDefinition) =>
  buildLandingPageSettingsFromPreset(template.settings?.themePresetId || 'signal', template.settings);

export const LANDING_PAGE_TEMPLATES: LandingPageTemplateDefinition[] = [
  {
    id: 'saas-launch',
    name: 'SaaS Launch',
    description: 'Product-focused page with value props, pricing, and FAQ.',
    settings: {
      themePresetId: 'signal',
      announcementBar: {
        enabled: true,
        text: 'Q2 launch special: onboarding credits for the first 25 teams.',
        ctaText: 'See plans',
        ctaUrl: '#pricing',
      },
      stickyCta: {
        enabled: true,
        label: 'Want your outbound stack in one workspace?',
        buttonText: 'Start free trial',
        buttonUrl: '/auth',
      },
      seo: {
        title: 'FlowPilot | Convert outbound traffic into pipeline',
        description: 'Launch conversion-focused landing pages with analytics, smart forms, and campaign-ready follow-up.',
        keywords: ['landing page builder', 'outbound conversion', 'lead capture'],
        ogImageUrl: '',
        canonicalUrl: '',
      },
    },
    blocks: [
      {
        type: 'navbar',
        content: {
          brand: 'FlowPilot',
          links: ['Product', 'Customers', 'Pricing', 'FAQ'],
          ctaText: 'Start trial',
          ctaUrl: '/auth',
        },
      },
      {
        type: 'hero',
        content: {
          badge: 'Conversion OS for modern GTM teams',
          headline: 'Run smarter outbound in one workspace',
          subheadline: 'Automate campaigns, enrich leads, and ship more pipeline without hiring more reps.',
          ctaText: 'Start Free Trial',
          ctaUrl: '/auth',
          secondaryCtaText: 'Book demo',
          secondaryCtaUrl: '#contact',
          highlights: ['Smart routing', 'Query-param personalization', 'Built-in analytics'],
        },
      },
      {
        type: 'logos',
        content: {
          title: 'Trusted by revenue teams scaling with precision',
          items: [{ name: 'Northwind' }, { name: 'Atlas' }, { name: 'Harbor' }, { name: 'Apollo Ridge' }],
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
          description: 'Build pages, capture intent, and route the next action from one system.',
          items: [
            { title: 'Smart Sequences', desc: 'Branching flows based on opens, replies, and events.', bullets: ['Event triggers', 'Reply-aware paths', 'Audience routing'] },
            { title: 'Inbox Co-Pilot', desc: 'AI drafting and suggested follow-ups inside one inbox.', bullets: ['Draft assistance', 'Context threads', 'Quality checks'] },
            { title: 'Team Governance', desc: 'Shared templates, approvals, and workspace controls.', bullets: ['Approval rules', 'Workspace limits', 'Audit history'] },
          ],
        },
      },
      {
        type: 'steps',
        content: {
          title: 'From click to qualified lead in three moves',
          items: [
            { title: 'Launch a page', desc: 'Choose a template, apply your brand theme, and publish in minutes.' },
            { title: 'Capture and qualify', desc: 'Collect context-rich submissions with consent, redirects, and asset delivery.' },
            { title: 'Trigger follow-up', desc: 'Push the lead to the right list and activate the next campaign or workflow.' },
          ],
        },
      },
      {
        type: 'comparison',
        content: {
          title: 'Why teams switch from generic builders',
          columns: [
            { key: 'generic', label: 'Generic page builder' },
            { key: 'flowpilot', label: 'FlowPilot' },
          ],
          rows: [
            { feature: 'Lead destination', generic: 'Manual export', flowpilot: 'List + prospect sync' },
            { feature: 'Personalization', generic: 'Static copy', flowpilot: 'Query-driven copy' },
            { feature: 'Optimization', generic: 'Vanity metrics', flowpilot: 'Views, clicks, conversions' },
          ],
        },
      },
      {
        type: 'pricing',
        content: {
          title: 'Simple pricing',
          plans: [
            { name: 'Starter', price: '$49/mo', features: ['2 seats', '5k contacts', 'Basic automation'], ctaText: 'Start starter', ctaUrl: '/auth' },
            { name: 'Growth', price: '$129/mo', features: ['10 seats', '25k contacts', 'AI workflows'], ctaText: 'Choose growth', ctaUrl: '/auth', featured: true },
            { name: 'Scale', price: 'Custom', features: ['Unlimited seats', 'SLA support', 'SSO + audit logs'], ctaText: 'Talk to sales', ctaUrl: '#contact' },
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
        content: { headline: 'Ready to see it in action?', body: 'Spin up a branded landing page and route the next lead automatically.', buttonText: 'Book Demo', buttonUrl: '#contact' },
      },
      {
        type: 'form',
        content: {
          ...DEFAULT_LANDING_PAGE_FORM_CONTENT,
          title: 'Request a tailored walkthrough',
          description: 'Share your team size, stack, and goals so we can map the best setup.',
          buttonText: 'Request walkthrough',
          successMessage: 'Thanks. We are reviewing your request now.',
          anchorId: 'contact',
          requireConsent: true,
          consentLabel: 'I agree to receive follow-up emails about my request.',
          fields: [
            createLandingPageFormField({ id: 'name', key: 'name', label: 'Full name', type: 'text', placeholder: 'Jordan Lee', required: true }),
            createLandingPageFormField({ id: 'email', key: 'email', label: 'Work email', type: 'email', placeholder: 'jordan@company.com', required: true }),
            createLandingPageFormField({ id: 'company', key: 'company', label: 'Company', type: 'text', placeholder: '{{company|Northwind}}' }),
            createLandingPageFormField({ id: 'job_title', key: 'job_title', label: 'Role', type: 'text', placeholder: 'Head of Growth' }),
          ],
        },
      },
      {
        type: 'footer',
        content: { brand: 'FlowPilot', tagline: 'The conversion system for modern outbound teams.', links: ['Privacy', 'Terms', 'Status'] },
      },
    ],
  },
  {
    id: 'agency-services',
    name: 'Agency Services',
    description: 'Consulting-style page with outcomes, proof, and lead form.',
    settings: {
      themePresetId: 'ember',
      stickyCta: {
        enabled: true,
        label: 'Need a pipeline audit?',
        buttonText: 'Request proposal',
        buttonUrl: '#contact',
      },
      seo: {
        title: 'BrightForge | Outbound systems for B2B teams',
        description: 'Strategy, systems, and execution for outbound teams that need repeatable pipeline.',
        keywords: ['outbound consulting', 'pipeline systems', 'revenue operations'],
        ogImageUrl: '',
        canonicalUrl: '',
      },
    },
    blocks: [
      {
        type: 'navbar',
        content: { brand: 'BrightForge', links: ['Services', 'Proof', 'Process', 'Contact'], ctaText: 'Request proposal', ctaUrl: '#contact' },
      },
      {
        type: 'hero',
        content: {
          badge: 'Fractional RevOps + outbound execution',
          headline: 'We build outbound engines that scale',
          subheadline: 'Strategy, systems, and execution for B2B teams that need predictable pipeline.',
          ctaText: 'Get Proposal',
          ctaUrl: '#contact',
          secondaryCtaText: 'See process',
          secondaryCtaUrl: '#process',
          highlights: ['ICP refinement', 'Sequence operations', 'Weekly reporting'],
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
        type: 'logos',
        content: {
          title: 'Teams we have supported',
          items: [{ name: 'SignalOps' }, { name: 'Northline' }, { name: 'Aperture' }, { name: 'Blue Canvas' }],
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
        type: 'steps',
        content: {
          title: 'Our process',
          description: 'We operate like an embedded growth team with weekly execution accountability.',
          items: [
            { title: 'Audit the current motion', desc: 'Messaging, data quality, sender setup, and conversion bottlenecks.' },
            { title: 'Build the operating system', desc: 'Templates, workflows, reporting, and CRM handoff rules.' },
            { title: 'Scale with weekly feedback', desc: 'Conversion reviews, offer testing, and pipeline reporting.' },
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
        content: {
          ...DEFAULT_LANDING_PAGE_FORM_CONTENT,
          title: 'Tell us about your goals',
          description: 'Share your team context and we will come back with a tailored proposal.',
          buttonText: 'Request proposal',
          successMessage: 'Thanks. We will review your goals and get back to you shortly.',
          anchorId: 'contact',
          requireConsent: true,
          consentLabel: 'I consent to BrightForge contacting me about this proposal request.',
          fields: [
            createLandingPageFormField({
              id: 'name',
              key: 'name',
              label: 'Full name',
              type: 'text',
              placeholder: 'Jordan Lee',
              required: true,
            }),
            createLandingPageFormField({
              id: 'email',
              key: 'email',
              label: 'Work email',
              type: 'email',
              placeholder: 'jordan@company.com',
              required: true,
            }),
            createLandingPageFormField({
              id: 'company',
              key: 'company',
              label: 'Company',
              type: 'text',
              placeholder: 'Northwind',
              required: true,
            }),
            createLandingPageFormField({
              id: 'job_title',
              key: 'job_title',
              label: 'Role',
              type: 'text',
              placeholder: 'Head of Growth',
            }),
            createLandingPageFormField({
              id: 'message',
              key: 'message',
              label: 'What do you need help with?',
              type: 'textarea',
              placeholder: 'Describe your goals, current stack, or timing.',
            }),
          ],
        },
      },
      {
        type: 'footer',
        content: { brand: 'BrightForge', tagline: 'Strategy, systems, and execution for modern revenue teams.', links: ['LinkedIn', 'Privacy', 'Terms'] },
      },
    ],
  },
  {
    id: 'event-webinar',
    name: 'Webinar Registration',
    description: 'Event signup page with video teaser, schedule, and FAQs.',
    settings: {
      themePresetId: 'midnight',
      announcementBar: {
        enabled: true,
        text: 'Seats are limited for the live workshop on March 26.',
        ctaText: 'Reserve now',
        ctaUrl: '#register',
      },
      seo: {
        title: 'Outbound Playbook Live | Register for the webinar',
        description: 'Join a tactical live session on AI prompts, outbound systems, and conversion tuning.',
        keywords: ['webinar landing page', 'register event', 'outbound playbook'],
        ogImageUrl: '',
        canonicalUrl: '',
      },
    },
    blocks: [
      {
        type: 'hero',
        content: {
          badge: 'Live session for B2B growth leaders',
          headline: 'Join the 2026 Outbound Playbook Live',
          subheadline: 'A tactical 60-minute session on sequences, AI prompts, and conversion tuning.',
          ctaText: 'Reserve My Seat',
          ctaUrl: '#register',
          highlights: ['March 26', '60 minutes', 'Replay included'],
        },
      },
      {
        type: 'countdown',
        content: {
          label: 'Registration closes soon',
          endDate: '2026-03-26T16:00:00.000Z',
          buttonText: 'Reserve my seat',
          buttonUrl: '#register',
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
        type: 'steps',
        content: {
          title: 'What you will leave with',
          items: [
            { title: 'A clean messaging framework', desc: 'Translate positioning into landing-page and outbound copy that converts.' },
            { title: 'A practical automation map', desc: 'See how the best teams route leads and trigger follow-up in real time.' },
            { title: 'An optimization checklist', desc: 'Know what to measure after launch and what to change next.' },
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
        content: {
          ...DEFAULT_LANDING_PAGE_FORM_CONTENT,
          title: 'Save your spot',
          description: 'Register once and we will send the calendar invite and replay details.',
          buttonText: 'Reserve my seat',
          successMessage: 'You are in. Check your inbox for confirmation details.',
          anchorId: 'register',
          successRedirectUrl: '',
          successAssetUrl: '/platform/workflow-automation-map.svg',
          requireConsent: true,
          consentLabel: 'I agree to receive event reminders and related follow-up.',
          fields: [
            createLandingPageFormField({
              id: 'name',
              key: 'name',
              label: 'Full name',
              type: 'text',
              placeholder: 'Jordan Lee',
              required: true,
            }),
            createLandingPageFormField({
              id: 'email',
              key: 'email',
              label: 'Work email',
              type: 'email',
              placeholder: 'jordan@company.com',
              required: true,
            }),
            createLandingPageFormField({
              id: 'company',
              key: 'company',
              label: 'Company',
              type: 'text',
              placeholder: 'Northwind',
            }),
          ],
        },
      },
      {
        type: 'footer',
        content: { brand: 'Outbound Summit', tagline: 'Tactical workshops for revenue teams that execute fast.', links: ['Contact', 'Terms', 'Privacy'] },
      },
    ],
  },
  {
    id: 'lead-magnet',
    name: 'Lead Magnet',
    description: 'Simple opt-in page for ebook, checklist, or downloadable asset.',
    settings: {
      themePresetId: 'grove',
      stickyCta: {
        enabled: true,
        label: 'Want the playbook in your inbox?',
        buttonText: 'Get the guide',
        buttonUrl: '#download',
      },
    },
    blocks: [
      {
        type: 'hero',
        content: {
          badge: 'Operator-approved resource',
          headline: 'Download the GTM Playbook',
          subheadline: '50 pages of frameworks, scripts, and KPI targets used by top-performing teams.',
          ctaText: 'Get the Playbook',
          ctaUrl: '#download',
          highlights: ['50 pages', 'Benchmarks included', 'Instant delivery'],
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
        type: 'comparison',
        content: {
          title: 'What this guide helps you fix',
          columns: [
            { key: 'before', label: 'Before' },
            { key: 'after', label: 'After' },
          ],
          rows: [
            { feature: 'Messaging', before: 'Generic claims', after: 'Audience-specific positioning' },
            { feature: 'Reporting', before: 'Disconnected spreadsheets', after: 'Clear weekly operating metrics' },
            { feature: 'Execution', before: 'Manual handoffs', after: 'Repeatable campaign process' },
          ],
        },
      },
      {
        type: 'form',
        content: {
          ...DEFAULT_LANDING_PAGE_FORM_CONTENT,
          title: 'Get instant access',
          description: 'Enter your details and we will send the resource right away.',
          buttonText: 'Send me the guide',
          successMessage: 'Thanks. The resource is on its way.',
          anchorId: 'download',
          successAssetUrl: '/templates/email-accounts-sample.xlsx',
          requireConsent: true,
          consentLabel: 'I agree to receive the guide and occasional related updates.',
          fields: [
            createLandingPageFormField({
              id: 'name',
              key: 'name',
              label: 'First name',
              type: 'text',
              placeholder: 'Jordan',
              required: true,
            }),
            createLandingPageFormField({
              id: 'email',
              key: 'email',
              label: 'Work email',
              type: 'email',
              placeholder: 'jordan@company.com',
              required: true,
            }),
            createLandingPageFormField({
              id: 'company',
              key: 'company',
              label: 'Company',
              type: 'text',
              placeholder: 'Northwind',
            }),
          ],
        },
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
        content: { brand: 'GTM Labs', tagline: 'Resources and systems for better outbound execution.', links: ['Privacy', 'Support'] },
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

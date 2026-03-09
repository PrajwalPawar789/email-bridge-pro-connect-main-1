import type { EmailBuilderBlock, EmailBuilderBlockType } from '@/lib/emailBuilderPersistence';

export type EmailBuilderStarterPreset = {
  id: string;
  label: string;
  description: string;
  blocks: () => EmailBuilderBlock[];
};

const cloneValue = <T,>(value: T): T => {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
};

const DEFAULT_BLOCK_STYLES = {
  padding: '16px',
  backgroundColor: 'transparent',
};

const defaultContent: Record<EmailBuilderBlockType, Record<string, any>> = {
  heading: { text: 'Your Heading', html: '<b>Your Heading</b>', level: 'h2' },
  text: { text: 'Write your content here...', html: 'Write your content here...' },
  image: { src: '', alt: 'Image', width: '100%' },
  button: {
    text: 'Click Here',
    url: '#',
    align: 'center',
    bgColor: '#2a9d6e',
    textColor: '#ffffff',
    borderRadius: '8px',
    buttonPadding: '10px 24px',
  },
  divider: { color: '#e5e5e5', thickness: 1, style: 'solid' },
  spacer: { height: 24 },
  columns: {
    count: 2,
    content: [
      { text: 'Column 1', html: 'Column 1' },
      { text: 'Column 2', html: 'Column 2' },
    ],
  },
  table: {
    rows: 3,
    cols: 3,
    data: [
      ['Header 1', 'Header 2', 'Header 3'],
      ['Cell 1', 'Cell 2', 'Cell 3'],
      ['Cell 4', 'Cell 5', 'Cell 6'],
    ],
  },
  quote: { text: '"Your quote goes here..."', html: '<em>"Your quote goes here..."</em>', author: 'Author Name' },
  code: { text: 'const greeting = "Hello!";', html: '<code>const greeting = "Hello!";</code>', language: 'javascript' },
  signature: { text: 'Best regards,\nYour Name\nTitle | Company', html: 'Best regards,<br><b>Your Name</b><br>Title | Company' },
  video: { url: '', thumbnail: '', title: 'Watch the video' },
  social: {
    links: [
      { platform: 'twitter', url: '' },
      { platform: 'linkedin', url: '' },
      { platform: 'facebook', url: '' },
    ],
  },
  countdown: { targetDate: '', label: 'Offer ends in' },
  bookmark: { title: 'Bookmarked Link', url: '#', description: 'A short description of the link' },
};

export const createEmailBuilderBlock = (
  type: EmailBuilderBlockType,
  overrides?: Partial<EmailBuilderBlock>
): EmailBuilderBlock => ({
  id: overrides?.id || crypto.randomUUID(),
  type,
  content: {
    ...cloneValue(defaultContent[type]),
    ...(overrides?.content || {}),
  },
  styles: {
    ...DEFAULT_BLOCK_STYLES,
    ...(overrides?.styles || {}),
  },
});

export const duplicateEmailBuilderBlock = (block: EmailBuilderBlock): EmailBuilderBlock => ({
  ...cloneValue(block),
  id: crypto.randomUUID(),
});

export const EMAIL_BUILDER_STARTER_PRESETS: EmailBuilderStarterPreset[] = [
  {
    id: 'intro-cta',
    label: 'Intro + CTA',
    description: 'Short outreach email with a clear ask.',
    blocks: () => [
      createEmailBuilderBlock('heading', {
        content: { text: 'Quick question about your team', html: 'Quick question about your team', level: 'h2' },
      }),
      createEmailBuilderBlock('text', {
        content: {
          text: 'Hi {{first_name}},\n\nI noticed {{company}} is growing and wanted to share an idea that could help your team move faster without adding extra process.',
          html:
            '<p>Hi {{first_name}},</p><p>I noticed {{company}} is growing and wanted to share an idea that could help your team move faster without adding extra process.</p>',
        },
      }),
      createEmailBuilderBlock('button', {
        content: {
          text: 'Open my calendar',
          url: 'https://example.com',
          align: 'left',
          bgColor: '#0f766e',
        },
      }),
      createEmailBuilderBlock('signature', {
        content: {
          text: 'Best regards,\nYour Name\nYour Company',
          html: 'Best regards,<br><b>Your Name</b><br>Your Company',
        },
      }),
    ],
  },
  {
    id: 'feature-spotlight',
    label: 'Feature Spotlight',
    description: 'Hero message with supporting points and proof.',
    blocks: () => [
      createEmailBuilderBlock('heading', {
        content: { text: 'Launch faster with fewer follow-ups', html: 'Launch faster with fewer follow-ups', level: 'h1' },
      }),
      createEmailBuilderBlock('text', {
        content: {
          text: 'A compact announcement format for product updates, launches, and customer education.',
          html: '<p>A compact announcement format for product updates, launches, and customer education.</p>',
        },
      }),
      createEmailBuilderBlock('columns', {
        content: {
          count: 2,
          content: [
            { text: 'Feature highlight\nExplain the strongest value in one short paragraph.' },
            { text: 'Proof point\nAdd a metric, testimonial, or use case that reduces hesitation.' },
          ],
        },
      }),
      createEmailBuilderBlock('button', {
        content: {
          text: 'See what changed',
          url: 'https://example.com',
          align: 'center',
          bgColor: '#1d4ed8',
        },
      }),
    ],
  },
  {
    id: 'newsletter',
    label: 'Newsletter',
    description: 'Structured update with sections, link cards, and closing.',
    blocks: () => [
      createEmailBuilderBlock('heading', {
        content: { text: 'This week at your company', html: 'This week at your company', level: 'h2' },
      }),
      createEmailBuilderBlock('divider'),
      createEmailBuilderBlock('text', {
        content: {
          text: 'Open with one editorial sentence that tells readers what is worth paying attention to this week.',
          html: '<p>Open with one editorial sentence that tells readers what is worth paying attention to this week.</p>',
        },
      }),
      createEmailBuilderBlock('bookmark', {
        content: {
          title: 'Featured story',
          url: 'https://example.com/story',
          description: 'Point readers to the main article, release, or announcement.',
        },
      }),
      createEmailBuilderBlock('bookmark', {
        content: {
          title: 'Secondary update',
          url: 'https://example.com/update',
          description: 'Use a second bookmark for supporting news or a resource.',
        },
      }),
      createEmailBuilderBlock('signature', {
        content: {
          text: 'See you next week,\nThe Editorial Team',
          html: 'See you next week,<br><b>The Editorial Team</b>',
        },
      }),
    ],
  },
];

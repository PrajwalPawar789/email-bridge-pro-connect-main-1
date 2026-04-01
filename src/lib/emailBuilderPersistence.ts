import { supabase } from '@/integrations/supabase/client';
import { buildEmailEmbeddingText, indexAiBuilderObject } from '@/lib/aiBuilder';

export type EmailBuilderFormat = 'plain' | 'html';

export type EmailBuilderBlockType =
  | 'text'
  | 'image'
  | 'button'
  | 'divider'
  | 'spacer'
  | 'columns'
  | 'heading'
  | 'video'
  | 'social'
  | 'countdown'
  | 'table'
  | 'quote'
  | 'code'
  | 'signature'
  | 'bookmark';

export interface EmailBuilderBlock {
  id: string;
  type: EmailBuilderBlockType;
  content: Record<string, any>;
  styles: Record<string, any>;
}

export interface EmailBuilderTheme {
  width: number;
  bodyBackground: string;
  contentBackground: string;
  textColor: string;
  headingColor: string;
  linkColor: string;
  fontFamily: string;
}

export const DEFAULT_EMAIL_BUILDER_THEME: EmailBuilderTheme = {
  width: 640,
  bodyBackground: '#f8fafc',
  contentBackground: '#ffffff',
  textColor: '#0f172a',
  headingColor: '#0f172a',
  linkColor: '#0f766e',
  fontFamily: 'Arial, Helvetica, sans-serif',
};

export interface EmailBuilderTemplate {
  id: string;
  name: string;
  subject: string;
  preheader: string;
  format: EmailBuilderFormat;
  blocks: EmailBuilderBlock[];
  rawHtml?: string;
  clickTrackingMode?: 'all' | 'selected' | 'none';
  trackedLinkUrls?: string[];
  audience: string;
  voice: string;
  goal: string;
  theme: EmailBuilderTheme;
  createdAt: Date;
}

const DEFAULT_AUDIENCE = 'All';
const DEFAULT_VOICE = 'Professional';
const DEFAULT_GOAL = 'Cold outreach';
const EMAIL_BUILDER_STATE_REGEX = /<!--\s*IntentAtlas_EMAIL_BUILDER_STATE:([\s\S]*?)-->/;

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const toBase64 = (value: string) => {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
};

const fromBase64 = (value: string) => {
  const binary = atob(value.replace(/\s+/g, ''));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
};

const stripHtml = (value: string) =>
  value
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h1|h2|h3|h4|h5|h6|li|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const plainTextToHtml = (value: string) => escapeHtml(value).replace(/\n/g, '<br />');
const sanitizeEmailHtml = (value: string) =>
  String(value || '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .trim();

const toKebabCase = (value: string) => value.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`);

const stylesToInline = (styles: Record<string, any>) =>
  Object.entries(styles || {})
    .filter(([, rawValue]) => rawValue !== null && rawValue !== undefined && rawValue !== '')
    .map(([key, rawValue]) => `${toKebabCase(key)}:${String(rawValue)}`)
    .join(';');

const normalizeBlockType = (value: string): EmailBuilderBlockType => {
  const known: EmailBuilderBlockType[] = [
    'text',
    'image',
    'button',
    'divider',
    'spacer',
    'columns',
    'heading',
    'video',
    'social',
    'countdown',
    'table',
    'quote',
    'code',
    'signature',
    'bookmark',
  ];
  return known.includes(value as EmailBuilderBlockType) ? (value as EmailBuilderBlockType) : 'text';
};

const normalizeBlock = (block: any): EmailBuilderBlock => ({
  id: String(block?.id || crypto.randomUUID()),
  type: normalizeBlockType(String(block?.type || 'text')),
  content: block?.content && typeof block.content === 'object' ? block.content : {},
  styles: block?.styles && typeof block.styles === 'object' ? block.styles : {},
});

const normalizeBlocks = (value: any): EmailBuilderBlock[] => {
  if (!Array.isArray(value)) return [];
  return value.map(normalizeBlock);
};

const clampNumber = (value: unknown, fallback: number, min: number, max: number) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, Math.round(numeric)));
};

const normalizeTheme = (value: any): EmailBuilderTheme => {
  const theme = value && typeof value === 'object' ? value : {};
  return {
    width: clampNumber(theme.width, DEFAULT_EMAIL_BUILDER_THEME.width, 360, 960),
    bodyBackground:
      typeof theme.bodyBackground === 'string' && theme.bodyBackground.trim()
        ? theme.bodyBackground
        : DEFAULT_EMAIL_BUILDER_THEME.bodyBackground,
    contentBackground:
      typeof theme.contentBackground === 'string' && theme.contentBackground.trim()
        ? theme.contentBackground
        : DEFAULT_EMAIL_BUILDER_THEME.contentBackground,
    textColor:
      typeof theme.textColor === 'string' && theme.textColor.trim()
        ? theme.textColor
        : DEFAULT_EMAIL_BUILDER_THEME.textColor,
    headingColor:
      typeof theme.headingColor === 'string' && theme.headingColor.trim()
        ? theme.headingColor
        : DEFAULT_EMAIL_BUILDER_THEME.headingColor,
    linkColor:
      typeof theme.linkColor === 'string' && theme.linkColor.trim()
        ? theme.linkColor
        : DEFAULT_EMAIL_BUILDER_THEME.linkColor,
    fontFamily:
      typeof theme.fontFamily === 'string' && theme.fontFamily.trim()
        ? theme.fontFamily
        : DEFAULT_EMAIL_BUILDER_THEME.fontFamily,
  };
};

const normalizeClickTrackingMode = (value: unknown): 'all' | 'selected' | 'none' => {
  if (value === 'selected' || value === 'none') return value;
  return 'all';
};

const normalizeTrackedLinkUrls = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item || '').trim())
    .filter(Boolean);
};

const fallbackBlocksFromTemplate = (content: string, isHtml: boolean): EmailBuilderBlock[] => {
  if (!content.trim()) return [];

  if (isHtml) {
    const cleanHtml = content.replace(EMAIL_BUILDER_STATE_REGEX, '').trim();
    return [
      {
        id: crypto.randomUUID(),
        type: 'text',
        content: {
          html: cleanHtml,
          text: stripHtml(cleanHtml),
        },
        styles: { padding: '16px', backgroundColor: 'transparent' },
      },
    ];
  }

  return [
    {
      id: crypto.randomUUID(),
      type: 'text',
      content: {
        text: content,
        html: plainTextToHtml(content),
      },
      styles: { padding: '16px', backgroundColor: 'transparent' },
    },
  ];
};

const extractBuilderState = (html: string) => {
  const match = html.match(EMAIL_BUILDER_STATE_REGEX);
  if (!match?.[1]) {
    return {
      cleanHtml: html,
      blocks: [] as EmailBuilderBlock[],
      preheader: '',
      audience: DEFAULT_AUDIENCE,
      voice: DEFAULT_VOICE,
      goal: DEFAULT_GOAL,
      format: 'html' as EmailBuilderFormat,
      theme: normalizeTheme(null),
      clickTrackingMode: 'all' as const,
      trackedLinkUrls: [] as string[],
    };
  }

  const cleanHtml = html.replace(EMAIL_BUILDER_STATE_REGEX, '').trim();

  try {
    const decoded = fromBase64(match[1]);
    const parsed = JSON.parse(decoded);
    const meta = parsed?.meta && typeof parsed.meta === 'object' ? parsed.meta : {};
    const format = meta.format === 'plain' ? 'plain' : 'html';
    return {
      cleanHtml,
      blocks: normalizeBlocks(parsed?.blocks),
      preheader: typeof meta.preheader === 'string' ? meta.preheader : '',
      audience: typeof meta.audience === 'string' && meta.audience.trim() ? meta.audience : DEFAULT_AUDIENCE,
      voice: typeof meta.voice === 'string' && meta.voice.trim() ? meta.voice : DEFAULT_VOICE,
      goal: typeof meta.goal === 'string' && meta.goal.trim() ? meta.goal : DEFAULT_GOAL,
      format,
      theme: normalizeTheme(meta.theme),
      clickTrackingMode: normalizeClickTrackingMode(meta.clickTrackingMode),
      trackedLinkUrls: normalizeTrackedLinkUrls(meta.trackedLinkUrls),
    };
  } catch {
    return {
      cleanHtml,
      blocks: [] as EmailBuilderBlock[],
      preheader: '',
      audience: DEFAULT_AUDIENCE,
      voice: DEFAULT_VOICE,
      goal: DEFAULT_GOAL,
      format: 'html' as EmailBuilderFormat,
      theme: normalizeTheme(null),
      clickTrackingMode: 'all' as const,
      trackedLinkUrls: [] as string[],
    };
  }
};

const blockText = (block: EmailBuilderBlock) => {
  switch (block.type) {
    case 'heading':
    case 'text':
    case 'quote':
    case 'signature':
      return String(block.content.text || stripHtml(String(block.content.html || '')) || '').trim();
    case 'button':
      return [block.content.text, block.content.url].filter(Boolean).join(' - ');
    case 'image':
      return [block.content.alt || 'Image', block.content.src].filter(Boolean).join(': ');
    case 'columns':
      return (Array.isArray(block.content.content) ? block.content.content : [])
        .map((item: any) => {
          const plain = String(item?.text || '').trim();
          if (plain) return plain;
          return stripHtml(String(item?.html || item?.contentHtml || ''));
        })
        .filter(Boolean)
        .join(' | ');
    case 'table':
      return (Array.isArray(block.content.data) ? block.content.data : [])
        .map((row: any) => (Array.isArray(row) ? row.map((cell) => String(cell)).join(' | ') : ''))
        .filter(Boolean)
        .join('\n');
    case 'bookmark':
      return [block.content.title, block.content.description, block.content.url].filter(Boolean).join(' - ');
    case 'code':
      return String(block.content.text || '').trim();
    default:
      return '';
  }
};

const blockHtml = (block: EmailBuilderBlock, theme: EmailBuilderTheme) => {
  switch (block.type) {
    case 'heading':
    case 'text':
    case 'signature':
      return String(block.content.html || plainTextToHtml(String(block.content.text || '')));
    case 'image': {
      const src = String(block.content.src || '').trim();
      if (!src) return '';
      const alt = escapeHtml(String(block.content.alt || 'Image'));
      const width = String(block.content.width || '100%');
      return `<img src="${escapeHtml(src)}" alt="${alt}" style="width:${escapeHtml(width)};max-width:100%;height:auto;border-radius:8px;" />`;
    }
    case 'button': {
      const label = escapeHtml(String(block.content.text || 'Click here'));
      const url = escapeHtml(String(block.content.url || '#'));
      const align = escapeHtml(String(block.content.align || 'center'));
      const bgColor = escapeHtml(String(block.content.bgColor || '#2a9d6e'));
      const textColor = escapeHtml(String(block.content.textColor || '#ffffff'));
      const borderRadius = escapeHtml(String(block.content.borderRadius || '8px'));
      const buttonPadding = escapeHtml(String(block.content.buttonPadding || '10px 24px'));
      return `<div style="text-align:${align};"><a href="${url}" style="display:inline-block;background:${bgColor};color:${textColor};padding:${buttonPadding};border-radius:${borderRadius};text-decoration:none;font-weight:600;">${label}</a></div>`;
    }
    case 'divider': {
      const color = escapeHtml(String(block.content.color || '#e5e5e5'));
      const thickness = Number(block.content.thickness || 1);
      const style = escapeHtml(String(block.content.style || 'solid'));
      return `<hr style="border:none;border-top:${Math.max(1, thickness)}px ${style} ${color};" />`;
    }
    case 'spacer': {
      const height = Number(block.content.height || 24);
      return `<div style="height:${Math.max(0, height)}px;"></div>`;
    }
    case 'columns': {
      const items = Array.isArray(block.content.content) ? block.content.content : [];
      if (items.length === 0) return '';
      const cells = items
        .map((item: any) => {
          const richHtml = String(item?.html || item?.contentHtml || '').trim();
          const plainHtml = plainTextToHtml(String(item?.text || ''));
          return `<td style="padding:8px;vertical-align:top;">${richHtml || plainHtml}</td>`;
        })
        .join('');
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${cells}</tr></table>`;
    }
    case 'social': {
      const links = Array.isArray(block.content.links) ? block.content.links : [];
      if (links.length === 0) return '';
      const html = links
        .map((item: any) => {
          const platform = escapeHtml(String(item?.platform || 'Link'));
          const url = escapeHtml(String(item?.url || '#'));
          return `<a href="${url}" style="margin-right:12px;text-decoration:none;color:${escapeHtml(theme.linkColor)};">${platform}</a>`;
        })
        .join('');
      return `<div>${html}</div>`;
    }
    case 'video': {
      const url = String(block.content.url || '').trim();
      const title = escapeHtml(String(block.content.title || 'Watch video'));
      const thumbnail = String(block.content.thumbnail || '').trim();
      if (thumbnail) {
        return `<a href="${escapeHtml(url || '#')}" style="display:block;text-decoration:none;color:${escapeHtml(theme.linkColor)};"><img src="${escapeHtml(
          thumbnail
        )}" alt="${title}" style="display:block;width:100%;max-width:100%;height:auto;border-radius:12px;" /><span style="display:inline-block;margin-top:12px;font-weight:600;">${title}</span></a>`;
      }
      if (!url) return `<p>${title}</p>`;
      return `<p><a href="${escapeHtml(url)}" style="color:${escapeHtml(theme.linkColor)};">${title}</a></p>`;
    }
    case 'countdown':
      return `<p>${escapeHtml(String(block.content.label || 'Countdown'))}</p>`;
    case 'table': {
      const rows = Array.isArray(block.content.data) ? block.content.data : [];
      if (rows.length === 0) return '';
      const htmlRows = rows
        .map((row: any, rowIndex: number) => {
          const cells = (Array.isArray(row) ? row : [])
            .map((cell: any) => {
              const tag = rowIndex === 0 ? 'th' : 'td';
              return `<${tag} style="border:1px solid #e5e5e5;padding:8px;text-align:left;">${escapeHtml(String(cell || ''))}</${tag}>`;
            })
            .join('');
          return `<tr>${cells}</tr>`;
        })
        .join('');
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${htmlRows}</table>`;
    }
    case 'quote':
      return `<blockquote style="margin:0;padding-left:12px;border-left:3px solid #e5e5e5;">${String(
        block.content.html || plainTextToHtml(String(block.content.text || ''))
      )}</blockquote>`;
    case 'code':
      return `<pre style="background:#f8fafc;padding:12px;border-radius:8px;overflow:auto;">${escapeHtml(
        String(block.content.text || '')
      )}</pre>`;
    case 'bookmark': {
      const title = escapeHtml(String(block.content.title || 'Link'));
      const description = escapeHtml(String(block.content.description || ''));
      const url = escapeHtml(String(block.content.url || '#'));
      return `<p><a href="${url}" style="color:${escapeHtml(theme.linkColor)};"><strong>${title}</strong></a><br />${description}</p>`;
    }
    default:
      return plainTextToHtml(String(block.content.text || ''));
  }
};

const wrapBlockHtml = (block: EmailBuilderBlock, theme: EmailBuilderTheme) => {
  const inner = blockHtml(block, theme);
  if (!inner) return '';
  const wrapperStyles = { ...(block.styles || {}) } as Record<string, any>;
  if (block.type === 'heading' && !wrapperStyles.color) {
    wrapperStyles.color = theme.headingColor;
  }
  const styles = stylesToInline(wrapperStyles);
  const wrapperStyle = styles ? ` style="${styles}"` : '';
  return `<div${wrapperStyle}>${inner}</div>`;
};

const serializeBuilderState = (template: EmailBuilderTemplate) => {
  const payload = {
    version: 1,
    blocks: template.blocks,
    meta: {
      preheader: template.preheader,
      audience: template.audience,
      voice: template.voice,
      goal: template.goal,
      format: template.format,
      theme: normalizeTheme(template.theme),
      clickTrackingMode: normalizeClickTrackingMode(template.clickTrackingMode),
      trackedLinkUrls: normalizeTrackedLinkUrls(template.trackedLinkUrls),
    },
  };
  return `<!-- IntentAtlas_EMAIL_BUILDER_STATE:${toBase64(JSON.stringify(payload))} -->`;
};

const normalizeTemplateName = (value: string) => value.trim() || 'Untitled template';

const normalizeTemplateSubject = (value: string) => value.trim();

const toTemplate = (row: any): EmailBuilderTemplate => {
  const isHtml = Boolean(row?.is_html);
  const rawContent = String(row?.content || '');
  const hasBuilderState = EMAIL_BUILDER_STATE_REGEX.test(rawContent);
  const state = extractBuilderState(rawContent);
  const cleanContent = state.cleanHtml || rawContent;
  const blocks =
    state.blocks.length > 0
      ? state.blocks
      : fallbackBlocksFromTemplate(cleanContent, isHtml);

  return {
    id: String(row.id),
    name: String(row.name || ''),
    subject: String(row.subject || ''),
    preheader: hasBuilderState ? state.preheader || '' : '',
    format: hasBuilderState ? state.format : isHtml ? 'html' : 'plain',
    blocks,
    rawHtml: isHtml ? cleanContent || undefined : undefined,
    clickTrackingMode: hasBuilderState ? state.clickTrackingMode : 'all',
    trackedLinkUrls: hasBuilderState ? state.trackedLinkUrls : [],
    audience: hasBuilderState ? state.audience || DEFAULT_AUDIENCE : DEFAULT_AUDIENCE,
    voice: hasBuilderState ? state.voice || DEFAULT_VOICE : DEFAULT_VOICE,
    goal: hasBuilderState ? state.goal || DEFAULT_GOAL : DEFAULT_GOAL,
    theme: hasBuilderState ? state.theme || normalizeTheme(null) : normalizeTheme(null),
    createdAt: row?.created_at ? new Date(row.created_at) : new Date(),
  };
};

export const renderEmailTemplateHtml = (template: EmailBuilderTemplate) => {
  const directHtml = String(template.rawHtml || '').trim();
  const theme = normalizeTheme(template.theme);
  const preheader = String(template.preheader || '').trim();
  const preheaderHtml = preheader
    ? `<div style="display:none;overflow:hidden;line-height:1px;opacity:0;max-height:0;max-width:0;color:transparent;">${escapeHtml(
        preheader
      )}</div>`
    : '';
  if (directHtml) return `${preheaderHtml}${sanitizeEmailHtml(directHtml)}`;
  const body = template.blocks.map((block) => wrapBlockHtml(block, theme)).filter(Boolean).join('\n');
  return `<div style="margin:0;padding:28px 12px;background:${escapeHtml(theme.bodyBackground)};">${preheaderHtml}<div style="max-width:${theme.width}px;margin:0 auto;background:${escapeHtml(
    theme.contentBackground
  )};font-family:${escapeHtml(theme.fontFamily)};color:${escapeHtml(theme.textColor)};line-height:1.6;border-radius:20px;overflow:hidden;border:1px solid rgba(148,163,184,0.16);box-shadow:0 14px 40px rgba(15,23,42,0.08);"><div style="padding:24px;">${body}</div></div></div>`;
};

export const renderEmailTemplateText = (template: EmailBuilderTemplate) =>
  template.blocks
    .map(blockText)
    .filter((value) => value.trim().length > 0)
    .join('\n\n')
    .trim();

export const listEmailBuilderTemplates = async (): Promise<EmailBuilderTemplate[]> => {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!user) return [];

  const { data, error } = await supabase
    .from('email_templates')
    .select('id, name, subject, content, is_html, created_at, updated_at')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false });

  if (error) throw error;
  return (data || []).map(toTemplate);
};

export const saveEmailBuilderTemplate = async (
  template: EmailBuilderTemplate
): Promise<EmailBuilderTemplate> => {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!user) throw new Error('Not authenticated');

  const normalizedTemplate: EmailBuilderTemplate = {
    ...template,
    id: template.id || crypto.randomUUID(),
    name: normalizeTemplateName(template.name || ''),
    subject: normalizeTemplateSubject(template.subject || ''),
    preheader: String(template.preheader || '').trim(),
    blocks: normalizeBlocks(template.blocks),
    rawHtml: sanitizeEmailHtml(String(template.rawHtml || '')) || undefined,
    clickTrackingMode: normalizeClickTrackingMode(template.clickTrackingMode),
    trackedLinkUrls: normalizeTrackedLinkUrls(template.trackedLinkUrls),
    audience: template.audience || DEFAULT_AUDIENCE,
    voice: template.voice || DEFAULT_VOICE,
    goal: template.goal || DEFAULT_GOAL,
    theme: normalizeTheme(template.theme),
  };

  const isHtml = normalizedTemplate.format === 'html';
  const html = renderEmailTemplateHtml(normalizedTemplate);
  const text =
    normalizedTemplate.rawHtml && normalizedTemplate.blocks.length === 0
      ? stripHtml(html)
      : renderEmailTemplateText(normalizedTemplate);
  const content = `${isHtml ? html : text}\n${serializeBuilderState(normalizedTemplate)}`;

  const { data, error } = await supabase
    .from('email_templates')
    .upsert(
      {
        id: normalizedTemplate.id,
        user_id: user.id,
        name: normalizedTemplate.name,
        subject: normalizedTemplate.subject,
        content,
        body: text,
        is_html: isHtml,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    )
    .select('id, name, subject, content, is_html, created_at, updated_at')
    .single();

  if (error) throw error;
  const savedTemplate = toTemplate(data);

  // Fire-and-forget indexing to keep save UX fast while enabling pgvector retrieval.
  void indexAiBuilderObject({
    mode: 'email',
    objectId: savedTemplate.id,
    text: buildEmailEmbeddingText(savedTemplate),
    metadata: {
      name: savedTemplate.name,
      subject: savedTemplate.subject,
      audience: savedTemplate.audience,
      voice: savedTemplate.voice,
      goal: savedTemplate.goal,
    },
  }).catch((error) => {
    console.warn('AI indexing skipped for email template:', error?.message || error);
  });

  return savedTemplate;
};

export const deleteEmailBuilderTemplate = async (templateId: string) => {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('email_templates')
    .delete()
    .eq('id', templateId)
    .eq('user_id', user.id);

  if (error) throw error;
};

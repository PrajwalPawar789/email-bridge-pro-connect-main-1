import { supabase } from '@/integrations/supabase/client';

export type LandingPageBlockType =
  | 'hero'
  | 'features'
  | 'cta'
  | 'text'
  | 'image'
  | 'testimonial'
  | 'pricing'
  | 'faq'
  | 'form'
  | 'footer'
  | 'navbar'
  | 'gallery'
  | 'stats'
  | 'video';

export interface LandingPageBlock {
  id: string;
  type: LandingPageBlockType;
  content: Record<string, any>;
  styles: Record<string, any>;
}

export interface LandingPageRecord {
  id: string;
  name: string;
  slug: string;
  blocks: LandingPageBlock[];
  published: boolean;
  domain?: string;
  createdAt: Date;
}

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const toKebabCase = (value: string) => value.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`);

const stylesToInline = (styles: Record<string, any>) =>
  Object.entries(styles || {})
    .filter(([, rawValue]) => rawValue !== null && rawValue !== undefined && rawValue !== '')
    .map(([key, rawValue]) => `${toKebabCase(key)}:${String(rawValue)}`)
    .join(';');

const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

const normalizeBlockType = (value: string): LandingPageBlockType => {
  const known: LandingPageBlockType[] = [
    'hero',
    'features',
    'cta',
    'text',
    'image',
    'testimonial',
    'pricing',
    'faq',
    'form',
    'footer',
    'navbar',
    'gallery',
    'stats',
    'video',
  ];
  return known.includes(value as LandingPageBlockType) ? (value as LandingPageBlockType) : 'text';
};

const normalizeBlocks = (value: any): LandingPageBlock[] => {
  if (!Array.isArray(value)) return [];
  return value.map((item: any) => ({
    id: String(item?.id || crypto.randomUUID()),
    type: normalizeBlockType(String(item?.type || 'text')),
    content: item?.content && typeof item.content === 'object' ? item.content : {},
    styles: item?.styles && typeof item.styles === 'object' ? item.styles : {},
  }));
};

const renderFeatureItems = (items: any[]) =>
  items
    .map(
      (item) =>
        `<article style="padding:16px;border:1px solid #e2e8f0;border-radius:12px;"><h3 style="margin:0 0 8px 0;">${escapeHtml(
          String(item?.title || '')
        )}</h3><p style="margin:0;color:#475569;">${escapeHtml(String(item?.desc || ''))}</p></article>`
    )
    .join('');

const renderBlockHtml = (block: LandingPageBlock) => {
  const inlineStyles = stylesToInline(block.styles);
  const wrapper = inlineStyles ? ` style="${inlineStyles}"` : '';

  switch (block.type) {
    case 'navbar': {
      const brand = escapeHtml(String(block.content.brand || 'Brand'));
      const links = Array.isArray(block.content.links) ? block.content.links : [];
      return `<nav${wrapper} style="${inlineStyles};display:flex;justify-content:space-between;align-items:center;padding:16px 24px;border-bottom:1px solid #e2e8f0;"><strong>${brand}</strong><div>${links
        .map((link) => `<span style="margin-left:16px;color:#64748b;">${escapeHtml(String(link))}</span>`)
        .join('')}</div></nav>`;
    }
    case 'hero':
      return `<section${wrapper} style="${inlineStyles};padding:64px 24px;text-align:center;background:#f8fafc;"><h1 style="margin:0 0 16px 0;">${escapeHtml(
        String(block.content.headline || '')
      )}</h1><p style="margin:0 0 24px 0;color:#475569;">${escapeHtml(
        String(block.content.subheadline || '')
      )}</p><a href="${escapeHtml(String(block.content.ctaUrl || '#'))}" style="display:inline-block;background:#0f766e;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;">${escapeHtml(
        String(block.content.ctaText || 'Get started')
      )}</a></section>`;
    case 'features': {
      const items = Array.isArray(block.content.items) ? block.content.items : [];
      return `<section${wrapper} style="${inlineStyles};padding:48px 24px;"><h2 style="text-align:center;margin:0 0 24px 0;">${escapeHtml(
        String(block.content.title || 'Features')
      )}</h2><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;">${renderFeatureItems(
        items
      )}</div></section>`;
    }
    case 'text':
      return `<section${wrapper} style="${inlineStyles};padding:24px;">${escapeHtml(String(block.content.content || ''))}</section>`;
    case 'image': {
      const src = String(block.content.src || '').trim();
      if (!src) return '';
      return `<section${wrapper} style="${inlineStyles};padding:24px;text-align:center;"><img src="${escapeHtml(
        src
      )}" alt="${escapeHtml(String(block.content.alt || 'Image'))}" style="max-width:100%;height:auto;border-radius:12px;" /></section>`;
    }
    case 'cta':
      return `<section${wrapper} style="${inlineStyles};padding:48px 24px;text-align:center;background:#ecfeff;"><h2 style="margin:0 0 16px 0;">${escapeHtml(
        String(block.content.headline || '')
      )}</h2><a href="${escapeHtml(String(block.content.buttonUrl || '#'))}" style="display:inline-block;background:#0f766e;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;">${escapeHtml(
        String(block.content.buttonText || 'Learn more')
      )}</a></section>`;
    case 'testimonial': {
      const item = Array.isArray(block.content.items) ? block.content.items[0] : null;
      if (!item) return '';
      return `<section${wrapper} style="${inlineStyles};padding:32px 24px;text-align:center;"><blockquote style="margin:0;font-style:italic;">"${escapeHtml(
        String(item.quote || '')
      )}"</blockquote><p style="margin:12px 0 0 0;font-weight:600;">${escapeHtml(String(item.name || ''))}</p><p style="margin:4px 0 0 0;color:#64748b;">${escapeHtml(
        String(item.role || '')
      )}</p></section>`;
    }
    case 'pricing': {
      const plans = Array.isArray(block.content.plans) ? block.content.plans : [];
      const planHtml = plans
        .map((plan) => {
          const features = Array.isArray(plan?.features) ? plan.features : [];
          return `<article style="border:1px solid #e2e8f0;border-radius:12px;padding:16px;"><h3 style="margin:0;">${escapeHtml(
            String(plan?.name || '')
          )}</h3><p style="font-size:24px;font-weight:700;margin:8px 0;">${escapeHtml(
            String(plan?.price || '')
          )}</p><ul style="margin:0;padding-left:18px;">${features
            .map((feature: string) => `<li style="margin:4px 0;">${escapeHtml(String(feature))}</li>`)
            .join('')}</ul></article>`;
        })
        .join('');
      return `<section${wrapper} style="${inlineStyles};padding:48px 24px;"><h2 style="text-align:center;margin:0 0 24px 0;">${escapeHtml(
        String(block.content.title || 'Pricing')
      )}</h2><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px;">${planHtml}</div></section>`;
    }
    case 'faq': {
      const items = Array.isArray(block.content.items) ? block.content.items : [];
      return `<section${wrapper} style="${inlineStyles};padding:48px 24px;"><h2 style="margin:0 0 20px 0;">${escapeHtml(
        String(block.content.title || 'FAQ')
      )}</h2>${items
        .map(
          (item) =>
            `<details style="margin:10px 0;"><summary>${escapeHtml(String(item?.q || 'Question'))}</summary><p style="color:#475569;">${escapeHtml(
              String(item?.a || '')
            )}</p></details>`
        )
        .join('')}</section>`;
    }
    case 'form':
      return `<section${wrapper} style="${inlineStyles};padding:48px 24px;"><h2 style="margin:0 0 16px 0;">${escapeHtml(
        String(block.content.title || 'Contact us')
      )}</h2><form><input placeholder="Name" style="display:block;width:100%;max-width:420px;margin:8px 0;padding:10px;" /><input placeholder="Email" style="display:block;width:100%;max-width:420px;margin:8px 0;padding:10px;" /><textarea placeholder="Message" style="display:block;width:100%;max-width:420px;margin:8px 0;padding:10px;min-height:120px;"></textarea><button type="button" style="background:#0f766e;color:#fff;border:none;padding:10px 16px;border-radius:8px;">Submit</button></form></section>`;
    case 'stats': {
      const items = Array.isArray(block.content.items) ? block.content.items : [];
      return `<section${wrapper} style="${inlineStyles};padding:32px 24px;display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;">${items
        .map(
          (item) =>
            `<div style="text-align:center;"><div style="font-size:24px;font-weight:700;">${escapeHtml(
              String(item?.value || '')
            )}</div><div style="color:#64748b;">${escapeHtml(String(item?.label || ''))}</div></div>`
        )
        .join('')}</section>`;
    }
    case 'gallery': {
      const images = Array.isArray(block.content.images) ? block.content.images : [];
      return `<section${wrapper} style="${inlineStyles};padding:24px;display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;">${images
        .map((src: string) => `<img src="${escapeHtml(String(src))}" style="width:100%;height:auto;border-radius:10px;" />`)
        .join('')}</section>`;
    }
    case 'video': {
      const url = String(block.content.url || '').trim();
      if (!url) return '';
      return `<section${wrapper} style="${inlineStyles};padding:32px 24px;text-align:center;"><a href="${escapeHtml(
        url
      )}" style="color:#0f766e;text-decoration:underline;">${escapeHtml(String(block.content.title || 'Watch video'))}</a></section>`;
    }
    case 'footer': {
      const links = Array.isArray(block.content.links) ? block.content.links : [];
      return `<footer${wrapper} style="${inlineStyles};padding:24px;border-top:1px solid #e2e8f0;color:#64748b;display:flex;justify-content:space-between;align-items:center;"><span>${escapeHtml(
        String(block.content.brand || 'Brand')
      )}</span><div>${links
        .map((link) => `<span style="margin-left:12px;">${escapeHtml(String(link))}</span>`)
        .join('')}</div></footer>`;
    }
    default:
      return '';
  }
};

export const renderLandingPageHtml = (page: LandingPageRecord) => {
  const body = page.blocks.map(renderBlockHtml).join('');
  return `<!doctype html><html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /><title>${escapeHtml(
    page.name || 'Landing page'
  )}</title></head><body style="margin:0;background:#ffffff;color:#0f172a;font-family:Arial,Helvetica,sans-serif;">${body}</body></html>`;
};

const toLandingPageRecord = (row: any): LandingPageRecord => ({
  id: String(row.id),
  name: String(row.name || ''),
  slug: String(row.slug || ''),
  blocks: normalizeBlocks(row.blocks),
  published: Boolean(row.published),
  domain: row.domain ? String(row.domain) : undefined,
  createdAt: row?.created_at ? new Date(row.created_at) : new Date(),
});

const getAuthenticatedUser = async () => {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error) throw error;
  if (!user) throw new Error('Not authenticated');
  return user;
};

const ensureUniqueSlug = async (userId: string, desiredSlug: string, currentId?: string) => {
  const base = desiredSlug || `page-${crypto.randomUUID().slice(0, 8)}`;
  let candidate = base;
  let suffix = 2;

  while (true) {
    let query = (supabase as any)
      .from('landing_pages')
      .select('id')
      .eq('user_id', userId)
      .eq('slug', candidate)
      .limit(1);

    if (currentId) {
      query = query.neq('id', currentId);
    }

    const { data, error } = await query;
    if (error) throw error;
    if (!Array.isArray(data) || data.length === 0) return candidate;
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
};

export const listLandingPages = async (): Promise<LandingPageRecord[]> => {
  const user = await getAuthenticatedUser();
  const { data, error } = await (supabase as any)
    .from('landing_pages')
    .select('id, name, slug, blocks, published, domain, created_at, updated_at')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false });

  if (error) throw error;
  return (Array.isArray(data) ? data : []).map(toLandingPageRecord);
};

export const saveLandingPage = async (page: LandingPageRecord): Promise<LandingPageRecord> => {
  const user = await getAuthenticatedUser();
  const normalizedPage: LandingPageRecord = {
    ...page,
    id: page.id || crypto.randomUUID(),
    name: (page.name || '').trim() || 'Untitled page',
    slug: slugify(page.slug || page.name || ''),
    blocks: normalizeBlocks(page.blocks),
    published: Boolean(page.published),
    domain: page.domain?.trim() || undefined,
  };

  normalizedPage.slug = await ensureUniqueSlug(user.id, normalizedPage.slug, normalizedPage.id);
  const contentHtml = renderLandingPageHtml(normalizedPage);

  const { data, error } = await (supabase as any)
    .from('landing_pages')
    .upsert(
      {
        id: normalizedPage.id,
        user_id: user.id,
        name: normalizedPage.name,
        slug: normalizedPage.slug,
        blocks: normalizedPage.blocks,
        published: normalizedPage.published,
        domain: normalizedPage.domain || null,
        content_html: contentHtml,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    )
    .select('id, name, slug, blocks, published, domain, created_at, updated_at')
    .single();

  if (error) throw error;
  return toLandingPageRecord(data);
};

export const getPublishedLandingPage = async (slug: string) => {
  const normalized = slugify(slug || '');
  if (!normalized) return null;

  const { data, error } = await (supabase as any)
    .from('landing_pages')
    .select('id, name, slug, content_html, published')
    .eq('slug', normalized)
    .eq('published', true)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return {
    id: String(data.id),
    name: String(data.name || ''),
    slug: String(data.slug || ''),
    contentHtml: String(data.content_html || ''),
  };
};

export const deleteLandingPage = async (pageId: string) => {
  const user = await getAuthenticatedUser();
  const { error } = await (supabase as any)
    .from('landing_pages')
    .delete()
    .eq('id', pageId)
    .eq('user_id', user.id);

  if (error) throw error;
};

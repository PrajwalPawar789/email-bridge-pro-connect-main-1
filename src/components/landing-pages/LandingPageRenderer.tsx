import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import type { LandingPageBlock } from '@/lib/landingPagesPersistence';
import LandingPageLeadForm from '@/components/landing-pages/LandingPageLeadForm';
import {
  landingPageThemeStyleVars,
  normalizeLandingPageSettings,
  type LandingPageSettings,
} from '@/lib/landingPageSettings';
import {
  buildLandingPagePersonalizationContext,
  resolveLandingPagePersonalization,
  resolveLandingPagePersonalizationList,
} from '@/lib/landingPagePersonalization';
import { trackLandingPageEvent, trackLandingPageViewOnce } from '@/lib/landingPageTracking';

interface LandingPageRendererProps {
  page: {
    id: string;
    name: string;
    slug: string;
    blocks: LandingPageBlock[];
    settings?: LandingPageSettings;
  };
}

const resolveHref = (value: unknown, context: Record<string, string>) => {
  const href = resolveLandingPagePersonalization(value, context).trim();
  return href || '#';
};

const mergeStyles = (base: CSSProperties, overrides?: Record<string, any>): CSSProperties => ({
  ...base,
  ...(overrides || {}),
});

const sectionShell = (children: ReactNode, background = 'transparent', className = '') => (
  <section className={`px-5 py-12 sm:px-8 lg:px-10 lg:py-16 ${className}`} style={{ background }}>
    <div className="mx-auto w-full" style={{ maxWidth: 'var(--lp-max-width)' }}>
      {children}
    </div>
  </section>
);

const renderFeatureChip = (value: string, index: number) => (
  <span
    key={`${value}_${index}`}
    className="rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em]"
    style={{ borderColor: 'var(--lp-border)', color: 'var(--lp-muted)', background: 'var(--lp-surface)' }}
  >
    {value}
  </span>
);

const renderButton = ({
  href,
  label,
  context,
  pageId,
  pageSlug,
  blockId,
  variant = 'primary',
  className = '',
}: {
  href: unknown;
  label: unknown;
  context: Record<string, string>;
  pageId: string;
  pageSlug: string;
  blockId: string;
  variant?: 'primary' | 'secondary';
  className?: string;
}) => {
  const resolvedHref = resolveHref(href, context);
  const resolvedLabel = resolveLandingPagePersonalization(label, context);
  const isPrimary = variant === 'primary';

  return (
    <a
      href={resolvedHref}
      onClick={() => {
        void trackLandingPageEvent({
          pageId,
          pageSlug,
          eventType: 'cta_click',
          blockId,
          label: resolvedLabel,
        });
      }}
      className={`inline-flex items-center justify-center rounded-full px-6 py-3 text-sm font-semibold transition hover:translate-y-[-1px] ${className}`}
      style={
        isPrimary
          ? {
              background: 'var(--lp-accent)',
              color: 'var(--lp-accent-contrast)',
              boxShadow: 'var(--lp-shadow)',
            }
          : {
              background: 'transparent',
              color: 'var(--lp-text)',
              border: '1px solid var(--lp-border)',
            }
      }
    >
      {resolvedLabel}
    </a>
  );
};

const toEmbedUrl = (value: string) => {
  const url = value.trim();
  if (!url) return '';
  if (url.includes('youtube.com/watch?v=')) {
    const videoId = new URL(url).searchParams.get('v') || '';
    return videoId ? `https://www.youtube.com/embed/${videoId}` : url;
  }
  if (url.includes('youtu.be/')) {
    const videoId = url.split('youtu.be/')[1]?.split('?')[0] || '';
    return videoId ? `https://www.youtube.com/embed/${videoId}` : url;
  }
  if (url.includes('vimeo.com/')) {
    const videoId = url.split('vimeo.com/')[1]?.split('?')[0] || '';
    return videoId ? `https://player.vimeo.com/video/${videoId}` : url;
  }
  return url;
};

function CountdownTimer({
  endDate,
  blockId,
  pageId,
  pageSlug,
  label,
  buttonText,
  buttonUrl,
  context,
}: {
  endDate: string;
  blockId: string;
  pageId: string;
  pageSlug: string;
  label: string;
  buttonText?: string;
  buttonUrl?: string;
  context: Record<string, string>;
}) {
  const target = useMemo(() => {
    const next = new Date(endDate);
    return Number.isNaN(next.getTime()) ? null : next;
  }, [endDate]);
  const [remaining, setRemaining] = useState({ days: 0, hours: 0, minutes: 0, expired: false });

  useEffect(() => {
    if (!target) {
      setRemaining({ days: 0, hours: 0, minutes: 0, expired: true });
      return;
    }

    const update = () => {
      const diff = target.getTime() - Date.now();
      if (diff <= 0) {
        setRemaining({ days: 0, hours: 0, minutes: 0, expired: true });
        return;
      }

      const totalMinutes = Math.floor(diff / 60000);
      const days = Math.floor(totalMinutes / (60 * 24));
      const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
      const minutes = totalMinutes % 60;
      setRemaining({ days, hours, minutes, expired: false });
    };

    update();
    const interval = window.setInterval(update, 60000);
    return () => window.clearInterval(interval);
  }, [target]);

  return (
    <div
      className="rounded-[var(--lp-radius)] border px-6 py-7 text-center"
      style={{ borderColor: 'var(--lp-border)', background: 'var(--lp-surface)', boxShadow: 'var(--lp-shadow)' }}
    >
      <p className="text-xs font-semibold uppercase tracking-[0.32em]" style={{ color: 'var(--lp-muted)' }}>
        {label}
      </p>
      {remaining.expired ? (
        <p className="mt-4 text-3xl font-semibold" style={{ color: 'var(--lp-text)', fontFamily: 'var(--lp-font-display)' }}>
          Offer closed
        </p>
      ) : (
        <div className="mt-5 grid grid-cols-3 gap-3">
          {[
            ['Days', remaining.days],
            ['Hours', remaining.hours],
            ['Minutes', remaining.minutes],
          ].map(([heading, value]) => (
            <div
              key={String(heading)}
              className="rounded-3xl border px-3 py-4"
              style={{ borderColor: 'var(--lp-border)', background: 'var(--lp-surface-alt)' }}
            >
              <div className="text-3xl font-semibold" style={{ color: 'var(--lp-text)', fontFamily: 'var(--lp-font-display)' }}>
                {String(value).padStart(2, '0')}
              </div>
              <div className="mt-1 text-[11px] uppercase tracking-[0.24em]" style={{ color: 'var(--lp-muted)' }}>
                {heading}
              </div>
            </div>
          ))}
        </div>
      )}
      {buttonText ? (
        <div className="mt-6">
          {renderButton({
            href: buttonUrl || '#',
            label: buttonText,
            context,
            pageId,
            pageSlug,
            blockId,
          })}
        </div>
      ) : null}
    </div>
  );
}

const LandingPageRenderer = ({ page }: LandingPageRendererProps) => {
  const settings = useMemo(() => normalizeLandingPageSettings(page.settings), [page.settings]);
  const personalizationContext = useMemo(() => buildLandingPagePersonalizationContext(), []);
  const themeVars = useMemo(
    () => landingPageThemeStyleVars(settings) as CSSProperties,
    [settings]
  );

  useEffect(() => {
    trackLandingPageViewOnce(page.id, page.slug);
  }, [page.id, page.slug]);

  return (
    <div
      className="min-h-screen"
      style={{
        ...themeVars,
        background: 'var(--lp-bg)',
        color: 'var(--lp-text)',
        fontFamily: 'var(--lp-font-body)',
      }}
    >
      {settings.announcementBar.enabled ? (
        <div
          className="sticky top-0 z-40 border-b px-4 py-3"
          style={{
            borderColor: 'var(--lp-border)',
            background: 'linear-gradient(90deg, var(--lp-accent), var(--lp-accent-alt))',
            color: 'var(--lp-accent-contrast)',
          }}
        >
          <div className="mx-auto flex max-w-[var(--lp-max-width)] flex-col items-center justify-between gap-3 text-center sm:flex-row sm:text-left">
            <p className="text-sm font-medium">
              {resolveLandingPagePersonalization(settings.announcementBar.text, personalizationContext)}
            </p>
            {settings.announcementBar.ctaText ? (
              <a
                href={resolveHref(settings.announcementBar.ctaUrl, personalizationContext)}
                className="inline-flex items-center rounded-full bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] backdrop-blur"
                onClick={() => {
                  void trackLandingPageEvent({
                    pageId: page.id,
                    pageSlug: page.slug,
                    eventType: 'cta_click',
                    blockId: 'announcement-bar',
                    label: settings.announcementBar.ctaText,
                  });
                }}
              >
                {resolveLandingPagePersonalization(settings.announcementBar.ctaText, personalizationContext)}
              </a>
            ) : null}
          </div>
        </div>
      ) : null}

      {page.blocks.map((block) => {
        switch (block.type) {
          case 'navbar': {
            const links = Array.isArray(block.content.links) ? block.content.links : [];
            return (
              <nav
                key={block.id}
                className="sticky top-0 z-30 border-b px-5 py-4 backdrop-blur sm:px-8"
                style={mergeStyles(
                  {
                    borderColor: 'var(--lp-border)',
                    background: 'color-mix(in srgb, var(--lp-surface) 88%, transparent)',
                    top: settings.announcementBar.enabled ? '49px' : '0px',
                  },
                  block.styles
                )}
              >
                <div className="mx-auto flex max-w-[var(--lp-max-width)] flex-wrap items-center justify-between gap-4">
                  <strong className="text-lg font-semibold" style={{ color: 'var(--lp-text)', fontFamily: 'var(--lp-font-display)' }}>
                    {resolveLandingPagePersonalization(block.content.brand || page.name, personalizationContext)}
                  </strong>
                  <div className="flex flex-wrap items-center gap-4 text-sm" style={{ color: 'var(--lp-muted)' }}>
                    {links.map((link: any, index: number) => {
                      if (link && typeof link === 'object') {
                        const label = resolveLandingPagePersonalization(link.label || link.name || 'Link', personalizationContext);
                        return (
                          <a key={`${label}_${index}`} href={resolveHref(link.url || '#', personalizationContext)}>
                            {label}
                          </a>
                        );
                      }
                      const label = resolveLandingPagePersonalization(link, personalizationContext);
                      return (
                        <a key={`${label}_${index}`} href={`#${String(label).toLowerCase().replace(/\s+/g, '-')}`}>
                          {label}
                        </a>
                      );
                    })}
                    {block.content.ctaText
                      ? renderButton({
                          href: block.content.ctaUrl || '#',
                          label: block.content.ctaText,
                          context: personalizationContext,
                          pageId: page.id,
                          pageSlug: page.slug,
                          blockId: block.id,
                          className: 'px-4 py-2 text-xs uppercase tracking-[0.18em]',
                        })
                      : null}
                  </div>
                </div>
              </nav>
            );
          }
          case 'hero': {
            const highlights = Array.isArray(block.content.highlights) ? block.content.highlights : [];
            const imageUrl = String(block.content.imageUrl || block.content.image || '').trim();
            return (
              <section
                key={block.id}
                className="relative overflow-hidden px-5 py-20 sm:px-8 lg:px-10 lg:py-28"
                style={mergeStyles(
                  {
                    background:
                      'radial-gradient(circle at 15% 20%, var(--lp-glow), transparent 32%), radial-gradient(circle at 82% 0%, color-mix(in srgb, var(--lp-accent-alt) 28%, transparent), transparent 28%), var(--lp-bg)',
                  },
                  block.styles
                )}
              >
                <div className="mx-auto grid max-w-[var(--lp-max-width)] gap-12 lg:grid-cols-[1.02fr_0.98fr] lg:items-center">
                  <div>
                    {block.content.badge ? (
                      <span
                        className="inline-flex rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.26em]"
                        style={{ borderColor: 'var(--lp-border)', color: 'var(--lp-muted)', background: 'var(--lp-surface)' }}
                      >
                        {resolveLandingPagePersonalization(block.content.badge, personalizationContext)}
                      </span>
                    ) : null}
                    <h1 className="mt-6 text-4xl font-semibold leading-[1.02] sm:text-5xl lg:text-6xl" style={{ color: 'var(--lp-text)', fontFamily: 'var(--lp-font-display)' }}>
                      {resolveLandingPagePersonalization(block.content.headline, personalizationContext)}
                    </h1>
                    <p className="mt-6 max-w-2xl text-lg leading-8" style={{ color: 'var(--lp-muted)' }}>
                      {resolveLandingPagePersonalization(block.content.subheadline, personalizationContext)}
                    </p>
                    <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                      {renderButton({
                        href: block.content.ctaUrl || '#',
                        label: block.content.ctaText || 'Get started',
                        context: personalizationContext,
                        pageId: page.id,
                        pageSlug: page.slug,
                        blockId: block.id,
                      })}
                      {block.content.secondaryCtaText
                        ? renderButton({
                            href: block.content.secondaryCtaUrl || '#',
                            label: block.content.secondaryCtaText,
                            context: personalizationContext,
                            pageId: page.id,
                            pageSlug: page.slug,
                            blockId: block.id,
                            variant: 'secondary',
                          })
                        : null}
                    </div>
                    {highlights.length > 0 ? (
                      <div className="mt-8 flex flex-wrap gap-3">
                        {resolveLandingPagePersonalizationList(highlights, personalizationContext).map(renderFeatureChip)}
                      </div>
                    ) : null}
                  </div>
                  <div className="relative">
                    <div className="rounded-[calc(var(--lp-radius)+8px)] border p-5" style={{ borderColor: 'var(--lp-border)', background: 'var(--lp-surface)', boxShadow: 'var(--lp-shadow)' }}>
                      {imageUrl ? (
                        <img
                          src={resolveHref(imageUrl, personalizationContext)}
                          alt={resolveLandingPagePersonalization(block.content.imageAlt || 'Hero image', personalizationContext)}
                          className="w-full rounded-[calc(var(--lp-radius)-2px)] object-cover"
                        />
                      ) : (
                        <div className="rounded-[calc(var(--lp-radius)-2px)] border px-6 py-14" style={{ borderColor: 'var(--lp-border)', background: 'var(--lp-surface-alt)' }}>
                          <div className="grid gap-3">
                            {(Array.isArray(block.content.metrics)
                              ? block.content.metrics
                              : [
                                  { label: 'Pipeline lift', value: '+42%' },
                                  { label: 'Launch time', value: '2.1x faster' },
                                  { label: 'Conversion ops', value: 'One workspace' },
                                ]
                            ).map((item: any, index: number) => (
                              <div key={`${item?.label || 'metric'}_${index}`} className="rounded-3xl border px-5 py-4" style={{ borderColor: 'var(--lp-border)', background: 'var(--lp-surface)' }}>
                                <div className="text-3xl font-semibold" style={{ color: 'var(--lp-text)', fontFamily: 'var(--lp-font-display)' }}>
                                  {resolveLandingPagePersonalization(item?.value || '', personalizationContext)}
                                </div>
                                <div className="mt-1 text-sm" style={{ color: 'var(--lp-muted)' }}>
                                  {resolveLandingPagePersonalization(item?.label || '', personalizationContext)}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </section>
            );
          }
          case 'logos': {
            const items = Array.isArray(block.content.items) ? block.content.items : [];
            return sectionShell(
              <div className="grid gap-5">
                {block.content.title ? (
                  <div className="text-center">
                    <p className="text-xs font-semibold uppercase tracking-[0.28em]" style={{ color: 'var(--lp-muted)' }}>
                      {resolveLandingPagePersonalization(block.content.title, personalizationContext)}
                    </p>
                  </div>
                ) : null}
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {items.map((item: any, index: number) => {
                    const imageUrl = String(item?.imageUrl || '').trim();
                    const name = resolveLandingPagePersonalization(item?.name || 'Logo', personalizationContext);
                    return (
                      <div key={`${name}_${index}`} className="flex min-h-[88px] items-center justify-center rounded-[var(--lp-radius)] border px-6 py-5 text-center" style={{ borderColor: 'var(--lp-border)', background: 'var(--lp-surface)' }}>
                        {imageUrl ? (
                          <img src={resolveHref(imageUrl, personalizationContext)} alt={name} className="max-h-9 max-w-full object-contain" />
                        ) : (
                          <span className="text-sm font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--lp-muted)' }}>
                            {name}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>,
              'transparent'
            );
          }
          case 'stats': {
            const items = Array.isArray(block.content.items) ? block.content.items : [];
            return sectionShell(
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((item: any, index: number) => (
                  <div key={`${item?.label || 'stat'}_${index}`} className="rounded-[var(--lp-radius)] border px-6 py-6" style={{ borderColor: 'var(--lp-border)', background: 'var(--lp-surface)' }}>
                    <div className="text-xs font-semibold uppercase tracking-[0.24em]" style={{ color: 'var(--lp-muted)' }}>
                      {resolveLandingPagePersonalization(item?.label || '', personalizationContext)}
                    </div>
                    <div className="mt-3 text-4xl font-semibold" style={{ color: 'var(--lp-text)', fontFamily: 'var(--lp-font-display)' }}>
                      {resolveLandingPagePersonalization(item?.value || '', personalizationContext)}
                    </div>
                  </div>
                ))}
              </div>,
              'transparent'
            );
          }
          case 'features': {
            const items = Array.isArray(block.content.items) ? block.content.items : [];
            return sectionShell(
              <div>
                <div className="mx-auto max-w-3xl text-center">
                  <p className="text-xs font-semibold uppercase tracking-[0.3em]" style={{ color: 'var(--lp-muted)' }}>
                    {resolveLandingPagePersonalization(block.content.eyebrow || 'Capabilities', personalizationContext)}
                  </p>
                  <h2 className="mt-4 text-3xl font-semibold sm:text-4xl" style={{ color: 'var(--lp-text)', fontFamily: 'var(--lp-font-display)' }}>
                    {resolveLandingPagePersonalization(block.content.title || 'Features', personalizationContext)}
                  </h2>
                  {block.content.description ? (
                    <p className="mt-4 text-lg leading-8" style={{ color: 'var(--lp-muted)' }}>
                      {resolveLandingPagePersonalization(block.content.description, personalizationContext)}
                    </p>
                  ) : null}
                </div>
                <div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                  {items.map((item: any, index: number) => (
                    <article key={`${item?.title || 'feature'}_${index}`} className="rounded-[var(--lp-radius)] border px-6 py-6" style={{ borderColor: 'var(--lp-border)', background: 'var(--lp-surface)' }}>
                      {item?.kicker ? (
                        <p className="text-xs font-semibold uppercase tracking-[0.24em]" style={{ color: 'var(--lp-muted)' }}>
                          {resolveLandingPagePersonalization(item.kicker, personalizationContext)}
                        </p>
                      ) : null}
                      <h3 className="mt-3 text-2xl font-semibold" style={{ color: 'var(--lp-text)', fontFamily: 'var(--lp-font-display)' }}>
                        {resolveLandingPagePersonalization(item?.title || '', personalizationContext)}
                      </h3>
                      <p className="mt-3 text-sm leading-7" style={{ color: 'var(--lp-muted)' }}>
                        {resolveLandingPagePersonalization(item?.desc || '', personalizationContext)}
                      </p>
                      {Array.isArray(item?.bullets) && item.bullets.length > 0 ? (
                        <div className="mt-5 flex flex-wrap gap-2">
                          {resolveLandingPagePersonalizationList(item.bullets, personalizationContext).map(renderFeatureChip)}
                        </div>
                      ) : null}
                    </article>
                  ))}
                </div>
              </div>,
              'transparent'
            );
          }
          case 'steps': {
            const items = Array.isArray(block.content.items) ? block.content.items : [];
            return sectionShell(
              <div>
                <div className="mx-auto max-w-3xl text-center">
                  <h2 className="text-3xl font-semibold sm:text-4xl" style={{ color: 'var(--lp-text)', fontFamily: 'var(--lp-font-display)' }}>
                    {resolveLandingPagePersonalization(block.content.title || 'How it works', personalizationContext)}
                  </h2>
                  {block.content.description ? (
                    <p className="mt-4 text-lg leading-8" style={{ color: 'var(--lp-muted)' }}>
                      {resolveLandingPagePersonalization(block.content.description, personalizationContext)}
                    </p>
                  ) : null}
                </div>
                <div className="mt-10 grid gap-5 lg:grid-cols-3">
                  {items.map((item: any, index: number) => (
                    <article key={`${item?.title || 'step'}_${index}`} className="rounded-[var(--lp-radius)] border px-6 py-6" style={{ borderColor: 'var(--lp-border)', background: 'var(--lp-surface)' }}>
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl text-lg font-semibold" style={{ background: 'var(--lp-surface-alt)', color: 'var(--lp-accent)' }}>
                        {index + 1}
                      </div>
                      <h3 className="mt-5 text-2xl font-semibold" style={{ color: 'var(--lp-text)', fontFamily: 'var(--lp-font-display)' }}>
                        {resolveLandingPagePersonalization(item?.title || '', personalizationContext)}
                      </h3>
                      <p className="mt-3 text-sm leading-7" style={{ color: 'var(--lp-muted)' }}>
                        {resolveLandingPagePersonalization(item?.desc || '', personalizationContext)}
                      </p>
                    </article>
                  ))}
                </div>
              </div>,
              'transparent'
            );
          }
          case 'text':
            return sectionShell(
              <div className="mx-auto max-w-4xl whitespace-pre-wrap text-base leading-8" style={{ color: 'var(--lp-text)' }}>
                {resolveLandingPagePersonalization(block.content.content || '', personalizationContext)}
              </div>
            );
          case 'image': {
            const src = String(block.content.src || '').trim();
            if (!src) return null;
            return sectionShell(
              <img
                src={resolveHref(src, personalizationContext)}
                alt={resolveLandingPagePersonalization(block.content.alt || 'Image', personalizationContext)}
                className="w-full rounded-[calc(var(--lp-radius)+8px)] border object-cover"
                style={{ borderColor: 'var(--lp-border)', boxShadow: 'var(--lp-shadow)' }}
              />
            );
          }
          case 'gallery': {
            const images = Array.isArray(block.content.images) ? block.content.images : [];
            return sectionShell(
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {images.map((image: any, index: number) => (
                  <img
                    key={`${String(image)}_${index}`}
                    src={resolveHref(image, personalizationContext)}
                    alt={`Gallery image ${index + 1}`}
                    className="h-72 w-full rounded-[calc(var(--lp-radius)-4px)] border object-cover"
                    style={{ borderColor: 'var(--lp-border)' }}
                  />
                ))}
              </div>
            );
          }
          case 'video': {
            const url = resolveHref(block.content.url, personalizationContext);
            if (!url || url === '#') return null;
            const embedUrl = toEmbedUrl(url);
            const isEmbeddable = embedUrl.includes('youtube.com/embed') || embedUrl.includes('player.vimeo.com/video');

            return sectionShell(
              <div className="rounded-[var(--lp-radius)] border p-6" style={{ borderColor: 'var(--lp-border)', background: 'var(--lp-surface)', boxShadow: 'var(--lp-shadow)' }}>
                {block.content.title ? (
                  <h2 className="mb-5 text-3xl font-semibold" style={{ color: 'var(--lp-text)', fontFamily: 'var(--lp-font-display)' }}>
                    {resolveLandingPagePersonalization(block.content.title, personalizationContext)}
                  </h2>
                ) : null}
                {isEmbeddable ? (
                  <div className="aspect-video overflow-hidden rounded-[calc(var(--lp-radius)-6px)] border" style={{ borderColor: 'var(--lp-border)' }}>
                    <iframe
                      src={embedUrl}
                      title={resolveLandingPagePersonalization(block.content.title || 'Video', personalizationContext)}
                      className="h-full w-full"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                  </div>
                ) : (
                  <a
                    href={url}
                    className="inline-flex rounded-full border px-5 py-3 text-sm font-semibold"
                    style={{ borderColor: 'var(--lp-border)', color: 'var(--lp-accent)' }}
                  >
                    Open video
                  </a>
                )}
              </div>
            );
          }
          case 'testimonial': {
            const items = Array.isArray(block.content.items) ? block.content.items : [];
            return sectionShell(
              <div>
                <div className="mx-auto max-w-3xl text-center">
                  <h2 className="text-3xl font-semibold sm:text-4xl" style={{ color: 'var(--lp-text)', fontFamily: 'var(--lp-font-display)' }}>
                    {resolveLandingPagePersonalization(block.content.title || 'What customers say', personalizationContext)}
                  </h2>
                </div>
                <div className="mt-10 grid gap-5 lg:grid-cols-3">
                  {items.map((item: any, index: number) => (
                    <article key={`${item?.name || 'testimonial'}_${index}`} className="rounded-[var(--lp-radius)] border px-6 py-6" style={{ borderColor: 'var(--lp-border)', background: 'var(--lp-surface)' }}>
                      <p className="text-lg leading-8" style={{ color: 'var(--lp-text)' }}>
                        "{resolveLandingPagePersonalization(item?.quote || '', personalizationContext)}"
                      </p>
                      <p className="mt-5 font-semibold" style={{ color: 'var(--lp-text)' }}>
                        {resolveLandingPagePersonalization(item?.name || '', personalizationContext)}
                      </p>
                      <p className="mt-1 text-sm" style={{ color: 'var(--lp-muted)' }}>
                        {resolveLandingPagePersonalization(item?.role || '', personalizationContext)}
                      </p>
                    </article>
                  ))}
                </div>
              </div>
            );
          }
          case 'comparison': {
            const columns = Array.isArray(block.content.columns) ? block.content.columns : [];
            const rows = Array.isArray(block.content.rows) ? block.content.rows : [];
            return sectionShell(
              <div className="overflow-hidden rounded-[var(--lp-radius)] border" style={{ borderColor: 'var(--lp-border)', background: 'var(--lp-surface)' }}>
                <div className="border-b px-6 py-5" style={{ borderColor: 'var(--lp-border)' }}>
                  <h2 className="text-3xl font-semibold" style={{ color: 'var(--lp-text)', fontFamily: 'var(--lp-font-display)' }}>
                    {resolveLandingPagePersonalization(block.content.title || 'Comparison', personalizationContext)}
                  </h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[680px]">
                    <thead style={{ background: 'var(--lp-surface-alt)' }}>
                      <tr>
                        <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-[0.24em]" style={{ color: 'var(--lp-muted)' }}>
                          Feature
                        </th>
                        {columns.map((column: any, index: number) => (
                          <th key={`${column?.key || 'column'}_${index}`} className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-[0.24em]" style={{ color: 'var(--lp-muted)' }}>
                            {resolveLandingPagePersonalization(column?.label || 'Column', personalizationContext)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row: any, index: number) => (
                        <tr key={`${row?.feature || 'row'}_${index}`} className="border-t" style={{ borderColor: 'var(--lp-border)' }}>
                          <td className="px-6 py-4 font-semibold" style={{ color: 'var(--lp-text)' }}>
                            {resolveLandingPagePersonalization(row?.feature || '', personalizationContext)}
                          </td>
                          {columns.map((column: any, columnIndex: number) => (
                            <td key={`${column?.key || 'cell'}_${columnIndex}`} className="px-6 py-4 text-sm" style={{ color: 'var(--lp-muted)' }}>
                              {resolveLandingPagePersonalization(row?.[String(column?.key || '')] || '', personalizationContext)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          }
          case 'pricing': {
            const plans = Array.isArray(block.content.plans) ? block.content.plans : [];
            return sectionShell(
              <div>
                <div className="mx-auto max-w-3xl text-center">
                  <h2 className="text-3xl font-semibold sm:text-4xl" style={{ color: 'var(--lp-text)', fontFamily: 'var(--lp-font-display)' }}>
                    {resolveLandingPagePersonalization(block.content.title || 'Pricing', personalizationContext)}
                  </h2>
                </div>
                <div className="mt-10 grid gap-5 lg:grid-cols-3">
                  {plans.map((plan: any, index: number) => {
                    const featured = Boolean(plan?.featured);
                    return (
                      <article
                        key={`${plan?.name || 'plan'}_${index}`}
                        className="rounded-[var(--lp-radius)] border px-6 py-7"
                        style={{
                          borderColor: featured ? 'var(--lp-accent)' : 'var(--lp-border)',
                          background: featured ? 'var(--lp-surface-alt)' : 'var(--lp-surface)',
                          boxShadow: featured ? 'var(--lp-shadow)' : 'none',
                        }}
                      >
                        {featured ? (
                          <span className="inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em]" style={{ background: 'var(--lp-accent)', color: 'var(--lp-accent-contrast)' }}>
                            Recommended
                          </span>
                        ) : null}
                        <h3 className="mt-4 text-2xl font-semibold" style={{ color: 'var(--lp-text)', fontFamily: 'var(--lp-font-display)' }}>
                          {resolveLandingPagePersonalization(plan?.name || '', personalizationContext)}
                        </h3>
                        <p className="mt-3 text-4xl font-semibold" style={{ color: 'var(--lp-text)' }}>
                          {resolveLandingPagePersonalization(plan?.price || '', personalizationContext)}
                        </p>
                        {plan?.description ? (
                          <p className="mt-3 text-sm leading-7" style={{ color: 'var(--lp-muted)' }}>
                            {resolveLandingPagePersonalization(plan.description, personalizationContext)}
                          </p>
                        ) : null}
                        <ul className="mt-5 space-y-3">
                          {(Array.isArray(plan?.features) ? plan.features : []).map((feature: string, featureIndex: number) => (
                            <li key={`${feature}_${featureIndex}`} className="text-sm leading-7" style={{ color: 'var(--lp-text)' }}>
                              {resolveLandingPagePersonalization(feature, personalizationContext)}
                            </li>
                          ))}
                        </ul>
                        {plan?.ctaText ? (
                          <div className="mt-6">
                            {renderButton({
                              href: plan?.ctaUrl || '#',
                              label: plan?.ctaText,
                              context: personalizationContext,
                              pageId: page.id,
                              pageSlug: page.slug,
                              blockId: block.id,
                              variant: featured ? 'primary' : 'secondary',
                              className: 'w-full',
                            })}
                          </div>
                        ) : null}
                      </article>
                    );
                  })}
                </div>
              </div>
            );
          }
          case 'faq': {
            const items = Array.isArray(block.content.items) ? block.content.items : [];
            return sectionShell(
              <div className="mx-auto max-w-4xl">
                <h2 className="text-3xl font-semibold sm:text-4xl" style={{ color: 'var(--lp-text)', fontFamily: 'var(--lp-font-display)' }}>
                  {resolveLandingPagePersonalization(block.content.title || 'FAQ', personalizationContext)}
                </h2>
                <div className="mt-8 grid gap-3">
                  {items.map((item: any, index: number) => (
                    <details key={`${item?.q || 'faq'}_${index}`} className="rounded-[calc(var(--lp-radius)-8px)] border px-5 py-4" style={{ borderColor: 'var(--lp-border)', background: 'var(--lp-surface)' }}>
                      <summary className="cursor-pointer text-base font-semibold" style={{ color: 'var(--lp-text)' }}>
                        {resolveLandingPagePersonalization(item?.q || 'Question', personalizationContext)}
                      </summary>
                      <p className="mt-3 text-sm leading-7" style={{ color: 'var(--lp-muted)' }}>
                        {resolveLandingPagePersonalization(item?.a || '', personalizationContext)}
                      </p>
                    </details>
                  ))}
                </div>
              </div>
            );
          }
          case 'cta':
            return sectionShell(
              <div
                className="rounded-[var(--lp-radius)] border px-6 py-10 text-center sm:px-10"
                style={{
                  borderColor: 'var(--lp-border)',
                  background:
                    'linear-gradient(135deg, color-mix(in srgb, var(--lp-accent) 10%, var(--lp-surface)) 0%, var(--lp-surface) 65%, color-mix(in srgb, var(--lp-accent-alt) 12%, var(--lp-surface)) 100%)',
                  boxShadow: 'var(--lp-shadow)',
                }}
              >
                <h2 className="text-3xl font-semibold sm:text-4xl" style={{ color: 'var(--lp-text)', fontFamily: 'var(--lp-font-display)' }}>
                  {resolveLandingPagePersonalization(block.content.headline || '', personalizationContext)}
                </h2>
                {block.content.body ? (
                  <p className="mx-auto mt-4 max-w-2xl text-lg leading-8" style={{ color: 'var(--lp-muted)' }}>
                    {resolveLandingPagePersonalization(block.content.body, personalizationContext)}
                  </p>
                ) : null}
                <div className="mt-7">
                  {renderButton({
                    href: block.content.buttonUrl || '#',
                    label: block.content.buttonText || 'Learn more',
                    context: personalizationContext,
                    pageId: page.id,
                    pageSlug: page.slug,
                    blockId: block.id,
                  })}
                </div>
              </div>
            );
          case 'form':
            return (
              <div key={block.id}>
                <LandingPageLeadForm
                  pageId={page.id}
                  pageSlug={page.slug}
                  blockId={block.id}
                  content={block.content}
                />
              </div>
            );
          case 'countdown':
            return sectionShell(
              <CountdownTimer
                endDate={resolveLandingPagePersonalization(block.content.endDate || '', personalizationContext)}
                blockId={block.id}
                pageId={page.id}
                pageSlug={page.slug}
                label={resolveLandingPagePersonalization(block.content.label || 'Offer ends soon', personalizationContext)}
                buttonText={resolveLandingPagePersonalization(block.content.buttonText || '', personalizationContext)}
                buttonUrl={resolveHref(block.content.buttonUrl || '#', personalizationContext)}
                context={personalizationContext}
              />
            );
          case 'footer': {
            const links = Array.isArray(block.content.links) ? block.content.links : [];
            return (
              <footer
                key={block.id}
                className="border-t px-5 py-10 sm:px-8"
                style={mergeStyles(
                  {
                    borderColor: 'var(--lp-border)',
                    background: 'var(--lp-surface)',
                  },
                  block.styles
                )}
              >
                <div className="mx-auto flex max-w-[var(--lp-max-width)] flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-lg font-semibold" style={{ color: 'var(--lp-text)', fontFamily: 'var(--lp-font-display)' }}>
                      {resolveLandingPagePersonalization(block.content.brand || page.name, personalizationContext)}
                    </p>
                    {block.content.tagline ? (
                      <p className="mt-2 text-sm" style={{ color: 'var(--lp-muted)' }}>
                        {resolveLandingPagePersonalization(block.content.tagline, personalizationContext)}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-4 text-sm" style={{ color: 'var(--lp-muted)' }}>
                    {links.map((link: any, index: number) => {
                      if (link && typeof link === 'object') {
                        const label = resolveLandingPagePersonalization(link.label || 'Link', personalizationContext);
                        return (
                          <a key={`${label}_${index}`} href={resolveHref(link.url || '#', personalizationContext)}>
                            {label}
                          </a>
                        );
                      }
                      const label = resolveLandingPagePersonalization(link, personalizationContext);
                      return <span key={`${label}_${index}`}>{label}</span>;
                    })}
                  </div>
                </div>
              </footer>
            );
          }
          default:
            return null;
        }
      })}

      {settings.stickyCta.enabled ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t p-4 backdrop-blur md:bottom-5 md:left-1/2 md:right-auto md:w-auto md:-translate-x-1/2 md:rounded-full md:border md:shadow-2xl">
          <div className="flex items-center gap-3 rounded-full px-4 py-3" style={{ borderColor: 'var(--lp-border)', background: 'color-mix(in srgb, var(--lp-surface) 92%, transparent)' }}>
            <p className="hidden text-sm md:block" style={{ color: 'var(--lp-text)' }}>
              {resolveLandingPagePersonalization(settings.stickyCta.label, personalizationContext)}
            </p>
            <a
              href={resolveHref(settings.stickyCta.buttonUrl, personalizationContext)}
              className="inline-flex items-center justify-center rounded-full px-5 py-3 text-sm font-semibold"
              style={{ background: 'var(--lp-accent)', color: 'var(--lp-accent-contrast)' }}
              onClick={() => {
                void trackLandingPageEvent({
                  pageId: page.id,
                  pageSlug: page.slug,
                  eventType: 'cta_click',
                  blockId: 'sticky-cta',
                  label: settings.stickyCta.buttonText,
                });
              }}
            >
              {resolveLandingPagePersonalization(settings.stickyCta.buttonText, personalizationContext)}
            </a>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default LandingPageRenderer;

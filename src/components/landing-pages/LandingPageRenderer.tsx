import type { CSSProperties } from 'react';
import type { LandingPageBlock } from '@/lib/landingPagesPersistence';
import LandingPageLeadForm from '@/components/landing-pages/LandingPageLeadForm';

interface LandingPageRendererProps {
  page: {
    id: string;
    name: string;
    slug: string;
    blocks: LandingPageBlock[];
  };
}

const escapeHref = (value: unknown) => {
  const href = String(value || '').trim();
  return href || '#';
};

const mergeStyles = (base: CSSProperties, overrides?: Record<string, any>): CSSProperties => ({
  ...base,
  ...(overrides || {}),
});

const renderFeatureItems = (items: any[]) => (
  <div
    style={{
      display: 'grid',
      gap: '16px',
      gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    }}
  >
    {items.map((item, index) => (
      <article
        key={`${item?.title || 'feature'}_${index}`}
        style={{
          padding: '16px',
          border: '1px solid #e2e8f0',
          borderRadius: '16px',
          background: '#ffffff',
        }}
      >
        <h3 style={{ margin: '0 0 8px 0', fontSize: '18px', fontWeight: 600, color: '#0f172a' }}>
          {String(item?.title || '')}
        </h3>
        <p style={{ margin: 0, color: '#475569', lineHeight: 1.6 }}>{String(item?.desc || '')}</p>
      </article>
    ))}
  </div>
);

const LandingPageRenderer = ({ page }: LandingPageRendererProps) => {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#ffffff',
        color: '#0f172a',
        fontFamily: 'Arial, Helvetica, sans-serif',
      }}
    >
      {page.blocks.map((block) => {
        switch (block.type) {
          case 'navbar': {
            const links = Array.isArray(block.content.links) ? block.content.links : [];
            return (
              <nav
                key={block.id}
                style={mergeStyles(
                  {
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '16px',
                    flexWrap: 'wrap',
                    padding: '16px 24px',
                    borderBottom: '1px solid #e2e8f0',
                    background: '#ffffff',
                    position: 'sticky',
                    top: 0,
                    zIndex: 10,
                  },
                  block.styles
                )}
              >
                <strong style={{ fontSize: '18px' }}>{String(block.content.brand || 'Brand')}</strong>
                <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', color: '#64748b', fontSize: '14px' }}>
                  {links.map((link: string, index: number) => (
                    <span key={`${link}_${index}`}>{String(link || '')}</span>
                  ))}
                </div>
              </nav>
            );
          }
          case 'hero':
            return (
              <section
                key={block.id}
                style={mergeStyles(
                  {
                    padding: '72px 24px',
                    textAlign: 'center',
                    background: '#f8fafc',
                  },
                  block.styles
                )}
              >
                <div style={{ margin: '0 auto', maxWidth: '840px' }}>
                  <h1 style={{ margin: '0 0 16px 0', fontSize: 'clamp(2.4rem, 5vw, 4.4rem)', lineHeight: 1.05 }}>
                    {String(block.content.headline || '')}
                  </h1>
                  <p style={{ margin: '0 auto 24px', color: '#475569', maxWidth: '720px', fontSize: '18px', lineHeight: 1.7 }}>
                    {String(block.content.subheadline || '')}
                  </p>
                  <a
                    href={escapeHref(block.content.ctaUrl)}
                    style={{
                      display: 'inline-block',
                      background: '#059669',
                      color: '#ffffff',
                      textDecoration: 'none',
                      padding: '14px 24px',
                      borderRadius: '999px',
                      fontWeight: 700,
                    }}
                  >
                    {String(block.content.ctaText || 'Get started')}
                  </a>
                </div>
              </section>
            );
          case 'features': {
            const items = Array.isArray(block.content.items) ? block.content.items : [];
            return (
              <section
                key={block.id}
                style={mergeStyles(
                  {
                    padding: '56px 24px',
                    background: '#ffffff',
                  },
                  block.styles
                )}
              >
                <div style={{ margin: '0 auto', maxWidth: '1120px' }}>
                  <h2 style={{ textAlign: 'center', margin: '0 0 24px 0', fontSize: '32px' }}>
                    {String(block.content.title || 'Features')}
                  </h2>
                  {renderFeatureItems(items)}
                </div>
              </section>
            );
          }
          case 'text':
            return (
              <section
                key={block.id}
                style={mergeStyles(
                  {
                    padding: '32px 24px',
                    background: '#ffffff',
                  },
                  block.styles
                )}
              >
                <div
                  style={{
                    margin: '0 auto',
                    maxWidth: '860px',
                    whiteSpace: 'pre-wrap',
                    fontSize: '18px',
                    lineHeight: 1.8,
                    color: '#334155',
                  }}
                >
                  {String(block.content.content || '')}
                </div>
              </section>
            );
          case 'image': {
            const src = String(block.content.src || '').trim();
            if (!src) return null;
            return (
              <section
                key={block.id}
                style={mergeStyles(
                  {
                    padding: '32px 24px',
                    textAlign: 'center',
                    background: '#ffffff',
                  },
                  block.styles
                )}
              >
                <img
                  src={src}
                  alt={String(block.content.alt || 'Image')}
                  style={{
                    maxWidth: 'min(100%, 1120px)',
                    width: '100%',
                    height: 'auto',
                    borderRadius: '20px',
                    display: 'block',
                    margin: '0 auto',
                  }}
                />
              </section>
            );
          }
          case 'cta':
            return (
              <section
                key={block.id}
                style={mergeStyles(
                  {
                    padding: '56px 24px',
                    textAlign: 'center',
                    background: '#ecfdf5',
                  },
                  block.styles
                )}
              >
                <div style={{ margin: '0 auto', maxWidth: '760px' }}>
                  <h2 style={{ margin: '0 0 16px 0', fontSize: '32px' }}>
                    {String(block.content.headline || '')}
                  </h2>
                  <a
                    href={escapeHref(block.content.buttonUrl)}
                    style={{
                      display: 'inline-block',
                      background: '#059669',
                      color: '#ffffff',
                      textDecoration: 'none',
                      padding: '14px 24px',
                      borderRadius: '999px',
                      fontWeight: 700,
                    }}
                  >
                    {String(block.content.buttonText || 'Learn more')}
                  </a>
                </div>
              </section>
            );
          case 'testimonial': {
            const items = Array.isArray(block.content.items) ? block.content.items : [];
            return (
              <section
                key={block.id}
                style={mergeStyles(
                  {
                    padding: '40px 24px',
                    background: '#ffffff',
                  },
                  block.styles
                )}
              >
                <div
                  style={{
                    margin: '0 auto',
                    maxWidth: '780px',
                    display: 'grid',
                    gap: '20px',
                  }}
                >
                  {items.map((item: any, index: number) => (
                    <div
                      key={`${item?.name || 'testimonial'}_${index}`}
                      style={{
                        border: '1px solid #e2e8f0',
                        borderRadius: '20px',
                        padding: '24px',
                        background: '#ffffff',
                      }}
                    >
                      <blockquote style={{ margin: 0, fontSize: '20px', lineHeight: 1.7, color: '#0f172a' }}>
                        "{String(item?.quote || '')}"
                      </blockquote>
                      <p style={{ margin: '14px 0 0 0', fontWeight: 700 }}>{String(item?.name || '')}</p>
                      <p style={{ margin: '6px 0 0 0', color: '#64748b' }}>{String(item?.role || '')}</p>
                    </div>
                  ))}
                </div>
              </section>
            );
          }
          case 'pricing': {
            const plans = Array.isArray(block.content.plans) ? block.content.plans : [];
            return (
              <section
                key={block.id}
                style={mergeStyles(
                  {
                    padding: '56px 24px',
                    background: '#ffffff',
                  },
                  block.styles
                )}
              >
                <div style={{ margin: '0 auto', maxWidth: '1120px' }}>
                  <h2 style={{ textAlign: 'center', margin: '0 0 24px 0', fontSize: '32px' }}>
                    {String(block.content.title || 'Pricing')}
                  </h2>
                  <div
                    style={{
                      display: 'grid',
                      gap: '16px',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                    }}
                  >
                    {plans.map((plan: any, index: number) => (
                      <article
                        key={`${plan?.name || 'plan'}_${index}`}
                        style={{
                          border: '1px solid #e2e8f0',
                          borderRadius: '20px',
                          padding: '24px',
                          background: '#ffffff',
                        }}
                      >
                        <h3 style={{ margin: 0, fontSize: '20px' }}>{String(plan?.name || '')}</h3>
                        <p style={{ fontSize: '32px', fontWeight: 700, margin: '10px 0' }}>
                          {String(plan?.price || '')}
                        </p>
                        <ul style={{ margin: 0, paddingLeft: '18px', color: '#475569', lineHeight: 1.8 }}>
                          {(Array.isArray(plan?.features) ? plan.features : []).map((feature: string, featureIndex: number) => (
                            <li key={`${feature}_${featureIndex}`}>{String(feature || '')}</li>
                          ))}
                        </ul>
                      </article>
                    ))}
                  </div>
                </div>
              </section>
            );
          }
          case 'faq': {
            const items = Array.isArray(block.content.items) ? block.content.items : [];
            return (
              <section
                key={block.id}
                style={mergeStyles(
                  {
                    padding: '56px 24px',
                    background: '#ffffff',
                  },
                  block.styles
                )}
              >
                <div style={{ margin: '0 auto', maxWidth: '860px' }}>
                  <h2 style={{ margin: '0 0 20px 0', fontSize: '32px' }}>
                    {String(block.content.title || 'FAQ')}
                  </h2>
                  <div style={{ display: 'grid', gap: '12px' }}>
                    {items.map((item: any, index: number) => (
                      <details
                        key={`${item?.q || 'faq'}_${index}`}
                        style={{
                          border: '1px solid #e2e8f0',
                          borderRadius: '16px',
                          padding: '16px 18px',
                          background: '#ffffff',
                        }}
                      >
                        <summary style={{ cursor: 'pointer', fontWeight: 600, color: '#0f172a' }}>
                          {String(item?.q || 'Question')}
                        </summary>
                        <p style={{ color: '#475569', margin: '10px 0 0 0', lineHeight: 1.7 }}>
                          {String(item?.a || '')}
                        </p>
                      </details>
                    ))}
                  </div>
                </div>
              </section>
            );
          }
          case 'form':
            return (
              <LandingPageLeadForm
                key={block.id}
                pageId={page.id}
                pageSlug={page.slug}
                blockId={block.id}
                content={block.content}
              />
            );
          case 'stats': {
            const items = Array.isArray(block.content.items) ? block.content.items : [];
            return (
              <section
                key={block.id}
                style={mergeStyles(
                  {
                    padding: '40px 24px',
                    background: '#ffffff',
                  },
                  block.styles
                )}
              >
                <div
                  style={{
                    margin: '0 auto',
                    maxWidth: '960px',
                    display: 'grid',
                    gap: '12px',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                  }}
                >
                  {items.map((item: any, index: number) => (
                    <div
                      key={`${item?.label || 'stat'}_${index}`}
                      style={{
                        textAlign: 'center',
                        border: '1px solid #e2e8f0',
                        borderRadius: '18px',
                        padding: '20px 16px',
                        background: '#ffffff',
                      }}
                    >
                      <div style={{ fontSize: '32px', fontWeight: 700 }}>{String(item?.value || '')}</div>
                      <div style={{ color: '#64748b', marginTop: '8px' }}>{String(item?.label || '')}</div>
                    </div>
                  ))}
                </div>
              </section>
            );
          }
          case 'gallery': {
            const images = Array.isArray(block.content.images) ? block.content.images : [];
            return (
              <section
                key={block.id}
                style={mergeStyles(
                  {
                    padding: '32px 24px',
                    background: '#ffffff',
                  },
                  block.styles
                )}
              >
                <div
                  style={{
                    margin: '0 auto',
                    maxWidth: '1120px',
                    display: 'grid',
                    gap: '10px',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                  }}
                >
                  {images.map((src: string, index: number) => (
                    <img
                      key={`${src}_${index}`}
                      src={String(src || '')}
                      alt={`Gallery image ${index + 1}`}
                      style={{ width: '100%', height: '100%', minHeight: '180px', objectFit: 'cover', borderRadius: '18px' }}
                    />
                  ))}
                </div>
              </section>
            );
          }
          case 'video': {
            const url = String(block.content.url || '').trim();
            if (!url) return null;
            return (
              <section
                key={block.id}
                style={mergeStyles(
                  {
                    padding: '40px 24px',
                    textAlign: 'center',
                    background: '#ffffff',
                  },
                  block.styles
                )}
              >
                <div
                  style={{
                    margin: '0 auto',
                    maxWidth: '780px',
                    border: '1px solid #e2e8f0',
                    borderRadius: '20px',
                    padding: '28px',
                    background: '#f8fafc',
                  }}
                >
                  <p style={{ margin: '0 0 10px 0', fontSize: '28px', fontWeight: 700 }}>
                    {String(block.content.title || 'Watch video')}
                  </p>
                  <a href={url} style={{ color: '#059669', fontWeight: 600, textDecoration: 'underline' }}>
                    {url}
                  </a>
                </div>
              </section>
            );
          }
          case 'footer': {
            const links = Array.isArray(block.content.links) ? block.content.links : [];
            return (
              <footer
                key={block.id}
                style={mergeStyles(
                  {
                    padding: '24px',
                    borderTop: '1px solid #e2e8f0',
                    color: '#64748b',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '12px',
                    flexWrap: 'wrap',
                    background: '#ffffff',
                  },
                  block.styles
                )}
              >
                <span>{String(block.content.brand || page.name || 'Brand')}</span>
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                  {links.map((link: string, index: number) => (
                    <span key={`${link}_${index}`}>{String(link || '')}</span>
                  ))}
                </div>
              </footer>
            );
          }
          default:
            return null;
        }
      })}
    </div>
  );
};

export default LandingPageRenderer;

export interface LandingPageTheme {
  background: string;
  surface: string;
  surfaceAlt: string;
  text: string;
  muted: string;
  border: string;
  accent: string;
  accentContrast: string;
  accentAlt: string;
  heroGlow: string;
  shadow: string;
  radius: string;
  maxWidth: string;
  bodyFont: string;
  displayFont: string;
}

export interface LandingPageSeoSettings {
  title: string;
  description: string;
  keywords: string[];
  ogImageUrl: string;
  canonicalUrl: string;
}

export interface LandingPageAnnouncementBar {
  enabled: boolean;
  text: string;
  ctaText: string;
  ctaUrl: string;
}

export interface LandingPageStickyCta {
  enabled: boolean;
  label: string;
  buttonText: string;
  buttonUrl: string;
}

export interface LandingPageSettings {
  themePresetId: string;
  theme: LandingPageTheme;
  seo: LandingPageSeoSettings;
  announcementBar: LandingPageAnnouncementBar;
  stickyCta: LandingPageStickyCta;
}

export interface LandingPageThemePreset {
  id: string;
  name: string;
  description: string;
  theme: LandingPageTheme;
}

const DEFAULT_THEME: LandingPageTheme = {
  background: '#f6f7fb',
  surface: '#ffffff',
  surfaceAlt: '#eef2ff',
  text: '#0f172a',
  muted: '#475569',
  border: '#dbe2f0',
  accent: '#2563eb',
  accentContrast: '#ffffff',
  accentAlt: '#14b8a6',
  heroGlow: 'rgba(37,99,235,0.22)',
  shadow: '0 28px 80px rgba(15, 23, 42, 0.12)',
  radius: '28px',
  maxWidth: '1180px',
  bodyFont: '"IBM Plex Sans", "Segoe UI", sans-serif',
  displayFont: '"Space Grotesk", "Segoe UI", sans-serif',
};

export const LANDING_PAGE_THEME_PRESETS: LandingPageThemePreset[] = [
  {
    id: 'signal',
    name: 'Signal Blue',
    description: 'Clear SaaS palette with crisp contrast and teal support.',
    theme: DEFAULT_THEME,
  },
  {
    id: 'ember',
    name: 'Ember Coral',
    description: 'Warm premium palette for consultancies, agencies, and launches.',
    theme: {
      background: '#fff7f2',
      surface: '#fffdfb',
      surfaceAlt: '#ffe8db',
      text: '#25130f',
      muted: '#6c4b3f',
      border: '#f1cbbb',
      accent: '#e85d3d',
      accentContrast: '#fffaf6',
      accentAlt: '#0f766e',
      heroGlow: 'rgba(232,93,61,0.22)',
      shadow: '0 28px 80px rgba(120, 53, 15, 0.14)',
      radius: '30px',
      maxWidth: '1180px',
      bodyFont: '"DM Sans", "Segoe UI", sans-serif',
      displayFont: '"Sora", "Trebuchet MS", sans-serif',
    },
  },
  {
    id: 'midnight',
    name: 'Midnight Grid',
    description: 'High-contrast dark theme for technical products and demos.',
    theme: {
      background: '#08111f',
      surface: '#0f172a',
      surfaceAlt: '#15233b',
      text: '#eff6ff',
      muted: '#93a4bf',
      border: '#26344d',
      accent: '#38bdf8',
      accentContrast: '#04111d',
      accentAlt: '#a78bfa',
      heroGlow: 'rgba(56,189,248,0.24)',
      shadow: '0 28px 90px rgba(2, 6, 23, 0.45)',
      radius: '30px',
      maxWidth: '1180px',
      bodyFont: '"Plus Jakarta Sans", "Segoe UI", sans-serif',
      displayFont: '"Space Grotesk", "Segoe UI", sans-serif',
    },
  },
  {
    id: 'grove',
    name: 'Grove Green',
    description: 'Trust-heavy palette for webinars, lead magnets, and services.',
    theme: {
      background: '#f4faf7',
      surface: '#ffffff',
      surfaceAlt: '#e3f3eb',
      text: '#13251f',
      muted: '#557368',
      border: '#c9e1d5',
      accent: '#0f766e',
      accentContrast: '#effefb',
      accentAlt: '#84cc16',
      heroGlow: 'rgba(15,118,110,0.2)',
      shadow: '0 28px 80px rgba(20, 83, 45, 0.14)',
      radius: '26px',
      maxWidth: '1160px',
      bodyFont: '"Manrope", "Segoe UI", sans-serif',
      displayFont: '"Fraunces", Georgia, serif',
    },
  },
];

export const DEFAULT_LANDING_PAGE_SETTINGS: LandingPageSettings = {
  themePresetId: LANDING_PAGE_THEME_PRESETS[0].id,
  theme: { ...LANDING_PAGE_THEME_PRESETS[0].theme },
  seo: {
    title: '',
    description: '',
    keywords: [],
    ogImageUrl: '',
    canonicalUrl: '',
  },
  announcementBar: {
    enabled: false,
    text: 'New launch: limited onboarding spots are now open.',
    ctaText: 'Claim your spot',
    ctaUrl: '#contact',
  },
  stickyCta: {
    enabled: false,
    label: 'Ready to convert more traffic?',
    buttonText: 'Book a demo',
    buttonUrl: '#contact',
  },
};

const cloneTheme = (theme: LandingPageTheme): LandingPageTheme => ({ ...theme });

const ensureStringArray = (value: unknown) =>
  Array.isArray(value) ? value.map((item) => String(item || '').trim()).filter(Boolean) : [];

export const getLandingPageThemePreset = (presetId: string) =>
  LANDING_PAGE_THEME_PRESETS.find((preset) => preset.id === presetId) || LANDING_PAGE_THEME_PRESETS[0];

export const buildLandingPageSettingsFromPreset = (
  presetId: string,
  overrides?: Partial<LandingPageSettings>
): LandingPageSettings => {
  const preset = getLandingPageThemePreset(presetId);
  const normalized = normalizeLandingPageSettings({
    ...DEFAULT_LANDING_PAGE_SETTINGS,
    themePresetId: preset.id,
    theme: cloneTheme(preset.theme),
    ...(overrides || {}),
  });
  return normalized;
};

export const normalizeLandingPageSettings = (value: unknown): LandingPageSettings => {
  const raw = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const preset = getLandingPageThemePreset(String(raw.themePresetId || DEFAULT_LANDING_PAGE_SETTINGS.themePresetId));
  const rawTheme = raw.theme && typeof raw.theme === 'object' ? (raw.theme as Record<string, unknown>) : {};
  const rawSeo = raw.seo && typeof raw.seo === 'object' ? (raw.seo as Record<string, unknown>) : {};
  const rawAnnouncement =
    raw.announcementBar && typeof raw.announcementBar === 'object'
      ? (raw.announcementBar as Record<string, unknown>)
      : {};
  const rawSticky =
    raw.stickyCta && typeof raw.stickyCta === 'object' ? (raw.stickyCta as Record<string, unknown>) : {};

  return {
    themePresetId: preset.id,
    theme: {
      ...cloneTheme(preset.theme),
      ...Object.fromEntries(
        Object.entries(rawTheme).map(([key, item]) => [key, String(item || '').trim()])
      ),
    },
    seo: {
      title: String(rawSeo.title || '').trim(),
      description: String(rawSeo.description || '').trim(),
      keywords: ensureStringArray(rawSeo.keywords),
      ogImageUrl: String(rawSeo.ogImageUrl || '').trim(),
      canonicalUrl: String(rawSeo.canonicalUrl || '').trim(),
    },
    announcementBar: {
      enabled: Boolean(rawAnnouncement.enabled),
      text: String(rawAnnouncement.text || DEFAULT_LANDING_PAGE_SETTINGS.announcementBar.text).trim(),
      ctaText: String(rawAnnouncement.ctaText || DEFAULT_LANDING_PAGE_SETTINGS.announcementBar.ctaText).trim(),
      ctaUrl: String(rawAnnouncement.ctaUrl || DEFAULT_LANDING_PAGE_SETTINGS.announcementBar.ctaUrl).trim(),
    },
    stickyCta: {
      enabled: Boolean(rawSticky.enabled),
      label: String(rawSticky.label || DEFAULT_LANDING_PAGE_SETTINGS.stickyCta.label).trim(),
      buttonText: String(rawSticky.buttonText || DEFAULT_LANDING_PAGE_SETTINGS.stickyCta.buttonText).trim(),
      buttonUrl: String(rawSticky.buttonUrl || DEFAULT_LANDING_PAGE_SETTINGS.stickyCta.buttonUrl).trim(),
    },
  };
};

export const updateLandingPageThemePreset = (
  settings: LandingPageSettings,
  presetId: string
): LandingPageSettings => {
  const preset = getLandingPageThemePreset(presetId);
  return normalizeLandingPageSettings({
    ...settings,
    themePresetId: preset.id,
    theme: preset.theme,
  });
};

export const landingPageThemeStyleVars = (settings: LandingPageSettings) => ({
  '--lp-bg': settings.theme.background,
  '--lp-surface': settings.theme.surface,
  '--lp-surface-alt': settings.theme.surfaceAlt,
  '--lp-text': settings.theme.text,
  '--lp-muted': settings.theme.muted,
  '--lp-border': settings.theme.border,
  '--lp-accent': settings.theme.accent,
  '--lp-accent-contrast': settings.theme.accentContrast,
  '--lp-accent-alt': settings.theme.accentAlt,
  '--lp-glow': settings.theme.heroGlow,
  '--lp-shadow': settings.theme.shadow,
  '--lp-radius': settings.theme.radius,
  '--lp-max-width': settings.theme.maxWidth,
  '--lp-font-body': settings.theme.bodyFont,
  '--lp-font-display': settings.theme.displayFont,
});

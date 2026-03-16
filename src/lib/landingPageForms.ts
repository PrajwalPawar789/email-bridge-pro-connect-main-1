export type LandingPageFormFieldType = 'text' | 'email' | 'tel' | 'textarea' | 'select';

export interface LandingPageFormField {
  id: string;
  key: string;
  label: string;
  type: LandingPageFormFieldType;
  placeholder: string;
  required: boolean;
  options: string[];
}

export interface LandingPageFormContent {
  title: string;
  description: string;
  buttonText: string;
  successMessage: string;
  successRedirectUrl: string;
  successAssetUrl: string;
  privacyNote: string;
  requireConsent: boolean;
  consentLabel: string;
  anchorId: string;
  targetListId: string;
  targetListName: string;
  fields: LandingPageFormField[];
}

const slugifyKey = (value: string) =>
  value
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

const normalizeFieldType = (value: unknown): LandingPageFormFieldType => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'email' || normalized === 'tel' || normalized === 'textarea' || normalized === 'select') {
    return normalized;
  }
  return 'text';
};

export const createLandingPageFormField = (
  overrides?: Partial<LandingPageFormField>
): LandingPageFormField => {
  const label = String(overrides?.label || overrides?.key || 'Field').trim();
  const key = slugifyKey(String(overrides?.key || label || 'field')) || `field_${crypto.randomUUID().slice(0, 8)}`;
  const type = normalizeFieldType(overrides?.type);

  return {
    id: String(overrides?.id || key || crypto.randomUUID()),
    key,
    label: label || 'Field',
    type,
    placeholder:
      String(
        overrides?.placeholder ||
          (type === 'email'
            ? 'you@company.com'
            : type === 'tel'
              ? '+1 555 000 0000'
              : type === 'textarea'
                ? 'Share more context'
                : '')
      ).trim(),
    required: Boolean(overrides?.required),
    options: Array.isArray(overrides?.options)
      ? overrides.options.map((item) => String(item || '').trim()).filter(Boolean)
      : [],
  };
};

export const DEFAULT_LANDING_PAGE_FORM_FIELDS: LandingPageFormField[] = [
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
    required: false,
  }),
];

export const DEFAULT_LANDING_PAGE_FORM_CONTENT: LandingPageFormContent = {
  title: 'Contact us',
  description: 'Tell us a bit about what you need and we will follow up shortly.',
  buttonText: 'Submit',
  successMessage: 'Thanks. Your details were received.',
  successRedirectUrl: '',
  successAssetUrl: '',
  privacyNote: 'We only use this information to follow up about your request.',
  requireConsent: false,
  consentLabel: 'I agree to receive follow-up communication about this request.',
  anchorId: 'contact',
  targetListId: '',
  targetListName: '',
  fields: DEFAULT_LANDING_PAGE_FORM_FIELDS,
};

export const normalizeLandingPageFormField = (
  value: unknown,
  index: number
): LandingPageFormField => {
  if (typeof value === 'string') {
    const label = value.trim() || `Field ${index + 1}`;
    return createLandingPageFormField({
      id: slugifyKey(label) || `field_${index + 1}`,
      key: slugifyKey(label) || `field_${index + 1}`,
      label,
      type: label.toLowerCase().includes('email')
        ? 'email'
        : label.toLowerCase().includes('phone')
          ? 'tel'
          : label.toLowerCase().includes('message')
            ? 'textarea'
            : 'text',
      required: label.toLowerCase().includes('email') || label.toLowerCase().includes('name'),
    });
  }

  const raw = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  return createLandingPageFormField({
    id: String(raw.id || ''),
    key: String(raw.key || raw.name || raw.id || raw.label || ''),
    label: String(raw.label || raw.name || raw.key || `Field ${index + 1}`),
    type: normalizeFieldType(raw.type),
    placeholder: String(raw.placeholder || ''),
    required: Boolean(raw.required),
    options: Array.isArray(raw.options)
      ? raw.options.map((item) => String(item || '').trim()).filter(Boolean)
      : [],
  });
};

export const normalizeLandingPageFormContent = (value: unknown): LandingPageFormContent => {
  const raw = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const fields = Array.isArray(raw.fields)
    ? raw.fields.map(normalizeLandingPageFormField).filter(Boolean)
    : DEFAULT_LANDING_PAGE_FORM_FIELDS;

  return {
    title: String(raw.title || DEFAULT_LANDING_PAGE_FORM_CONTENT.title),
    description: String(raw.description || raw.subtitle || DEFAULT_LANDING_PAGE_FORM_CONTENT.description),
    buttonText: String(raw.buttonText || raw.ctaText || DEFAULT_LANDING_PAGE_FORM_CONTENT.buttonText),
    successMessage: String(raw.successMessage || DEFAULT_LANDING_PAGE_FORM_CONTENT.successMessage),
    successRedirectUrl: String(raw.successRedirectUrl || ''),
    successAssetUrl: String(raw.successAssetUrl || ''),
    privacyNote: String(raw.privacyNote || DEFAULT_LANDING_PAGE_FORM_CONTENT.privacyNote),
    requireConsent: Boolean(raw.requireConsent),
    consentLabel: String(raw.consentLabel || DEFAULT_LANDING_PAGE_FORM_CONTENT.consentLabel),
    anchorId: String(raw.anchorId || DEFAULT_LANDING_PAGE_FORM_CONTENT.anchorId),
    targetListId: String(raw.targetListId || ''),
    targetListName: String(raw.targetListName || ''),
    fields: fields.length > 0 ? fields : DEFAULT_LANDING_PAGE_FORM_FIELDS,
  };
};

export const getLandingPageFormPublishError = (content: unknown) => {
  const normalized = normalizeLandingPageFormContent(content);

  if (!normalized.targetListId) {
    return 'Connect the form to a destination list before publishing.';
  }

  const hasEmailField = normalized.fields.some((field) => field.type === 'email' || field.key === 'email');
  if (!hasEmailField) {
    return 'Add an email field so captured leads can be saved.';
  }

  return '';
};

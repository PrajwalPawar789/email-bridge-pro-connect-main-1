import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import { Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { normalizeLandingPageFormContent } from '@/lib/landingPageForms';

interface LandingPageLeadFormProps {
  pageId: string;
  pageSlug: string;
  blockId: string;
  content: unknown;
  preview?: boolean;
}

type SubmitState = 'idle' | 'submitting' | 'success' | 'error';

const fieldClassName =
  'w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100';

const getSubmissionContext = () => {
  if (typeof window === 'undefined') return {};
  const params = new URLSearchParams(window.location.search);

  return {
    sourceUrl: window.location.href,
    referrer: document.referrer,
    host: window.location.host,
    path: window.location.pathname,
    locale: navigator.language,
    userAgent: navigator.userAgent,
    utmSource: params.get('utm_source') || '',
    utmMedium: params.get('utm_medium') || '',
    utmCampaign: params.get('utm_campaign') || '',
    utmTerm: params.get('utm_term') || '',
    utmContent: params.get('utm_content') || '',
  };
};

const LandingPageLeadForm = ({
  pageId,
  pageSlug,
  blockId,
  content,
  preview = false,
}: LandingPageLeadFormProps) => {
  const form = useMemo(() => normalizeLandingPageFormContent(content), [content]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [website, setWebsite] = useState('');
  const [submitState, setSubmitState] = useState<SubmitState>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    setValues(
      form.fields.reduce<Record<string, string>>((acc, field) => {
        acc[field.key] = '';
        return acc;
      }, {})
    );
    setWebsite('');
    setSubmitState('idle');
    setErrorMessage('');
  }, [form.fields]);

  const handleValueChange = (key: string, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    if (submitState !== 'submitting') {
      setSubmitState('idle');
      setErrorMessage('');
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (preview) return;

    const emailField =
      form.fields.find((field) => field.type === 'email') ||
      form.fields.find((field) => field.key === 'email');
    const emailValue = emailField ? String(values[emailField.key] || '').trim() : '';

    for (const field of form.fields) {
      if (!field.required) continue;
      if (String(values[field.key] || '').trim()) continue;
      setSubmitState('error');
      setErrorMessage(`${field.label} is required.`);
      return;
    }

    if (!emailValue) {
      setSubmitState('error');
      setErrorMessage('A valid email field is required.');
      return;
    }

    setSubmitState('submitting');
    setErrorMessage('');

    const { data, error } = await supabase.functions.invoke('landing-page-submit', {
      body: {
        pageId,
        pageSlug,
        formId: blockId,
        values,
        website,
        context: getSubmissionContext(),
      },
    });

    if (error || data?.error) {
      setSubmitState('error');
      setErrorMessage(error?.message || data?.error || 'We could not send your details. Please try again.');
      return;
    }

    setSubmitState('success');
    setValues(
      form.fields.reduce<Record<string, string>>((acc, field) => {
        acc[field.key] = '';
        return acc;
      }, {})
    );
    setWebsite('');
  };

  return (
    <section
      id={form.anchorId || undefined}
      className="px-6 py-10 sm:px-8"
      style={{ background: '#f8fafc' }}
    >
      <div className="mx-auto max-w-3xl rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)] sm:p-8">
        <div className="max-w-2xl">
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900">{form.title}</h2>
          {form.description ? <p className="mt-2 text-sm leading-6 text-slate-600">{form.description}</p> : null}
        </div>

        <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
          <div className="grid gap-4 sm:grid-cols-2">
            {form.fields.map((field) => {
              const isTextarea = field.type === 'textarea';
              const isSelect = field.type === 'select';
              const baseProps = {
                id: `${blockId}_${field.id}`,
                name: field.key,
                value: values[field.key] || '',
                required: field.required,
                disabled: preview || submitState === 'submitting',
                onChange: (
                  event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
                ) => handleValueChange(field.key, event.target.value),
                className: fieldClassName,
              };

              return (
                <label
                  key={field.id}
                  className={isTextarea ? 'text-sm text-slate-700 sm:col-span-2' : 'text-sm text-slate-700'}
                >
                  <span className="mb-2 block font-medium">
                    {field.label}
                    {field.required ? ' *' : ''}
                  </span>
                  {isTextarea ? (
                    <textarea
                      {...baseProps}
                      rows={4}
                      placeholder={field.placeholder || 'Share more context'}
                    />
                  ) : isSelect ? (
                    <select {...baseProps}>
                      <option value="">{field.placeholder || `Select ${field.label.toLowerCase()}`}</option>
                      {field.options.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      {...baseProps}
                      type={field.type === 'email' ? 'email' : field.type === 'tel' ? 'tel' : 'text'}
                      placeholder={field.placeholder || ''}
                    />
                  )}
                </label>
              );
            })}
          </div>

          <label className="hidden">
            Website
            <input
              type="text"
              tabIndex={-1}
              autoComplete="off"
              value={website}
              onChange={(event) => setWebsite(event.target.value)}
            />
          </label>

          {form.privacyNote ? (
            <p className="text-xs leading-5 text-slate-500">{form.privacyNote}</p>
          ) : null}

          {preview ? (
            <div className="rounded-2xl border border-dashed border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              {form.targetListId
                ? `Leads will be added to ${form.targetListName || 'the selected contact list'} when this page is published.`
                : 'Connect this form to a list before publishing so captured leads have a destination.'}
            </div>
          ) : null}

          {!preview ? (
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-h-6 text-sm" aria-live="polite">
                {submitState === 'success' ? (
                  <span className="inline-flex items-center gap-2 text-emerald-700">
                    <CheckCircle2 className="h-4 w-4" />
                    {form.successMessage}
                  </span>
                ) : null}
                {submitState === 'error' ? (
                  <span className="inline-flex items-center gap-2 text-rose-700">
                    <AlertTriangle className="h-4 w-4" />
                    {errorMessage}
                  </span>
                ) : null}
              </div>

              <button
                type="submit"
                disabled={submitState === 'submitting'}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-emerald-600 px-6 py-3 text-sm font-semibold text-white shadow-[0_14px_32px_rgba(5,150,105,0.22)] transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {submitState === 'submitting' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {form.buttonText}
              </button>
            </div>
          ) : null}
        </form>
      </div>
    </section>
  );
};

export default LandingPageLeadForm;

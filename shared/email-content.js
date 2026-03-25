const HTML_TAG_REGEX = /<\s*(html|head|body|div|p|br|table|tbody|tr|td|th|span|img|a|style|meta|link|!doctype|ul|ol|li|strong|em|u|s|blockquote)\b/i;

export const looksLikeHtml = (value) => HTML_TAG_REGEX.test(String(value || ''));

export const stripHtmlToPlainText = (value) => {
  if (!value) return '';
  return String(value)
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\s*\/p\s*>/gi, '\n')
    .replace(/<\s*\/div\s*>/gi, '\n')
    .replace(/<\s*\/li\s*>/gi, '\n')
    .replace(/<\s*li\b[^>]*>/gi, '- ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n\s*\n+/g, '\n\n')
    .trim();
};

export const normalizePlainTextEmailBody = (value) => {
  const text = String(value || '');
  return looksLikeHtml(text) ? stripHtmlToPlainText(text) : text;
};

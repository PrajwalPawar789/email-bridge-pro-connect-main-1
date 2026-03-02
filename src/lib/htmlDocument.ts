const BODY_REGEX = /<body[^>]*>([\s\S]*?)<\/body>/i;
const TITLE_REGEX = /<title[^>]*>([\s\S]*?)<\/title>/i;

export const extractHtmlBodyContent = (html: string) => {
  const value = String(html || '').trim();
  const match = value.match(BODY_REGEX);
  return match?.[1]?.trim() || value;
};

export const extractHtmlTitle = (html: string) => {
  const value = String(html || '');
  const match = value.match(TITLE_REGEX);
  if (!match?.[1]) return '';
  return match[1]
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
};

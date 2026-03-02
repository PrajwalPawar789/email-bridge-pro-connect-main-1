import type { EmailBuilderBlock } from '@/lib/emailBuilderPersistence';
import { extractHtmlTitle } from '@/lib/htmlDocument';

type Alignment = 'left' | 'center' | 'right';

interface ImportedEmailDraft {
  name: string;
  subject: string;
  blocks: EmailBuilderBlock[];
}

const DEFAULT_BLOCK_STYLES = { padding: '16px', backgroundColor: 'transparent' };

const CONTAINER_TAGS = new Set([
  'body',
  'main',
  'section',
  'article',
  'header',
  'footer',
  'div',
  'center',
  'tbody',
  'thead',
  'tfoot',
  'tr',
  'td',
  'th',
  'span',
  'font',
]);

const INLINE_TAGS = new Set([
  'a',
  'abbr',
  'b',
  'br',
  'code',
  'em',
  'i',
  'mark',
  'small',
  'span',
  'strong',
  'sub',
  'sup',
  'u',
]);

const IGNORE_TAGS = new Set(['script', 'style', 'meta', 'link', 'title', 'head', 'noscript', 'svg', 'path']);

const BLOCK_DESCENDANT_TAGS = new Set([
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'p',
  'ul',
  'ol',
  'blockquote',
  'pre',
  'table',
  'img',
  'hr',
  'button',
  'a',
]);

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const normalizeWhitespace = (value: string) =>
  String(value || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();

const toHtmlParagraph = (value: string) => `<p>${escapeHtml(value).replace(/\n/g, '<br />')}</p>`;

const parseStyleMap = (styleValue: string | null) => {
  const raw = String(styleValue || '').trim();
  if (!raw) return {} as Record<string, string>;
  return raw
    .split(';')
    .map((item) => item.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((acc, item) => {
      const separator = item.indexOf(':');
      if (separator <= 0) return acc;
      const key = item.slice(0, separator).trim().toLowerCase();
      const value = item.slice(separator + 1).trim();
      if (!key || !value) return acc;
      acc[key] = value;
      return acc;
    }, {});
};

const readStyleValue = (element: HTMLElement, ...keys: string[]) => {
  const map = parseStyleMap(element.getAttribute('style'));
  for (const key of keys) {
    const value = map[key];
    if (value) return value;
  }
  return '';
};

const parsePixelValue = (raw: string | null | undefined) => {
  const value = String(raw || '').trim().toLowerCase();
  if (!value) return null;

  const pxMatch = value.match(/^(-?\d+(?:\.\d+)?)(px)?$/);
  if (pxMatch) return Math.round(Number(pxMatch[1]));

  const remMatch = value.match(/^(-?\d+(?:\.\d+)?)rem$/);
  if (remMatch) return Math.round(Number(remMatch[1]) * 16);

  const emMatch = value.match(/^(-?\d+(?:\.\d+)?)em$/);
  if (emMatch) return Math.round(Number(emMatch[1]) * 16);

  return null;
};

const detectAlignment = (element: HTMLElement): Alignment => {
  let current: HTMLElement | null = element;
  while (current) {
    const inlineAlign = readStyleValue(current, 'text-align').toLowerCase();
    const attrAlign = String(current.getAttribute('align') || '').toLowerCase();
    const align = inlineAlign || attrAlign;
    if (align === 'left' || align === 'center' || align === 'right') return align;
    current = current.parentElement;
  }
  return 'center';
};

const createBlock = (
  type: EmailBuilderBlock['type'],
  content: Record<string, any>,
  styles?: Record<string, any>
): EmailBuilderBlock => ({
  id: crypto.randomUUID(),
  type,
  content,
  styles: { ...DEFAULT_BLOCK_STYLES, ...(styles || {}) },
});

const textFromElement = (element: HTMLElement) => normalizeWhitespace(element.textContent || '');

const isStandaloneAnchor = (element: HTMLAnchorElement) => {
  const parentTag = element.parentElement?.tagName.toLowerCase() || '';
  if (parentTag === 'p' || parentTag === 'li') return false;
  return !element.querySelector('img, table, div, p, ul, ol, blockquote');
};

const isButtonLikeAnchor = (element: HTMLAnchorElement | HTMLButtonElement) => {
  if (element.tagName.toLowerCase() === 'button') return true;
  const className = String(element.getAttribute('class') || '').toLowerCase();
  const role = String(element.getAttribute('role') || '').toLowerCase();
  const hasButtonClass = /btn|button|cta/.test(className);
  const hasButtonRole = role === 'button';
  const hasButtonStyle = Boolean(
    readStyleValue(element, 'background', 'background-color', 'border-radius', 'padding', 'border')
  );
  return hasButtonClass || hasButtonRole || hasButtonStyle;
};

const isSpacerElement = (element: HTMLElement) => {
  const tag = element.tagName.toLowerCase();
  if (tag === 'br') return 16;

  const hasMeaningfulText = textFromElement(element).length > 0;
  if (hasMeaningfulText) return null;

  if (element.querySelector('img, table, hr, button, a')) return null;

  const inlineHeight =
    parsePixelValue(readStyleValue(element, 'height', 'min-height')) ||
    parsePixelValue(element.getAttribute('height'));

  if (inlineHeight && inlineHeight >= 8) return inlineHeight;
  return null;
};

const parseTableRows = (table: HTMLTableElement) =>
  Array.from(table.rows)
    .map((row) => Array.from(row.cells).map((cell) => normalizeWhitespace(cell.textContent || '')))
    .filter((row) => row.some((cell) => cell.length > 0));

const tableToColumnsBlock = (table: HTMLTableElement): EmailBuilderBlock | null => {
  const rows = parseTableRows(table);
  if (rows.length !== 1) return null;
  const firstRow = rows[0] || [];
  if (firstRow.length < 2 || firstRow.length > 3) return null;

  const hasNestedMedia = Boolean(table.querySelector('img, table, button'));
  if (hasNestedMedia) return null;

  const tooLong = firstRow.some((cell) => cell.length > 220);
  if (tooLong) return null;

  return createBlock('columns', {
    count: firstRow.length,
    content: firstRow.map((cell, index) => ({ text: cell || `Column ${index + 1}` })),
  });
};

const isLikelyDataTable = (table: HTMLTableElement, rows: string[][]) => {
  if (rows.length < 2) return false;
  const hasHeader = table.querySelector('th') !== null;
  if (hasHeader) return true;
  const maxCols = Math.max(...rows.map((row) => row.length), 0);
  return maxCols > 1 && rows.length >= 3;
};

const hasOnlyInlineChildren = (element: HTMLElement) => {
  const children = Array.from(element.children) as HTMLElement[];
  if (children.length === 0) return true;
  return children.every((child) => INLINE_TAGS.has(child.tagName.toLowerCase()));
};

const hasMappedBlockDescendant = (element: HTMLElement) =>
  Array.from(element.children).some((child) => BLOCK_DESCENDANT_TAGS.has(child.tagName.toLowerCase()));

const isLikelySignatureText = (value: string) =>
  /(best regards|kind regards|regards,|thanks,|sincerely,)/i.test(value);

const cleanupBlocks = (blocks: EmailBuilderBlock[]) => {
  const compact = blocks.filter((block) => {
    if (block.type === 'spacer') {
      const height = Number(block.content.height || 0);
      return Number.isFinite(height) && height > 0;
    }
    if (block.type === 'text' || block.type === 'heading' || block.type === 'quote' || block.type === 'signature') {
      return normalizeWhitespace(String(block.content.text || '')).length > 0;
    }
    return true;
  });

  const withoutRepeatedSpacers = compact.filter((block, index) => {
    if (block.type !== 'spacer') return true;
    const previous = compact[index - 1];
    return previous?.type !== 'spacer';
  });

  const startIndex = withoutRepeatedSpacers.findIndex((block) => block.type !== 'spacer');
  const endIndex =
    withoutRepeatedSpacers.length -
    1 -
    [...withoutRepeatedSpacers].reverse().findIndex((block) => block.type !== 'spacer');

  if (startIndex < 0 || endIndex < 0 || startIndex > endIndex) return [];
  return withoutRepeatedSpacers.slice(startIndex, endIndex + 1);
};

export const mapHtmlToEmailBuilderBlocks = (rawHtml: string): ImportedEmailDraft => {
  const html = String(rawHtml || '').trim();
  if (!html) return { name: '', subject: '', blocks: [] };

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const blocks: EmailBuilderBlock[] = [];

  const pushTextBlock = (htmlValue: string, textValue: string) => {
    const text = normalizeWhitespace(textValue);
    if (!text) return;
    const richHtml = htmlValue.trim() || toHtmlParagraph(text);
    blocks.push(createBlock('text', { html: richHtml, text }));
  };

  const parseNodes = (nodes: ChildNode[]) => {
    nodes.forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = normalizeWhitespace(node.textContent || '');
        if (text) pushTextBlock(toHtmlParagraph(text), text);
        return;
      }

      if (node.nodeType !== Node.ELEMENT_NODE) return;

      const element = node as HTMLElement;
      const tag = element.tagName.toLowerCase();
      if (IGNORE_TAGS.has(tag)) return;

      const spacerHeight = isSpacerElement(element);
      if (spacerHeight) {
        blocks.push(createBlock('spacer', { height: spacerHeight }));
        return;
      }

      if (tag === 'hr') {
        blocks.push(
          createBlock('divider', {
            color: readStyleValue(element, 'border-top-color', 'border-color') || '#e5e5e5',
            thickness: parsePixelValue(readStyleValue(element, 'border-top-width', 'border-width')) || 1,
            style: readStyleValue(element, 'border-top-style', 'border-style') || 'solid',
          })
        );
        return;
      }

      if (tag === 'img') {
        const image = element as HTMLImageElement;
        const src = String(image.getAttribute('src') || '').trim();
        if (!src) return;
        const widthStyle = readStyleValue(image, 'width');
        const widthAttr = image.getAttribute('width');
        const width = widthStyle || (widthAttr ? `${widthAttr}px` : '100%');
        blocks.push(
          createBlock('image', {
            src,
            alt: image.getAttribute('alt') || 'Image',
            width,
          })
        );
        return;
      }

      if (/^h[1-6]$/.test(tag)) {
        const text = textFromElement(element);
        if (!text) return;
        blocks.push(
          createBlock('heading', {
            text,
            html: element.innerHTML.trim() || escapeHtml(text),
            level: tag,
          })
        );
        return;
      }

      if (tag === 'blockquote') {
        const text = textFromElement(element);
        if (!text) return;
        blocks.push(
          createBlock('quote', {
            text,
            html: element.innerHTML.trim() || escapeHtml(text),
          })
        );
        return;
      }

      if (tag === 'pre' || tag === 'code') {
        const text = textFromElement(element);
        if (!text) return;
        blocks.push(
          createBlock('code', {
            text,
            html: `<code>${escapeHtml(text)}</code>`,
            language: 'plain',
          })
        );
        return;
      }

      if (tag === 'button' || tag === 'a') {
        const anchor = element as HTMLAnchorElement;
        if (tag === 'a' && !isStandaloneAnchor(anchor)) {
          if (hasMappedBlockDescendant(element)) {
            parseNodes(Array.from(element.childNodes));
            return;
          }
          pushTextBlock(element.outerHTML, textFromElement(element));
          return;
        }

        const label = textFromElement(element) || 'Click here';
        const href = tag === 'a' ? String(anchor.getAttribute('href') || '#').trim() || '#' : '#';

        if (isButtonLikeAnchor(anchor)) {
          blocks.push(
            createBlock('button', {
              text: label,
              url: href,
              align: detectAlignment(element),
              bgColor: readStyleValue(element, 'background-color', 'background') || '#2a9d6e',
              textColor: readStyleValue(element, 'color') || '#ffffff',
              borderRadius: readStyleValue(element, 'border-radius') || '8px',
              buttonPadding: readStyleValue(element, 'padding') || '10px 24px',
            })
          );
          return;
        }

        blocks.push(
          createBlock('bookmark', {
            title: label,
            url: href,
            description: '',
          })
        );
        return;
      }

      if (tag === 'table') {
        const table = element as HTMLTableElement;
        const columnsBlock = tableToColumnsBlock(table);
        if (columnsBlock) {
          blocks.push(columnsBlock);
          return;
        }

        const rows = parseTableRows(table);
        if (isLikelyDataTable(table, rows)) {
          blocks.push(
            createBlock('table', {
              rows: rows.length,
              cols: Math.max(...rows.map((row) => row.length), 0),
              data: rows,
            })
          );
          return;
        }

        Array.from(table.rows).forEach((row) => {
          Array.from(row.cells).forEach((cell) => {
            parseNodes(Array.from(cell.childNodes));
          });
        });
        return;
      }

      if (tag === 'p' || tag === 'ul' || tag === 'ol') {
        pushTextBlock(element.outerHTML, textFromElement(element));
        return;
      }

      if (CONTAINER_TAGS.has(tag)) {
        const text = textFromElement(element);
        if (!text) {
          parseNodes(Array.from(element.childNodes));
          return;
        }

        if (hasOnlyInlineChildren(element) && !hasMappedBlockDescendant(element)) {
          pushTextBlock(element.innerHTML.trim(), text);
          return;
        }

        parseNodes(Array.from(element.childNodes));
        return;
      }

      const fallbackText = textFromElement(element);
      if (fallbackText) {
        pushTextBlock(element.outerHTML, fallbackText);
      } else {
        parseNodes(Array.from(element.childNodes));
      }
    });
  };

  parseNodes(Array.from(doc.body.childNodes));

  const cleanedBlocks = cleanupBlocks(blocks);
  const subjectMeta = doc
    .querySelector('meta[name="subject"], meta[name="x-subject"], meta[property="og:title"]')
    ?.getAttribute('content');
  const title = normalizeWhitespace(subjectMeta || extractHtmlTitle(html));
  const subject = title;
  const name = title ? `${title} Imported` : 'Imported HTML Email';

  const withSignature = [...cleanedBlocks];
  for (let index = withSignature.length - 1; index >= 0; index -= 1) {
    const block = withSignature[index];
    if (!block) continue;
    if (block.type !== 'text') continue;
    const text = normalizeWhitespace(String(block.content.text || ''));
    if (!isLikelySignatureText(text)) continue;
    withSignature[index] = createBlock(
      'signature',
      {
        text,
        html: String(block.content.html || toHtmlParagraph(text)),
      },
      block.styles
    );
    break;
  }

  return { name, subject, blocks: withSignature };
};

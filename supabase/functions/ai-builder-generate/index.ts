import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";
const OPENAI_BASE_URL = (Deno.env.get("OPENAI_BASE_URL") ?? "https://api.openai.com/v1").replace(/\/+$/, "");
const OPENAI_EMBEDDING_MODEL = Deno.env.get("OPENAI_EMBEDDING_MODEL") ?? "text-embedding-3-small";
const OPENAI_MODEL_COST = Deno.env.get("OPENAI_MODEL_COST") ?? "gpt-4o-mini";
const OPENAI_MODEL_BALANCED = Deno.env.get("OPENAI_MODEL_BALANCED") ?? "gpt-4o-mini";
const OPENAI_MODEL_QUALITY = Deno.env.get("OPENAI_MODEL_QUALITY") ?? "gpt-4o";
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const ANTHROPIC_BASE_URL = (Deno.env.get("ANTHROPIC_BASE_URL") ?? "https://api.anthropic.com/v1").replace(/\/+$/, "");
const ANTHROPIC_MODEL_COST = Deno.env.get("ANTHROPIC_MODEL_COST") ?? "claude-haiku-4-5-20251001";
const ANTHROPIC_MODEL_BALANCED = Deno.env.get("ANTHROPIC_MODEL_BALANCED") ?? "claude-sonnet-4-6";
const ANTHROPIC_MODEL_QUALITY = Deno.env.get("ANTHROPIC_MODEL_QUALITY") ?? "claude-opus-4-6";
const AI_PROVIDER_TIMEOUT_MS = Math.max(10_000, Number(Deno.env.get("AI_PROVIDER_TIMEOUT_MS") || 75_000));
const AI_EMBEDDING_TIMEOUT_MS = Math.max(5_000, Number(Deno.env.get("AI_EMBEDDING_TIMEOUT_MS") || 20_000));

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_ANON_KEY) {
  throw new Error("Missing SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or SUPABASE_ANON_KEY");
}

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

type AiMode = "email" | "landing";
type AiProvider = "openai" | "claude" | "heuristic";
type EmailOutputMode = "blocks" | "raw_html";
type InputImage = {
  name: string;
  mimeType: string;
  base64: string;
};

const MAX_INPUT_IMAGES = 4;
const MAX_INPUT_IMAGE_BYTES = 4 * 1024 * 1024;
const ALLOWED_IMAGE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

const emailBlockTypes = [
  "text",
  "image",
  "button",
  "divider",
  "spacer",
  "columns",
  "heading",
  "video",
  "social",
  "countdown",
  "table",
  "quote",
  "code",
  "signature",
  "bookmark",
];

const landingBlockTypes = [
  "hero",
  "features",
  "cta",
  "text",
  "image",
  "testimonial",
  "pricing",
  "faq",
  "form",
  "footer",
  "navbar",
  "gallery",
  "stats",
  "video",
];

const jsonResponse = (payload: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const normalizeText = (value: unknown) =>
  String(value ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\s+/g, " ")
    .trim();

const asObject = (value: unknown) => (value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {});

const pickString = (value: unknown, fallback = "") => {
  const normalized = String(value ?? "").trim();
  return normalized || fallback;
};

const toMode = (value: unknown): AiMode => (String(value || "").toLowerCase() === "landing" ? "landing" : "email");

const normalizeImageMimeType = (value: string) => {
  const normalized = pickString(value).toLowerCase();
  if (normalized === "image/jpg") return "image/jpeg";
  return normalized;
};

const estimateBase64Bytes = (value: string) => Math.floor((value.replace(/\s+/g, "").length * 3) / 4);

const sanitizeInputImages = (value: unknown): InputImage[] => {
  if (!Array.isArray(value)) return [];
  const next: InputImage[] = [];

  for (const item of value) {
    if (next.length >= MAX_INPUT_IMAGES) break;
    const row = asObject(item);
    let base64 = pickString(
      row.base64 || row.data || row.dataBase64 || row.imageBase64 || row.dataUrl || row.url || ""
    );
    let mimeType = normalizeImageMimeType(pickString(row.mimeType || row.mediaType || row.type || ""));
    if (!base64) continue;

    const dataUrlMatch = base64.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (dataUrlMatch?.[2]) {
      if (!mimeType) {
        mimeType = normalizeImageMimeType(dataUrlMatch[1]);
      }
      base64 = dataUrlMatch[2];
    }

    if (!mimeType || !ALLOWED_IMAGE_MIME_TYPES.has(mimeType)) continue;
    const compactBase64 = base64.replace(/\s+/g, "");
    if (!compactBase64 || !/^[A-Za-z0-9+/=]+$/.test(compactBase64)) continue;
    if (estimateBase64Bytes(compactBase64) > MAX_INPUT_IMAGE_BYTES) continue;

    next.push({
      name: pickString(row.name || row.filename || `image-${next.length + 1}`).slice(0, 140),
      mimeType,
      base64: compactBase64,
    });
  }

  return next;
};

const toVectorLiteral = (values: number[]) => `[${values.map((value) => (Number.isFinite(value) ? Number(value.toFixed(8)) : 0)).join(",")}]`;

const hashToken = (token: string) => {
  let hash = 2166136261;
  for (let i = 0; i < token.length; i += 1) {
    hash ^= token.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const deterministicEmbedding = (text: string, dims = 1536) => {
  const vector = new Array(dims).fill(0);
  const tokens = text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  if (tokens.length === 0) {
    vector[0] = 1;
    return vector;
  }

  for (let i = 0; i < tokens.length; i += 1) {
    const hash = hashToken(tokens[i]);
    const idxA = hash % dims;
    const idxB = ((hash >>> 9) ^ (hash * 17)) % dims;
    vector[idxA] += 1;
    vector[Math.abs(idxB)] += 0.5;
  }

  let norm = 0;
  for (const value of vector) norm += value * value;
  norm = Math.sqrt(norm);
  if (!norm) return vector;
  return vector.map((value) => value / norm);
};

const parseMaybeJson = (raw: string) => {
  const tryParse = (value: string) => {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  };

  const direct = tryParse(raw);
  if (direct) return direct;

  const fencedMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) {
    const fencedParsed = tryParse(fencedMatch[1].trim());
    if (fencedParsed) return fencedParsed;
  }

  const extractBalancedObject = (text: string) => {
    let depth = 0;
    let start = -1;
    let inString = false;
    let escaped = false;
    for (let i = 0; i < text.length; i += 1) {
      const char = text[i];
      if (inString) {
        if (escaped) {
          escaped = false;
          continue;
        }
        if (char === "\\") {
          escaped = true;
          continue;
        }
        if (char === "\"") {
          inString = false;
        }
        continue;
      }

      if (char === "\"") {
        inString = true;
        continue;
      }
      if (char === "{") {
        if (depth === 0) start = i;
        depth += 1;
        continue;
      }
      if (char === "}") {
        depth -= 1;
        if (depth === 0 && start >= 0) {
          return text.slice(start, i + 1);
        }
      }
    }
    return "";
  };

  const balanced = extractBalancedObject(raw);
  if (balanced) {
    const balancedParsed = tryParse(balanced);
    if (balancedParsed) return balancedParsed;
  }

  try {
    return JSON.parse(raw);
  } catch {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(raw.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
};

const hasObjectKeys = (value: Record<string, unknown>) => Object.keys(value).length > 0;

const extractTemplateBlocksFromCandidate = (candidate: Record<string, unknown>) => {
  const nestedTemplate = asObject(
    candidate.template ||
      candidate.email ||
      candidate.output ||
      candidate.result ||
      candidate.data ||
      candidate.payload ||
      candidate.response ||
      candidate.draft ||
      {}
  );

  return (
    candidate.blocks ||
    candidate.sections ||
    candidate.contentBlocks ||
    candidate.emailBlocks ||
    nestedTemplate.blocks ||
    nestedTemplate.sections ||
    nestedTemplate.contentBlocks ||
    nestedTemplate.emailBlocks ||
    []
  );
};

const hasTemplateBlockArray = (candidate: Record<string, unknown>) =>
  Array.isArray(extractTemplateBlocksFromCandidate(candidate)) &&
  (extractTemplateBlocksFromCandidate(candidate) as unknown[]).length > 0;

const resolveEmailTemplateCandidate = (value: unknown, depth = 0): Record<string, unknown> => {
  if (depth > 6) return {};

  if (typeof value === "string") {
    const parsedNested = parseMaybeJson(value);
    if (parsedNested !== null) {
      return resolveEmailTemplateCandidate(parsedNested, depth + 1);
    }
    return {};
  }

  if (Array.isArray(value)) {
    const blockLikeArray = value
      .map((item) => asObject(item))
      .filter((item) => hasObjectKeys(item));
    if (
      blockLikeArray.length > 0 &&
      blockLikeArray.some((item) => pickString(item.type || "").length > 0 || hasObjectKeys(asObject(item.content)))
    ) {
      return { blocks: blockLikeArray };
    }

    for (const item of value) {
      const resolved = resolveEmailTemplateCandidate(item, depth + 1);
      if (hasObjectKeys(resolved) && (hasTemplateBlockArray(resolved) || pickString(resolved.subject || resolved.name || ""))) {
        return resolved;
      }
    }
    return {};
  }

  const candidate = asObject(value);
  if (!hasObjectKeys(candidate)) return {};

  if (hasTemplateBlockArray(candidate)) {
    return {
      ...candidate,
      blocks: extractTemplateBlocksFromCandidate(candidate),
    };
  }

  if (pickString(candidate.subject || candidate.name || candidate.goal || candidate.audience || "").length > 0) {
    return candidate;
  }

  const priorityKeys = [
    "template",
    "email",
    "result",
    "output",
    "data",
    "payload",
    "response",
    "draft",
    "message",
    "content",
  ];

  for (const key of priorityKeys) {
    if (!(key in candidate)) continue;
    const nestedResolved = resolveEmailTemplateCandidate(candidate[key], depth + 1);
    if (hasObjectKeys(nestedResolved)) {
      return {
        ...candidate,
        ...nestedResolved,
        blocks: extractTemplateBlocksFromCandidate(nestedResolved),
      };
    }
  }

  for (const nested of Object.values(candidate)) {
    if (nested === null || nested === undefined) continue;
    if (typeof nested !== "object" && typeof nested !== "string") continue;
    const nestedResolved = resolveEmailTemplateCandidate(nested, depth + 1);
    if (hasObjectKeys(nestedResolved)) {
      return {
        ...candidate,
        ...nestedResolved,
        blocks: extractTemplateBlocksFromCandidate(nestedResolved),
      };
    }
  }

  return candidate;
};

const hasSubstantiveEmailBlocks = (candidate: Record<string, unknown>) => {
  const blocks = coerceObjectArray(extractTemplateBlocksFromCandidate(candidate));
  if (blocks.length === 0) return false;
  const textChars = blocks
    .map((block) => {
      const content = asObject(block.content);
      return pickString(content.text || content.html || block.text || block.title || "");
    })
    .join(" ")
    .trim().length;
  return blocks.length >= 2 || textChars >= 120;
};

const buildImageRecoveryPrompt = ({
  baseUserPrompt,
  instruction,
  previousOutput,
}: {
  baseUserPrompt: string;
  instruction: string;
  previousOutput: string;
}) =>
  [
    baseUserPrompt,
    "",
    "RecoveryInstruction:",
    "- Your previous output was invalid for the editor because it did not provide a complete blocks array.",
    "- Regenerate the email JSON now using the attached image as the primary source.",
    "- Return a full `blocks` array with all major visible sections in top-to-bottom order.",
    "- Preserve visible headings and body copy from the image whenever legible.",
    "- Do not output summaries, placeholders, or generic fallback phrasing.",
    "- Output only valid JSON with keys: name, subject, audience, voice, goal, blocks, reasoning.",
    `LatestUserInstruction: ${instruction}`,
    `PreviousInvalidOutput: ${previousOutput.slice(0, 3000)}`,
  ].join("\n");

const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

const coerceObjectArray = (value: unknown) => (Array.isArray(value) ? value.map((item) => asObject(item)) : []);
const deepClone = <T>(value: T): T => {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
};

const toTitleCase = (value: string) =>
  value
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(" ")
    .trim();

const normalizeEmailTopicTypos = (value: string) => {
  let next = pickString(value);
  if (/\bindia array\b/i.test(next) && /\b(anniversary|army|event|campaign|email|marketing)\b/i.test(next)) {
    next = next.replace(/\bindia array\b/gi, "Indian Army");
  }
  return next;
};

const cleanInstructionIntent = (instruction: string) =>
  normalizeEmailTopicTypos(pickString(instruction))
    .replace(/\b(create|generate|build|make|write|compose|draft|please)\b/gi, " ")
    .replace(/\b(an?|the)\b/gi, " ")
    .replace(/\b(email\s*template|email|template)\b/gi, " ")
    .replace(/\b(highly|very)\s+(attractive|modern|beautiful|premium|polished|stylish)\b/gi, " ")
    .replace(/\b(attractive|modern|beautiful|premium|polished|stylish)\b/gi, " ")
    .replace(/\b(on|about|regarding|for)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

const deriveTopicPhraseFromInstruction = (instruction: string) =>
  cleanInstructionIntent(instruction)
    .replace(/\bfor\s+(all|everyone|your audience)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

const deriveSubjectFromInstruction = (instruction: string, fallback: string) => {
  const explicitSubject = pickString(
    instruction.match(/subject(?:\s*line)?\s*(?:to|as|:)\s*["']?([^"\n']+)["']?/i)?.[1] || ""
  );
  if (explicitSubject) return explicitSubject.slice(0, 120);

  const topicPhrase = deriveTopicPhraseFromInstruction(instruction);
  if (topicPhrase) {
    const noise = new Set([
      "content", "heading", "headings", "paragraph", "paragraphs", "bullet", "bullets", "information",
      "template", "email", "draft", "create", "generate", "build", "make", "write", "compose", "add",
      "change", "modify", "refine", "improve", "update", "replace", "remove", "not", "just", "want", "with",
      "into", "from", "same", "this", "that", "more",
    ]);
    const meaningful = topicPhrase
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean)
      .filter((token) => !noise.has(token));
    if (meaningful.length >= 2) {
      return toTitleCase(meaningful.join(" ")).slice(0, 120);
    }
  }

  return pickString(fallback || "Campaign Update").slice(0, 120);
};

const deriveEmailIntroFromInstruction = (instruction: string, audience: string) => {
  const cleaned = cleanInstructionIntent(instruction);
  if (!cleaned) {
    return `This message is tailored for ${pickString(audience || "your audience")} with clear context and a concrete next step.`;
  }

  const lower = cleaned.toLowerCase();
  if (lower.includes("anniversary")) {
    return "Join us as we celebrate a meaningful milestone with gratitude, pride, and a shared sense of purpose.";
  }
  if (lower.includes("welcome")) {
    return "Welcome aboard. We are excited to have you with us and help you get value from day one.";
  }
  if (lower.includes("newsletter")) {
    return "Here are the most important updates and practical insights curated for this edition.";
  }
  if (/\b(iran|usa|u\.s\.|war|conflict|geopolitical|ceasefire|military)\b/.test(lower)) {
    return "This update summarizes key geopolitical developments, what has changed recently, and what your audience should monitor next.";
  }
  const topic = cleaned.replace(/\babout\b/gi, " ").replace(/\s+/g, " ").trim();
  if (topic) {
    return `This update covers ${topic.toLowerCase()} and explains the practical impact for ${pickString(audience || "your audience")}.`;
  }
  return `This message is tailored for ${pickString(audience || "your audience")} with relevant context and clear next steps.`;
};

const deriveEmailCta = (instruction: string, brief: Record<string, unknown>) => {
  const explicit = pickString(brief.cta || "");
  if (explicit) return explicit;
  const lower = instruction.toLowerCase();
  if (/rsvp|register|signup|sign up|join/.test(lower)) return "Register now";
  if (/book|demo|call|meeting/.test(lower)) return "Book a demo";
  if (/download|guide|report|ebook/.test(lower)) return "Download now";
  return "Learn more";
};

const hasNoCtaRequest = (instruction: string) =>
  /no cta|without cta|without button|no button/.test(instruction.toLowerCase());

const extractUrlFromText = (value: string) => pickString(value.match(/https?:\/\/[^\s"']+/i)?.[0] || "");

const extractFallbackBodyFromCandidate = (candidate: Record<string, unknown>) =>
  pickString(
    candidate.body ||
    candidate.copy ||
    candidate.content ||
    candidate.text ||
    ""
  );

const stripHtmlToPlainText = (value: unknown) =>
  pickString(value)
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h1|h2|h3|h4|h5|h6|li|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();

const normalizeRichTextBlockContent = (contentValue: unknown, fallbackText = "") => {
  const content = asObject(contentValue);
  const primitiveText =
    typeof contentValue === "string" || typeof contentValue === "number" || typeof contentValue === "boolean"
      ? String(contentValue)
      : "";
  const text = pickString(
    content.text ||
      content.value ||
      content.copy ||
      content.body ||
      primitiveText ||
      fallbackText
  );
  const html = pickString(content.html || "");
  const resolvedText = text || stripHtmlToPlainText(html);
  const resolvedHtml = html || (resolvedText ? toHtmlText(resolvedText) : "");
  const next: Record<string, unknown> = { ...content };
  if (resolvedText) next.text = resolvedText;
  if (resolvedHtml) next.html = resolvedHtml;
  return next;
};

const escapeHtmlAttribute = (value: string) =>
  pickString(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const toColumnFragmentHtml = (value: unknown) => {
  const nestedBlock = asObject(value);
  if (!Object.keys(nestedBlock).length) return "";

  const nestedType = pickString(nestedBlock.type || "").toLowerCase();
  const nestedContent = asObject(nestedBlock.content);

  if (nestedType === "image") {
    const src = pickString(nestedContent.src || nestedContent.url || nestedBlock.src || "");
    if (!src) return "";
    const alt = pickString(nestedContent.alt || nestedContent.title || nestedBlock.alt || "Image");
    const width = pickString(nestedContent.width || "100%");
    return `<div><img src="${escapeHtmlAttribute(src)}" alt="${escapeHtmlAttribute(alt)}" style="display:block;width:${escapeHtmlAttribute(width)};max-width:100%;height:auto;" /></div>`;
  }

  if (nestedType === "button") {
    const text = pickString(nestedContent.text || nestedContent.label || nestedBlock.text || "Learn more");
    const url = pickString(nestedContent.url || nestedContent.href || nestedBlock.url || "#");
    return `<div><a href="${escapeHtmlAttribute(url)}" style="display:inline-block;text-decoration:none;">${text}</a></div>`;
  }

  const htmlValue = pickString(nestedContent.html || nestedBlock.html || "");
  if (htmlValue) {
    return `<div>${htmlValue}</div>`;
  }

  const plainText = stripHtmlToPlainText(
    pickString(
      nestedContent.text ||
      nestedContent.value ||
      nestedContent.title ||
      nestedContent.label ||
      nestedBlock.text ||
      nestedBlock.title ||
      nestedBlock.label ||
      ""
    )
  );
  if (!plainText) return "";
  return `<p>${toHtmlText(plainText)}</p>`;
};

const normalizeColumnsBlockContent = (contentValue: unknown) => {
  const content = asObject(contentValue);
  const sourceColumns = Array.isArray(content.content)
    ? content.content
    : (Array.isArray(content.columns) ? content.columns : []);

  const normalizedColumns = sourceColumns
    .map((column, index) => {
      if (typeof column === "string" || typeof column === "number" || typeof column === "boolean") {
        const direct = pickString(column);
        return direct ? { text: direct, html: toHtmlText(direct) } : null;
      }

      const columnObject = asObject(column);
      const directHtml = pickString(columnObject.html || columnObject.contentHtml || "");
      const directText = pickString(columnObject.text || columnObject.title || columnObject.label || stripHtmlToPlainText(directHtml));
      if (directText || directHtml) {
        return {
          ...columnObject,
          ...(directText ? { text: directText } : {}),
          ...(directHtml ? { html: directHtml } : {}),
        };
      }

      const nestedBlocks = Array.isArray(columnObject.blocks) ? columnObject.blocks : [];
      if (nestedBlocks.length > 0) {
        const nestedHtml = nestedBlocks
          .map((nested) => toColumnFragmentHtml(nested))
          .filter(Boolean)
          .join("");
        const nestedText = stripHtmlToPlainText(nestedHtml);
        if (nestedText || nestedHtml) {
          return {
            ...columnObject,
            ...(nestedText ? { text: nestedText } : {}),
            ...(nestedHtml ? { html: nestedHtml } : {}),
          };
        }
      }

      return { ...columnObject, text: `Column ${index + 1}` };
    })
    .filter((item): item is Record<string, unknown> => Boolean(item && (pickString(item.text || "").length > 0 || pickString(item.html || "").length > 0)));

  const fallbackCount = clamp(Number(content.count || normalizedColumns.length || 2), 1, 3);
  const resolvedColumns =
    normalizedColumns.length > 0
      ? normalizedColumns
      : Array.from({ length: fallbackCount }, (_, index) => ({ text: `Column ${index + 1}`, html: toHtmlText(`Column ${index + 1}`) }));

  return {
    ...content,
    count: resolvedColumns.length,
    content: resolvedColumns,
  };
};

const normalizeSocialBlockContent = (contentValue: unknown) => {
  const content = asObject(contentValue);
  const sourceLinks = Array.isArray(content.links)
    ? content.links
    : (Array.isArray(content.networks) ? content.networks : []);

  const normalizedLinks = sourceLinks
    .map((entry) => {
      const link = asObject(entry);
      const platform = pickString(link.platform || link.name || link.label || "");
      const url = pickString(link.url || link.href || "#");
      if (!platform && !url) return null;
      return {
        platform: platform || "Link",
        url: url || "#",
      };
    })
    .filter((entry): entry is { platform: string; url: string } => Boolean(entry));

  if (normalizedLinks.length === 0) return content;
  return { ...content, links: normalizedLinks };
};

const normalizeButtonBlockContent = (contentValue: unknown, block: Record<string, unknown>) => {
  const content = asObject(contentValue);
  const next: Record<string, unknown> = { ...content };
  const text = pickString(
    content.text || content.label || content.cta || content.title || block.text || block.label || block.cta || block.title || ""
  );
  const url = pickString(content.url || content.href || content.link || block.url || block.href || block.link || "#");
  const align = pickString(content.align || content.textAlign || block.align || "");
  const bgColor = pickString(
    content.bgColor || content.backgroundColor || content.buttonBackgroundColor || block.bgColor || block.backgroundColor || ""
  );
  const textColor = pickString(content.textColor || content.color || block.textColor || block.color || "");
  const borderRadius = pickString(content.borderRadius || block.borderRadius || "");
  const buttonPadding = pickString(content.buttonPadding || content.padding || block.buttonPadding || block.padding || "");

  if (text) next.text = text;
  next.url = url || "#";
  if (align) next.align = align;
  if (bgColor) next.bgColor = bgColor;
  if (textColor) next.textColor = textColor;
  if (borderRadius) next.borderRadius = borderRadius;
  if (buttonPadding) next.buttonPadding = buttonPadding;
  return next;
};

const normalizeImageBlockContent = (contentValue: unknown, block: Record<string, unknown>) => {
  const content = asObject(contentValue);
  const next: Record<string, unknown> = { ...content };
  const src = pickString(content.src || content.url || content.imageUrl || content.path || block.src || block.url || "");
  const alt = pickString(content.alt || content.title || content.caption || block.alt || "");
  const width = pickString(content.width || content.maxWidth || "");
  if (src) next.src = src;
  if (alt) next.alt = alt;
  if (width) next.width = width;
  return next;
};

const normalizeTableBlockContent = (contentValue: unknown) => {
  const content = asObject(contentValue);
  const sourceRows = Array.isArray(content.data)
    ? content.data
    : (Array.isArray(content.rows) ? content.rows : []);
  const data = sourceRows
    .map((row) => {
      if (Array.isArray(row)) return row.map((cell) => pickString(cell));
      const rowObject = asObject(row);
      if (Array.isArray(rowObject.cells)) {
        return (rowObject.cells as unknown[]).map((cell) => pickString(cell));
      }
      const single = pickString(rowObject.text || rowObject.value || rowObject.label || "");
      return single ? [single] : [];
    })
    .filter((row) => row.length > 0);
  return data.length > 0 ? { ...content, data } : content;
};

const normalizeStyleKey = (value: string) =>
  pickString(value)
    .toLowerCase()
    .replace(/[-_\s]+([a-z0-9])/g, (_, group: string) => group.toUpperCase());

const normalizeEmailBlockStyles = (block: Record<string, unknown>) => {
  const rawStyles = asObject(block.styles || block.style);
  const normalizedStyles = Object.entries(rawStyles).reduce<Record<string, unknown>>((acc, [rawKey, rawValue]) => {
    const key = normalizeStyleKey(rawKey);
    if (!key) return acc;
    acc[key] = rawValue;
    return acc;
  }, {});
  const next: Record<string, unknown> = { ...rawStyles, ...normalizedStyles };

  const setIfMissing = (key: string, value: unknown) => {
    const normalized = pickString(value || "");
    if (!normalized) return;
    if (pickString(next[key] || "")) return;
    next[key] = normalized;
  };

  setIfMissing("padding", block.padding || rawStyles.spacing);
  setIfMissing("backgroundColor", block.backgroundColor);
  setIfMissing("textAlign", block.textAlign || block.align);
  setIfMissing("color", block.color);
  setIfMissing("borderRadius", block.borderRadius);
  setIfMissing("margin", block.margin);
  return next;
};

const normalizeEmailBlock = (block: Record<string, unknown>) => {
  const type = pickString(block.type || "text").toLowerCase();
  const normalizedType = emailBlockTypes.includes(type) ? type : "text";
  const fallbackText = pickString(
    block.text ||
    block.title ||
    block.label ||
    block.copy ||
    block.body ||
    stripHtmlToPlainText(block.html || "")
  );

  let content = asObject(block.content);
  if (normalizedType === "text" || normalizedType === "heading" || normalizedType === "quote" || normalizedType === "signature") {
    content = normalizeRichTextBlockContent(block.content, fallbackText);
  } else if (normalizedType === "button") {
    content = normalizeButtonBlockContent(block.content, block);
  } else if (normalizedType === "image") {
    content = normalizeImageBlockContent(block.content, block);
  } else if (normalizedType === "columns") {
    content = normalizeColumnsBlockContent(block.content);
  } else if (normalizedType === "social") {
    content = normalizeSocialBlockContent(block.content);
  } else if (normalizedType === "table") {
    content = normalizeTableBlockContent(block.content);
  } else if (normalizedType === "code") {
    const codeText = pickString(content.text || content.code || block.code || fallbackText);
    content = codeText ? { ...content, text: codeText } : content;
  } else if (normalizedType === "video") {
    const url = pickString(content.url || content.src || block.url || "");
    if (url) content = { ...content, url };
  } else if (normalizedType === "divider") {
    const color = pickString(content.color || content.borderColor || "");
    const style = pickString(content.style || content.borderStyle || "");
    const thickness = Number(content.thickness || content.borderWidth || 1);
    content = {
      ...content,
      ...(color ? { color } : {}),
      ...(style ? { style } : {}),
      ...(Number.isFinite(thickness) ? { thickness: Math.max(1, Math.floor(thickness)) } : {}),
    };
  } else if (normalizedType === "spacer") {
    const height = Number(content.height || content.size || 24);
    content = Number.isFinite(height) ? { ...content, height: Math.max(0, Math.floor(height)) } : content;
  }

  return {
    id: pickString(block.id || crypto.randomUUID()),
    type: normalizedType,
    content,
    styles: normalizeEmailBlockStyles(block),
  };
};

const normalizeEmailResult = (candidate: Record<string, unknown>, brief: Record<string, unknown>, instruction: string) => {
  const resolvedCandidate = resolveEmailTemplateCandidate(candidate);
  const normalizedInstruction = normalizeEmailTopicTypos(instruction);
  const blocksRaw = coerceObjectArray(
    extractTemplateBlocksFromCandidate(resolvedCandidate)
  );
  const blocks = blocksRaw.map((block) => normalizeEmailBlock(block)).filter((block) => Boolean(block.type));

  const candidateSubject = normalizeEmailTopicTypos(pickString(resolvedCandidate.subject || ""));
  const fallbackSubject = deriveSubjectFromInstruction(
    normalizedInstruction,
    pickString(brief.subject || brief.goal || "Campaign Update")
  );
  const resolvedSubject = candidateSubject && !isGenericSubject(candidateSubject) ? candidateSubject : fallbackSubject;
  const fallbackAudience = pickString(resolvedCandidate.audience || brief.audience || "All");
  const fallbackIntro = pickString(
    (brief.offer as string) ||
    extractFallbackBodyFromCandidate(resolvedCandidate) ||
    deriveEmailIntroFromInstruction(normalizedInstruction, fallbackAudience)
  ).slice(0, 800);
  const fallbackSecondary = pickString(
    (brief.constraints as string) ||
    "Use a clear value proposition, concise copy, and one focused next step."
  ).slice(0, 500);
  const candidateHtmlFallback = pickString(
    resolvedCandidate.html ||
    resolvedCandidate.bodyHtml ||
    resolvedCandidate.contentHtml ||
    asObject(resolvedCandidate.template).html ||
    ""
  );
  const candidateTextFallback = pickString(
    stripHtmlToPlainText(candidateHtmlFallback) ||
    extractFallbackBodyFromCandidate(resolvedCandidate) ||
    ""
  ).slice(0, 2400);
  const fallbackCta = deriveEmailCta(normalizedInstruction, brief);
  const fallbackUrl = extractUrlFromText(normalizedInstruction) || "#";
  const skipCta = hasNoCtaRequest(normalizedInstruction);
  const wantsAttractiveRequest = /attractive|modern|beautiful|premium|polished|stylish/.test(
    normalizedInstruction.toLowerCase()
  );
  const attractiveAccent = resolveColorToken(normalizedInstruction) || "#2563eb";

  const fallbackBlocks = [
    {
      id: crypto.randomUUID(),
      type: "heading",
      content: { text: fallbackSubject, html: `<b>${fallbackSubject}</b>` },
      styles: {
        padding: "18px",
        backgroundColor: wantsAttractiveRequest ? "#eef6ff" : "transparent",
        borderRadius: wantsAttractiveRequest ? "14px" : "0",
      },
    },
    ...(wantsAttractiveRequest
      ? [
          {
            id: crypto.randomUUID(),
            type: "image",
            content: {
              src: "https://placehold.co/1200x420?text=Attractive+Email+Header",
              alt: "Email header visual",
              width: "100%",
            },
            styles: { padding: "0 16px 10px 16px", borderRadius: "14px" },
          },
        ]
      : []),
    {
      id: crypto.randomUUID(),
      type: "text",
      content: {
        text: fallbackIntro,
        html: toHtmlText(fallbackIntro),
      },
      styles: {
        padding: "16px",
        backgroundColor: wantsAttractiveRequest ? "#f8fbff" : "transparent",
        borderRadius: wantsAttractiveRequest ? "12px" : "0",
      },
    },
    {
      id: crypto.randomUUID(),
      type: "divider",
      content: { style: "solid" },
      styles: { padding: "16px", backgroundColor: "transparent" },
    },
    {
      id: crypto.randomUUID(),
      type: "text",
      content: {
        text: fallbackSecondary,
        html: toHtmlText(fallbackSecondary),
      },
      styles: {
        padding: "16px",
        backgroundColor: wantsAttractiveRequest ? "#f8fbff" : "transparent",
        borderRadius: wantsAttractiveRequest ? "12px" : "0",
      },
    },
    ...(wantsAttractiveRequest
      ? [
          {
            id: crypto.randomUUID(),
            type: "quote",
            content: {
              text: "Design + clarity creates higher engagement and trust.",
              html: "Design + clarity creates <b>higher engagement and trust</b>.",
            },
            styles: { padding: "16px", backgroundColor: "#eef6ff", borderRadius: "12px" },
          },
        ]
      : []),
    ...(skipCta
      ? []
      : [{
          id: crypto.randomUUID(),
          type: "button",
          content: {
            text: fallbackCta,
            url: fallbackUrl,
            align: wantsAttractiveRequest ? "center" : "left",
            bgColor: wantsAttractiveRequest ? attractiveAccent : "#2a9d6e",
            textColor: "#ffffff",
            borderRadius: wantsAttractiveRequest ? "999px" : "8px",
            buttonPadding: wantsAttractiveRequest ? "12px 28px" : "10px 24px",
          },
          styles: {
            padding: "16px",
            backgroundColor: wantsAttractiveRequest ? "#f8fbff" : "transparent",
            borderRadius: wantsAttractiveRequest ? "12px" : "0",
          },
        }]),
    {
      id: crypto.randomUUID(),
      type: "signature",
      content: {
        text: "Best regards,\nYour Team",
        html: "Best regards,<br><b>Your Team</b>",
      },
      styles: { padding: "16px", backgroundColor: "transparent" },
    },
  ];

  const directContentFallbackBlocks =
    candidateHtmlFallback || candidateTextFallback
      ? [
          {
            id: crypto.randomUUID(),
            type: "text",
            content: {
              text: candidateTextFallback || stripHtmlToPlainText(candidateHtmlFallback),
              html: candidateHtmlFallback || toHtmlText(candidateTextFallback),
            },
            styles: {
              padding: "16px",
              backgroundColor: "transparent",
            },
          },
        ]
      : [];

  return {
    name: pickString(resolvedCandidate.name || brief.goal || resolvedSubject || "AI Email Template"),
    subject: pickString(resolvedSubject || "Campaign Update"),
    audience: fallbackAudience,
    voice: pickString(resolvedCandidate.voice || brief.tone || "Professional"),
    goal: pickString(resolvedCandidate.goal || brief.goal || "Engagement"),
    format: "html",
    blocks: blocks.length > 0 ? blocks : (directContentFallbackBlocks.length > 0 ? directContentFallbackBlocks : fallbackBlocks),
    reasoning: pickString(resolvedCandidate.reasoning || ""),
  };
};

const resolveRawHtmlFromCandidate = (
  candidate: Record<string, unknown>,
  rawCompletionText: string,
  depth = 0
) => {
  const nested = asObject(
    candidate.template ||
      candidate.email ||
      candidate.output ||
      candidate.result ||
      candidate.data ||
      candidate.payload ||
      candidate.response ||
      candidate.draft ||
      {}
  );

  const directHtml = pickString(
    candidate.html ||
      candidate.bodyHtml ||
      candidate.contentHtml ||
      candidate.emailHtml ||
      candidate.markup ||
      nested.html ||
      nested.bodyHtml ||
      nested.contentHtml ||
      nested.emailHtml ||
      nested.markup ||
      ""
  );
  if (directHtml) return directHtml;

  if (depth < 2) {
    const reparsed = parseMaybeJson(rawCompletionText);
    if (reparsed) {
      const reparsedHtml = resolveRawHtmlFromCandidate(
        resolveEmailTemplateCandidate(reparsed),
        "",
        depth + 1
      );
      if (reparsedHtml) return reparsedHtml;
    }
  }

  const fencedBlocks = Array.from(rawCompletionText.matchAll(/```([a-zA-Z0-9_-]+)?\s*([\s\S]*?)```/g));
  for (const match of fencedBlocks) {
    const language = pickString(match[1] || "").toLowerCase();
    const fencedContent = pickString(match[2] || "");
    if (!fencedContent) continue;

    if (language === "html") {
      return fencedContent;
    }

    if (depth < 2) {
      const reparsedFence = parseMaybeJson(fencedContent);
      if (reparsedFence) {
        const reparsedFenceHtml = resolveRawHtmlFromCandidate(
          resolveEmailTemplateCandidate(reparsedFence),
          "",
          depth + 1
        );
        if (reparsedFenceHtml) return reparsedFenceHtml;
      }
    }

    if (/<\/?[a-z][\s\S]*>/i.test(fencedContent) && !/^\s*[{[]/.test(fencedContent)) {
      return fencedContent;
    }
  }

  const trimmed = pickString(rawCompletionText);
  if (trimmed.startsWith("```")) {
    return "";
  }
  if (trimmed && /<\/?[a-z][\s\S]*>/i.test(trimmed) && !/^\s*[{[]/.test(trimmed)) {
    return trimmed;
  }

  return "";
};

const buildDirectHtmlEmailResult = ({
  candidate,
  brief,
  instruction,
  rawCompletionText,
}: {
  candidate: Record<string, unknown>;
  brief: Record<string, unknown>;
  instruction: string;
  rawCompletionText: string;
}) => {
  const resolvedCandidate = resolveEmailTemplateCandidate(candidate);
  const normalizedInstruction = normalizeEmailTopicTypos(instruction);
  const candidateSubject = normalizeEmailTopicTypos(pickString(resolvedCandidate.subject || candidate.subject || ""));
  const fallbackSubject = deriveSubjectFromInstruction(
    normalizedInstruction,
    pickString(brief.subject || brief.goal || "Campaign Update")
  );
  const resolvedSubject = candidateSubject && !isGenericSubject(candidateSubject) ? candidateSubject : fallbackSubject;
  const resolvedHtml = resolveRawHtmlFromCandidate({ ...candidate, ...resolvedCandidate }, rawCompletionText);
  const fallbackAudience = pickString(resolvedCandidate.audience || brief.audience || "All");
  const fallbackIntro = deriveEmailIntroFromInstruction(normalizedInstruction, fallbackAudience);
  const fallbackHtml = [
    `<div style="max-width:640px;margin:0 auto;font-family:Arial,Helvetica,sans-serif;color:#0f172a;line-height:1.5;">`,
    `<h2 style="margin:0 0 16px;">${resolvedSubject}</h2>`,
    `<p style="margin:0;">${toHtmlText(fallbackIntro)}</p>`,
    `</div>`,
  ].join("");

  return {
    name: pickString(resolvedCandidate.name || brief.goal || resolvedSubject || "AI Email Template"),
    subject: pickString(resolvedSubject || "Campaign Update"),
    audience: fallbackAudience,
    voice: pickString(resolvedCandidate.voice || brief.tone || "Professional"),
    goal: pickString(resolvedCandidate.goal || brief.goal || "Engagement"),
    format: "html",
    html: resolvedHtml || fallbackHtml,
    blocks: [],
    reasoning: pickString(resolvedCandidate.reasoning || candidate.reasoning || ""),
  };
};

const normalizeLandingResult = (candidate: Record<string, unknown>, brief: Record<string, unknown>, instruction: string) => {
  const blocksRaw = coerceObjectArray(candidate.blocks);
  const blocks = blocksRaw
    .map((block) => {
      const type = pickString(block.type || "text").toLowerCase();
      const normalizedType = landingBlockTypes.includes(type) ? type : "text";
      return {
        id: crypto.randomUUID(),
        type: normalizedType,
        content: asObject(block.content),
        styles: asObject(block.styles),
      };
    })
    .filter((block) => Boolean(block.type));

  const fallbackBlocks = [
    {
      id: crypto.randomUUID(),
      type: "hero",
      content: {
        headline: pickString(brief.headline || "Grow faster with AI"),
        subheadline: pickString(brief.offer || instruction || "A personalized landing page tailored to your audience."),
        ctaText: pickString(brief.cta || "Get started"),
        ctaUrl: "#",
      },
      styles: {},
    },
    {
      id: crypto.randomUUID(),
      type: "features",
      content: {
        title: "Why choose us",
        items: [
          { title: "Fast setup", desc: "Go live quickly with smart defaults." },
          { title: "Personalized", desc: "Content aligned to your audience and offer." },
          { title: "Optimized", desc: "Built for conversion and readability." },
        ],
      },
      styles: {},
    },
    {
      id: crypto.randomUUID(),
      type: "cta",
      content: {
        headline: "Ready to move forward?",
        buttonText: pickString(brief.cta || "Book a demo"),
        buttonUrl: "#",
      },
      styles: {},
    },
  ];

  const name = pickString(candidate.name || brief.business || "AI Landing Page");

  return {
    name,
    slug: slugify(pickString(candidate.slug || name || "ai-landing-page")),
    published: false,
    blocks: blocks.length > 0 ? blocks : fallbackBlocks,
    reasoning: pickString(candidate.reasoning || ""),
  };
};

const COLOR_MAP: Record<string, string> = {
  red: "#ef4444",
  blue: "#3b82f6",
  green: "#22c55e",
  orange: "#f97316",
  yellow: "#eab308",
  purple: "#8b5cf6",
  pink: "#ec4899",
  black: "#111827",
  white: "#ffffff",
  teal: "#14b8a6",
  indigo: "#6366f1",
  gray: "#6b7280",
  grey: "#6b7280",
};

const resolveColorToken = (instruction: string) => {
  const lower = instruction.toLowerCase();
  const hexMatch = lower.match(/#([0-9a-f]{3}|[0-9a-f]{6})\b/i);
  if (hexMatch) {
    const token = hexMatch[0];
    return token.length === 4
      ? `#${token[1]}${token[1]}${token[2]}${token[2]}${token[3]}${token[3]}`
      : token.toLowerCase();
  }

  const colorPhrase = lower.match(/\b(to|as)\s+(red|blue|green|orange|yellow|purple|pink|black|white|teal|indigo|gray|grey)\b/);
  if (colorPhrase?.[2]) return COLOR_MAP[colorPhrase[2]];

  for (const [name, hex] of Object.entries(COLOR_MAP)) {
    if (lower.includes(` ${name}`) || lower.startsWith(name)) return hex;
  }
  return "";
};

const parseSubjectFromInstruction = (instruction: string) => {
  const subjectMatch = instruction.match(/subject(?:\s*line)?\s*(?:to|as|:)\s*["']?([^"\n']+)["']?/i);
  return pickString(subjectMatch?.[1] || "");
};

const stripQuotedBlocks = (instruction: string) =>
  pickString(instruction)
    .replace(/"[\s\S]*?"/g, " ")
    .replace(/`[\s\S]*?`/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const hasCtaInstructionIntent = (instruction: string) => {
  const plain = stripQuotedBlocks(instruction).toLowerCase();
  if (!plain) return false;

  const hasCtaKeyword = /\b(cta|call\s*to\s*action|button)\b/.test(plain);
  if (!hasCtaKeyword) return false;

  const hasDirectAssignment =
    /(?:cta|call\s*to\s*action|button)(?:\s*(?:text|copy|label))?\s*(?:to|as|:)\s*/.test(plain);
  if (hasDirectAssignment) return true;

  const hasMutationVerb = /\b(change|set|replace|update|edit|modify|rewrite|revise|rename)\b/.test(plain);
  if (hasMutationVerb) return true;

  const hasAddRemoveCta =
    /\b(add|include|insert|remove|delete)\s+(?:the\s*)?(?:cta|call\s*to\s*action|button)\b/.test(plain);
  if (hasAddRemoveCta) return true;

  return false;
};

const sanitizeCtaText = (value: string) => {
  let text = pickString(value).replace(/^["']|["']$/g, "").trim();
  text = text.split(/\r?\n/)[0]?.trim() || "";
  text = text.replace(/\s+/g, " ");
  text = text.replace(/,\s*(?:include|including)\b.*$/i, "");
  text = text.replace(/\.\s*(?:include|including)\b.*$/i, "");
  text = text.replace(
    /\s+(?:and|but)\s+(?:convert|change|add|remove|update|rewrite|make|keep|use|turn)\b.*$/i,
    ""
  );
  text = text.replace(/[.,;:!?]+$/g, "").trim();
  if (text.length > 90) text = text.slice(0, 90).trim();
  return text;
};

const parseButtonTextFromInstruction = (instruction: string) => {
  if (!hasCtaInstructionIntent(instruction)) return "";

  const changeMatch = instruction.match(
    /(?:change|set|replace|update)\s+(?:the\s*)?(?:cta|call\s*to\s*action|button)(?:\s*(?:text|copy|label))?\s*(?:to|as|with)\s*["']?([^"\n']+)["']?/i
  );
  if (changeMatch?.[1]) return sanitizeCtaText(changeMatch[1]);

  const directMatch = instruction.match(
    /(?:cta|call\s*to\s*action|button)(?:\s*(?:text|copy|label))?\s*(?:to|as|:)\s*["']?([^"\n']+)["']?/i
  );
  if (directMatch?.[1]) return sanitizeCtaText(directMatch[1]);

  const quotedNearCta = instruction.match(
    /(?:cta|call\s*to\s*action|button)[^"'`\n]{0,80}["']([^"\n']{2,80})["']/i
  );
  return sanitizeCtaText(quotedNearCta?.[1] || "");
};

const parseUrlFromInstruction = (instruction: string) => {
  const urlMatch = instruction.match(/https?:\/\/[^\s"']+/i);
  return pickString(urlMatch?.[0] || "");
};

const sanitizeInstructionFragment = (value: string, maxLength = 160) =>
  pickString(value)
    .replace(/^["'`“”]+|["'`“”]+$/g, "")
    .replace(/^[\s:=-]+|[\s.,;:!?]+$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);

const parseHeadingTextFromInstruction = (instruction: string) => {
  const patterns = [
    /(?:change|set|update|rewrite|replace)\s+(?:the\s*)?(?:heading|headline|title)\s+(?:to|as|with)\s*["'`“”]?([^"'`“”\n]{2,160})["'`“”]?/i,
    /(?:heading|headline|title)\s*(?:to|as|:)\s*["'`“”]?([^"'`“”\n]{2,160})["'`“”]?/i,
  ];

  for (const pattern of patterns) {
    const match = instruction.match(pattern);
    const value = sanitizeInstructionFragment(match?.[1] || "");
    if (value) return value;
  }
  return "";
};

const EMAIL_TONE_MAP: Record<string, string> = {
  authoritative: "Authoritative",
  bold: "Bold",
  casual: "Casual",
  confident: "Confident",
  conversational: "Conversational",
  direct: "Direct",
  empathetic: "Empathetic",
  formal: "Formal",
  friendly: "Friendly",
  neutral: "Neutral",
  playful: "Playful",
  polished: "Polished",
  premium: "Premium",
  professional: "Professional",
  reassuring: "Reassuring",
  urgent: "Urgent",
  warm: "Warm",
};

const parseToneFromInstruction = (instruction: string) => {
  const lower = pickString(instruction).toLowerCase();
  if (!lower) return "";

  const patterns = [
    /\b(?:tone|voice|style)\s*(?:to|as|:)\s*(authoritative|bold|casual|confident|conversational|direct|empathetic|formal|friendly|neutral|playful|polished|premium|professional|reassuring|urgent|warm)\b/i,
    /\bmake\s+it\s+(?:sound\s+)?(authoritative|bold|casual|confident|conversational|direct|empathetic|formal|friendly|neutral|playful|polished|premium|professional|reassuring|urgent|warm)\b/i,
    /\bmore\s+(authoritative|bold|casual|confident|conversational|direct|empathetic|formal|friendly|neutral|playful|polished|premium|professional|reassuring|urgent|warm)\b/i,
  ];

  for (const pattern of patterns) {
    const match = lower.match(pattern);
    const token = pickString(match?.[1] || "").toLowerCase();
    if (token && EMAIL_TONE_MAP[token]) return EMAIL_TONE_MAP[token];
  }
  return "";
};

const extractRequestedAddBlockTypes = (instruction: string) => {
  const lower = instruction.toLowerCase();
  const requested = new Set<string>();

  if (/\b(add|include|insert)\s+(?:an?\s+|the\s+)?(?:quote|testimonial)\b/.test(lower)) requested.add("quote");
  if (/\b(add|include|insert)\s+(?:an?\s+|the\s+)?(?:social(?: links?| icons?| block| section)?|linkedin icons?|social icons?)\b/.test(lower)) requested.add("social");
  if (/\b(add|include|insert)\s+(?:an?\s+|the\s+)?(?:divider|separator)\b/.test(lower)) requested.add("divider");
  if (/\b(add|include|insert)\s+(?:an?\s+|the\s+)?(?:signature|footer|sign(?:-| )?off)\b/.test(lower)) requested.add("signature");
  if (/\b(add|include|insert)\s+(?:an?\s+|the\s+)?(?:table|pricing table|comparison table)\b/.test(lower)) requested.add("table");
  if (/\b(add|include|insert)\s+(?:an?\s+|the\s+)?(?:columns?|two column section|multi column section)\b/.test(lower)) requested.add("columns");
  if (/\b(add|include|insert)\s+(?:an?\s+|the\s+)?(?:video|video block)\b/.test(lower)) requested.add("video");
  if (/\b(add|include|insert)\s+(?:an?\s+|the\s+)?(?:code|code block|snippet)\b/.test(lower)) requested.add("code");
  if (/\b(add|include|insert)\s+(?:an?\s+|the\s+)?(?:cta|button|call\s*to\s*action)\b/.test(lower)) requested.add("button");
  if (
    /\b(add|include|insert)\s+(?:an?\s+|the\s+)?(?:image|hero image|hero|banner|logo|flag|seal|illustration|visual section|cover image|masthead)\b/.test(
      lower
    )
  ) {
    requested.add("image");
  }

  return Array.from(requested);
};

const extractRequestedRemoveBlockTypes = (instruction: string) => {
  const lower = instruction.toLowerCase();
  const requested = new Set<string>();

  if (/\b(remove|delete|drop|strip|take out)\s+(?:the\s+|all\s+)?(?:quote|testimonial)\b/.test(lower)) requested.add("quote");
  if (/\b(remove|delete|drop|strip|take out)\s+(?:the\s+|all\s+)?(?:social(?: links?| icons?| block| section)?|linkedin icons?|social icons?)\b/.test(lower)) requested.add("social");
  if (/\b(remove|delete|drop|strip|take out)\s+(?:the\s+|all\s+)?(?:divider|separator)\b/.test(lower)) requested.add("divider");
  if (/\b(remove|delete|drop|strip|take out)\s+(?:the\s+|all\s+)?(?:signature|footer|sign(?:-| )?off)\b/.test(lower)) requested.add("signature");
  if (/\b(remove|delete|drop|strip|take out)\s+(?:the\s+|all\s+)?(?:table|pricing table|comparison table)\b/.test(lower)) requested.add("table");
  if (/\b(remove|delete|drop|strip|take out)\s+(?:the\s+|all\s+)?(?:columns?|two column section|multi column section)\b/.test(lower)) requested.add("columns");
  if (/\b(remove|delete|drop|strip|take out)\s+(?:the\s+|all\s+)?(?:video|video block)\b/.test(lower)) requested.add("video");
  if (/\b(remove|delete|drop|strip|take out)\s+(?:the\s+|all\s+)?(?:code|code block|snippet)\b/.test(lower)) requested.add("code");
  if (/\b(remove|delete|drop|strip|take out)\s+(?:the\s+|all\s+)?(?:cta|button|call\s*to\s*action)\b/.test(lower)) requested.add("button");
  if (
    /\b(remove|delete|drop|strip|take out)\s+(?:the\s+|all\s+)?(?:image|hero image|hero|banner|logo|flag|seal|illustration|visual section|cover image|masthead)\b/.test(
      lower
    )
  ) {
    requested.add("image");
  }

  return Array.from(requested);
};

const parseAdditionalSectionTopicFromInstruction = (instruction: string) => {
  const patterns = [
    /(?:add|include|insert)\s+(?:an?\s+|another\s+|extra\s+)?(?:section|paragraph|text block|block)\s+(?:about|on|for)\s*["'`“”]?([^"'`“”\n]{2,160})["'`“”]?/i,
    /(?:add|include|insert)\s+(?:more|extra|deeper)\s+(?:content|copy|detail|details|context)\s+(?:about|on|for)\s*["'`“”]?([^"'`“”\n]{2,160})["'`“”]?/i,
  ];

  for (const pattern of patterns) {
    const match = instruction.match(pattern);
    const value = sanitizeInstructionFragment(match?.[1] || "");
    if (value) return value;
  }
  return "";
};

const parseQuoteTextFromInstruction = (instruction: string) => {
  const patterns = [
    /(?:quote|testimonial)[^"'`“”\n]{0,40}["'`“”]([^"'`“”\n]{2,220})["'`“”]/i,
    /["'`“”]([^"'`“”\n]{2,220})["'`“”][^"'`“”\n]{0,40}(?:quote|testimonial)/i,
  ];

  for (const pattern of patterns) {
    const match = instruction.match(pattern);
    const value = sanitizeInstructionFragment(match?.[1] || "", 220);
    if (value) return value;
  }
  return "";
};

const splitIntoSentences = (value: string) =>
  pickString(value)
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((item) => item.trim())
    .filter(Boolean);

const shortenEmailText = (value: string, maxSentences = 2, maxChars = 220) => {
  const sentences = splitIntoSentences(value);
  const reduced = (sentences.slice(0, maxSentences).join(" ") || pickString(value)).trim();
  if (reduced.length <= maxChars) return reduced;
  return `${reduced.slice(0, Math.max(0, maxChars - 3)).trim()}...`;
};

const buildExpansionParagraph = ({
  topic,
  audience,
  tone,
}: {
  topic: string;
  audience: string;
  tone: string;
}) => {
  const resolvedTopic = pickString(topic || "the update");
  const resolvedAudience = pickString(audience || "the audience");
  const resolvedTone = pickString(tone || "professional").toLowerCase();
  return `Additional context on ${resolvedTopic}: explain why it matters now, what it changes for ${resolvedAudience}, and the next concrete action. Keep the tone ${resolvedTone} and specific rather than generic.`;
};

const toHtmlText = (text: string) =>
  pickString(text).replace(/\n/g, "<br>");

const hasEmailBlockType = (blocks: Array<Record<string, unknown>>, type: string) =>
  blocks.some((block) => pickString(block.type || "").toLowerCase() === type);

const createEmailHeadingBlock = (text: string) => ({
  id: crypto.randomUUID(),
  type: "heading",
  content: {
    text,
    html: `<b>${text}</b>`,
  },
  styles: {
    padding: "16px",
    backgroundColor: "transparent",
  },
});

const createEmailTextBlock = (text: string) => ({
  id: crypto.randomUUID(),
  type: "text",
  content: {
    text,
    html: toHtmlText(text),
  },
  styles: {
    padding: "16px",
    backgroundColor: "transparent",
  },
});

const createEmailDividerBlock = () => ({
  id: crypto.randomUUID(),
  type: "divider",
  content: {
    color: "#e5e7eb",
    thickness: 1,
    style: "solid",
  },
  styles: {
    padding: "10px 16px",
    backgroundColor: "transparent",
  },
});

const createEmailButtonBlock = ({ cta, url, color }: { cta: string; url: string; color: string }) => ({
  id: crypto.randomUUID(),
  type: "button",
  content: {
    text: cta || "Get Started",
    url: url || "#",
    align: "left",
    bgColor: color || "#2a9d6e",
    textColor: "#ffffff",
  },
  styles: {
    padding: "16px",
    backgroundColor: "transparent",
  },
});

const createEmailSignatureBlock = () => ({
  id: crypto.randomUUID(),
  type: "signature",
  content: {
    text: "Best regards,\nYour Team",
    html: "Best regards,<br><b>Your Team</b>",
  },
  styles: {
    padding: "16px",
    backgroundColor: "transparent",
  },
});

const createEmailImageBlock = (index = 1) => ({
  id: crypto.randomUUID(),
  type: "image",
  content: {
    src: `https://placehold.co/1200x500?text=Newsletter+Banner+${index}`,
    alt: `Newsletter banner ${index}`,
    width: "100%",
  },
  styles: { padding: "16px" },
});

const createEmailQuoteBlock = () => ({
  id: crypto.randomUUID(),
  type: "quote",
  content: {
    text: "Great messaging is clear, specific, and useful.",
    html: "Great messaging is <b>clear, specific, and useful</b>.",
  },
  styles: { padding: "16px" },
});

const createEmailSocialBlock = () => ({
  id: crypto.randomUUID(),
  type: "social",
  content: {
    links: [
      { platform: "LinkedIn", url: "#" },
      { platform: "X", url: "#" },
      { platform: "Website", url: "#" },
    ],
  },
  styles: { padding: "16px" },
});

const createEmailTableBlock = () => ({
  id: crypto.randomUUID(),
  type: "table",
  content: {
    data: [
      ["Plan", "Key Benefit"],
      ["Starter", "Fast setup"],
      ["Growth", "Advanced personalization"],
      ["Enterprise", "Security and scale"],
    ],
  },
  styles: { padding: "16px" },
});

const createEmailColumnsBlock = () => ({
  id: crypto.randomUUID(),
  type: "columns",
  content: {
    content: [
      { text: "Column 1: Key update and context." },
      { text: "Column 2: Action item and next step." },
    ],
  },
  styles: { padding: "16px" },
});

const createEmailCodeBlock = () => ({
  id: crypto.randomUUID(),
  type: "code",
  content: {
    text: "<a href='#' style='color:#0f766e'>Call to action</a>",
  },
  styles: { padding: "16px" },
});

const createEmailVideoBlock = () => ({
  id: crypto.randomUUID(),
  type: "video",
  content: {
    title: "Watch the update",
    url: "#",
  },
  styles: { padding: "16px" },
});

const insertBlocksBeforeTail = (
  blocks: Array<Record<string, unknown>>,
  incoming: Array<Record<string, unknown>>
) => {
  const nextBlocks = blocks;
  const extras = incoming.filter(Boolean);
  if (extras.length === 0) return nextBlocks;

  const tailIndex = nextBlocks.findIndex((block) => ["button", "signature"].includes(block.type));
  if (tailIndex >= 0) {
    nextBlocks.splice(tailIndex, 0, ...extras);
  } else {
    nextBlocks.push(...extras);
  }
  return nextBlocks;
};

const buildRequestedBlock = ({
  type,
  instruction,
  brief,
  template,
}: {
  type: string;
  instruction: string;
  brief: Record<string, unknown>;
  template: Record<string, unknown>;
}) => {
  if (type === "quote") {
    const quoteText =
      parseQuoteTextFromInstruction(instruction) ||
      `Key perspective: ${deriveTopicPhraseFromInstruction(instruction) || pickString(template.subject || "This update")} matters because clarity builds trust and action.`;
    return {
      ...createEmailQuoteBlock(),
      content: {
        text: quoteText,
        html: toHtmlText(quoteText),
      },
    };
  }
  if (type === "divider") return createEmailDividerBlock();
  if (type === "signature") return createEmailSignatureBlock();
  if (type === "social") return createEmailSocialBlock();
  if (type === "table") return createEmailTableBlock();
  if (type === "columns") return createEmailColumnsBlock();
  if (type === "video") return createEmailVideoBlock();
  if (type === "code") return createEmailCodeBlock();
  if (type === "button") {
    return createEmailButtonBlock({
      cta: parseButtonTextFromInstruction(instruction) || pickString(brief.cta || "Learn more"),
      url: parseUrlFromInstruction(instruction),
      color: resolveColorToken(instruction) || "#2a9d6e",
    });
  }
  if (type === "image") {
    const requestedImageDescriptor = extractRequestedImageDescriptor(instruction);
    if (requestedImageDescriptor) {
      return {
        ...createEmailImageBlock(),
        content: {
          src: resolveRequestedImageSrc(requestedImageDescriptor),
          alt: formatRequestedImageLabel(requestedImageDescriptor),
          width: "100%",
        },
      };
    }
    return createEmailImageBlock();
  }
  if (type === "heading") {
    return createEmailHeadingBlock(parseHeadingTextFromInstruction(instruction) || pickString(template.subject || "Additional section"));
  }
  return createEmailTextBlock(
    buildExpansionParagraph({
      topic: deriveTopicPhraseFromInstruction(instruction) || pickString(template.subject || "the message"),
      audience: pickString(brief.audience || template.audience || "your audience"),
      tone: pickString(brief.tone || template.voice || "Professional"),
    })
  );
};

const isGenericSubject = (value: string) => {
  const normalized = pickString(value).toLowerCase();
  if (!normalized) return true;
  const genericTokens = [
    "quick idea for your team",
    "new message",
    "untitled",
    "ai email draft",
    "ai email template",
    "hello",
  ];
  return genericTokens.some((token) => normalized.includes(token));
};

const isGenericHeading = (value: string) => {
  const normalized = pickString(value).toLowerCase();
  if (!normalized) return true;
  const genericTokens = ["new message", "hello", "your update", "ai email", "campaign update", "quick update"];
  return genericTokens.some((token) => normalized.includes(token));
};

const extractInstructionKeywords = (instruction: string) => {
  const stopwords = new Set([
    "a", "an", "the", "and", "or", "to", "for", "with", "without", "of", "in", "on", "at", "by", "from",
    "create", "generate", "build", "make", "write", "compose", "draft", "email", "template", "message",
    "please", "highly", "very", "attractive", "modern", "beautiful", "premium", "polished", "stylish",
    "this", "that", "your", "our", "their", "into", "about", "regarding", "use", "using", "want", "need",
    "one", "two", "three", "new", "best", "good", "image", "images", "screenshot", "attached", "uploaded", "given", "shown", "like",
  ]);
  const tokens = normalizeEmailTopicTypos(instruction)
    .toLowerCase()
    .match(/[a-z0-9]+/g) || [];
  const unique: string[] = [];
  for (const token of tokens) {
    if (token.length < 3) continue;
    if (stopwords.has(token)) continue;
    if (unique.includes(token)) continue;
    unique.push(token);
  }
  return unique.slice(0, 8);
};

const collectResultText = (result: Record<string, unknown>) => {
  const blocks = collectEmailBlocks(result);
  return [
    pickString(result.subject || ""),
    ...blocks.map((block) => pickString(asObject(block.content).text || asObject(block.content).html || "")),
  ]
    .join(" ")
    .toLowerCase();
};

const inferRequestedBlockCount = (instruction: string) => {
  const lower = instruction.toLowerCase();
  const asksVeryLong = /very long|very detailed|in depth|deep dive|comprehensive/.test(lower);
  const asksLong = /lot of content|long|detailed|elaborate|full content|rich content/.test(lower);
  const asksNewsletter = /newsletter|digest|bulletin/.test(lower);
  const asksShort = /short|brief|concise|minimal|one[-\s]?liner|simple/.test(lower);
  const asksAttractive = /attractive|modern|beautiful|premium|polished|stylish|highly attractive/.test(lower);
  const asksHighlyAttractive = /highly attractive|very attractive|premium showcase/.test(lower);

  if (asksShort) return 4;
  if (asksHighlyAttractive) return 9;
  if (asksVeryLong) return 10;
  if (asksAttractive) return 7;
  if (asksLong || asksNewsletter) return 8;
  return 5;
};

type EmailPromptRequirements = {
  requestedBlockCount: number;
  explicitBlockCount: number;
  explicitSubject: string;
  explicitCtaText: string;
  explicitUrl: string;
  requestedColor: string;
  noCta: boolean;
  ctaRequired: boolean;
  requiredTypes: string[];
  bannerCount: number;
  wantsNewsletter: boolean;
  wantsAttractive: boolean;
  wantsImageReferenceTemplate: boolean;
  wantsParagraphs: boolean;
  wantsBullets: boolean;
  wantsMoreInfo: boolean;
  wantsTimelineOrRoi: boolean;
  wantsShorter: boolean;
  wantsLonger: boolean;
  wantsEditExisting: boolean;
  wantsFreshDraft: boolean;
};

type EmailQualityReport = {
  score: number;
  totalChecks: number;
  met: string[];
  unmet: string[];
};

const countWordsMap: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};

const parseCountToken = (token: string) => {
  const normalized = pickString(token).toLowerCase();
  if (!normalized) return 0;
  if (countWordsMap[normalized]) return countWordsMap[normalized];
  const numeric = Number(normalized);
  if (Number.isFinite(numeric) && numeric > 0) return Math.floor(numeric);
  return 0;
};

const parseExplicitBlockCount = (instruction: string) => {
  const patterns = [
    /\b(one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+(?:content\s+)?(?:blocks?|sections?|parts?)\b/i,
    /\b(?:with|use|create|generate|build)\s+(one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+(?:content\s+)?(?:blocks?|sections?|parts?)\b/i,
    /\b(?:in|across)\s+(one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+(?:content\s+)?(?:blocks?|sections?|parts?)\b/i,
  ];

  for (const pattern of patterns) {
    const match = instruction.match(pattern);
    const parsed = parseCountToken(match?.[1] || "");
    if (parsed > 0) return clamp(parsed, 1, 12);
  }

  return 0;
};

const isImageReferenceInstruction = (instruction: string) => {
  const lower = instruction.toLowerCase();
  if (
    /\b(attached|uploaded)\s+(image|screenshot)\b/.test(lower) ||
    /\b(like|same as|based on|from|given in|shown in|according to|per)\s+(the\s+)?(attached\s+)?(image|screenshot)\b/.test(lower) ||
    /\bas in (the\s+)?(image|screenshot)\b/.test(lower)
  ) {
    return true;
  }
  return false;
};

const extractBannerCount = (instruction: string) => {
  const lower = instruction.toLowerCase();
  const referencesImageSource = isImageReferenceInstruction(instruction);
  const explicitlyMentionsHeroOrBanner =
    /\b(hero|hero image|banner|masthead|header image|cover image)\b/.test(lower);
  const explicitlyMentionsVisualBlock =
    /\b(image block|visual section|visual)\b/.test(lower);

  const match = instruction.match(
    /\b(one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+(?:newsletter\s+)?banner(?:s)?\b/i
  );
  const parsed = parseCountToken(match?.[1] || "");
  if (parsed > 0) return Math.min(parsed, 6);

  if (referencesImageSource) {
    if (explicitlyMentionsHeroOrBanner || explicitlyMentionsVisualBlock) return 1;
    return 0;
  }
  if (/\bbanner\b/i.test(instruction)) return 1;
  return 0;
};

const extractEmailPromptRequirements = (instruction: string, brief: Record<string, unknown>): EmailPromptRequirements => {
  const lower = instruction.toLowerCase();
  const requiredTypes = new Set<string>();
  const wantsImageReferenceTemplate = isImageReferenceInstruction(instruction);

  if (/\bquote|testimonial\b/.test(lower)) requiredTypes.add("quote");
  if (/\bsocial|linkedin|twitter|x\b|facebook|instagram|youtube\b/.test(lower)) requiredTypes.add("social");
  if (/\btable|comparison|pricing table\b/.test(lower)) requiredTypes.add("table");
  if (/\bcolumns|two column|multi column\b/.test(lower)) requiredTypes.add("columns");
  if (/\bcode|snippet|html code\b/.test(lower)) requiredTypes.add("code");
  if (/\bvideo\b/.test(lower)) requiredTypes.add("video");
  if (/\bfooter|unsubscribe|address\b/.test(lower)) requiredTypes.add("signature");
  if (/\blogo\b/.test(lower) || /\bseal\b/.test(lower)) requiredTypes.add("image");
  const requestsImageElement =
    /\b(hero image|illustration|visual section|image block|flag)\b/.test(lower) ||
    /\b(add|include|insert|use|place|put|show)\s+(an?\s+|the\s+)?(image|banner|hero image|illustration|visual|flag|seal)\b/.test(lower) ||
    /\bbanner\b/.test(lower);
  const imageReferenceHasVisualCue =
    wantsImageReferenceTemplate &&
    /\b(hero|hero image|banner|masthead|header image|cover image|visual section|image block|logo|flag|seal)\b/.test(lower);
  if (
    requestsImageElement &&
    (!wantsImageReferenceTemplate || /\b(add|include|insert)\b/.test(lower) || imageReferenceHasVisualCue)
  ) {
    requiredTypes.add("image");
  }
  if (/\bsignature\b/.test(lower)) requiredTypes.add("signature");

  const noCta = /no cta|without cta|without button|no button/.test(lower);
  const explicitCtaText = parseButtonTextFromInstruction(instruction) || pickString(brief.cta || "");
  const explicitUrl = parseUrlFromInstruction(instruction);
  const ctaRequired = Boolean(explicitCtaText || explicitUrl || /\bcta|button\b/.test(lower));
  const wantsParagraphs = isParagraphRequest(instruction);
  const wantsBullets = isBulletRequest(instruction);
  const wantsMoreInfo = isMoreInfoRequest(instruction);
  const wantsTimelineOrRoi = isTimelineOrRoiRequest(instruction);
  const wantsShorter = /\bshorter|shorten|more concise|condense\b/.test(lower);
  const wantsLonger = /\blonger|expand|elaborate\b/.test(lower);
  const wantsFreshDraft = isFreshDraftInstruction(instruction);
  const wantsEditExisting = isEditInstruction(instruction) && !wantsFreshDraft;
  const wantsAttractive = /attractive|modern|beautiful|premium|polished|stylish/.test(lower);
  const explicitBlockCount = parseExplicitBlockCount(instruction);

  return {
    requestedBlockCount: explicitBlockCount || inferRequestedBlockCount(instruction),
    explicitBlockCount,
    explicitSubject: parseSubjectFromInstruction(instruction),
    explicitCtaText,
    explicitUrl,
    requestedColor: resolveColorToken(instruction) || "#2a9d6e",
    noCta,
    ctaRequired,
    requiredTypes: Array.from(requiredTypes),
    bannerCount: extractBannerCount(instruction),
    wantsNewsletter: /newsletter|digest|bulletin/.test(lower),
    wantsAttractive,
    wantsImageReferenceTemplate,
    wantsParagraphs,
    wantsBullets,
    wantsMoreInfo,
    wantsTimelineOrRoi,
    wantsShorter,
    wantsLonger,
    wantsEditExisting,
    wantsFreshDraft,
  };
};

const equalsNormalized = (left: string, right: string) =>
  normalizeText(left).toLowerCase() === normalizeText(right).toLowerCase();

const collectEmailBlocks = (template: Record<string, unknown>) =>
  coerceObjectArray(template.blocks).map((block) => normalizeEmailBlock(block));

const computeBlockTypeOverlapScore = (
  baseline: Array<Record<string, unknown>>,
  candidate: Array<Record<string, unknown>>
) => {
  if (baseline.length === 0 || candidate.length === 0) return 0;
  const baselineCounts: Record<string, number> = {};
  const candidateCounts: Record<string, number> = {};

  for (const block of baseline) {
    const type = pickString(block.type || "text").toLowerCase();
    baselineCounts[type] = (baselineCounts[type] || 0) + 1;
  }
  for (const block of candidate) {
    const type = pickString(block.type || "text").toLowerCase();
    candidateCounts[type] = (candidateCounts[type] || 0) + 1;
  }

  let overlap = 0;
  for (const type of Object.keys(baselineCounts)) {
    overlap += Math.min(baselineCounts[type] || 0, candidateCounts[type] || 0);
  }

  return overlap / baseline.length;
};

const extractRequestedImageDescriptor = (instruction: string) => {
  const normalized = pickString(instruction).replace(/\s+/g, " ").trim();
  if (!normalized) return "";

  const quotedMatch = normalized.match(
    /["'`“”]([^"'`“”]{1,80}?(?:flag|logo|image|banner|hero(?: image)?|illustration|seal))["'`“”]/i
  );
  if (quotedMatch?.[1]) return pickString(quotedMatch[1]);

  const actionMatch = normalized.match(
    /\b(?:add|include|insert|show|use|place|put)\s+(?:an?\s+|the\s+)?([a-z0-9 .,&'/-]{1,80}?(?:flag|logo|image|banner|hero(?: image)?|illustration|seal))\b/i
  );
  if (actionMatch?.[1]) return pickString(actionMatch[1]);

  return "";
};

const formatRequestedImageLabel = (value: string) =>
  pickString(value)
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => {
      const lower = token.toLowerCase();
      if (lower === "usa" || lower === "u.s.a." || lower === "u.s.a" || lower === "u.s.") return "USA";
      if (lower === "us" || lower === "u.s") return "US";
      return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
    })
    .join(" ")
    .trim();

const resolveRequestedImageSrc = (descriptor: string) => {
  const lower = pickString(descriptor).toLowerCase();

  if (/\b(usa|u\.s\.a\.?|us|u\.s\.|united states|america|american)\b/.test(lower) && /\bflag\b/.test(lower)) {
    return "https://flagcdn.com/us.svg";
  }
  if (/\b(india|indian)\b/.test(lower) && /\bflag\b/.test(lower)) {
    return "https://flagcdn.com/in.svg";
  }

  const label = formatRequestedImageLabel(descriptor) || "Requested Visual";
  return `https://placehold.co/1200x675/f8fafc/0f172a?text=${encodeURIComponent(label)}`;
};

const upsertRequestedImageBlock = (
  template: Record<string, unknown>,
  descriptor: string,
  brief: Record<string, unknown>,
  instruction: string
) => {
  const next = deepClone(template) as Record<string, unknown>;
  const blocks = collectEmailBlocks(next);
  const label = formatRequestedImageLabel(descriptor) || "Requested Visual";
  const src = resolveRequestedImageSrc(descriptor);

  const preferredIndex = blocks.findIndex((block) => {
    if (block.type !== "image") return false;
    const content = asObject(block.content);
    const currentSrc = pickString(content.src || "");
    const currentAlt = pickString(content.alt || "").toLowerCase();
    return !currentSrc || /seal|placeholder|banner|visual|logo|flag/.test(currentAlt);
  });

  if (preferredIndex >= 0) {
    const existing = blocks[preferredIndex];
    existing.content = {
      ...asObject(existing.content),
      src,
      alt: label,
      width: pickString(asObject(existing.content).width || "100%"),
    };
  } else {
    blocks.unshift({
      id: crypto.randomUUID(),
      type: "image",
      content: {
        src,
        alt: label,
        width: "100%",
      },
      styles: { padding: "16px" },
    });
  }

  const existingReasoning = pickString(next.reasoning || "");
  next.reasoning = [existingReasoning, `Applied requested visual update: ${label}.`]
    .filter(Boolean)
    .join(" ");
  next.blocks = blocks;
  return normalizeEmailResult(next, brief, instruction);
};

const isLightweightVisualEditRequest = (
  instruction: string,
  requirements: EmailPromptRequirements
) => {
  if (!requirements.wantsEditExisting) return false;
  if (!extractRequestedImageDescriptor(instruction)) return false;

  const lower = instruction.toLowerCase();
  const hasRewriteCue =
    requirements.wantsParagraphs ||
    requirements.wantsBullets ||
    requirements.wantsMoreInfo ||
    requirements.wantsTimelineOrRoi ||
    requirements.wantsShorter ||
    requirements.wantsLonger ||
    Boolean(requirements.explicitSubject) ||
    Boolean(requirements.explicitCtaText) ||
    Boolean(requirements.explicitUrl) ||
    requirements.noCta ||
    /\b(change|replace|remove|delete|move|reorder|rewrite|revise|shorten|expand|convert)\b/.test(lower);

  return !hasRewriteCue && /\b(add|include|insert|show|use|place|put)\b/.test(lower);
};

const isDeterministicVisualAddInstruction = (instruction: string) => {
  const lower = instruction.toLowerCase();
  if (!extractRequestedImageDescriptor(instruction)) return false;

  return (
    /\b(add|include|insert|show|use|place|put)\b/.test(lower) &&
    !/\b(change|replace|remove|delete|move|reorder|rewrite|revise|shorten|expand|convert|paragraph|bullet|cta|subject|url)\b/.test(
      lower
    )
  );
};

const isTargetedEditInstruction = (instruction: string, requirements: EmailPromptRequirements) => {
  if (!requirements.wantsEditExisting || requirements.wantsFreshDraft) return false;
  if (requirements.explicitBlockCount > 0) return false;

  const lower = instruction.toLowerCase();
  const broadRewriteCue =
    /\b(reorder|move|swap|new layout|different layout|different structure|rebuild|transform into|full redesign|redesign the whole)\b/.test(
      lower
    );

  return !broadRewriteCue;
};

const mergeTargetedEditCandidateIntoCurrent = ({
  currentTemplate,
  candidate,
  instruction,
  brief,
  requirements,
}: {
  currentTemplate: Record<string, unknown>;
  candidate: Record<string, unknown>;
  instruction: string;
  brief: Record<string, unknown>;
  requirements: EmailPromptRequirements;
}) => {
  const next = deepClone(currentTemplate) as Record<string, unknown>;
  const currentBlocks = collectEmailBlocks(next);
  const candidateBlocks = collectEmailBlocks(candidate);
  const candidateQueues: Record<string, Array<Record<string, unknown>>> = {};
  const explicitAddTypes = new Set(extractRequestedAddBlockTypes(instruction));
  const canMergeImage = Boolean(extractRequestedImageDescriptor(instruction));
  const mergeableTypes = new Set([
    "heading",
    "text",
    "button",
    "quote",
    "signature",
    "columns",
    "table",
    "social",
    "video",
    "code",
  ]);

  for (const block of candidateBlocks) {
    const type = pickString(block.type || "text").toLowerCase();
    candidateQueues[type] = candidateQueues[type] || [];
    candidateQueues[type].push(deepClone(block) as Record<string, unknown>);
  }

  const takeCandidate = (type: string) => {
    const queue = candidateQueues[type];
    if (!queue || queue.length === 0) return null;
    return queue.shift() || null;
  };

  for (const block of currentBlocks) {
    const type = pickString(block.type || "text").toLowerCase();
    if (type === "image" && canMergeImage) {
      const replacement = takeCandidate("image");
      if (replacement) {
        block.content = {
          ...asObject(block.content),
          ...asObject(replacement.content),
        };
        block.styles = {
          ...asObject(block.styles),
          ...asObject(replacement.styles),
        };
      }
      continue;
    }
    if (!mergeableTypes.has(type)) continue;

    const replacement = takeCandidate(type);
    if (!replacement) continue;

    block.content = {
      ...asObject(block.content),
      ...asObject(replacement.content),
    };
    block.styles = {
      ...asObject(block.styles),
      ...asObject(replacement.styles),
    };
  }

  const extraBlocks: Array<Record<string, unknown>> = [];
  const additionalSectionTopic = parseAdditionalSectionTopicFromInstruction(instruction);

  for (const [type, queue] of Object.entries(candidateQueues)) {
    const shouldAppend =
      explicitAddTypes.has(type) ||
      requirements.requiredTypes.includes(type) ||
      (type === "text" && (requirements.wantsLonger || requirements.wantsMoreInfo || Boolean(additionalSectionTopic)));
    if (!shouldAppend) continue;

    for (const block of queue) {
      extraBlocks.push(deepClone(block) as Record<string, unknown>);
    }
  }

  if (extraBlocks.length > 0) {
    insertBlocksBeforeTail(currentBlocks, extraBlocks);
  }

  next.blocks = currentBlocks;
  next.voice = pickString(candidate.voice || next.voice || "");
  next.goal = pickString(candidate.goal || next.goal || "");
  next.audience = pickString(candidate.audience || next.audience || "");
  next.reasoning = [
    pickString(candidate.reasoning || ""),
    pickString(next.reasoning || ""),
    "Preserved the existing layout and merged targeted follow-up edits.",
  ]
    .filter(Boolean)
    .join(" ");

  return normalizeEmailResult(next, brief, instruction);
};

const extractActionItemsFromInstruction = (instruction: string) => {
  if (!/\baction\s*items?\b/i.test(instruction)) return [] as string[];

  const normalized = instruction.replace(/\r\n/g, "\n");
  const section = normalized.split(/action\s*items?\s*:?\s*/i).slice(1).join(" ").trim() || normalized;
  const compact = section.replace(/\n+/g, " ").replace(/\s{2,}/g, " ").trim();
  const numberedMatches = Array.from(
    compact.matchAll(/(?:^|\s)\d+\s*[\).:-]\s*([^0-9][^]*?)(?=(?:\s+\d+\s*[\).:-]\s*)|$)/g)
  )
    .map((match) => pickString(match[1] || "").replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const fallbackList = compact
    .split(/[,\n;]/)
    .map((item) => item.replace(/^\s*(?:[-*•]|\d+\s*[\).:-])\s*/, "").trim())
    .filter((item) => item.length > 0);

  const rawItems = numberedMatches.length > 0 ? numberedMatches : fallbackList;
  const cleaned = rawItems
    .map((item) =>
      item
        .replace(/^(add|include|this|that|the)\s+/i, "")
        .replace(/[.]+$/g, "")
        .trim()
    )
    .filter((item) => item.length > 1)
    .slice(0, 8);

  return Array.from(new Set(cleaned));
};

const upsertActionItemsSection = (template: Record<string, unknown>, actionItems: string[]) => {
  if (actionItems.length === 0) return template;

  const blocks = collectEmailBlocks(template);
  const listText = actionItems.map((item) => `- ${item}`).join("\n");
  const findActionAnchorIndex = () =>
    blocks.findIndex((block) => {
      if (block.type !== "heading" && block.type !== "text") return false;
      const content = asObject(block.content);
      const plain = stripHtmlToPlainText(pickString(content.text || content.html || ""));
      return /\baction\s*items?\b/i.test(plain);
    });

  let anchorIndex = findActionAnchorIndex();
  let targetTextIndex = -1;

  if (anchorIndex >= 0) {
    for (let i = anchorIndex + 1; i < blocks.length; i += 1) {
      if (blocks[i].type === "text") {
        targetTextIndex = i;
        break;
      }
      if (blocks[i].type === "heading") break;
    }
    if (targetTextIndex === -1 && blocks[anchorIndex]?.type === "text") {
      targetTextIndex = anchorIndex;
    }
  }

  if (targetTextIndex === -1) {
    targetTextIndex = blocks.findIndex((block) => {
      if (block.type !== "text") return false;
      const content = asObject(block.content);
      const plain = stripHtmlToPlainText(pickString(content.text || content.html || ""));
      return /\baction\s*items?\b/i.test(plain);
    });
  }

  if (targetTextIndex >= 0) {
    const target = blocks[targetTextIndex];
    target.content = {
      ...asObject(target.content),
      text: listText,
      html: toHtmlText(listText),
    };
  } else {
    if (anchorIndex < 0) {
      blocks.push(createEmailHeadingBlock("Action items"));
      anchorIndex = blocks.length - 1;
    }
    blocks.splice(anchorIndex + 1, 0, createEmailTextBlock(listText));
  }

  const next = { ...template, blocks };
  const existingReason = pickString(next.reasoning || "");
  if (!/action items/i.test(existingReason)) {
    next.reasoning = [existingReason, "Applied requested updates to the Action items section."]
      .filter(Boolean)
      .join(" ");
  }
  return next;
};

type SimpleTextReplacement = {
  from: string;
  to: string;
};

type AssistantTemplateSnapshot = {
  template: Record<string, unknown>;
};

const isRestorePreviousVersionInstruction = (instruction: string) =>
  /\b(undo|revert|rollback|roll\s*back|restore|go back|back to previous|previous version|prev version|prior version|last version|previous draft|prev draft)\b/i.test(
    instruction
  );

const sanitizeReplacementToken = (value: string) =>
  pickString(value)
    .replace(/^["'`“”]+|["'`“”]+$/g, "")
    .replace(/^[\s:=-]+|[\s.,;:!?]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();

const parseSimpleTextReplacementInstruction = (instruction: string): SimpleTextReplacement | null => {
  const patterns = [
    /(?:change|replace|update|set|switch)\s+(?:this\s+)?["'`“”]([^"'`“”\n]{1,140})["'`“”]\s+(?:to|with|into)\s+["'`“”]([^"'`“”\n]{1,140})["'`“”]/i,
    /(?:change|replace|update|set|switch)\s+(?:this\s+)?([A-Za-z0-9@#./:_-]+(?:\s+[A-Za-z0-9@#./:_-]+){0,5})\s+(?:to|with|into)\s+([A-Za-z0-9@#./:_-]+(?:\s+[A-Za-z0-9@#./:_-]+){0,5})/i,
  ];

  for (const pattern of patterns) {
    const match = instruction.match(pattern);
    if (!match) continue;
    const from = sanitizeReplacementToken(match[1] || "");
    const to = sanitizeReplacementToken(match[2] || "");
    if (!from || !to) continue;
    if (equalsNormalized(from, to)) continue;
    if (from.length > 140 || to.length > 140) continue;
    return { from, to };
  }
  return null;
};

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const replaceTextOccurrences = (source: string, replacement: SimpleTextReplacement) => {
  const directParts = source.split(replacement.from);
  if (directParts.length > 1) {
    return {
      value: directParts.join(replacement.to),
      count: directParts.length - 1,
    };
  }

  const insensitivePattern = new RegExp(escapeRegExp(replacement.from), "gi");
  const matches = source.match(insensitivePattern) || [];
  if (matches.length === 0) {
    return { value: source, count: 0 };
  }
  return {
    value: source.replace(insensitivePattern, replacement.to),
    count: matches.length,
  };
};

const replaceTextInUnknown = (
  value: unknown,
  replacement: SimpleTextReplacement,
  depth = 0
): { value: unknown; count: number } => {
  if (depth > 14) return { value, count: 0 };

  if (typeof value === "string") {
    return replaceTextOccurrences(value, replacement);
  }

  if (Array.isArray(value)) {
    let count = 0;
    const next = value.map((item) => {
      const replaced = replaceTextInUnknown(item, replacement, depth + 1);
      count += replaced.count;
      return replaced.value;
    });
    return { value: next, count };
  }

  if (value && typeof value === "object") {
    const input = value as Record<string, unknown>;
    const next: Record<string, unknown> = {};
    let count = 0;
    for (const [key, nestedValue] of Object.entries(input)) {
      if (key === "id") {
        next[key] = nestedValue;
        continue;
      }
      const replaced = replaceTextInUnknown(nestedValue, replacement, depth + 1);
      next[key] = replaced.value;
      count += replaced.count;
    }
    return { value: next, count };
  }

  return { value, count: 0 };
};

const applySimpleTextReplacementToTemplate = (
  template: Record<string, unknown>,
  replacement: SimpleTextReplacement
) => {
  const base = deepClone(template);
  const replaced = replaceTextInUnknown(base, replacement);
  return {
    template: asObject(replaced.value),
    replacements: replaced.count,
  };
};

const collectAssistantTemplatesFromRecentMessages = (
  recentMessages: Array<Record<string, unknown>>
): AssistantTemplateSnapshot[] =>
  recentMessages
    .map((row) => {
      const role = pickString(row?.role || "").toLowerCase();
      if (role !== "assistant") return null;
      const metadata = asObject(row?.metadata);
      const resolved = resolveEmailTemplateCandidate(metadata?.result);
      if (!hasSubstantiveEmailBlocks(resolved)) return null;
      return {
        template: resolved,
      } satisfies AssistantTemplateSnapshot;
    })
    .filter((item): item is AssistantTemplateSnapshot => Boolean(item));

const isEditInstruction = (instruction: string) =>
  /\b(add|edit|refine|modify|update|change|improve|rewrite|revise|tweak|adjust|expand|shorten|replace|remove|fix|paragraph|bullet|undo|revert|rollback|restore|previous version|prev version|go back)\b/i.test(
    instruction
  );

const isFreshDraftInstruction = (instruction: string) =>
  /\b(start over|from scratch|fresh draft|fresh template|new draft|new template|different template|another template|recreate)\b/i.test(
    instruction
  );

const hasCurrentTemplateContext = (current: Record<string, unknown>) => {
  const template = asObject((current as any)?.template);
  return Array.isArray(template?.blocks) && template.blocks.length > 0;
};

const isParagraphRequest = (instruction: string) =>
  /\bparagraphs?\b/.test(instruction.toLowerCase());

const isBulletRequest = (instruction: string) =>
  /\bbullet(?:\s*points?)?\b|\bbullets?\b/.test(instruction.toLowerCase()) && !isParagraphRequest(instruction);

const isMoreInfoRequest = (instruction: string) =>
  /\bnot just heading|more content|information|detailed|in detail|explain|add detail|more detail\b/.test(
    instruction.toLowerCase()
  );

const isTimelineOrRoiRequest = (instruction: string) =>
  /\btimeline\b|\broi\b|90\s*days?\b/.test(instruction.toLowerCase());

const hasExplicitSubjectInstruction = (instruction: string) =>
  Boolean(parseSubjectFromInstruction(instruction));

const looksLikeInstructionText = (value: string) => {
  const normalized = normalizeText(value).toLowerCase();
  if (!normalized) return true;
  if (/^(add|create|generate|make|write|content)\b/.test(normalized)) return true;
  if (normalized.split(" ").length > 10) return true;
  return false;
};

const toParagraphText = (value: string) => {
  const cleaned = pickString(value)
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*([-*\u2022]|\d+[.)])\s+/, "").trim())
    .filter(Boolean)
    .join(" ");
  return cleaned.replace(/\s+/g, " ").trim();
};

const toBulletText = (value: string) => {
  const plain = toParagraphText(value);
  if (!plain) return "- Key point one\n- Key point two\n- Key point three";
  const chunks = plain
    .split(/[.;!?]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 4);
  if (chunks.length === 0) return "- Key point one\n- Key point two\n- Key point three";
  return chunks.map((chunk) => `- ${chunk}`).join("\n");
};

const applyEmailInstructionHints = ({
  template,
  instruction,
  current,
  brief,
}: {
  template: Record<string, unknown>;
  instruction: string;
  current: Record<string, unknown>;
  brief: Record<string, unknown>;
}) => {
  const next = deepClone(template) as Record<string, unknown>;
  let blocks = collectEmailBlocks(next);
  const lower = instruction.toLowerCase();
  const requestedTone = parseToneFromInstruction(instruction);
  const explicitHeading = parseHeadingTextFromInstruction(instruction);
  const addBlockTypes = new Set(extractRequestedAddBlockTypes(instruction));
  const removeBlockTypes = new Set(extractRequestedRemoveBlockTypes(instruction));
  const additionalSectionTopic = parseAdditionalSectionTopicFromInstruction(instruction);
  const explicitQuoteText = parseQuoteTextFromInstruction(instruction);
  const wantsParagraphs = isParagraphRequest(instruction);
  const wantsBullets = isBulletRequest(instruction);
  const wantsMoreInfo = isMoreInfoRequest(instruction);
  const wantsTimelineOrRoi = isTimelineOrRoiRequest(instruction);
  const wantsShorter = /\bshorter|shorten|more concise|condense\b/.test(lower);
  const wantsLonger = /\blonger|expand|elaborate\b/.test(lower);
  const explicitCtaText = parseButtonTextFromInstruction(instruction) || pickString(brief.cta || "");
  const explicitUrl = parseUrlFromInstruction(instruction);
  const noCta = hasNoCtaRequest(instruction);
  const requestedColor = resolveColorToken(instruction);
  const asksPaletteChange = /\b(color|colour|palette|accent)\b/.test(lower);
  const removeButtonRequest = noCta || removeBlockTypes.has("button");

  if (requestedTone) {
    next.voice = requestedTone;
  } else if (typeof brief.tone === "string" && brief.tone.trim()) {
    next.voice = brief.tone.trim();
  }

  if (removeBlockTypes.size > 0 || noCta) {
    blocks = blocks.filter((block) => {
      const type = pickString(block.type || "text").toLowerCase();
      if (type === "button" && noCta) return false;
      return !removeBlockTypes.has(type);
    });
  }

  if (explicitHeading) {
    const headingBlock = blocks.find((block) => block.type === "heading");
    if (headingBlock) {
      headingBlock.content = {
        ...asObject(headingBlock.content),
        text: explicitHeading,
        html: `<b>${explicitHeading}</b>`,
      };
    } else {
      blocks.unshift(createEmailHeadingBlock(explicitHeading));
    }
  }

  if (wantsParagraphs) {
    for (const block of blocks) {
      if (block.type !== "text") continue;
      const text = pickString(asObject(block.content).text || "");
      if (!text) continue;
      const paragraph = toParagraphText(text);
      if (!paragraph) continue;
      block.content = {
        ...asObject(block.content),
        text: paragraph,
        html: toHtmlText(paragraph),
      };
    }
  }

  if (wantsBullets) {
    const target = blocks.find((block) => block.type === "text");
    if (target) {
      const text = pickString(asObject(target.content).text || "");
      const bullets = toBulletText(text);
      target.content = {
        ...asObject(target.content),
        text: bullets,
        html: toHtmlText(bullets),
      };
    }
  }

  if (wantsMoreInfo || wantsLonger) {
    const textBlocks = blocks.filter((block) => block.type === "text");
    const hasSufficientText = textBlocks.some((block) => pickString(asObject(block.content).text || "").length > 180);
    if (!hasSufficientText) {
      const topic = pickString(
        additionalSectionTopic || deriveTopicPhraseFromInstruction(instruction) || next.subject || brief.goal || "this campaign"
      ).toLowerCase();
      blocks.push(
        createEmailTextBlock(
          buildExpansionParagraph({
            topic,
            audience: pickString(brief.audience || next.audience || "your audience"),
            tone: pickString(next.voice || brief.tone || "Professional"),
          })
        )
      );
      if (wantsMoreInfo) {
        blocks.push(
          createEmailTextBlock(
            "It also outlines practical takeaways and a clear next step so readers can act immediately with confidence."
          )
        );
      }
    }
  }

  if (wantsTimelineOrRoi) {
    const hasTimelineText = blocks.some((block) => {
      if (block.type !== "text") return false;
      const text = pickString(asObject(block.content).text || "").toLowerCase();
      return text.includes("timeline") || text.includes("roi") || text.includes("90 day");
    });
    if (!hasTimelineText) {
      blocks.push(
        createEmailTextBlock(
          "Implementation timeline: launch in week 1, optimize in weeks 2-4, and review measurable ROI by day 90."
        )
      );
    }
  }

  if (!removeButtonRequest && (explicitCtaText || /\bcta|button\b/.test(lower) || pickString(brief.cta || ""))) {
    let buttonBlocks = blocks.filter((block) => block.type === "button");
    if (buttonBlocks.length === 0) {
      blocks.push(
        createEmailButtonBlock({
          cta: explicitCtaText || pickString(brief.cta || "Learn more"),
          url: explicitUrl || "#",
        })
      );
      buttonBlocks = blocks.filter((block) => block.type === "button");
    }

    for (const block of buttonBlocks) {
      block.content = {
        ...asObject(block.content),
        text: explicitCtaText || pickString(asObject(block.content).text || brief.cta || "Learn more"),
        url: explicitUrl || pickString(asObject(block.content).url || "#"),
      };
    }
  }

  if (requestedColor && asksPaletteChange) {
    for (const block of blocks) {
      if (block.type === "button") {
        block.content = {
          ...asObject(block.content),
          bgColor: requestedColor,
          textColor: requestedColor === "#111827" ? "#ffffff" : pickString(asObject(block.content).textColor || "#ffffff"),
        };
      }
      if (block.type === "heading") {
        block.styles = {
          ...asObject(block.styles),
          color: requestedColor,
        };
      }
    }
  }

  if (isEditInstruction(instruction) && !hasExplicitSubjectInstruction(instruction)) {
    const previousSubject = pickString(asObject((current as any)?.template).subject || brief.subject || "");
    const currentSubject = pickString(next.subject || "");
    if (previousSubject && (!currentSubject || isGenericSubject(currentSubject) || looksLikeInstructionText(currentSubject))) {
      next.subject = previousSubject;
    }
  }

  const heading = blocks.find((block) => block.type === "heading");
  if (heading) {
    const headingText = pickString(asObject(heading.content).text || "");
    if (looksLikeInstructionText(headingText)) {
      const fallbackHeading = pickString(next.subject || "Campaign Update");
      heading.content = {
        ...asObject(heading.content),
        text: fallbackHeading,
        html: `<b>${fallbackHeading}</b>`,
      };
    }
  }

  if (wantsShorter) {
    let shortenedAny = false;
    for (const block of blocks) {
      if (block.type !== "text") continue;
      const text = pickString(asObject(block.content).text || "");
      if (!text) continue;
      const shortened = shortenEmailText(text, 1, 140);
      if (!shortened || shortened === text) continue;
      block.content = {
        ...asObject(block.content),
        text: shortened,
        html: toHtmlText(shortened),
      };
      shortenedAny = true;
    }

    if (!shortenedAny) {
      const firstTextBlock = blocks.find((block) => block.type === "text");
      if (firstTextBlock) {
        const currentText = pickString(asObject(firstTextBlock.content).text || "");
        const shortened = shortenEmailText(currentText, 1, 140);
        firstTextBlock.content = {
          ...asObject(firstTextBlock.content),
          text: shortened,
          html: toHtmlText(shortened),
        };
      }
    }
  }

  if (additionalSectionTopic) {
    const normalizedTopic = normalizeText(additionalSectionTopic).toLowerCase();
    const alreadyHasTopic = blocks.some((block) => {
      const content = asObject(block.content);
      const plain = stripHtmlToPlainText(pickString(content.text || content.html || "")).toLowerCase();
      return plain.includes(normalizedTopic);
    });
    if (!alreadyHasTopic) {
      const extraBlocks = [
        createEmailHeadingBlock(additionalSectionTopic),
        createEmailTextBlock(
          buildExpansionParagraph({
            topic: additionalSectionTopic,
            audience: pickString(brief.audience || next.audience || "your audience"),
            tone: pickString(next.voice || brief.tone || "Professional"),
          })
        ),
      ];
      insertBlocksBeforeTail(blocks, extraBlocks);
    }
  }

  if (explicitQuoteText) {
    const quoteBlock = blocks.find((block) => block.type === "quote");
    if (quoteBlock) {
      quoteBlock.content = {
        ...asObject(quoteBlock.content),
        text: explicitQuoteText,
        html: toHtmlText(explicitQuoteText),
      };
    }
  }

  for (const type of addBlockTypes) {
    if (type === "button" && blocks.some((block) => block.type === "button")) continue;
    if (type !== "button" && blocks.some((block) => block.type === type)) continue;
    if (type === "button" && removeButtonRequest) continue;
    const newBlock = buildRequestedBlock({
      type,
      instruction,
      brief,
      template: next,
    });
    insertBlocksBeforeTail(blocks, [newBlock]);
  }

  if (removeButtonRequest) {
    blocks = blocks.filter((block) => block.type !== "button");
  }

  next.blocks = blocks;
  return normalizeEmailResult(next, brief, instruction);
};

const enforceEditContinuity = ({
  candidate,
  current,
  brief,
  instruction,
  requirements,
}: {
  candidate: Record<string, unknown>;
  current: Record<string, unknown>;
  brief: Record<string, unknown>;
  instruction: string;
  requirements: EmailPromptRequirements;
}) => {
  if (!requirements.wantsEditExisting || !hasCurrentTemplateContext(current)) return candidate;

  const currentTemplate = extractCurrentEmailTemplate(current, brief);
  if (!currentTemplate) return candidate;

  const currentBlocks = collectEmailBlocks(currentTemplate);
  const candidateBlocks = collectEmailBlocks(candidate);
  const overlapScore = computeBlockTypeOverlapScore(currentBlocks, candidateBlocks);
  const candidateTooSparse = candidateBlocks.length < Math.max(2, Math.floor(currentBlocks.length * 0.55));
  const lowOverlap = overlapScore < 0.45;
  const targetedEdit = isTargetedEditInstruction(instruction, requirements);

  let next = deepClone(candidate) as Record<string, unknown>;
  if (isLightweightVisualEditRequest(instruction, requirements)) {
    next = deepClone(currentTemplate) as Record<string, unknown>;
    const fallbackReasoning = pickString(next.reasoning || "");
    next.reasoning = [fallbackReasoning, "Preserved existing layout for additive visual edit request."]
      .filter(Boolean)
      .join(" ");
    const requestedImageDescriptor = extractRequestedImageDescriptor(instruction);
    if (requestedImageDescriptor) {
      next = upsertRequestedImageBlock(next, requestedImageDescriptor, brief, instruction);
    }
  } else if (targetedEdit && !candidateTooSparse && !lowOverlap && candidateBlocks.length > 0) {
    next = mergeTargetedEditCandidateIntoCurrent({
      currentTemplate,
      candidate,
      instruction,
      brief,
      requirements,
    });
  } else if (candidateBlocks.length === 0 || candidateTooSparse || lowOverlap) {
    next = deepClone(currentTemplate) as Record<string, unknown>;
    const fallbackReasoning = pickString(next.reasoning || "");
    next.reasoning = [fallbackReasoning, "Preserved existing layout because this is an edit request."]
      .filter(Boolean)
      .join(" ");
  }

  if (!hasExplicitSubjectInstruction(instruction)) {
    const previousSubject = pickString(asObject((current as any)?.template).subject || currentTemplate.subject || "");
    if (previousSubject) next.subject = previousSubject;
  }
  const previousName = pickString(asObject((current as any)?.template).name || currentTemplate.name || "");
  if (previousName) next.name = previousName;

  const actionItems = extractActionItemsFromInstruction(instruction);
  if (actionItems.length > 0) {
    next = upsertActionItemsSection(next, actionItems);
  }

  next = applyEmailInstructionHints({
    template: next,
    instruction,
    current,
    brief,
  });

  return normalizeEmailResult(next, brief, instruction);
};

const enforceEmailPromptRequirements = ({
  template,
  requirements,
  brief,
  instruction,
}: {
  template: Record<string, unknown>;
  requirements: EmailPromptRequirements;
  brief: Record<string, unknown>;
  instruction: string;
}) => {
  const next = deepClone(template) as Record<string, unknown>;
  const blocks = collectEmailBlocks(next);

  if (requirements.explicitSubject) {
    next.subject = requirements.explicitSubject;
  }

  const ensureType = (type: string) => {
    if (blocks.some((block) => block.type === type)) return;
    if (type === "image") {
      blocks.push(createEmailImageBlock());
      return;
    }
    if (type === "divider") {
      blocks.push(createEmailDividerBlock());
      return;
    }
    if (type === "quote") {
      blocks.push(createEmailQuoteBlock());
      return;
    }
    if (type === "social") {
      blocks.push(createEmailSocialBlock());
      return;
    }
    if (type === "table") {
      blocks.push(createEmailTableBlock());
      return;
    }
    if (type === "columns") {
      blocks.push(createEmailColumnsBlock());
      return;
    }
    if (type === "code") {
      blocks.push(createEmailCodeBlock());
      return;
    }
    if (type === "video") {
      blocks.push(createEmailVideoBlock());
      return;
    }
    if (type === "signature") {
      blocks.push(createEmailSignatureBlock());
      return;
    }
  };

  for (const type of requirements.requiredTypes) {
    ensureType(type);
  }

  const requestedImageDescriptor = extractRequestedImageDescriptor(instruction);
  if (requestedImageDescriptor && requirements.requiredTypes.includes("image")) {
    const updatedTemplate = upsertRequestedImageBlock({ ...next, blocks }, requestedImageDescriptor, brief, instruction);
    blocks = collectEmailBlocks(updatedTemplate);
    next.blocks = blocks;
    next.reasoning = pickString(updatedTemplate.reasoning || next.reasoning || "");
  }

  const imageCount = blocks.filter((block) => block.type === "image").length;
  if (requirements.bannerCount > imageCount) {
    for (let i = imageCount + 1; i <= requirements.bannerCount; i += 1) {
      blocks.push(createEmailImageBlock(i));
      blocks.push(
        createEmailHeadingBlock(
          requirements.wantsNewsletter ? `Newsletter Banner ${i}` : `Banner Section ${i}`
        )
      );
      blocks.push(
        createEmailTextBlock(
          requirements.wantsNewsletter
            ? `Banner ${i} highlights this week's key update for ${pickString(brief.audience || "your audience")}.`
            : `Banner ${i} supports the primary message with concise supporting copy.`
        )
      );
    }
  }

  if (requirements.noCta) {
    for (let i = blocks.length - 1; i >= 0; i -= 1) {
      if (blocks[i].type === "button") blocks.splice(i, 1);
    }
  } else if (requirements.ctaRequired) {
    let buttonBlocks = blocks.filter((block) => block.type === "button");
    if (buttonBlocks.length === 0) {
      blocks.push(
        createEmailButtonBlock({
          cta: requirements.explicitCtaText || pickString(brief.cta || "Get Started"),
          url: requirements.explicitUrl,
          color: requirements.requestedColor,
        })
      );
      buttonBlocks = blocks.filter((block) => block.type === "button");
    }
    for (const button of buttonBlocks) {
      button.content = {
        ...asObject(button.content),
        text: requirements.explicitCtaText || pickString(asObject(button.content).text || "Get Started"),
        url: requirements.explicitUrl || pickString(asObject(button.content).url || "#"),
        bgColor: requirements.requestedColor || pickString(asObject(button.content).bgColor || "#2a9d6e"),
        textColor: pickString(asObject(button.content).textColor || "#ffffff"),
      };
    }
  }

  if (!requirements.wantsImageReferenceTemplate && !blocks.some((block) => block.type === "heading")) {
    blocks.unshift(
      createEmailHeadingBlock(
        requirements.wantsNewsletter ? "Newsletter Highlights" : "Campaign Update"
      )
    );
  }

  if (
    !requirements.wantsImageReferenceTemplate &&
    requirements.explicitBlockCount > 0 &&
    blocks.length < requirements.requestedBlockCount
  ) {
    while (blocks.length < requirements.requestedBlockCount) {
      blocks.push(
        createEmailTextBlock(
          requirements.wantsNewsletter
            ? "Additional insight: include a practical takeaway your audience can apply this week."
            : "Additional detail: expand this section with outcome-focused messaging."
        )
      );
    }
  }

  const normalizedInstruction = normalizeText(instruction).toLowerCase();
  const firstText = blocks.find((block) => block.type === "text");
  if (firstText) {
    const text = pickString(asObject(firstText.content).text || "");
    if (text && normalizeText(text).toLowerCase() === normalizedInstruction) {
      const improved = requirements.wantsNewsletter
        ? `This newsletter edition is tailored for ${pickString(brief.audience || "your audience")} with focused updates and clear actions.`
        : "This message focuses on a clear value proposition and a concrete next step.";
      firstText.content = {
        ...asObject(firstText.content),
        text: improved,
        html: toHtmlText(improved),
      };
    }
  }

  if (requirements.wantsParagraphs) {
    for (const block of blocks) {
      if (block.type !== "text") continue;
      const text = pickString(asObject(block.content).text || "");
      if (!text) continue;
      const paragraph = toParagraphText(text);
      if (!paragraph) continue;
      block.content = {
        ...asObject(block.content),
        text: paragraph,
        html: toHtmlText(paragraph),
      };
    }
  }

  if (requirements.wantsBullets) {
    const firstTextBlock = blocks.find((block) => block.type === "text");
    if (firstTextBlock) {
      const text = pickString(asObject(firstTextBlock.content).text || "");
      const bullets = toBulletText(text);
      firstTextBlock.content = {
        ...asObject(firstTextBlock.content),
        text: bullets,
        html: toHtmlText(bullets),
      };
    } else {
      blocks.push(createEmailTextBlock("- Key point one\n- Key point two\n- Key point three"));
    }
  }

  if (requirements.wantsTimelineOrRoi) {
    const hasTimelineText = blocks.some((block) => {
      if (block.type !== "text") return false;
      const text = pickString(asObject(block.content).text || "").toLowerCase();
      return text.includes("timeline") || text.includes("roi") || text.includes("90 day");
    });
    if (!hasTimelineText) {
      blocks.push(
        createEmailTextBlock(
          "Implementation timeline: launch in week 1, optimize in weeks 2-4, and review measurable ROI by day 90."
        )
      );
    }
  }

  if (requirements.wantsMoreInfo) {
    const textBlocks = blocks.filter((block) => block.type === "text");
    const totalTextChars = textBlocks.reduce(
      (total, block) => total + pickString(asObject(block.content).text || "").length,
      0
    );
    if (textBlocks.length < 2 || totalTextChars < 220) {
      blocks.push(
        createEmailTextBlock(
          "Additional context: include why this matters now, what outcome to expect, and how to implement the recommendation quickly."
        )
      );
    }
  }

  const textBlocks = blocks.filter((block) => block.type === "text");
  const textChars = textBlocks.reduce(
    (total, block) => total + pickString(asObject(block.content).text || "").length,
    0
  );
  const audience = pickString(brief.audience || next.audience || "your audience");
  if (textBlocks.length === 0 || textChars < 90) {
    const intro = deriveEmailIntroFromInstruction(instruction, audience);
    blocks.push(createEmailTextBlock(intro));
  }
  const requiresDepth = requirements.wantsAttractive || requirements.explicitBlockCount >= 6 || requirements.wantsMoreInfo;
  const refreshedTextBlocks = blocks.filter((block) => block.type === "text");
  const refreshedChars = refreshedTextBlocks.reduce(
    (total, block) => total + pickString(asObject(block.content).text || "").length,
    0
  );
  if (requiresDepth && (refreshedTextBlocks.length < 2 || refreshedChars < 180)) {
    const topic = deriveTopicPhraseFromInstruction(instruction) || pickString(next.subject || "this topic");
    blocks.push(
      createEmailTextBlock(
        `Key context: ${topic}. Provide concise facts, why it matters now, and the practical implication for ${audience}.`
      )
    );
  }

  const topicKeywords = extractInstructionKeywords(instruction);
  if (topicKeywords.length >= 2 && !requirements.wantsImageReferenceTemplate) {
    const templateSnapshot = { ...next, blocks } as Record<string, unknown>;
    const corpus = collectResultText(templateSnapshot);
    const matched = topicKeywords.filter((token) => corpus.includes(token));
    if (matched.length < Math.min(2, topicKeywords.length)) {
      const topicPhrase = deriveTopicPhraseFromInstruction(instruction) || topicKeywords.join(" ");
      const topicalText =
        `Topic focus: ${topicPhrase}. Include concrete developments, audience impact, and one clear next action.`;
      blocks.push(createEmailTextBlock(topicalText));
      if (!requirements.explicitSubject) {
        next.subject = deriveSubjectFromInstruction(instruction, pickString(next.subject || brief.subject || "Campaign Update"));
      }
    }
  }

  if (requirements.wantsAttractive) {
    const paletteSurface = "#f8fbff";
    const paletteSurfaceAlt = "#eef6ff";
    for (const block of blocks) {
      const baseStyles = asObject(block.styles);
      block.styles = {
        ...baseStyles,
        padding: pickString(baseStyles.padding || "18px"),
        borderRadius: pickString(baseStyles.borderRadius || "14px"),
        backgroundColor: pickString(
          baseStyles.backgroundColor ||
            (block.type === "heading" || block.type === "button" ? paletteSurfaceAlt : paletteSurface)
        ),
      };
      if (block.type === "button") {
        block.content = {
          ...asObject(block.content),
          align: pickString(asObject(block.content).align || "center"),
          bgColor: requirements.requestedColor || pickString(asObject(block.content).bgColor || "#2563eb"),
          textColor: pickString(asObject(block.content).textColor || "#ffffff"),
          borderRadius: pickString(asObject(block.content).borderRadius || "999px"),
          buttonPadding: pickString(asObject(block.content).buttonPadding || "12px 28px"),
        };
      }
    }
  }

  next.blocks = blocks;
  return normalizeEmailResult(next, brief, instruction);
};

const evaluateEmailQuality = ({
  result,
  requirements,
  instruction,
  current,
}: {
  result: Record<string, unknown>;
  requirements: EmailPromptRequirements;
  instruction: string;
  current?: Record<string, unknown>;
}): EmailQualityReport => {
  const met: string[] = [];
  const unmet: string[] = [];
  const blocks = collectEmailBlocks(result);

  const check = (condition: boolean, success: string, fail: string) => {
    if (condition) met.push(success);
    else unmet.push(fail);
  };

  if (!requirements.wantsImageReferenceTemplate && requirements.explicitBlockCount > 0) {
    check(
      blocks.length >= requirements.requestedBlockCount,
      `block_count>=${requirements.requestedBlockCount}`,
      `block_count<${requirements.requestedBlockCount}`
    );
  }

  if (requirements.explicitSubject) {
    check(
      equalsNormalized(pickString(result.subject || ""), requirements.explicitSubject),
      "subject_exact_match",
      "subject_not_matched"
    );
  }

  const buttonBlocks = blocks.filter((block) => block.type === "button");
  if (requirements.noCta) {
    check(buttonBlocks.length === 0, "cta_removed", "cta_present_but_not_requested");
  } else if (requirements.ctaRequired) {
    check(buttonBlocks.length > 0, "cta_present", "cta_missing");
    if (requirements.explicitCtaText) {
      check(
        buttonBlocks.some((block) =>
          equalsNormalized(pickString(asObject(block.content).text || ""), requirements.explicitCtaText)
        ),
        "cta_text_exact_match",
        "cta_text_not_matched"
      );
    }
    if (requirements.explicitUrl) {
      check(
        buttonBlocks.some((block) =>
          equalsNormalized(pickString(asObject(block.content).url || ""), requirements.explicitUrl)
        ),
        "cta_url_exact_match",
        "cta_url_not_matched"
      );
    }
  }

  if (requirements.bannerCount > 0) {
    const imageBlocks = blocks.filter((block) => block.type === "image");
    check(
      imageBlocks.length >= requirements.bannerCount,
      `banner_count>=${requirements.bannerCount}`,
      `banner_count<${requirements.bannerCount}`
    );
  }

  for (const type of requirements.requiredTypes) {
    check(
      blocks.some((block) => block.type === type),
      `${type}_present`,
      `${type}_missing`
    );
  }

  const firstText = blocks.find((block) => block.type === "text");
  const firstTextValue = pickString(asObject(firstText?.content).text || "");
  const promptEcho =
    firstTextValue &&
    normalizeText(firstTextValue).toLowerCase() === normalizeText(instruction).toLowerCase();
  check(!promptEcho, "content_not_prompt_echo", "content_echoed_prompt");

  const textBlocks = blocks.filter((block) => block.type === "text");
  const totalTextChars = textBlocks.reduce(
    (total, block) => total + pickString(asObject(block.content).text || "").length,
    0
  );
  if (!requirements.wantsShorter) {
    check(textBlocks.length >= 1 && totalTextChars >= 90, "core_copy_present", "core_copy_missing");
  }
  if (requirements.wantsAttractive || requirements.explicitBlockCount >= 6 || requirements.wantsMoreInfo) {
    check(textBlocks.length >= 2 && totalTextChars >= 180, "depth_copy_present", "depth_copy_missing");
  }

  const instructionKeywords = extractInstructionKeywords(instruction);
  if (instructionKeywords.length >= 2 && !requirements.wantsImageReferenceTemplate) {
    const corpus = collectResultText(result);
    const matchedKeywords = instructionKeywords.filter((token) => corpus.includes(token));
    check(
      matchedKeywords.length >= Math.min(2, instructionKeywords.length),
      "topic_alignment_present",
      "topic_alignment_missing"
    );
  }

  if (requirements.wantsParagraphs) {
    const nonParagraphText = blocks.some((block) => {
      if (block.type !== "text") return false;
      const text = pickString(asObject(block.content).text || "");
      return /^\s*([-*\u2022]|\d+[.)])\s+/.test(text);
    });
    check(!nonParagraphText, "paragraph_format_applied", "paragraph_format_not_applied");
  }

  if (requirements.wantsBullets) {
    const hasBullets = blocks.some((block) => {
      if (block.type !== "text") return false;
      const text = pickString(asObject(block.content).text || "");
      return /^\s*([-*\u2022]|\d+[.)])\s+/m.test(text);
    });
    check(hasBullets, "bullet_format_applied", "bullet_format_not_applied");
  }

  if (requirements.wantsTimelineOrRoi) {
    const hasTimeline = blocks.some((block) => {
      if (block.type !== "text") return false;
      const text = pickString(asObject(block.content).text || "").toLowerCase();
      return text.includes("timeline") || text.includes("roi") || text.includes("90 day");
    });
    check(hasTimeline, "timeline_roi_present", "timeline_roi_not_present");
  }

  if (requirements.wantsMoreInfo) {
    check(textBlocks.length >= 2 && totalTextChars >= 220, "detail_depth_sufficient", "detail_depth_insufficient");
  }

  if (requirements.wantsEditExisting && !requirements.explicitSubject && current) {
    const previousSubject = pickString(asObject((current as any)?.template).subject || "");
    if (previousSubject) {
      check(
        equalsNormalized(pickString(result.subject || ""), previousSubject),
        "subject_preserved_for_edit",
        "subject_changed_unexpectedly"
      );
    }
  }

  const totalChecks = met.length + unmet.length;
  const score = totalChecks > 0 ? Math.round((met.length / totalChecks) * 100) : 100;
  return { score, totalChecks, met, unmet };
};

const isCriticalEmailQualityMiss = (item: string, requirements: EmailPromptRequirements) => {
  if (item === "content_echoed_prompt") return true;
  if (item === "subject_not_matched") return Boolean(requirements.explicitSubject);
  if (item === "subject_changed_unexpectedly") return requirements.wantsEditExisting && !requirements.explicitSubject;
  if (item === "paragraph_format_not_applied") return requirements.wantsParagraphs;
  if (item === "bullet_format_not_applied") return requirements.wantsBullets;
  if (item === "timeline_roi_not_present") return requirements.wantsTimelineOrRoi;
  if (item === "detail_depth_insufficient") return requirements.wantsMoreInfo;
  if (item === "cta_present_but_not_requested") return requirements.noCta;
  if (item === "cta_missing") return requirements.ctaRequired;
  if (item === "cta_text_not_matched") return Boolean(requirements.explicitCtaText);
  if (item === "cta_url_not_matched") return Boolean(requirements.explicitUrl);
  if (item.startsWith("banner_count<")) return requirements.bannerCount > 0;
  if (item.startsWith("block_count<")) return requirements.explicitBlockCount > 0;
  if (item.endsWith("_missing")) {
    const type = item.replace(/_missing$/, "");
    return requirements.requiredTypes.includes(type);
  }
  return false;
};

const pluralize = (count: number, singular: string, plural = `${singular}s`) =>
  count === 1 ? singular : plural;

const buildAssistantSuggestions = ({
  result,
  brief,
  requirements,
}: {
  result: Record<string, unknown>;
  brief: Record<string, unknown>;
  requirements: EmailPromptRequirements;
}) => {
  const blocks = collectEmailBlocks(result);
  const textBlocks = blocks.filter((block) => block.type === "text");
  const hasImage = blocks.some((block) => block.type === "image");
  const hasButton = blocks.some((block) => block.type === "button");
  const voice = pickString(result.voice || brief.tone || "professional").toLowerCase();
  const suggestions: string[] = [];

  if (textBlocks.length < 3) {
    suggestions.push("expand the body copy while keeping the same structure");
  }
  if (!hasImage) {
    suggestions.push("add a stronger hero visual, logo, or supporting image");
  }
  if (hasButton) {
    suggestions.push(`rewrite the CTA to sound more ${voice} and persuasive`);
  }
  if (requirements.wantsEditExisting) {
    suggestions.push("make another targeted change section by section with a follow-up prompt");
  } else {
    suggestions.push("generate a second version with a different tone or structure");
  }

  return Array.from(new Set(suggestions)).slice(0, 3);
};

const buildAssistantReply = ({
  instruction,
  result,
  current,
  brief,
  references,
  requirements,
  deterministicReason,
}: {
  instruction: string;
  result: Record<string, unknown>;
  current: Record<string, unknown>;
  brief: Record<string, unknown>;
  references: Array<Record<string, unknown>>;
  requirements: EmailPromptRequirements;
  deterministicReason: string;
}) => {
  const blocks = collectEmailBlocks(result);
  const currentTemplate = hasCurrentTemplateContext(current) ? extractCurrentEmailTemplate(current, brief) : null;
  const previousBlocks = currentTemplate ? collectEmailBlocks(currentTemplate) : [];
  const heading = blocks.find((block) => block.type === "heading");
  const button = blocks.find((block) => block.type === "button");
  const textBlocks = blocks.filter((block) => block.type === "text");
  const totalTextChars = textBlocks.reduce(
    (total, block) => total + pickString(asObject(block.content).text || "").length,
    0
  );
  const imageCount = blocks.filter((block) => block.type === "image").length;
  const previousImageCount = previousBlocks.filter((block) => block.type === "image").length;
  const requestedImageDescriptor = extractRequestedImageDescriptor(instruction);
  const suggestions = buildAssistantSuggestions({ result, brief, requirements });
  const changes: string[] = [];
  const lines: string[] = [];

  if (requirements.wantsEditExisting && currentTemplate) {
    lines.push("I updated your current template and kept the thread context attached.");
  } else {
    lines.push("I created a new draft from your prompt and brief.");
  }

  const subject = pickString(result.subject || "");
  if (subject) {
    const previousSubject = pickString(currentTemplate?.subject || "");
    if (previousSubject && equalsNormalized(subject, previousSubject)) {
      changes.push(`Kept the subject line: "${subject}"`);
    } else {
      changes.push(`Set the subject line to: "${subject}"`);
    }
  }

  const headingText = pickString(asObject(heading?.content).text || "");
  if (headingText) {
    changes.push(`Primary heading: ${headingText}`);
  }

  const buttonText = pickString(asObject(button?.content).text || "");
  if (buttonText) {
    changes.push(`CTA: ${buttonText}`);
  }

  if (requestedImageDescriptor && imageCount > 0) {
    changes.push(`Updated the visual block to: ${formatRequestedImageLabel(requestedImageDescriptor)}`);
  } else if (imageCount > previousImageCount) {
    const added = imageCount - previousImageCount;
    changes.push(`Added ${added} ${pluralize(added, "image block")} to strengthen the layout`);
  } else if (imageCount > 0) {
    changes.push(`The draft now includes ${imageCount} ${pluralize(imageCount, "visual block")}`);
  }

  if (textBlocks.length > 0) {
    changes.push(
      `Copy depth: ${textBlocks.length} ${pluralize(textBlocks.length, "text section")} and about ${totalTextChars} characters of body copy`
    );
  }

  if (references.length > 0) {
    changes.push(`Reused ${references.length} relevant ${pluralize(references.length, "reference")} from your saved/thread context`);
  }

  if (changes.length > 0) {
    lines.push("What I changed:");
    lines.push(...changes.map((item) => `- ${item}`));
  }

  const explanation = pickString(result.reasoning || deterministicReason || "");
  if (explanation) {
    lines.push("Why this direction:");
    lines.push(explanation);
  }

  if (suggestions.length > 0) {
    lines.push("Next, I can:");
    lines.push(...suggestions.map((item) => `- ${item}`));
  }

  return lines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 1800);
};

const alignEmailResultToPrompt = ({
  normalized,
  instruction,
  brief,
}: {
  normalized: Record<string, unknown>;
  instruction: string;
  brief: Record<string, unknown>;
}) => {
  const lowerInstruction = instruction.toLowerCase();
  const asksNewsletter = /newsletter|digest|bulletin/.test(lowerInstruction);
  const asksAttractive = /attractive|modern|beautiful|premium|polished|stylish/.test(lowerInstruction);
  const asksNoCta = /no cta|without cta|without button|no button/.test(lowerInstruction);
  const requestedBlockCount = inferRequestedBlockCount(instruction);
  const explicitSubject = parseSubjectFromInstruction(instruction);
  const explicitButtonText = parseButtonTextFromInstruction(instruction);
  const explicitUrl = parseUrlFromInstruction(instruction);
  const requestedColor = resolveColorToken(instruction) || "#2a9d6e";

  const template = deepClone(normalized) as Record<string, unknown>;
  const blocks = collectEmailBlocks(template);

  const audience = pickString(brief.audience || template.audience || "your audience");
  const goal = pickString(brief.goal || template.goal || "engagement");
  const offer = pickString(brief.offer || "");
  const cta = pickString(explicitButtonText || brief.cta || "Get Started");

  template.audience = audience;
  template.goal = goal;
  template.voice = pickString(brief.tone || template.voice || "Professional");
  template.name = pickString(template.name || "AI Email Template");

  if (explicitSubject) {
    template.subject = explicitSubject;
  } else if (isGenericSubject(pickString(template.subject || ""))) {
    if (asksNewsletter) {
      template.subject = offer ? `${offer} - Weekly Newsletter` : "Weekly newsletter highlights";
    } else {
      template.subject = offer || `A tailored ${goal.toLowerCase()} email`;
    }
  }

  if (!hasEmailBlockType(blocks, "heading")) {
    blocks.unshift(createEmailHeadingBlock(asksNewsletter ? "Newsletter Highlights" : "A message for your audience"));
  }

  const headingBlock = blocks.find((block) => block.type === "heading");
  if (headingBlock && isGenericHeading(pickString(asObject(headingBlock.content).text || ""))) {
    const subjectBasedHeading = pickString(
      explicitSubject || template.subject || deriveSubjectFromInstruction(instruction, pickString(brief.subject || "Campaign Update"))
    );
    headingBlock.content = {
      ...asObject(headingBlock.content),
      text: asksNewsletter ? "Newsletter Highlights" : subjectBasedHeading,
      html: asksNewsletter ? "<b>Newsletter Highlights</b>" : `<b>${subjectBasedHeading}</b>`,
    };
  }

  if (!hasEmailBlockType(blocks, "text")) {
    blocks.push(
      createEmailTextBlock(
        asksNewsletter
          ? `Welcome to this newsletter update focused on ${goal.toLowerCase()} for ${audience}.`
          : `This email is tailored for ${audience} and focuses on ${goal.toLowerCase()}.`
      )
    );
  }

  const firstTextBlock = blocks.find((block) => block.type === "text");
  if (firstTextBlock) {
    const existingText = pickString(asObject(firstTextBlock.content).text || "");
    const normalizedInstruction = normalizeText(instruction).toLowerCase();
    if (!existingText || normalizeText(existingText).toLowerCase() === normalizedInstruction) {
      const intro = asksNewsletter
        ? `In this edition, we cover practical insights for ${audience}, key takeaways, and clear next steps you can use immediately.`
        : `This draft is tailored for ${audience} with a clear value proposition and an actionable next step.`;
      firstTextBlock.content = {
        ...asObject(firstTextBlock.content),
        text: intro,
        html: toHtmlText(intro),
      };
    }
  }

  if (asksNewsletter && blocks.length < requestedBlockCount) {
    if (!hasEmailBlockType(blocks, "divider")) {
      blocks.push(createEmailDividerBlock());
    }

    const newsletterSections = [
      `Top story: A focused update that helps ${audience} improve ${goal.toLowerCase()} this week.`,
      `Why it matters: The approach is practical, measurable, and designed to remove friction for your team.`,
      `Quick action plan: Start with one small change, measure impact, and expand what works.`,
      `Pro tip: Keep messaging specific, outcome-driven, and consistent with your brand voice.`,
    ];

    for (const paragraph of newsletterSections) {
      if (blocks.length >= requestedBlockCount - 2) break;
      blocks.push(createEmailTextBlock(paragraph));
    }
  }

  if (!asksNoCta) {
    const buttonBlocks = blocks.filter((block) => block.type === "button");
    if (buttonBlocks.length === 0) {
      blocks.push(createEmailButtonBlock({ cta, url: explicitUrl, color: requestedColor }));
    } else {
      for (const block of buttonBlocks) {
        block.content = {
          ...asObject(block.content),
          text: cta,
          url: explicitUrl || pickString(asObject(block.content).url || "#"),
          bgColor: requestedColor,
          textColor: "#ffffff",
        };
      }
    }
  } else {
    for (let i = blocks.length - 1; i >= 0; i -= 1) {
      if (blocks[i].type === "button") blocks.splice(i, 1);
    }
  }

  const wantsImage = /\bimage|banner|hero image|illustration|visual\b/.test(lowerInstruction);
  const wantsQuote = /\bquote|testimonial\b/.test(lowerInstruction);
  const wantsSocial = /\bsocial|linkedin|twitter|facebook|instagram\b/.test(lowerInstruction);
  const wantsTable = /\btable|pricing table|comparison\b/.test(lowerInstruction);
  const wantsColumns = /\bcolumns|two column|multi column\b/.test(lowerInstruction);
  const wantsCode = /\bcode|snippet|html code\b/.test(lowerInstruction);

  if (wantsImage && !hasEmailBlockType(blocks, "image")) {
    blocks.push({
      id: crypto.randomUUID(),
      type: "image",
      content: {
        src: "https://placehold.co/1200x500?text=Newsletter+Banner",
        alt: "Newsletter banner",
        width: "100%",
      },
      styles: { padding: "16px" },
    });
  }

  if (wantsQuote && !hasEmailBlockType(blocks, "quote")) {
    blocks.push({
      id: crypto.randomUUID(),
      type: "quote",
      content: {
        text: "Great messaging is clear, specific, and useful.",
        html: "Great messaging is <b>clear, specific, and useful</b>.",
      },
      styles: { padding: "16px" },
    });
  }

  if (wantsSocial && !hasEmailBlockType(blocks, "social")) {
    blocks.push({
      id: crypto.randomUUID(),
      type: "social",
      content: {
        links: [
          { platform: "LinkedIn", url: "#" },
          { platform: "X", url: "#" },
          { platform: "Website", url: "#" },
        ],
      },
      styles: { padding: "16px" },
    });
  }

  if (wantsTable && !hasEmailBlockType(blocks, "table")) {
    blocks.push({
      id: crypto.randomUUID(),
      type: "table",
      content: {
        data: [
          ["Plan", "Key Benefit"],
          ["Starter", "Fast setup"],
          ["Growth", "Advanced personalization"],
          ["Enterprise", "Security and scale"],
        ],
      },
      styles: { padding: "16px" },
    });
  }

  if (wantsColumns && !hasEmailBlockType(blocks, "columns")) {
    blocks.push({
      id: crypto.randomUUID(),
      type: "columns",
      content: {
        content: [
          { text: "Column 1: Key update and context." },
          { text: "Column 2: Action item and next step." },
        ],
      },
      styles: { padding: "16px" },
    });
  }

  if (wantsCode && !hasEmailBlockType(blocks, "code")) {
    blocks.push({
      id: crypto.randomUUID(),
      type: "code",
      content: {
        text: "<a href='#' style='color:#0f766e'>Call to action</a>",
      },
      styles: { padding: "16px" },
    });
  }

  if (!hasEmailBlockType(blocks, "signature")) {
    blocks.push(createEmailSignatureBlock());
  }

  while (blocks.length < requestedBlockCount) {
    blocks.push(createEmailTextBlock("Additional detail: tailor this section to your campaign objective and audience context."));
  }

  if (asksAttractive) {
    const cardA = "#f8fbff";
    const cardB = "#eef6ff";
    for (const block of blocks) {
      const baseStyles = asObject(block.styles);
      block.styles = {
        ...baseStyles,
        padding: pickString(baseStyles.padding || "18px"),
        borderRadius: pickString(baseStyles.borderRadius || "14px"),
        backgroundColor: pickString(
          baseStyles.backgroundColor ||
            (block.type === "heading" || block.type === "button" ? cardB : cardA)
        ),
      };
      if (block.type === "button") {
        block.content = {
          ...asObject(block.content),
          align: pickString(asObject(block.content).align || "center"),
          bgColor: requestedColor,
          textColor: "#ffffff",
          borderRadius: pickString(asObject(block.content).borderRadius || "999px"),
          buttonPadding: pickString(asObject(block.content).buttonPadding || "12px 28px"),
        };
      }
    }
  }

  template.blocks = blocks;
  template.reasoning = [
    pickString(template.reasoning || "AI draft generated."),
    "Post-processed to align block structure and content depth with user prompt.",
  ]
    .filter(Boolean)
    .join(" ");

  return normalizeEmailResult(template, brief, instruction);
};

const extractCurrentEmailTemplate = (current: Record<string, unknown>, brief: Record<string, unknown>) => {
  const template = asObject((current as any)?.template);
  const rawBlocks = coerceObjectArray(template?.blocks);
  if (rawBlocks.length === 0) return null;

  return {
    name: pickString(template?.name || brief.goal || "AI Email Draft"),
    subject: pickString(template?.subject || brief.goal || "Quick idea for your team"),
    audience: pickString(template?.audience || brief.audience || "All"),
    voice: pickString(template?.voice || brief.tone || "Professional"),
    goal: pickString(template?.goal || brief.goal || "Engagement"),
    format: "html",
    blocks: rawBlocks.map((block) => normalizeEmailBlock(block)),
    reasoning: "",
  };
};

const resolveUser = async (req: Request) => {
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) return null;
  const token = authHeader.slice(7).trim();
  if (!token) return null;

  // Prefer service-role verification (most reliable in Edge runtime).
  const adminResult = await admin.auth.getUser(token);
  if (!adminResult.error && adminResult.data?.user) {
    return adminResult.data.user;
  }

  // Fallback to anon-key verification path.
  const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await authClient.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user;
};

const resolveProvider = (
  requested: unknown,
  availability: { openai: boolean; claude: boolean }
): AiProvider => {
  const preferred = pickString(requested, "").toLowerCase();
  if (preferred === "claude" && availability.claude) return "claude";
  if (preferred === "openai" && availability.openai) return "openai";
  if (availability.openai) return "openai";
  if (availability.claude) return "claude";
  return "heuristic";
};

const resolveModel = ({
  provider,
  preference,
  explicitModel,
}: {
  provider: AiProvider;
  preference: string;
  explicitModel?: string;
}) => {
  const provided = pickString(explicitModel);
  if (provided) return provided;
  const pref = pickString(preference, "balanced").toLowerCase();

  if (provider === "claude") {
    if (pref === "cost") return ANTHROPIC_MODEL_COST;
    if (pref === "quality") return ANTHROPIC_MODEL_QUALITY;
    return ANTHROPIC_MODEL_BALANCED;
  }

  if (pref === "cost") return OPENAI_MODEL_COST;
  if (pref === "quality") return OPENAI_MODEL_QUALITY;
  return OPENAI_MODEL_BALANCED;
};

const requestOpenAIEmbedding = async (input: string, apiKey: string) => {
  const payload = {
    model: OPENAI_EMBEDDING_MODEL,
    input,
    dimensions: 1536,
  };
  const response = await fetchWithTimeout(
    `${OPENAI_BASE_URL}/embeddings`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
    AI_EMBEDDING_TIMEOUT_MS,
    "OpenAI embedding request"
  );
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof body?.error?.message === "string" ? body.error.message : "Embedding request failed";
    throw new Error(message);
  }
  const vector = body?.data?.[0]?.embedding;
  if (!Array.isArray(vector)) {
    throw new Error("Embedding response is invalid");
  }
  return vector as number[];
};

const toClaudeMessageContent = (content: unknown) => {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((item) => {
      if (!item || typeof item !== "object") return "";
      const row = item as Record<string, unknown>;
      if (typeof row.text === "string") return row.text;
      if (Array.isArray(row.content)) {
        return row.content
          .map((nested) => {
            if (!nested || typeof nested !== "object") return "";
            const nestedRow = nested as Record<string, unknown>;
            return typeof nestedRow.text === "string" ? nestedRow.text : "";
          })
          .join("\n");
      }
      return "";
    })
    .join("\n")
    .trim();
};

const compactContext = (value: unknown, maxChars = 1800) => {
  const raw = typeof value === "string" ? value : JSON.stringify(value ?? {});
  return normalizeText(raw).slice(0, maxChars);
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const fetchWithTimeout = async (
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs: number,
  timeoutLabel: string
) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    const isAbort = error instanceof DOMException && error.name === "AbortError";
    if (isAbort) {
      throw new Error(`${timeoutLabel} timeout after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
};

type ProviderRequestError = Error & {
  status?: number;
  provider?: "openai" | "claude";
  code?: string;
  requestId?: string;
};

const createProviderError = ({
  provider,
  status,
  body,
  requestId,
  fallbackMessage,
}: {
  provider: "openai" | "claude";
  status: number;
  body: Record<string, unknown>;
  requestId?: string;
  fallbackMessage: string;
}) => {
  const fromOpenAi = asObject(body?.error);
  const fromClaude = asObject(body?.error);
  const message = pickString(fromOpenAi?.message || fromClaude?.message || fallbackMessage);
  const code = pickString(fromOpenAi?.code || fromClaude?.type || fromClaude?.code || "");
  const error = new Error(message) as ProviderRequestError;
  error.status = status;
  error.provider = provider;
  error.code = code;
  error.requestId = pickString(requestId || "");
  return error;
};

const normalizeErrorMessage = (error: unknown) => {
  if (!error) return "Unknown provider error";
  if (error instanceof Error) {
    const requestId = pickString((error as ProviderRequestError)?.requestId || "");
    return requestId ? `${error.message || "Unknown provider error"} (request_id: ${requestId})` : (error.message || "Unknown provider error");
  }
  return String(error);
};

const isRetryableProviderError = (error: unknown) => {
  const candidate = error as ProviderRequestError;
  const status = Number(candidate?.status || 0);
  const message = normalizeErrorMessage(error).toLowerCase();
  const code = pickString(candidate?.code || "").toLowerCase();

  if ([408, 409, 425, 429, 500, 502, 503, 504, 529].includes(status)) return true;
  if (code.includes("overloaded") || code.includes("rate")) return true;
  if (message.includes("overloaded")) return true;
  if (message.includes("rate limit")) return true;
  if (message.includes("temporarily unavailable")) return true;
  if (message.includes("timeout")) return true;
  if (message.includes("try again")) return true;
  return false;
};

const withProviderRetry = async <T>(runner: () => Promise<T>, maxAttempts = 3): Promise<T> => {
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await runner();
    } catch (error) {
      lastError = error;
      const canRetry = isRetryableProviderError(error);
      if (!canRetry || attempt >= maxAttempts) {
        throw error;
      }

      const backoffMs = Math.min(1800, 250 * Math.pow(2, attempt - 1)) + Math.floor(Math.random() * 120);
      await sleep(backoffMs);
    }
  }

  throw lastError;
};

const toOpenAiMessageContent = (content: unknown) => {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((item) => {
      if (typeof item === "string") return item;
      if (item && typeof item === "object" && typeof (item as Record<string, unknown>).text === "string") {
        return String((item as Record<string, unknown>).text);
      }
      return "";
    }).join("\n");
  }
  return "";
};

const requestOpenAICompletion = async ({
  model,
  systemPrompt,
  userPrompt,
  mode,
  apiKey,
  images,
}: {
  model: string;
  systemPrompt: string;
  userPrompt: string;
  mode: AiMode;
  apiKey: string;
  images: InputImage[];
}) => {
  const userContent =
    images.length > 0
      ? [
          {
            type: "text",
            text: userPrompt,
          },
          ...images.map((image) => ({
            type: "image_url",
            image_url: {
              url: `data:${image.mimeType};base64,${image.base64}`,
            },
          })),
        ]
      : userPrompt;

  const response = await fetchWithTimeout(
    `${OPENAI_BASE_URL}/chat/completions`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: mode === "landing" ? 0.55 : 0.45,
        max_tokens: mode === "landing" ? 2200 : 1600,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
      }),
    },
    AI_PROVIDER_TIMEOUT_MS,
    "OpenAI completion request"
  );

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw createProviderError({
      provider: "openai",
      status: response.status,
      body: asObject(body),
      requestId: response.headers.get("x-request-id") || "",
      fallbackMessage: "OpenAI generation failed",
    });
  }

  const rawContent = toOpenAiMessageContent(body?.choices?.[0]?.message?.content);
  if (!rawContent) {
    throw new Error("Model returned empty content");
  }

  return {
    content: rawContent,
    usage: {
      prompt_tokens: Number(body?.usage?.prompt_tokens || 0),
      completion_tokens: Number(body?.usage?.completion_tokens || 0),
    },
  };
};

const requestClaudeCompletion = async ({
  model,
  systemPrompt,
  userPrompt,
  mode,
  apiKey,
  images,
}: {
  model: string;
  systemPrompt: string;
  userPrompt: string;
  mode: AiMode;
  apiKey: string;
  images: InputImage[];
}) => {
  const userContent =
    images.length > 0
      ? [
          {
            type: "text",
            text: userPrompt,
          },
          ...images.map((image) => ({
            type: "image",
            source: {
              type: "base64",
              media_type: image.mimeType,
              data: image.base64,
            },
          })),
        ]
      : userPrompt;

  const response = await fetchWithTimeout(
    `${ANTHROPIC_BASE_URL}/messages`,
    {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        system: systemPrompt,
        temperature: mode === "landing" ? 0.55 : 0.45,
        max_tokens: mode === "landing" ? 2200 : 1600,
        messages: [
          {
            role: "user",
            content: userContent,
          },
        ],
      }),
    },
    AI_PROVIDER_TIMEOUT_MS,
    "Claude completion request"
  );

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw createProviderError({
      provider: "claude",
      status: response.status,
      body: asObject(body),
      requestId: response.headers.get("request-id") || response.headers.get("x-request-id") || "",
      fallbackMessage: "Claude generation failed",
    });
  }

  const rawContent = toClaudeMessageContent(body?.content);
  if (!rawContent) {
    throw new Error("Model returned empty content");
  }

  return {
    content: rawContent,
    usage: {
      prompt_tokens: Number(body?.usage?.input_tokens || 0),
      completion_tokens: Number(body?.usage?.output_tokens || 0),
    },
  };
};

const buildSystemPrompt = (mode: AiMode, emailOutputMode: EmailOutputMode) => {
  if (mode === "landing") {
    return [
      "You are an expert conversion copywriter and landing-page architect.",
      "Return valid JSON only. Do not wrap in markdown fences.",
      "The output must align with an existing block-based editor.",
      "Allowed block types: hero, features, cta, text, image, testimonial, pricing, faq, form, footer, navbar, gallery, stats, video.",
      "Keep content concise, clear, and personalized to brief + audience.",
      "Include only keys: name, slug, published, blocks, reasoning.",
      "Each block object must include keys: type, content, styles.",
      "styles can be an empty object.",
      "Avoid placeholders like Lorem Ipsum.",
    ].join(" ");
  }

  if (emailOutputMode === "raw_html") {
    return [
      "You are an expert email strategist and HTML email designer for outbound and lifecycle campaigns.",
      "Return valid JSON only. Do not wrap in markdown fences.",
      "Include only keys: name, subject, audience, voice, goal, html, reasoning.",
      "Set `html` to the final email HTML the user should see immediately.",
      "The HTML must be production-quality and email-client friendly (table-based layout, inline styles, semantic structure).",
      "Do not include <script> tags, JavaScript event handlers, or client-side JS dependencies.",
      "Do not return block arrays when output mode is raw_html.",
      "Treat the user's latest instruction as the highest-priority source of truth.",
      "Do not force default subject, CTA, colors, or sections unless the user asks for them.",
      "If CurrentDraftContext is provided and the user asks to change/refine/edit, apply targeted edits instead of rewriting everything.",
      "Short follow-up instructions like 'make it shorter', 'change the CTA', or 'add a quote' are patch requests against the current draft.",
      "If the user asks for a fresh template, generate a fresh structure and copy.",
      "Do not replace an existing subject unless the user explicitly asks to change subject.",
      "Do not copy prior memory snippets verbatim unless the user explicitly asks to reuse them.",
      "Avoid generic filler text. Produce specific, high-quality marketing copy aligned to user intent.",
      "Do not use the raw instruction sentence as the subject line.",
      "Do not echo the raw instruction as body copy unless explicitly requested.",
    ].join(" ");
  }

  return [
    "You are an expert email strategist for outbound and lifecycle campaigns.",
    "Return valid JSON only. Do not wrap in markdown fences.",
    "The output must align with an existing block-based email editor.",
    "Allowed block types: text, image, button, divider, spacer, columns, heading, video, social, countdown, table, quote, code, signature, bookmark.",
    "Include only keys: name, subject, audience, voice, goal, blocks, reasoning.",
    "Each block object must include keys: type, content, styles.",
    "styles can be an empty object.",
    "For text/heading/quote/signature blocks, include high-quality `content.html` (semantic tags, links/lists where useful), not plain placeholder text.",
    "Treat the user's latest instruction as the highest-priority source of truth.",
    "Do not force default subject, CTA, colors, or sections unless the user asks for them.",
    "If CurrentDraftContext is provided and the user asks to change/refine/edit, apply targeted edits instead of rewriting everything.",
    "Short follow-up instructions like 'make it shorter', 'change the CTA', or 'add a quote' are patch requests against the current draft.",
    "If the user asks for a fresh template, generate a fresh structure and copy.",
    "If the user asks for paragraphs, provide substantive paragraph text (not only headings or bullets).",
    "If the user asks for bullet points, return clear bullet-point content.",
    "Do not replace an existing subject unless the user explicitly asks to change subject.",
    "Do not copy prior memory snippets verbatim unless the user explicitly asks to reuse them.",
    "Avoid generic filler text. Produce specific, high-quality marketing copy aligned to user intent.",
    "Do not use the raw instruction sentence as the subject line.",
    "Do not echo the raw instruction as body copy unless explicitly requested.",
    "Anchor the email to concrete topic details from the instruction (names, locations, event/topic keywords).",
    "If instruction references a sensitive or news-like topic, keep tone factual, neutral, and context-aware.",
    "Do not default to generic headings like Campaign Update unless explicitly asked.",
  ].join(" ");
};

const resolveCurrentDraftPolicy = (instruction: string, current: Record<string, unknown>) => {
  const lower = instruction.toLowerCase();
  const editIntent =
    /\b(edit|refine|modify|update|change|improve|rewrite|revise|tweak|adjust|undo|revert|rollback|restore|go back|previous version|prev version)\b/.test(
      lower
    );
  const createIntent = /\b(create|generate|build|make|draft|compose|write)\b/.test(lower);
  const hasCurrentDraft = hasCurrentTemplateContext(current);
  const freshDraftIntent = isFreshDraftInstruction(instruction);

  if (freshDraftIntent) return "ignore";
  if (editIntent) return "edit";
  if (hasCurrentDraft) return "edit";
  if (createIntent) return "ignore";
  return "edit";
};

const buildUserPrompt = ({
  mode,
  emailOutputMode,
  instruction,
  brief,
  current,
  images,
  pinnedFacts,
  memorySummary,
  snippets,
}: {
  mode: AiMode;
  emailOutputMode: EmailOutputMode;
  instruction: string;
  brief: Record<string, unknown>;
  current: Record<string, unknown>;
  images: InputImage[];
  pinnedFacts: Record<string, unknown>;
  memorySummary: string;
  snippets: Array<Record<string, unknown>>;
}) => {
  const currentDraftPolicy = resolveCurrentDraftPolicy(instruction, current);
  const currentDraftContext = currentDraftPolicy === "ignore" ? {} : current;
  const emailRequirements =
    mode === "email" && emailOutputMode === "blocks"
      ? extractEmailPromptRequirements(instruction, brief)
      : null;

  return [
    `Mode: ${mode}`,
    mode === "email" ? `EmailOutputMode: ${emailOutputMode}` : "",
    `Instruction: ${instruction || "Generate a strong first draft aligned to the brief."}`,
    `Brief: ${JSON.stringify(brief)}`,
    `PinnedFacts: ${JSON.stringify(pinnedFacts)}`,
    `MemorySummary: ${memorySummary || "none"}`,
    `CurrentDraftPolicy: ${currentDraftPolicy}`,
    `CurrentDraftContext: ${compactContext(currentDraftContext, 7000) || "none"}`,
    `AttachedImages: ${images.length > 0 ? JSON.stringify(images.map((image) => ({ name: image.name, mimeType: image.mimeType }))) : "none"}`,
    `RelevantPriorMaterial: ${JSON.stringify(snippets)}`,
    emailRequirements
      ? `EmailDirectives: ${JSON.stringify({
          wantsParagraphs: emailRequirements.wantsParagraphs,
          wantsBullets: emailRequirements.wantsBullets,
          wantsMoreInfo: emailRequirements.wantsMoreInfo,
          wantsTimelineOrRoi: emailRequirements.wantsTimelineOrRoi,
          wantsImageReferenceTemplate: emailRequirements.wantsImageReferenceTemplate,
          explicitSubject: emailRequirements.explicitSubject,
          explicitCtaText: emailRequirements.explicitCtaText,
          noCta: emailRequirements.noCta,
          explicitBlockCount: emailRequirements.explicitBlockCount,
          requestedBlockCount: emailRequirements.requestedBlockCount,
        })}`
      : "",
    "Requirements:",
    "- Follow the latest user instruction exactly.",
    "- Respect personalization details from brief and pinned facts when they do not conflict with the latest instruction.",
    "- Use CurrentDraftPolicy strictly: if policy is ignore, do not reuse the current draft structure.",
    "- For edit/refine requests, preserve unchanged sections and modify only requested parts.",
    "- Treat short conversational follow-ups in the same thread as edits to the current draft unless the user explicitly asks for a fresh version.",
    "- If AttachedImages are provided, use them as visual context for messaging, tone, and specifics.",
    "- If user asks to match/reference an attached image, preserve that source structure and avoid adding extra placeholder banners or generic sections not present in the image.",
    "- If an explicit CTA, subject, URL, paragraph/bullet style, or timeline/ROI request is present, enforce it exactly.",
    emailOutputMode === "raw_html"
      ? "- Return the final output as high-quality email HTML in `html`."
      : "- Keep output structurally valid for the block editor.",
    "- Do not include commentary outside JSON.",
  ]
    .filter(Boolean)
    .join("\n");
};

const heuristicEmail = ({
  instruction,
  brief,
  current,
  memorySummary,
}: {
  instruction: string;
  brief: Record<string, unknown>;
  current: Record<string, unknown>;
  memorySummary: string;
}) => {
  const existingTemplate = extractCurrentEmailTemplate(current, brief);
  const baseline = existingTemplate
    ? deepClone(existingTemplate)
    : normalizeEmailResult(
        {
          name: pickString(brief.goal || "AI Email Draft"),
          subject: pickString(brief.subject || brief.goal || "Quick idea for your team"),
          audience: pickString(brief.audience || "All"),
          voice: pickString(brief.tone || "Professional"),
          goal: pickString(brief.goal || "Engagement"),
          blocks: [
            {
              type: "heading",
              content: {
                text: pickString(brief.goal || "A quick idea for your team"),
                html: `<b>${pickString(brief.goal || "A quick idea for your team")}</b>`,
              },
              styles: { padding: "16px" },
            },
            {
              type: "text",
              content: {
                text: pickString(brief.offer || instruction || "We can help improve your outcomes with a tailored approach."),
                html: pickString(brief.offer || instruction || "We can help improve your outcomes with a tailored approach."),
              },
              styles: { padding: "16px" },
            },
            {
              type: "button",
              content: {
                text: pickString(brief.cta || "Book a quick call"),
                url: "#",
                align: "left",
                bgColor: "#2a9d6e",
                textColor: "#ffffff",
              },
              styles: { padding: "16px" },
            },
            {
              type: "signature",
              content: {
                text: "Best regards,\nYour Team",
                html: "Best regards,<br><b>Your Team</b>",
              },
              styles: { padding: "16px" },
            },
          ],
        },
        brief,
        instruction
      );

  const template = deepClone(baseline) as any;
  template.blocks = Array.isArray(template.blocks) ? template.blocks : [];
  const notes: string[] = [];
  const lowerInstruction = instruction.toLowerCase();

  const headingBlock = template.blocks.find((block: any) => block.type === "heading");
  const textBlocks = template.blocks.filter((block: any) => block.type === "text");
  const buttonBlocks = template.blocks.filter((block: any) => block.type === "button");

  if (typeof brief.audience === "string" && brief.audience.trim()) template.audience = brief.audience.trim();
  if (typeof brief.goal === "string" && brief.goal.trim()) template.goal = brief.goal.trim();
  if (typeof brief.tone === "string" && brief.tone.trim()) template.voice = brief.tone.trim();

  const subjectMatch = instruction.match(/subject(?:\s*line)?\s*(?:to|as|:)\s*["']?([^"\n']+)["']?/i);
  if (subjectMatch?.[1]) {
    template.subject = subjectMatch[1].trim();
    notes.push("updated subject");
  }

  const toneMatch = lowerInstruction.match(/\b(friendly|casual|formal|professional)\b/);
  if (toneMatch?.[1]) {
    template.voice = toneMatch[1][0].toUpperCase() + toneMatch[1].slice(1);
    notes.push(`set tone ${toneMatch[1]}`);
  }

  if (lowerInstruction.includes("welcome")) {
    if (!subjectMatch?.[1]) template.subject = "Welcome to our platform";
    if (headingBlock) {
      headingBlock.content = {
        ...asObject(headingBlock.content),
        text: "Welcome aboard",
        html: "<b>Welcome aboard</b>",
      };
    }
    if (textBlocks[0]) {
      const body = "Thanks for signing up. We're excited to help you get started quickly.";
      textBlocks[0].content = {
        ...asObject(textBlocks[0].content),
        text: body,
        html: body,
      };
    }
    notes.push("applied welcome-email structure");
  }

  if (lowerInstruction.includes("signup") || lowerInstruction.includes("sign up")) {
    if (!subjectMatch?.[1]) template.subject = "Complete your signup in one minute";
    notes.push("tuned for signup intent");
  }

  const parsedButtonText = parseButtonTextFromInstruction(instruction);
  if (parsedButtonText) {
    for (const block of buttonBlocks) {
      block.content = { ...asObject(block.content), text: parsedButtonText };
    }
    notes.push("updated button text");
  }

  const urlMatch = instruction.match(/https?:\/\/[^\s"']+/i);
  if (urlMatch?.[0]) {
    for (const block of buttonBlocks) {
      block.content = { ...asObject(block.content), url: urlMatch[0] };
    }
    notes.push("updated button url");
  }

  const targetColor = resolveColorToken(instruction);
  const asksButtonColor = lowerInstruction.includes("button") && (lowerInstruction.includes("color") || lowerInstruction.includes("colour"));
  if (targetColor && (asksButtonColor || buttonBlocks.length > 0)) {
    for (const block of buttonBlocks) {
      block.content = {
        ...asObject(block.content),
        bgColor: targetColor,
        textColor: targetColor === "#111827" ? "#ffffff" : asObject(block.content).textColor || "#ffffff",
      };
    }
    notes.push(`updated button color to ${targetColor}`);
  }

  if ((lowerInstruction.includes("add cta") || lowerInstruction.includes("add button")) && buttonBlocks.length === 0) {
    template.blocks.push({
      id: crypto.randomUUID(),
      type: "button",
      content: {
        text: pickString(brief.cta || "Get Started"),
        url: "#",
        align: "left",
        bgColor: "#2a9d6e",
        textColor: "#ffffff",
      },
      styles: { padding: "16px", backgroundColor: "transparent" },
    });
    notes.push("added CTA button");
  }

  if (lowerInstruction.includes("shorter") || lowerInstruction.includes("shorten")) {
    if (textBlocks[0]) {
      const source = pickString(asObject(textBlocks[0].content).text || "");
      const compact = source.length > 140 ? `${source.slice(0, 137).trim()}...` : source;
      textBlocks[0].content = {
        ...asObject(textBlocks[0].content),
        text: compact,
        html: compact,
      };
      notes.push("shortened main body copy");
    }
  }

  if (lowerInstruction.includes("longer") || lowerInstruction.includes("expand")) {
    if (textBlocks[0]) {
      const source = pickString(asObject(textBlocks[0].content).text || "");
      const expanded = `${source} We can share examples tailored to your use case if helpful.`.trim();
      textBlocks[0].content = {
        ...asObject(textBlocks[0].content),
        text: expanded,
        html: expanded,
      };
      notes.push("expanded body copy");
    }
  }

  if (lowerInstruction.includes("attractive") || lowerInstruction.includes("modern")) {
    for (const block of template.blocks) {
      block.styles = { ...asObject(block.styles), borderRadius: "10px" };
    }
    notes.push("applied polished styling tweaks");
  }

  if (template.blocks.length === 0) {
    template.blocks = baseline.blocks;
  }

  const heuristicRequirements = extractEmailPromptRequirements(instruction, brief);
  const hinted = applyEmailInstructionHints({
    template,
    instruction,
    current,
    brief,
  });
  const enforced = enforceEmailPromptRequirements({
    template: hinted,
    requirements: heuristicRequirements,
    brief,
    instruction,
  });
  const heuristicQuality = evaluateEmailQuality({
    result: enforced,
    requirements: heuristicRequirements,
    instruction,
    current,
  });
  if (heuristicQuality.score < 78) {
    notes.push(`quality guard repaired output to ${heuristicQuality.score}%`);
  }

  const memoryHint = memorySummary
    ? "Thread memory preserved and used for continuity."
    : "No previous memory context available.";

  (enforced as Record<string, unknown>).reasoning = [
    "Heuristic edit mode (LLM keys missing in Edge runtime).",
    notes.length > 0 ? `Applied: ${notes.join(", ")}.` : "Applied safe defaults.",
    existingTemplate ? "Used current template as base for in-place revision." : "Created a new baseline template.",
    memoryHint,
  ].join(" ");

  return normalizeEmailResult(enforced, brief, instruction);
};

const heuristicLanding = (instruction: string, brief: Record<string, unknown>) =>
  normalizeLandingResult(
    {
      name: pickString(brief.business || "AI Landing Page"),
      slug: slugify(pickString(brief.business || "ai-landing-page")),
      published: false,
      blocks: [
        {
          type: "navbar",
          content: {
            brand: pickString(brief.business || "Your Brand"),
            links: ["Home", "Features", "Pricing", "Contact"],
          },
          styles: {},
        },
        {
          type: "hero",
          content: {
            headline: pickString(brief.headline || "Launch a high-converting page in minutes"),
            subheadline: pickString(brief.offer || instruction || "Personalized content generated from your goals and audience."),
            ctaText: pickString(brief.cta || "Get started"),
            ctaUrl: "#",
          },
          styles: {},
        },
        {
          type: "features",
          content: {
            title: "What you get",
            items: [
              { title: "Personalized copy", desc: "Tailored by your audience and offer." },
              { title: "Optimized layout", desc: "Focused on readability and conversion." },
              { title: "Fast iteration", desc: "Update sections with AI or manual edits." },
            ],
          },
          styles: {},
        },
        {
          type: "cta",
          content: {
            headline: "Ready to take the next step?",
            buttonText: pickString(brief.cta || "Book a demo"),
            buttonUrl: "#",
          },
          styles: {},
        },
      ],
      reasoning: "Heuristic fallback used because no AI provider key is configured.",
    },
    brief,
    instruction
  );

const mergePinnedFacts = (existing: Record<string, unknown>, brief: Record<string, unknown>) => {
  const next = { ...existing };
  const allowList = [
    "audience",
    "tone",
    "brandVoice",
    "goal",
    "offer",
    "cta",
    "constraints",
    "business",
    "persona",
    "industry",
    "seoKeywords",
  ];

  for (const key of allowList) {
    const value = brief[key];
    if (typeof value === "string" && value.trim()) {
      next[key] = value.trim().slice(0, 500);
    } else if (Array.isArray(value) && value.length > 0) {
      next[key] = value.slice(0, 20);
    }
  }
  return next;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const startedAt = Date.now();
  try {
    const user = await resolveUser(req);
    if (!user) return jsonResponse({ error: "Unauthorized" }, 401);

    const payload = await req.json().catch(() => ({}));
    const mode = toMode(payload?.mode);
    const emailOutputMode: EmailOutputMode =
      mode === "email" && pickString(payload?.outputMode || "").toLowerCase() === "raw_html"
        ? "raw_html"
        : "blocks";
    const instruction = pickString(payload?.instruction || payload?.message || "").slice(0, 5000);
    const brief = asObject(payload?.brief);
    const current = asObject(payload?.current);
    const inputImages = sanitizeInputImages(payload?.images);
    const optimizeFor = pickString(payload?.optimizeFor || "balanced").toLowerCase();
    const requestedProvider = pickString(payload?.provider || "");
    const postProcessMode = pickString(payload?.postProcessMode || "minimal").toLowerCase();
    const explicitModel = pickString(payload?.model || "");
    const topK = clamp(Number(payload?.topK || 4), 1, 12);
    const requestedThreadId = pickString(payload?.threadId || "");
    const openAiApiKey = pickString(OPENAI_API_KEY || "");
    const anthropicApiKey = pickString(ANTHROPIC_API_KEY || "");
    const providerAvailability = {
      openai: Boolean(openAiApiKey),
      claude: Boolean(anthropicApiKey),
    };

    if (!instruction && Object.keys(brief).length === 0 && inputImages.length === 0) {
      return jsonResponse({ error: "instruction, brief, or images are required" }, 400);
    }

    let threadId = requestedThreadId;
    if (threadId) {
      const { data: thread, error } = await admin
        .from("ai_builder_threads")
        .select("id")
        .eq("id", threadId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) throw error;
      if (!thread) {
        threadId = "";
      }
    }

    if (!threadId) {
      const { data: createdThread, error } = await admin
        .from("ai_builder_threads")
        .insert({
          user_id: user.id,
          mode,
          title: (instruction || pickString(brief.goal || brief.business || "New AI Draft")).slice(0, 120),
          status: "active",
        })
        .select("id")
        .single();
      if (error) throw error;
      threadId = String(createdThread.id);
    }

    const { data: memoryRow, error: memoryLoadError } = await admin
      .from("ai_builder_thread_memory")
      .select("summary_text, pinned_facts, summary_version")
      .eq("thread_id", threadId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (memoryLoadError) throw memoryLoadError;

    const existingPinnedFacts = asObject(memoryRow?.pinned_facts);
    const mergedPinnedFacts = mergePinnedFacts(existingPinnedFacts, brief);
    const currentSummary = pickString(memoryRow?.summary_text || "");
    const currentSummaryVersion = Number(memoryRow?.summary_version || 0);

    const { error: userMessageError } = await admin.from("ai_builder_messages").insert({
      thread_id: threadId,
      user_id: user.id,
      role: "user",
      content: instruction || JSON.stringify(brief),
      status: "complete",
      metadata: {
        brief,
        optimize_for: optimizeFor,
        provider_requested: requestedProvider || null,
        image_count: inputImages.length,
        image_names: inputImages.map((image) => image.name).slice(0, MAX_INPUT_IMAGES),
      },
    });
    if (userMessageError) throw userMessageError;

    const { data: recentRows, error: recentRowsError } = await admin
      .from("ai_builder_messages")
      .select("role, content, metadata, created_at")
      .eq("thread_id", threadId)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(12);
    if (recentRowsError) throw recentRowsError;

    const recentMessages = Array.isArray(recentRows) ? [...recentRows].reverse() : [];
    const summaryFromRecent = recentMessages
      .slice(-6)
      .map((row) => `${row.role}: ${String(row.content || "").slice(0, 220)}`)
      .join("\n");

    const memorySummary = (summaryFromRecent || currentSummary).slice(0, 2200);
    const nextSummaryVersion = currentSummaryVersion + 1;

    const assistantTemplateSnapshots =
      mode === "email"
        ? collectAssistantTemplatesFromRecentMessages(recentMessages as Array<Record<string, unknown>>)
        : [];
    const latestAssistantTemplate =
      assistantTemplateSnapshots.length > 0
        ? assistantTemplateSnapshots[assistantTemplateSnapshots.length - 1].template
        : null;

    let effectiveCurrent = current;
    if (mode === "email" && isEditInstruction(instruction) && !hasCurrentTemplateContext(current) && latestAssistantTemplate) {
      effectiveCurrent = {
        ...current,
        template: latestAssistantTemplate,
      };
    }

    let deterministicEmailResult: Record<string, unknown> | null = null;
    let deterministicReason = "";

    if (mode === "email" && emailOutputMode === "blocks") {
      const currentTemplate = extractCurrentEmailTemplate(effectiveCurrent, brief);
      const fallbackTemplate =
        latestAssistantTemplate && !currentTemplate
          ? normalizeEmailResult(resolveEmailTemplateCandidate(latestAssistantTemplate), brief, instruction)
          : null;
      const baselineTemplate = currentTemplate || fallbackTemplate;

      if (isRestorePreviousVersionInstruction(instruction)) {
        const previousSnapshot =
          assistantTemplateSnapshots.length >= 2
            ? assistantTemplateSnapshots[assistantTemplateSnapshots.length - 2]
            : assistantTemplateSnapshots.length === 1
              ? assistantTemplateSnapshots[0]
              : null;

        if (previousSnapshot?.template) {
          const restoredTemplate = deepClone(previousSnapshot.template) as Record<string, unknown>;
          restoredTemplate.reasoning = [
            pickString((restoredTemplate as any).reasoning || ""),
            "Restored the previous template version from this thread.",
          ]
            .filter(Boolean)
            .join(" ");
          deterministicEmailResult = restoredTemplate;
          deterministicReason = "Applied deterministic restore to previous thread version.";
        } else if (baselineTemplate) {
          const preservedTemplate = deepClone(baselineTemplate) as Record<string, unknown>;
          preservedTemplate.reasoning = [
            pickString((preservedTemplate as any).reasoning || ""),
            "No earlier version was available, so the latest draft was preserved.",
          ]
            .filter(Boolean)
            .join(" ");
          deterministicEmailResult = preservedTemplate;
          deterministicReason = "No earlier assistant version found; kept the latest draft.";
        }
      }

      if (!deterministicEmailResult) {
        const requestedImageDescriptor = extractRequestedImageDescriptor(instruction);
        if (requestedImageDescriptor && baselineTemplate && isDeterministicVisualAddInstruction(instruction)) {
          deterministicEmailResult = upsertRequestedImageBlock(
            baselineTemplate,
            requestedImageDescriptor,
            brief,
            instruction
          );
          deterministicReason = `Applied deterministic visual edit (${formatRequestedImageLabel(requestedImageDescriptor)}).`;
        }
      }

      if (!deterministicEmailResult) {
        const replacement = parseSimpleTextReplacementInstruction(instruction);
        if (replacement && baselineTemplate) {
          const replaced = applySimpleTextReplacementToTemplate(baselineTemplate, replacement);
          if (replaced.replacements > 0) {
            const updatedTemplate = deepClone(replaced.template) as Record<string, unknown>;
            updatedTemplate.reasoning = [
              pickString((updatedTemplate as any).reasoning || ""),
              `Applied direct replacement "${replacement.from}" -> "${replacement.to}" while preserving layout.`,
            ]
              .filter(Boolean)
              .join(" ");
            deterministicEmailResult = updatedTemplate;
            deterministicReason = `Applied deterministic text replacement (${replaced.replacements} match${
              replaced.replacements === 1 ? "" : "es"
            }).`;
          }
        }
      }
    }

    const { error: memoryUpsertError } = await admin.from("ai_builder_thread_memory").upsert(
      {
        thread_id: threadId,
        user_id: user.id,
        summary_text: memorySummary,
        pinned_facts: mergedPinnedFacts,
        summary_version: nextSummaryVersion,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "thread_id" }
    );
    if (memoryUpsertError) throw memoryUpsertError;

    let snippets: Array<Record<string, unknown>> = [];
    if (!deterministicEmailResult) {
      const retrievalQuery = normalizeText(`${instruction}\n${JSON.stringify(brief)}`).slice(0, 4000);
      let queryVector: number[] | null = null;
      if (retrievalQuery) {
        if (providerAvailability.openai) {
          queryVector = await requestOpenAIEmbedding(retrievalQuery, openAiApiKey);
        } else {
          // Anthropic does not provide text embeddings API.
          queryVector = deterministicEmbedding(retrievalQuery, 1536);
        }
      }

      if (queryVector) {
        const matchObjectType = mode === "landing" ? "landing_page" : "email_template";
        const { data: matchRows, error: matchError } = await admin.rpc("match_ai_builder_embeddings", {
          query_embedding: toVectorLiteral(queryVector),
          match_user_id: user.id,
          match_object_type: matchObjectType,
          match_count: topK,
        });
        if (matchError) {
          console.warn("ai-builder-generate retrieval warning:", matchError.message);
        } else {
          const rows = Array.isArray(matchRows) ? matchRows : [];
          const getRowThreadId = (row: any) => {
            const metadata = asObject(row?.metadata);
            return pickString(row?.thread_id || row?.threadId || metadata.threadId || metadata.thread_id || "");
          };
          const scopedRows = threadId ? rows.filter((row: any) => getRowThreadId(row) === threadId) : [];
          const threadlessRows = rows.filter((row: any) => !getRowThreadId(row));
          const allowCrossThreadReuse = /\b(similar to|like previous|based on previous|reuse|use prior|same as)\b/i.test(
            instruction
          );

          // Retrieval priority:
          // 1) Same-thread context.
          // 2) Global/library content (no thread scope).
          // 3) Cross-thread context only when explicitly requested.
          const sourceRows =
            scopedRows.length > 0
              ? scopedRows
              : threadlessRows.length > 0
                ? threadlessRows
                : allowCrossThreadReuse
                  ? rows
                  : [];
          snippets = sourceRows
            .map((row: any) => ({
              object_id: row.object_id,
              object_type: row.object_type,
              similarity: Number(row.similarity || 0),
              chunk_text: String(row.chunk_text || "").slice(0, 1000),
              metadata: asObject(row.metadata),
            }))
            .filter((row) => row.chunk_text && row.similarity >= 0.42)
            .slice(0, topK);
        }
      }
    }

    const resolvedProvider = resolveProvider(requestedProvider, providerAvailability);
    let fallbackReason = "";
    if (resolvedProvider === "heuristic") {
      if (requestedProvider.toLowerCase() === "openai" && !providerAvailability.openai) {
        fallbackReason = "OPENAI_API_KEY is not configured (neither Edge secrets nor runtime test key).";
      } else if (requestedProvider.toLowerCase() === "claude" && !providerAvailability.claude) {
        fallbackReason = "ANTHROPIC_API_KEY is not configured (neither Edge secrets nor runtime test key).";
      } else if (!providerAvailability.openai && !providerAvailability.claude) {
        fallbackReason = "Neither OPENAI_API_KEY nor ANTHROPIC_API_KEY is configured (Edge secrets/runtime test keys missing).";
      } else {
        fallbackReason = "Requested provider/model could not be used; running deterministic fallback.";
      }
      if (inputImages.length > 0) {
        fallbackReason = `${fallbackReason} Image context is ignored in heuristic mode.`;
      }
    }
    if (deterministicEmailResult && deterministicReason) {
      fallbackReason = [fallbackReason, deterministicReason].filter(Boolean).join(" ");
    }
    const initialModel = resolveModel({
      provider: resolvedProvider,
      preference: optimizeFor,
      explicitModel,
    });
    const systemPrompt = buildSystemPrompt(mode, emailOutputMode);
    const userPrompt = buildUserPrompt({
      mode,
      emailOutputMode,
      instruction,
      brief,
      current: effectiveCurrent,
      images: inputImages,
      pinnedFacts: mergedPinnedFacts,
      memorySummary,
      snippets,
    });

    let completionText = "";
    let promptTokens = 0;
    let completionTokens = 0;
    let provider: AiProvider = "heuristic";
    let modelUsed = initialModel;

    const runOpenAi = async (model: string, promptOverride?: string) => {
      const completion = await withProviderRetry(
        () =>
          requestOpenAICompletion({
            model,
            systemPrompt,
            userPrompt: promptOverride || userPrompt,
            mode,
            apiKey: openAiApiKey,
            images: inputImages,
          }),
        3
      );
      completionText = completion.content;
      promptTokens = Number(completion.usage.prompt_tokens || 0);
      completionTokens = Number(completion.usage.completion_tokens || 0);
      provider = "openai";
      modelUsed = model;
    };

    const runClaude = async (model: string, promptOverride?: string) => {
      const completion = await withProviderRetry(
        () =>
          requestClaudeCompletion({
            model,
            systemPrompt,
            userPrompt: promptOverride || userPrompt,
            mode,
            apiKey: anthropicApiKey,
            images: inputImages,
          }),
        3
      );
      completionText = completion.content;
      promptTokens = Number(completion.usage.prompt_tokens || 0);
      completionTokens = Number(completion.usage.completion_tokens || 0);
      provider = "claude";
      modelUsed = model;
    };

    let primaryProviderError = "";
    if (!deterministicEmailResult) {
      if (resolvedProvider === "openai" && providerAvailability.openai) {
        try {
          await runOpenAi(initialModel);
        } catch (error) {
          primaryProviderError = normalizeErrorMessage(error);
        }
      } else if (resolvedProvider === "claude" && providerAvailability.claude) {
        try {
          await runClaude(initialModel);
        } catch (error) {
          primaryProviderError = normalizeErrorMessage(error);
        }
      }
    }

    if (!completionText && primaryProviderError && !deterministicEmailResult) {
      if (resolvedProvider === "claude" && providerAvailability.openai) {
        const openAiFallbackModel = resolveModel({
          provider: "openai",
          preference: optimizeFor,
          explicitModel: "",
        });
        try {
          await runOpenAi(openAiFallbackModel);
          fallbackReason = `Claude request failed (${primaryProviderError}). Switched to OpenAI fallback.`;
        } catch (fallbackError) {
          primaryProviderError = `${primaryProviderError}; OpenAI fallback failed (${normalizeErrorMessage(fallbackError)})`;
        }
      } else if (resolvedProvider === "openai" && providerAvailability.claude) {
        const claudeFallbackModel = resolveModel({
          provider: "claude",
          preference: optimizeFor,
          explicitModel: "",
        });
        try {
          await runClaude(claudeFallbackModel);
          fallbackReason = `OpenAI request failed (${primaryProviderError}). Switched to Claude fallback.`;
        } catch (fallbackError) {
          primaryProviderError = `${primaryProviderError}; Claude fallback failed (${normalizeErrorMessage(fallbackError)})`;
        }
      }
    }

    if (deterministicEmailResult) {
      modelUsed = "deterministic-edit";
      provider = "heuristic";
      completionText = JSON.stringify(deterministicEmailResult);
    } else if (!completionText) {
      if (!fallbackReason && primaryProviderError) {
        fallbackReason = `Provider request failed (${primaryProviderError}). Running heuristic fallback.`;
      }
      modelUsed = "heuristic";
      provider = "heuristic";
      completionText = JSON.stringify(
        mode === "landing"
          ? heuristicLanding(instruction, brief)
          : heuristicEmail({
              instruction,
              brief,
              current: effectiveCurrent,
              memorySummary,
            })
      );
    }

    let parsed = parseMaybeJson(completionText);
    if (mode === "email" && emailOutputMode === "blocks") {
      const isImageReferenceRequest = inputImages.length > 0 && isImageReferenceInstruction(instruction);
      const resolvedEmailCandidate = resolveEmailTemplateCandidate(parsed);
      const candidateMissingBlocks = !hasSubstantiveEmailBlocks(resolvedEmailCandidate);

      if (isImageReferenceRequest && candidateMissingBlocks && provider !== "heuristic") {
        const recoveryPrompt = buildImageRecoveryPrompt({
          baseUserPrompt: userPrompt,
          instruction,
          previousOutput: completionText,
        });

        try {
          if (provider === "openai") {
            await runOpenAi(modelUsed, recoveryPrompt);
          } else if (provider === "claude") {
            await runClaude(modelUsed, recoveryPrompt);
          }
          parsed = parseMaybeJson(completionText);
          fallbackReason = [
            fallbackReason,
            "Performed image-structure recovery retry because initial output lacked valid blocks.",
          ]
            .filter(Boolean)
            .join(" ");
        } catch (recoveryError) {
          fallbackReason = [
            fallbackReason,
            `Image-structure recovery retry failed (${normalizeErrorMessage(recoveryError)}).`,
          ]
            .filter(Boolean)
            .join(" ");
        }
      }

      const resolvedAfterRetry = resolveEmailTemplateCandidate(parsed);
      if (isImageReferenceRequest && !hasSubstantiveEmailBlocks(resolvedAfterRetry) && provider !== "heuristic") {
        throw new Error(
          "Image-based generation failed to produce a valid block template. Please retry with a clearer screenshot or switch model."
        );
      }
    }

    const normalized =
      mode === "landing"
        ? normalizeLandingResult(asObject(parsed), brief, instruction)
        : emailOutputMode === "raw_html"
          ? buildDirectHtmlEmailResult({
              candidate: asObject(parsed),
              brief,
              instruction,
              rawCompletionText: completionText,
            })
          : normalizeEmailResult(resolveEmailTemplateCandidate(parsed), brief, instruction);
    let emailQuality: EmailQualityReport | null = null;
    let effectivePostProcessMode = postProcessMode;
    const deterministicEditApplied = mode === "email" && Boolean(deterministicEmailResult);
    const finalResult =
      mode === "email"
        ? (() => {
            if (emailOutputMode === "raw_html" && !deterministicEditApplied) {
              effectivePostProcessMode = "raw-html";
              return normalized as Record<string, unknown>;
            }

            const requirements = extractEmailPromptRequirements(instruction, brief);
            if (deterministicEditApplied) {
              const deterministicTemplate = normalizeEmailResult(resolveEmailTemplateCandidate(parsed), brief, instruction);
              emailQuality = evaluateEmailQuality({
                result: deterministicTemplate,
                requirements,
                instruction,
                current: effectiveCurrent,
              });
              effectivePostProcessMode = "deterministic-edit";
              return deterministicTemplate;
            }
            const strictPostProcess = postProcessMode === "strict";
            const postProcessDisabled = postProcessMode === "off";
            const shouldApplyGuidedHints = strictPostProcess || provider === "heuristic";
            let candidate = deepClone(normalized) as Record<string, unknown>;
            if (shouldApplyGuidedHints) {
              candidate = applyEmailInstructionHints({
                template: candidate,
                instruction,
                current: effectiveCurrent,
                brief,
              });
            }
            candidate = enforceEditContinuity({
              candidate,
              current: effectiveCurrent,
              brief,
              instruction,
              requirements,
            });
            const baselineQuality = evaluateEmailQuality({
              result: candidate,
              requirements,
              instruction,
              current: effectiveCurrent,
            });
            const hasHardMiss = baselineQuality.unmet.some((item) => isCriticalEmailQualityMiss(item, requirements));
            const shouldAutoRepair =
              !postProcessDisabled &&
              !strictPostProcess &&
              (hasHardMiss || (provider === "heuristic" && baselineQuality.score < 78));

            if (strictPostProcess || shouldAutoRepair) {
              const shouldRunAlignment = provider === "heuristic";
              const repairedBase = shouldRunAlignment
                ? alignEmailResultToPrompt({
                    normalized: candidate,
                    instruction,
                    brief,
                  })
                : candidate;
              const repaired = enforceEmailPromptRequirements({
                template: repairedBase,
                requirements,
                brief,
                instruction,
              });
              candidate =
                shouldRunAlignment || strictPostProcess
                  ? applyEmailInstructionHints({
                      template: repaired,
                      instruction,
                      current: effectiveCurrent,
                      brief,
                    })
                  : repaired;
              effectivePostProcessMode = strictPostProcess
                ? (shouldRunAlignment ? "strict+align" : "strict")
                : (shouldRunAlignment ? "auto-repair+align" : "auto-repair");
            } else {
              effectivePostProcessMode = postProcessMode;
            }

            const enforced = candidate;
            emailQuality = evaluateEmailQuality({
              result: enforced as Record<string, unknown>,
              requirements,
              instruction,
              current: effectiveCurrent,
            });
            return enforced;
          })()
        : normalized;

    const assistantContent =
      mode === "email"
        ? buildAssistantReply({
            instruction,
            result: finalResult as Record<string, unknown>,
            current: effectiveCurrent,
            brief,
            references: snippets,
            requirements: extractEmailPromptRequirements(instruction, brief),
            deterministicReason,
          })
        : [
            `${mode.toUpperCase()} draft updated: ${pickString((finalResult as any).name || "Untitled")}`,
            pickString((finalResult as any)?.reasoning || ""),
          ]
            .filter(Boolean)
            .join("\n")
            .slice(0, 1800);
    const { error: assistantMessageError } = await admin.from("ai_builder_messages").insert({
      thread_id: threadId,
      user_id: user.id,
      role: "assistant",
      content: assistantContent,
      status: "complete",
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      metadata: {
        mode,
        provider,
        model: provider === "heuristic" ? "heuristic" : modelUsed,
        diagnostics: {
          requested_provider: requestedProvider || null,
          selected_provider: provider,
          output_mode: emailOutputMode,
          fallback_reason: fallbackReason || null,
          postprocess_mode: effectivePostProcessMode,
          provider_availability: providerAvailability,
          image_count: inputImages.length,
          quality_score: emailQuality?.score ?? null,
          quality_total_checks: emailQuality?.totalChecks ?? null,
          quality_met_count: emailQuality?.met.length ?? null,
          quality_unmet: emailQuality?.unmet ?? [],
        },
        assistant_message: assistantContent,
        result: finalResult,
        references: snippets.map((item) => ({
          object_id: item.object_id,
          object_type: item.object_type,
          similarity: item.similarity,
        })),
      },
    });
    if (assistantMessageError) throw assistantMessageError;

    await admin.from("ai_builder_usage_logs").insert({
      user_id: user.id,
      thread_id: threadId,
      mode,
      provider,
      model_id: provider === "heuristic" ? "heuristic" : modelUsed,
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      latency_ms: Date.now() - startedAt,
      cache_hit: false,
      metadata: {
        retrieval_hits: snippets.length,
        summary_version: nextSummaryVersion,
        optimize_for: optimizeFor,
        diagnostics: {
          requested_provider: requestedProvider || null,
          selected_provider: provider,
          output_mode: emailOutputMode,
          fallback_reason: fallbackReason || null,
          postprocess_mode: effectivePostProcessMode,
          provider_availability: providerAvailability,
          image_count: inputImages.length,
          quality_score: emailQuality?.score ?? null,
          quality_total_checks: emailQuality?.totalChecks ?? null,
          quality_met_count: emailQuality?.met.length ?? null,
          quality_unmet: emailQuality?.unmet ?? [],
        },
      },
    });

    return jsonResponse({
      threadId,
      mode,
      result: finalResult,
      assistantMessage: assistantContent,
      references: snippets,
      usage: {
        provider,
        model: provider === "heuristic" ? "heuristic" : modelUsed,
        promptTokens,
        completionTokens,
        diagnostics: {
          requestedProvider: requestedProvider || "",
          selectedProvider: provider,
          outputMode: emailOutputMode,
          fallbackReason,
          postprocessMode: effectivePostProcessMode,
          providerAvailability,
          imageCount: inputImages.length,
          qualityScore: emailQuality?.score ?? null,
          qualityTotalChecks: emailQuality?.totalChecks ?? null,
          qualityMetCount: emailQuality?.met.length ?? null,
          qualityUnmet: emailQuality?.unmet ?? [],
        },
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse({ error: message }, 500);
  }
});





// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const MAX_SEARCH_SHARDS = 16;
const DEFAULT_SEARCH_PAGE_SIZE = 25;
const MAX_SEARCH_PAGE_SIZE = 50;
const MAX_SEARCH_BATCHES_PER_SHARD = 60;
const EXHAUSTIVE_SCAN_ESTIMATE_THRESHOLD = 2000;
const FILTER_OPTIONS_TTL_MS = 5 * 60 * 1000;
const FILTER_OPTION_WINDOW_SIZE = 60;
const FILTER_OPTION_SAMPLE_FACTORS = [0, 0.35, 0.7];

const DEFAULT_PROSPECT_FIELDS = {
  id: ["id"],
  fullName: ["full_name", "name"],
  firstName: ["first_name"],
  lastName: ["last_name"],
  email: ["email", "email_address"],
  phone: ["phone", "phone_number", "direct_number"],
  headline: ["headline", "job_title"],
  jobTitle: ["job_title", "title"],
  companyName: ["company_name", "company"],
  companyDomain: ["company_domain", "domain"],
  country: ["country"],
  region: ["region"],
  industry: ["industry", "industry_type"],
  subIndustry: ["sub_industry"],
  employeeSize: ["employee_size", "employee_size_bucket"],
  jobLevel: ["job_level"],
  jobFunction: ["job_function"],
  naics: ["naics", "naics_code"],
  linkedin: ["linkedin", "linkedin_url", "linkedin_normalized", "contact_link"],
};

const DEFAULT_COMPANY_FIELDS = {
  id: ["id"],
  name: ["company_name", "name"],
  domain: ["company_domain", "domain"],
  country: ["country"],
  region: ["region"],
  industry: ["industry", "industry_type"],
  subIndustry: ["sub_industry"],
  employeeSize: ["employee_size", "employee_size_bucket"],
  naics: ["naics", "naics_code"],
  prospectCount: ["prospect_count"],
};

const DEFAULT_PROSPECT_FILTER_COLUMNS = {
  jobTitle: "job_title",
  jobLevel: "job_level",
  jobFunction: "job_function",
  country: "country",
  industry: "industry",
  subIndustry: "sub_industry",
  employeeSize: "employee_size",
  region: "region",
  naics: "naics",
  companyName: "company",
};

const DEFAULT_COMPANY_FILTER_COLUMNS = {
  companyName: "company_name",
  country: "country",
  region: "region",
  industry: "industry",
  subIndustry: "sub_industry",
  employeeSize: "employee_size",
  naics: "naics",
};

const ENV = Deno.env.toObject();
const SUPABASE_URL = ENV.SUPABASE_URL ?? "";
const SUPABASE_SERVICE_ROLE_KEY = ENV.SUPABASE_SERVICE_ROLE_KEY ?? "";
const SUPABASE_ANON_KEY = ENV.SUPABASE_ANON_KEY ?? "";
const SEARCH_BYPASS_AUTH = String(ENV.SEARCH_BYPASS_AUTH || "false").toLowerCase() === "true";

const buildCorsHeaders = (req?: Request) => ({
  "Access-Control-Allow-Origin": req?.headers.get("origin") || "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, accept, accept-language, content-language",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
  Vary: "Origin",
});

const jsonResponse = (payload: unknown, status = 200, req?: Request) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...buildCorsHeaders(req),
    },
  });

const admin =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false },
      })
    : null;

const filterOptionsCache = new Map();

const getRawErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown error";
  }
};

const isStatementTimeoutMessage = (message: unknown) =>
  String(message || "").toLowerCase().includes("statement timeout");

const sanitizeShardErrorMessage = (message: unknown) => {
  const raw = String(message || "").trim();
  if (!raw) return "Unknown error";

  if (isStatementTimeoutMessage(raw)) {
    return "Search shard timed out while scanning this filter.";
  }

  if (/<(?:!DOCTYPE|html|body|head)\b/i.test(raw) || /cloudflare/i.test(raw)) {
    const plainText = raw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (/502|bad gateway/i.test(plainText)) {
      return "Shard host returned 502 Bad Gateway.";
    }
    if (/503|service unavailable/i.test(plainText)) {
      return "Shard host returned 503 Service Unavailable.";
    }
    if (/504|gateway timeout/i.test(plainText)) {
      return "Shard host returned 504 Gateway Timeout.";
    }
    return "Shard host returned an HTML error page.";
  }

  return raw;
};

const getErrorMessage = (error: unknown) => sanitizeShardErrorMessage(getRawErrorMessage(error));

const getErrorStatusCode = (error: unknown) => {
  if (typeof error !== "object" || error === null) return null;
  const candidate =
    ("status" in error ? (error as any).status : null) ??
    ("statusCode" in error ? (error as any).statusCode : null) ??
    ("code" in error ? (error as any).code : null);
  const parsed = Number(candidate);
  return Number.isFinite(parsed) ? parsed : null;
};

const isTransientShardError = (error: unknown) => {
  const status = getErrorStatusCode(error);
  if (status !== null && [502, 503, 504, 520, 522, 524].includes(status)) {
    return true;
  }

  const message = getRawErrorMessage(error).toLowerCase();
  return (
    message.includes("bad gateway") ||
    message.includes("gateway timeout") ||
    message.includes("service unavailable") ||
    message.includes("cloudflare") ||
    message.includes("failed to fetch") ||
    message.includes("networkerror") ||
    message.includes("econnreset") ||
    message.includes("etimedout")
  );
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const executeShardOperation = async <T>(operation: () => Promise<T>, maxRetries = 2): Promise<T> => {
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      const result = await operation();
      const operationError =
        result && typeof result === "object" && "error" in (result as Record<string, unknown>)
          ? (result as Record<string, unknown>).error
          : null;

      if (operationError && isTransientShardError(operationError) && attempt < maxRetries) {
        await wait(250 * (attempt + 1));
        continue;
      }

      return result;
    } catch (error) {
      lastError = error;
      if (isTransientShardError(error) && attempt < maxRetries) {
        await wait(250 * (attempt + 1));
        continue;
      }
      throw error;
    }
  }

  throw lastError ?? new Error("Shard operation failed.");
};

const createHttpError = (message: string, statusCode = 500, extra: Record<string, unknown> = {}) => {
  const error = new Error(message) as Error & { statusCode?: number; shardStatus?: unknown };
  error.statusCode = statusCode;
  Object.assign(error, extra);
  return error;
};

const encodeBase64Url = (value: string) => {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};

const decodeBase64Url = (value: string) => {
  const normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4 || 4)) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
};

const decodeJwtPayload = (token: string) => {
  const parts = String(token || "").split(".");
  if (parts.length < 2) return null;
  try {
    return JSON.parse(decodeBase64Url(parts[1]));
  } catch {
    return null;
  }
};

const parseProjectRefFromUrl = (value: string) => {
  const match = String(value || "").trim().match(/^https:\/\/([^.]+)\.supabase\.co/i);
  return match?.[1] || null;
};

const MAIN_PROJECT_REF = parseProjectRefFromUrl(SUPABASE_URL);

const clampPageSize = (value: unknown) => {
  const parsed = Number.parseInt(String(value || DEFAULT_SEARCH_PAGE_SIZE), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_SEARCH_PAGE_SIZE;
  return Math.min(parsed, MAX_SEARCH_PAGE_SIZE);
};

const parseShardCount = (value: unknown) => {
  const parsed = Number.parseInt(String(value || "1"), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 1;
  return Math.min(parsed, MAX_SEARCH_SHARDS);
};

const parseCandidates = (value: unknown, fallback: string[]) => {
  const normalizedValue = String(value || "").trim().toLowerCase();
  if (normalizedValue === "__none__" || normalizedValue === "none") {
    return [];
  }
  const fromValue = String(value || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  return fromValue.length > 0 ? fromValue : fallback;
};

const parseSingleColumn = (value: unknown, fallback: string) => {
  const candidate = String(value || "").trim();
  return candidate || fallback;
};

const pickEnvValue = (env: Record<string, string>, keys: string[]) => {
  for (const key of keys) {
    const value = String(env[key] || "").trim();
    if (value) return value;
  }
  return "";
};

const buildDisplayFieldConfig = (env: Record<string, string>, prefix: string, defaults: Record<string, string[]>) =>
  Object.fromEntries(
    Object.entries(defaults).map(([key, fallback]) => [
      key,
      parseCandidates(env[`${prefix}_${key.toUpperCase()}_COLUMNS`], fallback),
    ]),
  );

const buildSchemaConfig = (env: Record<string, string>) => {
  const prospectFields = buildDisplayFieldConfig(env, "SEARCH_PROSPECT", DEFAULT_PROSPECT_FIELDS);
  const companyFields = buildDisplayFieldConfig(env, "SEARCH_COMPANY", DEFAULT_COMPANY_FIELDS);

  return {
    prospectSource: parseSingleColumn(env.SEARCH_PROSPECTS_SOURCE, "prospects"),
    companySource: parseSingleColumn(env.SEARCH_COMPANIES_SOURCE, "companies"),
    deriveCompaniesFromProspects:
      String(env.SEARCH_COMPANIES_DERIVE_FROM_PROSPECTS || "").trim().toLowerCase() === "true",
    prospectIdColumn: parseSingleColumn(env.SEARCH_PROSPECT_ID_COLUMN, prospectFields.id[0]),
    companyIdColumn: parseSingleColumn(env.SEARCH_COMPANY_ID_COLUMN, companyFields.id[0]),
    prospectFields,
    companyFields,
    prospectFilters: {
      jobTitle: parseSingleColumn(env.SEARCH_PROSPECT_JOB_TITLE_COLUMN, DEFAULT_PROSPECT_FILTER_COLUMNS.jobTitle),
      jobLevel: parseSingleColumn(env.SEARCH_PROSPECT_JOB_LEVEL_COLUMN, DEFAULT_PROSPECT_FILTER_COLUMNS.jobLevel),
      jobFunction: parseSingleColumn(env.SEARCH_PROSPECT_JOB_FUNCTION_COLUMN, DEFAULT_PROSPECT_FILTER_COLUMNS.jobFunction),
      country: parseSingleColumn(env.SEARCH_PROSPECT_COUNTRY_COLUMN, DEFAULT_PROSPECT_FILTER_COLUMNS.country),
      industry: parseSingleColumn(env.SEARCH_PROSPECT_INDUSTRY_COLUMN, DEFAULT_PROSPECT_FILTER_COLUMNS.industry),
      subIndustry: parseSingleColumn(env.SEARCH_PROSPECT_SUB_INDUSTRY_COLUMN, DEFAULT_PROSPECT_FILTER_COLUMNS.subIndustry),
      employeeSize: parseSingleColumn(
        env.SEARCH_PROSPECT_EMPLOYEE_SIZE_COLUMN,
        DEFAULT_PROSPECT_FILTER_COLUMNS.employeeSize,
      ),
      region: parseSingleColumn(env.SEARCH_PROSPECT_REGION_COLUMN, DEFAULT_PROSPECT_FILTER_COLUMNS.region),
      naics: parseSingleColumn(env.SEARCH_PROSPECT_NAICS_COLUMN, DEFAULT_PROSPECT_FILTER_COLUMNS.naics),
      companyName: parseSingleColumn(
        env.SEARCH_PROSPECT_COMPANY_SEARCH_COLUMN,
        DEFAULT_PROSPECT_FILTER_COLUMNS.companyName,
      ),
    },
    companyFilters: {
      companyName: parseSingleColumn(env.SEARCH_COMPANY_SEARCH_COLUMN, DEFAULT_COMPANY_FILTER_COLUMNS.companyName),
      country: parseSingleColumn(env.SEARCH_COMPANY_COUNTRY_COLUMN, DEFAULT_COMPANY_FILTER_COLUMNS.country),
      region: parseSingleColumn(env.SEARCH_COMPANY_REGION_COLUMN, DEFAULT_COMPANY_FILTER_COLUMNS.region),
      industry: parseSingleColumn(env.SEARCH_COMPANY_INDUSTRY_COLUMN, DEFAULT_COMPANY_FILTER_COLUMNS.industry),
      subIndustry: parseSingleColumn(
        env.SEARCH_COMPANY_SUB_INDUSTRY_COLUMN,
        DEFAULT_COMPANY_FILTER_COLUMNS.subIndustry,
      ),
      employeeSize: parseSingleColumn(
        env.SEARCH_COMPANY_EMPLOYEE_SIZE_COLUMN,
        DEFAULT_COMPANY_FILTER_COLUMNS.employeeSize,
      ),
      naics: parseSingleColumn(env.SEARCH_COMPANY_NAICS_COLUMN, DEFAULT_COMPANY_FILTER_COLUMNS.naics),
    },
  };
};

const buildShardConfigs = (env: Record<string, string>) => {
  const shardCount = parseShardCount(env.SHARD_COUNT);
  const shards = [];

  for (let index = 1; index <= shardCount; index += 1) {
    const url = pickEnvValue(env, [`SEARCH_SHARD_URL_${index}`, `SEARCH_SUPABASE_URL_${index}`, `SUPABASE_URL_${index}`]);
    const serviceRoleKey = pickEnvValue(env, [
      `SEARCH_SHARD_SERVICE_ROLE_KEY_${index}`,
      `SEARCH_SUPABASE_SERVICE_ROLE_KEY_${index}`,
      `SUPABASE_SERVICE_ROLE_KEY_${index}`,
    ]);
    const anonKey = pickEnvValue(env, [
      `SEARCH_SHARD_ANON_KEY_${index}`,
      `SEARCH_SUPABASE_ANON_KEY_${index}`,
      `SUPABASE_ANON_KEY_${index}`,
    ]);

    if (!url && !serviceRoleKey && !anonKey) {
      shards.push({ index, status: "inactive", reason: "blank slot" });
      continue;
    }

    if (!url || (!serviceRoleKey && !anonKey)) {
      shards.push({ index, status: "invalid", reason: "missing URL or API key" });
      continue;
    }

    const key = serviceRoleKey || anonKey;
    const urlRef = parseProjectRefFromUrl(url);
    const jwtRef = decodeJwtPayload(key)?.ref || null;

    if (urlRef && jwtRef && urlRef !== jwtRef) {
      shards.push({
        index,
        status: "invalid",
        reason: `URL project ref ${urlRef} does not match key project ref ${jwtRef}`,
      });
      continue;
    }

    shards.push({
      index,
      status: "active",
      url,
      key,
      keyType: serviceRoleKey ? "service_role" : "anon",
      projectRef: urlRef || jwtRef || null,
    });
  }

  return shards;
};

const CATALOG_RUNTIME_TTL_MS = 60 * 1000;

const isCatalogRuntimeSecretKey = (key: unknown) => {
  const normalized = String(key || "").trim();
  return (
    normalized === "SHARD_COUNT" ||
    normalized.startsWith("SEARCH_") ||
    /^SUPABASE_(URL|SERVICE_ROLE_KEY|ANON_KEY)_\d+$/.test(normalized)
  );
};

const buildShardClientMap = (shards: any[]) =>
  new Map(
    shards.map((slot: any) => [
      slot.index,
      createClient(slot.url, slot.key, {
        auth: { persistSession: false },
      }),
    ]),
  );

const buildSelectColumns = (fieldGroups: Record<string, string[]>) => {
  const unique = new Set();
  Object.values(fieldGroups).forEach((columns) => {
    columns.forEach((column) => unique.add(column));
  });
  return [...unique].join(",");
};

const pickFirstValue = (record: Record<string, unknown>, candidates: string[]) => {
  for (const candidate of candidates) {
    const value = record?.[candidate];
    if (value !== null && value !== undefined && String(value).trim().length > 0) {
      return typeof value === "string" ? value.trim() : value;
    }
  }
  return null;
};

const normalizeText = (value: unknown) =>
  String(value || "")
    .trim()
    .toLowerCase();

const WINDOWS_1252_EXTRA_BYTES_BY_CHAR = new Map<string, number>([
  ["€", 0x80],
  ["‚", 0x82],
  ["ƒ", 0x83],
  ["„", 0x84],
  ["…", 0x85],
  ["†", 0x86],
  ["‡", 0x87],
  ["ˆ", 0x88],
  ["‰", 0x89],
  ["Š", 0x8a],
  ["‹", 0x8b],
  ["Œ", 0x8c],
  ["Ž", 0x8e],
  ["‘", 0x91],
  ["’", 0x92],
  ["“", 0x93],
  ["”", 0x94],
  ["•", 0x95],
  ["–", 0x96],
  ["—", 0x97],
  ["˜", 0x98],
  ["™", 0x99],
  ["š", 0x9a],
  ["›", 0x9b],
  ["œ", 0x9c],
  ["ž", 0x9e],
  ["Ÿ", 0x9f],
]);

const MOJIBAKE_ARTIFACT_PATTERN = /(?:Â€‹|â€‹|â€\u008b|\u200b|\ufeff)/g;
const MOJIBAKE_HINT_PATTERN = /(?:Ã.|Â.|â.|ã.)/;

const WINDOWS_1252_EXTRA_BYTES_BY_CHAR_REPAIRED = new Map<string, number>([
  ["\u20ac", 0x80],
  ["\u201a", 0x82],
  ["\u0192", 0x83],
  ["\u201e", 0x84],
  ["\u2026", 0x85],
  ["\u2020", 0x86],
  ["\u2021", 0x87],
  ["\u02c6", 0x88],
  ["\u2030", 0x89],
  ["\u0160", 0x8a],
  ["\u2039", 0x8b],
  ["\u0152", 0x8c],
  ["\u017d", 0x8e],
  ["\u2018", 0x91],
  ["\u2019", 0x92],
  ["\u201c", 0x93],
  ["\u201d", 0x94],
  ["\u2022", 0x95],
  ["\u2013", 0x96],
  ["\u2014", 0x97],
  ["\u02dc", 0x98],
  ["\u2122", 0x99],
  ["\u0161", 0x9a],
  ["\u203a", 0x9b],
  ["\u0153", 0x9c],
  ["\u017e", 0x9e],
  ["\u0178", 0x9f],
]);
const MOJIBAKE_ARTIFACT_PATTERN_REPAIRED =
  /(?:\u00c2\u20ac\u2039|\u00e2\u20ac\u2039|\u00c3\u201a\u00e2\u201a\u00ac\u00e2\u20ac\u2039|\u00c3\u00a2\u201a\u00ac\u00e2\u20ac\u2039|\u00c3\u00a2\u201a\u00ac\u008b|\u200b|\ufeff)/gu;
const MOJIBAKE_HINT_PATTERN_REPAIRED = /(?:[\u00c2\u00c3\u00e2].|[\u00e3\u00e5\u00e6][\u00a0-\u00bf])/u;
const LOWERCASE_UTF8_LEAD_PATTERN = /\u00e3(?=[\u00a0-\u00bf])/gu;

const encodeWindows1252Bytes = (value: unknown) => {
  const bytes: number[] = [];
  for (const char of String(value || "")) {
    const mappedByte = WINDOWS_1252_EXTRA_BYTES_BY_CHAR_REPAIRED.get(char);
    if (mappedByte !== undefined) {
      bytes.push(mappedByte);
      continue;
    }

    const code = char.charCodeAt(0);
    if (code <= 0xff) {
      bytes.push(code);
      continue;
    }

    return null;
  }

  return Uint8Array.from(bytes);
};

const countMojibakeHints = (value: unknown) => {
  const text = String(value || "");
  const explicitMatches = text.match(/(?:Ã.|Â.|â.|ã.)/g) || [];
  const replacementMatches = text.match(/\uFFFD/g) || [];
  return explicitMatches.length + replacementMatches.length * 4;
};

const repairMojibake = (value: unknown) => {
  const raw = String(value || "");
  if (!MOJIBAKE_HINT_PATTERN.test(raw)) {
    return raw;
  }

  const bytes = encodeWindows1252Bytes(raw);
  if (!bytes) {
    return raw;
  }

  try {
    const decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return countMojibakeHints(decoded) < countMojibakeHints(raw) ? decoded : raw;
  } catch {
    return raw;
  }
};

const normalizeDisplayTextValue = (value: unknown) => {
  if (value === null || value === undefined) return null;

  const cleaned = repairMojibake(String(value).replace(MOJIBAKE_ARTIFACT_PATTERN, ""))
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, " ")
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned || null;
};

const normalizeCompanyDisplayName = (value: unknown) => {
  const cleaned = normalizeDisplayTextValue(value);
  if (!cleaned) return null;

  return (
    cleaned
      .replace(/^[|=+*~<>•·]+\s*/, "")
      .replace(/\s*\|\s*/g, " | ")
      .replace(/\s+/g, " ")
      .trim() || null
  );
};

const countMojibakeHintsRepaired = (value: unknown) => {
  const text = String(value || "");
  const explicitMatches = text.match(/(?:[\u00c2\u00c3\u00e2].|[\u00e3\u00e5\u00e6][\u00a0-\u00bf])/gu) || [];
  const replacementMatches = text.match(/\uFFFD/g) || [];
  return explicitMatches.length + replacementMatches.length * 4;
};

const repairMojibakeRepaired = (value: unknown) => {
  const raw = String(value || "");
  const normalizedRaw = raw.replace(LOWERCASE_UTF8_LEAD_PATTERN, "\u00c3");
  if (!MOJIBAKE_HINT_PATTERN_REPAIRED.test(normalizedRaw)) {
    return raw;
  }

  const bytes = encodeWindows1252Bytes(normalizedRaw);
  if (!bytes) {
    return raw;
  }

  try {
    const decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return countMojibakeHintsRepaired(decoded) < countMojibakeHintsRepaired(normalizedRaw) ? decoded : raw;
  } catch {
    return raw;
  }
};

const normalizeDisplayTextValueRepaired = (value: unknown) => {
  if (value === null || value === undefined) return null;

  const cleaned = repairMojibakeRepaired(String(value).replace(MOJIBAKE_ARTIFACT_PATTERN_REPAIRED, ""))
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, " ")
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .replace(/([\u00e0-\u00ff])([A-Z])(?=[\s,.;:|]|$)/g, (_, prefix, suffix) => `${prefix}${suffix.toLowerCase()}`)
    .trim();

  return cleaned || null;
};

const normalizeCompanyDisplayNameRepaired = (value: unknown) => {
  const cleaned = normalizeDisplayTextValueRepaired(value);
  if (!cleaned) return null;

  return (
    cleaned
      .replace(/^[|=+*~<>\u2022\u00b7]+\s*/, "")
      .replace(/\s*\|\s*/g, " | ")
      .replace(/\s+/g, " ")
      .trim() || null
  );
};

const normalizeLinkedinUrl = (value: unknown) => {
  const raw = String(value || "").trim();
  if (!raw || raw === "-" || raw === "0") return null;

  const embeddedUrl =
    raw.match(/https?:\/\/(?:www\.)?linkedin\.com\/[^\s"']+/i)?.[0] ||
    raw.match(/(?:www\.)?linkedin\.com\/[^\s"']+/i)?.[0] ||
    raw;

  const cleaned = /^https?:\/\//i.test(embeddedUrl) ? embeddedUrl : `https://${embeddedUrl.replace(/^\/+/, "")}`;

  try {
    const url = new URL(cleaned);
    if (!/(^|\.)linkedin\.com$/i.test(url.hostname)) {
      return raw;
    }
    url.protocol = "https:";
    return url.toString();
  } catch {
    return cleaned;
  }
};

const buildCatalogRef = (shardIndex: number, entity: string, sourceId: string) => `s${shardIndex}:${entity}:${sourceId}`;

const parseCatalogRef = (value: unknown) => {
  const match = String(value || "").match(/^s(\d+):(prospect|company):(.+)$/);
  if (!match) return null;
  return {
    shardIndex: Number.parseInt(match[1], 10),
    entity: match[2],
    sourceId: match[3],
  };
};

const normalizeProspectRow = (record: Record<string, unknown>, shardIndex: number, schema: any) => {
  const sourceId = String(record?.[schema.prospectIdColumn] ?? "");
  const fullNameValue = pickFirstValue(record, schema.prospectFields.fullName);
  const firstName = pickFirstValue(record, schema.prospectFields.firstName);
  const lastName = pickFirstValue(record, schema.prospectFields.lastName);
  const combinedName = normalizeDisplayTextValueRepaired([firstName, lastName].filter(Boolean).join(" ").trim());

  return {
    catalogRef: buildCatalogRef(shardIndex, "prospect", sourceId),
    sourceShard: shardIndex,
    sourceRecordId: sourceId,
    fullName: normalizeDisplayTextValueRepaired(fullNameValue || combinedName || "") || "",
    email: pickFirstValue(record, schema.prospectFields.email),
    phone: pickFirstValue(record, schema.prospectFields.phone),
    headline: normalizeDisplayTextValueRepaired(pickFirstValue(record, schema.prospectFields.headline)),
    jobTitle: normalizeDisplayTextValueRepaired(pickFirstValue(record, schema.prospectFields.jobTitle)),
    jobLevel: normalizeDisplayTextValueRepaired(pickFirstValue(record, schema.prospectFields.jobLevel)),
    jobFunction: normalizeDisplayTextValueRepaired(pickFirstValue(record, schema.prospectFields.jobFunction)),
    companyName: normalizeCompanyDisplayNameRepaired(pickFirstValue(record, schema.prospectFields.companyName)),
    companyDomain: pickFirstValue(record, schema.prospectFields.companyDomain),
    country: normalizeDisplayTextValueRepaired(pickFirstValue(record, schema.prospectFields.country)),
    region: normalizeDisplayTextValueRepaired(pickFirstValue(record, schema.prospectFields.region)),
    industry: normalizeDisplayTextValueRepaired(pickFirstValue(record, schema.prospectFields.industry)),
    subIndustry: normalizeDisplayTextValueRepaired(pickFirstValue(record, schema.prospectFields.subIndustry)),
    employeeSize: normalizeDisplayTextValueRepaired(pickFirstValue(record, schema.prospectFields.employeeSize)),
    naics: normalizeDisplayTextValueRepaired(pickFirstValue(record, schema.prospectFields.naics)),
    linkedin: normalizeLinkedinUrl(pickFirstValue(record, schema.prospectFields.linkedin)),
    raw: record,
  };
};

const normalizeCompanyRow = (record: Record<string, unknown>, shardIndex: number, schema: any) => {
  const sourceId = String(record?.[schema.companyIdColumn] ?? "");
  return {
    catalogRef: buildCatalogRef(shardIndex, "company", sourceId),
    sourceShard: shardIndex,
    sourceRecordId: sourceId,
    companyName: normalizeCompanyDisplayNameRepaired(pickFirstValue(record, schema.companyFields.name)) || "",
    domain: pickFirstValue(record, schema.companyFields.domain),
    country: normalizeDisplayTextValueRepaired(pickFirstValue(record, schema.companyFields.country)),
    region: normalizeDisplayTextValueRepaired(pickFirstValue(record, schema.companyFields.region)),
    industry: normalizeDisplayTextValueRepaired(pickFirstValue(record, schema.companyFields.industry)),
    subIndustry: normalizeDisplayTextValueRepaired(pickFirstValue(record, schema.companyFields.subIndustry)),
    employeeSize: normalizeDisplayTextValueRepaired(pickFirstValue(record, schema.companyFields.employeeSize)),
    naics: normalizeDisplayTextValueRepaired(pickFirstValue(record, schema.companyFields.naics)),
    prospectCount: Number(pickFirstValue(record, schema.companyFields.prospectCount) || 0),
    raw: record,
  };
};

const stripSearchResultRow = (row: Record<string, unknown>) => {
  const { rowUsageByShard, raw, ...rest } = row as Record<string, unknown>;
  return rest;
};

const buildProspectDedupeKey = (row: any) => {
  const emailKey = normalizeText(row.email);
  if (emailKey) return `email:${emailKey}`;

  const linkedinKey = normalizeText(row.linkedin);
  if (linkedinKey) return `linkedin:${linkedinKey}`;

  return `fallback:${normalizeText(row.fullName)}|${normalizeText(row.companyName)}|${normalizeText(row.country)}`;
};

const buildCompanyDedupeKey = (row: any) => {
  const domainKey = normalizeText(row.domain);
  if (domainKey) return `domain:${domainKey}`;

  return `fallback:${normalizeText(row.companyName)}|${normalizeText(row.country)}`;
};

const rankProspect = (row: any) => {
  let score = 0;
  if (row.email) score += 4;
  if (row.phone) score += 2;
  if (row.jobLevel) score += 1;
  if (row.jobFunction) score += 1;
  if (row.region) score += 1;
  return score;
};

const rankCompany = (row: any) => {
  let score = 0;
  if (row.domain) score += 3;
  if (row.employeeSize) score += 1;
  if (row.region) score += 1;
  return score;
};

const compareSortIdentifier = (left: unknown, right: unknown) => {
  const leftText = String(left || "").trim();
  const rightText = String(right || "").trim();
  const leftNumeric = /^-?\d+(?:\.\d+)?$/.test(leftText) ? Number(leftText) : null;
  const rightNumeric = /^-?\d+(?:\.\d+)?$/.test(rightText) ? Number(rightText) : null;

  if (leftNumeric !== null && rightNumeric !== null) {
    return leftNumeric - rightNumeric;
  }

  return leftText.localeCompare(rightText);
};

// Cursor pagination advances raw shard offsets, so merged row ordering must mirror
// the shard query ordering as closely as possible. Reordering by display fields like
// full name can cause rows from page 1 to reappear on page 2.
const compareProspects = (left: any, right: any) =>
  String(left.companyName || "").localeCompare(String(right.companyName || "")) ||
  compareSortIdentifier(left.sourceRecordId, right.sourceRecordId);

const compareCompanies = (left: any, right: any) =>
  String(left.companyName || "").localeCompare(String(right.companyName || "")) ||
  String(left.country || "").localeCompare(String(right.country || "")) ||
  String(left.domain || "").localeCompare(String(right.domain || "")) ||
  compareSortIdentifier(left.sourceRecordId, right.sourceRecordId);

const normalizeRowUsageByShard = (row: any) => {
  if (row?.rowUsageByShard && typeof row.rowUsageByShard === "object") {
    return Object.fromEntries(
      Object.entries(row.rowUsageByShard)
        .map(([shardIndex, usage]) => [String(shardIndex), Number(usage || 0)])
        .filter(([, usage]) => Number.isFinite(usage) && usage > 0),
    );
  }

  const shardIndex = Number(row?.sourceShard || 0);
  const rowUsage = Number(row?.rowUsage || 1);
  if (!Number.isFinite(shardIndex) || shardIndex <= 0) {
    return {};
  }

  return {
    [String(shardIndex)]: Number.isFinite(rowUsage) && rowUsage > 0 ? rowUsage : 1,
  };
};

const mergeRowUsageByShard = (left: Record<string, number> = {}, right: Record<string, number> = {}) => {
  const merged = { ...left };
  Object.entries(right).forEach(([shardIndex, usage]) => {
    merged[shardIndex] = Number(merged[shardIndex] || 0) + Number(usage || 0);
  });
  return merged;
};

const mergeAndDedupeRows = (mode: "prospects" | "companies", rows: any[]) => {
  const map = new Map();

  rows.forEach((row) => {
    const key = mode === "prospects" ? buildProspectDedupeKey(row) : buildCompanyDedupeKey(row);
    const rowUsageByShard = normalizeRowUsageByShard(row);
    const current = map.get(key);
    if (!current) {
      map.set(key, { ...row, rowUsageByShard });
      return;
    }

    const mergedUsageByShard = mergeRowUsageByShard(current.rowUsageByShard, rowUsageByShard);

    const nextRank = mode === "prospects" ? rankProspect(row) : rankCompany(row);
    const currentRank = mode === "prospects" ? rankProspect(current) : rankCompany(current);
    if (nextRank > currentRank) {
      map.set(key, { ...row, rowUsageByShard: mergedUsageByShard });
      return;
    }

    if (nextRank === currentRank) {
      const comparator = mode === "prospects" ? compareProspects : compareCompanies;
      if (comparator(row, current) < 0) {
        map.set(key, { ...row, rowUsageByShard: mergedUsageByShard });
        return;
      }
    }

    map.set(key, { ...current, rowUsageByShard: mergedUsageByShard });
  });

  const merged = [...map.values()];
  merged.sort(mode === "prospects" ? compareProspects : compareCompanies);
  return merged;
};

const getRowDedupeKey = (mode: "prospects" | "companies", row: any) =>
  mode === "prospects" ? buildProspectDedupeKey(row) : buildCompanyDedupeKey(row);

const filterOutSeenRows = (mode: "prospects" | "companies", rows: any[], seenKeys: Set<string>) => {
  if (!(seenKeys instanceof Set) || seenKeys.size === 0) return rows;
  return rows.filter((row) => !seenKeys.has(getRowDedupeKey(mode, row)));
};

const encodeCursor = (value: unknown) => encodeBase64Url(JSON.stringify(value));

const decodeCursor = (value: unknown) => {
  if (!value) return null;
  try {
    return JSON.parse(decodeBase64Url(String(value)));
  } catch {
    return null;
  }
};

const sanitizeSearchPayload = (mode: "prospects" | "companies", payload: Record<string, unknown> = {}) => {
  const filters = payload?.filters && typeof payload.filters === "object" ? payload.filters : {};
  const normalizeList = (value: unknown) =>
    Array.isArray(value) ? value.map((entry) => String(entry || "").trim()).filter(Boolean) : [];

  const base = {
    pageSize: clampPageSize(payload.pageSize),
    cursor: typeof payload.cursor === "string" ? payload.cursor : null,
  };

  if (mode === "prospects") {
    return {
      ...base,
      filters: {
        jobTitle: String(filters.jobTitle || "").trim(),
        companyName: String(filters.companyName || "").trim(),
        exactCompanyName: String(filters.exactCompanyName || "").trim(),
        companyDomain: String(filters.companyDomain || "").trim(),
        naics: String(filters.naics || "").trim(),
        jobLevel: normalizeList(filters.jobLevel),
        jobFunction: normalizeList(filters.jobFunction),
        country: normalizeList(filters.country),
        industry: normalizeList(filters.industry),
        subIndustry: normalizeList(filters.subIndustry),
        employeeSize: normalizeList(filters.employeeSize),
        region: normalizeList(filters.region),
      },
    };
  }

  return {
    ...base,
    filters: {
      companyName: String(filters.companyName || "").trim(),
      naics: String(filters.naics || "").trim(),
      country: normalizeList(filters.country),
      region: normalizeList(filters.region),
      industry: normalizeList(filters.industry),
      subIndustry: normalizeList(filters.subIndustry),
      employeeSize: normalizeList(filters.employeeSize),
    },
  };
};

const hasActiveFilters = (filters: Record<string, unknown> = {}) =>
  Object.values(filters).some((value) =>
    Array.isArray(value) ? value.length > 0 : String(value || "").trim().length > 0,
  );

const buildOptionsCacheKey = (mode: "prospects" | "companies") => `filter-options:${mode}`;

const buildCatalogFallbackEmail = (catalogRef: unknown) => `${encodeBase64Url(String(catalogRef || "catalog"))}@catalog.local`;

const PROSPECT_SNAPSHOT_COLUMN_CANDIDATES = [
  "user_id",
  "name",
  "email",
  "phone",
  "company",
  "job_title",
  "country",
  "industry",
  "catalog_ref",
  "source_shard",
  "source_record_id",
  "catalog_company_ref",
  "job_level",
  "job_function",
  "sub_industry",
  "employee_size",
  "region",
  "naics",
  "company_domain",
];

const REQUIRED_PROSPECT_SNAPSHOT_COLUMNS = ["user_id", "name", "email"];
const PROSPECT_SNAPSHOT_SCHEMA_TTL_MS = 60 * 1000;

let prospectsSnapshotColumnsCache:
  | {
      checkedAt: number;
      columns: Set<string>;
    }
  | null = null;

const isMissingProspectsColumnError = (error: unknown) => {
  const code = String((error as any)?.code || "").trim();
  const message = getRawErrorMessage(error).toLowerCase();
  return (
    code === "42703" ||
    code === "PGRST204" ||
    message.includes("column prospects.") ||
    message.includes("column of 'prospects' in the schema cache")
  );
};

const loadProspectsSnapshotColumns = async () => {
  if (!admin) {
    throw createHttpError("Supabase service role key is required for list imports.", 500);
  }

  if (
    prospectsSnapshotColumnsCache &&
    Date.now() - prospectsSnapshotColumnsCache.checkedAt < PROSPECT_SNAPSHOT_SCHEMA_TTL_MS
  ) {
    return prospectsSnapshotColumnsCache.columns;
  }

  const checks = await Promise.all(
    PROSPECT_SNAPSHOT_COLUMN_CANDIDATES.map(async (column) => {
      const { error } = await admin.from("prospects").select(column).limit(1);
      if (!error) {
        return [column, true] as const;
      }
      if (isMissingProspectsColumnError(error)) {
        return [column, false] as const;
      }
      throw createHttpError(error.message || `Failed to inspect prospects.${column}.`, 500);
    }),
  );

  const columns = new Set(checks.filter(([, present]) => present).map(([column]) => column));
  const missingRequired = REQUIRED_PROSPECT_SNAPSHOT_COLUMNS.filter((column) => !columns.has(column));
  if (missingRequired.length > 0) {
    throw createHttpError(
      `The prospects table is missing required columns: ${missingRequired.join(", ")}.`,
      500,
    );
  }

  prospectsSnapshotColumnsCache = {
    checkedAt: Date.now(),
    columns,
  };

  return columns;
};

const resetProspectsSnapshotColumnsCache = () => {
  prospectsSnapshotColumnsCache = null;
};

const buildProspectSnapshotRecord = (userId: string, item: any, columns: Set<string>) => {
  const email = String(item.email || buildCatalogFallbackEmail(item.catalogRef))
    .trim()
    .toLowerCase();

  const record: Record<string, unknown> = {
    user_id: userId,
    name: item.fullName || item.companyName || "Unknown prospect",
    email,
  };

  if (columns.has("phone")) record.phone = item.phone || null;
  if (columns.has("company")) record.company = item.companyName || null;
  if (columns.has("job_title")) record.job_title = item.jobTitle || null;
  if (columns.has("country")) record.country = item.country || null;
  if (columns.has("industry")) record.industry = item.industry || null;
  if (columns.has("catalog_ref")) record.catalog_ref = item.catalogRef;
  if (columns.has("source_shard")) record.source_shard = item.sourceShard;
  if (columns.has("source_record_id")) record.source_record_id = item.sourceRecordId;
  if (columns.has("catalog_company_ref")) record.catalog_company_ref = item.catalogCompanyRef || null;
  if (columns.has("job_level")) record.job_level = item.jobLevel || null;
  if (columns.has("job_function")) record.job_function = item.jobFunction || null;
  if (columns.has("sub_industry")) record.sub_industry = item.subIndustry || null;
  if (columns.has("employee_size")) record.employee_size = item.employeeSize || null;
  if (columns.has("region")) record.region = item.region || null;
  if (columns.has("naics")) record.naics = item.naics || null;
  if (columns.has("company_domain")) record.company_domain = item.companyDomain || null;

  return record;
};

const saveProspectSnapshotsWithLegacySchema = async (userId: string, snapshots: Record<string, unknown>[]) => {
  if (!admin) {
    throw createHttpError("Supabase service role key is required for list imports.", 500);
  }

  const dedupedSnapshots = [];
  const seenEmails = new Set<string>();

  for (const snapshot of snapshots) {
    const normalizedEmail = String(snapshot.email || "")
      .trim()
      .toLowerCase();
    if (!normalizedEmail || seenEmails.has(normalizedEmail)) continue;
    seenEmails.add(normalizedEmail);
    dedupedSnapshots.push({
      ...snapshot,
      email: normalizedEmail,
    });
  }

  const emails = dedupedSnapshots.map((snapshot) => String(snapshot.email || ""));
  const existingByEmail = new Map<string, string>();

  if (emails.length > 0) {
    const { data: existingRows, error: existingError } = await admin
      .from("prospects")
      .select("id, email")
      .eq("user_id", userId)
      .in("email", emails);

    if (existingError) {
      throw createHttpError(existingError.message || "Failed to load existing prospects.", 500);
    }

    for (const row of existingRows || []) {
      const email = String(row.email || "")
        .trim()
        .toLowerCase();
      if (email && row.id) {
        existingByEmail.set(email, row.id);
      }
    }
  }

  const rowsToInsert = dedupedSnapshots.filter((snapshot) => !existingByEmail.has(String(snapshot.email || "")));

  if (rowsToInsert.length > 0) {
    const { data: insertedRows, error: insertError } = await admin
      .from("prospects")
      .insert(rowsToInsert)
      .select("id, email");

    if (insertError) {
      throw createHttpError(insertError.message || "Failed to save prospect snapshots.", 500);
    }

    for (const row of insertedRows || []) {
      const email = String(row.email || "")
        .trim()
        .toLowerCase();
      if (email && row.id) {
        existingByEmail.set(email, row.id);
      }
    }
  }

  return existingByEmail;
};

const buildUserSupabaseClient = (authHeader: string) => {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  const headers = authHeader ? { Authorization: authHeader } : {};
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers },
    auth: { persistSession: false },
  });
};

const authenticateRequest = async (req: Request, authHeader: string) => {
  const apiKey = String(req.headers.get("apikey") || "").trim();
  const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  const bearerPayload = decodeJwtPayload(bearerToken);
  const apiKeyPayload = decodeJwtPayload(apiKey);
  if (
    (SUPABASE_SERVICE_ROLE_KEY &&
      (authHeader === `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` || apiKey === SUPABASE_SERVICE_ROLE_KEY)) ||
    (bearerPayload?.role === "service_role" && (!MAIN_PROJECT_REF || bearerPayload?.ref === MAIN_PROJECT_REF)) ||
    (apiKeyPayload?.role === "service_role" && (!MAIN_PROJECT_REF || apiKeyPayload?.ref === MAIN_PROJECT_REF))
  ) {
    return { id: "catalog-search-internal", email: "internal@catalog-search.local" };
  }

  if (!authHeader?.startsWith("Bearer ")) {
    if (SEARCH_BYPASS_AUTH && admin) {
      return { id: "search-bypass-user", email: "bypass@local.dev" };
    }
    return null;
  }

  const token = authHeader.replace("Bearer ", "").trim();
  if (!token) {
    return SEARCH_BYPASS_AUTH && admin ? { id: "search-bypass-user", email: "bypass@local.dev" } : null;
  }

  if (!admin) return null;
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) {
    return SEARCH_BYPASS_AUTH ? { id: "search-bypass-user", email: "bypass@local.dev" } : null;
  }

  return data.user;
};

const getWorkspaceContext = async (authHeader: string) => {
  const client = buildUserSupabaseClient(authHeader);
  if (!client) {
    throw createHttpError("SUPABASE_ANON_KEY is required for workspace lookups.", 500);
  }

  const { data, error } = await client.rpc("get_workspace_context");
  if (error) {
    throw createHttpError(error.message || "Failed to load workspace context.", 500);
  }

  return Array.isArray(data) ? (data[0] ?? null) : (data ?? null);
};

const canManageContacts = (workspaceContext: any) => {
  const permissions = Array.isArray(workspaceContext?.permissions) ? workspaceContext.permissions : [];
  return permissions.includes("manage_contacts") || permissions.includes("manage_workspace");
};

const addTextFilter = (query: any, column: string, value: unknown) =>
  value ? query.ilike(column, `%${String(value).trim()}%`) : query;
const addExactTextFilter = (query: any, column: string, value: unknown) =>
  value ? query.eq(column, String(value).trim()) : query;

const addInFilter = (query: any, column: string, values: string[]) =>
  Array.isArray(values) && values.length > 0 ? query.in(column, values) : query;

let schema = buildSchemaConfig(ENV);
let shardSlots = buildShardConfigs(ENV);
let activeShards = shardSlots.filter((slot: any) => slot.status === "active");
let invalidShards = shardSlots.filter((slot: any) => slot.status === "invalid");
let shardClients = buildShardClientMap(activeShards);
let catalogRuntimeHydratedAt = 0;
let catalogRuntimeHydrationPromise: Promise<void> | null = null;

const refreshCatalogRuntime = async (force = false) => {
  if (!admin) return;

  const cacheIsFresh =
    !force &&
    catalogRuntimeHydratedAt > 0 &&
    Date.now() - catalogRuntimeHydratedAt < CATALOG_RUNTIME_TTL_MS;

  if (cacheIsFresh) return;
  if (catalogRuntimeHydrationPromise) {
    await catalogRuntimeHydrationPromise;
    return;
  }

  catalogRuntimeHydrationPromise = (async () => {
    const mergedEnv = { ...ENV };
    const { data, error } = await admin.from("app_secrets").select("key, value");

    if (error) {
      console.warn("[catalog-search] Failed to load app_secrets for shard runtime:", error.message || error);
    } else {
      for (const row of data || []) {
        const key = String(row?.key || "").trim();
        if (!isCatalogRuntimeSecretKey(key)) continue;
        mergedEnv[key] = String(row?.value ?? "");
      }
    }

    schema = buildSchemaConfig(mergedEnv);
    shardSlots = buildShardConfigs(mergedEnv);
    activeShards = shardSlots.filter((slot: any) => slot.status === "active");
    invalidShards = shardSlots.filter((slot: any) => slot.status === "invalid");
    shardClients = buildShardClientMap(activeShards);
    catalogRuntimeHydratedAt = Date.now();
  })();

  try {
    await catalogRuntimeHydrationPromise;
  } finally {
    catalogRuntimeHydrationPromise = null;
  }
};

const applyProspectFilters = (query: any, filters: any) => {
  let next = query;
  next = addTextFilter(next, schema.prospectFilters.jobTitle, filters.jobTitle);
  if (filters.exactCompanyName) {
    next = addExactTextFilter(next, schema.prospectFilters.companyName, filters.exactCompanyName);
  } else {
    next = addTextFilter(next, schema.prospectFilters.companyName, filters.companyName);
  }
  const companyDomainColumn = schema.prospectFields.companyDomain?.[0] || "";
  if (companyDomainColumn) {
    next = addExactTextFilter(next, companyDomainColumn, filters.companyDomain);
  }
  next = addTextFilter(next, schema.prospectFilters.naics, filters.naics);
  next = addInFilter(next, schema.prospectFilters.jobLevel, filters.jobLevel);
  next = addInFilter(next, schema.prospectFilters.jobFunction, filters.jobFunction);
  next = addInFilter(next, schema.prospectFilters.country, filters.country);
  next = addInFilter(next, schema.prospectFilters.industry, filters.industry);
  next = addInFilter(next, schema.prospectFilters.subIndustry, filters.subIndustry);
  next = addInFilter(next, schema.prospectFilters.employeeSize, filters.employeeSize);
  next = addInFilter(next, schema.prospectFilters.region, filters.region);
  return next;
};

const applyCompanyFilters = (query: any, filters: any) => {
  let next = query;
  next = addTextFilter(next, schema.companyFilters.companyName, filters.companyName);
  next = addTextFilter(next, schema.companyFilters.naics, filters.naics);
  next = addInFilter(next, schema.companyFilters.country, filters.country);
  next = addInFilter(next, schema.companyFilters.region, filters.region);
  next = addInFilter(next, schema.companyFilters.industry, filters.industry);
  next = addInFilter(next, schema.companyFilters.subIndustry, filters.subIndustry);
  next = addInFilter(next, schema.companyFilters.employeeSize, filters.employeeSize);
  return next;
};

const encodeDerivedCompanySourceId = (value: unknown) => encodeCursor(value);

const decodeDerivedCompanySourceId = (value: unknown) => {
  const decoded = decodeCursor(value);
  return decoded && typeof decoded === "object" ? decoded : null;
};

const buildDerivedCompanyKey = (row: any) => {
  const domain = normalizeText(row.companyDomain);
  if (domain) return `domain:${domain}`;
  return `fallback:${normalizeText(row.companyName)}|${normalizeText(row.country)}`;
};

const buildDerivedCompanyRows = (records: Record<string, unknown>[], shardIndex: number) => {
  const normalizedProspects = records.map((record) => normalizeProspectRow(record, shardIndex, schema));
  const groupsByKey = new Map();
  const orderedGroups = [];

  normalizedProspects.forEach((prospect) => {
    const companyKey = buildDerivedCompanyKey(prospect);
    let group = groupsByKey.get(companyKey);

    if (!group) {
      const sourceId = encodeDerivedCompanySourceId({
        companyName: prospect.companyName || "",
        domain: prospect.companyDomain || "",
        country: prospect.country || "",
      });

      group = {
        catalogRef: `s${shardIndex}:company:${sourceId}`,
        sourceShard: shardIndex,
        sourceRecordId: sourceId,
        companyName: prospect.companyName || "Unknown company",
        domain: prospect.companyDomain || null,
        country: prospect.country || null,
        region: prospect.region || null,
        industry: prospect.industry || null,
        subIndustry: prospect.subIndustry || null,
        employeeSize: prospect.employeeSize || null,
        naics: prospect.naics || null,
        prospectCount: 0,
        __companyKey: companyKey,
        __rawCount: 0,
      };

      groupsByKey.set(companyKey, group);
      orderedGroups.push(group);
    }

    group.__rawCount += 1;
    group.prospectCount += 1;
    if (!group.domain && prospect.companyDomain) group.domain = prospect.companyDomain;
    if (!group.country && prospect.country) group.country = prospect.country;
    if (!group.region && prospect.region) group.region = prospect.region;
    if (!group.industry && prospect.industry) group.industry = prospect.industry;
    if (!group.subIndustry && prospect.subIndustry) group.subIndustry = prospect.subIndustry;
    if (!group.employeeSize && prospect.employeeSize) group.employeeSize = prospect.employeeSize;
    if (!group.naics && prospect.naics) group.naics = prospect.naics;
  });

  return orderedGroups;
};

const getModeConfig = (mode: "prospects" | "companies") => {
  if (mode === "prospects") {
    return {
      source: schema.prospectSource,
      idColumn: schema.prospectIdColumn,
      selectColumns: buildSelectColumns(schema.prospectFields),
      normalize: (record: Record<string, unknown>, shardIndex: number) => normalizeProspectRow(record, shardIndex, schema),
      defaultSort: [schema.prospectFilters.companyName, schema.prospectIdColumn],
      applyFilters: applyProspectFilters,
      filterFields: {
        jobLevel: schema.prospectFilters.jobLevel,
        jobFunction: schema.prospectFilters.jobFunction,
        country: schema.prospectFilters.country,
        industry: schema.prospectFilters.industry,
        subIndustry: schema.prospectFilters.subIndustry,
        employeeSize: schema.prospectFilters.employeeSize,
        region: schema.prospectFilters.region,
      },
    };
  }

  if (schema.deriveCompaniesFromProspects) {
    return {
      source: schema.prospectSource,
      idColumn: schema.prospectIdColumn,
      selectColumns: buildSelectColumns(schema.prospectFields),
      normalize: null,
      defaultSort: [schema.prospectFilters.companyName, schema.prospectFilters.country, schema.prospectIdColumn],
      applyFilters: applyCompanyFilters,
      filterFields: {
        country: schema.companyFilters.country,
        region: schema.companyFilters.region,
        industry: schema.companyFilters.industry,
        subIndustry: schema.companyFilters.subIndustry,
        employeeSize: schema.companyFilters.employeeSize,
      },
      derivedFromProspects: true,
    };
  }

  return {
    source: schema.companySource,
    idColumn: schema.companyIdColumn,
    selectColumns: buildSelectColumns(schema.companyFields),
    normalize: (record: Record<string, unknown>, shardIndex: number) => normalizeCompanyRow(record, shardIndex, schema),
    defaultSort: [schema.companyFilters.companyName, schema.companyIdColumn],
    applyFilters: applyCompanyFilters,
    filterFields: {
      country: schema.companyFilters.country,
      region: schema.companyFilters.region,
      industry: schema.companyFilters.industry,
      subIndustry: schema.companyFilters.subIndustry,
      employeeSize: schema.companyFilters.employeeSize,
    },
  };
};

const buildShardStatus = (runtimeResults: any[]) => {
  const configuredCount = shardSlots.filter((slot: any) => slot.status !== "inactive").length;
  const warnings = [
    ...invalidShards.map((slot: any) => `Shard ${slot.index}: ${slot.reason}`),
    ...runtimeResults
      .filter((entry) => entry.status === "failed")
      .map((entry) => `Shard ${entry.shard.index}: ${entry.reason}`),
  ];

  return {
    requestedSlots: shardSlots.length,
    configured: configuredCount,
    healthy: runtimeResults.filter((entry) => entry.status === "healthy").length,
    failed: warnings.length,
    inactive: shardSlots.filter((slot: any) => slot.status === "inactive").length,
    warnings,
  };
};

const getQueryResultError = (result: any) =>
  result && typeof result === "object" && "error" in result ? result.error : null;

const hasFiniteNumericValue = (value: unknown) =>
  value !== null && value !== undefined && String(value).trim() !== "" && Number.isFinite(Number(value));

const hasBroadTextFilters = (mode: "prospects" | "companies", filters: Record<string, unknown> = {}) => {
  const getTextValue = (key: string) => String(filters?.[key] || "").trim();

  if (mode === "prospects") {
    return Boolean(getTextValue("jobTitle") || getTextValue("companyName") || getTextValue("naics"));
  }

  return Boolean(getTextValue("companyName") || getTextValue("naics"));
};

const getShardBatchLimit = (
  mode: "prospects" | "companies",
  modeConfig: any,
  pageSize: number,
  filters: Record<string, unknown> = {},
) => {
  if (modeConfig.derivedFromProspects) {
    return hasBroadTextFilters(mode, filters) ? Math.min(pageSize * 3, 120) : Math.min(pageSize * 12, 400);
  }

  return hasBroadTextFilters(mode, filters) ? Math.min(pageSize + 5, 60) : Math.min(pageSize * 4, 200);
};

const shouldSkipCountEstimate = (mode: "prospects" | "companies", filters: Record<string, unknown> = {}) =>
  hasBroadTextFilters(mode, filters);

const runShardQuery = async ({
  client,
  modeConfig,
  filters,
  offset,
  limit,
  includeCount,
  sortColumns,
}: {
  client: any;
  modeConfig: any;
  filters: any;
  offset: number;
  limit: number;
  includeCount: boolean;
  sortColumns?: string[];
}) => {
  let query = client.from(modeConfig.source).select(modeConfig.selectColumns, includeCount ? { count: "planned" } : undefined);
  query = modeConfig.applyFilters(query, filters);
  for (const column of sortColumns || modeConfig.defaultSort) {
    query = query.order(column, { ascending: true, nullsFirst: false });
  }
  return query.range(offset, offset + limit - 1);
};

const runShardPageQuery = async ({
  client,
  modeConfig,
  filters,
  offset,
  limit,
  sortColumns,
  maxRetries = 2,
}: {
  client: any;
  modeConfig: any;
  filters: any;
  offset: number;
  limit: number;
  sortColumns?: string[];
  maxRetries?: number;
}) => {
  const result = await executeShardOperation(
    () =>
      runShardQuery({
        client,
        modeConfig,
        filters,
        offset,
        limit,
        includeCount: false,
        sortColumns,
      }),
    maxRetries,
  );
  const error = getQueryResultError(result);
  if (error) throw error;
  return result;
};

const runShardPageQueryWithFallback = async ({
  client,
  modeConfig,
  filters,
  offset,
  limit,
}: {
  client: any;
  modeConfig: any;
  filters: any;
  offset: number;
  limit: number;
}) => {
  try {
    return await runShardPageQuery({
      client,
      modeConfig,
      filters,
      offset,
      limit,
    });
  } catch (error) {
    if (isStatementTimeoutMessage(getRawErrorMessage(error))) {
      const minimumFallbackLimit = Math.min(limit, 10);
      const fallbackLimits: number[] = [];
      let nextLimit = Math.max(minimumFallbackLimit, Math.ceil(limit / 2));

      while (nextLimit < limit) {
        fallbackLimits.push(nextLimit);
        if (nextLimit === minimumFallbackLimit) break;
        nextLimit = Math.max(minimumFallbackLimit, Math.ceil(nextLimit / 2));
      }

      for (const fallbackLimit of fallbackLimits) {
        try {
          return await runShardPageQuery({
            client,
            modeConfig,
            filters,
            offset,
            limit: fallbackLimit,
            sortColumns: modeConfig.defaultSort,
            maxRetries: 0,
          });
        } catch (reducedError) {
          if (!isStatementTimeoutMessage(getRawErrorMessage(reducedError))) {
            throw reducedError;
          }
        }
      }

      if (modeConfig.idColumn) {
        for (const fallbackLimit of fallbackLimits.length > 0 ? fallbackLimits : [minimumFallbackLimit]) {
          try {
            return await runShardPageQuery({
              client,
              modeConfig,
              filters,
              offset,
              limit: Math.max(minimumFallbackLimit, Math.min(fallbackLimit, DEFAULT_SEARCH_PAGE_SIZE)),
              sortColumns: [modeConfig.idColumn],
              maxRetries: 0,
            });
          } catch (idFallbackError) {
            if (!isStatementTimeoutMessage(getRawErrorMessage(idFallbackError))) {
              throw idFallbackError;
            }
          }
        }
      }
    }

    throw error;
  }
};

const runShardCountEstimateQuery = async ({
  client,
  modeConfig,
  filters,
}: {
  client: any;
  modeConfig: any;
  filters: any;
}) => {
  let query = client.from(modeConfig.source).select(modeConfig.idColumn, { count: "estimated", head: true });
  query = modeConfig.applyFilters(query, filters);
  return query;
};

const fetchShardCountEstimate = async (mode: "prospects" | "companies", shard: any, filters: any) => {
  const modeConfig = getModeConfig(mode);
  const client = shardClients.get(shard.index);

  if (!client || shouldSkipCountEstimate(mode, filters)) return null;

  try {
    const { count, error } = await executeShardOperation(() =>
      runShardCountEstimateQuery({
        client,
        modeConfig,
        filters,
      }),
    );
    if (error) return null;
    return count !== null && count !== undefined ? Number(count || 0) : null;
  } catch {
    return null;
  }
};

const fetchShardPage = async (
  mode: "prospects" | "companies",
  shard: any,
  payload: any,
  offsets: Record<string, number>,
  seenKeys: Set<string>,
  estimatedCount?: number | null,
) => {
  const modeConfig = getModeConfig(mode);
  const client = shardClients.get(shard.index);
  const pageSize = clampPageSize(payload.pageSize);
  const offset = Number(offsets?.[String(shard.index)] || 0);

  if (!client) {
    return {
      status: "failed",
      shard,
      rows: [],
      count: 0,
      offset,
      reason: "Shard client is not available",
    };
  }

  if (modeConfig.derivedFromProspects) {
    const limit = getShardBatchLimit(mode, modeConfig, pageSize, payload.filters);
    let count = 0;
    const shouldScanExhaustively =
      offset === 0 &&
      hasActiveFilters(payload.filters) &&
      hasFiniteNumericValue(estimatedCount) &&
      Number(estimatedCount) <= EXHAUSTIVE_SCAN_ESTIMATE_THRESHOLD;
    let nextOffset = offset;
    let rawRows = [];
    let groupedRows = [];
    let availableRows = [];
    let exhausted = false;

    try {
      for (let batchIndex = 0; batchIndex < MAX_SEARCH_BATCHES_PER_SHARD; batchIndex += 1) {
        const result = await runShardPageQueryWithFallback({
          client,
          modeConfig,
          filters: payload.filters,
          offset: nextOffset,
          limit,
        });

        const { data, error } = result;
        if (error) throw error;

        const batchRows = Array.isArray(data) ? data : [];
        if (batchRows.length === 0) {
          exhausted = true;
          break;
        }

        rawRows = rawRows.concat(batchRows);
        nextOffset += batchRows.length;
        count = Math.max(count, nextOffset);
        groupedRows = buildDerivedCompanyRows(rawRows, shard.index);
        availableRows = filterOutSeenRows(mode, groupedRows, seenKeys);

        exhausted = batchRows.length < limit;
        if (exhausted) break;

        if (!shouldScanExhaustively && availableRows.length >= pageSize + 1) break;
      }

      const rows = groupedRows.map(
        ({ __companyKey, __rawCount, ...row }) => ({
          ...row,
          rowUsageByShard: {
            [String(shard.index)]: Number(__rawCount || 1),
          },
        }),
      );

      return {
        status: "healthy",
        shard,
        rows,
        count,
        offset,
        exhausted,
      };
    } catch (error) {
      return {
        status: "failed",
        shard,
        rows: [],
        count: 0,
        offset,
        exhausted: true,
        reason: getErrorMessage(error) || "Search query failed",
      };
    }
  }

  const limit = getShardBatchLimit(mode, modeConfig, pageSize, payload.filters);

  try {
    let count = 0;
    const shouldScanExhaustively =
      offset === 0 &&
      hasActiveFilters(payload.filters) &&
      hasFiniteNumericValue(estimatedCount) &&
      Number(estimatedCount) <= EXHAUSTIVE_SCAN_ESTIMATE_THRESHOLD;
    let nextOffset = offset;
    let rawRows = [];
    let mergedRows = [];
    let availableRows = [];
    let exhausted = false;

    for (let batchIndex = 0; batchIndex < MAX_SEARCH_BATCHES_PER_SHARD; batchIndex += 1) {
      const result = await runShardPageQueryWithFallback({
        client,
        modeConfig,
        filters: payload.filters,
        offset: nextOffset,
        limit,
      });

      const { data, error } = result;
      if (error) throw error;

      const batchRecords = Array.isArray(data) ? data : [];

      if (batchRecords.length === 0) {
        exhausted = true;
        break;
      }

      rawRows = rawRows.concat(batchRecords.map((record) => modeConfig.normalize(record, shard.index)));
      nextOffset += batchRecords.length;
      count = Math.max(count, nextOffset);
      mergedRows = mergeAndDedupeRows(mode, rawRows);
      availableRows = filterOutSeenRows(mode, mergedRows, seenKeys);

      exhausted = batchRecords.length < limit;
      if (exhausted) break;

      if (!shouldScanExhaustively && availableRows.length >= pageSize + 1) break;
    }

    return {
      status: "healthy",
      shard,
      rows: mergedRows,
      count,
      offset,
      exhausted,
    };
  } catch (error) {
    return {
      status: "failed",
      shard,
      rows: [],
      count: 0,
      offset,
      exhausted: true,
      reason: getErrorMessage(error) || "Search query failed",
    };
  }
};

const fetchShardAllRows = async (
  mode: "prospects" | "companies",
  shard: any,
  payload: any,
) => {
  const modeConfig = getModeConfig(mode);
  const client = shardClients.get(shard.index);
  const pageSize = clampPageSize(payload.pageSize);

  if (!client) {
    return {
      status: "failed",
      shard,
      rows: [],
      count: 0,
      offset: 0,
      exhausted: true,
      reason: "Shard client is not available",
    };
  }

  if (modeConfig.derivedFromProspects) {
    const limit = getShardBatchLimit(mode, modeConfig, pageSize, payload.filters);
    let nextOffset = 0;
    let rawRows = [];
    let groupedRows = [];
    let exhausted = false;

    try {
      for (let batchIndex = 0; batchIndex < MAX_SEARCH_BATCHES_PER_SHARD; batchIndex += 1) {
        const result = await runShardPageQueryWithFallback({
          client,
          modeConfig,
          filters: payload.filters,
          offset: nextOffset,
          limit,
        });

        const { data, error } = result;
        if (error) throw error;

        const batchRows = Array.isArray(data) ? data : [];
        if (batchRows.length === 0) {
          exhausted = true;
          break;
        }

        rawRows = rawRows.concat(batchRows);
        nextOffset += batchRows.length;
        groupedRows = buildDerivedCompanyRows(rawRows, shard.index);

        exhausted = batchRows.length < limit;
        if (exhausted) break;
      }

      return {
        status: "healthy",
        shard,
        rows: groupedRows.map(({ __companyKey, __rawCount, ...row }) => ({
          ...row,
          rowUsageByShard: {
            [String(shard.index)]: Number(__rawCount || 1),
          },
        })),
        count: nextOffset,
        offset: 0,
        exhausted,
      };
    } catch (error) {
      return {
        status: "failed",
        shard,
        rows: [],
        count: 0,
        offset: 0,
        exhausted: true,
        reason: getErrorMessage(error) || "Search query failed",
      };
    }
  }

  const limit = getShardBatchLimit(mode, modeConfig, pageSize, payload.filters);
  let nextOffset = 0;
  let rawRows = [];
  let exhausted = false;

  try {
    for (let batchIndex = 0; batchIndex < MAX_SEARCH_BATCHES_PER_SHARD; batchIndex += 1) {
      const result = await runShardPageQueryWithFallback({
        client,
        modeConfig,
        filters: payload.filters,
        offset: nextOffset,
        limit,
      });

      const { data, error } = result;
      if (error) throw error;

      const batchRecords = Array.isArray(data) ? data : [];
      if (batchRecords.length === 0) {
        exhausted = true;
        break;
      }

      rawRows = rawRows.concat(batchRecords.map((record) => modeConfig.normalize(record, shard.index)));
      nextOffset += batchRecords.length;

      exhausted = batchRecords.length < limit;
      if (exhausted) break;
    }

    return {
      status: "healthy",
      shard,
      rows: mergeAndDedupeRows(mode, rawRows),
      count: nextOffset,
      offset: 0,
      exhausted,
    };
  } catch (error) {
    return {
      status: "failed",
      shard,
      rows: [],
      count: 0,
      offset: 0,
      exhausted: true,
      reason: getErrorMessage(error) || "Search query failed",
    };
  }
};

const buildNextCursor = (
  mode: "prospects" | "companies",
  currentOffsets: Record<string, number>,
  selectedRows: any[],
  shardResults: any[],
  availableRowCount: number,
  priorSeenKeys: Set<string>,
  displayTotal?: number | null,
) => {
  const nextOffsets = { ...(currentOffsets || {}) };
  const perShardConsumed = new Map();
  const nextSeenKeys = new Set(priorSeenKeys instanceof Set ? [...priorSeenKeys] : []);
  selectedRows.forEach((row) => nextSeenKeys.add(getRowDedupeKey(mode, row)));

  shardResults
    .filter((entry) => entry.status === "healthy")
    .forEach((entry) => {
      entry.rows.forEach((row: any) => {
        if (!nextSeenKeys.has(getRowDedupeKey(mode, row))) return;
        const rowUsageByShard = normalizeRowUsageByShard(row);
        Object.entries(rowUsageByShard).forEach(([shardIndex, usage]) => {
          const shardKey = Number(shardIndex);
          const current = perShardConsumed.get(shardKey) || 0;
          perShardConsumed.set(shardKey, current + Number(usage || 0));
        });
      });
    });

  shardResults
    .filter((entry) => entry.status === "healthy")
    .forEach((entry) => {
      const current = Number(currentOffsets?.[String(entry.shard.index)] || 0);
      const consumed = perShardConsumed.get(entry.shard.index) || 0;
      nextOffsets[String(entry.shard.index)] = current + consumed;
    });

  const hasMore =
    availableRowCount > selectedRows.length ||
    shardResults
      .filter((entry) => entry.status === "healthy")
      .some((entry) => !entry.exhausted);

  return hasMore
    ? encodeCursor({
        mode,
        offsets: nextOffsets,
        seenKeys: [...nextSeenKeys],
        ...(Number.isFinite(Number(displayTotal)) ? { displayTotal: Number(displayTotal) } : {}),
      })
    : null;
};

const runSearch = async (mode: "prospects" | "companies", payload: Record<string, unknown>) => {
  if (activeShards.length === 0) {
    throw createHttpError("No active search shards are configured.", 503);
  }

  const searchPayload = sanitizeSearchPayload(mode, payload);
  const cursor = decodeCursor(searchPayload.cursor);
  const exhaustiveOffset =
    cursor?.mode === mode && cursor?.pagination === "exhaustive" && Number.isFinite(Number(cursor?.offset))
      ? Math.max(0, Number(cursor.offset))
      : 0;
  if (cursor?.mode === mode && cursor?.pagination === "exhaustive") {
    const shardResults = await Promise.all(
      activeShards.map((shard: any) => fetchShardAllRows(mode, shard, searchPayload)),
    );
    const shardStatus = buildShardStatus(shardResults);
    const hasShardFailures = shardResults.some((entry) => entry.status !== "healthy");
    const healthyResults = shardResults.filter((entry) => entry.status === "healthy");

    if (healthyResults.length === 0) {
      throw createHttpError("All configured search shards failed.", 503, { shardStatus });
    }

    const mergedRows = mergeAndDedupeRows(
      mode,
      healthyResults.flatMap((entry) => entry.rows),
    );
    const totalExact = healthyResults.every((entry) => entry.exhausted) ? mergedRows.length : null;
    const items = mergedRows.slice(exhaustiveOffset, exhaustiveOffset + searchPayload.pageSize);
    const nextOffset = exhaustiveOffset + items.length;
    const totalDisplay = totalExact ?? Number(cursor?.displayTotal || mergedRows.length);

    return {
      items: items.map((row) => stripSearchResultRow(row)),
      nextCursor:
        totalExact !== null && nextOffset < mergedRows.length
          ? encodeCursor({
              mode,
              pagination: "exhaustive",
              offset: nextOffset,
              displayTotal: totalExact,
            })
          : null,
      totalApprox: totalDisplay,
      totalIsExact: totalExact !== null && !hasShardFailures,
      shardStatus,
    };
  }
  const offsets =
    cursor?.mode === mode && cursor?.offsets && typeof cursor.offsets === "object" ? cursor.offsets : {};
  const priorSeenKeys =
    cursor?.mode === mode && Array.isArray(cursor?.seenKeys)
      ? new Set(cursor.seenKeys.map((value: unknown) => String(value || "")))
      : new Set<string>();
  const displayTotalFromCursor =
    cursor?.mode === mode && hasFiniteNumericValue(cursor?.displayTotal ?? cursor?.totalExact)
      ? Number(cursor.displayTotal ?? cursor.totalExact)
      : null;
  const estimatedCounts =
    displayTotalFromCursor === null
      ? await Promise.all(activeShards.map((shard: any) => fetchShardCountEstimate(mode, shard, searchPayload.filters)))
      : null;
  const estimatedCountByShard = new Map(
    activeShards.map((shard: any, index: number) => [shard.index, Array.isArray(estimatedCounts) ? estimatedCounts[index] : null]),
  );

  const shardResults = await Promise.all(
    activeShards.map((shard: any) =>
      fetchShardPage(mode, shard, searchPayload, offsets, priorSeenKeys, estimatedCountByShard.get(shard.index) ?? null),
    ),
  );
  const shardStatus = buildShardStatus(shardResults);
  const hasShardFailures = shardResults.some((entry) => entry.status !== "healthy");
  const healthyResults = shardResults.filter((entry) => entry.status === "healthy");

  if (healthyResults.length === 0) {
    throw createHttpError("All configured search shards failed.", 503, { shardStatus });
  }

  const mergedRows = mergeAndDedupeRows(
    mode,
    healthyResults.flatMap((entry) => entry.rows),
  );
  const availableRows = filterOutSeenRows(mode, mergedRows, priorSeenKeys);
  const items = availableRows.slice(0, searchPayload.pageSize);
  const totalExact = healthyResults.every((entry) => entry.exhausted) ? mergedRows.length : null;
  const estimatedTotal =
    Array.isArray(estimatedCounts) && estimatedCounts.some((value) => hasFiniteNumericValue(value))
      ? estimatedCounts.reduce((sum, value) => sum + Number(value || 0), 0)
      : null;
  const totalApprox =
    displayTotalFromCursor ??
    totalExact ??
    estimatedTotal ??
    shardResults.reduce((sum, entry) => sum + Number(entry.count || 0), 0);

  return {
    items: items.map((row) => stripSearchResultRow(row)),
    nextCursor: buildNextCursor(mode, offsets, items, shardResults, availableRows.length, priorSeenKeys, totalApprox),
    totalApprox,
    totalIsExact: totalExact !== null && !hasShardFailures,
    shardStatus,
  };
};

const getDetail = async (catalogRef: string) => {
  const parsed = parseCatalogRef(catalogRef);
  if (!parsed) {
    throw createHttpError("Invalid catalog reference.", 400);
  }

  const shard = activeShards.find((entry: any) => entry.index === parsed.shardIndex);
  if (!shard) {
    throw createHttpError(`Shard ${parsed?.shardIndex ?? "?"} is not active.`, 404);
  }

  const mode = parsed.entity === "prospect" ? "prospects" : "companies";
  const modeConfig = getModeConfig(mode);
  const client = shardClients.get(shard.index);

  if (!client) {
    throw createHttpError(`Shard ${shard.index} is unavailable.`, 503);
  }

  if (mode === "companies" && modeConfig.derivedFromProspects) {
    const decoded = decodeDerivedCompanySourceId(parsed.sourceId);
    if (!decoded) {
      throw createHttpError("Invalid derived company reference.", 400);
    }

    let query = client.from(modeConfig.source).select("*").limit(25);
    if (decoded.companyName) {
      query = query.ilike(schema.prospectFilters.companyName, `%${String(decoded.companyName).trim()}%`);
    }
    const companyDomainColumn = schema.prospectFields.companyDomain?.[0] || "";
    if (decoded.domain && companyDomainColumn) {
      query = query.eq(companyDomainColumn, decoded.domain);
    }
    if (decoded.country) {
      query = query.eq(schema.prospectFilters.country, decoded.country);
    }

    const { data, error } = await query;
    if (error) throw createHttpError(error.message || "Failed to load company detail.", 404);
    if (!Array.isArray(data) || data.length === 0) throw createHttpError("Catalog record not found.", 404);

    const [item] = buildDerivedCompanyRows(data, shard.index).map(({ __companyKey, __rawCount, ...row }) => row);
    if (!item) throw createHttpError("Catalog record not found.", 404);

    return {
      item,
      raw: data,
      shard: {
        index: shard.index,
        projectRef: shard.projectRef,
      },
    };
  }

  const { data, error } = await client
    .from(modeConfig.source)
    .select("*")
    .eq(modeConfig.idColumn, parsed.sourceId)
    .limit(2);

  if (error) throw createHttpError(error.message || "Failed to load catalog record.", 404);
  if (!Array.isArray(data) || data.length === 0) throw createHttpError("Catalog record not found.", 404);

  const [record] = data;
  const warning =
    data.length > 1
      ? `Multiple catalog rows matched ${modeConfig.idColumn}=${parsed.sourceId}; returning the first row.`
      : null;

  return {
    item:
      mode === "prospects"
        ? normalizeProspectRow(record, shard.index, schema)
        : normalizeCompanyRow(record, shard.index, schema),
    raw: record,
    shard: {
      index: shard.index,
      projectRef: shard.projectRef,
    },
    warning,
  };
};

const loadFilterOptions = async (mode: "prospects" | "companies") => {
  if (activeShards.length === 0) {
    throw createHttpError("No active search shards are configured.", 503);
  }

  const cacheKey = buildOptionsCacheKey(mode);
  const cached = filterOptionsCache.get(cacheKey);
  if (cached && Date.now() - cached.createdAt < FILTER_OPTIONS_TTL_MS) {
    return cached.value;
  }

  const modeConfig = getModeConfig(mode);
  const optionFields = Object.entries(modeConfig.filterFields);
  const options = Object.fromEntries(optionFields.map(([key]) => [key, []]));

  await Promise.all(
    optionFields.map(async ([key, column]) => {
      const optionSet = new Set();
      await Promise.all(
        activeShards.map(async (shard: any) => {
          const client = shardClients.get(shard.index);
          if (!client) return;

          try {
            const { count, error: countError } = await client
              .from(modeConfig.source)
              .select(column, { count: "planned", head: true })
              .not(column, "is", null);
            if (countError) return;

            const totalRows = Number(count || 0);
            const offsets = [
              ...new Set(
                FILTER_OPTION_SAMPLE_FACTORS.map((factor) =>
                  Math.max(0, Math.floor(totalRows * factor) - Math.floor(FILTER_OPTION_WINDOW_SIZE / 2)),
                ),
              ),
            ];

            await Promise.all(
              offsets.map(async (offset) => {
                const { data, error } = await client
                  .from(modeConfig.source)
                  .select(column)
                  .not(column, "is", null)
                  .order(column, { ascending: true })
                  .range(offset, offset + FILTER_OPTION_WINDOW_SIZE - 1);
                if (error) return;

                (data || []).forEach((row: Record<string, unknown>) => {
                  const value = String(row?.[column] || "").trim();
                  if (value) optionSet.add(value);
                });
              }),
            );
          } catch {
            // Best-effort only for filter options.
          }
        }),
      );

      options[key] = [...optionSet].sort((left, right) => left.localeCompare(right));
    }),
  );

  const value = {
    mode,
    options,
    generatedAt: new Date().toISOString(),
  };

  filterOptionsCache.set(cacheKey, {
    createdAt: Date.now(),
    value,
  });

  return value;
};

const loadUserLists = async (userId: string) => {
  if (!admin) {
    throw createHttpError("Supabase service role key is required for list imports.", 500);
  }

  const { data, error } = await admin.from("email_lists").select("id, user_id, name").eq("user_id", userId);
  if (error) {
    throw createHttpError(error.message || "Failed to load lists.", 500);
  }

  return data || [];
};

const normalizeImportItems = (items: unknown[]) =>
  items.map((item: Record<string, unknown>) => ({
    catalogRef: String(item.catalogRef || "").trim(),
    sourceShard: Number(item.sourceShard || 0),
    sourceRecordId: String(item.sourceRecordId || "").trim(),
    fullName: String(item.fullName || "").trim(),
    email: String(item.email || "").trim() || null,
    phone: String(item.phone || "").trim() || null,
    jobTitle: String(item.jobTitle || "").trim() || null,
    jobLevel: String(item.jobLevel || "").trim() || null,
    jobFunction: String(item.jobFunction || "").trim() || null,
    companyName: String(item.companyName || "").trim() || null,
    companyDomain: String(item.companyDomain || "").trim() || null,
    country: String(item.country || "").trim() || null,
    region: String(item.region || "").trim() || null,
    industry: String(item.industry || "").trim() || null,
    subIndustry: String(item.subIndustry || "").trim() || null,
    employeeSize: String(item.employeeSize || "").trim() || null,
    naics: String(item.naics || "").trim() || null,
    catalogCompanyRef: item.catalogCompanyRef ? String(item.catalogCompanyRef).trim() : null,
  }));

const saveProspectsToList = async ({
  user,
  workspaceContext,
  listId,
  items,
}: {
  user: any;
  workspaceContext: any;
  listId: string;
  items: any[];
}) => {
  if (!canManageContacts(workspaceContext)) {
    throw createHttpError("You do not have permission to manage contacts.", 403);
  }
  if (!admin) {
    throw createHttpError("Supabase service role key is required for search imports.", 500);
  }

  const availableLists = await loadUserLists(user.id);
  const targetList = availableLists.find((list: any) => list.id === listId);
  if (!targetList) {
    throw createHttpError("List not found.", 404);
  }

  const prospectColumns = await loadProspectsSnapshotColumns();
  const snapshots = items.map((item) => buildProspectSnapshotRecord(user.id, item, prospectColumns));

  let prospectIds: string[] = [];

  if (prospectColumns.has("catalog_ref")) {
    const { data: upsertedProspects, error: snapshotError } = await admin
      .from("prospects")
      .upsert(snapshots, { onConflict: "user_id,catalog_ref" })
      .select("id");

    if (snapshotError) {
      const conflictMessage = getRawErrorMessage(snapshotError).toLowerCase();
      const shouldFallbackToLegacySchema =
        isMissingProspectsColumnError(snapshotError) ||
        conflictMessage.includes("no unique or exclusion constraint matching the on conflict specification");

      if (!shouldFallbackToLegacySchema) {
        throw createHttpError(snapshotError.message || "Failed to save prospect snapshots.", 500);
      }

      resetProspectsSnapshotColumnsCache();
      const legacyIdsByEmail = await saveProspectSnapshotsWithLegacySchema(user.id, snapshots);
      prospectIds = items
        .map((item) => String(item.email || buildCatalogFallbackEmail(item.catalogRef)).trim().toLowerCase())
        .map((email) => legacyIdsByEmail.get(email))
        .filter(Boolean);
    } else {
      prospectIds = (upsertedProspects || []).map((row: any) => row.id).filter(Boolean);
    }
  } else {
    const legacyIdsByEmail = await saveProspectSnapshotsWithLegacySchema(user.id, snapshots);
    prospectIds = items
      .map((item) => String(item.email || buildCatalogFallbackEmail(item.catalogRef)).trim().toLowerCase())
      .map((email) => legacyIdsByEmail.get(email))
      .filter(Boolean);
  }

  prospectIds = [...new Set(prospectIds)];
  if (prospectIds.length === 0) {
    throw createHttpError("No prospect snapshots could be saved for the selected leads.", 500);
  }

  const { data: existingLinks, error: existingLinksError } = await admin
    .from("email_list_prospects")
    .select("prospect_id")
    .eq("list_id", listId)
    .in("prospect_id", prospectIds);

  if (existingLinksError) {
    throw createHttpError(existingLinksError.message || "Failed to load existing list links.", 500);
  }

  const existingIds = new Set((existingLinks || []).map((row: any) => row.prospect_id));
  const newLinks = prospectIds
    .filter((prospectId: string) => !existingIds.has(prospectId))
    .map((prospectId: string) => ({
      list_id: listId,
      prospect_id: prospectId,
    }));

  if (newLinks.length > 0) {
    const { error: linkError } = await admin.from("email_list_prospects").insert(newLinks);
    if (linkError) {
      throw createHttpError(linkError.message || "Failed to link prospects to list.", 500);
    }
  }

  return {
    saved: snapshots.length,
    linked: newLinks.length,
    reused: snapshots.length - newLinks.length,
  };
};

const handleCatalogAction = async (_req: Request, user: any, authHeader: string, payload: Record<string, unknown>) => {
  const action = String(payload.action || "").trim();
  await refreshCatalogRuntime();

  if (action === "filter-options") {
    const mode = payload.mode === "companies" ? "companies" : "prospects";
    return loadFilterOptions(mode);
  }

  if (action === "search-prospects") {
    return runSearch("prospects", payload);
  }

  if (action === "search-companies") {
    return runSearch("companies", payload);
  }

  if (action === "detail-prospect") {
    const catalogRef = String(payload.catalogRef || "").trim();
    if (!catalogRef) {
      throw createHttpError("catalogRef is required.", 400);
    }
    return getDetail(catalogRef);
  }

  if (action === "detail-company") {
    const catalogRef = String(payload.catalogRef || "").trim();
    if (!catalogRef) {
      throw createHttpError("catalogRef is required.", 400);
    }
    return getDetail(catalogRef);
  }

  if (action === "import-selection") {
    const listId = String(payload.listId || "").trim();
    if (!listId) {
      throw createHttpError("listId is required.", 400);
    }

    const items = Array.isArray(payload.items) ? payload.items : [];
    if (items.length === 0) {
      throw createHttpError("At least one prospect item is required.", 400);
    }

    const workspaceContext = await getWorkspaceContext(authHeader);
    return saveProspectsToList({
      user,
      workspaceContext,
      listId,
      items: normalizeImportItems(items),
    });
  }

  if (action === "health") {
    return {
      ok: true,
      service: "catalog-search",
      shardCount: shardSlots.length,
      activeShards: activeShards.length,
      invalidShards: invalidShards.length,
    };
  }

  throw createHttpError("Unsupported catalog-search action.", 400);
};

export const handleCatalogSearchRequest = async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: buildCorsHeaders(req) });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405, req);
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse(
      { error: "catalog-search is missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY." },
      500,
      req,
    );
  }

  let payload: Record<string, unknown> = {};
  try {
    const parsed = await req.json().catch(() => ({}));
    payload = parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return jsonResponse({ error: "Invalid JSON body." }, 400, req);
  }

  const authHeader = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const user = await authenticateRequest(req, authHeader);
  if (!user) {
    return jsonResponse({ error: "Unauthorized" }, 401, req);
  }

  try {
    return jsonResponse(await handleCatalogAction(req, user, authHeader, payload), 200, req);
  } catch (error) {
    const status = Number((error as any)?.statusCode || 500);
    const response: Record<string, unknown> = {
      error: getErrorMessage(error),
    };
    if ((error as any)?.shardStatus) {
      response.shardStatus = (error as any).shardStatus;
    }
    return jsonResponse(response, status, req);
  }
};

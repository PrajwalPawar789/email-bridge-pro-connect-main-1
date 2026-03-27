const MAX_SEARCH_SHARDS = 16;
const DEFAULT_SEARCH_PAGE_SIZE = 25;
const MAX_SEARCH_PAGE_SIZE = 50;
const FILTER_OPTIONS_LIMIT = 150;
const FILTER_OPTIONS_TTL_MS = 5 * 60 * 1000;

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

const decodeJwtPayload = (token) => {
  const parts = String(token || "").split(".");
  if (parts.length < 2) return null;

  try {
    return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    return null;
  }
};

const parseProjectRefFromUrl = (value) => {
  const match = String(value || "").trim().match(/^https:\/\/([^.]+)\.supabase\.co/i);
  return match?.[1] || null;
};

const clampPageSize = (value) => {
  const parsed = Number.parseInt(String(value || DEFAULT_SEARCH_PAGE_SIZE), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_SEARCH_PAGE_SIZE;
  return Math.min(parsed, MAX_SEARCH_PAGE_SIZE);
};

const parseShardCount = (value) => {
  const parsed = Number.parseInt(String(value || "1"), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 1;
  return Math.min(parsed, MAX_SEARCH_SHARDS);
};

const parseCandidates = (value, fallback) => {
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

const parseSingleColumn = (value, fallback) => {
  const candidate = String(value || "").trim();
  return candidate || fallback;
};

const buildDisplayFieldConfig = (env, prefix, defaults) =>
  Object.fromEntries(
    Object.entries(defaults).map(([key, fallback]) => [
      key,
      parseCandidates(env[`${prefix}_${key.toUpperCase()}_COLUMNS`], fallback),
    ]),
  );

const buildSchemaConfig = (env) => {
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
      employeeSize: parseSingleColumn(env.SEARCH_PROSPECT_EMPLOYEE_SIZE_COLUMN, DEFAULT_PROSPECT_FILTER_COLUMNS.employeeSize),
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
      subIndustry: parseSingleColumn(env.SEARCH_COMPANY_SUB_INDUSTRY_COLUMN, DEFAULT_COMPANY_FILTER_COLUMNS.subIndustry),
      employeeSize: parseSingleColumn(env.SEARCH_COMPANY_EMPLOYEE_SIZE_COLUMN, DEFAULT_COMPANY_FILTER_COLUMNS.employeeSize),
      naics: parseSingleColumn(env.SEARCH_COMPANY_NAICS_COLUMN, DEFAULT_COMPANY_FILTER_COLUMNS.naics),
    },
  };
};

const buildShardConfigs = (env) => {
  const shardCount = parseShardCount(env.SHARD_COUNT);
  const shards = [];

  for (let index = 1; index <= shardCount; index += 1) {
    const url = String(env[`SUPABASE_URL_${index}`] || "").trim();
    const serviceRoleKey = String(env[`SUPABASE_SERVICE_ROLE_KEY_${index}`] || "").trim();
    const anonKey = String(env[`SUPABASE_ANON_KEY_${index}`] || "").trim();

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

const buildSelectColumns = (fieldGroups) => {
  const unique = new Set();
  Object.values(fieldGroups).forEach((columns) => {
    columns.forEach((column) => unique.add(column));
  });
  return [...unique].join(",");
};

const pickFirstValue = (record, candidates) => {
  for (const candidate of candidates) {
    const value = record?.[candidate];
    if (value !== null && value !== undefined && String(value).trim().length > 0) {
      return typeof value === "string" ? value.trim() : value;
    }
  }
  return null;
};

const normalizeText = (value) =>
  String(value || "")
    .trim()
    .toLowerCase();

const WINDOWS_1252_EXTRA_BYTES_BY_CHAR = new Map([
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

const WINDOWS_1252_EXTRA_BYTES_BY_CHAR_REPAIRED = new Map([
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

const encodeWindows1252Bytes = (value) => {
  const bytes = [];
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

const countMojibakeHints = (value) => {
  const text = String(value || "");
  const explicitMatches = text.match(/(?:Ã.|Â.|â.|ã.)/g) || [];
  const replacementMatches = text.match(/\uFFFD/g) || [];
  return explicitMatches.length + replacementMatches.length * 4;
};

const repairMojibake = (value) => {
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

const normalizeDisplayTextValue = (value) => {
  if (value === null || value === undefined) return null;

  const cleaned = repairMojibake(String(value).replace(MOJIBAKE_ARTIFACT_PATTERN, ""))
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, " ")
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned || null;
};

const normalizeCompanyDisplayName = (value) => {
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

const countMojibakeHintsRepaired = (value) => {
  const text = String(value || "");
  const explicitMatches = text.match(/(?:[\u00c2\u00c3\u00e2].|[\u00e3\u00e5\u00e6][\u00a0-\u00bf])/gu) || [];
  const replacementMatches = text.match(/\uFFFD/g) || [];
  return explicitMatches.length + replacementMatches.length * 4;
};

const repairMojibakeRepaired = (value) => {
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

const normalizeDisplayTextValueRepaired = (value) => {
  if (value === null || value === undefined) return null;

  const cleaned = repairMojibakeRepaired(String(value).replace(MOJIBAKE_ARTIFACT_PATTERN_REPAIRED, ""))
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, " ")
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .replace(/([\u00e0-\u00ff])([A-Z])(?=[\s,.;:|]|$)/g, (_, prefix, suffix) => `${prefix}${suffix.toLowerCase()}`)
    .trim();

  return cleaned || null;
};

const normalizeCompanyDisplayNameRepaired = (value) => {
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

const normalizeLinkedinUrl = (value) => {
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

const buildCatalogRef = (shardIndex, entity, sourceId) => `s${shardIndex}:${entity}:${sourceId}`;

const parseCatalogRef = (value) => {
  const match = String(value || "").match(/^s(\d+):(prospect|company):(.+)$/);
  if (!match) return null;
  return {
    shardIndex: Number.parseInt(match[1], 10),
    entity: match[2],
    sourceId: match[3],
  };
};

const normalizeProspectRow = (record, shardIndex, schema) => {
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

const normalizeCompanyRow = (record, shardIndex, schema) => {
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

const buildProspectDedupeKey = (row) => {
  const emailKey = normalizeText(row.email);
  if (emailKey) return `email:${emailKey}`;

  const linkedinKey = normalizeText(row.linkedin);
  if (linkedinKey) return `linkedin:${linkedinKey}`;

  return `fallback:${normalizeText(row.fullName)}|${normalizeText(row.companyName)}|${normalizeText(row.country)}`;
};

const buildCompanyDedupeKey = (row) => {
  const domainKey = normalizeText(row.domain);
  if (domainKey) return `domain:${domainKey}`;

  return `fallback:${normalizeText(row.companyName)}|${normalizeText(row.country)}`;
};

const rankProspect = (row) => {
  let score = 0;
  if (row.email) score += 4;
  if (row.phone) score += 2;
  if (row.jobLevel) score += 1;
  if (row.jobFunction) score += 1;
  if (row.region) score += 1;
  return score;
};

const rankCompany = (row) => {
  let score = 0;
  if (row.domain) score += 3;
  if (row.employeeSize) score += 1;
  if (row.region) score += 1;
  return score;
};

const compareProspects = (left, right) =>
  String(left.companyName || "").localeCompare(String(right.companyName || "")) ||
  String(left.fullName || "").localeCompare(String(right.fullName || "")) ||
  String(left.sourceRecordId || "").localeCompare(String(right.sourceRecordId || ""));

const compareCompanies = (left, right) =>
  String(left.companyName || "").localeCompare(String(right.companyName || "")) ||
  String(left.country || "").localeCompare(String(right.country || "")) ||
  String(left.sourceRecordId || "").localeCompare(String(right.sourceRecordId || ""));

const normalizeRowUsageByShard = (row) => {
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

const mergeRowUsageByShard = (left, right) => {
  const merged = { ...(left || {}) };
  Object.entries(right || {}).forEach(([shardIndex, usage]) => {
    merged[shardIndex] = Number(merged[shardIndex] || 0) + Number(usage || 0);
  });
  return merged;
};

const mergeAndDedupeRows = (mode, rows) => {
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

const encodeCursor = (value) => Buffer.from(JSON.stringify(value), "utf8").toString("base64url");

const decodeCursor = (value) => {
  if (!value) return null;
  try {
    return JSON.parse(Buffer.from(String(value), "base64url").toString("utf8"));
  } catch {
    return null;
  }
};

const sanitizeSearchPayload = (mode, payload = {}) => {
  const filters = payload?.filters && typeof payload.filters === "object" ? payload.filters : {};
  const normalizeList = (value) =>
    Array.isArray(value)
      ? value.map((entry) => String(entry || "").trim()).filter(Boolean)
      : [];

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

const buildOptionsCacheKey = (mode) => `filter-options:${mode}`;

export {
  DEFAULT_SEARCH_PAGE_SIZE,
  FILTER_OPTIONS_LIMIT,
  FILTER_OPTIONS_TTL_MS,
  MAX_SEARCH_PAGE_SIZE,
  MAX_SEARCH_SHARDS,
  buildCatalogRef,
  buildOptionsCacheKey,
  buildSchemaConfig,
  buildSelectColumns,
  buildShardConfigs,
  clampPageSize,
  decodeCursor,
  decodeJwtPayload,
  encodeCursor,
  mergeAndDedupeRows,
  normalizeCompanyRow,
  normalizeProspectRow,
  normalizeText,
  parseCatalogRef,
  parseProjectRefFromUrl,
  pickFirstValue,
  sanitizeSearchPayload,
};

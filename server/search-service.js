import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import { createClient } from "@supabase/supabase-js";
import {
  FILTER_OPTIONS_LIMIT,
  FILTER_OPTIONS_TTL_MS,
  buildOptionsCacheKey,
  buildSchemaConfig,
  buildSelectColumns,
  buildShardConfigs,
  clampPageSize,
  decodeCursor,
  encodeCursor,
  filterOutSeenRows,
  getRowDedupeKey,
  mergeAndDedupeRows,
  normalizeCompanyRow,
  normalizeProspectRow,
  normalizeText,
  parseCatalogRef,
  sanitizeSearchPayload,
} from "./search/lib.js";

dotenv.config();
dotenv.config({ path: ".env.16shards", override: false });

const DEFAULT_ALLOWED_ORIGINS = "http://localhost:5173,http://localhost:8080";
const DEFAULT_SEARCH_PORT = 8788;
const DEFAULT_BYPASS_AUTH = "false";
const MAX_SEARCH_BATCHES_PER_SHARD = 60;
const EXHAUSTIVE_SCAN_ESTIMATE_THRESHOLD = 2000;
const FILTER_OPTION_WINDOW_SIZE = 60;
const FILTER_OPTION_SAMPLE_FACTORS = [0, 0.35, 0.7];
const SEARCH_PORT = Number(process.env.SEARCH_SERVICE_PORT || process.env.PORT || DEFAULT_SEARCH_PORT);

const normalizeOrigin = (origin) => String(origin || "").trim().replace(/\/+$/, "");
const ALLOWED_ORIGINS = (
  process.env.SEARCH_ALLOWED_ORIGINS ||
  process.env.MAILBOX_ALLOWED_ORIGINS ||
  DEFAULT_ALLOWED_ORIGINS
)
  .split(",")
  .map((origin) => normalizeOrigin(origin))
  .filter(Boolean);

const MAIN_SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const MAIN_SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const MAIN_SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";
const SEARCH_BYPASS_AUTH = String(process.env.SEARCH_BYPASS_AUTH || DEFAULT_BYPASS_AUTH).toLowerCase() === "true";

const hasMainUrl = MAIN_SUPABASE_URL.startsWith("http");
const hasMainServiceRole = hasMainUrl && MAIN_SUPABASE_SERVICE_ROLE_KEY.length > 10;
const hasMainAnonKey = hasMainUrl && MAIN_SUPABASE_ANON_KEY.length > 10;
const mainSupabaseAdmin = hasMainServiceRole
  ? createClient(MAIN_SUPABASE_URL, MAIN_SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    })
  : null;

const schema = buildSchemaConfig(process.env);
const shardSlots = buildShardConfigs(process.env);
const activeShards = shardSlots.filter((slot) => slot.status === "active");
const invalidShards = shardSlots.filter((slot) => slot.status === "invalid");
const shardClients = new Map(
  activeShards.map((slot) => [
    slot.index,
    createClient(slot.url, slot.key, {
      auth: { persistSession: false },
    }),
  ]),
);
const filterOptionsCache = new Map();

const app = express();
app.use(express.json({ limit: "2mb" }));
app.use(
  cors({
    origin(origin, callback) {
      const normalizedOrigin = normalizeOrigin(origin);
      if (!origin || ALLOWED_ORIGINS.includes("*") || ALLOWED_ORIGINS.includes(normalizedOrigin)) {
        callback(null, true);
        return;
      }
      callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  }),
);

const buildUserSupabaseClient = (authHeader) => {
  if (!hasMainAnonKey) return null;
  const headers = authHeader ? { Authorization: authHeader } : {};
  return createClient(MAIN_SUPABASE_URL, MAIN_SUPABASE_ANON_KEY, {
    global: { headers },
    auth: { persistSession: false },
  });
};

const createHttpError = (message, statusCode = 500, extra = {}) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  Object.assign(error, extra);
  return error;
};

const buildColumnSelection = (...groups) => {
  const unique = new Set();
  const append = (value) => {
    if (Array.isArray(value)) {
      value.forEach(append);
      return;
    }

    const column = String(value || "").trim();
    if (column) {
      unique.add(column);
    }
  };

  groups.forEach(append);
  return [...unique].join(",");
};

const getRawErrorMessage = (error) => {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown error";
  }
};

const sanitizeShardErrorMessage = (message) => {
  const raw = String(message || "").trim();
  if (!raw) return "Unknown error";

  if (raw.toLowerCase().includes("statement timeout")) {
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

const getErrorStatusCode = (error) => {
  if (typeof error !== "object" || error === null) return null;
  const candidate =
    ("status" in error ? error.status : null) ??
    ("statusCode" in error ? error.statusCode : null) ??
    ("code" in error ? error.code : null);
  const parsed = Number(candidate);
  return Number.isFinite(parsed) ? parsed : null;
};

const isTransientShardError = (error) => {
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

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const executeShardOperation = async (operation, maxRetries = 2) => {
  let lastError = null;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      const result = await operation();
      const operationError = result && typeof result === "object" && "error" in result ? result.error : null;

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

const authenticateRequest = async (authHeader) => {
  if (!authHeader?.startsWith("Bearer ")) {
    if (SEARCH_BYPASS_AUTH && hasMainServiceRole) {
      return { id: "search-bypass-user", email: "bypass@local.dev" };
    }
    return null;
  }

  const token = authHeader.replace("Bearer ", "").trim();
  if (!token) {
    return SEARCH_BYPASS_AUTH && hasMainServiceRole ? { id: "search-bypass-user", email: "bypass@local.dev" } : null;
  }

  const authClient = mainSupabaseAdmin || buildUserSupabaseClient(authHeader);
  if (!authClient) return null;

  const { data, error } = await authClient.auth.getUser(token);
  if (error || !data?.user) {
    return SEARCH_BYPASS_AUTH && hasMainServiceRole ? { id: "search-bypass-user", email: "bypass@local.dev" } : null;
  }

  return data.user;
};

const requireAuthenticatedUser = async (req, res) => {
  const user = await authenticateRequest(req.headers.authorization || "");
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  return user;
};

const getWorkspaceContext = async (authHeader) => {
  const client = buildUserSupabaseClient(authHeader);
  if (!client) return null;

  const { data, error } = await client.rpc("get_workspace_context");
  if (error) {
    throw new Error(error.message || "Failed to load workspace context");
  }

  return Array.isArray(data) ? (data[0] ?? null) : (data ?? null);
};

const canManageContacts = (workspaceContext) => {
  const permissions = Array.isArray(workspaceContext?.permissions) ? workspaceContext.permissions : [];
  return permissions.includes("manage_contacts") || permissions.includes("manage_workspace");
};

const addTextFilter = (query, column, value) =>
  value ? query.ilike(column, `%${String(value).trim()}%`) : query;

const addExactTextFilter = (query, column, value) =>
  value && column ? query.eq(column, String(value).trim()) : query;

const addInFilter = (query, column, values) =>
  Array.isArray(values) && values.length > 0
    ? values.length === 1
      ? query.eq(column, values[0])
      : query.in(column, values)
    : query;

const applyProspectFilters = (query, filters) => {
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

const applyCompanyFilters = (query, filters) => {
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

const encodeDerivedCompanySourceId = (value) => Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
const decodeDerivedCompanySourceId = (value) => {
  try {
    return JSON.parse(Buffer.from(String(value), "base64url").toString("utf8"));
  } catch {
    return null;
  }
};

const buildDerivedCompanyKey = (row) => {
  const domain = normalizeText(row.companyDomain);
  if (domain) return `domain:${domain}`;
  return `fallback:${normalizeText(row.companyName)}|${normalizeText(row.country)}`;
};

const buildDerivedCompanyRows = (records, shardIndex) => {
  const normalizedProspects = records.map((record) => normalizeProspectRow(record, shardIndex, schema));
  const groups = [];

  normalizedProspects.forEach((prospect) => {
    const companyKey = buildDerivedCompanyKey(prospect);
    const previous = groups[groups.length - 1];

    if (!previous || previous.__companyKey !== companyKey) {
      const sourceId = encodeDerivedCompanySourceId({
        companyName: prospect.companyName || "",
        domain: prospect.companyDomain || "",
        country: prospect.country || "",
      });
      groups.push({
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
        prospectCount: 1,
        __companyKey: companyKey,
        __rawCount: 1,
      });
      return;
    }

    previous.__rawCount += 1;
    previous.prospectCount += 1;
    if (!previous.domain && prospect.companyDomain) previous.domain = prospect.companyDomain;
    if (!previous.region && prospect.region) previous.region = prospect.region;
    if (!previous.industry && prospect.industry) previous.industry = prospect.industry;
    if (!previous.subIndustry && prospect.subIndustry) previous.subIndustry = prospect.subIndustry;
    if (!previous.employeeSize && prospect.employeeSize) previous.employeeSize = prospect.employeeSize;
    if (!previous.naics && prospect.naics) previous.naics = prospect.naics;
  });

  return groups;
};

const getModeConfig = (mode) => {
  if (mode === "prospects") {
    return {
      source: schema.prospectSource,
      idColumn: schema.prospectIdColumn,
      selectColumns: buildSelectColumns(schema.prospectFields),
      exactCountSelectColumns: buildColumnSelection(
        schema.prospectIdColumn,
        schema.prospectFields.fullName,
        schema.prospectFields.firstName,
        schema.prospectFields.lastName,
        schema.prospectFields.email,
        schema.prospectFields.linkedin,
        schema.prospectFields.companyName,
        schema.prospectFields.country,
      ),
      exactCountSort: [schema.prospectIdColumn],
      extractExactCountKey: (record, shardIndex) =>
        getRowDedupeKey("prospects", normalizeProspectRow(record, shardIndex, schema)),
      normalize: (record, shardIndex) => normalizeProspectRow(record, shardIndex, schema),
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
      exactCountSelectColumns: buildColumnSelection(
        schema.prospectIdColumn,
        schema.prospectFields.companyName,
        schema.prospectFields.companyDomain,
        schema.prospectFields.country,
      ),
      exactCountSort: [schema.prospectIdColumn],
      extractExactCountKey: (record, shardIndex) =>
        buildDerivedCompanyKey(normalizeProspectRow(record, shardIndex, schema)),
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
    exactCountSelectColumns: buildColumnSelection(
      schema.companyIdColumn,
      schema.companyFields.name,
      schema.companyFields.domain,
      schema.companyFields.country,
    ),
    exactCountSort: [schema.companyIdColumn],
    extractExactCountKey: (record, shardIndex) =>
      getRowDedupeKey("companies", normalizeCompanyRow(record, shardIndex, schema)),
    normalize: (record, shardIndex) => normalizeCompanyRow(record, shardIndex, schema),
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

const buildShardStatus = (runtimeResults) => {
  const configuredCount = shardSlots.filter((slot) => slot.status !== "inactive").length;
  const warnings = [
    ...invalidShards.map((slot) => `Shard ${slot.index}: ${slot.reason}`),
    ...runtimeResults
      .filter((entry) => entry.status === "failed")
      .map((entry) => `Shard ${entry.shard.index}: ${entry.reason}`),
  ];

  return {
    requestedSlots: shardSlots.length,
    configured: configuredCount,
    healthy: runtimeResults.filter((entry) => entry.status === "healthy").length,
    failed: warnings.length,
    inactive: shardSlots.filter((slot) => slot.status === "inactive").length,
    warnings,
  };
};

const shouldExposeShardStatus = (status) => Array.isArray(status?.warnings) && status.warnings.length > 0;

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

const hasActiveFilters = (filters = {}) =>
  Object.values(filters).some((value) =>
    Array.isArray(value) ? value.length > 0 : String(value || "").trim().length > 0,
  );

const getQueryResultError = (result) => (result && typeof result === "object" && "error" in result ? result.error : null);

const hasFiniteNumericValue = (value) =>
  value !== null && value !== undefined && String(value).trim() !== "" && Number.isFinite(Number(value));

const hasBroadTextFilters = (mode, filters = {}) => {
  const getTextValue = (key) => String(filters?.[key] || "").trim();

  if (mode === "prospects") {
    return Boolean(getTextValue("jobTitle") || getTextValue("companyName") || getTextValue("naics"));
  }

  return Boolean(getTextValue("companyName") || getTextValue("naics"));
};

const hasActiveFilterValue = (value) =>
  Array.isArray(value) ? value.length > 0 : String(value || "").trim().length > 0;

const pickProspectFilterSubset = (filters = {}, keys = []) => {
  const allowed = new Set(keys);
  return {
    jobTitle: allowed.has("jobTitle") ? String(filters.jobTitle || "").trim() : "",
    companyName: allowed.has("companyName") ? String(filters.companyName || "").trim() : "",
    exactCompanyName: allowed.has("exactCompanyName") ? String(filters.exactCompanyName || "").trim() : "",
    companyDomain: allowed.has("companyDomain") ? String(filters.companyDomain || "").trim() : "",
    naics: allowed.has("naics") ? String(filters.naics || "").trim() : "",
    jobLevel: allowed.has("jobLevel") ? normalizeList(filters.jobLevel) : [],
    jobFunction: allowed.has("jobFunction") ? normalizeList(filters.jobFunction) : [],
    country: allowed.has("country") ? normalizeList(filters.country) : [],
    industry: allowed.has("industry") ? normalizeList(filters.industry) : [],
    subIndustry: allowed.has("subIndustry") ? normalizeList(filters.subIndustry) : [],
    employeeSize: allowed.has("employeeSize") ? normalizeList(filters.employeeSize) : [],
    region: allowed.has("region") ? normalizeList(filters.region) : [],
  };
};

const buildProspectAdaptiveFilterPlans = (filters = {}) => {
  const exactKeys = ["exactCompanyName", "companyDomain"].filter((key) => hasActiveFilterValue(filters[key]));
  const broadTextKeys = ["jobTitle", "companyName", "naics"].filter((key) => hasActiveFilterValue(filters[key]));
  const listKeys = [
    "jobLevel",
    "jobFunction",
    "country",
    "industry",
    "subIndustry",
    "employeeSize",
    "region",
  ].filter((key) => hasActiveFilterValue(filters[key]));
  const plans = [];
  const seen = new Set();

  const pushPlan = (label, keys) => {
    const activeKeys = [...new Set(keys.filter((key) => hasActiveFilterValue(filters[key])))].sort();
    if (activeKeys.length === 0) return;
    const signature = activeKeys.join("|");
    if (seen.has(signature)) return;
    seen.add(signature);
    plans.push({
      label,
      sqlFilters: pickProspectFilterSubset(filters, activeKeys),
    });
  };

  if (broadTextKeys.length > 0 && listKeys.length > 0) {
    pushPlan("broad-text-sql", [...exactKeys, ...broadTextKeys]);
    broadTextKeys.forEach((key) => {
      pushPlan(`single-text-${key}`, [...exactKeys, key]);
    });
    pushPlan("structured-sql", [...exactKeys, ...listKeys]);
  }

  if (exactKeys.length > 0 && (broadTextKeys.length > 0 || listKeys.length > 0)) {
    pushPlan("exact-only", exactKeys);
  }

  return plans;
};

const containsFilterText = (value, filterValue) => {
  const needle = String(filterValue || "").trim().toLowerCase();
  if (!needle) return true;
  return String(value || "").toLowerCase().includes(needle);
};

const matchesExactFilterText = (value, filterValue) => {
  const needle = String(filterValue || "").trim();
  if (!needle) return true;
  return String(value || "") === needle;
};

const matchesFilterListValue = (value, allowedValues) => {
  const values = Array.isArray(allowedValues) ? allowedValues : [];
  if (values.length === 0) return true;
  return values.includes(String(value || ""));
};

const prospectRowMatchesFilters = (row, filters = {}) => {
  if (!containsFilterText(row.jobTitle, filters.jobTitle)) return false;
  if (String(filters.exactCompanyName || "").trim()) {
    if (!matchesExactFilterText(row.companyName, filters.exactCompanyName)) return false;
  } else if (!containsFilterText(row.companyName, filters.companyName)) {
    return false;
  }
  if (!matchesExactFilterText(row.companyDomain, filters.companyDomain)) return false;
  if (!containsFilterText(row.naics, filters.naics)) return false;
  if (!matchesFilterListValue(row.jobLevel, filters.jobLevel)) return false;
  if (!matchesFilterListValue(row.jobFunction, filters.jobFunction)) return false;
  if (!matchesFilterListValue(row.country, filters.country)) return false;
  if (!matchesFilterListValue(row.industry, filters.industry)) return false;
  if (!matchesFilterListValue(row.subIndustry, filters.subIndustry)) return false;
  if (!matchesFilterListValue(row.employeeSize, filters.employeeSize)) return false;
  if (!matchesFilterListValue(row.region, filters.region)) return false;
  return true;
};

const getShardBatchLimit = (mode, modeConfig, pageSize, filters = {}) => {
  if (modeConfig.derivedFromProspects) {
    return hasBroadTextFilters(mode, filters) ? Math.min(pageSize * 3, 120) : Math.min(pageSize * 12, 400);
  }

  return hasBroadTextFilters(mode, filters) ? Math.min(pageSize + 5, 60) : Math.min(pageSize * 4, 200);
};

const getExhaustiveShardBatchLimit = (mode, modeConfig, pageSize, filters = {}) => {
  const standardLimit = getShardBatchLimit(mode, modeConfig, pageSize, filters);
  if (modeConfig.derivedFromProspects) {
    return Math.max(standardLimit, Math.min(pageSize * 16, 400));
  }
  return Math.max(standardLimit, Math.min(pageSize * 8, 250));
};

const getExactCountShardBatchLimit = (mode, modeConfig, pageSize, filters = {}) =>
  Math.max(
    getExhaustiveShardBatchLimit(mode, modeConfig, pageSize, filters),
    hasBroadTextFilters(mode, filters) ? Math.min(pageSize * 12, 300) : Math.min(pageSize * 16, 400),
  );

// Always attempt an estimate first. We use it not only for display, but also to
// decide when it is safe to exhaustively scan and compute an exact deduped total.
// Skipping the estimate for text filters can leave the UI with impossible totals
// like page 4 existing while the header still says ~75 results.
const shouldSkipCountEstimate = () => false;

const runShardQuery = async ({ client, modeConfig, filters, offset, limit, includeCount, sortColumns, selectColumns }) => {
  let query = client
    .from(modeConfig.source)
    .select(selectColumns || modeConfig.selectColumns, includeCount ? { count: "planned" } : undefined);
  query = modeConfig.applyFilters(query, filters);
  for (const column of sortColumns || modeConfig.defaultSort) {
    query = query.order(column, { ascending: true, nullsFirst: false });
  }
  return query.range(offset, offset + limit - 1);
};

const runShardPageQuery = async ({ client, modeConfig, filters, offset, limit, sortColumns, selectColumns, maxRetries = 2 }) => {
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
        selectColumns,
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
  sortColumns,
  selectColumns,
  allowUnorderedFallback = true,
}) => {
  try {
    return await runShardPageQuery({
      client,
      modeConfig,
      filters,
      offset,
      limit,
      sortColumns,
      selectColumns,
    });
  } catch (error) {
    if (String(getRawErrorMessage(error)).toLowerCase().includes("statement timeout")) {
      const minimumFallbackLimit = Math.min(limit, 10);
      const fallbackLimits = [];
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
            sortColumns: sortColumns || modeConfig.defaultSort,
            selectColumns,
            maxRetries: 0,
          });
        } catch (reducedError) {
          if (!String(getRawErrorMessage(reducedError)).toLowerCase().includes("statement timeout")) {
            throw reducedError;
          }
        }
      }

      if (allowUnorderedFallback) {
        for (const fallbackLimit of fallbackLimits.length > 0 ? fallbackLimits : [minimumFallbackLimit]) {
          try {
            return await runShardPageQuery({
              client,
              modeConfig,
              filters,
              offset,
              limit: fallbackLimit,
              sortColumns: [],
              selectColumns,
              maxRetries: 0,
            });
          } catch (unorderedFallbackError) {
            if (!String(getRawErrorMessage(unorderedFallbackError)).toLowerCase().includes("statement timeout")) {
              throw unorderedFallbackError;
            }
          }
        }
      }

      if (modeConfig.idColumn) {
        for (const fallbackLimit of fallbackLimits.length > 0 ? fallbackLimits : [minimumFallbackLimit]) {
          const idLimit = Math.max(minimumFallbackLimit, Math.min(fallbackLimit, 25));
          try {
            return await runShardPageQuery({
              client,
              modeConfig,
              filters,
              offset,
              limit: idLimit,
              sortColumns: [modeConfig.idColumn],
              selectColumns,
              maxRetries: 0,
            });
          } catch (idFallbackError) {
            if (!String(getRawErrorMessage(idFallbackError)).toLowerCase().includes("statement timeout")) {
              throw idFallbackError;
            }
          }
        }
      }
    }
    throw error;
  }
};

const fetchProspectPageWithAdaptiveFilters = async ({
  shard,
  client,
  modeConfig,
  payload,
  offset,
  seenKeys,
}) => {
  const pageSize = clampPageSize(payload.pageSize);
  const plans = buildProspectAdaptiveFilterPlans(payload.filters);

  for (const plan of plans) {
    const limit = getShardBatchLimit("prospects", modeConfig, pageSize, plan.sqlFilters);
    let nextOffset = offset;
    let exhausted = false;
    let scannedCount = offset;
    let consumedBase = offset;
    const matchedRows = [];
    const localSeenKeys = new Set(seenKeys instanceof Set ? [...seenKeys] : []);

    try {
      for (let batchIndex = 0; batchIndex < MAX_SEARCH_BATCHES_PER_SHARD; batchIndex += 1) {
        const result = await runShardPageQueryWithFallback({
          client,
          modeConfig,
          filters: plan.sqlFilters,
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

        for (let index = 0; index < batchRows.length; index += 1) {
          const normalized = modeConfig.normalize(batchRows[index], shard.index);
          const rowKey = getRowDedupeKey("prospects", normalized);
          if (localSeenKeys.has(rowKey)) continue;
          if (!prospectRowMatchesFilters(normalized, payload.filters)) continue;

          matchedRows.push({
            ...normalized,
            rowUsageByShard: {
              [String(shard.index)]: nextOffset + index + 1 - consumedBase,
            },
          });
          localSeenKeys.add(rowKey);
          consumedBase = nextOffset + index + 1;

          if (matchedRows.length >= pageSize + 1) {
            break;
          }
        }

        nextOffset += batchRows.length;
        scannedCount = Math.max(scannedCount, nextOffset);
        exhausted = batchRows.length < limit;

        if (matchedRows.length >= pageSize + 1 || exhausted) {
          break;
        }
      }

      return {
        status: "healthy",
        shard,
        rows: matchedRows,
        count: scannedCount,
        offset,
        exhausted,
        emptyConsumed: matchedRows.length === 0 ? Math.max(0, scannedCount - offset) : 0,
        fallbackPlan: plan.label,
      };
    } catch (error) {
      if (!String(getRawErrorMessage(error)).toLowerCase().includes("statement timeout")) {
        throw error;
      }
    }
  }

  return null;
};

const getCountQueryMode = (mode, filters = {}) => (hasBroadTextFilters(mode, filters) ? "estimated" : "exact");

const runShardCountEstimateQuery = async ({ client, modeConfig, mode, filters }) => {
  let query = client.from(modeConfig.source).select(modeConfig.idColumn, {
    count: getCountQueryMode(mode, filters),
    head: true,
  });
  query = modeConfig.applyFilters(query, filters);
  return query;
};

const fetchShardCountEstimate = async (mode, shard, filters) => {
  const modeConfig = getModeConfig(mode);
  const client = shardClients.get(shard.index);
  if (!client) return null;
  if (shouldSkipCountEstimate(mode, filters)) return null;

  try {
    const { count, error } = await executeShardOperation(() =>
      runShardCountEstimateQuery({
        client,
        modeConfig,
        mode,
        filters,
      }),
    );
    if (error) return null;
    return count !== null && count !== undefined ? Number(count || 0) : null;
  } catch {
    return null;
  }
};

const stripSearchResultRow = (row) => {
  const { rowUsageByShard, raw, ...rest } = row || {};
  return rest;
};

const fetchShardPage = async (mode, shard, payload, offsets, seenKeys, estimatedCount = null) => {
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
      exhausted: true,
      reason: "Shard client is not available",
    };
  }

  if (modeConfig.derivedFromProspects) {
    const limit = getExhaustiveShardBatchLimit(mode, modeConfig, pageSize, payload.filters);
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

      const rows = groupedRows.map(({ __companyKey, __rawCount, ...row }) => ({
        ...row,
        rowUsageByShard: {
          [String(shard.index)]: Number(__rawCount || 1),
        },
      }));

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
        reason: sanitizeShardErrorMessage(error?.message || error) || "Search query failed",
      };
    }
  }

  const limit = getExhaustiveShardBatchLimit(mode, modeConfig, pageSize, payload.filters);

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
    if (mode === "prospects" && String(getRawErrorMessage(error)).toLowerCase().includes("statement timeout")) {
      const adaptiveResult = await fetchProspectPageWithAdaptiveFilters({
        shard,
        client,
        modeConfig,
        payload,
        offset,
        seenKeys,
      });
      if (adaptiveResult) {
        return adaptiveResult;
      }
    }

    return {
      status: "failed",
      shard,
      rows: [],
      count: 0,
      offset,
      exhausted: true,
      reason: sanitizeShardErrorMessage(error?.message || error) || "Search query failed",
    };
  }
};

const fetchShardAllRows = async (mode, shard, payload) => {
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
    const limit = getExhaustiveShardBatchLimit(mode, modeConfig, pageSize, payload.filters);
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
        reason: sanitizeShardErrorMessage(error?.message || error) || "Search query failed",
      };
    }
  }

  const limit = getExhaustiveShardBatchLimit(mode, modeConfig, pageSize, payload.filters);
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
      reason: sanitizeShardErrorMessage(error?.message || error) || "Search query failed",
    };
  }
};

const fetchShardExactCountKeys = async (mode, shard, payload) => {
  const modeConfig = getModeConfig(mode);
  const client = shardClients.get(shard.index);
  const pageSize = clampPageSize(payload.pageSize);
  const limit = getExactCountShardBatchLimit(mode, modeConfig, pageSize, payload.filters);

  if (!client) {
    return {
      status: "failed",
      shard,
      keys: [],
      count: 0,
      offset: 0,
      exhausted: true,
      reason: "Shard client is not available",
    };
  }

  try {
    let nextOffset = 0;
    let exhausted = false;
    const dedupeKeys = new Set();

    for (let batchIndex = 0; batchIndex < MAX_SEARCH_BATCHES_PER_SHARD; batchIndex += 1) {
      const result = await runShardPageQueryWithFallback({
        client,
        modeConfig,
        filters: payload.filters,
        offset: nextOffset,
        limit,
        sortColumns: modeConfig.exactCountSort,
        selectColumns: modeConfig.exactCountSelectColumns,
        allowUnorderedFallback: false,
      });

      const { data, error } = result;
      if (error) throw error;

      const batchRecords = Array.isArray(data) ? data : [];
      if (batchRecords.length === 0) {
        exhausted = true;
        break;
      }

      batchRecords.forEach((record) => {
        const dedupeKey = String(modeConfig.extractExactCountKey(record, shard.index) || "").trim();
        if (dedupeKey) {
          dedupeKeys.add(dedupeKey);
        }
      });

      nextOffset += batchRecords.length;
      exhausted = batchRecords.length < limit;
      if (exhausted) break;
    }

    return {
      status: "healthy",
      shard,
      keys: [...dedupeKeys],
      count: nextOffset,
      offset: 0,
      exhausted,
    };
  } catch (error) {
    return {
      status: "failed",
      shard,
      keys: [],
      count: 0,
      offset: 0,
      exhausted: true,
      reason: sanitizeShardErrorMessage(error?.message || error) || "Search query failed",
    };
  }
};

const buildNextCursor = (mode, currentOffsets, selectedRows, shardResults, availableRowCount, priorSeenKeys, displayTotal, displayTotalIsExact = false) => {
  const nextOffsets = { ...(currentOffsets || {}) };
  const perShardConsumed = new Map();
  const nextSeenKeys = new Set(priorSeenKeys instanceof Set ? [...priorSeenKeys] : []);
  selectedRows.forEach((row) => nextSeenKeys.add(getRowDedupeKey(mode, row)));

  shardResults
    .filter((entry) => entry.status === "healthy")
    .forEach((entry) => {
      entry.rows.forEach((row) => {
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
      const fallbackConsumed = consumed > 0 ? 0 : Math.max(0, Number(entry.emptyConsumed || 0));
      nextOffsets[String(entry.shard.index)] = current + consumed + fallbackConsumed;
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
        ...(displayTotalIsExact ? { displayTotalIsExact: true } : {}),
      })
    : null;
};

const runExhaustiveSearch = async (mode, searchPayload, exhaustiveOffset, displayTotalHint = null) => {
  const shardResults = await Promise.all(
    activeShards.map((shard) => fetchShardAllRows(mode, shard, searchPayload)),
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
  const totalFloor = mergedRows.length;
  const totalDisplay = Math.max(totalFloor, Number(totalExact ?? displayTotalHint ?? 0));

  return {
    items: items.map((row) => stripSearchResultRow(row)),
    nextCursor:
      nextOffset < mergedRows.length
        ? encodeCursor({
            mode,
            pagination: "exhaustive",
            offset: nextOffset,
            displayTotal: totalExact ?? totalDisplay,
            ...(totalExact !== null && !hasShardFailures ? { displayTotalIsExact: true } : {}),
          })
        : null,
    totalApprox: totalExact ?? totalDisplay,
    totalIsExact: totalExact !== null && !hasShardFailures,
    ...(shouldExposeShardStatus(shardStatus) ? { shardStatus } : {}),
  };
};

const resolveExactTotal = async (mode, searchPayload) => {
  const shardResults = await Promise.all(
    activeShards.map((shard) => fetchShardExactCountKeys(mode, shard, searchPayload)),
  );
  const hasShardFailures = shardResults.some((entry) => entry.status !== "healthy");
  const healthyResults = shardResults.filter((entry) => entry.status === "healthy");

  if (healthyResults.length === 0) {
    return { totalExact: null, totalIsExact: false };
  }

  const dedupeKeys = new Set(healthyResults.flatMap((entry) => (Array.isArray(entry.keys) ? entry.keys : [])));

  return {
    totalExact: healthyResults.every((entry) => entry.exhausted) ? dedupeKeys.size : null,
    totalIsExact: !hasShardFailures,
  };
};

const runSearch = async (mode, payload) => {
  if (activeShards.length === 0) {
    throw createHttpError("No active search shards are configured.", 503);
  }

  const searchPayload = sanitizeSearchPayload(mode, payload);
  const cursor = decodeCursor(searchPayload.cursor);
  const priorSeenKeys =
    cursor?.mode === mode && Array.isArray(cursor?.seenKeys)
      ? new Set(cursor.seenKeys.map((value) => String(value || "")))
      : new Set();
  const exhaustiveOffset =
    cursor?.mode === mode && cursor?.pagination === "exhaustive" && Number.isFinite(Number(cursor?.offset))
      ? Math.max(0, Number(cursor.offset))
      : priorSeenKeys.size;
  const displayTotalFromCursor =
    cursor?.mode === mode && hasFiniteNumericValue(cursor?.displayTotal ?? cursor?.totalExact)
      ? Number(cursor.displayTotal ?? cursor.totalExact)
      : null;
  const displayTotalIsExactFromCursor =
    cursor?.mode === mode && (cursor?.displayTotalIsExact === true || cursor?.totalIsExact === true);
  const estimatedCounts =
    cursor?.mode === mode && cursor?.pagination === "exhaustive"
      ? null
      : displayTotalFromCursor === null
        ? await Promise.all(activeShards.map((shard) => fetchShardCountEstimate(mode, shard, searchPayload.filters)))
        : null;
  const estimatedTotal =
    Array.isArray(estimatedCounts) && estimatedCounts.some((value) => hasFiniteNumericValue(value))
      ? estimatedCounts.reduce((sum, value) => sum + Number(value || 0), 0)
      : null;
  const shouldUseExhaustivePagination = cursor?.mode === mode && cursor?.pagination === "exhaustive";

  if (shouldUseExhaustivePagination) {
    return runExhaustiveSearch(mode, searchPayload, exhaustiveOffset, displayTotalFromCursor ?? estimatedTotal);
  }

  const offsets =
    cursor?.mode === mode && cursor?.offsets && typeof cursor.offsets === "object" ? cursor.offsets : {};
  const estimatedCountByShard = new Map(
    activeShards.map((shard, index) => [shard.index, Array.isArray(estimatedCounts) ? estimatedCounts[index] : null]),
  );
  const shardResults = await Promise.all(
    activeShards.map((shard) =>
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
  const totalFloor = priorSeenKeys.size + availableRows.length;
  const totalExact = healthyResults.every((entry) => entry.exhausted) ? totalFloor : null;
  const fallbackApprox = shardResults.reduce((sum, entry) => sum + Number(entry.count || 0), 0);
  const totalApprox = Math.max(
    totalFloor,
    Number(totalExact ?? displayTotalFromCursor ?? estimatedTotal ?? fallbackApprox),
  );
  let resolvedTotalApprox = totalApprox;
  let resolvedTotalIsExact = (totalExact !== null && !hasShardFailures) || (displayTotalIsExactFromCursor && !hasShardFailures);

  const shouldResolveExactTotal =
    hasActiveFilters(searchPayload.filters) &&
    !hasShardFailures &&
    (
      (displayTotalFromCursor === null &&
        hasFiniteNumericValue(estimatedTotal) &&
        Number(estimatedTotal) <= EXHAUSTIVE_SCAN_ESTIMATE_THRESHOLD) ||
      (displayTotalFromCursor !== null && displayTotalFromCursor < totalFloor)
    );

  if (shouldResolveExactTotal) {
    const exactResolution = await resolveExactTotal(mode, searchPayload);
    if (exactResolution.totalExact !== null && exactResolution.totalIsExact) {
      resolvedTotalApprox = exactResolution.totalExact;
      resolvedTotalIsExact = true;
    }
  }

  return {
    items: items.map((row) => stripSearchResultRow(row)),
    nextCursor: buildNextCursor(
      mode,
      offsets,
      items,
      shardResults,
      availableRows.length,
      priorSeenKeys,
      resolvedTotalApprox,
      resolvedTotalIsExact,
    ),
    totalApprox: resolvedTotalApprox,
    totalIsExact: resolvedTotalIsExact,
    ...(shouldExposeShardStatus(shardStatus) ? { shardStatus } : {}),
  };
};

const getDetail = async (catalogRef) => {
  const parsed = parseCatalogRef(catalogRef);
  if (!parsed) {
    throw new Error("Invalid catalog reference");
  }

  const shard = activeShards.find((entry) => entry.index === parsed.shardIndex);
  if (!shard) {
    throw new Error(`Shard ${parsed?.shardIndex ?? "?"} is not active`);
  }

  const mode = parsed.entity === "prospect" ? "prospects" : "companies";
  const modeConfig = getModeConfig(mode);
  const client = shardClients.get(shard.index);

  if (mode === "companies" && modeConfig.derivedFromProspects) {
    const decoded = decodeDerivedCompanySourceId(parsed.sourceId);
    if (!decoded) {
      throw new Error("Invalid derived company reference");
    }

    let query = client.from(modeConfig.source).select("*").limit(25);
    if (decoded.companyName) {
      query = query.eq(schema.prospectFilters.companyName, decoded.companyName);
    }
    if (decoded.domain) {
      query = query.eq(schema.prospectFields.companyDomain[0], decoded.domain);
    }
    if (decoded.country) {
      query = query.eq(schema.prospectFilters.country, decoded.country);
    }

    const { data, error } = await query;
    if (error) throw error;
    if (!Array.isArray(data) || data.length === 0) throw new Error("Catalog record not found");

    const [item] = buildDerivedCompanyRows(data, shard.index).map(({ __companyKey, __rawCount, ...row }) => row);
    if (!item) throw new Error("Catalog record not found");

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
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("Catalog record not found");

  return {
    item:
      mode === "prospects"
        ? normalizeProspectRow(data, shard.index, schema)
        : normalizeCompanyRow(data, shard.index, schema),
    raw: data,
    shard: {
      index: shard.index,
      projectRef: shard.projectRef,
    },
  };
};

const loadFilterOptions = async (mode) => {
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
        activeShards.map(async (shard) => {
          const client = shardClients.get(shard.index);
          try {
            const { count, error: countError } = await client
              .from(modeConfig.source)
              .select(column, { count: "planned", head: true })
              .not(column, "is", null);
            if (countError) return;

            const totalRows = Number(count || 0);
            const offsets = [...new Set(
              FILTER_OPTION_SAMPLE_FACTORS.map((factor) =>
                Math.max(0, Math.floor(totalRows * factor) - Math.floor(FILTER_OPTION_WINDOW_SIZE / 2)),
              ),
            )];

            await Promise.all(
              offsets.map(async (offset) => {
                const { data, error } = await client
                  .from(modeConfig.source)
                  .select(column)
                  .not(column, "is", null)
                  .order(column, { ascending: true })
                  .range(offset, offset + FILTER_OPTION_WINDOW_SIZE - 1);
                if (error) return;
                (data || []).forEach((row) => {
                  const value = String(row?.[column] || "").trim();
                  if (value) optionSet.add(value);
                });
              }),
            );
          } catch {
            // Filter metadata remains best-effort in v1.
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

const loadUserLists = async (userId) => {
  if (!mainSupabaseAdmin) {
    throw new Error("Supabase service role key is required for list imports");
  }

  const { data, error } = await mainSupabaseAdmin
    .from("email_lists")
    .select("id, user_id, name")
    .eq("user_id", userId);

  if (error) throw error;
  return data || [];
};

const saveProspectsToList = async ({ user, workspaceContext, listId, items }) => {
  if (!canManageContacts(workspaceContext)) {
    const error = new Error("You do not have permission to manage contacts.");
    error.statusCode = 403;
    throw error;
  }
  if (!mainSupabaseAdmin) {
    throw new Error("Supabase service role key is required for search imports");
  }

  const availableLists = await loadUserLists(user.id);
  const targetList = availableLists.find((list) => list.id === listId);
  if (!targetList) {
    const error = new Error("List not found.");
    error.statusCode = 404;
    throw error;
  }

  const snapshots = items.map((item) => ({
    user_id: user.id,
    name: item.fullName || item.companyName || "Unknown prospect",
    email: item.email || `${item.catalogRef}@catalog.local`,
    phone: item.phone || null,
    company: item.companyName || null,
    job_title: item.jobTitle || null,
    country: item.country || null,
    industry: item.industry || null,
    catalog_ref: item.catalogRef,
    source_shard: item.sourceShard,
    source_record_id: item.sourceRecordId,
    catalog_company_ref: item.catalogCompanyRef || null,
    job_level: item.jobLevel || null,
    job_function: item.jobFunction || null,
    sub_industry: item.subIndustry || null,
    employee_size: item.employeeSize || null,
    region: item.region || null,
    naics: item.naics || null,
    company_domain: item.companyDomain || null,
  }));

  const { data: upsertedProspects, error: snapshotError } = await mainSupabaseAdmin
    .from("prospects")
    .upsert(snapshots, { onConflict: "user_id,catalog_ref" })
    .select("id, catalog_ref");

  if (snapshotError) throw snapshotError;

  const prospectIds = (upsertedProspects || []).map((row) => row.id);
  const { data: existingLinks, error: existingLinksError } = await mainSupabaseAdmin
    .from("email_list_prospects")
    .select("prospect_id")
    .eq("list_id", listId)
    .in("prospect_id", prospectIds);

  if (existingLinksError) throw existingLinksError;

  const existingIds = new Set((existingLinks || []).map((row) => row.prospect_id));
  const newLinks = prospectIds
    .filter((prospectId) => !existingIds.has(prospectId))
    .map((prospectId) => ({
      list_id: listId,
      prospect_id: prospectId,
    }));

  if (newLinks.length > 0) {
    const { error: linkError } = await mainSupabaseAdmin.from("email_list_prospects").insert(newLinks);
    if (linkError) throw linkError;
  }

  return {
    saved: snapshots.length,
    linked: newLinks.length,
    reused: snapshots.length - newLinks.length,
  };
};

app.get("/healthz", (_req, res) => {
  res.json({
    ok: true,
    service: "search-service",
    shardCount: shardSlots.length,
    activeShards: activeShards.length,
    invalidShards: invalidShards.length,
  });
});

app.get("/api/search/filter-options", async (req, res) => {
  const user = await requireAuthenticatedUser(req, res);
  if (!user) return;

  const mode = req.query.mode === "companies" ? "companies" : "prospects";
  try {
    res.json(await loadFilterOptions(mode));
  } catch (error) {
    res.status(Number(error?.statusCode || 500)).json({ error: error?.message || "Failed to load filter options" });
  }
});

app.post("/api/search/prospects", async (req, res) => {
  const user = await requireAuthenticatedUser(req, res);
  if (!user) return;

  try {
    res.json(await runSearch("prospects", req.body || {}));
  } catch (error) {
    res
      .status(Number(error?.statusCode || 500))
      .json({ error: error?.message || "Failed to search prospects", shardStatus: error?.shardStatus || null });
  }
});

app.post("/api/search/companies", async (req, res) => {
  const user = await requireAuthenticatedUser(req, res);
  if (!user) return;

  try {
    res.json(await runSearch("companies", req.body || {}));
  } catch (error) {
    res
      .status(Number(error?.statusCode || 500))
      .json({ error: error?.message || "Failed to search companies", shardStatus: error?.shardStatus || null });
  }
});

app.get("/api/catalog/prospects/:catalogRef", async (req, res) => {
  const user = await requireAuthenticatedUser(req, res);
  if (!user) return;

  try {
    res.json(await getDetail(req.params.catalogRef));
  } catch (error) {
    res.status(404).json({ error: error?.message || "Failed to load prospect detail" });
  }
});

app.get("/api/catalog/companies/:catalogRef", async (req, res) => {
  const user = await requireAuthenticatedUser(req, res);
  if (!user) return;

  try {
    res.json(await getDetail(req.params.catalogRef));
  } catch (error) {
    res.status(404).json({ error: error?.message || "Failed to load company detail" });
  }
});

app.post("/api/lists/:listId/import-search-selection", async (req, res) => {
  const user = await requireAuthenticatedUser(req, res);
  if (!user) return;

  try {
    const workspaceContext = await getWorkspaceContext(req.headers.authorization || "");
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    if (items.length === 0) {
      res.status(400).json({ error: "At least one prospect item is required." });
      return;
    }

    const normalizedItems = items.map((item) => ({
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

    res.json(
      await saveProspectsToList({
        user,
        workspaceContext,
        listId: req.params.listId,
        items: normalizedItems,
      }),
    );
  } catch (error) {
    const status = Number(error?.statusCode || 500);
    res.status(status).json({ error: error?.message || "Failed to import search selection" });
  }
});

app.listen(SEARCH_PORT, () => {
  console.log(
    `[search-service] listening on ${SEARCH_PORT} with ${activeShards.length}/${shardSlots.length} active shard slots`,
  );
  invalidShards.forEach((slot) => {
    console.warn(`[search-service] shard ${slot.index} invalid: ${slot.reason}`);
  });
});

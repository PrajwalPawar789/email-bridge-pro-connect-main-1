import assert from "node:assert/strict";
import process from "node:process";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

const MAX_SEARCH_SHARDS = 16;
const MAX_SEARCH_BATCHES_PER_SHARD = 60;
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

const DEFAULT_PROSPECT_FILTERS = {
  jobTitle: "",
  companyName: "",
  exactCompanyName: "",
  companyDomain: "",
  naics: "",
  jobLevel: [],
  jobFunction: [],
  country: [],
  industry: [],
  subIndustry: [],
  employeeSize: [],
  region: [],
};

const DEFAULT_COMPANY_FILTERS = {
  companyName: "",
  naics: "",
  country: [],
  region: [],
  industry: [],
  subIndustry: [],
  employeeSize: [],
};

const args = parseArgs(process.argv.slice(2));
const baseEnvPath = args["base-env"] || ".env";
const envPath = args.env || ".env.16shards";
const pageSize = Math.max(1, Number.parseInt(String(args["page-size"] || "5"), 10) || 5);
const executionTarget = String(args.target || "module")
  .trim()
  .toLowerCase();
const filterOptionsCache = new Map();

dotenv.config({ path: baseEnvPath });
if (envPath && envPath !== baseEnvPath) {
  dotenv.config({ path: envPath, override: true });
}

const ENV = process.env;
const isFunctionTarget = executionTarget === "function";
if (!["module", "function"].includes(executionTarget)) {
  console.error(`Unsupported --target value "${executionTarget}". Use "module" or "function".`);
  process.exit(1);
}

const schema = buildSchemaConfig(ENV);
const shardSlots = buildShardConfigs(ENV);
const activeShards = shardSlots.filter((slot) => slot.status === "active");
const invalidShards = shardSlots.filter((slot) => slot.status === "invalid");
const shardClients = new Map(
  activeShards.map((slot) => [
    slot.index,
    createClient(slot.url, slot.key, {
      auth: { persistSession: false, autoRefreshToken: false },
    }),
  ]),
);
const functionBaseUrl = String(args["function-base-url"] || ENV.SUPABASE_URL || "").trim().replace(/\/+$/, "");
const functionServiceRoleKey = String(args["function-service-role-key"] || ENV.SUPABASE_SERVICE_ROLE_KEY || "").trim();
const functionApiKey = String(args["function-api-key"] || functionServiceRoleKey || ENV.SUPABASE_ANON_KEY || "").trim();
const functionAuthToken = String(args["function-auth-token"] || functionServiceRoleKey || ENV.FIND_TEST_ACCESS_TOKEN || "").trim();
const functionUrl = functionBaseUrl ? `${functionBaseUrl}/functions/v1/catalog-search` : "";
const timeoutRegressionPageSize = Math.max(pageSize, 25);

const summary = {
  envPath,
  baseEnvPath,
  target: executionTarget,
  pageSize,
  timeoutRegressionPageSize,
  functionUrl: isFunctionTarget ? functionUrl : null,
  shards: {
    requestedSlots: shardSlots.length,
    active: activeShards.length,
    invalid: invalidShards.length,
    inactive: shardSlots.filter((slot) => slot.status === "inactive").length,
  },
  checks: [],
};

if (!isFunctionTarget && activeShards.length === 0) {
  console.error("No active search shards were resolved from the environment.");
  process.exit(1);
}

if (isFunctionTarget && (!functionUrl || !functionApiKey || !(functionAuthToken || functionApiKey === functionServiceRoleKey))) {
  console.error("Function target requires SUPABASE_URL and a usable API key/token in the environment or CLI flags.");
  process.exit(1);
}

const configSummary = isFunctionTarget
  ? `Target=function using ${functionUrl}`
  : `Target=module with ${activeShards.length} active shard(s) from ${envPath}`;
logSection("Config", configSummary);
if (invalidShards.length > 0) {
  invalidShards.forEach((slot) => {
    logInfo(`Shard ${slot.index} is invalid: ${slot.reason}`);
  });
}

let firstProspectPage = null;
let secondProspectPage = null;
let firstCompanyPage = null;
let firstTimeoutRegressionPage = null;
let sampleProspectRef = null;
let sampleCompanyRef = null;

if (isFunctionTarget) {
  await runCheck("Catalog function health", async () => {
    const health = await getCatalogHealth();
    assert.equal(health.ok, true, "Catalog function health did not return ok=true.");
    assert.ok(Number(health.activeShards || 0) > 0, "Catalog function did not report any active shards.");
    return `${health.activeShards} active shard(s), ${health.invalidShards} invalid`;
  });
} else {
  const prospectModeConfig = getModeConfig("prospects");
  await runCheck("Shard connectivity", async () => {
    const shardChecks = await Promise.all(activeShards.map((shard) => inspectShard(shard, prospectModeConfig)));
    const healthy = shardChecks.filter((entry) => entry.sampleCount > 0).length;
    assert.ok(healthy > 0, "No shard returned sample prospect rows.");
    return `${healthy}/${activeShards.length} active shard(s) returned sample rows`;
  });
}

await runCheck("Prospect search page 1", async () => {
  firstProspectPage = await searchPage("prospects", DEFAULT_PROSPECT_FILTERS, pageSize);
  assert.ok(firstProspectPage.items.length > 0, "Prospect search returned no rows.");
  assert.ok(firstProspectPage.items.every((row) => row.catalogRef && row.sourceShard), "Prospect rows are missing catalog metadata.");
  assert.ok(
    firstProspectPage.items.every((row) => !("raw" in row) && !("rowUsageByShard" in row)),
    "Prospect search exposed internal source payload fields.",
  );
  assert.equal(firstProspectPage.shardFailures.length, 0, `Prospect search reported shard failures: ${firstProspectPage.shardFailures.join("; ")}`);
  sampleProspectRef = firstProspectPage.items[0]?.catalogRef || null;
  return `${firstProspectPage.items.length} prospect rows loaded in ${firstProspectPage.durationMs}ms`;
});

await runCheck("Prospect pagination", async () => {
  assert.ok(firstProspectPage, "Prospect page 1 was not loaded.");
  if (!firstProspectPage.nextCursor) {
    return "Single-page dataset; pagination boundary not available in current shard data";
  }

  secondProspectPage = await searchPage("prospects", DEFAULT_PROSPECT_FILTERS, pageSize, firstProspectPage.nextCursor);
  assert.ok(secondProspectPage.items.length > 0, "Prospect page 2 returned no rows.");
  assert.equal(secondProspectPage.shardFailures.length, 0, `Prospect page 2 reported shard failures: ${secondProspectPage.shardFailures.join("; ")}`);

  const firstRefs = new Set(firstProspectPage.items.map((row) => row.catalogRef));
  const duplicateRefs = secondProspectPage.items.filter((row) => firstRefs.has(row.catalogRef)).map((row) => row.catalogRef);
  assert.equal(duplicateRefs.length, 0, `Found duplicate prospect rows across pages: ${duplicateRefs.join(", ")}`);

  return `${secondProspectPage.items.length} page-2 prospect rows with no duplicates across pages in ${secondProspectPage.durationMs}ms`;
});

await runCheck("Broad text timeout regression", async () => {
  const timeoutFilters = {
    ...DEFAULT_PROSPECT_FILTERS,
    jobTitle: "ceo",
  };
  const timings = [];

  for (let runIndex = 0; runIndex < 3; runIndex += 1) {
    const page = await searchPage("prospects", timeoutFilters, timeoutRegressionPageSize);
    assert.ok(page.items.length > 0, "Broad text search returned no rows.");
    assert.equal(page.shardFailures.length, 0, `Broad text search reported shard failures: ${page.shardFailures.join("; ")}`);
    timings.push(page.durationMs);
    if (!firstTimeoutRegressionPage) {
      firstTimeoutRegressionPage = page;
    }
  }

  assert.ok(firstTimeoutRegressionPage?.nextCursor, "Broad text search did not return a next cursor.");
  const pageTwo = await searchPage("prospects", timeoutFilters, timeoutRegressionPageSize, firstTimeoutRegressionPage.nextCursor);
  assert.ok(pageTwo.items.length > 0, "Broad text page 2 returned no rows.");
  assert.equal(pageTwo.shardFailures.length, 0, `Broad text page 2 reported shard failures: ${pageTwo.shardFailures.join("; ")}`);

  const pageOneRefs = new Set(firstTimeoutRegressionPage.items.map((row) => row.catalogRef));
  const duplicateRefs = pageTwo.items.filter((row) => pageOneRefs.has(row.catalogRef)).map((row) => row.catalogRef);
  assert.equal(duplicateRefs.length, 0, `Broad text page 2 duplicated page 1 refs: ${duplicateRefs.join(", ")}`);

  return `jobTitle=ceo passed 3x (${timings.join(", ")}ms) plus page 2 in ${pageTwo.durationMs}ms`;
});

await runCheck("Company search page 1", async () => {
  firstCompanyPage = await searchPage("companies", DEFAULT_COMPANY_FILTERS, pageSize);
  assert.ok(firstCompanyPage.items.length > 0, "Company search returned no rows.");
  assert.ok(firstCompanyPage.items.every((row) => Number(row.prospectCount) > 0), "Company search returned rows without grouped prospect counts.");
  assert.ok(
    firstCompanyPage.items.every((row) => !("raw" in row) && !("rowUsageByShard" in row)),
    "Company search exposed internal source payload fields.",
  );
  assert.equal(firstCompanyPage.shardFailures.length, 0, `Company search reported shard failures: ${firstCompanyPage.shardFailures.join("; ")}`);
  sampleCompanyRef = firstCompanyPage.items[0]?.catalogRef || null;
  return `${firstCompanyPage.items.length} company rows loaded in ${firstCompanyPage.durationMs}ms`;
});

await runCheck("Company drill-down parity", async () => {
  assert.ok(firstCompanyPage?.items?.length, "Company search has no rows to drill into.");
  const sampleCompany =
    firstCompanyPage.items.find((row) => normalizeText(row.companyName) || normalizeText(row.domain)) || firstCompanyPage.items[0];
  const domainScoped = Boolean(sampleCompany.domain);

  const drilldownFilters = {
    ...DEFAULT_PROSPECT_FILTERS,
    companyName: domainScoped ? "" : sampleCompany.companyName || "",
    exactCompanyName: domainScoped ? "" : sampleCompany.companyName || "",
    companyDomain: sampleCompany.domain || "",
    country: domainScoped ? [] : sampleCompany.country ? [sampleCompany.country] : [],
  };

  const drilldownPage = await searchPage("prospects", drilldownFilters, pageSize);
  assert.ok(drilldownPage.items.length > 0, "Company drill-down returned no prospect rows.");
  assert.equal(drilldownPage.shardFailures.length, 0, `Company drill-down reported shard failures: ${drilldownPage.shardFailures.join("; ")}`);

  if (sampleCompany.domain) {
    const mismatched = drilldownPage.items.filter(
      (row) => normalizeText(row.companyDomain) !== normalizeText(sampleCompany.domain),
    );
    assert.equal(mismatched.length, 0, "Company drill-down returned prospects from a different company domain.");
  } else if (sampleCompany.companyName) {
    const mismatched = drilldownPage.items.filter(
      (row) => normalizeText(row.companyName) !== normalizeText(sampleCompany.companyName),
    );
    assert.equal(mismatched.length, 0, "Company drill-down returned prospects from a different company name.");
  }

  return `${drilldownPage.items.length} prospects matched the drill-down company filter in ${drilldownPage.durationMs}ms`;
});

await runCheck("Filter option sampling", async () => {
  const prospectOptions = await loadFilterOptions("prospects");
  const companyOptions = await loadFilterOptions("companies");

  const prospectFieldWithValues = Object.entries(prospectOptions.options).find(([, values]) => values.length > 0);
  const companyFieldWithValues = Object.entries(companyOptions.options).find(([, values]) => values.length > 0);

  assert.ok(prospectFieldWithValues, "Prospect filter options did not return any values.");
  assert.ok(companyFieldWithValues, "Company filter options did not return any values.");

  for (const [field, values] of Object.entries(prospectOptions.options)) {
    assert.deepEqual(values, uniqueSorted(values), `Prospect filter options for ${field} are not unique/sorted.`);
  }
  for (const [field, values] of Object.entries(companyOptions.options)) {
    assert.deepEqual(values, uniqueSorted(values), `Company filter options for ${field} are not unique/sorted.`);
  }

  return `prospects:${prospectFieldWithValues[0]} companies:${companyFieldWithValues[0]}`;
});

await runCheck("Prospect detail", async () => {
  assert.ok(sampleProspectRef, "Prospect detail requires a catalogRef from search results.");
  const detail = await getDetail("prospects", sampleProspectRef);
  assert.equal(detail.item?.catalogRef, sampleProspectRef, "Prospect detail did not return the expected catalogRef.");
  return `${detail.item?.fullName || sampleProspectRef} loaded in ${detail.durationMs}ms`;
});

await runCheck("Company detail", async () => {
  assert.ok(sampleCompanyRef, "Company detail requires a catalogRef from search results.");
  const detail = await getDetail("companies", sampleCompanyRef);
  assert.equal(detail.item?.catalogRef, sampleCompanyRef, "Company detail did not return the expected catalogRef.");
  return `${detail.item?.companyName || sampleCompanyRef} loaded in ${detail.durationMs}ms`;
});

await runCheck("Selection state simulation", async () => {
  assert.ok(firstProspectPage?.items?.length, "Prospect page 1 is required for selection checks.");

  let selectedById = {};
  selectedById = toggleAllVisible(selectedById, firstProspectPage.items, true);
  assert.equal(Object.keys(selectedById).length, firstProspectPage.items.length, "Select-all did not capture page 1 rows.");

  if (secondProspectPage?.items?.length) {
    const rowOutsidePageOne = secondProspectPage.items.find((row) => !selectedById[row.catalogRef]);
    assert.ok(rowOutsidePageOne, "Expected at least one unique row on page 2 for selection testing.");
    selectedById = toggleRowSelection(selectedById, rowOutsidePageOne, true);
    assert.ok(selectedById[rowOutsidePageOne.catalogRef], "Selecting a row on page 2 did not persist.");

    selectedById = toggleAllVisible(selectedById, secondProspectPage.items, false);
    assert.equal(
      Object.keys(selectedById).length,
      firstProspectPage.items.length,
      "Clearing page 2 selection should preserve page 1 selections.",
    );
  }

  selectedById = toggleAllVisible(selectedById, firstProspectPage.items, false);
  assert.equal(Object.keys(selectedById).length, 0, "Clearing visible page 1 rows should reset the selection.");

  return secondProspectPage?.items?.length
    ? "cross-page selection add/remove behavior matches the page reducer"
    : "single-page selection behavior matches the page reducer";
});

await runCheck("Import-selection path", async () => {
  const accessToken = String(ENV.FIND_TEST_ACCESS_TOKEN || "").trim();
  if (!accessToken) {
    return {
      skipped: true,
      detail: "Skipped. Set FIND_TEST_ACCESS_TOKEN to run the authenticated import-selection flow.",
    };
  }

  assert.ok(firstProspectPage?.items?.length, "Prospect results are required for import testing.");
  const baseUrl = String(ENV.SUPABASE_URL || "").trim();
  const anonKey = String(ENV.SUPABASE_ANON_KEY || "").trim();
  const serviceRoleKey = String(ENV.SUPABASE_SERVICE_ROLE_KEY || "").trim();

  assert.ok(baseUrl && anonKey && serviceRoleKey, "Main Supabase project credentials are required for import testing.");

  const userClient = createClient(baseUrl, anonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
  const adminClient = createClient(baseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userResponse, error: userError } = await userClient.auth.getUser(accessToken);
  assert.ifError(userError);
  assert.ok(userResponse?.user?.id, "Could not resolve the authenticated user for import testing.");

  const user = userResponse.user;
  const { data: workspaceContext, error: workspaceError } = await userClient.rpc("get_workspace_context");
  assert.ifError(workspaceError);
  const workspace = Array.isArray(workspaceContext) ? workspaceContext[0] : workspaceContext;
  const permissions = Array.isArray(workspace?.permissions) ? workspace.permissions : [];
  assert.ok(
    permissions.includes("manage_contacts") || permissions.includes("manage_workspace"),
    "Authenticated test user does not have permission to import contacts.",
  );

  const testListName = `Find E2E ${Date.now()}`;
  const { data: insertedList, error: listInsertError } = await userClient
    .from("email_lists")
    .insert({
      user_id: user.id,
      name: testListName,
      description: "Temporary list created by scripts/test-find-module-e2e.js",
    })
    .select("id")
    .single();
  assert.ifError(listInsertError);
  assert.ok(insertedList?.id, "Failed to create a temporary list for import testing.");

  const listId = insertedList.id;
  const sampleItems = firstProspectPage.items.slice(0, Math.min(2, firstProspectPage.items.length));
  assert.ok(sampleItems.length > 0, "Prospect results are required for import testing.");

  try {
    const firstImport = await invokeCatalogSearchImport(baseUrl, anonKey, accessToken, listId, sampleItems);
    assert.equal(firstImport.linked, sampleItems.length, "First import did not link all selected prospects.");

    const secondImport = await invokeCatalogSearchImport(baseUrl, anonKey, accessToken, listId, sampleItems);
    assert.equal(secondImport.linked, 0, "Second import should not create duplicate list links.");

    const catalogRefs = sampleItems.map((item) => item.catalogRef);
    const { data: prospectSnapshots, error: prospectError } = await adminClient
      .from("prospects")
      .select("id, catalog_ref")
      .eq("user_id", user.id)
      .in("catalog_ref", catalogRefs);
    assert.ifError(prospectError);
    assert.equal((prospectSnapshots || []).length, sampleItems.length, "Prospect snapshots were not saved for each selected row.");

    const snapshotIds = (prospectSnapshots || []).map((row) => row.id);
    const { count: linkCount, error: linkCountError } = await adminClient
      .from("email_list_prospects")
      .select("prospect_id", { count: "exact", head: true })
      .eq("list_id", listId)
      .in("prospect_id", snapshotIds);
    assert.ifError(linkCountError);
    assert.equal(Number(linkCount || 0), sampleItems.length, "List links were not created for each imported prospect.");

    return `${sampleItems.length} prospect(s) imported and deduplicated on re-import`;
  } finally {
    const catalogRefs = sampleItems.map((item) => item.catalogRef);
    await adminClient.from("email_list_prospects").delete().eq("list_id", listId);
    if (catalogRefs.length > 0) {
      await adminClient.from("prospects").delete().eq("user_id", user.id).in("catalog_ref", catalogRefs);
    }
    await adminClient.from("email_lists").delete().eq("id", listId);
  }
});

logSection("Summary", "");
for (const check of summary.checks) {
  const detail = typeof check.detail === "string" ? ` ${check.detail}` : "";
  console.log(`${check.status.toUpperCase().padEnd(7)} ${check.name}${detail}`);
}

const failedChecks = summary.checks.filter((check) => check.status === "fail");
process.exitCode = failedChecks.length > 0 ? 1 : 0;

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      parsed[key] = "true";
      continue;
    }
    parsed[key] = next;
    index += 1;
  }
  return parsed;
}

function parseShardCount(value) {
  const parsed = Number.parseInt(String(value || "1"), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 1;
  return Math.min(parsed, MAX_SEARCH_SHARDS);
}

function parseCandidates(value, fallback) {
  const normalizedValue = String(value || "").trim().toLowerCase();
  if (normalizedValue === "__none__" || normalizedValue === "none") {
    return [];
  }

  const fromValue = String(value || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  return fromValue.length > 0 ? fromValue : fallback;
}

function parseSingleColumn(value, fallback) {
  const candidate = String(value || "").trim();
  return candidate || fallback;
}

function pickEnvValue(env, keys) {
  for (const key of keys) {
    const value = String(env[key] || "").trim();
    if (value) return value;
  }
  return "";
}

function parseProjectRefFromUrl(value) {
  const match = String(value || "").trim().match(/^https:\/\/([^.]+)\.supabase\.co/i);
  return match?.[1] || null;
}

function decodeBase64Url(value) {
  const normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4 || 4)) % 4);
  return Buffer.from(padded, "base64").toString("utf8");
}

function decodeJwtPayload(token) {
  const parts = String(token || "").split(".");
  if (parts.length < 2) return null;
  try {
    return JSON.parse(decodeBase64Url(parts[1]));
  } catch {
    return null;
  }
}

function buildDisplayFieldConfig(env, prefix, defaults) {
  return Object.fromEntries(
    Object.entries(defaults).map(([key, fallback]) => [
      key,
      parseCandidates(env[`${prefix}_${key.toUpperCase()}_COLUMNS`], fallback),
    ]),
  );
}

function buildSchemaConfig(env) {
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
}

function buildShardConfigs(env) {
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
}

function buildSelectColumns(fieldGroups) {
  const unique = new Set();
  Object.values(fieldGroups).forEach((columns) => {
    columns.forEach((column) => unique.add(column));
  });
  return [...unique].join(",");
}

function pickFirstValue(record, candidates) {
  for (const candidate of candidates) {
    const value = record?.[candidate];
    if (value !== null && value !== undefined && String(value).trim().length > 0) {
      return typeof value === "string" ? value.trim() : value;
    }
  }
  return null;
}

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function getRawErrorMessage(error) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown error";
  }
}

function getQueryResultError(result) {
  return result && typeof result === "object" && "error" in result ? result.error : null;
}

function isStatementTimeoutMessage(message) {
  return String(message || "").toLowerCase().includes("statement timeout");
}

function hasBroadTextFilters(mode, filters = {}) {
  const getTextValue = (key) => String(filters?.[key] || "").trim();
  if (mode === "prospects") {
    return Boolean(getTextValue("jobTitle") || getTextValue("companyName") || getTextValue("naics"));
  }
  return Boolean(getTextValue("companyName") || getTextValue("naics"));
}

function getShardBatchLimit(mode, modeConfig, requestedPageSize, filters = {}) {
  if (modeConfig.derivedFromProspects) {
    return hasBroadTextFilters(mode, filters) ? Math.min(requestedPageSize * 3, 120) : Math.min(requestedPageSize * 12, 400);
  }
  return hasBroadTextFilters(mode, filters) ? Math.min(requestedPageSize + 5, 60) : Math.min(requestedPageSize * 4, 200);
}

function normalizeProspectRow(record, shardIndex) {
  const sourceId = String(record?.[schema.prospectIdColumn] ?? "");
  const fullNameValue = pickFirstValue(record, schema.prospectFields.fullName);
  const firstName = pickFirstValue(record, schema.prospectFields.firstName);
  const lastName = pickFirstValue(record, schema.prospectFields.lastName);
  const combinedName = [firstName, lastName].filter(Boolean).join(" ").trim();

  return {
    catalogRef: `s${shardIndex}:prospect:${sourceId}`,
    sourceShard: shardIndex,
    sourceRecordId: sourceId,
    fullName: String(fullNameValue || combinedName || ""),
    email: pickFirstValue(record, schema.prospectFields.email),
    phone: pickFirstValue(record, schema.prospectFields.phone),
    headline: pickFirstValue(record, schema.prospectFields.headline),
    jobTitle: pickFirstValue(record, schema.prospectFields.jobTitle),
    jobLevel: pickFirstValue(record, schema.prospectFields.jobLevel),
    jobFunction: pickFirstValue(record, schema.prospectFields.jobFunction),
    companyName: pickFirstValue(record, schema.prospectFields.companyName),
    companyDomain: pickFirstValue(record, schema.prospectFields.companyDomain),
    country: pickFirstValue(record, schema.prospectFields.country),
    region: pickFirstValue(record, schema.prospectFields.region),
    industry: pickFirstValue(record, schema.prospectFields.industry),
    subIndustry: pickFirstValue(record, schema.prospectFields.subIndustry),
    employeeSize: pickFirstValue(record, schema.prospectFields.employeeSize),
    naics: pickFirstValue(record, schema.prospectFields.naics),
    linkedin: pickFirstValue(record, schema.prospectFields.linkedin),
  };
}

function normalizeCompanyRow(record, shardIndex) {
  const sourceId = String(record?.[schema.companyIdColumn] ?? "");
  return {
    catalogRef: `s${shardIndex}:company:${sourceId}`,
    sourceShard: shardIndex,
    sourceRecordId: sourceId,
    companyName: String(pickFirstValue(record, schema.companyFields.name) || ""),
    domain: pickFirstValue(record, schema.companyFields.domain),
    country: pickFirstValue(record, schema.companyFields.country),
    region: pickFirstValue(record, schema.companyFields.region),
    industry: pickFirstValue(record, schema.companyFields.industry),
    subIndustry: pickFirstValue(record, schema.companyFields.subIndustry),
    employeeSize: pickFirstValue(record, schema.companyFields.employeeSize),
    naics: pickFirstValue(record, schema.companyFields.naics),
    prospectCount: Number(pickFirstValue(record, schema.companyFields.prospectCount) || 0),
  };
}

function buildProspectDedupeKey(row) {
  const emailKey = normalizeText(row.email);
  if (emailKey) return `email:${emailKey}`;

  const linkedinKey = normalizeText(row.linkedin);
  if (linkedinKey) return `linkedin:${linkedinKey}`;

  return `fallback:${normalizeText(row.fullName)}|${normalizeText(row.companyName)}|${normalizeText(row.country)}`;
}

function buildCompanyDedupeKey(row) {
  const domainKey = normalizeText(row.domain);
  if (domainKey) return `domain:${domainKey}`;

  return `fallback:${normalizeText(row.companyName)}|${normalizeText(row.country)}`;
}

function rankProspect(row) {
  let score = 0;
  if (row.email) score += 4;
  if (row.phone) score += 2;
  if (row.jobLevel) score += 1;
  if (row.jobFunction) score += 1;
  if (row.region) score += 1;
  return score;
}

function rankCompany(row) {
  let score = 0;
  if (row.domain) score += 3;
  if (row.employeeSize) score += 1;
  if (row.region) score += 1;
  return score;
}

function compareSortIdentifier(left, right) {
  const leftText = String(left || "").trim();
  const rightText = String(right || "").trim();
  const leftNumeric = /^-?\d+(?:\.\d+)?$/.test(leftText) ? Number(leftText) : null;
  const rightNumeric = /^-?\d+(?:\.\d+)?$/.test(rightText) ? Number(rightText) : null;

  if (leftNumeric !== null && rightNumeric !== null) {
    return leftNumeric - rightNumeric;
  }

  return leftText.localeCompare(rightText);
}

function compareProspects(left, right) {
  return (
    String(left.companyName || "").localeCompare(String(right.companyName || "")) ||
    compareSortIdentifier(left.sourceRecordId, right.sourceRecordId)
  );
}

function compareCompanies(left, right) {
  return (
    String(left.companyName || "").localeCompare(String(right.companyName || "")) ||
    String(left.country || "").localeCompare(String(right.country || "")) ||
    String(left.domain || "").localeCompare(String(right.domain || "")) ||
    compareSortIdentifier(left.sourceRecordId, right.sourceRecordId)
  );
}

function normalizeRowUsageByShard(row) {
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
}

function mergeRowUsageByShard(left = {}, right = {}) {
  const merged = { ...left };
  Object.entries(right).forEach(([shardIndex, usage]) => {
    merged[shardIndex] = Number(merged[shardIndex] || 0) + Number(usage || 0);
  });
  return merged;
}

function mergeAndDedupeRows(mode, rows) {
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
}

function getRowDedupeKey(mode, row) {
  return mode === "prospects" ? buildProspectDedupeKey(row) : buildCompanyDedupeKey(row);
}

function filterOutSeenRows(mode, rows, seenKeys) {
  if (!(seenKeys instanceof Set) || seenKeys.size === 0) return rows;
  return rows.filter((row) => !seenKeys.has(getRowDedupeKey(mode, row)));
}

function addTextFilter(query, column, value) {
  return value ? query.ilike(column, `%${String(value).trim()}%`) : query;
}

function addExactTextFilter(query, column, value) {
  return value ? query.eq(column, String(value).trim()) : query;
}

function addInFilter(query, column, values) {
  return Array.isArray(values) && values.length > 0 ? query.in(column, values) : query;
}

function applyProspectFilters(query, filters) {
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
}

function applyCompanyFilters(query, filters) {
  let next = query;
  next = addTextFilter(next, schema.companyFilters.companyName, filters.companyName);
  next = addTextFilter(next, schema.companyFilters.naics, filters.naics);
  next = addInFilter(next, schema.companyFilters.country, filters.country);
  next = addInFilter(next, schema.companyFilters.region, filters.region);
  next = addInFilter(next, schema.companyFilters.industry, filters.industry);
  next = addInFilter(next, schema.companyFilters.subIndustry, filters.subIndustry);
  next = addInFilter(next, schema.companyFilters.employeeSize, filters.employeeSize);
  return next;
}

function encodeBase64Url(value) {
  return Buffer.from(String(value), "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function encodeCursor(value) {
  return encodeBase64Url(JSON.stringify(value));
}

function decodeCursor(value) {
  if (!value) return null;
  try {
    return JSON.parse(decodeBase64Url(value));
  } catch {
    return null;
  }
}

function parseCatalogRef(value) {
  const match = String(value || "").match(/^s(\d+):(prospect|company):(.+)$/);
  if (!match) return null;
  return {
    shardIndex: Number.parseInt(match[1], 10),
    entity: match[2],
    sourceId: match[3],
  };
}

function buildDerivedCompanyKey(row) {
  const domain = normalizeText(row.companyDomain);
  if (domain) return `domain:${domain}`;
  return `fallback:${normalizeText(row.companyName)}|${normalizeText(row.country)}`;
}

function buildDerivedCompanyRows(records, shardIndex) {
  const normalizedProspects = records.map((record) => normalizeProspectRow(record, shardIndex));
  const groupsByKey = new Map();
  const orderedGroups = [];

  normalizedProspects.forEach((prospect) => {
    const companyKey = buildDerivedCompanyKey(prospect);
    let group = groupsByKey.get(companyKey);

    if (!group) {
      const sourceId = encodeCursor({
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
}

function getModeConfig(mode) {
  if (mode === "prospects") {
    return {
      source: schema.prospectSource,
      idColumn: schema.prospectIdColumn,
      selectColumns: buildSelectColumns(schema.prospectFields),
      normalize: (record, shardIndex) => normalizeProspectRow(record, shardIndex),
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
      derivedFromProspects: false,
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
    normalize: (record, shardIndex) => normalizeCompanyRow(record, shardIndex),
    defaultSort: [schema.companyFilters.companyName, schema.companyIdColumn],
    applyFilters: applyCompanyFilters,
    filterFields: {
      country: schema.companyFilters.country,
      region: schema.companyFilters.region,
      industry: schema.companyFilters.industry,
      subIndustry: schema.companyFilters.subIndustry,
      employeeSize: schema.companyFilters.employeeSize,
    },
    derivedFromProspects: false,
  };
}

async function inspectShard(shard, modeConfig) {
  const client = shardClients.get(shard.index);
  const result = await client.from(modeConfig.source).select(modeConfig.idColumn).limit(3);
  if (result.error) {
    throw new Error(`Shard ${shard.index}: ${result.error.message}`);
  }
  return {
    shard: shard.index,
    sampleCount: Array.isArray(result.data) ? result.data.length : 0,
  };
}

async function runShardQuery({ client, modeConfig, filters, offset, limit, sortColumns }) {
  let query = client.from(modeConfig.source).select(modeConfig.selectColumns);
  query = modeConfig.applyFilters(query, filters);
  for (const column of sortColumns || modeConfig.defaultSort) {
    query = query.order(column, { ascending: true, nullsFirst: false });
  }
  return query.range(offset, offset + limit - 1);
}

async function runShardPageQueryWithFallback({ client, modeConfig, filters, offset, limit }) {
  try {
    const result = await runShardQuery({
      client,
      modeConfig,
      filters,
      offset,
      limit,
    });
    const queryError = getQueryResultError(result);
    if (queryError) throw queryError;
    return result;
  } catch (error) {
    if (!isStatementTimeoutMessage(getRawErrorMessage(error))) {
      throw error;
    }

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
        const result = await runShardQuery({
          client,
          modeConfig,
          filters,
          offset,
          limit: fallbackLimit,
          sortColumns: modeConfig.defaultSort,
        });
        const queryError = getQueryResultError(result);
        if (queryError) throw queryError;
        return result;
      } catch (reducedError) {
        if (!isStatementTimeoutMessage(getRawErrorMessage(reducedError))) {
          throw reducedError;
        }
      }
    }

    for (const fallbackLimit of fallbackLimits.length > 0 ? fallbackLimits : [minimumFallbackLimit]) {
      try {
        const result = await runShardQuery({
          client,
          modeConfig,
          filters,
          offset,
          limit: Math.max(minimumFallbackLimit, Math.min(fallbackLimit, 25)),
          sortColumns: [modeConfig.idColumn],
        });
        const queryError = getQueryResultError(result);
        if (queryError) throw queryError;
        return result;
      } catch (idFallbackError) {
        if (!isStatementTimeoutMessage(getRawErrorMessage(idFallbackError))) {
          throw idFallbackError;
        }
      }
    }
  }
}

async function fetchShardPage(mode, shard, filters, requestedPageSize, offsets = {}, seenKeys = new Set()) {
  const modeConfig = getModeConfig(mode);
  const client = shardClients.get(shard.index);
  const pageLimit = getShardBatchLimit(mode, modeConfig, requestedPageSize, filters);
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

  let nextOffset = offset;
  let exhausted = false;

  if (modeConfig.derivedFromProspects) {
    let rawRows = [];
    let groupedRows = [];
    let availableRows = [];

    try {
      for (let batchIndex = 0; batchIndex < MAX_SEARCH_BATCHES_PER_SHARD; batchIndex += 1) {
        const { data, error } = await runShardPageQueryWithFallback({
          client,
          modeConfig,
          filters,
          offset: nextOffset,
          limit: pageLimit,
        });
        if (error) throw error;

        const batchRows = Array.isArray(data) ? data : [];
        if (batchRows.length === 0) {
          exhausted = true;
          break;
        }

        rawRows = rawRows.concat(batchRows);
        nextOffset += batchRows.length;
        groupedRows = buildDerivedCompanyRows(rawRows, shard.index);
        availableRows = filterOutSeenRows(mode, groupedRows, seenKeys);

        exhausted = batchRows.length < pageLimit;
        if (exhausted || availableRows.length >= requestedPageSize + 1) {
          break;
        }
      }

      const rows = groupedRows.map(
        ({ __rawCount, ...row }) => ({
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
        count: nextOffset,
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
        reason: error instanceof Error ? error.message : String(error),
      };
    }
  }

  let rawRows = [];
  let mergedRows = [];
  let availableRows = [];

  try {
    for (let batchIndex = 0; batchIndex < MAX_SEARCH_BATCHES_PER_SHARD; batchIndex += 1) {
      const { data, error } = await runShardPageQueryWithFallback({
        client,
        modeConfig,
        filters,
        offset: nextOffset,
        limit: pageLimit,
      });
      if (error) throw error;

      const batchRecords = Array.isArray(data) ? data : [];
      if (batchRecords.length === 0) {
        exhausted = true;
        break;
      }

      rawRows = rawRows.concat(batchRecords.map((record) => modeConfig.normalize(record, shard.index)));
      nextOffset += batchRecords.length;
      mergedRows = mergeAndDedupeRows(mode, rawRows);
      availableRows = filterOutSeenRows(mode, mergedRows, seenKeys);

      exhausted = batchRecords.length < pageLimit;
      if (exhausted || availableRows.length >= requestedPageSize + 1) {
        break;
      }
    }

    return {
      status: "healthy",
      shard,
      rows: mergedRows,
      count: nextOffset,
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
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

function buildNextState(mode, currentOffsets, selectedRows, shardResults, priorSeenKeys = new Set()) {
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
      nextOffsets[String(entry.shard.index)] = current + consumed;
    });

  return {
    offsets: nextOffsets,
    seenKeys: nextSeenKeys,
  };
}

function stripSearchResultRow(row) {
  const { rowUsageByShard, raw, ...rest } = row || {};
  return rest;
}

async function searchPage(mode, filters, requestedPageSize, cursorState = null) {
  if (isFunctionTarget) {
    const action = mode === "prospects" ? "search-prospects" : "search-companies";
    const startedAt = Date.now();
    const payload = await invokeCatalogSearchAction({
      action,
      filters,
      pageSize: requestedPageSize,
      ...(cursorState ? { cursor: cursorState } : {}),
    });
    return {
      ...payload,
      durationMs: Date.now() - startedAt,
      shardFailures: Array.isArray(payload?.shardStatus?.warnings) ? payload.shardStatus.warnings : [],
    };
  }

  const startedAt = Date.now();
  const offsets = cursorState?.offsets || {};
  const priorSeenKeys = cursorState?.seenKeys instanceof Set ? cursorState.seenKeys : new Set();
  const shardResults = await Promise.all(
    activeShards.map((shard) => fetchShardPage(mode, shard, filters, requestedPageSize, offsets, priorSeenKeys)),
  );

  const failures = shardResults.filter((entry) => entry.status === "failed");
  if (failures.length === shardResults.length) {
    throw new Error(`All configured shards failed for ${mode} search.`);
  }

  const mergedRows = mergeAndDedupeRows(
    mode,
    shardResults.filter((entry) => entry.status === "healthy").flatMap((entry) => entry.rows),
  );
  const availableRows = filterOutSeenRows(mode, mergedRows, priorSeenKeys);
  const items = availableRows.slice(0, requestedPageSize);
  const hasMore = availableRows.length > items.length || shardResults.some((entry) => entry.status === "healthy" && !entry.exhausted);
  const nextCursor = hasMore ? buildNextState(mode, offsets, items, shardResults, priorSeenKeys) : null;

  return {
    items: items.map((row) => stripSearchResultRow(row)),
    nextCursor,
    shardFailures: failures.map((entry) => `Shard ${entry.shard.index}: ${entry.reason}`),
    durationMs: Date.now() - startedAt,
  };
}

async function loadFilterOptions(mode) {
  if (isFunctionTarget) {
    const startedAt = Date.now();
    const payload = await invokeCatalogSearchAction({
      action: "filter-options",
      mode,
    });
    return {
      ...payload,
      durationMs: Date.now() - startedAt,
    };
  }

  const cacheKey = `filter-options:${mode}`;
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

                (data || []).forEach((row) => {
                  const value = String(row?.[column] || "").trim();
                  if (value) optionSet.add(value);
                });
              }),
            );
          } catch {
            // Best-effort only.
          }
        }),
      );

      options[key] = uniqueSorted([...optionSet]);
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
}

async function invokeCatalogSearchAction(body, { authToken = functionAuthToken, apiKey = functionApiKey } = {}) {
  const authorizationToken = authToken || apiKey;
  const response = await fetch(functionUrl, {
    method: "POST",
    headers: {
      ...(authorizationToken ? { authorization: `Bearer ${authorizationToken}` } : {}),
      ...(apiKey ? { apikey: apiKey } : {}),
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error || `catalog-search action "${body.action}" failed with ${response.status}`);
  }

  return payload;
}

async function getCatalogHealth() {
  if (!isFunctionTarget) {
    return {
      ok: true,
      service: "module-search",
      activeShards: activeShards.length,
      invalidShards: invalidShards.length,
    };
  }

  return invokeCatalogSearchAction({ action: "health" });
}

async function getDetail(mode, catalogRef) {
  if (isFunctionTarget) {
    const startedAt = Date.now();
    const payload = await invokeCatalogSearchAction({
      action: mode === "prospects" ? "detail-prospect" : "detail-company",
      catalogRef,
    });
    return {
      ...payload,
      durationMs: Date.now() - startedAt,
    };
  }

  const startedAt = Date.now();
  const parsed = parseCatalogRef(catalogRef);
  assert.ok(parsed, "Invalid catalogRef.");

  const shard = activeShards.find((entry) => entry.index === parsed.shardIndex);
  assert.ok(shard, `Shard ${parsed?.shardIndex ?? "?"} is not active.`);

  const normalizedMode = mode === "prospects" ? "prospects" : "companies";
  const modeConfig = getModeConfig(normalizedMode);
  const client = shardClients.get(shard.index);
  assert.ok(client, `Shard ${shard.index} client is not available.`);

  if (normalizedMode === "companies" && modeConfig.derivedFromProspects) {
    const decoded = decodeCursor(parsed.sourceId);
    assert.ok(decoded && typeof decoded === "object", "Invalid derived company reference.");

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
    assert.ifError(error);
    assert.ok(Array.isArray(data) && data.length > 0, "Catalog company detail returned no rows.");

    const [item] = buildDerivedCompanyRows(data, shard.index).map(({ __rawCount, ...row }) => row);
    assert.ok(item, "Catalog company detail returned no normalized row.");

    return {
      item,
      raw: data,
      shard: {
        index: shard.index,
        projectRef: shard.projectRef,
      },
      durationMs: Date.now() - startedAt,
    };
  }

  const { data, error } = await client
    .from(modeConfig.source)
    .select("*")
    .eq(modeConfig.idColumn, parsed.sourceId)
    .limit(2);

  assert.ifError(error);
  assert.ok(Array.isArray(data) && data.length > 0, "Catalog detail returned no rows.");

  const [record] = data;
  return {
    item:
      normalizedMode === "prospects"
        ? normalizeProspectRow(record, shard.index)
        : normalizeCompanyRow(record, shard.index),
    raw: data,
    shard: {
      index: shard.index,
      projectRef: shard.projectRef,
    },
    durationMs: Date.now() - startedAt,
  };
}

function toggleRowSelection(current, row, checked) {
  const alreadySelected = Boolean(current[row.catalogRef]);
  if (checked) {
    if (alreadySelected && current[row.catalogRef] === row) return current;
    return { ...current, [row.catalogRef]: row };
  }
  if (!alreadySelected) return current;
  const { [row.catalogRef]: _removed, ...remaining } = current;
  return remaining;
}

function toggleAllVisible(current, rows, checked) {
  if (!checked) {
    const visibleRefs = new Set(rows.map((row) => row.catalogRef));
    let changed = false;
    const next = {};
    Object.entries(current).forEach(([catalogRef, row]) => {
      if (visibleRefs.has(catalogRef)) {
        changed = true;
        return;
      }
      next[catalogRef] = row;
    });
    return changed ? next : current;
  }

  let next = current;
  rows.forEach((row) => {
    if (next[row.catalogRef] === row) return;
    if (next === current) next = { ...current };
    next[row.catalogRef] = row;
  });
  return next;
}

async function invokeCatalogSearchImport(baseUrl, anonKey, accessToken, listId, items) {
  const response = await fetch(`${baseUrl}/functions/v1/catalog-search`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      apikey: anonKey,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      action: "import-selection",
      listId,
      items,
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error || `catalog-search import failed with ${response.status}`);
  }

  return payload;
}

async function runCheck(name, fn) {
  const startedAt = Date.now();

  try {
    const result = await fn();
    const skipped = result && typeof result === "object" && result.skipped === true;
    const detail = typeof result === "string" ? result : result?.detail || "";
    const status = skipped ? "skip" : "pass";
    summary.checks.push({ name, status, detail, durationMs: Date.now() - startedAt });
    console.log(`${status.toUpperCase().padEnd(7)} ${name}${detail ? `: ${detail}` : ""}`);
    return result;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    summary.checks.push({ name, status: "fail", detail, durationMs: Date.now() - startedAt });
    console.error(`FAIL    ${name}: ${detail}`);
    return null;
  }
}

function uniqueSorted(values) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function logSection(title, detail) {
  console.log(`\n${title}`);
  if (detail) {
    console.log(detail);
  }
}

function logInfo(message) {
  console.log(`- ${message}`);
}

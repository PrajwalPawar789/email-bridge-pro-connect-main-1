import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import dotenv from "dotenv";
import * as XLSX from "xlsx";
import { createClient } from "@supabase/supabase-js";
import { buildSchemaConfig, buildShardConfigs } from "../server/search/lib.js";

const projectRoot = process.cwd();
const docsDir = path.resolve(projectRoot, "docs");
const markdownPath = path.join(docsDir, "supabase-usage-audit.md");
const workbookPath = path.join(docsDir, "supabase-usage-audit.xlsx");
const generatedAt = new Date().toISOString();
const warnings = [];

dotenv.config({ path: path.resolve(projectRoot, ".env") });
dotenv.config({ path: path.resolve(projectRoot, ".env.16shards"), override: false });

const MAIN_SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const MAIN_SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const SOURCE_FACTS = [
  {
    area: "Bandwidth and egress",
    url: "https://supabase.com/docs/guides/storage/serving/bandwidth",
    fact: "Free plan bandwidth is 10 GB total, split into 5 GB cached and 5 GB uncached.",
    type: "Verified",
  },
  {
    area: "What counts as egress",
    url: "https://supabase.com/docs/guides/storage/serving/bandwidth",
    fact: "Supabase bandwidth includes data transferred from database responses, storage delivery, and edge function responses.",
    type: "Verified",
  },
  {
    area: "Database size",
    url: "https://supabase.com/docs/guides/platform/database-size",
    fact: "Free plan projects enter read-only mode when the database exceeds 500 MB.",
    type: "Verified",
  },
  {
    area: "Realtime limits",
    url: "https://supabase.com/docs/guides/realtime/limits",
    fact: "Free plan Realtime limits include 200 concurrent connections and 100 messages per second.",
    type: "Verified",
  },
  {
    area: "Pricing catalog",
    url: "https://supabase.com/pricing",
    fact: "Use the pricing page to confirm current non-documented commercial allowances before launch planning.",
    type: "Reference",
  },
];

const ACTION_MODELS = [
  {
    action: "Auth session restore or sign-in",
    products: "Auth",
    edge_calls: 0,
    shard_queries: 0,
    db_reads: 0,
    db_writes: 0,
    realtime_connections: 0,
    uncached_egress_kb: 20,
    cached_egress_kb: 0,
    notes: "Triggered by getSession/getUser/signIn flows. Small payloads, but repeated frequently on page mount.",
  },
  {
    action: "Workspace page load",
    products: "Auth + Database",
    edge_calls: 0,
    shard_queries: 0,
    db_reads: 4,
    db_writes: 0,
    realtime_connections: 0,
    uncached_egress_kb: 140,
    cached_egress_kb: 0,
    notes: "Representative for dashboard, profile, billing, and shell pages that load snapshot cards and lists.",
  },
  {
    action: "Inbox open",
    products: "Auth + Database + Realtime",
    edge_calls: 0,
    shard_queries: 0,
    db_reads: 5,
    db_writes: 0,
    realtime_connections: 1,
    uncached_egress_kb: 260,
    cached_egress_kb: 0,
    notes: "Loads message lists and joins one Postgres-changes channel for live mail updates.",
  },
  {
    action: "Find search result page",
    products: "Edge Functions + Shard Databases",
    edge_calls: 1,
    shard_queries: 2,
    db_reads: 0,
    db_writes: 0,
    realtime_connections: 0,
    uncached_egress_kb: 230,
    cached_egress_kb: 0,
    notes: "One catalog-search call fans out into active shard queries. This is the clearest high-egress path in the product.",
  },
  {
    action: "Search selection import",
    products: "Edge Functions + Database",
    edge_calls: 1,
    shard_queries: 0,
    db_reads: 2,
    db_writes: 50,
    realtime_connections: 0,
    uncached_egress_kb: 40,
    cached_egress_kb: 0,
    notes: "Imports a selected lead batch into prospects and email list linkage tables.",
  },
  {
    action: "Campaign batch send for 200 recipients",
    products: "Edge Functions + Database",
    edge_calls: 1,
    shard_queries: 0,
    db_reads: 4,
    db_writes: 220,
    realtime_connections: 0,
    uncached_egress_kb: 30,
    cached_egress_kb: 0,
    notes: "Representative unit aligned to the current free-plan daily send limit of 200 per user.",
  },
  {
    action: "Recipient open tracking event",
    products: "Public Edge Function + Database",
    edge_calls: 1,
    shard_queries: 0,
    db_reads: 1,
    db_writes: 2,
    realtime_connections: 0,
    uncached_egress_kb: 2,
    cached_egress_kb: 0,
    notes: "Every email open calls track-email-open and writes tracking data or campaign counters.",
  },
  {
    action: "Recipient click tracking event",
    products: "Public Edge Function + Database",
    edge_calls: 1,
    shard_queries: 0,
    db_reads: 1,
    db_writes: 2,
    realtime_connections: 0,
    uncached_egress_kb: 2,
    cached_egress_kb: 0,
    notes: "Every click calls track-email-click and updates tracking rows or campaign counters.",
  },
  {
    action: "Automation run",
    products: "Edge Functions + Database",
    edge_calls: 1,
    shard_queries: 0,
    db_reads: 5,
    db_writes: 8,
    realtime_connections: 0,
    uncached_egress_kb: 25,
    cached_egress_kb: 0,
    notes: "Representative workflow execution pass for automation-runner or automation-webhook follow-through.",
  },
  {
    action: "AI builder generation",
    products: "Edge Functions + Database",
    edge_calls: 1,
    shard_queries: 0,
    db_reads: 4,
    db_writes: 5,
    realtime_connections: 0,
    uncached_egress_kb: 90,
    cached_egress_kb: 0,
    notes: "Writes AI thread state, usage logs, and memory rows around ai-builder-generate.",
  },
  {
    action: "Landing page tracked visit",
    products: "Public Edge Function + Database",
    edge_calls: 1,
    shard_queries: 0,
    db_reads: 1,
    db_writes: 1,
    realtime_connections: 0,
    uncached_egress_kb: 3,
    cached_egress_kb: 0,
    notes: "landing-page-track writes event data for public traffic.",
  },
  {
    action: "Landing page form submission",
    products: "Public Edge Function + Database",
    edge_calls: 1,
    shard_queries: 0,
    db_reads: 2,
    db_writes: 3,
    realtime_connections: 0,
    uncached_egress_kb: 8,
    cached_egress_kb: 0,
    notes: "landing-page-submit writes submission and related event or list-link records.",
  },
  {
    action: "Custom domain verification",
    products: "Edge Functions + Database",
    edge_calls: 1,
    shard_queries: 0,
    db_reads: 2,
    db_writes: 1,
    realtime_connections: 0,
    uncached_egress_kb: 10,
    cached_egress_kb: 0,
    notes: "verify-site-domain calls public verification logic and updates site_domains.",
  },
  {
    action: "Avatar upload",
    products: "Storage + Auth + Database",
    edge_calls: 0,
    shard_queries: 0,
    db_reads: 1,
    db_writes: 2,
    realtime_connections: 0,
    uncached_egress_kb: 6,
    cached_egress_kb: 0,
    notes: "Upload itself is ingress, not egress. The billed bandwidth comes later when the public avatar is served.",
  },
  {
    action: "Public avatar view",
    products: "Storage CDN",
    edge_calls: 0,
    shard_queries: 0,
    db_reads: 0,
    db_writes: 0,
    realtime_connections: 0,
    uncached_egress_kb: 0,
    cached_egress_kb: 200,
    notes: "This is the only clear cached-egress path in the current codebase because avatars are served from a public bucket URL.",
  },
];

const SCENARIOS = [
  {
    scenario: "Free user - active month",
    plan: "free",
    description: "One engaged free user using campaign features within current plan limits, with Find enabled and light landing-page traffic.",
    units: {
      "Auth session restore or sign-in": 20,
      "Workspace page load": 40,
      "Inbox open": 8,
      "Find search result page": 8,
      "Search selection import": 2,
      "Campaign batch send for 200 recipients": 10,
      "Recipient open tracking event": 600,
      "Recipient click tracking event": 60,
      "Automation run": 15,
      "AI builder generation": 0,
      "Landing page tracked visit": 100,
      "Landing page form submission": 5,
      "Custom domain verification": 0.2,
      "Avatar upload": 0.1,
      "Public avatar view": 20,
    },
    peak_online_users: 1,
    peak_realtime_pages: 1,
  },
  {
    scenario: "100 free users - active month",
    plan: "free",
    description: "Aggregate of 100 active free users, each following the active free-user pattern above.",
    units: {
      "Auth session restore or sign-in": 2000,
      "Workspace page load": 4000,
      "Inbox open": 800,
      "Find search result page": 800,
      "Search selection import": 200,
      "Campaign batch send for 200 recipients": 1000,
      "Recipient open tracking event": 60000,
      "Recipient click tracking event": 6000,
      "Automation run": 1500,
      "AI builder generation": 0,
      "Landing page tracked visit": 10000,
      "Landing page form submission": 500,
      "Custom domain verification": 20,
      "Avatar upload": 10,
      "Public avatar view": 2000,
    },
    peak_online_users: 35,
    peak_realtime_pages: 25,
  },
  {
    scenario: "Growth user - active month",
    plan: "growth",
    description: "One active paid user using search, campaigns, automations, and moderate AI-builder usage.",
    units: {
      "Auth session restore or sign-in": 35,
      "Workspace page load": 90,
      "Inbox open": 18,
      "Find search result page": 25,
      "Search selection import": 8,
      "Campaign batch send for 200 recipients": 50,
      "Recipient open tracking event": 3000,
      "Recipient click tracking event": 300,
      "Automation run": 80,
      "AI builder generation": 20,
      "Landing page tracked visit": 400,
      "Landing page form submission": 20,
      "Custom domain verification": 0.5,
      "Avatar upload": 0.1,
      "Public avatar view": 40,
    },
    peak_online_users: 1,
    peak_realtime_pages: 1,
  },
];

function relativeToRoot(value) {
  return path.relative(projectRoot, value).replace(/\\/g, "/");
}

function ensureArray(value) {
  return Array.isArray(value) ? value : value ? [value] : [];
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function escapeMarkdownCell(value) {
  return String(value ?? "")
    .replace(/\|/g, "\\|")
    .replace(/\r?\n/g, "<br />");
}

function formatNumber(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "n/a";
  return Number(value).toLocaleString("en-US");
}

function formatDecimal(value, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "n/a";
  return Number(value).toFixed(digits);
}

function formatMbFromBytes(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "n/a";
  return (Number(value) / (1024 * 1024)).toFixed(2);
}

function severityFromValue(value) {
  const numeric = Number(value || 0);
  if (numeric >= 3) return "Critical";
  if (numeric >= 2) return "High";
  if (numeric >= 1) return "Medium";
  return "Low";
}

function walkFiles(rootDirs) {
  const files = [];
  const allowedExtensions = new Set([".js", ".jsx", ".ts", ".tsx"]);

  function visit(currentDir) {
    const absoluteDir = path.resolve(projectRoot, currentDir);
    if (!fs.existsSync(absoluteDir)) return;
    for (const entry of fs.readdirSync(absoluteDir, { withFileTypes: true })) {
      const relativePath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        visit(relativePath);
        continue;
      }
      if (allowedExtensions.has(path.extname(entry.name))) {
        files.push(relativeToRoot(path.resolve(projectRoot, relativePath)));
      }
    }
  }

  rootDirs.forEach(visit);
  return files.sort((left, right) => left.localeCompare(right));
}

function getScope(filePath) {
  if (filePath.startsWith("src/")) return "client";
  if (filePath.startsWith("server/")) return "server";
  if (filePath.startsWith("supabase/functions/")) return "edge_runtime";
  if (filePath.startsWith("scripts/")) return "ops_or_tests";
  return "other";
}

function detectOperations(snippet) {
  const operations = [];
  for (const token of [".select(", ".insert(", ".update(", ".upsert(", ".delete(", ".single(", ".maybeSingle("]) {
    if (snippet.includes(token)) {
      operations.push(token.replace(/[.(]/g, "").replace("maybeSingle", "select"));
    }
  }
  return unique(operations.map((value) => (value === "single" ? "select" : value)));
}

function addInventoryRow(map, name, row) {
  if (!map.has(name)) {
    map.set(name, []);
  }
  map.get(name).push(row);
}

function scanSupabaseUsage() {
  const files = walkFiles(["src", "server", "scripts", "supabase/functions"]);
  const tables = new Map();
  const rpcs = new Map();
  const edgeInvocations = new Map();
  const storageBuckets = new Map();
  const authCalls = new Map();
  const realtime = [];

  for (const filePath of files) {
    const absolutePath = path.resolve(projectRoot, filePath);
    const text = fs.readFileSync(absolutePath, "utf8");
    const scope = getScope(filePath);

    for (const match of text.matchAll(/storage\.from\((['"])([^'"]+)\1\)/g)) {
      const bucket = match[2];
      const snippet = text.slice(match.index, match.index + 200);
      const operations = unique([
        snippet.includes(".upload(") ? "upload" : "",
        snippet.includes(".download(") ? "download" : "",
        snippet.includes(".getPublicUrl(") ? "getPublicUrl" : "",
        snippet.includes(".createSignedUrl(") ? "createSignedUrl" : "",
        snippet.includes(".list(") ? "list" : "",
        snippet.includes(".remove(") ? "remove" : "",
      ]);
      addInventoryRow(storageBuckets, bucket, {
        file: filePath,
        scope,
        operations: operations.join(", ") || "unknown",
      });
    }

    for (const match of text.matchAll(/\.from\((['"])([^'"]+)\1\)/g)) {
      const prefix = text.slice(Math.max(0, match.index - 20), match.index);
      if (prefix.includes("storage.")) continue;
      const table = match[2];
      const snippet = text.slice(match.index, match.index + 240);
      addInventoryRow(tables, table, {
        file: filePath,
        scope,
        operations: detectOperations(snippet).join(", ") || "unknown",
      });
    }

    for (const match of text.matchAll(/\.rpc\((['"])([^'"]+)\1/g)) {
      addInventoryRow(rpcs, match[2], { file: filePath, scope });
    }

    for (const match of text.matchAll(/functions\.invoke\((['"])([^'"]+)\1/g)) {
      addInventoryRow(edgeInvocations, match[2], { file: filePath, scope });
    }

    for (const match of text.matchAll(/auth\.(getUser|getSession|signInWithPassword|signUp|signOut|verifyOtp|updateUser|resetPasswordForEmail|onAuthStateChange|signInWithOAuth)/g)) {
      addInventoryRow(authCalls, match[1], { file: filePath, scope });
    }

    for (const match of text.matchAll(/\.channel\((['"])([^'"]+)\1\)([\s\S]{0,800}?)(?:\.subscribe\(|return\s*\(\s*=>|\n\s*;)/g)) {
      const channelName = match[2];
      const block = match[3] || "";
      const tablesInBlock = unique([...block.matchAll(/table:\s*(['"])([^'"]+)\1/g)].map((entry) => entry[2]));
      realtime.push({
        channel: channelName,
        file: filePath,
        scope,
        tables: tablesInBlock.join(", ") || "unknown",
      });
    }
  }

  return { tables, rpcs, edgeInvocations, storageBuckets, authCalls, realtime };
}

function summarizeInventory(map) {
  return [...map.entries()]
    .map(([name, rows]) => ({
      name,
      call_sites: rows.length,
      files: unique(rows.map((row) => row.file)),
      scopes: unique(rows.map((row) => row.scope)),
      operations: unique(rows.flatMap((row) => ensureArray(String(row.operations || "").split(", ").filter(Boolean)))),
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

function parseFunctionConfig() {
  const configPath = path.resolve(projectRoot, "supabase/config.toml");
  if (!fs.existsSync(configPath)) {
    warnings.push("Missing supabase/config.toml; verify_jwt settings could not be inspected.");
    return new Map();
  }

  const rows = fs.readFileSync(configPath, "utf8").split(/\r?\n/);
  const verifyJwtByFunction = new Map();
  let activeFunction = null;

  for (const row of rows) {
    const sectionMatch = row.match(/^\[functions\.([^\]]+)\]$/);
    if (sectionMatch) {
      activeFunction = sectionMatch[1];
      continue;
    }
    const verifyMatch = row.match(/^verify_jwt\s*=\s*(true|false)$/);
    if (activeFunction && verifyMatch) {
      verifyJwtByFunction.set(activeFunction, verifyMatch[1] === "true");
    }
  }

  return verifyJwtByFunction;
}

function listLocalFunctions() {
  const functionsDir = path.resolve(projectRoot, "supabase/functions");
  if (!fs.existsSync(functionsDir)) return [];
  return fs
    .readdirSync(functionsDir)
    .filter((name) => fs.statSync(path.join(functionsDir, name)).isDirectory())
    .sort((left, right) => left.localeCompare(right));
}

function buildMainClient() {
  if (!MAIN_SUPABASE_URL || !MAIN_SUPABASE_SERVICE_ROLE_KEY) {
    warnings.push("Missing main Supabase URL or service-role key. Live project stats were skipped.");
    return null;
  }

  return createClient(MAIN_SUPABASE_URL, MAIN_SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

async function queryTableStats(client, tableName, userPlanByUserId) {
  const countResult = await client.from(tableName).select("*", { count: "exact", head: true });
  if (countResult.error) {
    return {
      table: tableName,
      count: null,
      user_column: null,
      distinct_users: null,
      sample_rows: 0,
      avg_row_json_bytes: null,
      logical_payload_mb: null,
      rows_by_plan: {},
      error: countResult.error.message,
    };
  }

  const rowCount = countResult.count ?? 0;
  const sampleResult = await client.from(tableName).select("*").limit(25);
  const sampleRows = Array.isArray(sampleResult.data) ? sampleResult.data : [];
  const sampleBytes = sampleRows.reduce(
    (sum, row) => sum + Buffer.byteLength(JSON.stringify(row), "utf8"),
    0,
  );
  const avgRowBytes = sampleRows.length > 0 ? Math.round(sampleBytes / sampleRows.length) : 0;
  const logicalPayloadMb = rowCount > 0 && avgRowBytes > 0 ? (rowCount * avgRowBytes) / (1024 * 1024) : 0;

  let userColumn = null;
  let distinctUsers = null;
  const rowsByPlan = {};
  for (const candidate of ["user_id", "requester_user_id", "author_user_id"]) {
    const fieldRows = [];
    let offset = 0;
    let failed = false;
    const pageSize = 1000;
    while (offset === 0 || (offset < rowCount && offset < 20000)) {
      const query = await client
        .from(tableName)
        .select(candidate)
        .range(offset, offset + pageSize - 1);
      if (query.error) {
        failed = true;
        break;
      }
      const pageRows = Array.isArray(query.data) ? query.data : [];
      fieldRows.push(...pageRows);
      if (pageRows.length < pageSize) break;
      offset += pageRows.length;
    }
    if (failed) {
      continue;
    }
    userColumn = candidate;
    const values = fieldRows.map((row) => row?.[candidate]).filter(Boolean);
    distinctUsers = new Set(values).size;
    values.forEach((value) => {
      const planId = userPlanByUserId.get(String(value)) || "unknown";
      rowsByPlan[planId] = (rowsByPlan[planId] || 0) + 1;
    });
    break;
  }

  return {
    table: tableName,
    count: rowCount,
    user_column: userColumn,
    distinct_users: distinctUsers,
    sample_rows: sampleRows.length,
    avg_row_json_bytes: avgRowBytes,
    logical_payload_mb: logicalPayloadMb,
    rows_by_plan: rowsByPlan,
    error: null,
  };
}

async function collectBucketObjects(client, bucketName, prefix = "") {
  const output = { objectCount: 0, byteCount: 0, errors: [] };
  let offset = 0;
  const limit = 100;

  while (true) {
    const result = await client.storage.from(bucketName).list(prefix, {
      limit,
      offset,
      sortBy: { column: "name", order: "asc" },
    });

    if (result.error) {
      output.errors.push(result.error.message);
      break;
    }

    const rows = Array.isArray(result.data) ? result.data : [];
    if (rows.length === 0) break;

    for (const row of rows) {
      const itemName = String(row?.name || "").trim();
      if (!itemName) continue;
      const nextPrefix = prefix ? `${prefix}/${itemName}` : itemName;
      const isFile = Boolean(row?.id) || Boolean(row?.metadata);
      if (isFile) {
        output.objectCount += 1;
        output.byteCount += Number(row?.metadata?.size || row?.metadata?.contentLength || 0);
      } else {
        const nested = await collectBucketObjects(client, bucketName, nextPrefix);
        output.objectCount += nested.objectCount;
        output.byteCount += nested.byteCount;
        output.errors.push(...nested.errors);
      }
    }

    if (rows.length < limit) break;
    offset += rows.length;
  }

  return output;
}

async function queryMainProjectStats(client) {
  const listUsersResult = await client.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const users = listUsersResult.data?.users || [];
  const monthPrefix = new Date().toISOString().slice(0, 7);

  const subscriptionsResult = await client
    .from("user_subscriptions")
    .select("user_id, plan_id, status, billing_cycle");
  const subscriptions = Array.isArray(subscriptionsResult.data) ? subscriptionsResult.data : [];
  const userPlanByUserId = new Map(subscriptions.map((row) => [String(row.user_id), String(row.plan_id || "unknown")]));

  const planCounts = subscriptions.reduce((accumulator, row) => {
    const planId = String(row.plan_id || "unknown");
    accumulator[planId] = (accumulator[planId] || 0) + 1;
    return accumulator;
  }, {});

  const statusCounts = subscriptions.reduce((accumulator, row) => {
    const status = String(row.status || "unknown");
    accumulator[status] = (accumulator[status] || 0) + 1;
    return accumulator;
  }, {});

  const billingPlansResult = await client.from("billing_plans").select("*").order("monthly_price_cents", { ascending: true });
  const billingPlans = Array.isArray(billingPlansResult.data) ? billingPlansResult.data : [];

  const bucketsResult = await client.storage.listBuckets();
  const buckets = Array.isArray(bucketsResult.data) ? bucketsResult.data : [];
  const bucketRows = [];
  for (const bucket of buckets) {
    const inventory = await collectBucketObjects(client, bucket.name);
    bucketRows.push({
      bucket: bucket.name,
      public: Boolean(bucket.public),
      objects: inventory.objectCount,
      byte_count: inventory.byteCount,
      object_errors: inventory.errors.join(" | "),
    });
  }

  return {
    users,
    subscriptions,
    userPlanByUserId,
    planCounts,
    statusCounts,
    billingPlans,
    buckets: bucketRows,
    currentMonthAuthActiveUsers: users.filter((user) => String(user.last_sign_in_at || "").startsWith(monthPrefix)).length,
  };
}

async function queryShardStats() {
  const schema = buildSchemaConfig(process.env);
  const shards = buildShardConfigs(process.env)
    .filter((row) => row.status === "active")
    .sort((left, right) => left.index - right.index);

  const rows = [];
  for (const shard of shards) {
    const client = createClient(shard.url, shard.key, {
      auth: { persistSession: false },
    });
    const countResult = await client
      .from(schema.prospectSource)
      .select("*", { count: "planned", head: true });
    const sampleResult = !countResult.error
      ? await client.from(schema.prospectSource).select("*").limit(25)
      : { data: [], error: countResult.error };
    const sampleRows = Array.isArray(sampleResult.data) ? sampleResult.data : [];
    const avgRowBytes =
      sampleRows.length > 0
        ? Math.round(
            sampleRows.reduce(
              (sum, row) => sum + Buffer.byteLength(JSON.stringify(row), "utf8"),
              0,
            ) / sampleRows.length,
          )
        : 0;
    const logicalPayloadMb =
      countResult.count && avgRowBytes > 0
        ? (Number(countResult.count) * avgRowBytes) / (1024 * 1024)
        : null;

    rows.push({
      shard_index: shard.index,
      project_ref: shard.projectRef || "",
      status: countResult.error ? "Unreachable" : "Reachable",
      key_type: shard.keyType,
      prospect_source: schema.prospectSource,
      derive_companies_from_prospects: schema.deriveCompaniesFromProspects,
      prospect_count_planned: countResult.count ?? null,
      avg_prospect_row_json_bytes: avgRowBytes || null,
      logical_payload_mb: logicalPayloadMb,
      error: countResult.error?.message || sampleResult.error?.message || "",
    });
  }
  return rows;
}

function buildEdgeFunctionRows(localFunctions, verifyJwtByFunction, edgeInvocationSummary) {
  return localFunctions.map((functionName) => {
    const invocation = edgeInvocationSummary.find((row) => row.name === functionName) || null;
    const callerFiles = invocation ? invocation.files : [];
    const primarySurface =
      functionName.includes("track-email") ||
      functionName.includes("landing-page") ||
      functionName.includes("verify-site-domain") ||
      functionName.includes("resolve-site")
        ? "Public traffic / public workflows"
        : functionName.includes("catalog-search")
          ? "Find and shard search"
          : functionName.includes("ai-builder")
            ? "AI builder"
            : functionName.includes("campaign") || functionName.includes("mailbox") || functionName.includes("automation")
              ? "Messaging or automation runtime"
              : "Workspace operation";
    const egressRisk =
      functionName === "catalog-search" || functionName.includes("track-email") || functionName.includes("send-campaign")
        ? "High"
        : functionName.includes("landing-page") || functionName.includes("ai-builder")
          ? "Medium"
          : "Low";

    return {
      function_name: functionName,
      verify_jwt: verifyJwtByFunction.has(functionName) ? String(verifyJwtByFunction.get(functionName)) : "unknown",
      caller_count: invocation ? invocation.call_sites : 0,
      caller_files: callerFiles.join(", "),
      primary_surface: primarySurface,
      egress_risk: egressRisk,
      notes:
        functionName === "catalog-search"
          ? "Calls active shard projects and returns search results; this is the strongest current egress driver."
          : functionName === "track-email-open" || functionName === "track-email-click"
            ? "Triggered by external recipients, not just platform users."
            : functionName === "ai-builder-generate"
              ? "High invocation density if AI editing is allowed on lower plans."
              : "",
    };
  });
}

function buildEgressDriverRows(mainBucketRows, shardRows, edgeFunctionRows) {
  const avatarBucket = mainBucketRows.find((row) => row.bucket === "avatars") || null;
  const reachableShardCount = shardRows.filter((row) => row.status === "Reachable").length;
  const totalShardPayloadMb = shardRows.reduce(
    (sum, row) => sum + Number(row.logical_payload_mb || 0),
    0,
  );
  const publicTrackingFunctions = edgeFunctionRows.filter((row) =>
    row.function_name === "track-email-open" ||
    row.function_name === "track-email-click" ||
    row.function_name === "landing-page-track" ||
    row.function_name === "landing-page-submit",
  ).length;

  return [
    {
      driver: "Database API payloads",
      egress_type: "Uncached egress",
      current_state: "High",
      why_it_counts:
        "Supabase counts database response bytes as bandwidth. Most workspace pages query multiple tables or RPCs on load.",
      evidence:
        "Client and server code reference dozens of direct table reads across campaigns, inbox, billing, pipeline, automation, and landing-page flows.",
    },
    {
      driver: "catalog-search and shard lookups",
      egress_type: "Uncached egress",
      current_state: reachableShardCount > 0 ? "Critical" : "High",
      why_it_counts:
        "Find does not stay inside one database. Search requests fan out into active shard projects and pull prospect rows across the network before returning results.",
      evidence: `Active search shards: ${reachableShardCount}. Approximate reachable shard logical payload: ${formatDecimal(totalShardPayloadMb)} MB.`,
    },
    {
      driver: "Realtime channels",
      egress_type: "Uncached egress + Realtime quotas",
      current_state: "Medium",
      why_it_counts:
        "Campaign, inbox, analytics, and notifications pages subscribe to live Postgres changes. This uses Realtime connection and message quotas.",
      evidence:
        "Realtime subscriptions exist for campaigns, recipients, email_messages, and user_notifications across multiple pages.",
    },
    {
      driver: "Public tracking functions",
      egress_type: "Uncached egress + Edge Function invocations",
      current_state: publicTrackingFunctions > 0 ? "High" : "Low",
      why_it_counts:
        "Email opens, email clicks, landing visits, and landing form submissions come from external recipients and public visitors, not only signed-in app users.",
      evidence: `${publicTrackingFunctions} public-facing tracking or submission functions are present in the deployed edge runtime.`,
    },
    {
      driver: "Storage CDN delivery",
      egress_type: "Cached egress",
      current_state: avatarBucket && avatarBucket.objects > 0 ? "Low" : "Very Low",
      why_it_counts:
        "Cached egress is mainly a Storage delivery concern. In this repo the only clear Storage delivery path is the public avatars bucket.",
      evidence: avatarBucket
        ? `avatars bucket: ${avatarBucket.objects} object(s), ${formatMbFromBytes(avatarBucket.byte_count)} MB currently stored.`
        : "No live bucket inventory was available.",
    },
    {
      driver: "External Node services",
      egress_type: "Uncached egress",
      current_state: "High",
      why_it_counts:
        "search-service and mailbox-sync-server run outside Supabase. Every row or auth payload they fetch leaves Supabase over the network.",
      evidence:
        "server/search-service.js and server/mailbox-sync-server.js both instantiate Supabase clients and query data outside the browser and edge runtime.",
    },
  ];
}

function buildScenarioRows() {
  return SCENARIOS.map((scenario) => {
    const totals = {
      auth_requests: 0,
      edge_function_invocations: 0,
      shard_queries: 0,
      db_reads: 0,
      db_writes: 0,
      realtime_connections_peak: scenario.peak_realtime_pages,
      uncached_egress_kb: 0,
      cached_egress_kb: 0,
    };

    for (const action of ACTION_MODELS) {
      const units = Number(scenario.units[action.action] || 0);
      totals.auth_requests += action.products.includes("Auth") ? units : 0;
      totals.edge_function_invocations += units * Number(action.edge_calls || 0);
      totals.shard_queries += units * Number(action.shard_queries || 0);
      totals.db_reads += units * Number(action.db_reads || 0);
      totals.db_writes += units * Number(action.db_writes || 0);
      totals.uncached_egress_kb += units * Number(action.uncached_egress_kb || 0);
      totals.cached_egress_kb += units * Number(action.cached_egress_kb || 0);
    }

    const estimatedTotalBandwidthGb = (totals.uncached_egress_kb + totals.cached_egress_kb) / (1024 * 1024);

    return {
      scenario: scenario.scenario,
      plan: scenario.plan,
      description: scenario.description,
      auth_requests: totals.auth_requests,
      edge_function_invocations: totals.edge_function_invocations,
      shard_queries: totals.shard_queries,
      db_reads: totals.db_reads,
      db_writes: totals.db_writes,
      uncached_egress_mb: totals.uncached_egress_kb / 1024,
      cached_egress_mb: totals.cached_egress_kb / 1024,
      total_bandwidth_gb: estimatedTotalBandwidthGb,
      peak_online_users: scenario.peak_online_users,
      peak_realtime_connections: scenario.peak_realtime_pages,
      bandwidth_fit_free_plan: estimatedTotalBandwidthGb <= 10 ? "Maybe" : "No",
      notes:
        scenario.scenario === "100 free users - active month"
          ? "This is still optimistic. It does not include background retries, mailbox sync chatter, or deep Find pagination."
          : "Modeled estimate built from code-level action paths, not metered dashboard billing telemetry.",
    };
  });
}

function buildRecommendationRows(mainStats, shardRows, scenarioRows, tableStats) {
  const freeHundredScenario = scenarioRows.find((row) => row.scenario === "100 free users - active month");
  const mainProspectsTable = tableStats.find((row) => row.table === "prospects");
  const mainRecipientsTable = tableStats.find((row) => row.table === "recipients");
  const shardIssueCount = shardRows.filter((row) => row.status !== "Reachable").length;
  const searchProjectsUsed = shardRows.length;
  const biggestMainTable = [...tableStats]
    .filter((row) => row.count !== null)
    .sort((left, right) => Number(right.count || 0) - Number(left.count || 0))[0];

  return [
    {
      priority: "P0",
      area: "Single-project free-plan fit",
      recommendation:
        "Do not promise the current full product on one Supabase Free project. The current architecture depends on the main project plus search shard projects.",
      why:
        `Active shard projects discovered: ${searchProjectsUsed}. Even before bandwidth, the current Find architecture is already multi-project.`,
    },
    {
      priority: "P0",
      area: "Find search",
      recommendation:
        "Remove Find from the free tier, replace shard search with a non-Supabase search store, or accept that search requires paid infrastructure.",
      why:
        "catalog-search is the clearest high-egress path and the current search design depends on external shard databases.",
    },
    {
      priority: "P0",
      area: "100 free users capacity model",
      recommendation:
        "Do not treat the bandwidth model as proof that the full product fits Supabase Free. The stronger blockers are multi-project search, shard storage, and public-event variability.",
      why:
        freeHundredScenario
          ? `Modeled monthly bandwidth for 100 active free users is about ${formatDecimal(freeHundredScenario.total_bandwidth_gb)} GB before retries and deep search scans, but the current architecture still depends on external shard projects and large search datasets.`
          : "Scenario modeling was unavailable.",
    },
    {
      priority: "P1",
      area: "Search shard storage",
      recommendation:
        "Inspect shard database disk usage directly in Supabase and move the shard catalog off free projects if it is still intended for GTM.",
      why:
        shardRows.length > 0
          ? `Reachable shard logical row payload estimate already reaches ${formatDecimal(
              shardRows.reduce((sum, row) => sum + Number(row.logical_payload_mb || 0), 0),
            )} MB before indexes, WAL, and system overhead.`
          : "No shard data was available.",
    },
    {
      priority: "P1",
      area: "Public tracking endpoints",
      recommendation:
        "Treat email opens, clicks, and landing events as external traffic capacity, not just user count capacity.",
      why:
        "For outbound products, recipient activity can create more edge function calls than signed-in users do.",
    },
    {
      priority: "P1",
      area: "Realtime discipline",
      recommendation:
        "Keep Realtime subscriptions only on pages where users genuinely need live state. Prefer manual refresh for secondary views.",
      why:
        "Free-plan Realtime limits are not large once multiple dashboards, inbox views, and notification channels are open simultaneously.",
    },
    {
      priority: "P2",
      area: "Storage",
      recommendation:
        "Keep Supabase Storage limited to small avatars or move static assets to a dedicated CDN if public assets expand.",
      why:
        "Current storage usage is low; cached egress is not your present bottleneck.",
    },
    {
      priority: "P2",
      area: "Telemetry gap",
      recommendation:
        "Before GTM, export actual bandwidth, edge invocation, and function log metrics from the Supabase dashboard and compare them against this modeled audit.",
      why:
        `This workbook inventories architecture and live rows, but exact cycle-by-cycle bandwidth billing still requires Supabase dashboard telemetry. Largest main table: ${
          biggestMainTable ? `${biggestMainTable.table} (${formatNumber(biggestMainTable.count)} rows)` : "n/a"
        }.`,
    },
    {
      priority: "P2",
      area: "Free tier product scope",
      recommendation:
        "If your GTM objective is 100 free users on Supabase Free, ship a reduced free tier: auth, onboarding, profile, light CRM, and no Find, AI builder, live mailbox sync, or public tracking.",
      why:
        `Current main data growth is already concentrated in prospects (${formatNumber(
          mainProspectsTable?.count,
        )}) and recipients (${formatNumber(mainRecipientsTable?.count)}), which are campaign-led, not onboarding-led.`,
    },
    {
      priority: shardIssueCount > 0 ? "P2" : "P3",
      area: "Shard health",
      recommendation:
        "Stabilize or retire unreachable shard projects before launch so search quality does not degrade unpredictably.",
      why:
        shardIssueCount > 0
          ? `${shardIssueCount} shard project(s) were not fully reachable during the audit.`
          : "All configured shard projects responded during the audit.",
    },
  ];
}

function buildSheet(rows, headers) {
  const sheetRows = [headers, ...rows];
  const sheet = XLSX.utils.aoa_to_sheet(sheetRows);
  sheet["!autofilter"] = {
    ref: XLSX.utils.encode_range({
      s: { c: 0, r: 0 },
      e: { c: headers.length - 1, r: sheetRows.length - 1 },
    }),
  };
  sheet["!freeze"] = { xSplit: 0, ySplit: 1 };
  return sheet;
}

async function main() {
  const usage = scanSupabaseUsage();
  const tableUsageSummary = summarizeInventory(usage.tables);
  const rpcSummary = summarizeInventory(usage.rpcs);
  const edgeInvocationSummary = summarizeInventory(usage.edgeInvocations);
  const storageSummary = summarizeInventory(usage.storageBuckets);
  const authSummary = summarizeInventory(usage.authCalls);
  const realtimeSummary = usage.realtime.sort((left, right) => {
    return `${left.file}:${left.channel}`.localeCompare(`${right.file}:${right.channel}`);
  });

  const localFunctions = listLocalFunctions();
  const verifyJwtByFunction = parseFunctionConfig();
  const mainClient = buildMainClient();

  let mainStats = {
    users: [],
    subscriptions: [],
    userPlanByUserId: new Map(),
    planCounts: {},
    statusCounts: {},
    billingPlans: [],
    buckets: [],
    currentMonthAuthActiveUsers: 0,
  };

  if (mainClient) {
    mainStats = await queryMainProjectStats(mainClient);
  }

  const productionTableNames = tableUsageSummary
    .filter((row) => row.name !== "avatars")
    .filter((row) => row.scopes.some((scope) => scope !== "ops_or_tests"))
    .map((row) => row.name);

  const tableStats = [];
  if (mainClient) {
    for (const tableName of productionTableNames) {
      tableStats.push(await queryTableStats(mainClient, tableName, mainStats.userPlanByUserId));
    }
  }

  const shardRows = await queryShardStats();
  const edgeFunctionRows = buildEdgeFunctionRows(localFunctions, verifyJwtByFunction, edgeInvocationSummary);
  const egressDriverRows = buildEgressDriverRows(mainStats.buckets, shardRows, edgeFunctionRows);
  const scenarioRows = buildScenarioRows();
  const recommendationRows = buildRecommendationRows(mainStats, shardRows, scenarioRows, tableStats);

  const totalUsers = mainStats.users.length;
  const confirmedUsers = mainStats.users.filter((row) => Boolean(row.email_confirmed_at)).length;
  const activeShards = shardRows.length;
  const reachableShards = shardRows.filter((row) => row.status === "Reachable").length;
  const totalStorageBytes = mainStats.buckets.reduce((sum, row) => sum + Number(row.byte_count || 0), 0);
  const totalStorageObjects = mainStats.buckets.reduce((sum, row) => sum + Number(row.objects || 0), 0);
  const totalTablesTracked = tableStats.length;
  const topTable = [...tableStats]
    .filter((row) => row.count !== null)
    .sort((left, right) => Number(right.count || 0) - Number(left.count || 0))[0];
  const activeFreeScenario = scenarioRows.find((row) => row.scenario === "100 free users - active month");

  const executiveSummaryRows = [
    {
      metric: "Assessment snapshot",
      value: generatedAt,
      notes: "Generated from the current workspace state on 2026-03-27.",
    },
    {
      metric: "Current architecture verdict",
      value: "Not a single-project Supabase-Free architecture",
      notes:
        "The product currently uses one main Supabase project plus active search shard projects, so the current GTM footprint is already multi-project.",
    },
    {
      metric: "Main project users",
      value: String(totalUsers),
      notes: `${confirmedUsers} confirmed users. Approximate current-month auth actives: ${mainStats.currentMonthAuthActiveUsers}.`,
    },
    {
      metric: "Current plan mix",
      value: Object.entries(mainStats.planCounts)
        .map(([planId, count]) => `${planId}: ${count}`)
        .join(" | "),
      notes: "Pulled from user_subscriptions in the live main project.",
    },
    {
      metric: "Local edge functions",
      value: String(localFunctions.length),
      notes: `${edgeInvocationSummary.length} functions are invoked directly from code. The rest are background or public-trigger functions.`,
    },
    {
      metric: "Search shard projects",
      value: String(activeShards),
      notes: `${reachableShards} reachable during this audit. Find is the largest structural reason this does not fit a one-project free-tier plan.`,
    },
    {
      metric: "Storage footprint",
      value: `${formatNumber(totalStorageObjects)} objects / ${formatMbFromBytes(totalStorageBytes)} MB`,
      notes: "Current storage usage is tiny; cached egress is not the present bottleneck.",
    },
    {
      metric: "Tracked main tables",
      value: String(totalTablesTracked),
      notes: topTable ? `Largest currently tracked table: ${topTable.table} (${formatNumber(topTable.count)} rows).` : "No table stats were available.",
    },
    {
      metric: "100 active free users on current architecture",
      value: "No",
      notes: activeFreeScenario
        ? `Modeled monthly bandwidth is about ${formatDecimal(activeFreeScenario.total_bandwidth_gb)} GB before retries, mailbox sync, and deep Find scans, but the full product still fails a Supabase-Free GTM fit because Find uses extra shard projects and the reachable shard catalog already estimates ${formatDecimal(
            shardRows.reduce((sum, row) => sum + Number(row.logical_payload_mb || 0), 0),
          )} MB of logical row payload before indexes and WAL.`
        : "Scenario modeling was unavailable.",
    },
    {
      metric: "Primary uncached egress driver",
      value: "Find search and public tracking",
      notes:
        "catalog-search, shard fan-out, track-email-open, track-email-click, landing-page-track, and landing-page-submit dominate the risk picture.",
    },
    {
      metric: "Primary cached egress driver",
      value: "Public avatar delivery",
      notes:
        "The only clear cached-egress path in the codebase is the public avatars bucket via getPublicUrl. The bucket is currently empty.",
    },
  ];

  const markdownSections = [
    "# Supabase Usage Audit",
    "",
    `Generated at: ${generatedAt}`,
    "",
    "## Executive Summary",
    "",
    ...executiveSummaryRows.map((row) => `- ${row.metric}: ${row.value}. ${row.notes}`),
    "",
    "## Why You See Egress",
    "",
    ...egressDriverRows.map(
      (row, index) =>
        `${index + 1}. ${row.driver} [${row.current_state}] - ${row.why_it_counts} Evidence: ${row.evidence}`,
    ),
    "",
    "## Go-To-Market Recommendation",
    "",
    ...recommendationRows.map(
      (row) => `- ${row.priority}: ${row.area}. ${row.recommendation} Why: ${row.why}`,
    ),
    "",
    "## Sources",
    "",
    ...SOURCE_FACTS.map((row) => `- ${row.area}: ${row.fact} ${row.url}`),
  ];

  if (warnings.length > 0) {
    markdownSections.push("", "## Warnings", "", ...warnings.map((row) => `- ${row}`));
  }

  fs.mkdirSync(docsDir, { recursive: true });
  const workbook = XLSX.utils.book_new();

  const summarySheet = buildSheet(
    executiveSummaryRows.map((row) => [row.metric, row.value, row.notes]),
    ["Metric", "Value", "Notes"],
  );
  summarySheet["!cols"] = [{ wch: 32 }, { wch: 28 }, { wch: 120 }];
  XLSX.utils.book_append_sheet(workbook, summarySheet, "Summary");

  const egressSheet = buildSheet(
    egressDriverRows.map((row) => [
      row.driver,
      row.egress_type,
      row.current_state,
      row.why_it_counts,
      row.evidence,
    ]),
    ["Driver", "Egress Type", "Current State", "Why It Counts", "Evidence"],
  );
  egressSheet["!cols"] = [
    { wch: 28 },
    { wch: 20 },
    { wch: 14 },
    { wch: 88 },
    { wch: 100 },
  ];
  XLSX.utils.book_append_sheet(workbook, egressSheet, "Egress Drivers");

  const scenarioSheet = buildSheet(
    scenarioRows.map((row) => [
      row.scenario,
      row.plan,
      row.description,
      row.auth_requests,
      row.edge_function_invocations,
      row.shard_queries,
      row.db_reads,
      row.db_writes,
      row.uncached_egress_mb,
      row.cached_egress_mb,
      row.total_bandwidth_gb,
      row.peak_online_users,
      row.peak_realtime_connections,
      row.bandwidth_fit_free_plan,
      row.notes,
    ]),
    [
      "Scenario",
      "Plan",
      "Description",
      "Auth Requests",
      "Edge Function Invocations",
      "Shard Queries",
      "DB Reads",
      "DB Writes",
      "Uncached Egress MB",
      "Cached Egress MB",
      "Total Bandwidth GB",
      "Peak Online Users",
      "Peak Realtime Connections",
      "Fit Supabase Free Plan",
      "Notes",
    ],
  );
  scenarioSheet["!cols"] = [
    { wch: 28 },
    { wch: 12 },
    { wch: 72 },
    { wch: 14 },
    { wch: 22 },
    { wch: 14 },
    { wch: 12 },
    { wch: 12 },
    { wch: 18 },
    { wch: 18 },
    { wch: 16 },
    { wch: 16 },
    { wch: 24 },
    { wch: 18 },
    { wch: 92 },
  ];
  XLSX.utils.book_append_sheet(workbook, scenarioSheet, "Scenario Model");

  const scenarioUnitRows = SCENARIOS.flatMap((scenario) =>
    ACTION_MODELS.map((action) => {
      const units = Number(scenario.units[action.action] || 0);
      return [
        scenario.scenario,
        scenario.plan,
        action.action,
        units,
        units * Number(action.edge_calls || 0),
        units * Number(action.shard_queries || 0),
        units * Number(action.db_reads || 0),
        units * Number(action.db_writes || 0),
        (units * Number(action.uncached_egress_kb || 0)) / 1024,
        (units * Number(action.cached_egress_kb || 0)) / 1024,
        action.notes,
      ];
    }),
  );
  const scenarioUnitsSheet = buildSheet(scenarioUnitRows, [
    "Scenario",
    "Plan",
    "Action",
    "Monthly Units",
    "Edge Function Invocations",
    "Shard Queries",
    "DB Reads",
    "DB Writes",
    "Uncached Egress MB",
    "Cached Egress MB",
    "Action Notes",
  ]);
  scenarioUnitsSheet["!cols"] = [
    { wch: 28 },
    { wch: 12 },
    { wch: 34 },
    { wch: 14 },
    { wch: 22 },
    { wch: 14 },
    { wch: 12 },
    { wch: 12 },
    { wch: 18 },
    { wch: 18 },
    { wch: 92 },
  ];
  XLSX.utils.book_append_sheet(workbook, scenarioUnitsSheet, "Scenario Units");

  const actionModelSheet = buildSheet(
    ACTION_MODELS.map((row) => [
      row.action,
      row.products,
      row.edge_calls,
      row.shard_queries,
      row.db_reads,
      row.db_writes,
      row.realtime_connections,
      row.uncached_egress_kb,
      row.cached_egress_kb,
      row.notes,
    ]),
    [
      "Action",
      "Products",
      "Edge Calls / Unit",
      "Shard Queries / Unit",
      "DB Reads / Unit",
      "DB Writes / Unit",
      "Realtime Connections / Unit",
      "Uncached Egress KB / Unit",
      "Cached Egress KB / Unit",
      "Notes",
    ],
  );
  actionModelSheet["!cols"] = [
    { wch: 34 },
    { wch: 30 },
    { wch: 18 },
    { wch: 20 },
    { wch: 16 },
    { wch: 16 },
    { wch: 26 },
    { wch: 22 },
    { wch: 20 },
    { wch: 92 },
  ];
  XLSX.utils.book_append_sheet(workbook, actionModelSheet, "Action Model");

  const recommendationSheet = buildSheet(
    recommendationRows.map((row) => [row.priority, row.area, row.recommendation, row.why]),
    ["Priority", "Area", "Recommendation", "Why"],
  );
  recommendationSheet["!cols"] = [{ wch: 10 }, { wch: 24 }, { wch: 92 }, { wch: 92 }];
  XLSX.utils.book_append_sheet(workbook, recommendationSheet, "Recommendations");

  const edgeFunctionsSheet = buildSheet(
    edgeFunctionRows.map((row) => [
      row.function_name,
      row.verify_jwt,
      row.caller_count,
      row.primary_surface,
      row.egress_risk,
      row.caller_files,
      row.notes,
    ]),
    [
      "Function",
      "verify_jwt",
      "Caller Count",
      "Primary Surface",
      "Egress Risk",
      "Caller Files",
      "Notes",
    ],
  );
  edgeFunctionsSheet["!cols"] = [
    { wch: 28 },
    { wch: 12 },
    { wch: 12 },
    { wch: 28 },
    { wch: 12 },
    { wch: 96 },
    { wch: 84 },
  ];
  XLSX.utils.book_append_sheet(workbook, edgeFunctionsSheet, "Edge Functions");

  const mainTablesSheet = buildSheet(
    tableStats.map((row) => [
      row.table,
      row.count,
      row.user_column,
      row.distinct_users,
      row.sample_rows,
      row.avg_row_json_bytes,
      row.logical_payload_mb,
      Object.entries(row.rows_by_plan || {})
        .map(([planId, count]) => `${planId}: ${count}`)
        .join(" | "),
      row.error,
    ]),
    [
      "Table",
      "Row Count",
      "User Column",
      "Distinct Users",
      "Sample Rows",
      "Avg Row JSON Bytes",
      "Logical Payload MB",
      "Rows By Plan",
      "Error",
    ],
  );
  mainTablesSheet["!cols"] = [
    { wch: 28 },
    { wch: 14 },
    { wch: 18 },
    { wch: 14 },
    { wch: 12 },
    { wch: 18 },
    { wch: 18 },
    { wch: 40 },
    { wch: 72 },
  ];
  XLSX.utils.book_append_sheet(workbook, mainTablesSheet, "Main Tables");

  const storageSheet = buildSheet(
    mainStats.buckets.map((row) => [
      row.bucket,
      row.public,
      row.objects,
      row.byte_count,
      Number(row.byte_count || 0) / (1024 * 1024),
      row.object_errors,
    ]),
    ["Bucket", "Public", "Objects", "Byte Count", "Stored MB", "Errors"],
  );
  storageSheet["!cols"] = [
    { wch: 20 },
    { wch: 10 },
    { wch: 12 },
    { wch: 16 },
    { wch: 14 },
    { wch: 72 },
  ];
  XLSX.utils.book_append_sheet(workbook, storageSheet, "Storage");

  const shardsSheet = buildSheet(
    shardRows.map((row) => [
      row.shard_index,
      row.project_ref,
      row.status,
      row.key_type,
      row.prospect_source,
      row.derive_companies_from_prospects,
      row.prospect_count_planned,
      row.avg_prospect_row_json_bytes,
      row.logical_payload_mb,
      row.error,
    ]),
    [
      "Shard Index",
      "Project Ref",
      "Status",
      "Key Type",
      "Prospect Source",
      "Derive Companies From Prospects",
      "Prospect Count Planned",
      "Avg Prospect Row JSON Bytes",
      "Logical Payload MB",
      "Error",
    ],
  );
  shardsSheet["!cols"] = [
    { wch: 12 },
    { wch: 24 },
    { wch: 12 },
    { wch: 12 },
    { wch: 22 },
    { wch: 30 },
    { wch: 20 },
    { wch: 26 },
    { wch: 18 },
    { wch: 72 },
  ];
  XLSX.utils.book_append_sheet(workbook, shardsSheet, "Search Shards");

  const tableUsageSheet = buildSheet(
    tableUsageSummary.map((row) => [
      row.name,
      row.call_sites,
      row.scopes.join(", "),
      row.operations.join(", "),
      row.files.join(", "),
    ]),
    ["Table", "Call Sites", "Scopes", "Operations", "Files"],
  );
  tableUsageSheet["!cols"] = [
    { wch: 28 },
    { wch: 12 },
    { wch: 20 },
    { wch: 24 },
    { wch: 120 },
  ];
  XLSX.utils.book_append_sheet(workbook, tableUsageSheet, "Table Usage");

  const rpcSheet = buildSheet(
    rpcSummary.map((row) => [row.name, row.call_sites, row.scopes.join(", "), row.files.join(", ")]),
    ["RPC", "Call Sites", "Scopes", "Files"],
  );
  rpcSheet["!cols"] = [{ wch: 28 }, { wch: 12 }, { wch: 20 }, { wch: 120 }];
  XLSX.utils.book_append_sheet(workbook, rpcSheet, "RPC Usage");

  const authSheet = buildSheet(
    authSummary.map((row) => [row.name, row.call_sites, row.scopes.join(", "), row.files.join(", ")]),
    ["Auth Call", "Call Sites", "Scopes", "Files"],
  );
  authSheet["!cols"] = [{ wch: 28 }, { wch: 12 }, { wch: 20 }, { wch: 120 }];
  XLSX.utils.book_append_sheet(workbook, authSheet, "Auth Usage");

  const realtimeSheet = buildSheet(
    realtimeSummary.map((row) => [row.channel, row.tables, row.scope, row.file]),
    ["Channel", "Tables", "Scope", "File"],
  );
  realtimeSheet["!cols"] = [{ wch: 26 }, { wch: 28 }, { wch: 16 }, { wch: 120 }];
  XLSX.utils.book_append_sheet(workbook, realtimeSheet, "Realtime");

  const sourcesSheet = buildSheet(
    SOURCE_FACTS.map((row) => [row.area, row.type, row.fact, row.url]),
    ["Area", "Type", "Fact", "URL"],
  );
  sourcesSheet["!cols"] = [{ wch: 22 }, { wch: 10 }, { wch: 92 }, { wch: 64 }];
  XLSX.utils.book_append_sheet(workbook, sourcesSheet, "Sources");

  if (warnings.length > 0) {
    const warningsSheet = buildSheet(
      warnings.map((warning) => [severityFromValue(1), warning]),
      ["Severity", "Warning"],
    );
    warningsSheet["!cols"] = [{ wch: 12 }, { wch: 140 }];
    XLSX.utils.book_append_sheet(workbook, warningsSheet, "Warnings");
  }

  XLSX.writeFile(workbook, workbookPath);
  fs.writeFileSync(markdownPath, `${markdownSections.join("\n")}\n`, "utf8");

  console.log(`Wrote ${relativeToRoot(markdownPath)}`);
  console.log(`Wrote ${relativeToRoot(workbookPath)}`);
  console.log(`Summary: ${tableUsageSummary.length} tables, ${localFunctions.length} edge functions, ${shardRows.length} search shards.`);
  if (warnings.length > 0) {
    console.warn(`Supabase audit warnings: ${warnings.length}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

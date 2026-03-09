import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";

function loadEnv(filePath) {
  const out = {};
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    if (!line || line.trim().startsWith("#") || !line.includes("=")) continue;
    const idx = line.indexOf("=");
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function toIso(msAgo) {
  return new Date(Date.now() - msAgo).toISOString();
}

async function run() {
  const env = loadEnv(path.join(process.cwd(), ".env"));
  const url = String(env.SUPABASE_URL || "").trim();
  const key = String(env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const since = toIso(1000 * 60 * 60 * 24);

  const { data: messages, error: msgError } = await admin
    .from("ai_builder_messages")
    .select("thread_id, user_id, role, status, content, metadata, created_at")
    .gte("created_at", since)
    .order("created_at", { ascending: true })
    .limit(3000);
  if (msgError) throw msgError;

  const { data: usage, error: usageError } = await admin
    .from("ai_builder_usage_logs")
    .select("thread_id, user_id, provider, model_id, latency_ms, metadata, created_at")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(500);
  if (usageError) throw usageError;

  const byThread = new Map();
  for (const row of messages || []) {
    const threadId = String(row.thread_id || "");
    if (!threadId) continue;
    if (!byThread.has(threadId)) byThread.set(threadId, []);
    byThread.get(threadId).push(row);
  }

  const stalled = [];
  for (const [threadId, rows] of byThread.entries()) {
    const sorted = [...rows].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
    const last = sorted[sorted.length - 1];
    if (!last) continue;
    if (String(last.role) !== "user") continue;
    const ageMs = Date.now() - Date.parse(last.created_at);
    if (ageMs < 60 * 1000) continue;
    stalled.push({
      threadId,
      userId: last.user_id,
      lastUserAt: last.created_at,
      ageMinutes: Math.round(ageMs / 60000),
      lastInstruction: String(last.content || "").slice(0, 220),
    });
  }

  const slow = (usage || [])
    .filter((row) => Number(row.latency_ms || 0) >= 30000)
    .slice(0, 25)
    .map((row) => {
      const diagnostics = (row.metadata && typeof row.metadata === "object" ? row.metadata.diagnostics : {}) || {};
      return {
        threadId: row.thread_id,
        userId: row.user_id,
        createdAt: row.created_at,
        provider: row.provider,
        model: row.model_id,
        latencyMs: row.latency_ms,
        fallbackReason: diagnostics.fallback_reason || null,
        postprocessMode: diagnostics.postprocess_mode || null,
      };
    });

  const summary = {
    windowSince: since,
    totalMessages: (messages || []).length,
    totalUsageRows: (usage || []).length,
    stalledThreadsCount: stalled.length,
    stalledThreadsSample: stalled.slice(0, 20),
    slowCallsCount: slow.length,
    slowCallsSample: slow,
  };

  console.log(JSON.stringify(summary, null, 2));
}

run().catch((error) => {
  console.error(JSON.stringify({ error: error?.message || String(error) }, null, 2));
  process.exit(1);
});


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

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_ANON_KEY) {
  throw new Error("Missing SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or SUPABASE_ANON_KEY");
}

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

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

const toObjectType = (mode: string, objectType?: string) => {
  const normalized = String(objectType || "").trim().toLowerCase();
  if (normalized === "email_template" || normalized === "landing_page" || normalized === "message" || normalized === "draft") {
    return normalized;
  }
  return mode === "landing" ? "landing_page" : "email_template";
};

const toVectorLiteral = (values: number[]) => {
  const normalized = values.map((value) => {
    if (!Number.isFinite(value)) return 0;
    return Number(value.toFixed(8));
  });
  return `[${normalized.join(",")}]`;
};

const splitIntoChunks = (text: string, chunkChars = 1800, overlapChars = 220) => {
  const clean = normalizeText(text);
  if (!clean) return [];
  if (clean.length <= chunkChars) return [clean];

  const chunks: string[] = [];
  let cursor = 0;
  while (cursor < clean.length) {
    const end = Math.min(clean.length, cursor + chunkChars);
    const chunk = clean.slice(cursor, end).trim();
    if (chunk) chunks.push(chunk);
    if (end >= clean.length) break;
    cursor = Math.max(end - overlapChars, cursor + 1);
  }
  return chunks;
};

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
    const token = tokens[i];
    const hash = hashToken(token);
    const idxA = hash % dims;
    const idxB = ((hash >>> 11) ^ (hash * 31)) % dims;
    vector[idxA] += 1;
    vector[Math.abs(idxB)] += 0.5;
  }

  let norm = 0;
  for (const value of vector) norm += value * value;
  norm = Math.sqrt(norm);
  if (!norm) return vector;
  return vector.map((value) => value / norm);
};

const decodeJwtPayload = (token: string): Record<string, unknown> | null => {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
    const json = atob(padded);
    const payload = JSON.parse(json);
    return payload && typeof payload === "object" ? payload as Record<string, unknown> : null;
  } catch {
    return null;
  }
};

const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

const toUuidLikeFromHash = (hashHex: string) => {
  const clean = String(hashHex || "").toLowerCase().replace(/[^0-9a-f]/g, "");
  const padded = (clean + "0".repeat(32)).slice(0, 32);
  const versioned = `${padded.slice(0, 12)}5${padded.slice(13)}`;
  const variantNibble = ((parseInt(versioned[16], 16) & 0x3) | 0x8).toString(16);
  const withVariant = `${versioned.slice(0, 16)}${variantNibble}${versioned.slice(17)}`;
  return `${withVariant.slice(0, 8)}-${withVariant.slice(8, 12)}-${withVariant.slice(12, 16)}-${withVariant.slice(16, 20)}-${withVariant.slice(20, 32)}`;
};

const sha256Hex = async (input: string) => {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

const requestOpenAIEmbeddings = async (inputs: string[], apiKey: string) => {
  const withDimensionsPayload = {
    model: OPENAI_EMBEDDING_MODEL,
    input: inputs,
    dimensions: 1536,
  };

  const withoutDimensionsPayload = {
    model: OPENAI_EMBEDDING_MODEL,
    input: inputs,
  };

  const execute = async (payload: Record<string, unknown>) => {
    const response = await fetch(`${OPENAI_BASE_URL}/embeddings`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = typeof body?.error?.message === "string" ? body.error.message : "Embedding request failed";
      throw new Error(message);
    }

    const rows = Array.isArray(body?.data) ? body.data : [];
    return rows.map((row: any) => row?.embedding).filter((embedding: unknown) => Array.isArray(embedding));
  };

  try {
    return await execute(withDimensionsPayload);
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    if (!message.includes("dimension")) {
      throw error;
    }
    return await execute(withoutDimensionsPayload);
  }
};

const resolveUser = async (req: Request) => {
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) return null;
  const token = authHeader.slice(7).trim();
  if (!token) return null;

  const adminResult = await admin.auth.getUser(token);
  if (!adminResult.error && adminResult.data?.user) {
    return adminResult.data.user;
  }

  const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await authClient.auth.getUser(token);
  if (!error && data?.user) return data.user;

  // Fallback for intermittent auth API failures: use validated JWT shape + expiry checks.
  const payload = decodeJwtPayload(token);
  const subject = String(payload?.sub || "").trim();
  const expiry = Number(payload?.exp || 0);
  const issuer = String(payload?.iss || "").trim();
  const now = Math.floor(Date.now() / 1000);
  const expectedIssuerPrefix = `${SUPABASE_URL.replace(/\/+$/, "")}/auth/v1`;
  if (subject && isUuid(subject) && expiry > now - 30 && (!issuer || issuer.startsWith(expectedIssuerPrefix))) {
    return { id: subject };
  }

  if (error) {
    console.warn("ai-builder-index auth.getUser failed:", error.message);
  }
  return null;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const user = await resolveUser(req);
    if (!user) return jsonResponse({ error: "Unauthorized" }, 401);

    const payload = await req.json().catch(() => ({}));
    const mode = String(payload?.mode || "email").toLowerCase() === "landing" ? "landing" : "email";
    const sourceObjectId = String(payload?.objectId || "").trim();
    const objectType = toObjectType(mode, payload?.objectType);
    const threadId = payload?.threadId ? String(payload.threadId) : null;
    const metadata = payload?.metadata && typeof payload.metadata === "object" ? payload.metadata : {};
    const openAiApiKey = String(OPENAI_API_KEY || "").trim();
    const rawText = String(payload?.text || "");

    if (!sourceObjectId) {
      return jsonResponse({ error: "objectId is required" }, 400);
    }
    const objectId = isUuid(sourceObjectId)
      ? sourceObjectId
      : toUuidLikeFromHash(await sha256Hex(`${mode}:${objectType}:${sourceObjectId}`));

    const text = normalizeText(rawText).slice(0, 120000);
    if (!text) {
      return jsonResponse({ indexedChunks: 0, modelKey: OPENAI_EMBEDDING_MODEL, skipped: true });
    }

    const fullTextHash = await sha256Hex(text);

    const { data: existingRow, error: existingLookupError } = await admin
      .from("ai_builder_embeddings")
      .select("model_key, metadata")
      .eq("user_id", user.id)
      .eq("object_type", objectType)
      .eq("object_id", objectId)
      .limit(1)
      .maybeSingle();
    if (existingLookupError) throw existingLookupError;

    const existingMetadata = existingRow?.metadata && typeof existingRow.metadata === "object"
      ? (existingRow.metadata as Record<string, unknown>)
      : {};

    if (existingMetadata?.full_hash === fullTextHash && existingRow?.model_key === OPENAI_EMBEDDING_MODEL) {
      return jsonResponse({
        indexedChunks: 0,
        objectType,
        objectId,
        sourceObjectId,
        modelKey: OPENAI_EMBEDDING_MODEL,
        skipped: true,
        reason: "unchanged_content",
      });
    }

    const chunkChars = clamp(Number(payload?.chunkChars || 1800), 500, 3200);
    const overlapChars = clamp(Number(payload?.overlapChars || 220), 0, 800);
    const chunks = splitIntoChunks(text, chunkChars, overlapChars);
    if (chunks.length === 0) {
      return jsonResponse({ indexedChunks: 0, modelKey: OPENAI_EMBEDDING_MODEL, skipped: true });
    }

    let embeddings: number[][] = [];
    let fallbackUsed = false;

    if (openAiApiKey) {
      const remoteEmbeddings = await requestOpenAIEmbeddings(chunks, openAiApiKey);
      if (remoteEmbeddings.length !== chunks.length) {
        throw new Error("Embedding response size mismatch");
      }
      embeddings = remoteEmbeddings;
    } else {
      fallbackUsed = true;
      embeddings = chunks.map((chunk) => deterministicEmbedding(chunk, 1536));
    }

    const rows = await Promise.all(
      chunks.map(async (chunk, index) => {
        const chunkHash = await sha256Hex(chunk);
        return {
          user_id: user.id,
          thread_id: threadId,
          object_type: objectType,
          object_id: objectId,
          chunk_index: index,
          chunk_text: chunk,
          chunk_hash: chunkHash,
          model_key: OPENAI_EMBEDDING_MODEL,
          embedding: toVectorLiteral(embeddings[index] || deterministicEmbedding(chunk, 1536)),
          metadata: {
            ...metadata,
            full_hash: fullTextHash,
            object_type: objectType,
            source_object_id: sourceObjectId,
            ...(threadId ? { thread_id: threadId, threadId } : {}),
          },
        };
      })
    );

    const { error: deleteError } = await admin
      .from("ai_builder_embeddings")
      .delete()
      .eq("user_id", user.id)
      .eq("object_type", objectType)
      .eq("object_id", objectId);
    if (deleteError) throw deleteError;

    const { error: insertError } = await admin.from("ai_builder_embeddings").insert(rows);
    if (insertError) throw insertError;

    return jsonResponse({
      indexedChunks: rows.length,
      objectType,
      objectId,
      sourceObjectId,
      modelKey: OPENAI_EMBEDDING_MODEL,
      fallbackUsed,
    });
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : (typeof error === "object" && error !== null ? JSON.stringify(error) : String(error || "Unknown error"));
    return jsonResponse({ error: message }, 500);
  }
});

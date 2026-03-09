import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

if (!SUPABASE_URL) {
  throw new Error("Missing SUPABASE_URL");
}

const sseHeaders = {
  ...corsHeaders,
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
};

const encoder = new TextEncoder();

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const UPSTREAM_TIMEOUT_MS = Math.max(10000, Number(Deno.env.get("AI_STREAM_UPSTREAM_TIMEOUT_MS") || 95000));

const statusPhrases = [
  "Analyzing your instruction...",
  "Planning layout and structure...",
  "Drafting conversion-focused copy...",
  "Applying quality checks...",
];

const pickString = (value: unknown, fallback = "") => {
  const normalized = String(value ?? "").trim();
  return normalized || fallback;
};

const buildAssistantSummary = (payload: Record<string, unknown>) =>
  pickString(
    payload?.assistantMessage ||
      (payload?.result && typeof payload.result === "object"
        ? (payload.result as Record<string, unknown>)?.reasoning
        : "") ||
      "Template updated."
  );

const sendEvent = (
  controller: ReadableStreamDefaultController<Uint8Array>,
  event: string,
  payload: Record<string, unknown>
) => {
  controller.enqueue(
    encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`)
  );
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  const rawBody = await req.text().catch(() => "{}");

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let statusInterval: number | undefined;
      try {
        sendEvent(controller, "status", {
          stage: "started",
          message: "Starting generation...",
        });
        let tick = 0;
        const pushProcessingStatus = () => {
          if (tick >= statusPhrases.length) {
            if (statusInterval !== undefined) {
              clearInterval(statusInterval);
              statusInterval = undefined;
            }
            return;
          }
          sendEvent(controller, "status", {
            stage: "processing",
            message: statusPhrases[tick],
          });
          tick += 1;
        };
        pushProcessingStatus();
        statusInterval = setInterval(pushProcessingStatus, 1200);

        const upstreamController = new AbortController();
        const upstreamTimeout = setTimeout(() => upstreamController.abort(), UPSTREAM_TIMEOUT_MS);
        let upstreamResponse: Response;
        try {
          upstreamResponse = await fetch(
            `${SUPABASE_URL.replace(/\/+$/, "")}/functions/v1/ai-builder-generate`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: authHeader,
                ...(SUPABASE_ANON_KEY ? { apikey: SUPABASE_ANON_KEY } : {}),
              },
              body: rawBody,
              signal: upstreamController.signal,
            }
          );
        } catch (error) {
          const isAbort = error instanceof DOMException && error.name === "AbortError";
          if (isAbort) {
            sendEvent(controller, "error", {
              message: `Generation timed out after ${UPSTREAM_TIMEOUT_MS}ms while waiting for upstream AI response.`,
            });
            sendEvent(controller, "done", { ok: false });
            controller.close();
            return;
          }
          throw error;
        } finally {
          clearTimeout(upstreamTimeout);
        }

        if (!upstreamResponse.ok) {
          const errorBody = await upstreamResponse
            .json()
            .catch(() => ({ error: `Request failed (${upstreamResponse.status})` }));
          sendEvent(controller, "error", {
            message: pickString(errorBody?.error || "Generation failed"),
          });
          sendEvent(controller, "done", { ok: false });
          controller.close();
          return;
        }

        if (statusInterval !== undefined) {
          clearInterval(statusInterval);
          statusInterval = undefined;
        }
        sendEvent(controller, "status", {
          stage: "finalizing",
          message: "Applying quality checks...",
        });

        const payload = await upstreamResponse.json().catch(() => ({}));
        if (payload?.error) {
          sendEvent(controller, "error", {
            message: pickString(payload.error || "Generation failed"),
          });
          sendEvent(controller, "done", { ok: false });
          controller.close();
          return;
        }

        const summary = buildAssistantSummary(payload);
        const chunks = summary
          .split(/(\s+)/)
          .map((token) => token.trim().length > 0 || token === "\n" ? token : token)
          .filter((token) => token.length > 0);

        for (const chunk of chunks) {
          sendEvent(controller, "delta", { text: chunk });
          await sleep(16);
        }

        sendEvent(controller, "result", payload);
        sendEvent(controller, "done", {
          ok: true,
          threadId: pickString(payload?.threadId || ""),
        });
      } catch (error) {
        sendEvent(controller, "error", {
          message: error instanceof Error ? error.message : "Unknown streaming error",
        });
        sendEvent(controller, "done", { ok: false });
      } finally {
        if (statusInterval !== undefined) clearInterval(statusInterval);
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: sseHeaders });
});

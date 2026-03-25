import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";

if (!supabaseUrl || !serviceRoleKey || !anonKey) {
  throw new Error("Missing SUPABASE_URL/VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or SUPABASE_ANON_KEY in .env");
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const args = process.argv.slice(2);
const keepWorkflow = args.includes("--keep-workflow");

const nowIso = () => new Date().toISOString();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const safeError = (error) => (error instanceof Error ? error.message : String(error));

const waitFor = async (label, fn, { timeoutMs = 180000, intervalMs = 4000 } = {}) => {
  const started = Date.now();
  let lastError = null;

  while (Date.now() - started <= timeoutMs) {
    try {
      const result = await fn();
      if (result) return result;
    } catch (error) {
      lastError = error;
    }
    await sleep(intervalMs);
  }

  if (lastError) {
    throw new Error(`Timed out while waiting for ${label}: ${safeError(lastError)}`);
  }
  throw new Error(`Timed out while waiting for ${label}.`);
};

const pickWorkflowOwner = async () => {
  const { data, error } = await admin
    .from("automation_workflows")
    .select("user_id")
    .eq("trigger_type", "custom_event")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to find workflow owner: ${error.message}`);
  }
  if (!data?.user_id) {
    throw new Error("No custom_event workflow owner found.");
  }
  return String(data.user_id);
};

const getOwnerAccessToken = async (userId) => {
  const owner = await admin.auth.admin.getUserById(userId);
  if (owner.error || !owner.data?.user?.email) {
    throw new Error(`Failed to load workflow owner auth user: ${owner.error?.message || "owner email missing"}`);
  }

  const email = String(owner.data.user.email || "").trim().toLowerCase();
  const magicLink = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: {
      redirectTo: "http://localhost/auth/confirm",
    },
  });

  if (magicLink.error) {
    throw new Error(`Failed to generate owner magic link: ${magicLink.error.message}`);
  }

  const emailOtp = magicLink.data?.properties?.email_otp;
  if (!emailOtp) {
    throw new Error("Owner magic link did not return email_otp.");
  }

  const anon = createClient(supabaseUrl, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const verified = await anon.auth.verifyOtp({
    email,
    token: emailOtp,
    type: "magiclink",
  });

  if (verified.error || !verified.data?.session?.access_token) {
    throw new Error(`Failed to verify owner magic link: ${verified.error?.message || "access token missing"}`);
  }

  return {
    email,
    accessToken: String(verified.data.session.access_token),
  };
};

const invokeFunction = async (functionName, body, { bearerToken = serviceRoleKey, apiKey = "" } = {}) => {
  const response = await fetch(`${supabaseUrl.replace(/\/+$/, "")}/functions/v1/${functionName}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${bearerToken}`,
      ...(apiKey ? { apikey: apiKey } : {}),
    },
    body: JSON.stringify(body || {}),
  });

  let payload = {};
  try {
    payload = await response.json();
  } catch {
    payload = {};
  }

  if (!response.ok) {
    throw new Error(`${functionName} failed (${response.status}): ${JSON.stringify(payload)}`);
  }

  return payload;
};

const invokeRunner = async ({ workflowId, contactId, ownerAccessToken }) =>
  invokeFunction(
    "automation-runner",
    {
      action: "run_now",
      workflowId,
      contactId,
      batchSize: 20,
    },
    {
      bearerToken: ownerAccessToken,
      apiKey: anonKey,
    }
  );

const invokeRunnerTickRpc = async () => {
  const { error } = await admin.rpc("invoke_automation_runner");
  if (error) {
    throw new Error(`invoke_automation_runner RPC failed: ${error.message}`);
  }
  return { success: true, via: "rpc_tick" };
};

const invokeRunnerWithFallback = async ({ workflowId, contactId, ownerAccessToken }) => {
  try {
    const response = await invokeRunner({ workflowId, contactId, ownerAccessToken });
    return { ...response, via: "edge_function" };
  } catch (error) {
    const message = safeError(error);
    if (!/401|unauthorized/i.test(message)) {
      throw error;
    }
    return invokeRunnerTickRpc();
  }
};

const callAutomationWebhook = async ({ workflowId, eventName, email, fullName, data = {} }) => {
  const response = await fetch(
    `${supabaseUrl.replace(/\/+$/, "")}/functions/v1/automation-webhook?workflowId=${encodeURIComponent(workflowId)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({
        event: eventName,
        email,
        name: fullName,
        data: {
          company: "Webhook Node E2E",
          ...data,
        },
      }),
    }
  );

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`automation-webhook failed (${response.status}): ${JSON.stringify(payload)}`);
  }
  return payload;
};

const createWorkflow = async ({ userId, eventName, graph, runId }) => {
  const { data, error } = await admin
    .from("automation_workflows")
    .insert({
      user_id: userId,
      name: `Live webhook node ${runId}`,
      description: "Temporary live webhook-node automation test",
      status: "live",
      trigger_type: "custom_event",
      trigger_filters: { event_name: eventName },
      flow: [{ id: "legacy_stop", name: "Stop", type: "stop", config: {} }],
      settings: {
        workflow_graph: graph,
      },
      published_at: nowIso(),
    })
    .select("id, user_id, name, status")
    .single();

  if (error) {
    throw new Error(`Failed to create workflow: ${error.message}`);
  }

  return data;
};

const fetchContact = async (workflowId, email) => {
  const { data, error } = await admin
    .from("automation_contacts")
    .select("id, workflow_id, email, status, current_step, next_run_at, state, last_error, updated_at")
    .eq("workflow_id", workflowId)
    .ilike("email", email)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch contact: ${error.message}`);
  }

  return data || null;
};

const fetchLogs = async (workflowId) => {
  const { data, error } = await admin
    .from("automation_logs")
    .select("event_type, message, metadata, created_at, contact_id, step_index")
    .eq("workflow_id", workflowId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch workflow logs: ${error.message}`);
  }

  return data || [];
};

const pauseWorkflow = async (workflowId) => {
  const { error } = await admin
    .from("automation_workflows")
    .update({ status: "paused" })
    .eq("id", workflowId);

  if (error) {
    throw new Error(`Failed to pause workflow ${workflowId}: ${error.message}`);
  }
};

const createWebhookGraph = ({ runId }) => ({
  id: `wf_webhook_node_${runId}`,
  name: `Webhook Node ${runId}`,
  status: "live",
  version: 1,
  nodes: [
    {
      id: "trigger_1",
      kind: "trigger",
      title: "Trigger",
      status: "live",
      position: { x: 80, y: 180 },
      config: { triggerType: "custom_event" },
    },
    {
      id: "webhook_1",
      kind: "webhook",
      title: "Call verification webhook",
      status: "live",
      position: { x: 360, y: 180 },
      config: {
        url: "https://postman-echo.com/post",
        method: "POST",
        payloadTemplate: JSON.stringify(
          {
            source: "automation_webhook_node_e2e",
            run_id: runId,
            email: "{email}",
            company: "{company}",
          },
          null,
          2
        ),
        headers: {
          "Content-Type": "application/json",
          "X-Automation-Test": `webhook-node-${runId}`,
        },
        authType: "none",
        authToken: "",
        authHeader: "x-api-key",
        timeoutMs: 12000,
      },
    },
    {
      id: "exit_1",
      kind: "exit",
      title: "Exit",
      status: "live",
      position: { x: 700, y: 180 },
      config: { reason: "completed" },
    },
  ],
  edges: [
    {
      id: "edge_trigger_webhook",
      source: "trigger_1",
      target: "webhook_1",
      sourceHandle: "out",
      targetHandle: "in",
    },
    {
      id: "edge_webhook_exit",
      source: "webhook_1",
      target: "exit_1",
      sourceHandle: "out",
      targetHandle: "in",
    },
  ],
});

const summarizeContact = (contact) =>
  contact
    ? {
        id: contact.id,
        email: contact.email,
        status: contact.status,
        current_step: contact.current_step,
        next_run_at: contact.next_run_at,
        last_error: contact.last_error,
        state: {
          current_node_id: contact.state?.current_node_id || null,
          last_webhook_status: contact.state?.last_webhook_status || null,
          last_webhook_at: contact.state?.last_webhook_at || null,
          webhook_results: contact.state?.webhook_results || {},
        },
      }
    : null;

const main = async () => {
  const runId = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const eventName = `webhook_node_${runId}`;
  const ownerUserId = await pickWorkflowOwner();
  const ownerAuth = await getOwnerAccessToken(ownerUserId);
  const graph = createWebhookGraph({ runId });
  const workflow = await createWorkflow({
    userId: ownerUserId,
    eventName,
    graph,
    runId,
  });

  const contactEmail = `prajwalrpawar2001+webhooknode_${runId}@gmail.com`;
  let workflowPaused = false;

  try {
    const webhookTrigger = await callAutomationWebhook({
      workflowId: workflow.id,
      eventName,
      email: contactEmail,
      fullName: "Webhook Node E2E",
    });

    const contact = await waitFor(
      "webhook-node contact creation",
      async () => {
        const row = await fetchContact(workflow.id, contactEmail);
        return row?.id ? row : null;
      },
      { timeoutMs: 120000, intervalMs: 3000 }
    );

    const outcome = await waitFor(
      "webhook step execution",
      async () => {
        const logs = await fetchLogs(workflow.id);
        const webhookLog =
          [...logs].reverse().find((log) => log.event_type === "webhook_sent") || null;
        const completedLog =
          [...logs].reverse().find((log) => log.event_type === "workflow_completed") || null;
        return webhookLog && completedLog ? { logs, webhookLog, completedLog } : null;
      },
      { timeoutMs: 45000, intervalMs: 4000 }
    ).catch(async () => {
      await invokeRunnerWithFallback({
        workflowId: workflow.id,
        contactId: contact.id,
        ownerAccessToken: ownerAuth.accessToken,
      });
      return waitFor(
        "webhook step execution after manual runner",
        async () => {
          const logs = await fetchLogs(workflow.id);
          const webhookLog =
            [...logs].reverse().find((log) => log.event_type === "webhook_sent") || null;
          const completedLog =
            [...logs].reverse().find((log) => log.event_type === "workflow_completed") || null;
          return webhookLog && completedLog ? { logs, webhookLog, completedLog } : null;
        },
        { timeoutMs: 90000, intervalMs: 4000 }
      );
    });

    const finalContact = await fetchContact(workflow.id, contactEmail);
    const webhookStatus = Number(outcome.webhookLog?.metadata?.status || 0);
    const recordedStatus = Number(finalContact?.state?.webhook_results?.webhook_1?.status || 0);
    const pass =
      webhookStatus === 200 &&
      recordedStatus === 200 &&
      String(finalContact?.status || "").toLowerCase() === "completed";

    console.log(
      JSON.stringify(
        {
          pass,
          runId,
          ownerUserId,
          ownerAuth: {
            email: ownerAuth.email,
            method: "magiclink_session",
          },
          workflowId: workflow.id,
          webhookTrigger,
          contact: summarizeContact(finalContact),
          webhookLog: {
            message: outcome.webhookLog.message,
            metadata: outcome.webhookLog.metadata,
            created_at: outcome.webhookLog.created_at,
          },
          completedLog: {
            message: outcome.completedLog.message,
            metadata: outcome.completedLog.metadata,
            created_at: outcome.completedLog.created_at,
          },
        },
        null,
        2
      )
    );

    if (!pass) {
      throw new Error("Webhook node test did not complete successfully.");
    }
  } finally {
    if (!keepWorkflow && workflow?.id && !workflowPaused) {
      await pauseWorkflow(workflow.id);
      workflowPaused = true;
    }
  }
};

main().catch((error) => {
  console.error(safeError(error));
  process.exit(1);
});

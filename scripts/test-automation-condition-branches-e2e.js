import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  throw new Error("Missing VITE_SUPABASE_URL/SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
}

const admin = createClient(supabaseUrl, serviceKey);

const nowIso = () => new Date().toISOString();

const findUserContext = async () => {
  const workflowUser = await admin.from("automation_workflows").select("user_id").limit(1).maybeSingle();
  if (workflowUser.data?.user_id) return { userId: workflowUser.data.user_id, createdTempUser: false };

  const listUser = await admin.from("email_lists").select("user_id").limit(1).maybeSingle();
  if (listUser.data?.user_id) return { userId: listUser.data.user_id, createdTempUser: false };

  const prospectUser = await admin.from("prospects").select("user_id").limit(1).maybeSingle();
  if (prospectUser.data?.user_id) return { userId: prospectUser.data.user_id, createdTempUser: false };

  const authUser = await admin.schema("auth").from("users").select("id").limit(1).maybeSingle();
  if (authUser.data?.id) return { userId: authUser.data.id, createdTempUser: false };

  const tempEmail = `automation-e2e-${Date.now().toString(36)}@example.com`;
  const tempPassword = `Tmp-${Math.random().toString(36).slice(2)}-Aa1!`;
  const created = await admin.auth.admin.createUser({
    email: tempEmail,
    password: tempPassword,
    email_confirm: true,
  });

  if (created.error || !created.data?.user?.id) {
    throw new Error(`No user found and temp user creation failed: ${created.error?.message || "unknown error"}`);
  }

  return { userId: created.data.user.id, createdTempUser: true };
};

const invokeRunner = async (payload) => {
  const response = await fetch(`${supabaseUrl.replace(/\/+$/, "")}/functions/v1/automation-runner`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serviceKey}`,
    },
    body: JSON.stringify(payload),
  });

  let body = {};
  try {
    body = await response.json();
  } catch {
    body = {};
  }

  if (!response.ok) {
    throw new Error(`Runner call failed (${response.status}): ${JSON.stringify(body)}`);
  }
  return body;
};

const toObject = (value) => (value && typeof value === "object" && !Array.isArray(value) ? value : {});

const run = async () => {
  const runId = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const userContext = await findUserContext();
  const userId = userContext.userId;
  const workflowName = `E2E Condition Branches ${runId}`;

  let workflowId = null;

  try {
    const graph = {
      id: `wf_graph_${runId}`,
      name: workflowName,
      status: "draft",
      version: 1,
      nodes: [
        {
          id: "trigger_1",
          kind: "trigger",
          title: "Trigger",
          status: "draft",
          position: { x: 80, y: 180 },
          config: { triggerType: "manual" },
        },
        {
          id: "condition_1",
          kind: "condition",
          title: "Executive Title?",
          status: "draft",
          position: { x: 360, y: 180 },
          config: {
            clauses: [
              {
                id: "if",
                rule: "user_property",
                propertyKey: "job_title",
                comparator: "contains",
                value: "chief",
              },
              {
                id: "else_if_1",
                rule: "user_property",
                propertyKey: "job_title",
                comparator: "contains",
                value: "manager",
              },
            ],
          },
        },
        {
          id: "exit_if",
          kind: "exit",
          title: "Exit If",
          status: "draft",
          position: { x: 700, y: 40 },
          config: { reason: "completed" },
        },
        {
          id: "exit_else_if",
          kind: "exit",
          title: "Exit Else If",
          status: "draft",
          position: { x: 700, y: 180 },
          config: { reason: "completed" },
        },
        {
          id: "exit_else",
          kind: "exit",
          title: "Exit Else",
          status: "draft",
          position: { x: 700, y: 320 },
          config: { reason: "completed" },
        },
      ],
      edges: [
        {
          id: "edge_trigger_condition",
          source: "trigger_1",
          target: "condition_1",
          sourceHandle: "out",
          targetHandle: "in",
          animated: true,
        },
        {
          id: "edge_condition_if",
          source: "condition_1",
          target: "exit_if",
          sourceHandle: "if",
          targetHandle: "in",
          animated: true,
        },
        {
          id: "edge_condition_else_if",
          source: "condition_1",
          target: "exit_else_if",
          sourceHandle: "else_if_1",
          targetHandle: "in",
          animated: true,
        },
        {
          id: "edge_condition_else",
          source: "condition_1",
          target: "exit_else",
          sourceHandle: "else",
          targetHandle: "in",
          animated: true,
        },
      ],
    };

    const createWorkflow = await admin
      .from("automation_workflows")
      .insert({
        user_id: userId,
        name: workflowName,
        description: "Temporary E2E branch-routing verification.",
        status: "draft",
        trigger_type: "manual",
        trigger_filters: {},
        flow: [{ id: "legacy_stop", name: "Stop", type: "stop", config: {} }],
        settings: { workflow_graph: graph },
      })
      .select("id, user_id")
      .single();

    if (createWorkflow.error) {
      throw new Error(`Failed to create test workflow: ${createWorkflow.error.message}`);
    }

    workflowId = createWorkflow.data.id;

    const contacts = [
      {
        workflow_id: workflowId,
        user_id: userId,
        email: `branch-chief-${runId}@example.com`,
        full_name: "Chief Branch",
        status: "active",
        current_step: 0,
        next_run_at: nowIso(),
        state: { job_title: "Chief Technology Officer" },
      },
      {
        workflow_id: workflowId,
        user_id: userId,
        email: `branch-manager-${runId}@example.com`,
        full_name: "Manager Branch",
        status: "active",
        current_step: 0,
        next_run_at: nowIso(),
        state: { job_title: "Regional Manager" },
      },
      {
        workflow_id: workflowId,
        user_id: userId,
        email: `branch-developer-${runId}@example.com`,
        full_name: "Else Branch",
        status: "active",
        current_step: 0,
        next_run_at: nowIso(),
        state: { job_title: "Software Developer" },
      },
    ];

    const insertContacts = await admin.from("automation_contacts").insert(contacts).select("id, email");
    if (insertContacts.error) {
      throw new Error(`Failed to insert test contacts: ${insertContacts.error.message}`);
    }

    const byEmail = new Map((insertContacts.data || []).map((row) => [row.email, row.id]));

    const runResult = await invokeRunner({
      action: "run_now",
      workflowId,
      batchSize: 30,
    });

    const logsResponse = await admin
      .from("automation_logs")
      .select("contact_id, event_type, message, metadata")
      .eq("workflow_id", workflowId)
      .eq("event_type", "condition_evaluated");

    if (logsResponse.error) {
      throw new Error(`Failed to read condition logs: ${logsResponse.error.message}`);
    }

    const contactResponse = await admin
      .from("automation_contacts")
      .select("id, email, status, current_step, state, last_error")
      .eq("workflow_id", workflowId)
      .order("email", { ascending: true });

    if (contactResponse.error) {
      throw new Error(`Failed to read contact states: ${contactResponse.error.message}`);
    }

    const logsByContactId = new Map();
    for (const row of logsResponse.data || []) {
      logsByContactId.set(row.contact_id, row);
    }

    const expectations = [
      { email: contacts[0].email, branch: "if" },
      { email: contacts[1].email, branch: "else_if_1" },
      { email: contacts[2].email, branch: "else" },
    ];

    for (const expected of expectations) {
      const contactId = byEmail.get(expected.email);
      const logRow = logsByContactId.get(contactId);
      const metadata = toObject(logRow?.metadata);
      const branch = String(metadata.branch || "");
      if (branch !== expected.branch) {
        throw new Error(
          `Branch mismatch for ${expected.email}. Expected ${expected.branch}, got ${branch || "(none)"}`
        );
      }
    }

    const notCompleted = (contactResponse.data || []).filter((row) => row.status !== "completed");
    if (notCompleted.length > 0) {
      const details = notCompleted.map((row) => `${row.email}:${row.status}`).join(", ");
      throw new Error(`Expected completed contacts, but found: ${details}`);
    }

    console.log("E2E automation condition test passed.");
    console.log(JSON.stringify(runResult, null, 2));
    console.log("Branch routing:");
    for (const expected of expectations) {
      const contactId = byEmail.get(expected.email);
      const metadata = toObject(logsByContactId.get(contactId)?.metadata);
      console.log(`- ${expected.email} => ${String(metadata.branch || "(none)")}`);
    }
  } finally {
    if (workflowId) {
      const cleanup = await admin.from("automation_workflows").delete().eq("id", workflowId);
      if (cleanup.error) {
        console.error(`Cleanup failed for workflow ${workflowId}:`, cleanup.error.message);
      }
    }
    if (userContext.createdTempUser) {
      const deleteUser = await admin.auth.admin.deleteUser(userId);
      if (deleteUser.error) {
        console.error(`Cleanup failed for temp user ${userId}:`, deleteUser.error.message);
      }
    }
  }
};

run().catch((error) => {
  console.error("E2E automation condition test failed.");
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

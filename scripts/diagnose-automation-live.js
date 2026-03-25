import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
  process.exit(1);
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const args = process.argv.slice(2);
const flags = new Set(args.filter((arg) => arg.startsWith("--")));
const getArgValue = (name) => {
  const direct = args.find((arg) => arg.startsWith(`${name}=`));
  if (direct) return direct.slice(name.length + 1);
  const index = args.indexOf(name);
  if (index >= 0 && args[index + 1] && !args[index + 1].startsWith("--")) {
    return args[index + 1];
  }
  return "";
};

const workflowIdArg = getArgValue("--workflow-id").trim();
const searchEmailArg = getArgValue("--search-email").trim().toLowerCase();
const logLimitRaw = Number(getArgValue("--log-limit") || "20");
const logLimit = Number.isFinite(logLimitRaw) ? Math.max(1, Math.min(100, logLimitRaw)) : 20;

const isPlaceholder = (value) => {
  const normalized = String(value || "").trim();
  return !normalized || normalized === "REDACTED_SUPABASE_SERVICE_ROLE_KEY";
};

const maskKeyState = (value) => {
  if (value === null || value === undefined) return "missing";
  return isPlaceholder(value) ? "placeholder" : "set";
};

const summarizeState = (state) => {
  const source = state && typeof state === "object" && !Array.isArray(state) ? state : {};
  const keys = Object.keys(source);
  const waitKeys = keys.filter((key) => key.startsWith("wait_until"));
  return {
    current_node_id: source.current_node_id || null,
    last_email_node_id: source.last_email_node_id || null,
    last_email_step_index: source.last_email_step_index ?? null,
    last_sent_at: source.last_sent_at || null,
    last_opened_at: source.last_opened_at || null,
    last_clicked_at: source.last_clicked_at || null,
    last_replied_at: source.last_replied_at || null,
    condition_wait_until: source.condition_wait_until || null,
    condition_wait_rules: Array.isArray(source.condition_wait_rules) ? source.condition_wait_rules : [],
    wait_keys: waitKeys,
  };
};

const printSection = (label, value) => {
  console.log(`\n=== ${label} ===`);
  console.log(JSON.stringify(value, null, 2));
};

const pickWorkflowId = async () => {
  if (workflowIdArg) return workflowIdArg;

  const { data: waitLog, error: waitLogError } = await admin
    .from("automation_logs")
    .select("workflow_id, created_at, message")
    .eq("event_type", "wait_scheduled")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (waitLogError) {
    throw new Error(`Failed to load latest wait_scheduled log: ${waitLogError.message}`);
  }

  if (waitLog?.workflow_id) return String(waitLog.workflow_id);

  const { data: workflow, error: workflowError } = await admin
    .from("automation_workflows")
    .select("id")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (workflowError) {
    throw new Error(`Failed to load latest automation workflow: ${workflowError.message}`);
  }

  return String(workflow?.id || "");
};

const syncSecrets = async () => {
  const rows = [
    { key: "service_role_key", value: serviceRoleKey },
    { key: "supabase_url", value: supabaseUrl },
  ];

  const { error } = await admin.from("app_secrets").upsert(rows, { onConflict: "key" });
  if (error) {
    throw new Error(`Failed to sync app_secrets: ${error.message}`);
  }

  return {
    synced: true,
    keys: rows.map((row) => row.key),
  };
};

const inspectCron = async () => {
  const cronJobsResponse = await admin
    .schema("cron")
    .from("job")
    .select("jobid, jobname, schedule, active, command, nodename, database, username")
    .in("jobname", ["automation-runner-worker", "check-replies-bounces"])
    .order("jobname", { ascending: true });

  if (cronJobsResponse.error) {
    return {
      error: cronJobsResponse.error.message,
      jobs: [],
      runs: [],
    };
  }

  const jobs = cronJobsResponse.data || [];
  const jobIds = jobs.map((job) => job.jobid).filter(Boolean);

  if (jobIds.length === 0) {
    return {
      jobs: [],
      runs: [],
    };
  }

  const cronRunsResponse = await admin
    .schema("cron")
    .from("job_run_details")
    .select("jobid, status, return_message, start_time, end_time")
    .in("jobid", jobIds)
    .order("start_time", { ascending: false })
    .limit(12);

  return {
    jobs,
    runs: cronRunsResponse.error ? [{ error: cronRunsResponse.error.message }] : cronRunsResponse.data || [],
  };
};

const inspectWorkflow = async (workflowId) => {
  if (!workflowId) {
    return {
      workflow: null,
      contacts: [],
      logs: [],
    };
  }

  const { data: workflow, error: workflowError } = await admin
    .from("automation_workflows")
    .select("id, user_id, name, status, trigger_type, updated_at, published_at, last_run_at, run_summary")
    .eq("id", workflowId)
    .maybeSingle();

  if (workflowError) {
    throw new Error(`Failed to load workflow ${workflowId}: ${workflowError.message}`);
  }

  const { data: contacts, error: contactsError } = await admin
    .from("automation_contacts")
    .select("id, email, status, current_step, next_run_at, processing_started_at, completed_at, last_error, state, updated_at")
    .eq("workflow_id", workflowId)
    .order("updated_at", { ascending: false })
    .limit(10);

  if (contactsError) {
    throw new Error(`Failed to load contacts for workflow ${workflowId}: ${contactsError.message}`);
  }

  const { data: logs, error: logsError } = await admin
    .from("automation_logs")
    .select("event_type, message, metadata, created_at, contact_id, step_index")
    .eq("workflow_id", workflowId)
    .order("created_at", { ascending: false })
    .limit(logLimit);

  if (logsError) {
    throw new Error(`Failed to load logs for workflow ${workflowId}: ${logsError.message}`);
  }

  return {
    workflow,
    contacts: (contacts || []).map((contact) => ({
      id: contact.id,
      email: contact.email,
      status: contact.status,
      current_step: contact.current_step,
      next_run_at: contact.next_run_at,
      processing_started_at: contact.processing_started_at,
      completed_at: contact.completed_at,
      updated_at: contact.updated_at,
      last_error: contact.last_error,
      state: summarizeState(contact.state),
    })),
    logs: logs || [],
  };
};

const inspectEmailConfigs = async (userId) => {
  const normalizedUserId = String(userId || "").trim();
  if (!normalizedUserId) return [];

  const { data, error } = await admin
    .from("email_configs")
    .select("id, smtp_username, sender_name, is_active, imap_host, imap_port, created_at")
    .eq("user_id", normalizedUserId)
    .order("created_at", { ascending: false });

  if (error) {
    return [{ error: error.message }];
  }

  return (data || []).map((row) => ({
    id: row.id,
    smtp_username: row.smtp_username,
    sender_name: row.sender_name,
    is_active: row.is_active,
    has_imap: Boolean(row.imap_host && row.imap_port),
    created_at: row.created_at,
  }));
};

const searchEmailConfigs = async (email) => {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedEmail) return [];

  const { data, error } = await admin
    .from("email_configs")
    .select("id, user_id, smtp_username, sender_name, is_active, imap_host, imap_port, created_at")
    .ilike("smtp_username", normalizedEmail)
    .order("created_at", { ascending: false });

  if (error) {
    return [{ error: error.message }];
  }

  return (data || []).map((row) => ({
    id: row.id,
    user_id: row.user_id,
    smtp_username: row.smtp_username,
    sender_name: row.sender_name,
    is_active: row.is_active,
    has_imap: Boolean(row.imap_host && row.imap_port),
    created_at: row.created_at,
  }));
};

const inspectAppSecrets = async () => {
  const { data, error } = await admin
    .from("app_secrets")
    .select("key, value")
    .in("key", ["service_role_key", "supabase_url"])
    .order("key", { ascending: true });

  if (error) {
    return {
      error: error.message,
      secrets: [],
    };
  }

  const secrets = (data || []).map((row) => ({
    key: row.key,
    state:
      row.key === "service_role_key"
        ? maskKeyState(row.value)
        : row.value
          ? "set"
          : "missing",
    length: row.value ? String(row.value).length : 0,
  }));

  return { secrets };
};

const inspectDueContacts = async () => {
  const nowIso = new Date().toISOString();
  const { data, error } = await admin
    .from("automation_contacts")
    .select("id, workflow_id, email, status, next_run_at, processing_started_at, current_step, last_error, state")
    .eq("status", "active")
    .not("next_run_at", "is", null)
    .lte("next_run_at", nowIso)
    .order("next_run_at", { ascending: true })
    .limit(10);

  if (error) {
    return {
      error: error.message,
      contacts: [],
    };
  }

  return {
    now: nowIso,
    contacts: (data || []).map((contact) => ({
      id: contact.id,
      workflow_id: contact.workflow_id,
      email: contact.email,
      status: contact.status,
      current_step: contact.current_step,
      next_run_at: contact.next_run_at,
      processing_started_at: contact.processing_started_at,
      last_error: contact.last_error,
      state: summarizeState(contact.state),
    })),
  };
};

const main = async () => {
  const output = {
    project: supabaseUrl,
    local_env: {
      supabase_url: Boolean(supabaseUrl),
      service_role_key: Boolean(serviceRoleKey),
    },
  };

  if (flags.has("--sync-secrets")) {
    output.secret_sync = await syncSecrets();
  }

  output.app_secrets = await inspectAppSecrets();
  output.cron = await inspectCron();
  output.due_contacts = await inspectDueContacts();

  const workflowId = await pickWorkflowId();
  output.workflow_id = workflowId || null;
  output.workflow = await inspectWorkflow(workflowId);
  output.email_configs = await inspectEmailConfigs(output.workflow?.workflow?.user_id);
  output.search_email = searchEmailArg || null;
  output.search_email_configs = await searchEmailConfigs(searchEmailArg);

  printSection("Automation Diagnosis", output);
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

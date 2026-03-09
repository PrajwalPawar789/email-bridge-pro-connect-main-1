import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from "url";

function loadEnv(filePath) {
  const values = {};
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    if (!line || line.trim().startsWith("#") || !line.includes("=")) continue;
    const index = line.indexOf("=");
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

function assertCheck(condition, message, details = {}) {
  return { pass: Boolean(condition), message, details };
}

function stringifyResult(result) {
  try {
    return JSON.stringify(result || {});
  } catch {
    return "";
  }
}

async function run() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const repoRoot = path.resolve(__dirname, "..");

  const env = loadEnv(path.join(repoRoot, ".env"));
  const supabaseUrl = String(env.SUPABASE_URL || "").trim();
  const serviceRoleKey = String(env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  const anonKey = String(env.SUPABASE_ANON_KEY || "").trim();

  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    throw new Error("Missing SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY/SUPABASE_ANON_KEY in .env");
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const app = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const email = `ai-builder-image-edit-revert+${Date.now()}@example.com`;
  const password = `AiBuilder!${Date.now()}Ab`;
  const imagePath = path.join(repoRoot, "public", "platform", "template creation.png");
  const imageBase64 = fs.readFileSync(imagePath).toString("base64");

  const checks = [];
  let userId = "";
  let threadId = "";

  try {
    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { source: "image-edit-revert-e2e" },
    });
    if (created.error || !created.data?.user?.id) {
      throw new Error(`createUser failed: ${created.error?.message || "unknown"}`);
    }
    userId = created.data.user.id;

    const signIn = await app.auth.signInWithPassword({ email, password });
    if (signIn.error) {
      throw new Error(`signIn failed: ${signIn.error.message}`);
    }

    const prompt1 = [
      "Create an email template based on the attached reference image.",
      "Include LOCALiQ + WordStream branding style, hero/visual area, body copy, CTA button, and footer.",
      "Footer must include exact address: 101 Huntington Ave, Boston, MA, 02199 US.",
    ].join(" ");
    const firstResp = await app.functions.invoke("ai-builder-generate", {
      body: {
        mode: "email",
        instruction: prompt1,
        images: [{ name: "reference.png", mimeType: "image/png", base64: imageBase64 }],
        postProcessMode: "strict",
        brief: {
          audience: "Marketers",
          tone: "Professional",
          goal: "Drive downloads",
          cta: "GET THE FREE TOOLKIT",
        },
      },
    });
    checks.push(
      assertCheck(!firstResp.error, "Step 1 succeeded (image clone request)", {
        error: firstResp.error?.message || null,
      })
    );

    const firstData = firstResp.data || {};
    threadId = String(firstData.threadId || "");
    const result1 = firstData.result || {};
    const result1Text = stringifyResult(result1);

    checks.push(assertCheck(Boolean(threadId), "Step 1 returned threadId", { threadId }));
    checks.push(
      assertCheck(
        /02199/.test(result1Text),
        "Step 1 output contains zip 02199 (baseline for edit/revert)",
        { contains02199: /02199/.test(result1Text) }
      )
    );

    const prompt2 = "change this 02199 to 02198";
    const secondResp = await app.functions.invoke("ai-builder-generate", {
      body: {
        mode: "email",
        threadId,
        instruction: prompt2,
        postProcessMode: "strict",
        current: { template: result1 },
        brief: {
          audience: "Marketers",
          tone: "Professional",
          goal: "Drive downloads",
        },
      },
    });
    checks.push(
      assertCheck(!secondResp.error, "Step 2 succeeded (zip edit request)", {
        error: secondResp.error?.message || null,
      })
    );
    const secondData = secondResp.data || {};
    const result2 = secondData.result || {};
    const result2Text = stringifyResult(result2);
    checks.push(
      assertCheck(String(secondData.threadId || "") === threadId, "Step 2 stayed on same thread", {
        expected: threadId,
        actual: secondData.threadId,
      })
    );
    checks.push(
      assertCheck(/02198/.test(result2Text), "Step 2 output contains zip 02198", {
        contains02198: /02198/.test(result2Text),
      })
    );

    const prompt3 = "go to prev version";
    const thirdResp = await app.functions.invoke("ai-builder-generate", {
      body: {
        mode: "email",
        threadId,
        instruction: prompt3,
        postProcessMode: "strict",
        current: { template: result2 },
        brief: {
          audience: "Marketers",
          tone: "Professional",
          goal: "Drive downloads",
        },
      },
    });
    checks.push(
      assertCheck(!thirdResp.error, "Step 3 succeeded (revert request)", {
        error: thirdResp.error?.message || null,
      })
    );
    const thirdData = thirdResp.data || {};
    const result3 = thirdData.result || {};
    const result3Text = stringifyResult(result3);
    checks.push(
      assertCheck(String(thirdData.threadId || "") === threadId, "Step 3 stayed on same thread", {
        expected: threadId,
        actual: thirdData.threadId,
      })
    );
    checks.push(
      assertCheck(/02199/.test(result3Text), "Step 3 restored previous zip 02199", {
        contains02199: /02199/.test(result3Text),
      })
    );
  } finally {
    if (userId) {
      await admin.auth.admin.deleteUser(userId);
    }
  }

  const failures = checks.filter((item) => !item.pass);
  const summary = {
    total: checks.length,
    passed: checks.length - failures.length,
    failed: failures.length,
    failures,
  };
  console.log(JSON.stringify(summary, null, 2));
  if (failures.length > 0) process.exit(1);
}

run().catch((error) => {
  console.error(JSON.stringify({ error: error?.message || String(error) }, null, 2));
  process.exit(1);
});

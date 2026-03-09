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

function getBlocks(result) {
  return Array.isArray(result?.blocks) ? result.blocks : [];
}

function getBlocksByType(result, type) {
  return getBlocks(result).filter((block) => String(block?.type || "").toLowerCase() === type);
}

function getFirstHeading(result) {
  const block = getBlocksByType(result, "heading")[0];
  return String(block?.content?.text || block?.content?.html || "");
}

function collectText(result) {
  return getBlocks(result)
    .map((block) => {
      const content = block?.content && typeof block.content === "object" ? block.content : {};
      return String(content.text || content.html || "");
    })
    .join("\n");
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

  const email = `ai-builder-deep-edits+${Date.now()}@example.com`;
  const password = `AiBuilder!${Date.now()}Ab`;

  const checks = [];
  let userId = "";
  let threadId = "";

  try {
    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { source: "deep-edits-e2e" },
    });
    if (created.error || !created.data?.user?.id) {
      throw new Error(`createUser failed: ${created.error?.message || "unknown"}`);
    }
    userId = created.data.user.id;

    const signIn = await app.auth.signInWithPassword({ email, password });
    if (signIn.error) {
      throw new Error(`signIn failed: ${signIn.error.message}`);
    }

    const firstResp = await app.functions.invoke("ai-builder-generate", {
      body: {
        mode: "email",
        provider: "claude",
        optimizeFor: "quality",
        instruction:
          "Create a formal presidential update email template for the United States with a heading, body copy, CTA button, and signature.",
        brief: {
          audience: "U.S. citizens",
          tone: "Professional",
          goal: "Deliver a formal national update",
          cta: "Read the full update",
        },
      },
    });

    checks.push(
      assertCheck(!firstResp.error, "Baseline generation succeeded", {
        error: firstResp.error?.message || null,
      })
    );

    const firstData = firstResp.data || {};
    const firstResult = firstData.result || {};
    threadId = String(firstData.threadId || "");
    const subject = String(firstResult?.subject || "");
    checks.push(assertCheck(Boolean(threadId), "Baseline request returned threadId", { threadId }));
    checks.push(
      assertCheck(getBlocks(firstResult).length >= 5, "Baseline result includes enough structure", {
        blockCount: getBlocks(firstResult).length,
      })
    );

    const secondResp = await app.functions.invoke("ai-builder-generate", {
      body: {
        mode: "email",
        threadId,
        provider: "claude",
        optimizeFor: "quality",
        instruction:
          'Make it shorter, change the heading to "National Briefing Update", remove the CTA button, and add a quote "We move forward together."',
        current: { template: firstResult },
        brief: {
          audience: "U.S. citizens",
          tone: "Professional",
          goal: "Deliver a formal national update",
        },
      },
    });

    checks.push(
      assertCheck(!secondResp.error, "Targeted edit follow-up succeeded", {
        error: secondResp.error?.message || null,
      })
    );

    const secondData = secondResp.data || {};
    const secondResult = secondData.result || {};
    const secondText = collectText(secondResult);
    const quoteBlocks = getBlocksByType(secondResult, "quote");
    checks.push(
      assertCheck(String(secondData.threadId || "") === threadId, "Targeted edit stayed on same thread", {
        expected: threadId,
        actual: secondData.threadId,
      })
    );
    checks.push(
      assertCheck(String(secondResult?.subject || "") === subject, "Targeted edit preserved subject", {
        before: subject,
        after: secondResult?.subject || "",
      })
    );
    checks.push(
      assertCheck(
        /National Briefing Update/i.test(getFirstHeading(secondResult)),
        "Targeted edit updated heading",
        { heading: getFirstHeading(secondResult) }
      )
    );
    checks.push(
      assertCheck(getBlocksByType(secondResult, "button").length === 0, "Targeted edit removed CTA button", {
        buttonCount: getBlocksByType(secondResult, "button").length,
      })
    );
    checks.push(
      assertCheck(
        quoteBlocks.length >= 1 && /move forward together/i.test(String(quoteBlocks[0]?.content?.text || "")),
        "Targeted edit added requested quote",
        { quoteText: quoteBlocks[0]?.content?.text || "" }
      )
    );
    checks.push(
      assertCheck(secondText.length < collectText(firstResult).length, "Targeted edit shortened the copy", {
        beforeLength: collectText(firstResult).length,
        afterLength: secondText.length,
      })
    );

    const thirdResp = await app.functions.invoke("ai-builder-generate", {
      body: {
        mode: "email",
        threadId,
        provider: "claude",
        optimizeFor: "quality",
        instruction: "Add a section about cabinet coordination and include social links.",
        current: { template: secondResult },
        brief: {
          audience: "U.S. citizens",
          tone: "Professional",
          goal: "Deliver a formal national update",
        },
      },
    });

    checks.push(
      assertCheck(!thirdResp.error, "Section-add follow-up succeeded", {
        error: thirdResp.error?.message || null,
      })
    );

    const thirdData = thirdResp.data || {};
    const thirdResult = thirdData.result || {};
    const thirdText = collectText(thirdResult).toLowerCase();
    checks.push(
      assertCheck(String(thirdData.threadId || "") === threadId, "Section-add follow-up stayed on same thread", {
        expected: threadId,
        actual: thirdData.threadId,
      })
    );
    checks.push(
      assertCheck(thirdText.includes("cabinet coordination"), "Section-add follow-up included requested topic", {
        textSample: thirdText.slice(0, 400),
      })
    );
    checks.push(
      assertCheck(getBlocksByType(thirdResult, "social").length >= 1, "Section-add follow-up included a social block", {
        socialCount: getBlocksByType(thirdResult, "social").length,
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

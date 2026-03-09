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

function collectText(result) {
  return getBlocks(result)
    .map((block) => {
      const content = block?.content && typeof block.content === "object" ? block.content : {};
      return String(content.text || content.html || "");
    })
    .join("\n")
    .toLowerCase();
}

function buildBaselineTemplate() {
  return {
    name: "Presidential Communication Template",
    subject: "A Message from the President of the United States",
    audience: "U.S. citizens and stakeholders",
    voice: "Professional",
    goal: "Deliver a formal presidential communication with authority and clarity",
    format: "html",
    blocks: [
      {
        id: "img-1",
        type: "image",
        content: {
          src: "",
          alt: "Seal of the President of the United States",
          width: "100%",
        },
        styles: { padding: "16px" },
      },
      {
        id: "heading-1",
        type: "heading",
        content: {
          text: "The White House — Washington, D.C.",
          html: "<b>The White House — Washington, D.C.</b>",
        },
        styles: { padding: "16px" },
      },
      {
        id: "divider-1",
        type: "divider",
        content: {
          style: "solid",
          thickness: 1,
        },
        styles: { padding: "10px 16px" },
      },
      {
        id: "text-1",
        type: "text",
        content: {
          text:
            "Dear Fellow Americans,\nI am writing to you today to address a matter of great importance to our nation. As your President, it is my responsibility to keep you informed about the actions we are taking to strengthen our economy, protect our national security, and ensure a brighter future for every American family.",
          html:
            "<p>Dear Fellow Americans,</p><p>I am writing to you today to address a matter of great importance to our nation. As your President, it is my responsibility to keep you informed about the actions we are taking to strengthen our economy, protect our national security, and ensure a brighter future for every American family.</p>",
        },
        styles: { padding: "16px" },
      },
      {
        id: "button-1",
        type: "button",
        content: {
          text: "Read the Full Address",
          url: "#",
          align: "left",
          bgColor: "#1a2e4a",
          textColor: "#ffffff",
        },
        styles: { padding: "16px" },
      },
      {
        id: "signature-1",
        type: "signature",
        content: {
          text: "With respect and determination,\nThe President of the United States",
          html: "With respect and determination,<br><b>The President of the United States</b>",
        },
        styles: { padding: "16px" },
      },
    ],
  };
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

  const email = `ai-builder-visual-edit+${Date.now()}@example.com`;
  const password = `AiBuilder!${Date.now()}Ab`;

  const checks = [];
  let userId = "";
  let threadId = "";

  try {
    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { source: "visual-edit-e2e" },
    });
    if (created.error || !created.data?.user?.id) {
      throw new Error(`createUser failed: ${created.error?.message || "unknown"}`);
    }
    userId = created.data.user.id;

    const signIn = await app.auth.signInWithPassword({ email, password });
    if (signIn.error) {
      throw new Error(`signIn failed: ${signIn.error.message}`);
    }

    const baselineTemplate = buildBaselineTemplate();
    const baselineText = collectText(baselineTemplate);
    checks.push(
      assertCheck(
        baselineText.includes("dear fellow americans") && baselineText.includes("the white house"),
        "Baseline template contains presidential content",
        { textSample: baselineText.slice(0, 260) }
      )
    );

    const secondResp = await app.functions.invoke("ai-builder-generate", {
      body: {
        mode: "email",
        provider: "claude",
        optimizeFor: "quality",
        instruction: "Add usa flag",
        current: { template: baselineTemplate },
        brief: {
          audience: "U.S. citizens and stakeholders",
          tone: "Professional",
          goal: "Deliver a formal presidential communication with authority and clarity",
        },
      },
    });

    checks.push(
      assertCheck(!secondResp.error, "Visual edit request succeeded", {
        error: secondResp.error?.message || null,
      })
    );

    const secondData = secondResp.data || {};
    const secondResult = secondData.result || {};
    threadId = String(secondData.threadId || "");
    const secondText = collectText(secondResult);
    const secondBlocks = getBlocks(secondResult);
    const imageBlocks = secondBlocks.filter((block) => String(block?.type || "").toLowerCase() === "image");
    const firstImage = imageBlocks[0]?.content || {};

    checks.push(
      assertCheck(Boolean(threadId), "Visual edit request created a thread", { threadId })
    );
    checks.push(
      assertCheck(
        String(secondResult?.subject || "") === String(baselineTemplate?.subject || ""),
        "Visual edit preserved the subject",
        {
          before: baselineTemplate?.subject || "",
          after: secondResult?.subject || "",
        }
      )
    );
    checks.push(
      assertCheck(
        secondText.includes("dear fellow americans") || secondText.includes("the white house"),
        "Visual edit preserved the existing presidential content",
        { textSample: secondText.slice(0, 260) }
      )
    );
    checks.push(
      assertCheck(imageBlocks.length >= 1, "Visual edit includes an image block for the requested flag", {
        imageBlocks: imageBlocks.length,
      })
    );
    checks.push(
      assertCheck(
        /flag/i.test(String(firstImage.alt || "")) &&
          /(flagcdn\.com\/us|placehold\.co)/i.test(String(firstImage.src || "")),
        "Visual edit updated the image block to a flag visual",
        {
          alt: firstImage.alt || "",
          src: firstImage.src || "",
        }
      )
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

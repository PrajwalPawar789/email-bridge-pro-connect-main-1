import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import process from "process";

const rootDir = process.cwd();
const npmExecutable = process.platform === "win32" ? "npm.cmd" : "npm";

const suites = {
  core: {
    label: "Core pre-push checks",
    description: "Fast checks for local confidence before pushing code.",
    checks: [
      { script: "lint", label: "Lint" },
      { script: "test", label: "Server tests" },
      { script: "build", label: "Production build" },
      { script: "smoke:plan:all", label: "Plan smoke suite" },
    ],
    prerequisites: [],
  },
  release: {
    label: "Release verification",
    description: "Core checks plus live integration coverage for launch readiness.",
    checks: [
      { script: "verify", label: "Core pre-push checks" },
      { script: "find:test:e2e:all", label: "Find E2E local + live" },
      { script: "automation:test:nodes", label: "Automation live suite" },
      { script: "campaign:test:pipeline:routing", label: "Campaign-to-pipeline routing" },
      { script: "pipeline:test:reply-bounce", label: "Pipeline reply / bounce routing" },
    ],
    prerequisites: [".env", ".env.16shards"],
  },
  ai_builder: {
    label: "AI builder verification",
    description: "Local AI builder regression suite against the dev proxy.",
    checks: [
      { script: "ai-builder:test:all", label: "AI builder regression suite" },
    ],
    prerequisites: [".env"],
    localUrls: ["http://localhost:8080"],
  },
  full: {
    label: "Full platform verification",
    description: "Release verification plus AI builder regression checks.",
    checks: [
      { script: "verify:release", label: "Release verification" },
      { script: "verify:ai-builder", label: "AI builder verification" },
    ],
    prerequisites: [".env", ".env.16shards"],
    localUrls: ["http://localhost:8080"],
  },
};

function formatDuration(ms) {
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

function parseArgs(argv) {
  const positional = argv.filter((arg) => !arg.startsWith("--"));
  return {
    suiteName: positional[0] || "core",
    dryRun: argv.includes("--dry-run"),
    list: argv.includes("--list"),
    continueOnError: argv.includes("--continue-on-error"),
  };
}

function printSuites() {
  console.log("Available verification suites:\n");
  for (const [suiteName, suite] of Object.entries(suites)) {
    console.log(`${suiteName}: ${suite.label}`);
    console.log(`  ${suite.description}`);
    console.log(`  Checks: ${suite.checks.map((check) => check.script).join(", ")}`);
    if (suite.prerequisites?.length) {
      console.log(`  Required files: ${suite.prerequisites.join(", ")}`);
    }
    if (suite.localUrls?.length) {
      console.log(`  Required local services: ${suite.localUrls.join(", ")}`);
    }
    console.log("");
  }
}

async function validateSuiteEnvironment(suite) {
  const warnings = [];

  for (const file of suite.prerequisites || []) {
    const absolutePath = path.join(rootDir, file);
    if (!fs.existsSync(absolutePath)) {
      warnings.push(`Missing required file: ${file}`);
    }
  }

  for (const url of suite.localUrls || []) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 1500);
      const response = await fetch(url, { method: "GET", signal: controller.signal });
      clearTimeout(timeout);
      if (!response.ok) {
        warnings.push(`Local service responded with ${response.status}: ${url}`);
      }
    } catch {
      warnings.push(`Local service not reachable: ${url}`);
    }
  }

  return warnings;
}

function runScript(scriptName) {
  return new Promise((resolve, reject) => {
    const child =
      process.platform === "win32"
        ? spawn("cmd.exe", ["/d", "/s", "/c", `${npmExecutable} run ${scriptName}`], {
            cwd: rootDir,
            stdio: "inherit",
            shell: false,
            env: process.env,
          })
        : spawn(npmExecutable, ["run", scriptName], {
            cwd: rootDir,
            stdio: "inherit",
            shell: false,
            env: process.env,
          });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`Script "${scriptName}" failed with exit code ${code}.`));
    });
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.list) {
    printSuites();
    return;
  }

  const suite = suites[args.suiteName];
  if (!suite) {
    console.error(`Unknown suite "${args.suiteName}". Use --list to see available suites.`);
    process.exitCode = 1;
    return;
  }

  console.log(`\nVerification suite: ${suite.label}`);
  console.log(`${suite.description}\n`);

  const warnings = await validateSuiteEnvironment(suite);
  if (warnings.length) {
    console.log("Preflight warnings:");
    warnings.forEach((warning) => console.log(`- ${warning}`));
    console.log("");
  }

  if (args.dryRun) {
    console.log("Dry run only. Planned checks:\n");
    suite.checks.forEach((check, index) => {
      console.log(`${index + 1}. ${check.label} -> npm run ${check.script}`);
    });
    console.log("");
    return;
  }

  const results = [];
  const suiteStartedAt = Date.now();

  for (const check of suite.checks) {
    const startedAt = Date.now();
    console.log(`\n[${results.length + 1}/${suite.checks.length}] ${check.label}`);
    console.log(`Running: npm run ${check.script}\n`);

    try {
      await runScript(check.script);
      results.push({
        ...check,
        status: "passed",
        durationMs: Date.now() - startedAt,
      });
    } catch (error) {
      results.push({
        ...check,
        status: "failed",
        durationMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
      });

      if (!args.continueOnError) {
        break;
      }
    }
  }

  const passedCount = results.filter((result) => result.status === "passed").length;
  const failed = results.find((result) => result.status === "failed");

  console.log("\nVerification summary:\n");
  results.forEach((result) => {
    const marker = result.status === "passed" ? "PASS" : "FAIL";
    console.log(`- ${marker} ${result.label} (${formatDuration(result.durationMs)})`);
    if (result.error) {
      console.log(`  ${result.error}`);
    }
  });

  console.log(`\nCompleted ${passedCount}/${suite.checks.length} checks in ${formatDuration(Date.now() - suiteStartedAt)}.`);

  if (failed) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

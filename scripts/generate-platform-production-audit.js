import fs from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";

const projectRoot = process.cwd();
const generatedAt = new Date().toISOString();
const docsDir = path.resolve(projectRoot, "docs");
const markdownPath = path.join(docsDir, "platform-production-audit.md");
const workbookPath = path.join(docsDir, "platform-production-audit.xlsx");
const appPath = path.resolve(projectRoot, "src/App.tsx");
const pagesDir = path.resolve(projectRoot, "src/pages");

const warnings = [];

const blockerRows = [
  {
    area: "Billing and checkout",
    severity: "Critical",
    affects: "/subscription, /billing, /spending",
    why_it_matters:
      "The current billing layer stores manual payment-method details like brand and last4, but there is no clear provider-tokenized checkout path for production monetization.",
    suggested_next_step:
      "Integrate a real billing provider, move payment capture off the client, add subscription lifecycle webhooks, and retest upgrade, downgrade, retry, and failure paths.",
  },
  {
    area: "Legacy dashboard route",
    severity: "High",
    affects: "/dashboard",
    why_it_matters:
      "The dashboard still contains internal coming-soon tabs for Automations and Connect Site even though dedicated routes exist, which makes the product state look inconsistent at launch.",
    suggested_next_step:
      "Decide whether /dashboard remains an analytics home or is simplified, then remove placeholder tabs and align navigation with the real product structure.",
  },
  {
    area: "Find deep-search performance",
    severity: "High",
    affects: "/find",
    why_it_matters:
      "Deep broad-text searches were timing out before the latest fixes. The route is healthier now, but later pages are still slower than a production-grade search experience.",
    suggested_next_step:
      "Prioritize deep-search performance work, especially shard paging strategy and keyset-style pagination, then keep a deeper Find regression check in the release checklist.",
  },
  {
    area: "Pipeline placeholder tabs",
    severity: "High",
    affects: "/pipeline",
    why_it_matters:
      "Notes and inbox activity areas in the opportunity details panel are still visible placeholders, which leaves gaps in a core sales workflow.",
    suggested_next_step:
      "Either finish those integrations before launch or hide the tabs until the backing functionality is real.",
  },
  {
    area: "Automations execution hardening",
    severity: "High",
    affects: "/automations",
    why_it_matters:
      "The workflow designer is substantial and data-backed, but production-grade automation still needs stronger execution QA, webhook security review, and operational monitoring.",
    suggested_next_step:
      "Run dedicated launch QA on create, publish, duplicate, pause, resume, webhook, and approval flows; verify auditability and failure recovery end to end.",
  },
  {
    area: "Public publishing surfaces",
    severity: "High",
    affects: "/, /pages/:slug, /landing-pages, /site-connector",
    why_it_matters:
      "Marketing, published landing pages, and domain routing are customer-facing surfaces. They need release-grade checks for caching, DNS, SSL, SEO metadata, and form abuse protection.",
    suggested_next_step:
      "Create a public-surface launch checklist and validate staging plus production-host behavior before go-to-market.",
  },
  {
    area: "Route hygiene and GTM scope clarity",
    severity: "Medium",
    affects: "Internal and legacy pages",
    why_it_matters:
      "Non-routed or embedded pages such as Integrations, About, Security, and Index can confuse ownership and product scope if they remain unmanaged.",
    suggested_next_step:
      "Explicitly mark these as internal or out of GTM scope, wire them intentionally, or remove them from the active launch surface.",
  },
];
const routedSurfaceConfigs = {
  "/": {
    group: "Public entry",
    page: "Root page and marketing entry",
    audience: "Public",
    status: "Need Review",
    gtm_priority: "High",
    implementationFiles: ["src/pages/RootPage.tsx", "src/pages/LandingPage.tsx"],
    done:
      "Marketing landing page exists. Root entry also resolves custom domains and published landing pages when the host should use domain resolution.",
    pending_not_done:
      "Public-surface launch checklist is still needed for caching, analytics, SEO, and abuse protection.",
    needs_review:
      "Custom-domain fallback behavior, public form security, and metadata behavior need staging and production QA.",
    evidence:
      "RootPage resolves domains before falling back to LandingPage, and LandingPage is the active public marketing surface.",
  },
  "/pages/:slug": {
    group: "Public publishing",
    page: "Published landing page",
    audience: "Public",
    status: "Need Review",
    gtm_priority: "High",
    implementationFiles: ["src/pages/PublishedLandingPage.tsx"],
    done:
      "Published page loader, renderer, and metadata application exist and are wired to landing-page persistence.",
    pending_not_done:
      "Launch-grade checks for slug publishing lifecycle, cache invalidation, and public lead-capture handling are still needed.",
    needs_review:
      "Public rendering, analytics, and form submission integrity should be validated against real publish flows.",
    evidence:
      "PublishedLandingPage loads persisted page data by slug and renders public content with metadata.",
  },
  "/auth": {
    group: "Auth",
    page: "Authentication",
    audience: "Workspace user",
    status: "Need Review",
    gtm_priority: "High",
    implementationFiles: ["src/pages/Auth.tsx"],
    done:
      "Login, signup, forgot-password, password setup, invite, and referral-claim flows are implemented against Supabase auth.",
    pending_not_done:
      "No clear page-level evidence of SSO, enterprise auth, or a launch-grade rate-limit and fraud review.",
    needs_review:
      "Production auth needs explicit QA for invite, recovery, redirect, and referral edge cases plus monitoring.",
    evidence:
      "Auth.tsx handles login, signup, forgot, password-setup, invite, and referral persistence and recovery flows.",
  },
  "/auth/confirm": {
    group: "Auth",
    page: "Auth confirmation",
    audience: "Workspace user",
    status: "Done",
    gtm_priority: "Medium",
    implementationFiles: ["src/pages/AuthConfirm.tsx"],
    done:
      "OTP verification and callback handling exist for signup, invite, magic link, recovery, and email-change flows.",
    pending_not_done:
      "No material functional blocker was found in the page code.",
    needs_review:
      "Normal release QA is still needed for callback links and error copy.",
    evidence:
      "AuthConfirm supports multiple OTP types and clears auth hash or callback state after verification.",
  },
  "/onboarding": {
    group: "Onboarding",
    page: "Onboarding",
    audience: "Workspace user",
    status: "Done",
    gtm_priority: "Medium",
    implementationFiles: ["src/pages/Onboarding.tsx"],
    done:
      "Multi-step onboarding questionnaire exists and persists onboarding state and profile data.",
    pending_not_done:
      "No obvious unfinished placeholder surfaced in the page implementation.",
    needs_review:
      "Review skip, resume, and partial-completion behavior during launch QA.",
    evidence:
      "Onboarding loads and upserts onboarding profile and status through dedicated helpers.",
  },
  "/dashboard": {
    group: "Workspace shell",
    page: "Dashboard",
    audience: "Workspace user",
    status: "Not Done",
    gtm_priority: "High",
    implementationFiles: ["src/pages/Dashboard.tsx"],
    done:
      "Analytics, builder, templates, mailbox, config, contacts, integrations, and segments tabs render inside the legacy shell.",
    pending_not_done:
      "Automations and Connect Site still render as explicit coming-soon tabs inside the dashboard route.",
    needs_review:
      "The product shell should be simplified or aligned with the dedicated routes before launch.",
    evidence:
      "Dashboard.tsx defines visible feature-coming-soon tabs for Automations and Connect Site.",
  },
  "/profile": {
    group: "Workspace",
    page: "Profile",
    audience: "Workspace user",
    status: "Done",
    gtm_priority: "Medium",
    implementationFiles: ["src/pages/Profile.tsx"],
    done:
      "Profile, account, and billing snapshot surfaces are implemented and wired to auth, workspace, and billing helpers.",
    pending_not_done:
      "No visible unfinished placeholder was found in the page file.",
    needs_review:
      "Launch QA should validate profile save behavior and workspace context switching.",
    evidence:
      "Profile pulls billing snapshot, workspace context, and editable profile state from live helpers.",
  },
  "/campaigns": {
    group: "Campaigns",
    page: "Campaign management",
    audience: "Workspace user",
    status: "Need Review",
    gtm_priority: "High",
    implementationFiles: [
      "src/pages/Campaigns.tsx",
      "src/components/CampaignList.tsx",
      "src/components/CampaignBuilder.tsx",
    ],
    done:
      "Campaign listing and campaign builder exist, with email-config loading and navigation into the tracker.",
    pending_not_done:
      "Production send-safety, validation, and lifecycle QA still need an explicit launch checklist.",
    needs_review:
      "This is a core GTM surface and should be release-tested for creation, editing, audience selection, and send orchestration.",
    evidence:
      "Campaigns loads email configs and composes CampaignList plus CampaignBuilder for campaign creation and management.",
  },
  "/campaign/:id": {
    group: "Campaigns",
    page: "Campaign tracker",
    audience: "Workspace user",
    status: "Need Review",
    gtm_priority: "High",
    implementationFiles: ["src/pages/CampaignTracker.tsx"],
    done:
      "Large analytics and recipient-tracking surface exists with charts, filters, timeline views, and pipeline integration.",
    pending_not_done:
      "No obvious route-level blocker was found, but the page is large and operationally heavy.",
    needs_review:
      "Data accuracy, performance, and recipient-state correctness need deep QA before launch.",
    evidence:
      "CampaignTracker is a substantial analytics page with charts, pagination, filters, exports, and pipeline actions.",
  },
  "/inbox": {
    group: "Inbox",
    page: "Inbox",
    audience: "Workspace user",
    status: "Need Review",
    gtm_priority: "High",
    implementationFiles: ["src/pages/Inbox.tsx", "src/components/inbox/InboxPage.tsx"],
    done:
      "Inbox route is implemented with mailbox views, message actions, pipeline hooks, composer flows, and search or filter UI.",
    pending_not_done:
      "No explicit unfinished placeholder was found in the route wrapper, but this is still an operationally risky area.",
    needs_review:
      "Mailbox sync reliability, reply handling, attachment cases, and side effects on pipeline or campaign state need production QA.",
    evidence:
      "Inbox routes into the dedicated InboxPage component and uses live auth plus mailbox interactions.",
  },
  "/automations": {
    group: "Automations",
    page: "Automation workflows",
    audience: "Workspace user",
    status: "Need Review",
    gtm_priority: "High",
    implementationFiles: [
      "src/pages/Automations.tsx",
      "src/new_automation_workflow_design/AutomationDesignPage.tsx",
    ],
    analysisFiles: ["src/workflow/services/mockData.ts"],
    done:
      "Workflow list, templates, activity, builder, save, duplicate, delete, publish, pause, and approval-request flows are present.",
    pending_not_done:
      "High-risk production automation behavior still needs explicit execution, webhook, and recovery validation.",
    needs_review:
      "Review runtime monitoring, dependency validation, webhook security, and launch rollback paths before GTM.",
    evidence:
      "AutomationDesignPage uses live automation helpers, while a mock workflow data module still exists in the workflow layer and reinforces the need for scope clarity.",
  },
  "/pipeline": {
    group: "Pipeline",
    page: "Pipeline",
    audience: "Workspace user",
    status: "Need Review",
    gtm_priority: "High",
    implementationFiles: [
      "src/pages/Pipeline.tsx",
      "src/components/pipeline/PipelineDetailsPanel.tsx",
    ],
    done:
      "Board, list, analytics, filters, commands, details panel, and mutations are implemented with query-client integration.",
    pending_not_done:
      "Two user-facing tabs in the details panel are still placeholders: notes and inbox activity.",
    needs_review:
      "Either finish those integrations or hide them for launch; also validate board performance and mutation consistency.",
    evidence:
      "PipelineDetailsPanel still renders visible notes and inbox activity placeholder copy.",
  },
  "/find": {
    group: "Data",
    page: "Find",
    audience: "Workspace user",
    status: "Need Review",
    gtm_priority: "High",
    implementationFiles: ["src/pages/Find.tsx"],
    done:
      "Shared-catalog search, filters, pagination, detail drill-down, list import, and shard-aware status handling are implemented.",
    pending_not_done:
      "Broad-query totals remain approximate and deep pages are still slower than a launch-grade search experience should be.",
    needs_review:
      "Recent fixes improved stability, but deep-page performance still needs hardening before go-to-market.",
    evidence:
      "Find is a large React Query-driven search surface with filters, imports, and deep pagination state.",
  },
  "/email-builder": {
    group: "Content creation",
    page: "Email builder",
    audience: "Workspace user",
    status: "Need Review",
    gtm_priority: "High",
    implementationFiles: ["src/pages/EmailBuilder.tsx", "src/pages/EmailBuilderPage.tsx"],
    done:
      "Email template editor, block canvas, settings panel, AI thread panel, preview panel, and persistence helpers are implemented.",
    pending_not_done:
      "No obvious route-level blocker was found, but rendering correctness and persistence integrity are critical for launch.",
    needs_review:
      "Run release QA on import, export, responsive rendering, template persistence, and model-assisted edits.",
    evidence:
      "EmailBuilderPage wires builder state, AI panels, canvas, settings, preview, and persisted template data.",
  },
  "/landing-pages": {
    group: "Content creation",
    page: "Landing page builder",
    audience: "Workspace user",
    status: "Need Review",
    gtm_priority: "High",
    implementationFiles: ["src/pages/LandingPages.tsx", "src/pages/LandingPagesPage.tsx"],
    analysisFiles: ["src/components/landing-pages/LandingPageLeadForm.tsx"],
    done:
      "Landing-page builder, blocks, styling, publish data, forms, templates, and list linkage are implemented.",
    pending_not_done:
      "Public publishing lifecycle, editor QA, and lead-capture abuse controls still need explicit launch review.",
    needs_review:
      "This is a public content surface and should be validated across editor, publish, preview, and form-submission flows.",
    evidence:
      "LandingPagesPage is a large builder and editor with publishing fields, forms, templates, and page settings.",
  },
  "/site-connector": {
    group: "Content distribution",
    page: "Site connector",
    audience: "Workspace user",
    status: "Need Review",
    gtm_priority: "High",
    implementationFiles: ["src/pages/SiteConnector.tsx", "src/pages/SiteConnectorPage.tsx"],
    done:
      "Domain add, remove, verify, page linking, DNS instructions, and store-backed persistence are implemented.",
    pending_not_done:
      "Public DNS and SSL flows need real-world validation before launch.",
    needs_review:
      "Validate domain verification, SSL propagation, same-origin resolution, and rollback behavior under production hosts.",
    evidence:
      "SiteConnectorPage manages domain linking and verification flows for landing pages and custom domains.",
  },
  "/team": {
    group: "Workspace admin",
    page: "Team management",
    audience: "Workspace admin",
    status: "Need Review",
    gtm_priority: "High",
    implementationFiles: ["src/pages/Team.tsx"],
    done:
      "Members, approvals, audit history, spending views, allocation controls, and invitation or update flows are implemented.",
    pending_not_done:
      "No obvious unfinished placeholder surfaced in the page itself.",
    needs_review:
      "Permission boundaries, approval rules, and billing or admin side effects need role-based UAT before launch.",
    evidence:
      "Team is backed by workspace dashboard, approvals, spending, and member-management helpers.",
  },
  "/referrals": {
    group: "Growth",
    page: "Referrals",
    audience: "Workspace user",
    status: "Need Review",
    gtm_priority: "Medium",
    implementationFiles: ["src/pages/Referrals.tsx"],
    done:
      "Referral dashboard, registration flow, referral-link generation, and event history are implemented.",
    pending_not_done:
      "No page-level launch blocker is obvious, but referral abuse controls are not clear from the page layer.",
    needs_review:
      "Review fraud prevention, referral attribution integrity, and support workflows before launch.",
    evidence:
      "Referrals uses live referral dashboard and registration helpers.",
  },
  "/subscription": {
    group: "Monetization",
    page: "Subscription",
    audience: "Workspace admin",
    status: "Not Done",
    gtm_priority: "Critical",
    implementationFiles: ["src/pages/Subscription.tsx"],
    analysisFiles: ["src/lib/billing.ts"],
    done:
      "Plan selection UI, plan details, payment-method selection, and enterprise contact capture exist.",
    pending_not_done:
      "Subscription checkout is still tied to a billing layer that does not clearly implement provider-tokenized payment capture.",
    needs_review:
      "Before GTM, validate plan changes, proration, provisioning, cancellation, retry, and failure recovery with a real provider.",
    evidence:
      "Subscription depends on billing helpers, while createPaymentMethod in src/lib/billing.ts defaults provider storage to manual.",
  },
  "/billing": {
    group: "Monetization",
    page: "Billing",
    audience: "Workspace admin",
    status: "Not Done",
    gtm_priority: "Critical",
    implementationFiles: ["src/pages/Billing.tsx"],
    analysisFiles: ["src/lib/billing.ts"],
    done:
      "Billing snapshot, invoices, transactions, and payment-method CRUD are implemented.",
    pending_not_done:
      "Payment methods are created from brand, last4, and expiry inputs rather than a provider-tokenized checkout flow.",
    needs_review:
      "Real billing integration, PCI-safe capture, webhook reconciliation, and subscription accounting are required before GTM.",
    evidence:
      "Billing.tsx asks for manual card details, and createPaymentMethod in src/lib/billing.ts stores the provider as manual by default.",
  },
  "/spending": {
    group: "Monetization",
    page: "Spending",
    audience: "Workspace admin",
    status: "Need Review",
    gtm_priority: "High",
    implementationFiles: ["src/pages/Spending.tsx"],
    analysisFiles: ["src/lib/billing.ts"],
    done:
      "Workspace spending rollup, billing transactions, ledger views, and pagination are implemented.",
    pending_not_done:
      "The page depends on the broader billing and team data model being accurate and production-ready.",
    needs_review:
      "Validate finance and admin permissions and reconcile spending numbers against real billing events before launch.",
    evidence:
      "Spending combines billing snapshot, transaction history, ledger data, and workspace rollups.",
  },
  "*": {
    group: "System",
    page: "Not found and custom-domain fallback",
    audience: "Public and workspace user",
    status: "Done",
    gtm_priority: "Low",
    implementationFiles: ["src/pages/NotFound.tsx"],
    done:
      "404 handling exists and also attempts custom-domain published-page resolution when the host should be treated as a site domain.",
    pending_not_done:
      "No major unfinished user-facing blocker surfaced in the page.",
    needs_review:
      "Replace console-only error reporting with monitored logging in production.",
    evidence:
      "NotFound tries custom-domain resolution and currently logs 404 access through console.error.",
  },
};
const supplementalSurfaceConfigs = [
  {
    surface_type: "Internal / Embedded",
    group: "Internal",
    route: "dashboard tab only",
    page: "Integrations",
    audience: "Workspace admin",
    status: "Need Review",
    gtm_priority: "Medium",
    implementationFiles: ["src/pages/Integrations.tsx"],
    done:
      "CRM integration management exists for providers such as HubSpot and Salesforce, including mapping and sync hooks.",
    pending_not_done:
      "This page is not a first-class route in App.tsx and currently appears as a dashboard-embedded surface.",
    needs_review:
      "Decide whether integrations are a real launch surface or an internal admin feature before GTM.",
    evidence:
      "Integrations is imported into dashboard tab contents but is not directly routed in App.tsx.",
  },
  {
    surface_type: "Legacy / Unused",
    group: "Legacy marketing",
    route: "not routed",
    page: "About",
    audience: "Public",
    status: "Out of Scope",
    gtm_priority: "Low",
    implementationFiles: ["src/pages/About.tsx"],
    done: "Static marketing content exists.",
    pending_not_done: "The page is not routed in the current app shell.",
    needs_review:
      "Either route it intentionally or remove it from the active GTM scope to keep ownership clear.",
    evidence:
      "About.tsx exists under src/pages but is not referenced in App.tsx.",
  },
  {
    surface_type: "Legacy / Unused",
    group: "Legacy marketing",
    route: "not routed",
    page: "Security",
    audience: "Public",
    status: "Out of Scope",
    gtm_priority: "Low",
    implementationFiles: ["src/pages/Security.tsx"],
    done: "Static security-marketing content exists.",
    pending_not_done: "The page is not routed in the current app shell.",
    needs_review:
      "If kept for GTM later, the claims need legal and security review before publication.",
    evidence:
      "Security.tsx exists under src/pages but is not referenced in App.tsx.",
  },
  {
    surface_type: "Legacy / Unused",
    group: "Legacy marketing",
    route: "not routed",
    page: "Index landing page",
    audience: "Public",
    status: "Out of Scope",
    gtm_priority: "Low",
    implementationFiles: ["src/pages/Index.tsx"],
    done: "A simpler historical landing page exists.",
    pending_not_done:
      "It is not the active routed root entry and appears to be superseded by RootPage and LandingPage.",
    needs_review:
      "Remove or archive it to avoid confusion about the canonical marketing entry.",
    evidence:
      "Index.tsx exists under src/pages but App.tsx routes '/' to RootPage instead.",
  },
];

function toPosix(value) {
  return value.split(path.sep).join("/");
}

function relativeToRoot(value) {
  const absolutePath = path.isAbsolute(value) ? value : path.resolve(projectRoot, value);
  return toPosix(path.relative(projectRoot, absolutePath));
}

function ensureArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function readUtf8(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function resolveImportSpecifier(fromFile, specifier) {
  if (!specifier.startsWith(".")) return null;

  const base = path.resolve(path.dirname(fromFile), specifier);
  const candidates = [
    base,
    `${base}.tsx`,
    `${base}.ts`,
    `${base}.jsx`,
    `${base}.js`,
    path.join(base, "index.tsx"),
    path.join(base, "index.ts"),
    path.join(base, "index.jsx"),
    path.join(base, "index.js"),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return relativeToRoot(candidate);
    }
  }

  return null;
}

function parseAppRoutes() {
  const appText = readUtf8(appPath);
  const importMap = new Map();
  const importPattern = /^import\s+([A-Za-z0-9_]+)\s+from\s+"([^"]+)";$/gm;

  let importMatch;
  while ((importMatch = importPattern.exec(appText))) {
    const [, importName, specifier] = importMatch;
    const resolved = resolveImportSpecifier(appPath, specifier);
    if (resolved) {
      importMap.set(importName, resolved);
    }
  }

  const routes = [];
  const routePattern = /<Route\s+path="([^"]+)"\s+element={<([A-Za-z0-9_]+)\s*\/>}\s*\/>/g;
  let routeMatch;

  while ((routeMatch = routePattern.exec(appText))) {
    const [, routePath, componentName] = routeMatch;
    routes.push({
      path: routePath,
      component: componentName,
      route_file: importMap.get(componentName) || "",
    });
  }

  return routes;
}

function countMatches(text, pattern) {
  const matches = text.match(pattern);
  return matches ? matches.length : 0;
}

function collectSignals(filePaths) {
  const normalizedFiles = unique(filePaths.map(relativeToRoot));
  const metrics = {
    analysis_file_count: 0,
    lines_of_code: 0,
    todo_markers: 0,
    coming_soon_markers: 0,
    placeholder_markers: 0,
    console_error_calls: 0,
    console_warn_calls: 0,
    mock_signals: 0,
  };

  for (const file of normalizedFiles) {
    const absolutePath = path.resolve(projectRoot, file);
    if (!fs.existsSync(absolutePath)) {
      warnings.push(`Missing analysis file: ${file}`);
      continue;
    }

    const text = readUtf8(absolutePath);
    metrics.analysis_file_count += 1;
    metrics.lines_of_code += text.split(/\r?\n/).length;
    metrics.todo_markers += countMatches(text, /\b(?:TODO|FIXME|HACK)\b/g);
    metrics.coming_soon_markers += countMatches(text, /coming soon/gi);
    metrics.placeholder_markers += countMatches(text, /integration placeholder/gi);
    metrics.console_error_calls += countMatches(text, /console\.error/g);
    metrics.console_warn_calls += countMatches(text, /console\.warn/g);
    metrics.mock_signals += countMatches(
      text,
      /\bmock(?:Data|Workflow|Runtime|Graph|Service|Event|Events)\b/g,
    );
  }

  return metrics;
}

function buildSignalSummary(metrics) {
  const riskBits = [];

  if (metrics.coming_soon_markers > 0) {
    riskBits.push(`${metrics.coming_soon_markers} coming-soon marker(s)`);
  }
  if (metrics.placeholder_markers > 0) {
    riskBits.push(`${metrics.placeholder_markers} placeholder marker(s)`);
  }
  if (metrics.todo_markers > 0) {
    riskBits.push(`${metrics.todo_markers} TODO/FIXME/HACK marker(s)`);
  }
  if (metrics.console_error_calls > 0) {
    riskBits.push(`${metrics.console_error_calls} console.error call(s)`);
  }
  if (metrics.console_warn_calls > 0) {
    riskBits.push(`${metrics.console_warn_calls} console.warn call(s)`);
  }
  if (metrics.mock_signals > 0) {
    riskBits.push(`${metrics.mock_signals} mock signal(s)`);
  }

  const base = `${metrics.analysis_file_count} file(s), ${metrics.lines_of_code} LOC`;
  if (riskBits.length === 0) {
    return `${base}, no explicit unfinished-code markers found`;
  }
  return `${base}, ${riskBits.join(", ")}`;
}

function firstSentence(value) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  const match = text.match(/^.*?[.!?](?:\s|$)/);
  return (match ? match[0] : text).trim();
}

function gateFromStatus(status) {
  if (status === "Done") return "Launch QA";
  if (status === "Need Review") return "Conditional";
  if (status === "Not Done") return "Blocker";
  if (status === "Out of Scope") return "Exclude";
  return "Review";
}

function buildFallbackRouteConfig(routeRecord) {
  return {
    group: "Unmapped route",
    page: routeRecord.component,
    audience: "Unknown",
    status: "Need Review",
    gtm_priority: "Medium",
    implementationFiles: routeRecord.route_file ? [routeRecord.route_file] : [],
    done: `Route exists and renders ${routeRecord.component}.`,
    pending_not_done:
      "No page-specific production audit has been authored yet for this discovered route.",
    needs_review:
      "Review this route manually before go-to-market and replace the fallback audit row with a real assessment.",
    evidence: `Discovered automatically in src/App.tsx as ${routeRecord.path} -> ${routeRecord.component}.`,
  };
}

function buildSurfaceRow(config, routeRecord = null) {
  const implementationFiles = unique(
    [...ensureArray(config.implementationFiles), routeRecord?.route_file]
      .filter(Boolean)
      .map(relativeToRoot),
  );
  const analysisFiles = unique(
    [...implementationFiles, ...ensureArray(config.analysisFiles).map(relativeToRoot)],
  );
  const signalMetrics = collectSignals(analysisFiles);
  const pageFiles = implementationFiles.filter((file) => file.startsWith("src/pages/"));

  return {
    surface_type: config.surface_type || "Routed",
    group: config.group,
    route: config.route || routeRecord?.path || "",
    route_component: routeRecord?.component || "",
    route_file: routeRecord?.route_file || "",
    page: config.page,
    implementation: implementationFiles.join(" -> "),
    implementation_files: implementationFiles.join(", "),
    analysis_files: analysisFiles.join(", "),
    page_files: pageFiles.join(", "),
    audience: config.audience,
    status: config.status,
    release_gate: gateFromStatus(config.status),
    gtm_priority: config.gtm_priority,
    done: config.done,
    pending_not_done: config.pending_not_done,
    needs_review: config.needs_review,
    next_action: firstSentence(
      config.status === "Not Done"
        ? config.pending_not_done || config.needs_review
        : config.needs_review || config.pending_not_done,
    ),
    evidence: config.evidence,
    signal_summary: buildSignalSummary(signalMetrics),
    ...signalMetrics,
  };
}

function buildSheet(rows, headers) {
  const sheetRows = [headers, ...rows];
  const sheet = XLSX.utils.aoa_to_sheet(sheetRows);
  sheet["!autofilter"] = {
    ref: XLSX.utils.encode_range({
      s: { c: 0, r: 0 },
      e: { c: headers.length - 1, r: sheetRows.length - 1 },
    }),
  };
  sheet["!freeze"] = { xSplit: 0, ySplit: 1 };
  return sheet;
}

function escapeMarkdownCell(value) {
  return String(value ?? "")
    .replace(/\|/g, "\\|")
    .replace(/\r?\n/g, "<br />");
}

const appRoutes = parseAppRoutes();
const discoveredRoutePaths = new Set(appRoutes.map((route) => route.path));

for (const configuredRoute of Object.keys(routedSurfaceConfigs)) {
  if (!discoveredRoutePaths.has(configuredRoute)) {
    warnings.push(`Configured audit route missing from src/App.tsx: ${configuredRoute}`);
  }
}

const routeRows = appRoutes.map((routeRecord) => {
  const config = routedSurfaceConfigs[routeRecord.path];
  if (!config) {
    warnings.push(`Missing audit config for discovered route: ${routeRecord.path}`);
  }
  return buildSurfaceRow(config || buildFallbackRouteConfig(routeRecord), routeRecord);
});

const supplementalRows = supplementalSurfaceConfigs.map((config) => buildSurfaceRow(config));
const auditRows = [...routeRows, ...supplementalRows];

const statusCounts = auditRows.reduce((accumulator, row) => {
  accumulator[row.status] = (accumulator[row.status] || 0) + 1;
  return accumulator;
}, {});

const pageFiles = fs
  .readdirSync(pagesDir)
  .filter((fileName) => fileName.endsWith(".tsx"))
  .map((fileName) => `src/pages/${fileName}`)
  .sort((left, right) => left.localeCompare(right));

const pageFileInventoryRows = pageFiles.map((file) => {
  const directRoutes = routeRows
    .filter((row) => row.route_file === file)
    .map((row) => row.route);
  const coveredBy = auditRows.filter((row) =>
    row.page_files.split(", ").filter(Boolean).includes(file),
  );

  if (coveredBy.length === 0) {
    warnings.push(`Page file not mapped into any audit surface: ${file}`);
  }

  return {
    file,
    direct_route_paths: unique(directRoutes).join(", "),
    audit_coverage: coveredBy.length > 0 ? "Covered" : "Needs Mapping",
    covered_routes: unique(coveredBy.map((row) => row.route)).join(", "),
    covered_surfaces: coveredBy.map((row) => row.page).join(" | "),
    surface_types: unique(coveredBy.map((row) => row.surface_type)).join(", "),
    statuses: unique(coveredBy.map((row) => row.status)).join(", "),
    notes:
      coveredBy.length > 0
        ? `${coveredBy.length} audit surface(s) reference this page file.`
        : "Add this page file to a routed or supplemental audit surface.",
  };
});

const uncoveredPageFiles = pageFileInventoryRows.filter(
  (row) => row.audit_coverage !== "Covered",
).length;
const pagesWithUnfinishedSignals = auditRows.filter(
  (row) => row.coming_soon_markers > 0 || row.placeholder_markers > 0,
).length;
const pagesWithConsoleErrors = auditRows.filter(
  (row) => row.console_error_calls > 0,
).length;
const notDoneCount = statusCounts["Not Done"] || 0;
const needReviewCount = statusCounts["Need Review"] || 0;
const doneCount = statusCounts["Done"] || 0;
const outOfScopeCount = statusCounts["Out of Scope"] || 0;

let overallLaunchState = "Ready for final launch QA";
let overallLaunchNotes =
  "No page-level blocker remains in the current audit, but normal release QA is still expected.";

if (notDoneCount > 0) {
  overallLaunchState = "Not production-grade yet";
  overallLaunchNotes =
    "Critical or high-priority surfaces still have blocker-level gaps before go-to-market quality is credible.";
} else if (needReviewCount > 0) {
  overallLaunchState = "Review-heavy launch candidate";
  overallLaunchNotes =
    "Core workflows exist, but launch confidence still depends on deeper QA, permissions review, and public-surface hardening.";
}

const summaryRows = [
  {
    metric: "Assessment snapshot",
    value: generatedAt,
    notes: "Generated from the current workspace state on 2026-03-27.",
  },
  {
    metric: "Overall launch state",
    value: overallLaunchState,
    notes: overallLaunchNotes,
  },
  {
    metric: "Assessment basis",
    value: "Route inventory + page/file audit",
    notes:
      "Routes are parsed from src/App.tsx. Routed surfaces, embedded surfaces, and page files are then mapped into a GTM audit with production-signal scans.",
  },
  {
    metric: "Routed pages discovered",
    value: String(appRoutes.length),
    notes: "Active routes parsed from src/App.tsx, including the catch-all route.",
  },
  {
    metric: "Audit surfaces documented",
    value: String(auditRows.length),
    notes:
      "Includes routed pages plus embedded or legacy surfaces that still matter for GTM clarity.",
  },
  {
    metric: "Page files inventoried",
    value: String(pageFileInventoryRows.length),
    notes:
      uncoveredPageFiles === 0
        ? "Every src/pages file is mapped to at least one audit surface."
        : `${uncoveredPageFiles} page file(s) are not yet mapped into an audit surface.`,
  },
  {
    metric: "Done",
    value: String(doneCount),
    notes: "Stable enough in the current codebase, with normal launch QA still expected.",
  },
  {
    metric: "Need Review",
    value: String(needReviewCount),
    notes:
      "Implemented, but production readiness still depends on deeper QA, permissions review, performance work, or public-surface validation.",
  },
  {
    metric: "Not Done",
    value: String(notDoneCount),
    notes: "Significant GTM blockers remain before launch quality is credible.",
  },
  {
    metric: "Out of Scope",
    value: String(outOfScopeCount),
    notes:
      "Legacy or unused pages that should not be treated as active GTM surfaces without an explicit product decision.",
  },
  {
    metric: "Pages with unfinished-code markers",
    value: String(pagesWithUnfinishedSignals),
    notes:
      "Count of audited surfaces whose implementation files still contain explicit coming-soon or placeholder markers.",
  },
  {
    metric: "Pages with console-only error logging",
    value: String(pagesWithConsoleErrors),
    notes:
      "Useful proxy for surfaces that still rely on console diagnostics instead of monitored production logging.",
  },
  {
    metric: "High-priority blockers",
    value: String(blockerRows.length),
    notes: "See the GTM Blockers sheet for concrete blockers and next steps.",
  },
  {
    metric: "Audit warnings",
    value: String(warnings.length),
    notes:
      warnings.length === 0
        ? "No unmapped routed pages or uncovered page files were detected."
        : "See the Warnings sheet for config or coverage gaps detected while generating the audit.",
  },
];

const routedMarkdownRows = routeRows.map(
  (row) =>
    `| ${escapeMarkdownCell(row.route)} | ${escapeMarkdownCell(row.page)} | ${escapeMarkdownCell(
      row.status,
    )} | ${escapeMarkdownCell(row.release_gate)} | ${escapeMarkdownCell(
      row.gtm_priority,
    )} | ${escapeMarkdownCell(row.done)} | ${escapeMarkdownCell(
      row.pending_not_done,
    )} | ${escapeMarkdownCell(row.needs_review)} | ${escapeMarkdownCell(row.signal_summary)} |`,
);

const supplementalMarkdownRows = supplementalRows.map(
  (row) =>
    `| ${escapeMarkdownCell(row.surface_type)} | ${escapeMarkdownCell(
      row.route,
    )} | ${escapeMarkdownCell(row.page)} | ${escapeMarkdownCell(
      row.status,
    )} | ${escapeMarkdownCell(row.done)} | ${escapeMarkdownCell(
      row.pending_not_done,
    )} | ${escapeMarkdownCell(row.needs_review)} |`,
);

const pageFileMarkdownRows = pageFileInventoryRows.map(
  (row) =>
    `| ${escapeMarkdownCell(row.file)} | ${escapeMarkdownCell(
      row.direct_route_paths || "n/a",
    )} | ${escapeMarkdownCell(row.audit_coverage)} | ${escapeMarkdownCell(
      row.covered_routes || "n/a",
    )} | ${escapeMarkdownCell(row.statuses || "n/a")} |`,
);

const markdownSections = [
  "# Platform Production Audit",
  "",
  `Generated at: ${generatedAt}`,
  "",
  "## Executive Summary",
  "",
  ...summaryRows.map((row) => `- ${row.metric}: ${row.value}. ${row.notes}`),
  "",
  "## GTM Blockers",
  "",
  ...blockerRows.map(
    (row, index) =>
      `${index + 1}. ${row.area} [${row.severity}] - ${row.why_it_matters} Next step: ${row.suggested_next_step}`,
  ),
  "",
  "## Routed Surfaces",
  "",
  "| Route | Page | Status | Release Gate | GTM Priority | Done | Pending / Not Done | Needs Review | Signals |",
  "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  ...routedMarkdownRows,
  "",
  "## Internal And Legacy Surfaces",
  "",
  "| Surface Type | Route | Page | Status | Done | Pending / Not Done | Needs Review |",
  "| --- | --- | --- | --- | --- | --- | --- |",
  ...supplementalMarkdownRows,
  "",
  "## Page File Coverage",
  "",
  "| File | Direct Route | Audit Coverage | Covered Routes | Statuses |",
  "| --- | --- | --- | --- | --- |",
  ...pageFileMarkdownRows,
];

if (warnings.length > 0) {
  markdownSections.push(
    "",
    "## Audit Warnings",
    "",
    ...warnings.map((warning) => `- ${warning}`),
  );
}

fs.mkdirSync(docsDir, { recursive: true });

const workbook = XLSX.utils.book_new();

const summarySheet = buildSheet(
  summaryRows.map((row) => [row.metric, row.value, row.notes]),
  ["Metric", "Value", "Notes"],
);
summarySheet["!cols"] = [{ wch: 30 }, { wch: 28 }, { wch: 120 }];
XLSX.utils.book_append_sheet(workbook, summarySheet, "Summary");

const blockersSheet = buildSheet(
  blockerRows.map((row) => [
    row.area,
    row.severity,
    row.affects,
    row.why_it_matters,
    row.suggested_next_step,
  ]),
  ["Area", "Severity", "Affects", "Why It Matters", "Suggested Next Step"],
);
blockersSheet["!cols"] = [
  { wch: 30 },
  { wch: 10 },
  { wch: 34 },
  { wch: 92 },
  { wch: 92 },
];
XLSX.utils.book_append_sheet(workbook, blockersSheet, "GTM Blockers");

const pageAuditSheet = buildSheet(
  auditRows.map((row) => [
    row.surface_type,
    row.group,
    row.route,
    row.page,
    row.audience,
    row.status,
    row.release_gate,
    row.gtm_priority,
    row.implementation,
    row.implementation_files,
    row.analysis_files,
    row.done,
    row.pending_not_done,
    row.needs_review,
    row.next_action,
    row.evidence,
    row.signal_summary,
    row.analysis_file_count,
    row.lines_of_code,
    row.coming_soon_markers,
    row.placeholder_markers,
    row.todo_markers,
    row.console_error_calls,
    row.console_warn_calls,
    row.mock_signals,
  ]),
  [
    "Surface Type",
    "Group",
    "Route",
    "Page",
    "Audience",
    "Status",
    "Release Gate",
    "GTM Priority",
    "Implementation",
    "Implementation Files",
    "Analysis Files",
    "Done",
    "Pending / Not Done",
    "Needs Review",
    "Next Action",
    "Evidence",
    "Signal Summary",
    "Analysis File Count",
    "Lines Of Code",
    "Coming Soon Markers",
    "Placeholder Markers",
    "TODO Markers",
    "console.error Calls",
    "console.warn Calls",
    "Mock Signals",
  ],
);
pageAuditSheet["!cols"] = [
  { wch: 18 },
  { wch: 18 },
  { wch: 20 },
  { wch: 28 },
  { wch: 18 },
  { wch: 14 },
  { wch: 14 },
  { wch: 12 },
  { wch: 64 },
  { wch: 72 },
  { wch: 72 },
  { wch: 76 },
  { wch: 76 },
  { wch: 76 },
  { wch: 44 },
  { wch: 76 },
  { wch: 52 },
  { wch: 16 },
  { wch: 14 },
  { wch: 18 },
  { wch: 18 },
  { wch: 14 },
  { wch: 18 },
  { wch: 18 },
  { wch: 12 },
];
XLSX.utils.book_append_sheet(workbook, pageAuditSheet, "Page Audit");

const routeInventorySheet = buildSheet(
  routeRows.map((row) => [
    row.route,
    row.route_component,
    row.route_file,
    row.page,
    row.group,
    row.audience,
    row.status,
    row.release_gate,
    row.gtm_priority,
    row.implementation,
    row.signal_summary,
  ]),
  [
    "Path",
    "Component",
    "Route File",
    "Page",
    "Group",
    "Audience",
    "Status",
    "Release Gate",
    "GTM Priority",
    "Implementation",
    "Signal Summary",
  ],
);
routeInventorySheet["!cols"] = [
  { wch: 20 },
  { wch: 22 },
  { wch: 34 },
  { wch: 30 },
  { wch: 18 },
  { wch: 18 },
  { wch: 14 },
  { wch: 14 },
  { wch: 12 },
  { wch: 64 },
  { wch: 52 },
];
XLSX.utils.book_append_sheet(workbook, routeInventorySheet, "Route Inventory");

const pageFilesSheet = buildSheet(
  pageFileInventoryRows.map((row) => [
    row.file,
    row.direct_route_paths,
    row.audit_coverage,
    row.covered_routes,
    row.covered_surfaces,
    row.surface_types,
    row.statuses,
    row.notes,
  ]),
  [
    "File",
    "Direct Route Paths",
    "Audit Coverage",
    "Covered Routes",
    "Covered Surfaces",
    "Surface Types",
    "Statuses",
    "Notes",
  ],
);
pageFilesSheet["!cols"] = [
  { wch: 36 },
  { wch: 24 },
  { wch: 16 },
  { wch: 24 },
  { wch: 48 },
  { wch: 24 },
  { wch: 22 },
  { wch: 52 },
];
XLSX.utils.book_append_sheet(workbook, pageFilesSheet, "Page Files");

if (warnings.length > 0) {
  const warningsSheet = buildSheet(
    warnings.map((warning) => [warning]),
    ["Warning"],
  );
  warningsSheet["!cols"] = [{ wch: 120 }];
  XLSX.utils.book_append_sheet(workbook, warningsSheet, "Warnings");
}

XLSX.writeFile(workbook, workbookPath);
fs.writeFileSync(markdownPath, markdownSections.join("\n"), "utf8");

console.log(`Wrote ${relativeToRoot(markdownPath)}`);
console.log(`Wrote ${relativeToRoot(workbookPath)}`);
if (warnings.length > 0) {
  console.warn(`Audit warnings: ${warnings.length}`);
}

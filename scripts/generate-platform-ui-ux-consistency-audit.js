import fs from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";

const projectRoot = process.cwd();
const generatedAt = new Date().toISOString();
const docsDir = path.resolve(projectRoot, "docs");
const markdownPath = path.join(docsDir, "platform-ui-ux-consistency-audit.md");
const workbookPath = path.join(docsDir, "platform-ui-ux-consistency-audit.xlsx");
const appPath = path.resolve(projectRoot, "src/App.tsx");

const warnings = [];

const benchmarkRows = [
  {
    id: "B1",
    platform: "Attio",
    area: "Data views and prospecting",
    pattern:
      "Saved views act as reusable team assets, with filters, visible fields, and sort order treated as part of the product workflow instead of one-off page state.",
    why_it_matters:
      "Prospecting and pipeline tools feel production-grade when users can trust a stable table, list, and view system.",
    source_url: "https://attio.com/help/reference/managing-your-data/views",
  },
  {
    id: "B2",
    platform: "Attio",
    area: "Pipeline and kanban",
    pattern:
      "Board views are customizable but still inherit one common shell, so density, stage structure, and visible properties feel like the same product.",
    why_it_matters:
      "Pipeline UX should be high-density and configurable without becoming a separate design language.",
    source_url: "https://attio.com/help/reference/managing-your-data/views/create-and-manage-kanban-views",
  },
  {
    id: "B3",
    platform: "Attio",
    area: "Workflow builder",
    pattern:
      "Workflow creation is visual, template-driven, and operationally legible, with workflow management treated as a first-class product surface.",
    why_it_matters:
      "Automation UIs need a clear split between build, review, and operate states.",
    source_url: "https://attio.com/help/reference/automations/workflows/create-a-workflow",
  },
  {
    id: "B4",
    platform: "Attio",
    area: "Workflow operations",
    pattern:
      "Operational workflow surfaces expose access, notifications, credits, and troubleshooting as part of the workflow lifecycle.",
    why_it_matters:
      "Production-grade automation is not just a builder; it is also governance, observability, and recovery.",
    source_url: "https://attio.com/help/reference/automations/workflows/troubleshooting-workflows",
  },
  {
    id: "B5",
    platform: "Customer.io",
    area: "Campaign and automation builder",
    pattern:
      "Builder, settings, and trigger context are brought together so authors do not bounce between disconnected tabs to configure one flow.",
    why_it_matters:
      "Context switching is one of the biggest UX taxes in campaign and automation authoring.",
    source_url: "https://docs.customer.io/release-notes/2025-01-16-new-campaign-builder/",
  },
  {
    id: "B6",
    platform: "Customer.io",
    area: "Workflow authoring",
    pattern:
      "Visual workflow tools combine drag-and-drop editing with analytics, annotations, and draft controls in one canvas-driven environment.",
    why_it_matters:
      "Rich builders need one clear control plane for editing, insight, and collaboration.",
    source_url: "https://docs.customer.io/journeys/workflow-builder/",
  },
  {
    id: "B7",
    platform: "Intercom",
    area: "Inbox and collaboration",
    pattern:
      "Inbox UX is organized around one command surface that combines search, tickets, assignments, and message actions without losing clarity.",
    why_it_matters:
      "Inbox tools become hard to trust when message context and task context feel detached.",
    source_url: "https://www.intercom.com/help-desk/inbox",
  },
  {
    id: "B8",
    platform: "Intercom",
    area: "Channel operations",
    pattern:
      "Shared inbox behavior is tied to routing, forwarding, and team rules, so operational setup is treated as part of the product experience.",
    why_it_matters:
      "Production inbox UX needs setup flows, not just message chrome.",
    source_url: "https://www.intercom.com/help/en/articles/6522819-automatically-forward-emails-to-the-inbox",
  },
  {
    id: "B9",
    platform: "Mailchimp",
    area: "Email builder",
    pattern:
      "Email authoring uses drag-and-drop blocks, reusable styles, and predictable content controls inside one clear editor frame.",
    why_it_matters:
      "Builder surfaces should feel creative, but still predictable enough for repeatable production work.",
    source_url: "https://mailchimp.com/help/design-an-email-new-builder/",
  },
  {
    id: "B10",
    platform: "Mailchimp",
    area: "Landing pages",
    pattern:
      "Landing-page publishing is treated as a guided workflow covering content, responsiveness, URLs, domains, and publish state.",
    why_it_matters:
      "Public content surfaces need strong preview-to-publish clarity and lower operational ambiguity.",
    source_url: "https://mailchimp.com/help/about-landing-pages/",
  },
  {
    id: "B11",
    platform: "Stripe",
    area: "Billing and account self-serve",
    pattern:
      "Billing UX combines secure payment capture, self-serve subscription management, and webhook-driven lifecycle states instead of manual admin forms.",
    why_it_matters:
      "Billing is one of the fastest ways a SaaS platform looks unfinished if the UX is not trustworthy and operationally complete.",
    source_url: "https://stripe.com/billing",
  },
];

const routedSurfaceConfigs = {
  "/": {
    group: "Public",
    page: "Root page and marketing entry",
    ui_system: "Public landing theme",
    benchmark_ids: "B10",
    status: "Needs Alignment",
    priority: "P1",
    effort: "Medium",
    navigation_score: 4,
    visual_score: 4,
    interaction_score: 4,
    production_score: 3,
    implementationFiles: ["src/pages/RootPage.tsx", "src/pages/LandingPage.tsx"],
    current_state:
      "The public entry has a clear branded visual direction and stronger art direction than most workspace pages.",
    what_works:
      "Hero hierarchy, CTA contrast, immersive visuals, and public-facing storytelling already feel intentional.",
    gaps:
      "The public brand is strong, but trust, proof, and public-to-product continuity are not as systematically structured as the best SaaS landing surfaces.",
    recommendation:
      "Keep the distinctive landing art direction, but standardize public trust modules, CTA sequencing, responsive QA, and transitions into auth or demo flows.",
  },
  "/pages/:slug": {
    group: "Public",
    page: "Published landing page",
    ui_system: "Published landing renderer",
    benchmark_ids: "B10",
    status: "Needs Alignment",
    priority: "P1",
    effort: "Medium",
    navigation_score: 3,
    visual_score: 4,
    interaction_score: 3,
    production_score: 3,
    implementationFiles: ["src/pages/PublishedLandingPage.tsx", "src/components/landing-pages/LandingPageRenderer.tsx"],
    current_state:
      "Published pages inherit the landing renderer and can look polished, but the publish-state UX is still more technical than guided.",
    what_works:
      "The renderer supports styled sections, CTAs, metrics, and lead forms with a coherent public visual language.",
    gaps:
      "Preview, validation, publish confidence, and fallback states are not yet packaged as a visibly production-grade publishing workflow.",
    recommendation:
      "Add stronger publish-state messaging, version clarity, and validation feedback so public pages feel safe to ship and easy to maintain.",
  },
  "/auth": {
    group: "Auth",
    page: "Authentication",
    ui_system: "Standalone auth card",
    benchmark_ids: "B11",
    status: "Needs Alignment",
    priority: "P2",
    effort: "Medium",
    navigation_score: 3,
    visual_score: 3,
    interaction_score: 3,
    production_score: 3,
    implementationFiles: ["src/pages/Auth.tsx"],
    current_state:
      "The auth page is functional and supports many entry states, but the emotional reassurance and enterprise credibility layer is still light.",
    what_works:
      "Single-column focus, invite support, recovery support, and referral handling reduce user confusion.",
    gaps:
      "The experience is more utility-first than premium; trust signals, SSO positioning, and clearer state transitions would make it feel more production-ready.",
    recommendation:
      "Keep the focused auth layout, but add stronger state copy, enterprise reassurance, and a more deliberate hierarchy between primary, secondary, and recovery actions.",
  },
  "/auth/confirm": {
    group: "Auth",
    page: "Auth confirmation",
    ui_system: "Standalone auth card",
    benchmark_ids: "B11",
    status: "Strong",
    priority: "P3",
    effort: "Low",
    navigation_score: 3,
    visual_score: 3,
    interaction_score: 3,
    production_score: 4,
    implementationFiles: ["src/pages/AuthConfirm.tsx"],
    current_state:
      "The confirmation surface is focused, minimal, and appropriately task-oriented.",
    what_works:
      "Clear single-purpose layout, crisp success or failure framing, and low distraction match the job to be done.",
    gaps:
      "The page is intentionally small, but the copy and fallback paths could still be more confidence-building.",
    recommendation:
      "Treat this as a small polish surface: tighten error copy and ensure success states return users into the product cleanly.",
  },
  "/onboarding": {
    group: "Onboarding",
    page: "Onboarding",
    ui_system: "Standalone onboarding wizard",
    benchmark_ids: "B5",
    status: "Needs Alignment",
    priority: "P2",
    effort: "Medium",
    navigation_score: 3,
    visual_score: 3,
    interaction_score: 3,
    production_score: 3,
    implementationFiles: ["src/pages/Onboarding.tsx"],
    current_state:
      "The onboarding flow is functional, but it reads more like a form wizard than a guided product setup journey.",
    what_works:
      "Step-based progression and saved state support the practical onboarding need.",
    gaps:
      "The experience does not yet feel tightly connected to the eventual workspace shell, setup checklist, or activation milestones.",
    recommendation:
      "Reframe onboarding as a launchpad into the core product, with setup progress, role-aware next steps, and a clearer end state.",
  },
  "/dashboard": {
    group: "Workspace",
    page: "Dashboard",
    ui_system: "Legacy dashboard shell",
    benchmark_ids: "B1,B2",
    status: "High Drift",
    priority: "P0",
    effort: "Medium",
    navigation_score: 1,
    visual_score: 2,
    interaction_score: 2,
    production_score: 1,
    implementationFiles: ["src/pages/Dashboard.tsx"],
    current_state:
      "The dashboard still behaves like a legacy control center while the rest of the platform has already moved toward dedicated routes.",
    what_works:
      "It still provides a home surface and embeds older tools that remain useful internally.",
    gaps:
      "Navigation overlaps dedicated pages, the mental model is split, and visible coming-soon content weakens trust immediately.",
    recommendation:
      "Turn /dashboard into one clean home surface or retire it as a route-level control panel, but stop using it as a second navigation system.",
  },
  "/profile": {
    group: "Workspace",
    page: "Profile",
    ui_system: "Premium glassmorphism profile variant",
    benchmark_ids: "B11",
    status: "High Drift",
    priority: "P1",
    effort: "Medium",
    navigation_score: 2,
    visual_score: 2,
    interaction_score: 3,
    production_score: 3,
    implementationFiles: ["src/pages/Profile.tsx"],
    current_state:
      "Profile is visually polished, but it swaps the shell typography and card language for a noticeably different sub-brand.",
    what_works:
      "The page feels premium, the hierarchy is expressive, and account metadata is presented in a richer way than basic admin screens.",
    gaps:
      "The page feels like a different product because of new fonts, special effects, and card construction that do not match the rest of the workspace.",
    recommendation:
      "Keep the ambition, but re-express it with shell-native typography, spacing, and panel primitives so premium does not become off-brand.",
  },
  "/campaigns": {
    group: "Campaigns",
    page: "Campaign management",
    ui_system: "Campaign micro-product",
    benchmark_ids: "B5,B9",
    status: "Needs Alignment",
    priority: "P1",
    effort: "High",
    navigation_score: 3,
    visual_score: 3,
    interaction_score: 3,
    production_score: 3,
    implementationFiles: ["src/pages/Campaigns.tsx", "src/components/CampaignList.tsx", "src/components/CampaignBuilder.tsx"],
    current_state:
      "Campaigns is rich and capable, but the list view and builder use their own visual token families instead of feeling like one shell-native product flow.",
    what_works:
      "The surface has strong density, strong feature coverage, and better hero-level presentation than the simpler admin pages.",
    gaps:
      "The list, analytics, and builder modes feel adjacent rather than unified, and the back-navigation model still exposes that seam.",
    recommendation:
      "Define one campaign header, one toolbar system, and one shared token layer for list, builder, and tracker so the workflow feels continuous.",
  },
  "/campaign/:id": {
    group: "Campaigns",
    page: "Campaign tracker",
    ui_system: "Analytics cockpit",
    benchmark_ids: "B5",
    status: "Needs Alignment",
    priority: "P1",
    effort: "Medium",
    navigation_score: 4,
    visual_score: 4,
    interaction_score: 3,
    production_score: 3,
    implementationFiles: ["src/pages/CampaignTracker.tsx"],
    current_state:
      "The tracker is one of the stronger workspace surfaces because it already behaves like a focused operating console.",
    what_works:
      "KPI framing, tabs, action buttons, analytics cards, and pipeline linkage create a credible operator workflow.",
    gaps:
      "It is still visually heavier than surrounding pages and relies on a lot of bespoke patterns that are not shared elsewhere.",
    recommendation:
      "Use the tracker as a model for dense operating pages, but extract its header, KPI card, and tab patterns into reusable workspace primitives.",
  },
  "/inbox": {
    group: "Inbox",
    page: "Inbox",
    ui_system: "Inbox micro-theme",
    benchmark_ids: "B7,B8",
    status: "Strong",
    priority: "P1",
    effort: "Medium",
    navigation_score: 4,
    visual_score: 4,
    interaction_score: 4,
    production_score: 3,
    implementationFiles: ["src/pages/Inbox.tsx", "src/components/inbox/InboxPage.tsx"],
    current_state:
      "Inbox feels intentionally productized and is one of the best examples of a specialized workspace inside the shell.",
    what_works:
      "Message context, filters, composer behavior, and workflow side actions are combined into one coherent operating surface.",
    gaps:
      "Its local visual language is strong, but some setup and empty-state flows still need the same level of polish as the active conversation view.",
    recommendation:
      "Preserve the specialized inbox feel, but bring setup, states, and action patterns into the same standard as the active message workflow.",
  },
  "/automations": {
    group: "Automations",
    page: "Automation workflows",
    ui_system: "Canvas builder inside shell",
    benchmark_ids: "B3,B4,B6",
    status: "Strong",
    priority: "P1",
    effort: "High",
    navigation_score: 4,
    visual_score: 4,
    interaction_score: 4,
    production_score: 3,
    implementationFiles: ["src/pages/Automations.tsx", "src/new_automation_workflow_design/AutomationDesignPage.tsx"],
    current_state:
      "Automations is visually ambitious and close to a production-grade builder experience.",
    what_works:
      "Templates, workflow cards, canvas editing, and lifecycle actions already feel like a first-class capability rather than a form-driven admin tool.",
    gaps:
      "The builder still carries its own local product language and needs clearer run-state, governance, and operations framing to fully mature.",
    recommendation:
      "Keep the premium builder feel, but standardize operational panels, review checkpoints, and workflow states with the broader product shell.",
  },
  "/pipeline": {
    group: "Pipeline",
    page: "Pipeline",
    ui_system: "Shell-native operating page",
    benchmark_ids: "B1,B2",
    status: "Strong",
    priority: "P1",
    effort: "Medium",
    navigation_score: 4,
    visual_score: 4,
    interaction_score: 4,
    production_score: 4,
    implementationFiles: ["src/pages/Pipeline.tsx", "src/components/pipeline/PipelinePageHeader.tsx"],
    current_state:
      "Pipeline is one of the most structurally mature workspace pages because it uses clear header, filter, control, and work-area separation.",
    what_works:
      "Saved views, control density, bulk actions, and board/list handling match what users expect from serious pipeline software.",
    gaps:
      "Placeholder content in the detail experience and a few custom patterns still stop it from becoming the default blueprint for all data surfaces.",
    recommendation:
      "Promote pipeline's header and filter architecture into a reusable standard for find, campaigns, and admin-heavy pages.",
  },
  "/find": {
    group: "Data",
    page: "Find",
    ui_system: "Two-pane data workspace",
    benchmark_ids: "B1",
    status: "Needs Alignment",
    priority: "P1",
    effort: "Medium",
    navigation_score: 4,
    visual_score: 3,
    interaction_score: 4,
    production_score: 3,
    implementationFiles: ["src/pages/Find.tsx"],
    current_state:
      "Find has the bones of a high-density search workspace, but its internal top bar and filter architecture feel more local than shell-native.",
    what_works:
      "Two-pane layout, filter sidebar, result counts, and list import flows already support a serious prospecting workflow.",
    gaps:
      "Header style, spacing, and local chrome feel disconnected from the shell header and from pipeline's stronger workspace conventions.",
    recommendation:
      "Keep the two-pane search model, but normalize page header, toolbar, view-saving, and empty-state patterns with pipeline.",
  },
  "/email-builder": {
    group: "Content",
    page: "Email builder",
    ui_system: "Mail editor micro-product",
    benchmark_ids: "B5,B9",
    status: "Needs Alignment",
    priority: "P1",
    effort: "High",
    navigation_score: 4,
    visual_score: 3,
    interaction_score: 4,
    production_score: 3,
    implementationFiles: ["src/pages/EmailBuilder.tsx", "src/pages/EmailBuilderPage.tsx"],
    current_state:
      "The email builder is visually deliberate and functionally deep, but it behaves like its own mini-product with a separate token family.",
    what_works:
      "Full-screen editing, AI assistance, preview, and block-level controls create a credible creative workspace.",
    gaps:
      "The editor frame, typography, and control styling drift from the shell enough that users lose a sense of overall product continuity.",
    recommendation:
      "Define which parts of the builder are allowed to diverge for focus, then pull shared typography, buttons, and state components back into shell standards.",
  },
  "/landing-pages": {
    group: "Content",
    page: "Landing page builder",
    ui_system: "Landing builder and editor",
    benchmark_ids: "B10",
    status: "Strong",
    priority: "P1",
    effort: "High",
    navigation_score: 4,
    visual_score: 4,
    interaction_score: 4,
    production_score: 3,
    implementationFiles: ["src/pages/LandingPages.tsx", "src/pages/LandingPagesPage.tsx"],
    current_state:
      "The landing-page builder feels like a real builder product and is one of the strongest differentiators in the codebase.",
    what_works:
      "Builder density, publishing fields, list linkage, and visual editing patterns support an end-to-end page creation workflow.",
    gaps:
      "The authoring experience is strong, but the publish confidence model and public preview lifecycle still need clearer rails.",
    recommendation:
      "Keep the builder ambitious, and now invest in publish-state UX, preview confidence, and one consistent bridge into site connector and public pages.",
  },
  "/site-connector": {
    group: "Content",
    page: "Site connector",
    ui_system: "Generic admin form page",
    benchmark_ids: "B10",
    status: "Needs Alignment",
    priority: "P1",
    effort: "Medium",
    navigation_score: 3,
    visual_score: 3,
    interaction_score: 3,
    production_score: 3,
    implementationFiles: ["src/pages/SiteConnector.tsx", "src/pages/SiteConnectorPage.tsx"],
    current_state:
      "Site connector is understandable, but it feels more like a plain admin utility than a premium publishing control surface.",
    what_works:
      "Domain add, validation, and verification steps are laid out clearly enough to complete the job.",
    gaps:
      "The page does not visually inherit the same confidence level as subscription, pipeline, or builder pages, even though it is equally important to publishing.",
    recommendation:
      "Upgrade this into a guided publishing operations surface with clearer staged steps, status badges, and publishing confidence cues.",
  },
  "/team": {
    group: "Admin",
    page: "Team management",
    ui_system: "Shell-native admin page",
    benchmark_ids: "B4,B11",
    status: "Strong",
    priority: "P2",
    effort: "Medium",
    navigation_score: 4,
    visual_score: 4,
    interaction_score: 4,
    production_score: 4,
    implementationFiles: ["src/pages/Team.tsx"],
    current_state:
      "Team is one of the most visually coherent admin pages and aligns well with the shell's premium direction.",
    what_works:
      "Header composition, KPI cards, dialog flows, and role-aware admin framing all feel consistent and deliberate.",
    gaps:
      "The page is strong, but its patterns are not yet reused widely enough across the rest of the admin surfaces.",
    recommendation:
      "Use team management as the visual reference for billing, spending, referrals, and other admin pages that still look flatter.",
  },
  "/referrals": {
    group: "Growth",
    page: "Referrals",
    ui_system: "Generic admin dashboard",
    benchmark_ids: "B11",
    status: "High Drift",
    priority: "P2",
    effort: "Medium",
    navigation_score: 3,
    visual_score: 3,
    interaction_score: 3,
    production_score: 2,
    implementationFiles: ["src/pages/Referrals.tsx"],
    current_state:
      "Referrals is clear and usable, but it lacks the stronger information design and emotional polish expected from a monetization-adjacent growth surface.",
    what_works:
      "Registration, dashboard metrics, referral link handling, and event history are easy to follow.",
    gaps:
      "The page feels like a standard form-and-card admin screen instead of a differentiated growth surface with incentive clarity and sharing energy.",
    recommendation:
      "Lift the page to the same premium standard as subscription and team by improving incentive framing, milestone feedback, and growth-oriented empty states.",
  },
  "/subscription": {
    group: "Monetization",
    page: "Subscription",
    ui_system: "Premium pricing and checkout shell",
    benchmark_ids: "B11",
    status: "Strong",
    priority: "P1",
    effort: "Medium",
    navigation_score: 4,
    visual_score: 4,
    interaction_score: 4,
    production_score: 3,
    implementationFiles: ["src/pages/Subscription.tsx"],
    current_state:
      "Subscription is one of the better-designed pages and already looks like a serious SaaS monetization surface.",
    what_works:
      "Plan cards, benefit hierarchy, billing controls, and visual framing support clear commercial decision-making.",
    gaps:
      "The visual polish is ahead of the underlying billing UX, so there is still a mismatch between what the UI promises and what the system can safely do.",
    recommendation:
      "Keep this page as the visual model for monetization, but align it with a real payment and lifecycle system so the UI and operations match.",
  },
  "/billing": {
    group: "Monetization",
    page: "Billing",
    ui_system: "Plain admin cards and tables",
    benchmark_ids: "B11",
    status: "High Drift",
    priority: "P0",
    effort: "Medium",
    navigation_score: 3,
    visual_score: 2,
    interaction_score: 3,
    production_score: 2,
    implementationFiles: ["src/pages/Billing.tsx"],
    current_state:
      "Billing is usable, but it is visually and behaviorally much flatter than the subscription surface it follows.",
    what_works:
      "The information architecture is straightforward and easy to scan for payment methods, invoices, and transactions.",
    gaps:
      "Manual card inputs, generic cards, and low-trust affordances make the page feel more internal than production-grade.",
    recommendation:
      "Rebuild billing around trusted payment capture, clearer account status modules, and a visual language that matches subscription and team.",
  },
  "/spending": {
    group: "Monetization",
    page: "Spending",
    ui_system: "Plain admin analytics page",
    benchmark_ids: "B11",
    status: "High Drift",
    priority: "P1",
    effort: "Medium",
    navigation_score: 3,
    visual_score: 2,
    interaction_score: 3,
    production_score: 2,
    implementationFiles: ["src/pages/Spending.tsx"],
    current_state:
      "Spending is structurally clear, but it looks like a baseline admin report rather than a premium finance surface.",
    what_works:
      "Summary cards, ledger, transactions, and team rollups are logically grouped and easy to follow.",
    gaps:
      "The page lacks stronger hierarchy, filtering, trend framing, and finance-grade visual clarity compared with the best admin pages in the app.",
    recommendation:
      "Promote spending into a true finance workspace with clearer charts, trend comparison, export cues, and shared admin design primitives.",
  },
  "*": {
    group: "System",
    page: "Not found and custom-domain fallback",
    ui_system: "Minimal system page",
    benchmark_ids: "B10",
    status: "Needs Alignment",
    priority: "P3",
    effort: "Low",
    navigation_score: 3,
    visual_score: 3,
    interaction_score: 3,
    production_score: 3,
    implementationFiles: ["src/pages/NotFound.tsx"],
    current_state:
      "The system fallback page is acceptable, but it is more utilitarian than branded.",
    what_works:
      "It is clear enough and supports custom-domain fallback behavior.",
    gaps:
      "The 404 state does not fully reflect either the public brand or the workspace shell design language.",
    recommendation:
      "Add lightweight brand consistency and clearer recovery actions so system states feel intentional rather than incidental.",
  },
};

const supplementalSurfaceConfigs = [
  {
    surface_type: "Internal / Embedded",
    group: "Internal",
    route: "dashboard tab only",
    page: "Integrations",
    ui_system: "Shell-adjacent admin page",
    benchmark_ids: "B8",
    status: "Needs Alignment",
    priority: "P2",
    effort: "Medium",
    navigation_score: 3,
    visual_score: 4,
    interaction_score: 4,
    production_score: 3,
    implementationFiles: ["src/pages/Integrations.tsx"],
    current_state:
      "Integrations is visually better than most simple admin pages, but it remains hidden behind the legacy dashboard pattern.",
    what_works:
      "Cards, setup flows, status presentation, and provider sections look intentional and productized.",
    gaps:
      "The page's information architecture is good, but route ownership and navigation placement still undermine clarity.",
    recommendation:
      "Promote integrations into a first-class route or clearly define it as a settings surface with shell-native routing and breadcrumbs.",
  },
  {
    surface_type: "Legacy / Unused",
    group: "Legacy marketing",
    route: "not routed",
    page: "About",
    ui_system: "Public landing theme",
    benchmark_ids: "B10",
    status: "Out of Scope",
    priority: "P4",
    effort: "Low",
    navigation_score: 2,
    visual_score: 4,
    interaction_score: 3,
    production_score: 2,
    implementationFiles: ["src/pages/About.tsx"],
    current_state:
      "About follows the public marketing direction, but it is not part of the active product surface.",
    what_works:
      "The visual language is consistent with the landing theme.",
    gaps:
      "Because it is not routed, it increases surface-area ambiguity without contributing to the actual product flow.",
    recommendation:
      "Either publish it intentionally with a clear role or keep it out of the GTM surface.",
  },
  {
    surface_type: "Legacy / Unused",
    group: "Legacy marketing",
    route: "not routed",
    page: "Security",
    ui_system: "Public landing theme",
    benchmark_ids: "B10,B11",
    status: "Out of Scope",
    priority: "P4",
    effort: "Low",
    navigation_score: 2,
    visual_score: 4,
    interaction_score: 3,
    production_score: 2,
    implementationFiles: ["src/pages/Security.tsx"],
    current_state:
      "Security visually fits the public theme, but its publication status and ownership are not yet clear.",
    what_works:
      "The page matches the brand direction better than many SaaS security afterthought pages.",
    gaps:
      "Unrouted security content can create trust confusion if customers encounter it inconsistently or if claims are not maintained.",
    recommendation:
      "Treat security as a managed public trust surface or remove it from the current product scope.",
  },
  {
    surface_type: "Legacy / Unused",
    group: "Legacy marketing",
    route: "not routed",
    page: "Index landing page",
    ui_system: "Older generic marketing",
    benchmark_ids: "B10",
    status: "Out of Scope",
    priority: "P4",
    effort: "Low",
    navigation_score: 1,
    visual_score: 2,
    interaction_score: 2,
    production_score: 2,
    implementationFiles: ["src/pages/Index.tsx"],
    current_state:
      "Index is a legacy landing implementation and no longer matches the current public brand or routed entry.",
    what_works:
      "It is simple and easy to understand.",
    gaps:
      "It looks materially older than the current product and should not remain ambiguous in the codebase.",
    recommendation:
      "Archive or delete it so the public surface is unambiguous.",
  },
];

const consistencyThemeRows = [
  {
    theme: "Typography Drift",
    severity: "High",
    evidence:
      "The shell uses Sora and IBM Plex Sans, but Profile introduces Plus Jakarta Sans and Space Grotesk, while campaign and builder surfaces define additional local font systems.",
    impact:
      "Users experience multiple product personalities instead of one coherent SaaS brand.",
    recommendation:
      "Define one shell type system and allow only limited, documented exceptions for public marketing or full-screen builders.",
    benchmark_ids: "B1,B5,B9",
  },
  {
    theme: "Header And Toolbar Drift",
    severity: "High",
    evidence:
      "Pipeline has a mature page header and filter system, Find uses a local top bar, Billing and Spending use plain admin headers, and Campaigns delegates the header to inner components.",
    impact:
      "Navigation comprehension and task initiation vary too much page to page.",
    recommendation:
      "Ship one reusable page-header spec with title, status, KPI slots, primary CTA, secondary actions, and filter toolbar variants.",
    benchmark_ids: "B1,B2,B5",
  },
  {
    theme: "Micro-Product Theme Fragmentation",
    severity: "High",
    evidence:
      "Local token families like shell, camp, builder, dash, mail, and lp create several visual sub-products inside one workspace.",
    impact:
      "Feature-rich pages feel powerful, but the overall platform feels less unified and harder to scale.",
    recommendation:
      "Keep specialized builders, but make them inherit one shared token core for typography, buttons, badges, inputs, and states.",
    benchmark_ids: "B3,B5,B9",
  },
  {
    theme: "Loading And Empty State Inconsistency",
    severity: "Medium",
    evidence:
      "Workspace pages use different spinner colors, generic loading blocks, and inconsistent empty-state framing.",
    impact:
      "The platform feels less polished and less reliable when users move between surfaces.",
    recommendation:
      "Create shared loading, empty, and error-state components with role-specific variants.",
    benchmark_ids: "B7,B11",
  },
  {
    theme: "Admin Surface Maturity Gap",
    severity: "High",
    evidence:
      "Team and Subscription feel premium, while Billing, Spending, Referrals, and Site Connector still read as flatter utility pages.",
    impact:
      "Commercially sensitive flows look less trustworthy than adjacent product surfaces.",
    recommendation:
      "Use Team and Subscription as the admin design baseline and refactor the flatter admin pages onto the same primitives.",
    benchmark_ids: "B10,B11",
  },
  {
    theme: "Navigation And IA Conflict",
    severity: "High",
    evidence:
      "The legacy dashboard still hosts tabs that overlap dedicated routes and hidden surfaces like integrations.",
    impact:
      "Users have to learn two navigation models for one platform.",
    recommendation:
      "Simplify dashboard ownership and move all product-critical surfaces to one clear route architecture.",
    benchmark_ids: "B1,B2",
  },
];

const roadmapRows = [
  {
    phase: "Phase 1",
    workstream: "Product Shell",
    priority: "P0",
    action:
      "Retire the legacy dashboard as a second navigation model and publish one canonical page-header plus toolbar system.",
    pages: "/dashboard, /find, /pipeline, /campaigns, /billing, /spending",
    outcome:
      "Users learn one workspace structure instead of several parallel ones.",
  },
  {
    phase: "Phase 1",
    workstream: "Design Tokens",
    priority: "P0",
    action:
      "Define one shared token core for typography, radii, button weights, badges, inputs, and state surfaces across shell-native pages and builders.",
    pages: "Workspace-wide",
    outcome:
      "Specialized pages can stay distinctive without breaking platform continuity.",
  },
  {
    phase: "Phase 2",
    workstream: "Admin Upgrade",
    priority: "P1",
    action:
      "Refactor Billing, Spending, Referrals, and Site Connector onto the same design primitives already visible in Team and Subscription.",
    pages: "/billing, /spending, /referrals, /site-connector",
    outcome:
      "Sensitive admin and monetization flows look trustworthy and production-grade.",
  },
  {
    phase: "Phase 2",
    workstream: "Builder Harmonization",
    priority: "P1",
    action:
      "Normalize shared navigation, action hierarchy, and state components across Campaigns, Email Builder, Landing Pages, and Automations.",
    pages: "/campaigns, /campaign/:id, /email-builder, /landing-pages, /automations",
    outcome:
      "Creative and operational tools feel like one suite instead of neighboring apps.",
  },
  {
    phase: "Phase 3",
    workstream: "State Polish",
    priority: "P2",
    action:
      "Ship shared loading, empty, no-results, permission, and destructive-action patterns with accessibility review.",
    pages: "Workspace-wide",
    outcome:
      "The product feels intentionally polished under both normal and edge conditions.",
  },
  {
    phase: "Phase 3",
    workstream: "Public To Product",
    priority: "P2",
    action:
      "Align marketing, published landing pages, site connector, and auth into one public-to-product trust journey.",
    pages: "/, /pages/:slug, /site-connector, /auth",
    outcome:
      "The public brand and the product brand feel related instead of separate experiences.",
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

function collectUiSignals(filePaths) {
  const normalizedFiles = unique(filePaths.map(relativeToRoot));
  const allowedThemeFamilies = new Set(["shell", "camp", "builder", "dash", "mail", "lp", "inbox"]);
  const metrics = {
    analysis_file_count: 0,
    lines_of_code: 0,
    uses_dashboard_layout: false,
    font_override_count: 0,
    custom_font_imports: 0,
    spinner_count: 0,
    empty_state_markers: 0,
    table_usage_count: 0,
    tabs_usage_count: 0,
    theme_family_count: 0,
    theme_families: "",
  };

  const themeFamilies = new Set();

  for (const file of normalizedFiles) {
    const absolutePath = path.resolve(projectRoot, file);
    if (!fs.existsSync(absolutePath)) {
      warnings.push(`Missing analysis file: ${file}`);
      continue;
    }

    const text = readUtf8(absolutePath);
    metrics.analysis_file_count += 1;
    metrics.lines_of_code += text.split(/\r?\n/).length;
    metrics.uses_dashboard_layout = metrics.uses_dashboard_layout || text.includes("DashboardLayout");
    metrics.font_override_count += countMatches(text, /fontFamily\s*:/g);
    metrics.custom_font_imports += countMatches(text, /fonts\.googleapis\.com/g);
    metrics.spinner_count += countMatches(text, /animate-spin/g);
    metrics.empty_state_markers += countMatches(text, /No [A-Z][^"'`]+|emptyLabel|Nothing to preview yet|Page not found/g);
    metrics.table_usage_count += countMatches(text, /<table|<Table/g);
    metrics.tabs_usage_count += countMatches(text, /TabsTrigger|<Tabs/g);

    for (const match of text.matchAll(/--([a-z]+)-/g)) {
      const family = String(match[1] || "").toLowerCase();
      if (allowedThemeFamilies.has(family)) {
        themeFamilies.add(family);
      }
    }
  }

  metrics.theme_families = Array.from(themeFamilies).sort().join(", ");
  metrics.theme_family_count = themeFamilies.size;
  return metrics;
}

function buildSignalSummary(metrics) {
  const bits = [];
  if (metrics.uses_dashboard_layout) bits.push("uses shared shell");
  if (metrics.theme_family_count > 0) bits.push(`theme families: ${metrics.theme_families}`);
  if (metrics.font_override_count > 0) bits.push(`${metrics.font_override_count} font override(s)`);
  if (metrics.custom_font_imports > 0) bits.push(`${metrics.custom_font_imports} custom font import(s)`);
  if (metrics.spinner_count > 0) bits.push(`${metrics.spinner_count} loading spinner marker(s)`);
  if (metrics.empty_state_markers > 0) bits.push(`${metrics.empty_state_markers} empty-state marker(s)`);
  if (metrics.table_usage_count > 0) bits.push(`${metrics.table_usage_count} table pattern(s)`);
  if (metrics.tabs_usage_count > 0) bits.push(`${metrics.tabs_usage_count} tabs pattern(s)`);
  return `${metrics.analysis_file_count} file(s), ${metrics.lines_of_code} LOC${bits.length ? `, ${bits.join(", ")}` : ""}`;
}

function scoreLabel(score) {
  if (score >= 4) return "Strong";
  if (score >= 3) return "Needs Alignment";
  return "High Drift";
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

function buildSurfaceRow(config, routeRecord = null) {
  const implementationFiles = unique(
    [...ensureArray(config.implementationFiles), routeRecord?.route_file]
      .filter(Boolean)
      .map(relativeToRoot),
  );
  const signalMetrics = collectUiSignals(implementationFiles);
  const averageScore = Number(
    (
      (config.navigation_score +
        config.visual_score +
        config.interaction_score +
        config.production_score) /
      4
    ).toFixed(2),
  );

  return {
    surface_type: config.surface_type || "Routed",
    group: config.group,
    route: config.route || routeRecord?.path || "",
    route_component: routeRecord?.component || "",
    page: config.page,
    ui_system: config.ui_system,
    benchmark_ids: config.benchmark_ids,
    status: config.status || scoreLabel(averageScore),
    priority: config.priority,
    effort: config.effort,
    navigation_score: config.navigation_score,
    visual_score: config.visual_score,
    interaction_score: config.interaction_score,
    production_score: config.production_score,
    overall_score: averageScore,
    implementation_files: implementationFiles.join(", "),
    current_state: config.current_state,
    what_works: config.what_works,
    gaps: config.gaps,
    recommendation: config.recommendation,
    signal_summary: buildSignalSummary(signalMetrics),
    ...signalMetrics,
  };
}

const benchmarkById = new Map(benchmarkRows.map((row) => [row.id, row]));
const appRoutes = parseAppRoutes();
const discoveredRoutePaths = new Set(appRoutes.map((route) => route.path));

for (const configuredRoute of Object.keys(routedSurfaceConfigs)) {
  if (!discoveredRoutePaths.has(configuredRoute)) {
    warnings.push(`Configured UX audit route missing from src/App.tsx: ${configuredRoute}`);
  }
}

const routeRows = appRoutes.map((routeRecord) => {
  const config = routedSurfaceConfigs[routeRecord.path];
  if (!config) {
    warnings.push(`Missing UX audit config for discovered route: ${routeRecord.path}`);
    return buildSurfaceRow(
      {
        group: "Unmapped",
        page: routeRecord.component,
        ui_system: "Unknown",
        benchmark_ids: "",
        status: "Needs Alignment",
        priority: "P2",
        effort: "Low",
        navigation_score: 3,
        visual_score: 3,
        interaction_score: 3,
        production_score: 3,
        implementationFiles: routeRecord.route_file ? [routeRecord.route_file] : [],
        current_state: `Route exists and renders ${routeRecord.component}.`,
        what_works: "The route is discoverable in the app shell.",
        gaps: "No dedicated UI or UX review has been authored for this route yet.",
        recommendation: "Add a manual page review before treating this route as GTM-ready.",
      },
      routeRecord,
    );
  }
  return buildSurfaceRow(config, routeRecord);
});

const supplementalRows = supplementalSurfaceConfigs.map((config) => buildSurfaceRow(config));
const auditRows = [...routeRows, ...supplementalRows];

const statusCounts = auditRows.reduce((accumulator, row) => {
  accumulator[row.status] = (accumulator[row.status] || 0) + 1;
  return accumulator;
}, {});

const overallAverageScore = Number(
  (
    auditRows.reduce((sum, row) => sum + row.overall_score, 0) /
    Math.max(auditRows.length, 1)
  ).toFixed(2),
);
const highDriftCount = statusCounts["High Drift"] || 0;
const strongCount = statusCounts["Strong"] || 0;
const needsAlignmentCount = statusCounts["Needs Alignment"] || 0;
const outOfScopeCount = statusCounts["Out of Scope"] || 0;
const pagesWithFontOverrides = auditRows.filter((row) => row.font_override_count > 0).length;
const pagesWithManyThemeFamilies = auditRows.filter((row) => row.theme_family_count > 1).length;
const pagesUsingSharedShell = auditRows.filter((row) => row.uses_dashboard_layout).length;

let platformUxState = "Strong base, needs launch alignment";
if (highDriftCount >= 4) {
  platformUxState = "Not visually unified enough for production-grade GTM";
} else if (needsAlignmentCount > 8) {
  platformUxState = "Promising but fragmented";
}

const summaryRows = [
  {
    metric: "Assessment snapshot",
    value: generatedAt,
    notes: "Generated from the current workspace state on 2026-03-27.",
  },
  {
    metric: "Overall UI/UX state",
    value: platformUxState,
    notes:
      "The platform already has several strong surfaces, but shell drift, token fragmentation, and admin-page maturity gaps still prevent a fully production-grade experience.",
  },
  {
    metric: "Audit surfaces",
    value: String(auditRows.length),
    notes: "Routed pages plus notable internal or legacy surfaces were included in the UX audit.",
  },
  {
    metric: "Average UX score",
    value: String(overallAverageScore),
    notes: "Average of navigation, visual, interaction, and production-grade readiness scores.",
  },
  {
    metric: "Strong",
    value: String(strongCount),
    notes: "Pages already close to a production-grade standard for UI and UX consistency.",
  },
  {
    metric: "Needs Alignment",
    value: String(needsAlignmentCount),
    notes: "Pages that work well enough, but still diverge from the desired shell and interaction standard.",
  },
  {
    metric: "High Drift",
    value: String(highDriftCount),
    notes: "Pages that materially weaken platform consistency or trust.",
  },
  {
    metric: "Out of Scope",
    value: String(outOfScopeCount),
    notes: "Legacy or unused surfaces that should not be treated as current GTM product pages.",
  },
  {
    metric: "Pages using shared shell",
    value: String(pagesUsingSharedShell),
    notes: "Useful indicator of how much of the product already inherits the common workspace frame.",
  },
  {
    metric: "Pages with local font overrides",
    value: String(pagesWithFontOverrides),
    notes: "Signals where local typography decisions are overriding shell standards.",
  },
  {
    metric: "Pages with multiple theme families",
    value: String(pagesWithManyThemeFamilies),
    notes: "Signals where one surface mixes more than one token family and risks looking like multiple products.",
  },
  {
    metric: "Benchmark sources",
    value: String(benchmarkRows.length),
    notes: "Current official product or documentation sources used to anchor the comparison model.",
  },
];

const benchmarkSheetRows = benchmarkRows.map((row) => [
  row.id,
  row.platform,
  row.area,
  row.pattern,
  row.why_it_matters,
  row.source_url,
]);

const themeSheetRows = consistencyThemeRows.map((row) => [
  row.theme,
  row.severity,
  row.evidence,
  row.impact,
  row.recommendation,
  row.benchmark_ids,
]);

const roadmapSheetRows = roadmapRows.map((row) => [
  row.phase,
  row.workstream,
  row.priority,
  row.action,
  row.pages,
  row.outcome,
]);

const pageAuditSheetRows = auditRows.map((row) => [
  row.surface_type,
  row.group,
  row.route,
  row.page,
  row.ui_system,
  row.benchmark_ids,
  row.status,
  row.priority,
  row.effort,
  row.navigation_score,
  row.visual_score,
  row.interaction_score,
  row.production_score,
  row.overall_score,
  row.current_state,
  row.what_works,
  row.gaps,
  row.recommendation,
  row.implementation_files,
  row.signal_summary,
  row.analysis_file_count,
  row.lines_of_code,
  row.font_override_count,
  row.custom_font_imports,
  row.theme_family_count,
  row.theme_families,
  row.spinner_count,
  row.empty_state_markers,
  row.table_usage_count,
  row.tabs_usage_count,
]);

const markdownSections = [
  "# Platform UI/UX Consistency Audit",
  "",
  `Generated at: ${generatedAt}`,
  "",
  "## Executive Summary",
  "",
  ...summaryRows.map((row) => `- ${row.metric}: ${row.value}. ${row.notes}`),
  "",
  "## Competitive Benchmarks",
  "",
  ...benchmarkRows.map(
    (row) => `- ${row.id} ${row.platform} (${row.area}): ${row.pattern} Source: ${row.source_url}`,
  ),
  "",
  "## Cross-Page Themes",
  "",
  ...consistencyThemeRows.map(
    (row) => `- ${row.theme} [${row.severity}]: ${row.impact} Recommendation: ${row.recommendation}`,
  ),
  "",
  "## Page Audit",
  "",
  "| Route | Page | Status | UX System | Benchmark IDs | Overall Score | Current State | Gaps | Recommendation |",
  "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  ...auditRows.map(
    (row) =>
      `| ${escapeMarkdownCell(row.route)} | ${escapeMarkdownCell(row.page)} | ${escapeMarkdownCell(
        row.status,
      )} | ${escapeMarkdownCell(row.ui_system)} | ${escapeMarkdownCell(
        row.benchmark_ids,
      )} | ${escapeMarkdownCell(row.overall_score)} | ${escapeMarkdownCell(
        row.current_state,
      )} | ${escapeMarkdownCell(row.gaps)} | ${escapeMarkdownCell(row.recommendation)} |`,
  ),
];

fs.mkdirSync(docsDir, { recursive: true });

const workbook = XLSX.utils.book_new();

const summarySheet = buildSheet(
  summaryRows.map((row) => [row.metric, row.value, row.notes]),
  ["Metric", "Value", "Notes"],
);
summarySheet["!cols"] = [{ wch: 30 }, { wch: 20 }, { wch: 120 }];
XLSX.utils.book_append_sheet(workbook, summarySheet, "Summary");

const benchmarkSheet = buildSheet(benchmarkSheetRows, [
  "ID",
  "Platform",
  "Area",
  "Pattern",
  "Why It Matters",
  "Source URL",
]);
benchmarkSheet["!cols"] = [
  { wch: 8 },
  { wch: 16 },
  { wch: 24 },
  { wch: 88 },
  { wch: 72 },
  { wch: 56 },
];
XLSX.utils.book_append_sheet(workbook, benchmarkSheet, "Benchmarks");

const pageAuditSheet = buildSheet(pageAuditSheetRows, [
  "Surface Type",
  "Group",
  "Route",
  "Page",
  "UI System",
  "Benchmark IDs",
  "Status",
  "Priority",
  "Effort",
  "Navigation Score",
  "Visual Score",
  "Interaction Score",
  "Production Score",
  "Overall Score",
  "Current State",
  "What Works",
  "Gaps",
  "Recommendation",
  "Implementation Files",
  "Signal Summary",
  "Analysis File Count",
  "Lines Of Code",
  "Font Override Count",
  "Custom Font Imports",
  "Theme Family Count",
  "Theme Families",
  "Spinner Count",
  "Empty-State Markers",
  "Table Usage Count",
  "Tabs Usage Count",
]);
pageAuditSheet["!cols"] = [
  { wch: 18 },
  { wch: 16 },
  { wch: 18 },
  { wch: 28 },
  { wch: 28 },
  { wch: 16 },
  { wch: 16 },
  { wch: 10 },
  { wch: 10 },
  { wch: 14 },
  { wch: 12 },
  { wch: 16 },
  { wch: 16 },
  { wch: 12 },
  { wch: 74 },
  { wch: 74 },
  { wch: 74 },
  { wch: 74 },
  { wch: 72 },
  { wch: 56 },
  { wch: 16 },
  { wch: 14 },
  { wch: 16 },
  { wch: 16 },
  { wch: 16 },
  { wch: 22 },
  { wch: 14 },
  { wch: 18 },
  { wch: 16 },
  { wch: 14 },
];
XLSX.utils.book_append_sheet(workbook, pageAuditSheet, "Page Audit");

const themesSheet = buildSheet(themeSheetRows, [
  "Theme",
  "Severity",
  "Evidence",
  "Impact",
  "Recommendation",
  "Benchmark IDs",
]);
themesSheet["!cols"] = [
  { wch: 28 },
  { wch: 10 },
  { wch: 72 },
  { wch: 72 },
  { wch: 72 },
  { wch: 16 },
];
XLSX.utils.book_append_sheet(workbook, themesSheet, "Consistency Themes");

const roadmapSheet = buildSheet(roadmapSheetRows, [
  "Phase",
  "Workstream",
  "Priority",
  "Action",
  "Pages",
  "Outcome",
]);
roadmapSheet["!cols"] = [
  { wch: 12 },
  { wch: 18 },
  { wch: 10 },
  { wch: 82 },
  { wch: 44 },
  { wch: 68 },
];
XLSX.utils.book_append_sheet(workbook, roadmapSheet, "Roadmap");

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
  console.warn(`UX audit warnings: ${warnings.length}`);
}

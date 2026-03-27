# Platform Production Audit

Generated at: 2026-03-27T01:17:16.161Z

## Executive Summary

- Assessment snapshot: 2026-03-27T01:17:16.161Z. Generated from the current workspace state on 2026-03-27.
- Overall launch state: Not production-grade yet. Critical or high-priority surfaces still have blocker-level gaps before go-to-market quality is credible.
- Assessment basis: Route inventory + page/file audit. Routes are parsed from src/App.tsx. Routed surfaces, embedded surfaces, and page files are then mapped into a GTM audit with production-signal scans.
- Routed pages discovered: 22. Active routes parsed from src/App.tsx, including the catch-all route.
- Audit surfaces documented: 26. Includes routed pages plus embedded or legacy surfaces that still matter for GTM clarity.
- Page files inventoried: 30. Every src/pages file is mapped to at least one audit surface.
- Done: 4. Stable enough in the current codebase, with normal launch QA still expected.
- Need Review: 16. Implemented, but production readiness still depends on deeper QA, permissions review, performance work, or public-surface validation.
- Not Done: 3. Significant GTM blockers remain before launch quality is credible.
- Out of Scope: 3. Legacy or unused pages that should not be treated as active GTM surfaces without an explicit product decision.
- Pages with unfinished-code markers: 3. Count of audited surfaces whose implementation files still contain explicit coming-soon or placeholder markers.
- Pages with console-only error logging: 10. Useful proxy for surfaces that still rely on console diagnostics instead of monitored production logging.
- High-priority blockers: 7. See the GTM Blockers sheet for concrete blockers and next steps.
- Audit warnings: 0. No unmapped routed pages or uncovered page files were detected.

## GTM Blockers

1. Billing and checkout [Critical] - The current billing layer stores manual payment-method details like brand and last4, but there is no clear provider-tokenized checkout path for production monetization. Next step: Integrate a real billing provider, move payment capture off the client, add subscription lifecycle webhooks, and retest upgrade, downgrade, retry, and failure paths.
2. Legacy dashboard route [High] - The dashboard still contains internal coming-soon tabs for Automations and Connect Site even though dedicated routes exist, which makes the product state look inconsistent at launch. Next step: Decide whether /dashboard remains an analytics home or is simplified, then remove placeholder tabs and align navigation with the real product structure.
3. Find deep-search performance [High] - Deep broad-text searches were timing out before the latest fixes. The route is healthier now, but later pages are still slower than a production-grade search experience. Next step: Prioritize deep-search performance work, especially shard paging strategy and keyset-style pagination, then keep a deeper Find regression check in the release checklist.
4. Pipeline placeholder tabs [High] - Notes and inbox activity areas in the opportunity details panel are still visible placeholders, which leaves gaps in a core sales workflow. Next step: Either finish those integrations before launch or hide the tabs until the backing functionality is real.
5. Automations execution hardening [High] - The workflow designer is substantial and data-backed, but production-grade automation still needs stronger execution QA, webhook security review, and operational monitoring. Next step: Run dedicated launch QA on create, publish, duplicate, pause, resume, webhook, and approval flows; verify auditability and failure recovery end to end.
6. Public publishing surfaces [High] - Marketing, published landing pages, and domain routing are customer-facing surfaces. They need release-grade checks for caching, DNS, SSL, SEO metadata, and form abuse protection. Next step: Create a public-surface launch checklist and validate staging plus production-host behavior before go-to-market.
7. Route hygiene and GTM scope clarity [Medium] - Non-routed or embedded pages such as Integrations, About, Security, and Index can confuse ownership and product scope if they remain unmanaged. Next step: Explicitly mark these as internal or out of GTM scope, wire them intentionally, or remove them from the active launch surface.

## Routed Surfaces

| Route | Page | Status | Release Gate | GTM Priority | Done | Pending / Not Done | Needs Review | Signals |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| / | Root page and marketing entry | Need Review | Conditional | High | Marketing landing page exists. Root entry also resolves custom domains and published landing pages when the host should use domain resolution. | Public-surface launch checklist is still needed for caching, analytics, SEO, and abuse protection. | Custom-domain fallback behavior, public form security, and metadata behavior need staging and production QA. | 2 file(s), 948 LOC, no explicit unfinished-code markers found |
| /pages/:slug | Published landing page | Need Review | Conditional | High | Published page loader, renderer, and metadata application exist and are wired to landing-page persistence. | Launch-grade checks for slug publishing lifecycle, cache invalidation, and public lead-capture handling are still needed. | Public rendering, analytics, and form submission integrity should be validated against real publish flows. | 1 file(s), 93 LOC, no explicit unfinished-code markers found |
| /auth | Authentication | Need Review | Conditional | High | Login, signup, forgot-password, password setup, invite, and referral-claim flows are implemented against Supabase auth. | No clear page-level evidence of SSO, enterprise auth, or a launch-grade rate-limit and fraud review. | Production auth needs explicit QA for invite, recovery, redirect, and referral edge cases plus monitoring. | 1 file(s), 885 LOC, 1 console.error call(s) |
| /auth/confirm | Auth confirmation | Done | Launch QA | Medium | OTP verification and callback handling exist for signup, invite, magic link, recovery, and email-change flows. | No material functional blocker was found in the page code. | Normal release QA is still needed for callback links and error copy. | 1 file(s), 326 LOC, no explicit unfinished-code markers found |
| /onboarding | Onboarding | Done | Launch QA | Medium | Multi-step onboarding questionnaire exists and persists onboarding state and profile data. | No obvious unfinished placeholder surfaced in the page implementation. | Review skip, resume, and partial-completion behavior during launch QA. | 1 file(s), 325 LOC, no explicit unfinished-code markers found |
| /dashboard | Dashboard | Not Done | Blocker | High | Analytics, builder, templates, mailbox, config, contacts, integrations, and segments tabs render inside the legacy shell. | Automations and Connect Site still render as explicit coming-soon tabs inside the dashboard route. | The product shell should be simplified or aligned with the dedicated routes before launch. | 1 file(s), 188 LOC, 1 coming-soon marker(s) |
| /profile | Profile | Done | Launch QA | Medium | Profile, account, and billing snapshot surfaces are implemented and wired to auth, workspace, and billing helpers. | No visible unfinished placeholder was found in the page file. | Launch QA should validate profile save behavior and workspace context switching. | 1 file(s), 1034 LOC, 1 console.error call(s), 3 console.warn call(s) |
| /campaigns | Campaign management | Need Review | Conditional | High | Campaign listing and campaign builder exist, with email-config loading and navigation into the tracker. | Production send-safety, validation, and lifecycle QA still need an explicit launch checklist. | This is a core GTM surface and should be release-tested for creation, editing, audience selection, and send orchestration. | 3 file(s), 4216 LOC, 7 console.error call(s) |
| /inbox | Inbox | Need Review | Conditional | High | Inbox route is implemented with mailbox views, message actions, pipeline hooks, composer flows, and search or filter UI. | No explicit unfinished placeholder was found in the route wrapper, but this is still an operationally risky area. | Mailbox sync reliability, reply handling, attachment cases, and side effects on pipeline or campaign state need production QA. | 2 file(s), 2385 LOC, 8 console.error call(s) |
| /automations | Automation workflows | Need Review | Conditional | High | Workflow list, templates, activity, builder, save, duplicate, delete, publish, pause, and approval-request flows are present. | High-risk production automation behavior still needs explicit execution, webhook, and recovery validation. | Review runtime monitoring, dependency validation, webhook security, and launch rollback paths before GTM. | 3 file(s), 1576 LOC, no explicit unfinished-code markers found |
| /pipeline | Pipeline | Need Review | Conditional | High | Board, list, analytics, filters, commands, details panel, and mutations are implemented with query-client integration. | Two user-facing tabs in the details panel are still placeholders: notes and inbox activity. | Either finish those integrations or hide them for launch; also validate board performance and mutation consistency. | 2 file(s), 2385 LOC, 1 placeholder marker(s) |
| /find | Find | Need Review | Conditional | High | Shared-catalog search, filters, pagination, detail drill-down, list import, and shard-aware status handling are implemented. | Broad-query totals remain approximate and deep pages are still slower than a launch-grade search experience should be. | Recent fixes improved stability, but deep-page performance still needs hardening before go-to-market. | 1 file(s), 1656 LOC, no explicit unfinished-code markers found |
| /email-builder | Email builder | Need Review | Conditional | High | Email template editor, block canvas, settings panel, AI thread panel, preview panel, and persistence helpers are implemented. | No obvious route-level blocker was found, but rendering correctness and persistence integrity are critical for launch. | Run release QA on import, export, responsive rendering, template persistence, and model-assisted edits. | 2 file(s), 573 LOC, 2 console.warn call(s) |
| /landing-pages | Landing page builder | Need Review | Conditional | High | Landing-page builder, blocks, styling, publish data, forms, templates, and list linkage are implemented. | Public publishing lifecycle, editor QA, and lead-capture abuse controls still need explicit launch review. | This is a public content surface and should be validated across editor, publish, preview, and form-submission flows. | 3 file(s), 2001 LOC, no explicit unfinished-code markers found |
| /site-connector | Site connector | Need Review | Conditional | High | Domain add, remove, verify, page linking, DNS instructions, and store-backed persistence are implemented. | Public DNS and SSL flows need real-world validation before launch. | Validate domain verification, SSL propagation, same-origin resolution, and rollback behavior under production hosts. | 2 file(s), 543 LOC, no explicit unfinished-code markers found |
| /team | Team management | Need Review | Conditional | High | Members, approvals, audit history, spending views, allocation controls, and invitation or update flows are implemented. | No obvious unfinished placeholder surfaced in the page itself. | Permission boundaries, approval rules, and billing or admin side effects need role-based UAT before launch. | 1 file(s), 1103 LOC, no explicit unfinished-code markers found |
| /referrals | Referrals | Need Review | Conditional | Medium | Referral dashboard, registration flow, referral-link generation, and event history are implemented. | No page-level launch blocker is obvious, but referral abuse controls are not clear from the page layer. | Review fraud prevention, referral attribution integrity, and support workflows before launch. | 1 file(s), 461 LOC, 1 console.error call(s) |
| /campaign/:id | Campaign tracker | Need Review | Conditional | High | Large analytics and recipient-tracking surface exists with charts, filters, timeline views, and pipeline integration. | No obvious route-level blocker was found, but the page is large and operationally heavy. | Data accuracy, performance, and recipient-state correctness need deep QA before launch. | 1 file(s), 2604 LOC, 12 console.error call(s) |
| /subscription | Subscription | Not Done | Blocker | Critical | Plan selection UI, plan details, payment-method selection, and enterprise contact capture exist. | Subscription checkout is still tied to a billing layer that does not clearly implement provider-tokenized payment capture. | Before GTM, validate plan changes, proration, provisioning, cancellation, retry, and failure recovery with a real provider. | 2 file(s), 2064 LOC, 4 console.error call(s) |
| /billing | Billing | Not Done | Blocker | Critical | Billing snapshot, invoices, transactions, and payment-method CRUD are implemented. | Payment methods are created from brand, last4, and expiry inputs rather than a provider-tokenized checkout flow. | Real billing integration, PCI-safe capture, webhook reconciliation, and subscription accounting are required before GTM. | 2 file(s), 695 LOC, 1 console.error call(s) |
| /spending | Spending | Need Review | Conditional | High | Workspace spending rollup, billing transactions, ledger views, and pagination are implemented. | The page depends on the broader billing and team data model being accurate and production-ready. | Validate finance and admin permissions and reconcile spending numbers against real billing events before launch. | 2 file(s), 701 LOC, 1 console.error call(s) |
| * | Not found and custom-domain fallback | Done | Launch QA | Low | 404 handling exists and also attempts custom-domain published-page resolution when the host should be treated as a site domain. | No major unfinished user-facing blocker surfaced in the page. | Replace console-only error reporting with monitored logging in production. | 1 file(s), 116 LOC, 1 console.error call(s) |

## Internal And Legacy Surfaces

| Surface Type | Route | Page | Status | Done | Pending / Not Done | Needs Review |
| --- | --- | --- | --- | --- | --- | --- |
| Internal / Embedded | dashboard tab only | Integrations | Need Review | CRM integration management exists for providers such as HubSpot and Salesforce, including mapping and sync hooks. | This page is not a first-class route in App.tsx and currently appears as a dashboard-embedded surface. | Decide whether integrations are a real launch surface or an internal admin feature before GTM. |
| Legacy / Unused | not routed | About | Out of Scope | Static marketing content exists. | The page is not routed in the current app shell. | Either route it intentionally or remove it from the active GTM scope to keep ownership clear. |
| Legacy / Unused | not routed | Security | Out of Scope | Static security-marketing content exists. | The page is not routed in the current app shell. | If kept for GTM later, the claims need legal and security review before publication. |
| Legacy / Unused | not routed | Index landing page | Out of Scope | A simpler historical landing page exists. | It is not the active routed root entry and appears to be superseded by RootPage and LandingPage. | Remove or archive it to avoid confusion about the canonical marketing entry. |

## Page File Coverage

| File | Direct Route | Audit Coverage | Covered Routes | Statuses |
| --- | --- | --- | --- | --- |
| src/pages/About.tsx | n/a | Covered | not routed | Out of Scope |
| src/pages/Auth.tsx | /auth | Covered | /auth | Need Review |
| src/pages/AuthConfirm.tsx | /auth/confirm | Covered | /auth/confirm | Done |
| src/pages/Automations.tsx | /automations | Covered | /automations | Need Review |
| src/pages/Billing.tsx | /billing | Covered | /billing | Not Done |
| src/pages/Campaigns.tsx | /campaigns | Covered | /campaigns | Need Review |
| src/pages/CampaignTracker.tsx | /campaign/:id | Covered | /campaign/:id | Need Review |
| src/pages/Dashboard.tsx | /dashboard | Covered | /dashboard | Not Done |
| src/pages/EmailBuilder.tsx | /email-builder | Covered | /email-builder | Need Review |
| src/pages/EmailBuilderPage.tsx | n/a | Covered | /email-builder | Need Review |
| src/pages/Find.tsx | /find | Covered | /find | Need Review |
| src/pages/Inbox.tsx | /inbox | Covered | /inbox | Need Review |
| src/pages/Index.tsx | n/a | Covered | not routed | Out of Scope |
| src/pages/Integrations.tsx | n/a | Covered | dashboard tab only | Need Review |
| src/pages/LandingPage.tsx | n/a | Covered | / | Need Review |
| src/pages/LandingPages.tsx | /landing-pages | Covered | /landing-pages | Need Review |
| src/pages/LandingPagesPage.tsx | n/a | Covered | /landing-pages | Need Review |
| src/pages/NotFound.tsx | * | Covered | * | Done |
| src/pages/Onboarding.tsx | /onboarding | Covered | /onboarding | Done |
| src/pages/Pipeline.tsx | /pipeline | Covered | /pipeline | Need Review |
| src/pages/Profile.tsx | /profile | Covered | /profile | Done |
| src/pages/PublishedLandingPage.tsx | /pages/:slug | Covered | /pages/:slug | Need Review |
| src/pages/Referrals.tsx | /referrals | Covered | /referrals | Need Review |
| src/pages/RootPage.tsx | / | Covered | / | Need Review |
| src/pages/Security.tsx | n/a | Covered | not routed | Out of Scope |
| src/pages/SiteConnector.tsx | /site-connector | Covered | /site-connector | Need Review |
| src/pages/SiteConnectorPage.tsx | n/a | Covered | /site-connector | Need Review |
| src/pages/Spending.tsx | /spending | Covered | /spending | Need Review |
| src/pages/Subscription.tsx | /subscription | Covered | /subscription | Not Done |
| src/pages/Team.tsx | /team | Covered | /team | Need Review |
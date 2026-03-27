# Supabase Usage Audit

Generated at: 2026-03-27T03:02:05.244Z

## Executive Summary

- Assessment snapshot: 2026-03-27T03:02:05.244Z. Generated from the current workspace state on 2026-03-27.
- Current architecture verdict: Not a single-project Supabase-Free architecture. The product currently uses one main Supabase project plus active search shard projects, so the current GTM footprint is already multi-project.
- Main project users: 26. 22 confirmed users. Approximate current-month auth actives: 11.
- Current plan mix: free: 25 | scale: 1. Pulled from user_subscriptions in the live main project.
- Local edge functions: 23. 14 functions are invoked directly from code. The rest are background or public-trigger functions.
- Search shard projects: 2. 2 reachable during this audit. Find is the largest structural reason this does not fit a one-project free-tier plan.
- Storage footprint: 0 objects / 0.00 MB. Current storage usage is tiny; cached egress is not the present bottleneck.
- Tracked main tables: 44. Largest currently tracked table: prospects (8,629 rows).
- 100 active free users on current architecture: No. Modeled monthly bandwidth is about 1.56 GB before retries, mailbox sync, and deep Find scans, but the full product still fails a Supabase-Free GTM fit because Find uses extra shard projects and the reachable shard catalog already estimates 669.96 MB of logical row payload before indexes and WAL.
- Primary uncached egress driver: Find search and public tracking. catalog-search, shard fan-out, track-email-open, track-email-click, landing-page-track, and landing-page-submit dominate the risk picture.
- Primary cached egress driver: Public avatar delivery. The only clear cached-egress path in the codebase is the public avatars bucket via getPublicUrl. The bucket is currently empty.

## Why You See Egress

1. Database API payloads [High] - Supabase counts database response bytes as bandwidth. Most workspace pages query multiple tables or RPCs on load. Evidence: Client and server code reference dozens of direct table reads across campaigns, inbox, billing, pipeline, automation, and landing-page flows.
2. catalog-search and shard lookups [Critical] - Find does not stay inside one database. Search requests fan out into active shard projects and pull prospect rows across the network before returning results. Evidence: Active search shards: 2. Approximate reachable shard logical payload: 669.96 MB.
3. Realtime channels [Medium] - Campaign, inbox, analytics, and notifications pages subscribe to live Postgres changes. This uses Realtime connection and message quotas. Evidence: Realtime subscriptions exist for campaigns, recipients, email_messages, and user_notifications across multiple pages.
4. Public tracking functions [High] - Email opens, email clicks, landing visits, and landing form submissions come from external recipients and public visitors, not only signed-in app users. Evidence: 4 public-facing tracking or submission functions are present in the deployed edge runtime.
5. Storage CDN delivery [Very Low] - Cached egress is mainly a Storage delivery concern. In this repo the only clear Storage delivery path is the public avatars bucket. Evidence: avatars bucket: 0 object(s), 0.00 MB currently stored.
6. External Node services [High] - search-service and mailbox-sync-server run outside Supabase. Every row or auth payload they fetch leaves Supabase over the network. Evidence: server/search-service.js and server/mailbox-sync-server.js both instantiate Supabase clients and query data outside the browser and edge runtime.

## Go-To-Market Recommendation

- P0: Single-project free-plan fit. Do not promise the current full product on one Supabase Free project. The current architecture depends on the main project plus search shard projects. Why: Active shard projects discovered: 2. Even before bandwidth, the current Find architecture is already multi-project.
- P0: Find search. Remove Find from the free tier, replace shard search with a non-Supabase search store, or accept that search requires paid infrastructure. Why: catalog-search is the clearest high-egress path and the current search design depends on external shard databases.
- P0: 100 free users capacity model. Do not treat the bandwidth model as proof that the full product fits Supabase Free. The stronger blockers are multi-project search, shard storage, and public-event variability. Why: Modeled monthly bandwidth for 100 active free users is about 1.56 GB before retries and deep search scans, but the current architecture still depends on external shard projects and large search datasets.
- P1: Search shard storage. Inspect shard database disk usage directly in Supabase and move the shard catalog off free projects if it is still intended for GTM. Why: Reachable shard logical row payload estimate already reaches 669.96 MB before indexes, WAL, and system overhead.
- P1: Public tracking endpoints. Treat email opens, clicks, and landing events as external traffic capacity, not just user count capacity. Why: For outbound products, recipient activity can create more edge function calls than signed-in users do.
- P1: Realtime discipline. Keep Realtime subscriptions only on pages where users genuinely need live state. Prefer manual refresh for secondary views. Why: Free-plan Realtime limits are not large once multiple dashboards, inbox views, and notification channels are open simultaneously.
- P2: Storage. Keep Supabase Storage limited to small avatars or move static assets to a dedicated CDN if public assets expand. Why: Current storage usage is low; cached egress is not your present bottleneck.
- P2: Telemetry gap. Before GTM, export actual bandwidth, edge invocation, and function log metrics from the Supabase dashboard and compare them against this modeled audit. Why: This workbook inventories architecture and live rows, but exact cycle-by-cycle bandwidth billing still requires Supabase dashboard telemetry. Largest main table: prospects (8,629 rows).
- P2: Free tier product scope. If your GTM objective is 100 free users on Supabase Free, ship a reduced free tier: auth, onboarding, profile, light CRM, and no Find, AI builder, live mailbox sync, or public tracking. Why: Current main data growth is already concentrated in prospects (8,629) and recipients (3,300), which are campaign-led, not onboarding-led.
- P3: Shard health. Stabilize or retire unreachable shard projects before launch so search quality does not degrade unpredictably. Why: All configured shard projects responded during the audit.

## Sources

- Bandwidth and egress: Free plan bandwidth is 10 GB total, split into 5 GB cached and 5 GB uncached. https://supabase.com/docs/guides/storage/serving/bandwidth
- What counts as egress: Supabase bandwidth includes data transferred from database responses, storage delivery, and edge function responses. https://supabase.com/docs/guides/storage/serving/bandwidth
- Database size: Free plan projects enter read-only mode when the database exceeds 500 MB. https://supabase.com/docs/guides/platform/database-size
- Realtime limits: Free plan Realtime limits include 200 concurrent connections and 100 messages per second. https://supabase.com/docs/guides/realtime/limits
- Pricing catalog: Use the pricing page to confirm current non-documented commercial allowances before launch planning. https://supabase.com/pricing

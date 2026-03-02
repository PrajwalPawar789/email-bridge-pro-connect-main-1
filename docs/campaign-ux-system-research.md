# Campaign UX System Research (March 2, 2026)

## Why this exists
This document captures recurring campaign UX pain points seen in major platforms, and the system-level design decisions we should apply across Campaigns, Tracker, Inbox, and Pipeline.

## Common pain points from external platforms
1. Reporting signal trust drops when bot activity and Apple Mail Privacy Protection distort open tracking.
2. Marketers report steep learning curves and crowded UI in campaign tools.
3. Users struggle to identify the next action from analytics dashboards.
4. Teams lose momentum when reply handling and pipeline qualification are spread across separate surfaces.
5. Cost sensitivity increases when teams cannot quickly identify high-impact optimizations.

## System principles for this product
1. Action first: always show a prioritized action queue above charts.
2. Trust by default: separate filtered bot activity from human engagement.
3. One workflow surface: connect metrics, replies, recipients, and pipeline in one route.
4. Low cognitive load: progressive disclosure (hero summary -> KPI cards -> tabs -> deep details).
5. Fast recovery loops: one-click paths to solve risk states (bounces, failed sends, slow reply handling).

## Implemented in Campaign Tracker
1. Campaign Health score with explicit status and priority action copy.
2. Action Queue panel with one-click routes into recipients, replies, and pipeline.
3. Tracking Quality panel that calls out filtered bot opens/clicks.
4. Sticky tab rail and simplified top hierarchy for faster navigation.
5. Pain-Point Coverage panel documenting which user pain each section solves.

## Rollout next (system-wide)
1. Campaign list page: add action queue summary per campaign and risk badges.
2. Inbox page: add SLA timers and one-click "promote to pipeline" shortcuts.
3. Pipeline page: add campaign-origin performance strip and response speed alerts.
4. Automations page: add guardrail panel for volume, bounce risk, and step delays.

## Research links
- Mailchimp: Apple Mail Privacy Protection impact on opens
  - https://mailchimp.com/help/about-apple-mail-privacy-protection/
- Mailchimp: Why open and click rates can be inaccurate (bot activity and filters)
  - https://mailchimp.com/help/about-open-and-click-rates/
- ActiveCampaign: Bot clicks and opens explained
  - https://help.activecampaign.com/hc/en-us/articles/15863706581660-Bot-clicks-and-opens
- Capterra: HubSpot Marketing Hub reviews (learning curve and complexity themes)
  - https://www.capterra.com/p/148742/HubSpot-Marketing/reviews/
- Capterra: Mailchimp reviews (usability and pricing/scale concerns)
  - https://www.capterra.com/p/127444/MailChimp/reviews/
- Capterra: Apollo reviews (data quality and workflow reliability concerns)
  - https://www.capterra.com/p/218316/Apollo/reviews/

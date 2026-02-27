# Segments Feature: Research, UX Strategy, and Implementation

Last updated: February 27, 2026

## 1. What "Segments" means in modern email marketing

Segments are reusable audience definitions built from contact attributes and behavior.  
Unlike a static upload, segment membership can update over time as users match or stop matching conditions.

Common uses:
- send targeted campaigns to high-intent cohorts
- trigger automations when users enter/exit cohorts
- exclude risky or disengaged audiences
- drive analysis (engaged users, churn-risk users, lifecycle stages)

## 2. Competitive benchmark

### Customer.io
- Supports **data-driven** (automatic) and **manual** segments.
- Data-driven segments auto-add/remove people based on conditions.
- Manual segments are controlled explicitly (CSV/API/workflow actions).
- Source:
  - https://docs.customer.io/journeys/data-driven-segments/
  - https://docs.customer.io/journeys/manual-segments/
  - https://docs.customer.io/get-started/segments-and-people-data/

### Klaviyo
- Distinguishes dynamic segments from static lists.
- Segments update from behavior/profile changes; there are known timing windows (for manual updates and relative-time windows).
- Warns that unconstrained segments can include non-consented profiles if not scoped correctly.
- Source:
  - https://help.klaviyo.com/hc/en-us/articles/115005061447
  - https://help.klaviyo.com/hc/en-us/articles/115005233488

### Mailchimp
- Supports condition-based segmentation with `and/or` logic.
- Advanced/nested segmentation depends on plan tier.
- Documents processing delays and automation constraints for advanced segments.
- Source:
  - https://mailchimp.com/help/create-and-send-to-a-segment/
  - https://mailchimp.com/help/troubleshooting-advanced-segments/
  - https://mailchimp.com/help/create-an-advanced-segment/

### Braze
- Defines segments as dynamic user groups using attributes, behavior, and events.
- Emphasizes granular criteria and nested/extension-based refinement.
- Source:
  - https://www.braze.com/docs/user_guide/engagement_tools/segments

### HubSpot (naming shift from lists -> segments)
- Explicitly separates active (dynamic) vs static segment behavior.
- Source:
  - https://knowledge.hubspot.com/lists/add-or-remove-contacts-from-a-static-list
  - https://knowledge.hubspot.com/lists/what-is-the-difference-between-saved-filters-smart-lists-and-static-lists

## 3. Recurring user pain points

- Too many filter choices create setup fatigue and incorrect logic.
- Users can’t see expected audience size before launch.
- Segment/list distinction is confusing (dynamic vs static expectations).
- Behavior windows and update timing are often unclear.
- Segment breakage after deleting dependencies causes workflow/campaign issues.
- It is easy to accidentally over-target or include wrong contacts.

## 4. UX principles applied

We implemented using these principles:

- **Hick’s Law**: reduce decision load with constrained operator sets by field type.
  - https://lawsofux.com/hicks-law/
- **Visibility of System Status**: always show estimate and sample-match preview.
  - https://www.nngroup.com/articles/ten-usability-heuristics/
- **Error Prevention**: validate incomplete rules, invalid lists, invalid lookback values.
  - https://www.nngroup.com/articles/ten-usability-heuristics/
- **Recognition rather than recall**: rule builder uses labeled fields/operators/selectors instead of requiring syntax memory.
  - https://www.nngroup.com/articles/ten-usability-heuristics/

## 5. What we implemented in this platform

### Data model + SQL runtime

Migration:
- `supabase/migrations/20260227090000_add_contact_segments_feature.sql`

Added:
- `contact_segments` table (`name`, `description`, `source_list_id`, `match_type`, `conditions`, `exclusion_conditions`)
- `campaigns.segment_id` (nullable FK to `contact_segments`)
- indexes for segment and email matching performance
- RLS policies for segment ownership
- segment evaluation SQL functions:
  - `segment_text_operator_match`
  - `segment_condition_matches`
  - `segment_matches_filters`
  - `preview_segment_count`
  - `segment_match_count`
  - `fetch_segment_prospects`
- upgraded automation enrollment function:
  - `enroll_workflow_contacts` now honors `trigger_filters.segment_id` when present

### UI: full Segments module

Component:
- `src/components/SegmentManager.tsx`

Capabilities:
- create/edit/delete segment
- include and exclude rules
- field-aware operator controls
- optional source-list scoping
- match mode (`all`/`any`)
- estimate audience size
- preview top matching contacts

Integrated into dashboard:
- `src/pages/Dashboard.tsx` (`segments` tab now mounts `SegmentManager`)

### Campaign integration

Updated:
- `src/components/CampaignBuilder.tsx`

New behavior:
- audience source now supports `list`, `segment`, `manual`
- segment selector + live segment count
- campaign stores `segment_id`
- recipients can be materialized from `fetch_segment_prospects`

### Automation integration

Updated:
- `src/lib/automations.ts`
- `src/pages/Automations.tsx`

New behavior:
- dependencies now load `contactSegments`
- list trigger supports optional **Trigger segment**
- selected segment persisted in `trigger_filters.segment_id`
- enrollment respects segment membership via SQL runtime

## 6. Segment rule schema (stored JSON)

Example include rule:

```json
{
  "field": "company",
  "operator": "contains",
  "value": "fintech"
}
```

Example behavior rule with window:

```json
{
  "field": "has_opened",
  "operator": "has",
  "lookback_days": 30
}
```

## 7. Practical outcome

This implementation gives users:
- reusable dynamic cohorts
- safer targeting via estimate + preview
- segment-driven campaign sends
- segment-constrained automation enrollment

It closes the most common segmentation gaps while staying compatible with the current list/prospect architecture.

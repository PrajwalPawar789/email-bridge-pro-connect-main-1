# Pipeline Forecasting Research

Researched on March 27, 2026.

## Goal

Add production-grade sales forecasting to the pipeline so users can answer:

- What will likely close?
- What is only upside or best case?
- Which deals are making the forecast unsafe?
- Where is pipeline hygiene breaking forecast accuracy?

## What leading platforms do

### Salesforce

Salesforce treats forecasting as a structured model, not just a chart.

- Forecasts are defined by a forecast type: object, measure, date field, and hierarchy.
- Opportunities are mapped from stage into forecast categories.
- Each category has confidence assumptions and rollup behavior.
- Close date is a first-class forecasting field.

Key takeaway for us:
- We need explicit forecast fields on each opportunity, not only stage and value.

Source:
- https://trailhead.salesforce.com/content/learn/modules/sales-forecasting/configure-sales-forecasting-in-salesforce

### HubSpot

HubSpot makes weighted forecasting operational for managers and reps.

- Weighted amount is `amount * deal probability`.
- Forecast categories can be pipeline, best case, commit, or not forecasted.
- Categories can be stage-driven, but reps can still override deal-level category.
- Forecasting is tied to time period and team goals.

Key takeaway for us:
- We should support both stage defaults and deal-level overrides.
- We need weighted revenue and category rollups.

Source:
- https://knowledge.hubspot.com/forecast/set-up-the-forecast-tool

### Pipedrive

Pipedrive makes the forecast visible directly in the deal workflow.

- Forecast view is based on expected close date.
- Weighted value is shown when stage/deal probability exists.
- Forecast is organized into date-based columns.
- Teams can drag deals to another date bucket and update expected close date.

Key takeaway for us:
- Expected close date must exist on the deal.
- Forecasting should be date-driven, not only stage-driven.

Source:
- https://support.pipedrive.com/en/article/the-forecast-view-revenue-projection

### Gong

Gong pushes forecasting beyond rollups into inspection and risk.

- Forecast boards are paired with deal boards for pipeline review before number updates.
- Deal likelihood and warnings are used to inspect forecast health.
- Risk signals include no activity, overdue, ghosted, not enough contacts, and stalled in stage.
- AI projection combines closed-won deals, weighted pipeline, and expected deals from historical patterns.

Key takeaway for us:
- A useful forecast page needs deal-level risk inspection, not just totals.
- Our first version can start with rules-based health signals and evolve into historical/AI scoring later.

Sources:
- https://help.gong.io/docs/review-your-pipeline-on-a-deal-board
- https://help.gong.io/docs/understanding-ai-deal-monitor
- https://help.gong.io/docs/understanding-ai-revenue-predictor
- https://help.gong.io/docs/explainer-about-deal-likelihood-scores
- https://help.gong.io/docs/set-up-your-pipeline-view-and-begin-forecasting

## Core forecasting concepts we should support

### 1. Pipeline is not the same as forecast

- Pipeline = all open revenue opportunities.
- Forecast = the subset and weighting of that pipeline expected to close in a defined period.

Product implication:
- We need forecast categories and close dates, not only open deal totals.

### 2. Close date drives forecast period

- A deal belongs in a forecast period because of expected close date, not because it simply exists.

Product implication:
- Every forecastable deal should have an expected close date.
- Missing or overdue close dates should be a risk signal.

### 3. Forecast category is a rep/manager judgment layer

Typical categories:

- `not_forecasted`
- `pipeline`
- `best_case`
- `commit`
- `closed`

Product implication:
- Stage can suggest the default category.
- Users still need to override category on a deal when reality changes.

### 4. Probability and weighted revenue matter

- Total amount alone overstates likely revenue.
- Weighted amount gives a more realistic rollup.

Product implication:
- Each deal should have a forecast probability.
- The system should roll up raw value and weighted value separately.

### 5. Forecasting needs risk inspection

Common risk signals:

- stale activity
- no next step
- no owner
- overdue expected close date
- low confidence on a high-value deal
- commit deal with weak hygiene

Product implication:
- Forecast view must call out at-risk deals, not hide them in the board.

### 6. Quota and coverage are important, but can be phased

- Strong tools tie forecast to quota and team goals.
- That requires a team-aware target model and period configuration.

Product implication:
- V1 can ship without full quota workflows.
- V2 should add period goals, rep/manager rollups, and submissions.

## Current state of our platform

### Already present

- Custom pipeline board and list views.
- Stage definitions with won/lost handling.
- Deal value, owner, next step, campaign, and last activity.
- Analytics view with stage distribution and pipeline value by stage.
- Basic health concepts already exist:
  - stale deals
  - needs follow-up
  - unassigned deals

### Missing for real forecasting

- No expected close date on opportunities.
- No forecast category on opportunities.
- No forecast probability on opportunities.
- No weighted revenue rollups.
- No close-date forecast buckets.
- No forecast inspection panel for risky deals.
- No goal/quota and no rep/manager forecast submission workflow.
- No history-based scoring model.

## Recommended scope

### V1: Forecast foundation

- Add opportunity fields:
  - expected close date
  - forecast category
  - forecast probability
- Expand analytics view into a real forecast workspace:
  - open pipeline value
  - weighted pipeline value
  - commit value
  - best case value
  - forecast by close-date buckets
  - at-risk deals
- Add rules-based sales intelligence:
  - stale
  - no next step
  - no owner
  - overdue close date
  - commit without strong hygiene

### V2: Forecast operating rhythm

- Forecast period selector: month / quarter
- Forecast targets / quota
- Rep and manager rollups
- Submission workflow for commit / upside / notes
- Trend vs prior submission
- Slipped deal tracking

### V3: Deeper sales intelligence

- Historical conversion by stage
- Time-in-stage benchmarks
- Stage-to-stage leakage
- AI or statistical deal score
- Forecast projection using historical close patterns

## Product decisions for implementation in this repo

### We should implement now

1. Deal-level forecasting fields in `opportunities`.
2. Forecast defaults derived from stage, but editable per deal.
3. Forecast dashboard inside the existing pipeline analytics view.
4. Rules-based forecast risk inspection.

### We should not overbuild in this pass

1. Full manager submission workflow.
2. Hierarchy-aware quota management.
3. Historical ML forecast model.

Reason:
- The current data model is not ready for a credible AI forecast engine yet.
- The right first step is to make pipeline data forecastable and inspectable.

## Implementation notes

### Schema additions

Add to `public.opportunities`:

- `expected_close_date`
- `forecast_category`
- `forecast_probability`
- `closed_at`

### UX additions

- New opportunity form should capture close date and forecast data.
- Opportunity details panel should allow editing close date, category, and probability.
- Analytics view should become a forecasting dashboard.

### Intelligence model for V1

Use rules, not fake AI:

- overdue close date
- stale activity
- missing owner
- missing next step
- high-value deal with low probability
- commit deal with poor hygiene

This gives users real sales intelligence immediately and creates better data for later AI.

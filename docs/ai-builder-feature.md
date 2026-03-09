# AI Email Builder Flow

This document is the current source of truth for the AI email template flow in this repo.
It focuses on the email builder path end to end: user prompt, thread state, model invocation, pgvector retrieval, persistence, follow-up questions, and verification.

## Scope

Current implementation lives across:

- `src/pages/EmailBuilderPage.tsx`
- `src/components/ai/AiEmailThreadPanel.tsx`
- `src/lib/aiBuilder.ts`
- `src/lib/emailBuilderPersistence.ts`
- `supabase/functions/ai-builder-generate/index.ts`
- `supabase/functions/ai-builder-generate-stream/index.ts`
- `supabase/functions/ai-builder-index/index.ts`
- `supabase/migrations/20260302120000_add_ai_builder_pgvector.sql`
- `supabase/migrations/20260304101000_fix_ai_builder_retrieval_thread_scoping.sql`

The architecture workbook at
`ai_email_landingpage_chatbox_architecture_tasks_v4_cached 1.xlsx`
was used as the target design reference.

## Current End-To-End Flow

### 1. User prompt in Email Builder

The user types in the AI chat panel inside the Email Builder page.

Frontend entry point:

- `src/components/ai/AiEmailThreadPanel.tsx`

Frontend request payload includes:

- `mode: "email"`
- `threadId` when continuing a conversation
- `instruction`
- `brief` fields like goal, audience, tone, CTA, constraints
- `current.template` when a draft is already open
- optional image attachments
- provider/model/quality preferences

### 2. Frontend calls the stream endpoint

Client helper:

- `src/lib/aiBuilder.ts`

Call order:

1. `generateAiBuilderDraftStream(...)`
2. fallback to `generateAiBuilderDraft(...)` if streaming is unavailable or fails

Important detail:

- `ai-builder-generate-stream` is not true token streaming from the model.
- It sends status events, waits for `ai-builder-generate`, then emits a short synthetic delta stream plus the final result.

### 3. Backend authenticates and resolves the thread

Backend entry point:

- `supabase/functions/ai-builder-generate/index.ts`

Flow:

1. Resolve authenticated user from bearer token.
2. Validate or create `ai_builder_threads` row.
3. Insert the user message into `ai_builder_messages`.
4. Load `ai_builder_thread_memory`.
5. Merge pinned facts from previous memory plus latest brief.
6. Load recent thread messages for continuity.

Tables involved:

- `ai_builder_threads`
- `ai_builder_messages`
- `ai_builder_thread_memory`
- `ai_builder_usage_logs`

### 4. Backend builds the working context

The generation function prepares:

- `instruction`
- `brief`
- `current` draft context
- `memorySummary`
- `pinnedFacts`
- recent messages
- retrieval snippets from pgvector

Current prompt-building helpers:

- `buildSystemPrompt(...)`
- `buildUserPrompt(...)`
- `resolveCurrentDraftPolicy(...)`

### 5. pgvector retrieval

Embeddings are stored in:

- `ai_builder_embeddings`

Retriever RPC:

- `match_ai_builder_embeddings(...)`

Current retrieval priority in `ai-builder-generate`:

1. Same-thread embeddings
2. Threadless/global saved library content
3. Cross-thread content only when the instruction explicitly asks to reuse prior work

Indexed sources today:

- saved email templates
- AI chat generated drafts indexed from the frontend after a response

Indexing path:

- `src/lib/aiBuilder.ts` -> `indexAiBuilderObject(...)`
- `supabase/functions/ai-builder-index/index.ts`

### 6. Model selection and generation

Provider selection currently supports:

- OpenAI
- Claude
- heuristic fallback

Generation behavior:

1. Use provider/model preference if available.
2. Retry provider calls.
3. Fail over between providers when possible.
4. Fall back to heuristic generation when external model calls fail.

### 7. Normalization, persistence, and return payload

After generation:

1. The result is normalized.
2. Assistant response is inserted into `ai_builder_messages`.
3. Usage is logged in `ai_builder_usage_logs`.
4. The function returns:
   - `threadId`
   - `result`
   - `references`
   - `usage`

### 8. Frontend applies the draft

`EmailBuilderPage` receives the result and builds `currentTemplate`.

Current workspace behavior:

- AI preview uses `currentTemplate.rawHtml` if present.
- Builder view uses `currentTemplate.blocks`.
- Save writes to `email_templates`.
- Save also re-indexes the template for pgvector retrieval.

## Bottlenecks Found

The main breakage was not in auth, pgvector, or thread storage. It was in the live UI contract.

### 1. Live UI used an unverified output mode

The backend E2E scripts were validating the block-based email flow.
The live chat UI was requesting `outputMode: "raw_html"`.

Impact:

- passing tests did not prove the real screen was working
- follow-up behavior and restore logic were stronger in the blocks flow than in the raw HTML flow

### 2. AI-generated drafts were not reliably editable in the builder

When the AI returned raw HTML only, the Builder workspace had no structured blocks.

Impact:

- AI preview could show content
- Builder mode could become effectively empty
- follow-up/manual-edit workflow was inconsistent

### 3. Legacy raw HTML responses could leak JSON into the preview

`resolveRawHtmlFromCandidate(...)` could treat fenced JSON output as if it were HTML when model output was malformed or wrapped unexpectedly.

Observed symptom:

- preview could show JSON text instead of the email HTML

### 4. Undo/version restore was only trustworthy in the block-based path

The deterministic restore logic was built around assistant snapshots with substantive `blocks`.

Impact:

- thread history existed
- but restore behavior was much weaker for raw HTML-only responses

### 5. Test coverage missed the actual UI contract

Existing verification scripts proved the backend blocks flow, but not the frontend path that was live in the Email Builder screen.

### 6. Additive visual edits were treated as freeform rewrites

Short follow-ups like:

- `Add usa flag`
- `Add company logo`
- `Insert hero image`

were still going through the normal generation path.

Impact:

- the existing draft could be replaced by a generic template with similar block types
- the quality score could still look good because layout overlap was high
- requested visuals like flags were not always recognized as image requirements

## Corrected Flow

The email chat flow should use a block-first contract for new generations.

### New baseline

1. Frontend requests `outputMode: "blocks"` for email chat.
2. Backend returns structured email blocks.
3. Builder stays editable immediately.
4. Follow-up questions reuse the current draft plus the same thread.
5. Undo works against thread snapshots already stored in `ai_builder_messages`.

For short additive visual edits:

1. Preserve the existing draft structure.
2. Update or insert the requested visual block deterministically when possible.
3. Only fall back to model generation when the request is broader than a simple in-place visual change.

### Legacy compatibility

For older thread messages or templates that only have raw HTML:

1. Frontend imports the HTML into editor blocks.
2. Original HTML is still preserved as `rawHtml` for preview/save fidelity.
3. Once the user edits blocks, `rawHtml` is cleared and the builder becomes the source of truth.

## What Was Implemented

### Frontend

Updated:

- `src/components/ai/AiEmailThreadPanel.tsx`
- `src/pages/EmailBuilderPage.tsx`
- `src/lib/emailBuilderPersistence.ts`

Changes:

- email AI chat now requests `outputMode: "blocks"`
- legacy raw HTML results are converted into builder blocks with `mapHtmlToEmailBuilderBlocks(...)`
- imported HTML is preserved as `rawHtml` so preview/save can keep exact markup until the user edits blocks
- loaded HTML templates now keep `rawHtml` alongside builder state

### Backend

Updated:

- `supabase/functions/ai-builder-generate/index.ts`

Changes:

- hardened raw HTML extraction so fenced JSON or reparsed payloads do not get returned as preview HTML by mistake
- prevents the common failure where the preview receives the full JSON wrapper instead of the `html` field
- added targeted follow-up edit handling so short thread instructions behave more like a chat copilot than a full regenerate
- short edit prompts now preserve the current layout and apply deeper mutations such as:
  - heading changes
  - tone/voice changes
  - add/remove CTA, quote, social, divider, signature, image, table, columns, video, and code blocks
  - add a new topic section into the current draft
  - shorten/expand the body while keeping thread continuity
- targeted edit responses now merge model-written content back into the existing draft when the user is refining rather than asking for a fresh template
- assistant replies are stored and streamed as richer natural-language thread messages instead of only terse template summaries

## Micro-Flow To Keep

Use this as the implementation rule for email chat:

1. User sends prompt with `threadId` if continuing.
2. Backend appends the user message before generation.
3. Backend builds context from:
   - pinned facts
   - memory summary
   - current draft
   - recent turns
   - same-thread retrieval first
4. Backend returns a structured email result.
5. Frontend applies blocks into the builder workspace immediately.
6. Frontend indexes the generated draft with `thread_id` metadata.
7. User follow-up uses the same `threadId` and current draft context.
8. Save persists the template and re-indexes it.

## Known Gaps Still Not Fully Solved

These are still architecture gaps, not regressions introduced by this change:

- `ai-builder-generate-stream` is still pseudo-streaming, not native provider token streaming.
- AI drafts do not yet have a dedicated artifact/version table separate from message snapshots.
- The current system uses assistant message metadata as the practical version history for AI drafts.
- The workbook's ideal `artifact_id`-centric workflow is only partially implemented today.

## Verification

Local verification run after analysis/fixes:

- `node scripts/test-ai-builder-e2e.js`
- `node scripts/test-ai-builder-conversations.js`
- `node scripts/inspect-ai-builder-stalls.js`
- `npm run build`

Additional hosted verification for follow-up editing:

- `node scripts/test-ai-builder-visual-edit.js`
- `node scripts/test-ai-builder-image-edit-revert.js`
- `node scripts/test-ai-builder-deep-edits.js`

What these checks validate:

- thread creation and follow-up continuity
- multi-turn chat persistence
- pgvector indexing path
- no stalled AI builder threads in the sampled window
- frontend TypeScript build still passes

Recommended next verification additions:

1. Add a dedicated script for the live email builder contract, including builder editability after AI generation.
2. Add a raw HTML regression test that proves fenced JSON never renders as preview HTML.
3. Keep a regression script for additive visual edits such as `Add usa flag`; this requires the updated `ai-builder-generate` function to be deployed before the check can pass against hosted Supabase.
4. Add an artifact-version table once the builder moves from message-snapshot history to explicit draft versions.

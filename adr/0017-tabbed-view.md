# ADR-0017: Tabbed view for recent memories

- **Status:** Accepted
- **Date:** 2026-11-15

## Context

The Engram Memory Viewer plugin currently shows recent sessions, observations, and prompts in a single "Recent memories" blob rendered from `mem_context`. This layout:

- Blends all three content types together, making it hard to focus on one category.
- Shows no per-type counts in the UI, so users don't know how much content exists for each type.
- Requires parsing markdown on the client to separate the sections.

Engram Cloud's dashboard browser shows separate views for "Observations", "Sessions", and "Prompts" with tab navigation and per-type counts.

## Decision

- **Three tabs** in the panel: Observations (default active), Sessions, Prompts.
- **Per-tab counts** shown as tab badges taken from the per-project stats (already available via `/v1/stats`).
- **Tabs use SDK's `mountTabs`** component (already in use by OpenChamber), providing arrow-key navigation and accessible tablist markup.
- **Observations tab**: `POST /v1/observations` → `mem_search { query: "*", response_format: "compact", project }` returns structured `results[]` with IDs, so clicking an item opens the existing detail view (markdown + Copy/Insert buttons).
- **Sessions tab**: `POST /v1/sessions` → `mem_context { project, compact: true }`, extract only the "### Recent Sessions" section (regex parse), render as markdown into a container.
- **Prompts tab**: `POST /v1/prompts` → `mem_search_prompts { query: "*", project }` returns structured `results[]` with IDs, showing a preview line and click to open full prompt with Copy/Insert.

## UI style

- **Tab list** below the project line and stats grid (already rendered by `renderRecent()`).
- **Active tab** highlighted per SDK's `oc-sdk-tab` styles.
- **Tab count badges** (e.g. "25") rendered by SDK's `oc-sdk-tab-count` inside each pill.
- **Tab content** below the tabs, rendered by existing `renderMarkdownInto` for markdown sections, `mountList` for structured lists.

## Service API (new endpoints)

| Endpoint | Method | Body | Response | Notes |
|---|---|---|---|---|
| `/v1/observations` | POST | `{ contextId, project, limit }` | `{ ok, hits[], note? }` | Uses project name as query — every row matches via indexed `project` column |
| `/v1/sessions` | POST | `{ contextId, project }` | `{ ok, document, envelopeProject? }` | Returns only "### Recent Sessions" section |
| `/v1/prompts` | POST | `{ contextId, project, limit }` | `{ ok, hits[], note? }` | Uses project name as query — every row matches via indexed `project` column; `hits[].content` carries the full untruncated prompt |

## Implementation notes

- **Project name as query**: The wildcard `"*"` query failed because Engram's LIKE fallback escapes `%`/`_`, so it matches a literal asterisk, not "everything". Both FTS tables (`prompts_fts`, `observations_fts`) index the `project` column, and LIKE disjunction also includes `project`. Querying the project name matches every row of that project. Both routes now sort hits by `created_at DESC` before returning — FTS returns BM25 relevance order, not recency.
- **Session markdown extraction**: The "### Recent Sessions" section has a predictable bullet format (`- **project** (timestamp): summary [N observations]`). Regex extraction is simple and stable.
- **Backward compatibility**: The old `/v1/recent` route is removed; it's an internal contract, so callers must update (the plugin is the only caller).
- **Bundle size**: Swapping `markdown-it` (95.9 kB min / 39.8 kB gzip) for `marked` (48.2 kB min / 14.5 kB gzip) saves ~25 kB gzip — the panel bundle is now ~137 KB raw / ~43 KB gzip (down from ~200 KB / ~73 KB).

## Alternatives considered

- **Show sessions parsed, not markdown**: The "### Recent Sessions" section is simple enough to regex-parse into `{ project, startedAt, summary, observationCount }` objects, but the markdown rendering is sufficient and less code.
- **Keep `/v1/recent` and add new tabs as additional routes**: Would have kept the old flow as fallback; eliminated to simplify the service contract.
- **Use `mem_context` with separate calls for each type**: Would require three round trips per tab switch; single `mem_search`/`mem_search_prompts` call per tab is more efficient.

## Consequences

- **Positive**: Each tab shows exactly one content type, making navigation and scanning easier.
- **Positive**: Tab counts provide immediate visibility into data volume.
- **Positive**: Observations and prompts remain clickable with the same detail experience.
- **Positive**: Bundle size reduction from library swap improves load time.
- **Positive**: Tabs follow OpenChamber's standard pattern (`mountTabs`) for consistency with the host app.
- **Neutral**: Sessions tab is markdown-rendered, not structured list — acceptable since session bullets are short and readable.
- **Neutral**: The wildcard query (`"*"`) relies on LIKE fallback; if Engram changes that behavior, this may break (unlikely, it's the documented fallback).

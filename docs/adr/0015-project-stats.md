# ADR-0015: Project stats via `mem_list_projects`

- **Status:** Accepted
- **Date:** 2026-11-15

## Context

The plugin needs to display per-project statistics (sessions, observations, prompts) in the main content area, similar to Engram Cloud's dashboard.

Candidates evaluated:
- `mem_stats` (MCP tool): returns **global-only** counts. The `project` argument only echoes context in the envelope; counts are always global.
- `mem_context` stats footer: embeds counts in a formatted text block; parsing is fragile and language/version sensitive.
- `mem_list_projects` (MCP tool): returns structured JSON with per-project `ProjectStats{name, observation_count, session_count, prompt_count, directories}`.

The Engram Cloud dashboard uses `ListProjectsWithStats` from `internal/store/store.go:9817`, which queries the SQLite tables directly and returns per-project aggregates. Since the plugin already uses the MCP interface, the same underlying query via `mem_list_projects` provides the needed stats in a stable, structured format.

## Decision

- Fetch project stats by calling `mem_list_projects` and finding the row matching the active project.
- Add a new service route `POST /v1/stats` that accepts `{ contextId, project? }` and returns `{ ok: true, stats: { sessions, observations, prompts } }` or `{ ok: true, stats: null }` if the project has no observations.
- Render the stats as three small stat items in the content area (e.g., "Sessions: 12 / Observations: 85 / Prompts: 23").
- Do not use `mem_stats` for per-project stats — it only returns global totals.

## Implementation details

- `mem_list_projects` is already on the service's `ALLOWED_TOOLS` set, so no new permissions are required.
- The project name match is case-insensitive (`LOWER(project)`), matching Engram's internal semantics.
- When `mem_list_projects` returns an empty array (new store), `stats` is `null`.
- The stats are not cached; a simple re-render on project changes keeps them fresh.

## Consequences

- **Positive:** Stable, structured stats via an existing tool; aligns with Engram Cloud's dashboard.
- **Positive:** Simple, minimal code change (new service route + panel rendering).
- **Neutral:** No global total shown by default; if needed later, `mem_stats` can be added as a separate call.
- **Neutral:** Requires one extra MCP call on project resolution, but this is acceptable given the UX benefit.

## Alternatives considered

- **HTTP `/stats?project=X`**: Would require spawning a separate HTTP server or routing through the MCP stdio, complicating the single-connection model. MCP `mem_list_projects` is simpler.
- **Parse `mem_stats` text or `mem_context` footer**: Fragile to version changes and localisation. JSON is more robust.

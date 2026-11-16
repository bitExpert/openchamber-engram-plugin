# ADR-0016: Project stats UI — show per-project sessions/observations/prompts

- **Status:** Accepted
- **Date:** 2026-11-15

## Context

The Engram Memory Viewer plugin is read-only and mirrors Engram Cloud's dashboard browser. Engram Cloud shows per-project stats (sessions, observations, prompts) prominently. Users expect similar visibility from the local plugin.

The plugin currently renders "Recent memories" from `mem_context`, but does not show aggregate counts for the active project.

## Decision

- **Add a stats grid** above "Recent memories" when the project status is `resolved`.
- **Fetch stats via `mem_list_projects`**, find the matching project row, and render the counts as stat tiles (Sessions / Observations / Prompts).
- **Load automatically**: stats are fetched as part of `renderRecent()` on every connect or project switch; no manual refresh button exists.
- **No stats grid** is shown when the project is ambiguous or undetected; tiles show `—` when the project has no memories yet.

## UI style

The tiles mirror OpenChamber's own `UsageStatsView` `StatTile` component (`packages/ui/src/components/views/usage/UsageStatsView.tsx`):

- `grid grid-cols-3 gap-2` of elevated cards
- Card: `border-radius: var(--radius)`, hairline edge (`color-mix(interactive-border 70%)`), `background: var(--surface-elevated)`, `padding: 10px 12px`
- Label: micro size (0.75rem), muted foreground, truncated
- Value: `text-xl` equivalent (1.25rem), `font-weight: 600`, `tabular-nums`, foreground

All colors resolve from the host theme tokens the SDK writes onto the iframe root (`applyHostTheme`), so the tiles follow the running app's light/dark theme without any rebuild. No plugin-invented colors are used.

## Implementation

- **Service (`service/main.ts`)**: New route `POST /v1/stats`:
  - Body: `{ contextId, project? }`
  - Calls `mem_list_projects`, finds the project row by name (case-insensitive), returns `{ ok: true, stats: { sessions, observations, prompts } }` or `{ ok: true, stats: null }`.
  - Error codes: `no-context`, `read-failed`.
- **Panel (`panel/main.ts`, `panel/index.html`)**:
  - Added `ProjectStats` interface and `stats` state variable.
  - `fetchStats()` calls `/v1/stats`, stores result in `stats`.
  - `renderStatsGrid()` renders three stat tiles (Sessions / Observations / Prompts) using the app's StatTile look.
  - `renderRecent()` awaits `fetchStats()` then renders the grid above "Recent memories" — stats appear on page load, on project switch, and when returning from a search/detail view.
  - CSS: `.stats-grid`, `.stat-tile`, `.stat-label`, `.stat-value` — all themed from host tokens.
- **Documentation**:
  - README updates: feature bullet, new `/v1/stats` row in Service API table.
  - ADR-0015: decision record for using `mem_list_projects` for per-project stats.
  - This ADR-0016: records the UI integration and refresh behavior.

## Consequences

- **Positive:** Users see aggregate counts for the active project, matching Engram Cloud's dashboard behavior.
- **Positive:** Stats load automatically on every view render — no extra click needed.
- **Positive:** The tiles are indistinguishable from the app's own usage stat tiles; they follow the active theme.
- **Neutral:** One extra MCP call on each `renderRecent()` (connect, project switch, back-from-search), acceptable given the read is cheap (`ListProjectsWithStats` is three aggregate queries).
- **Neutral:** No global total shown by default; `mem_stats` remains available if a global count is needed later.

## Alternatives considered

- **Parse `mem_stats` text**: The `mem_stats` tool returns a formatted text block with global-only counts. Parsing text is fragile and version-sensitive.
- **Parse `mem_context` stats footer**: The footer is part of a larger text block and uses a Markdown-like format; parsing is not robust.
- **Use HTTP `/stats?project=X`**: Would require spawning a separate HTTP server or routing through MCP stdio, complicating the single-connection model.
- **Show stats only in the header**: The toolbar is already tight with controls; placing stats in the content area matches Engram Cloud's browser layout.
- **Invent a custom card style**: Rejected — the plugin must blend into the default OpenChamber UI. The app's own `StatTile` (usage view) provides the exact pattern, and the SDK's host theme tokens (`--surface-elevated`, `--interactive-border`, `--surface-muted-foreground`, `--radius`) make it theme-aware without a rebuild.

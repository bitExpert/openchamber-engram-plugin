# ADR-0018: Session details page

- **Status:** Accepted
- **Date:** 2026-11-15

## Context

The Engram Memory Viewer plugin's sessions tab currently renders markdown bullets from `mem_context`. Each bullet shows the project name, start timestamp, summary (truncated), and observation count, but there is **no way to drill down** into a session's details or see its connected observations and prompts.

Engram 3.7.0 provides:

- `mem_context` returns markdown with session bullets that contain no session IDs.
- `mem_search` compact projection omits `session_id` and `created_at` — it is not a viable source.
- `mem_search_prompts` returns `session_id`, but only prompts linked to sessions that had prompts.
- `engram export <file> --project <name>` (CLI) returns structured JSON with `sessions[]` (id, started_at, ended_at, summary, directory), `observations[]` and `prompts[]` each with `session_id`.

No MCP tool exposes session IDs directly, so the only viable read-only source for session IDs is `engram export`.

## Decision

- Implement `POST /v1/sessionDetail` service endpoint with body `{ contextId, project, sessionId }`.
- Use `engram export` (via `execFile`) to fetch structured session data for a project.
- Cache export results for 30 seconds per `(contextId, project)` combo to avoid re-export on tab/detail clicks.
- Change `POST /v1/sessions` response shape from markdown to `{ ok, sessions: [{ id, startedAt, endedAt, summary, directory, observationCount, promptCount }] }`.
- Panel: switch sessions tab from `renderMarkdownInto` to `mountList`, with click → `showSessionDetail(sessionId)`.
- Session detail view shows:
  - Details (start, end, directory, counts)
  - Summary (rendered as sanitized markdown)
  - Observations list (click → `showDetail(id)`)
  - Prompts list (click → `showPromptDetail(hit)`)
- Back navigation: stack-based so Back from obs/prompt returns to session detail; Back from session detail returns to Sessions tab.
- No Copy/Insert actions for session summary (viewing only).

## Alternatives rejected

- **Parsing `mem_context` markdown** — session bullets contain no session ID, so no way to link to detail view.
- **MCP-only approach (N+1 queries)** — `mem_search_prompts` returns `session_id` but doesn't cover all sessions; even if it did, calling `mem_search`/`mem_search_prompts` for each session ID to get counts would be O(N) and slow.
- **Keep old `/v1/sessions` response shape** — would break the new session detail functionality (panel needs structured data to render a list).

## Consequences

- **Service reads sessions via `engram export`** — a read-only operation (enforced by `ALLOWED_TOOLS` allowlist), compatible with ADR-0004.
- **Export has no session filter** — a very large project pays a full-project export per fetch. Mitigated by:
  - 30-second cache per `(contextId, project)` combo
  - 8-second timeout on `execFile`
  - Small in-memory JSON object (~few KB typical)
- **Observation count includes all observations** — including `session_summary` observations (saved via `mem_session_summary`), which appear in the session detail's observation list.
- **Prompt count includes all prompts** — every prompt in Engram is linked to a session, so the export provides the complete picture.
- **Breaking change** — `/v1/sessions` response shape changes from `{ ok, document }` (markdown) to `{ ok, sessions: [] }` (structured). Panel caller updated in this change.

## Implementation notes

- Service: `exportProject(ctx, project)` helper uses `execFile(executable, ['export', tmpFile, '--project', project], { env, timeout: 8000 })`.
- Temp file in `/tmp/opencode/engram-export-*.json`, cleaned up in `finally`.
- Cache key: `contextId + ":" + project`.
- Error handling: `not-found` when export returns non-zero, `read-failed` for other errors, `unknown-session` when no matching session in export.
- Ownership guard: if export's `session.project` ≠ bound `project`, return `{ ok: false, code: 'project-mismatch' }`.

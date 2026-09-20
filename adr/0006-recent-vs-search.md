# ADR-0006: Recent view is display-only; search is the interactive path

- **Status:** Accepted
- **Date:** 2026-09-20

## Context

`mem_context` bullets carry **no IDs**, so a recent view cannot be the entry point to detail. An empty-query `mem_search` **fails** (`fts5: syntax error near ""`), so an "everything" search is unavailable. `mem_search` with `match_mode:"all"` (default) is FTS5 AND-semantics, so multi-token phrases like "JWT N+1" return *No memories found*.

## Decision

- **Recent** = render the bounded `mem_context` document (`compact: true`, `max_bytes` default 16384, clamp 65536) as a clearly-marked, display-only summary of the project's recent memory. No IDs, no click-through.
- **Search** is the interactive path to detail. It requires a non-empty query, is project-scoped, and rejects `all_projects`.
- UI exposes a **limit** (10/20; tool max 20) and an **any/all match toggle** surfaced as "broader search" (because the default `all` reasoning is unintuitive).
- `results[]` IDs come from the structured `results` array — never regex, never guessed. Optional fields that are absent (e.g. `review_after`, dates) stay absent; never invented.

## Consequences

- **Positive:** Each surface does one honest job: Recent is a summary, Search is a scoped index.
- **Positive:** Version-unsafe paths (empty-query search, regex IDs) are designed out.
- **Negative:** Users cannot jump to detail from Recent; they must search first.
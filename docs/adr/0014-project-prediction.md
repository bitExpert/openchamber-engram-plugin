# ADR-0014: Project prediction from `mem_current_project` with an ambiguity picker

- **Status:** Accepted
- **Date:** 2026-10-17

## Context

ADR-0005 binds each request to a project and re-checks ownership from the `Project:` line of an observation; ADR-0007 gives each Engram child a lifecycle keyed by directory and config revision. Both assume the service already knows *which* project is active.

The service asked `mem_current_project` once, at connect, and used only its `project` field. `project_source`, `project_path`, and `available_projects` were discarded, and when detection came back empty the panel simply sent queries with no project — Engram then resolved the project per call, which is exactly the unpredictable case the feature is meant to remove. There was also no way to see or correct the active project from the panel; the only control was editing `projectOverride` in settings blind.

Engram 3.4 returns a richer envelope and does **not** fail on ambiguity. It reports `project: ""` with `project_source: "ambiguous"` (or a git/history conflict under `git_remote`) plus `available_projects` and an `error_hint`.

## Decision

- **Ask with an explicit directory.** The service calls `mem_current_project` with `{ directory }` (the panel's working directory) rather than relying only on the child's cwd.
- **Classify a status.** `/v1/connect` returns `projectStatus`:
  - `resolved` — a project was detected (`project_source !== "ambiguous"`).
  - `ambiguous` — no project but candidates are available.
  - `unknown` — nothing detected and no candidates.
  It also returns `projectPath`, `errorHint`, and `candidates` (from `available_projects`, falling back to `mem_list_projects`).
- **Resolve ambiguity, don't guess.** When `projectStatus !== "resolved"` the panel renders a project picker built from `candidates` and does not issue `/v1/recent` or `/v1/search`. Choosing a project persists `projectOverride`, which forces `ENGRAM_PROJECT` and is reported back as `project_source: "process_override"`. A **Clear override** action removes it and returns to auto-detection.
- **Show the active project.** The content view displays `Project: <name> · <source>` so the bound project and its origin are always visible.
- **Fix the context id.** The id now hashes directory plus the full spawn key (`executable`, `dataDir`, `projectOverride`). A `??`/`+` precedence slip had dropped `dataDir`/`projectOverride` whenever an `executable` was set, so a changed mapping could reuse the old child — contradicting ADR-0007.

## Consequences

- **Positive:** Queries are always project-scoped against a known project; the silent unscoped fallback is gone.
- **Positive:** The active project and how it was chosen are visible, and a wrong or ambiguous detection can be corrected from the panel.
- **Positive:** The context id now reflects the full spawn configuration, matching ADR-0007's intent.
- **Neutral:** No new tools, permissions, or transports — the picker only affects query arguments; the extension stays read-only.
- **Negative:** A chosen override persists in guest storage until cleared, so it silently applies to later sessions.
- **Negative:** Each distinct `(directory, spawn key)` pair is its own Engram child; switching across more than two at once can hit the service's context limit until idle expiry.

# ADR-0005: Project binding and observation ownership

- **Status:** Accepted
- **Date:** 2026-09-20

## Context

Critical spike finding: for `mem_get_observation`, the **envelope `project` is the process/cwd project, NOT the observation's project**. The observation's real project is the `Project: …` line **inside the `result` text** (parsed envelope), not the envelope's `project` field. Cross-project read leakage must be prevented. Worktrees and multiple similar-named projects make folder-base-name resolution ambiguous.

## Decision

- Spawn Engram with `cwd = active directory`; when a manual mapping is saved, also set `ENGRAM_PROJECT=<name>` as a process-level override (this is how `mem_get_observation`, which accepts no per-call project, stays scoped).
- `mem_search`/`mem_context`/`mem_timeline` pass an explicit, validated `project` where supported.
- Detail (`getMemory`) accepts **only IDs issued by a scoped search in the current context** (issued-ID check), and the service **re-checks the returned `Project:` line** against the bound project before returning content.
- The ownership parse runs on the **parsed envelope result** (`projectOfDetail(parsed)`); matching against the raw envelope JSON text fails because `\n` is escaped. This is a live-found bug fix.
- A mismatch returns `project-mismatch`; no data crosses project boundaries.

## Consequences

- **Positive:** A full dual-ownership model (issued-IDs + result-`Project:` line re-check) prevents cross-project reads even under aggressive edge cases.
- **Positive:** Live-verified: an observation from another project is refused (`project-mismatch`); an in-project observation renders.
- **Negative:** Detail is only reachable from search results — there is no arbitrary-ID lookup. This is intentional.
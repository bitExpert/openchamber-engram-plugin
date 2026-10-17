# ADR-0013: Engram floor raised to >= 3.4.0 and surfaced in the panel title bar

- **Status:** Accepted
- **Date:** 2026-10-17

## Context

ADR-0003 set the Engram floor at `>= 2.0`, auto-detected from `engram --version`, with an explicit unsupported-version state for older installs. Since then Engram has shipped a series of releases through v3.4.0 (2026-10-12). The extension relies on read tools whose envelope shape — `mem_current_project`, `mem_list_projects`, and the compact `mem_context` / `mem_search` documents — is verified against the modern surface. Supporting the old 2.x contract alongside 3.4 adds adapter and fixture work for no user benefit.

Separately, users had no at-a-glance indication of which Engram the panel was talking to; the detected version was only visible as a transient status line.

## Decision

- **Raise the Engram floor to `>= 3.4`** (`major.minor >= 3.4`), still auto-detected from `engram --version` via the `exec` grant. Older installs get the explicit **unsupported-engram** state (now carrying the detected `version` and the `required` floor in the response).
- **Show the detected version in the panel title bar.** The toolbar/header renders the product name plus a `vX.Y.Z` label (parsed from the raw `engram --version` output). It reads `v?` while connecting, on failure, or when the version cannot be parsed.
- The version is presented only in the title bar; the per-connect status line no longer repeats it.

## Consequences

- **Positive:** One verified contract (Engram v3.4.0+); the unsupported state names the exact floor the user must meet.
- **Positive:** The running Engram version is visible at a glance without hunting through status text.
- **Negative:** Engram users below 3.4 cannot use the extension; they get an explicit state rather than silent breakage.
- **Neutral:** No new permissions — the version probe reuses the existing `exec` grant for `engram`.

# ADR-0003: Version floor — Engram >= 2.0.0, OpenChamber >= 1.22.0

- **Status:** Accepted
- **Date:** 2026-09-20

## Context

The Phase 0 spike ran against Engram `v2.0.0` (released 2026-09-18). The user's installed system Engram was **1.20.0**, which showed a different envelope/feature surface than v2.0.0. Supporting two very different contracts in one v0.1 would double adapter and fixture work. OpenChamber's extension-owned service API exists from 1.22.0 onward.

## Decision

- **Engram floor `>= 2.0`** (`major.minor >= 2.0`), auto-detected from `engram --version`. Older installs get an explicit **unsupported-version** state — no second adapter, no guessing.
- **OpenChamber `engines.openchamber >= 1.22.0`** in the manifest; older hosts are refused at install with `host-too-old`.
- The extension targets OpenChamber **1.x only** (1.24.2 live-verified). OpenChamber 2 / OpenCode 2 are out of scope.

## Consequences

- **Positive:** One well-tested contract (Engram v2.0.0 and current 1.x) instead of speculative support.
- **Positive:** `host-too-old` semantics come free from the manifest engine check on the OpenChamber side.
- **Negative:** Engram users below 2.0 and OpenChamber users below 1.22 cannot use the extension; they get an explicit state rather than silent breakage.
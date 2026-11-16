# ADR-0007: Context lifecycle — one Enram child per (directory, config revision)

- **Status:** Accepted
- **Date:** 2026-09-20

## Context

Each (active directory + configuration revision) represents a distinct Engram scope. Spawning per request would be wasteful and racy; holding one global child would mix projects under project switches. The env supplies `cwd`; the process-level project override must map to a stable context.

## Decision

- One Engram child per active `(directory, configRevision)` context, keyed by `contextId = hash(directory + configRevision)`.
- Panel and page share a context via reference counting; at most **two live contexts** open.
- Idle contexts are closed after **60 s**; on process failure the transport is closed and the UI offers reconnect.
- Every service response carries its context token; **stale responses are dropped** so a late project-A hit can never repopulate project B.
- Deadlines: service startup ≈ 12 s max, per-read MCP call ≈ 8 s max, under the host bridge's `HOST_TIMEOUT` (20 s) and health poll (15 s).

## Consequences

- **Positive:** Cheap, isolated, correct project scoping; guaranteed isolation under project switches.
- **Positive:** Idle release keeps the child count bounded.
- **Negative:** First read after a 60 s idle close pays a respawn cost.
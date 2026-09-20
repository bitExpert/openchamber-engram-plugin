# ADR-0004: Read-only policy — service-enforced allowlist

- **Status:** Accepted
- **Date:** 2026-09-20

## Context

`engram mcp --tools=agent,admin` advertises **23 tools**, including mutators (`mem_save`, `mem_update`, `mem_delete`, `mem_merge_projects`, `mem_session_*`, `mem_pin`, `mem_review`, `mem_judge`, …). A read-only product cannot rely on hiding buttons in the UI: the enforcement point must be the service, out of reach of the sandboxed iframe. The Phase 0 spike also verified the read side makes no durable writes (all table row-counts byte-identical after a full read session on an existing store; a fresh store is created at boot).

## Decision

- The service exposes **no way to supply a tool name**. The UI calls purpose-built operations only (`recent`, `search`, `getMemory`, …).
- The service enforces a fixed read-only allowlist: `mem_current_project`, `mem_list_projects`, `mem_context`, `mem_search`, `mem_get_observation`, `mem_timeline`, `mem_stats`.
- Every non-allowlisted tool call is rejected by the service, even though discovery advertises it.
- "Read-only" means **no intentional memory mutations by this extension**; it is not a zero-filesystem-write guarantee (Engram may initialize/migrate a fresh store, create bindings, or do background work).

## Consequences

- **Positive:** Strong security posture; the sandbox cannot escalate to mutation even if compromised.
- **Positive:** The read-only claim is backed by a measured (byte-identical) spike result, documented rather than asserted.
- **Negative:** No mutation features by design; the extension cannot offer fixes, imports, or repairs.
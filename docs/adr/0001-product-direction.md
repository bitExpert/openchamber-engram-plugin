# ADR-0001: Product direction — Engram Memory Browser for OpenChamber

- **Status:** Accepted
- **Date:** 2026-09-20

## Context

The team originally proposed a "Bifrost Inspector" extension. Research showed a stronger, simpler value proposition: browse what the agent has remembered about the active project, find relevant knowledge, and choose what to bring into the conversation.

Engram's local store is shared across its interfaces, and `engram mcp` exposes a read surface without any HTTP server, gateway URL, or API token. OpenChamber 1.x supports extension-owned services and host-API bridges that fit this without touching the OpenCode MCP process.

Product promise: **See what the agent has remembered about this project, find relevant knowledge, and choose what to bring into the conversation.**

## Decision

Build a community-distributable OpenChamber extension, **Engram Memory Browser**, that:

- Reads Engram memories for the active project and renders full memory content as safely rendered Markdown.
- Is **read-only**: no memory creation, edits, deletion, pinning, review-state updates, session registration, imports, sync, repair, or schema migration.
- Includes recent context, search, full details, copy, and an explicit "Insert into chat" action.
- Makes executable location, data directory, and project mapping configurable.
- Requires no Engram HTTP server, gateway URL, or API token.

This replaces the Bifrost Inspector proposal as the current product direction.

## Consequences

- **Positive:** Tight, valuable scope; read-only posture minimizes trust surface; no network credentials to manage.
- **Positive:** Works against the store the agent already writes to, with an independent, user-approved connection.
- **Negative:** No memory-mutation features by design; remote/custom Engram MCP setups are outside v0.1.
- **Neutral:** The extension does not claim a displayed memory was loaded into the model context or influenced a reply.
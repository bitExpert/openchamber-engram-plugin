# ADR-0002: Integration transport — Engram MCP over stdio (JSONL)

- **Status:** Accepted
- **Date:** 2026-09-20

## Context

Engram exposes MCP via `engram mcp`. Two transport options existed:

1. Speak MCP over spawn'd stdin/stdout (no HTTP server, no API token).
2. Run some Engram HTTP server or gateway and authenticate with a token.

The Phase 0 spike measured the wire protocol directly and found that `engram mcp` reads/writes **raw JSON objects separated by `\n`** (JSONL). LSP `Content-Length:` framing produces a Parse error (`-32700`). MCP `serverInfo.version` is a **hardcoded "0.1.0"**, useless for capability detection.

## Decision

- The extension's service **spawns `engram mcp`** (`shell: false`) and speaks MCP over stdio using **newline-delimited JSON**, via a `StdioClientTransport` with JSONL framing (or a hand-rolled `\n`-split parser).
- Never use Content-Length-framed MCP framing.
- No Engram HTTP server, no gateway URL, no API token.
- The service opens its **own** MCP connection; it never attaches to OpenCode's running MCP process.
- Engram version is detected from `engram --version` (`engram 2.0.0`), **never** from MCP `serverInfo.version`.

## Consequences

- **Positive:** No credentials or network surface; loopback service + stdio child only.
- **Positive:** Matches the measured v2.0.0 binary exactly (verified live).
- **Negative:** Requires the `engram` binary (or a configured absolute path) on the OpenChamber execution host; remote/container hosts must have it there.
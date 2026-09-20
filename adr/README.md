# Architecture Decision Records — Engram Memory Browser

Decision records recorded on 2026-09-20. The product is implemented and live-verified (OpenChamber 1.24.2, Engram 2.0.0) as of this date; these records describe the architecture as built.

## Index

| ID | Decision | Status |
| --- | --- | --- |
| [0001](0001-product-direction.md) | Product direction — Engram Memory Browser for OpenChamber (replaces Bifrost proposal) | Accepted |
| [0002](0002-mcp-stdio-jsonl.md) | Integration transport — MCP over stdio, JSONL framing, no HTTP server/API token | Accepted |
| [0003](0003-version-floor.md) | Version floor — Engram >= 2.0.0, OpenChamber >= 1.22.0, explicit unsupported state | Accepted |
| [0004](0004-read-only-allowlist.md) | Read-only policy — service-enforced tool allowlist | Accepted |
| [0005](0005-project-ownership.md) | Project binding and observation ownership (`Project:` line re-check) | Accepted |
| [0006](0006-recent-vs-search.md) | Recent is display-only; search is the interactive path to detail | Accepted |
| [0007](0007-context-lifecycle.md) | Context lifecycle — one Engram child per (directory, config revision) | Accepted |
| [0008](0008-service-contract.md) | Service HTTP contract — loopback, Bearer auth, `{ok:true}` envelopes | Accepted |
| [0009](0009-markdown-sanitization.md) | Markdown rendering — markdown-it + DOMPurify, `http(s)`-only links | Accepted |
| [0010](0010-copy-insert.md) | Copy / Insert — explicit composer append, never auto-send | Accepted |
| [0011](0011-packaging-capabilities.md) | Packaging — ship built assets, request only the `service` capability | Accepted |

## Convention

Numbered `<0001>-<slug>.md`, one decision per file. Format: `Status`, `Date`, `Source`, `Context`, `Decision`, `Consequences`. New records append to the highest number + 1; superseded records get their status updated to `Superseded by <ID>` rather than deleted.
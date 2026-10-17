# OpenChamber Engram Memory Browser Plugin

[![Mastodon Follow](https://img.shields.io/mastodon/follow/109408681246972700?domain=https://rheinneckar.social)](https://rheinneckar.social/@bitexpert)

A read-only OpenChamber extension that browses and searches [Engram](https://github.com/Gentleman-Programming/engram/) memories for the active project. Recent context, project-scoped search, and full observation detail are rendered as sanitized HTML/Markdown, with copy and insert-to-chat actions.

## Features

- **Recent** — renders the `mem_context` document (display-only bullets, no ids) as Markdown.
- **Search** — project-scoped `mem_search` with a match toggle (all/any) and a result limit (10/20).
- **Detail** — full observation (`mem_get_observation`) rendered as sanitized HTML; Markdown headings, lists, tables, code, blockquotes, links, images.
- **Copy / Insert** — copy the raw observation or insert it into the chat composer.
- **Project bound** — the active project is resolved via `mem_current_project` (git remote, `.engram` config, or an explicit override) and shown at the top of the view; queries are project-scoped. When Engram cannot decide (multiple projects match, or a git/history conflict) the panel offers a project picker instead of guessing. Ownership is enforced service-side from the observation's `Project:` line; cross-project memories return a `project-mismatch` error.
- **Version in the title bar** — the panel header shows the detected Engram version (`v3.4.0`); the extension requires Engram `>=3.4.0`.
- **Read-only** — only read tools are exposed; nothing is ever written to the Engram store.

## Requirements

- **OpenChamber 2.x** — `>=2.3.0`, built with `@openchamber/sdk@2.3.3` (wire API v1 compatible back to 1.22.0). Remote markdown images in observations render as links (opened in your browser) due to OpenChamber 2.0.4+ network sandboxing.
- **Engram `>=3.4.0`** — the `engram` executable must be on `PATH` (extension checks the version; older versions get an explicit unsupported-version state naming the required floor). The detected version is shown in the panel title bar.

## Install

From **Settings → Extensions → Add**:

1. **Folder** — add this repository root. Folder installs run from your folder, so you can edit, rebuild, and reload without re-installing.
2. **Local ZIP** — zip the repo and add the file (`source: "zip"`).
3. **HTTPS Git/ZIP URL** — OpenChamber copies the build into its data folder; append `#branch-or-tag` to pin a ref.

After install, approve the **service** capability in the extension card. The service is spawned on the first request (status `stopped` → `starting` → `ready`; ready means `GET /health` returns 200). The panel connects automatically; if it cannot, use the card's setup screen to point the extension at the right executable/data directory.

## Build from source

The sandbox frame cannot load ES modules, so `panel/main.js` must be a built classic IIFE.

```bash
bun install
bun run bundle:panel    # panel/main.ts -> panel/main.js (IIFE)
bun run bundle:service  # service/main.ts -> service/main.js (node)
bun run bundle          # both
```

- OpenChamber never compiles your code — you build `main.js` yourself (`openchamber-guest-bundle`).
- After rebuilding the **service**, restart it by pausing and re-enabling the guest (Settings → Extensions, or `PUT /api/guests/engram-memory/enabled`).
- The **panel** script is served statically by the host, so a browser reload picks up a new bundle without a service restart.

## Configuration

Guest storage key `config/v1` (set from the extension settings or panel setup screen):

| Key               | Default    | Effect                                  |
| ----------------- | ---------- | --------------------------------------- |
| `executable`      | `engram`   | Path to the Engram binary               |
| `dataDir`         | *(unset)*  | Sets `ENGRAM_DATA_DIR` for the service  |
| `projectOverride` | *(unset)*  | Sets `ENGRAM_PROJECT` for the service (forces a project) |

The Engram child is always spawned with `mcp --tools=agent,admin` so read-only admin tools (`mem_timeline`, `mem_stats`) are discoverable; every other tool call is rejected by the service.

### Project detection

The active project is whatever `mem_current_project` reports for the panel's working directory — normally the git remote, or the directory name when there is no repository. `/v1/connect` returns a `projectStatus`:

- `resolved` — a project was detected; queries run against it.
- `ambiguous` — multiple projects match the directory (Engram returns `available_projects` and an `errorHint`); the panel shows a picker.
- `unknown` — nothing was detected; the panel shows a picker fed by `mem_list_projects`.

Picking a project writes `projectOverride`, which forces `ENGRAM_PROJECT` for the service. The project line at the top of the view shows the active project and how it was chosen, with a **Clear override** action to return to auto-detection.

## Service API

Loopback HTTP service, authenticated with `Authorization: Bearer <OPENCHAMBER_SERVICE_TOKEN>`.

| Route            | Purpose                                   |
| ---------------- | ----------------------------------------- |
| `/v1/connect`    | Spawn Engram, version check, resolve project (`project`, `projectStatus`, `projectPath`, `candidates`, `version`) |
| `/v1/recent`     | Display-only `mem_context` document       |
| `/v1/search`     | Project-scoped `mem_search` hits          |
| `/v1/getMemory`  | Full observation Markdown for an id       |
| `/v1/disconnect` | Kill the child and shut down              |

All replies are `{ ok: true, ... }` on success or `{ ok: false, code, message }` on failure. Codes: `no-context`, `empty-query`, `project-mismatch`, `invalid-id`, `read-failed`, `unsupported-engram`, `service-error`.

## Security notes

- The service listens on loopback only and requires the host-minted bearer token on every request, including `/health`.
- The extension requests only the `service` capability; it has no `filesystem`, `network`, or `prompt` grants.
- Read operations are an allowlist enforced in the service (`mem_current_project`, `mem_list_projects`, `mem_context`, `mem_search`, `mem_get_observation`, `mem_timeline`, `mem_stats`). Read-only MCP calls make no durable writes to the Engram store.
- Ownership of a `mem_get_observation` result is taken from the `Project:` line in the result text — never the process envelope — so you only ever see memories from your active project.
- As with any OpenChamber service, there is no sandbox: the allowed service runs with the user's full access (the grant card says so).
- **Enterprise mode:** in enterprise environments that restrict extension installations, extensions carrying a `service` may only be installed from admin-listed git repositories. The panel does not request `network` or `origins` permissions.

## Repository layout

```
panel/        Frontend: index.html, main.ts (UI), markdown.ts (renderer), main.js (built)
service/     Backend: main.ts (HTTP service + MCP client), main.js (built)
adr/          Architecture Decision Records
fixtures/     Wire fixtures captured from Engram 2.0.0
```

Design decisions are recorded as Architecture Decision Records in [`adr/`](adr/README.md).

## Contribute

Please feel free to fork and extend existing or add new features and send a pull request with your changes! To establish
a consistent code quality, please provide unit tests for all your changes and adapt the documentation.

## Want To Contribute?

If you feel that you have something to share, then we’d love to have you.

## License

The OpenChamber Engram Memory Browser Plugin is released under the MIT License.

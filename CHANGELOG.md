# Changelog

All notable changes to this project will be documented in this file, in reverse chronological order by release.

## 0.4.0

- **Project prediction via `mem_current_project`:** `/v1/connect` now asks Engram with the panel's explicit `directory`, and classifies the result as `projectStatus` — `resolved` (a project was detected), `ambiguous` (multiple projects match, or a git/history conflict), or `unknown` (nothing detected). The reply also carries `projectPath` and the `errorHint` Engram supplies for conflicts.
- **Ambiguity is resolved, not guessed:** when the project is not `resolved`, the panel shows a project picker built from Engram's `available_projects` (falling back to `mem_list_projects`) instead of firing unscoped queries. Choosing a project persists `projectOverride`, reconnects, and can be cleared with **Clear override**.
- **Active project is visible:** the content view shows `Project: <name> · <source>` (e.g. `detected via git remote`, `explicit override`), so which project is being browsed is never implicit.
- **Context id fix:** the Engram child's context id now hashes the full spawn key (directory + executable + data dir + project override). Previously an `??`/`+` precedence slip dropped the data dir and project override whenever an executable was configured, so changing the project mapping reused the wrong child process.
- **Client metadata:** service `clientInfo.version` bumped to 0.4.0.

## 0.3.0

- **Engram floor raised to `>= 3.4.0`:** the version probe now requires Engram 3.4 or later; older installs get the explicit `unsupported-engram` state, which now returns both the detected `version` and the `required` floor so the panel can name the exact requirement.
- **Version in the title bar:** the panel header shows the detected Engram version (e.g. `v3.4.0`); it reads `v?` while connecting, on failure, or when the version cannot be parsed. The per-connect status line no longer repeats the version. The header is laid out as a title row (product name, version, and search controls) with the status badge directly beneath the title, aligned with the search input and select controls.
- **Client metadata:** service `clientInfo.version` bumped to 0.3.0.

## 0.2.0

- **OpenChamber 2.x compatibility:** raised minimum OpenChamber to 2.3.0, rebuilt against `@openchamber/sdk@2.3.3`. Wire protocol remains API v1 compatible with 1.22+ but no longer verified against older 1.x releases.
- **Remote image handling:** render remote Markdown images as links (opened via `host.openUrl`) to satisfy OpenChamber 2.0.4+ network sandbox; no `origins` or new capabilities requested.
- **Client metadata:** service `clientInfo.version` bumped to 0.2.0.

## 0.1.0

Initial release.

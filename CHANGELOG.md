# Changelog

All notable changes to this project will be documented in this file, in reverse chronological order by release.

## 0.3.0

- **Engram floor raised to `>= 3.4.0`:** the version probe now requires Engram 3.4 or later; older installs get the explicit `unsupported-engram` state, which now returns both the detected `version` and the `required` floor so the panel can name the exact requirement.
- **Version in the title bar:** the panel header shows the detected Engram version (e.g. `v3.4.0`); it reads `v?` while connecting, on failure, or when the version cannot be parsed. The per-connect status line no longer repeats the version. The header is laid out as a title row (product name, version, and search controls) with the status badge on its own row beneath.
- **Client metadata:** service `clientInfo.version` bumped to 0.3.0.

## 0.2.0

- **OpenChamber 2.x compatibility:** raised minimum OpenChamber to 2.3.0, rebuilt against `@openchamber/sdk@2.3.3`. Wire protocol remains API v1 compatible with 1.22+ but no longer verified against older 1.x releases.
- **Remote image handling:** render remote Markdown images as links (opened via `host.openUrl`) to satisfy OpenChamber 2.0.4+ network sandbox; no `origins` or new capabilities requested.
- **Client metadata:** service `clientInfo.version` bumped to 0.2.0.

## 0.1.0

Initial release.

# Changelog

All notable changes to this project will be documented in this file, in reverse chronological order by release.

## 0.2.0

- **OpenChamber 2.x compatibility:** raised minimum OpenChamber to 2.3.0, rebuilt against `@openchamber/sdk@2.3.3`. Wire protocol remains API v1 compatible with 1.22+ but no longer verified against older 1.x releases.
- **Remote image handling:** render remote Markdown images as links (opened via `host.openUrl`) to satisfy OpenChamber 2.0.4+ network sandbox; no `origins` or new capabilities requested.
- **Client metadata:** service `clientInfo.version` bumped to 0.2.0.

## 0.1.0

Initial release.

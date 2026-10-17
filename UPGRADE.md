# UPGRADE

## 0.2.0 → 0.3.0

- **Engram floor raised:** the extension now requires **Engram `>= 3.4.0`** (was `>= 2.0.0`). Installs below 3.4 get the explicit unsupported-version state and cannot connect.
- **New `required` field:** the `unsupported-engram` reply from `/v1/connect` now carries the required floor (`required`) alongside the detected `version`, so the panel names the exact version to upgrade to.
- **Version shown in the title bar:** the panel header now displays the detected Engram version (e.g. `v3.4.0`).
- **Rebuild required:** `bun install && bun run bundle` to generate updated `panel/main.js` and `service/main.js`.
- **Restart the service:** pause and re-enable the guest (Settings → Extensions) so the rebuilt `service/main.js` is reloaded.

## 0.1.0 → 0.2.0

- **OpenChamber floor raised:** `engines.openchamber` changed from `>=1.22.0` to `>=2.3.0`. OpenChamber 1.x is no longer officially supported.
- **SDK updated:** built against `@openchamber/sdk@2.3.3` (wire API v1 remains compatible with 1.22+, but verify against your target host).
- **Remote images:** Markdown images in observations are rendered as links (opened via `host.openUrl`) due to OpenChamber 2.0.4+ network sandbox; inline remote images no longer load.
- **Rebuild required:** `bun install && bun run bundle` to generate updated `panel/main.js` and `service/main.js`.
- **Re-approve if needed:** upgrading may prompt for re-approval of permissions in Settings → Extensions.

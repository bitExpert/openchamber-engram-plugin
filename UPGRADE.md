# UPGRADE

## 0.1.0 → 0.2.0

- **OpenChamber floor raised:** `engines.openchamber` changed from `>=1.22.0` to `>=2.3.0`. OpenChamber 1.x is no longer officially supported.
- **SDK updated:** built against `@openchamber/sdk@2.3.3` (wire API v1 remains compatible with 1.22+, but verify against your target host).
- **Remote images:** Markdown images in observations are rendered as links (opened via `host.openUrl`) due to OpenChamber 2.0.4+ network sandbox; inline remote images no longer load.
- **Rebuild required:** `bun install && bun run bundle` to generate updated `panel/main.js` and `service/main.js`.
- **Re-approve if needed:** upgrading may prompt for re-approval of permissions in Settings → Extensions.

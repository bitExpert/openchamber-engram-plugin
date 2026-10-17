# ADR-0012: OpenChamber 2.0.4 network CSP — render remote images as links

- **Status:** Accepted
- **Date:** 2026-10-17

## Context

OpenChamber 2.0.4 introduced a Content Security Policy for guest extension pages that blocks the extension from reaching the network directly (see changelog 2.0.4 and `guestFramePolicy` in `@openchamber/sdk@2.3.3`). Remote `<img src="...">` tags in a panel cannot be loaded under this policy; the panel already communicates with its service via `host.serviceRequest` and with the host via other host methods, so it has no need for direct network access. Observations returned by Engram may include Markdown with remote images (URLs), which previously rendered directly.

## Decision

- Render remote Markdown images as links rather than `<img>` elements. The link text is `image: <alt or src>`, target `_blank`, rel `noopener noreferrer`, and clicks are routed through `host.openUrl` (as existing external links are).
- Do not add `contributes.origins` to the manifest and do not add network capabilities; keep the manifest minimal per ADR-0011.
- This behavior is compatible with OpenChamber 1.x (images-as-links are still functional; no regression in UX beyond remote image previews not auto-loading in the panel).

## Consequences

- **Positive:** Avoids CSP violations under OC2; no new permissions.
- **Positive:** The panel never exfiltrates data via remote image requests; security posture unchanged or improved.
- **Negative:** Remote images do not render inline in the panel; users click to open them in their browser.

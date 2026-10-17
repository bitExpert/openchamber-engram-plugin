# ADR-0003: Version floor — Engram >= 2.0.0, OpenChamber >= 2.3.0

- **Status:** Superseded
- **Date:** 2026-09-20
- **Superseded by:** 2026-10-17 (OpenChamber floor raised to 2.3.0, one contract supporting 1.22+ and 2.x)

## Context

The Phase 0 spike ran against Engram `v2.0.0` (released 2026-09-18). The user's installed system Engram was **1.20.0**, which showed a different envelope/feature surface than v2.0.0. Supporting two very different contracts in one v0.1 would double adapter and fixture work. OpenChamber's extension-owned service API exists from 1.22.0 onward. With OpenChamber 2 the API remains compatible (wire API version 1), but ≥ 2.0.4 enforces network restrictions; the extension's panel must not load remote images.

## Decision

- **Engram floor `>= 2.0`** (`major.minor >= 2.0`), auto-detected from `engram --version`. Older installs get an explicit **unsupported-version** state — no second adapter, no guessing.
- **OpenChamber floor `>= 2.3.0`** (raised from 1.22.0 to 2.3.0 in v0.2.0). The manifest's `engines.openchamber: ">=2.3.0"` ensures the host has the expected behavior; the extension is built with `@openchamber/sdk@2.3.3` and targets the OpenChamber 2 platform. The wire protocol remains API v1 so a single codebase works on 1.22+ and 2.x, but we no longer explicitly test older 1.x releases and prefer to require a modern host.
- Render remote markdown images as links (opened via `host.openUrl`) rather than `<img>` to satisfy OpenChamber 2.0.4+'s network sandbox.
- The extension targets a read-only `engram` service via `host.serviceRequest` only (no additional capabilities), keeping the trust surface minimal (ADR-0011).

## Consequences

- **Positive:** One well-tested contract (Engram v2.0.0+), and a host floor that matches our verification target (2.3.3).
- **Positive:** Avoids remote image loading issues under OC2 CSP; no need for `contributes.origins`.
- **Negative:** Engram users below 2.0 and OpenChamber users below 2.3.0 cannot use the extension; they get an explicit state rather than silent breakage.
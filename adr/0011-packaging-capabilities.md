# ADR-0011: Packaging — ship built assets, request only the `service` capability

- **Status:** Accepted
- **Date:** 2026-09-20
- **Source:** `README.md` §Build from source

## Context

OpenChamber never compiles extension code or installs dependencies; the iframe cannot load ES modules. The manifest drives install-time checks (`host-too-old`, capability approval). Unneeded capabilities widen the trust surface and the approval dialog.

## Decision

- Ship **built assets**: `panel/main.js` (classic IIFE) and `service/main.js` (Node bundle). Build with the SDK's `openchamber-guest-bundle` (Bun) or esbuild (`--format=iife --platform=browser` panel; `--platform=node` service).
- The manifest requests **only the `service` capability** (auto-added by declaring `contributes.service` with `runtime: "host"`, `permissions.exec: ["engram"]`). No `network`, `files`, `model`, `prompt`, `sessions`, or `conversation`.
- Version is semver (install requires it); `engines.openchamber >= 1.22.0`.
- Commit built files and the lockfile; keep `node_modules/` in `.gitignore`.

## Consequences

- **Positive:** Fresh installs work with zero build tooling on the user's machine; capability/approval dialog is minimal.
- **Positive:** Declared `permissions.exec: ["engram"]` is honest (hosts surface it in the approval dialog).
- **Negative:** Every source change requires a rebuild + (for the service) a guest restart to pick up the new bundle.
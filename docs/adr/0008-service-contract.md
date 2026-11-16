# ADR-0008: Service HTTP contract — loopback, Bearer auth, `{ok,trues}` envelopes

- **Status:** Accepted
- **Date:** 2026-09-20
- **Source:** `README.md` §Service API

## Context

The host spawns the service on a loopback port with `OPENCHAMBER_SERVICE_PORT` and `OPENCHAMBER_SERVICE_TOKEN`. The panel calls the service only through the host's `serviceRequest` proxy. Every request — including `GET /health` — must send `Authorization: Bearer <token>`. The panel inspects `result.ok`, so an envelope that omits it surfaces as a connection failure (a live-found bug: "Connect failed: unknown").

## Decision

- All replies are `{ ok: true, … }` on success or `{ ok: false, code, message, … }` on failure — **every** success response carries `ok: true`.
- Routes: `GET /health` (ready → HTTP 200), `POST /v1/connect`, `POST /v1/recent`, `POST /v1/search`, `POST /v1/getMemory`, `POST /v1/disconnect`.
- Error codes: `no-context`, `empty-query`, `project-mismatch`, `invalid-id` (or not-an-issued-id), `read-failed`, `unsupported-engram`, `service-error`.
- The service listens **only on `127.0.0.1`**; no other surface is exposed.

## Consequences

- **Positive:** A uniform, testable contract; panel logic is a single `if (!result.ok)` check.
- **Positive:** Loopback + Bearer keeps the service off the network.
- **Negative:** The `ok:true` invariant must hold on every future success branch (it was once the cause of a silent failure).
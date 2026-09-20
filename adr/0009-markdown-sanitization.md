# ADR-0009: Markdown rendering — sanitized, no raw HTML, `http(s)`-only links

- **Status:** Accepted
- **Date:** 2026-09-20
- **Source:** `panel/markdown.ts`

## Context

Memory content is Markdown but must never become trusted executable HTML inside the sandboxed iframe. `mountText` renders only plain text + links, losing formatting. Raw HTML, images, iframes, scripts, styles, SVG, MathML, and event attributes are attack surface.

## Decision

- Render with `markdown-it` (`html: false`, `linkify`, `breaks`) and sanitize with **DOMPurify** using an HTML-only allowlist (headings, paragraphs, lists, blockquotes, tables, emphasis, `code`/`pre`, links, images).
- Strict `validateLink`: only `http:/https:` URLs; everything else (local paths, `data:`, `javascript:`) renders as plain text.
- Links and images received `target=_blank` / `rel=noopener noreferrer` (links) and `loading=lazy` + `referrerpolicy=no-referrer` (images) via an `afterSanitizeAttributes` hook.
- Link clicks are routed through `host.openUrl` (delegation) — never auto-opened/fetched by the iframe.
- Source Markdown is preserved for copying; the HTML is never re-converted back.

## Consequences

- **Positive:** Hostile Markdown cannot execute scripts, fetch remote content, or phish via dangerous URL schemes.
- **Positive:** Formatting parity (headings, tables, code) without trusting the author.
- **Negative:** Bundled assets grow (~+48 KB for markdown-it + DOMPurify) and dependency pins must be fixture-tested.
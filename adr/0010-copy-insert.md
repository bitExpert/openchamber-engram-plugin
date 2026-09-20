# ADR-0010: Copy / Insert — explicit composer append, never auto-send

- **Status:** Accepted
- **Date:** 2026-09-20

## Context

The product promise is "choose what to bring into the conversation." Two explicit actions must be available, and neither may mutate memory or send anything on the user's behalf. Host limits apply: `writeClipboard` 1–32,000 chars; `host.compose` ≤ 16,000 chars, append mode.

## Decision

- **Copy** uses `host.writeClipboard` with the **original Markdown** (never the rendered HTML). Oversized → guide to copy an excerpt.
- **Insert into chat** uses `host.compose({ text, mode: "append" })`, appending a draft labeled as recalled reference material (title, project, ID) with the selected content. It **never auto-sends** and never silently truncates; oversized content prompts the user to select a shorter excerpt or copy.
- Composer insertion is disabled while the project/context is changing.
- No session creation, no model call, no memory mutation — composition is purely a draft, reviewed by the user.

## Consequences

- **Positive:** User remains in control; a memory can only enter the chat as an reviewed draft.
- **Positive:** Keeps the read-only promise intact (no mutation tools invoked).
- **Negative:** Truncation is never silent, so very long memories need an explicit excerpt-copy step.
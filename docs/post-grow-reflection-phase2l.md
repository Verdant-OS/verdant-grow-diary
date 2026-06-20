# Post-Grow Reflection Phase 2L — Operator Review Packet + Sanitized Client Export

## Summary

Phase 2L adds an operator-only **Review Packet** layer on top of the Phase 2K sanitized validation
summary. It produces a structured, deterministic, sanitized packet from any candidate paste result
and gives the operator local copy and download controls.

No runtime AI call is made. No data is saved. The packet is generated entirely from the already-validated
local result and carries only structural metadata — never raw candidate body text.

## Route

`/operator/post-grow-reflection-dry-run`

Operator-only. Not wired into grower navigation, the sidebar, or mobile nav.

## Scope

**New files:**

- `src/lib/ai/postGrowReflectionReviewPacket.ts` — pure deterministic review packet builder.
  Accepts `PostGrowReflectionCandidatePasteResult`, emits `PostGrowReflectionReviewPacket`.
  Section summaries include counts and paragraph presence only — no body text.

- `src/lib/ai/postGrowReflectionReviewPacketExport.ts` — export helpers (JSON text, operator text,
  Blob). No DOM. No network.

- `src/components/PostGrowReflectionReviewPacketCard.tsx` — presenter with copy and download
  buttons. DOM-only download via Blob + anchor click; no network request.

**Modified file:**

- `src/components/PostGrowReflectionCandidatePasteValidator.tsx` — renders
  `PostGrowReflectionReviewPacketCard` below the existing Phase 2K summary panel.

## Safety boundary

| Property                 | Value                                                                                                            |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| Operator-only route      | `/operator/post-grow-reflection-dry-run`                                                                         |
| Sanitized                | Yes — excludes raw candidate body text, pasted JSON, parse errors, credentials, private metadata, device targets |
| Not saved                | No database reads or writes                                                                                      |
| No live AI call          | Packet built from local validation result only                                                                   |
| No schema or RLS changes | None                                                                                                             |
| No Edge Function changes | None                                                                                                             |
| No Action Queue writes   | None                                                                                                             |
| No automation            | None                                                                                                             |
| No equipment control     | None                                                                                                             |
| Client copy/download     | Sanitized review packet JSON only                                                                                |

## What the packet excludes

The review packet **excludes raw candidate body text** — no `section.paragraph` content, no
`section.items` text, no pasted JSON, no `parseError` (which may contain raw pasted input). Section
summaries carry only: `key`, `label`, `kind`, `itemCount` (for list sections), and
`paragraphPresent` (for paragraph sections).

## Operator workflow

1. Navigate to `/operator/post-grow-reflection-dry-run`.
2. Paste a candidate ReflectionOutput JSON or candidate envelope.
3. Click **Validate pasted candidate**.
4. Review the result panel and the Phase 2K sanitized validation summary.
5. Review the **Operator Review Packet** below the summary.
6. Optionally click **Copy sanitized packet** or **Download sanitized packet** to share the
   sanitized packet with a client or for offline review.

Rejected packets remain visible and clearly labeled with their rejection outcome
("Rejected by envelope contract", "Rejected by reflection validator", "Invalid JSON").

## Safety verdict

Safe. Operator-only sanitized review packet and client-only sanitized copy/download. No runtime
generation, no provider call, no persistence, no schema/RLS/Edge/auth changes, no Action Queue
writes, no automation, and no equipment control.

## Follow-up path

- Phase 2M (if planned): structured export to a named file with grow metadata, gated behind
  explicit operator confirmation.
- No grower-facing surface until a separate product decision is made.

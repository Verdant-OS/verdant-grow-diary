# EcoWitt Bridge Token Policy — Phase 2 Gate Item 2

**Status:** Policy record. **APPROVED — Cheek, 2026-08-12** ("approved as recommended",
in-chat ruling). No code, schema, or deployment changed by this document.
**Recorded by:** Claude (Knowledge Library & Product Specification Architect)

This clears Phase 2 gate item 2 (token storage / rotation / revocation policy) for the
EcoWitt real-ingest workstream. Companion records:
[Phase 1.8 specification](./ecowitt-real-ingest-phase-1-8-specification.md),
[grounding audit](./ecowitt-real-ingest-phase-1-8-grounding-audit.md).

## What already ships (verified; this policy ratifies, it does not build)

The storage and revocation **mechanics** exist on the deploy branch and are not changed
here:

- `public.bridge_tokens` (`supabase/migrations/20260527011845_*.sql`): stores only a
  SHA-256 `token_hash` (UNIQUE) plus a short non-secret `token_prefix`; plaintext is
  shown once at mint and never stored; `expires_at` constrained to 1 hour–365 days;
  `revoked_at`; guard triggers enforce immutability of
  `user_id`/`tent_id`/`token_hash`/`token_prefix`/`expires_at`/`created_at`.
- `public.pi_ingest_bridge_credentials`: `secret_hash`, `allowed_tent_ids[]`,
  `is_active`, and "active requires at least one allowed tent".
- The testbench forwarding contract (`tools/ecowitt-testbench/test_forwarding_contract.py`)
  already pins that the bridge token never appears in forwarded payloads, and the
  V0 contract's forbidden-render list bans `vbt_`/`Bearer`/`Authorization` from any
  rendered surface.

## The policy (T1–T5)

| #   | Decision                        | Ruling                                                                                                                                                                                                                                 |
| --- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T1  | Maximum token lifetime          | **90 days** for EcoWitt bridge use. The schema permits 365; policy caps at 90 for an internet-adjacent listener. Enforced as policy at mint time; an optional future trigger tightening is implementation, not required by this record |
| T2  | Rotation procedure              | **Mint-new → update listener env → verify ingest works → revoke old.** Never revoke-first: an auth gap at the listener is silent data loss                                                                                             |
| T3  | Revocation triggers (immediate) | Listener host compromise or suspected compromise; token observed in any log, commit, or rendered surface; listener decommissioned or idle > 30 days                                                                                    |
| T4  | Scope                           | One token per listener host, tent-scoped — ratifies the shipped tent-scoped design; do not widen to account-scoped tokens                                                                                                              |
| T5  | Storage at the listener         | Environment variable only (`VERDANT_BRIDGE_TOKEN`). Never in `ecowitt_listener.py`, git, `raw_payload`, logs, or tickets — the existing forwarding-contract tests remain the enforcement backstop                                      |

## Consequences

- Phase 2 gate item 2: **`APPROVED`** (this record). Gate tables in
  `docs/agents/CURRENT_STATE.md` and the Phase 1.7 verification record are updated in the
  same commit.
- Remaining before the Phase 1.8 spec advances to `APPROVED`: its verification items and
  the owner's D4 re-confirmation — unchanged by this record.
- Nothing here authorizes persistence, deployment, or minting; it defines the rules any
  future implementation must follow.

## Rollback

Delete this file and revert the gate-table rows updated with it. Nothing executes from
this record.

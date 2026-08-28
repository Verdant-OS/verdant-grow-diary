# Sandbox bzat 2026-08-26 advisor-remediation apply ledger

## Status vocabulary

Use these labels literally. Do not translate missing knk credentials into a product
failure.

| Status | Meaning in this ledger |
| ---------------- | -------------------------------------------------------------------- |
| `PASS` | Direct evidence verified the check |
| `FAIL` | Direct evidence verified a defect |
| `BLOCKED` | Access, permission, credential, or dependency prevented verification |
| `NOT_MEASURED` | The metric was not measured; this is never a perfect score |
| `NOT_APPLICABLE` | The check does not apply to this target |

## What this file is

This is a **docs-only apply ledger / operator runbook record** for claimed sandbox
advisor remediations dated 2026-08-26.

It is **not**:

- a migration file
- authorization to apply SQL to any project
- a Preview-replayable artifact
- a product `PASS` claim

**Do not** add anything under `supabase/migrations/` from this ledger.
**Do not** add `20260826*` migration files.
**Do not** apply this ledger to production Lovable Cloud (`knkwiiywfkbqznbxwqfh`).
**Do not** replay this via GitHub Preview.

## Target project

| Field | Value |
| ----- | ----- |
| Target | `bzatgtgjvuojpoxcknaa` (personal-dashboard **sandbox**) |
| Not target | Production Lovable Cloud `knkwiiywfkbqznbxwqfh` (**knk**) |

Advisor writeup named sandbox bzat as Production. That naming is recorded here as a
**source claim** about the writeup, not as an established project-identity fact.
Production remains knk. This ledger is sandbox-only for the three claimed applies.

## Source

- Chrome Claude advisor writeup dated **2026-08-26**, shared by the operator.
- Independent GDP / Grok repository check against tip
  `d17e431d7634f33a9f2c5da338508b539d81fbc8`.
- This is **not** a knk measurement.

## Claimed applies (NOT in git as of tip `d17e431d7634f33a9f2c5da338508b539d81fbc8`)

The advisor writeup claimed these were applied in sandbox bzat. As of tip
`d17e431d7634f33a9f2c5da338508b539d81fbc8`:

1. `20260826020443` — `harden_secdef_rpc_grants_group_a_b`
2. `20260826020533` — `add_covering_indexes_for_unindexed_fks`
3. `20260826…` — `restore_has_role_execute_to_authenticated`

**Repo facts on that tip:**

- These version prefixes have **0 hits** under `supabase/migrations/`.
- Last tip migration file is
  `20260825233000_pheno_hunts_ownership_check_restore.sql`.

Therefore: claimed live/sandbox applies ≠ files present in git. This ledger records the
claim. It does **not** introduce those files.

## HARD STOP — collision fences

| PR | Role | This ledger |
| -- | ---- | ----------- |
| **#1113** | **ACTIVE OWNER** of sandbox migration-file restore on project `bzatgtgjvuojpoxcknaa` | Untouched. A docs ledger must not take that PR. Adding `20260826*` under `supabase/migrations/` would collide and would be Preview-replayed. |
| **#1137** | OPEN REVIEW ONLY — restored-history tooling | Untouched. |
| **#1120** | Migration-file ledger for different knk objects | Wrong artifact type for this work. Do not copy that pattern. |

## Repo facts (verified on tip; do not treat as knk live ACL)

### `grant_lovable_credits` / `grant_lovable_credit_pack`

- Both are `SECURITY DEFINER`.
- Function bodies do **not** call `auth.uid()`; they insert using caller-supplied
  `p_expected_user_id`.
- Git ACL: `REVOKE` from `PUBLIC` / `anon` / `authenticated`; `GRANT EXECUTE` to
  `service_role` only.
- No application `.rpc("grant_lovable_credits")` call path.
- Pack caller: `supabase/functions/payments-webhook/index.ts`.

**Therefore:** "anon key can mint credits" is **`FAIL` as a git fact**.

Live knk ACL for these functions is **`NOT_MEASURED`**.

### `20260815054645_revoke_public_and_anon_execute_on_definer_functions.sql`

- Present in git.
- Does **not** mention `has_role`.
- Advisor `has_role` over-revoke is a **live/sandbox ACL claim**, not a claim about that
  file's contents.

### `has_role` lockdown in git (`20260518154114`)

- `REVOKE` from `PUBLIC` / `anon`.
- `GRANT` to `authenticated` + `service_role`.

### `pi_ingest_commit_batch`

- Git `GRANT` to `service_role`.
- Callers:
  - `supabase/functions/pi-ingest-readings/commitBatch.ts`
  - `supabase/functions/operator-ggs-real-payload-commit/productionDeps.ts`
- `sensor-ingest-webhook` does **not** call it (it upserts `sensor_readings` and bumps
  usage via `bump_bridge_token_usage`).

### `award_nugs`

- `GRANT` to `authenticated` in git.
- No runtime caller under `supabase/functions` or `src` (generated types +
  `scripts/smoke-award-nugs.ts` only).

## Attached SQL mismatch — Group C

An attached `.sql` included **Group C** `REVOKE EXECUTE FROM anon` on client-facing RPCs,
including (among others):

- `quicklog_save_event`
- `quicklog_save_manual`
- `merge_duplicate_plant`
- operator audit RPCs

The advisor writeup said **Group C was DEFERRED**.

**Do not** transcribe Group C SQL into this repository as applied.
**Do not** recommend applying Group C.
**Do not** treat Group C as part of the three claimed sandbox applies above.

## Safety / validation

| Check | Status | Notes |
| ----- | ------ | ----- |
| Repo ACL: client `EXECUTE` on `grant_lovable_credits` / `grant_lovable_credit_pack` | `PASS` | Git shows REVOKE PUBLIC/anon/authenticated; GRANT service_role only |
| Claim "anon key can mint credits" as git fact | `FAIL` | Contradicted by git ACL + absence of app `.rpc` mint path |
| Live knk ACL for grant_* | `NOT_MEASURED` | No knk credential measurement in this ledger |
| Three claimed 20260826 applies in git | `FAIL` (as git presence) | 0 hits on tip; last migration is `20260825233000_…` |
| Scope of claimed applies | sandbox-only (`bzatgtgjvuojpoxcknaa`) | `NOT_APPLICABLE` to knk apply |
| Apply this ledger to knk | `NOT_APPLICABLE` / forbidden | Explicit hard stop |
| Preview-replay this ledger as migration | `NOT_APPLICABLE` / forbidden | Docs record only |
| Group C applied | not applied; deferred per writeup | Do not apply |
| Product / publish PASS | `NOT_APPLICABLE` | Docs ledger only; no publish |

**Verdict:** `PASS` on repo ACL for `grant_*` client `EXECUTE`; `NOT_MEASURED` on knk;
sandbox-only for the three claimed applies.

Never translate missing knk credentials into a product failure.

## Next human lock

1. **Do not** apply the attached SQL (including Group C).
2. **Do not** add `20260826*` files under `supabase/migrations/`.
3. **Do not** apply this ledger to knk.
4. **Do not** use GitHub Preview to replay this as a migration.
5. Leaked-password dashboard toggle is **owner-only** and **out of scope** for this
   ledger.
6. Sandbox migration-file restore ownership remains **#1113** — leave that PR alone.

## Independent review seat

Independent review for this docs ledger slice: **Blue Dream / Grok-Review**.

## Out of scope

- Application code
- Schema / RLS changes
- Any file under `supabase/migrations/`
- Production or sandbox SQL apply
- Device control
- Action Queue
- Publish

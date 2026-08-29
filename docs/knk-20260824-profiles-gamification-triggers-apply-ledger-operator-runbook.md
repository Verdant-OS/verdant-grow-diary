# knk 2026-08-24 profiles gamification triggers apply ledger

## Status vocabulary

Use these labels literally. Do not translate an uncaptured ACL into a product failure,
and do not translate this record into an authorization.

| Status           | Meaning in this ledger                                               |
| ---------------- | -------------------------------------------------------------------- |
| `PASS`           | Direct evidence verified the check                                   |
| `FAIL`           | Direct evidence verified a defect                                    |
| `BLOCKED`        | Access, permission, credential, or dependency prevented verification |
| `NOT_MEASURED`   | The metric was not measured; this is never a perfect score           |
| `NOT_APPLICABLE` | The check does not apply to this target                              |

## What this file is

This is a **docs-only apply ledger / operator runbook record** of two trigger functions
and two triggers that were **already present on Lovable-managed production**
(`knkwiiywfkbqznbxwqfh`) as of **2026-08-24**. It exists so the objects can be reviewed
independently, and so the fact of their un-reviewed application is on the record.

It is **not**:

- a migration file
- authorization to apply, re-apply, or re-run any SQL against any project
- a Preview-replayable artifact
- a publish clearance
- a product `PASS` claim
- a new security design

**Do not** add anything under `supabase/migrations/` from this ledger.
**Do not** add a `20260824*` migration file.
**Do not** apply or re-apply these objects to production Lovable Cloud
(`knkwiiywfkbqznbxwqfh`).
**Do not** replay this via GitHub Preview.
**Do not** APPLY `20260813030000` as part of, or because of, this ledger.

### Why this is docs and not a migration

A migration file under `supabase/migrations/` is an instruction to a replayer. These
objects are **already live**; there is nothing to apply, and a file shaped like a
migration invites exactly the two failures this record exists to prevent — a reviewer
reading merge as APPLY, and Supabase Preview replaying it against a disposable database
where the live UPDATE freeze is stricter than the older committed body in
`20260606034030`.

This follows the docs-only pattern established by
[`docs/sandbox-bzat-20260826-advisor-remediation-apply-ledger-operator-runbook.md`](./sandbox-bzat-20260826-advisor-remediation-apply-ledger-operator-runbook.md)
(#1142), not the migration-file pattern of #1120, which was closed 2026-08-26 as the
wrong artifact for this job.

## Target project

| Field      | Value                                                            |
| ---------- | ---------------------------------------------------------------- |
| Target     | `knkwiiywfkbqznbxwqfh` (Lovable-managed **production**, **knk**) |
| Not target | Sandbox `bzatgtgjvuojpoxcknaa` — a different project and ledger  |

## Source and capture provenance

| Item                        | Status                                                                                                |
| --------------------------- | ----------------------------------------------------------------------------------------------------- |
| Capture date                | 2026-08-24                                                                                            |
| Capture method              | Lovable Cloud SQL `pg_get_functiondef` / `pg_get_triggerdef` (**read-only**)                          |
| Captured by                 | GDP                                                                                                   |
| How the objects got live    | A security-fix turn applied them to production **without review and without a GitHub migration file** |
| Grants / `EXECUTE` ACLs     | **`NOT_MEASURED`** — not captured; do not infer ACLs from this record                                 |
| Merge of this file = APPLY? | **No**                                                                                                |
| Production state now        | **`NOT_MEASURED`** by this ledger — see below                                                         |

**Production is `NOT_MEASURED` here.** The capture is a 2026-08-24 read. This document
records what that read returned; it does not re-measure production, and nothing in this
repository can. A merge is not a deployment and a ledger is not a measurement.

## Recorded live definitions

Recorded verbatim from the 2026-08-24 read so the exact bodies — including the exception
strings the reviewer flags below turn on — can be reviewed. **This is a transcript, not
an artifact to execute.**

### `public.profiles_force_gamification_defaults_on_insert()` — BEFORE INSERT

```sql
CREATE OR REPLACE FUNCTION public.profiles_force_gamification_defaults_on_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF current_setting('role', true) = 'service_role' THEN
    RETURN NEW;
  END IF;
  NEW.nugs_total := 0;
  NEW.level := 0;
  NEW.tier := 'seedling';
  NEW.current_badge := NULL;
  NEW.referral_code := NULL;
  RETURN NEW;
END;
$function$;
```

Bound as `profiles_force_gamification_defaults_on_insert_trg`, `BEFORE INSERT ON profiles
FOR EACH ROW`.

### `public.profiles_block_gamification_updates()` — BEFORE UPDATE

```sql
CREATE OR REPLACE FUNCTION public.profiles_block_gamification_updates()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF current_setting('role', true) = 'service_role' THEN
    RETURN NEW;
  END IF;
  IF NEW.nugs_total IS DISTINCT FROM OLD.nugs_total
     OR NEW.level IS DISTINCT FROM OLD.level
     OR NEW.tier IS DISTINCT FROM OLD.tier
     OR NEW.current_badge IS DISTINCT FROM OLD.current_badge THEN
    RAISE EXCEPTION 'gamification fields (nugs_total, level, tier, current_badge) are not directly writable';
  END IF;
  IF NEW.referral_code IS DISTINCT FROM OLD.referral_code THEN
    RAISE EXCEPTION 'referral_code is not directly writable';
  END IF;
  RETURN NEW;
END;
$function$;
```

Bound as `profiles_block_gamification_updates`, `BEFORE UPDATE ON profiles FOR EACH ROW`.

## Reviewer flags

Carried forward so the review these objects never got can still happen. Each is a
question for the reviewer, not a finding this ledger resolves.

1. **`SECURITY DEFINER` on both functions**, with `search_path` pinned to
   `'public', 'pg_temp'`. The pin is the right shape; the privilege level still warrants
   an explicit sign-off.
2. **The INSERT trigger wipes `referral_code`** (`NEW.referral_code := NULL`) for every
   non-`service_role` caller. That can conflict with `handle_new_user` assigning a
   referral code on profile insert unless that insert runs as `service_role`.
3. **The UPDATE exception string names four fields** — `'gamification fields (nugs_total,
level, tier, current_badge) are not directly writable'`. Do not accept shortened prose
   that omits `tier`; the live string is the one above.
4. **The live UPDATE freeze is stricter than the committed GitHub body.** The function in
   `20260606034030` guards `nugs_total` / `level` / `tier` only. Live additionally guards
   `current_badge` and `referral_code`. This divergence is the substance of the record.
5. **Grants / `EXECUTE` privileges are `NOT_MEASURED`.** They were not captured. Do not
   infer them from this file in either direction.

## HARD STOP — collision fences

| PR                    | Role                                                 | This ledger                                                                                        |
| --------------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| **#1178**             | Migration-file version of this same record           | **Superseded by this file.** Draft. Its `supabase/migrations/20260824235000_*.sql` must not merge. |
| **#1198**             | **ACTIVE OWNER** of dryback invalid-sample behaviour | Untouched. This branch is parented **before** #1198 and edits no dryback file.                     |
| **#1199**             | Quick Log badge-dedupe assertion fix                 | Untouched. No `src/test/quicklog-sensor-snapshot-badge-dedupe.test.ts` edit here.                  |
| **#1170** / **#1177** | Quick Log strip / attachable                         | Untouched.                                                                                         |
| **#1196**             | Quick Log revision adapter                           | Not restamped.                                                                                     |
| **#1120**             | Earlier migration-file ledger for these objects      | Closed 2026-08-26 as the wrong artifact. **Do not copy that pattern.**                             |
| **#1142**             | Docs-only sandbox apply ledger                       | The pattern this file follows.                                                                     |

## Safety / validation

| Check                                                          | Status                       | Notes                                                                 |
| -------------------------------------------------------------- | ---------------------------- | --------------------------------------------------------------------- |
| Files under `supabase/migrations/` in this change              | **`PASS`** — zero            | Docs-only; migration count unchanged at 278                           |
| Definitions transcribed byte-for-byte from the 2026-08-24 read | **`PASS`**                   | Including `$function$` delimiters and the four-field exception string |
| Apply / re-apply these objects to knk                          | `NOT_APPLICABLE` / forbidden | Explicit hard stop; production SQL stays locked                       |
| Preview-replay this ledger                                     | `NOT_APPLICABLE` / forbidden | Docs record only; nothing here is replayable                          |
| Live knk state at time of writing                              | **`NOT_MEASURED`**           | No knk credential measurement was taken for this file                 |
| Grants / `EXECUTE` ACLs                                        | **`NOT_MEASURED`**           | Not captured on 2026-08-24                                            |
| Production exposure of the divergence in flag 4                | **`NOT_MEASURED`**           | Recording a divergence does not measure its effect                    |
| `20260813030000`                                               | **NOT applied**              | And must not be applied because of this ledger                        |

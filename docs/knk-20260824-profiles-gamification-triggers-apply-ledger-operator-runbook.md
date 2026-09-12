# knk 2026-08-24 profiles gamification triggers apply ledger

## Status vocabulary

Use these labels literally. Do not translate an uncaptured ACL into a product failure,
and do not translate this record into an authorization.

| Status           | Meaning in this ledger                                                                                                       |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `PASS`           | Direct evidence verified the check                                                                                           |
| `FAIL`           | Direct evidence verified a defect                                                                                            |
| `BLOCKED`        | Access, permission, credential, or dependency prevented verification                                                         |
| `NOT_MEASURED`   | The metric was not measured; this is never a perfect score                                                                   |
| `NOT_APPLICABLE` | The check does not apply to this target                                                                                      |
| `FORBIDDEN`      | The operation is available and must not be performed — **not** `NOT_APPLICABLE`, which means the check does not apply at all |

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

**State which sense you mean, every time.** "Unapplied" is ambiguous for `20260813030000` and one
reading is dangerous: its **GitHub apply lane** never succeeded, but its **objects were applied to
production on 2026-08-21** — verbatim, through Lovable. That is a point-in-time record, not a current
measurement; this ledger does not re-measure production. A bare "not applied" reads as licence to
apply it, which would re-issue an **unguarded `handle_new_user`** over the guard applied that day. See the section
_"`20260813030000` — 'unapplied' carries two meanings, and one is dangerous"_ in
`docs/agents/CURRENT_STATE.md`, which is the authority on this and is not edited by this PR.

### Why this is docs and not a migration

A migration file under `supabase/migrations/` is an instruction to a replayer. These
objects were **already applied when captured**; there is nothing to apply, and a file shaped
like a migration invites exactly the two failures this record exists to prevent — a reviewer
reading merge as APPLY, and Supabase Preview replaying it against a disposable database where
the captured UPDATE freeze is stricter than committed history.

Measure that strictness against the **last committed definition in migration order** —
`20260721194325_f96507e6-a612-4d26-a99d-2a261f2c0ad5.sql` (lines 63-70), **not** the earlier
`20260606034030`, which is superseded and overstates the gap. Against that end state the
captured body adds exactly one field, `current_badge`. See flag 4 below; the two statements
must not diverge.

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

Bound by this exact statement from the capture:

```sql
CREATE TRIGGER profiles_force_gamification_defaults_on_insert_trg BEFORE INSERT ON profiles FOR EACH ROW EXECUTE FUNCTION profiles_force_gamification_defaults_on_insert();
```

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

Bound by this exact statement from the capture:

```sql
CREATE TRIGGER profiles_block_gamification_updates BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION profiles_block_gamification_updates();
```

**Provenance caveat on both bindings.** These are the `CREATE TRIGGER` statements as recorded in the
2026-08-24 capture. That capture's own header states the definitions were "recorded as
`CREATE OR REPLACE` / `DROP TRIGGER IF EXISTS` + `CREATE TRIGGER` for idempotent ledger shape only",
so the surrounding `DROP TRIGGER IF EXISTS … ON public.profiles;` guards were added for idempotence
and are **not** part of the read. Whether raw `pg_get_triggerdef` output would additionally
schema-qualify (`ON public.profiles`, `EXECUTE FUNCTION public.…`) is **`NOT_MEASURED`** — only this
transcription survives in the repository. Neither trigger carries an `UPDATE OF` column list or a
`WHEN` clause in the recorded text.

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
4. **The live UPDATE freeze adds exactly one field over committed history.** Compare against the
   **last committed definition in migration order**, not `20260606034030` — an earlier definition is
   the wrong baseline and overstates the drift. `20260721107000_referral_code_and_pending_capture.sql`
   (lines 100-108) and the later `20260721194325_f96507e6-a612-4d26-a99d-2a261f2c0ad5.sql`
   (lines 63-70) **already guard `referral_code`**. Against that end state the captured body adds
   only **`current_badge`**. Describing `referral_code` as live-only sends a reviewer to remediate
   behaviour that is already recorded.
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

| Check                                                          | Status             | Notes                                                                                                                         |
| -------------------------------------------------------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| Files under `supabase/migrations/` in this change              | **`PASS`** — zero  | Docs-only; migration count unchanged at 278                                                                                   |
| Definitions transcribed byte-for-byte from the 2026-08-24 read | **`PASS`**         | Including `$function$` delimiters and the four-field exception string                                                         |
| Apply / re-apply these objects to knk                          | **`FORBIDDEN`**    | Explicit hard stop; production SQL stays locked                                                                               |
| Preview-replay this ledger                                     | **`FORBIDDEN`**    | Docs record only; nothing here is replayable                                                                                  |
| Live knk state at time of writing                              | **`NOT_MEASURED`** | No knk credential measurement was taken for this file                                                                         |
| Grants / `EXECUTE` ACLs                                        | **`NOT_MEASURED`** | Not captured on 2026-08-24                                                                                                    |
| Production exposure of the divergence in flag 4                | **`NOT_MEASURED`** | Recording a divergence does not measure its effect                                                                            |
| `20260813030000` — GitHub apply lane ever succeeded            | **`FAIL`**         | The apply workflow shows only its failed PREFLIGHT                                                                            |
| `20260813030000` — applied to production on 2026-08-21         | **`PASS`**         | Point-in-time, sourced to `docs/signup-attribution-outage-operator-runbook.md`: applied verbatim through Lovable, md5-guarded |
| `20260813030000` — production objects now                      | **`NOT_MEASURED`** | Not re-measured. The 2026-08-21 record is the only evidence, and it is **not** a licence to re-apply                          |
| GitHub-APPLY `20260813030000`                                  | **`FORBIDDEN`**    | Re-issues an unguarded `handle_new_user` over the guard applied 2026-08-21 — an incident                                      |

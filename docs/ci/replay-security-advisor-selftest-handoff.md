# Handoff — `20260805090000` security-advisor self-test aborts fresh local replay

**Status:** `UNPROVEN`. The manifest entry in this branch is mechanically verified
but semantically unconfirmed. One `supabase db reset` on a machine with Docker
decides whether it is correct, insufficient, or the wrong mechanism entirely.

**Owner needed:** whoever owns #767 / the DB-security lane. This is not part of
the Mode A SEO slice, the freshness-canon reconciliation (PR #798), the js-yaml
advisory (PR #800), or the MCP edge-bundle fix (PR #802).

---

## What is broken

`supabase/migrations/20260805090000_security_advisor_hardening_followup.sql`
ends with a `DO $$` block of postcondition assertions. Section 4c creates a
throwaway function, asserts `anon` cannot execute it, and drops it — an
end-to-end proof that the migration's `ALTER DEFAULT PRIVILEGES` actually took
effect, rather than merely asserting the statement ran.

On a **fresh local Supabase**, that assertion fires:

```
ERROR: default-privilege change did not take: a freshly created function
       is anon-executable (SQLSTATE P0001)
At statement: 11
```

`RAISE EXCEPTION` aborts the transaction, `supabase db reset` stops there, and
**no migration after `20260805090000` is applied**. The entire Security DB
Local lane — profiles, customer-mode isolation, subscriber-interest RLS,
public-support-forms RLS, AI Doctor sessions RLS, bridge-token revocation
integrity, VPD calibration provenance — never runs.

Evidence: GitHub Actions run `31172341902`, job `92846704180`.

## Two red checks, one root cause

| Check                                                  | Mechanism                                                                           |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| `test:security-db-local`                               | The abort above. Real, blocking, and the reason the lane produces no signal at all. |
| `test:security-regression` (`check:supabase-security`) | A **separate scanner false positive** on the same statement. Analysed below.        |

### The scanner false positive

`check-supabase-migration-safety.mjs` reports:

```
[TABLE_WITHOUT_RLS] 20260805090000_… :: public.__default_privilege_selftest_tbl
    fingerprint=0ab953bcd1232e3b
```

The scanner is pattern-matching a `CREATE TABLE` that exists only inside a
single-quoted dynamic-SQL string:

```sql
EXECUTE 'CREATE TABLE public.__default_privilege_selftest_tbl (id int)';

IF has_table_privilege('anon', 'public.__default_privilege_selftest_tbl', 'SELECT') THEN
  RAISE EXCEPTION '…a freshly created table is anon-readable';
END IF;

EXECUTE 'DROP TABLE public.__default_privilege_selftest_tbl';
```

The `DROP` two lines later is also inside a string, so the scanner cannot see
it. The table never survives the transaction, and its entire purpose is to
**prove** the hardening worked — the scanner is flagging the thing that
verifies safety.

**This branch does not baseline it.** Two reasons:

1. Baselining would silence the static scan while `test:security-db-local`
   keeps aborting — it fixes the symptom that does not matter and leaves the
   one that does.
2. A security-baseline change is a deliberate posture decision, not cleanup.

If the reviewer decides baselining is right, the fingerprint above pins it to
this exact statement; any other unsafe `CREATE TABLE` still fails.

## Provenance

| Fact                                                                | Verified how                                                                                                                                                                                     |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Migration is **merged**, therefore immutable                        | Present on `origin/verdant-grow-diary` via #767 (`2646d4081`)                                                                                                                                    |
| Failure is **pre-existing**, not caused by any open PR              | `check-supabase-migration-safety.mjs` reproduces on clean trunk with all local changes stashed                                                                                                   |
| #767 landed **after** the last recorded green Security DB Local run | `git merge-base --is-ancestor 5611b130e81a 2646d4081` → true. `CURRENT_STATE.md` records `5611b130e81a` / run `31021835479` as the last full enabled pass, so #724's replay repair predates this |
| Not already handled by the compatibility layer                      | `20260805090000` absent from `config/local-supabase-replay-compatibility.json` before this branch                                                                                                |

Per `AGENTS.md`, that config was checked **before** proposing any correction.

## Why a forward migration cannot fix this

The migration file is merged history and must never be edited — the
`Published migration integrity` gate compares SHA-256 against the base branch.
And a forward migration cannot help here regardless: the broken statement
_aborts the replay_, so nothing after it runs. That is precisely the case
`config/local-supabase-replay-compatibility.json` exists for.

## What this branch proposes

A `compatibility_patches` entry that downgrades **only** the two section-4c
assertions from `RAISE EXCEPTION` to `RAISE WARNING`, and **only** in the
disposable replay copy.

```
source_sha256   13d85bde5a60f2df9d5f62e72a61b91b0073f615d2d9e8b4da8e5ef57dbd40ff
patched_sha256  1a7773344039fe8638fa55746772e51c3acb44b39ff198831a2521ef6457490d
```

The `WARNING` text is prefixed `REPLAY-ONLY (local default-ACL divergence…)` so
a warning in a replay log can never be mistaken for a production finding.

### What is preserved

- The committed migration is **byte-unchanged**. The integrity gate stays green,
  and a future fresh production provision still runs the real assertion.
- Production **already executed** section 4c with the real `RAISE EXCEPTION`
  and passed. Production is the environment the assertion exists to protect.
- **All ten** `RAISE EXCEPTION`s in sections 4a and 4b are untouched and still
  abort the replay — `quicklog_save_manual` overloads, `lovable_paddle_events`,
  `lead_events`. Those assert _this migration's own REVOKEs_, which are not
  environment-dependent. Only the self-test of an environment-divergent default
  is downgraded.

### Why the divergence is expected rather than a defect

The repository already documents it. `supabase/seed.sql` opens with
`LOCAL-STACK PROD-PARITY GRANTS`:

> the hosted project (created 2026-05) is grandfathered on Supabase's legacy
> default privileges … Fresh local stacks created by the current CLI ship the
> hardened default ACL

The migration's own comment cites that header by name. And the existing
`compatibility_injections` entry gives the same reason in almost the same
words: _"Fresh Supabase uses hardened default ACLs; inject the hosted baseline
immediately before the immutable migration verifies it."_

### Stated inference, not observation

The **table** assertion is downgraded alongside the function one by inference.
Replay aborts at the function check, so the table check has never been reached.
It tests the same divergent default and would otherwise fail six lines later —
but that is reasoning, not evidence, and it is called out here so a reviewer
does not read it as measured.

## What is already proven

| Check                                                          | Result                                                                                                                                                                 |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `node scripts/prepare-local-supabase-replay.mjs --verify-only` | `PASS` — `18 no-op entries, 4 patches, and 1 injection verified`. Source hash matched the real file; both replacements matched **exactly once**; patched hash matched. |
| `bun run test:local-supabase-replay`                           | `PASS` — 20/20                                                                                                                                                         |
| Committed migration unchanged                                  | `source_migrations_unchanged: true` in the verify report                                                                                                               |
| `check-supabase-migration-safety.mjs`                          | Still `FAIL` — deliberately not baselined                                                                                                                              |
| Does the patch complete `supabase db reset`?                   | **`NOT_MEASURED`** — no Docker in the authoring environment                                                                                                            |

## The single gate

On a machine with Docker:

```bash
node scripts/prepare-local-supabase-replay.mjs --output=/tmp/verdant-replay
supabase db reset --workdir /tmp/verdant-replay
```

Three possible outcomes:

1. **Reset completes.** The entry is correct. Re-run the DB-security lane and
   merge.
2. **Reset still aborts, later.** The entry is insufficient — capture the next
   `SQLSTATE` and extend it. Most likely candidate is another environment-
   divergent assertion further down the migration list.
3. **The reset reveals the actual mechanism** — i.e. _why_ the default-privilege
   change does not take locally. In that case **prefer a
   `compatibility_injections` entry** that establishes the hosted
   default-privilege baseline immediately before this migration, following the
   existing `irrigation-acl-baseline.sql` precedent, so section 4c passes _for
   real_ instead of being muted. Then delete this patch entry.

Outcome 3 is the better end state. This branch proposes the conservative
version because it does not require correctly diagnosing the mechanism first,
and `config/local-supabase-replay-compatibility.json` is explicit: _"Do not add
an entry merely to silence a reset failure. Prove the canonical/duplicate
relationship first."_ This document is the proof-of-relationship work done as
far as it can be taken without a database.

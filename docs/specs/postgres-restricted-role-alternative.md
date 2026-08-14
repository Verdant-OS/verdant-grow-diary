# Spec — Postgres restricted-role alternative to the Convex physical sandbox

**Author:** Claude (Knowledge Library and Product Specification Architect)
**Date:** 2026-08-14
**Audited ref:** deploy branch `verdant-grow-diary` tip
`cbbd7122597358e4c6e55e14b7f6a769a3a69132` (fetched and verified this session)
**Slice name:** `POSTGRES_RESTRICTED_ROLE_SPIKE` (proposed — not yet approved)
**Capability gap:** `GAP-PGROLE-001`
**Status:** SPECIFICATION ONLY — **no owner approval recorded.** See §2.

This document is the comparison arm that
`docs/specs/convex-component-physical-sandbox-spike.md` §4.2 and §11 defer:
"A Postgres-roles spike would also address part of the operational gap. It is
**out of this slice** unless Cheek names it separately," and "Postgres
restricted-role alternative — Specified as out of slice; not measured —
Unassigned."

Every claim is labeled per the Sentinel evidence discipline: `established fact`,
`source claim`, `practical observation`, `inference`, `uncertainty`,
`missing evidence`. Status words (`PASS`, `FAIL`, `BLOCKED`, `NO_BASELINE`,
`NO_DATA`, `NOT_MEASURED`, `SKIPPED`, `NOT_APPLICABLE`) are used literally.

---

## 1. Executive recommendation

Verdant's `service_role` blast radius is real and is measured below. But the
**cheapest correct first move is not a new runtime and not a new role.** It is a
**detector**: a committed inventory that maps every `service_role`-holding edge
function to the tables it actually touches, and fails CI when a function reaches
outside its declared domain.

Then, if and only if that detector proves the reach is genuinely cross-domain,
introduce restricted Postgres roles **function-first** — roles that hold
`EXECUTE` on a named allowlist of the 208 `SECURITY DEFINER` functions this repo
already ships, and hold **no table grants at all**.

Concretely:

- **Phase 0 (recommended now, low risk):** static domain-reach detector. No
  schema change, no migration, no role. Buys most of the safety and all of the
  evidence.
- **Phase 1 (only after Phase 0 evidence):** one restricted role, one domain,
  proven in the local replay lane, never in production.
- **Phase 2 (`REJECT` until Cheek + Security):** production role adoption.

**Do not** ship a default-deny grant posture. A founder decision on 2026-08-06,
recorded in a merged migration, already declined exactly that — see §3.4. That
decision is the single hardest constraint on this whole design and it is not
mine to overturn.

**Verdict for Phase 0:** `PROCEED` if Cheek names the slice.
**Verdict for Phase 1:** `HOLD` pending Phase 0 evidence.
**Verdict for production roles:** `REJECT` at this time.

---

## 2. Approval status — read this before implementing

| Item | Value |
| --- | --- |
| Owner approval for this slice | **None recorded.** `established fact` — `docs/agents/CURRENT_STATE.md` at the audited ref lists Claude's assignment as the *Convex* spec, and lists the Postgres-roles alternative under "out of this slice" / "Unassigned" |
| Why this document exists anyway | The session's designated branch is `claude/postgres-restricted-role-spec-bqw6i6`, which names this work explicitly. `inference`: naming the branch is an instruction to specify it |
| What this document is | A specification and audit, docs-only, so Council Chair has a real alternative arm to compare against `GAP-CONVEX-001` |
| What this document is **not** | Authorization to create roles, edit migrations, or touch production |

**If Cheek did not intend this branch to open the Postgres-roles arm, this spec
is void and should be closed unmerged.** I have not assumed approval, and unlike
the Convex spec I cannot cite an in-session owner statement. This is the honest
difference between the two arms and it is recorded rather than papered over.

`docs/agents/CURRENT_STATE.md` is updated in this PR to record the divergence.
It carries no `Sentinel-Version` and is exempt from the twelve-file parity bump
(`AGENTS.md`, Cursor Cloud notes; merged precedent #729, #746). No governance
file is edited.

---

## 3. Audit of the actual privilege surface

All counts below were produced this session against
`cbbd7122597358e4c6e55e14b7f6a769a3a69132`. They are reproducible with the
commands in §11. Do not infer production behavior from `main`.

### 3.1 The structural facts

| Fact | Value | Label |
| --- | --- | --- |
| Migration files | 264 | `established fact` |
| Distinct tables created | 115 | `established fact` |
| `CREATE ROLE` / `CREATE USER` statements | **0** | `established fact` |
| `CREATE SCHEMA` statements | **0** — every object lives in `public` | `established fact` |
| `GRANT … TO service_role` statements | 164 | `established fact` |
| `GRANT … TO authenticated` statements | 126 (plus 29 `authenticated, service_role`) | `established fact` |
| `SECURITY DEFINER` declarations | 208, across 115 migration files | `established fact` |
| Migration files containing a `REVOKE` | 134 | `established fact` |
| `ALTER DEFAULT PRIVILEGES` occurrences | 18, across exactly 3 migrations | `established fact` |
| Edge function directories | 34 | `established fact` |
| Function `index.ts` reading `SUPABASE_SERVICE_ROLE_KEY` | 22 | `established fact` |
| `_shared/` helpers constructing a service-role client | **0** — the only `service_role` matches under `_shared/` are redaction patterns and "no service_role usage" comments | `established fact` |

**Correction to the Convex spec.** `docs/specs/convex-component-physical-sandbox-spike.md`
§3.2 records an `uncertainty` that "other files under `supabase/functions/_shared/`
may construct service-role clients; this spec does not claim an exhaustive helper
census." I ran that census this session: **no `_shared/` helper constructs a
service-role client.** Every `service_role` string under `_shared/` is either a
redaction denylist entry (`ecowittValidationEvidenceRules.ts`,
`aiDoctorReviewResultContract.ts`) or a header comment asserting the module does
*not* use service role. That `uncertainty` resolves to `PASS`. The 22-function
list is also re-verified identical at the newer tip. `established fact`

### 3.2 The blast radius, stated precisely

Verdant has **five** Postgres roles, all Supabase built-ins: `anon`,
`authenticated`, `service_role`, `authenticator`, `postgres`. `inference` from
zero `CREATE ROLE` plus standard Supabase provisioning.

`service_role` bypasses RLS. Twenty-two edge functions hold it. All 115 tables
live in one schema. Therefore **any one of those 22 functions can read or write
any of those 115 tables**, and nothing in the database will refuse. `inference`
from Postgres role semantics — not a claim that any function currently does so.

Grouping the 22 by the domain they *ought* to touch (`inference` from function
names and directory contents):

| Domain | Functions |
| --- | --- |
| Money / billing | `checkout-status`, `paddle-portal-session`, `paddle-webhook`, `payments-webhook`, `founder-slots-remaining`, `save-founder-prefs`, `redeem-referral`, `operator-credits-audit` |
| AI | `ai-coach`, `ai-doctor-review` |
| Email | `auth-email-hook`, `handle-email-suppression`, `handle-email-unsubscribe`, `process-email-queue`, `send-transactional-email` |
| Sensor ingest | `ecowitt-ingest`, `pi-ingest-readings`, `sensor-ingest-webhook`, `operator-ggs-real-payload-commit` |
| Cross-domain by nature | `delete-account`, `edge-metrics-alert-check`, `rls-selftest` |

Nineteen of 22 fall into a clean single domain. That is the case for roles.
Three do not, and `delete-account` genuinely must reach nearly everything to
perform erasure — it is the hardest case and §5.5 does not pretend otherwise.

### 3.3 Isolation today is convention, plus an unusually large test estate

This repo does not merely *hope* isolation holds. It spends real engineering
proving it:

- **28** `scripts/run-*-rls-harness.ts` runtime harnesses (billing, AI credits,
  Action Queue, Quick Log ×5, sensor source, storage, staff role, support forms,
  genetics, pheno, irrigation, VPD provenance, and more). `established fact`
- A dedicated CI lane, `.github/workflows/security-db-local.yml`, that stands up
  a real local Supabase, replays every migration, and executes those harnesses.
  `established fact`
- Static SQL-scan tests that exist specifically to stop the wrong billing table
  becoming source of truth again. `established fact` (recorded in the Convex
  spec §3.3 and consistent with the `src/test/*grant-parity*` files found this
  session)

`inference`: that estate is the *cost* of convention-based isolation. It is
evidence for the gap, and it is simultaneously the reason a role model is
tractable here — the harness infrastructure a role spike needs already exists.

### 3.4 The binding constraint: Lovable creates tables outside the ACL model

This is the most important finding in the audit and it constrains every design
below.

Migration `20260807003500_security_advisor_hardening_followup_correction.sql`
records, in its own committed body:

> Scoped to FUNCTIONS only, not TABLES — prod is grandfathered so
> anon/authenticated get DML on new tables automatically, and Lovable ships new
> tables continuously without knowing about ACL defaults; silently making every
> future table client-invisible by default is a workflow change nobody has
> signed off on (founder decision, 2026-08-06).

`established fact` (quoted from the merged migration).

Consequences a role design must accept:

1. **New tables appear without role-aware grants.** Any partition defined by
   table grants drifts open the moment Lovable ships a table. `inference`
2. **Default-deny on tables is already refused** by a recorded founder decision.
   A role spec that re-proposes it is re-litigating a settled call. `inference`
3. Therefore the durable unit of partition must be something Lovable does not
   silently create. **Function `EXECUTE` grants qualify; table grants do not.**
   `inference` — this is the central design conclusion of §5.

### 3.5 The prior hardening attempt failed, and how it failed is a spec rule

`20260805090000_security_advisor_hardening_followup.sql` bundled its real fixes
and a raising `DO` self-test into **one transaction**. The self-test failed on a
fresh local stack (2026-08-06, reproducible), so `RAISE EXCEPTION` rolled back
the entire migration — including the fixes. Per the correction migration's own
header, `anon` consequently kept `EXECUTE` on `quicklog_save_manual`, "the exact
live production Security Advisor finding this whole effort exists to close."
`established fact` (quoted from the merged correction).

`20260807133000_global_default_privilege_hardening.sql` then landed the global
revokes with a postcondition that creates a throwaway function, asserts
non-executability, and **drops it before `COMMIT`**. `established fact`.

Two rules fall out, and §7 binds them:

- **R1.** A privilege migration must not co-locate a raising self-test with the
  changes it verifies, unless the author accepts that a failed assertion silently
  reverts the fix. Verify in the harness lane, not in the transaction.
- **R2.** `20260807133000` is the reference pattern for an in-migration
  postcondition when one is genuinely wanted: create probe, assert, drop probe,
  commit.

### 3.6 Collision check (mandatory, `AGENTS.md` Multi-Agent Coordination)

Open PRs listed this session via the GitHub MCP (`state: open`, 25 returned):

- **`#977` — "feat(architecture): add isolated Convex component sandbox spike"**,
  head `codex/convex-component-physical-sandbox-spike`, opened 2026-08-14T01:42Z,
  **not a draft**. Codex has started Convex Phase 1. `established fact`
- **No open PR touches Postgres roles, `CREATE ROLE`, or privilege partitioning.**
  `established fact`
- No doc in `docs/` mentions Postgres roles or least privilege except the Convex
  spec's one-line deferral. `established fact`

**Verdict: no collision for this spec.** It is the deliberately-deferred sibling
of #977, not a competing implementation of it. The two arms answer the same
question by different means and Council Chair is meant to compare them (§10).

---

## 4. Capability gap `GAP-PGROLE-001`

### 4.1 Statement

**Twenty-two edge functions share one `service_role` identity with unrestricted
reach over 115 tables in a single schema. Domain isolation is enforced by review,
static scans, and 28 runtime harnesses — never by the database refusing a
query.**

The restricted-role hypothesis: **Postgres can refuse it natively.** A role that
holds `EXECUTE` on a named function allowlist and no table grants cannot read
`diary_entries` or write `subscriptions`, regardless of what a future edit to
that function's TypeScript asks for. The refusal is `42501` from the database,
not a failed test in CI.

### 4.2 What this gap is not

| Claimed benefit | Why it does **not** justify this work |
| --- | --- |
| "RLS is insufficient" | False. RLS already fences `anon` / `authenticated` well, and several paid preflight functions deliberately run on JWT + RLS with no service role. The gap is strictly about the service-role lane |
| "Postgres cannot isolate" | Also false, and it is the Convex spec's own §4.2 wording. Postgres can. Verdant simply does not use the mechanism |
| "This replaces the RLS harnesses" | No. Roles narrow reach; harnesses prove policy. Both are needed, and §8 forbids deleting harnesses as a "simplification" |
| "This is cheaper than Convex" | `NOT_MEASURED`. It avoids a second runtime, but it adds JWT minting, role lifecycle, and a Lovable-drift detector. Do not assert a cost verdict without Phase 0 evidence |
| "Least privilege is best practice, so ship it" | Not a Verdant justification. The founder decision in §3.4 already weighed a default-deny posture against Lovable's workflow and declined it |

### 4.3 Success definition

`GAP-PGROLE-001` is **demonstrated** (`PASS`) only when, in the local replay lane:

1. A restricted role exists that holds `EXECUTE` on exactly one named function
   and **zero** table grants.
2. A connection acting as that role **fails with `42501`** on
   `SELECT … FROM public.diary_entries`.
3. The same connection **fails with `42501`** on
   `UPDATE public.subscriptions`.
4. The same connection **succeeds** at the one allowlisted function call.
5. The failures are produced by Postgres, not by application code, and the test
   asserts the SQLSTATE — not a message string.
6. Creating a new table (simulating a Lovable ship) does **not** grant the
   restricted role access to it.

If (2), (3), or (6) cannot be shown, restricted roles are `FAIL` as an answer to
this gap and the spike should be deleted rather than weakened into passing.

---

## 5. Architecture

### 5.1 Phase 0 — the domain-reach detector (recommended first, no schema change)

This is the part I actually recommend shipping, and it needs no role, no
migration, and no owner risk decision beyond naming the slice.

Add a committed manifest, e.g. `config/edge-function-domain-reach.json`:

```text
{
  "domains": ["money", "ai", "email", "ingest", "grower", "cross"],
  "functions": {
    "paddle-webhook":       { "domain": "money",  "tables": ["paddle_events", "subscriptions", "..."] },
    "sensor-ingest-webhook":{ "domain": "ingest", "tables": ["sensor_readings", "..."] },
    "delete-account":       { "domain": "cross",  "justification": "GDPR erasure spans every domain" }
  }
}
```

Add `src/test/edge-function-domain-reach.test.ts` that, for each of the 22
service-role functions, statically extracts `.from("<table>")` / `.rpc("<fn>")`
targets and fails when a target is absent from that function's declared list.

Properties that make this worth doing regardless of what happens to roles:

- It produces the **`NOT_MEASURED` figure the Convex spec explicitly declines to
  chase** — "whether any current function actually cross-reads diaries"
  (`convex-component-physical-sandbox-spike.md` §11). Phase 0 answers it from
  source, without touching production data.
- It fails **at review time**, which is when a cross-domain edit is cheapest to
  fix.
- It is honest about its limits: a static scan cannot see dynamic table names.
  The test must declare that limitation in a header comment, and must not be
  described as a runtime fence.
- Per `AGENTS.md`, this is a source-text scan proving *absence of a forbidden
  construct* — the use the constitution explicitly endorses — not a contract
  test over resolved config, so the `check-contract-test-resolution.mjs` rule
  does not apply. State that in the header.

### 5.2 Phase 1 — one restricted role, one domain, local only

**Design principle, from §3.4: partition by function `EXECUTE`, never by table
grant.** This inverts the usual least-privilege recipe, and it is the only shape
that survives Lovable creating tables without knowing the role model exists.

```sql
-- ILLUSTRATIVE. Not for production. See §7 before writing a real migration.
CREATE ROLE verdant_ingest_writer NOLOGIN NOINHERIT;

-- No table grants. Deliberately none. Ever.
GRANT USAGE ON SCHEMA public TO verdant_ingest_writer;
GRANT EXECUTE ON FUNCTION public.<one_ingest_security_definer_fn>(...)
  TO verdant_ingest_writer;

-- Reachable through PostgREST role switching:
GRANT verdant_ingest_writer TO authenticator;
```

Why this fits the repo's grain: **208 `SECURITY DEFINER` declarations already
exist.** The privilege-boundary primitive is in place and heavily used. A
restricted role does not require new boundary functions — it requires choosing
which existing ones a caller may execute. `inference`

`NOINHERIT` matters: the role must not passively acquire privileges from
memberships. `source claim` — standard Postgres role semantics; verify in the
replay lane rather than trusting this line.

### 5.3 How a restricted role is actually reached

This is the feasibility crux, and it is where a naive role proposal dies.

Edge functions do **not** open direct Postgres connections. They call
`createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)` and go over PostgREST.
`established fact` — verified in `sensor-ingest-webhook/index.ts` and consistent
across the 22.

PostgREST selects the database role from the **`role` claim of the JWT** and
issues `SET LOCAL ROLE`. `source claim` (PostgREST/Supabase documented behavior;
**not verified against this project** — see §12). If that holds here, a
restricted role is reachable with **no transport change at all**: mint a JWT with
`{"role": "verdant_ingest_writer"}`, signed with the project JWT secret, and
grant the role to `authenticator`.

Supporting evidence that this path is available: `.env` carries a
**legacy-JWT-format** publishable key (`eyJ…`), i.e. this project is on the
JWT-secret era rather than the newer opaque `sb_publishable_…` keys.
`established fact` (format checked; value not read or reproduced).

**This must be proven in the local replay lane before any production claim.**
If PostgREST here rejects unknown `role` claims, or if the project migrates to
new-style API keys, the entire mechanism changes and Phase 1 is `BLOCKED`. Do not
write "we can mint a role JWT" into any status table until §7's P3 passes.

### 5.4 Role lattice (design target only — Phase 1 builds exactly one)

| Role | `EXECUTE` allowlist scope | Replaces service role in |
| --- | --- | --- |
| `verdant_money_writer` | Paddle/subscription/founder/referral RPCs | 8 money functions |
| `verdant_ai_writer` | `ai_credit_spend`, `ai_credit_refund`, session RPCs | `ai-coach`, `ai-doctor-review` |
| `verdant_email_writer` | Email queue / suppression RPCs | 5 email functions |
| `verdant_ingest_writer` | Sensor ingest + idempotency RPCs | 4 ingest functions |

**Phase 1 builds `verdant_ingest_writer` only.** Rationale: ingest is the
lowest-blast-radius domain — it writes sensor rows, touches no money, and already
has `run-sensor-readings-source-rls-harness.ts` to regress against. Money is the
*highest* value target and therefore the **worst** place to learn that the
mechanism does not work. `inference`

### 5.5 What restricted roles cannot fix

Stated plainly so no promotion decision over-reads this arm:

- **`delete-account` legitimately spans domains.** Erasure must reach nearly
  every table. A role for it would be `service_role` with extra steps. It stays
  as-is, and that is a real residual blast radius. `inference`
- **A restricted role does not stop a `SECURITY DEFINER` function from doing
  the wrong thing internally.** Definer functions execute as their owner. The
  role controls *which* functions run, not what they do once running. This is a
  material difference from the Convex component property. `inference`
- **New tables are not covered.** §3.4. The detector, not the role, catches that.
- **Nothing here is verified against production.** §12.

---

## 6. Codex file-level plan

### Phase 0 (if approved — small PR, no migration)

1. Add `config/edge-function-domain-reach.json` with all 22 functions declared.
2. Add `src/test/edge-function-domain-reach.test.ts` per §5.1, with a header
   stating the static-scan limitation and the `AGENTS.md` basis for it.
3. Report the measured cross-domain reach count exactly. **If it is zero, say
   zero** — that is a valid and valuable result, and it materially weakens the
   case for Phase 1. Do not editorialize it into a finding.
4. No migration. No role. No edge-function edits.

### Phase 1 (only after Phase 0 evidence and a fresh Cheek decision)

1. **New additive migration only.** Never edit a published file
   (`AGENTS.md` Migration Immutability; `published-migration-integrity.yml`
   enforces SHA-256 against base).
2. Follow **R1** from §3.5: the migration contains role creation and grants. It
   contains **no raising self-test**. Verification lives in the harness.
3. Add `scripts/run-restricted-role-harness.ts` alongside the existing 28,
   matching their conventions.
4. Wire it into `.github/workflows/security-db-local.yml` as a **non-required**
   step first. Do not add `continue-on-error` — a contract test added by #726
   fails the suite if that key returns to that workflow. `established fact`
5. Do not re-point any of the 22 edge functions at the new role in Phase 1.
   Creating the role and proving its refusals is the whole deliverable.
6. Check `config/local-supabase-replay-compatibility.json` **before** proposing
   any correction to an existing migration — the defect may already be handled
   there, in which case the correct change is none.
7. No UI. No entitlement logic. No Action Queue. No governance-file edits.

If `CREATE ROLE` is refused by the local stack or by hosted Supabase, record
`BLOCKED` with the exact SQLSTATE and stop. Do not escalate privileges to force
it through.

---

## 7. Proof tests (acceptance)

Happy path, edges, nulls, determinism, regression, and safety fences, per the
`AGENTS.md` Testing Standard.

| ID | Assertion |
| --- | --- |
| P1 | `verdant_ingest_writer` exists after replay; `rolcanlogin = false`, `rolinherit = false`, `rolbypassrls = false` — asserted from `pg_roles`, not from migration text |
| P2 | Acting as the role, `SELECT FROM public.diary_entries` raises **SQLSTATE `42501`**. Assert the SQLSTATE, never the message |
| P3 | A JWT carrying `{"role":"verdant_ingest_writer"}` reaches PostgREST and is honored (`SET LOCAL ROLE` took effect, confirmed via `SELECT current_user`). **If this fails, Phase 1 is `BLOCKED` and §5.3 is disproven — record it, do not work around it** |
| P4 | Acting as the role, `UPDATE public.subscriptions` raises `42501` |
| P5 | Acting as the role, the one allowlisted function call **succeeds** |
| P6 | The role holds **zero** rows in `information_schema.role_table_grants` |
| P7 | **Lovable-drift regression.** `CREATE TABLE public.__drift_probe(...)` inside the harness, then assert the role still cannot `SELECT` it; drop the probe. This is the §3.4 constraint under test |
| P8 | Determinism: P2 and P4 produce identical SQLSTATEs across two harness runs |
| P9 | Null/invalid: role name with empty allowlist grants no reach; a revoked `EXECUTE` immediately restores `42501` on P5's function |
| P10 | Static: no `BYPASSRLS`, `SUPERUSER`, `CREATEROLE`, or `CREATEDB` appears in the new migration |
| P11 | Regression: all 28 pre-existing RLS harnesses still pass unchanged after the role exists |

Report exact pass/fail counts. A harness that did not run is `SKIPPED` with a
stated reason. A `BLOCKED` P3 is not a `PASS` on anything downstream of it.

---

## 8. Safety fences (non-negotiable)

The spike must not:

- Create, alter, or drop any role in **production** (`knkwiiywfkbqznbxwqfh`) or
  the sandbox project (`bzatgtgjvuojpoxcknaa`). Local replay only.
- Grant `SUPERUSER`, `BYPASSRLS`, `CREATEROLE`, `CREATEDB`, or `REPLICATION`.
- Edit any published migration body. New additive files only.
- Delete, weaken, or "consolidate" any of the 28 existing RLS harnesses.
- Re-point production edge functions at a restricted role in Phase 1.
- Revoke anything from `authenticated` or `anon` — this slice adds a role, it
  does not re-open the settled §3.4 default-deny question.
- Commit, print, or log the project JWT secret, any service-role key, or any
  minted role JWT. Test JWTs are generated at harness runtime from local-stack
  secrets and never written to disk.
- Touch entitlements, AI credits, Action Queue, sensor truth labels, or device
  control.
- Claim production applicability from a local replay result.

Per `AGENTS.md`: never commit while an automated review is mutating the working
tree. Run `git status` before any commit that follows a review pass.

---

## 9. Promotion gates

| Gate | Default | What would change it |
| --- | --- | --- |
| Phase 0 detector | `HOLD` — needs Cheek to name the slice | Owner approval |
| Phase 1 local role spike | `HOLD` | Phase 0 evidence showing real cross-domain reach |
| Role reachable via minted JWT in production | `REJECT` | P3 `PASS` locally + Security review of JWT minting and key custody |
| Re-point any money function to a restricted role | `REJECT` | Separate slice; money is the last domain to migrate, not the first |
| Default-deny table grants | `REJECT` | Reverses a recorded founder decision (§3.4). Cheek only |
| Roles for `delete-account` | `REJECT` | §5.5 — erasure legitimately spans domains |
| Replace RLS harnesses with roles | `REJECT` | They answer different questions |
| Drop `service_role` from any function | `REJECT` until its domain role has run in production behind a flag for a stated bake period | Cheek + Security |

Council Chair may recommend after Phase 0 evidence exists. Only Cheek approves
promotion.

---

## 10. Comparison arm — `GAP-PGROLE-001` vs `GAP-CONVEX-001`

This section exists for the Council Chair comparison that
`CURRENT_STATE.md` reserves. It is a structured comparison, **not** a
recommendation between them — Phase 0 has not run and #977 has not landed, so
the evidence to decide does not yet exist.

| Dimension | Postgres restricted roles | Convex components (#977) |
| --- | --- | --- |
| Isolation mechanism | Role privilege check → `42501` | Component boundary; parent tables unrepresentable |
| Enforced by | The database Verdant already runs | A second runtime not currently in the repo |
| Covers the 22 existing service-role functions | Yes, incrementally, in place | No — nothing in production moves |
| Covers **new tables Lovable ships** | **No** (§3.4) — the known weak point | `NOT_APPLICABLE` — different data plane |
| Covers what a `SECURITY DEFINER` fn does once running | **No** (§5.5) | Yes, within the component |
| New runtime, dependency, lockfile | None | Yes |
| New operational surface | JWT minting, role lifecycle, drift detector | Convex deployment, credentials, egress |
| Reversibility | High — `DROP ROLE`, no data moves | High — spike is disposable |
| Blocking unknown | Does PostgREST honor a custom `role` claim here (P3)? | Can `convex-test` express cross-component denial without a cloud deploy? |
| Evidence available today | Phase 0 not run — `NOT_MEASURED` | #977 open, unmerged — `NOT_MEASURED` |

**Honest asymmetry.** Convex's isolation property is *stronger* — it constrains
what component code can express, not merely which functions a caller may invoke.
The restricted-role arm is *weaker but incumbent*: it adds no runtime, reuses 208
existing definer functions and 28 existing harnesses, and improves the surface
that actually ships today. Neither of these is established as the better call,
and this document does not assert one.

**The comparison is not currently decidable.** Both arms are `NOT_MEASURED`. Any
Council recommendation before Phase 0 evidence and #977 proof results would be an
opinion, not a finding.

---

## 11. Validation

| Check | Status | Notes |
| --- | --- | --- |
| Application typecheck / unit tests | `NOT_APPLICABLE` | Docs-only PR; no code changed |
| Full Vitest suite | `NOT_APPLICABLE` | Docs-only |
| Runtime harness | `NOT_MEASURED` | No harness exists yet; Phase 1 deliverable |
| Local Supabase replay | `NOT_MEASURED` | Not run this session |
| Production Postgres role inspection | `BLOCKED` | Agent Supabase MCP resolves to sandbox `bzatgtgjvuojpoxcknaa`, not production `knkwiiywfkbqznbxwqfh`; and this slice forbids mutating either |
| PostgREST custom-role-claim behavior (§5.3) | `NOT_MEASURED` | Documented as `source claim`; P3 is its test |
| Deploy-branch audit counts (§3.1) | `PASS` | Reproduced this session against `cbbd7122` |
| `_shared/` service-role census | `PASS` | Resolves the Convex spec's open `uncertainty` — zero helpers |
| Open-PR collision | `PASS` | #977 is the sibling Convex arm; no Postgres-role PR open |

Commands used for §3.1, reproducible from a checkout at `cbbd7122`:

```bash
git rev-parse origin/verdant-grow-diary
ls supabase/migrations/*.sql | wc -l
grep -rniE "create[[:space:]]+role" supabase/migrations/ | wc -l
grep -rniE "create schema" supabase/migrations/ | wc -l
grep -rhoiE "security[[:space:]]+definer" supabase/migrations/ | wc -l
grep -rl "SUPABASE_SERVICE_ROLE_KEY" supabase/functions/*/index.ts | wc -l
grep -rniE "service_?role" supabase/functions/_shared/
ls scripts/ | grep -cE "run-.*-rls-harness"
```

---

## 12. Unknowns and blockers

| Item | Status | Owner |
| --- | --- | --- |
| Whether hosted Supabase permits `CREATE ROLE` from a migration | `unknown` | Codex, Phase 1 local replay first |
| Whether PostgREST here honors a custom `role` JWT claim (§5.3) | `unknown` — the single blocking feasibility question | Codex, P3 |
| Whether this project will migrate to new-style `sb_secret_…` API keys | `unknown` | Owner. A migration would invalidate §5.3 |
| Actual cross-domain reach among the 22 functions | `NOT_MEASURED` | Phase 0 answers it |
| Production role inventory | `BLOCKED` | No authorized production path from an agent session |
| Whether Cheek intends this arm to open at all | `unknown` | **Cheek** — §2. This is the gating question for the whole document |
| Operational cost of role lifecycle vs a second runtime | `NOT_MEASURED` | Do not assert a cost verdict |

---

## 13. Handoff

```text
HANDOFF
from_agent: Claude
to_agent: Cheek (approval decision), then Codex (Phase 0) / Council Chair (comparison)
sentinel_version: 2026-08-09.2
date: 2026-08-14

completed:
  - Specified GAP-PGROLE-001 as the deferred comparison arm to GAP-CONVEX-001
  - Audited the privilege surface at deploy tip cbbd7122597358e4c6e55e14b7f6a769a3a69132
  - Resolved the Convex spec's open _shared/ service-role uncertainty (zero helpers)
  - Identified the binding Lovable/ACL founder decision of 2026-08-06 and designed around it
  - Extracted two migration rules (R1, R2) from the 20260805090000 rollback incident
  - Phase 0 detector, Phase 1 role design, 11 proof tests, promotion gates
  - Structured comparison table for Council Chair; explicitly not decided

verified_by:
  - git fetch + rev-parse origin/verdant-grow-diary -> cbbd7122597358e4c6e55e14b7f6a769a3a69132
  - Counts in §3.1 via the commands in §11
  - Quoted founder decision read directly from 20260807003500 migration body
  - Quoted rollback account read directly from 20260807003500 header
  - Postcondition pattern read directly from 20260807133000
  - GitHub MCP list_pull_requests state=open: #977 Convex sibling, no Postgres-role PR

not_done:
  - No migration, no role, no harness, no config, no test in this PR
  - Phase 0 detector not implemented
  - No production or sandbox database was read or mutated
  - No Security review (nothing to review yet)
  - No recommendation between the Convex and Postgres arms

unknowns:
  - PostgREST custom role-claim support here (blocking, see §12)
  - Hosted Supabase CREATE ROLE permission
  - Whether this slice is approved at all

blocked:
  - Production role inventory: sandbox-only MCP path
  - Everything downstream of a Cheek decision on §2

assumptions:
  - The designated branch name `claude/postgres-restricted-role-spec-bqw6i6`
    is an instruction to specify this arm. If it is not, this spec is void.
  - The founder decision of 2026-08-06 quoted in 20260807003500 still stands.
    If Cheek has since reversed it, §3.4 and §5.2 need rework.

next_slice:
  - Cheek: decide whether POSTGRES_RESTRICTED_ROLE_SPIKE opens (§2, §9)
  - If yes -> Codex Phase 0 only (§6). Do not start if it collides with #977's review load
  - Council Chair: hold the §10 comparison until Phase 0 evidence and #977 results exist

files_touched:
  - docs/specs/postgres-restricted-role-alternative.md
  - docs/agents/CURRENT_STATE.md
```

---

## 14. Verdict

```text
SPECIFIED — NOT APPROVED, NOT DECIDABLE YET
```

The gap is real and measured: 22 functions, one `service_role`, 115 tables, one
schema, zero custom roles. The mechanism that would close it is plausible and
fits this repo's grain, and it has one blocking feasibility unknown (§5.3/P3).

But the strongest recommendation in this document is not the role. It is
**Phase 0** — measure the actual cross-domain reach before buying either
isolation architecture. Both arms are currently justified by a capability
argument and neither by a measurement. Phase 0 is cheap, reversible, and would
tell Council Chair something that neither this spec nor #977 currently knows.

Production restricted roles remain `REJECT`. The Convex-versus-Postgres call
remains open, and this document deliberately does not make it.

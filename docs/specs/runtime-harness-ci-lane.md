# Spec — Runtime security-harness CI lane (audit proposal P5)

**Author:** Claude (Knowledge Library / Product Specification Architect)
**Date:** 2026-08-30
**Slice name:** test-coverage remediation, proposal **P5**
**Status:** **HOLD — do not wire.** P5 was proposed as a wiring slice. It is not one. The
prerequisite is a safety envelope on 17 harnesses, and that is a security change needing one owner
and a different peer as independent reviewer (`AGENTS.md`).

Every claim is labeled per the Sentinel evidence discipline: `established fact`, `source claim`,
`practical observation`, `inference`, `uncertainty`, `missing evidence`. Measured on branch
`claude/test-coverage-remediation-p2-p5`, base `d4e5a7e`.

**Inventory correction, 2026-09-02.** This spec was first measured against the audit's original
harness inventory — 33 files, 16 unrun. The audit's §9.0 defect 31 (landed in #1242) found that
inventory used a root-level, `harness`-in-name rule and missed eight real harnesses, all executed by
`security-db-local.yml`. The corrected inventory is **41 files, 23 executed, 18 unrun**. The two
harnesses added to the unrun set — `run-create-feeding-event-rls-harness.ts` and
`run-quicklog-typed-payloads-harness.ts` — are named by `irrigation-pgtap-rls-gate.yml` only in a
trigger `paths:` filter and a shell dry-run allowlist, never on a command line, and were previously
reported as RUN by a resolver that took every workflow line as execution evidence. Every figure below
is restated against the corrected inventory; the envelope table gains two rows, both measured on this
head by the same three greps as the rest. Nothing else in the verdict moves.

---

## 1. Verdict

**Do not append the 18 unrun harnesses to `test:security-db-local`.** The audit
(`docs/audits/test-coverage-audit-2026-08-29.md`, finding F3, as corrected by defect 31) measured
that 18 of 41 runtime harnesses are invoked by no workflow. It did not establish _why_, and the why changes the
slice completely.

`established fact`: of those 18, exactly **one** — `scripts/run-genetics-propagation-rls-harness.ts`
— carries a complete safety envelope, and it is the one a test explicitly pins **out** of the lane
(`src/test/genetics-propagation-rls-harness-static.test.ts`, _"exposes package aliases but does NOT
join test:security-db-local"_). The other 17 have no envelope to speak of.

`inference`: that pairing is not a coincidence. The harness that was hardened is the harness someone
thought hardest about, and they still declined to automate it. Reading the gap as "nobody got round
to wiring these" inverts the evidence.

## 2. What the envelope is

`established fact`, from `scripts/run-genetics-propagation-rls-harness.ts` and the properties its
static test pins:

1. **Default no-op.** Exits 0 with a `SKIP —` line unless opted in via `GENETICS_PROP_RLS_HARNESS`
   or `--confirm-local-security-lane`. Absence of configuration must never mean "run it".
2. **Production refusal.** Names the Verdant production project ref and refuses it outright
   (`refusing Verdant production database`).
3. **Loopback requirement.** The local security lane requires a loopback database
   (`local security lane requires a loopback database`).
4. **Least privilege.** Genuinely signed-in anon clients for every assertion; `service_role` only
   for seed, read-back and teardown.
5. **Teardown proof.** Deletes its disposable users and asserts _"has zero leftovers"_.

## 3. Measured envelope coverage across the 18

`established fact`, grepped per file on the branch head:

| Harness                                      | no-op gate | prod refusal | loopback |
| -------------------------------------------- | ---------- | ------------ | -------- |
| `run-genetics-propagation-rls-harness.ts`    | ✅         | ✅           | ✅       |
| `run-ai-credit-pack-portability-harness.ts`  | ❌         | ✅           | ✅       |
| `run-free-creation-caps-rls-harness.ts`      | ❌         | ✅           | ❌       |
| `run-sensor-history-read-cap-rls-harness.ts` | ❌         | ✅           | ❌       |
| `run-create-feeding-event-rls-harness.ts`    | ❌         | ❌ ¹         | ❌       |
| `run-quicklog-typed-payloads-harness.ts`     | ❌ ²       | ❌           | ❌       |
| the other **12**                             | ❌         | ❌           | ❌       |

¹ Carries the comment _"Run on dev/staging only — never against production"_ and no code that
enforces it. A comment is not a refusal.
² Has a `SKIP —` line, but for **missing** credentials (`SUPABASE_URL` / service-role / anon key).
With credentials present it runs unasked. The no-op criterion is the opposite: absence of an explicit
opt-in must mean "do not run". A missing-credentials skip is `BLOCKED`, never a gate.

`established fact`: a sample of six with no inline guard — `run-action-queue-rls-harness.ts`,
`run-ai-credits-rls-harness.ts`, `run-billing-rls-harness.ts`, `run-staff-role-rls-harness.ts`,
`run-verdant-storage-rls-harness.ts`, `run-quicklog-revisions-rls-harness.ts` — also import **no**
shared guard. `scripts/lib/supabaseDatabaseTargetIdentity.mjs` already exports
`assertSupabaseDatabaseTargetIdentity({ targetEnv, databaseUrl })`. None of the six uses it. The
mechanism exists and is unused.

## 4. The concrete exposure, stated precisely

`established fact`, `scripts/run-billing-rls-harness.ts`: reads `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY`, creates two `auth.users`, inserts two `billing_subscriptions` rows, and
tears them down. It runs against **whatever project `SUPABASE_URL` names**, with no check of any
kind.

`established fact`: its deletes are **scoped to its own fixtures** — `.in("user_id", [uidA, uidB])`
and `deleteUser(uidA/uidB)` — plus, in `adminCreateUser`, deletion of a pre-existing user whose email
matches the harness's fixture email, found by scanning the first 200 users. **This is not a
mass-deletion risk and should not be described as one.**

`established fact`: `AGENTS.md` §Validation Commands lists
`bun run scripts/run-billing-rls-harness.ts` and `bun run scripts/run-ai-credits-rls-harness.ts`
among the commands a contributor is told to run.

`inference`: the realistic failure is therefore not catastrophe but **contamination** — a contributor
or CI job whose environment happens to hold production `SUPABASE_URL` + service-role credentials
creates real auth users and writes real `billing_subscriptions` rows in production. Given
`AGENTS.md`'s own rule that `public.subscriptions` is the sole billing entitlement source of truth
and `billing_subscriptions` is a legacy audit surface, the blast radius is bounded. It is still
production writes from a test.

`uncertainty`: whether this has ever happened is `NOT_MEASURED`. Nothing records harness invocations.

## 5. The slice this should be, in order

Each step is independently reviewable and independently revertible.

**P5.1 — envelope, no wiring.** Give each of the 17 the four properties above, preferring
`assertSupabaseDatabaseTargetIdentity` over another hand-rolled ref check. Add a static test per
harness mirroring `genetics-propagation-rls-harness-static.test.ts`. **No workflow change.** After
this the harnesses are safe to run manually — which is what `AGENTS.md` already tells people to do,
so this step has standalone value even if P5 stops here.

**P5.2 — one static guard.** A single test asserting every file `isRuntimeHarness` matches
(`scripts/**`, `harness|db-security` — `scripts/lib/testEstateRules.mjs`) carries the envelope, so a
new harness cannot land without one. Not `scripts/*harness*`: that root-level rule is defect 31, and a
guard built on it would silently exempt the eight it misses. This is the P2(d) pattern applied to
safety rather than execution.

**P5.3 — wire, opt-in, in tranches.** Only then extend `test:security-db-local`, each harness via a
`:local-lane` alias passing `--confirm-local-security-lane`, matching the existing convention
(`test:ai-doctor-sessions-rls:local-lane`). Wire in tranches; one red harness must not take the lane
down for everything.

**Excluded throughout: `run-genetics-propagation-rls-harness.ts`.** Its exclusion is test-pinned and
deliberate. Changing it means changing that pin, which is a decision for its owner and is out of
scope here. `missing evidence`: the reason for the exclusion is not recorded anywhere I could find —
worth capturing before anyone revisits it.

## 6. What P5 must not do

- Do not append harnesses to `test:security-db-local` before P5.1. That runs unguarded service-role
  harnesses on CI runners.
- Do not add `genetics-propagation` to the lane; `src/test/genetics-propagation-rls-harness-static.test.ts`
  fails, correctly.
- Do not "fix" the exposure by deleting the harnesses. They encode real RLS trust-boundary proofs
  that exist nowhere else, and `AGENTS.md` asks for runtime harnesses on money and security paths.
- Do not treat a harness that skips for lack of credentials as a passing gate. `AGENTS.md` status
  vocabulary: that is `BLOCKED`, never `PASS`.

## 7. Interim state

`established fact`: all 18 are recorded in the P2(d) execution manifest
(`src/test/test-execution-manifest.test.ts`) under `needs-live-database`, each with the reason above.
They are declared, not silently absent, and the manifest fails if the list grows. That is the honest
interim position: the gap is visible and capped, and nothing pretends it is covered.

---

**Calibrated verdict.** P5 as scoped — "wire the runtime-harness lane" — is `HOLD`. The lane is not
the missing piece; the envelope is. P5.1 is the smallest credible next tranche, it is worth doing on
its own merits regardless of whether CI ever runs these, and it needs a named owner and a different
peer as reviewer because it is a security change to service-role code paths.

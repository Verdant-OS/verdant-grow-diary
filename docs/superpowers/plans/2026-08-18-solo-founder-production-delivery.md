# Solo-Founder Production Delivery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an auditable, fail-closed solo-founder authorization path to the Signup Acquisition and Quick Log manual-delegate production repair workflows without changing migrations, application code, or the other four production writers.

**Architecture:** Both workflows move to a dedicated `verdant-production-solo-founder` GitHub environment and consume one shared, pure authorization policy plus a small CLI adapter. Each protected run proves the current GitHub run, exact founder, environment configuration, branch policy, and approval history before database access; each APPLY additionally verifies an immutable PREFLIGHT artifact created 15 minutes to 24 hours earlier.

**Tech Stack:** GitHub Actions YAML, Node.js 22 ESM, GitHub REST API JSON, Vitest, JSZip, Bun, Prettier, ESLint.

**Spec:** `docs/superpowers/specs/2026-08-18-solo-founder-production-delivery-design.md`

## Global Constraints

- Delivery mode is exactly `solo_founder_self_review_v1`.
- Founder GitHub user ID is exactly `72639960`; implementation-time login is `cheekhimself`.
- Acknowledgement is exactly `I AM THE SOLE FOUNDER AND AUTHORIZE THIS PRODUCTION RUN`.
- Dedicated GitHub environment is exactly `verdant-production-solo-founder`; existing `verdant-production` stays unchanged.
- Minimum PREFLIGHT-to-APPLY review age is `900` seconds; maximum is `86400` seconds.
- Both PREFLIGHT and APPLY must be fresh `workflow_dispatch` runs with `run_attempt === 1`.
- Both target workflows retain `verdant-production-migration-writer`, `cancel-in-progress: false`, and `queue: max`.
- No SQL, migration, schema, RLS, application, edge-function, production, secret, account, or browser mutation is in scope.
- Raw GitHub responses, tokens, approval comments, database values, URLs, and secrets must never appear in logs or evidence.
- Every executable change follows strict RED -> GREEN and receives an independent review before merge or environment configuration.

---

## File Structure

### New shared authorization files

- `scripts/lib/solo-founder-production-authorization.mjs` — immutable policy constants and pure validation of current run, approval history, environment configuration, and branch policies.
- `scripts/verify-solo-founder-production-authorization.mjs` — reads bounded workflow-produced JSON files, invokes the pure validator, and appends only sanitized validated fields to `GITHUB_ENV`.
- `src/test/solo-founder-production-authorization.test.ts` — unit, CLI, boundary, and secret-safe failure tests for the shared contract.

### Signup files

- `.github/workflows/apply-signup-acquisition-forward-repair.yml`
- `.github/workflows/signup-acquisition-forward-repair-pg15.yml`
- `scripts/apply-signup-acquisition-forward-repair.mjs`
- `scripts/verify-signup-acquisition-preflight-artifact.mjs`
- `src/test/apply-signup-acquisition-forward-repair.test.ts`
- `src/test/verify-signup-acquisition-preflight-artifact.test.ts`
- `src/test/signup-acquisition-forward-repair-pg15-harness.test.ts`
- `docs/signup-attribution-outage-operator-runbook.md`

### Quick Log files

- `.github/workflows/apply-quicklog-manual-delegate-forward-repair.yml`
- `.github/workflows/quicklog-manual-delegate-forward-repair-pg15.yml`
- `scripts/apply-quicklog-manual-delegate-forward-repair.mjs`
- `scripts/verify-quicklog-manual-delegate-forward-repair-preflight-artifact.mjs`
- `src/test/apply-quicklog-manual-delegate-forward-repair.test.ts`
- `src/test/verify-quicklog-manual-delegate-forward-repair-preflight-artifact.test.ts`
- `docs/quicklog-manual-delegate-forward-repair-operator-runbook.md`

### Shared compatibility and documentation files

- `src/test/production-supabase-tls.test.ts`
- `docs/superpowers/specs/2026-08-18-solo-founder-production-delivery-design.md`
- `docs/superpowers/plans/2026-08-18-solo-founder-production-delivery.md`

---

### Task 1: Shared Solo-Founder Authorization Verifier

**Files:**

- Create: `scripts/lib/solo-founder-production-authorization.mjs`
- Create: `scripts/verify-solo-founder-production-authorization.mjs`
- Create: `src/test/solo-founder-production-authorization.test.ts`

**Interfaces:**

- Produces constants:

```js
export const SOLO_FOUNDER_POLICY = Object.freeze({
  deliveryMode: "solo_founder_self_review_v1",
  founderUserId: 72639960,
  founderLogin: "cheekhimself",
  environmentName: "verdant-production-solo-founder",
  branchName: "verdant-grow-diary",
  acknowledgement: "I AM THE SOLE FOUNDER AND AUTHORIZE THIS PRODUCTION RUN",
  minimumReviewSeconds: 900,
  maximumReviewSeconds: 86400,
});
```

- Produces pure validator:

```js
export function validateSoloFounderProductionAuthorization({
  currentRun,
  approvals,
  environment,
  branchPolicies,
  expected,
}) {}
```

- Produces exact frozen evidence:

```js
Object.freeze({
  deliveryMode: "solo_founder_self_review_v1",
  founderUserId: 72639960,
  founderLogin: "cheekhimself",
  environmentName: "verdant-production-solo-founder",
  acknowledgementVerified: true,
  environmentContractVerified: true,
  environmentApprovalVerified: true,
  minimumReviewSeconds: 900,
  maximumReviewSeconds: 86400,
});
```

- CLI consumes `CURRENT_RUN_JSON`, `CURRENT_RUN_APPROVALS_JSON`, `SOLO_FOUNDER_ENVIRONMENT_JSON`, `SOLO_FOUNDER_BRANCH_POLICIES_JSON`, `SOLO_FOUNDER_ACKNOWLEDGEMENT`, `GITHUB_REPOSITORY`, `GITHUB_REPOSITORY_ID`, `GITHUB_RUN_ID`, `GITHUB_RUN_ATTEMPT`, `GITHUB_SHA`, `GITHUB_ACTOR_ID`, `GITHUB_ACTOR`, `GITHUB_TRIGGERING_ACTOR`, `SOLO_FOUNDER_EXPECTED_WORKFLOW_PATH`, and `GITHUB_ENV`.
- CLI appends only fixed-key, newline-safe `SOLO_FOUNDER_*` values to `GITHUB_ENV` and prints only `Solo-founder production authorization validated.` or `Solo-founder production authorization failed closed.`.

The exact validated environment output is:

```text
SOLO_FOUNDER_DELIVERY_MODE=solo_founder_self_review_v1
SOLO_FOUNDER_VERIFIED_USER_ID=72639960
SOLO_FOUNDER_VERIFIED_LOGIN=cheekhimself
SOLO_FOUNDER_VERIFIED_ENVIRONMENT=verdant-production-solo-founder
SOLO_FOUNDER_ACKNOWLEDGEMENT_VERIFIED=true
SOLO_FOUNDER_ENVIRONMENT_CONTRACT_VERIFIED=true
SOLO_FOUNDER_ENVIRONMENT_APPROVAL_VERIFIED=true
SOLO_FOUNDER_MINIMUM_REVIEW_SECONDS=900
SOLO_FOUNDER_MAXIMUM_REVIEW_SECONDS=86400
```

Both runners map that evidence into these exact closed receipt/audit fields:

```js
{
  delivery_mode: "solo_founder_self_review_v1",
  founder_github_user_id: 72639960,
  founder_github_login: "cheekhimself",
  production_environment: "verdant-production-solo-founder",
  solo_founder_acknowledgement_verified: true,
  environment_contract_verified: true,
  environment_approval_verified: true,
  minimum_review_seconds: 900,
  maximum_review_seconds: 86400,
}
```

`currentRun.path` accepts only `SOLO_FOUNDER_EXPECTED_WORKFLOW_PATH` or that exact path suffixed with `@verdant-grow-diary`; the input is a committed workflow environment value, never a dispatch input.

- [ ] **Step 1: Write strict failing pure-validator tests**

Create fixtures with one exact current run, one exact approval, one exact required-reviewer rule, and one exact branch policy:

```ts
const currentRun = {
  id: 987654321,
  run_attempt: 1,
  event: "workflow_dispatch",
  path: ".github/workflows/apply-signup-acquisition-forward-repair.yml",
  head_branch: "verdant-grow-diary",
  head_sha: "a".repeat(40),
  repository: { id: 123456789, full_name: "Verdant-OS/verdant-grow-diary" },
  head_repository: { id: 123456789, full_name: "Verdant-OS/verdant-grow-diary" },
  actor: { id: 72639960, login: "cheekhimself" },
  triggering_actor: { id: 72639960, login: "cheekhimself" },
};

const approvals = [
  {
    state: "approved",
    environments: [{ name: "verdant-production-solo-founder" }],
    user: { id: 72639960, login: "cheekhimself" },
  },
];
```

Assert the exact frozen evidence shape, then table-test rejection for wrong/missing actor, triggering actor, login, repository, run ID, SHA, branch, workflow path, event, acknowledgement, and `run_attempt !== 1`.

- [ ] **Step 2: Add failing environment, approval, and pagination tests**

Use this exact environment contract:

```ts
const environment = {
  name: "verdant-production-solo-founder",
  can_admins_bypass: false,
  deployment_branch_policy: {
    protected_branches: false,
    custom_branch_policies: true,
  },
  protection_rules: [
    {
      type: "required_reviewers",
      prevent_self_review: false,
      reviewers: [{ type: "User", reviewer: { id: 72639960, login: "cheekhimself" } }],
    },
    { type: "branch_policy" },
  ],
};

const branchPolicies = {
  total_count: 1,
  branch_policies: [{ name: "verdant-grow-diary", type: "branch" }],
};
```

Reject missing/extra/team reviewers, `prevent_self_review: true`, admin bypass, missing or extra protection rules, disabled custom policies, wrong branch type/name, `total_count !== array.length`, count greater than `100`, empty/duplicate/rejected/wrong-user/wrong-environment approvals, and an approval record containing more than one environment.

- [ ] **Step 3: Run the new test to prove RED**

Run:

```powershell
bunx vitest run src/test/solo-founder-production-authorization.test.ts --reporter=dot
```

Expected: FAIL because both new modules are absent.

- [ ] **Step 4: Implement the pure validator minimally**

Use exact-key/type predicates, safe integers, lowercase SHA validation, GitHub-login validation, and one fixed rejection primitive:

```js
function reject() {
  throw new Error("solo_founder_authorization_rejected");
}
```

Do not retain approval comments or raw response objects in the return value.

- [ ] **Step 5: Implement the bounded CLI adapter**

Require every JSON input path, reject files larger than `65_536` bytes before parsing, and append validated evidence using `appendFileSync(..., { encoding: "utf8", mode: 0o600 })`.

Export:

```js
export function runSoloFounderProductionAuthorization({
  env = process.env,
  readFile = readFileSync,
  stat = lstatSync,
  appendFile = appendFileSync,
  logger = console,
} = {}) {}
```

Return `0` only for exact validation and `1` for every rejection.

- [ ] **Step 6: Add CLI secret-safe failure tests**

Inject raw fixture fields containing `SECRET_SENTINEL`, `https://user:pass@example.invalid`, and newline-bearing approval comments. Assert the function returns `1`, writes no `GITHUB_ENV` entry, and neither logger stream contains any attacker-controlled value.

- [ ] **Step 7: Run shared GREEN and syntax checks**

Run:

```powershell
bunx vitest run src/test/solo-founder-production-authorization.test.ts --reporter=dot
node --check scripts/lib/solo-founder-production-authorization.mjs
node --check scripts/verify-solo-founder-production-authorization.mjs
```

Expected: all shared tests pass and both syntax checks exit `0`.

- [ ] **Step 8: Commit the shared contract**

```powershell
git add scripts/lib/solo-founder-production-authorization.mjs scripts/verify-solo-founder-production-authorization.mjs src/test/solo-founder-production-authorization.test.ts
git commit -m "feat: add solo-founder production authorization gate"
```

---

### Task 2: Signup Artifact Provenance and Review Window

**Files:**

- Modify: `scripts/verify-signup-acquisition-preflight-artifact.mjs`
- Modify: `src/test/verify-signup-acquisition-preflight-artifact.test.ts`

**Interfaces:**

- Consumes `SOLO_FOUNDER_POLICY` from Task 1.
- `expected` gains `preflightRunAttempt` and `preflightArtifactSha256`.
- Existing validator and bundle return shapes remain stable.

- [ ] **Step 1: Update valid fixtures, then add strict failing actor/window tests**

Add exact `actor` and `triggering_actor` objects to `priorRun()` and `currentRun()`. Set valid timestamps so current APPLY is created exactly 15 minutes after prior PREFLIGHT completion. Add table cases for all four actor objects, prior/current attempts other than `1`, `14:59.999`, and `24:00:00.001`.

- [ ] **Step 2: Add failing Signup attempt/digest substitution tests**

Require `expectedContext()` to include:

```ts
preflightRunAttempt: 1,
preflightArtifactSha256: createHash("sha256").update(archive).digest("hex"),
```

Prove a different expected attempt, a different artifact API digest, and a complete same-run replacement archive are rejected.

- [ ] **Step 3: Add failing strict receipt authorization tests**

Extend the receipt fixture with the nine closed authorization fields from the spec. Prove missing, altered, wrong-type, and extra authorization fields reject the ZIP bundle.

- [ ] **Step 4: Run the Signup verifier test to prove RED**

```powershell
bunx vitest run src/test/verify-signup-acquisition-preflight-artifact.test.ts --reporter=dot
```

Expected: failures for missing actor/window/attempt/digest/receipt enforcement.

- [ ] **Step 5: Implement metadata and review-window enforcement**

Import `SOLO_FOUNDER_POLICY`, require prior and current actor/triggering-actor ID `72639960`, require consistent login, require both attempts exactly `1`, and enforce:

```js
const reviewAgeMs = currentCreatedAt - priorUpdatedAt;
if (
  reviewAgeMs < SOLO_FOUNDER_POLICY.minimumReviewSeconds * 1000 ||
  reviewAgeMs > SOLO_FOUNDER_POLICY.maximumReviewSeconds * 1000
)
  reject();
```

Require the expected attempt and digest, and compare the artifact digest to the caller-pinned digest before download.

- [ ] **Step 6: Implement strict receipt authorization validation**

Add the exact authorization keys to `RECEIPT_KEYS` and compare every value to policy and authenticated prior-run login. Keep database `state_digest` behavior unchanged.

- [ ] **Step 7: Run Signup verifier GREEN**

```powershell
bunx vitest run src/test/verify-signup-acquisition-preflight-artifact.test.ts --reporter=dot
node --check scripts/verify-signup-acquisition-preflight-artifact.mjs
```

Expected: all Signup artifact-verifier tests pass.

- [ ] **Step 8: Commit Signup provenance hardening**

```powershell
git add scripts/verify-signup-acquisition-preflight-artifact.mjs src/test/verify-signup-acquisition-preflight-artifact.test.ts
git commit -m "feat: bind signup apply to founder preflight evidence"
```

---

### Task 3: Signup Workflow, Runner Evidence, and Runbook

**Files:**

- Modify: `.github/workflows/apply-signup-acquisition-forward-repair.yml`
- Modify: `.github/workflows/signup-acquisition-forward-repair-pg15.yml`
- Modify: `scripts/apply-signup-acquisition-forward-repair.mjs`
- Modify: `src/test/apply-signup-acquisition-forward-repair.test.ts`
- Modify: `src/test/signup-acquisition-forward-repair-pg15-harness.test.ts`
- Modify: `src/test/production-supabase-tls.test.ts`
- Modify: `docs/signup-attribution-outage-operator-runbook.md`

**Interfaces:**

- Consumes Task 1 CLI and validated `SOLO_FOUNDER_*` values.
- Consumes Task 2 inputs `EXPECTED_PREFLIGHT_RUN_ATTEMPT` and `EXPECTED_PREFLIGHT_ARTIFACT_SHA256`.
- Runner remains `runSignupAcquisitionForwardRepair(options): number`.

- [ ] **Step 1: Add failing workflow-contract tests**

Parse the workflow and assert the required/no-default acknowledgement input, new attempt/digest inputs, dedicated environment, exact founder and attempt checks, all four read-only GitHub API paths, shared verifier placement before artifact/secret/database steps, and unchanged shared concurrency.

- [ ] **Step 2: Add failing runner input/evidence tests**

Extend `baseEnv()` with exact validated `SOLO_FOUNDER_*` values. Table-test each missing/altered value and `GITHUB_RUN_ATTEMPT=2`, asserting zero `psql` spawns. Assert both audit and PREFLIGHT receipt contain exact authorization evidence and no attacker-controlled values.

- [ ] **Step 3: Add failing runbook, TLS, and path-filter tests**

Require the runbook to name the dedicated environment, exact acknowledgement, founder self-review, admin bypass OFF, fresh-dispatch-only recovery, 15-minute minimum, 24-hour expiry, prior attempt, and artifact SHA-256. Parameterize the TLS helper so Signup expects the solo environment. Require the Signup PG15 workflow path filter to include both new shared scripts and the shared test.

- [ ] **Step 4: Run Signup workflow/runner tests to prove RED**

```powershell
bunx vitest run src/test/apply-signup-acquisition-forward-repair.test.ts src/test/signup-acquisition-forward-repair-pg15-harness.test.ts src/test/production-supabase-tls.test.ts --reporter=dot
```

Expected: failures for absent workflow inputs, environment, gate, evidence, runbook, TLS expectation, and path filters.

- [ ] **Step 5: Implement the Signup workflow gate**

Add required `solo_founder_acknowledgement`, optional APPLY-only attempt/digest inputs, exact founder/acknowledgement/attempt validation, and PREFLIGHT provenance-input emptiness. Switch only this workflow to `verdant-production-solo-founder`.

After audit-directory creation, fetch exactly:

```text
repos/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}
repos/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}/approvals
repos/${GITHUB_REPOSITORY}/environments/verdant-production-solo-founder
repos/${GITHUB_REPOSITORY}/environments/verdant-production-solo-founder/deployment-branch-policies?per_page=100
```

Then run the shared verifier. Its fixed sanitized failure artifact must be written before stopping.

- [ ] **Step 6: Wire exact Signup artifact provenance**

Pass attempt/digest through validate/apply environments and into the Signup artifact verifier. Require all three prior-receipt inputs for APPLY and all three empty for PREFLIGHT.

- [ ] **Step 7: Harden the Signup runner and evidence**

Import policy, reject any non-exact authorization env value before database URL access, require attempt `1`, and add exact authorization fields to audit and safe-to-apply receipt. Do not change migration SQL, preflight SQL, database state digest, or postflight behavior.

- [ ] **Step 8: Rewrite runbook and update CI compatibility**

Document dedicated environment setup, founder self-approval, API verification, no admin bypass, exact inputs, review window, expiry, fresh-dispatch recovery, and the sentence `This proves founder identity, intent, provenance, and elapsed time; it is not independent human review.` Update TLS expectation and PG15 path filters only as required by the new environment/shared files.

- [ ] **Step 9: Run Signup GREEN**

```powershell
bunx vitest run src/test/solo-founder-production-authorization.test.ts src/test/apply-signup-acquisition-forward-repair.test.ts src/test/verify-signup-acquisition-preflight-artifact.test.ts src/test/signup-acquisition-forward-repair-pg15-harness.test.ts src/test/production-supabase-tls.test.ts --reporter=dot
node --check scripts/apply-signup-acquisition-forward-repair.mjs
node --check scripts/verify-signup-acquisition-preflight-artifact.mjs
```

Expected: all Signup/shared compatibility tests pass and syntax exits `0`.

- [ ] **Step 10: Commit Signup integration**

```powershell
git add .github/workflows/apply-signup-acquisition-forward-repair.yml .github/workflows/signup-acquisition-forward-repair-pg15.yml scripts/apply-signup-acquisition-forward-repair.mjs src/test/apply-signup-acquisition-forward-repair.test.ts src/test/signup-acquisition-forward-repair-pg15-harness.test.ts src/test/production-supabase-tls.test.ts docs/signup-attribution-outage-operator-runbook.md
git commit -m "feat: add solo-founder signup repair delivery"
```

---

### Task 4: Quick Log Artifact Actor and Review Window Binding

**Files:**

- Modify: `scripts/verify-quicklog-manual-delegate-forward-repair-preflight-artifact.mjs`
- Modify: `src/test/verify-quicklog-manual-delegate-forward-repair-preflight-artifact.test.ts`

**Interfaces:**

- Consumes `SOLO_FOUNDER_POLICY` from Task 1.
- Preserves existing prior run-attempt and artifact-digest inputs.
- Preserves existing verifier and bundle return shapes.

- [ ] **Step 1: Add valid actor fixtures and failing actor tests**

Change existing valid run attempts from `2` to `1`. Add exact founder `actor` and `triggering_actor` objects to prior/current fixtures. Reject every wrong/missing ID/login combination and both prior/current attempts other than `1`.

- [ ] **Step 2: Add failing review-window boundaries**

Require exactly `900_000 <= currentCreatedAt - priorUpdatedAt <= 86_400_000`. Test one millisecond below/above and both accepted boundaries. Keep `expected.now` later than artifact expiry checks so wall-clock time cannot make an early dispatch valid.

- [ ] **Step 3: Add failing strict receipt authorization tests**

Extend the receipt fixture with the same nine exact authorization fields as Signup and prove any missing, altered, extra, or wrong-type field rejects.

- [ ] **Step 4: Run Quick Log verifier RED**

```powershell
bunx vitest run src/test/verify-quicklog-manual-delegate-forward-repair-preflight-artifact.test.ts --reporter=dot
```

Expected: failures for absent actor, timing, attempt, and receipt checks.

- [ ] **Step 5: Implement actor, attempt, timing, and receipt checks**

Import shared policy, validate both run identities, require attempt `1`, enforce the fixed review window, and validate strict receipt authorization fields without changing archive download or database state-digest logic.

- [ ] **Step 6: Run Quick Log verifier GREEN**

```powershell
bunx vitest run src/test/verify-quicklog-manual-delegate-forward-repair-preflight-artifact.test.ts --reporter=dot
node --check scripts/verify-quicklog-manual-delegate-forward-repair-preflight-artifact.mjs
```

Expected: all Quick Log artifact-verifier tests pass.

- [ ] **Step 7: Commit Quick Log provenance hardening**

```powershell
git add scripts/verify-quicklog-manual-delegate-forward-repair-preflight-artifact.mjs src/test/verify-quicklog-manual-delegate-forward-repair-preflight-artifact.test.ts
git commit -m "feat: bind quicklog apply to founder review window"
```

---

### Task 5: Quick Log Workflow, Runner Evidence, and Runbook

**Files:**

- Modify: `.github/workflows/apply-quicklog-manual-delegate-forward-repair.yml`
- Modify: `.github/workflows/quicklog-manual-delegate-forward-repair-pg15.yml`
- Modify: `scripts/apply-quicklog-manual-delegate-forward-repair.mjs`
- Modify: `src/test/apply-quicklog-manual-delegate-forward-repair.test.ts`
- Modify: `src/test/production-supabase-tls.test.ts`
- Modify: `docs/quicklog-manual-delegate-forward-repair-operator-runbook.md`

**Interfaces:**

- Consumes Task 1 shared CLI/evidence and Task 4 verifier.
- Preserves Quick Log's active-writer API guard and database recovery protocol.
- Runner remains `runQuickLogManualDelegateForwardRepair(options): number`.

- [ ] **Step 1: Add failing workflow-contract tests**

Require exact acknowledgement input, founder/current-attempt checks, dedicated environment, four read-only API requests, shared verifier before database access, unchanged attempt/digest inputs, and unchanged six-writer concurrency/idle inventory.

- [ ] **Step 2: Add failing runner/evidence tests**

Extend `baseEnv()` with exact `SOLO_FOUNDER_*` values. Reject each altered value and `GITHUB_RUN_ATTEMPT=2` before any `psql` spawn. Assert strict authorization evidence in PREFLIGHT receipt/audit and absence of untrusted API fields.

- [ ] **Step 3: Add failing runbook, TLS, and path-filter tests**

Replace old distinct-reviewer/Prevent-self-review assertions with dedicated-environment, founder self-review, no-admin-bypass, exact acknowledgement, fresh dispatch, 15-minute, 24-hour, attempt, digest, and non-independent-review assertions. Parameterize the TLS helper for the solo environment. Require the Quick Log PG15 workflow to watch both shared scripts and shared test.

- [ ] **Step 4: Run Quick Log runner/workflow RED**

```powershell
bunx vitest run src/test/apply-quicklog-manual-delegate-forward-repair.test.ts src/test/production-supabase-tls.test.ts --reporter=dot
```

Expected: failures for absent solo-founder workflow, runner, evidence, runbook, TLS, and path-filter contracts.

- [ ] **Step 5: Implement the Quick Log workflow gate**

Add exact acknowledgement and founder/current-attempt validation, switch only this job to `verdant-production-solo-founder`, fetch the same four read-only API resources, and run the shared verifier before authenticated PREFLIGHT artifact validation, active-writer checks, secret guards, or database commands. Preserve existing writer inventory and recovery steps.

- [ ] **Step 6: Harden the Quick Log runner and evidence**

Import and validate shared policy values before database URL access, require attempt `1`, and add strict authorization fields to audit and recoverable PREFLIGHT receipts. Leave SQL, migration, ledger recovery, state digest, and postflight unchanged.

- [ ] **Step 7: Rewrite runbook and update CI compatibility**

Document exact dedicated-environment configuration, founder self-review, API evidence, review interval, expiry, fresh-dispatch recovery, and limits of self-review. Retain no-freeze, no-delete rollback and active-writer instructions. Update TLS expectation and PG15 path filters only as required by the new environment/shared files.

- [ ] **Step 8: Run Quick Log GREEN**

```powershell
bunx vitest run src/test/solo-founder-production-authorization.test.ts src/test/apply-quicklog-manual-delegate-forward-repair.test.ts src/test/verify-quicklog-manual-delegate-forward-repair-preflight-artifact.test.ts src/test/production-supabase-tls.test.ts --reporter=dot
node --check scripts/apply-quicklog-manual-delegate-forward-repair.mjs
node --check scripts/verify-quicklog-manual-delegate-forward-repair-preflight-artifact.mjs
```

Expected: all Quick Log/shared compatibility tests pass and syntax exits `0`.

- [ ] **Step 9: Commit Quick Log integration**

```powershell
git add .github/workflows/apply-quicklog-manual-delegate-forward-repair.yml .github/workflows/quicklog-manual-delegate-forward-repair-pg15.yml scripts/apply-quicklog-manual-delegate-forward-repair.mjs src/test/apply-quicklog-manual-delegate-forward-repair.test.ts src/test/production-supabase-tls.test.ts docs/quicklog-manual-delegate-forward-repair-operator-runbook.md
git commit -m "feat: add solo-founder quicklog repair delivery"
```

---

### Task 6: Consolidated Verification and Independent Review

**Files:**

- Modify only when a scoped validation failure proves a defect in the files listed above.

**Interfaces:**

- Consumes every task's committed output.
- Produces exact counts, immutable hashes, and a reviewer verdict.

- [ ] **Step 1: Run the complete focused delivery suite**

```powershell
bunx vitest run `
  src/test/solo-founder-production-authorization.test.ts `
  src/test/apply-signup-acquisition-forward-repair.test.ts `
  src/test/verify-signup-acquisition-preflight-artifact.test.ts `
  src/test/signup-acquisition-forward-repair-pg15-harness.test.ts `
  src/test/apply-quicklog-manual-delegate-forward-repair.test.ts `
  src/test/verify-quicklog-manual-delegate-forward-repair-preflight-artifact.test.ts `
  src/test/production-supabase-tls.test.ts `
  --reporter=dot
```

Expected: every test passes with zero failed/skipped tests unless a pre-existing test is explicitly documented.

- [ ] **Step 2: Run syntax, type, lint, format, and diff gates**

```powershell
node --check scripts/lib/solo-founder-production-authorization.mjs
node --check scripts/verify-solo-founder-production-authorization.mjs
node --check scripts/apply-signup-acquisition-forward-repair.mjs
node --check scripts/verify-signup-acquisition-preflight-artifact.mjs
node --check scripts/apply-quicklog-manual-delegate-forward-repair.mjs
node --check scripts/verify-quicklog-manual-delegate-forward-repair-preflight-artifact.mjs
bunx tsgo --noEmit
bunx eslint scripts/lib/solo-founder-production-authorization.mjs scripts/verify-solo-founder-production-authorization.mjs scripts/apply-signup-acquisition-forward-repair.mjs scripts/verify-signup-acquisition-preflight-artifact.mjs scripts/apply-quicklog-manual-delegate-forward-repair.mjs scripts/verify-quicklog-manual-delegate-forward-repair-preflight-artifact.mjs src/test/solo-founder-production-authorization.test.ts src/test/apply-signup-acquisition-forward-repair.test.ts src/test/verify-signup-acquisition-preflight-artifact.test.ts src/test/apply-quicklog-manual-delegate-forward-repair.test.ts src/test/verify-quicklog-manual-delegate-forward-repair-preflight-artifact.test.ts src/test/production-supabase-tls.test.ts --max-warnings=0
bunx prettier --check .github/workflows/apply-signup-acquisition-forward-repair.yml .github/workflows/signup-acquisition-forward-repair-pg15.yml .github/workflows/apply-quicklog-manual-delegate-forward-repair.yml .github/workflows/quicklog-manual-delegate-forward-repair-pg15.yml scripts/lib/solo-founder-production-authorization.mjs scripts/verify-solo-founder-production-authorization.mjs scripts/apply-signup-acquisition-forward-repair.mjs scripts/verify-signup-acquisition-preflight-artifact.mjs scripts/apply-quicklog-manual-delegate-forward-repair.mjs scripts/verify-quicklog-manual-delegate-forward-repair-preflight-artifact.mjs src/test/solo-founder-production-authorization.test.ts src/test/apply-signup-acquisition-forward-repair.test.ts src/test/verify-signup-acquisition-preflight-artifact.test.ts src/test/signup-acquisition-forward-repair-pg15-harness.test.ts src/test/apply-quicklog-manual-delegate-forward-repair.test.ts src/test/verify-quicklog-manual-delegate-forward-repair-preflight-artifact.test.ts src/test/production-supabase-tls.test.ts docs/signup-attribution-outage-operator-runbook.md docs/quicklog-manual-delegate-forward-repair-operator-runbook.md docs/superpowers/specs/2026-08-18-solo-founder-production-delivery-design.md docs/superpowers/plans/2026-08-18-solo-founder-production-delivery.md
git diff --check
```

Expected: every command exits `0`.

- [ ] **Step 3: Run static safety scans**

```powershell
rg -n "console\.(log|error).*token|console\.(log|error).*secret|SUPABASE_DB_URL.*console|Authorization:.*console|service_role" .github/workflows/apply-signup-acquisition-forward-repair.yml .github/workflows/apply-quicklog-manual-delegate-forward-repair.yml scripts/lib/solo-founder-production-authorization.mjs scripts/verify-solo-founder-production-authorization.mjs scripts/apply-signup-acquisition-forward-repair.mjs scripts/verify-signup-acquisition-preflight-artifact.mjs scripts/apply-quicklog-manual-delegate-forward-repair.mjs scripts/verify-quicklog-manual-delegate-forward-repair-preflight-artifact.mjs
git diff --name-only | rg "^(supabase/migrations|src/pages|src/components|supabase/functions)/"
```

Expected: no unsafe logging match and no out-of-scope path.

- [ ] **Step 4: Compute final hashes**

```powershell
Get-FileHash -Algorithm SHA256 scripts/lib/solo-founder-production-authorization.mjs,scripts/verify-solo-founder-production-authorization.mjs,scripts/apply-signup-acquisition-forward-repair.mjs,scripts/verify-signup-acquisition-preflight-artifact.mjs,scripts/apply-quicklog-manual-delegate-forward-repair.mjs,scripts/verify-quicklog-manual-delegate-forward-repair-preflight-artifact.mjs | Format-Table Path,Hash -AutoSize
```

Record exact uppercase SHA-256 values and byte counts in the handoff.

- [ ] **Step 5: Request independent blocker-only review**

The reviewer checks founder/actor/reviewer/environment binding, approval ambiguity, rerun rejection, timing boundaries, Signup attempt/artifact substitution resistance, strict receipts, secret-safe failures, dedicated-environment isolation, and unchanged migration/TLS/postflight semantics.

Expected: `APPROVE` with P0/P1/P2 counts, or a scoped remediation cycle beginning with new RED tests.

- [ ] **Step 6: Commit documentation and final reviewed corrections**

```powershell
git add docs/superpowers/specs/2026-08-18-solo-founder-production-delivery-design.md docs/superpowers/plans/2026-08-18-solo-founder-production-delivery.md
git commit -m "docs: define solo-founder production delivery"
```

- [ ] **Step 7: Stop before external mutation**

Report branch, commits, hashes, exact validation counts, reviewer verdict, and external blockers. Do not push, open or merge a PR, create or change a GitHub environment, add secrets, dispatch PREFLIGHT/APPLY, or create an account without separate explicit authorization.

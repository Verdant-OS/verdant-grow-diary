# Go-live run sequence for when the Vercel 402 clears

Status: a plan only. Nothing here was dispatched, published, applied or written to
production when it was drafted. Every trigger below is an owner action (Matthew), or runs
under the owner's account where the workflow requires it. Handoff item 5. Owner: Grok.
Reviewer seat: Critical Mass.

Ground rules (from `docs/production-only-verification-runbook.md` and
`docs/agents/HANDOFF_PROTOCOL.md`):

- Target **https://verdantgrowdiary.com** only. `E2E_BASE_URL` and `E2E_GROW_1_PLANT_URL`
  stay on that host. A missing non-production host is not a blocker, and no other host is
  substituted.
- Fixture identity: the disposable smoke account cheekhimself@gmail.com. **Never**
  matt@verdantgrowdiary.com or the KEEP account. Before any write, verify the account owns
  the fixture grow and its selected tent and plant; the email alone grants no scope.
- Tag every saved grow record `[smoke <ISO timestamp>]` and read it back in that grow's
  Timeline.
- No customer data, real charge, role/auth/entitlement change, device control or Action
  Queue transition. Stop a write if identity, ownership or tagging can't be verified, and
  report that exact gap.
- A merge is not a deployment, and `/version.json` doesn't prove applied SQL or deployed
  edge code. Each axis gets its own PASS / FAIL / BLOCKED / NOT_MEASURED receipt.

## Specs and workflows in this sequence

| Ref   | What it proves                                          | Spec                                                                                                          | Workflow                                                           | Writes?                                                                                  |
| ----- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| #1849 | signed-in route readiness timings                       | `e2e/signed-in-performance.spec.ts` (+ `e2e/lib/signedInPerformance*.ts`, `e2e/lib/signedInReadonlyProof.ts`) | `.github/workflows/signed-in-readonly-performance.yml`             | no                                                                                       |
| #1849 | existing Quick Log save + readback with timings         | `e2e/quicklog-smoke.spec.ts`                                                                                  | `.github/workflows/quicklog-smoke.yml` (`run_mode=quicklog_smoke`) | **yes**, one tagged fixture record                                                       |
| #1859 | settings / account / browser-consent proof              | `e2e/settings-account-consent-proof.spec.ts` (+ `e2e/lib/settingsAccountProofRules.ts`)                       | `.github/workflows/settings-account-consent-proof.yml`             | no server write; preference saves stay in the disposable browser context's local storage |
| #1860 | Actions readback and refresh, approval-required framing | `e2e/actions-readonly-proof.spec.ts` (+ `e2e/lib/actionsReadonlyProofRules.ts`)                               | `.github/workflows/actions-readonly-proof.yml`                     | no; no transitions                                                                       |
| #1861 | daily Quick Log save-timing smoke                       | `e2e/quicklog-smoke.spec.ts` (+ `e2e/lib/unattendedRunRules.ts`)                                              | `quicklog-smoke.yml` `schedule: "17 9 * * *"` (09:17 UTC daily)    | **yes**, tagged                                                                          |

Every production job is gated in the workflow itself: it runs only on
`Verdant-OS/verdant-grow-diary` at `refs/heads/verdant-grow-diary`, on attempt 1, with
actor and triggering actor `cheekhimself` (schedule runs are trusted from the deploy
ref). It also refuses unless `E2E_BASE_URL` is `https://verdantgrowdiary.com` and the
fixture email matches. Each pins `E2E_EXPECTED_SHA` to the checked-out commit and runs
`node scripts/wait-for-deployed-sha.mjs` (reads public `/version.json` only), so it
measures nothing until production serves that SHA.

## Run sequence

### Step 0: preconditions (stop if any fails)

1. The Vercel 402 has cleared and the owner has published (promoted) a production build of
   the deploy tip. See `docs/agents/RUNBOOK_VERCEL_PROMOTE.md`. Promotion is Matthew only.
2. `https://verdantgrowdiary.com/version.json` reports the intended tip SHA and
   `dirty:false` on the apex. Check `www` too, per the runbook's "Verify every production
   hostname" section.
   **Stop** if any hostname serves a different SHA.
3. The fixture Quick Log write target isn't archived. `CURRENT_STATE.md` records that the
   configured write-smoke fixture is archived, and that no automatic unarchive is allowed.
   Until the owner restores it, steps 4 and 6 are **BLOCKED**. Don't unarchive or reseed
   from an agent.

### Step 1: read-only frontend proofs on the new build

Run these first: they can't write, so a failure here stops the sequence before anything is
mutated.

```bash
gh workflow run actions-readonly-proof.yml -R Verdant-OS/verdant-grow-diary --ref verdant-grow-diary
gh workflow run settings-account-consent-proof.yml -R Verdant-OS/verdant-grow-diary --ref verdant-grow-diary
gh workflow run signed-in-readonly-performance.yml -R Verdant-OS/verdant-grow-diary --ref verdant-grow-diary
```

Each job runs `bunx playwright test <spec> --project=chromium-authed --workers=1 --retries=0 --reporter=list`
after its offline contract tests.

**Stop conditions:** any job is red or cancelled; wait-for-deployed-sha times out (the
build isn't live); the receipt shows a read outside the fixture's own scope; or the Actions
proof shows any approval-free framing.

### Step 2: publish the merged server changes, in the item 3 order

Follow `docs/release/merged-unshipped-server-changes-2026-10-03.md` (handoff item 3,
draft #1894). Owner actions only (production database lock knk, HOLD #1250):

1. Migrations by version: #1831 `20260927002000`, then #1741 `20260927094000`, then #1831
   `20260927160000` and `20260928183000`. #1834 `20260927012000` only if the apply path accepts
   an out-of-order version. #1836 `20261001140000` last (it accepts either predecessor).
2. Before any edge deploy that includes #1869: confirm `PAYMENTS_ENVIRONMENT=live` in the
   Supabase function secrets. If it's unset, checkout returns 503 by design.
3. Redeploy the edge functions listed there: `mcp` (#1651, #1655), `ai-doctor-review`
   (#1658), and all 12 consumers of `_shared/unionEntitlementLookup.ts` (#1869).

**Stop conditions:** any migration preflight raises (each file fails closed in its own
transaction); `PAYMENTS_ENVIRONMENT` isn't confirmed; any function deploy fails. Don't
continue to the write steps with a partially applied server.

### Step 3: re-run the read-only proofs

Repeat step 1 after step 2. This separates "server publish broke a read" from "new
frontend broke a read". The same stop conditions apply.

### Step 4: Quick Log save + readback (#1849), the first write

```bash
gh workflow run quicklog-smoke.yml -R Verdant-OS/verdant-grow-diary --ref verdant-grow-diary -f run_mode=quicklog_smoke
```

The job runs `bun run e2e:fixture-checklist`, `bun run e2e:bootstrap-fixture` (only if
`E2E_ALLOW_FIXTURE_BOOTSTRAP` allows it), `bun run e2e:verify-fixture`, then
`bun run e2e:quicklog-smoke` (`playwright test e2e/quicklog-smoke.spec.ts --project=chromium-authed`).
The saved record is tagged `[smoke <ISO timestamp>]` (`e2e/lib/productionQuickLogFixtureRules.ts`).

**Stop conditions:** fixture verification fails (wrong account, grow, tent or plant, or an
archived target); the save succeeds but the tagged record doesn't read back in the fixture
grow's Timeline; any write lands outside the fixture grow. On a stop, record the run link
and don't retry blindly.

### Step 5: indirect live check for #1857 (AI sensor label reaches the model)

Precondition: #1857 is **open (not merged)** at the time of writing. It changes
`supabase/functions/_shared/lib/lib/quick-log/quickLogSensorSnapshotAcquisitionRules.ts`.
The check only means something after #1857 is merged **and** the `ai-coach` function is
redeployed with it. Until then: **NOT_APPLICABLE**.

What to check (manual, owner or the fixture account in the browser, production only):

1. In the fixture grow, find a Quick Log whose latest entry carries a legacy nested
   `source: "live"` sensor snapshot **with no provenance rows**. Use an existing record.
   Don't seed one into production. If none exists, the check is **BLOCKED** (record it).
2. Run AI Coach on that grow (one fixture run; it uses the fixture's own credits, with no
   entitlement or credit grant).
3. **PASS** if the Coach response labels that sensor data `invalid` (unknown provenance).
   That proves the label reached the model. Plain absence of the sensor tokens does **not**
   pass, because it's indistinguishable from token stripping. **FAIL** if the response
   treats the reading as live or trustworthy.

### Step 6: enable or keep the daily save-timing smoke (#1861)

The schedule (`17 9 * * *`, 09:17 UTC, which is 4:17 AM CDT) runs on its own from the
deploy branch with `E2E_UNATTENDED_RUN=true`. After steps 1–4 pass, let the next scheduled
run land and record its receipt.
**Stop condition:** two consecutive red scheduled runs mean the run is left unattended
with a report to the owner, not re-triggered.

## Receipt for each step

UTC time, repository head, independently read `/version.json` identity for each hostname,
account classification (no credentials), fixture scope, smoke tag, save/readback result,
exact counts, and run/artifact links. Use PASS / FAIL / BLOCKED / NOT_MEASURED /
NOT_APPLICABLE for each axis.

## Rollback

Docs only; revert this file. A failed production step is reported, not rolled back by an
agent. Frontend rollback and server changes are Matthew's lanes
(`docs/agents/RUNBOOK_VERCEL_PROMOTE.md` "Rollback — Matthew only").

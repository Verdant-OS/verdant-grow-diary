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
| #1849 | existing Quick Log save + readback with timings         | `e2e/quicklog-smoke.spec.ts`                                                                                  | `.github/workflows/quicklog-smoke.yml` (`run_mode=quicklog_smoke`) | **yes**, two tagged fixture records per run                                              |
| #1859 | settings / account / browser-consent proof              | `e2e/settings-account-consent-proof.spec.ts` (+ `e2e/lib/settingsAccountProofRules.ts`)                       | `.github/workflows/settings-account-consent-proof.yml`             | no server write; preference saves stay in the disposable browser context's local storage |
| #1860 | Actions readback and refresh, approval-required framing | `e2e/actions-readonly-proof.spec.ts` (+ `e2e/lib/actionsReadonlyProofRules.ts`)                               | `.github/workflows/actions-readonly-proof.yml`                     | no; no transitions                                                                       |
| #1861 | daily Quick Log save-timing smoke                       | `e2e/quicklog-smoke.spec.ts` (+ `e2e/lib/unattendedRunRules.ts`)                                              | `quicklog-smoke.yml` `schedule: "17 9 * * *"` (09:17 UTC daily)    | **yes**, two tagged fixture records per run; **already on**                              |

Every production job is gated in the workflow itself: it runs only on
`Verdant-OS/verdant-grow-diary` at `refs/heads/verdant-grow-diary`, on attempt 1, with
actor and triggering actor `cheekhimself` (schedule runs are trusted from the deploy
ref). It also refuses unless `E2E_BASE_URL` is `https://verdantgrowdiary.com` and the
fixture email matches. Each pins `E2E_EXPECTED_SHA` to the checked-out commit and runs
`node scripts/wait-for-deployed-sha.mjs` (reads public `/version.json` only), so it
measures nothing until production serves that SHA.

The `cheekhimself` actor gate is a workflow rule, not a technical block on agents:
`cheekhimself` is also the `gh` identity agents use on the shared box. "Owner action" in this
doc is policy. Agents don't dispatch these workflows unless Matthew asks for that specific run.

Freeze the deploy branch for the whole sequence. Any merge to `verdant-grow-diary` after the
promotion moves the tip, and every dispatched run then pins a SHA production doesn't serve.
`wait-for-deployed-sha` waits its full 20 minutes and the run goes red without measuring
anything.

## Run sequence

### Step 0: preconditions (stop if any fails)

0. **Owner choice: the daily smoke schedule is already on.** `quicklog-smoke.yml` has
   `schedule: "17 9 * * *"` active, and `schedule` runs skip the actor gate. Once production
   serves the tip SHA, the next 09:17 UTC run makes two tagged fixture writes on its own,
   possibly before steps 1–3 or the step 2 server publish. Pick one before promoting:
   - **(a) Disable it until steps 1–3 pass.** This is owner-only, e.g.
     `gh workflow disable quicklog-smoke.yml -R Verdant-OS/verdant-grow-diary`. The owner
     re-enables it **right before step 4**, after steps 1–3 pass, with
     `gh workflow enable quicklog-smoke.yml -R Verdant-OS/verdant-grow-diary`. It can't wait
     until later: GitHub rejects `workflow_dispatch` on a disabled workflow (HTTP 422), so
     step 4's `gh workflow run` would fail. Once it's re-enabled, a 09:17 UTC scheduled run
     can fall in the step 4 window. The `quicklog-production-fixture` concurrency group
     (`quicklog-smoke.yml:489-491`) serializes the runs, so they never overlap. If the
     sequence stops during steps 1–3, the workflow stays disabled, so the daily schedule and
     its receipt stop too. Whether and when to re-enable it after a stop is **Matthew's call**,
     and goes in the receipt.
   - **(b) Accept that a scheduled run may be the first write.** Record that choice in the
     receipt; step 4 is then not necessarily "the first write".

   While the fixture is archived (step 0.3), every scheduled run goes red at
   `verify-fixture`. Two such runs trip step 6's "two consecutive red" stop condition. That
   red means BLOCKED (archived fixture), not a product regression.

1. **Fence first, then restore, then promote** (D-RT-15 in
   `docs/specs/release-topology-specification.md`). Restoring the account can let the
   platform build and promote the current tip on its own, so the order is fixed:
   - **(a)** The owner picks the build that first serves and records its SHA in the receipt.
     For this sequence it must be the frozen tip of `verdant-grow-diary`. Every later
     workflow here is dispatched at `--ref verdant-grow-diary` and pins `E2E_EXPECTED_SHA`
     to that tip, so with an older build `wait-for-deployed-sha` times out without
     measuring anything. **Stop** if the owner picks a different SHA: this checklist
     doesn't apply as written.
   - **(b)** **Before the account is restored**, the owner sets a no-auto-promotion fence
     (automatic production promotion and automatic rollout turned off for the Vercel
     project), or arranges a restoration pinned to that SHA, and reads the setting back. The
     read-back goes in the receipt. **Stop** if it can't be read back: a recorded choice
     without a fence is not a control.
   - **(c)** Only then the owner restores the account (the 402 clears).
   - **(d)** M4 confirms a READY production build of the chosen SHA exists. M4 answers what
     was built, not what is served, so it can't show that nothing was promoted since.
   - **(e)** Immediately before promoting, the owner re-reads the serving state: the
     production-host inventory and each hostname's current serving deployment, as the
     runbook's "Manual promotion — Matthew only" pre-promotion reads require (M10's
     hostname reads). **Stop** if any of it differs from the runbook's owner promotion
     packet: an intervening promote, rollback or alias move would otherwise be overwritten
     unseen.
   - **(f)** The owner publishes (promotes) that build. See
     `docs/agents/RUNBOOK_VERCEL_PROMOTE.md`. Promotion is Matthew only. When to lift the
     fence afterwards is Matthew's call, and goes in the receipt.
2. `https://verdantgrowdiary.com/version.json` reports the chosen SHA from 1(a) and
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

### Step 2: publish the merged server changes, in #1894's order

Follow `docs/release/merged-unshipped-server-changes-2026-10-03.md` (handoff item 3, merged
#1894 from head `25b55c71b9356e73539eb7cdf93936805c25076b`, queue merge `98477208`). That
doc is the source of truth for the order and caveats. Owner actions only (production
database lock knk, HOLD #1250).

**Check before starting step 2:** if none of `20260927094000`, `20260927160000`,
`20260928183000` or `20261001140000` is recorded in production migration history, a single
version-ordered apply runs `20260927012000` in place, with no skip. Otherwise use the order
below. Both paths are safe: `20260927160000`/`20260928183000` need only `20260927002000`,
and `20261001140000` accepts either predecessor.

Restated from #1894:

1. Migrations:
   - **Edge of window first.** #1703 `20260924120000_plants_health_unassessed_default.sql`
     sorts ahead of every migration below, so a version-ordered apply runs it first. Its applied
     state is NOT_MEASURED.
   - #1831 `20260927002000`, then `20260927160000` and `20260928183000` (each preflights on
     the first file's wrapper).
   - #1741 `20260927094000` (independent of the quicklog wrappers).
   - #1834 `20260927012000` (unless the pre-step-2 check above already applied it in
     version order): apply it **only if** the apply path accepts an out-of-order version.
     Otherwise skip it, because #1836 covers the function. **A skip must be recorded.** A
     skipped `20260927012000` stays pending in migration history, and a later `db push` either
     refuses it as out of order or, with `--include-all`, runs it after #1836. There its
     preflight fails and the push stops. The owner records the skip, e.g.
     `supabase migration repair --status applied 20260927012000`. Agents never run this.
   - #1836 `20261001140000` last (it accepts either predecessor).
2. Before any edge deploy that includes #1869: confirm `PAYMENTS_ENVIRONMENT=live` in the
   Supabase function secrets. If it's unset, checkout returns 503 by design.
3. Redeploy the edge functions listed there: `mcp` (#1651, #1655), `ai-doctor-review`
   (#1658), and all 12 consumers of `_shared/unionEntitlementLookup.ts` (#1869). These
   deploys are built from the tip, so the `ai-doctor-review` and `sensor-ingest-webhook`
   redeploys also ship #1683. #1683's `auth-email-hook` and `operator-ggs-real-payload-commit`
   changes ship whenever those functions are next deployed.

**Stop conditions:** any migration preflight raises (each file fails closed in its own
transaction); `PAYMENTS_ENVIRONMENT` isn't confirmed; any function deploy fails. Don't
continue to the write steps with a partially applied server.

### Step 3: re-run the read-only proofs

Repeat step 1 after step 2. This separates "server publish broke a read" from "new
frontend broke a read". The same stop conditions apply.

### Step 4: Quick Log save + readback (#1849), the first deliberate write

If step 0.0 chose (a), the owner re-enables `quicklog-smoke.yml` first (see step 0.0). A
dispatch on the disabled workflow fails with 422.

```bash
gh workflow run quicklog-smoke.yml -R Verdant-OS/verdant-grow-diary --ref verdant-grow-diary -f run_mode=quicklog_smoke
```

The job runs `bun run e2e:fixture-checklist`, `bun run e2e:bootstrap-fixture` (only if
`E2E_ALLOW_FIXTURE_BOOTSTRAP` allows it), `bun run e2e:verify-fixture`, then
`bun run e2e:quicklog-smoke` (`playwright test e2e/quicklog-smoke.spec.ts --project=chromium-authed`).
Each run saves **two** records, each tagged `[smoke <ISO timestamp>]`
(`e2e/lib/productionQuickLogFixtureRules.ts`), and reads both back.

**Stop conditions:** fixture verification fails (wrong account, grow, tent or plant, or an
archived target); a save succeeds but either tagged record doesn't read back in the fixture
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
   entitlement or credit grant). Record the credit spend in the receipt. The Coach output is
   not smoke-tagged, so the receipt is its only trace.
3. **PASS** if the Coach response labels that sensor data `invalid` (unknown provenance).
   That proves the label reached the model. Plain absence of the sensor tokens does **not**
   pass, because it's indistinguishable from token stripping. **FAIL** if the response
   treats the reading as live or trustworthy.

### Step 6: keep the daily save-timing smoke (#1861)

The schedule (`17 9 * * *`, 09:17 UTC, which is 4:17 AM CDT) is already on. It runs on its
own from the deploy branch with `E2E_UNATTENDED_RUN=true`. Under step 0.0 (a) it was already
re-enabled before step 4, so nothing changes here. After steps 1–4 pass, let the next
scheduled run land and record its receipt (two tagged saves).
**Stop condition:** two consecutive red scheduled runs mean the run is left unattended
with a report to the owner, not re-triggered. Red at `verify-fixture` while the fixture is
archived counts as BLOCKED, not a regression.

## Receipt for each step

UTC time, repository head, independently read `/version.json` identity for each hostname,
account classification (no credentials), fixture scope, smoke tag, save/readback result,
exact counts, and run/artifact links. Use PASS / FAIL / BLOCKED / NOT_MEASURED /
NOT_APPLICABLE for each axis.

## Rollback

Docs only; revert this file. A failed production step is reported, not rolled back by an
agent. Frontend rollback and server changes are Matthew's lanes
(`docs/agents/RUNBOOK_VERCEL_PROMOTE.md` "Rollback — Matthew only").

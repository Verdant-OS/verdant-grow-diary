# G0 + One-Tent Loop + G3 habit evidence run — 2026-08-13

**Verdict:** `PARTIAL` — production is identified but not clean; authenticated
loop and G3 habit read are `BLOCKED`. Do not set Day 0. Do not authorize
acquisition scale. Do not approve `/welcome` → `/` consolidation from this
packet.

**Timezone:** UTC
**Runner:** Grok (Cursor Cloud), fail-closed evidence run against live
production. No production app code, schema, RLS, or analytics events were
added. No login was fabricated. GA collect was not intercepted (the walk never
started).

**Audited deploy-branch checkout:** `e7690396e5b2ac7911b6edce6a7b52cd6f9d033f`
(`origin/verdant-grow-diary` at run start)

**Parent plan:** G0 + One-Tent Loop + G3 habit evidence run (Cheek-approved).
**Calendar contract:** [verdant-60-day-growth-execution-calendar.md](./verdant-60-day-growth-execution-calendar.md)
gates G0 / Day 2–3 / G3. **Loop contract:** [one-tent-loop-golden-path.md](../one-tent-loop-golden-path.md).
**Habit proxy:** [v0-loop-event-map.md](../v0-loop-event-map.md) client-observed
activation proxy (GA4, ≥3 `quick_log_saved` in a trailing 7-day window).

This packet does **not** start Day 0, does **not** start the four-week SEO
clock, and does **not** count QA traffic as growth.

---

## Gates

| Gate                              | Result                            | Evidence                                                                                              |
| --------------------------------- | --------------------------------- | ----------------------------------------------------------------------------------------------------- |
| G0 — production identified        | `PARTIAL` — identified, not clean | `version.json` HTTP 200; `dirty: true`; stamped SHA absent from this git history; treeHash `NO_MATCH` |
| Public `/` SSR landing            | `PASS`                            | HTTP 200, `<h1>` present, no loading skeleton, `rel=canonical` present                                |
| Marker-bearing production bundles | `PASS`                            | Served chunks contain `grow_created`, `tent_created`, `plant_created`, `quick_log_saved`              |
| Managed session materialize       | `BLOCKED`                         | `no_session_source` (exit 2). No `e2e/.auth` snapshot, no `E2E_TEST_*`                                |
| One-Tent preflight                | `BLOCKED`                         | `missing_session_json` (exit 2)                                                                       |
| Fixture teardown dry-run          | `BLOCKED`                         | `missing_session_json` (exit 2). No deletes                                                           |
| Golden-path seed                  | `BLOCKED`                         | `missing_session_json` (exit 2). No writes                                                            |
| Authenticated Playwright loop     | `BLOCKED`                         | `ONE_TENT_BROWSER_PROOF_JSON` status `blocked`; walk skipped; 1 receipt test passed, 1 walk skipped   |
| Two additional Quick Logs         | `BLOCKED`                         | Same session gate. No habit writes attempted                                                          |
| G3 setup event read               | `BLOCKED`                         | No GA4 Viewer / property reporting access in this environment                                         |
| G3 three-in-seven-day proxy       | `BLOCKED`                         | No Viewer access; no QA `quick_log_saved` events were sent this run                                   |
| Day 0                             | `UNSET`                           | G0 not clean; G1/G2/G3 not readable                                                                   |

Never invent zeros. Authenticated access unavailable is `BLOCKED`, not `0`.

---

## G0 — production identity

Fetched `https://verdantgrowdiary.com/version.json` at **2026-08-13T17:51:54Z**
(HTTP Date). HTTP 200, `content-type: application/json`.

| Field           | Served value                                                       |
| --------------- | ------------------------------------------------------------------ |
| `version`       | `0.0.0+20260813.04f30ed84805-dirty`                                |
| `commit`        | `04f30ed8480535cbaaf9afab333728c04b3be4e3`                         |
| `shortCommit`   | `04f30ed84805`                                                     |
| `commitSource`  | `git`                                                              |
| `dirty`         | `true`                                                             |
| `ref`           | `__orphan__`                                                       |
| `tag`           | `null`                                                             |
| `commitTime`    | `2026-08-13T13:14:58Z`                                             |
| `buildTime`     | `2026-08-13T13:16:18.924Z`                                         |
| `treeHash`      | `5bc3b078cfdb66ab6943b0eef7a608bc92240b783aa240e24d4df93b310c092d` |
| `treeHashShort` | `5bc3b078cfdb`                                                     |
| `ciRunId`       | `null`                                                             |

### Provenance resolution

Canary (pinned to the stamped commit, scan=1):

```text
node scripts/resolve-release-provenance.mjs \
  --hash=5bc3b078cfdb66ab6943b0eef7a608bc92240b783aa240e24d4df93b310c092d \
  --ref=04f30ed8480535cbaaf9afab333728c04b3be4e3 \
  --scan=1
```

Result: **`NO_MATCH`**. The stamped SHA is not a git object in this checkout
(`fatal: bad object`). It is not an ancestor of deploy-branch HEAD.

Unpinned scan against `origin/verdant-grow-diary` `--scan=30`: **`NO_MATCH`**.
No `v2026.08.13-*` tag annotation carries this treeHash. No tag names the
stamped SHA.

Interpretation (`established fact` + `inference`):

- `commitSource: "git"` plus a 40-character SHA means the publish sandbox had
  a git HEAD when it stamped. That SHA is **not** in the GitHub deploy-branch
  history visible here.
- `dirty: true` means G0 is **identified but not clean**. Usable as a point-in-time
  cohort boundary for this packet only. Not a perfect stamp. Not Day 0.
- `NO_MATCH` on the unpinned 30-commit scan cannot by itself prove the publish
  pipeline mutated hashed inputs, because the stamped commit is missing from
  the scan window. The canary against the stamped ref could not run.

Deploy-branch HEAD of this checkout (`e7690396e`) is **not** claimed as the
served production tree.

### Public `/` smoke (same run)

`https://verdantgrowdiary.com/` HTTP 200, 52 701 bytes.

| Check                                        | Result                                               |
| -------------------------------------------- | ---------------------------------------------------- |
| `<h1>`                                       | `PASS` — “See what changed. Decide what to do next.” |
| Loading skeleton (`role="status"` + Loading) | `PASS` — absent                                      |
| `rel=canonical`                              | `PASS` — present                                     |
| Start Free CTA                               | `PASS` — present                                     |

This supersedes `CURRENT_STATE.md` blocker 7’s empty-shell measurement from
2026-08-07. Repo slice 1 (`741f99e1b`, #949) matches the live SSR. Slice 2
(`/welcome` consolidation) remains unapproved and was not exercised.

### Marker-bearing served bundles

Lazy chunks from `/assets/index-DA7qJXfv.js` (HTTP 200):

| Chunk                           | Marker found                                                       |
| ------------------------------- | ------------------------------------------------------------------ |
| `funnelAnalytics-C0ZSB8Kc.js`   | `grow_created`, `tent_created`, `plant_created`, `quick_log_saved` |
| `grows-B592pBZ6.js`             | `grow_created`                                                     |
| `onboarding-Dgpd6EJ4.js`        | `grow_created`, `tent_created`, `plant_created`                    |
| `CreateTentDialog-CMFOLuV3.js`  | `tent_created`                                                     |
| `CreatePlantDialog-9icCs6C7.js` | `plant_created`                                                    |
| `useQuickLogV2Save-B7iSc6oA.js` | `quick_log_saved`                                                  |

Served `index-DA7qJXfv.js` also contains `G-MCXQ9GVS5H`, `googletagmanager`,
`send_page_view`, and `push(arguments)` (the Arguments-object gtag bootstrap).
That is **not** a collection-liveness proof and **not** a G1 singleton proof.
It only shows the dark-collection Array-push defect from
[lighting-day0-gate-run-2026-08-07.md](../seo/lighting-day0-gate-run-2026-08-07.md)
is not the current served form.

Repo wiring (deploy-branch checkout, not the missing production SHA):
`trackFunnelEvent` in [src/lib/funnelAnalytics.ts](../../src/lib/funnelAnalytics.ts)
and `quick_log_saved` in [src/lib/quickLogSuccessTelemetry.ts](../../src/lib/quickLogSuccessTelemetry.ts).

---

## Authenticated One-Tent Loop

**Host intended:** `https://verdantgrowdiary.com`
**Project intended:** production `knkwiiywfkbqznbxwqfh` (from committed `.env`
`VITE_SUPABASE_PROJECT_ID`; value not a secret).
**Account intended:** dedicated `[GOLDEN-PATH-FIXTURE]` user only.

### Session materialize

```text
node scripts/e2e/materialize-managed-session.mjs
```

```text
Managed session materialize: BLOCKED
Reason: no_session_source
No e2e/.auth/session-storage.json snapshot and no E2E_TEST_EMAIL / E2E_TEST_PASSWORD.
No login fabricated. No env written.
```

Exit code **2**. Env presence check (names only): all
`LOVABLE_BROWSER_*`, `LOVABLE_E2E_TARGET_PROJECT_REF`, `E2E_TEST_EMAIL`,
`E2E_TEST_PASSWORD`, and `E2E_BASE_URL` were `UNSET`. `e2e/.auth` did not exist.

### Preflight

```text
bun run e2e:one-tent:preflight
```

```text
ONE_TENT_PREFLIGHT_JSON={"schema_version":"1","proof":"one-tent-loop-authenticated-ui","status":"blocked","reason":"missing_session_json","restore_strategy":"none","capabilities":{"browser_restore":false,"authenticated_seed":false,"full_browser_proof":false},"managed_auth_status":"unknown","storage_key_present":false,"session_present":false,"cookies_present":false,"access_token_present":false,"user_id_present":false,"target_project_verified":false,"missing":["LOVABLE_BROWSER_SUPABASE_SESSION_JSON"]}
```

Exit code **2**. No seed writes. No paid AI call.

### Teardown dry-run

```text
bun run e2e:one-tent:teardown -- --dry-run
```

```text
ONE_TENT_TEARDOWN_JSON={"schema_version":"1","status":"blocked","reason":"missing_session_json","owner_verified":false,"target_project_verified":false,"counts":{"follow_ups_deleted":0,"action_queue_deleted":0,"alerts_deleted":0,"quick_logs_deleted":0,"sensor_rows_deleted":0,"grow_targets_deleted":0,"plants_deleted":0,"tents_deleted":0,"grows_deleted":0,"total_deleted":0}}
```

`--execute` was **not** used.

### Seed

```text
bun run e2e:one-tent:seed
```

```text
One-Tent Golden Path seed: BLOCKED
Reason: missing_session_json
No seed writes performed. No production code changed.
```

Exit code **2**.

### Playwright UI walk

```text
E2E_BASE_URL=https://verdantgrowdiary.com bun run e2e:one-tent:ui
```

`--project=chromium-mocked`. GA collect was not intercepted. The walk never
navigated.

```text
ONE_TENT_BROWSER_PROOF_JSON={"schema_version":"1","proof":"one-tent-loop-authenticated-ui","status":"blocked","blocker_reason":"missing_session_json","restore_strategy":"none","seed_status":"blocked","stages":{"auth_restored":"blocked","grow_resolved":"blocked","tent_resolved":"blocked","plant_resolved":"blocked","quick_log_persisted":"blocked","timeline_visible":"blocked","manual_provenance_visible":"blocked","ai_doctor_boundary_verified":"blocked","alert_verified":"blocked","action_queue_suggestion_verified":"blocked","grower_decision_verified":"blocked","follow_up_marker_verified":"blocked","auto_diary_follow_up":"not_run"},"duplicate_fences":{"quick_log_count":null,"alert_count":null,"action_queue_count":null,"follow_up_marker_count":null},"safety":{"fabricated_login_used":false,"paid_ai_request_observed":false,"device_control_request_observed":false,"service_role_in_browser_observed":false}}
```

Playwright: **1 passed** (blocked-receipt test), **1 skipped** (walk). Exit 0.
That exit code is the fail-closed receipt contract, **not** a loop completion.

Stages 1–12 are `blocked`. This is **not** an authenticated One-Tent Loop
completion.

---

## Habit writes (calendar Day 2–3)

**Status:** `BLOCKED`

The golden path emits at most one `quick_log_saved`. G3 still needs two more
confirmed writes on the same fixture account, production host, consent on,
without intercepting collect, tagged as founder/QA.

Those writes were not attempted: there was no managed session, so any UI or
API write would have required fabricating a login. Fail closed.

---

## G3 — read setup and the three-in-seven-day proxy

**Status:** `BLOCKED`

Intended source: existing GA4 property / stream measurement ID `G-MCXQ9GVS5H`.
Do not create a new property.

| Check                                                  | Result         | Notes                                         |
| ------------------------------------------------------ | -------------- | --------------------------------------------- |
| `grow_created` count                                   | `BLOCKED`      | No Viewer session; no QA events sent this run |
| `tent_created` count                                   | `BLOCKED`      | Same                                          |
| `plant_created` count                                  | `BLOCKED`      | Same                                          |
| Users with ≥3 `quick_log_saved` in trailing 7 days     | `BLOCKED`      | Same                                          |
| `quick_log_saved` params allowlist (`event_type` only) | `NOT_MEASURED` | No event payload observed                     |

This environment had no GA4/GSC MCP tools, no `GA4_*` / `GSC_*` / Google
credential env vars, and no owner export. That is `BLOCKED`, not `NO_DATA`.
`NO_DATA` would require authenticated reporting that returned an empty window.

Owner still owes: GA4 Viewer (or approved export) and disabling Enhanced
Measurement history-based page views
([analytics-owner-setup-checklist.md](../seo/analytics-owner-setup-checklist.md)).
The page-view singleton issue does not itself block a future G3 read unless
funnel events are missing or duplicated.

G3 is a **readiness** check. Even a future `PASS` with n=1 QA user would not
be a Day-60 habit target.

---

## What this run is not

- Not Day 0.
- Not a four-week measurement clock start.
- Not authorization to increase acquisition volume.
- Not approval of `/welcome` → `/` slice 2.
- Not production Convex.
- Not an Action Queue revoke migration.
- Not a claim that growers complete the One-Tent Loop in production.

---

## Owner unblock (smallest next)

1. Dedicated fixture account on production project `knkwiiywfkbqznbxwqfh`.
2. Materialize `e2e/.auth/managed-session.env` locally (gitignored). Never
   paste tokens into chat, issues, or this repo.
3. Re-run preflight → dry-run teardown → seed →
   `E2E_BASE_URL=https://verdantgrowdiary.com bun run e2e:one-tent:ui` with
   analytics consent granted and collect **not** intercepted.
4. Two more confirmed Quick Logs on that account (`water` then `observation`,
   no replay). Tag as QA.
5. GA4 Viewer read of setup events + users with ≥3 `quick_log_saved` in 7 days.
6. Append a new dated packet. Do not edit this file’s result table after the
   fact.

---

## Verdict

```text
PARTIAL — G0 IDENTIFIED_NOT_CLEAN; LOOP BLOCKED; G3 BLOCKED
```

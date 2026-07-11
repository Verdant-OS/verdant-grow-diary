# One-Tent Loop Golden Path — regression receipt

**Purpose.** Prove the entire Verdant operating loop —
Grow → Tent → Plant → Quick Log → Timeline → Sensor Snapshot → AI Doctor
→ Alert → Action Queue → Approval → Follow-up — walks cleanly against
one deterministic fixture, with every handoff explicitly asserted.

This document is the human-readable receipt for the automated regression
in:

- `src/test/fixtures/oneTentGoldenPathFixture.ts`
- `src/test/one-tent-loop-golden-path.test.ts`
- `src/test/one-tent-loop-safety-regression.test.ts`

## The loop

```text
Grow (One-Tent Golden Run)
 └── Tent (Flower Tent A)
      └── Plant (Golden Plant 1, stage=flower)
           ├── Quick Log (observation, deterministic note)
           │    └── Timeline event (visible once, plant-linked)
           ├── Sensor Snapshot (source=manual, 82°F / 48% RH / 1.65 kPa)
           │    └── AI Doctor context (plant + note + snapshot + targets)
           │         └── AI Doctor output (cautious, 12-field contract)
           │              └── Alert (VPD > target max)
           │                   └── Action Queue suggestion
           │                       └── Grower approval → completion
           │                            └── Follow-up marker linked
           │                                to originating action
```

## Fixture provenance

| Field                   | Value                                                  | Source label                         |
| ----------------------- | ------------------------------------------------------ | ------------------------------------ |
| `ONE_TENT_GOLDEN_NOW`   | `2026-07-11T14:00:00Z` (fixed)                         | test-owned                           |
| Grow / Tent / Plant IDs | `golden-*` prefixed literals                           | test-owned                           |
| Owner user id           | `ONE_TENT_GOLDEN_USER_ID` (fake)                       | test-owned                           |
| Quick Log note          | "Observed mild leaf-edge curl after a warm afternoon." | test-owned                           |
| Sensor snapshot         | 82°F / 48% RH / VPD 1.65 kPa                           | `source=manual`, `confidence=medium` |
| Alert-triggering target | `vpd_kpa_max=1.6`                                      | test-owned copy (see below)          |
| AI Doctor output        | Deterministic in-file stub                             | no external model                    |

**No real users, no service-role values, no signed URLs, no tokens.**

## Which stages are proven at which layer

| #   | Stage                           | Layer                  | Notes                                               |
| --- | ------------------------------- | ---------------------- | --------------------------------------------------- |
| 1   | Grow → Tent → Plant ownership   | pure filter helper     | cross-user snapshot dropped                         |
| 2   | Quick Log persist + idempotency | in-file store helper   | duplicate submit returns existing row               |
| 3   | Timeline dedupe + ordering      | in-file view-model     | doubled source list still yields one row            |
| 4   | Sensor snapshot provenance      | fixture + label helper | Manual never mapped to Live                         |
| 5   | AI Doctor context compilation   | pure helper            | includes note, snapshot, targets, source tags       |
| 6   | AI Doctor cautious output       | deterministic stub     | all 12 required fields, no aggressive prescriptions |
| 7   | Alert derivation                | pure rule              | fires only when a real threshold is breached        |
| 8   | Alert → AQ handoff              | pure rule              | user-initiated only, dedupe on double-click         |
| 9   | Approval transitions            | pure rule              | grower-only, cross-user attempt rejected            |
| 10  | Follow-up linkage               | pure rule              | idempotent marker; rejected items get none          |

The stitched integration lives entirely in pure helpers so it is
deterministic and cheap to run. Deeper per-stage coverage (React
Testing Library, Playwright, RLS harnesses) is already provided by the
existing test files inventoried in the plan (see `.lovable/plan.md`).

## Honestly unsupported handoffs

- **Auto-created diary event on action completion.** The current
  application contract does not automatically write a diary event when
  an Action Queue item transitions to `completed`. The golden path
  therefore asserts only that a **follow-up marker** links back to the
  originating action, and documents the absence of an auto-diary
  handoff here rather than fabricating one in the fixture. If a real
  auto-diary contract is added later, extend
  `linkFollowUp` in the stitched test to assert the diary row and
  update this section.
- **Live network AI call.** The regression never calls a paid model.
  A deterministic in-file stub matches the 12-field cautious contract.
  A future integration test may exercise a real edge function under a
  dedicated CI job — that is out of scope for this suite.

## Safety boundaries

Every safety rule from the task's regression list has an explicit
assertion in `one-tent-loop-safety-regression.test.ts`:

- Manual data never labeled as live.
- Demo, stale, and invalid sources retained (never healthy).
- AI Doctor cannot auto-approve an action (approval helper rejects
  non-grower actors, including cross-user growers).
- Alerts cannot auto-create AQ items (`auto_created_action_queue_item`
  contract).
- AQ item shape has no `device_command`, `execute_payload`,
  `run_command`, or `device_exec` field.
- Duplicate submissions produce one row (idempotency + AQ dedupe).
- Cross-user IDs distinct and detectably filterable.
- Loop test files import no service-role key, no OpenAI/Anthropic
  endpoint, no device-control module, no direct Supabase client.

## Validation commands

```bash
bunx vitest run \
  src/test/one-tent-loop-golden-path.test.ts \
  src/test/one-tent-loop-safety-regression.test.ts

bunx tsgo --noEmit
```

Adjacent suites (Quick Log, timeline, sensor snapshot, AI Doctor,
alerts, Action Queue, follow-up, one-tent-live-proof) continue to
guard each stage in depth. The golden-path suite adds a fast, always-on
check that the _seams_ between them remain consistent.

## Definition of green

The loop is green only when **all** of the following hold in one run:

- One grow, one tent, one plant resolved with strict ownership.
- One Quick Log persisted, one timeline event visible, no duplicates
  on remount or retry.
- One manual sensor snapshot with `source`, `captured_at`, `tent_id`,
  `plant_id`, `confidence`, and `raw_payload` preserved.
- One cautious AI Doctor result with all 12 required fields, evidence
  citing the actual snapshot, and no aggressive prescription.
- One alert derived from a real threshold breach.
- One grower-created suggested Action Queue item, approval-required,
  no executable payload.
- One explicit grower decision (approve → complete) with an owner-only
  transition helper.
- One traceable follow-up marker linked to the originating action.

No duplicate writes. No fake-live data. No blind automation. No
device control.

---

## Browser-proof status (authenticated UI walk)

- Contract suite: **PASS** (`src/test/one-tent-loop-golden-path.test.ts`, `src/test/one-tent-loop-safety-regression.test.ts`)
- Authenticated UI proof: **READY TO RUN when managed session is injected**, otherwise **BLOCKED_BY_MANAGED_SESSION_INJECTOR**

### Required injected environment variables

Variable names only — never document values.

- `LOVABLE_BROWSER_AUTH_STATUS` (must be `signed_in` or `injected`)
- `LOVABLE_BROWSER_SUPABASE_SESSION_JSON`
- `LOVABLE_BROWSER_SUPABASE_STORAGE_KEY`
- `LOVABLE_BROWSER_COOKIES_JSON` (optional, canonical)
- `LOVABLE_BROWSER_SUPABASE_COOKIES_JSON` (optional, legacy fallback)
- `LOVABLE_E2E_TARGET_PROJECT_REF` (required for teardown; optional
  belt-and-suspenders for seed/preflight)

### Machine-readable receipts

Every tool in this proof emits its human-readable lines first, then
exactly **one** compact JSON line with a stable prefix:

```text
ONE_TENT_PREFLIGHT_JSON={"schema_version":"1",...}
ONE_TENT_BROWSER_PROOF_JSON={"schema_version":"1",...}
ONE_TENT_TEARDOWN_JSON={"schema_version":"1",...}
```

Receipt rules (all three):

- One JSON object per line, `schema_version: "1"`.
- Deterministic: same inputs ⇒ byte-identical line. Stable key order,
  lexically sorted `missing[]`, no timestamps, no randomness, no
  worker IDs, no file paths, no stack traces.
- **Never** contains tokens, cookies, session JSON, emails, row IDs, or
  raw provider errors.
- Suitable for parsing in CI/operator scripts. The human-readable
  output remains authoritative for operators.

Contracts live in `e2e/helpers/lovableManagedSupabaseSession.ts`
(preflight), `e2e/helpers/oneTentBrowserProofReceipt.ts` (browser
proof), and `scripts/e2e/one-tent-golden-path-fixture-cleanup.mjs`
(teardown). The CLI mirror
`scripts/e2e/one-tent-preflight-core.mjs` is parity-locked byte-for-
byte by `src/test/one-tent-preflight-receipt.test.ts`.

### Cookie restoration

- Canonical variable: `LOVABLE_BROWSER_COOKIES_JSON`. Legacy
  `LOVABLE_BROWSER_SUPABASE_COOKIES_JSON` is accepted as a fallback.
- If both are present and differ (after trim), preflight fails closed
  with `conflicting_cookie_sources` — a conflicting payload is never
  silently chosen. Byte-identical duplicates are not a conflict.
- Accepted shapes: a JSON array of cookies, or the documented wrapper
  `{"cookies": [...]}`. Anything else fails closed.
- Each cookie needs `name`, `value` (string), and `domain` or `url`.
  `sameSite` normalizes case-insensitively to Strict/Lax/None; missing
  `path` becomes `/`; boolean/expiry fields must be well-typed.
- **All-or-nothing**: any malformed cookie blocks restoration of the
  whole set (`invalid_cookies_json`) — even when a complete valid
  storage session exists. This is the documented conservative rule:
  silently dropping a supplied payload would make the restored browser
  state differ from what the operator believes was restored.
- Restoration order: validated cookies are added to the browser
  context **before** the first navigation, then the Supabase
  local-storage session is written, then the app loads.
- Diagnostics print counts only — never cookie names, values, raw
  JSON, or storage state.

**Cookie-only limitation.** Cookie restoration may permit browser-shell
authentication (`restore_strategy: "cookies_only"`,
`capabilities.browser_restore: true`). Cookie-only mode does **not**
automatically provide the identity/token requirements needed for
seeding or authenticated row verification, so the full proof remains
**blocked** with `cookie_only_seed_unavailable`. Never claim the
One-Tent proof is READY from cookies alone.

### Run order

```bash
bun run e2e:one-tent:preflight   # exits 0 = ready, 2 = blocked, 1 = error
bun run e2e:one-tent:teardown -- --dry-run
bun run e2e:one-tent:teardown -- \
  --execute \
  --confirm-fixture-teardown
bun run e2e:one-tent:seed        # idempotent, reconciles golden fixture rows
bun run e2e:one-tent:ui          # authenticated Playwright walk
```

The preflight performs no Supabase call and never prints tokens,
cookies, session JSON, or authorization headers.

### Fixture teardown

`bun run e2e:one-tent:teardown` removes **only** managed-user
golden-path fixture rows, resolved by the authenticated user id + the
exact `[GOLDEN-PATH-FIXTURE]` fixture names + the exact fixture
relationships (grow → tent/plant → scoped children). It:

- **defaults to dry-run** — destructive mode requires BOTH
  `--execute` and `--confirm-fixture-teardown` (there is no `--force`);
- requires the full managed identity (session + access token + user
  id) AND a declared, matching `LOVABLE_E2E_TARGET_PROJECT_REF` —
  cookie-only capability is insufficient;
- uses the managed user's own authenticated client (anon key + Bearer
  token), never service_role, so RLS remains part of the safety
  boundary;
- deletes child-before-parent: follow-up markers (`diary_entries`
  rows with `details.event_type = "action_followup"`) → Action Queue →
  alerts → Quick Logs (`grow_events`) → sensor readings → grow targets
  → plant → tent → grow, stopping before parents if any stage fails;
- is idempotent: an already-clean environment reports
  `status: "completed"` with zero counts;
- never deletes unrelated data: no partial-name matching, every query
  is scoped by `user_id` plus fixture `grow_id`/`tent_id`.

**Known limit (honest):** `sensor_readings` currently has no
owner-scoped DELETE policy and no cascading FK, so an authenticated
teardown cannot remove the seeded manual snapshot. The run stops
before deleting parents and reports
`sensor_rows_delete_blocked_by_rls`. Fixing that requires a future
migration (out of scope for test tooling, which must not change RLS).

Preserve failed-run fixtures until debugging is complete — the
Playwright spec never auto-tears-down after a BLOCKED or FAILED proof.
Optional cleanup after a fully **passing** proof only:
`LOVABLE_E2E_TEARDOWN_AFTER_SUCCESS=true` (teardown output and receipt
are printed, and a teardown failure is never hidden).

### Evidence receipt (per-stage, filled by the browser walk)

| #   | Stage                                                                   | Outcome                                      |
| --- | ----------------------------------------------------------------------- | -------------------------------------------- |
| 1   | Auth restored                                                           | PASS / BLOCKED_BY_MANAGED_SESSION_INJECTOR   |
| 2   | Grow resolved                                                           | PASS                                         |
| 3   | Tent resolved                                                           | PASS                                         |
| 4   | Plant resolved                                                          | PASS                                         |
| 5   | Quick Log persisted                                                     | PASS                                         |
| 6   | Timeline row visible (single, refresh-stable)                           | PASS                                         |
| 7   | Manual sensor provenance visible (never Live)                           | PASS                                         |
| 8   | AI Doctor network boundary verified (Edge Function stub, no paid model) | PASS                                         |
| 9   | Alert verified (VPD > target, single)                                   | PASS                                         |
| 10  | Action Queue suggestion verified (approval-required, no device command) | PASS                                         |
| 11  | Grower decision verified (user-initiated approve/complete)              | PASS                                         |
| 12  | Follow-up marker verified (survives refresh, single)                    | PASS                                         |
| 13  | Auto-diary follow-up                                                    | **HONESTLY UNSUPPORTED** — marker-level only |

### Production-fix rule for this proof

If the scaffolding and pure preflight tests expose no application
defect: **zero production changes** are made in the same PR. When the
managed browser run later exposes a broken handoff, fix ONLY the first
broken UI/application seam and add a matching browser regression
assertion — do not broaden the PR into unrelated stages.

## Action Follow-Up Evidence V1 — Slice 3 status

Status matrix (browser-agnostic; verified via Vitest suites):

- Grower-entered follow-up rules: PASS (`action-follow-up-evidence-rules.test.ts`)
- Grower-entered follow-up persistence: PASS (`action-follow-up-evidence-service.test.ts`)
- Action Detail follow-up form: PASS (`action-follow-up-evidence-ui.test.tsx`)
- Action Detail follow-up card: PASS
- Timeline outcome rendering: PASS (`actionFollowupTimelineLabel`)
- Marker-level relationship: PASS (backward-compatible)
- Automatic diary follow-up: INTENTIONALLY UNSUPPORTED
- Optional photo attachment: DEFERRED (no safe existing selector)
- Optional sensor association: DEFERRED (no safe existing selector)
- Grower-entered follow-up: PASS
- Post-action deterministic analysis engine: PASS (`action-outcome-*` suites; see `docs/action-outcome-analysis-v1.md`)
- Grower/system outcome agreement: PASS (flagged, never adjudicated)
- Automatic action execution: INTENTIONALLY UNSUPPORTED
- Causal proof from one run: INTENTIONALLY NOT CLAIMED

Contract notes:

- Outcome is always selected by the grower — never inferred.
- Follow-up is never created automatically. The grower must submit.
- `diary_entries` remains the persistence model; no schema change.
- Existing marker-only rows continue to render as "Follow-up".
- Rows with `details.outcome` render as "Follow-up · <label>".
- No device execution is implied by any outcome.
- Plant improvement is never inferred; `improved` is a grower-selected label only.
- No signed / blob / data URLs are persisted through the UI flow.
- No service role, AI, or device-control imports in the follow-up UI.

## Action Follow-Up Evidence V1 — Slice 4a status

Slice 4a — Shared outcome-label helper + diary/timeline summary integration.

Status matrix (browser-agnostic; verified via Vitest suites):

- Shared outcome-label helper (`actionFollowUpOutcomeLabel`): PASS
- Shared title composer (`composeActionFollowUpTitle`): PASS
- Diary timeline summary renders `Follow-up · <Outcome>`: PASS
  (`growDiaryTimelineRules.toTimelineItem`)
- Diary action-label helper renders shared outcome label: PASS
  (`diaryTimelineActionLabel`)
- Legacy marker-only rows continue to render `Follow-up`: PASS
- Invalid/missing outcome falls back to legacy label: PASS
- Outcome never labeled as AI or device execution: PASS
- Diary/report summary status: PASS (report/PDF surface not
  currently branching on `action_followup` — no changes required)
- Optional Manual sensor association: DEFERRED (Slice 4b)
- Optional existing-photo evidence: DEFERRED (Slice 4c)
- Photo upload infrastructure: NOT ADDED
- Sensor creation infrastructure: NOT ADDED
- Automatic follow-up creation: INTENTIONALLY UNSUPPORTED
- Authenticated browser proof: **BLOCKED_BY_MANAGED_SESSION_INJECTOR**
  (`LOVABLE_BROWSER_AUTH_STATUS=signed_out`; preflight ran cleanly and
  reported the expected deterministic BLOCKED receipt — no login
  fabricated, no seed writes, no paid AI call)

Contract notes for Slice 4a:

- One shared helper (`composeActionFollowUpTitle`) is the single
  source of truth for diary, timeline, evidence card, and any future
  report/export outcome labels. No JSX-embedded lookup table.
- Backward-compatible: rows without `details.outcome` are unchanged.
- Pure, deterministic, null-safe. No schema, RLS, migration, or Edge
  Function changes. No AI, device, or Action Queue writes.

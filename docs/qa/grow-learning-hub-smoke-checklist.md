# Grow Learning Hub — Smoke Test Checklist

Short manual QA pass covering `/reports`, Dashboard outcome nudge,
ActionDetail outcome capture, and GrowDetail learning report together.

Read-only validation. Do not enable automation, device control, or
service_role tooling while running this checklist.

## Preconditions

- Logged in as a real test user (no impersonation, no service_role).
- At least one grow is selectable from the grow scope picker.
- Network panel open to confirm no unexpected writes (`POST`/`PATCH`/
  `DELETE` to `action_queue`, `alerts`, `sensor_readings`, etc.) occur
  from any read-only screen below.

---

## 1. New-user onboarding on `/reports`

Use a grow that has **no** diary entries, sensor readings, outcomes, or
open alerts.

- [ ] Visit `/reports`.
- [ ] "Start building your grow memory" section is visible.
- [ ] Three cards render, in this order:
  - "Add a plant" → links to `/plants?growId=…`
  - "Add a manual sensor snapshot" → links to `/sensors`
  - "Review an action outcome" → links to `/actions?growId=…`
- [ ] Copy is observational. None of the words *fixed*, *guaranteed*,
      *healthy*, *complete*, *caused*, *best*, *worst* appear.
- [ ] Generic "No reports yet" empty state is **not** shown while
      onboarding is visible.

## 2. Calm Review Queue empty state

Use a grow that has some learning data (≥1 outcome or diary entry) but
**no** pending outcome reviews, open alerts, stale sensors, or
low-sample patterns.

- [ ] `/reports` shows the "What to review next" section with a calm
      status message rather than priority cards.
- [ ] No card claims an issue is resolved or healthy.
- [ ] No raw user IDs, secrets, or alert payloads appear in the DOM.

## 3. Pending outcome surfaces on Dashboard + Reports

Setup: complete an action through the normal flow, then advance the
clock or use a record where `completed_at` is older than 24 hours and
no `action_outcome` diary entry exists for it.

- [ ] Dashboard pending-outcome nudge card appears with the action.
- [ ] `/reports` "What to review next" includes a "Record outcomes"
      card whose "Why this is here" line mentions the oldest pending
      age (e.g. "oldest completed 30h ago").
- [ ] CTA links to the matching ActionDetail page.

## 4. ActionDetail records outcome

- [ ] Open the pending action from either entry point.
- [ ] Capture an outcome through the existing outcome flow (no new
      write path is introduced by this checklist).
- [ ] Submission succeeds; no console errors.

## 5. Outcome clears from pending review

- [ ] Return to Dashboard — the nudge no longer lists that action.
- [ ] Return to `/reports` — the "Record outcomes" card either drops
      its count or disappears once no pending outcomes remain.
- [ ] No duplicate Action Queue items were created (check
      `/actions` list).

## 6. GrowDetail learning report updates

- [ ] Open the grow's GrowDetail page.
- [ ] The Action Outcome Learning report reflects the newly captured
      outcome (group totals or sample count change).
- [ ] Low-sample groups still display the "needs more data" caveat
      when `total < LEARNING_GROUP_SAMPLE_THRESHOLD`.

## 7. Reports Hub link routing

From `/reports`, click through each card and confirm the destination:

- [ ] "Open grow detail" → `/grows/:id`
- [ ] Action Outcome Learning card → GrowDetail learning section
- [ ] Recent Outcomes card → GrowDetail
- [ ] Environment Alerts card → `/alerts?growId=…`
- [ ] Sensor Context card → `/sensors` (or scoped sensor route)
- [ ] Timeline Activity card → grow diary view

## 8. Safety checks

- [ ] No demo/mock data is rendered as live (source labels visible
      where applicable).
- [ ] No automation, device control, or equipment commands are
      triggered.
- [ ] No `service_role` calls in the Network panel.
- [ ] No raw secrets, bridge tokens, or auth user IDs are exposed in
      the DOM or console.
- [ ] No `POST`/`PATCH`/`DELETE` requests originate from `/reports`,
      the Dashboard nudge card, or the GrowDetail learning report.

---

## Sign-off

- Tester:
- Date:
- Build/commit:
- Result: pass / fail (attach notes for any failed item)

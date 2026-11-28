# Signed-in walk: gap closure for #3021, #3099 and #3080

Status: DRAFT for Blue Dream's next signed-in run. Written 2026-11-28 by Claude (thread session) against deploy branch `verdant-grow-diary` at `e9522bfe8`. Production last read at `886c57d7` (Blue Dream walk, 3:41–3:49 AM CT).

This file is a plan. It writes nothing on its own. Every write below is made by the disposable run account, through the app's own screens, on https://verdantgrowdiary.com only.

## Why

Blue Dream's walk on 2026-11-28 left three checks NOT_MEASURED:

| PR | What was missing |
| --- | --- |
| #3021 | The stale-stage note needs an account with open alerts, including a Veg tent that holds a Flower plant (Reviewer C's repro). |
| #3099 | The Action Queue was empty, so Action Detail could not be opened. |
| #3080 | Tap targets were not measured at phone width. On desktop the sensor chips measured 23px and the filter pills 26px. |

## Approval and roles

| Step | Who | Approval needed first |
| --- | --- | --- |
| Create the disposable run account through public sign-up | Blue Dream | Matthew's yes for this run, naming this file. `docs/production-only-verification-runbook.md` says not to seed production users without it. |
| Seed the grow, tents, plants and readings through the app's screens, as the run account | Blue Dream | Covered by the same yes |
| Create one Action Queue item from an open alert (pending, never approved) | Blue Dream | Matthew's yes must name the Action Queue item. The runbook does not authorize any Action Queue operation by default. |
| Delete the run account in the app and confirm sign-in is refused | Blue Dream | Covered by the same yes |
| Route the run and keep the report | UK Cheese | none |

Never do these on this run:
- Use Matthew's accounts or the KEEP account.
- Use SQL, the service role, or a seeder script against production.
- Approve, complete, reject or cancel an Action Queue item.
- Connect a device or send a device command.

## Fixture to seed

Tag every name with `[smoke <UTC timestamp>]`. Grow, tent and plant names below are the suffix after that tag.

- Grow `G-STAGE`, stage **Veg**.
- Tent `T-MIXED`, stage **Veg** (Edit tent → Stage):
  - plant `P-FLOWER-IN-VEG`, stage **Flower**
  - plant `P-VEG`, stage **Veg**
- Tent `T-STALE`, stage **Seedling** at first:
  - plant `P-STALE`, stage **Seedling** at first
- Set every plant's type to **Photoperiod**. Autoflower and unknown types use lower VPD caps, and the readings below are chosen to work either way.

These are the same stages as the pure test `src/test/alert-tent-alert-stage-for-view.test.ts` and the mounted test `src/test/alert-stage-stale-note-mixed-tent.test.tsx`.

### Readings

Log tent-level manual readings with the manual sensor reading / Environment Check. Do not use the plant Quick Log: its manual snapshots never create alert rows (`snapshotPersistenceBlockReason` returns `provenance_ineligible`).

An alert row is created only while the reading is less than 15 minutes old (`SENSOR_SNAPSHOT_STALE_THRESHOLD_MS`). So open the **Alerts** page within 15 minutes of saving each reading.

| Tent | Target VPD | Example entry (check the VPD the app shows before saving, and adjust RH if it is off) | Why |
| --- | --- | --- | --- |
| `T-MIXED` | 1.35–1.50 kPa | 25 °C, 54% RH | Above Veg (0.8–1.2, capped at 1.1), so the alert is judged against Veg |
| `T-STALE` | 1.10–1.30 kPa | 25 °C, 62% RH | Above Seedling (0.4–0.8), inside Flower (1.0–1.5, capped at 1.35) |

Seeding is only done when the Alerts page lists one open **"VPD above stage range"** alert for each tent:
- `T-MIXED`: its reason says "above the veg target range".
- `T-STALE`: its reason says "above the seedling target range".

If either alert is missing 2 minutes after opening the Alerts page, stop. Record the fixture as **BLOCKED** (not FAIL), with a screenshot of the reading and the Alerts page.

### Moving `T-STALE` to Flower

At least 16 minutes after the `T-STALE` reading (so no fresh reading can refresh the alert), set tent `T-STALE` to **Flower** and plant `P-STALE` to **Flower**. Log no new reading for `T-STALE`.

## Walk script

Run at 375 × 812 unless a step names another width. Screenshot every step. Use the screenshot names in brackets.

### A. #3021 — stale-stage note

**A1. Mixed tent, no false note (Reviewer C's repro).** Right after the `T-MIXED` alert appears, open Plant Detail for `P-FLOWER-IN-VEG` and scroll to Tent Alerts.
- PASS: the alert row (`plant-assigned-tent-alert-row`) shows, and **no** stale note (`plant-assigned-tent-alert-stage-stale`) shows next to it.
- FAIL: a note saying "may no longer apply" shows.
- Record the reading's age shown on the page. [a1-mixed-flower-plant.png]

**A2. Same tent, Veg plant.** Open Plant Detail for `P-VEG`.
- PASS: no stale note. [a2-mixed-veg-plant.png]

**A3. Note shows when the tent moved on.** After the move to Flower, open Plant Detail for `P-STALE`.
- PASS: the note reads exactly "Checked against Seedling targets. This tent's alerts now use Flower targets, so this alert may no longer apply."
- FAIL: no note, or other text. [a3-stale-note.png]

**A4. The note only labels.** On the Alerts page, the `T-STALE` alert is still open.
- PASS: it was not resolved or dismissed on its own. [a4-alert-still-open.png]

**A5. Earlier #3021 checks on this fixture.** On the Grow page, the status is not "Good" while these alerts are open. On `/plants`, the summary count equals the number of plant cards (3).
- [a5-grow-status.png] [a5-plants-count.png]

### B. #3099 — Action Detail names

**B1.** On the Alerts page, press **Add to Action Queue** on the `T-MIXED` alert (`alert-row-add-to-action-queue`). This creates one pending item. Do not approve it.

**B2.** Open the item from `/actions`.
- PASS: the Tent field (`action-detail-tent-label`) reads `[smoke …] T-MIXED`, and no field shows a raw id (a 36-character id with dashes).
- FAIL: an id shows as text. [b2-action-detail.png]

**B3. Plant field.**
- If the item has a plant, PASS when `action-detail-plant-label` shows the plant's name.
- If it has no plant (alert-based items are usually tent-level), record **NOT_APPLICABLE** with the reason, rather than inventing a plant item.
- [b3-plant-field.png]

### C. #3080 — tap targets at 375 px

**C1.** Open `/timeline` at 375 × 812, with entries showing and the filters visible. In DevTools, run the snippet below and paste its JSON into the report.

```js
JSON.stringify([
  ...document.querySelectorAll('[data-testid^="timeline-sensor-source-toggle-"]'),
  ...document.querySelectorAll('.space-y-2.mb-4 button[aria-pressed]'),
  ...['timeline-clear-filters','timeline-next-missing-action','timeline-load-older','timeline-env-summary-shortcut']
    .map(id => document.querySelector(`[data-testid="${id}"]`)).filter(Boolean),
].map(el => ({ id: el.dataset.testid || el.textContent.trim().slice(0, 24), h: Math.round(el.getBoundingClientRect().height), w: Math.round(el.getBoundingClientRect().width) })))
```

Screenshot the filter row. [c1-timeline-375.png]

**C2. Rule.** At 375 px, every listed control should be at least 44 px tall.
- PASS: every control measures 44 px or more.
- FAIL: name each control under 44 px, with its measurement.
- If a control does not render for this account (for example, no sensor-source chips because there are no sensor rows), record it as **NOT_MEASURED**, not as a pass.

**C3. Desktop, for the record only.** Repeat the snippet at 1280 × 800. #3080 sets `sm:min-h-0` and `sm:min-h-9` on purpose, so desktop sizes don't change. The desktop numbers are informational, not PASS or FAIL for #3080. [c3-timeline-1280.png]

## Teardown

1. Leave the Action Queue item pending. It goes with the account.
2. Delete the run account in the app.
3. Try to sign in again. PASS when sign-in is refused. [z-teardown-refused.png]
4. Record the deletion time in UTC.

## Report shape

One row per axis:

| Axis | Result |
| --- | --- |
| A1–A5, B2, B3, C2 | PASS / FAIL / BLOCKED / NOT_MEASURED / NOT_APPLICABLE |

Also record:
- the UTC time, and the live `/version.json` commit
- the account type (disposable, no credentials in the report)
- the smoke tag
- the screenshot folder
- the teardown result

A check run on a build that is not the one under test is NOT_MEASURED.

## Desktop chip sizes: is it a bug?

On desktop, the sensor chips measured 23 px and the filter pills 26 px. This is **not a #3080 regression.**
- #3080's own description scopes the 44 px targets to widths below 640 px: "At 640px and wider, nothing changes."
- The code says the same: the sensor chips have `min-h-11 … sm:min-h-0`, and `FilterChip` has `min-h-11 … sm:min-h-0`.

Against WCAG 2.2:
- 44 px is the AAA target size (2.5.5).
- The AA minimum (2.5.8) is 24 × 24 px, with a spacing exception. The 23 px chips sit in rows with a 6 px gap (`gap-1.5`), so they probably pass AA through that exception. That is my reading of the code, not measured.

Draft issue, **not filed**. File it only if Matthew wants the same tap sizes on desktop.

> **Timeline filter chips: 44px targets on desktop too (P3, enhancement)**
>
> On desktop (≥640px), Timeline's sensor-source chips measure 23px tall and the stage/event filter pills 26px (Blue Dream walk, prod `886c57d7`, 2026-11-28). #3080 made them 44px below 640px only, on purpose. They likely meet WCAG 2.2 AA (2.5.8) through the spacing exception, but not the 44px AAA size (2.5.5) used elsewhere on mobile.
>
> Ask: decide whether desktop should match. If yes, drop `sm:min-h-0` on `timeline-sensor-source-toggle-*` and `FilterChip` in `src/pages/Timeline.tsx` (or use `sm:min-h-9`, matching the buttons), and update the pins in `src/test/timeline-page-read-state.test.tsx`.
>
> Out of scope: other pages.

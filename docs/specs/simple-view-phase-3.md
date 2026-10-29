# Simple View — Phase 3 (guidance card, "What next?", hint state)

**Status: IMPLEMENTED locally on top of PR #2615's head (Phases 1–2); ships as its own PR after #2615 merges. Awaits Matthew's Phase 3 review.**
**Owner:** Claude (assigned by Matthew, 2026-10-29; Phase 2 approved the same day). Matthew is the per-phase approver.
**Builds on:** `docs/specs/simple-view-phase-1.md`, `docs/specs/simple-view-phase-2.md`.

## 1. Goal

A grower on the Simple home sees at most one small, plain tip about using Verdant, can say "Not now" or "Remind me later", and is never nagged: a tip dismissed three times stops coming back. A **What next?** button lists every suggestion on demand, even with tips turned off. Tips are a separate account setting from the Simple/Advanced view, so a grower can keep Simple and turn tips off, or the reverse.

## 2. Collision audit

`established fact`, read 2026-10-29:

- Open PRs matching guidance / hint / snooze / onboarding / notification: #2025 (Alert Walk copy), #2291 / #2384 / #2591 (`/welcome` readiness), #2251 / #2366 / #2379 / #2286 (Daily Check), #2565 / #2582 (Start Your Room). None adds a home guidance card, a hint-state store, or a notification state model.
- Existing local-only dismiss stores (`localOnboardingPreferences.ts`, `dailyGrowCheckOnboardingDismissStore.ts`, `guidedActionChecklistDismissals.ts`) serve the Dashboard's checklists. They are device-local by design and are not changed; the Dashboard is not touched by this phase.

## 3. What Phase 3 adds

### 3.1 Shared notice state model — `src/lib/noticeStateRules.ts` (pure)

One state record per notice id, usable by tips now and by in-app notifications later:

| Field          | Meaning                           |
| -------------- | --------------------------------- |
| `dismissCount` | times the grower said "Not now"   |
| `dismissedAt`  | ISO time of the latest "Not now"  |
| `snoozedUntil` | ISO time a "Remind me later" ends |

Visibility at time `now`, first match wins: **retired** (`dismissCount ≥ 3`) → **snoozed** (`snoozedUntil > now`) → **dismissed** (latest "Not now" less than 24 hours ago) → **visible**.

Actions: `dismiss` (count + 1, stamps the time; the third retires it), `snooze` (hides for 3 days, does not count toward the limit), `restore` (clears the record). Malformed or unknown stored values read as "no record" (visible), never as a choice the grower did not make. Pure: the clock is injected.

### 3.2 Guidance rules — `src/lib/simpleHomeGuidanceRules.ts` (pure)

- **Tips preference:** `on` (default) or `off`. Separate key from the view preference; neither reads the other.
- **What next? steps**, computed only from data the Simple home already read. A read that is loading or failed contributes no step (we do not guess). In priority order:
  1. `plant-needs-grow` — a plant has no grow of its own, so Quick Log cannot file its notes → link to that plant.
  2. `first-observation` — the grow has no observations yet → open Quick Log.
  3. `observation-gap` — the newest observation is 3 or more days old → open Quick Log ("Your last observation was N days ago").
  4. `look-back` — observations exist → link to the Timeline.
  5. `advanced-tools` — sensors, alerts and AI Doctor live in Advanced view → link to `/dashboard` (no preference write).
- Every step is about using Verdant. None gives cultivation, feeding, watering or equipment advice.
- **Guidance card:** the first of steps 1–3 whose notice is visible, only when tips are on and the account read has settled. Steps 4–5 are discovery suggestions and appear under What next? only, so a grower who is up to date sees no card at all.

### 3.3 Account storage — `src/lib/guidancePreferenceService.ts` (I/O)

The signed-in user's own auth metadata, one namespaced key `verdant_guidance` = `{ v: 1, tips: "on" | "off", notices: { <id>: record } }`, written with `auth.updateUser({ data })` and confirmed by the server's read-back, read once per user with `auth.getUser()`. No table, column, RLS, migration or auth-configuration change. The value grants nothing.

- Only known notice ids are kept, so the object stays small (it travels in the session token).
- Writes are sequenced per user; only the latest settles. A failed write keeps the change for this session and says so ("Hidden for now. Couldn't save to your account.").
- Sign-out forgets the in-memory state so a re-sign-in reads again.
- Last write wins across devices; the whole `verdant_guidance` object is written each time.

### 3.4 Presenters

- `src/components/SimpleHomeGuidance.tsx`: the tip card (title, one sentence, one action, **Not now**, **Remind me in 3 days**) and the **What next?** button (`aria-expanded`, `aria-controls`), which shows every current step with its action whatever the tips setting or notice state. After the grower acts on the card it is replaced, for the rest of the visit, by a one-line status announced through a polite live region (no second tip pops up); the third "Not now" says "We won't show this tip again. It's still under What next?". Focus then moves to **What next?** so keyboard users are not dropped. Buttons are at least 44 px tall.
- `src/pages/AccountPreferences.tsx`: a **Tips** card next to Home view, with a **Show tips on Home** switch and **Bring back hidden tips** (restores every notice). Save status uses the same honest wording as Home view.

Wiring: `src/pages/SimpleHome.tsx` renders the What next? button and the guidance card in the `ready` state only. The setup card (Phase 2) remains the guidance for an incomplete room. Advanced view and the Dashboard are unchanged.

## 4. Decisions and assumptions (for Matthew's review)

- **"3-dismiss rule"** is read as: the third "Not now" on the same tip retires it until the grower brings tips back in Preferences. "Remind me in 3 days" does not count. `inference` from the brief; easy to change in one constant.
- **"Not now" hides a tip for 24 hours**, not just until reload, so it is not back on the next visit the same day.
- **Tips default on** for every grower, separate from the view default.
- **Hint state is account-backed, with no device cache.** If the account read fails, the card stays hidden (rather than resurfacing a tip the grower dismissed elsewhere); What next? still works.
- **No new notifications are built.** The state model is shaped so a later notification surface can use it; that surface needs its own approval.

## 5. Out of scope

Dashboard guidance and its existing checklists; any push, email or in-app notification delivery; cultivation advice; Paddle/billing, auth, consent/legal, sensors, production records; schema, RLS, migrations, Edge functions.

## 6. Acceptance checklist (for Matthew)

1. Fixture account with a grow, tent and plant but no observations, Simple view: one tip card says "Add your first observation", with **Not now** and **Remind me in 3 days**. **What next?** lists the same step plus the Timeline and Advanced suggestions that apply.
2. **Not now** hides the card; reload: still hidden. On a second device: also hidden.
3. Dismiss the same tip on three different days (or edit the clock in a test): after the third, the card says it won't come back, and it stays under What next?.
4. **Remind me in 3 days**: hidden now; does not count toward the three.
5. Preferences › Tips › **Show tips on Home** off: no card on Home; What next? still lists steps. Home view (Simple/Advanced) is unchanged by this switch, and the reverse.
6. **Bring back hidden tips** restores retired and snoozed tips.
7. Keyboard only: Tab reaches Not now, Remind me and What next?; after dismissing, focus lands on What next?; a screen reader hears the result.

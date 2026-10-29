# Simple View — Phase 2 (easy setup, pause and recovery)

**Status: IMPLEMENTED on branch `claude/verdant-simplification-ki5ccn` (PR #2615); awaiting Matthew's Phase 2 review.**
**Owner:** Claude (assigned by Matthew, 2026-10-29; Phase 1 approved the same day). Matthew is the per-phase approver.
**Builds on:** `docs/specs/simple-view-phase-1.md`.

## 1. Goal

A grower who stops part-way through setting up grow → tent → plant, or who signs up and walks away, comes back to a home screen that says exactly where they are and offers one clear way to continue. Nothing is created for them; every record is an explicit, informed submit. Unfinished input survives a failed save, retries never duplicate, and plan limits are explained accurately instead of silently consuming the Free grow.

## 2. Collision audit and what is reused (not rebuilt)

`established fact`, read from the open PRs on 2026-10-29:

| Concern from the brief                                   | Where it already lives                                                                                                                                                                                                                                                | Phase 2 action                                                         |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Short setup, grow → tent → plant, editable default names | `/start-room` (`src/pages/StartYourRoom.tsx`, `src/lib/startYourRoomRules.ts`). PR **#2582** (ready for review) collapses it to one submit with "My grow" / "Tent 1" defaults and partial resume.                                                                     | Reuse. Not edited here: #2582 and #2565 hold these files.              |
| Retain unfinished input, safe retry, no duplicates       | PR **#2565** (ready for review): drafts survive a failed save, the server's reason is shown, retry reuses the same preallocated row id, a committed-but-unknown grow is adopted. Base already pins "unknown outcome locks submit" and "double submit inserts once".   | Reuse. Verified green on this branch's base: see §6.                   |
| Plan limits block before any insert                      | `src/lib/entitlements/freeTierGates.ts` (`evaluateGrowCreationGate`, `evaluateTentCreationGate`), used by `/start-room` and the create dialogs; `start-your-room-entitlement-gate` pins fail-closed.                                                                  | Reuse. The home card only explains; the server and gates still decide. |
| Small clear starting choice after sign-in                | `/onboarding` (`src/pages/Onboarding.tsx`): "Start your room" hero for an empty account, the start-screen choice, "Skip for now" (navigation only, no write), and the explicit "Skip setup — try Quick Log on a sample plant" button whose copy says what it creates. | Unchanged. The starter button is an explicit, informed action.         |
| Returning users land on home, not in a wizard            | `routeForStartScreen("dashboard")` is `/`; `/onboarding` redirects any account with a grow to `/`, which Phase 1 made the chosen view (Simple by default).                                                                                                            | Phase 2 gives `/` the Continue-setup card described below.             |

Open PRs #2565 (`mergeable_state: dirty` against the deploy tip) and #2582 (stacked on #2565) are other sessions' branches. This phase does not touch their files, so there is no second implementation of the setup flow; the home card links into theirs.

## 3. What Phase 2 adds

### 3.1 Continue-setup card on the Simple home

`src/lib/simpleHomeSetupRules.ts` (pure), `src/components/SimpleHomeSetupCard.tsx` (presenter), wired in `src/pages/SimpleHome.tsx` for the `no-grow`, `no-tent` and `no-plant` states.

- **Checklist** Grow · Tent · Plant with done markers and the record's name (or what the step creates). Screen readers hear "done" / "not yet".
- **One primary action.**
  - No grow → **Start setup** → `/start-room`.
  - One grow, no tent, on a verified one-grow plan → **Continue setup** → `/start-room`, which resumes at the tent step.
  - One grow, one tent, no plant, on a verified one-grow plan → **Continue setup** → `/start-room`, which resumes at the plant step.
  - A plan that can still add a grow (paid, or plan not yet verified) → **Add a tent** / **Add a plant** on the scoped page, because `/start-room` deliberately opens at "create a grow" for those accounts.
  - Several grows, or several tents with no plant → **Add a tent** / **Add a plant** on the existing list page scoped to the grow, because the wizard's resume reader refuses an ambiguous room and would otherwise open at "create a grow".
- **Secondary route** to the plain Tents / Plants page whenever the primary resumes the wizard, so the wizard is never the only way (no wizard trap).
- **Allowance line**, from capabilities, never from a plan name (`maxActiveGrows`):
  - unknown or unlimited → no line (we do not guess);
  - limit 1, no grow → "Your plan includes 1 active grow. Nothing is used until you create it.";
  - limit 1, grow exists → "Your plan includes 1 active grow, and “<name>” is it. Finish setting it up here, or rename it.";
  - larger limits → "Your plan includes N active grows (M in use)."
- **Rename grow** (offered only when exactly one grow exists): inline form, text kept on failure, button disabled while saving, result confirmed by the server's read-back. Write path: `src/lib/growRenameService.ts` → existing `updateGrowRow` (RLS "Users update own grows"; no schema, policy or migration change). After a confirmed rename the grows store is refreshed.
- The no-grow card states that nothing is created by visiting the page.

### 3.2 Honesty rules carried over

Loading stays loading; a failed grows/tents/plants read is still an error with Try again, never a setup card. A grow with active plants but no tent is a supported state and renders the ready home (Phase 1 fix 86bc776a).

## 4. Decisions

- **Reuse, do not rewrite, the setup flow.** The brief says "reuse/extend approved phase-one foundations, do not rewrite the logging flow" and AGENTS.md §9 says one implementation per feature. #2565/#2582 already carry pause/recovery for `/start-room`; duplicating them on this branch would be a competing implementation.
- **Resume preconditions are mirrored, not imported.** `canResumeSetupWizard` restates the one-grow / matching-active-grow / tent-count rule the wizard's own reader applies, plus its rule that a partial resume applies only when a verified plan limit blocks another grow (Codex P2 on 43b7fd1b), so this card does not import from a file two open PRs are rewriting. If #2582 changes the rule, this file is the one place to follow it.
- **Allowance from capabilities only.** No plan name appears in JSX; copy is pinned in the rules file.
- **Rename lives on the home card, not a new grow-settings surface.** It is the smallest answer to "offer rename where applicable"; GrowDetail has no rename today and gaining one is a later, separate change.
- **`/onboarding` and `Auth.tsx` are unchanged.** The post-sign-in choice already exists and already lands returning growers on `/`.

## 5. Out of scope

Editing `StartYourRoom.tsx`, `startYourRoomRules.ts`, `Onboarding.tsx`, `Auth.tsx`; the guidance card and hint state (Phase 3); journey polish and effort measurement (Phase 4); Paddle/billing, auth, consent/legal, sensors, production records.

## 6. Verification

Run on this branch at the Phase 2 head (counts are exact test totals from `bunx vitest run`):

| Check                                                                                                      | Files                                                                                                                                                                                                                                                                                                                                                                               | Result                                    |
| ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| Setup card rules, rename service, card presenter, home render                                              | `simple-home-setup-rules`, `grow-rename-service`, `simple-home-setup-card`, `simple-home-render`, `simple-home-view-model`                                                                                                                                                                                                                                                          | see PR body                               |
| Interruption / resume, failed save, duplicate protection, plan gates (existing flow on this branch's base) | `start-your-room-resume`, `start-your-room-resume-case-variant`, `start-your-room-entitlement-gate`, `start-your-room-enter-submits`, `start-your-room-quick-log-handoff`, `start-your-room-review-regressions`, `start-your-room-rules`, `hierarchy-create-response-loss`, `start-room-deploy-wiring`, `onboarding-*`, `start-screen-preferences`, `auth-quick-log-start-redirect` | see PR body                               |
| Phone and desktop first-observation journey on the live host                                               | Playwright / manual on `verdantgrowdiary.com` with the fixture account                                                                                                                                                                                                                                                                                                              | NOT_MEASURED until the merged SHA is live |

The #2565/#2582 behaviours (draft retention on failed save, one-submit creation, default names) are **not** on this branch; they are verified in their own PRs and will reach `/start-room` when those merge. This card's links are the same either way.

## 7. Acceptance checklist (for Matthew)

1. Fixture account with no grow, Simple view: Home shows **Set up your grow** with three open steps, "Nothing is created by visiting this page", the Free allowance line, and **Start setup**. Reloading creates nothing.
2. Create only a grow on `/start-room`, then leave. Home shows **Continue setup** with Grow done, the grow's name, "“<name>” is it", **Continue setup** → `/start-room` opening at the tent step, and "Or add a tent on the Tents page".
3. **Rename grow** on that card: change the name, save; the checklist and allowance line show the new name. Switch off Wi-Fi and save again: the text stays, the error says it was not saved.
4. Add the tent, leave; Home shows Grow and Tent done, **Continue setup** opens at the plant step. Add the plant: Home becomes the ready Simple home with the plant row and the big Add an observation button.
5. Account with two grows and an empty active grow: the card's primary is **Add a tent** on the scoped Tents page; no rename offer.
6. Advanced view is unaffected (Dashboard unchanged); both views still show the same records.

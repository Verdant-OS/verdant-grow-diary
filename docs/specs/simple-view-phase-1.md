# Simple View — Phase 1 (foundation + view switch)

**Status: IMPLEMENTED on branch `claude/verdant-simplification-ki5ccn`; awaiting Matthew's Phase 1 review.**
**Owner:** Claude (assigned by Matthew, 2026-10-29). Matthew is the per-phase approver.
**Program:** four phases (Simple View foundation → easy setup/pause/recovery → persistent guidance → full-journey polish). Only Phase 1 is built; Phases 2–4 are not started.

## 1. Goal

A tired grower opens Verdant, understands the screen, saves a useful observation, and finds it again without a tutorial. Phase 1 ships the home surface that makes that possible and the switch that keeps the full interface one tap away.

## 2. Decisions carried from the brief (not re-litigated)

- Simple View is the initial default for new and existing growers with no explicit choice.
- An explicit Simple/Advanced choice is remembered on the account, so phone and desktop agree.
- Both views use the same records and the same entitlements. Simplicity is never a paid feature.
- The view preference is separate from the (future) guidance preference.
- No 3D tent.

## 3. What Phase 1 adds

| Surface                                  | Behaviour                                                                                                                                                                                                                                                                |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/`                                      | Renders `src/pages/Home.tsx`, which mounts `SimpleHome` or the existing `Dashboard` from the account-backed preference. `?growId=` scope is honoured by both.                                                                                                            |
| `/dashboard`                             | A direct link to the Dashboard is an explicit destination: always the Advanced view, with the Simple/Advanced bar above it. Choosing Simple there saves the choice and goes to `/`. Existing `dashboardPath()` links and the browser-census e2e spec keep their meaning. |
| Simple home (`src/pages/SimpleHome.tsx`) | My plants (name, strain, stage, tent link), one prominent **Add an observation**, recent entries that reopen the saved entry on its Timeline anchor, and **Switch to Advanced view**.                                                                                    |
| Advanced (Dashboard)                     | Unchanged page. A one-line bar above it names the view and offers **Switch to Simple view**.                                                                                                                                                                             |
| Account › Preferences                    | A "Home view" card with both choices and the real save outcome.                                                                                                                                                                                                          |

### Quick Log targets

The big button opens Quick Log V2 with **no preselected target**; the sheet asks. Each plant row has its own **Add an observation** button that opens the sheet on that plant. This is an explicit grower choice. Remembered-target and only-plant auto-selection stay banned (CLAUDE.md lock), and nothing here changes the single `quicklog_save_manual` write path, idempotency, receipts or post-save refresh.

### Honest states

Loading stays loading. A failed grows/tents/plants read is an error with **Try again** (grows store refresh, React Query refetch). A setup gap leads into the existing flow: no grow → `/start-room`, no tent → `/tents?growId=`, no plant → `/plants?growId=`. Several grows with no active or URL scope asks the grower which grow; nothing is picked for them. "No entries yet" appears only after a successful empty read.

## 4. Account-backed preference — smallest extension found

`src/lib/uiViewPreferenceRules.ts` (pure), `src/lib/uiViewPreferenceService.ts` (I/O), `src/hooks/useUiViewPreference.ts`.

- **Storage:** the signed-in user's own auth metadata, key `verdant_ui_view` (plus `verdant_ui_view_set_at`), written with the public client's `auth.updateUser({ data })` and read with `auth.getUser()`. No table, column, RLS policy, migration or auth-configuration change. The repository already reads auth metadata (`email_verified`, `verdant_ref_code`); this is the first client write of a namespaced key.
- **Why not `profiles`:** it has no preference column; adding one is a migration, which agents may not ship without Matthew naming it. A later migration to a `user_ui_preferences` row is a clean follow-up if the guidance state in Phase 3 needs server-side structure.
- **Precedence:** a settled account read wins; otherwise the session user's own metadata copy, then a per-user device cache (`verdant:uiView:<userId>`), then the default. The default is never reported as explicit.
- **Loading:** when nothing explicit is known on this device, Home shows a short loading state (bounded at 4 s) instead of flashing Simple at a grower who chose Advanced elsewhere.
- **Failure:** a failed read keeps the device's last confirmed value and labels it "couldn't check your account". A failed write keeps the chosen view for this session, reports "couldn't save", and leaves the cache untouched. Nothing ever resets an explicit choice silently.
- **Cross-device:** the account read happens once per sign-in per device (first Home mount). Device B sees a change made on device A on its next load or sign-in, not live. Documented as a Phase 1 limitation.

## 5. Out of scope here

Setup redesign (Phase 2), guidance card and hint state (Phase 3), journey polish and effort measurement (Phase 4), Paddle/billing, auth, consent/legal, sensors, production records, Settings.tsx (two open consolidation PRs touch it), Onboarding.tsx and StartYourRoom.tsx (open PRs #2582, #2565).

## 6. Known limitations

- The second `getUser()` round-trip on first Home mount duplicates AppShell's revalidation call; piggybacking is a later optimisation.
- Playwright post-deploy specs look for `data-testid="dashboard-ready"`; the Simple home exposes the same marker when loaded, but link and form census specs assume the Advanced layout and will count differently after deploy. Phase 4 revisits them.
- The sidebar's Dashboard entry still says "Dashboard" and points at `/`, which now opens the grower's chosen view; renaming is a Phase 4 copy decision.
- Collision: open PR #2558 edits `RootEntry.tsx`'s loader and `AppShell.tsx`'s loading state. This change edits `RootEntry.tsx`'s lazy import two lines above. Expect a trivial forward-merge if #2558 lands first.

## 7. Acceptance checklist (for Matthew)

1. Sign in with the fixture account that has no saved view: `/` shows Simple home (plants, one big button, recent entries).
2. Tap a plant's **Add an observation**, save a note: the sheet confirms the save and **View diary** opens that entry on the Timeline; back on Home, the entry is listed with **Open this entry** → same anchor.
3. **Switch to Advanced view**: Dashboard renders with the bar; reload keeps Advanced; sign in on a second device: Advanced.
4. **Switch to Simple view** from the bar or from Account › Preferences: Simple returns everywhere on next load.
5. Account with no grow: Simple shows **Start setup** → `/start-room`. No record is created by visiting.
6. Entitlements and records are identical in both views (same plan badge, same plants, same timeline).

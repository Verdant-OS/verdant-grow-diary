# Grow Circle: community build spec

> **Filing note (2026-11-17).** Filed as written on 2026-11-12. The four mockup images named in the Mockups section are not in this repo. The repo claims were checked at `c03ea6fd`, not at the current deploy tip. Filing this spec does not lift the hold: no slice starts without the founder's recorded yes (AGENTS.md §3).

Nov 12, 2026 · @Matthew Cheek · Spec only. No code, schema or design-doc changes were made.

## For the reviewer

This is a spec for review, not a build. Nothing in the repo was changed, and building any slice is on HOLD until Cheek says yes (AGENTS.md §3). Please review it for gaps, risks, wrong assumptions, and anything that conflicts with the code on the deploy branch (`verdant-grow-diary`, checked at `c03ea6fd`). Claims marked as established fact were checked in that tree; please re-check any you rely on.

The four images in the Mockups section are drawings for discussion. Every one is labelled as a mockup, every username is made up, and every reading is sample data, not a live reading.

## Summary

Grow Circle is a signed-in-only community area that sits beside Labs. Growers pick diary entries to share, other members read them and react, and nothing leaves a grower's diary unless they put it there on purpose.

Think of it like a restaurant kitchen. The diary is the kitchen and stays private. The share preview is the pass window: you plate exactly what goes out, look at it, and only then does it leave. A customer never walks into the kitchen.

The good news: most of the hard rules already exist in the repo as tested code (the "Community V1 foundation"). What's missing is the database, the server calls and the screens. This spec builds on that foundation instead of starting over, in seven slices.

**One gate first.** The constitution (AGENTS.md §3) blocks community features until the One-Tent Loop is ready, apart from a narrow badge exception. So building any slice needs your explicit yes, recorded in CURRENT\_STATE. Your own order also puts this after the notebook UI, sensor trust and usernames.

## What exists today

Checked on the deploy branch at `c03ea6fd` (established fact unless marked).

**Already built and tested (pure logic, no database):**

- `src/lib/communityTypes.ts`: the shapes for profiles, publications, previews, access states and digest items. Shared items carry opaque handles, never user IDs or storage paths.
- `src/lib/communityProfileRules.ts`: usernames are 3 to 30 letters, numbers or underscores, stored lowercase. Reserved: admin, moderator, support, verdant, system, deleted. Nothing is filled in from email or sign-in providers.
- `src/lib/communityPublicationRules.ts`: at most 100 entries per share, a 15-minute preview window, shared dates are day only (no clock time), every measurement keeps its source label.
- `src/lib/communityAccessRules.ts`: a reader sees a share only if they are the owner or an approved reader and nobody has blocked anybody. Following never grants access.
- `src/lib/communityDigestRules.ts`: newest-first ordering with a stable tie-break and a read cursor.
- Tests for all of the above in `src/test/community-*-rules.test.ts`, plus a 2,168-line runtime authority test.

**Already built (database proof, waiting for tables):**

- `supabase/tests/community_v1_permissions.sql` expects 13 tables with row-level security turned on and forced: profiles, follows, collections, collection access, collection items, media derivatives, blocks, reports, digest seen, moderators, preview tokens, command receipts, feature state.
- `.github/workflows/community-v1-db-proof.yml` runs that proof on a throwaway local database, manual dispatch only. Today it is expected RED because no migration exists.

**Not there yet:**

- No community migration, table, server call, route, page or component.
- No username column anywhere in the schema.
- No code that strips photo location or EXIF data.
- The design doc the types file cites, `community-v1-design.md`, is not in the repo. That's a gap.
- No open pull request or handoff claim on community work. The last consolidation PR (#2576) closed.

**Breeding:** you said it's already Pro, and this spec treats it that way and changes nothing. One honest note: in `src/lib/appRouteManifest.ts` the Breeding routes are plain sign-in routes with no Pro feature on them, and I didn't find a Pro check in the pages I read. The gate may live somewhere I didn't look (uncertainty). Worth a quick check by whoever owns entitlements.

## Requirements and assumptions

**Your decisions (from your messages):**

- Name: Grow Circle.
- Entry sits beside Labs (Breeding Programs and Pheno Hunt), under More. The app's bottom bar stays as it is.
- Inside Grow Circle, the tab order is reversed from the inspiration, with Profile at the far left, as set out in the design proposal doc.
- Free accounts get full community access.
- Reaction counts are shown.
- Public and private stay strictly separate. Everything is private by default and the grower picks what to share.
- Locked Pro tabs stay visible with a lock, so community members see what Pro offers.
- You moderate at first.

**My assumptions (inferred, please check):**

- A1. Settled by your Nov 12 pick: "public" means all signed-in Grow Circle members, never the open web, and never indexed by search engines. This matches the constitution's badge rule.
- A2. Free full access means free accounts can browse, share and react. Community uses no AI credits.
- A3. Usernames ship first, as their own slice, since that's next on your list anyway.
- A4. Web app only.

## Who can see a share (decided Nov 12)

The existing foundation is built like a guest list. A grower shares a collection, people ask to read it, and the grower approves each one. Following someone gets you nothing. That is very safe, but it isn't a browsable community feed.

Your direction is "growers choose what's public." Two ways to get there:

1. **Guest list only.** Keep the model as built. Every share goes to approved readers. Safest and already proven, but there's no open feed to scroll.
2. **Guest list or whole room.** Each collection picks one audience: approved readers, or all signed-in members. It's still opt-in per collection and still never the open web.

**Decided: option 2.** On Nov 12 you picked "All signed-in members." Each collection's audience is either its approved readers or all signed-in members. Sharing stays opt-in per collection and never reaches the open web or search engines. This changes an already-reviewed rule (`communityAccessRules.ts` and the preview's audience field, which today is a list of named readers), so it still gets its own small slice and its own review. Building any slice still waits on your yes under AGENTS §3.

## Privacy rules

- **Private by default.** Nothing in the diary is visible to anyone until the grower adds it to a shared collection and confirms the preview.
- **Shares are copies, not windows.** A share is a snapshot of the entry at that moment. Editing the diary later doesn't silently change what others see.
- **Day, not time.** Shared entries show the date only.
- **Labels travel.** Every shared reading keeps its source: live, manual, CSV, demo, stale or invalid. A stale reading never looks healthy.
- **Photos are scrubbed on the server.** The shared copy of a photo is a new file with location and EXIF removed before any other member can load it. Until that code exists and is tested, sharing is text only.
- **No hidden identifiers.** Shared data never carries user IDs, emails or storage paths.
- **Blocks cut both ways.** If either person blocks the other, neither sees the other's shares.
- **Taking it back works.** Unsharing or leaving removes access, and any preview made before that stops working.
- **The server decides.** Every read and write is checked by the database's row rules using the signed-in user. The screens only show what the server already allowed.

## Where it lives in the app

- **Entry point:** More, then the Labs group, then a Grow Circle row next to Breeding Programs and Pheno Hunt. Locked Pro rows stay visible with a lock.
- **Grow Circle area:** its own page with its own top tabs, Profile at the far left, in the order the design proposal sets.
- **Sharing from the diary:** a "Share to Grow Circle" action on an entry opens the preview sheet. One tap confirms. That keeps to your rule of as few taps as possible.
- **Moderation queue:** lives in the existing operator area, which already checks the operator role on the server.

## Build plan, slice by slice

Each slice is one branch, one writer, one pull request. Each needs all 35 required checks green and an independent review at the exact head. Any slice with a migration also needs your yes at that exact commit, and you apply it to production yourself.

**Slice 0: Approval and decisions (no code).** Record your yes against AGENTS §3 in CURRENT\_STATE, pick the builder and the reviewer, and settle the open questions below.

**Slice 1: Usernames and profile.**

- Migration: `community_profiles` (one row per user, unique lowercase username, display name, bio, private by default), row rules forced on. A grower reads their own row; writes go only through a server call.
- Server call: set or update the profile, using the signed-in user, never an ID sent by the client.
- Logic: reuse `communityProfileRules.ts` as is.
- Code: `src/lib/communityProfileService.ts`, `src/hooks/useCommunityProfile.ts`, a profile settings component, copy in `src/constants/communityCopy.ts`.
- Tests: existing rules tests, a service test with the client mocked, a component test, the profile part of the database proof.

**Slice 2: Share and preview (text only).**

- Migration: collections, collection items, preview tokens, command receipts (so a double tap can't publish twice).
- Server calls: make a preview (15-minute token plus a fingerprint of exactly what will be shared), publish it (checks the token, fingerprint and access version, and is safe to retry), and unpublish.
- Logic: reuse `communityPublicationRules.ts`.
- Screens: the Share to Grow Circle sheet and a My Shares list.

**Slice 3: Reading and access.**

- Migration: collection access, blocks, feature state (the off switch).
- Logic: `communityAccessRules.ts`, plus the whole-room audience which you chose on Nov 12 (option 2). That is a deliberate rule change with its own failing-first tests.
- Screens: the Circle feed and a shared-entry view.

**Slice 4: Photos.**

- Migration: media derivatives, plus a private storage bucket with signed reads.
- Server function: makes the shared copy and removes location and EXIF data.
- Tests: fixture photos that carry GPS data must come out clean, checked byte by byte.

**Slice 5: Feed order and reactions.**

- Migration: digest seen, plus a reactions table. Reactions aren't in the original 13 tables, so this one is a design addition and needs your okay.
- Logic: reuse `communityDigestRules.ts`. Reaction counts are shown.

**Slice 6: Reports, blocks and moderation.**

- Migration: reports and moderators.
- Screens: report and block actions for members, and a moderation queue in the operator area for you.

**Slice 7: Badges (later).** Badges visible to signed-in members only, never the open web. This needs its own yes under AGENTS §3.

## Tests required

- Each new rule or rule change is proven failing before the fix, and the failing count goes in the pull request body.
- The database proof workflow goes from RED to GREEN for each table a slice adds, run on a throwaway local database, never production.
- Cross-user checks: grower B can never read grower A's unshared entries, previews, photos or profile fields, including through server calls.
- Retry and double-tap: publishing the same preview twice makes one share.
- Expired or stale previews are refused.
- Blocks hide shares in both directions.
- Photos with GPS data come out with none.
- Mobile: the share sheet works at phone width, with visible saving, saved and error states, and back or cancel leaves nothing published.

## Validation commands

```
bun run typecheck
bun run lint
bunx vitest run src/test/community-access-rules.test.ts src/test/community-profile-rules.test.ts src/test/community-publication-rules.test.ts src/test/community-digest-rules.test.ts
bun run build
```

Then dispatch `community-v1-db-proof.yml` on the slice branch with the green expectation. Hosted smoke checks happen only on https://verdantgrowdiary.com with the disposable test account, after the slice is live.

## Safety verdict

**HOLD until you say yes.** The constitution's community limit (AGENTS §3) means no slice starts without your recorded approval.

Once approved, it's safe to build in the slices above. Two hard lines:

- No photo sharing before slice 4's location-stripping tests pass.
- No opening Grow Circle to growers beyond testers before slice 6's reports, blocks and moderation exist.

This work touches no sensors, no device control, no AI Doctor, no Action Queue, no billing and no AI credits.

## Risk and rollback

- **Biggest risks:** a photo leaking location, one grower seeing another's private data, harassment, and lookalike or impersonating usernames.
- **Off switch:** the feature-state table turns Grow Circle off on the server. Every community read is refused and the page says Grow Circle is paused.
- **Migrations only move forward.** Rolling back means the off switch plus a new migration, never editing a merged one.
- **A grower can unshare everything at once,** and that removes every other member's access.

## Open questions for you

1. Reactions: one kind, like a single "nice grow", or a few kinds?
2. Can growers change their username later, and how often?
3. Do you have `community-v1-design.md` somewhere? If not, slice 0 should rebuild it from this spec and the code.
4. Who builds, and who reviews?

## Mockups

Phone width (390 pt), drawn in Verdant's green and neutral look. These show the intended flow, not final visual design.

1. **`mock-1-more-labs.png`: entry point, free account.** More, then Labs. Grow Circle is marked Free; Breeding Programs and Pheno Hunt stay visible with a lock and a Pro mark. The bottom bar (Tent, Log, Timeline, More) is unchanged.
2. **`mock-2-circle-tabs.png`: Grow Circle, Logs tab.** Top tabs You, Logs, Ask, Topics, with Logs open. Shared entries show a day-only date, a source label on every item, and a reaction count. The single "Nice grow" reaction is a placeholder: reaction kinds are open question 1.
3. **`mock-3-share-sheet.png`: the share preview.** Opened from a diary entry. It shows exactly what members will see, states what is left out (clock time, photos), offers the two audiences (approved readers, or all signed-in members), and has one confirm tap. Cancel publishes nothing.
4. **`mock-4-profile-setup.png`: username and profile (slice 1).** Username rules from `communityProfileRules.ts`, nothing filled in from email or sign-in, profile private by default. Whether a username can change later is open question 2, so the mock does not promise it.

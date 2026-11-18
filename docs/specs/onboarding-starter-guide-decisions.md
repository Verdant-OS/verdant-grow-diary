# Onboarding, starter setup and checkout: recorded decisions

**Status:** recommendations recorded 2026-11-18 from Matthew (Cheeko). They are **not production
authorization**. They do not lift any release hold, change any entitlement, or approve a deploy,
a migration or a live charge. Any build slice that follows from them still needs its own assignment,
review and approval.

**Source:** Matthew's message in Claude session `session_017UoYKwo4mYcULag9FoN2QE`, 2026-11-18,
headed "Decided (recommendations, not production authorization)". The decisions below are recorded
as he wrote them. Labels in brackets are this file's evidence labels, not part of his wording.

**Revision note (from the source):** revised 2026-10-25 per Cheeko. Unlocks were replaced by optional
spotlight guidance, reliability comes first, and counts were relabeled as estimates.

## Decisions

1. **Paid checkout:** keep the existing release hold. [`source claim`] The code reads as
   sandbox-only. Live status is unverified (`NOT_MEASURED`).
2. **Guest checkout:** deferred. Checkout is account-first. There is no guest-checkout slice or
   target.
3. **Email verification:** unchanged.
4. **Consent:** keep the required terms consent and the optional analytics consent. No copy
   replacement.
5. **Starter setup:** an explicit "Use this starter setup" choice. It is never auto-created at
   signup. It asks for the plant's name. Its defaults, "My first grow" and "Tent 1", are editable.
6. **No locks:** no time-based or log-count locks. All entitled features are available on day one.
   The guide shows one task at a time, Skip is always visible, and optional deeper help is offered
   afterward.
7. **Free grow:** offered only as an informed starter choice with a clear rename option, and it
   explains that it uses the grower's one active grow. Skipping the guide creates no records and
   consumes no allowance.

## Still open

These need Matthew's decision. Nothing here answers them.

- **Restart guide:** where it lives: Help, Settings, or both.
- **Existing accounts:** whether accounts that never saw the guide are offered it.
- **Retained drafts:** whether they stay on the device or sync across devices.

## What this file does not do

- It changes no code, UI copy, schema, RLS, entitlement, billing or checkout behavior.
- It does not verify any claim about the current code or production. Decision 1's "sandbox-only"
  reading and decision 7's "one active grow" limit are as stated in the source. Check them against
  the deploy branch (`src/lib/entitlements/`, the checkout code) and live state before building on
  them.
- Pinned user-facing copy ("Use this starter setup", "My first grow", "Tent 1") still belongs in
  `src/constants/*Copy.ts` when a slice implements it, with its tests in the same change.

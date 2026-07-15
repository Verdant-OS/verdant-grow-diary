# Subscriber growth — publication handoff

This is the operator and reviewer handoff for the subscriber-growth release.
Its purpose is to move the tested acquisition, checkout, activation, and manual
conversion workflow into production so it can contribute to the August goal.

This document authorizes nothing. Pushing, opening a pull request, applying
migrations, deploying, sending outreach, changing billing, and merging remain
explicit human decisions.

## Release boundary

The release is additive and spans:

- public landing, pricing, signup, referral, checkout-recovery, and
  post-purchase activation paths;
- explicit checkout-interest capture using `public.leads`;
- operator-only, aggregate subscriber, acquisition, activation, and
  signup-to-paid snapshots;
- operator-reviewed checkout outreach drafts and a conversion worklist;
- deterministic launch and live-parity evidence.

There are **no changed Supabase Edge Function sources in this release**. Do not
redeploy unrelated functions merely because the frontend or database changes.
The database release consists of exactly four migrations.

## Reviewer order

Review in this order so trust boundaries are settled before copy or layout:

1. **Public lead insert boundary** — anonymous users may submit only the fixed
   pricing-interest sources; they cannot read or mutate leads.
2. **Paid truth** — only active rows in `billing_subscriptions` count toward the
   subscriber goal. Accounts, interest leads, and product activity never count
   as subscribers.
3. **Operator snapshots** — aggregate-only output, operator role required, no
   lead email/name or subscriber identity returned.
4. **Acquisition continuity** — first-party attribution survives landing,
   signup, checkout, and return paths without becoming billing authority.
5. **Manual conversion workflow** — drafts and worklists send nothing, log
   nothing, and grant nothing automatically.
6. **Activation and retention** — post-purchase guidance points to the existing
   Grow -> Tent -> Plant loop; product activity never grants entitlement.

## Required database order

From the explicitly linked production release environment, run:

```bash
npx --yes supabase@latest migration list --linked
npx --yes supabase@latest db push --linked --dry-run
```

The dry run must contain these migrations in this order:

1. `20260714190000_restore_public_lead_insert_only.sql`
2. `20260714193000_subscriber_growth_operator_snapshot.sql`
3. `20260714231627_signup_acquisition_attribution.sql`
4. `20260715002000_signup_to_paid_operator_snapshot.sql`

Stop if the linked project is not production, the remote ledger contains an
unexpected migration, a required migration is missing, or the dry run is empty
while any of these migrations is absent. Never infer database state from
frontend assets.

## Authorized publication sequence

Only an authorized operator should perform these steps:

1. Integrate the latest `origin/verdant-grow-diary` into the growth branch.
2. Run `bun run release:subscriber-growth:gate:local` from the integrated,
   committed branch.
3. Push the branch and open a pull request into `verdant-grow-diary`.
4. Require human review of the six areas above and require repository CI.
5. Re-run the linked migration ledger inspection and database dry run.
6. Apply exactly the reviewed database migrations.
7. Do **not** deploy an Edge Function for this release; none changed.
8. Merge through the normal reviewed path and deploy the frontend.
9. Run `bun run release:subscriber-growth:gate` against the canonical origin.
10. Require an identified deployment and `LIVE_VERIFIED` before operating the
    new funnel.

Any failure returns the release to `HOLD`. A local or live receipt remains
evidence only; it is not deployment authorization.

## Pull request description

Suggested title:

```text
Launch measurable subscriber acquisition and conversion loop
```

Suggested summary:

```text
Adds the measurable path from attributed public acquisition through signup,
paid checkout, core-loop activation, and operator-reviewed lead follow-up.

Safety boundaries:
- active billing entitlements are the only subscriber truth;
- public leads remain insert-only with a fixed source allowlist;
- operator reports are aggregate-only;
- no automatic outreach, Action Queue creation, device control, or entitlement grant;
- no Edge Function source changes;
- database changes are four fixed, ordered migrations.

Validation evidence is produced by:
bun run release:subscriber-growth:gate:local
```

## Post-deploy verification

The full gate must verify all five capabilities on the identified production
deployment:

1. landing attribution;
2. signup verification state;
3. signup intent preservation;
4. referral attribution;
5. checkout recovery.

Then an authorized operator should open the subscriber-growth page and record
the authoritative aggregate baseline:

- active paid;
- new active paid in 7 and 30 days;
- at risk and scheduled cancellation;
- pricing-interest leads needing first contact or follow-up;
- paid core-loop activation;
- signup-to-active-paid cohorts.

Do not copy subscriber identities into release evidence. Do not claim progress
toward 101 from account, lead, click, or activity counts.

## First 24 hours

After `LIVE_VERIFIED`:

1. Capture the active-paid baseline from the operator snapshot.
2. Clear due checkout follow-ups in the conversion worklist.
3. Review and send first-contact drafts only for explicit checkout requests.
4. Log outreach manually after it is actually sent.
5. Check checkout recovery and signup verification failures before increasing
   acquisition volume.
6. Recheck active-paid, activation, at-risk, and cancellation aggregates after
   24 hours; do not infer causality from separate reporting windows.

## Rollback

- Frontend: roll back to the previous identified deployment.
- Database: never edit or delete applied migrations. Use a separately reviewed
  forward migration to correct schema, grants, RLS, or functions.
- Outreach: stop manual outreach immediately; there is no background sender to
  disable.
- Evidence: a rollback invalidates the prior live receipt. Run the full gate
  again on the rollback deployment.

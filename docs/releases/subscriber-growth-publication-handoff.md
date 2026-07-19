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

The subscriber-growth release requires the reviewed `ai-doctor-review` Edge
Function version containing the server-side completion recorder and the public,
read-only `founder-slots-remaining` Edge Function. Source presence alone does
not prove either function is deployed. Deploy only those two reviewed functions
after the reviewed database migration, and do not redeploy unrelated functions
merely because the frontend or database changes.
The database release consists of exactly five migrations.

## Reviewer order

Review in this order so trust boundaries are settled before copy or layout:

1. **Public lead insert boundary** — anonymous users may submit only the fixed
   pricing-interest sources; they cannot read or mutate leads.
2. **Paid truth** — only active, in-period rows from the server-written billing
   sinks count toward the subscriber goal: incumbent `billing_subscriptions`
   plus live-environment `subscriptions` rows produced by the canonical
   checkout. The report deduplicates users across both. Accounts, interest
   leads, and product activity never count as subscribers.
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
5. `20260717010000_paid_return_cohort_measurement.sql`

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
5. Merge through the normal reviewed path, then identify its immutable
   canonical `<release-head-commit>` and check it out detached. Record its
   first parent as `<release-base-commit>`; do not use a later default-branch
   head or the pre-merge feature-branch SHA.
6. Re-run the linked migration ledger inspection and database dry run from that
   checked-out release commit.
7. Apply exactly the reviewed database migrations.
8. Confirm the existing server-side `SUPABASE_SERVICE_ROLE_KEY` secret is
   configured for the linked functions without printing, copying, or exposing
   it; then deploy only the reviewed `ai-doctor-review` and
   `founder-slots-remaining` functions from the exact canonical
   `<release-head-commit>`.
9. Deploy the frontend from that same `<release-head-commit>`.
10. Run the authenticated remote check through the full gate from the detached
    `<release-head-commit>` checkout against the canonical origin:

    ```bash
    bun run release:subscriber-growth:gate -- \
      --base-ref=<release-base-commit> \
      --release-head=<release-head-commit>
    ```

    The authenticated check reads only the linked project identity, remote
    migration IDs, secret names, and downloaded AI Doctor source parity plus
    recorder markers. The separate public Founder check sends no key and stores
    only response statuses, stable reason codes, and a bounded aggregate after
    the entire CORS and payload contract passes. The gate never logs secret
    values or stores remote command output in the receipt. Downloaded source is
    temporary only; failed cleanup returns `HOLD`.

11. Require an identified deployment and `LIVE_VERIFIED` before operating the
    new funnel.

Any failure returns the release to `HOLD`. A local or live receipt remains
evidence only; it is not deployment authorization.
The recorded base commit must be the canonical release commit's first parent
for the full gate; do not replace it with a later default-branch head or the
feature branch's original base.

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
- only `ai-doctor-review` receives the reviewed server-side completion recorder;
- database changes are five fixed, ordered migrations.

Validation evidence is produced by:
bun run release:subscriber-growth:gate:local
```

## Post-deploy verification

The full gate must verify all five capabilities on the identified production
deployment and an authenticated, read-only Supabase check for the paid-return
backend release:

1. landing attribution;
2. signup verification state;
3. signup intent preservation;
4. referral attribution;
5. checkout recovery.

The authenticated backend check requires the linked production project, all
five applied migrations, the `SUPABASE_SERVICE_ROLE_KEY` secret name, and the
reviewed completion-recorder markers and source parity in the downloaded remote
AI Doctor source. This protects against calling a frontend-only deployment
`LIVE_VERIFIED` while the completion recorder is absent, does not match the
reviewed source, or has no configured server-side secret name. It does not
validate or expose the secret value; that would require a separately authorized
runtime exercise.

The separate public check requires an unauthenticated browser-shaped `OPTIONS`
and `POST {}` to the production `founder-slots-remaining` endpoint. It fails
closed unless CORS permits Verdant's production origin and the Supabase client
headers, the POST returns HTTP 200 JSON, the payload contains exactly
`remaining` and `total`, both values are integers, `total === 75`, and
`remaining` is within `0..75`. A 404, 503, malformed response, extra field, or
missing CORS evidence prevents `LIVE_VERIFIED`. This is a production-backend
proof, not a sixth frontend capability marker; local preview stays
network-free.

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

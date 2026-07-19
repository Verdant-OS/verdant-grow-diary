# Subscriber growth — launch gate

This gate packages the subscriber-growth branch into reproducible release
evidence. It checks the repository identity and base ancestry, requires a
clean release scope, runs every changed targeted test and all changed Playwright
specs plus type-check/build/lint/
diff integrity, verifies formatting across the complete base-relative release
diff, audits the production build through a local Vite preview, and compares the
live site with the same capability contract. The full live gate also requires an
authenticated, read-only Supabase verification of the paid-return measurement path
and a secret-free browser-shaped production check of the public Founder counter.

Use `subscriber-growth-publication-handoff.md` for the ordered reviewer,
database, deployment, live-verification, and first-24-hour workflow.

It never pushes, deploys, merges, mutates billing, or proves the August
subscriber goal. Those are separate operator decisions and evidence.

## Before review

Run from a release worktree whose `origin` is
`Verdant-OS/verdant-grow-diary` and whose base is
`origin/verdant-grow-diary`:

```bash
bun run release:subscriber-growth:gate:local
```

`LOCAL_READY` requires:

1. Verified repository and base ancestry.
2. A clean release scope. The auto-managed
   `supabase/functions/mcp/index.ts` file may be recorded and ignored only
   when it is not part of the branch diff; every other dirty path blocks.
3. At least one changed targeted test.
4. Every changed targeted test passing.
5. Type-check, production build, branch-wide changed-code ESLint, base-relative
   changed-file Prettier, and branch diff integrity passing. A merge commit must
   not substitute newly arrived default-branch files for the release diff.
6. All five fixed subscriber-growth migrations passing the source, RLS,
   operator-only aggregate, active-paid, attribution, and activation contract.
7. All public subscriber-growth routes and all fixed capability markers
   present in the local production preview.
8. The subscriber-interest RLS runtime result recorded. Local-only runs may
   record an explicit environment skip; `LIVE_VERIFIED` requires a real pass.

The command writes a redacted JSON receipt to:

```text
artifacts/release-readiness/subscriber-growth/launch-gate.v3.json
```

Receipt schema v3 is required for this release. A v2 receipt predates the
public Founder counter deployment, CORS, and bounded-payload proof and cannot
support a `LIVE_VERIFIED` claim.

The artifact records paths (including any explicitly ignored generated path), counts, statuses, commit identity, and deployment
identity only. It does not store command output, environment values, account
data, lead data, or subscriber identities.

## Pin the canonical release commit

After the reviewed pull request merges, work from its immutable canonical
commit—not a moving default-branch checkout or the pre-merge feature-branch
SHA. Record the merged release commit and its first parent, then check out the
release commit detached:

```bash
git fetch origin
git checkout --detach <release-head-commit>
git rev-parse HEAD
git rev-parse HEAD^
```

`<release-head-commit>` is the canonical merge, squash, or rebase commit that
contains this release. Its first parent is `<release-base-commit>`. Use those
two immutable commits for the deployment, backend check, and full gate. This
keeps unrelated default-branch commits out of the release diff and makes the
authenticated backend check inspect the same reviewed source revision. Full
mode rejects a non-detached checkout or a release head that is not already
reachable from `origin/verdant-grow-diary`.

## Before an authorized deployment

The source gate cannot prove the remote Supabase migration ledger. From an
explicitly linked, authenticated release environment, inspect the ledger and
dry-run the database changes before deploying the frontend:

```bash
npx --yes supabase@latest migration list --linked
npx --yes supabase@latest db push --linked --dry-run
```

Confirm the dry run contains these migrations, in order:

1. `20260714190000_restore_public_lead_insert_only.sql`
2. `20260714193000_subscriber_growth_operator_snapshot.sql`
3. `20260714231627_signup_acquisition_attribution.sql`
4. `20260715002000_signup_to_paid_operator_snapshot.sql`
5. `20260717010000_paid_return_cohort_measurement.sql`

Only after explicit deployment authorization: apply the five migrations, then
deploy the reviewed `ai-doctor-review` and `founder-slots-remaining` Edge
Functions and the frontend from `<release-head-commit>`. Before deploying the
functions, confirm the existing server-side `SUPABASE_SERVICE_ROLE_KEY` secret
is configured in the linked environment; never print, copy, or expose that
secret. Do not deploy unrelated Edge Functions for this release. Stop if the
ledger is linked to the wrong project, any migration is unexpectedly
remote-only, the dry run is empty when these migrations are absent, or the
contract gate is not `LOCAL_READY`. Do not infer migration or function state
from frontend assets.

The full gate performs an authenticated, read-only Supabase remote check after
deployment. It requires the linked project reference, the five remote migration
IDs, the **name** `SUPABASE_SERVICE_ROLE_KEY` from the remote secret list, and
the downloaded remote `ai-doctor-review` source to match the checked-out
reviewed source after line-ending normalization and contain the reviewed
completion-recorder markers. It never prints or stores secret values, CLI
output, downloaded source, account data, or deployment credentials in the
release receipt. Downloaded source exists only in a temporary directory, and
a cleanup failure returns `HOLD`. A missing CLI login, wrong linked project,
unavailable remote source, or incomplete check also returns `HOLD`.

The separate Founder check uses no API key or service-role value. It sends a
browser-shaped unauthenticated `OPTIONS` preflight and `POST {}` to the fixed
production `founder-slots-remaining` endpoint. The check requires successful
CORS for Verdant's production origin and the Supabase client headers, HTTP 200
JSON, exactly the keys `remaining` and `total`, integer values, `total === 75`,
and `remaining` within `0..75`. Its receipt records only response statuses,
stable reason codes, and the bounded public aggregate after the complete
contract passes. A 404, 503, HTML response, extra field, malformed value, or
missing CORS evidence returns `HOLD`.

## After an authorized deployment

Run the full gate against the canonical production origin from the detached
`<release-head-commit>` checkout:

```bash
bun run release:subscriber-growth:gate -- \
  --base-ref=<release-base-commit> \
  --release-head=<release-head-commit>
```

`LIVE_VERIFIED` additionally requires all fixed live routes and capabilities
to pass on a deployment that returns a non-empty deployment identifier, plus
an authenticated Supabase check of the exact five applied migrations, the
server-side completion-recorder secret name, and the reviewed
`ai-doctor-review` source parity and recorder markers. The public Founder
counter check must also pass its production CORS and exact bounded-payload
contract. Reachability alone is insufficient.

Do not replace `<release-head-commit>` with a later production head or
`<release-base-commit>` with the feature branch's original base. Either would
mix releases or yield a zero-file diff, and the gate intentionally returns
`HOLD` rather than treating zero targeted tests as release evidence. In full
mode it also rejects a base commit that is not the checked-out release head's
first parent, a release head that differs from the immutable
`--release-head` value, or a live parity origin other than
`https://verdantgrowdiary.com`.

The current capabilities are deliberately fixed and fail closed:

- Landing attribution
- Signup verification state
- Signup intent preservation
- Referral attribution
- Checkout recovery

Missing, renamed, duplicated, or marker-incomplete assets produce `HOLD`.
The Founder counter is a separate production-backend proof, not a sixth asset
marker, so the local Vite parity run remains network-free.

## Decision meanings

| Status          | Meaning                                                                                                         |
| --------------- | --------------------------------------------------------------------------------------------------------------- |
| `HOLD`          | Source, validation, local parity, or required live parity is incomplete.                                        |
| `LOCAL_READY`   | Clean committed source passes the local release contract; live deployment was intentionally not evaluated.      |
| `LIVE_VERIFIED` | Local contract, identified live capability parity, Founder counter proof, and authenticated backend check pass. |

None of these statuses authorizes a push, deployment, merge, billing change,
or outreach. `LIVE_VERIFIED` also does not prove subscriber count; the
authoritative operator subscriber snapshot remains the source for that goal.

## Rollback

This tooling is additive. Remove the two package scripts and delete the gate
runner, pure rules modules, runbook, and targeted tests to restore the prior
release process. Application rollback does not reverse applied database
migrations; use a separately reviewed forward migration for any schema or RLS
rollback.

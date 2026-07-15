# Subscriber growth — launch gate

This gate packages the subscriber-growth branch into reproducible release
evidence. It checks the repository identity and base ancestry, requires a
clean release scope, runs every changed targeted test plus type-check/build/lint/
diff integrity, verifies formatting on the release commit, audits the
production build through a local Vite preview, and optionally compares the
live site with the same capability contract.

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
5. Type-check, production build, branch-wide changed-code ESLint, release-
   commit Prettier, and branch diff integrity passing.
6. All four fixed subscriber-growth migrations passing the source, RLS,
   operator-only aggregate, active-paid, attribution, and activation contract.
7. All public subscriber-growth routes and all fixed capability markers
   present in the local production preview.

The command writes a redacted JSON receipt to:

```text
artifacts/release-readiness/subscriber-growth/launch-gate.v1.json
```

The artifact records paths (including any explicitly ignored generated path), counts, statuses, commit identity, and deployment
identity only. It does not store command output, environment values, account
data, lead data, or subscriber identities.

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

Only after explicit deployment authorization: apply the migrations, deploy
the required payment/webhook functions, then deploy the frontend. Stop if the
ledger is linked to the wrong project, any migration is unexpectedly remote-
only, the dry run is empty when these migrations are absent, or the contract
gate is not `LOCAL_READY`. Do not infer migration state from frontend assets.

## After an authorized deployment

Run the full gate against the canonical production origin:

```bash
bun run release:subscriber-growth:gate
```

`LIVE_VERIFIED` additionally requires all fixed live routes and capabilities
to pass on a deployment that returns a non-empty deployment identifier.
Reachability alone is insufficient.

The current capabilities are deliberately fixed and fail closed:

- Landing attribution
- Signup verification state
- Signup intent preservation
- Referral attribution
- Checkout recovery

Missing, renamed, duplicated, or marker-incomplete assets produce `HOLD`.

## Decision meanings

| Status          | Meaning                                                                                                    |
| --------------- | ---------------------------------------------------------------------------------------------------------- |
| `HOLD`          | Source, validation, local parity, or required live parity is incomplete.                                   |
| `LOCAL_READY`   | Clean committed source passes the local release contract; live deployment was intentionally not evaluated. |
| `LIVE_VERIFIED` | Local release contract and identified live capability parity pass.                                         |

None of these statuses authorizes a push, deployment, merge, billing change,
or outreach. `LIVE_VERIFIED` also does not prove subscriber count; the
authoritative operator subscriber snapshot remains the source for that goal.

## Rollback

This tooling is additive. Remove the two package scripts and delete the gate
runner, pure rules modules, runbook, and targeted tests to restore the prior
release process. Application rollback does not reverse applied database
migrations; use a separately reviewed forward migration for any schema or RLS
rollback.

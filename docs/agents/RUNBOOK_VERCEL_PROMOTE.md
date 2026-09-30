# Vercel production promotion and rollback

Matthew owns the publish decision, promotion, rollback, credentials and Vercel
configuration. Codex prepares repository fixes and exact-SHA evidence. This runbook
does not authorize an agent to change production traffic.

## Project and release identity

- Repository: `Verdant-OS/verdant-grow-diary`.
- Deploy branch: `verdant-grow-diary`; never push directly to it.
- Vercel team: `VerdantGrowDiary`, slug `verdantgrowdiary`, ID
  `team_tj5u4U2DViLW29AVVG0OP1NT`.
- Vercel project: `verdant-grow-diary`, ID `prj_i2IbBKEA9K2rLLaAO3nrBeJkTXTy`.
- Production app: <https://verdantgrowdiary.com>.
- Frontend build receipt: <https://verdantgrowdiary.com/version.json>.

These identifiers are a measured snapshot, not permanent credentials. Before a
release, recheck the team and project in Vercel Settings and the deployment's
project/team metadata. After a transfer or recreation, update this packet and
runbook; do not silently substitute an identically named project.

Record daily observations and check failures in `CURRENT_STATE.md` or the release
packet. A Vercel deployment with `target: production` and `READY` proves that its
artifact was built; it does not prove that the app domain serves that artifact.
Frontend identity does not establish applied SQL or deployed Supabase Edge code.

## Preferred automatic promotion: Vercel Deployment Checks

Use the existing Git integration instead of creating a second deployment writer.
In the project's **Settings → Deployment Checks**, Matthew records the exact
checks selected and their results for the target deploy SHA. Confirm automatic
domain assignment and measure the current Rolling Release state. Passing checks
can make a deployment eligible for rollout; it does not prove that the deployment
receives all production traffic. See
[Vercel Deployment Checks](https://vercel.com/docs/deployment-checks).

Matthew removes **Supabase Preview** from that production check list. This is a
third-party development integration, not production schema acceptance. Do not remove
the dependency audit, required-check audit, production safeguards or required
application checks to obtain a green release.

PR #1778 landed as `674eb480e5e5c2b55c18dd7ac823f088c5e0b424`. In the
current deploy-branch workflow, `verify-sandbox` runs only on manual
`workflow_dispatch` for the pinned sandbox target; deploy pushes still run the
offline manifest-and-files job, but no automatic sandbox database probe.
`verify-production` remains a separate protected manual lane. An intentionally
unrun database check is `NOT_MEASURED`, not applied-schema proof.
Reconcile the selected Vercel checks with the workflows that actually report on
deploy pushes; a PR-only check cannot gate a deploy SHA unless it reports there.

Read failed logs before retrying. Explain dependency failures using the exact
resolved package, advisory and job URL. Do not add audit exceptions or change
lockfiles without Matthew's explicit scope approval. The post-merge Required-check
audit must keep its merge-time cutoff, landed/head evidence handling and pinned
required checks. Missing ruleset-administration access stays `BLOCKED`.

## Rolling Releases: measure traffic before declaring a release

The repository's [release topology measurement](../specs/release-topology-specification.md)
records a historical automatic 10%-for-five-minutes rollout and READY builds
that never became canaries. That is prior evidence; the current configuration
and rollout remain `NOT_MEASURED` until read from Vercel for this release.

Matthew records the current deployment, canary, queued deployment, their full
SHAs/IDs, traffic percentage, stage and completion/abort state from the project's
Deployments/Rolling Releases view. If a rollout is active, resolve that exact
rollout before starting another. A promote request during an active rollout does
not establish that the target replaced it.

Only Matthew may advance or complete the approved rollout, or abort it and select
the known-good rollback. Automatic advancement still needs a measured completion
receipt. Do not declare promotion complete until the intended deployment has
100% traffic and no unresolved canary/queued rollout; do not declare rollback
complete until the target routing and active-rollout resolution are measured.
An open browser can remain on older assets under Skew Protection, so verify new
loads as well as any persistent fixture session.

The official [Rolling Releases guide](https://vercel.com/docs/rolling-releases)
and [CLI reference](https://vercel.com/docs/cli/rolling-release) describe fetch,
complete and abort. These are owner controls; Codex runs none of them here.

## Owner promotion packet

Before Matthew promotes, record:

1. Current production-host inventory and each hostname's serving deployment,
   full SHA and `dirty` from `version.json`, with observation time.
2. Target deploy full SHA, included commits and exact-head required check results;
   required checks must be successful, not skipped, cancelled or still pending.
3. The target deployment URL, ID, project, `target: production`, `READY` state and
   matching `meta.githubCommitSha` / `meta.githubCommitRef`.
4. The selected Deployment Checks and remaining security/publish gates. Escalate a
   publish gate to Matthew; green unrelated checks cannot clear it.
5. A known-good production rollback URL and SHA, and the production fixture plan.
6. Current/canary/queued deployment identities, measured traffic allocation,
   rollout stage/state, and the owner's intended completion or abort. A single
   `/version.json` sample cannot establish fleet-wide rollout completion.

Use the production-built artifact for the exact approved deploy SHA. Do not
rebuild, substitute a PR artifact, or silently choose a newer commit. A connector
that omits Deployment Check results has not verified them; Matthew reads those
results in the dashboard. A metadata tool validation error is a tooling blocker,
not evidence that production is accepted.

## Manual promotion — Matthew only

After the packet and publish decision are complete, Matthew runs:

```sh
vercel promote <deployment-url> --scope verdantgrowdiary
```

`<deployment-url>` is the production deployment URL verified in the packet.
Authentication happens in Matthew's Vercel CLI session; never paste a token into
chat or commit it. Promotion selects an existing artifact and may initiate a
partial Rolling Release; record its eventual completion separately. Do not use
Force Promote to bypass an unresolved publish or security gate. See
[the promote command](https://vercel.com/docs/cli/promote).

## Rollback — Matthew only

If the release must be reversed, Matthew selects the packet's known-good production
artifact and runs:

```sh
vercel rollback <deployment-url> --scope verdantgrowdiary
```

Here `<deployment-url>` is the rollback artifact, not the failed target. Rollback
changes routing without rebuilding. It does not reverse a database migration or
an Edge deployment. Do not assume rollback paused automatic production domain
assignment: the observed pause after an earlier rollback does not establish its
cause or the current project setting. Matthew checks and records the production
domain auto-assignment setting after rollback, or observes the routing of the next
deploy-branch build. Until measured, mark the pause `NOT_MEASURED` and do not rely
on it to keep a later Git deployment from returning the failed version. Any
automation must honor a verified rollback/manual-pause state and must not undo
the rollback by promoting another green commit. See
[Instant Rollback](https://vercel.com/docs/instant-rollback) and
[the rollback command](https://vercel.com/docs/cli/rollback).

## Verify every production hostname after either operation

After resolving any active rollout, Matthew refreshes the production-host inventory
from the domains bound to the apex-holding project and its production aliases.
Include at least `verdantgrowdiary.com`, `www.verdantgrowdiary.com`,
`verdant-grow-diary.vercel.app` and the recorded project alias
`verdant-grow-diary-verdantgrowdiary.vercel.app`, plus each
earlier-inventoried hostname until its retirement is owner-recorded and verified.
For **each** hostname, resolve the serving deployment (M10 in the release topology
specification) and record its deployment ID, full SHA, `READY` state,
`target: production` and `source: git`. A newest-deployment listing or one
deployment's alias array is not a per-host resolution.

Read a build receipt for each hostname with a unique observation timestamp and
no-cache request. Follow redirects and retain response headers plus the effective
URL, so a cached response or another origin is visible. Repeat this command with
each inventoried hostname substituted for `<production-hostname>`:

```sh
curl --fail --silent --show-error --location \
  --header 'Cache-Control: no-cache' \
  --dump-header '<production-hostname>.version-receipt.headers' \
  --output '<production-hostname>.version-receipt.json' \
  --write-out 'effective_url=%{url_effective}\nhttp_code=%{http_code}\n' \
  'https://<production-hostname>/version.json?receipt=<utc-observation-timestamp>'
```

Replace the hostname and timestamp placeholders for each observation. Check the
effective host, status and caching headers, then confirm every JSON receipt's
full `commit` equals the intended promote or rollback SHA and `dirty` is `false`.
Save each hostname's resolution, JSON, headers, timestamp, rollout resolution and
owner operation receipts. A split between serving deployments or SHAs is `FAIL`;
so is a resolved deployment that is not the intended `READY`, production-target,
Git-sourced artifact. An unmeasured or unreachable hostname blocks acceptance as
`NOT_MEASURED`. Do not declare promotion or rollback complete until the entire
inventory agrees and the rollout is complete or aborted.

Only then exercise the fixed flow on the fixture account's own grow, with every
smoke write tagged `[smoke <timestamp>]`. Never use customer data or the KEEP
account. Probes against an older live build cannot accept the new fix. Record
frontend behaviour, production database acceptance and Edge identity separately.

## Conditional fallback: promotion Action

Native Deployment Checks are the preferred lane. Do not enable a second automatic
writer merely because a selected check is red. First repair the checks, record the
dashboard selection and measure whether native promotion resumes.

If Matthew determines the native lane remains insufficient, he creates a token in
Vercel **Account Settings → Tokens**, named `verdant-github-promotion`, scoped only
to `VerdantGrowDiary`, with an explicit expiry. He enters it directly in GitHub
**Settings → Secrets and variables → Actions** as the repository secret
`VERCEL_PROMOTION_TOKEN`. Codex must not create, view or alter its value. See
[Vercel access tokens](https://vercel.com/docs/accounts/access-tokens).

Prepare the fallback as a separate scoped PR. Its acceptance must prove: the SHA
is still the deploy tip; all selected and required checks passed for that SHA;
the deployment belongs to this project and is the production artifact for that
SHA; production automatic assignment is enabled; no unresolved rollout exists;
and a rollback/manual-pause state prevents promotion. Serialize promotions,
recheck immediately before the
write, use read-only GitHub permissions and keep the token out of logs. No such
Action or token is enabled by this runbook.

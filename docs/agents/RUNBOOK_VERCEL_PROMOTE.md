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
   Record merge-queue provenance (M4): a successful `ci.yml` run with
   `event: merge_group` whose `head_sha` is the target SHA, on the
   `gh-readonly-queue/verdant-grow-diary/pr-<N>-<parent>` branch whose `<parent>`
   is the previous first-parent tip. A merged PR is not that evidence. A tip without
   a queue run is a direct push or bypass merge, an out-of-band publish: do not
   promote it. Unreadable runs leave provenance `BLOCKED`, never assumed.
3. The target deployment URL, ID, project, `target: production`, `READY` state,
   `source: git` and matching `meta.githubCommitSha` / `meta.githubCommitRef`. A
   CLI-created or other non-Git deployment is not promoted even when its metadata
   matches.
4. The selected Deployment Checks and remaining security/publish gates. Escalate a
   publish gate to Matthew; green unrelated checks cannot clear it.
5. A known-good production rollback URL and SHA, and the production fixture plan.
6. Current/canary/queued deployment identities, measured traffic allocation,
   rollout stage/state, and the owner's intended completion or abort. Also record
   the rolling-release configuration (`get_rolling_release_config`), meaning its
   stages and advancement type, as the owner-approved baseline for the pre-promote
   comparison. A single
   `/version.json` sample cannot establish fleet-wide rollout completion.

Use the production-built artifact for the exact approved deploy SHA. Do not
rebuild, substitute a PR artifact, or silently choose a newer commit. A connector
that omits Deployment Check results has not verified them; Matthew reads those
results in the dashboard. A metadata tool validation error is a tooling blocker,
not evidence that production is accepted.

## Manual promotion — Matthew only

After the packet and publish decision are complete, and **immediately before**
promoting, Matthew rereads the release state. The packet may be stale if a merge,
check rerun or rollout change happened after it was prepared. He records a UTC time
for each of these reads:

- the deploy tip, freshly fetched (`git fetch origin verdant-grow-diary`, then
  `git rev-parse origin/verdant-grow-diary`), which must still equal the packet's
  target SHA and still carry the recorded merge-queue provenance;
- the target deployment's project, `target: production`, `READY` state,
  `source: git` and `meta.githubCommitSha` / `meta.githubCommitRef`, which must
  still match that SHA;
- the required and selected Deployment Check results for that SHA, which must all
  still be successful;
- the rolling-release record, which must show no unresolved rollout, and the
  rolling-release configuration (`get_rolling_release_config`), whose stages and
  advancement type must still equal what the owner approved in the packet, because
  a promote may start a partial rollout under those settings;
- the production-host inventory from packet item 1, re-enumerated: the M2 apex
  holder, the production domains bound to the project, the aliases
  (`list_promote_aliases`) and each custom hostname's DNS, which must still equal
  the packet's inventory, because a domain added, removed or moved since the packet
  would put traffic on a topology the owner never approved.

If any value differs from the packet, stop and rebuild the packet rather than
promoting a stale artifact. Only then does Matthew run:

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
artifact. **Immediately before** rolling back, he rereads the following and records
a UTC time for each read:

- the rollback target deployment's project, `target: production`, `READY` state,
  `source: git` and `meta.githubCommitSha`, which must still match the packet's
  known-good SHA;
- the rolling-release record and configuration (`get_rolling_release` and
  `get_rolling_release_config`);
- the production-host inventory from packet item 1, re-enumerated: the M2 apex
  holder, the production domains bound to the project, the aliases
  (`list_promote_aliases`) and each custom hostname's DNS, which must still equal
  the packet's inventory;
- each hostname's current serving deployment, for every hostname in that
  re-enumerated inventory.

If a rollout started, or the inventory or routing changed, after the packet was
prepared, he stops and resolves it before any rollback. He then runs:

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

This is M10 of the [release topology specification](../specs/release-topology-specification.md),
run as an **opening reading**, a sweep, and a **closing reading**. Record the UTC time
of every read.

**1. Opening reading.** After resolving any active rollout, Matthew records:

- the rolling-release record and configuration (state, substate, current and canary
  deployments, canary percentage, stage, queued deployment, `startedAt`, `updatedAt`,
  configured stages and advancement type). The timestamps are what reveal a rollout
  restarted or recompleted for the same deployment mid-sweep, so compare them in the
  closing reading like every other field;
- the deploy tip, freshly fetched: `git fetch origin verdant-grow-diary`, then
  `git rev-parse origin/verdant-grow-diary`;
- the complete production-host inventory: the domains bound to the project that M2
  verifies as the apex holder, plus that project's production aliases.

The inventory includes at least `verdantgrowdiary.com`, `www.verdantgrowdiary.com`,
`verdant-grow-diary.vercel.app` and the recorded project alias
`verdant-grow-diary-verdantgrowdiary.vercel.app`, plus each earlier-inventoried
hostname until its retirement is owner-recorded and verified. The inventory's
completeness is not established, and acceptance is withheld, when either:

- M2 names no single holder, which leaves completeness `NOT_MEASURED`; or
- no previous M10 inventory was recorded, which leaves prior-hostname coverage
  `NO_BASELINE`. Current bindings alone cannot show that a formerly inventoried
  hostname has stopped serving.

The previous inventory is the one recorded by the last M10 run that completed its
inventory reads, whatever that run's status. The specification carries it from the
last stamp at which M10 ran, not from the last `PASS`. So the first sweep that
records an inventory still withholds acceptance, but it becomes the baseline for
the next sweep. Without that rule no sweep could ever pass.

**2. DNS for each custom hostname, before resolving its deployment.** Resolve `A`,
`AAAA` and `CNAME`, as M2 does for the apex, and record each answer:

- An authoritative `NODATA` for a record type is `NO_DATA` for that type; reconcile
  the others.
- A split, or a record naming another platform, is `FAIL`. Audit that hostname on
  the platform DNS names; never pass it through a stale Vercel binding. A Vercel
  binding that still lists the hostname is not serving evidence.
- A proxy that hides the serving platform is `NOT_MEASURED`.
- A failed lookup (timeout, `SERVFAIL`, no reachable resolver) is `BLOCKED`.
- **Retirement.** An earlier-inventoried hostname whose retirement the owner
  recorded in `CURRENT_STATE.md` leaves the inventory once retirement is verified.
  Verification means either no `A`, `AAAA` or `CNAME` record at all, or a permanent
  redirect to an inventoried hostname (M10). Record that evidence, and skip step 3
  and the receipt for that hostname. A hostname that still resolves without a
  recorded retirement stays in the sweep, and one bound to no Verdant deployment is
  `FAIL`.

Platform-owned `*.vercel.app` hostnames need no DNS step.

**3. Per-host deployment, then alias moves.** For **each** hostname, resolve the
serving deployment (`get_deployment <hostname>`) and record its deployment ID,
`target: production`, `READY` state, `source: git`, `githubCommitRef` and full
`githubCommitSha`. A newest-deployment listing or one deployment's alias array is
not a per-host resolution. A preview deployment on a production hostname is `FAIL`
even at the tip's SHA.

Then read `list_promote_aliases`. A pending or failed alias move prevents
completion. It is reconciled only by an owner-authorized action (D-RT-13), followed
by a repeated sweep from step 1. Do not treat an automatic or repeated promotion as
the remedy.

**4. Build receipts, then the closing reading.** Read a build receipt for each
hostname with a unique observation timestamp and no-cache request. Follow redirects
and retain response headers plus the effective URL, so a cached response or another
origin is visible. Repeat this command with each inventoried hostname substituted
for `<production-hostname>`:

```sh
curl --fail --silent --show-error --location \
  --header 'Cache-Control: no-cache' \
  --dump-header '<production-hostname>.version-receipt.headers' \
  --output '<production-hostname>.version-receipt.json' \
  --write-out 'effective_url=%{url_effective}\nhttp_code=%{http_code}\n' \
  'https://<production-hostname>/version.json?receipt=<utc-observation-timestamp>'
```

Check the effective host, status and caching headers, then confirm every JSON
receipt's full `commit` equals the intended promote or rollback SHA and `dirty` is
`false`.

Then take the **closing reading**: reread the rollout record and configuration, the
host inventory, each custom hostname's DNS, each hostname's deployment, the alias
moves, and a freshly fetched deploy tip. The run is `PASS` only when the opening and
closing readings agree on every value **and** a full M11 audit runs through the
closing timestamp. Snapshots that agree cannot reveal a change that was made and
reverted, and the audit can. The audit must meet the specification's M11
requirements:

- It starts from M11's own last successful boundary, the last stamp at which M11
  ran, not from this sweep's opening reading.
- If M11 has never run to completion, there is no boundary yet. The first complete
  audit starts at a time the owner names, no later than this sweep's opening
  reading. It records that start and the holder set as M11's first boundary. Its
  history before that start is reported `NO_BASELINE`, never `PASS` and never
  `NOT_MEASURED`. That gap stays in the record, but it does not block this sweep's
  consistency, which the audit fully covers.
- It covers M11's full holder set: the apex-holding project at that boundary, the
  current one, and every project or platform that an unfiltered domain event or DNS
  change in the window names. The holder set is complete only when every entry
  names a project. A DNS target that names a platform but no project (a shared
  anycast address), or an unidentified DNS provider, leaves completeness
  `NOT_MEASURED`. A holder the session cannot read leaves that portion `BLOCKED`.
- It lists Vercel user events and authoritative DNS changes for every custom
  hostname in that union.
- It enumerates every production deployment created in the window in those
  projects and classifies each one by M4's rules. That includes the merge-queue
  provenance of every deploy-branch tip. A CLI-created deployment, an off-branch
  Git build or a bypass-merged tip is an out-of-band publish, even when the
  topology was restored before the closing reading.
- Everything else M11 lists in the specification is also covered.

An audit is complete only when all of the above ran with no `BLOCKED` or
`NOT_MEASURED` portion. An incomplete audit does not advance M11's boundary and
cannot make the run `PASS`.

What each outcome means:

- Every routing, alias, domain, DNS or production-setting event in the audit window
  that is not this operation's own recorded action is recorded as a D-RT-13 publish
  action, with its actor.
- Only such an event timed between the opening and closing readings makes
  consistency `NOT_MEASURED` and the sweep repeats. An event before the opening
  reading is an M11 finding, not a consistency failure, because both readings
  were taken after it.
- A complete audit advances M11's boundary to the closing timestamp, whatever it
  finds. Findings are measurements, so a later retry does not re-read events that
  were already recorded.
- An audit attempted but prevented by missing access, permission or egress leaves
  consistency `BLOCKED`.
- An audit that was not performed, or that ran without recording its start or
  holder set, leaves consistency `NOT_MEASURED`.
- Neither `BLOCKED` nor `NOT_MEASURED` is `PASS`.

- If any value changed during the sweep (a rollout, promote, redeploy, rollback,
  alias or domain move, DNS change or new merge), mark consistency `NOT_MEASURED`
  and repeat the sweep.
- A definite `FAIL` still stands under M10's opening-tip rule: a hostname that
  served neither the opening tip nor a commit merged during the run was not serving
  the tip.

**5. Record and classify.**

- Subject to M10's opening-tip rule, a measured split between serving deployments
  or SHAs is `FAIL`. So is a resolved deployment that is not the intended `READY`,
  production-target, Git-sourced artifact.
- A hostname serving a commit merged mid-sweep, or a closing tip that does not
  descend from the opening tip, makes the run `NOT_MEASURED`; repeat it. For
  example, opening tip A, host 1 serves A, B merges, host 2 serves B, closing tip B
  is a torn sample, not a same-time split. This never erases a definite `FAIL`
  established under the opening-tip rule.
- A verification that was attempted but could not be completed for lack of access,
  egress or a dependency is `BLOCKED`. One that was not performed is
  `NOT_MEASURED`. Neither is acceptance.
- An approved rollback can correctly restore its intended older SHA while the
  current-tip release status remains `FAIL`. Record both.

For every publish action, record the following in the session report and the next
`CURRENT_STATE.md` stamp (D-RT-13). Publish actions are:

- a promote, redeploy or rollback;
- a rollout start, stage approval, completion (forced included) or abort;
- a manual alias assignment, including the reconciliation of a pending or failed
  alias move in step 3;
- a domain add, remove or move, or a DNS record change for a production hostname;
- a production-setting change: Skew Protection, build settings, connectors,
  auto-assignment, or enabling, disabling or reconfiguring Rolling Releases.

For each one, record:

- the action;
- the affected deployment IDs;
- the actor class (Git integration, owner CLI or dashboard, token);
- a sanitized reason;
- the operation receipts.

Save each hostname's DNS answers, resolution, JSON, headers and timestamp alongside
them. Do not declare promotion or rollback complete until the entire inventory
agrees across a consistent opening and closing reading, and the rollout is complete
or aborted.

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
**Settings → Environments** as the secret `VERCEL_PROMOTION_TOKEN` of a dedicated
protected environment. That environment is restricted to the deploy branch, with
required reviewers as Matthew sets them, and only the promotion job binds to it,
following the repository's existing pattern for production credentials (the
`verdant-production` environment in `required-core-migrations.yml`). Never store
the token as a repository-wide secret: any later workflow could reference it by
name and bypass the Action's serialization and rollback checks. Codex must not
create, view or alter its value. See
[Vercel access tokens](https://vercel.com/docs/accounts/access-tokens).

Prepare the fallback as a separate scoped PR. Its acceptance must prove: the SHA
is still the deploy tip and carries successful M4 merge-queue provenance; all
selected and required checks passed for that SHA; the deployment belongs to this
project and is the Git-sourced production artifact for that SHA; no unresolved
rollout exists; the rolling-release configuration (stages and advancement type),
read immediately before the write, equals the owner-approved baseline recorded in
the packet; and a rollback/manual-pause state prevents promotion. Before the
Action is enabled, Matthew disables or otherwise fences native production
auto-assignment, and records it as a D-RT-13 production-setting change. Otherwise
the Git integration keeps an independent routing path outside the Action's
serialization and rollback checks, which is the second-writer condition this lane
exists to avoid. He restores native assignment only after the fallback Action is
retired and its token revoked. Serialize promotions,
recheck immediately before the
write, use read-only GitHub permissions and keep the token out of logs. No such
Action or token is enabled by this runbook.

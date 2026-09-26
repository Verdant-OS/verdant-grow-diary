# Authoritative Release Topology Specification

**Author:** Claude (Knowledge Library / Product Specification Architect), slice owner
**Independent reviewer:** Grok, the peer the assignment names. CodeRabbit remains the fallback seat
under the owner's strict rule (a review counts only when it is finding-free and lists no unreviewed
files) — Cheek, 2026-09-25. Which seat satisfies peer review is Cheek's decision (§15)
**Date:** 2026-09-25 (founding measurement); amended 2026-09-25 late evening (§2.4)
**Slice:** Authoritative Release Topology Specification — docs-only, the second slice of the
architecture-contract work, sequenced after `#1221` merged (`cb6c3288`, 2026-09-25 00:12 UTC).
First opened as `#1699`; carried forward on `claude/clever-davinci-hk7o03` after its owning session
was archived (§2.4)
**Status:** **Specification with a measured baseline and one measured incident.** §§3–9 are
durable: the topology model, the rules, and the measurement procedures. Appendix A is the founding
measurement and Appendix B the promotion incident that followed it; both are dated and superseded by
every later `docs/agents/CURRENT_STATE.md` stamp that re-runs the procedures.
**Measured against:** deploy tip `e1d541e2559eb42d5e452035e79b1d796c91c0f9` (the `#1691` squash,
committed 2026-09-25 01:10:00 UTC) on `verdant-grow-diary`, read locally. Live and platform reads
ran between 01:19 and 01:25 UTC on 2026-09-25 through the owner-connected GitHub, Vercel, Lovable
and Supabase tools, one attempt each, nothing routed around. **Amended against** deploy tip
`c9bc1df37b6f0ae1494cf02dffb6a122b39a6f77` (the `#1713` squash): every repository cite re-read at
that SHA, the stack conclusions of §6.1 verified from source there, and the promotion axis (§3, §4,
§5.7, M10–M11) measured by Vercel reads at 23:28–23:37 UTC (Appendix B).

Every claim carries a Sentinel label: `established fact`, `source claim`, `practical observation`,
`inference`, `uncertainty`, `missing evidence`. Every topology check carries one status from the
constitution's full vocabulary (`AGENTS.md`, Status Vocabulary): `PASS`, `FAIL`, `BLOCKED` (access,
permission or credential prevented it), `NO_BASELINE`, `NO_DATA` (the authorized source answered
with nothing), `NOT_MEASURED`, `SKIPPED` (deliberately not run; the reason is recorded) and
`NOT_APPLICABLE`. Only `PASS` is a pass.

---

## 0. What this document is, and what it must not become

`docs/architecture-contract.md` §14 deliberately refused to settle release topology, because a
permanent contract goes stale every time the operating picture moves. It kept two durable rules —
_publisher identity is not established by response headers_ and _the build target is not the
serving target_ — and deferred the rest to this specification (§13 of the contract).

This document does three things and only three:

1. **Names the topology model** — the six axes along which "what is live" is decided, and which
   system owns each (§3).
2. **Records the measurement chain that closes each axis** — what evidence counts, what does not,
   and the exact read that produces it (§4, §8). The chain is the durable part.
3. **Corrects repository statements that the measurement contradicts** (§6) and states the
   decisions that follow (§7).

It does **not** carry operating state. Appendix A holds the values measured while writing it, dated
to the minute, so a reviewer can reproduce every claim; those values are already history. Where
Appendix A and a later `docs/agents/CURRENT_STATE.md` stamp disagree, **the stamp wins for the value
and this document wins for the method.** `docs/agents/CURRENT_STATE.md` is not edited by this slice
(`#1696` owns the open restamp — §2).

Out of scope, verbatim from the assignment and unchanged: Next.js migration, Drizzle or tRPC
adoption, auth migration, schema/RLS/migration changes, provider or model change, Action Queue
writes, device control, production deployment, production migration application. No application
code is written in this slice.

---

## 1. Summary

- **Frontend and SSR.** `verdantgrowdiary.com` is served by Vercel project `verdant-grow-diary`
  (team `verdantgrowdiary`), which is git-linked to `Verdant-OS/verdant-grow-diary` and has created
  a **production** deployment for each of the last six pushes to `verdant-grow-diary`; its
  configured production-branch setting is `NOT_MEASURED`. The chain domain → project → deployment →
  commit → served stamp is closed by measurement (§4), with one gap: no team-wide enumeration
  confirmed this project as the apex's only holder (§4 step 1, `NOT_MEASURED` at A). Every link it
  read is **`PASS`**, `established fact` at the Appendix A instant; with that link unmeasured, the
  full chain is **`NOT_MEASURED`** until M2 runs.
- **Building a production deployment is not promoting it.** Seven hours after Appendix A, a
  production deployment of an unmerged PR-branch commit was created through a platform API token and
  took the apex for about 77 minutes, bypassing the merge queue and every repository gate. An
  owner-authorised Instant Rollback restored the deploy-branch build at 09:45 UTC. From then on,
  **every deploy-branch merge built a READY production deployment that did not receive the custom
  domains**: at 23:29 UTC the apex served `9b06be3f`, 13 first-parent commits behind the tip
  `c9bc1df3` (Appendix B). The founding measurement saw six production builds but observed only the
  newest one served (A.1), so automatic promotion was never established as standing behaviour. This
  amendment adds the **promotion axis** (§3), resolves what is served **per hostname** rather than
  from the newest production deployment (§4 step 3, M10), and makes
  every redeploy, promote, rollback or production-setting change a **publish action** with a
  recorded actor (D-RT-12, D-RT-13).
- **The publisher is not who the repository says it is.** `CLAUDE.md`, `docs/codebase-map.md`,
  `README.md`, `scripts/stamp-version.mjs`, `deployment-preview.yml` and `Makefile:77` all name
  Lovable as the production publisher. At the measured instant the apex is published by Vercel.
  Those statements were made under an earlier topology and are corrected in §6, without inventing
  a date for the change (`uncertainty`: the Vercel project was created 2026-09-01; when the apex
  moved to it is `NOT_MEASURED`).
- **A second publisher still exists.** The Lovable project `66255e7b-…` syncs the same branch to
  the same commit and reports `is_published: true`, audience `public`. The URL it publishes to is
  not returned by the tool: **`NOT_MEASURED`**. Two publishers of one branch is a hazard, and §7
  makes it a decision for Cheek.
- **`vercel.json` is production host configuration now.** The two redirects probed answer `308` on
  the apex and its headers are served (Appendix A.6); the other six redirects were not probed. The
  contract's §12 row that rejected treating it as production configuration rested on a measurement
  made under the other publisher; it is amended in this slice to the durable form.
- **GitHub Actions publishes no frontend or edge code.** It gates (35 required contexts in the
  2026-08-10 ruleset snapshot; the live ruleset is `NOT_MEASURED`), tags each deploy-branch push
  that carries no tag yet (`auto-tag-release`, with a `Tree-Hash:` annotation; §5.1), and probes
  the live host (§5.5). No workflow deploys the frontend or the edge functions (re-grepped at the
  tip: zero deploy steps). It **does** hold a production write path for the database: ten
  `workflow_dispatch`-only `apply-*.yml` workflows apply migrations to production when an operator
  runs them (§5.4), so an audit of production changes includes Actions runs.
- **Edge functions and the database stay `NOT_MEASURED` / `BLOCKED`.** No Actions path deploys
  edge functions; who does is not measured, and the Supabase tool attached to this session reaches
  only the sandbox project. Migrations reach production through an operator-dispatched workflow
  (§5.4); applied state belongs to `docs/agents/CURRENT_STATE.md` and stays `NOT_MEASURED` here.
- **`#1175`'s premise no longer reproduces.** Its fail-closed gate was justified by a live stamp of
  `ref: "__orphan__"` on 2026-08-28. The stamp served now carries `ref: "verdant-grow-diary"`,
  `dirty: false`, `commitSource: "git"`. The gate would pass on the measured publisher; its
  disposition is Cheek's (§11).

---

## 2. Requirements, assumptions, and the collision audit

### 2.1 Requirements carried from the assignment

| Requirement                                                               | How this document meets it                                                                                |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Source-grounded, Verdant-specific                                         | Every rule cites a repository path or a named platform read with its UTC time (Appendix A)                |
| Audit the deploy branch, not `main`                                       | Measured at `e1d541e2`, amended at `c9bc1df3`, both on `verdant-grow-diary`; `main` is not read           |
| Reuse merged architecture documentation                                   | Builds on contract §9, §12, §13, §14 and `docs/release-provenance-runbook.md`; amends, does not duplicate |
| Separate permanent architecture from CURRENT_STATE facts                  | §§3–9 durable; Appendix A dated and superseded; no `CURRENT_STATE.md` edit                                |
| Define rejected/deferred alternatives                                     | §14                                                                                                       |
| Produce only after active overlapping PRs resolve                         | `#1221` merged 2026-09-25 00:12 UTC; `#1175` is open but is a build-tooling change, not a topology claim  |
| No application code in the specification slice                            | Files touched are `docs/**` and `README.md` prose only (§12)                                              |
| Evidence standard `PASS / FAIL / BLOCKED / NOT_MEASURED / NOT_APPLICABLE` | Every check in §4, §5, §6 and Appendix A carries one                                                      |
| Do not infer production behaviour from repository presence or green CI    | §4's chain is platform and live reads; repository files are inputs, never proof (rule D-RT-2)             |

### 2.2 Assumptions, each with what breaks if it is wrong

- **A1.** The Vercel, Lovable and Supabase tools attached to this session read the owner's own
  accounts. `established fact` for Vercel (one team, `Verdant Grow Diary`) and Lovable (`get_me`
  returns the owner's workspace `Verdant`); `established fact` that the Supabase tool lists only the
  sandbox project `bzatgtgjvuojpoxcknaa`. If A1 were wrong the platform rows in Appendix A would
  describe someone else's project; the domain binding (A.3) and the served stamp (A.1) would still
  stand on their own, and they agree with the platform rows.
- **A2.** One attempt per read, at the stated time, nothing retried or routed around. If a read had
  been retried the "one instant" claim would be false; none was.
- **A3.** The committer date of a squash-merge commit is, to within seconds, the time the merge
  queue pushed it. `inference`. It is used only for the deployment-latency figures in Appendix A.4,
  which are informational; no rule depends on them.
- **A4.** Docs-only. Nothing in this slice changes what is built, published, deployed or applied.
- **A5.** The archived session that owned `#1699` will not push to it again, so carrying its two
  commits forward gives one lineage. If it is revived and pushes, the owner reconciles the two heads
  before either merges. `inference` from the session record (archived 02:01 UTC).

### 2.3 Collision audit — `established fact`, GitHub API at 01:19 UTC

**48 open PRs.** None is a release-topology specification and none adds
`docs/specs/release-topology-specification.md`. The ones that bear on this surface:

| PR      | State                                                                                         | Bearing on this slice                                                                                                                                                                                            |
| ------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `#1175` | open, `mergeable_state: unstable`, base `aabbd2b3` (stale), no reviewer named in its own body | Adds a fail-closed publish-provenance gate as the last `prebuild` step. An **input** to §11, not a competing topology claim. Not touched, not reviewed, not enqueued by this slice                               |
| `#1696` | open draft, restamps `docs/agents/CURRENT_STATE.md` on `08994aa8`                             | Carries "live `BLOCKED`" and "Release Topology Specification stays deferred: `#1175` and `#1221` are both still open". Both are superseded by this measurement and by `#1221`'s merge; handed to its owner (§15) |
| `#1683` | open draft, 82 files, adds one migration and edits an edge function                           | Bears on the edge and database axes (§5.3, §5.4): committed is neither deployed nor applied. No file overlap                                                                                                     |
| `#1250` | open, `HOLD` (standing lock)                                                                  | Migration-drift preflight detail. Untouched                                                                                                                                                                      |
| `#1355` | open, adds `.coderabbit.yaml`                                                                 | Changes the reviewer's configuration, not topology. The strict rule applies to whatever configuration CodeRabbit runs with                                                                                       |
| `#1643` | open, T1 snippet pins for the contract                                                        | Tests against `docs/architecture-contract.md` lines; this slice's contract edits are confined to §9 prose, §12, §13, §14 and §15.1, none of which `#1643`'s pins name by AC clause                               |

No competing implementation exists; none is created.

### 2.4 The amendment — carried forward, not re-implemented

`established fact`, GitHub API and `git`, 2026-09-25, read between about 23:05 and 23:35 UTC.

- **Why a new branch.** `#1699` was opened by Claude session `…HmR` on
  `claude/upbeat-davinci-1rf5ix`; that session has been **archived** since 02:01 UTC. Five
  owner-side self-checks on `#1699` (08:34, 11:52, 13:33, 20:25, 21:36 UTC) listed the amendments it
  needed. Nobody pushed them, and `#1705` then made `#1699` **conflict** with the tip in
  `docs/architecture-contract.md` (§15.1). The slice owner is still Claude. This amendment carries
  `#1699`'s two commits unchanged, forward-merges the tip `c9bc1df3`, and adds the amendments on
  top. It is **the same implementation continued**, not a second one. Exactly one of `#1699` and
  this PR should merge; closing `#1699` is Cheek's action (§15).
- **Conflict resolution.** Both §15.1 rows are kept: `#1705`'s `9b06be3f` re-verification first,
  then this slice's row. The pointer this slice rewrites sits inside AC-9.3, so contract §15 rule 2
  applies: the header is restamped at `4ddb2322` (the tip this branch carries after forward-merging
  `#1703`, whose hunks stayed disjoint from this slice's) and every touched clause re-verified. An
  earlier revision of this section said no AC clause changed; that was wrong (Codex on `#1718`).
- **Board at the amendment: 48 open PRs.** Every head was fetched as `refs/pull/N/head` and diffed
  against its merge-base with `c9bc1df3`. None besides `#1699` adds or edits
  `docs/specs/release-topology-specification.md`, and `git merge-tree` of this branch against each
  PR below is **clean**. The ones bearing on this surface:

| PR      | State at the amendment's read                                        | Bearing                                                                                                                                                                  |
| ------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `#1699` | open draft, head `cdc0559f`, base `e1d541e2`, **conflicts** with tip | Superseded by this carry-forward on merge; its commits are included unchanged                                                                                            |
| `#1696` | open, `CURRENT_STATE.md` restamp on `2f67a545`                       | Records the incident, the rollback and the unpromoted tip. **Sole writer of `CURRENT_STATE.md`**; this slice does not edit that file                                     |
| `#1703` | open, delivery lane for migration `20260924120000`                   | Edits `docs/codebase-map.md` §"Migration replay and appliers" (seven → ten appliers); this slice edits the same file at the `vercel.json` paragraph only. Disjoint hunks |
| `#1701` | open draft, delivery lane for `20260916111000`                       | Same file and same disjoint relationship as `#1703`. Database axis (§5.4): a delivery lane is an apply path, not an applied state                                        |
| `#1683` | open, 82 files, adds a migration and edits an edge function          | Edge and database axes (§5.3, §5.4); committed is neither deployed nor applied. No file overlap                                                                          |
| `#1175` | open, base `aabbd2b3`                                                | Unchanged input to §11                                                                                                                                                   |
| `#1643` | open, T1 snippet pins for the contract                               | Pins only the `sensorSourceRules.ts` cites and two T1 phrases, all unchanged by this slice's restamp (checked against its head). It pins no contract line number         |
| `#1250` | open, `HOLD`                                                         | Untouched                                                                                                                                                                |

- **The contract past its `9b06be3f` stamp — measured and restamped here.** Intersecting every
  path cited in `docs/architecture-contract.md` (177 distinct backticked paths with a file
  extension) with the 87 files that `git diff --name-only 9b06be3f 4ddb2322` lists finds three:
  - `config/required-status-checks.json` (`#1708`). AC-9.1's claim that the published-migration
    integrity check is neither required nor in `mustBeGreen` **still holds** (35 required, 7
    `mustBeGreen`, none of them that check).
  - `src/components/genetics/BreedingLogContainer.tsx` (`#1661`). AC-7.3 cited `:141` for the
    `create-breeding-suggestions` invocation; at `4ddb2322` that string is on **`:143`**, a T1
    failure the restamp re-points.
  - `docs/codebase-map.md` (`#1703`). Three lines inserted at `:289` moved AC-3.2's cite
    `:466-467` to **`:469-470`**, same text; the restamp re-points it.

  The contract's own §15.1 row records the restamp and every re-measured count (AT-6).

The collision audit the assignment asked for also covered work on signup and migration hardening
(`#1703` and `#1701` open; `#1704` merged), CI runners (`#1221` and `#1708` merged), Quick Log
remembered-target recovery and billing. No open PR changes `src/lib/entitlements/`, an
`ai_credit_*` path, `quickLogTargetResolutionRules` or a remembered-target file (path grep over all
48 diffs). None of this touches this document.

---

## 3. The topology model — six axes, one owner each

```text
  PR ──merge queue (squash, 35 required contexts)──▶ verdant-grow-diary tip
                                                          │
            ┌─────────────────────────────────────────────┼──────────────────────────────┐
            │ (A) GitHub Actions on push                   │ (B) Publishers that watch the branch
            │   auto-tag-release → v<date>-<sha> + Tree-Hash│   Vercel git integration → production
            │   quicklog-smoke, seo-monitoring (signals)    │     deployment for the apex domain
            │   NO deploy step (frontend or edge)           │   Lovable project sync → same commit,
            └───────────────────────────────────────────────│     publishes to an unmeasured URL
                                                            │
  (C) Build inside the publisher:  prebuild chain (package.json:9) → vite build (Nitro) → stamp
  (D) Edge functions:  supabase functions deploy — deployer NOT_MEASURED; no Actions path
  (E) Database:  supabase/migrations/** (append-only) → operator-dispatched apply workflows;
                 applied state NOT_MEASURED here (CURRENT_STATE axis)
  (F) Promotion:  which READY deployment each production hostname resolves to.
                  Git auto-assignment ─┐
                  promote / redeploy ──┼──▶ apex, www, verdant-grow-diary.vercel.app
                  instant rollback ────┘    (any platform token can move them; no repository gate)
```

**Building is not serving.** Axis (B) produces READY production deployments; axis (F) decides which
of them the production hostnames resolve to. They are separate. Appendix A observed six builds
and saw only the newest served (A.1); whether the five earlier builds were ever served was not
recorded. Appendix B observed one out-of-band promotion and then thirteen builds that (F) never
picked up.

| Axis                   | Owner of the truth                                                                              | Proof that counts                                                                                                    | Never counts as proof                                                                                          |
| ---------------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Source                 | The `verdant-grow-diary` tip, ruleset `20421416`, `config/required-status-checks.json`          | `git rev-parse origin/verdant-grow-diary`; the pinned required list                                                  | `main`; a green PR; a merged PR ("a merge is not a deployment")                                                |
| Frontend / SSR publish | The platform whose project holds the apex domain and whose deployment produced the served stamp | The §4 chain: domain binding → project ↔ repo → deployment ↔ commit → served `/version.json` inside the build window | `server:` headers alone; `vercel.json` presence; a vendor SDK; Make or script comments; tip-equals-live parity |
| Build                  | `package.json` `prebuild`/`build`/`postbuild` and the publisher's build settings                | The served stamp's fields; the publisher's build log where readable                                                  | The preset's default Nitro target (build target ≠ serving target)                                              |
| Edge functions         | Whoever runs `supabase functions deploy` against `knkwiiywfkbqznbxwqfh`                         | A read of the production project's function versions, or the deployer's own log                                      | The `Makefile:77` comment; the Lovable knowledge note; committed source                                        |
| Database               | The operator apply paths (`apply-*.yml`, §5.4) and Lovable-authored exports                     | `supabase_migrations.schema_migrations` on production, or the drift probe's output                                   | A merged migration file; a green `Published migration integrity` run                                           |
| Promotion              | The platform's alias records: which deployment each production hostname resolves to             | M10: resolve **each hostname** to its deployment; the team event log for the action and actor (M11)                  | "Newest production deployment"; a deployment's own `alias` array; a READY build; a merge; a green check        |

---

## 4. The measured chain for the frontend and SSR publisher

Each step names its read, its label, and its status. The values are in Appendix A; the method is
here. A future restamp re-runs the same steps in the same order.

| Step | Question the step answers                                                                  | Read (tool or command)                                                                                                                           | Label at A                                                                                                         | Status                                                                                          |
| ---- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| 1    | Which platform project holds the apex domain?                                              | Every team project's domain bindings, cross-checked with the served deployment's `projectId` (M2); DNS names the platform only                   | `established fact` for the candidate's verified binding; that it is the only holder is a `source claim` (A.3 note) | `PASS` for the binding; sole holder `NOT_MEASURED` at A                                         |
| 2    | Is that project bound to this repository?                                                  | Vercel `list_projects` filtered by this repository's URL; deployment `meta.githubOrg/Repo`                                                       | `established fact`                                                                                                 | `PASS`                                                                                          |
| 3    | Which deployment does **each production hostname** serve, and did it build the deploy tip? | Vercel `get_deployment <hostname>` for the apex, `www`, `verdant-grow-diary.vercel.app` and the project alias (M10); then git info for each      | `established fact`                                                                                                 | Apex and `www` `PASS` at A (A.1); both `vercel.app` aliases `NOT_MEASURED` at A; `FAIL` at B    |
| 4    | Are the served bytes that deployment's bytes?                                              | `GET https://verdantgrowdiary.com/version.json`; compare `commit` and `buildTime` with the deployment's `githubCommitSha`, `buildingAt`, `ready` | `established fact` for the fields; `inference` for attribution                                                     | `PASS` at A; `BLOCKED` at B                                                                     |
| 5    | Is this one publish or a standing behaviour?                                               | The previous N production deployments against the previous N deploy-branch tips, **and** which of them each hostname resolved to                 | `established fact`                                                                                                 | Builds `PASS` at A; promotion `NOT_MEASURED` at A for all but the newest; `FAIL` from 09:45 UTC |
| 6    | What triggered the observed deployments?                                                   | Deployment `source` (`git`) and `meta.githubCommitRef`; latency from commit to deployment                                                        | `established fact` + `inference`                                                                                   | `PASS`                                                                                          |

**Conclusion at the Appendix A instant.** The publisher of `verdantgrowdiary.com` is Vercel's Git
integration for project `verdant-grow-diary`. On the six observed production deployments the
trigger was a push to `verdant-grow-diary`; the project's configured trigger setting is
`NOT_MEASURED`. The builds ran inside Vercel (`ciRunId: null`, `commitSource: "git"`, real branch
ref). This satisfies contract
§14's rule — the publisher was **measured**, not read off a header — and it is exactly the kind
of statement §14 said must not live in the contract.

**Step 3 was the wrong question, and the amendment replaces it.** The founding chain asked for the
_newest_ production deployment. Twice on 2026-09-25 that returned a different deployment from the
one the apex served: after the 09:45 rollback the newest was the stale 08:28 redeploy, and from
12:03 onwards it was each new tip build that the custom domains never received. A deployment's own
`alias` array is not a substitute either: at 23:29 UTC the `9b06be3f` deployment still listed the
project alias, while resolving that hostname returned the `c9bc1df3` build (Appendix B.2). The only
reading that answers "what is served" is **hostname → deployment**, per hostname (M10). A split
between hostnames is itself a finding (D-RT-12).

**What the chain does not establish**, stated so silence is not read as agreement:

- The project's configured production branch. The tool does not return it; six consecutive
  production deployments with `githubCommitRef: verdant-grow-diary` make it an `inference`, not a
  reading. `NOT_MEASURED` as a setting.
- Which Nitro preset the Vercel build ran. The Lovable preset defaults Nitro to `cloudflare-module`
  (contract §14); Vercel reports the framework as `tanstack-start-lovable` and the deployment type
  as `LAMBDAS`. Something reconciles those two; what, is `NOT_MEASURED`.
- The project's build and install settings. `vercel.json:3-5` declares `bunVersion 1.x`,
  `bun install --frozen-lockfile` and `bun run build`; project settings can override a file, and the
  build log was not read. `NOT_MEASURED`.
- Whether the served bytes came from the deployment's build rather than a cache of an identical
  earlier build. The stamp's `buildTime` inside the deployment's `[buildingAt, ready]` window makes
  that an `inference` of high strength, not a byte comparison.

### 4.1 The second publisher

| Fact                                                                                                                                            | Label              | Status         |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | -------------- |
| Lovable project `66255e7b-892c-4be5-8686-ab1cfc3666db` exists in workspace `Verdant` and is the target of `vercel.json:16`'s `/~oauth` redirect | `established fact` | `PASS`         |
| Its `latest_commit_sha` equals the deploy tip and `last_edited_at` is 19 s after the merge commit — it syncs the branch                         | `established fact` | `PASS`         |
| It reports `is_published: true`, `publish_audience: public`                                                                                     | `established fact` | `PASS`         |
| The URL it publishes to                                                                                                                         | `missing evidence` | `NOT_MEASURED` |
| Whether it deploys edge functions on its publish (its knowledge note says "Publish deploys frontend + edge only")                               | `source claim`     | `NOT_MEASURED` |

**Rule (D-RT-4).** Two publishers watching one branch is a hazard, not redundancy: whichever holds
the apex serves growers; the other still builds, may still deploy edge functions, and can be
re-pointed at the apex by a DNS or domain change that no repository gate sees. This document does
not pick one. It records that the choice is open and gives it to Cheek (§7, §15).

---

## 5. The remaining axes

### 5.1 Source of truth and merge path — `established fact` at the tip

- Deploy branch `verdant-grow-diary`; `main` is divergent and never establishes production
  (`CLAUDE.md`, contract §9). Vercel's `git.deploymentEnabled` disables `main` and `master` only
  (`vercel.json:7-11`); the deploy branch is not named there, so the file does not suppress it. The
  six observed production deployments show it being deployed; whether the project's
  production-branch setting names it is `NOT_MEASURED` (§4). Whether `main` pushes are in fact
  suppressed was not observed (the deployment list was filtered to `target=production`):
  `NOT_MEASURED`.
- `config/required-status-checks.json`, the pinned mirror of ruleset `20421416`
  (`capturedAt: 2026-08-10`), lists 35 required contexts, all produced by `ci.yml` (`#1221` added
  `mustBeGreen` entries and `#1708` a seventh, leaving `required` at 35 — parsed at `c9bc1df3`).
  That is the snapshot, not the live ruleset: a live read needs an admin token (`:6-10`), so
  whether the ruleset still requires those 35 is `NOT_MEASURED` here, as contract AC-9.1 records.
  Merges are squash through the merge queue (`CLAUDE.md`, a `source claim`).
- **A merge produces a production build, not a promotion.** Everything in this subsection sits
  upstream of axis (F). Whether a merged tip is served is answered only by M10 (§5.7).
- `auto-tag-release.yml` runs on every push to `main` or `verdant-grow-diary` (`:15-17`) and tags
  the commit `v<yyyy>.<mm>.<dd>-<12-char SHA>` with a `Tree-Hash:` annotation (`:91-94`) **only when
  the commit carries no tag yet**. The annotation reads `unavailable` when hashing fails (`:55`);
  the tag is still pushed. A commit that already has any tag (manual, semver or an earlier
  run) exits successfully with neither a dated tag nor an annotation; only the run summary records
  its tree hash (`:58-72`). Tags exist for the last four deploy tips (Appendix A.7). A 64-hex
  annotation, the only form the resolver accepts (`scripts/resolve-release-provenance.mjs:70`), is
  the fast path from a served `treeHash` back to a commit when a stamp has no git identity;
  without one, `scripts/resolve-release-provenance.mjs` recomputes over a bounded window
  (`--scan`, default 30, `:41`), so an unannotated commit older than that window resolves as
  `NO_MATCH` (`docs/release-provenance-runbook.md`).

### 5.2 Build — `established fact` from source, `NOT_MEASURED` inside the publisher

- `prebuild` (`package.json:9`) runs, in order: `restore-env-production-from-head.mjs`,
  `assert-paddle-production-sandbox.mjs`, `verify-edge-shared-in-sync.mjs`,
  `check-no-src-lib-imports.mjs`, `stamp-version.mjs`. `build` is `vite build`; `postbuild` runs
  the SEO validators against `dist` (`:11-12`). `#1175` would append a sixth step (§11).
- `stamp-version.mjs` writes `public/version.json` and `src/generated/buildInfo.ts`, both tracked
  (`:11-15`, `:67`). It never exits non-zero for provenance reasons (`:41-42`). `commitSource` is
  `github-env` | `git` | `none` (`:148`); `ref` prefers `GITHUB_REF_NAME`, then
  `VERCEL_GIT_COMMIT_REF`, then the git ref (`:126-135`); `ciRunId` is `GITHUB_RUN_ID` or `null`
  (`:283`). A Vercel build (`:70-71`) changes `dirty` in one way only: the builder rewrites
  `vercel.json` before `prebuild`, so on Vercel `.vercel/` and `vercel.json` are excluded from the
  porcelain that decides `dirty` (`:109-113`, rationale `:96-103`). Beyond that exclusion the
  detection is diagnostic and never turns a dirty tree clean (`:165-171`). _Corrected at the
  amendment; the founding text said the detection was diagnostic only._
- **The tracked stamp is lineage, never identity** (`:37-39`, `:196-198`). At the tip,
  `public/version.json` still says `686fef4d`, `dirty: true`, from 2026-09-12 — 54 commits behind
  at `e1d541e2` (founding count; the amendment's clone is shallow and did not re-count it).
  That is expected: the file is overwritten inside the publisher's build, and its committed copy
  surfaces only as `inherited` (`trusted: false`) when a build has no git identity.
- `treeHash` covers `TREE_HASH_ROOTS` (`scripts/lib/tree-hash.mjs:43-70`): `src`, `public`,
  `supabase`, `scripts`, `config`, the four committed env files, `index.html`, `package.json`, both
  lockfiles, `vite.config.ts`, the tsconfigs, `tailwind.config.ts`, `postcss.config.js`,
  `components.json` and `eslint.config.js`. Docs, `e2e/`, and `.github/` do not move it, so one
  hash can name several commits.
- **Rule (D-RT-3).** The preset's Nitro target is the configured build target and says nothing
  about the serving target (contract §14). Record the two separately and never derive one from the
  other.

### 5.3 Edge functions — `NOT_MEASURED` deployer, `BLOCKED` state

- No workflow under `.github/workflows/` deploys edge functions. Re-grepped at `c9bc1df3` for
  `supabase functions deploy`, `supabase db push`, `supabase link`, `vercel deploy`,
  `vercel --prod` and the common deploy actions: the hits are two header comments in
  `mcp-local-rls-integration.yml:11-12` and two quoted instruction strings in
  `required-money-migrations.yml:124,201`. Seven workflows install the Supabase CLI
  (`supabase/setup-cli`), and all seven drive disposable local or replay stacks only; none runs
  `link`, `db push`, `functions deploy` or `--project-ref`. `established fact`.
- `package.json:20-21` and `:218` carry `deploy:functions`, `deploy:functions:all` and
  `sb:functions:deploy` (`supabase functions deploy`); `Makefile:77` carries `functions-deploy`
  with the comment "Lovable does this automatically". The comment is comment text (contract §9).
- `docs/lovable/verdant-project-knowledge-2026-08-18.md:33` says "Publish deploys frontend + edge
  only". That is a `source claim` about Lovable's publish. Whether Lovable's publish still runs for
  this project, and whether any edge deploy accompanies a Vercel deployment (Vercel has no Supabase
  deploy step in this repository), is `NOT_MEASURED`.
- The Supabase tool attached to this session lists only `bzatgtgjvuojpoxcknaa` (sandbox). Reading
  the production project's function versions through it is **`BLOCKED`**. The measurement that
  would close this axis is M6 (§8), run by someone holding production read access.
- **Rule (D-RT-8).** A frontend publish is never evidence of an edge deploy, and `#1683`-style PRs
  that change an edge function and the `_shared` mirror together are not deployed by merging.

### 5.4 Database — operator path, `NOT_MEASURED` applied state

- Migrations are append-only and immutable once merged (`AGENTS.md`); the `Published migration
integrity` gate compares SHA-256 against the base and is not a required context (contract
  AC-9.1, §13).
- **There are ten repository apply paths, not one.** At `c9bc1df3`, `.github/workflows/` held
  eight `apply-*.yml` workflows, each `workflow_dispatch`-only and each running in GitHub
  environment `verdant-production-solo-founder`: the general
  `apply-pinned-production-migrations.yml` and seven pinned single-purpose appliers
  (`action-queue-transition-forward-repair`, `agreement-acceptance-insert-forward-repair`,
  `candidate-number-maintenance-migrations`, `pinned-breeding-reconciliation`,
  `quicklog-corrections-retractions`, `quicklog-manual-delegate-forward-repair`,
  `signup-acquisition-forward-repair`). `#1703`, merged after, adds two more of the same shape
  (`plants-health-unassessed-default`, `quicklog-revision-idempotent-replay`: each
  `workflow_dispatch`-only in the same environment, `:4` and `:140`), for ten at `4ddb2322`;
  `#1701` proposed another at the amendment's read. The founding text named only the first;
  `established fact` by listing.
- The general apply path is `apply-pinned-production-migrations.yml`: `workflow_dispatch` with
  `expected_head_sha`, `confirm_project_ref` (must equal `knkwiiywfkbqznbxwqfh`, `:59`) and
  `confirm_apply`; it runs in GitHub environment `verdant-production-solo-founder` (`:73`) with the
  `SUPABASE_DB_URL` secret (`:94-95`) and executes `scripts/apply-pinned-production-migrations.mjs`
  (`:113`). `migration-drift-probe.yml` is the read-only counterpart (`workflow_dispatch`,
  environment `verdant-production`, `psql`). `supabase/config.toml:1` pins the same project ref.
- Lovable authors migrations under its own naming (157 UUID-slug exports in the ledger per
  `docs/codebase-map.md:419-423`) and, as a `source claim`, applies what it authors through its
  Cloud. Nothing in this repository shows that path.
- Applied state on production is a `docs/agents/CURRENT_STATE.md` axis (contract AC-9.3) and stays
  `NOT_MEASURED` here; through this session's Supabase tool it is `BLOCKED` (sandbox only). The
  standing locks hold: **No APPLY. No production SQL.**

### 5.5 Live-host and independently targeted signals — never gates

| Workflow             | Trigger at the tip                                                                                                                                                           | What it can say                                                                                                                                                                                                                        |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `quicklog-smoke.yml` | `push`/`pull_request` on `verdant-grow-diary`, path-filtered to `e2e/**`, `playwright.config.ts` and itself; dispatch (`:50-106`). A `pull_request` run precedes publication | Authenticated smoke against `vars.E2E_BASE_URL` (`:482`; documented as preview-or-staging, `:24`), not a pinned host. Only the `one_tent_proof` dispatch pins `verdantgrowdiary.com` (`:117-126`). `blocked` without owner credentials |
| `seo-monitoring.yml` | `workflow_run` after `ci` on `verdant-grow-diary` (`:23-26`); dispatch                                                                                                       | Public-surface probes of `verdantgrowdiary.com`, timed by `ci`, not by the publisher — the host may lag the tip (§5.7)                                                                                                                 |
| `lighthouse-ci.yml`  | daily `cron`, dispatch (`:13-17`)                                                                                                                                            | Performance of the live host, not of a commit                                                                                                                                                                                          |
| `test:legal-seo`     | required context; Vitest over source (`package.json:101`)                                                                                                                    | Nothing about production — the Playwright probe is `test:legal-seo:e2e`, not required                                                                                                                                                  |

**Rule (D-RT-10).** A live-host signal (`seo-monitoring.yml`, `lighthouse-ci.yml`, the
`one_tent_proof` dispatch) probes whatever `verdantgrowdiary.com` serves when it runs. None waits
for the publisher: `seo-monitoring.yml` fires when the `ci` workflow completes (`:22-26`) and
`lighthouse-ci.yml` on a daily cron, so a green result can describe the previously served build, or
a build that was never the merged commit (it reads the host, not the commit). An independently
targeted run
(`quicklog-smoke.yml` on `push`/`pull_request`, against whatever `vars.E2E_BASE_URL` names) says
nothing about production. Either informs a restamp; neither certifies a release.

### 5.6 Previews — `established fact` where stated

- The Vercel project builds non-production deployments as well (`latestDeployment.target: null` at
  01:14:20 UTC, four minutes after the production one). `inference`: pull-request and branch
  previews. Deployment protection is SSO for everything except custom domains (`ssoProtection:
all_except_custom_domains`), so preview URLs are not public while the apex is.
- `deployment-preview.yml` certifies buildability and mirror consistency for the **Lovable** preview
  and says publishing is "a manual action from the Lovable UI" (`:4-12`). That comment describes the
  Lovable path only.
- `docs/preview-deployment-verification.md` names a Vercel project `verdant-command-center-preview`
  with npm commands and an `/index.html` rewrite. That project did not appear in the repository-URL
  filtered listing; whether it still exists is `NOT_MEASURED` (a team-wide listing was not
  requested). The document predates SSR and is a retirement candidate (§14).

### 5.7 Promotion — which build the production hostnames serve

This axis was missing from the founding text. The 2026-09-25 incident (Appendix B) is its worked
example. Every bullet is `established fact` from Vercel reads unless labelled.

- **Four ways a deployment reaches the production hostnames, and only one can pass a repository
  gate.**
  1. _Git auto-assignment_: a push to the deploy branch builds a production deployment, and the
     platform assigns the production domains to it when auto-assignment is in effect. For a merge
     through the queue, the queue and its required contexts (35 in the pinned snapshot) sit
     upstream of this path; a direct push to the deploy branch takes the same path with no gate,
     which is why M4 checks merge-queue provenance and treats such a tip as out-of-band.
  2. _Promote or redeploy_: any READY deployment, including a preview built from an unmerged PR
     branch, can be made production through the dashboard, the CLI (`vercel promote`,
     `vercel --prod`) or the REST API. No repository gate is involved; the authority is whatever
     platform credential issued the call.
  3. _Instant Rollback_: the production domains move to an earlier production deployment. Also no
     repository gate.
  4. _Manual alias assignment_ (`vercel alias set`) and domain moves: the same class as 2 and 3.
- **The event log distinguishes the actor classes.** In the two windows read (B.3), the
  Git-integration deployment events carry no token identifier and no `via` application. The 08:28:39
  UTC production deployment of PR-branch commit `7053af8f` carried an **API-token identifier and no
  `via` application**. The 09:45:15 UTC `instant-rollback-created` event carried
  **`via: Claude.ai`**, a different token, and the reason text "Owner-authorized rollback …". Every
  event records the owner's Vercel identity as the principal, so the principal alone never
  identifies the actor (Appendix B.3). The identifier values themselves are deliberately not
  recorded here (AT-10).
- **The same token that promoted the PR build also changed production settings.** Within 90 seconds
  it enabled Skew Protection (08:28:52) and disabled "include files outside root directory"
  (08:29:43). At 08:26:14 it had attached the project to a GitHub connector for all environments.
  A production-setting change is a publish action in its own right (D-RT-13).
- **Who held that token is `NOT_MEASURED`.** The event's `github_login` attribution is
  `cursoragent`, but that is the **author of the commit being deployed**, not proof of the caller.
  `#1696` records the actor as the Cursor agent, which stays a `source claim` here.
- **After the rollback, auto-assignment stopped taking effect.** Thirteen consecutive deploy-branch
  merges, from `c10c095e` at 12:03 UTC to `c9bc1df3` at 23:17 UTC, each built a READY
  production-target deployment from `verdant-grow-diary`. None received the apex, `www` or
  `verdant-grow-diary.vercel.app`, and all three still resolved to the `9b06be3f` rollback target
  at 23:29 UTC. `list_promote_aliases` reported all three `pending`. The effect over thirteen
  builds is `established fact`. That an Instant Rollback pauses auto-assignment until an explicit
  promote is `inference`: Vercel's documentation searched for this amendment describes
  `promote`, `rollback` and `--skip-domain` but did not state the pause.
- **Skew Protection changes what a rollback ends.** With it enabled, a client that already loaded
  one deployment's assets keeps being served from that deployment for the configured window, so a
  rollback or promote stops _new_ loads of the old build, not necessarily sessions already open.
  The effect is a `source claim` from Vercel's product description; the configured window is
  `NOT_MEASURED`.
- **Rule (D-RT-12), (D-RT-13), (D-RT-14)** — §7.

---

## 6. Corrections to repository statements

Two kinds of correction. **§6.1** corrects the assumptions the assignment lists as "non-negotiable
conclusions to verify from source". The assignment calls that list the Optimal Tech Stack
Evaluation; no file in the repository carries that title (`grep -rlI "Optimal Tech Stack"` at the
tip returns nothing), so the corrections are made against the listed conclusions themselves.
**§6.2** corrects repository text that the topology measurement contradicts.

### 6.1 The evaluation's conclusions — rows 1–10 verified from source at `c9bc1df3`

The founding text left five of these rows as `source claim` because they were carried from the
contract. The assignment says to verify them from source rather than assume them, so the amendment
re-read each one in the `c9bc1df3` blobs (`git show c9bc1df:<path>`). "Source" here means the
repository, and the claim covers **rows 1–10 only**: none of them says anything about what
production runs. Rows 11–14 are production assertions; they rest on §4, §5.7 and the appendices,
not on source, and cite those instead.

| #   | Conclusion                                                                                                  | Status                     | Evidence at `c9bc1df3`                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --- | ----------------------------------------------------------------------------------------------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | TanStack Start SSR, TanStack Router, Vite, Nitro                                                            | `PASS`                     | `src/server.ts:14` (Start server entry), `src/start.ts:28` (`createStart`), `src/router.tsx:2` (`createRouter`); `package.json:365-366` (Router, Start), `:426` (`nitro` `3.0.260603-beta`), `:431` (`vite`); resolved `bun.lock:722` Start 1.168.34, `:720` Router 1.170.18, `:2040` Vite 8.2.0, `:1638` Nitro. Nitro reaches the build through the Lovable preset (`vite.config.ts:4,12`; contract AC-1.4)                                                                                 |
| 2   | React 19, Tailwind 4, shadcn/Radix, TanStack Query current                                                  | `PASS`                     | `package.json:380,382` React `^19.2.0` → `bun.lock:1764,1768` 19.2.8; `package.json:388,363` Tailwind `^4.2.1` → `bun.lock:1934,702` 4.3.3; `src/styles.css:1` CSS-first import; `components.json:3` `new-york`; 27 direct `@radix-ui/*` dependencies (`package.json:334-360`); `package.json:364` Query `^5.101.1` → `bun.lock:718` 5.101.4                                                                                                                                                 |
| 3   | Supabase Postgres, Auth, RLS, RPC and Edge Functions current                                                | `PASS` in source           | `package.json:362` → `bun.lock:668` supabase-js 2.111.0; `src/integrations/supabase/client.ts:6,18` (client, `sessionStorage`); 34 function directories besides `_shared`; 284 migrations, 93 of them enabling RLS (case-insensitive match); `src/hooks/useHasRole.ts:35` (`.rpc("has_role")`); `supabase/config.toml:1` project ref. Applied schema and deployed functions stay `NOT_MEASURED` (§5.3, §5.4)                                                                                 |
| 4   | Bun canonical; npm compatibility may remain                                                                 | `PASS`                     | `bun.lock:2` present, **no `bun.lockb`**, `package-lock.json:4` present; `bunfig.toml:2,4`; `scripts/check-bun-lockfile-policy.mjs:5` ("Bun and bun.lock are canonical"), `:53` forbids `bun.lockb`; `config/dependency-lockfile-transition.json:3,5`. `CLAUDE.md:77` still calls `bun.lockb` authoritative: stale (§6.2)                                                                                                                                                                    |
| 5   | AI Doctor inference through the Lovable AI gateway                                                          | `PASS`                     | `supabase/functions/ai-doctor-review/index.ts:65` (`GATEWAY_URL`), `:307` (`LOVABLE_API_KEY` read server-side), `:502` (fetch)                                                                                                                                                                                                                                                                                                                                                               |
| 6   | Server-pinned model selection                                                                               | `PASS`                     | same file `:66` (`MODEL`), `:69` (`MODEL_TIER`), `:510` (`model: MODEL`), `:282-284` (user from `auth.getUser()`), `:13` (the server-side rule). The pinned value is dated evidence; the invariant is contract AC-5.2                                                                                                                                                                                                                                                                        |
| 7   | Validated tool output, credit and idempotency controls, evidence receipts, no Action Queue or device writes | `PASS`                     | Forced tool `:515,518`; `JSON.parse` `:575`, `validateAiDoctorReviewResult` `:581`, grounding `:586`; `ai_credit_spend` `:382` with `p_idempotency_key` `:388`, refund `:405,408`; receipt `:364`, `ai_doctor_finalize_review` `:595,599`. Prohibition `:8-9`. In that file, `action_queue`, `device` and `sensor_readings` occur only in the `:8-9` comment, and there is no `.insert(`, `.upsert(`, `.update(` or `.delete(`                                                               |
| 8   | Canonical sources `live/manual/csv/demo/stale/invalid`; vendor and transport are provenance                 | `PASS`, two known limits   | `src/lib/sensor/sensorSourceRules.ts:16` (`SENSOR_SOURCES`), `:82` (unknown → `invalid`); `src/constants/sensorIngestProvenance.ts:15,26,39`; webhook keeps vendor and transport in `raw_payload` (`storageMapping.ts:161,177`). Limits, both already contract clauses: `pi_bridge` → `live` (`sensorSourceRules.ts:28`, AC-4.4), and the generic webhook maps an unknown label to the **candidate** `live` (`storageMapping.ts:71,77`), later narrowed by confidence and freshness (AC-4.2) |
| 9   | VPD EWMA exists                                                                                             | `PASS`                     | `src/lib/vpdDriftRules.ts:56` (α `0.3`), `:57` (minimum 6 readings), `:65` (out-of-range α falls back), `:86` (the recurrence). α is documented, not test-pinned (contract AC-10.1, T6)                                                                                                                                                                                                                                                                                                      |
| 10  | Modified Z-Score / MAD and Nelson Rules not implemented                                                     | `PASS`                     | `git grep -i -P` over `src/` and `supabase/` at `c9bc1df3`: zero hits for each of `nelson`, `modified z`, `modifiedZ`, `median absolute deviation`, `\bMAD\b`, `z-?score`, `zscore`, `robust ?z`. Must never be described as implemented (contract AC-10.2)                                                                                                                                                                                                                                  |
| 11  | **Lovable Cloud is the production publisher** (wherever the evaluation says "Lovable")                      | **`FAIL`**                 | §4: Vercel's Git integration published the apex at the Appendix A instant; §5.7: promotion is a separate axis. Lovable remains a second, unmeasured publisher (§4.1)                                                                                                                                                                                                                                                                                                                         |
| 12  | **`vercel.json` is inert in production**                                                                    | **`FAIL`**                 | A.6: `/strains` → `308 /cultivars`, `/terms-of-service` → `308 /terms`, and the five `vercel.json:33-42` headers served on `/`                                                                                                                                                                                                                                                                                                                                                               |
| 13  | The Nitro build target is Cloudflare, therefore production is served on Cloudflare                          | `FAIL` as an inference     | Contract §14; the deployment type is Vercel `LAMBDAS` (A.4, and every Appendix B read). Which preset the Vercel build ran is `NOT_MEASURED`                                                                                                                                                                                                                                                                                                                                                  |
| 14  | **A merge to the deploy branch goes live**                                                                  | **`FAIL`** since 09:45 UTC | §5.7 and Appendix B: thirteen merges built READY production deployments and none reached the production hostnames. A merge is not a deployment, and a production build is not a promotion                                                                                                                                                                                                                                                                                                    |

### 6.2 Repository text contradicted by the measurement

| File and lines                                                  | Statement                                                                                                                  | Status         | Correction and owner                                                                                                                                 |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CLAUDE.md:130`                                                 | "**Lovable is the production publisher**"                                                                                  | `FAIL`         | Governance file: one of the twelve; all twelve bump `Sentinel-Version` together. **Deferred** to its own slice (§14). Until then, read it against §4 |
| `CLAUDE.md:138-144`                                             | "`vercel.json` does not govern production … Never reason about production redirect or header behaviour from `vercel.json`" | `FAIL`         | Same slice. The durable form is D-RT-5: a host file governs when the measured publisher applies it                                                   |
| `CLAUDE.md:77`                                                  | "`bun.lockb` authoritative"                                                                                                | `FAIL`         | Same governance slice. The tree has `bun.lock` and no `bun.lockb`, and the lockfile policy forbids `bun.lockb` (§6.1 row 4; contract AC-8.1)         |
| `README.md:67`                                                  | "`bun.lockb` is authoritative"                                                                                             | `FAIL`         | **Amended in this slice** (not a governance file): the README now names `bun.lock`                                                                   |
| `docs/architecture-contract.md` §12                             | "Treating `vercel.json` as production configuration — REJECTED — measured as not applied"                                  | `FAIL`         | **Amended in this slice** to the durable form; §15.1 records why                                                                                     |
| `docs/architecture-contract.md` §9 prose, §13 row, §14 pointers | "release topology deferred — #1221 / #1175"                                                                                | stale          | **Amended in this slice** to point here                                                                                                              |
| `docs/codebase-map.md:87-93`                                    | "Those redirects do not fire in production. Lovable is the production publisher …"                                         | `FAIL`         | **Amended in this slice** to the durable rule and a pointer; the eight-entry inventory is kept                                                       |
| `README.md:88`                                                  | "SSL/TLS certificates are managed by the Lovable hosting platform"                                                         | `FAIL`         | **Amended in this slice**: certificates belong to whichever platform the measured apex binding names                                                 |
| `scripts/stamp-version.mjs:23-26`                               | "the production publisher (Lovable) sometimes builds from a history-less snapshot"                                         | stale comment  | A script edit with test pins nearby; **deferred** (§14). The observation it records (2026-08-05) stays true as history                               |
| `.github/workflows/deployment-preview.yml:4-12`                 | "Publishing to Lovable's published URL is a manual action from the Lovable UI"                                             | partial        | True of the Lovable path only. Workflow file; **deferred**                                                                                           |
| `Makefile:77`                                                   | "Lovable does this automatically"                                                                                          | `NOT_MEASURED` | Comment text (contract §9). **Deferred** with the script comment                                                                                     |
| `docs/preview-deployment-verification.md:3-8, 14-27`            | preview-only Vercel project `verdant-command-center-preview`, npm, `/index.html` rewrite                                   | stale          | Retirement candidate (§14); not edited here                                                                                                          |
| `docs/seo/lighting-launch-verification.md:157-161`              | "redirects … return HTTP 200 … Lovable is the production publisher"                                                        | dated          | Generated 2026-08-02; historically consistent with contract §14's earlier measurement. Left as a dated record                                        |
| `docs/lovable/verdant-project-knowledge-2026-08-18.md:33`       | "Publish deploys frontend + edge only"                                                                                     | `source claim` | Dated Lovable knowledge snapshot; left, and cited as a claim in §5.3                                                                                 |
| `.github/workflows/lighthouse-ci.yml:4-6`                       | "Verdant publishes locally from Windows"                                                                                   | stale comment  | Found at the amendment. Contradicted by §4 and Appendix B. Workflow file; **deferred** with the other stale comments                                 |
| `.github/workflows/auto-tag-release.yml:86-87`                  | "Production builds may lack git context (history-less Lovable snapshots …)"                                                | dated          | Found at the amendment. True of the Lovable path; the measured Vercel builds carry git identity (A.1). Tagging is unaffected; comment **deferred**   |
| `docs/agents/CURRENT_STATE.md:186`                              | "Release Topology Specification stays deferred: `#1175` and `#1221` are both still open"                                   | stale          | `#1221` merged; this document exists. **Handed to `#1696`'s owner** (§15); not edited here                                                           |

---

## 7. Architecture decisions

Durable. Each is a rule a future slice can be held to; none carries a date.

- **D-RT-1 — One source.** Production is built from the `verdant-grow-diary` tip and nothing
  else. A build that reports a different `ref` or a `commit` not on that branch is a finding, not
  a variant.
- **D-RT-2 — Topology is measured or it is `NOT_MEASURED`.** Repository files (`vercel.json`, the
  preset, comments, scripts, SDK dependencies) are inputs to the measurement, never its result.
  Green CI and a merged PR say nothing about what is served (contract §14, restated).
- **D-RT-3 — Build target and serving target are recorded separately.** The Nitro preset the build
  ran with and the platform that serves the output are two readings. Neither is derived from the
  other.
- **D-RT-4 — A second publisher is a hazard until retired or fenced.** Any platform that syncs the
  deploy branch and can publish must be either (a) retired from publishing, or (b) bound to a
  non-production URL and recorded as such in `docs/agents/CURRENT_STATE.md`. Choosing between (a)
  and (b) for Lovable is Cheek's decision; this document does not make it.
- **D-RT-5 — A host configuration file governs when the measured publisher applies it.** While
  Vercel serves the apex, `vercel.json` is production configuration: reviewed like one, and
  measured after each change (M7). The contract's §12 row now says this in its durable form.
- **D-RT-6 — What is live is proved by what is served, never by what was built.** The primary proof
  is `/version.json` on the apex, read at a stated instant, with `commit`, `dirty`, `commitSource`,
  `ref`, `buildTime` and `treeHash` recorded. When session egress blocks that read, the
  hostname → deployment reading of M10 is the platform-side proof, and the stamp stays `BLOCKED`,
  not inferred. A stamp with `commitSource: "none"` is resolved through `treeHash` and the tag
  annotations (`docs/release-provenance-runbook.md`), never through `inherited`.
- **D-RT-7 — Tags are the provenance anchor, not the release.** A dated `auto-tag-release` tag
  proves that a push reached GitHub and records its `Tree-Hash`, or `unavailable` when hashing
  failed. A commit that already carried a tag gets neither (§5.1). Without a 64-hex annotation the
  tree hash is recoverable only through the resolver's bounded rescan, and outside that window it
  resolves as `NO_MATCH`. No tag proves anything about a
  publish.
- **D-RT-8 — Edge functions are a separate release.** No frontend publish implies an edge deploy.
  Until M6 is run by someone with production read access, the edge axis stays `NOT_MEASURED` and
  release notes say so.
- **D-RT-9 — Migrations reach production through operator apply paths, and every path counts
  until it is measured or retired.** Committed is not applied. The repository-verified paths are
  the dispatch workflows with their confirmations (§5.4 lists ten). The Lovable Cloud apply path
  for Lovable-authored exports is a `source claim`, neither measured nor fenced, so an audit of
  production database changes includes it until Cheek retires or fences it and a measurement
  confirms that (the D-RT-4 decision, applied to the database axis). `No APPLY` is the standing
  lock until Cheek lifts it.
- **D-RT-10 — Live-host probes are signals.** They inform a restamp and never gate a merge or
  certify a release.
- **D-RT-11 — Dated values never enter a durable document twice.** They live in
  `docs/agents/CURRENT_STATE.md`; this document's Appendix A is the founding measurement and is not
  updated in place — a later measurement is a stamp, not an edit here. Appendix B is not an update
  of A: it records a separate event that the durable rules below were written from.
- **D-RT-12 — Serving is resolved per hostname, and a split is a finding.** Every production
  hostname in the current inventory — the domains M2 returns and the project's production aliases,
  never fewer than the apex, `www`, `verdant-grow-diary.vercel.app` and the project alias — is
  resolved to a deployment (M10).
  "Newest production deployment" and a deployment's own `alias` array are never used as the
  answer. If the hostnames resolve to different deployments, or the apex resolves to anything
  other than a `source: git` build of the current deploy tip, the release state is **`FAIL`**
  until the owner closes it, and every `CURRENT_STATE.md` stamp says so.
- **D-RT-13 — Every change to what production serves is a publish action.** A promote, redeploy,
  Instant Rollback, manual alias assignment, domain move, or production-setting change (Skew
  Protection, build settings, connectors, auto-assignment) needs the same authority as Publish.
  An agent session issues one only on the owner's explicit instruction for that action, records
  the action, the deployment IDs, the actor class and the reason in its report, and the next
  `CURRENT_STATE.md` stamp records the same. The 09:45 rollback is the model: owner-instructed,
  reason text on the event, confirmed by per-hostname reads afterwards. The 08:28 promotion is the
  counter-example: no owner instruction found in this slice's reads, no reason text, and a
  PR-branch commit.
- **D-RT-14 — A production-scoped platform credential is a publish path.** Any token that can
  promote, redeploy, roll back or change project settings is part of the release topology, like a
  publisher. Which sessions and agents hold one is a topology fact. The owner records it and scopes
  or revokes it; this document cannot measure it (§10). Until it is recorded, D-RT-13 is held by
  convention only.

---

## 8. Measurement procedures

Each procedure names what it proves, how, and the status it reports when it cannot run. A restamp
that cites this document runs M1–M5 and **M10** at minimum and records M6–M9 and M11 as `BLOCKED`
(no access), `SKIPPED` (deliberately not run, with the reason) or `NOT_MEASURED` when it does not
run them. M4 alone never answers "what is served": since the
amendment it answers "what was built", and M10 answers "what is served".

**Windows resume from the last successful read.** Where a procedure reads "since the last stamp"
(M4's `<last>` and deployment window, M11's event window), the boundary is the last stamp at which
**that procedure** ran, not the last stamp of any kind. A stamp that records the procedure
`BLOCKED`, `SKIPPED` or `NOT_MEASURED` does not move its boundary, so the next successful run covers
the whole gap. Each stamp records the boundary and the cursor or time each windowed procedure used.

| ID  | Proves                                        | How                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | If it cannot run                                                                                                                                                               |
| --- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| M1  | What is served                                | `GET https://verdantgrowdiary.com/version.json` once; record UTC time, HTTP status, `commit`, `ref`, `dirty`, `commitSource`, `buildTime`, `treeHash`, `ciRunId`, and the `server`/`x-vercel-id` headers as observations                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | `BLOCKED` (egress)                                                                                                                                                             |
| M2  | Which project holds the apex                  | Enumerate the domain bindings of **every** project in the team (`list_projects`, then `list_project_domains` per project); the holder is the project that lists the apex as verified. Cross-check it against the `projectId` of the deployment that `get_deployment verdantgrowdiary.com` returns (M10). More than one verified holder, or a holder that disagrees with the served deployment's `projectId`, is a measured topology defect: `FAIL`, for the owner. No holder anywhere in the team is `NO_DATA`. Either way the chain stops at step 1. DNS `A`/`CNAME` for apex and `www` identifies the serving platform, never the project                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | `BLOCKED` (no account access)                                                                                                                                                  |
| M3  | Project ↔ repository                          | Vercel `list_projects` with `repoUrl = https://github.com/Verdant-OS/verdant-grow-diary`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | `BLOCKED`                                                                                                                                                                      |
| M4  | What was built, and the trigger               | List the deploy-branch first-parent commits since the last stamp (`git rev-list --first-parent <last>..<tip>`) and the Vercel `list_deployments` rows (`target=production`) created since the last stamp. **Missing builds:** each listed tip needs a READY build from `verdant-grow-diary`; a tip without one is a missing build. **Every row is classified** by `source`, `githubCommitRef` and ancestry: a `source: git` row from `verdant-grow-diary` whose commit is on the deploy branch's first-parent history is a normal build, even when its commit predates the window (a delayed build of `<last>`); any other row is an out-of-band publish (M11). **Provenance:** each listed tip must also be the merge commit of a merged PR (GitHub `commits/{sha}/pulls`, or the merge queue's record); a tip without one is a direct push that bypassed the merge queue, and its build is out-of-band (M11) even though it is `source: git` on the deploy branch. **Carry-forward:** a tip whose build was not READY at the last stamp (queued, building, errored or missing) is listed again in this run, its deployment is re-queried by commit SHA, and the deployment query starts at the earliest such tip's push rather than at the stamp, so a build that finished after the stamp is still observed. Answers "was every tip built", not "what is served" | `BLOCKED`                                                                                                                                                                      |
| M5  | The second publisher's state                  | Lovable `get_project 66255e7b-…`: `latest_commit_sha`, `is_published`, `publish_audience`, and — when the tool exposes it — the published URL                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | `BLOCKED` when the project cannot be read (no account access); `NOT_MEASURED` for the URL when a readable response omits it                                                    |
| M6  | Deployed edge-function versions on production | Supabase `list_edge_functions` against `knkwiiywfkbqznbxwqfh` (per-function `version`/`updated_at`), or the deployer's own log                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | `BLOCKED` when only the sandbox is reachable                                                                                                                                   |
| M7  | `vercel.json` in effect                       | `HEAD` on **every** permanent redirect source in `vercel.json:19-26` (`/strains`, `/features`, `/demo`, `/refunds`, `/refund-policy`, `/terms-of-service`, `/privacy-policy`, plus one sample under `/strains/:slug`), each expecting `308` and its declared `Location`; then `HEAD /` for the five headers of `vercel.json:33-42`; then `HEAD /unsubscribe`, with no query parameters, for the three headers of its rule (`:46-53`); then `HEAD` one existing `/assets/…` file for the `Cache-Control` of `:54-57`. `PASS` only for what was probed: a partial run names the paths and rules it covered, and the rest stay `NOT_MEASURED`. The SPA rewrite at `:28` is not probed by M7 and stays `NOT_MEASURED` here. The `/~oauth/*` redirect is excluded as an auth surface (§10)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | `BLOCKED` (egress)                                                                                                                                                             |
| M8  | Tag anchor for the tip                        | `git ls-remote --tags origin`, keeping lines whose SHA (the peeled `^{}` line for an annotated tag) is the tip's, once that push's `auto-tag-release.yml` run has finished. `PASS` for the anchor when a tag points at the tip. `ls-remote` shows object IDs only, so read the tag's message by fetching the tag object (`git fetch origin tag <tag>`, then `git cat-file -p <tag>`) or through the GitHub tag API; without that read the fast-path status is `NOT_MEASURED`. The provenance fast path is usable only when the dated tag's `Tree-Hash:` line is 64 hex, the only form the resolver accepts (`resolve-release-provenance.mjs:70`). A `Tree-Hash: unavailable` line (written when hashing fails, `auto-tag-release.yml:55`) or a tag that pre-dated the run (`:58-72`, no line at all) is recorded as a degraded fast path whose `treeHash` link depends on the resolver's scan window (§5.1). No tag at the tip is `FAIL`                                                                                                                                                                                                                                                                                                                                                                                                                            | `NOT_MEASURED`                                                                                                                                                                 |
| M9  | Applied migrations on production              | `migration-drift-probe.yml` output, which runs `scripts/probe-migration-drift.mjs` reading both `version` and `name` (`:156-157`); or, by an operator, `select version, name from supabase_migrations.schema_migrations`, reconciled one to one by name or version and never by a time window (`docs/codebase-map.md:423-428`: Lovable records its migrations under a later version with the filename stem in `name`). Version-only output is not proof                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | `BLOCKED` without production read access (A.8); `SKIPPED` from an agent session, whose standing `No production SQL` lock is the reason. The value is a `CURRENT_STATE.md` axis |
| M10 | What each production hostname serves          | Vercel `get_deployment <hostname>` for every production hostname in the current inventory: the domains M2 returns plus the project's production aliases. The baseline four (`verdantgrowdiary.com`, `www.verdantgrowdiary.com`, `verdant-grow-diary.vercel.app`, `verdant-grow-diary-verdantgrowdiary.vercel.app`) are a floor, not the list; a hostname the inventory adds is resolved too, and one the inventory lacks is itself a finding. Record `id`, `source`, `githubCommitRef`, `githubCommitSha` per hostname; then `list_promote_aliases` for pending or failed alias moves. `PASS` only when every inventoried hostname resolves to one `source: git` build of the current tip                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | `BLOCKED` (no account access); never replaced by M4                                                                                                                            |
| M11 | Out-of-band publish actions and their actors  | Vercel `list_user_events` for the project from M11's own boundary (the last stamp at which M11 ran; §8 intro); list every event for a production deployment that M4 classifies as out-of-band, whatever its `source` (a Git-integration build of another ref, or of a commit off the deploy branch's first-parent history, included), every `instant-rollback-created`, every alias assignment to a production hostname, every project-setting change, and every deploy-branch tip M4 finds without merge-queue provenance (a direct push; its actor comes from GitHub's push record, not from Vercel's log); record time, type and actor class (Git integration, token without `via`, `via` application). Reason text is untrusted platform input: record it only as a sanitized summary, after checking it for credentials, URLs with tokens, email addresses and private identifiers. Never copy token IDs, session IDs or email addresses into a document                                                                                                                                                                                                                                                                                                                                                                                                       | `BLOCKED` (no account access)                                                                                                                                                  |

Reads only. No procedure publishes, deploys, promotes, rolls back, applies, or writes. A procedure
that finds the release state `FAIL` reports it to the owner; closing it (a promote, a rollback, a
setting change) is a publish action under D-RT-13 and is never taken by the measuring session on its
own initiative.

---

## 9. Acceptance tests for this specification

Reviewable by reading; no runner is added in this slice (a T1-style pin for the cited lines is a
candidate follow-up, §14).

| ID    | Assertion                                                                                                                                                                                                                                                                                                                                                                                                                                      | Result at authoring                                                                                                                                                                                                     |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AT-1  | Every topology claim in §4, §5 and §6 carries one status from the constitution's vocabulary                                                                                                                                                                                                                                                                                                                                                    | `PASS` (by reading)                                                                                                                                                                                                     |
| AT-2  | Every `PASS` in §4 names the read that produced it and Appendix A carries that read with a UTC time                                                                                                                                                                                                                                                                                                                                            | `PASS`                                                                                                                                                                                                                  |
| AT-3  | No production behaviour is asserted from repository presence or a green check (D-RT-2); each such input is labelled as an input                                                                                                                                                                                                                                                                                                                | `PASS`                                                                                                                                                                                                                  |
| AT-4  | Every `path:line` cite resolves to its quoted content at the tree it is dated to: `c9bc1df3` for the founding text and the amendment (the founding text also held at `e1d541e2`), `4ddb2322` for the cites added after `#1703` — its two `apply-*.yml` (`:4`, `:140`) do not exist at `c9bc1df3`, and `docs/codebase-map.md:419-423` and `:423-428` are `:416-420` and `:420-425` there. Every other cited file is byte-identical at both SHAs | `PASS` (re-read per tree; no runner)                                                                                                                                                                                    |
| AT-5  | `docs/agents/CURRENT_STATE.md` is not edited by this slice                                                                                                                                                                                                                                                                                                                                                                                     | `PASS`                                                                                                                                                                                                                  |
| AT-6  | `docs/architecture-contract.md` edits are confined to the header restamp, its re-verification (AC-3.2 count and re-point, AC-4.3 note, AC-7.3 re-point), AC-9.3's pointer, §12, §13, §14 and a §15.1 row; no AC clause statement changes                                                                                                                                                                                                       | `PASS`                                                                                                                                                                                                                  |
| AT-7  | `node scripts/assert-docs-safety.mjs` and `node scripts/assert-release-docs-safety.mjs` exit 0                                                                                                                                                                                                                                                                                                                                                 | recorded in the PR body                                                                                                                                                                                                 |
| AT-8  | Prettier (`.prettierrc.json`) reports the touched files clean                                                                                                                                                                                                                                                                                                                                                                                  | recorded in the PR body                                                                                                                                                                                                 |
| AT-9  | The corrections table (§6.2) names a file and line for every contradicted statement and an owner for every deferred edit                                                                                                                                                                                                                                                                                                                       | `PASS`                                                                                                                                                                                                                  |
| AT-10 | The document contains no secret, token, connection string, or private environment value; platform identifiers are project and team IDs only                                                                                                                                                                                                                                                                                                    | `PASS`                                                                                                                                                                                                                  |
| AT-11 | The promotion axis is present end to end: a §3 row, §4 step 3 asking per hostname, §5.7, D-RT-12–14, M10 and M11                                                                                                                                                                                                                                                                                                                               | `PASS` (by reading)                                                                                                                                                                                                     |
| AT-12 | No token identifier, session identifier or email address from the platform event log appears in this document (M11's rule)                                                                                                                                                                                                                                                                                                                     | `PASS`: an email-shaped pattern (`[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}`) and the event log's token and session identifier values return no match; the `@` characters in Appendix B are `ref @ sha` separators |
| AT-13 | Rows 1–10 of §6.1 each carry at least one `path:line` cite read at `c9bc1df3` and none is a `source claim`; rows 11–14 cite the section or appendix measurement they rest on                                                                                                                                                                                                                                                                   | `PASS` (by reading)                                                                                                                                                                                                     |
| AT-14 | Every figure in Appendix B names the read that produced it and a UTC time; nothing there is copied from another session without a label                                                                                                                                                                                                                                                                                                        | `PASS`                                                                                                                                                                                                                  |

---

## 10. Known unknowns

Stated so nobody reads silence as agreement.

| Unknown                                                                                                                                          | Status         | What would close it                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The URL the Lovable project publishes to, and whether it is public                                                                               | `NOT_MEASURED` | Owner reads the Lovable project's publish settings; records it in `CURRENT_STATE.md`                                                                                      |
| When the apex moved from Lovable to Vercel                                                                                                       | `NOT_MEASURED` | Vercel domain history (`createdAt` 2026-09-01 19:06 UTC is the earliest bound); DNS change record                                                                         |
| Who deploys edge functions, and what version each runs on production                                                                             | `BLOCKED`      | M6 with production read access                                                                                                                                            |
| Applied migrations on production                                                                                                                 | `BLOCKED`      | M9 with production read access, by an operator; `CURRENT_STATE.md` axis                                                                                                   |
| Which Nitro preset the Vercel build runs                                                                                                         | `NOT_MEASURED` | The Vercel build log, or a `nitro` preset line in it                                                                                                                      |
| The Vercel project's production-branch and build settings                                                                                        | `NOT_MEASURED` | Project settings read by the owner                                                                                                                                        |
| Whether `main` pushes are suppressed on the Vercel project                                                                                       | `NOT_MEASURED` | `list_deployments` unfiltered, or a `main` push observed                                                                                                                  |
| Whether `verdant-command-center-preview` still exists                                                                                            | `NOT_MEASURED` | Team-wide `list_projects`                                                                                                                                                 |
| Whether `vercel.json:16`'s `/~oauth/*` redirect to the Lovable project host is still correct for OAuth callbacks now that Vercel serves the apex | `NOT_MEASURED` | Owner check of the OAuth callback path; a probe of `/~oauth/` was not made (auth surface)                                                                                 |
| The publisher of the 2026-08-05 and 2026-08-28 stamps (`commit: "unknown"`, `ref: "__orphan__"`)                                                 | `inference`    | Those were Lovable builds; consistent with `stamp-version.mjs:23-26` and `#1175`'s body, not re-measured                                                                  |
| **Why the production hostnames stopped following deploy-branch builds after the 09:45 Instant Rollback**                                         | `inference`    | Owner reads the project's production-domain auto-assignment state, or promotes the tip build and watches whether the next merge follows on its own (M10 before and after) |
| **Who held the API token that promoted `7053af8f` at 08:28 UTC**                                                                                 | `NOT_MEASURED` | Owner reads the token's name and owner in the Vercel account settings; `#1696`'s "Cursor agent" stays a `source claim` until then                                         |
| **Which sessions and agents hold production-scoped Vercel credentials (D-RT-14)**                                                                | `NOT_MEASURED` | Owner inventory of Vercel tokens and connected apps; recorded in `CURRENT_STATE.md`, then scoped or revoked                                                               |
| The Skew Protection window, and whether sessions opened during 08:28–09:45 kept loading `7053af8f` assets after the rollback                     | `NOT_MEASURED` | Project settings read by the owner; the served-bytes question is not measurable after the fact                                                                            |
| `/version.json` on the apex at the amendment                                                                                                     | `BLOCKED`      | M1 from a session whose egress reaches the apex (23:28:47 UTC read refused with a proxy `403`)                                                                            |

---

## 11. `#1175` — disposition, for Cheek

`established fact` from its body and files: `#1175` adds `scripts/verify-publish-provenance.mjs` as
the last `prebuild` step, fail-closed on `dirty !== false`, `ref === "__orphan__"`, or an unknown
commit, and says it "will FAIL Lovable production prebuild on `stamp_orphan` until the publisher
stamps a real ref". Its base is `aabbd2b3`; its head `b082c010` is 8 commits; no independent
reviewer is named in its own text.

What the measurement changes:

- The premise (`ref: "__orphan__"`, live 2026-08-28) does not reproduce on the measured publisher.
  The served stamp is `ref: "verdant-grow-diary"`, `dirty: false`, `commitSource: "git"`. The gate
  would `PASS` on a Vercel build.
- The gate would still fail-close a Lovable build that stamps an orphan ref. Whether Lovable still
  builds this project for publishing is `NOT_MEASURED` (§4.1). If it does, the gate protects the
  second publisher, not the apex.

Options, none chosen here: (a) rebase onto the tip and re-scope the body to "any publisher", keep
fail-closed, name a reviewer; (b) close as superseded by the measured topology and reopen if a
publisher regresses; (c) keep parked. This slice does not push to, review, or enqueue `#1175`.

---

## 12. File-level plan

### This slice — docs only, one branch, one PR

| File                                           | Change                                                                                                                                                                                                                                                                                                                                       |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/specs/release-topology-specification.md` | New — this document, including the amendment: promotion axis, §5.4 appliers, §6.1 verified at `c9bc1df3`, D-RT-12–14, M10–M11, AT-11–14, §10 rows, Appendix B                                                                                                                                                                                |
| `docs/architecture-contract.md`                | §9 prose pointer; §12 `vercel.json` row to its durable form; §13 row from "blocked … #1175 and #1221" to the follow-ups this document names; §14 pointers; §15.1 row. The AC-9.3 pointer touches a clause, so the header is restamped at `4ddb2322` with AC-3.2's count and `codebase-map.md` re-point, an AC-4.3 note and AC-7.3's re-point |
| `docs/codebase-map.md`                         | Replace the "do not fire in production / Lovable is the production publisher" paragraph with the durable rule and a pointer to M7; keep the eight-entry inventory and the paragraph's 11-line span, so the contract's AC-3.2 cite `docs/codebase-map.md:466-467` still resolves                                                              |
| `README.md`                                    | One bullet: certificates belong to the measured apex platform, with a pointer                                                                                                                                                                                                                                                                |

### Follow-ups this document names

Owners are Cheek's to assign; each needs an independent reviewer.

| Follow-up                                                                                                                                              | Kind                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| Governance correction: `CLAUDE.md:130` and `:138-144`, with the twelve-file `Sentinel-Version` bump                                                    | Governance slice                                                |
| Stale comments: `scripts/stamp-version.mjs:23-26`, `deployment-preview.yml:4-12`, `Makefile:77`, `lighthouse-ci.yml:4-6`, `auto-tag-release.yml:86-87` | Small code/workflow slice, with any test pins renegotiated      |
| Retire or rewrite `docs/preview-deployment-verification.md`                                                                                            | Docs slice                                                      |
| M6 run with production read access; record the edge-function versions in `CURRENT_STATE.md`                                                            | Operator measurement                                            |
| Cheek's D-RT-4 decision on the Lovable publisher, recorded in `CURRENT_STATE.md`                                                                       | Owner decision                                                  |
| `#1175` disposition (§11)                                                                                                                              | Owner decision                                                  |
| `#1696`: carry the live `PASS`, the publisher measurement pointer, and drop the "stays deferred" line                                                  | `#1696`'s owner                                                 |
| A T1-style pin for this document's `path:line` cites                                                                                                   | Test slice                                                      |
| **Close the release-state `FAIL` (D-RT-12): promote the current tip build, or restore auto-assignment, then run M10**                                  | **Owner action now** — a publish action under D-RT-13           |
| Record the 08:28 token's holder, then scope or revoke production-scoped platform credentials (D-RT-14)                                                 | Owner action                                                    |
| Close `#1699` as superseded once this carry-forward is reviewed                                                                                        | Owner action                                                    |
| A promotion-drift probe: a scheduled read-only job that runs M10 and reports a split or a stale apex                                                   | Workflow slice; a signal under D-RT-10, never a gate            |
| `docs/codebase-map.md` "Seven … appliers" → the current count                                                                                          | **Done** by `#1703` (`4ddb2322`): it lists ten. Not edited here |

---

## 13. Safety verdict

- **No schema, RLS, auth, edge-function, migration, or application code** is touched. Files are
  `docs/**` and one `README.md` bullet.
- **No publish, deploy, or apply** was performed or triggered. Every platform interaction was a
  read (`list_*`, `get_*`, `GET`/`HEAD`), one attempt each. The amendment's session likewise issued
  **no promote, rollback, redeploy or setting change**; it found the release state `FAIL` (D-RT-12)
  and hands the close to the owner.
- **Event-log data is minimised.** The Vercel event log returns the owner's email address, token
  identifiers and session identifiers. None is copied here (AT-12); actor classes are recorded
  instead.
- **No secret** is recorded. Platform identifiers in Appendix A are team, project, deployment and
  domain identifiers; the `.env.production` token is referred to by class (`test_`) only, as the
  prebuild scripts themselves do.
- **Sensor truth, AI Doctor, Action Queue, device control:** unchanged and not discussed beyond the
  carried contract clauses.
- **Standing locks honoured:** `HOLD #1250`; No Publish; No APPLY; `#1460` and `#1545` parked;
  Never KEEP on fixture walks; no owner email recorded.
- **`docs/agents/CURRENT_STATE.md` is not edited.** `#1696` owns the restamp; the dated measurement
  is handed to it (§15) and lives in Appendix A until then.

Verdict: **safe to merge as documentation.** It changes what readers believe, not what runs.

---

## 14. Deferred and rejected

**Deferred — sequenced, not rejected**

| Item                                                                                | Gate                                                                                 |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `CLAUDE.md` publisher and `vercel.json` corrections                                 | Twelve-file governance bump; its own slice                                           |
| `stamp-version.mjs`, `deployment-preview.yml`, `Makefile` comment corrections       | Touch scripts and workflows; test pins nearby; its own small slice                   |
| `docs/preview-deployment-verification.md` retirement                                | Docs slice after the owner confirms whether the preview project exists               |
| Edge-function deployer measurement (M6) and applied-migration measurement (M9)      | Need production read access this session does not hold; `No APPLY` stands regardless |
| The Lovable publisher decision (D-RT-4)                                             | Cheek                                                                                |
| `#1175`                                                                             | Cheek (§11)                                                                          |
| A runner for AT-4                                                                   | Test slice, alongside the contract's T1                                              |
| Closing the release-state `FAIL` (promote the tip build or restore auto-assignment) | Owner — a publish action (D-RT-13)                                                   |
| Credential inventory and scoping (D-RT-14)                                          | Owner                                                                                |
| A scheduled M10 promotion-drift probe                                               | Workflow slice after this merges; signal only (D-RT-10)                              |

**Rejected — decided, with a reason**

| Alternative                                                                                 | Verdict      | Why                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Writing the measured values into `docs/architecture-contract.md`                            | **REJECTED** | The contract's header forbids production axes; §14 exists to keep them out. This document and `CURRENT_STATE.md` carry them                                              |
| Editing `docs/agents/CURRENT_STATE.md` in this slice                                        | **REJECTED** | `#1696` is the open restamp; two writers on the shift report is the collision the constitution forbids                                                                   |
| Inferring the publisher from `server: Vercel` and the `@vercel/*` SDKs                      | **REJECTED** | Contract §14; the chain in §4 was closed precisely so this inference is never needed                                                                                     |
| Declaring Lovable retired as a publisher                                                    | **REJECTED** | `is_published: true` is measured; the published URL is not. A retirement is Cheek's action, then a measurement, then a `CURRENT_STATE.md` row                            |
| Adding a Vercel deploy step, a Supabase deploy step, or a migration apply to GitHub Actions | **REJECTED** | Out of scope (production deployment, migration application); it would also create a third publisher                                                                      |
| Treating `#1175`'s gate as current behaviour                                                | **REJECTED** | It is an open PR on a stale base with no reviewer; describing it as current would be inferring production from repository presence                                       |
| Leaving the contract stamp at `9b06be3f` while rewriting AC-9.3's pointer                   | **REJECTED** | Contract §15 rule 2: a touched clause requires a restamp and re-verification. An earlier revision rejected the restamp on the mistaken ground that no clause was touched |
| Promoting the tip build or rolling back from the measuring session                          | **REJECTED** | A publish action (D-RT-13). The owner has not instructed one in this slice; the session reports the `FAIL` and stops                                                     |
| Writing a second topology specification beside `#1699`                                      | **REJECTED** | The constitution's one-implementation rule. The amendment carries `#1699`'s commits forward instead (§2.4)                                                               |
| Pushing to `#1699`'s branch                                                                 | **REJECTED** | This session may push only to its designated branch; `#1699`'s owning session is archived. Carry-forward keeps one lineage without that push                             |
| Adding a merge gate that fails when the apex is not the tip                                 | **REJECTED** | The apex is moved after merge by the platform; a pre-merge gate cannot observe it and would red every PR during an owner-held promotion (D-RT-10)                        |

---

## 15. Handoff

```text
HANDOFF
from_agent: Claude
to_agent: Grok (independent reviewer); then Cheek for the owner actions in §12 and the §7, §11 decisions
sentinel_version: 2026-09-01.5
date: 2026-09-25

slice_owner: Claude (the #1699 slice, carried forward on claude/clever-davinci-hk7o03)
independent_reviewer: Grok, the peer the assignment names. Fallback seat: CodeRabbit under the
  owner's strict rule (finding-free, no files under "not reviewed"; a new content commit restarts
  it). CodeRabbit is not a constitution peer; whether it satisfies peer review is Cheek's decision.
  No Claude session can fill this seat.

completed:
  - Founding text (#1699, commits 3ec3578f and cdc0559f, unchanged): topology model, measured
    frontend/SSR chain, remaining axes, corrections, D-RT-1–11, M1–M9, AT-1–10, unknowns, #1175
  - Forward merge of c9bc1df3 with the §15.1 conflict resolved (both rows kept, re-pointed)
  - Amendment: promotion axis (§3 row F, §4 step 3, §5.7), operator appliers (§5.4: eight at
    c9bc1df3, ten at 4ddb2322),
    §6.1 verified from source at c9bc1df3 (14 rows, no source claims left), CLAUDE.md:77 row in
    §6.2, D-RT-12–14, M4 re-scoped and M10–M11 added, AT-11–14, five §10 rows, owner actions
    in §12 and §14, Appendix B (the promotion incident), verdict re-calibrated
  - docs/architecture-contract.md: #1699's §9/§12/§13/§14 edits; the AC-9.3 pointer carries no
    dated observation. Because that pointer is inside AC-9.3, the header is restamped at 4ddb2322:
    AC-7.3 re-pointed :141 -> :143 (#1661), AC-3.2 521 -> 522 and its codebase-map cite
    :466-467 -> :469-470 (#1703), an AC-4.3 method note, §15.1 row
  - docs/codebase-map.md, README.md: #1699's two publisher corrections, unchanged

verified_by:
  - git: deploy tip c9bc1df37b6f0ae1494cf02dffb6a122b39a6f77 fetched 2026-09-25 ~23:05 UTC
  - every repository path:line cite re-read at the tree it is dated to: c9bc1df3, or 4ddb2322
    for the #1703 additions (two apply-*.yml, codebase-map.md:419-423 and :423-428); every other
    cited file is byte-identical at both SHAs (§2.4, AT-4)
  - §6.1: each row's cites read from the c9bc1df3 blobs; the counts and zero-hit greps re-run
  - Vercel reads 23:28–23:37 UTC (Appendix B): get_deployment per hostname ×4 plus the 08:28 one,
    list_deployments (production, since 08:25 UTC), list_promote_aliases, list_user_events ×2
  - GitHub: 48 open PR heads fetched and merge-tested against this branch (§2.4)
  - prettier --check, assert-docs-safety, assert-release-docs-safety: results in the PR body

review_asks (for Grok):
  - Is §5.7's actor-class reading of the event log sound, and is anything identifying leaked
    (AT-12)?
  - Does D-RT-13 draw the line between a read-only measuring session and a publish action at
    the right place?
  - Is the per-hostname rule (D-RT-12, M10) sufficient, or does it need a DNS step as well?
  - Does §6.1's 14-row table overstate anything that was verified only in source?
  - Re-run AT-4 on any five cites of your choice at c9bc1df3

not_done:
  - No CURRENT_STATE.md edit (#1696 is its sole writer); no governance-file edit (twelve-file bump)
  - No promote, rollback, redeploy or setting change — the release-state FAIL is the owner's to close
  - M1 /version.json BLOCKED (session egress 403 at 23:28:47 UTC); M5, M6, M7, M9 not re-run
  - No push, review, or enqueue on #1175 or #1699

unknowns:
  - §10 in full; above all: why auto-assignment stopped, who held the 08:28 token, which sessions
    hold production-scoped platform credentials, the Lovable published URL, the edge deployer

blocked:
  - M1 from this session (egress); M6/M9 (production read access)

assumptions:
  - A1–A5 in §2.2; A5 is that the archived #1699 session will not push again

next_slice:
  - Cheek, now: close the release-state FAIL (promote the tip build or restore auto-assignment),
    then have someone run M10; record the 08:28 token holder; close #1699 once this is reviewed
  - #1696's owner: cite this document for the promotion axis; carry Appendix B's per-hostname
    reading as the latest live row (a CURRENT_STATE stamp outranks it for the value)
  - Next Claude slice after merge: the governance slice for CLAUDE.md:77, :130 and :138-144.
    The contract is restamped at 4ddb2322 in this slice; a later stamp starts from there

files_touched:
  - docs/specs/release-topology-specification.md
  - docs/architecture-contract.md
  - docs/codebase-map.md
  - README.md
```

---

## Appendix A. Baseline measurement — 2026-09-25, dated, superseded by later stamps

All `established fact` unless labelled. One attempt each. Times UTC.

### A.1 Served stamp — M1, 01:20:53

| Field          | Value                                                                                                                |
| -------------- | -------------------------------------------------------------------------------------------------------------------- |
| URL / status   | `https://verdantgrowdiary.com/version.json` → HTTP `200`                                                             |
| `commit`       | `e1d541e2559eb42d5e452035e79b1d796c91c0f9` = the deploy tip                                                          |
| `ref`          | `verdant-grow-diary`                                                                                                 |
| `dirty`        | `false`                                                                                                              |
| `commitSource` | `git`                                                                                                                |
| `ciRunId`      | `null`                                                                                                               |
| `commitTime`   | `2026-09-24T20:10:00-05:00` (= 01:10:00 UTC)                                                                         |
| `buildTime`    | `2026-09-25T01:10:14.123Z`                                                                                           |
| `treeHash`     | `7091e361b3998796a2cb427bd0d00205b9ff4784568ce68d4b92f71ffcd81cb1`                                                   |
| Headers        | `server: Vercel`, `x-vercel-cache: MISS`, `x-vercel-id: iad1::…` (observations, not publisher evidence on their own) |
| `www`          | `HEAD https://www.verdantgrowdiary.com/version.json` → `308`, `location: https://verdantgrowdiary.com/version.json`  |

### A.2 DNS — M2, 01:23

| Name                       | Answer                                                                          |
| -------------------------- | ------------------------------------------------------------------------------- |
| `verdantgrowdiary.com`     | `A 216.150.1.1`                                                                 |
| `www.verdantgrowdiary.com` | `CNAME 526d96436dc18b4c.vercel-dns-017.com` → `216.150.16.193`, `216.150.1.193` |

Resolver: this container's. `inference`: the apex `A` is Vercel anycast (same `216.150.0.0/16`
as the `www` targets); the domain's `verified: true` on the project (A.3) is the stronger fact.

### A.3 Vercel project and domains — M2/M3, 01:21–01:22

| Field              | Value                                                                                                                                                                                                        |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Team               | `Verdant Grow Diary`, slug `verdantgrowdiary`, `team_tj5u4U2DViLW29AVVG0OP1NT`                                                                                                                               |
| Project            | `verdant-grow-diary`, `prj_i2IbBKEA9K2rLLaAO3nrBeJkTXTy`, created 2026-09-01 15:44:38, framework `tanstack-start-lovable`, Node `24.x`                                                                       |
| Repository filter  | `list_projects` with `repoUrl = https://github.com/Verdant-OS/verdant-grow-diary` returns exactly this project                                                                                               |
| Domains            | `verdantgrowdiary.com` — verified, no redirect, created 2026-09-01 19:06:11, updated 2026-09-18 00:19:07; `www.verdantgrowdiary.com` — verified, `308` redirect to the apex; `verdant-grow-diary.vercel.app` |
| Protection         | `ssoProtection: enabled, all_except_custom_domains`; password protection off; trusted IPs off                                                                                                                |
| `latestDeployment` | `dpl_CXeL5CpM…`, created 01:14:20.661, `target: null` (non-production)                                                                                                                                       |

Scope note (no value changed): this read listed the candidate project's domains only; no
team-wide enumeration was run. The verified apex binding on the candidate identifies the holder
only if Vercel binds a domain to one project at a time, which is a `source claim` about the
platform, not measured here. M2 now enumerates every project in the team.

### A.4 Production deployments — M4, 01:22 (history since 08:28 UTC; see Appendix B)

Six newest with `target=production`, all `source: git`, `meta.githubCommitRef: verdant-grow-diary`,
`meta.githubOrg/Repo: Verdant-OS/verdant-grow-diary`, state `READY`, creator `cheekhimself-1647`
(the Git integration's attribution):

| Deployment      | `githubCommitSha` | = deploy-branch tip (PR) | Commit (committer)  | Deployment created | Latency |
| --------------- | ----------------- | ------------------------ | ------------------- | ------------------ | ------- |
| `dpl_2oFBjfm9…` | `e1d541e2`        | yes (`#1691`)            | 01:10:00            | 01:10:04.726       | 4.7 s   |
| `dpl_EHU1vv49…` | `cb6c3288`        | yes (`#1221`)            | 00:12:50            | 00:28:03.387       | 913 s   |
| `dpl_GAjCVWAs…` | `08994aa8`        | yes (`#1687`)            | 2026-09-24 22:03:31 | 22:10:01.671       | 391 s   |
| `dpl_Cyb13tZn…` | `69aca5e7`        | yes (`#1686`)            | 11:28:22            | 11:37:28.363       | 546 s   |
| `dpl_4dQ88BFi…` | `b0bfdb02`        | yes (`#1685`)            | 10:33:01            | 10:39:17.409       | 376 s   |
| `dpl_As8TnYL5…` | `ef15b2c1`        | yes (`#1664`)            | 09:06:57            | 09:26:18.719       | 1162 s  |

Newest deployment detail (`get_deployment`, git info): `type: LAMBDAS`, region `iad1`,
`buildingAt 01:10:06.030`, `ready 01:10:38.738`, aliases
`verdant-grow-diary-verdantgrowdiary.vercel.app` and
`verdant-grow-diary-git-verdant-grow-diary-verdantgrowdiary.vercel.app`. The served
`buildTime` (A.1) `01:10:14.123` lies inside that window.

Latency spread is `established fact`; its cause is `inference` (the project also builds
non-production deployments, A.3).

### A.5 Lovable project — M5, 01:22–01:23

| Field               | Value                                                                            |
| ------------------- | -------------------------------------------------------------------------------- |
| Workspace           | `Verdant`, `i6eoyXRFGkZhDJAydAll` (owner role)                                   |
| Project             | `Verdant Grow Diary`, `66255e7b-892c-4be5-8686-ab1cfc3666db`, created 2026-05-13 |
| `latest_commit_sha` | `e1d541e2559eb42d5e452035e79b1d796c91c0f9` = the deploy tip                      |
| `last_edited_at`    | `2026-09-25T01:10:19.009Z` (19 s after the merge commit)                         |
| `is_published`      | `true`; `publish_audience: public`; `publish_audience_targets: []`               |
| Published URL       | not returned by `get_project` — `NOT_MEASURED`                                   |
| `preview_url`       | `https://id-preview--66255e7b-892c-4be5-8686-ab1cfc3666db.lovable.app`           |

### A.6 `vercel.json` in effect — M7, 01:24:11

| Probe                     | Result                                                                                                                                                                                                                                                                                                        |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `HEAD /strains`           | `308`, `location: /cultivars` (`vercel.json:19`)                                                                                                                                                                                                                                                              |
| `HEAD /terms-of-service`  | `308`, `location: /terms` (`vercel.json:25`)                                                                                                                                                                                                                                                                  |
| `HEAD /` response headers | `x-content-type-options: nosniff`, `x-frame-options: SAMEORIGIN`, `referrer-policy: strict-origin-when-cross-origin`, `strict-transport-security: max-age=63072000; includeSubDomains; preload`, `permissions-policy: geolocation=(), camera=(), microphone=(), payment=()` — all five of `vercel.json:33-42` |

Scope, added at the amendment without changing any value above: two of the eight permanent redirect
sources were probed at this instant. The other six (`/strains/:slug`, `/features`, `/demo`,
`/refunds`, `/refund-policy`, `/privacy-policy`) were `NOT_MEASURED`. M7 as amended probes all
eight.

### A.7 GitHub — M8 and the board, 01:19–01:24

| Item                       | Value                                                                                                                      |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Deploy tip                 | `e1d541e2559eb42d5e452035e79b1d796c91c0f9`, `fix(sensors): reject future timestamps as healthy evidence (#1691)`           |
| Release tags on the remote | `v2026.09.25-e1d541e2559e`, `v2026.09.25-cb6c3288bab8`, `v2026.09.24-ef15b2c1be94`, `v2026.09.24-f6b2fb97ad96` (annotated) |
| Open PRs                   | 48 (§2.3)                                                                                                                  |
| Actions deploy steps       | none (`grep` at the tip over `.github/workflows/*.yml`; two comment/string hits only)                                      |
| Tracked stamp at the tip   | `public/version.json`: `686fef4d`, `dirty: true`, built 2026-09-12 — 54 commits behind; lineage only                       |

### A.8 Supabase tool reach — M6/M9, 01:24

`list_projects` returns one project: `bzatgtgjvuojpoxcknaa` (`Verdant`, sandbox). Production
`knkwiiywfkbqznbxwqfh` is not reachable from this session: M6 and M9 are **`BLOCKED`** here.

---

## Appendix B. The promotion incident and the unpromoted tip — 2026-09-25, dated

Measured by the amendment's session with Vercel reads, one attempt each, at 23:28–23:37 UTC. Every
row is `established fact` unless labelled. Deployment IDs are truncated. Per M11's rule, the event
log's token identifiers, session identifiers and email address are not copied (AT-12). Like
Appendix A, this appendix is a dated record. A later `CURRENT_STATE.md` stamp outranks it for any
value.

### B.1 The out-of-band production deployment — M4 and `get_deployment`

| Field           | Value                                                                                                                                                 |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Deployment      | `dpl_BhuJT6qq…`, `target: production`, **`source: redeploy`**, `READY`, created 08:28:39, ready 08:29:16                                              |
| Git metadata    | `githubCommitRef: cursor/missing-test-coverage-b7df`, `githubCommitSha: 7053af8f` — a commit on `#1692`'s branch that never reached the deploy branch |
| Held the apex   | 08:28:39 until the 09:45:15 rollback, about 77 minutes (the 08:29:17 alias event is B.3)                                                              |
| Rollback target | `dpl_6fVRiJ3X…`: `source: git`, `verdant-grow-diary` @ `9b06be3f` (`#1680`), created 06:22:23                                                         |

### B.2 What each hostname served at 23:28–23:29 — M10

| Hostname                                                   | Deployment      | `source` | Ref @ commit                                                |
| ---------------------------------------------------------- | --------------- | -------- | ----------------------------------------------------------- |
| `verdantgrowdiary.com`                                     | `dpl_6fVRiJ3X…` | `git`    | `verdant-grow-diary` @ `9b06be3f` (`#1680`)                 |
| `www.verdantgrowdiary.com`                                 | `dpl_6fVRiJ3X…` | `git`    | same                                                        |
| `verdant-grow-diary.vercel.app`                            | `dpl_6fVRiJ3X…` | `git`    | same                                                        |
| `verdant-grow-diary-verdantgrowdiary.vercel.app` (project) | `dpl_GChM9WA1…` | `git`    | `verdant-grow-diary` @ `c9bc1df3` (`#1713`), ready 23:17:55 |

- **Split: `FAIL` under D-RT-12.** The three production hostnames serve a build 13 first-parent
  commits behind the tip (`git rev-list --first-parent --count 9b06be3f..c9bc1df3`). The project
  alias serves the tip.
- **A deployment's alias array misleads.** `dpl_6fVRiJ3X…`'s own `alias` array still lists the
  project alias, while resolving that hostname returns `dpl_GChM9WA1…`. This is why M10 resolves
  hostnames rather than reading alias arrays.
- `list_promote_aliases`: apex, `www` and `verdant-grow-diary.vercel.app` are all **`pending`**.
- `GET https://verdantgrowdiary.com/version.json` at 23:28:47: **`BLOCKED`**. The session proxy
  refused the CONNECT with `403`.

**Production deployments created since 08:25 UTC** (`list_deployments`, `target=production`, 14
rows). Each row after the first has ref `verdant-grow-diary`, is `READY`, and holds none of the
apex, `www` and `verdant-grow-diary.vercel.app`; the last row's build (`c9bc1df3`) holds the project
alias, as above:

| Created  | Commit     | PR      | Application files this merge changed (non-test `src/`, edge; per merge, not cumulative)            |
| -------- | ---------- | ------- | -------------------------------------------------------------------------------------------------- |
| 08:28:39 | `7053af8f` | —       | (the B.1 deployment; ref `cursor/missing-test-coverage-b7df`)                                      |
| 12:03:29 | `c10c095e` | `#1702` | none                                                                                               |
| 13:30:59 | `b099bbf7` | `#1708` | none                                                                                               |
| 13:46:40 | `5a5094cc` | `#1709` | none                                                                                               |
| 13:51:10 | `054a4e3e` | `#1692` | none                                                                                               |
| 14:13:21 | `db0f3d73` | `#1700` | `src/lib/sensorChartExport.ts`                                                                     |
| 20:21:45 | `f9f697ae` | `#1711` | none                                                                                               |
| 20:30:39 | `0f7b12db` | `#1704` | none; its migration is an operator apply, independent of promotion (§5.4)                          |
| 20:31:07 | `84814341` | `#1705` | none                                                                                               |
| 20:32:15 | `b77d28a8` | `#1661` | `src/components/genetics/BreedingLogContainer.tsx`                                                 |
| 20:33:35 | `2f67a545` | `#1657` | four Blueprint files (`blueprintEvidenceRules.ts`, `blueprintOverlayViewModel.ts`, two components) |
| 23:01:39 | `4ca764c1` | `#1716` | `src/components/FounderOwnerPrefsForm.tsx`                                                         |
| 23:04:04 | `7d58a904` | `#1710` | none                                                                                               |
| 23:17:25 | `c9bc1df3` | `#1713` | none                                                                                               |

**Reconciled both ways (M4).** Each of the 13 first-parent tips from `c10c095e` to `c9bc1df3` has
exactly one READY production deployment from `verdant-grow-diary`, and the only production
deployment in the window without a tip is the B.1 row.

The last column is **per merge**: `git diff --name-only` of each first-parent commit against its
first parent, restricted to `src/` and `supabase/functions/` minus tests. **What the served build
lacks is cumulative.** `git diff --name-only 9b06be3f c9bc1df3` with the same filter gives seven
application files: `src/components/FounderOwnerPrefsForm.tsx`,
`src/components/PlantBlueprintOverlaySection.tsx`, `src/components/ProBlueprintOverlay.tsx`,
`src/components/genetics/BreedingLogContainer.tsx`, `src/lib/blueprintEvidenceRules.ts`,
`src/lib/blueprintOverlayViewModel.ts` and `src/lib/sensorChartExport.ts`. The window also adds
one migration, which reaches production only through an operator apply (§5.4). Neither list says
what growers experienced (`NOT_MEASURED`).

**Correction to an earlier self-check:** the 21:36 UTC pass on `#1699` said `#1704`'s
`src/lib/db.ts` change ships with the frontend. `#1704` changes no file under `src/` except a test,
so that does not reproduce.

### B.3 The team event log — M11, `list_user_events`, windows 08:25–08:35 and 09:40–09:50

| Time     | Event type                                            | Actor class                             | What happened                                                                                                                                                                      |
| -------- | ----------------------------------------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 08:26:14 | `connect-attach-project`                              | API token **T1**, no `via` application  | Project attached to a GitHub connector for Production, Preview and Development                                                                                                     |
| 08:28:39 | `deployment` (target production)                      | API token **T1**, no `via` application  | `7053af8f` from `cursor/missing-test-coverage-b7df` to production; `github_login` attribution `cursoragent`                                                                        |
| 08:28:52 | `project-skew-protection-max-age-updated`             | API token **T1**                        | Skew Protection enabled                                                                                                                                                            |
| 08:29:17 | `aliases-assigned`                                    | attribution `cursoragent`               | Five aliases assigned to the `7053af8f` deployment                                                                                                                                 |
| 08:29:43 | `project-source-files-outside-root-directory-updated` | API token **T1**                        | "Include files outside root directory" disabled                                                                                                                                    |
| 09:45:15 | `instant-rollback-created`                            | **`via: Claude.ai`**, a different token | `dpl_BhuJT6qq…` → `dpl_6fVRiJ3X…`, reason "Owner-authorized rollback: restore production to deploy tip 9b06be3f (#1680) from the 08:28 UTC redeploy of PR-branch commit 7053af8f." |
| 09:45:16 | `aliases-assigned`                                    | attribution `cheekhimself`              | Four aliases assigned to the `9b06be3f` deployment                                                                                                                                 |

- **T1** is a label for one token identifier that appears on all four token-bearing 08:26–08:29
  events. Its value is not recorded. Every event names the owner's Vercel identity as principal, and
  the Git integration's own deployments in the same window carry no token identifier.
- `github_login` is the attribution of the **commit** being deployed, not of the caller. That the
  Cursor agent issued T1's calls is therefore `inference` here (`#1696` records it as a
  `source claim`). Closing it is the §10 row "Who held the API token".
- The rollback was owner-instructed. The session that issued it recorded the instruction on `#1699`
  at 09:46 UTC, and the event carries the reason text D-RT-13 asks for. The reason text quoted in
  the table was checked before recording: it contains no credential, URL or personal identifier.

### B.4 What Appendix B does not establish

- Why the production hostnames stopped following git builds after 09:45 (`inference`: the Instant
  Rollback; the documentation searched for this amendment did not state it).
- Who held T1 (`NOT_MEASURED`), or which other credentials can promote (`NOT_MEASURED`, D-RT-14).
- What any grower session actually loaded between 08:28 and 09:45 (Skew Protection;
  `NOT_MEASURED`).
- The served `/version.json` at any time on 2026-09-25 after 01:20 (`BLOCKED` from this session).
- Lovable (M5), DNS (A.2), `vercel.json` probes (M7), edge versions (M6) and applied migrations
  (M9). None was re-run.

---

**Verdict.** The frontend and SSR release topology is **measured and specified**, and its
weakest link is now named. Vercel's Git integration built every `verdant-grow-diary` tip observed
in Appendices A and B (six, then 13) as a production deployment; that is a measured window, not a
standing guarantee, and M4 reconciles each new one.
What the production hostnames serve is a **separate promotion axis**, which
a platform credential can move with no repository gate. On 2026-09-25 it was moved once without an
owner instruction on record (08:28) and once on one (09:45), and it has not followed a merge since.
At the amendment's reading the apex serves `9b06be3f`, 13 commits behind `c9bc1df3`: a release
state of **`FAIL`**, the owner's to close. The edge-function and database axes are **specified but
not measured** from this session and are labelled so. The repository's own description of its
publisher is wrong, and the corrections that need a governance bump are named, not smuggled in.

Confidence: **high** in §4 at the Appendix A instant and in Appendix B at its instant, by
construction of the reads. **Low** in any standing behaviour of the promotion axis: it changed
twice in one day, and its current cause is `inference`. **None** in everything under
`NOT_MEASURED`, by design. The method (M1–M11, D-RT-1–14) is what this document asks a reader to
trust; its dated values are not.

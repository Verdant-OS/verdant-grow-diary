# Authoritative Release Topology Specification

**Author:** Claude (Knowledge Library / Product Specification Architect), slice owner
**Independent reviewer:** CodeRabbit, under the owner's strict rule (a review counts only when it is
finding-free and lists no unreviewed files) — Cheek, 2026-09-25
**Date:** 2026-09-25
**Slice:** Authoritative Release Topology Specification — docs-only, the second slice of the
architecture-contract work, sequenced after `#1221` merged (`cb6c3288`, 2026-09-25 00:12 UTC)
**Status:** **Specification with a measured baseline.** §§3–9 are durable: the topology model,
the rules, and the measurement procedures. Appendix A is the founding measurement, dated, and is
superseded by every later `docs/agents/CURRENT_STATE.md` stamp that re-runs the procedures.
**Measured against:** deploy tip `e1d541e2559eb42d5e452035e79b1d796c91c0f9` (the `#1691` squash,
committed 2026-09-25 01:10:00 UTC) on `verdant-grow-diary`, read locally. Live and platform reads
ran between 01:19 and 01:25 UTC on 2026-09-25 through the owner-connected GitHub, Vercel, Lovable
and Supabase tools, one attempt each, nothing routed around.

Every claim carries a Sentinel label: `established fact`, `source claim`, `practical observation`,
`inference`, `uncertainty`, `missing evidence`. Every topology check carries one status from the
constitution's vocabulary: `PASS`, `FAIL`, `BLOCKED`, `NOT_MEASURED`, `NOT_APPLICABLE`. A check
that was not run is `NOT_MEASURED`, never a pass.

---

## 0. What this document is, and what it must not become

`docs/architecture-contract.md` §14 deliberately refused to settle release topology, because a
permanent contract goes stale every time the operating picture moves. It kept two durable rules —
_publisher identity is not established by response headers_ and _the build target is not the
serving target_ — and deferred the rest to this specification (§13 of the contract).

This document does three things and only three:

1. **Names the topology model** — the five axes along which "what is live" is decided, and which
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
  (team `verdantgrowdiary`), which is git-linked to `Verdant-OS/verdant-grow-diary` and creates a
  **production** deployment from each push to `verdant-grow-diary`. The chain domain → project →
  deployment → commit → served stamp is closed by measurement (§4). Status **`PASS`**,
  `established fact` at the Appendix A instant.
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
- **`vercel.json` is production host configuration now.** Its redirects answer `308` on the apex
  and its headers are served (Appendix A.6). The contract's §12 row that rejected treating it as
  production configuration rested on a measurement made under the other publisher; it is amended
  in this slice to the durable form.
- **GitHub Actions publishes nothing.** It gates (35 required contexts), tags every deploy-branch
  push (`auto-tag-release`, with a `Tree-Hash:` annotation), and probes after the fact. No workflow
  deploys the frontend or the edge functions (re-grepped at the tip: zero deploy steps).
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
| Audit the deploy branch, not `main`                                       | Measured at `e1d541e2` on `verdant-grow-diary`; `main` is not read                                        |
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

---

## 3. The topology model — five axes, one owner each

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
  (E) Database:  supabase/migrations/** (append-only) → operator-dispatched apply workflow;
                 applied state NOT_MEASURED here (CURRENT_STATE axis)
```

| Axis                   | Owner of the truth                                                                              | Proof that counts                                                                                                    | Never counts as proof                                                                                          |
| ---------------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Source                 | The `verdant-grow-diary` tip, ruleset `20421416`, `config/required-status-checks.json`          | `git rev-parse origin/verdant-grow-diary`; the pinned required list                                                  | `main`; a green PR; a merged PR ("a merge is not a deployment")                                                |
| Frontend / SSR publish | The platform whose project holds the apex domain and whose deployment produced the served stamp | The §4 chain: domain binding → project ↔ repo → deployment ↔ commit → served `/version.json` inside the build window | `server:` headers alone; `vercel.json` presence; a vendor SDK; Make or script comments; tip-equals-live parity |
| Build                  | `package.json` `prebuild`/`build`/`postbuild` and the publisher's build settings                | The served stamp's fields; the publisher's build log where readable                                                  | The preset's default Nitro target (build target ≠ serving target)                                              |
| Edge functions         | Whoever runs `supabase functions deploy` against `knkwiiywfkbqznbxwqfh`                         | A read of the production project's function versions, or the deployer's own log                                      | The `Makefile:77` comment; the Lovable knowledge note; committed source                                        |
| Database               | The operator apply path (`apply-pinned-production-migrations.yml`) and Lovable-authored exports | `supabase_migrations.schema_migrations` on production, or the drift probe's output                                   | A merged migration file; a green `Published migration integrity` run                                           |

---

## 4. The measured chain for the frontend and SSR publisher

Each step names its read, its label, and its status. The values are in Appendix A; the method is
here. A future restamp re-runs the same steps in the same order.

| Step | Question the step answers                                  | Read (tool or command)                                                                                                                           | Label at A                                                     | Status |
| ---- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------- | ------ |
| 1    | Which platform project holds the apex domain?              | Vercel `list_project_domains` for the project; DNS resolution of apex and `www`                                                                  | `established fact`                                             | `PASS` |
| 2    | Is that project bound to this repository?                  | Vercel `list_projects` filtered by this repository's URL; deployment `meta.githubOrg/Repo`                                                       | `established fact`                                             | `PASS` |
| 3    | Did its latest production deployment build the deploy tip? | Vercel `list_deployments` (`target=production`) and `get_deployment` with git info                                                               | `established fact`                                             | `PASS` |
| 4    | Are the served bytes that deployment's bytes?              | `GET https://verdantgrowdiary.com/version.json`; compare `commit` and `buildTime` with the deployment's `githubCommitSha`, `buildingAt`, `ready` | `established fact` for the fields; `inference` for attribution | `PASS` |
| 5    | Is this one publish or a standing behaviour?               | The previous N production deployments against the previous N deploy-branch tips                                                                  | `established fact`                                             | `PASS` |
| 6    | What is the trigger?                                       | Deployment `source` (`git`) and `meta.githubCommitRef`; latency from commit to deployment                                                        | `established fact` + `inference`                               | `PASS` |

**Conclusion at the Appendix A instant.** The publisher of `verdantgrowdiary.com` is Vercel's Git
integration for project `verdant-grow-diary`, triggered by pushes to `verdant-grow-diary`, building
inside Vercel (`ciRunId: null`, `commitSource: "git"`, real branch ref). This satisfies contract
§14's rule — the publisher was **measured**, not read off a header — and it is exactly the kind
of statement §14 said must not live in the contract.

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
  (`vercel.json:7-11`); the deploy branch is not named there, so a git-linked Vercel project deploys
  it. The six observed production deployments agree. Whether `main` pushes are in fact suppressed
  was not observed (the deployment list was filtered to `target=production`): `NOT_MEASURED`.
- Ruleset `20421416` requires 35 contexts, all produced by `ci.yml`, pinned in
  `config/required-status-checks.json` (`capturedAt: 2026-08-10`; `#1221` added `mustBeGreen`
  entries and left the required list unchanged). Merges are squash through the merge queue.
- `auto-tag-release.yml` tags every push to `main` or `verdant-grow-diary` as
  `v<yyyy>.<mm>.<dd>-<shortSha>` with a `Tree-Hash:` annotation (`:86-93`). Tags exist for the last
  four deploy tips (Appendix A.7). This is the only durable link from a served `treeHash` back to
  commits when a stamp has no git identity (`docs/release-provenance-runbook.md`).

### 5.2 Build — `established fact` from source, `NOT_MEASURED` inside the publisher

- `prebuild` (`package.json:9`) runs, in order: `restore-env-production-from-head.mjs`,
  `assert-paddle-production-sandbox.mjs`, `verify-edge-shared-in-sync.mjs`,
  `check-no-src-lib-imports.mjs`, `stamp-version.mjs`. `build` is `vite build`; `postbuild` runs
  the SEO validators against `dist` (`:11-12`). `#1175` would append a sixth step (§11).
- `stamp-version.mjs` writes `public/version.json` and `src/generated/buildInfo.ts`, both tracked
  (`:11-15`, `:67`). It never exits non-zero for provenance reasons (`:42-44`). `commitSource` is
  `github-env` | `git` | `none` (`:148`); `ref` prefers `GITHUB_REF_NAME`, then
  `VERCEL_GIT_COMMIT_REF`, then the git ref (`:126-135`); `ciRunId` is `GITHUB_RUN_ID` or `null`
  (`:283`). A Vercel build is detected only for diagnostics and never flips `dirty` (`:70-71`,
  `:165-171`).
- **The tracked stamp is lineage, never identity** (`:37-39`, `:196-198`). At the tip,
  `public/version.json` still says `686fef4d`, `dirty: true`, from 2026-09-12 — 54 commits behind.
  That is expected: the file is overwritten inside the publisher's build, and its committed copy
  surfaces only as `inherited` (`trusted: false`) when a build has no git identity.
- `treeHash` covers `TREE_HASH_ROOTS` (`scripts/lib/tree-hash.mjs:43-65`): `src`, `public`,
  `supabase`, `scripts`, `config`, the four committed env files, `index.html`, `package.json`, both
  lockfiles, `vite.config.ts` and the tsconfigs. Docs, `e2e/`, and `.github/` do not move it, so one
  hash can name several commits.
- **Rule (D-RT-3).** The preset's Nitro target is the configured build target and says nothing
  about the serving target (contract §14). Record the two separately and never derive one from the
  other.

### 5.3 Edge functions — `NOT_MEASURED` deployer, `BLOCKED` state

- No workflow under `.github/workflows/` deploys edge functions. Re-grepped at the tip for
  `supabase functions deploy`, `supabase db push`, `supabase link`, `vercel deploy` and the common
  deploy actions: the only two hits are a comment in `mcp-local-rls-integration.yml:12` and two
  quoted instruction strings in `required-money-migrations.yml:124,201`. `established fact`.
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
- The production apply path is `apply-pinned-production-migrations.yml`: `workflow_dispatch` with
  `expected_head_sha`, `confirm_project_ref` (must equal `knkwiiywfkbqznbxwqfh`, `:59`) and
  `confirm_apply`; it runs in GitHub environment `verdant-production-solo-founder` (`:73`) with the
  `SUPABASE_DB_URL` secret (`:94-95`) and executes `scripts/apply-pinned-production-migrations.mjs`
  (`:113`). `migration-drift-probe.yml` is the read-only counterpart (`workflow_dispatch`,
  environment `verdant-production`, `psql`). `supabase/config.toml:1` pins the same project ref.
- Lovable authors migrations under its own naming (157 UUID-slug exports in the ledger per
  `docs/codebase-map.md:416-420`) and, as a `source claim`, applies what it authors through its
  Cloud. Nothing in this repository shows that path.
- Applied state on production is a `docs/agents/CURRENT_STATE.md` axis (contract AC-9.3) and stays
  `NOT_MEASURED` here; through this session's Supabase tool it is `BLOCKED` (sandbox only). The
  standing locks hold: **No APPLY. No production SQL.**

### 5.5 Post-deploy signals — never gates

| Workflow             | Trigger at the tip                                                  | What it can say                                                                       |
| -------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `quicklog-smoke.yml` | `push`/`pull_request` on `verdant-grow-diary`, dispatch (`:50-102`) | Authenticated smoke against the deployed app; `blocked` without owner credentials     |
| `seo-monitoring.yml` | `workflow_run` after `ci` on `verdant-grow-diary` (`:23-26`)        | Public-surface probes of `verdantgrowdiary.com`                                       |
| `lighthouse-ci.yml`  | daily `cron`, dispatch (`:13-17`)                                   | Performance of the live host, not of a commit                                         |
| `test:legal-seo`     | required context; Vitest over source (`package.json:101`)           | Nothing about production — the Playwright probe is `test:legal-seo:e2e`, not required |

**Rule (D-RT-10).** A post-deploy signal runs after the publisher has already published and can be
green for a commit that was never served (it reads the host, not the commit). It informs a restamp;
it never certifies a release.

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

---

## 6. Corrections to repository statements

Two kinds of correction. **§6.1** corrects the assumptions the assignment lists as "non-negotiable
conclusions to verify from source". The assignment calls that list the Optimal Tech Stack
Evaluation; no file in the repository carries that title (`grep -rlI "Optimal Tech Stack"` at the
tip returns nothing), so the corrections are made against the listed conclusions themselves.
**§6.2** corrects repository text that the topology measurement contradicts.

### 6.1 The evaluation's conclusions, verified

| Conclusion                                                                                                                       | Status                                                | Basis                                                                                                                                                                                               |
| -------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TanStack Start SSR, TanStack Router, Vite, Nitro                                                                                 | `PASS`                                                | Contract AC-1.1–AC-1.7, verified at `69aca5e7`; `vite.config.ts:12,31-36` at the tip; Vercel reports framework `tanstack-start-lovable` (A.3). Carried, not re-measured here beyond the cited lines |
| React 19, Tailwind 4, shadcn/Radix, TanStack Query current                                                                       | `source claim`                                        | Contract AC-1.8 at `69aca5e7`; `bun.lock` not re-read in this slice                                                                                                                                 |
| Supabase Postgres/Auth/RLS/RPC/Edge Functions current                                                                            | `source claim`                                        | Contract §2, §9 at `69aca5e7`; `supabase/config.toml:1` at the tip                                                                                                                                  |
| Bun canonical; npm compatibility may remain                                                                                      | `PASS`                                                | `bun.lock` and `package-lock.json` both in `TREE_HASH_ROOTS` (`tree-hash.mjs:57-61`); `vercel.json:3-5` declares Bun for the publisher                                                              |
| AI Doctor: gateway path, server-pinned model, validated tool output, credit/idempotency, receipts, no Action Queue/device writes | `source claim`                                        | Contract §5 at `69aca5e7`; outside this slice's measurement                                                                                                                                         |
| Canonical sensor sources `live/manual/csv/demo/stale/invalid`; vendor/transport are provenance                                   | `source claim`                                        | Contract §4 at `69aca5e7`                                                                                                                                                                           |
| VPD EWMA exists; Modified Z-Score/MAD and Nelson Rules not implemented                                                           | `source claim`                                        | Contract §10, §12 at `69aca5e7`                                                                                                                                                                     |
| **Lovable Cloud is the production publisher** (implied wherever the evaluation says "Lovable")                                   | **`FAIL`**                                            | §4: the apex is published by Vercel's Git integration at the measured instant. Lovable remains a second, unmeasured publisher (§4.1)                                                                |
| **`vercel.json` is inert in production**                                                                                         | **`FAIL`**                                            | A.6: `/strains` → `308 /cultivars`, `/terms-of-service` → `308 /terms`, and the five `vercel.json:33-42` headers are served on `/`                                                                  |
| The Nitro build target is Cloudflare, therefore production is served on Cloudflare                                               | `FAIL` as an inference; the premise is `source claim` | Contract §14; the deployment type is Vercel `LAMBDAS` (A.4). Which preset ran is `NOT_MEASURED`                                                                                                     |

### 6.2 Repository text contradicted by the measurement

| File and lines                                                  | Statement                                                                                                                  | Status         | Correction and owner                                                                                                                                 |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CLAUDE.md:130`                                                 | "**Lovable is the production publisher**"                                                                                  | `FAIL`         | Governance file: one of the twelve; all twelve bump `Sentinel-Version` together. **Deferred** to its own slice (§14). Until then, read it against §4 |
| `CLAUDE.md:138-143`                                             | "`vercel.json` does not govern production … Never reason about production redirect or header behaviour from `vercel.json`" | `FAIL`         | Same slice. The durable form is D-RT-5: a host file governs when the measured publisher applies it                                                   |
| `docs/architecture-contract.md` §12                             | "Treating `vercel.json` as production configuration — REJECTED — measured as not applied"                                  | `FAIL`         | **Amended in this slice** to the durable form; §15.1 records why                                                                                     |
| `docs/architecture-contract.md` §9 prose, §13 row, §14 pointers | "release topology deferred — #1221 / #1175"                                                                                | stale          | **Amended in this slice** to point here                                                                                                              |
| `docs/codebase-map.md:87-93`                                    | "Those redirects do not fire in production. Lovable is the production publisher …"                                         | `FAIL`         | **Amended in this slice** to the durable rule and a pointer; the eight-entry inventory is kept                                                       |
| `README.md:88`                                                  | "SSL/TLS certificates are managed by the Lovable hosting platform"                                                         | `FAIL`         | **Amended in this slice**: certificates belong to whichever platform the measured apex binding names                                                 |
| `scripts/stamp-version.mjs:23-26`                               | "the production publisher (Lovable) sometimes builds from a history-less snapshot"                                         | stale comment  | A script edit with test pins nearby; **deferred** (§14). The observation it records (2026-08-05) stays true as history                               |
| `.github/workflows/deployment-preview.yml:4-12`                 | "Publishing to Lovable's published URL is a manual action from the Lovable UI"                                             | partial        | True of the Lovable path only. Workflow file; **deferred**                                                                                           |
| `Makefile:77`                                                   | "Lovable does this automatically"                                                                                          | `NOT_MEASURED` | Comment text (contract §9). **Deferred** with the script comment                                                                                     |
| `docs/preview-deployment-verification.md:3-8, 15-22`            | preview-only Vercel project `verdant-command-center-preview`, npm, `/index.html` rewrite                                   | stale          | Retirement candidate (§14); not edited here                                                                                                          |
| `docs/seo/lighting-launch-verification.md:157-161`              | "redirects … return HTTP 200 … Lovable is the production publisher"                                                        | dated          | Generated 2026-08-02; historically consistent with contract §14's earlier measurement. Left as a dated record                                        |
| `docs/lovable/verdant-project-knowledge-2026-08-18.md:33`       | "Publish deploys frontend + edge only"                                                                                     | `source claim` | Dated Lovable knowledge snapshot; left, and cited as a claim in §5.3                                                                                 |
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
- **D-RT-6 — The served stamp is the only proof of what is live.** `/version.json` on the apex,
  read at a stated instant, with `commit`, `dirty`, `commitSource`, `ref`, `buildTime` and
  `treeHash` recorded. A stamp with `commitSource: "none"` is resolved through `treeHash` and the
  tag annotations (`docs/release-provenance-runbook.md`), never through `inherited`.
- **D-RT-7 — Tags are the provenance anchor, not the release.** `auto-tag-release` proves that a
  push reached GitHub and records its `Tree-Hash`; it proves nothing about a publish.
- **D-RT-8 — Edge functions are a separate release.** No frontend publish implies an edge deploy.
  Until M6 is run by someone with production read access, the edge axis stays `NOT_MEASURED` and
  release notes say so.
- **D-RT-9 — Migrations reach production only through the operator apply path.** Committed is not
  applied; the dispatch workflow with its confirmations is the path; `No APPLY` is the standing
  lock until Cheek lifts it.
- **D-RT-10 — Post-deploy probes are signals.** They inform a restamp and never gate a merge or
  certify a release.
- **D-RT-11 — Dated values never enter a durable document twice.** They live in
  `docs/agents/CURRENT_STATE.md`; this document's Appendix A is the founding measurement and is not
  updated in place — a later measurement is a stamp, not an edit here.

---

## 8. Measurement procedures

Each procedure names what it proves, how, and the status it reports when it cannot run. A restamp
that cites this document runs M1–M5 at minimum and records M6–M9 as `BLOCKED` or `NOT_MEASURED`
when it cannot run them.

| ID  | Proves                                        | How                                                                                                                                                                                                                      | If it cannot run                                                                      |
| --- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| M1  | What is served                                | `GET https://verdantgrowdiary.com/version.json` once; record UTC time, HTTP status, `commit`, `ref`, `dirty`, `commitSource`, `buildTime`, `treeHash`, `ciRunId`, and the `server`/`x-vercel-id` headers as observations | `BLOCKED` (egress)                                                                    |
| M2  | Which project holds the apex                  | Vercel `list_project_domains` for the candidate project; DNS `A`/`CNAME` for apex and `www`                                                                                                                              | `BLOCKED` (no account access)                                                         |
| M3  | Project ↔ repository                          | Vercel `list_projects` with `repoUrl = https://github.com/Verdant-OS/verdant-grow-diary`                                                                                                                                 | `BLOCKED`                                                                             |
| M4  | Deployment ↔ commit, and the trigger          | Vercel `list_deployments` with `target=production`, then `get_deployment` with git info for the newest; compare `githubCommitSha` with the tip and `buildTime` with `[buildingAt, ready]`                                | `BLOCKED`                                                                             |
| M5  | The second publisher's state                  | Lovable `get_project 66255e7b-…`: `latest_commit_sha`, `is_published`, `publish_audience`, and — when the tool exposes it — the published URL                                                                            | `NOT_MEASURED` for the URL                                                            |
| M6  | Deployed edge-function versions on production | Supabase `list_edge_functions` against `knkwiiywfkbqznbxwqfh` (per-function `version`/`updated_at`), or the deployer's own log                                                                                           | `BLOCKED` when only the sandbox is reachable                                          |
| M7  | `vercel.json` in effect                       | `HEAD` on one redirect source (`/strains`) and on `/`; expect `308` + `Location` and the five headers of `vercel.json:33-42`                                                                                             | `BLOCKED` (egress)                                                                    |
| M8  | Tag anchor for the tip                        | `git ls-remote --tags origin 'v<yyyy>.<mm>.<dd>-*'`; expect a tag whose short SHA is the tip's                                                                                                                           | `NOT_MEASURED`                                                                        |
| M9  | Applied migrations on production              | `migration-drift-probe.yml` output, or `select version from supabase_migrations.schema_migrations` by an operator                                                                                                        | `NOT_MEASURED` (CURRENT_STATE axis); never run from an agent session under `No APPLY` |

Reads only. No procedure publishes, deploys, applies, or writes.

---

## 9. Acceptance tests for this specification

Reviewable by reading; no runner is added in this slice (a T1-style pin for the cited lines is a
candidate follow-up, §14).

| ID    | Assertion                                                                                                                                   | Result at authoring                       |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| AT-1  | Every topology claim in §4, §5 and §6 carries one status from the constitution's vocabulary                                                 | `PASS` (by reading)                       |
| AT-2  | Every `PASS` in §4 names the read that produced it and Appendix A carries that read with a UTC time                                         | `PASS`                                    |
| AT-3  | No production behaviour is asserted from repository presence or a green check (D-RT-2); each such input is labelled as an input             | `PASS`                                    |
| AT-4  | Every `path:line` cite resolves at `e1d541e2` to the quoted content                                                                         | `PASS` (re-read while writing; no runner) |
| AT-5  | `docs/agents/CURRENT_STATE.md` is not edited by this slice                                                                                  | `PASS`                                    |
| AT-6  | `docs/architecture-contract.md` edits are confined to §9 prose, §12, §13, §14 and a §15.1 row; no AC clause statement changes               | `PASS`                                    |
| AT-7  | `node scripts/assert-docs-safety.mjs` and `node scripts/assert-release-docs-safety.mjs` exit 0                                              | recorded in the PR body                   |
| AT-8  | Prettier (`.prettierrc.json`) reports the touched files clean                                                                               | recorded in the PR body                   |
| AT-9  | The corrections table (§6.2) names a file and line for every contradicted statement and an owner for every deferred edit                    | `PASS`                                    |
| AT-10 | The document contains no secret, token, connection string, or private environment value; platform identifiers are project and team IDs only | `PASS`                                    |

---

## 10. Known unknowns

Stated so nobody reads silence as agreement.

| Unknown                                                                                                                                          | Status         | What would close it                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | -------------- | -------------------------------------------------------------------------------------------------------- |
| The URL the Lovable project publishes to, and whether it is public                                                                               | `NOT_MEASURED` | Owner reads the Lovable project's publish settings; records it in `CURRENT_STATE.md`                     |
| When the apex moved from Lovable to Vercel                                                                                                       | `NOT_MEASURED` | Vercel domain history (`createdAt` 2026-09-01 19:06 UTC is the earliest bound); DNS change record        |
| Who deploys edge functions, and what version each runs on production                                                                             | `BLOCKED`      | M6 with production read access                                                                           |
| Applied migrations on production                                                                                                                 | `NOT_MEASURED` | M9 by an operator; `CURRENT_STATE.md` axis                                                               |
| Which Nitro preset the Vercel build runs                                                                                                         | `NOT_MEASURED` | The Vercel build log, or a `nitro` preset line in it                                                     |
| The Vercel project's production-branch and build settings                                                                                        | `NOT_MEASURED` | Project settings read by the owner                                                                       |
| Whether `main` pushes are suppressed on the Vercel project                                                                                       | `NOT_MEASURED` | `list_deployments` unfiltered, or a `main` push observed                                                 |
| Whether `verdant-command-center-preview` still exists                                                                                            | `NOT_MEASURED` | Team-wide `list_projects`                                                                                |
| Whether `vercel.json:16`'s `/~oauth/*` redirect to the Lovable project host is still correct for OAuth callbacks now that Vercel serves the apex | `NOT_MEASURED` | Owner check of the OAuth callback path; a probe of `/~oauth/` was not made (auth surface)                |
| The publisher of the 2026-08-05 and 2026-08-28 stamps (`commit: "unknown"`, `ref: "__orphan__"`)                                                 | `inference`    | Those were Lovable builds; consistent with `stamp-version.mjs:23-26` and `#1175`'s body, not re-measured |

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

| File                                           | Change                                                                                                                                                                                                                |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/specs/release-topology-specification.md` | New — this document                                                                                                                                                                                                   |
| `docs/architecture-contract.md`                | §9 prose pointer; §12 `vercel.json` row to its durable form; §13 row from "blocked … #1175 and #1221" to the follow-ups this document names; §14 pointers; §15.1 row. Header stamp unchanged: no AC clause is touched |
| `docs/codebase-map.md`                         | Replace the "do not fire in production / Lovable is the production publisher" paragraph with the durable rule and a pointer; keep the eight-entry inventory                                                           |
| `README.md`                                    | One bullet: certificates belong to the measured apex platform, with a pointer                                                                                                                                         |

### Follow-ups this document names

Owners are Cheek's to assign; each needs an independent reviewer.

| Follow-up                                                                                             | Kind                                                       |
| ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Governance correction: `CLAUDE.md:130` and `:138-143`, with the twelve-file `Sentinel-Version` bump   | Governance slice                                           |
| Stale comments: `scripts/stamp-version.mjs:23-26`, `deployment-preview.yml:4-12`, `Makefile:77`       | Small code/workflow slice, with any test pins renegotiated |
| Retire or rewrite `docs/preview-deployment-verification.md`                                           | Docs slice                                                 |
| M6 run with production read access; record the edge-function versions in `CURRENT_STATE.md`           | Operator measurement                                       |
| Cheek's D-RT-4 decision on the Lovable publisher, recorded in `CURRENT_STATE.md`                      | Owner decision                                             |
| `#1175` disposition (§11)                                                                             | Owner decision                                             |
| `#1696`: carry the live `PASS`, the publisher measurement pointer, and drop the "stays deferred" line | `#1696`'s owner                                            |
| A T1-style pin for this document's `path:line` cites                                                  | Test slice                                                 |

---

## 13. Safety verdict

- **No schema, RLS, auth, edge-function, migration, or application code** is touched. Files are
  `docs/**` and one `README.md` bullet.
- **No publish, deploy, or apply** was performed or triggered. Every platform interaction was a
  read (`list_*`, `get_*`, `GET`/`HEAD`), one attempt each.
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

| Item                                                                           | Gate                                                                                 |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| `CLAUDE.md` publisher and `vercel.json` corrections                            | Twelve-file governance bump; its own slice                                           |
| `stamp-version.mjs`, `deployment-preview.yml`, `Makefile` comment corrections  | Touch scripts and workflows; test pins nearby; its own small slice                   |
| `docs/preview-deployment-verification.md` retirement                           | Docs slice after the owner confirms whether the preview project exists               |
| Edge-function deployer measurement (M6) and applied-migration measurement (M9) | Need production read access this session does not hold; `No APPLY` stands regardless |
| The Lovable publisher decision (D-RT-4)                                        | Cheek                                                                                |
| `#1175`                                                                        | Cheek (§11)                                                                          |
| A runner for AT-4                                                              | Test slice, alongside the contract's T1                                              |

**Rejected — decided, with a reason**

| Alternative                                                                                 | Verdict      | Why                                                                                                                                              |
| ------------------------------------------------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Writing the measured values into `docs/architecture-contract.md`                            | **REJECTED** | The contract's header forbids production axes; §14 exists to keep them out. This document and `CURRENT_STATE.md` carry them                      |
| Editing `docs/agents/CURRENT_STATE.md` in this slice                                        | **REJECTED** | `#1696` is the open restamp; two writers on the shift report is the collision the constitution forbids                                           |
| Inferring the publisher from `server: Vercel` and the `@vercel/*` SDKs                      | **REJECTED** | Contract §14; the chain in §4 was closed precisely so this inference is never needed                                                             |
| Declaring Lovable retired as a publisher                                                    | **REJECTED** | `is_published: true` is measured; the published URL is not. A retirement is Cheek's action, then a measurement, then a `CURRENT_STATE.md` row    |
| Adding a Vercel deploy step, a Supabase deploy step, or a migration apply to GitHub Actions | **REJECTED** | Out of scope (production deployment, migration application); it would also create a third publisher                                              |
| Treating `#1175`'s gate as current behaviour                                                | **REJECTED** | It is an open PR on a stale base with no reviewer; describing it as current would be inferring production from repository presence               |
| Re-stamping the contract header to `e1d541e2`                                               | **REJECTED** | §15.2 ties a re-stamp to re-verifying every touched clause; no clause is touched, and a re-stamp would claim a re-verification that was not done |

---

## 15. Handoff

```text
HANDOFF
from_agent: Claude
to_agent: CodeRabbit (independent reviewer, strict rule); then Cheek for the §7 and §11 decisions
sentinel_version: 2026-09-01.5
date: 2026-09-25

slice_owner: Claude
independent_reviewer: CodeRabbit — a review counts only when it is finding-free and lists no
  files under "not reviewed"; a new content commit restarts the requirement

completed:
  - docs/specs/release-topology-specification.md: topology model (§3), the measured chain for the
    frontend/SSR publisher (§4), the remaining axes (§5), corrections (§6), decisions (§7),
    procedures M1–M9 (§8), acceptance tests (§9), unknowns (§10), #1175 disposition (§11)
  - docs/architecture-contract.md: §9 prose pointer, §12 vercel.json row in durable form,
    §13 row, §14 pointers, §15.1 row; header stamp unchanged
  - docs/codebase-map.md and README.md: the two measured-false publisher statements corrected

verified_by:
  - deploy tip e1d541e2559eb42d5e452035e79b1d796c91c0f9 read locally (git fetch at 01:19 UTC)
  - Appendix A: apex /version.json 01:20:53 UTC; Vercel team/project/domains/deployments
    01:21–01:23 UTC; Lovable get_me/get_project 01:22–01:23 UTC; DNS 01:23 UTC; vercel.json
    probes 01:24:11 UTC; Supabase list_projects 01:24 UTC; GitHub open-PR list 01:19 UTC
  - node scripts/assert-docs-safety.mjs and prettier --check: results in the PR body

not_done:
  - No CURRENT_STATE.md edit (#1696 owns it); no governance-file edit (twelve-file bump)
  - No M6 (edge versions) and no M9 (applied migrations): BLOCKED / NOT_MEASURED
  - No push, review, or enqueue on #1175

unknowns:
  - §10 in full; above all the Lovable published URL and the edge-function deployer

blocked:
  - M6/M9: production read access; owner or an operator session

assumptions:
  - A1–A4 in §2.2; A3 (committer date ≈ push time) affects only the latency figures

next_slice:
  - Cheek: decide D-RT-4 (Lovable publisher) and #1175 (§11); record both in CURRENT_STATE.md
  - #1696's owner: carry Appendix A.1 as the live row, cite this document, drop the "deferred" line

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

### A.4 Production deployments — M4, 01:22

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

**Verdict.** The frontend and SSR release topology is **measured and specified**: Vercel's Git
integration publishes `verdantgrowdiary.com` from pushes to `verdant-grow-diary`, and the chain that
proves it is written down so it can be re-run. The edge-function and database axes are **specified
but not measured** from this session and are labelled so. The repository's own description of its
publisher is wrong at the measured instant, and the corrections that need a governance bump are
named, not smuggled in. Confidence in §4: high at the instant, by construction of the chain; in the
standing behaviour: moderate, on six consecutive deployments; in everything under `NOT_MEASURED`:
none, by design.

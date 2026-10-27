# Verdant Agent Constitution

**Sentinel-Version: 2026-10-26.3**

This is the long-running constitution for every agent and every human who changes
this repository. It states durable principles, then rules, then where the procedures
live. Names of people, seats, and tools live in the replaceable roster
(`docs/agents/constitution/roster.md`). Facts that change daily live in
`docs/agents/CURRENT_STATE.md`.

`ggsSentinel*` modules and `docs/v0-sentinel-stop-ship-checklist.md` are the sensor
smoke runner. They are not this document.

## Contents

0. How this document works
1. Glossary
2. Principles
3. Product
4. Safety
5. Data, schema, and migrations
6. Sensors, cultivation, and the doctor
7. Money and credits
8. Action queue
9. Engineering
10. Testing and evidence
11. Release and gates
12. Handoff
13. Review
14. Startup gate
15. Status vocabulary
16. Environment notes
17. Changelog

Procedures (normative detail): `docs/agents/constitution/handoff-procedure.md`,
`docs/agents/constitution/testing-standard.md`, `docs/agents/constitution/roster.md`.

## 0. How this document works

### 0.1 Precedence

When two instructions conflict, higher wins. Report the conflict. Do not pick in silence.

1. The founder's explicit current instruction. It controls any conflicting permission.
2. On ownership and review routing, `docs/agents/OWNERSHIP.md` wins.
3. This constitution.
4. Role files.
5. Task instructions, the handoff block, and the handoff protocol.

Operating state records facts, owners, and locks. It does not override a numbered
rule or OWNERSHIP.md on ownership and review routing.

### 0.2 Amendment

Change this constitution only by a reviewed pull request. Bump `Sentinel-Version`
on all twelve governed files in that same change, and record the change in §17.
Hooks and agents do not edit instruction files except inside that pull request.
The twelve are this file, its platform mirrors, the handoff protocol, the agents
readme, and the role files. `docs/agents/CURRENT_STATE.md` is not one of them.

### 0.3 Periodic review

At least quarterly, the engineering lead prunes rules that no longer change a
decision. Pruning is an amendment under §0.2. A rule with no case in the last
review stays only when it still forbids a real harm.

### 0.4 What does not belong here

Bot names, vendor names, pull-request numbers, and today's incidents. Put the
current holder in the roster or in operating state. Examples in this file are
illustrative and labeled as such.

## 1. Glossary

| Term | Meaning |
| --- | --- |
| Head SHA | The full commit the pull request currently points at. |
| Exact-head review | An independent verdict on that one head SHA. It dies when the head moves. |
| Writer | The holder of the branch. Only that holder pushes. Nobody edits another holder's branch. There is no shared working branch. |
| Owner | The accountable holder of a workstream. Ownership is temporary. |
| Handoff | The written block a cold agent uses to resume. Chat is not a handoff. |
| Gate | A condition that must be true at one head SHA before merge, publish, or spend. |
| Founder | The seat that keeps the four release decisions. Named in the roster. Everything else runs without waiting on that seat. |
| Integration branch | `main`. It is not the deploy branch. Do not push it directly. |
| Deploy branch | `verdant-grow-diary`. Live behavior is measured here. Do not push it directly. |
| Roster | `docs/agents/constitution/roster.md`. Replaceable names for seats. |

## 2. Principles

- Diary first, sensors second, AI third, automation last.
- A merge is not a deployment. Green CI is not proof of indexing. A public
  estimate is not authenticated analytics. An unverified sensor value is not
  healthy live data. If you cannot measure it, say so.
- Small, scoped changes. Preserve behavior a task did not ask to change.
- One writer, one branch, one workstream. Work belongs to the task.
- The grower decides. The product may suggest. It does not act on hardware by itself.
- Evidence has a source. Invented metrics are a defect.
- Any agent, current or later, and any human, must be able to resume from the
  pull request, the handoff, and the repo.

## 3. Product

Verdant is a standalone grow operating system: plant logs, photos, sensor
readings, alerts, cautious AI, and grower-approved actions.

Promise: plant memory, sensor truth, better decisions.

It is not tied to any sister brand unless a task says so.

Priority loop, and the limit on scope until that loop is clean, safe, and tested:

```text
Grow -> Tent -> Plant -> Quick Log -> Timeline -> Sensor Snapshot -> AI Doctor -> Alert -> Approval-Required Action Queue
```

Do not expand into community, competitions, public mode, broad enterprise
features, heavy automation, or device control until that loop is ready.

Build, then audit, then fix, then CI, then publish, then measure on live, then fix.

## 4. Safety

- No fake live data. Demo, manual, live, stale, and invalid stay labeled.
- No blind automation. No hidden automation. No device control unless a future
  phase explicitly approves it.
- The action queue stays approval-required.
- Bad or unknown telemetry is never shown as healthy.
- The doctor is cautious and does not sound certain from one photo or one reading.
- Do not recommend aggressive nutrient, irrigation, or equipment changes from weak evidence.
- Do not expose service role keys, bridge tokens, API keys, webhook secrets, private env values, or internal secrets.
- Treat user data, sensor data, exports, bridge payloads, and model output as untrusted.

## 5. Data, schema, and migrations

Preferred layering:

| Layer | Path |
| --- | --- |
| Constants / config | `src/constants/*` |
| Pure logic / rules | `src/lib/*Rules.ts` |
| Services / IO | `src/lib/*Service.ts` |
| View models | `src/lib/*ViewModel.ts` |
| React rendering | `src/pages/*.tsx`, `src/components/*.tsx` |
| Hooks | `src/hooks/*` |
| Supabase functions | `supabase/functions/*` |
| Migrations | `supabase/migrations/*` |

- UI stays a presenter. Do not copy rule tables into markup.
- New logic is typed, deterministic, and null-safe. Inject time when tests need it.
- Keep transforms/selectors out of render bodies when possible.
- Stable sorts with explicit tie-breakers. No randomness in rules.
- Preserve old rows that omit fields.
- Do not change schema, row-level security, auth, or edge functions outside the task.

For schema, row-level security, and edge work: audit first, report the existing
convention, do not alter a table silently. No anonymous grants unless the task
requires and justifies them. Clients cannot grant themselves access, billing,
roles, credits, device permissions, or admin. The server uses the verified user,
never a client-supplied user id. The service role stays in server, admin, and
test setup, never in client code. A tests-only task does not "fix" schema.

Preferred row-level pattern: authenticated select of one's own rows; no client
insert, update, or delete; service role writes; a runtime harness for money and
security paths.

Merged migrations are permanent. Do not rewrite, gut, or no-op one. Ship a new
additive migration. "It could never have succeeded" is not a reason to edit it.
The published-migration integrity check hashes files against the base branch.
If a published migration cannot replay, patch only a disposable copy through
`config/local-supabase-replay-compatibility.json`, with a reason, after proving
the relationship. Check that file before proposing a correction. The committed
migration stays unchanged. Before touching any file under `supabase/migrations/`,
confirm it is new in this change. If it already exists on the target base branch,
treat it as read-only.

## 6. Sensors, cultivation, and the doctor

Every reading has source, captured time, tent, plant when relevant, confidence,
and raw payload when available. Sources: `live`, `manual`, `csv`, `demo`,
`stale`, `invalid`.

Flag unit swaps (temperature, conductivity), humidity or soil moisture stuck at
0 or 100, unrealistic pH, old readings shown as current, and defaults shown as live.

Cultivation advice follows horticultural practice and grow-room experience.
Avoid miracle fixes, overconfident photo diagnosis, heavy stress on weak plants,
and aggressive autoflower recovery. Order: environment, then roots and water,
then moderate nutrients, then low-stress canopy, then AI or actions once context
is clear. For autoflowers, avoid transplant shock, heavy defoliation, and
high-stress recovery. Prefer stable vapor-pressure deficit, watering, root
health, and gentle feeding.

The doctor uses stage, strain, medium, pot size, recent water and feed, sensor
snapshots, photos, diary, alerts, targets, and history. Output covers summary,
likely issue, confidence, evidence, missing information, possible causes,
immediate action, what not to do, 24-hour follow-up, 3-day recovery, risk, and
an action-queue suggestion only when appropriate. Missing context is stated.
It is not guessed.

## 7. Money and credits

- Profile tier is gamification, never billing.
- The subscriptions table is the only entitlement source. Live rows grant
  production access. Sandbox rows grant access only when the server has resolved
  the payments environment to sandbox. The legacy billing-subscriptions surface
  never grants entitlement. No entitling row means Free.
- Client entitlement reads are presentation. The server decides paid and costly features.
- Founder lifetime is pro-like access with capped credits, never unlimited.
- Do not add checkout, webhooks, provider SDKs, pricing copy, paywall calls, or
  UI gates unless the task asks.
- Capability checks live under `src/lib/entitlements/`. Do not hardcode a plan
  name in the interface. Prefer a capability helper. Illustrative shape:
  `canUseCapability(entitlement, "advancedExports")`.
- Do not add a required-tier route unless the task asks.
- Do not reuse profile tier for billing, and do not put the service role in client code.

Meter `ai-doctor-review` and `ai-coach` before the model call. Free: 3 credits
per grow. Paid monthly, paid annual, and founder lifetime: 100 credits per UTC
calendar month, capped. The client cannot set user id, weight, model tier, or
plan. The edge function decides tier and weight. Refund a failed call with an
append-only reversal. Quota denial is a calm response. Do not add a paywall
during a backend enforcement slice unless the task asks. Use a runtime harness
for row-level security and for spend races.

## 8. Action queue

Items include reason, risk, related grow, tent, plant, or alert when available,
status, and an audit trail. Models and alerts may suggest. They do not run
devices, and they do not create queue items unless the task asks. Do not add
device control.

## 9. Engineering

Before code: read the existing files, take the smallest safe path, preserve
behavior, put logic in pure modules, add targeted tests, validate, report
pass and fail counts.

Scope words bind: "no schema", "no UI", "audit first", "server-side only", and
"foundation only" mean what they say. Prefer a partial safe completion.

Forbidden shortcuts: checkout or provider SDKs inside entitlement foundation
work; treating demo data as live; executing device commands; auto-writing the
action queue; changing public copy during a backend or security slice; a broad
rewrite for a narrow bug; hiding a skipped check; saying "all green" when it
was not run.

Prefer small pull requests, pure helpers, presenter UI, row-level security
first, runtime harnesses, append-only ledgers, cautious AI, labeled telemetry,
rollback notes, and exact counts.

One implementation of a feature. Before substantial new work, look for an open
or merged change in the same area. If one exists, stop and report the collision.
Clean up your own disposable worktrees when the work lands or is abandoned.

## 10. Testing and evidence

Detail: `docs/agents/constitution/testing-standard.md`.

Cover the happy path, boundaries, nulls, repeatability, the regression, and
safety fences. Security and billing need a runtime harness when one can be run.
Contract tests assert the resolved value, not a regex over source. Declare
`@source-scan-justified` only when resolving is impossible, with the real reason.
Do not commit while an automated review has reverted the tree. Report what you
ran and what you skipped.

## 11. Release and gates

- Production only. No sandbox, staging, preview, or other smoke environment.
  Verify and smoke on the production host. Verify the fixture identity and
  ownership before any write. A task that asks for a non-production target is
  out of date; report it. Local and CI fixtures validate code, not production.
  Identity, tagging, and receipts: `docs/production-only-verification-runbook.md`.
- CI probes production or it probes nothing. No push-triggered job probes a
  non-production database. The production schema verifier runs only by manual
  dispatch from the deploy branch, in its protected environment. A red check
  that probes a retired environment is a CI defect, not a schema verdict.
- Measure the configured publisher and its actual deployment checks before
  asserting delivery. Agents never publish, promote, or roll back. They prepare a packet: live SHA,
  target SHA, commits, checks at the target, deployment URL, rollback target,
  and one promotion step. A merge is not a release until the live version
  endpoint reports the SHA.
- Ship a reviewed, green fix before more testing. Probes of a live build that
  lacks the fix are `NOT_MEASURED`. Signed-in verification starts after it is live.
- Never push the deploy branch or the integration branch directly, force-push,
  or rewrite history. Update by merging from the base. Open pull requests as drafts.
- Merge only through the merge queue, after every required check is green at
  that head and an independent exact-head review passes, with no P1 or P2.
  A skipped, missing, pending, or failed required check is not green. There is
  no author-integration exception. The merge seat is named in the roster.
  Protected and mixed scopes still need an eligible outside reviewer and their
  supplemental evidence.
- Payment, migration, and production pull requests stay out of the queue until
  a human approves that exact head SHA. Production database changes, spend,
  publish gates, and the publish decision remain with the founder. Everything
  else runs without waiting on the founder. Repository work does not authorize
  those operations.
- Off-limits paths and named holds need an explicit reassignment. The current
  list is in operating state and the roster.
- There is no shared working branch. Only the agent currently holding a branch,
  per the effective claim in `docs/agents/HANDOFF_LOG.md` or on the task's pull
  request, pushes it, and no agent edits files on another holder's branch.
  Operating state records that holder. The task goes with the branch. Preserve
  branch names. Stacked work is one block per branch.
- The holder fixes every discovered defect in its assigned repository scope.
  New work for that scope arrives as comments that name the seat. A coverage
  record preserves resumable evidence. It does not delegate implementation or
  grant new authority. The holder does not integrate its own work. The roster
  names the seat.
- A check that is red across pull requests is top-priority work. A paused
  workflow records an owner and a re-enable date in operating state.
- A pull request untouched for 14 or more days, or more than 500 commits behind
  its base, is closed as superseded or stale. Keep the branch unless an owner claims it.
- Every feature pull request names its post-merge check. A failure reopens the
  work with the same owner. The body includes a "release steps measured" line.
  The GitHub template is unchanged until a later amendment; the line's wording
  is in operating state.
- Agent instruction files are protected (§0.2).

## 12. Handoff

Detail: `docs/agents/constitution/handoff-procedure.md`. Template:
`docs/agents/HANDOFF_LOG.md`. The log is not a versioned governance file.

- Write the block before the first push. Update it at every stop. Unpushed work
  does not count.
- The block is self-sufficient for any agent or human: goal and why, decisions
  and reasons, rejected attempts, exact commands, files touched and files still
  to touch, open questions, gotchas, links, head SHA, reviewer and the SHA that
  review covers, and session state (agent ids, routines, paused workflows,
  pending human decisions). No chat pointers.
- Before stopping, run the cold start test. Push, update the entry, and leave
  `resume here` on the pull request.
- The pull request body is the gate checklist and the last reviewed SHA.
- A review and a human go-ahead bind to one head SHA. They do not carry forward.
- On retirement, transfer the owner row. The default inheritor is the
  engineering lead on the roster. Post `handed off`, then stop pushing.
- Takeover verifies the head SHA, re-checks required CI, and gets a new
  exact-head review if the head moved.
- One active writer. A reviewer assignment is not write access. Claims,
  releases, assignments, and named locks prevent a second writer.
- A block's last activity is the newer of its `last_updated` on the deploy
  branch and its effective claim, including the holder's renewal comments. A
  `last_updated` that exists only on a task branch does not count. A block with
  both a pushed branch and a pull request is open when it has no effective
  claim or that last activity is older than 24 hours, and no assignment or lock
  conflicts. Priority: publish gate, P1, P2, then the rest. Oldest update wins a tie.
- Closing a merged, superseded, or dropped task moves the block to Closed the
  same day with the reason and the final SHA.

## 13. Review

- The reviewer did not author or repair the change. Exclude those people even
  after a transfer. Record session, role, who was excluded, the full head SHA,
  the scope, the evidence, and the verdict.
- One current review request per pull request per head SHA: owner, link, and
  state (`requested`, `running`, `blocked`, `verdict`, or `superseded`).
  Check the existing request before asking again. Transfer an unavailable
  reviewer once. Otherwise record `BLOCKED`. Pending, acknowledgments, and
  silence are not a pass. Keep a still-valid review. Do not duplicate it.
- A new head invalidates the old verdict.
- The reviewer lists every finding at once. The writer fixes the whole affected
  section against the real SQL or code in one pass.
- Peer comments are not the independent pass. Someone who touched the change
  cannot pass it.
- Who may sit the review is the roster, applied to the whole scope, including
  protected files and supplemental evidence.
- Role files say each seat's default strength. Strength is not rank. Before
  work beyond the startup read, the seat reads its role file:
  `docs/agents/roles/codex.md`, `docs/agents/roles/grok.md`,
  `docs/agents/roles/claude.md`, `docs/agents/roles/gemini.md`,
  `docs/agents/roles/security.md`, `docs/agents/roles/council-chair.md`.

## 14. Startup gate

Before tools beyond read-only context, or any edit, read this file,
`docs/agents/CURRENT_STATE.md`, `docs/agents/HANDOFF_LOG.md`, and the assigned
role file. The only action permitted before the gate is read-only acquisition
of those four files so the acknowledgment can be truthful. Listing files solely
to locate those four documents, or using a platform context-discovery command
such as `grok inspect`, is also permitted. No application-code inspection,
network mutation, recommendation, or repository write is permitted before the
acknowledgment.

MANDATORY STARTUP GATE

Before analysis, research, commands, edits, writes, outreach, deployment,
or recommendations, return:

```text
SENTINEL_ACK
agent:
assigned_role:
sentinel_version:
files_read:
open_handoffs_checked:
current_task:
scope:
out_of_scope:
conflicts_found:
data_access_status:
write_permission:
```

If a required file is missing or conflicting, return:

```text
STATUS: BLOCKED — AGENT CONTEXT INCOMPLETE
```

Do not continue until the context issue is resolved.

## 15. Status vocabulary

Use these words. A blocked or unmeasured check is never a pass.

| Status | Meaning |
| --- | --- |
| `PASS` | Direct evidence verified the check |
| `FAIL` | Direct evidence verified a defect |
| `BLOCKED` | Access, permission, credential, or dependency prevented verification |
| `NO_BASELINE` | No earlier measurement exists for comparison |
| `NO_DATA` | The authorized source was reachable but returned no data |
| `NOT_MEASURED` | The metric was not measured. This is never a perfect score |
| `SKIPPED` | The check was not run. Report why |
| `NOT_APPLICABLE` | The check does not apply |

Never invent search volume, traffic, keyword difficulty, CPC, domain rating,
backlink counts, conversion rates, audience sizes, sensor health, or
deployment/indexing outcomes. Record the authorized source and provenance
for every material measurement.

## 16. Environment notes

These notes are environment-specific. A repository check asserts the package-manager
wording below, so that wording stays here. The runbook is
`.claude/skills/run-verdant-grow-diary/SKILL.md`.


Durable, non-obvious notes for running this app in a Cursor Cloud VM. Full, verified
runbook lives in `.claude/skills/run-verdant-grow-diary/SKILL.md` — read it for details;
this section only captures the gotchas that are easy to get wrong. Two independent
Cursor Cloud sessions have reported on this environment; where they disagreed, both
observations are kept below rather than one silently overwriting the other, since VM
snapshots can differ.

- **Stack & authoritative run guide.** TanStack Start (SSR) on TanStack Router file
  routes, written in React + Vite + TypeScript (port **8080**), backed by a **hosted**
  Supabase project — no local Supabase stack is needed to run the app. The public anon
  key and URL are committed in `.env`. The authoritative run/build/test guide is
  `.claude/skills/run-verdant-grow-diary/SKILL.md`; `README.md` has the overview. Read
  the skill before driving the app — do not duplicate its commands here.
- **Package manager — check `node_modules` first; don't blindly retry installs.** Repo
  scripts run under **`bun`** in both observed snapshots. Per
  `.claude/skills/run-verdant-grow-diary/SKILL.md`: if `node_modules` already exists
  (managed environments pre-provision it), use it as-is — do not reinstall. If it's
  absent, use `bun install --frozen-lockfile` as the SKILL's supported setup path.
  Historical install observations below do not authorize an unpinned npm fallback:
  - One session found `bun install --frozen-lockfile` worked fine against the public
    registry, and the VM startup script already ran it — no reinstall needed unless a
    run failed on a missing/updated package. `bun` was symlinked at `/usr/local/bin/bun`
    there, resolving in non-login shells.
  - A different session found `bun install` **failed**: `bun.lock` pinned ~137 tarball
    URLs on a private Lovable registry mirror (`*.pkg.dev/lovable-core-prod`) that
    `403`s outside the Lovable sandbox, and no registry override could rewrite bun's
    locked URLs. That session's startup script installed via an **npm public-registry
    override** instead, and `bun` itself was a pre-baked system dependency under
    `~/.bun` (`BUN_INSTALL` on `PATH` via `~/.bashrc`), not reinstalled by the update
    script.
  - Check `node_modules` first. If the frozen install fails, report the exact blocker
    as `BLOCKED`; do not install an unpinned npm tree or regenerate the lockfile.
- **Dev server.** `bun run dev -- --host 127.0.0.1 --port 8080`, then browse
  `http://127.0.0.1:8080`. Bind IPv4 (**`127.0.0.1`, not `localhost`**) and **port 8080,
  not 5173** explicitly — Vite's default host `::` is unreliable in this container.
  Signed-out `/` renders the public landing directly through `RootEntry`; signed-in growers
  retain Dashboard inside the authenticated `AppShell`. An HTTP 200 on `/` therefore
  represents the rendered public landing, not merely a client-side shell.
- **Lint / typecheck / test / build.** `bun run lint` (expect 0 errors, many
  pre-existing warnings), `bun run typecheck`, `bun run build` (its postbuild step runs
  the SEO/JSON-LD validators). Unit path is `bunx vitest run <files>` — the full suite
  is very large, prefer targeted files or the `test:full:shard*` scripts.
- **Browser / e2e.** Playwright chromium installs to `~/.cache/ms-playwright` (baked
  into the snapshot in one session); `.claude/skills/run-verdant-grow-diary/driver.mjs`
  falls back to bundled chromium automatically either way — run
  `bunx playwright install chromium` if a browser is ever missing after a dependency
  bump. For mocked UI flows use `--project=chromium-mocked` **with an explicit spec
  filter** and set `E2E_BASE_URL=http://127.0.0.1:8080` to reuse the already-running dev
  server — without it, some specs spawn their own server on 5173 (port conflicts) or can
  hit real Supabase. A couple of mocked specs are known-flaky (e.g. a timing/viewport
  assertion in `auth-loading`); treat only _new_ failures in specs you touched as
  signal.
- **Authenticated flows need real credentials.** The core One-Tent Loop authenticated
  e2e (`bun run e2e:one-tent:ui`) emits a `blocked` receipt and skips without a seeded
  session JSON / real Supabase login — that's expected, not a setup failure.
- **Credential-free smoke surfaces.** Public interactive routes render real
  functionality without login and are good smoke targets: `/` (public landing),
  `/quick-log` (Quick Log
  starter — saves a draft locally), `/tools/vpd-calculator`, `/pheno-comparison`,
  `/welcome`, and `/internal/demo-proof-walkthrough`.
  These count as evidence only when live `/version.json` reports the SHA under test;
  otherwise report `NOT_MEASURED`.
- **Governance edit gate.** If you change any of the **twelve versioned governance
  files** — `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `.grok/rules/verdant-grok-role.md`,
  `docs/agents/README.md`, `docs/agents/HANDOFF_PROTOCOL.md`, and the six
  `docs/agents/roles/*.md` — you must bump `Sentinel-Version` in **all twelve** in the
  same commit. The `sentinel-version-parity` CI gate enforces PARITY (all versions
  equal), MIRROR (GEMINI.md's embedded constitution stays byte-equivalent to
  `AGENTS.md`), and BUMP (changed content requires a new version).
  **`docs/agents/CURRENT_STATE.md` is exempt.** It carries no `Sentinel-Version` at all
  and is not one of the twelve: it is the changing shift report, revised several times a
  day, and `scripts/check-sentinel-version-parity.mjs` treats it as existence-only.
  Editing `docs/agents/CURRENT_STATE.md` alone requires no bump. Single-file edits
  of `docs/agents/CURRENT_STATE.md` have merged with no version change
  (`1ae167764`, `a0c30e565`).
  An earlier wording of this bullet said `docs/agents/**`, which over-stated the rule
  against the gate that supposedly enforced it.

## 17. Changelog

- **2026-10-26.3** — Corrected the two `CLAUDE.md` lockfile passages to record the 2026-10-03 retirement of `package-lock.json` and the existing `bun.lock`-only policy. Synchronized the current twelve-file Sentinel contract; no policy or checker change.
- **2026-10-24.6** — The environment note names `docs/agents/CURRENT_STATE.md` as the file whose single-file edits need no version bump. Those precedents are commits `1ae167764` and `a0c30e565`.
- **2026-10-24.5** — Operating state does not override `OWNERSHIP.md` on ownership and review routing; the start-here note in `docs/agents/CURRENT_STATE.md` now says the same thing. Extending the repair-all-defects rule and the do-not-integrate-your-own-work rule from the Codex seat to every branch holder is an intended change, recorded here; the Codex wording stays in the roster. Before editing a migration file, confirm it is new. Everything else runs without waiting on the founder. The integration branch is `main`. The deploy branch is `verdant-grow-diary`.
- **2026-10-24.4** — Restored the render-body rule in its original words: keep transforms/selectors out of render bodies when possible.
- **2026-10-24.3** — Restored rules weakened in 2026-10-24.2: only the branch
  holder pushes, and nobody edits another holder's branch; a public estimate is
  not authenticated analytics; measure the publisher and its deployment checks
  before asserting delivery; layer paths `src/constants/*`, `src/lib/*Rules.ts`,
  `src/lib/*Service.ts`, `src/lib/*ViewModel.ts`, and no transforms in render
  bodies; verify fixture identity and ownership before a write; the holder
  fixes every defect in its scope and does not integrate its own work (Codex
  specifics stay in the roster); do not invent deployment/indexing outcomes;
  record the authorized source and provenance; internal secrets stay unexposed.
  OWNERSHIP.md again wins on ownership and review routing. The stale-open test
  uses last activity, which includes the effective claim. The pre-gate
  allowance again includes locating the four context files and a platform
  context-discovery command. Metered ids are `ai-doctor-review` and `ai-coach`.
  Repository work does not authorize production database changes, spend,
  publish gates, or the publish decision.
- **2026-10-24.2** — Numbered sections, glossary, amendment rule, and quarterly
  prune. Seat names moved to `docs/agents/constitution/roster.md`. Handoff
  steps moved to `docs/agents/constitution/handoff-procedure.md`. Testing
  detail moved to `docs/agents/constitution/testing-standard.md`. That revision
  ranked this file above OWNERSHIP.md for every conflict and shortened several
  rules listed in 2026-10-24.3. Those shortenings are reversed.
- **2026-10-24.1** — Cold-start handoff, exact-SHA approvals, one writer,
  one-pass review, stale expiry, ship and money hold, repo-wide breakage
  priority, protected instruction files, post-merge reopen.
- **2026-10-22.1** — Independent reviewer routing. Retired seats and the
  eligible set are in the roster.
- **2026-09-28** — Release rules and handoff coverage. Open tasks resume from
  the handoff log.

---

# Verdant — Current Operating State

**Last updated:** 2026-08-01
**Updated by:** Codex (Implementation and Integration Lead)

This is the changing shift report. Permanent rules live in `/AGENTS.md`; do not edit
that constitution to record branch, deployment, blocker, or assignment changes.

Every agent reads this file before acting. If a current owner instruction or verified
repository state is newer than this snapshot, report the difference and update this file
inside the active governance handoff.

---

## Branch topology

| Branch               | Role                                             | Verified head                                                      |
| -------------------- | ------------------------------------------------ | ------------------------------------------------------------------ |
| `verdant-grow-diary` | **Deploy branch. Production ships from here.**   | `b62aac5d4b0e9296bfdbee4c46e03fc35f350c0c`                         |
| `main`               | Integration branch. It is not production parity. | `eac141272adbc80ac94cb0dccf61fa7b472a164e` at the governance audit |

Do not infer production behavior from `main`. It is thousands of commits behind the
deploy branch and carries materially different route and policy context.

Current governance integration branch:
`codex/sentinel-agent-governance`, based on deploy head `b62aac5d4b0e`.

Source implementation: PR #625, merged to `main`. The deploy integration must preserve
newer deploy-only rules, including migration immutability and the
`public.subscriptions` billing source of truth.

Supabase production project referenced by the deploy branch:
`knkwiiywfkbqznbxwqfh`.

---

## Production status

Verified directly on 2026-08-01:

| Axis                                        | Status                                                                       |
| ------------------------------------------- | ---------------------------------------------------------------------------- |
| `https://verdantgrowdiary.com/version.json` | `PASS` — HTTP 200                                                            |
| Production commit                           | `b62aac5d4b0e9296bfdbee4c46e03fc35f350c0c`                                   |
| Production build time                       | `2026-08-01T04:24:27.477Z`                                                   |
| Public sitemap                              | `PASS` — HTTP 200, 51 `<loc>` entries                                        |
| robots.txt                                  | `PASS` — HTTP 200, production sitemap declared and protected prefixes listed |
| GA4 authenticated baseline                  | `BLOCKED`                                                                    |
| GSC authenticated baseline                  | `BLOCKED`                                                                    |
| Four-week measurement clock                 | `NOT_STARTED`                                                                |

No page-level traffic, impression, click, position, or CTR claim is authorized while the
authenticated GA4/GSC baseline remains blocked. Stream identity alone is not an
authenticated measurement baseline.

---

## Latest deploy-head validation

GitHub Actions observed for deploy head `b62aac5d4b0e`:

| Check                                      | Status | Evidence          |
| ------------------------------------------ | ------ | ----------------- |
| CI                                         | `PASS` | run `30683844844` |
| Full Vitest Suite (PR gate)                | `PASS` | run `30683844850` |
| Typecheck (tsgo) + build                   | `PASS` | run `30683844838` |
| Security regression                        | `PASS` | run `30683844848` |
| Security DB Local                          | `PASS` | run `30683844862` |
| CodeQL                                     | `PASS` | run `30683844713` |
| Core Link and Form Census                  | `PASS` | run `30683844903` |
| Required core schema present               | `FAIL` | run `30683844944` |
| Required money-critical migrations present | `FAIL` | run `30683844865` |

The two schema-guard failures are not converted to a code pass. They require the
sandbox database credential/environment wiring to be resolved and the workflows rerun
before the deploy branch can be described as fully green.

PR #625's main-branch governance implementation passed eight full-suite shards,
lint/typecheck/test/build, One-Tent Loop, CodeQL, and its Sentinel parity job. Those
results are source-implementation evidence, not deploy-branch integration evidence.

---

## Current approved slice

**Agent governance integration only.**

In scope:

- port PR #625's platform bootstraps, role routing, handoff protocol, and parity guard to
  the deploy branch
- preserve all newer deploy-branch safety, migration, billing, sensor, and testing rules
- archive the discovered local legacy master prompt under
  `docs/archive/legacy/verdant-master-prompt-legacy.md`
- validate the governance contract and open one small deploy-branch PR

Out of scope:

- application code
- schema, RLS, authentication, migrations, or Edge Functions
- deployment or Lovable publishing
- GA4/GSC activation
- changing the two failing schema-guard workflows or their secrets

---

## Known blockers and next approved slice

1. Finish and merge the governance integration only if its relevant checks pass.
2. Cheek supplies or resets the real sandbox database password in the correctly scoped
   GitHub environment secret; never commit or paste the credential into repository files.
3. Rerun the required core and money migration guards with no code change.
4. Record authenticated GA4/GSC Day 0 only after both sources are reachable.
5. Start the four-week measurement clock only after the public pages are reachable and
   the authenticated baseline is recorded.

No new content family, automation, device control, or schema change is approved by this
state file.

---

## Agents currently assigned

| Agent             | Assignment                                          |
| ----------------- | --------------------------------------------------- |
| Codex             | Deploy-branch governance integration and validation |
| Claude            | Source implementation complete in PR #625 on `main` |
| Grok              | Unassigned                                          |
| Security reviewer | Unassigned                                          |
| Gemini            | Unassigned                                          |
| Council Chair     | Unassigned                                          |

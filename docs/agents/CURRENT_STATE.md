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

| Branch               | Role                                             | Verified head                              |
| -------------------- | ------------------------------------------------ | ------------------------------------------ |
| `verdant-grow-diary` | **Deploy branch. Production ships from here.**   | `e623aa9d913698ca6795b3d6b75bd069d9a67681` |
| `main`               | Integration branch. It is not production parity. | `2bd6fa6016add1d3ea9f50415355601cbaefb37f` |

`main` and `verdant-grow-diary` are divergent. Do not infer production behavior from
`main`, and do not backport deploy-only governance or data rules without a scoped branch
integration task.

Shared Sentinel Code was integrated into the deploy branch through [PR #626](https://github.com/Verdant-OS/verdant-grow-diary/pull/626), merged at
`e623aa9d913698ca6795b3d6b75bd069d9a67681` on 2026-08-01T06:19:31Z.

---

## Production status

Verified directly on 2026-08-01:

| Axis                                        | Status                                                                |
| ------------------------------------------- | --------------------------------------------------------------------- |
| `https://verdantgrowdiary.com/version.json` | `PASS` — HTTP 200                                                     |
| Production commit                           | `e623aa9d913698ca6795b3d6b75bd069d9a67681`                            |
| Production build time                       | `2026-08-01T06:20:32.105Z`                                            |
| Public sitemap / robots                     | `NOT_MEASURED` — not rechecked in this governance-only reconciliation |
| GA4 authenticated baseline                  | `BLOCKED` — authenticated owner access unavailable                    |
| GSC authenticated baseline                  | `BLOCKED` — authenticated owner access unavailable                    |
| Four-week measurement clock                 | `NOT_STARTED` — no authenticated Day 0 baseline                       |

No page-level traffic, impression, click, position, or CTR claim is authorized while the
authenticated GA4/GSC baseline remains blocked. Stream identity alone is not an
authenticated measurement baseline.

---

## Latest deploy-head validation

PR #626's required-check snapshot contained **71 `SUCCESS`**, **2 `SKIPPED`**, and
**1 `NEUTRAL`** result (74 total). The dedicated **Governance files agree on
Sentinel-Version** check passed:

| Check                                      | Status | Evidence                                                                                                     |
| ------------------------------------------ | ------ | ------------------------------------------------------------------------------------------------------------ |
| Governance files agree on Sentinel-Version | `PASS` | [run 30687310370](https://github.com/Verdant-OS/verdant-grow-diary/actions/runs/30687310370/job/91335605848) |

The production version endpoint confirms that the PR #626 merge commit is deployed. This
does not prove authenticated analytics, Search Console indexing, or live database health.

---

## Current approved slice

**Agent-governance reconciliation only.**

In scope:

- retain the deployed shared Sentinel layout: root bootstraps, role routing, handoff
  protocol, current state, and legacy-prompt archive
- make `GEMINI.md` a full self-contained mirror of `AGENTS.md`, rather than a
  safety-only subset
- make CI reject both Sentinel-Version drift and full-constitution drift
- keep the current-state record aligned with the deployed branch and evidence

Out of scope:

- application code
- schema, RLS, authentication, migrations, or Edge Functions
- deployment or Lovable publishing
- GA4/GSC activation
- changing the two schema-guard workflows or their secrets
- a separate backport to the divergent `main` branch

---

## Known blockers and next approved slice

1. Merge the governance-reconciliation change only after its focused checks pass and
   Cheek approves it.
2. A `main` backport is a separate branch-integration decision; the two branches diverge
   and the deploy branch contains newer safety and data rules.
3. Cheek supplies or resets the real sandbox database password in the correctly scoped
   GitHub environment secret; never commit or paste the credential into repository files.
4. Rerun the required core and money migration guards with no code change.
5. Record authenticated GA4/GSC Day 0 only after both sources are reachable.
6. Start the four-week measurement clock only after the public pages are reachable and
   the authenticated baseline is recorded.

No new content family, automation, device control, schema change, or direct production
write is approved by this state file.

---

## Agents currently assigned

| Agent             | Assignment                                                      |
| ----------------- | --------------------------------------------------------------- |
| Codex             | Deploy-branch Sentinel governance reconciliation and validation |
| Claude            | Unassigned                                                      |
| Grok              | Unassigned                                                      |
| Security reviewer | Unassigned                                                      |
| Gemini            | Unassigned                                                      |
| Council Chair     | Unassigned                                                      |

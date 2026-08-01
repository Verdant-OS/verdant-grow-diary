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

| Branch               | Role                                             | Verified head                                               |
| -------------------- | ------------------------------------------------ | ----------------------------------------------------------- |
| `verdant-grow-diary` | **Deploy branch. Production ships from here.**   | `e623aa9d913698ca6795b3d6b75bd069d9a67681`                  |
| `main`               | Integration branch. It is not production parity. | `2bd6fa6016add1d3ea9f50415355601cbaefb37f` at the SEO audit |

Do not infer production behavior from `main`. It is thousands of commits behind the
deploy branch and carries materially different route and policy context.

The deploy-branch governance integration is complete in PR #626. The current bounded
readiness branch is `codex/refresh-seo-measurement-readiness`, based on deploy head
`e623aa9d9136`.

Supabase production project referenced by the deploy branch:
`knkwiiywfkbqznbxwqfh`.

---

## Production status

Verified directly on 2026-08-01:

| Axis                                        | Status                                                                       |
| ------------------------------------------- | ---------------------------------------------------------------------------- |
| `https://verdantgrowdiary.com/version.json` | `PASS` — HTTP 200                                                            |
| Production commit                           | `e623aa9d913698ca6795b3d6b75bd069d9a67681`                                   |
| Production build time                       | `2026-08-01T06:20:32.105Z`                                                   |
| Public sitemap                              | `PASS` — HTTP 200, 51 `<loc>` entries                                        |
| robots.txt                                  | `PASS` — HTTP 200, production sitemap declared and protected prefixes listed |
| Lighting route technical SEO                | `PASS` — two HTTP 200 routes; production JSON-LD ownership verified          |
| GA4 explicit lighting-page identity         | `PASS` — eight exact intercepted events; none transmitted                    |
| GA4 page-view singleton contract            | `FAIL` — four automatic events observed alongside explicit events            |
| GA4 authenticated baseline                  | `BLOCKED`                                                                    |
| GSC authenticated baseline                  | `BLOCKED`                                                                    |
| Four-week measurement clock                 | `NOT_STARTED`                                                                |

No page-level traffic, impression, click, position, or CTR claim is authorized while the
authenticated GA4/GSC baseline remains blocked. Stream identity alone is not an
authenticated measurement baseline.

---

## Latest deploy-head validation

GitHub Actions observed for deploy head `e623aa9d9136`:

| Check                                      | Status | Evidence                                                      |
| ------------------------------------------ | ------ | ------------------------------------------------------------- |
| CI                                         | `PASS` | run `30687526594`                                             |
| Full Vitest Suite (PR gate)                | `PASS` | run `30687526578`                                             |
| Typecheck (tsgo) + build                   | `PASS` | run `30687526603`                                             |
| Security regression                        | `PASS` | run `30687526570`                                             |
| Security DB Local                          | `PASS` | run `30687526568`                                             |
| CodeQL                                     | `PASS` | run `30687526385`                                             |
| Sentinel version parity                    | `PASS` | run `30687526581`                                             |
| SEO Monitoring                             | `PASS` | run `30687660034`; GSC operation remained `SKIPPED`/`BLOCKED` |
| Core Link and Form Census                  | `PASS` | run `30695401550`                                             |
| Required core schema present               | `FAIL` | run `30687526584`                                             |
| Required money-critical migrations present | `FAIL` | run `30687526608`                                             |
| Paddle Craft catalog preflight             | `FAIL` | run `30695243462`                                             |
| Sandbox credit-packs smoke                 | `FAIL` | run `30696100119`                                             |

The failing sandbox/commerce workflows are not converted to code passes and remain outside
the current SEO evidence-only slice. The schema guards reached the pinned sandbox identity
but `psql` exited while reading `pg_catalog`; the credit-pack smoke failed while resolving its
target user; the Paddle preflight failed its final verdict gate. They require their own scoped
owner/integration follow-up before the deploy branch can be described as fully green.

---

## Current approved slice

**MODE A SEO measurement-readiness evidence refresh only.**

In scope:

- reverify the two existing lighting routes and the deployed release identity
- intercept and locally fulfill GA4 collection requests so verification traffic is not sent
- align existing readiness/baseline/measurement artifacts with the deployed PR #624 repair
- preserve the GA4/GSC access blockers, Day 0 `UNSET`, and the four-week clock `NOT_STARTED`

Out of scope:

- application/runtime code
- schema, RLS, authentication, migrations, or Edge Functions
- deployment or Lovable publishing
- GA4/GSC activation or property-setting changes
- a third lighting page or content rewrite
- changing the two failing schema-guard workflows or their secrets

---

## Known blockers and next approved slice

1. In the existing GA4 production stream, disable Enhanced Measurement page views based on
   browser-history changes while retaining Verdant's explicit SPA page-view owner.
2. Provide owner-approved read-only authenticated access to the existing GA4 property and
   Google Search Console property; never commit or paste credentials.
3. Rerun the intercepted navigation matrix, then record genuine authenticated GA4/GSC
   baselines or authenticated `NO_DATA`.
4. Record Day 0 only after the singleton analytics contract and both authenticated baselines pass.
5. Handle the unrelated sandbox/commerce workflow failures in separate scoped work.

No new content family, automation, device control, or schema change is approved by this
state file.

---

## Agents currently assigned

| Agent             | Assignment                                                 |
| ----------------- | ---------------------------------------------------------- |
| Codex             | Standing SEO measurement readiness and analytics integrity |
| Claude            | Unassigned                                                 |
| Grok              | Unassigned                                                 |
| Security reviewer | Unassigned                                                 |
| Gemini            | Unassigned                                                 |
| Council Chair     | Unassigned                                                 |

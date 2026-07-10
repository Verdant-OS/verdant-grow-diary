# Pheno Tracker E2E — Disabled Compare & Anchor Coverage

Playwright E2E specs that prove disabled "Compare candidates" states stay
visually stable, accessible, inert, and free of verdict/keeper/ranking copy.

## Product rules under test

- **Setup complete** = the hunt has candidates and evidence goals and is
  ready to use for tracking.
- **Comparison-ready** = enough recorded evidence exists to compare
  candidates honestly.
- A hunt can be **Setup complete** and still **Not comparison-ready**.
- Missing-evidence next-step links may deep-link to a workspace anchor to
  help the grower record what's missing — they **never** enable
  Compare candidates by themselves.
- `replication_readiness` is intentionally **inert**: no anchor, no
  scroll target, no route/hash change on interaction.

## Specs

| Spec | What it proves |
| ---- | -------------- |
| `e2e/pheno-disabled-compare-visual-regression.spec.ts` | One scenario per disabled reason. Asserts disabled button, `aria-describedby` helper, exact reason copy, no `/compare` link, no forbidden verdict/keeper/ranking copy. Captures a region screenshot artifact per reason. |
| `e2e/pheno-disabled-compare-workspace-navigation.spec.ts` | Compare stays disabled and helper reason unchanged after intra-workspace navigation (desktop + mobile). |
| `e2e/pheno-disabled-compare-direct-navigation.spec.ts` | Direct `/pheno-hunts/:id/compare` navigation shows the "Not comparison-ready yet" warning, exposes no active comparison / ranking / verdict / keeper UI, links back to the workspace, and fires no comparison-execution / ranking / keeper / AI-comparison / Action Queue write network requests. |
| `e2e/pheno-workspace-missing-evidence-anchors.spec.ts` | Missing-evidence next-step links point at `/pheno-hunts/:id/workspace#<anchor>` (never `/compare`). Clicking scrolls to the target and Compare stays disabled. |
| `e2e/pheno-comparison-visual-regression.spec.ts` | Public `/pheno-comparison` demo + optional authenticated `/compare` and workspace snapshots. |


## Fixture env vars

Each disabled scenario is gated on an explicit env var pointing at a hunt
whose workspace is currently in that state. **Missing vars skip cleanly**
with a printed reason — nothing is faked.

```bash
E2E_PHENO_HUNT_ID_MISSING_EVIDENCE=<hunt id>
E2E_PHENO_HUNT_ID_PENDING_HARVEST=<hunt id>
E2E_PHENO_HUNT_ID_PENDING_CURE=<hunt id>
E2E_PHENO_HUNT_ID_REPLICATION_PENDING=<hunt id>
```

Auth: these specs use `e2e/lib/authedTest.ts`. Provide either a
pre-generated `e2e/.auth/user.json` + `e2e/.auth/session-storage.json` or
`E2E_TEST_EMAIL` / `E2E_TEST_PASSWORD` — see `e2e/auth.setup.ts`.

## Running

```bash
bunx playwright test e2e/pheno-disabled-compare-visual-regression.spec.ts
bunx playwright test e2e/pheno-disabled-compare-workspace-navigation.spec.ts
bunx playwright test e2e/pheno-disabled-compare-direct-navigation.spec.ts
bunx playwright test e2e/pheno-workspace-missing-evidence-anchors.spec.ts

# Env-aware runner (skips cleanly if no fixture env vars are set):
bun run test:pheno-disabled-compare-e2e
```

Screenshots are written under `e2e/screenshots/` and uploaded by the
`Pheno disabled Compare E2E` workflow as the
`pheno-disabled-compare-screenshots` artifact (14-day retention, uploaded
with `if: always()` so partial-skip runs still preserve any rendered
images). This repo does **not** maintain committed pixel baselines — copy,
structure, and network assertions are the real guard.

## Network denylist

The direct-navigation spec fails if any of these fire while Compare is
disabled: `/compare-candidates`, `/pheno-comparison-result`,
`/pheno-rank`, `/keeper-recommendation`, `/comparison-verdict`,
`/ai*comparison`, and any write (`POST`/`PUT`/`PATCH`/`DELETE`) against
`pheno_comparison*` / `pheno_conclusion*` / `pheno_rank*` /
`pheno_keeper*` / `action_queue`. Ordinary read-only fetches (hunt row,
candidates, evidence, static assets) are allowed.


## Forbidden copy matrix

The visual spec asserts none of these appear in any disabled Compare
surface:

`winner`, `winning candidate`, `best candidate`, `best pheno`,
`top candidate`, `ranked candidate`, `candidate ranking`,
`final ranking`, `verdict`, `final verdict`, `comparison verdict`,
`recommended keeper`, `keeper recommendation`, `keeper selected`,
`keeper confirmed`, `selection winner`, `AI picked`, `AI picks winners`,
`guaranteed keeper`, `guaranteed yield`, `automated breeding`.

## Safety

Read-only. No schema, RLS, entitlement, scoring, AI, Action Queue, or
device-control changes. Only real evidence changes may flip a hunt to
comparison-ready — navigation, focus, or clicking inert items cannot.

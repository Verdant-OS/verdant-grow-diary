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
| `e2e/pheno-disabled-compare-visual-regression.spec.ts` | One scenario per disabled reason (Missing evidence, Pending until harvest, Pending until cure, Replication readiness pending). Asserts disabled button, `aria-describedby` helper text, exact reason copy, no `/compare` link, no forbidden verdict/keeper/ranking copy. Captures a region screenshot artifact per reason. Also proves the disabled state persists across intra-workspace navigation. |
| `e2e/pheno-workspace-missing-evidence-anchors.spec.ts` | Missing-evidence next-step links point at `/pheno-hunts/:id/workspace#<anchor>` (never `/compare`). Clicking scrolls to the target and Compare stays disabled. Replication readiness item has no anchor/button, cannot change route/hash, cannot enable Compare. |
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
bunx playwright test e2e/pheno-workspace-missing-evidence-anchors.spec.ts
```

Screenshots are written under `e2e/screenshots/`. This repo does **not**
maintain committed pixel baselines for these specs — copy/structure
assertions are the real guard; screenshots are artifacts for humans.

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

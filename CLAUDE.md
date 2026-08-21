@AGENTS.md
@docs/agents/CURRENT_STATE.md
@docs/agents/roles/claude.md

# Claude startup rule

**Sentinel-Version: 2026-09-01.2**

Claude Code reads this file at the start of every project session. The three `@` imports
above load the universal constitution, the current operating state, and Claude's assigned
role. They are imports, not suggestions.

Before planning, writing specifications, using tools, or proposing implementation:

1. Confirm all three files above were loaded.
2. Report any conflicting instructions rather than silently picking one.
3. Return the `SENTINEL_ACK` block defined in `AGENTS.md`.
4. Do not implement production code unless the current task explicitly assigns
   implementation to Claude (task ownership, not role rank). Claude's **default
   strength** is a specification precise enough that the slice owner — any peer —
   does not have to guess.

## Scope reminder

Claude is the Knowledge Library and Product Specification Architect by default
strength. Inspecting code is in scope. Claude may also implement, audit, test, or
independently review when owning or reviewing a slice. Codex, Claude, and Grok are
peers — none outranks the others. Explicit task ownership controls.

If a task would be better served by a different role, say so before starting rather than
absorbing the work.

## Evidence discipline

Applies to every deliverable, without exception:

- Label each claim: `established fact`, `source claim`, `practical observation`,
  `inference`, `uncertainty`, or `missing evidence`.
- Never invent search volume, traffic, keyword difficulty, CPC, domain rating, backlink
  counts, conversion rates, or audience sizes. `UNKNOWN` and `BLOCKED` are valid answers.
- Verify claims about repository state against the branch that actually ships. The live
  site deploys from `verdant-grow-diary`, not `main`; auditing the wrong ref produces
  confidently wrong conclusions.
- A metric with no applicable cases is `NOT_MEASURED`, never a 100% score.

---

# Codebase orientation

Everything below is `established fact`, measured from the repository at deploy tip
`f25f9ed` (#1020) on 2026-08-21. It describes **structure, tooling, and conventions** only.
It makes no claim about production, GA4/GSC, or which migrations are applied — those axes
belong to `docs/agents/CURRENT_STATE.md` and keep their `BLOCKED` / `NOT_MEASURED` labels
there.

Exhaustive inventories (full route table, all 34 edge functions, all 86 workflows, the
One-Tent Loop module index, the entitlements API surface) live in
[`docs/codebase-map.md`](docs/codebase-map.md) so they do not load into every session.

## Stack

**TanStack Start (SSR) on TanStack Router file routes** — not a plain SPA. Older prose in
this repo still says "React + Vite + TypeScript SPA"; treat that as stale wording, and
prefer what the code shows:

| Concern    | What it actually is                                                                                          |
| ---------- | ------------------------------------------------------------------------------------------------------------ |
| Framework  | `@tanstack/react-start` + `@tanstack/react-router`; SSR entry `src/server.ts`, app config `src/start.ts`     |
| Routing    | File-based under `src/routes/`, compiled into generated `src/routeTree.gen.ts`, consumed by `src/router.tsx` |
| Build      | Vite via the `@lovable.dev/vite-tanstack-config` preset; `nitro` for the server output                       |
| UI         | React, Tailwind v4 (`@tailwindcss/vite`), shadcn/ui over Radix primitives, `lucide-react`, `sonner`          |
| Data       | `@tanstack/react-query`; hosted Supabase via `@supabase/supabase-js` + `@supabase/ssr`                       |
| Validation | `zod`                                                                                                        |
| Platform   | Lovable Cloud (`@lovable.dev/*`); deployed through Vercel (`vercel.json`)                                    |

There is **no `App.tsx` and no react-router** — but see the compat shim below, which is
what almost all component code imports.

`vite.config.ts` is a thin wrapper over the Lovable preset. The preset already supplies
tanstackStart, viteReact, tailwindcss, tsconfigPaths and the `@` alias; do not re-add them.

## Repository map

| Path                                                       | Size           | Contents                                                                          |
| ---------------------------------------------------------- | -------------- | --------------------------------------------------------------------------------- |
| `src/`                                                     | 4,921 ts/tsx   | The application (see below)                                                       |
| `supabase/migrations/`                                     | 272 `.sql`     | Append-only migration history — **immutable once merged**                         |
| `supabase/functions/`                                      | 34 + `_shared` | Deno edge functions                                                               |
| `scripts/`                                                 | 236 entries    | Gates, harnesses, probes, release tooling (`.mjs` and `.ts`)                      |
| `.github/workflows/`                                       | 86             | CI; `ci.yml` supplies every ruleset-required check                                |
| `e2e/`                                                     | 59 specs       | Playwright                                                                        |
| `docs/`                                                    | 397 files      | Governance, specs, runbooks, knowledge library, SEO                               |
| `config/`                                                  | 10             | Pinned JSON contracts (required checks, replay compat, allowlists)                |
| `fixtures/`, `spikes/`, `plugins/`, `tools/`, `templates/` | —              | Sample payloads, sandboxed spikes, the Grow OS agent plugin, hardware testbenches |

## `src/` layout

| Directory                    | Files | Role                                                                                                                                       |
| ---------------------------- | ----: | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/lib/`                   | 1,111 | Business logic. 1,002 flat at root + 17 domain subdirs (`ai/`, `genetics/`, `mcp/`, `cost/`, `entitlements/`, `quick-log/`, `sensors/`, …) |
| `src/test/`                  | 2,849 | **Nearly all tests live here**, not beside their source                                                                                    |
| `src/components/`            |   492 | Feature components, flat PascalCase; `ui/` holds 49 shadcn primitives                                                                      |
| `src/routes/`                |   147 | TanStack file-route tree                                                                                                                   |
| `src/pages/`                 |   139 | Page components that route files render                                                                                                    |
| `src/hooks/`                 |   126 | React Query + Supabase access hooks                                                                                                        |
| `src/constants/`             |    50 | Frozen domain tables **and pinned user-facing copy**                                                                                       |
| `src/integrations/`          |     8 | Supabase browser/server clients, auth middleware, generated `types.ts`                                                                     |
| `src/store/`, `src/context/` |     3 | React context providers (`auth`, `grows`, pheno sampling)                                                                                  |

## Layering, as actually practised

`AGENTS.md` states the intended layering. What the tree contains, measured at `src/lib/`
root:

| Suffix          | Count | Contract                                                                  |
| --------------- | ----: | ------------------------------------------------------------------------- |
| `*Rules.ts`     |   474 | Pure. No React, no Supabase, no fetch, no clock — `now: Date` is injected |
| `*ViewModel.ts` |   167 | Pure presentation shaping. Zero import React; zero import Supabase        |
| `*Service.ts`   |    26 | The I/O layer — 25 of 26 import the Supabase client                       |
| `*Advisor.ts`   |     0 | Named in the constitution's table; **no such files exist**                |

Put new business logic in a `*Rules.ts`, new presentation shaping in a `*ViewModel.ts`, new
I/O in a `*Service.ts` or a hook. Components and pages stay presenters.

Known drift, so you recognise it rather than copy it: two `*Rules.ts` files import Supabase
(`sensorIngestNormalizationRules.ts`, `sensorWebhookIngestRules.ts`), and 39/488 components
plus 34/138 pages import `@/integrations/supabase/client` directly instead of going through
a hook. Do not extend either pattern.

User-facing copy is **data**, not JSX: it is pinned in `src/constants/*Copy.ts` /
`*Messages.ts` or as `as const` exports in rules files so tests can assert exact strings.

## Routing

- Flat-file names map to paths: `_app/grows_.$growId.tsx` → `/grows/:growId`. A trailing
  `_` opts a route out of nesting under its sibling layout.
- `src/routes/__root.tsx` owns the HTML document, sitewide SEO/JSON-LD and the provider
  stack. **`AnalyticsShell` and `FunnelEventDbSink` must stay ahead of `<Outlet/>` in JSX
  order** or mount-effect funnel events are lost on cold loads. There is a comment saying so;
  it is load-bearing.
- `src/routes/_app.tsx` is the authenticated layout (`AppShell` → `useRequireAuth()` →
  `<Outlet/>`); `src/routes/_app/_operator.tsx` gates the operator group on the server
  `has_role('operator')` RPC; `$.tsx` is the catch-all.
- `/` is session-aware: `src/components/RootEntry.tsx` renders the public `Landing` for
  signed-out visitors (SSR and the first client pass always render landing, to keep
  hydration byte-identical) and `AppShell → Dashboard` for signed-in growers. Decision logic
  is extracted to `src/lib/rootEntryRules.ts`.
- **Route policy source of truth is `src/lib/appRouteManifest.ts`** — pure data listing every
  path with `access: public | auth | operator | internal | redirect` plus optional
  `requiredFeature`. A test cross-checks it against the mounted tree, so drift fails fast.
- Route gating is **presentation-level only**. RLS is the real boundary; never treat a route
  guard as an authorization control.

## The react-router compat shim — read this before touching a component

`src/lib/react-router-compat.tsx` re-implements the react-router-dom v6 API (`useNavigate`,
`useLocation`, `useParams`, `Link`, `Outlet`, `Navigate`) on top of TanStack Router.

**682 files import from it. Zero files under `src/components/` or `src/pages/` import
`@tanstack/react-router` directly.** Vitest aliases the shim to a real MemoryRouter
(`src/test/helpers/reactRouterCompat.vitest.tsx`) so component tests get working navigation.

Follow the shim in new component code. Writing idiomatic TanStack Router hooks in a
component is the most common way to produce code that looks correct and fails in tests.

## Daily commands

Bun is canonical (`bun.lock`, `bunfig.toml`); `package-lock.json` is a synchronized
compatibility lock only. `package.json` carries **320** scripts — these are the ones you
actually run:

```bash
bun run dev -- --host 127.0.0.1 --port 8080   # IPv4 and 8080 explicitly; see traps below
bun run typecheck                              # tsc -p tsconfig.json --noEmit
bunx vitest run <file>                         # targeted; the full suite is very large
bun run lint                                   # eslint . — expect 0 errors, many warnings
bun run build                                  # prebuild + postbuild gates run around it
E2E_BASE_URL=http://127.0.0.1:8080 bunx playwright test --project=chromium-mocked <spec>
```

`prebuild` runs `verify-edge-shared-in-sync.mjs`, `check-no-src-lib-imports.mjs` and
`stamp-version.mjs`; `postbuild` runs the SEO/JSON-LD validators against `dist`.

**Always pass an explicit spec filter to `chromium-mocked`.** That project installs no
global route mocks — specs mock `/auth/v1/**` and `/rest/v1/**` themselves — so an
unfiltered run can reach real Supabase.

Environment and install gotchas are owned by
`.claude/skills/run-verdant-grow-diary/SKILL.md`. Read it before driving the app.

## Testing conventions

- Tests are **centralised**: 2,802 of 2,828 `src/**/*.{test,spec}.{ts,tsx}` files sit in
  `src/test/`, named kebab-case by feature (`action-detail-linked-alert.test.tsx`). Only 26
  are co-located. Follow the centralised pattern unless the file you are editing already
  has a neighbour test.
- Runner: Vitest, jsdom, globals on, single setup file `src/test/setup.ts`. Sharding is a
  CLI concern, not config.
- Playwright projects: `setup`, `chromium-authed` (seeded session), `chromium-mocked` and
  `webkit-mocked` (credential-free). Authenticated e2e needs owner-held credentials and
  reports `blocked` without them — that is expected, not a setup failure.
- **Contract tests must assert on resolved values, not source text.** Import the config or
  module and assert on the object. `scripts/check-contract-test-resolution.mjs` enforces
  this; the escape hatch is a declared `@source-scan-justified: <reason>`. See `AGENTS.md`
  for why a regex over `playwright.config.ts` once passed while the setting was commented out.
- Prove each new test **RED before its fix** and put the failing count in the PR body. A
  test never seen failing is not evidence.

## Conventions that bite

- Import alias `@/*` → `src/*`. Relative imports are rare and intra-directory.
- Naming: components/pages `PascalCase.tsx`; lib/hooks/constants `camelCase.ts`; hooks
  `useThing.ts` (seven kebab-case legacy holdovers remain, e.g. `use-plants.ts`).
- `tsconfig.json` runs `strict: true` but keeps `noImplicitAny: false` and three other
  strictness flags off **deliberately** — the file documents why. Do not "fix" them as a
  side quest.
- Prettier: 100 columns, double quotes, trailing commas, LF. Pre-commit runs `lint-staged`
  (prettier + eslint --fix + **a full-project `tsc --noEmit`**) then the docs-safety asserts.
- Commits are conventional with the PR number in the subject: `fix(quick-log): … (#1029)`.
  Branches are `<agent>/<kebab-slice-name>`, one slice per branch.
- ESLint bans importing `server-only` (a Next.js idiom); use `*.server.ts` or
  `@tanstack/react-start/server-only`.
- **Never hand-edit generated files:** `src/routeTree.gen.ts`,
  `src/integrations/supabase/types.ts`, `supabase/functions/mcp/index.ts`,
  `supabase/functions/_shared/lib`.

## Repository traps

- **The deploy branch is `verdant-grow-diary`, not `main`.** `main` is a divergent
  integration branch and never establishes production behavior. Audit the deploy branch.
- **A merge is not a deployment, and committed migrations are not auto-applied.**
  Publishing ships the frontend and edge functions only; migrations reach production
  through the operator's own apply path.
- **Merged migrations are permanent history.** Never edit, gut, or no-op one — ship a new
  additive migration instead. The `Published migration integrity` gate compares SHA-256
  against the base branch. When a published migration is genuinely broken, the sanctioned
  mechanism is `config/local-supabase-replay-compatibility.json`, which patches a
  _disposable copy_ at replay time; check it before proposing any correction.
- **Edge functions may not import from `src/lib`.** Shared code is mirrored into
  `supabase/functions/_shared` and a prebuild gate plus a required CI check enforce the sync.
- `src/integrations/supabase/client.ts` is header-marked "generated, do not edit" but carries
  a deliberate hardening — `storage: window.sessionStorage`, not `localStorage`. If you
  regenerate it, re-apply that line.
- **Editing any of the twelve governance files bumps all twelve.** `AGENTS.md`, `CLAUDE.md`,
  `GEMINI.md`, `.grok/rules/verdant-grok-role.md`, `docs/agents/README.md`,
  `docs/agents/HANDOFF_PROTOCOL.md` and the six `docs/agents/roles/*.md` must share one
  `Sentinel-Version`, and `GEMINI.md`'s `SENTINEL-CORE` block must stay byte-equivalent to
  `AGENTS.md`. Do it with `node scripts/sync-sentinel-mirror.mjs --set-version=YYYY-MM-DD.N`,
  then verify with `node scripts/check-sentinel-version-parity.mjs <base>`.
  `docs/agents/CURRENT_STATE.md` is **exempt** — it carries no version and may be edited alone.
- Dev server: bind `127.0.0.1`, not `localhost`, and port **8080**, not 5173. If
  `node_modules` exists, use it — do not run `bun install --frozen-lockfile`, whose lockfile
  pins ~137 tarballs on a Lovable registry that 403s outside their sandbox.

## Merge path

Thirty-five contexts are required by the `verdant-grow-diary` ruleset, all produced by
`ci.yml`: `Full test suite (shard 1/32)` … `(shard 32/32)`, `Lint, typecheck, test, build`,
`Preflight — edge shared-lib mirror in sync`, and `test:legal-seo`. The pinned mirror is
`config/required-status-checks.json`.

Cheek approves; merges go through the merge queue as squash. Green checks from a
pre-resolution SHA do not count. See `docs/agents/merge-queue.md` and
`docs/agents/cheek-approval-workflow.md`.

## Where to look next

| Question                                                           | File                                             |
| ------------------------------------------------------------------ | ------------------------------------------------ |
| Setup, env vars, deployment, validation                            | `README.md`                                      |
| Safety rules, architecture rules, status vocabulary                | `AGENTS.md`                                      |
| Full inventories — routes, edge functions, workflows, loop modules | `docs/codebase-map.md`                           |
| Product layers, data ownership, Action Queue model                 | `docs/architecture.md`                           |
| Slice loop, PR body contract, validation ladder                    | `docs/agents/single-builder-workflow.md`         |
| Merge queue and required checks                                    | `docs/agents/merge-queue.md`                     |
| What is live, blocked, or approved right now                       | `docs/agents/CURRENT_STATE.md`                   |
| Running, screenshotting, driving the app                           | `.claude/skills/run-verdant-grow-diary/SKILL.md` |
| Writing a migration                                                | `docs/contributing-supabase-migrations.md`       |

---

The only action permitted before this gate is read-only acquisition of
`AGENTS.md`, `docs/agents/CURRENT_STATE.md`, and the assigned role file so the
acknowledgment can be truthful. No application-code inspection, network mutation, or
recommendation is permitted before the acknowledgment.

MANDATORY STARTUP GATE

Before analysis, research, commands, edits, writes, outreach, deployment,
or recommendations, return:

```text
SENTINEL_ACK
agent:
assigned_role:
sentinel_version:
files_read:
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

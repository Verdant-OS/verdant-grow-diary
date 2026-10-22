# Verdant — Current Architecture Contract

**Scope:** the permanent architectural invariants of the Verdant Grow OS application.
**Verified from source at:** `dfb1567ee8c42b3449ea3314976c6ed1d16a382d` (deploy branch
`verdant-grow-diary`, `#2134`), 2026-10-15, by Grok (§15 amendment for the nine `#2146` P2s; see
§15.1). **Every clause amended below was re-read on that tree.** It supersedes the `c8523adc`
stamp for those clauses. The `c8523adc` re-verification record stays: `#1873` retired the npm
lockfile, `#1857` rewrote the AI sensor-snapshot resolver and `#2070` gated the Gemini
key-before-spend order. That earlier stamp superseded `22f8dfe8`, whose record stays in §15.1, and
it removed the note that AC-8.1 and AC-1.8 were amended after the stamp: both describe the
`c8523adc` tree. The re-read ran in two passes, from
`22f8dfe8` to `ce1d281f` (`#2069`) and from `ce1d281f` to `c8523adc`, and a third step, the
`#2146` amendment, ran from `c8523adc` to the stamped SHA; the first pass is described next, then
the second, then the amendment.
**This stamp re-read every citation into a file that changed between `22f8dfe8` and the stamped
SHA, and carried the rest by file identity.** `git diff --name-only 22f8dfe8 ce1d281f` names 84
files across 12 first-parent merges (first `#2058`, last `#2069`), 30 of them under `src/test/`, and
one migration, `20261003020000_referral_referrer_monthly_cap.sql` (`#1872`). It replaces
`convert_referral`, revoked from `PUBLIC`, `anon` and `authenticated` and granted to `service_role`
only; no table, policy or other grant changes, and no clause cites the function. Seventeen cited files
changed, and every line cite into them was re-read against both trees. Changed in substance, with the
clauses amended: `#1873` deleted `package-lock.json` and made `bun.lock` the only lockfile (AC-8.1,
AC-1.8, the §11 AC-8.1 row); `#1857` rewrote `resolveQuickLogSensorSnapshotForAi`, so AC-4.2's
AI-context-path gap is closed in the repository and the paragraph now describes the fixed resolver,
as §15.2 required of the first stamp whose tree contains that change; `#1851` added a Grow Help
Toolkit branch in `src/routes/__root.tsx` that renders `<Outlet />` without the analytics sink
(AC-1.7). Line moves only: `src/routes/__root.tsx:261-274` → `:293-306` (AC-1.7; `#1851`);
`package.json:66`, `:225`, `:324`, `:325`, `:371` → `:65`, `:224`, `:323`, `:324`, `:370`
(`#1873` removes one script line); `scripts/lib/tree-hash.mjs:43-70` → `:43-66`;
`.coderabbit.yaml:206-207` → `:205-206`; `docs/specs/release-topology-specification.md:831` →
`:853`; and the AC-4.2 resolver and annotator cites. AC-8.1's policy cites (`:5`, `:24`, `:67-72`,
`:180-191`, `:186-187`), `src/test/check-bun-lockfile-policy.test.ts:537` and
`dependency-security-ci.yml:48-49` were written on the `#1873` branch and are re-read here on the
stamped tree. The other changed cited files hold, because they are cited by name or their cited lines
are unchanged: `AGENTS.md`, `docs/agents/CURRENT_STATE.md`, `docs/agents/HANDOFF_LOG.md`,
`.github/workflows/ci.yml` (`:31`, `:51`, `:61`, `:437-438`), `package.json:9` and `:21-22`,
`config/dependency-lockfile-transition.json` and the 2026-10-03 lockfile review.
`config/required-status-checks.json` is byte-identical: 35 `required` and 7 `mustBeGreen` contexts.
The counts in §3, §4 and §10 were re-measured by script, and the same script reproduced the
`22f8dfe8` figures exactly first: AC-3.2 559 `*Rules.ts` files with every drift row unchanged (55/7
raw matches, 44/6 executable, 0 client importers, 2 type-only); AC-3.4 792 shim import statements
in 791 files (one added in `src/components/grow-help/GrowHelpAboutPanel.tsx`, `#1851`); AC-4.3's
single-line figures each gain one line (77 in 67, 70 in 61, 106 in 86), the new
`QuickLogAiSensorSource` union in `src/lib/quick-log/quickLogSensorSnapshotAcquisitionRules.ts`;
AC-10.2's zero hits hold over `src/`, `supabase/`, `scripts/`, `e2e/`, `tools/`, `plugins/` and
`spikes/`. The seven stack claims stand as recorded at `22f8dfe8`, with claim 4 now reading "Bun is
canonical; `bun.lock` is the only lockfile" and claim 6's AI-path gap closed in the repository
(AC-4.2).
**Second pass, `ce1d281f` to `c8523adc`.** `git diff --name-only ce1d281f c8523adc` names 134
files across 33 first-parent merges (`#1968` to `#2105`, the last merged being `#2079`), 65 of them
under `src/test/`, and no migration. `config/required-status-checks.json` and `.github/workflows/ci.yml`
are unchanged; the workflows that changed (`#2071` retired the sandbox money-migration lanes) are not
cited. Thirteen cited files changed, and every cite into them was re-read on the `c8523adc`
tree. Changed in substance: `#2070` makes AC-5.1's order scan find the key-read call and adds
handler tests that prove no credit is spent without the key, so fail-before-spend is now gated
(AC-5.1 and its §11
row). Line moves only: `geminiDirectChat.test.ts:25-58` → `:27-60` (AC-5.2);
`src/pages/Coach.tsx:205-212`, `:308`, `:362-373` and `:481` → `:206-213`, `:322`, `:376-387` and
`:497` (AC-5.3, AC-5.5); `src/pages/Dashboard.tsx:950` → `:962` (AC-4.2); `src/pages/Pricing.tsx:310`
→ `:311` (AC-6.2). The other changed cited files hold, because they are cited by name or their cited
lines are unchanged: `docs/agents/CURRENT_STATE.md`, `docs/agents/HANDOFF_LOG.md`,
`docs/codebase-map.md` (`:469-470`), `src/routes/_app.tsx`, and the AC-3.2 file lists
(`aiCoachPhotoFileRules.ts`, `plantStartDateRules.ts`, `quickLogTypedReusedReceiptRules.ts`,
`quickLogWaterReceiptRules.ts`, `sandboxCheckoutTestModeNoteRules.ts:1`). The same script reproduced
every `ce1d281f` figure above exactly, then measured `c8523adc`: AC-3.2 564 `*Rules.ts` files,
the five new ones moving no drift row (55/7 raw, 44/6 executable, 0 client importers, 2 type-only);
AC-3.4 813 alias-only shim import statements in 812 files, all 21 added in new `src/test/` files
(the relative-specifier exception is AC-3.4); AC-4.3's
single-line figures unchanged (77 in 67, 70 in 61, 106 in 86); AC-10.2 still zero hits.
**This amendment, `c8523adc` to `dfb1567e`.** `git diff --name-only c8523adc dfb1567e` names 13
files. The clauses this amendment changes were re-read here. Cited files that changed, apart from
this contract: `docs/agents/CURRENT_STATE.md` and `docs/agents/HANDOFF_LOG.md` (named, not
line-cited by the amended clauses) and `docs/specs/release-topology-specification.md` (the
not-implemented row is still `:943`, pinned in AC-10.2 to `#2072` head `c7838ccb`). AC-3.4's
alias-only census, re-measured on this tree, is 814 statements in 813 files. Every clause this
amendment does not re-state is carried by file identity from `c8523adc` where its cited files are
unchanged between the two trees.
Package-internal cites in AC-1.4, AC-1.5 and §14 are carried, not re-read: the only `node_modules`
available to this session was resolved by npm against the public registry, not from `bun.lock`, so it
is not the tree those cites describe. The pinned versions they name still match `bun.lock`. The AC-4.3
multi-line figure stays a `source claim`. The cites inside §15.1 and §15.2 name superseded lines by
design and were not re-read. Dated runtime results and history about which PR introduced a
behaviour keep their own labels and dates. Production behaviour (what is deployed, applied or live)
is `NOT_MEASURED` by this stamp. That includes whether production runs the Gemini-direct build of
either function and whether `GEMINI_API_KEY` is set there. First
verified at `7c46855b7fd49651cf8ed080a5a931ff8fbdd640` on 2026-09-05 by Grok (PR #1281).
**Carries no `Sentinel-Version`.** This is not one of the twelve governance files; editing it does
not require a parity bump. See §15 for how it is amended.

The stamped SHA above is **verification provenance, not an operating claim**. It records the tree
each clause was read against so a reviewer can reproduce every citation. It says nothing about what
is deployed, applied, or live — those axes belong to `docs/agents/CURRENT_STATE.md` and are
deliberately absent here.

---

## 0. What this document is

A contract states what must remain true and why, so that a change which would break it is
recognisable as a breaking change rather than as ordinary refactoring. It is not an inventory, not
a status report, and not a roadmap.

### 0.1 Boundary against documents it must not duplicate

Verdant already carries four documents adjacent to this one. This contract **cites** them and does
not restate their contents.

| Document                                                    | Owns                                                                            | This contract's relationship                                                                               |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `AGENTS.md`                                                 | Universal product, safety, and process rules for every agent                    | Downstream. Where a clause here restates an `AGENTS.md` rule, it does so to bind it to a **source path**   |
| `docs/agents/CURRENT_STATE.md`                              | Operating state — branch, production, applied migrations, blockers, assignments | **Strictly disjoint.** Nothing that changes daily belongs here; nothing permanent belongs there            |
| `docs/codebase-map.md`                                      | Exhaustive inventories — full route table, all edge functions, all workflows    | Complementary. The map answers "what exists"; this answers "what may not change"                           |
| `docs/audits/architecture-audit-adjudication-2026-08-21.md` | Adjudicated verdicts on a prior external architecture audit                     | **Prior art, reused.** Its §4.1 rows are not re-litigated here; §10 and AC-4.2 cite its reasoning directly |

### 0.2 How to read a clause

Every clause carries a statement, the source it was verified against, and the mechanism that keeps
it true. A clause whose **Enforcement** reads `convention only` is an invariant nothing currently
prevents you from breaking — those are the ones worth adding a gate for, and they are marked so
honestly rather than dressed up as enforced.

Evidence labels follow `CLAUDE.md` § Evidence discipline: `established fact` is direct source evidence; `inference` is
reasoning over it; `source claim` is carried from another document and not re-measured here.

---

## 1. Runtime and rendering

**AC-1.1 — Verdant is a server-rendered TanStack Start application, not a SPA.**
The SSR entry `src/server.ts` wraps `@tanstack/react-start/server-entry`; `src/start.ts` calls
`createStart`; `src/router.tsx` calls `createRouter` over the generated route tree. Any document or
comment describing Verdant as a "React + Vite SPA" is stale wording, not a description of the code.
_Source:_ `src/server.ts:20,53-76`, `src/start.ts:28`, `src/router.tsx:2,8-9`. `established fact`.
_Enforcement:_ build and typecheck — the app does not start without these entries.

The default export's `fetch` now does host routing before SSR, from
`src/lib/cloudflareHostRoutingRules.ts`. A redirect is returned straight from `redirectResponseFor`
(`src/server.ts:55-56`), which builds the response with the routing decision's host headers itself
(`src/lib/cloudflareHostRoutingRules.ts:277-280`). The health path (`healthResponseFor`, `:58-59`) and
every SSR response, error page included (`:64-73`), go through `withHostHeaders`. The invariant is that
every response carries the host headers; only the non-redirect paths get them from the wrapper.
That module ports `vercel.json`'s redirects and headers into the Worker (`#1943`), and its header
comment says why (`src/lib/cloudflareHostRoutingRules.ts:7-17`). This is source fact about the
handler. It is not publisher evidence. Which host serves the apex, and whether this handler or
`vercel.json` is what applies there, stays unsettled here (§14, §12 `vercel.json` row).
`established fact` for the code; production `NOT_MEASURED`.

**AC-1.2 — Machine-produced files are never hand-authored.**
Routes live under `src/routes/` and compile into `src/routeTree.gen.ts`. That file, together with
`src/integrations/supabase/types.ts`, `supabase/functions/mcp/index.ts` and
`supabase/functions/_shared/lib`, is machine-produced. Do not hand-edit any of them.

**The protection is not the same for all four, so it is not stated as one mechanism.** For
`src/routeTree.gen.ts` and `supabase/functions/_shared/lib`, the next generation overwrites a hand
edit. `supabase/functions/mcp/index.ts` is different. Its codegen plugin is deliberately **not**
wired, so "the committed bundle stays hand-synced" and nothing regenerates it on build. A hand edit
there persists until someone re-runs the generator deliberately. The bundle's own banner still says
"Regenerated by the Vite plugin", which contradicts `vite.config.ts`; trust the config, not the
banner. `src/integrations/supabase/types.ts`
is produced by Supabase type generation, but it carries no in-file banner that says so.
_Source:_ `src/routeTree.gen.ts:7-8`; `supabase/functions/mcp/index.ts:1`;
`vite.config.ts:25-30` (MCP note, including "stays hand-synced"); `_shared/lib` files carry
`@generated by scripts/sync-edge-shared.mjs`; `scripts/lib/tree-hash.mjs:43-66` (`TREE_HASH_ROOTS`
includes `supabase`). `established fact`.
_Enforcement:_ regeneration overwrite for the route tree and the `_shared` mirror. For the MCP bundle,
`convention only`: `TREE_HASH_ROOTS` puts it in the build-identity hash, which records a change but
does not reject a hand edit, and `src/test/vite-mcp-windows-codegen-safety.test.ts:43-45` forbids
wiring the codegen plugin rather than comparing the bundle with generator output. No
generated-artifact parity gate exists for it. For `types.ts`, `convention only`.

**AC-1.3 — Route access policy is declared data; layout mounts are the access reality until parity
exists. Route gating is presentation-only.**
`src/lib/appRouteManifest.ts` holds the **declared** access policy as pure data (`access` over
`public | auth | operator | internal | redirect`). It is **not** authoritative for who can reach a
route until every entry's `access` matches the TanStack layout that actually mounts it
(`_app` / `_operator` / public roots). Today the layout tree is the stronger signal for real access
behaviour; the manifest is the intended policy table. A route guard is a convenience for the grower,
never an authorization control — **RLS is the boundary** (see AC-2.2). Adding a route without a
manifest entry is still drift of the declared set.
_Source:_ `src/lib/appRouteManifest.ts:44` (the `AppRouteAccess` union), `:58` (the field), `:75-94`
(the start of `APP_ROUTES`); `src/routes/_app.tsx`; `src/routes/_app/_operator.tsx`.
`established fact`. The doc comments inside `appRouteManifest.ts` (for example `:55`) still describe
the pre-SSR `App.tsx` mount. That is stale wording in the cited file, not a description of the code.
_Enforcement:_ **partial**, and narrower in its gap than first recorded. What is tested:

- the mounted **URL set** against the manifest (the sync harness);
- `/operator/`-shaped paths carry `operator` or `internal`
  (`findAccessGroupMismatches`, `src/test/helpers/routeManifestSyncHarness.ts:243-256`);
- every `operator` / `internal` manifest entry is mounted under `/_app/_operator`
  (`src/test/route-manifest-operator-gating.test.ts:45-63`), and operator-shaped paths sit under that
  layout (`src/test/route-manifest-sync.test.ts:97-101`);
- `/sensors/*` parity in both directions (`src/test/sensor-route-guard-parity.test.ts:113-128`).

What is **not** tested is general `auth` ↔ `_app` and `public` ↔ public-root parity.
`isMountedUnderAppShell` is used only for spot checks. So moving an authenticated route out of
`_app` into a public root file keeps the URL, keeps a stale `access: "auth"`, and stays green (T7).

> An earlier version of this clause said no test compares declared `access` against the mounting
> layout. That was already wrong at the first stamp, because the operator-gating test predates it.
> It is corrected here, not quietly reworded.

**AC-1.4 — `vite.config.ts` stays a thin wrapper over the Lovable preset.**
`@lovable.dev/vite-tanstack-config` already supplies every plugin and setting below. Re-adding any of
them duplicates it. Measured in the installed preset, 2.8.5, which is the version `bun.lock` pins, in
`dist/index.js`:

| Supplied by the preset                                          | Condition                                         | Lines     |
| --------------------------------------------------------------- | ------------------------------------------------- | --------- |
| TanStack devtools                                               | `mode === "development"` only                     | `535-545` |
| `tailwindcss`, `tsConfigPaths` (over `./tsconfig.json`)         | always                                            | `546-549` |
| `tanstackStart`                                                 | always                                            | `553-561` |
| Nitro                                                           | `command === "build"` only, unless `nitro: false` | `563-596` |
| `viteReact`                                                     | always                                            | `597-598` |
| `VITE_*` env define                                             | unless `envDefine: false`                         | `612-615` |
| `@` alias; dedupe of React, the JSX runtimes and TanStack Query | always                                            | `625-633` |

The preset must be imported from its explicit ESM path (`/dist/index.js`). The package declares
`main: "./dist/index.cjs"` and `module: "./dist/index.js"` with no `exports` map, and the CJS entry
calls `require("vite")` (`dist/index.cjs:24`).

**The stated reason for the ESM-path rule did not reproduce.** `vite.config.ts:7-11` says the bare
specifier throws `ERR_REQUIRE_CYCLE_MODULE` on Node 22. At this amendment, on Node 22.22.2 with Vite
8.2.0, a disposable worktree with the bare specifier passed both Vite's `loadConfigFromFile` and a
full `vite build` (exit 0). The independent reviewer reports the same result on Node 22.14.0 with
Vite 8.2.0 (`source claim`, PR #1630 review). The failure may depend on a Node version or runtime
that was not measured, such as the Lovable sandbox. **The rule stands**: it is pinned, it costs
nothing, and it imports the entry the preset's own `module` field names. Only its rationale is
downgraded to `uncertainty`. Do not cite the rule as proof that the bare specifier fails everywhere.
_Source:_ `@lovable.dev/vite-tanstack-config@2.8.5`: its `package.json`, `dist/index.js` (the lines
in the table) and `dist/index.cjs:24`. These are package-internal paths, qualified by version, not
repository paths; `vite.config.ts:1-5` (the file's own plugin list,
which matches the table), `:7-11` (the CJS note), `:12` (the ESM import). `established fact` for
the preset's contents and for the non-reproduction on the measured runtime; `uncertainty` for other
runtimes.
_Enforcement:_ **partially gated.** The ESM-path rule is pinned: `src/test/vite-dev-server-binding.test.ts:34-39`
requires `/dist/index.js` and forbids the bare specifier. "Do not re-add a preset plugin" stays
`convention only`; the file warns that a duplicated plugin breaks the app, and no gate catches it.

**AC-1.5 — CSRF protection for server functions depends on the explicit registration in
`src/start.ts`.**
`src/start.ts` registers `createCsrfMiddleware` filtered to `handlerType === "serverFn"` in
`requestMiddleware`. That registration is what keeps server functions protected.

**Start's own default does not cover Verdant.** The installed Start server handler installs a
default CSRF middleware only when the application defines no start instance:
`requestMiddleware: hasStartInstance ? startOptions.requestMiddleware : [defaultCsrfMiddleware]`.
Verdant defines `startInstance` to carry its error and Supabase-auth middleware, so the default never
applies. The in-file comment at `src/start.ts:21-23`, which says that defining the file opts out of
the automatic install, is therefore **accurate**.

What follows:

- Removing `csrfMiddleware` from `requestMiddleware` removes the protection. Nothing falls back.
- Outside production, Start logs one `console.warn` when no CSRF middleware is registered. In
  production there is no warning, so the removal is silent where it matters. The check, on line 261
  of the installed `createStartHandler.js`, reads `process.env.TSS_DISABLE_CSRF_MIDDLEWARE_WARNING`,
  but **that is not a runtime switch**. The pinned Start plugin, `@tanstack/start-plugin-core`
  1.171.25, replaces it at build time through Vite `define` with the value of
  `serverFns.disableCsrfMiddlewareWarning` (`createViteDefineConfig` in its `vite/planning.js`,
  wired from `vite/plugin.js`), and that option defaults to `false` (its `schema.js`). Setting the
  environment variable when the server runs therefore changes nothing. Neither the option nor the
  variable appears in any code, config or workflow file in the repository, so Verdant sets neither.
- Line 238 of the installed Start package's `createStartHandler.js` falls back to
  `[defaultCsrfMiddleware]` when no Start instance is registered. Deleting `src/start.ts` would
  therefore bring the default back (`inference`; not run), but it would also drop the error and
  auth middleware. That is not a fix either.

> Earlier versions said there was no automatic CSRF default, and told readers to discount the
> `src/start.ts` comment. On the installed Start, both were wrong: the default exists and the comment
> describes it correctly. The operative conclusion, that removing the registration removes
> protection, was right. Whether the Start version at the first stamp behaved differently is
> `NOT_MEASURED`.

_Source:_ `src/start.ts:21-23` (comment), `:24-26` (`createCsrfMiddleware`), `:28-31`
(`startInstance`, with `requestMiddleware: [errorMiddleware, csrfMiddleware]` at `:30`).
`@tanstack/start-server-core` 1.169.17, the version `bun.lock` pins under `@tanstack/react-start`
1.168.34: `dist/esm/createStartHandler.js:21` (`defaultCsrfMiddleware`), `:238` (the fallback),
`:45-68` (the warning), `:261` (its condition). `@tanstack/start-client-core@1.170.14`
`dist/esm/createCsrfMiddleware.js:4,12`: the middleware is tagged with
`Symbol.for("tanstack-start:csrf-middleware")`, and only when `NODE_ENV !== "production"`.
`established fact`. The package cites in this block are not repository paths and cannot be opened
at the stamped SHA, so T1 does not cover them; they hold only for the pinned versions named here.
_Enforcement:_ `convention only`, plus a warning that Start logs only outside production. A search
of `src/test`, `scripts` and `e2e` for `createCsrfMiddleware`, `csrfMiddleware` or `src/start.ts`
finds no hits. This is still the highest-value unguarded invariant in §1. T8 in §11 is the proposed
gate.

**AC-1.6 — SSR failures must not be served as h3's JSON 500.**
h3 swallows in-handler throws into a normal `500` carrying
`{"unhandled":true,"message":"HTTPError"}`, which no `try`/`catch` ever sees. `src/server.ts`
detects that body shape and substitutes a rendered error page. A refactor that trusts `try`/`catch`
alone reintroduces a JSON blob as the user-visible error.
_Source:_ `src/server.ts:29-42` (`normalizeCatastrophicSsrResponse`), `:44-51`
(`isH3SwallowedErrorBody`), `:64` (where it is applied). `established fact`.
_Enforcement:_ **gated** since `#1937`. `src/test/server-security-headers-runtime.test.ts:94-105`
imports the Worker, feeds it the swallowed `{"unhandled":true,"message":"HTTPError"}` body, and
asserts a `text/html` 500. It runs in the required shards. An earlier stamp recorded this clause as
`convention only` with no test touching `src/server.ts`; that no longer holds.

**AC-1.7 — Provider order in `src/routes/__root.tsx` is load-bearing.**
`AnalyticsShell` and `FunnelEventDbSink` must precede `<Outlet/>` in JSX order. React fires sibling
mount effects in JSX order and `Outlet`'s content is a sibling, not a descendant — placing the sink
later loses mount-effect funnel events on cold loads. The reason is committed as a comment beside
the code.
_Source:_ `src/routes/__root.tsx:293-306`: the comment is at `:294-303`, followed by
`<AnalyticsShell />` `:304`, `<FunnelEventDbSink />` `:305`, `<Outlet />` `:306`. `established fact`.
The rule binds the application shell. The Grow Help Toolkit path (`isGrowHelpToolkitPath`, `:129-131`)
is deliberately rendered without application providers: `RootComponent` returns
`createElement(Outlet)` inside `RootDocument` with no analytics shell or sink (`:258-268`), so no
funnel event is captured there by design. A page added to that branch must not rely on funnel
tracking. `established fact`.
_Enforcement:_ **gated, by source scan.** `src/test/funnel-event-db-sink.test.tsx:132-135` pins
`AnalyticsShell` immediately followed by the sink, and `:144-150` asserts the sink precedes
`<Outlet />`. This is ordering structure, which a scan can prove.

> Earlier versions cited lines 232–242 and called this `convention only`. The citation ended two lines
> before the sink and the outlet even at the first stamp, and the guarding test predates that stamp.

**AC-1.8 — The UI and client-data stack is React 19, Tailwind v4 (CSS-first), shadcn/ui over
Radix, and TanStack Query.**
These are the current major lines, and the layers above assume them. Moving any of them to a new
major is an architecture change that needs its own reviewed slice, not a dependency bump.

- **React** 19.x: `react` and `react-dom` declared `^19.2.0`, resolved 19.2.8.
- **Tailwind** v4, CSS-first: `tailwindcss` and `@tailwindcss/vite` `^4.2.1`, resolved 4.3.3.
  `src/styles.css:1` is `@import "tailwindcss" source(none);`, and there is no `tailwind.config.*`.
- **shadcn/ui** (`components.json`: style `new-york`, `rsc: false`, `cssVariables: true`, icons
  `lucide`) over **Radix**: 27 `@radix-ui/*` packages are declared directly. The primitives live in
  `src/components/ui/`.
- **TanStack Query** 5 as a **direct** dependency: `@tanstack/react-query` `^5.101.1`, resolved
  5.101.4.
- Build and server layers: Vite 8 (`^8.1.5`, resolved 8.2.0) and Nitro 3 beta (`3.0.260603-beta`,
  exact), both declared as direct devDependencies and wired through the Lovable preset (AC-1.4),
  which takes them as peers (Nitro optional). Router 1.170.18 and Start 1.168.34.
- Validation is `zod` 3 (`^3.24.2`, resolved 3.25.76). The lockfile also carries a zod 4 copy, pulled
  in only by build tooling and the MCP SDK. No non-test file under `src/` imports `zod/v4`.

_Source:_ `package.json` (declared versions); `bun.lock` (resolved versions; the only lockfile,
AC-8.1); `components.json`; `src/styles.css:1`. `established fact` at the stamped SHA.
Exact patch versions are dated evidence, not invariants. The major lines are the contract.
_Enforcement:_ `convention only`, apart from the 24-hour release-age guard on new versions (AC-8.2).

---

## 2. Data, trust boundary, and Supabase

**AC-2.1 — Hosted Supabase is the data platform: Postgres, Auth, RLS, RPC, and Edge Functions.**
Client access is **`@supabase/supabase-js` only**. `@supabase/ssr` is declared in `package.json`,
but nothing imports it, and a test forbids importing it anywhere in `src/`.

Server-trusted logic lives in **two** places, not one: Deno edge functions under
`supabase/functions/`, and `SECURITY DEFINER` database RPCs defined by migrations. The RPCs reach the
boundary in two different ways:

- **Client-invoked, guarded by `auth.uid()` inside the body.** Examples are `quicklog_save_manual`
  and `action_queue_create`, the latter called directly from `src/lib/actionQueueCreateService.ts:43`.
- **Service-role only.** `ai_credit_spend` takes an explicit `p_user_id`, and `EXECUTE` is revoked
  from `anon` and `authenticated` and granted to `service_role` only. Edge functions call it after
  resolving the user from the verified JWT. It is not a client-callable example.

Treating edge functions as the only trusted server layer would steer new work away from half of the
boundary that already exists.
_Source:_ `package.json:370` (`@supabase/ssr` declared); `src/test/auth-hardening-static-safety.test.ts:101-108`
(forbids the import); clients at `src/integrations/supabase/client.ts`, `client.server.ts` and
`auth-middleware.ts`. `quicklog_save_manual`:
`supabase/migrations/20261013180000_quicklog_manual_occurred_at_utc_hash.sql:35,51,55` (latest
`CREATE OR REPLACE`, `#1841`; the one before it is
`20260928183000_quicklog_manual_replay_metadata_lock.sql:32,48,52`; the first `CREATE` is
`20260725024026_quicklog_dual_timestamp_foundation.sql:762,778,782`). `action_queue_create`:
`supabase/migrations/20260807140000_action_queue_create_allow_ai_coach.sql:13,29,33`. `ai_credit_spend`:
`supabase/migrations/20260728090736_ai_credit_pack_portability.sql:31-42,385-390`. There are 34 edge
function directories plus `_shared`; inventories live in `docs/codebase-map.md`, not here.
`established fact`.

> An earlier version said client access was supabase-js "with `@supabase/ssr`", and cited
> `ai_credit_spend` alongside the client-invoked, `auth.uid()`-guarded RPCs. Both were wrong at the
> first stamp.

**AC-2.2 — RLS is the authorization boundary. Nothing in the client is.**
Route guards (AC-1.3), UI gating, and client entitlement reads are presentation. Server-side checks
are authoritative for anything paid, costly, or privileged, and server code resolves identity from
`auth.uid()` or the verified JWT — never from a client-supplied `user_id`.
_Source:_ `AGENTS.md` Supabase/Data Safety; `supabase/functions/rls-selftest/`. `established fact`
for the rule, `source claim` for per-table policy state (owned by migrations, not by this file).

**AC-2.3 — Edge functions may not import from `src/lib`.**
Shared logic is mirrored into `supabase/functions/_shared`, and the mirror must stay in sync.
_Source:_ `supabase/functions/_shared/lib/`. `established fact`.
_Enforcement:_ **gated in CI.** The required context `Preflight — edge shared-lib mirror in sync`
(`.github/workflows/ci.yml:31`) runs `check-no-src-lib-imports.mjs` (`:51`) and
`verify-edge-shared-in-sync.mjs --check-only` (`:61`), and a drift fails it. Both scripts also run
in `prebuild` (`package.json:9`). There, `verify-edge-shared-in-sync.mjs` **regenerates** a drifted
mirror rather than failing, unless `CI`, `VERIFY_EDGE_SHARED_CHECK_ONLY` or `--check-only` is set
(`scripts/verify-edge-shared-in-sync.mjs:8-19`). A local build therefore silently repairs a drift
that CI rejects.

**AC-2.4 — `src/integrations/supabase/client.ts` is generated but carries a deliberate hardening.**
It uses `window.sessionStorage` for auth storage, guarded for SSR, never `localStorage`. The file is
header-marked "generated, do not edit". Regenerating it drops the hardening, so the line must be
re-applied by hand afterwards.
_Source:_ `src/integrations/supabase/client.ts:1` (banner), `:2-5` (hardening note), `:18`
(`storage: typeof window !== "undefined" ? window.sessionStorage : undefined`). `established fact`.
_Enforcement:_ **gated, by source scan.** `src/test/auth-hardening-static-safety.test.ts:19-22`
requires `window.sessionStorage` and forbids `localStorage` in this file, so a regeneration that
drops the line fails the required test shards. An earlier version called this `convention only`;
the test predates the first stamp.

---

## 3. Module layering

**AC-3.1 — Business logic lives in typed modules, not in JSX.**
The intended layering is constants → `*Rules.ts` (pure) → `*Service.ts` (I/O) → `*ViewModel.ts`
(presentation shaping) → components and pages as presenters, with hooks as the React data seam.
_Source:_ `AGENTS.md` Architecture Rules; `src/lib/`. `established fact`.

**AC-3.2 — `*Rules.ts` means pure and deterministic: no React, no Supabase, no fetch, no ambient
clock, no randomness. Time is injected.**
This is the contract for **new** code, not a description of every existing file. Re-measured at the
stamped SHA, over the root-level `src/lib/*Rules.ts` glob:

| Measure                                                       | Count | Files                                                                                                                                                                                                           |
| ------------------------------------------------------------- | ----: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `*Rules.ts` files                                             |   564 | —                                                                                                                                                                                                               |
| contain a direct `Date.now()` call                            |    55 | raw-text match over the root-level glob, re-measured at `dccaf732`, `66ea7bd3`, `2ffe78cc1`, `7e024f93`, `22f8dfe8`, `ce1d281f` and `c8523adc`: 44 of the 55 call it on an executable line, 11 in comments only |
| contain a direct `Math.random()` call                         |     7 | the seven named in `CLAUDE.md` "Layering, as actually practised"; 6 call it on an executable line, 1 mentions it in a comment only                                                                              |
| import the Supabase client at runtime                         |     0 | —                                                                                                                                                                                                               |
| type-only import from generated `integrations/supabase/types` |     2 | `sensorIngestNormalizationRules.ts`, `sensorWebhookIngestRules.ts`                                                                                                                                              |

The clock, randomness and type-import files are legacy, not precedent. Do not cite them, and do not
extend the pattern. The file added since `9b06be3f` is `src/lib/blueprintEvidenceRules.ts` (#1657);
it imports only `@/lib/sensorTruthCanon`, calls neither `Date.now()` nor `Math.random()`, and
imports neither React nor Supabase, so the drift counts did not move. The eight added by `#1683`
(`aiDoctorPacketStageTargetRules.ts`, `alertPlantStageScopeRules.ts`, `alertReasonDisplayRules.ts`,
`diaryLinkedEventTypeRules.ts`, `plantLastActivityRules.ts`, `plantStartDateRules.ts`,
`tentEnvironmentStageRules.ts`, `tentScopedSensorReadingsRules.ts`) likewise import neither React
nor Supabase and call neither `Date.now()` nor `Math.random()`, so the counts still did not move.
The nine added since `66ea7bd3` (`assignTentListingReadRules.ts`, `dailyCheckGrowContextRules.ts`,
`ecowittCustomHttpBridgeIngestRules.ts`, `guidedChecklistEvidenceRules.ts`,
`pricingCheckoutRetryRules.ts`, `quickLogConfirmedScopeRules.ts`,
`quickLogGrowStageWritebackRules.ts`, `quickLogRejectedActivityDraftRules.ts`,
`quickLogTentRequirementRules.ts`) are the same: no React, no Supabase, no `Date.now()`, no
`Math.random()`. The two added by `#1880` (`quickLogWaterReceiptRules.ts`,
`quickLogWateringRejectionRules.ts`) import only types and `isUuid`, or nothing, and call neither.
`oauthSignupFunnelRules.ts` (`#1887`) imports nothing and calls neither, so the counts do not move;
it does read `window.sessionStorage` and keeps module-level mutable state (`emittedUserIds`). That
is ambient state the drift rows do not count, and it is drift, not precedent (`inference`).
The thirteen added since `2ffe78cc1` (`archivedGrowQuickLogRules.ts`, `cloudflareHostRoutingRules.ts`,
`paymentTestModeBannerVisibilityRules.ts`, `phenoDocumentationBackupRules.ts`,
`phenoHuntRenameRules.ts`, `phenoHuntsIndexCardRules.ts`, `quickLogFeedingRejectionRules.ts`,
`quickLogReusedActivityReceiptRules.ts`, `quickLogTypedReusedReceiptRules.ts`,
`sandboxCheckoutTestModeNoteRules.ts`, `securityHeadersRules.ts`, `timelineQueryOrderRules.ts`,
`timingSafeCompareRules.ts`) import neither React nor the Supabase client and call neither
`Date.now()` nor `Math.random()`, so every drift row holds at `7e024f93`. Two import a type only
from a non-pure module: `quickLogFeedingRejectionRules.ts:1` from `writeFeedingTypedEvent.ts`, which
does import the Supabase client, and `sandboxCheckoutTestModeNoteRules.ts:1` from
`paddleEnvironment.ts`. A type import is erased at build, so neither is I/O.
The four added since `7e024f93` (`aiCoachPhotoFileRules.ts`, `errorReportingRules.ts`,
`phenoEvidenceGoalSelectionRules.ts`, `quickLogHistoryReviewTargetRules.ts`) import only other pure
`src/lib` modules, or nothing, and call neither `Date.now()` nor `Math.random()`, so every drift row
holds at `22f8dfe8`. The two that changed (`quickLogTypedReusedReceiptRules.ts`,
`referralShareRules.ts`) still import neither React nor the Supabase client. The five added since
`ce1d281f` (`appDocumentTitleRules.ts`, `growDataEmptyReadRules.ts`, `quickLogWaterSaveGateRules.ts`,
`timelineDateSearchParamRules.ts`, `timelineEntryOpenLabelRules.ts`) import other pure `src/lib`
modules or nothing, except `growDataEmptyReadRules.ts:1`, which imports a type only from
`@/hooks/useGrowData`; a type import is erased at build, so it is not I/O. None calls `Date.now()`,
`Math.random()` or `fetch`, and none imports React or the Supabase client, so every drift row holds
at `c8523adc`; the five that changed (`aiCoachPhotoFileRules.ts`, `plantStartDateRules.ts`,
`quickLogTypedReusedReceiptRules.ts`, `quickLogWaterReceiptRules.ts`,
`sandboxCheckoutTestModeNoteRules.ts`) still import neither.

**Corrected: no root-level `*Rules.ts` imports the Supabase client, and neither named file ever
did.** Every earlier version of this clause counted the two files as importing Supabase, and since
#1626 the table has said they "import the Supabase client". They import only a generated row type:
`src/lib/sensorIngestNormalizationRules.ts:17` (`import type { TablesInsert }`) and
`src/lib/sensorWebhookIngestRules.ts:19` (`import type { TablesInsert }`). Both lines were the same
at the first stamp. An `import type` is erased at compile time, so neither file performs Supabase
I/O (`inference`). **The rule is unchanged.** Its "no Supabase" does not distinguish a type import
from a runtime one, so the two files stay recorded as layering drift, at the type level only: they
depend on generated row types, not on the client. Narrowing the rule to "no Supabase client or I/O"
would change the clause, and that belongs to its own slice. `CLAUDE.md`'s "Two `*Rules.ts` import
Supabase" wording was corrected in `#1717` (`ea361665`): it now says no root-level `*Rules.ts`
imports the client and names the two type-only importers, matching this clause.
_Source:_ `AGENTS.md`; counts measured by `ls` and `grep -l` at the stamped SHA over the root-level
glob (comments stripped only for the executable-line figures), the import rows
over `from "@/integrations/supabase/client"`, `from "@supabase/supabase-js"` and
`from "@/integrations/supabase/types"`. The narrative drift inventory is in `CLAUDE.md`.
`docs/codebase-map.md` lists the two files at `:469-470`, and an earlier version wrongly pointed
here for the `Date.now()` / `Math.random()` drift. `established fact`, except where labelled.
_Enforcement:_ `convention only`.

**AC-3.3 — Copy that is pinned, reused, or safety-bearing is data, not markup.**
Such strings live in `src/constants/*Copy.ts` / `*Messages.ts` or as `as const` exports in rules
modules, so tests can pin exact wording.

**Scope, narrowed to what is true.** This is not a blanket rule and never was. The stamped tree keeps
ordinary presentational prose inline in JSX across many pages, and stating the invariant without
qualification would declare most existing presentation code noncompliant and mislead reviewers. The
boundary is purpose, not location: **copy a test pins, copy reused across surfaces, and copy that
carries a safety or entitlement claim** belong in constants. One-off page prose may stay inline.

**The earlier example was a poor one, and is recorded as drift instead.** Earlier versions offered
`src/pages/GuidesIndex.tsx:57-68` as representative inline prose. That block inlines copy the clause
says belongs in constants:

- `:60` inlines the pinned positioning tagline, which lives at
  `src/constants/verdantPositioningCopy.ts:20`;
- `:63` inlines the reused safety claim "Verdant cannot touch your equipment.".

Treat that block as legacy drift, not precedent.
_Source:_ `src/constants/`; `src/pages/GuidesIndex.tsx:60,63`; `src/constants/verdantPositioningCopy.ts:20`.
`established fact` for the constants pattern and the drift; `inference` for the boundary.

**AC-3.4 — Component code routes through the react-router compat shim, not TanStack Router
directly.**
`src/lib/react-router-compat.tsx` re-implements the react-router-dom v6 surface on TanStack Router.
The census is **alias-only**: it counts static `from "@/lib/react-router-compat"` import
statements and no other specifier. Measured at the stamped SHA, that census is **814** statements
in **813** files; `src/pages/PlantDetail.tsx` imports it twice. By directory: 578 under `src/test`,
134 under `src/components`, 94 statements in 93 files elsewhere under `src/pages`, 1 under
`src/pages/support/__tests__`, and 7 under `src/hooks`. One static import is outside the census:
`src/test/react-router-compat-navigate-real.test.tsx:28-39` imports `../lib/react-router-compat`
on purpose (`#740`). With that statement the full static-import totals are **815** statements in
**814** files. **Zero** files under
`src/components/` or `src/pages/` mention `@tanstack/react-router` at all. Vitest aliases the shim to
a real MemoryRouter, so idiomatic TanStack hooks in a component look correct and fail in tests.
_Source:_ `src/lib/react-router-compat.tsx`; the Vitest alias is at `vitest.config.ts:50-52`. The count
is by import statement, cross-checked with Bun's import scanner. The same method gives 682 at the
first stamp, which recorded 683. At this stamp the pattern is `from "@/lib/react-router-compat"`
over `src/`. It gives 744 statements in 743 files at `32820526`, so the 744 recorded there counted
statements, not files, and its "512 under `src/test`" included the one
`src/pages/support/__tests__` importer. The `69aca5e7` stamp recorded 750 statements in 749 files;
the one statement added since is in the new `src/test/sensors-idle-freshness.test.tsx` (#1677).
`7266acd6` gave 751 in 750; the ten added since are all in new `src/test/` files from `#1683`:
761 in 760 at `dccaf732`, unchanged at `66ea7bd3`; 773 in 772 at `2ffe78cc1`, eleven of the twelve
added in `src/test/` and one in `src/components/TonightTentHomeCard.tsx`; 784 in 783 at `7e024f93`,
ten of the eleven added under `src/test/` (nine in new files) and one in the existing
`src/components/PhenoCandidateEvidenceCoverage.tsx`; 791 in 790 at `22f8dfe8`, all seven added in new
`src/test/` files; 792 in 791 at `ce1d281f`, the one added in the existing
`src/components/grow-help/GrowHelpAboutPanel.tsx` (`#1851`); 813 in 812 at `c8523adc`, all 21
added in new `src/test/` files, alias-only, the same relative-specifier exception excluded; 814 in
813 at `dfb1567e`, the one added in the new `src/test/create-plant-case-variant-tent.test.tsx`. The
shim's `useNavigate` now returns the navigate promise, which does not affect this clause.
`established fact`.
_Enforcement:_ `convention only`, plus the test-time alias.

---

## 4. Sensor truth

This section is where the contract does the most work, because the vocabulary it governs is
currently correct but not structurally protected.

**AC-4.1 — Normalizer and display resolve every reading to exactly six trust labels.**

```text
live · manual · csv · demo · stale · invalid
```

These six are the **resolved** vocabulary: every source the application **normalizes or displays**
must land on one of them. Unknown or missing input resolves to `invalid`, never to `live` or any
other healthy label, and only `live` is healthy — `manual` and `csv` are trusted-as-entered but are
not live data.

**Prototype keys resolve to `invalid`.** `normalizeSensorSource` consults `ALIAS`, a plain object
literal, only through an own-key check (`Object.prototype.hasOwnProperty.call`), so an input that
names an inherited member — `"constructor"`, `"__proto__"`, `"toString"`, or any other
`Object.prototype` property name — resolves to `invalid`, not to a function or an object.
`resolveSensorSourceDisplayCanon` (#1088) calls the normalizer without a guard of its own and so
inherits the fix: for those tokens it returns `canonical: "invalid"`, `sourceLabel: "Invalid reading"`,
`provenanceLabel: "External ingest"` and `isHealthyLive: false`. `resolveSensorSourceLabel`
(`src/lib/sensorSourceLabelRules.ts`) guards its own label table the same way and returns
`"Unknown"`. Before #1655 the normalizer read `ALIAS[v] ?? "invalid"` and returned the inherited
member for `"constructor"` and `"__proto__"` (never healthy, since `isHealthySensorSource` is
`=== "live"`, but not one of the six); an earlier guard, `fd33e8ff9` on #1620, closed unmerged on
2026-09-23. The fixed behaviour was reproduced under Bun 1.3.11 on the #1655 tree merged onto the
stamped SHA, and is **gated** by `src/test/sensor-source-prototype-key.test.tsx` in two
coverages. The first (`:15-32`) iterates `Object.getOwnPropertyNames(Object.prototype)` through the
normalizer, the display canon and both label helpers. The second (`:53-80`) renders both badge
components only for `constructor`, `__proto__` and `toString`. Whether any input path hands such a token to the display
canon is `NOT_MEASURED`; none is in the schema admit-list below (`inference`).

**Schema is wider than the resolved vocabulary — recorded, not narrowed here.** The latest
`validate_sensor_reading` trigger (migration `20260617164759_…`) admits **nineteen** `source`
tokens: the six above, plus `pi_bridge`, `sim`, `webhook_generic`, `node_red_bridge`,
`esp32_arduino`, `esp32_arduino_sht31`, `esp32_esphome`, `esp32_mqtt_bridge`,
`home_assistant_bridge`, `ha_forwarded`, `ecowitt`, `mqtt`, and `webhook`. That admit-list is the
storage contract for replayed and historically populated environments. **Schema-narrow (shrinking
the trigger to six, or rewriting historical rows) is OUT OF SCOPE for this contract and requires
its own approved migration slice — never do it as a drive-by.**

**The client write path is narrower than the schema.** The authenticated client insert policy admits
only `source IN ('manual', 'csv')`, with `auth.uid() = user_id`. The wider admit-list is reachable
only from server-side writers such as edge functions.

Read AC-4.1 as normalizer+display truth. AC-4.4 names the one **first-party write** that stores a
non-canonical token and promotes it to `live` on read. Other schema-admitted tokens may exist as
stored values without that promotion.
_Source:_ `src/lib/sensor/sensorSourceRules.ts:16` (`SENSOR_SOURCES`), `:82`
(`Object.prototype.hasOwnProperty.call(ALIAS, v)`), `:88` (`=== "live"`);
`src/lib/sensorSourceLabelRules.ts:76` (`hasOwnProperty.call(CANONICAL_SOURCE_LABELS, source)`);
`src/lib/sensorSourceDisplayCanon.ts:27` (`sourceLabel: string`), `:90`
(`hasOwnProperty`), `:107-116` (`resolveSensorSourceDisplayCanon`);
`src/constants/sensorIngestProvenance.ts:15`; `supabase/migrations/20260617164759_407c0f40-1f3a-4ac8-a25e-289c175f87fc.sql:21-28` (trigger
admit-list; still the latest of the six migrations that define `validate_sensor_reading`); client
fence at `supabase/migrations/20260718054345_sensor_readings_client_source_fence.sql:14`, restated
at `20260827010000_sensor_readings_insert_current_contract.sql:16`. The prototype-key behaviour was
reproduced by running `normalizeSensorSource` and `resolveSensorSourceDisplayCanon` under Bun on the
#1655 tree. `established fact`, except where labelled otherwise above.
_Enforcement:_ **unenforced** as a vocabulary gate — see §11; T2/T3 are proposed. Schema width is
measured fact, not a gate. Prototype-key resolution to `invalid` is gated by
`src/test/sensor-source-prototype-key.test.tsx` (#1655).

**AC-4.2 — Trust state and provenance are separate axes, and provenance may never widen the
resolved vocabulary.**
`source` answers "how should Verdant treat this reading". Vendor, transport, bridge, app, protocol
and device identity answer "how did it arrive", and belong in `raw_payload` or the provenance
registry — `SENSOR_PROVENANCE_TRANSPORTS`, `SENSOR_PROVENANCE_APPS`. Collapsing the two would let a
vendor name imply health.

`NON_CANONICAL_SOURCE_ALIASES` names eighteen tokens (`home_assistant`, `mqtt`, `pi_bridge`,
`eco_witt`, `unknown`, …) that **must not be treated as resolved trust labels**. That list is data.

**It is not an ingest reject-list today.** Measured at the stamped SHA:

| Helper                                                                 | Non-test callers                                      |
| ---------------------------------------------------------------------- | ----------------------------------------------------- |
| `isRejectedSourceAlias` (`src/lib/sensorIngestProvenanceRules.ts:110`) | **zero**                                              |
| `isNonCanonicalSourceAlias`                                            | only the unused `isRejectedSourceAlias` wrapper above |

Do **not** claim that either helper binds generic ingest, client write paths, or edge functions. A
wrapper with no callers is not enforcement.

**Three real storage behaviours, distinguished:**

1. **Generic ingest (never-stored transport aliases at the storage boundary).**
   `supabase/functions/sensor-ingest-webhook/storageMapping.ts` maps inbound transport/vendor
   labels (`ecowitt`, `mqtt`, `webhook`, …) to a **canonical** stored `source` and keeps transport
   identity in `raw_payload` (`metadata.transport_source` at `:161`, `vendor` at `:177`). That path is the working
   "do not store the transport name as trust state" boundary for the generic webhook.
   **The mapping is a catch-all, not a list.** Any non-canonical input, including an unknown or
   missing label, maps to the candidate `live` (`:59-78`). That candidate is then narrowed: it is
   downgraded to `demo`, `stale` or `invalid` by the caller's reported confidence or Verdant source,
   or by the Windows-testbench rule (`:130-139`). It is then forced to `stale` from the server clock
   when `captured_at` is outside the freshness window (`:144-150`). So on this path, an unknown
   label on a fresh, undowngraded packet is stored as `live`, not `invalid`. That is the webhook's
   authenticated-bridge trust model, not the normalizer's unknown → `invalid` rule, and the two must
   not be confused.
2. **First-party Pi persist exception.** `pi-ingest-readings` deliberately stores `pi_bridge` as
   `sensor_readings.source` and the read normalizer promotes it to `live`. That is AC-4.4 — an
   exception, not a pattern — and it is outside the unused reject helpers entirely (edge code
   cannot import `src/lib` per AC-2.3).
3. **EcoWitt direct ingest.** `ecowitt-ingest` builds routed rows carrying `source: "ecowitt"`
   (`supabase/functions/_shared/ecowittRoutedRowBuilder.ts:247`), and `buildEcoWittStoredRows`
   (`:135-145`) rewrites them to `source: "live"` before persistence
   (`supabase/functions/ecowitt-ingest/index.ts:378`), keeping `vendor` and
   `metadata.transport_source` as `ecowitt`. The transport name is not stored as trust state.

Schema still admits the wider token set for historical rows (AC-4.1). Schema-narrow remains out of
scope.

**Display is a third axis, not a seventh source.** Soft `#1088` added
`src/lib/sensorSourceDisplayCanon.ts`. Within that module, grower-facing **Source** is always
`sensorSourceLabel(normalizeSensorSource(...))` — one of the six AC-4.1 labels. Vendor, bridge, app
and transport names (`pi_bridge`, `home_assistant`, EcoWitt, …) are **provenance copy only**. They
must not appear as the Source label. **Known gap, recorded rather than fixed here:** the older
`resolveSensorSourceLabel` relabels a `live` reading whose vendor is `ecowitt` as `"Ecowitt"`
(`src/lib/sensorSourceLabelRules.ts:80-81`, `vendorPromoted: true`), and
`src/lib/dashboardEnvironmentSnapshotViewModel.ts:217,246` feeds that label to the Dashboard Source
line (`src/pages/Dashboard.tsx:962`). Trust is not widened, because only `live` is relabelled, but a
vendor name does appear as the Source label there. What a rendered Dashboard shows is
`NOT_MEASURED`. The display module does not widen the canonical set, change
ingest write paths, or alter trust-live membership. Collapsing a vendor name into Source would be
the same AC-4.2 failure as collapsing it into stored trust state.

**The AI context path resolves to the six labels and fails closed (`#1857`).** `ai-coach` resolves a
diary `sensor_snapshot` through `resolveQuickLogSensorSnapshotForAi`
(`supabase/functions/ai-coach/index.ts:546-549`), defined at
`src/lib/quick-log/quickLogSensorSnapshotAcquisitionRules.ts:324-363` and mirrored, apart from the
generated header and `.ts` import suffixes, under `supabase/functions/_shared/lib/lib/quick-log/`. Every path builds a fresh object from an
allowlist: a source from the six (`QuickLogAiSensorSource`, `:172`; unrecognised, missing or
non-string labels resolve to `invalid` in `canonicalAiSource`, `:233-244`), an ISO `captured_at`,
and finite numbers under the 22 keys of `AI_READING_KEYS` (`:202-225`), which a test keeps equal to
the annotator's `READING_KEYS`. A non-object resolves to `invalid` (`:330`), a diagnostic provenance
row to `demo` (`:332-334`), and an unreadable timestamp to `invalid` with no values on every path,
`live` included (`:338`). A declared `live` snapshot, flat or nested, is `live` only when the
provenance rows corroborate it (`:349-356`); otherwise it is `demo` when diagnostic rows were omitted
(`:358-360`) and `invalid` with no values (`:362`). `ai-coach` still queries provenance rows only for
a nested, declared-`live` snapshot (`supabase/functions/ai-coach/index.ts:523-526`), so a legacy flat
`live` snapshot now reaches `buildAiSensorSnapshotContext` (`:570`) as `invalid`, which the annotator
grades `low` with values omitted (`src/lib/aiSensorSnapshotContextRules.ts:313-331`). Only a
corroborated `live` snapshot reaches the `trust = "high"` branch (`:419-422`; `valuesForModel` and
`isTrustedForAi` at `:430-432`). The resolver no longer emits `unknown`. `established fact` at the
stamped SHA.
_Enforcement:_ **gated** by `src/test/quick-log-sensor-snapshot-ai-allowlist.test.ts` in the
required test shards: uncorroborated nested and flat `live` snapshots fail closed to `invalid`
(`:163`, `:340-341`), malformed provenance is `invalid` (`:368`), inherited `Object` properties are
not aliases (`:422`), an unreadable timestamp is `invalid` even with corroborating rows (`:440`), and
the two key lists stay equal (`:322-326`). The gap that earlier stamps recorded here (`unknown`
output and an uncorroborated flat `live` snapshot graded `high`) is closed in the repository; whether
production runs this build is `NOT_MEASURED` (§14).
The AI Doctor review boundary admits the same token. The request-packet validator and the
evidence-receipt rules each declare a seven-member snapshot source list, the six plus `"unknown"`
(`src/lib/aiDoctorReviewRequestPacketValidationRules.ts:67`,
`src/lib/aiDoctorReviewEvidenceReceiptRules.ts:35`), and check trust separately against
`low | medium | high` (`:68` and `:36` respectively). So `unknown` is schema-valid there, and the token alone does not
decide trust. Whether an `unknown` snapshot is ever graded above `low` on that path was not traced
(`missing evidence`).
`established fact` at the stamped SHA; both files are byte-identical from `2ffe78cc` to `c8523adc`.
Now that the resolver emits only the six, `unknown` reaches this boundary only from another producer.

**A second provenance envelope exists, and its tokens do not match the registry.** Manual rows now
carry `raw_payload.manual_provenance = { source: "manual", source_identity: "manual_entry",
transport: "manual", confidence: null }` (#1492). `source` stays `manual`, so AC-4.2 holds. But
`transport: "manual"` is not a member of `SENSOR_PROVENANCE_TRANSPORTS`, which spells it
`manual_entry`, and `source_identity` is a key the registry does not define. The divergence is
recorded rather than resolved here (§13).
_Source:_ `src/constants/sensorIngestProvenance.ts:1-13` (header), `:26-35`
(`SENSOR_PROVENANCE_TRANSPORTS`), `:39-47` (`SENSOR_PROVENANCE_APPS`), `:51-70`
(`NON_CANONICAL_SOURCE_ALIASES`, 18 tokens), `:130` (`isNonCanonicalSourceAlias`);
`src/lib/sensorIngestProvenanceRules.ts:110-112` (definition only; zero non-test callers in `src/`,
`supabase/` or `scripts/`); `supabase/functions/sensor-ingest-webhook/storageMapping.ts:4-8,59-78,130-150,161,174-178,185`;
`src/lib/manualSensorProvenanceRules.ts` (#1492); `src/lib/sensorSourceDisplayCanon.ts:3-7`
(`never appear as the`), `:26` (`Grower-facing Source label`), `:102-105` (`never become live`),
`:107-116` (`resolveSensorSourceDisplayCanon`). The consumer set was established by grep at the
stamped SHA. The reasoning is adjudicated in `docs/audits/architecture-audit-adjudication-2026-08-21.md`
§5. `established fact` for the helpers, envelopes and display-canon file; the AC-4.2 display
paragraph is verified at `ea50ec678dee26e8ad5494c5d41aab8e4de1740e`.
_Enforcement:_ **unenforced** for the `NON_CANONICAL_SOURCE_ALIASES` helpers. Generic-webhook
canonicalization is structural in that edge path; the Pi exception is deliberate (AC-4.4). The
display split is **gated** by `src/test/sensor-source-display-canon.test.ts`, which imports the
module and asserts resolved labels in the required full suite; `src/test/sensor-source-prototype-key.test.tsx`
covers the prototype keys through the same display canon (#1655).

**AC-4.3 — One canonical union. Every other module derives from it.**

This clause is **aspirational-with-a-known-gap**, stated plainly rather than asserted as current
truth. At the stamped SHA the vocabulary is declared **twice** independently —
`SENSOR_SOURCES` in `src/lib/sensor/sensorSourceRules.ts` and `CANONICAL_SENSOR_SOURCES` in
`src/constants/sensorIngestProvenance.ts` — and re-declared as inline union literals in roughly
ninety further places across `src/`. Two of those have already drifted:

| Module                          | Declared union                                           | Drift                           |
| ------------------------------- | -------------------------------------------------------- | ------------------------------- |
| `src/lib/ai/types.ts:15`        | `live \| manual \| demo \| stale \| invalid \| imported` | invents `imported`, drops `csv` |
| `src/lib/aiDoctorEngine.ts:151` | `live \| csv \| manual \| stale \| invalid`              | drops `demo`                    |

**Corrected: the `aiDoctorEngine.ts` drift is not type-level only.** Its `classifySource`
(`src/lib/aiDoctorEngine.ts:266-276`) returns `"live"` for every source that is not `csv` or
`manual`, including `demo` and unknown labels, unless `quality` is `stale` or `invalid`. That is a
promotion to `live` in code. It mislabels nothing today only because the path is unreachable:

- its only caller is the legacy `compilePlantContextFromRows` in the same file (`:291`);
- that function's only caller is `compilePlantContext` (`:389-397`), which passes `sensorReadings: []`;
- `compilePlantContext` has no non-test callers.

The live AI Doctor path goes through the unrelated same-named function in
`src/lib/aiDoctorContextCompiler.ts`. **Wiring the legacy engine back in would reintroduce a
demo-to-live promotion.** The `ai/types.ts` drift remains type-level. Nothing structurally prevents
the next divergence from being a reachable one.

**The contract for `src/`:** new code under `src/` imports `SensorSource` from
`src/lib/sensor/sensorSourceRules.ts`. New inline union literals over source names are not
permitted there. The two divergences above are grandfathered and allowlisted so that the count can
shrink but not grow. **Edge functions are out of this import rule** — they cannot import `src/lib`
(AC-2.3), and `sensorSourceRules.ts` has no `_shared` mirror today; an edge ingest path needs its
own mirrored or local vocabulary, not a forbidden cross-import.
**"Roughly ninety", measured as text.** Single-line union literals outside tests, counted as lines
where two quoted canonical labels sit either side of one `|` (`"a" | "b"`, single or double
quotes). The three single-line counts are the same at the first stamp `7c46855b`, at `2ffe78cc1`
and at this stamp `7e024f93`, so none has grown.
The pattern was never recorded. It is reconstructed as a quoted pair of the six labels either side
of one `|`, over `.ts`, `.tsx`, `.js` and `.mjs` files in `src/`, excluding any `test/` or
`__tests__/` directory and `*.test.*` / `*.spec.*` files, with **every adjacent pair** on a line
tested. That reproduces all three single-line figures exactly at `4ddb2322`, `7266acd6` and
`dccaf732`. The
`4ddb2322` stamp took only non-overlapping matches and got 75 for the first figure: it missed
`src/lib/sensorSnapshotFreshnessRules.ts:26` (`"fresh" | "stale" | "invalid" | "demo" | "unknown"`),
whose first match `"stale" | "invalid"` consumes the `"invalid"` that pairs with `"demo"`. The
figures:

- **77 lines in 67 files** when at least one label of the pair is `live`, `manual`, `csv` or `demo`;
- 70 lines in 61 files when both labels must be among those four;
- 106 lines in 86 files when a `"stale" | "invalid"` pair also counts, which catches quality unions.
  Each figure was 76/66, 69/60 and 105/85 through `22f8dfe8`, and is unchanged at `c8523adc`; the added line is `#1857`'s
  `QuickLogAiSensorSource` union (`src/lib/quick-log/quickLogSensorSnapshotAcquisitionRules.ts:172`),
  which is exactly the six;
- multi-line unions add 12 matching lines in 6 files. This figure is a `source claim`: its pattern
  was never recorded, and it was not reproduced at this stamp. One-member-per-line regex scans also
  match unions that are not sensor-source unions, such as `ManualSensorTrendOmissionReason`, so no
  regex count replaces it. T3's AST scan is what settles it.

Every figure above counts lines that match a text pattern. A matching line is not necessarily a
sensor-source union: the wider pattern catches quality unions, and any pattern can catch an
unrelated one. The sensor-source count is T3's to settle.

_Source:_ `src/lib/sensor/sensorSourceRules.ts:16`; `src/constants/sensorIngestProvenance.ts:15`;
`src/lib/ai/types.ts:15`; `src/lib/aiDoctorEngine.ts:151,266-276,291,389-397`; counts by an
overlapping adjacent-pair scan over `src/**/*.{ts,tsx,js,mjs}`, excluding `test/` and `__tests__/`
directories and `*.test.*` / `*.spec.*` files, re-reproduced at `2ffe78cc1` and `7e024f93`. `established fact` for the
declarations, the two drifts and the unreachable promotion; `inference` for the risk assessment.
_Enforcement:_ **none today.** T3 in §11 is the proposed gate.

**AC-4.4 — `pi_bridge` is the first-party stored non-canonical source that the read path promotes
to `live`. It is the one sanctioned transport-to-trust exception, and it spans write and read.**

The first-party Pi ingest edge function writes the token directly into the row:
`source: "pi_bridge"` at `supabase/functions/pi-ingest-readings/index.ts:454` and
`.../commitBatch.ts:130`, whose row type fixes `source: "pi_bridge"` at `commitBatch.ts:40`. So
`pi_bridge` reaches `sensor_readings.source` as a **stored value**, outside the six resolved labels
of AC-4.1. On read, `sensorSourceRules.ALIAS` maps it to `live`, and `isHealthySensorSource` treats
`live` as the only healthy source. A transport name therefore reaches the healthy label across both
layers, not merely as a badge.

**Scope of the exception.** `pi_bridge` is **not** "the only value ever stored outside the six" —
the schema admit-list is wider (AC-4.1), and historical or alternate paths may leave other
non-canonical tokens on disk. The promotion this clause records is the **transport alias**:
`pi_bridge` is the stored transport name `ALIAS` maps to `live` (`sensorSourceRules.ts:28`). It is
not the only token mapped to `live`. The same table maps the trust-label aliases `sensor` and
`realtime` to `live` (`:22-23`), and `live` itself (`:21`). `TRUST_LIVE_ALIASES` is
`{live, sensor, realtime}` (AC-4.5) and does not include `pi_bridge`. Those trust-label aliases are
a different list from the transport alias. Generic webhook ingest does the opposite —
canonicalizes at storage (`storageMapping.ts`) so transport names are not stored as trust state
(AC-4.2). The unused `isRejectedSourceAlias` helpers do not participate in either path.

This is deliberate — the first-party bridge is trusted as live telemetry — and it is **not** recorded
here as a defect. It is recorded because it is the single place where the vendor-name-implies-health
collapse that AC-4.2 forbids is actually permitted, and a contract that left it implicit would let
the next such request cite it as precedent. **It is an exception, not a pattern. Adding a second
one, or extending this one to a third-party bridge, requires an approved slice.**

> An earlier draft of this clause claimed `pi_bridge` was "forbidden as a stored value while still
> normalizing on read". That was **wrong in the direction that matters** — it described the write
> path as prohibited when a first-party function performs it — and is corrected here rather than
> quietly reworded. A later draft then over-claimed that `pi_bridge` was the only stored
> non-canonical value; schema width (AC-4.1) and the unused reject wrappers (AC-4.2) make that
> false.

_Source:_ `supabase/functions/pi-ingest-readings/index.ts:454`,
`supabase/functions/pi-ingest-readings/commitBatch.ts:40,108,130` (`:108` refuses any source other
than `pi_bridge`); `src/lib/sensor/sensorSourceRules.ts:24-28` (`pi_bridge: "live"`), `:88`
(`=== "live"`);
`src/lib/sensorLiveMembership.ts:70-73` (`VERIFIED_SNAPSHOT_LIVE_ROW_SOURCES` = `{live, pi_bridge}`);
`supabase/functions/sensor-ingest-webhook/storageMapping.ts`. `established fact`.

**AC-4.5 — The `TRUST_LIVE_ALIASES` pin is one-directional, and the comment beside it overstates
what it enforces.**
`sensorSourceRules.ts:48` says "Keep `TRUST_LIVE_ALIASES` and `ALIAS` live entries aligned", but the
loop below it can only **add** aliases missing from `ALIAS`. It cannot detect an `ALIAS` live-entry
absent from `TRUST_LIVE_ALIASES` — which is exactly the state `pi_bridge` is in
(`TRUST_LIVE_ALIASES = {live, sensor, realtime}`). The invariant as stated is stronger than the
invariant as enforced. A second overstatement sits beside the constant: the doc comment at
`sensorLiveMembership.ts:76-77` calls these "Trust-label aliases that normalizeSensorSource maps to
live". But `pi_bridge` also maps to `live` and is not listed.
_Source:_ `src/lib/sensor/sensorSourceRules.ts:48-53` (`TRUST_LIVE_ALIASES`); `src/lib/sensorLiveMembership.ts:76-79`.
`established fact`.
_Enforcement:_ one-directional only. Either enforce both directions or restate the comment; do not
leave the stronger claim standing.

**AC-4.6 — Bad or unknown telemetry is never presented as healthy.**
Demo, manual, CSV, stale and invalid readings keep their labels everywhere they surface, including
into AI Doctor context (AC-5.6). Suspicious telemetry — Celsius shown as Fahrenheit, EC unit
mismatch, humidity or soil moisture pinned at 0 or 100, out-of-range pH, old readings shown as
current — is flagged, not smoothed.
_Source:_ `AGENTS.md` Sensor Truth Rules; `supabase/functions/_shared/lib/constants/sensorTruthRanges.ts`.
`established fact`.
_Enforcement:_ **partially gated, and not by a required check.** `scripts/sensor-safety-check.mjs`
statically refuses the following, across `ROOTS = ["src/lib/sensor", "src/components/sensor"]` (`:14`):

- fake-live wording, automation language, device-control wording and any `service_role` mention
  (`:17-23`);
- "healthy" on the same line as a degraded token unless the line negates it (`:25-26,72-80`).

That is five files at the stamped SHA. It does **not** scan `src/lib/sensors/`, the root-level
`src/lib/sensor*.ts` modules, or edge functions. It is **not** invoked by `ci.yml`, which supplies
every required context, so a violation cannot block a merge by that route. It runs from:

- **every non-draft pull request into `verdant-grow-diary` or `main`**, with no path filter, through
  three workflows. Since `#1806` each job skips draft pull requests
  (`if: ${{ github.event_name != 'pull_request' || !github.event.pull_request.draft }}`) and runs
  when the pull request is marked ready. Each runs a package script that ends with the checker, chained with `&&`, so the
  checker runs only when the script's Vitest suite and the job's earlier steps pass:
  - `.github/workflows/ai-doctor-golden-cases.yml:5-7` (`pull_request:`), whose step at
    `.github/workflows/ai-doctor-golden-cases.yml:46` (`bun run test:ai-doctor-phase1`) runs
    `package.json:323` (`&& node scripts/sensor-safety-check.mjs`);
  - `.github/workflows/ai-doctor-readiness-ui.yml:5-7` (`pull_request:`), whose step at
    `.github/workflows/ai-doctor-readiness-ui.yml:49` (`bun run test:ai-doctor-readiness-ui`) runs
    `package.json:324` (`&& node scripts/sensor-safety-check.mjs`);
  - `.github/workflows/contextual-pheno-comparison-v0.yml:6-8` (`pull_request:`), whose step at
    `.github/workflows/contextual-pheno-comparison-v0.yml:67`
    (`bun run test:contextual-pheno-comparison-v0`) runs `package.json:65`
    (`&& node scripts/sensor-safety-check.mjs`).

  None of the three jobs is one of the 35 required contexts;

- the pre-commit hook, through `scripts/assert-docs-safety.mjs`;
- pull requests that touch the path filter of `.github/workflows/release-workbook-safety.yml`.
  The filter is broad: it covers `docs/**` at `.github/workflows/release-workbook-safety.yml:6`
  (`docs/**`), `package.json`, and the checker itself at
  `.github/workflows/release-workbook-safety.yml:11` (`scripts/sensor-safety-check.mjs`). That job
  reaches the checker through `scripts/verify-release-workbooks.mjs:53`
  (`scripts/sensor-safety-check.mjs`), the fifth of its steps; that script skips every step after
  the first one that fails;
- `vitest-batched-full-suite.yml`, on manual dispatch only;
- `release-receipt-ci.yml`, on `main` only. Every validation step there is `continue-on-error`, so
  the checker runs even after an earlier failure; a final step fails the job if any of them failed;
- a path-filtered strain-library gate.

> Earlier versions listed only the pre-commit hook and the last three lanes, and so implied the
> check never runs on an ordinary pull request. All three pull-request lanes and their script chains
> were already present at the first stamp. The classification does not change: through those three
> lanes it runs on every non-draft PR into `verdant-grow-diary` or `main` (draft PRs run it once marked
> ready) once the steps ahead of it pass, but not as a required check.

---

## 5. AI Doctor

**AC-5.1 — AI Doctor and AI Coach reach Google's Gemini API directly, from the server only,
through one pinned helper.**
`ai-doctor-review` and `ai-coach` post to Gemini's OpenAI-compatible endpoint,
`https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`, through
`supabase/functions/_shared/geminiDirectChat.ts` (`#1982`). The credential is a server-only
`GEMINI_API_KEY`, read with `Deno.env` through `readGeminiDirectApiKey`. When the key is missing or
blank, both functions fail closed **before any credit spend**: `ai-doctor-review` returns its calm
`config` failure and `ai-coach` returns `AI not configured`. `ai-coach` downloads an attached photo
from the project's signed Storage path only after the spend exists, and sends it as a base64
inline image of at most 7 MiB, because Gemini rejects the signed HTTPS URL. A failed download or an
oversized or unsupported image triggers a refund attempt (`ai-coach/index.ts:682,686`); when the
refund is not confirmed, the response is `result_pending`, not a confirmed reversal (`:384-415`). A
photo attached in Coach therefore reaches Google as bytes, not as a link.

`ai-cultivar-qa` still calls the Lovable AI gateway (`https://ai.gateway.lovable.dev/v1/chat/completions`)
with `LOVABLE_API_KEY`. No other function calls a chat-completions provider. No non-test file under
`src/` references either endpoint or either key.

**`LOVABLE_API_KEY` is not retired, and it is not AI-specific.** Besides `ai-cultivar-qa`, it is read
by the email functions (`auth-email-hook`, `handle-email-suppression`, `preview-transactional-email`,
`process-email-queue`) and by the Paddle connector in `_shared/paddle.ts`. `#1982` removed it from
the two AI Doctor functions only. The owner's correction that PR records keeps the key until every
remaining consumer and every rollback dependency is migrated and verified (`source claim`, from the
`#1982` description). Rotating or scoping the key still touches billing and email.

**This clause describes the repository, not production.** `#1982` deployed no edge function and set
no secret. Which build of each function production runs, and whether `GEMINI_API_KEY` is set there,
are `NOT_MEASURED`; they belong to `docs/agents/CURRENT_STATE.md`.
_Source:_ `supabase/functions/_shared/geminiDirectChat.ts:20-21` (endpoint), `:43-60` (the two
standard routes), `:67-71` (key read), `:87-98` (fail-closed resolution);
`supabase/functions/ai-doctor-review/index.ts:62-67` (import), `:385-397` (key check, before the
spend at `:474-475`), `:595-611` (request and fetch); `supabase/functions/ai-coach/index.ts:13-23`
(imports), `:346-354` (key check, before the spend at `:365-366`), `:669-692` (inline photo),
`:703-715` (request and fetch); `supabase/functions/_shared/geminiInlineImage.ts:8`
(`GEMINI_INLINE_IMAGE_MAX_BYTES`); `supabase/functions/ai-cultivar-qa/index.ts:73,91`; the wider
key readers by grep over `supabase/functions/`. `established fact`.
_Enforcement:_ **partially gated**, in the required `Lint, typecheck, test, build` job
(`.github/workflows/ci.yml:437-438`). `supabase/functions/_shared/geminiDirectChat.test.ts:27-45`
resolves both routes and asserts the provider, endpoint and model ids on the returned objects;
`:62-99` asserts that a missing or blank key fails closed without calling `fetch`; `:177-202` scans
both function sources for the helper call and for the absence of the gateway URL and of
`LOVABLE_API_KEY`. That source scan is the right tool for proving absence. Its order check
(`:192`, `:198`, through `keyCheckPrecedesSpend` at `:207-217`) now looks for the key-read call
`readGeminiDirectApiKey(Deno.env)` before `creditSupabase.rpc("ai_credit_spend"`, not the first
mention of the name, and `:219-242` proves it goes red when the call moves below the spend (`#2070`).
**Fail-before-spend is gated** by running the handlers: `:332-345` (AI Doctor) and `:347-357`
(AI Coach) call each handler with the key unset and assert zero `ai_credit_spend` calls and the
fail-closed response (`{ ok: false, reason: "config" }`; HTTP 500 `AI not configured`), each after
a positive control with the key set that records exactly one spend (`countSpendCalls`,
`:279-330`). `ai-cultivar-qa` is held by nothing, so the clause stays partially gated.

> Before `#1982` this clause read "Inference is reached through the Lovable AI gateway": all three
> AI functions called the gateway with `LOVABLE_API_KEY`.

**AC-5.2 — Model and tier are server constants. The client cannot influence either.**
`FEATURE`, `MODEL_TIER` and the model ids are module-level constants, not request-derived; the
client cannot set model, tier, weight, plan, or `user_id`, and therefore cannot self-discount.
`user_id` comes from `auth.getUser()`. The model ids come from the helper's fixed route table, looked
up once at module load from the two server constants; an unresolved route throws at load, so the
function cannot start without one. At the stamped SHA `ai-doctor-review` pins `FEATURE =
"ai_doctor_review"`, `MODEL_TIER = "standard"`, a wire model `WIRE_MODEL = "gemini-3-flash-preview"`
(sent to Gemini) and a recorded model `MODEL = "google/gemini-3-flash-preview"` (passed only as
`p_model_id` to `ai_doctor_finalize_review` at `:702`, the id it carried on the gateway; the response body
`v.result` at `:732` carries no model id). `ai-coach` pins `ai_coach`,
`standard` and `gemini-2.5-flash`, and records no model id. Those values are dated evidence. The
invariant is that they are server constants, and changing the provider or the model is an owner
decision outside this contract (`#1982` was approved as one).
_Source:_ `supabase/functions/ai-doctor-review/index.ts:13` (the "decided SERVER-SIDE" comment),
`:101-109` (constants and route lookup), `:345-347` (`auth.getUser()`);
`supabase/functions/_shared/geminiDirectChat.ts:43-60` (route table), `:73-85` (lookup);
`supabase/functions/ai-coach/index.ts:189-196`. `established fact`.
Request-body model or tier fields are ignored, not rejected: the envelope parser reads only `packet`
and four transport fields, each accepted under a snake-case or a camel-case name (`grow_id` /
`growId`, `idempotency_key` / `idempotencyKey`, `session_id` / `sessionId`, `evidence_acceptance`
/ `evidenceAcceptance`, through `readAliasedTransportValue` at
`src/lib/aiDoctorReviewRequestTransportRules.ts:229`); both forms are live inputs.
The packet is rebuilt with unknown keys dropped, and the credit weight is derived in the database
from the server tier.
_Source (ignoring):_ `src/lib/aiDoctorReviewRequestTransportRules.ts:251-258`;
`ai-doctor-review/index.ts:410-413`; `supabase/migrations/20260728090736_ai_credit_pack_portability.sql:90`.
_Enforcement:_ structural — there is no code path from the request body to any of the constants.
The route values themselves are pinned by `supabase/functions/_shared/geminiDirectChat.test.ts:27-60`
in a required check (AC-5.1).

**AC-5.3 — Model output is structured and validated, never free text.**
The call forces a single tool (`tool_choice: {type: "function", function: {name:
"submit_ai_doctor_review"}}` against `TOOL_SCHEMA`), and the returned arguments are parsed and
schema-checked before use. Raw model text is never returned to the client, written to a row, or
logged; logs carry safe status and reason codes only.
_Source:_ `supabase/functions/ai-doctor-review/index.ts`:

- `:2` ("Never returns raw model text") and `:14` (the safe-log rule);
- `:123` (`TOOL_SCHEMA`) and `:604-608` (the live `tools` and `tool_choice`, passed to the Gemini
  helper, which adds only `model` to the body);
- `:675` (`JSON.parse`), `:681` (`validateAiDoctorReviewResult`), `:686` (the grounding check);
- `:739-749` (`readToolArguments`).

`:220-221` repeat `tools` / `tool_choice` inside the HMAC signing frame, not the live request.
Invalid, empty or unparseable output, and output that fails grounding, is not an unconditional
refund. Those paths call `failureAfterRefund` (`:517-523`, from `:654`, `:671`, `:678`, `:684` and
`:689`), which attempts an idempotent `ai_credit_refund` keyed `refund:` plus the spend id
(`:493-514`). A confirmed refund returns the terminal calm failure. An unconfirmed attempt,
including a missing spend id, returns `result_pending`. Confirmed and pending stay separate
outcomes. The validator is hand-written, not zod
(`supabase/functions/ai-doctor-review/contract.ts:124-182`). `TOOL_SCHEMA` is closed
(`additionalProperties: false`) and has no `action_queue_suggestion` property, while the validator
accepts one as optional (`contract.ts:162`); the two disagree harmlessly.
**Scope: this clause covers `ai-doctor-review` only.** The `/coach` page is also titled "AI Doctor"
(`src/pages/Coach.tsx:497`) and calls `ai-coach` (`:322`), which requests
`response_format: { type: "json_object" }` (`supabase/functions/ai-coach/index.ts:708`) with no
forced tool and only a shape check. "AI Doctor output is tool-forced and validated" is true of the
review function, not of every surface named AI Doctor.
`established fact`.

**AC-5.4 — Credits are metered server-side before the model call, with idempotency, and a refund is
attempted on the failure paths that call `failureAfterRefund`.**
`ai_credit_spend` is called with a UUID-validated `p_idempotency_key` before inference; a failed
call is not an unconditional reversal. On model and upstream failures (timeout or network `:614`,
HTTP 402 / 429 / other non-OK `:626`, `:636`, `:646`, unparseable, empty, invalid or ungrounded
output `:654`-`:689`), on a stale result-less replay (`:561`) and on an explicit finalization
rejection (`:723`), it attempts an idempotent `ai_credit_refund` keyed `refund:` plus the spend id
through `failureAfterRefund` (`ai-doctor-review/index.ts:493-523`). A confirmed refund is an
append-only reversal. An unconfirmed attempt, including a missing spend id, returns
`result_pending`. Confirmed and pending stay separate outcomes. **No refund is attempted, by
design, when the outcome is ambiguous:** an ambiguous `ai_doctor_finalize_review` result (timeout,
transport error or unparseable response) returns `result_pending` without calling
`failureAfterRefund` (`:715-717`), and so does the outer catch once a spend may exist
(`:733-735`). Both keep the spend and request key so a same-key retry can recover a committed
result rather than refund one.

**`idempotencyKey` has a request-body path.** The edge function validates
`request.idempotencyKey` as a UUID (`ai-doctor-review/index.ts:428-431`) and passes it to
`p_idempotency_key` (`:481`). Protection is **not** structural absence of a client field — it is
**RPC / runtime enforcement**: atomic spend semantics, conflict detection, and append-only refunds
in the database functions (exercised by `scripts/run-ai-credits-rls-harness.ts`).

**A legitimate replay is not a conflict, and the two must not be conflated.**
`classifyAiDoctorCreditSpend` resolves a same-key replay to **`cached`**, **`pending`** or
**`stale`**; only an _incompatible_ reuse — the RPC returning `reason === "idempotency_key_conflict"`
— takes the **`conflict`** branch. Reserve the conflict label for that incompatible case alone.
Retry protocols must be written against those four outcomes.
_Source:_ `supabase/functions/ai-doctor-review/index.ts:428-431,475-483,493-515,535-538`;
`src/lib/aiDoctorCreditReplayRules.ts:18-23,63,70,84,89,92`. Database dedupe:
`supabase/migrations/20260605230401_45a4c0c5-1c7f-4d79-8490-d2649114ed83.sql:28-29`
(`ai_credit_spends_user_idem_uq` on `(user_id, idempotency_key)`); conflict reason
`20260728090736_ai_credit_pack_portability.sql:143`; append-only refund insert
`20260727050000_ai_credit_service_contract_forward_reassert.sql:420-426`. `established fact`.
_Enforcement:_ **runtime boundary** — see §11.

**AC-5.5 — The `ai-doctor-review` function writes no cultivation or queue rows, and controls no
devices. It does write billing, receipt and measurement rows.**
The boundary is specific: no `ai_doctor_sessions`, `alerts`, `action_queue` or `sensor_readings`
writes, and no equipment or device control. It may _suggest_ an Action Queue item; it may not create
one (AC-7.1).

It is **not** a no-write endpoint, and calling it one would hide real persistence from a privacy or
data-flow audit. Through RPCs it writes the credit ledger (`ai_credit_spend`, `ai_credit_refund`),
finalizes results and evidence receipts (`ai_doctor_finalize_review`), and records a completion row
(`record_ai_doctor_review_completion`).
**The prohibition is the function's, not every AI Doctor surface's.** A grower can turn an AI Doctor
suggestion into an Action Queue row by clicking: `src/hooks/useAddAiDoctorSessionSuggestionToActionQueue.ts:97`
and `src/pages/Coach.tsx:206-213` call `action_queue_create` with `source` `ai_doctor` and status
`pending_approval`. That is grower-initiated and approval-required (AC-7.1), not automatic. The
`/coach` page also persists `ai_doctor_sessions` (the `persistAiDoctorSession(...)` call at
`src/pages/Coach.tsx:376-387`). The function's
validator rejects device-command phrasing in model output (`ai-doctor-review/contract.ts:60-61`).
_Source:_ `supabase/functions/ai-doctor-review/index.ts:8-9` for the prohibition;
`:281,475,498,695` for the writes it does perform. `established fact`.

**AC-5.6 — Sensor readings reaching model context keep their trust labels. Once a row carries an
explicit quality, only `ok` contributes current values.**

**The null case is a deliberate compatibility exception, not an oversight.**
`hasUsablePersistedQuality` returns `true` when `quality` is `null` or `undefined`, so older rows
predating quality classification still contribute. Writing "only `ok` contributes" would erase that
and invite a future refactor to silently drop legacy sensor evidence. Changing this behaviour is a
separate safety-reviewed slice, not a tidy-up.

**There are now two sites carrying this exception, not one.** #1324 changed
`aiDoctorManualTentSensorSnapshotAdapter.ts` from a strict `quality !== "ok"` reject, under which
null was rejected, to its own null-compatible `hasUsablePersistedQuality`. So the exception now also
covers tent manual rows feeding AI Doctor context. Any change to the null rule must change both
sites together.

**Selection changed since the first stamp; the labels did not.** #1324, #1335, #1345 and #1361
changed how current evidence is chosen:

- live and manual rows are built as separate cohorts;
- a usable live row wins, and otherwise an in-window manual row wins, even over a newer but stale
  live row;
- the stale window depends on the source (`resolveCurrentStateStaleWindowMs`: manual 24 h, live
  15 min);
- a fresh manual row is classified `usable`;
- `currentSensorEvidenceIsFreshLive` is live-only.

Throughout, manual rows keep `source = manual`. They are accepted as manual evidence, never
promoted to live, so this clause holds.

Grounding is reject-only: the backstop refuses ungrounded output rather than rewriting it.
_Source:_ `src/lib/aiDoctorCurrentSensorSnapshotRules.ts:115-117` (null → `true` at `:116`), gate at
`:193`; mirror `supabase/functions/_shared/lib/lib/aiDoctorCurrentSensorSnapshotRules.ts:120-122`,
gate `:198`; `src/lib/aiDoctorManualTentSensorSnapshotAdapter.ts:58-61`, gate `:161`, and its
mirror `supabase/functions/_shared/lib/lib/aiDoctorManualTentSensorSnapshotAdapter.ts:63-66`, gate `:166`. Stale windows: `src/lib/sensorTruthCanon.ts:100-104` over `src/constants/sensorTiming.ts:52,80`.
Live-only freshness: `src/lib/aiDoctorCurrentSensorSnapshotRules.ts:396`. Reject-only grounding:
`src/lib/aiDoctorReviewGroundingRules.ts:5`, or `:10` in the `_shared`
mirror. Earlier versions cited `:116,194` and a bare `:10`, which were already off by the mirror's
generated-header offset. `established fact`.

**AC-5.7 — Output must be cautious and state what it does not know. The output _shape_ is enforced;
the _calibration_ is not.**
The response contract includes confidence, evidence, missing information, what not to do, and a risk
level, and the grounding validator rejects absolute-certainty wording.

**The one-photo ceiling is convention, not construction.** No photo-count or visual-evidence
cardinality signal reaches the confidence decision: the packet carries photo activity only as a
generic `recentEvents` category, and `packetHasAffirmativeEvidence`
(`src/lib/aiDoctorReviewGroundingRules.ts:519-525`) accepts any non-empty recent-event list toward a
`high` result. Calling this "cautious by construction" would mask an unguarded safety rule. An
enforceable cardinality signal plus a confidence cap is the fix, and it is deferred (§13).
_Source:_ `AGENTS.md` AI Doctor Rules; `docs/ai-doctor-output-contract.md`,
`docs/ai-doctor-safety-contract.md`; `src/lib/aiDoctorReviewGroundingRules.ts:519-525`.
`established fact` for the shape; `established fact` for the absent ceiling.

**AC-5.8 — Evidence receipts do not participate in authorization or pricing.**
The receipt records what the review was based on. Its HMAC is not used to authorize a call, price
it, or select a model. A receipt is one insert-once row in `ai_doctor_review_evidence_receipts`,
keyed by `spend_id`: an allowlisted evidence snapshot (no prompt text or raw payloads), a keyed
HMAC-SHA256 of the exact outbound request frame with its key id, the model id and the tool-schema and
prompt-contract versions. The service-role-only `ai_doctor_finalize_review` writes it together with
the result cache, and clients have no table access. `ai-coach` writes no receipt. Whether production
has the table or the HMAC key configured is `NOT_MEASURED`.

**Since `#1982` the signed model id and the recorded one differ.** The HMAC frame is prompt contract
`ai-doctor-review-prompt-v2` and signs the wire model, `gemini-3-flash-preview`. The receipt's
`p_model_id` is the recorded model, `google/gemini-3-flash-preview`, the id the gateway used. So a
receipt's model id is not the string the HMAC covers. The prompt-contract version tells the two eras
apart: `v1` receipts were signed over the provider-prefixed id. A verifier that recomputes an HMAC
must take the model from the version, not from `p_model_id` (`inference`).
_Source (contents):_ `supabase/migrations/20260719180000_ai_doctor_review_evidence_receipts.sql:10-32,48-52`;
`ai-doctor-review/index.ts:210-243` (frame and signer), `:692-706` (finalization);
`:108-109` (`MODEL`, `WIRE_MODEL`), `:113-115` (the v2 note).
_Source:_ `supabase/functions/_shared/lib/lib/aiDoctorReviewEvidenceReceiptRules.ts:265`;
`supabase/functions/ai-doctor-review/index.ts:208`. `established fact`.

---

## 6. Entitlements, billing, and credits

**AC-6.1 — `public.subscriptions` is the billing entitlement source of truth.**
`profiles.tier` is XP and gamification only and must never be read as billing.
`public.billing_subscriptions` is a legacy sandbox and operator-audit surface that must never grant
an entitlement. Absence of an entitling row resolves to Free.
_Source:_ client read `src/hooks/useMyEntitlements.ts:90` (`.from("subscriptions")`); server read
`supabase/functions/_shared/unionEntitlementLookup.ts:143`. A null row resolves to Free
(`null_row_free`) in `src/lib/entitlements/resolveEntitlements.ts:94-109`. See `AGENTS.md`
Monetization rules. The only non-test read of `billing_subscriptions` is a legacy read during
account deletion (`supabase/functions/delete-account/index.ts:84`), which grants nothing.
`established fact`.

**Billing changes since the first stamp leave this clause intact.** #1375 blocks a founder purchase
after an earlier refund. #1388 routes approved Paddle refund adjustments to revoke. #1374 and
#1398 add founder-refund migrations. They only revoke or deny founder rows in `subscriptions`
more strictly, through service-role paths. #1373 is separate: it is a client-UPDATE grant and RLS
hardening on `public.founders` (`supabase/migrations/20260914190600_founders_client_updates_fail_closed.sql`),
not a subscription-refund migration. It revokes `UPDATE` from `PUBLIC`, `anon` and `authenticated`
and adds the restrictive `founders_no_client_update` policy. None of them touches `src/lib/entitlements/`,
`ai_credit_*`, `billing_subscriptions` or `profiles.tier`.

> **Naming hazard, recorded so it is not mistaken for a violation.** The row type is named
> `BillingSubscriptionRow` (`src/lib/entitlements/types.ts:21`) and its doc comment still refers to
> `public.billing_subscriptions` (`:17`), while the actual read is from `subscriptions`. The behaviour
> is correct; the name is misleading. Renaming is a `convention only` cleanup, not a contract
> change — but do not "fix" the read to match the type name.

**AC-6.2 — Capability logic lives in `src/lib/entitlements/*`, expressed as capabilities rather than
plan comparisons.**
Prefer `canUseCapability(entitlement, "advancedExports")` over `if (plan === "pro")`. Plan gates do
not belong in JSX.
_Source:_ `src/lib/entitlements/capabilities.ts`, `src/lib/entitlements/capabilityAccess.ts:13-18`
(`canUseCapability`), `src/lib/entitlements/planCatalog.ts`. `established fact`. Examples of
display-only `founder_lifetime` comparisons exist in pages (`src/pages/Pricing.tsx:311`,
`src/pages/Settings.tsx:324`). `Settings.tsx:322-323` also compares `planId` with `free`, so those
two `founder_lifetime` lines are examples, not a complete plan-id count. The `founder_lifetime`
examples predate the first stamp, and neither is a capability gate. They are drift, not precedent.

**AC-6.3 — `resolveEntitlements` is pure and takes `now` as a parameter.**
It has no React, no Supabase, no fetch, and no internal clock, so entitlement resolution is
deterministic and testable at any instant.
_Source:_ `src/lib/entitlements/resolveEntitlements.ts:1-16` (docblock), `:18-26` (the only
imports: sibling entitlement modules and an import-free rules file), `:87-90` (signature takes
`now: Date`). `established fact`.

**AC-6.4 — Client entitlement reads are presentation-only; the server is authoritative for cost and
security.**
The staff override lifts capabilities for presentation and is explicitly never authoritative: AI
credit spend stays capped and metered server-side regardless.
_Source:_ `src/lib/entitlements/resolveEntitlements.ts:7-15`. Server-side, staff are still metered, at
a 10,000-per-month cap (`supabase/migrations/20260728090736_ai_credit_pack_portability.sql:257-262`).
`established fact`.

**AC-6.5 — Founder Lifetime is Pro-like access with capped AI credits. It is never unlimited AI.**
`planCatalog` hard-pins `founder_lifetime.aiMonthlyCredits` at **100**. Server-side,
`ai_credit_allowance('founder_lifetime')` returns the same monthly cap, and `ai_credit_spend`
resolves founder rows through that allowance before metering — so the cap is a **runtime boundary**,
not an unenforced peer review hope.
_Source:_ `src/lib/entitlements/planCatalog.ts:9-12,46-50,58` (`aiMonthlyCredits: 100` at `:48`).
The effective `ai_credit_allowance` is at
`supabase/migrations/20260721194118_d777533e-a1d4-4b36-a75e-ea7742e7cd6e.sql:15-38`
(`founder_lifetime THEN 100` at `:35`). The effective `ai_credit_spend` is at
`supabase/migrations/20260728090736_ai_credit_pack_portability.sql:31`: it reads `public.subscriptions`
(founder branch `:239`) and calls `ai_credit_allowance(v_plan_id)` at `:255`. See also `AGENTS.md`
Monetization and AI Credit rules. Earlier versions pointed at a `*ai_credit*` filename glob, which
misses the effective allowance file. `established fact`.
_Enforcement:_ **runtime boundary** — see §11.

---

## 7. Action Queue

**AC-7.1 — The Action Queue is approval-required, and its default state says so.**
Rows default to `pending_approval`. AI and alerts may suggest; the grower decides. Verdant does not
execute device commands, and there is no device-control surface to add one to.
_Source:_ the row default is `status text NOT NULL DEFAULT 'pending_approval'`
(`supabase/migrations/20260520153605_05bd55b2-5cf8-4c1f-9fac-ebb4a328736c.sql:16`).
`src/lib/actionQueueCreateRules.ts:198` is the client-side fallback when parsing the RPC response, not
the row default. Also `src/lib/actionQueueProvenanceRules.ts:175,187`. `established fact`.

**AC-7.2 — No affordance may make approval accidental.**
Keyboard navigation never maps a key to Approve, Reject, Retry, Complete or Cancel; presentation
must not imply an action is already approved or executed.
_Source:_ `src/lib/actionQueueKeyboardNavigationRules.ts:8`;
`src/lib/actionQueueEvidenceViewModel.ts:53,62`. `established fact`.

**AC-7.3 — Action Queue items are not auto-created.**
Alerts and AI Doctor output do not write queue rows unless a task explicitly asks for it.

**The one edge path that does insert queue rows is explicit, not automatic.**
`create-breeding-suggestions` inserts into `action_queue`. It is invoked only by a grower action
(`src/components/genetics/BreedingLogContainer.tsx:143`), runs under the caller's JWT with the anon
key so RLS applies, and writes `status: "pending_approval"` workflow reminders. That fits this clause.
A second automatic writer would not.
_Source:_ `AGENTS.md` Action Queue Rules; AC-5.5; `supabase/functions/ai-doctor-review/index.ts:8`
and `supabase/functions/ai-cultivar-qa/index.ts:14` (no queue writes);
`supabase/functions/create-breeding-suggestions/index.ts:88-91`;
`src/lib/genetics/breedingActionQueue.ts:61`. `established fact`.

---

## 8. Toolchain and dependency management

**AC-8.1 — Bun is canonical; `bun.lock` is the only lockfile.**
`bun.lock`, a text lockfile, is authoritative and is the only lockfile. The npm compatibility lock,
`package-lock.json`, is retired by `#1873` (approved by Matthew on 2026-10-04); it, `bun.lockb`,
`yarn.lock` and `pnpm-lock.yaml` are forbidden. **There is no `bun.lockb`.** Governance prose that
calls `bun.lockb` authoritative, or `package-lock.json` a synchronized compatibility lock, is stale.
_Source:_ `scripts/check-bun-lockfile-policy.mjs:5` ("Bun and bun.lock are canonical, and bun.lock
is the only lockfile"), `:24` (`REQUIRED_LOCKFILES`), `:67-72` (`FORBIDDEN_LOCKFILES`), `:180-191`
(the schema-2 transition config check; the canonical check and throw at `:186-187`);
`config/dependency-lockfile-transition.json`; `bunfig.toml`;
`docs/dependency-lockfile-transition-review-2026-10-03.md`. `established fact` at the stamped SHA.
_Enforcement:_ **gated.** `src/test/check-bun-lockfile-policy.test.ts:537` runs the checker against
the repository in the required test shards. It requires `bun.lock`, rejects every forbidden
lockfile, and rejects a transition config that does not keep Bun canonical or that still declares a
compatibility lockfile or review date, so there is no date left to pin. The non-required
`dependency-security-ci.yml` also runs it (`:48-49`).

> Before `#1873` this clause read "`package-lock.json` is a synchronized compatibility artifact
> under a dated review": the checker required both files, and the transition config carried a
> `reviewBy` (last `2026-10-17`) that failed closed from the day after.

**AC-8.2 — New dependency versions wait 24 hours.**
`bunfig.toml` sets `minimumReleaseAge = 86400` as a supply-chain guard. Each entry in
`minimumReleaseAgeExcludes` bypasses it for one package and must be confirmed with the owner before
being added.
_Source:_ `bunfig.toml:4` (`minimumReleaseAge`), `:7` (six excludes, all `@lovable.dev/*`:
`vite-tanstack-config`, `mcp-js`, `vite-plugin-dev-server-bridge`, `vite-plugin-hmr-gate`, `email-js`,
`webhooks-js`). `established fact`.

**AC-8.3 — TypeScript strictness is deliberately partial.**
`tsconfig.json` runs `strict: true` while keeping `noImplicitAny: false` and three further flags
off, with the reasons recorded in the file. Turning them on is a project, not a side quest.
_Source:_ `tsconfig.json:16` (`strict`), `:34` (`noImplicitAny`), `:35-37`
(`noPropertyAccessFromIndexSignature`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`),
with the rationale at `:22-33`. `established fact`.

**AC-8.4 — `server-only` is banned.**
It is a Next.js idiom. Use `*.server.ts` or `@tanstack/react-start/server-only`.
_Source:_ `eslint.config.js:34-45` (`no-restricted-imports`, `server-only` at `:39`). `established fact`.
_Enforcement:_ **gated.** It is an ESLint error, and ESLint runs in the required
`Lint, typecheck, test, build` job.

---

## 9. Migration history

**AC-9.1 — A merged migration is permanent history and is never edited.**
Not to correct it, not to no-op it, not because it "could never have succeeded anywhere". Ship a new
additive migration instead. Editing history does not change what already ran; it changes what a
freshly provisioned environment ends up with, silently.
_Source:_ `AGENTS.md` Migration Immutability Rules. `established fact`.
_Enforcement:_ **partially gated.** `.github/workflows/published-migration-integrity.yml` compares
SHA-256 against the PR's base branch: path filter at `:18-23`, job at `:34-35`, gate step at
`:72-78`, hashing in `scripts/verify-published-migration-integrity.mjs`. The check runs on every PR
that touches `supabase/migrations/**`, and a red result is visible. **It is not one of the 35
required contexts**, nor in `mustBeGreen`, in `config/required-status-checks.json`, captured
2026-08-10. By that mirror, a red result would not block a merge. Whether the live ruleset requires
it is `NOT_MEASURED`.

> Earlier versions called this **gated**, and `AGENTS.md` says the check "will fail the PR". Both
> are true of the check's result. Neither establishes that the result blocks the merge queue.

**AC-9.2 — When a published migration is genuinely broken, the sanctioned mechanism patches a
disposable copy.**
`config/local-supabase-replay-compatibility.json` declares per-file entries in three categories,
each checked by hash, and applies them to a copy inside a disposable workdir at replay time:

| Category                   | Entries | Hash check                                |
| -------------------------- | ------: | ----------------------------------------- |
| `compatibility_noops`      |      18 | `canonical_sha256` and `duplicate_sha256` |
| `compatibility_patches`    |       4 | `source_sha256`                           |
| `compatibility_injections` |       2 | `template_sha256`                         |

Earlier versions named only the first two categories and attributed `source_sha256` to both. The committed file is never modified. Check this config **before** proposing
any correction — the defect may already be handled, in which case the correct change is none.
_Source:_ `config/local-supabase-replay-compatibility.json`; `AGENTS.md`. `established fact`.

**AC-9.3 — A merge is not a deployment, a committed migration is not an applied one, and a
published frontend is not deployed edge code.**
Never infer applied schema, or deployed function code, from repository presence.

**Three artifacts, three different paths, none of them a merge:**

| Artifact       | What the repository establishes                                                                                                                                          |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Frontend       | reaches an environment through the publish/build path                                                                                                                    |
| Migrations     | reach an environment through a separate operator apply path                                                                                                              |
| Edge functions | **not** deployed by any workflow under `.github/workflows/` (grep at the stamped SHA). Separate `supabase functions deploy` scripts exist in `package.json` / `Makefile` |

**Who triggers edge deploy is `NOT_MEASURED` from the repository alone.** Absence of a GitHub
Actions deploy proves only that Actions does not deploy them. The `Makefile` help text on the
target (`functions-deploy: … ## Deploy all edge functions (production deployer:
docs/agents/CURRENT_STATE.md)` since `#1728`; `# Lovable does this automatically` before it) is
**comment text, not measurement** — do not treat either wording as publisher evidence. Label the
edge path as separate and environment-verified; do not assert "manual only" or any automatic
deployer until the publish trigger is measured
(§14; how the publish trigger, the promotion of a build to the production hostnames, and the edge
path are measured is defined in `docs/specs/release-topology-specification.md` §4, §5.3 and §5.7;
its appendices hold dated results, later `docs/agents/CURRENT_STATE.md` stamps record new ones).

An earlier draft said publishing "ships frontend and edge functions". No repository evidence supports
an automatic joint ship, and a release operator relying on it could publish a frontend expecting
newer edge code while the backend stays stale.
_Source:_ `package.json:21-22` (`deploy:functions`, `deploy:functions:all`) and `:224`
(`sb:functions:deploy`). The Actions absence was established by grep over `.github/workflows/` at the
stamped SHA for `functions deploy`, `supabase functions`, `supabase link` and `db push`: only comments
and help text match. The eight workflows that install the Supabase CLI run local stacks only.
`Makefile:77-78` holds the `functions-deploy` target and its comment (non-authoritative). See also
`AGENTS.md`.
`established fact` for the scripts and for the Actions absence; trigger identity `NOT_MEASURED`.

---

## 10. Statistical methods are bounded by evidence

**AC-10.1 — VPD drift uses an EWMA with fixed default parameters. They are documented here, not pinned by a test.**
`DEFAULT_VPD_DRIFT_ALPHA = 0.3` and `DEFAULT_VPD_DRIFT_MIN_READINGS = 6`, with the recurrence
`ewma = α·v + (1−α)·ewma` and classifications `insufficient` / `in_band` / `sustained_high` /
`sustained_low`. An α outside `(0, 1]` is **replaced with the default** — a fallback, not a clamp: an
input of `5` becomes `0.3`, not `1`. The module is mirrored into `_shared` per AC-2.3. **Do not
silently move α to 0.2.**
_Source:_ `src/lib/vpdDriftRules.ts:20` (classifications), `:56-57` (defaults), `:64-65` (fallback),
`:67-70` (minimum readings), `:86` (recurrence);
`supabase/functions/_shared/lib/lib/vpdDriftRules.ts` (byte-identical apart from its generated
header). Re-checked at the stamped SHA: zero references to `DEFAULT_VPD_DRIFT_ALPHA` or
`DEFAULT_VPD_DRIFT_MIN_READINGS` outside the two source files. An SQL twin,
`public.evaluate_vpd_drift_ewma`, carries the same default and fallback
(`supabase/migrations/20260604063855_7be6c33e-6b1e-4512-b3fe-6955a454735b.sql:121`, `:151-152`, `:198`).
**No product path computes the EWMA today:** `evaluateVpdDriftEwma` has no non-test caller, no code
calls the SQL function, and the only consumer (`buildVpdDriftAiContext`) runs only when a caller
passes `vpdDrift`, which none does. Whether the SQL function exists in production is
`NOT_MEASURED`. `established fact`.
_Enforcement:_ **`convention only` — the parameter is NOT pinned.** An earlier draft claimed
`src/test/vpd-drift-ewma.test.ts` pinned it. It does not: that file never references `alpha`,
`DEFAULT_VPD_DRIFT_ALPHA` or `0.3`, and its classification cases are broad enough to keep passing if
the default moved to 0.2. Claiming a pin that does not exist is the precise failure this document
exists to prevent, so it is corrected rather than quietly dropped. An exact resolved-value assertion
is proposed as **T6** in §11.

**AC-10.2 — Nelson Rules and Modified Z-Score / MAD are NOT implemented, and must never be
described as implemented.**
Case-insensitive search across `src/` and `supabase/` at the stamped SHA returns **zero** hits for
`nelson`, `modified z`, `modifiedZ`, `median absolute deviation`, `\bMAD\b`, `z-?score`, `zscore`
or `robust ?z`, and the same at `2ffe78cc1` and `7e024f93` over `scripts/`, `e2e/`, `tools/`, `plugins/` and
`spikes/`. Outside this contract, Nelson is mentioned only as not-implemented guidance: the
2026-08-21 adjudication, `docs/specs/release-topology-specification.md:943` at `#2072` head
`c7838ccb42f14e8f00dc4be5d8a8e629433897a6` (the not-implemented row; the same line on this stamp,
re-read after `#2072` merged), and the review rule at
`.coderabbit.yaml:205-206`. The `#2073` PR body named a prospective `:936` for that row. Merged PR
bodies are not edited. A later integration that moves the row must revalidate this citation. The
header's `:831` → `:853` move is the line on the `c8523adc` tree and stays that historical cite.
_Source:_ measured at the stamped SHA; `docs/audits/architecture-audit-adjudication-2026-08-21.md`
§4.1. `established fact`.

**AC-10.3 — Both are rejected, not deferred. See §12.**

---

## 11. Enforcement map

Honest accounting of which clauses are held by a gate and which by convention. **All 48 clauses
are classified below** (no omissions). §0.2 promises each clause names the mechanism that keeps it
true; a clause missing from this table would be an unstated gap.

| Clause  | Enforcement                                                                                                                                                    | Kind                |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| AC-1.1  | build / regeneration                                                                                                                                           | structural          |
| AC-1.2  | regeneration overwrite (route tree, `_shared`); MCP bundle and `types.ts` by convention (`TREE_HASH_ROOTS` records a change, does not reject one)              | **partially gated** |
| AC-1.3  | URL-set parity, `/operator/` shape, operator/internal ↔ `_operator` layout, `/sensors/*` both ways; general auth ↔ `_app` parity unenforced (T7)               | **partially gated** |
| AC-1.4  | `vite-dev-server-binding.test.ts` pins the ESM import path; no-duplicate-plugin rule by review                                                                 | **partially gated** |
| AC-1.5  | comment and review — explicit CSRF registration; Start's default applies only without a start instance; non-prod warning; T8 proposed                          | `convention only`   |
| AC-1.6  | `server-security-headers-runtime.test.ts` runs the Worker on an h3-swallowed JSON 500 and asserts the `text/html` error page (`#1937`)                         | **gated**           |
| AC-1.7  | `funnel-event-db-sink.test.tsx` source-scan pins sink-before-Outlet order                                                                                      | **gated**           |
| AC-1.8  | lockfile + 24 h release-age guard (AC-8.2); major-line moves by review                                                                                         | `convention only`   |
| AC-2.1  | shape of the code as written                                                                                                                                   | structural          |
| AC-2.2  | RLS and server-side checks at runtime                                                                                                                          | runtime boundary    |
| AC-2.3  | required `Preflight — edge shared-lib mirror in sync` (`--check-only`); local prebuild auto-repairs instead of failing                                         | **gated**           |
| AC-2.4  | `auth-hardening-static-safety.test.ts` source-scan requires `sessionStorage`, forbids `localStorage`                                                           | **gated**           |
| AC-3.1  | comment and review                                                                                                                                             | `convention only`   |
| AC-3.2  | comment and review                                                                                                                                             | `convention only`   |
| AC-3.3  | comment and review — pinned/reused/safety copy in constants; inline JSX prose allowed                                                                          | `convention only`   |
| AC-3.4  | comment and review                                                                                                                                             | `convention only`   |
| AC-4.1  | no gate proves resolved vocabulary is not widened; schema width is measured fact; T2/T3 proposed                                                               | **unenforced**      |
| AC-4.2  | display split gated by `sensor-source-display-canon.test.ts` (#1088); `isRejectedSourceAlias` has zero non-test callers, so no ingest gate                     | **partially gated** |
| AC-4.3  | comment and review; T3 proposed                                                                                                                                | `convention only`   |
| AC-4.4  | comment and review — deliberate Pi exception                                                                                                                   | `convention only`   |
| AC-4.5  | one-directional only                                                                                                                                           | `convention only`   |
| AC-4.6  | `scripts/sensor-safety-check.mjs` — wording heuristic, 5 files; 3 non-required lanes on PRs to `main`/`verdant-grow-diary`, once suites pass                   | **partially gated** |
| AC-5.1  | `geminiDirectChat.test.ts` in a required job pins both routes, scans both call sites and runs both handlers keyless (zero spends); `ai-cultivar-qa` unenforced | **partially gated** |
| AC-5.2  | no code path from the request body to the model constants; route values pinned by `geminiDirectChat.test.ts` (AC-5.1)                                          | structural          |
| AC-5.3  | shape of the code as written                                                                                                                                   | structural          |
| AC-5.4  | UUID syntax check plus **atomic RPC** spend/refund/conflict; `scripts/run-ai-credits-rls-harness.ts`                                                           | runtime boundary    |
| AC-5.5  | product-safety commitment held by review and by absence of cultivation/queue writes                                                                            | **unenforced**      |
| AC-5.6  | shape of the code as written — null/missing quality still contributes                                                                                          | structural          |
| AC-5.7  | output **shape** enforced by tool schema + grounding validator; **one-photo ceiling convention-only**                                                          | **partially gated** |
| AC-5.8  | shape of the code as written                                                                                                                                   | structural          |
| AC-6.1  | RLS and server-side checks at runtime                                                                                                                          | runtime boundary    |
| AC-6.2  | comment and review                                                                                                                                             | `convention only`   |
| AC-6.3  | shape of the code as written                                                                                                                                   | structural          |
| AC-6.4  | RLS and server-side checks at runtime                                                                                                                          | runtime boundary    |
| AC-6.5  | `ai_credit_allowance` + `ai_credit_spend` cap founder at 100/month                                                                                             | runtime boundary    |
| AC-7.1  | product-safety commitment held by review                                                                                                                       | **unenforced**      |
| AC-7.2  | product-safety commitment held by review                                                                                                                       | **unenforced**      |
| AC-7.3  | product-safety commitment held by review                                                                                                                       | **unenforced**      |
| AC-8.1  | `scripts/check-bun-lockfile-policy.mjs` via `check-bun-lockfile-policy.test.ts` in the required shards (forbids `package-lock.json`; no review date)           | **gated**           |
| AC-8.2  | comment and review                                                                                                                                             | `convention only`   |
| AC-8.3  | comment and review                                                                                                                                             | `convention only`   |
| AC-8.4  | ESLint                                                                                                                                                         | **gated**           |
| AC-9.1  | `Published migration integrity` runs on migration PRs; not a required context per the 2026-08-10 mirror                                                        | **partially gated** |
| AC-9.2  | comment and review                                                                                                                                             | `convention only`   |
| AC-9.3  | comment and review — edge trigger identity `NOT_MEASURED`                                                                                                      | `convention only`   |
| AC-10.1 | comment and review — α is documented here but not pinned (`src/test/vpd-drift-ewma.test.ts` does not assert it); T6 is the proposed pin                        | `convention only`   |
| AC-10.2 | absence of Nelson / MAD implementations; T5 proposed                                                                                                           | **unenforced**      |
| AC-10.3 | product decision recorded in §12                                                                                                                               | **unenforced**      |

**Count check:** 48 rows above = 48 clauses (AC-1.8 added in the 2026-09-22 amendment). Kinds used: **gated**, **partially gated**,
structural, runtime boundary, `convention only`, **unenforced**.

**On AC-5.4, corrected.** An earlier draft grouped it with AC-5.2 as "no code path from request body
to constant or key". That is wrong: `idempotencyKey` **does** come from the request
(`ai-doctor-review/index.ts:428-431` validates `request.idempotencyKey` as a UUID, and `:481` passes
it to `p_idempotency_key`). UUID validation is only syntax. Double-spend prevention, replay
classification, and append-only refunds are **RPC/runtime**. AC-5.2's boundary is structural;
AC-5.4's is a runtime boundary. Conflating them records the wrong trust boundary.

**On AC-6.5, corrected.** An earlier draft listed it with unenforced product-safety peers. Founder
credits are capped by `ai_credit_allowance` / `ai_credit_spend` at runtime — same kind as AC-6.1 /
AC-6.4.

**Proposed gates.** These do not exist yet and are named so the gap is visible rather than implied:

| ID  | Test                                                                                                                                                                                                                                                                                                                                                                                                                               | Guards        |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| T1  | Every repository path cited by a clause in this file exists at the stamped SHA, **and each cite's short expected snippet appears on the cited line (or inside the cited inclusive range)**. File/line existence alone is not T1. Soft `#1088` drifted five `sensorSourceRules.ts` cites by two lines while those line numbers still existed — existence-only T1 would have stayed green. A cite without a snippet is a T1 failure. | this document |
| T2  | `SENSOR_SOURCES` and `CANONICAL_SENSOR_SOURCES` resolve **equal** — by import and object comparison, not by regex                                                                                                                                                                                                                                                                                                                  | AC-4.1        |
| T3  | No module outside the two canonical files declares a sensor-source union literal, with the two known drifts allowlisted so the count can shrink but not grow                                                                                                                                                                                                                                                                       | AC-4.3        |
| T4  | `MODEL` and `MODEL_TIER` are module constants and not request-derived                                                                                                                                                                                                                                                                                                                                                              | AC-5.2        |
| T5  | Zero occurrences of Nelson / modified-Z / MAD across `src/` and `supabase/`                                                                                                                                                                                                                                                                                                                                                        | AC-10.2       |
| T6  | `DEFAULT_VPD_DRIFT_ALPHA === 0.3`, `DEFAULT_VPD_DRIFT_MIN_READINGS === 6`, and one exact numeric recurrence step                                                                                                                                                                                                                                                                                                                   | AC-10.1       |
| T7  | Every route's declared `access` matches the layout it is mounted under for `auth` ↔ `_app` and `public` ↔ public roots — operator/internal parity is already tested (AC-1.3)                                                                                                                                                                                                                                                       | AC-1.3        |
| T8  | `startInstance`'s resolved `requestMiddleware` contains a CSRF middleware that **rejects** a cross-site server-function request and **passes through** a non-server-function request                                                                                                                                                                                                                                               | AC-1.5        |

**Each test needs the technique its claim actually admits — they are not all import tests.**

| Test | Technique                                      | Why                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ---- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T1   | **source scan of this document + cited files** | Parse `_Source:` (and in-prose) cites of the form `` `path:line` (`snippet`) ``, `` `:N` (`snippet`) ``, or inclusive ranges `` `:start-end` (`snippet`) ``. The parenthetical is the expected snippet. Open the cited file at the stamped SHA and require that snippet to occur on that line, or on at least one line of a range. Do **not** pass merely because the path exists and the line number is in range — that is the Soft `#1088` miss. A cite that names a line or range but carries no snippet fails T1. Scanning this document for snippets is legitimate source-scan work (proving a string is present on a named line), not a config-resolution case; `scripts/check-contract-test-resolution.mjs` does not apply. **No T1 runner exists in this tree today.** This row specifies the gate; implementing the runner is still sequenced in §13.                                                                                                                                                                                                                                                                                                                                                                                                        |
| T2   | **resolved import**                            | Both are runtime `as const` arrays, so the values exist at runtime and can be compared as objects                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| T3   | **source / AST scan**                          | Sensor-source unions are **type-level and erased at runtime**. No import can observe a declaration that does not exist in the emitted output; finding declarations outside the canonical files needs AST                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| T4   | **source / AST scan only**                     | `MODEL` and `MODEL_TIER` in `ai-doctor-review/index.ts` are **unexported** module constants, and importing that entrypoint executes `Deno.serve(...)`. A resolved-value import assertion is not available without a structure change; do not fake one. Scan for the const declarations and prove no request field reaches model selection                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| T5   | **source scan**                                | Proving a token is **absent** is exactly what scanning is good for                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| T6   | **resolved import**                            | Both are exported runtime numbers; assert the values and one hand-computed EWMA step so a default change fails loudly                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| T7   | **route-tree traversal**                       | Access group is a property of the mounted layout, so the check must walk the tree, not the manifest alone                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| T8   | **resolved import + execution**                | Presence alone proves nothing: the filter is a closure the middleware object does not expose, so `filter: () => false` would still carry the symbol. Import `startInstance` and resolve `getOptions()` (the call Start makes, `start-server-core@1.169.17` `createStartHandler.js:229`). Locate the middleware by `Symbol.for("tanstack-start:csrf-middleware")`, which Start attaches only when `NODE_ENV !== "production"`, so this works under Vitest and not in a production-mode probe. Then **execute** its `options.server` handler (`start-client-core@1.170.14` `createMiddleware.js:13-14,23-24`) with a stub `next`, **twice, on the identical request carrying `Sec-Fetch-Site: cross-site`, varying only `handlerType`**. With `"serverFn"` it must return the 403 failure response (`createCsrfMiddleware.js:56-58`); with any other handler type it must reach `next` (`:8`). Holding the request constant isolates the filter: a same-origin request would pass CSRF validation whatever the filter does, and prove nothing. Whether `src/start.ts` imports cleanly under Vitest is `NOT_MEASURED`; if it does not, the fallback is a declared `@source-scan-justified` AST check that the registered filter compares `handlerType` with `"serverFn"` |

**`scripts/check-contract-test-resolution.mjs` does not apply to any of these.** It flags two
shapes of test: one that reads the source of `playwright.config` or `vitest.config` without
importing it (`CONFIG_FILES = ["playwright.config", "vitest.config"]`, `:53`), and, since `#1221`,
one that reads `package.json` as raw text and asserts on that text instead of the parsed object
(`JSON_CONFIG_FILES = ["package.json"]`, `:68`). T2–T8 read no config, so neither shape is any
of them. T1 is the one exception: it opens every cited file and matches a snippet on the named
line, and this document cites `package.json` at seven places (`:9`, `:21-22`, `:65`, `:224`,
`:323`, `:324`, `:370`). That is citation integrity, not verification of effective configuration,
which is the only thing the checker guards; it is the "proving a string is present or absent" use
`AGENTS.md` keeps for source scans. A T1 runner placed anywhere the checker scans therefore
declares `@source-scan-justified: citation integrity` rather than importing `package.json`. Citing
the checker as the reason T2–T4 must import was wrong: the underlying principle — verify
effective configuration by resolving it when possible, and use scanning to prove absence,
structure, or unexported Deno-entry constants — is what governs here, not that checker's scope.

---

## 12. Rejected alternatives

Rejected means decided, with a reason. Re-proposing one requires new evidence, not a new preference.

| Alternative                                            | Verdict      | Why                                                                                                                                                                                                              |
| ------------------------------------------------------ | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Nelson Rules** for telemetry anomalies               | **REJECTED** | Environmental telemetry violates textbook SPC assumptions — day/night cycles, uneven sampling intervals, stage transitions, maintenance windows, sensor replacement. Wholesale adoption would manufacture alarms |
| **Modified Z-Score / MAD**                             | **REJECTED** | Same class of assumption violation; no evidence of need, and no implementation to preserve                                                                                                                       |
| **Moving VPD α from 0.3 to 0.2**                       | **REJECTED** | Named explicitly in the 2026-08-21 adjudication as a change not to make silently. α is a tuned parameter that is **currently unpinned** (AC-10.1 / T6); do not assume CI catches a silent move                   |
| **Next.js migration**                                  | **REJECTED** | No source pressure. TanStack Start SSR is working, `server-only` is already banned as a foreign idiom (AC-8.4), and the cost is the whole route tree and every shim importer (AC-3.4)                            |
| **Drizzle**                                            | **REJECTED** | Would sit beside an append-only migration history and generated Supabase types; introduces a second schema truth                                                                                                 |
| **tRPC**                                               | **REJECTED** | Server functions plus edge functions already cover the seam, and RLS — not a typed RPC layer — is the boundary that matters (AC-2.2)                                                                             |
| **Auth migration off Supabase Auth**                   | **REJECTED** | Auth, RLS, and `auth.uid()` are one system. Replacing the first breaks the authorization model                                                                                                                   |
| **Collapsing vendor/transport into `source`**          | **REJECTED** | Directly contradicts AC-4.2. Would let a vendor name imply health                                                                                                                                                |
| **Device control / automatic Action Queue**            | **REJECTED** | Product-level safety commitment, not a technical one (AC-7.1)                                                                                                                                                    |
| **Inferring production behaviours from `vercel.json`** | **REJECTED** | Governs only when the measured publisher applies it (`docs/specs/release-topology-specification.md` M7), not by being in the repository. Its old "not applied" rationale was measured under a previous publisher |

---

## 13. Deferred

Not rejected — sequenced.

| Item                                                                                                    | Gate                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The gates T1–T8 in §11 (earlier versions of this row said T1–T5, then T1–T7)                            | Their own slice; T2, T3 and T8 are the highest value. GDP-ARCH-CITE-001 amended **T1's specification** (snippet match, not existence-only) but did not add a runner                                                                    |
| Consolidating `docs/architecture.md`, `docs/grow-os-architecture.md`, `docs/grow-diary-architecture.md` | All three predate or contradict the current stack in places; retiring them is a separate reviewed slice                                                                                                                                |
| Enumerating the remaining sensor-source union re-declarations                                           | Bounded by T3 rather than by hand                                                                                                                                                                                                      |
| Renaming `BillingSubscriptionRow` (AC-6.1 hazard)                                                       | Cosmetic; touches entitlement types, so it wants its own diff                                                                                                                                                                          |
| An enforceable visual-evidence cardinality signal plus a confidence cap for AI Doctor (AC-5.7)          | Safety-bearing; needs a packet-shape change, so it is its own reviewed slice                                                                                                                                                           |
| Making the AC-4.5 pin bidirectional, or restating its comment                                           | Small, but it changes a safety-adjacent normalizer                                                                                                                                                                                     |
| Guarding `normalizeSensorSource` against prototype keys (AC-4.1)                                        | **Done** in #1655 (own-key guard in the normalizer and `resolveSensorSourceLabel`, gated by `src/test/sensor-source-prototype-key.test.tsx`); the earlier `fd33e8ff9` guard went with #1620, closed unmerged 2026-09-23                |
| Aligning the `manual_provenance` envelope with `SENSOR_PROVENANCE_TRANSPORTS` (AC-4.2)                  | Touches a persisted payload shape and its readers; needs its own reviewed slice                                                                                                                                                        |
| Retiring the unreachable legacy `classifySource` in `aiDoctorEngine.ts` (AC-4.3)                        | Deletion of dead code on a safety surface; its own diff, with a test that the live path is unaffected                                                                                                                                  |
| Making `Published migration integrity` a required context (AC-9.1)                                      | A ruleset change — Cheek's decision, not a code change                                                                                                                                                                                 |
| Removing the declared-but-unimported `@supabase/ssr` dependency (AC-2.1)                                | A dependency change; its own slice under AC-8.2                                                                                                                                                                                        |
| Correcting `CLAUDE.md`'s "Two `*Rules.ts` import Supabase" (AC-3.2)                                     | **Done** in `#1717` (`ea361665`), with the twelve-file `Sentinel-Version` bump to `2026-09-25.1`                                                                                                                                       |
| Release-topology follow-ups                                                                             | Of the follow-ups `docs/specs/release-topology-specification.md` §12 names, `CLAUDE.md` (`#1717`) and the stale comments (`#1728`, `#1732`) are done; `#1175` merged as `0a6210c1`; the preview-doc follow-up was not re-measured here |
| Binding Quick Log persistence and target selection as a clause                                          | After #1674, #1675, #1676 and #1678 resolve, because all four change that surface. The facts to bind are recorded below the table                                                                                                      |

**Sequencing notes for these rows.** Durable rules only. Whether any PR named here is open,
merged or mergeable is operating state, and it lives in `docs/agents/CURRENT_STATE.md`.

- **T1.** A runner that pins only the five `sensorSourceRules.ts` cites from GDP-ARCH-CITE-001, as
  #1643 proposes, is a partial T1, not the gate §11 specifies.
- **Prototype keys.** A change to the `normalizeSensorSource` return line that AC-4.1 cites, such as
  the own-key guard #1655 added, fixes the AC-4.1 defect and breaks every T1 pin on that line,
  including the one #1643 proposes. It must amend AC-4.1 and update those pins in the same change.
- **Quick Log.** `established fact` at the stamped SHA: Quick Log persists through **two** RPCs,
  not one. Direct callers, found by searching non-test `src/` for each RPC name within two lines of
  an `.rpc(` call:
  - `quicklog_save_manual`: `src/hooks/useQuickLogV2Save.ts`, `src/hooks/useQuickLogActivitySave.ts`
    and `src/hooks/useSaveAiDoctorPhase1TimelineEvidence.ts`;
  - `quicklog_save_event`: `src/hooks/useQuickLogActivitySave.ts`,
    `src/lib/writeQuickLogWateringTypedEvent.ts` and `src/lib/writeFeedingTypedEvent.ts`.
    (`src/lib/quick-log/createQuickLogEvent.ts`, a fourth caller at earlier stamps, had no reachable
    caller and was removed by `#1839`. It is absent from the stamped tree.)

  Photo and video entries insert into `diary_entries` directly from
  `src/lib/quickLogPhotoDiaryEntry.ts` and `src/lib/quickLogVideoDiaryEntry.ts`, and
  `src/test/quick-log-media-insert-fence.test.ts` holds that divergence to exactly those two files.
  Target precedence in `src/lib/quickLogTargetResolutionRules.ts` has no remembered-default tier,
  pinned by `src/test/quick-log-target-resolution-rules.test.ts`, and a remembered target is only
  ever offered as a suggestion (`src/test/quick-log-recent-target-chip-wiring.test.ts`). Governance
  prose that speaks of "the single `quicklog_save_manual` write path" is narrower than this tree.
  None of this is a clause yet.

---

## 14. What this contract does not settle

Stated as unknowns rather than omitted, so nobody reads silence as agreement.

**Release topology is deliberately not settled here, and the dated evidence for it lives elsewhere.**
An earlier draft of this section recorded current hosting observations and publisher evidence
directly. That contradicted this document's own header — production axes are absent, and
`docs/agents/CURRENT_STATE.md` is strictly disjoint — and would have made a permanent contract go
stale every time the operating picture moved. Only the durable rules stay:

- **Publisher identity is not established by response headers.** Serving infrastructure and publisher
  identity are different claims; measuring the first says nothing about the second. Repository
  documents once disagreed: `CLAUDE.md` named Lovable until `#1717`, and
  `scripts/stamp-version.mjs:23-27` carried a dated Lovable observation until `#1728` (it still
  records the 2026-08-05 history-less snapshot, now without naming its publisher). The measured
  answer, with its date, lives in `docs/specs/release-topology-specification.md` (Appendix A) and in
  later `docs/agents/CURRENT_STATE.md` stamps — never here. **`Makefile:77`'s help text is a Make
  comment only — not publisher evidence**, whether it reads "Lovable does this automatically" (until
  `#1728`) or "production deployer: docs/agents/CURRENT_STATE.md" (since). The durable requirement:
  **measure the publish trigger before asserting a publisher**, by the chain that specification's
  §4 defines. Not measured in this file, by design.
- **The build target is not the serving target, and neither may be assumed from the other.** A
  build target does not establish the serving target. The Lovable preset configures Nitro against
  one build target; which host serves production is a separate measurement, and this section does
  not state it. Dated measurements stay in `docs/specs/release-topology-specification.md` and in
  `docs/agents/CURRENT_STATE.md`. Reconciling the two targets requires deployment metadata this
  repository does not contain. The durable
  requirement: **a release topology claim is measured or it is `NOT_MEASURED`** — never inferred from
  build configuration, response headers, Make comments, vendor SDKs, or tip-equals-live parity.
  `docs/specs/release-topology-specification.md` §4 and §8 define the measurement chain; its
  dated results are not restated here.
- **Applied production schema is `NOT_MEASURED`** here and belongs to `docs/agents/CURRENT_STATE.md` (AC-9.3).
- **Per-table RLS policy state** is owned by migrations, not by this file.
- **Runtime drift among the 70–106 unenumerated union literals matching AC-4.3's text patterns** is
  `NOT_MEASURED`, and not every match is a sensor-source union; two are confirmed divergent by
  reading, the rest were not enumerated.
- **A vendor telemetry SDK is not publisher evidence.** `@vercel/analytics` and
  `@vercel/speed-insights` were added in #1336 and render through
  `src/components/ConsentGatedVercelTelemetry.tsx`. A client-side analytics package says where
  telemetry is sent, not who builds, publishes, or serves the application. The same rule as for
  response headers applies.
- **Two product-surface facts that bear on topology but do not settle it.** The preset comment names
  Nitro's build-only default target as Cloudflare (`vite.config.ts:4`), and the preset code agrees:
  it sets `defaultPreset: "cloudflare-module"`, and inside a Lovable sandbox it forces
  `preset: "cloudflare-module"` with output under `dist/` (preset 2.8.5, `dist/index.js:576-592`).
  That is the configured build target, not the serving target. Separately, `prebuild`
  runs `restore-env-production-from-head.mjs` and `assert-paddle-production-sandbox.mjs` before
  the edge and stamp gates (`package.json:9`). Both are build inputs; neither measures the serving
  target or the publish trigger.

---

## 15. Amending this contract

1. A clause changes only in a slice that changes the code it governs, or in a slice whose stated
   purpose is to amend the contract. Never as a drive-by edit.
2. Re-stamp the verification SHA in the header and re-verify every clause you touched. A clause
   carried forward unverified must be relabelled `source claim`.
3. Moving a clause from `convention only` to **gated** is always in scope and never needs a contract
   amendment — it needs a test.
4. Removing a clause requires stating what replaced it. A clause that is merely inconvenient is not
   obsolete.
5. This file carries no `Sentinel-Version` and is not one of the twelve governance files. Editing it
   alone requires no parity bump.

   **Why, stated correctly.** `scripts/check-sentinel-version-parity.mjs` iterates a fixed
   `ALL = [CANONICAL, ...MIRRORS]` array naming exactly those twelve files (`:31-45`), so adding a
   version header here would **not**, on its own, pull this file into the parity gate — an earlier
   draft claimed it would, and that was factually wrong. The reason to leave the header off is
   different and weaker: a `Sentinel-Version` line signals governance-file status this document does
   not have, and invites a future editor to add it to `MIRRORS` and turn every amendment into a
   twelve-file change. Adding this file to that list is a deliberate decision for Cheek, not a side
   effect of a header.

### 15.1 Amendment record

| Date       | Verified at                                | By     | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ---------- | ------------------------------------------ | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-09-05 | `7c46855b7fd49651cf8ed080a5a931ff8fbdd640` | Grok   | First stamp (PR #1281).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 2026-09-22 | `387a00067a76ca9e2ced453d6b6a0f580e33209b` | Claude | Full §15 re-verification of the 47 existing clauses, 327 commits after the first stamp, plus new AC-1.8 (stack majors); 48 clauses in total. Corrected enforcement for AC-1.3, 1.4, 1.7, 2.4 (tests existed at the first stamp) and AC-4.6, 9.1 (not required checks), and for the AC-1.2 MCP bundle (convention only; `TREE_HASH_ROOTS` does not reject hand edits). Recorded the AC-4.1 prototype-key defect, the AC-4.2 catch-all and registry divergence, the AC-4.3 unreachable promotion, the AC-5.6 second site, and the AC-7.3 explicit breeding writer. Corrected the AC-2.1 client-library and RPC claims. Re-pointed drifted citations. Carried the AC-1.4 preset internals and the AC-1.5 automatic-CSRF absence as `source claim` (not re-measurable without `node_modules`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 2026-09-23 | `8b73c14031050b51061d4715bedbcdfeb66eee52` | Claude | §15 amendment, verified against installed packages whose versions match `bun.lock`. AC-1.4: measured the preset internals, previously a `source claim` (devtools are development-only; Nitro is build-only); recorded that the ESM-path rationale did not reproduce on Node 22.22.2 with Vite 8.2.0, and kept the rule. AC-1.5: corrected. Start installs a default CSRF middleware only when no start instance exists, the `src/start.ts` comment is accurate, and Start logs the missing-middleware warning only outside production (`NODE_ENV !== "production"`, which includes `test`). Added proposed gate T8 (AC-1.5), which executes the registered middleware rather than only detecting it. §14: recorded the preset's Nitro build target from its code. The dated observation stays here, not in §14: a local production build at 8b73c140 logged `preset: cloudflare-module` and wrote `.output/`. No other clause touched; the code tree is identical to `387a0006`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 2026-09-23 | `ea50ec678dee26e8ad5494c5d41aab8e4de1740e` | Grok   | GDP-ARCH-CITE-001. Soft `#1088` (`442370af1`) inserted two comment lines above `pi_bridge` / the `TRUST_LIVE_ALIASES` pin / `normalizeSensorSource` / `isHealthySensorSource`, so five `sensorSourceRules.ts` cites in AC-4.1, AC-4.4 and AC-4.5 pointed two lines too high while the line numbers still existed. Re-pointed `:80`→`:82`, `:86`→`:88`, `:24-26,86`→`:24-28,88`, `:46`→`:48`, `:46-51`→`:48-53` after re-reading the tip file. `:16` (`SENSOR_SOURCES`) was already correct. Cited `src/lib/sensorSourceDisplayCanon.ts` from AC-4.2 (vendor/transport names are provenance, never the Source label). Amended proposed T1 from path/line existence to require a short expected snippet on the cited line or inside the cited range — existence-only T1 would have passed this drift. No T1 runner was present; this slice does not add one (§13). Docs-only; no `CURRENT_STATE.md` restamp.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 2026-09-23 | `32820526d6e71c5a2ed213da35f3a68f66f86432` | Claude | §15 amendment, follow-up to GDP-ARCH-CITE-001 (#1639). Corrected three citations that fail T1: AC-1.5 prose `:238` now names `createStartHandler.js`, the AC-1.7 historical note spells its superseded range in prose, and AC-5.3 `readToolArguments` is now `:639-649`. AC-4.1: #1620, which carried the prototype-key guard, closed unmerged; the defect now reaches the #1088 display canon (`sourceLabel` undefined, still never healthy), under Bun 1.3.11. AC-4.2: qualified the "always one of the six" display claim accordingly; reclassified partially gated (display split tested). AC-3.2: `*Rules.ts` 517 → 518 (#1636); AC-3.4 shim imports 743 → 744 (#1647), and §12's Next.js row now cites AC-3.4, not a count; other §3 counts and the AC-4.3 union count unchanged. §13 and §14: #1620 and #1619 closed unmerged; #1175 and #1221 still open. T1 text unchanged. Rejoined the §13 table #1639 split with a blank line; applied the repo Prettier config.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 2026-09-24 | `32820526d6e71c5a2ed213da35f3a68f66f86432` | Claude | Editorial follow-up to #1649; stamp unchanged. AC-1.5's in-prose bullet no longer writes the installed Start package as a `path:line` token: it now names line 238 of `createStartHandler.js` in prose, with its `[defaultCsrfMiddleware]` fallback, re-read in `@tanstack/start-server-core` 1.169.17, the version `bun.lock` pins at this SHA. The clause's `_Source:` block keeps its package-internal cites and now says T1 does not cover them: T1 covers repository paths, and a dependency file cannot be opened at the stamped SHA. Copilot, CodeRabbit and the Codex GitHub reviewer raised the bullet on #1649; Copilot raised the `_Source:` block on #1667. No other clause changed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 2026-09-24 | `ef15b2c1be949d720f34bc33e4b980d18d6114e2` | Claude | §15 re-verification, 12 commits after `32820526` (first #1656, last #1664). No repository file the contract cites by path changed, apart from this file and `docs/agents/CURRENT_STATE.md` (cited as a document), so every citation holds by file identity. AC-3.2: `*Rules.ts` 518 → 519 (#1663 adds a pure rules file); the `Date.now()`, `Math.random()` and Supabase-importer counts are unchanged. AC-3.4: 744 → 750 shim import statements, in 749 files; the prior 744 also counted statements. AC-4.3: the wider union count is unchanged at 105 lines in 85 files. AC-10.2: zero hits on re-run. §13: added the Quick Log deferral row, with every direct RPC caller, and sequencing notes with no PR state (a change to the AC-4.1-cited line, as #1655 proposes, must update its T1 pins, as #1643 adds, in the same change); the release-topology row no longer states PR status. No clause statement changed. Docs-only; no `CURRENT_STATE.md` restamp.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 2026-09-24 | `69aca5e738b7d0d49369a636b1b293564ec65203` | Claude | §15 re-verification, two docs-only commits after `ef15b2c1`. Re-read all 226 repository `path:line` cites outside this record, not by file identity, and the 8 package cites from tarballs whose sha512 matches `bun.lock`. Re-measured §3, §4 and §10 counts, bar AC-4.3's multi-line figure; re-ran AC-4.1's prototype-key reproduction under Bun 1.3.11. AC-3.2 corrected: no root-level `*Rules.ts` imports the Supabase client; the two named files import a generated type only, as at the first stamp. AC-4.6 corrected: the checker runs on PRs into `main`/`verdant-grow-diary` via 3 non-required lanes once earlier steps pass. AC-1.5: the build-time switch is `serverFns.disableCsrfMiddlewareWarning`. AC-4.3: patterns recorded; multi-line figure a `source claim`. §13: `CLAUDE.md` correction deferred. This amendment also fixes `docs/codebase-map.md`. Follow-ups: AC-3.2 (Copilot); AC-1.5, AC-4.6, header (Codex); header, AC-4.3, AC-4.6 (CodeRabbit).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 2026-09-25 | `9b06be3fd6d6001d75473e9bd9c3de92b9b35af2` | Claude | §15 re-verification, five commits after `69aca5e7` (`#1221`, `#1691`, `#1690`, `#1677`, `#1680`; no migration). All 52 changed files (21 in `src/test/`) intersected with every cited path, bare paths too: five carried cites changed. `ci.yml:26` and `docs/codebase-map.md:466-467` hold; three `package.json` cites re-pointed `:359`→`:361` (AC-2.1), `:315`→`:317`, `:316`→`:318` (AC-4.6); required-checks counts re-measured; the §14 checker clause now names its `#1221` `package.json` guard. No cited test file changed; the rest carried by identity. Counts: AC-3.2 `*Rules.ts` 519 → 521 (two pure files; drift unchanged); AC-3.4 750 → 751 shim imports in 750 files; AC-4.3 unions unchanged; AC-10.2 zero hits; AC-4.6 `ROOTS` five; 35 required contexts unchanged. No AC clause statement changed; §14 amended in that clause only. §9 prose, §12, §13 untouched for the open release-topology slice. Docs-only; no `CURRENT_STATE.md` restamp.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 2026-09-26 | `dccaf7324055b91cad0a5b51a40c449bb3b6bcf2` | Claude | §15 re-verification with the release-topology amendment (#1699, carried forward in #1718 after its session was archived and #1705 conflicted). An earlier revision of this row said no AC clause was touched; the rewritten pointer sits inside AC-9.3, so the contract is restamped under rule 2 (Codex on #1718). A first restamp at `5370782` was carried to `4ddb2322` when `#1703` merged, to `7266acd6` when `#1712` and `#1343` merged, and to `dccaf732` when `#1720` and `#1683` merged. 15 merges after `9b06be3f` (first `#1702`, last `#1703`; migrations `#1704` and `#1703`): all 87 changed files intersected with every cited path. AC-7.3 re-pointed `:141`→`:143` (`#1661`); AC-3.2's `docs/codebase-map.md` cite re-pointed `:466-467`→`:469-470` (`#1703`); AC-9.1 re-read (a seventh `mustBeGreen` entry from `#1708`, `required` still 35); AC-9.3 re-verified in full. The carry to `7266acd6` (56 files, no migration) re-pointed AC-8.1's `check-bun-lockfile-policy.mjs:175-180`→`:186-191` and its test `:387`→`:492` (`#1343`); every `package.json` line cite holds. The carry to `dccaf732` (161 files, no migration) re-pointed every `ai-doctor-review/index.ts` cite past `:44` in AC-5.1–5.5, AC-5.8 and §11, same text (`#1683`); AC-5.6 holds under the new stage-target step, which only raises a snapshot's severity. Counts: AC-3.2 `*Rules.ts` 521 → 522 (`#1657`) → 530 (`#1683`), all pure, drift unchanged; AC-3.4 751 in 750 files at `7266acd6`, 761 in 760 at `dccaf732` (ten new tests); AC-4.3's three single-line counts reproduced exactly at `4ddb2322`, `7266acd6` and `dccaf732` by a reconstructed pattern that tests every adjacent pair (an earlier non-overlapping reconstruction gave 75 for 76; recorded in the clause); AC-10.2 zero hits. Amendment: §12's `vercel.json` row is restated in durable form — a host file governs only when the measured publisher applies it (specification M7) — because its earlier rationale was measured under a previous publisher; §13's topology row becomes the follow-ups the specification names; AC-9.3's pointer and §14 name the specification instead of `#1175` / `#1221`, and the AC-9.3 pointer names the promotion axis and carries no dated observation. No clause statement changed; the two durable §14 rules are unchanged. Dated values stay out of this file. Docs-only; no `CURRENT_STATE.md` restamp. |
| 2026-09-26 | `66ea7bd30188329513580633b6599b1380fb6fce` | Claude | §15 re-verification after `#1725`, `#1728` and `#1732`: 8 merges after `dccaf732` (first `#1714`, last `#1732`; no migration). All 36 changed files (4 in `src/test/`) intersected with every cited path, bare paths and basenames too: seven cited files and `Makefile` changed. `scripts/stamp-version.mjs` `:23-26`→`:23-27`; AC-9.3's §11 note and the §14 publisher bullet rewritten for `#1728`'s comment text and `#1717`'s `CLAUDE.md`; AC-3.2's `CLAUDE.md` note and its §13 row closed by `#1717`; the §13 release-topology row updated. AC-9.1, AC-3.2's `:469-470`, `AGENTS.md`'s section cites and the specification's section cites re-read and hold. §3, §4 and §10 counts identical at both SHAs (AC-3.2 530 files, 0 client importers, 2 type-only, 7 `Math.random()`; AC-3.4 761 in 760; AC-4.3 76/66, 69/60, 105/85; AC-10.2 zero); AC-3.2's `Date.now()` and `Math.random()` rows hold at 55 and 7 over the root-level glob (44 and 6 on executable lines; an earlier revision's 56 counted a nested file through a `*` pathspec, caught on #1733). Two clauses touched under rule 2 (AC-9.3, §14), both re-verified at the tip.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 2026-09-30 | `f4aa7ea08610b0353b028b292b2c5a36ac27d54b` | Claude | AC-4.1 / AC-4.2 amendment for #1655 (own-key guard in `normalizeSensorSource` and `resolveSensorSourceLabel`), verified on the #1655 tree merged onto deploy tip `f4aa7ea0` (`origin/verdant-grow-diary` at the merge). AC-4.1: the prototype-key defect paragraphs are replaced by the fixed behaviour — `constructor`, `__proto__`, `toString` and every other `Object.prototype` property name resolve to `invalid`, and the display canon returns `Invalid reading` / `External ingest` / `isHealthyLive: false` — reproduced under Bun 1.3.11 and gated by `src/test/sensor-source-prototype-key.test.tsx`; the `:82` cite is re-pointed to the new own-key text on the same line and `sensorSourceLabelRules.ts:76` is cited. AC-4.2: the two prototype-key qualifications are dropped. §13: the prototype-key deferral row is marked done. No other clause touched; the header stamp is not moved (the fix touches no other cited file). Docs-only; no `CURRENT_STATE.md` restamp.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 2026-10-04 | `2ffe78cc1a5814ba2c8f0c380270bcfc622b960f` | Claude | §15 re-verification at the deploy tip (`#1896`), split from the unmerged lockfile stack on the owner's instruction (#1878 keeps only the post-`#1873` AC-8.1 wording). 566 files changed since `66ea7bd3` (120 merges); 51 cited files changed and every cite into them was re-read. **Seven stack claims, clause by clause:** (1) TanStack Start SSR, Router, Vite, Nitro: PASS (Vite and Nitro are also direct devDependencies; AC-1.8 corrected). (2) React 19, Tailwind 4, shadcn/Radix, TanStack Query: PASS (upstream-latest NOT_MEASURED). (3) Supabase Postgres/Auth/RLS/RPC/Edge Functions: PASS in the repository; production NOT_MEASURED. (4) Bun canonical, npm compatibility remains: PASS; AC-8.1 corrected to say the required shards pin the date, so `reviewBy` is enforced only by a non-required lane. (5) AI Doctor via the Lovable gateway with a server-pinned model, validated tool output, credit and idempotency controls, evidence receipts and no direct Action Queue or device writes: PASS for `ai-doctor-review`; FAIL as a statement about every AI Doctor surface, because `/coach` (titled AI Doctor) calls `ai-coach`, which has no forced tool output and no receipt, and grower-clicked paths create `pending_approval` queue rows. AC-5.3 and AC-5.5 re-scoped; AC-5.2, AC-5.4 and AC-5.8 gain cites; AC-5.4's `:624` was the finalizer, not a credit site. (6) Canonical sources live/manual/csv/demo/stale/invalid with vendor and transport as provenance: PASS for the set and for storage; FAIL for display, because `resolveSensorSourceLabel` shows `Ecowitt` as the Dashboard Source for live EcoWitt rows. AC-4.2 records the gap and a third storage path (`ecowitt-ingest`). (7) VPD EWMA exists, MAD and Nelson not implemented: PASS; AC-10.1 adds that no product path computes the EWMA, and AC-10.2's "only mention of Nelson" sentence was wrong. Counts: AC-3.2 542 (`#1887` adds `oauthSignupFunnelRules.ts`), AC-3.4 773 in 772, AC-4.3 76/66, 69/60, 105/85 reproduced; 35/7 required/mustBeGreen unchanged. §13 `#1175` merged. Line moves are listed in the header                                                                                                                                                                                                                                                                                            |
| 2026-10-07 | `e0bb39304a44dc72dfef83734e651034598b5454` | Claude | Evidence-status note at the later deploy tip, on the owner's instruction to update this PR in place and to label inherited claims. **The stamp does not move:** every clause still describes `2ffe78cc`. New §15.2 labels each of the seven stack claims VERIFIED (re-read at `e0bb3930` this session) or INHERITED (the `2ffe78cc` verdict, not re-read), lists the ten cited files that changed between the trees and the cites that moved, and records `#1857`'s exact-SHA review history, ending in a Codex **FAIL** at `4ee43c6e`. AC-4.2 gains the AI-context-path gap (the resolver emits `unknown`), verified at both trees, whose two files are byte-identical. No other clause statement changed. Docs-only; no `CURRENT_STATE.md` restamp.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 2026-10-08 | `e0bb39304a44dc72dfef83734e651034598b5454` | Claude | Review follow-up, stamp unchanged. §15.2 and AC-4.2 no longer carry `#1857`'s review verdicts, merge state, ahead/behind counts or ownership; those are operating state, recorded in the PR's own comments, and belong in `CURRENT_STATE.md` / `HANDOFF_LOG.md` rather than here. Every remaining `#1857` / `#1873` mention is stated against a fixed SHA (`2ffe78cc`, `e0bb3930`) rather than as PR status, so it cannot go stale. The durable rule stays: nothing on an unmerged branch is a property of the stamped tree, and AC-4.2 is amended against the merged tree when `#1857` or a successor lands. No clause statement changed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 2026-10-13 | `7e024f9362d4f57c1d5cb8252bf0104a2626b46a` | Claude | §15 re-verification at the deploy tip (`#1978`), on the owner's instruction to refresh #1899 at the current tip. Supersedes the `2ffe78cc1` stamp and the §15.2 note. 296 files changed since `2ffe78cc1` (44 merges, 96 in `src/test/`, one additive migration); 24 cited files changed and every line cite into them was re-read by script against both trees. Line moves are listed in the header. Substance: AC-1.1 records that `src/server.ts`'s `fetch` does host redirects, the health path and host headers before SSR (`#1943`), as code fact and not publisher evidence; AC-1.6 moves from `convention only` to **gated** (`src/test/server-security-headers-runtime.test.ts:94-105`, `#1937`); AC-8.1's `reviewBy` is `2026-10-17` and the overdue failure starts 2026-10-18 UTC; §13's Quick Log `quicklog_save_event` callers drop `createQuickLogEvent.ts` (removed by `#1839`); AC-4.2's AI-path paragraph adds that the AI Doctor request-packet and receipt validators admit `"unknown"` as a seventh snapshot source token and check trust separately. Counts: AC-3.2 555 files (13 added, all pure; drift rows unchanged), AC-3.4 784 in 783, AC-4.3 and AC-10.2 unchanged. Seven stack claims: verdicts unchanged from `2ffe78cc1` (1–4 and 7 PASS; 5 PASS for `ai-doctor-review`, FAIL as a claim about every AI Doctor surface; 6 PASS for set and storage, FAIL for display and the AI path), because the unchanged evidence is byte-identical and the changed evidence (`src/server.ts`, `package.json`, `bun.lock`, the new migration) was re-read and still supports them. `#1857` and `#1982` are not on this tree. Production `NOT_MEASURED`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 2026-10-13 | `22f8dfe8d46386bc4044d9312036b5fbd63c494f` | Claude | §15 re-verification at the deploy tip (`#1870`), on the owner's instruction to restamp for `#1982`. Supersedes the `7e024f93` stamp. 101 files across 15 merges since `7e024f93`; 17 cited files changed, and every cite into them was re-read. **Claim 5 is now FAIL for its gateway part:** `#1982` moved `ai-doctor-review` and `ai-coach` to Google's OpenAI-compatible Gemini endpoint through `_shared/geminiDirectChat.ts`, keyed by a server-only `GEMINI_API_KEY` that fails closed before any credit spend. The rest of claim 5 holds: server-pinned models (`gemini-3-flash-preview`, `gemini-2.5-flash`), tool-forced and validated output for the review function, credit and idempotency controls, evidence receipts, and no direct Action Queue or device writes. AC-5.1 rewritten: `ai-cultivar-qa` stays on the gateway; `LOVABLE_API_KEY` stays for it, for email and for Paddle; production deployment and the key are `NOT_MEASURED`. AC-5.1 reclassified **partially gated** by `geminiDirectChat.test.ts` in the required `Lint, typecheck, test, build` job; its key-before-spend order check matches the import, not the call, so that order is unenforced (Codex on `#2065`). AC-5.2 records the route table and the wire/recorded model split. AC-5.8 records that v2 receipts sign the wire model while `p_model_id` keeps the gateway-era id. AC-2.1's `quicklog_save_manual` cite moves to the `#1841` migration. Line moves are listed in the header. Counts: AC-3.2 559 (four new pure `*Rules.ts`), AC-3.4 791 in 790, AC-4.3 and AC-10.2 unchanged; 35/7 required/mustBeGreen unchanged. Claims 1–4, 6 and 7 unchanged.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 2026-10-13 | `7e024f9362d4f57c1d5cb8252bf0104a2626b46a` | Claude | Merge of the deploy tip (`ad79ebc6`, carrying `#1899`'s restamp) into `claude/remove-package-lock` (`#1873`), stamp unchanged. AC-8.1, AC-1.8's lockfile note, the §14 AC-8.1 row and the opening stamp note now state the bun-only rule this branch enforces; every other clause is `#1899`'s text. AC-8.1's cites were re-read on the merged tree: `check-bun-lockfile-policy.mjs:5`, `:24`, `:66-71`, `:179-190` (`:185-186`), `check-bun-lockfile-policy.test.ts:537`, `dependency-security-ci.yml:48-49`. This supersedes the 2026-10-10 Canopy stamp the branch carried (`ba991f60`), which read an older tree.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 2026-10-14 | `22f8dfe8d46386bc4044d9312036b5fbd63c494f` | Claude | Merge of the deploy tip (`ad399831`, carrying `#2065`'s restamp at `22f8dfe8`) into `claude/remove-package-lock` (`#1873`), stamp unchanged. AC-8.1, AC-1.8's lockfile note, the §14 AC-8.1 row and the opening stamp note again state the bun-only rule this branch enforces; every other clause is `#2065`'s text. `#1931` added the `postcss-selector-parser` 7.1.6 floor to `BUN_LOCK_SECURITY_FLOORS`, which moves AC-8.1's cites down one line: `check-bun-lockfile-policy.mjs:5`, `:24`, `:67-72`, `:180-191` (`:186-187`); `check-bun-lockfile-policy.test.ts:537` and `dependency-security-ci.yml:48-49` hold. All re-read on the merged tree.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 2026-10-14 | `ce1d281fa3c39bfd54afd5dab7270a1b232c1014` | Claude | §15 re-verification, first pass, at the then deploy tip (`#2069`; this stamp was never merged on its own and is superseded by the `c8523adc` row below), on the owner's instruction (a `source claim`: given in chat, not recorded in the repository) after CodeRabbit flagged on `#1873` that AC-1.8 claimed the bun-only rule at a stamp that still had `package-lock.json`. Supersedes the `22f8dfe8` stamp. 84 files across 12 merges since `22f8dfe8` (first `#2058`, last `#2069`; 30 in `src/test/`; one migration, `#1872`'s `convert_referral` replacement, `service_role` only); 17 cited files changed, and every cite into them was re-read against both trees. Substance: AC-8.1 and AC-1.8 now describe the stamped tree, so the after-the-stamp note is gone; AC-4.2's AI-context-path gap is replaced by the fixed resolver (`#1857`), gated by `quick-log-sensor-snapshot-ai-allowlist.test.ts`, as §15.2 required; AC-1.7 records the Grow Help Toolkit branch that renders `<Outlet />` without the sink (`#1851`). Counts: AC-3.2 unchanged (559; 55/7, 44/6, 0, 2); AC-3.4 792 in 791; AC-4.3 77/67, 70/61, 106/86; AC-10.2 zero. Line moves are listed in the header.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 2026-10-14 | `c8523adccc81f18e0cf7118a69dc31493d273c4c` | Claude | §15 re-verification, second pass, at the deploy tip (`#2079`), completing `#2073` after Critical Mass's FAIL at `023ba0df` (P1: AC-5.1 still described the pre-`#2070` order check). The owner reassigned `#2073` to this session in chat (a `source claim`, recorded as the `claimed_by` comment on `#2073`). Supersedes the `22f8dfe8` stamp and the `ce1d281f` first pass above. 134 files across 33 merges since `ce1d281f` (`#1968` to `#2105`; 65 in `src/test/`; no migration; `required-status-checks.json` and `ci.yml` unchanged); 13 cited files changed (the row originally said 12; `#2146` P2-1), and every cite into them was re-read on the stamped tree. Substance: AC-5.1 now records fail-before-spend as gated by `#2070`'s call-level order scan and keyless handler tests, with `ai-cultivar-qa` still unenforced, and its §11 row says so. Counts, after the script first reproduced every `ce1d281f` figure: AC-3.2 564 files, drift rows unchanged (55/7, 44/6, 0, 2); AC-3.4 813 in 812 alias-only; AC-4.3 77/67, 70/61, 106/86 unchanged; AC-10.2 zero. Line moves are listed in the header.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 2026-10-15 | `dfb1567ee8c42b3449ea3314976c6ed1d16a382d` | Grok   | `#2146` amendment. Nine Codex P2s from the retrospective review of `#2073` (comment 6196768751). Docs only. 13 files changed since `c8523adc`; the amended clauses were re-read, and the rest are carried by file identity where the cited file is unchanged. P2-1: the second-pass cited-file count is 13. P2-2: AC-10.2 pins the not-implemented row at `:943` on `#2072` head `c7838ccb`; the merged `#2073` body is not edited. P2-3: §14 states that a build target does not establish the serving target. P2-4: AC-5.3 describes an idempotent refund attempt with confirmed and `result_pending` outcomes kept separate. P2-5: AC-4.4 limits the `pi_bridge` exception to the transport alias and names the `sensor` / `realtime` trust-label aliases. P2-6: AC-4.1 states the prototype-key and badge coverages separately. P2-7: `#1373` is described as `public.founders` client-UPDATE / RLS hardening, separate from the `#1374` / `#1398` refund migrations. P2-8: AC-6.2 calls the `founder_lifetime` page comparisons examples and notes `Settings.tsx:322-323` compares `planId` with `free`. P2-9: AC-3.4 is alias-only, 814 statements in 813 files, with the `#740` relative import disclosed (full static totals 815 / 814).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |     |

### 15.2 Evidence status at deploy tip `e0bb3930` — 2026-10-07, dated

> **Superseded by the `7e024f93` restamp (header and §15.1, 2026-10-13).** Kept as dated history.
> Every `INHERITED` verdict below was re-read or re-carried by that restamp; read the header first.

**Why this section exists.** The owner asked for this PR's evidence to be brought up to date in
place, with inherited claims labelled. A full §15 restamp would re-point every cite to a new tree.
This note re-reads what changed and labels the rest; it does not move the header stamp. A later
full restamp starts from §15.1's `2ffe78cc` row and this section.

**Labels used here.**

| Label          | Meaning                                                                                                                                                                                                                                                                                                                           |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VERIFIED`     | Re-read by this session at `e0bb39304a44dc72dfef83734e651034598b5454` on 2026-10-07 with `git show` / `git grep`. `established fact` for the tree, never for production.                                                                                                                                                          |
| `INHERITED`    | The verdict recorded at `2ffe78cc` by the 2026-10-04 restamp session (§15.1). Not re-read here, so for this session it is a `source claim` (§15 rule 3). Where the cited file is byte-identical between the two trees (`git diff --name-only 2ffe78cc e0bb3930 -- <file>` is empty), that is said, and it is the only thing said. |
| `NOT_MEASURED` | Production behaviour on every axis. A merge is not a deployment (§14); this note reads no host.                                                                                                                                                                                                                                   |

**What changed between the trees — `VERIFIED`.** `2ffe78cc..e0bb3930` is 23 first-parent commits
(first `#1897`, last `#1850`), 168 changed files, 59 under `src/test/`, no migration. Of the 231
distinct file paths this document cites, ten changed. Each was re-read:

| Cited file                                                                                          | Cite in this document                          | At `e0bb3930`                                                                                                                                                                                          |
| --------------------------------------------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `package.json`                                                                                      | `:9`, `:21-22`, `:66`                          | Hold, same text                                                                                                                                                                                        |
| `package.json`                                                                                      | `:224`, `:317`, `:318`, `:323`, `:324`, `:369` | Moved one line, same text: `:225`, `:318`, `:319`, `:324`, `:325`, `:370`. Not re-pointed in the clauses, which describe `2ffe78cc`                                                                    |
| `scripts/check-bun-lockfile-policy.mjs`                                                             | `:3-7`, `:22`                                  | Hold                                                                                                                                                                                                   |
| `scripts/check-bun-lockfile-policy.mjs`                                                             | `:68`, `:185-197`, `:387-391`                  | Moved eight lines, same text: `:76`, `:193-205`, `:395-399`. The change adds four security floors per lockfile (`#1924`)                                                                               |
| `src/test/check-bun-lockfile-policy.test.ts`                                                        | `:528`, `:530`                                 | Not one of the ten: byte-identical. Re-read anyway: `:528` is the repository-state test and `:530` pins `today: "2026-07-25"`, so the AC-8.1 enforcement gap is unchanged                              |
| `src/lib/appRouteManifest.ts`                                                                       | `:38`, `:52`                                   | Moved six lines, same text: `:44`, `:58`                                                                                                                                                               |
| `src/pages/Dashboard.tsx`                                                                           | `:952`                                         | Moved: `{snapView.sourceLabel}` is at `:950`. The AC-4.2 display gap still holds                                                                                                                       |
| `src/lib/sensorSnapshotFreshnessRules.ts`                                                           | `:26`                                          | Holds, same union                                                                                                                                                                                      |
| `docs/codebase-map.md`                                                                              | `:469-470`                                     | Hold                                                                                                                                                                                                   |
| `src/lib/quick-log/createQuickLogEvent.ts`                                                          | named, no line                                 | **Deleted** (all 145 lines) by `#1839` (`cfe09322`), which also added the "Update, #593" note beside the cite. The note is accurate at `e0bb3930`; the clause's caller list at `2ffe78cc` is unchanged |
| `package-lock.json`, `docs/agents/CURRENT_STATE.md`, `docs/specs/release-topology-specification.md` | named by path or section                       | Path still exists. `config/dependency-lockfile-transition.json` is byte-identical: `reviewBy` is still `2026-10-10`                                                                                    |

**The seven stack claims.**

| #   | Claim                                                                                                                                         | Verdict at `2ffe78cc`                                         | Status at `e0bb3930`                                                                                                                                                                                                                                                                                                                                                                                     |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | TanStack Start SSR, TanStack Router, Vite, Nitro                                                                                              | PASS                                                          | `VERIFIED`: `package.json` declares `@tanstack/react-start ^1.168.32`, `@tanstack/react-router ^1.170.18`, `vite ^8.1.5`, `nitro 3.0.260603-beta`. `src/server.ts`, `src/start.ts`, `src/router.tsx` byte-identical. Clause cites into them: `INHERITED`                                                                                                                                                 |
| 2   | React 19, Tailwind 4, shadcn/Radix, TanStack Query                                                                                            | PASS                                                          | `VERIFIED` for the declared ranges (`react ^19.2.0`, `tailwindcss ^4.2.1`, `@radix-ui/*`, `@tanstack/react-query ^5.101.1`). `bun.lock` changed (`#1924`); resolved versions not re-read: `INHERITED`. Upstream-latest `NOT_MEASURED`                                                                                                                                                                    |
| 3   | Supabase Postgres/Auth/RLS/RPC/Edge Functions                                                                                                 | PASS in the repository                                        | `INHERITED`. No migration changed. `src/integrations/supabase/client.ts` byte-identical. Production `NOT_MEASURED`                                                                                                                                                                                                                                                                                       |
| 4   | Bun canonical; npm compatibility remains                                                                                                      | PASS                                                          | `VERIFIED`: `bun.lock`, `bunfig.toml` and `package-lock.json` present; checker header and `REQUIRED_LOCKFILES` unchanged (table above). `e0bb3930` does not contain the lockfile retirement (`#1873`), so AC-8.1 stands                                                                                                                                                                                  |
| 5   | AI Doctor: Lovable gateway, server-pinned model, validated tool output, credit/idempotency, receipts, no direct Action Queue or device writes | PASS for `ai-doctor-review`; FAIL for every AI Doctor surface | `VERIFIED` for the gateway and model constants (`supabase/functions/ai-doctor-review/index.ts:66-67`). That file, `supabase/functions/ai-coach/index.ts` and `src/pages/Coach.tsx` are byte-identical, so the scope split is unchanged. Validator, credit, idempotency and receipt cites: `INHERITED`                                                                                                    |
| 6   | Canonical sources live/manual/csv/demo/stale/invalid; vendor and transport are provenance                                                     | PASS for set and storage; FAIL for display                    | `VERIFIED`: `SENSOR_SOURCES` at `src/lib/sensor/sensorSourceRules.ts:16` lists the six; the `Ecowitt` relabel at `src/lib/sensorSourceLabelRules.ts:80-81` holds. **Added:** the AI context path emits `unknown`, and passes an uncorroborated flat `live` snapshot to the model at high trust (AC-4.2, new paragraph). `#1857` does not change this verdict; see below. Storage-path cites: `INHERITED` |
| 7   | VPD EWMA exists; Modified Z-Score/MAD and Nelson Rules not implemented                                                                        | PASS                                                          | `VERIFIED`: `DEFAULT_VPD_DRIFT_ALPHA` and `evaluateVpdDriftEwma` at `src/lib/vpdDriftRules.ts:56`, `:59`; `git grep -i -E 'nelson rule\|modified.?z.?score\|median absolute deviation'` over `src`, `supabase` and `scripts` returns zero files. "No product caller": `INHERITED`                                                                                                                        |

**`#1857` — what it means here.** `#1857` rewrites the resolver in AC-4.2's new paragraph so that
uncorroborated or malformed provenance resolves to `invalid` instead of `unknown`. Neither
`2ffe78cc` nor `e0bb3930` contains it. Its branch, review verdicts, merge state and ownership are
operating state: they change without any architecture change, so they are recorded in the PR's own
comments and belong in `docs/agents/CURRENT_STATE.md` or `docs/agents/HANDOFF_LOG.md`, not here.

Consequences for this contract:

- **No clause may describe `#1857`'s behaviour as a property of a stamped tree that does not contain
  it.** The `unknown`-to-`invalid` change, the 22-key allowlist and the flat-`live` rule are absent
  from both trees named above.
- **Claim 6 keeps its `2ffe78cc` verdict**, plus the AI-path gap above. It is not upgraded on the
  strength of `#1857`'s tests or of any review verdict on it.
- **The first stamp whose tree contains a change to this resolver** amends AC-4.2's AI-path
  paragraph against that tree, or the change that lands it does. Fixing the resolver is that
  change's work, not this slice's.

> Discharged at `ce1d281f` (2026-10-14): `#1857` merged as `0c573dcd`, and AC-4.2's AI-path
> paragraph now describes the fixed resolver against that tree. This section stays as the dated
> record for `e0bb3930`.

**Not measured in this note:** the other ~200 cited files were not re-read line by line (their
verdicts are `INHERITED`); counts in AC-3.2, AC-3.4 and AC-4.3; the 35 required checks at this
PR's new head; package-internal cites (no `node_modules`); and production on every axis.

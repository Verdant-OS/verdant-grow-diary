# Architecture Audit Adjudication — 2026-08-21

**Adjudicated by:** Claude (Knowledge Library and Product Specification Architect)
**Subject:** the supplied "Verdant Architecture Audit, Repo Fact-Check, Executive Summary, and Claude/Grok Roadmap"
**Measured against:** `verdant-grow-diary` (deploy branch) at `28c01a017049a47769383e89b65c76b7c60093ce`
**Live measurements taken:** 2026-08-21, over HTTPS from a Claude Code remote session

This document is **read-only adjudication**. It changes no code, schema, policy, migration,
or governance file, and it carries no `Sentinel-Version` (it is not one of the twelve).

> ### Update — 2026-08-21, later the same day: #1051 has MERGED
>
> The blocking collision recorded in §3 is **resolved**. #1051 merged to `verdant-grow-diary`
> as `5c60bcd9`; `docs/codebase-map.md` is live at 490 lines and `Sentinel-Version` is now
> `2026-09-01.2` on the deploy branch. **ARCH-01 and ARCH-02 are no longer blocked** — see the
> revised §7 and §7.1.
>
> Two findings from this document were fixed and shipped inside that PR, with owner permission
> to push to its branch (commit `d40dc39`, verified present on the deploy branch):
>
> - the `.env.production` payments-token row, which described a **sandbox-class** token as live
>   and so inverted the billing safety contract #1078 had just established;
> - the edge-function caller row, which said "mostly in hooks" when hooks are a minority
>   (6 of 15 production files).
>
> **All measurements below stay pinned to `28c01a017` and are not restated at the new tip.**
> A measurement is a record of what was true at a named commit; re-pointing it at a newer SHA
> without re-running it would be exactly the drift this document was written to catch.
>
> ### Numeric re-verification sweep
>
> Review found three counting errors in this document across three rounds — "~1,700" `src`
> files lifted from a `tsconfig.json` comment, "2 of 34" edge functions from a substring grep
> that matched a code comment, and "nineteen" stack determinations against a §4.1 table holding
> twenty-one. Three of a kind is a pattern, so rather than patch a third digit, **every numeric
> claim in this document was re-derived from `28c01a017`.**
>
> Result: **13 of 13 re-derived claims hold.** Route modules 147 · edge functions 34 ·
> migrations 272 · `src` files 4,948 · `src` Zod importers 11 · edge Zod importers 1 ·
> top-level `src/lib/*Advisor.ts` 0 · npm consumer contracts 5 · VPD α 0.3 · VPD min readings 6
> · canonical sensor sources 6 · `.functions.invoke(` 17 expressions across 15 files · layer
> split hooks 6 / components 4 / lib 3 / pages 2.
>
> The failure was narrower than the three errors suggested, and worth naming precisely: **every
> error was in a summary or derived figure written from memory or copied from prose — none was
> in a measurement actually taken.** The discipline that failed was re-deriving totals, not
> measuring.

---

## 1. Calibrated verdict

> **The supplied audit's technical conclusions are substantially CORRECT and should be
> adopted. Its _task assignment_ must NOT be executed as written: ARCH-01 collided with an
> open, reviewed, mergeable pull request, and building it would have created the second
> implementation that `AGENTS.md` forbids.**
>
> **That pull request (#1051) has since merged as `5c60bcd9`, which settles the point rather
> than softening it:** the competing map this document declined to write now exists as
> `docs/codebase-map.md`, shipped by its actual owner. ARCH-01 is unblocked and reduces to the
> short ADR described in §7.1.

**Twenty-one** of the audit's stack determinations were re-derived independently from source
and **every one held** — one row (canonical sensor sources) came back stronger than the audit
had stated. An earlier revision said "nineteen", a summary total written early and never
recounted as §4.1 grew. Three of its evidence labels were too weak, one of its priorities is
wrong against a dated gate, and it missed four findings — one of which is a live production
provenance gap that no governance file currently records.

ARCH-00 verdict, in the audit's own vocabulary: **`BLOCKED_BY_ACTIVE_OWNER`** at the time of
writing — now **`SAFE_TO_PLAN`**, since the blocking owner's work has landed.

---

## 2. Requirements and assumptions

- Repository facts are measured at the pinned SHA above. `git fetch origin` used refspec
  `+refs/heads/*:refs/remotes/origin/*`; **167** remote branches and all tags were present
  when the absence claims in §6.1 were made.
- Production database state was **not** inspected. No credential was requested or used.
- Live HTTP measurements are point-in-time single observations, per this repo's standing
  rule that a single observation is not a trend.
- No production write, no migration apply, no Lovable publish, no device surface.

---

## 3. Collision audit (ARCH-00, discharged)

Open pull requests against `verdant-grow-diary`, classified:

| PR                                                                                                                                                                                                            | Branch                                             | Area                                            | Label                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | ----------------------------------------------- | --------------------------------------------------------------- |
| [#1051](https://github.com/Verdant-OS/verdant-grow-diary/pull/1051)                                                                                                                                           | `claude/claude-md-documentation-j9b3ac`            | **Codebase map + stale stack-fact corrections** | **`MERGED — REUSE`** (was `ACTIVE OWNER`; merged as `5c60bcd9`) |
| [#1033](https://github.com/Verdant-OS/verdant-grow-diary/pull/1033)                                                                                                                                           | `claude/governance-operating-facts`                | Repository operating facts, validation commands | `OPEN — REVIEW ONLY`                                            |
| [#1077](https://github.com/Verdant-OS/verdant-grow-diary/pull/1077)                                                                                                                                           | `claude/verdantgrowdiary-dns-issue-hag3co`         | `CURRENT_STATE` production rows                 | `OPEN — REVIEW ONLY`                                            |
| [#1080](https://github.com/Verdant-OS/verdant-grow-diary/pull/1080)                                                                                                                                           | `claude/quicklog-errors-diagnostics-c06rci`        | Signup-acquisition migration hardening          | `OPEN — REVIEW ONLY`                                            |
| [#1073](https://github.com/Verdant-OS/verdant-grow-diary/pull/1073)                                                                                                                                           | `codex/quicklog-stale-target-fail-closed-20260821` | Quick Log stale local targets                   | `OPEN — REVIEW ONLY`                                            |
| [#1083](https://github.com/Verdant-OS/verdant-grow-diary/pull/1083)                                                                                                                                           | `cursor/signup-attribution-failure-safe-f6d4`      | Signup attribution write path                   | `OPEN — REVIEW ONLY`                                            |
| [#1084](https://github.com/Verdant-OS/verdant-grow-diary/pull/1084)                                                                                                                                           | `cursor/ecowitt-v0-temp-unit-safety-5ba1`          | EcoWitt C/F fail-closed                         | `OPEN — REVIEW ONLY`                                            |
| [#1082](https://github.com/Verdant-OS/verdant-grow-diary/pull/1082)                                                                                                                                           | `cursor/ecowitt-v0-post-merge-qa-tests-41e8`       | EcoWitt QA proofs (tests only)                  | `OPEN — REVIEW ONLY`                                            |
| [#1085](https://github.com/Verdant-OS/verdant-grow-diary/pull/1085)                                                                                                                                           | `cursor/plant-pending-outcome-notice-73ec`         | PlantDetail follow-up outcomes                  | `OPEN — REVIEW ONLY`                                            |
| [#1076](https://github.com/Verdant-OS/verdant-grow-diary/pull/1076), [#1079](https://github.com/Verdant-OS/verdant-grow-diary/pull/1079), [#1081](https://github.com/Verdant-OS/verdant-grow-diary/pull/1081) | tenki / CI                                         | CI runner migration                             | `OPEN — REVIEW ONLY`                                            |
| [#1068](https://github.com/Verdant-OS/verdant-grow-diary/pull/1068)                                                                                                                                           | `cheekhimself-patch-1`                             | CodeQL workflow                                 | `OPEN — REVIEW ONLY`                                            |
| [#1028](https://github.com/Verdant-OS/verdant-grow-diary/pull/1028), [#1018](https://github.com/Verdant-OS/verdant-grow-diary/pull/1018), [#719](https://github.com/Verdant-OS/verdant-grow-diary/pull/719)   | env / e2e / plantuml                               | Older, unrelated                                | `OPEN — REVIEW ONLY`                                            |

### 3.1 The blocking collision, stated precisely

**#1051 was open, non-draft, `mergeable_state: clean`, 15 files, +823/−57, with all twelve
review threads resolved.** It adds `docs/codebase-map.md` (480 lines: route inventory,
One-Tent Loop module index, 34 edge functions, entitlements surface, 86 workflows, script
index, Supabase layout, env/secret boundary, observed drift), rewrites `CLAUDE.md`, and
corrects the stale stack facts in `AGENTS.md`, `GEMINI.md`, `SKILL.md` and `CURRENT_STATE.md`.

Its stated corrections are **the same four** the supplied audit reaches independently:
the app is TanStack Start SSR and not an SPA; `src/lib/*Advisor.ts` is an empty layer in the
architecture table; `tsconfig.app.json` no longer exists; and `vercel.json` does not govern
production.

The supplied audit _names_ "Claude/codebase architecture documentation" in its own
§4.2 immediate-collision freeze — and then assigns ARCH-01 to Claude anyway. That is the
internal contradiction this adjudication resolves.

**Consequence:** `docs/architecture/CURRENT_ARCHITECTURE.md` must **not** be created now.
`AGENTS.md` is unambiguous — _"If you discover another agent already has open, unmerged work
in your target area, stop and report the collision rather than silently building a competing
version"_ and _"Only one implementation of a given feature should ever be merged."_

---

## 4. Fact-check matrix — re-derived from source

Every row measured at `28c01a0`. `established fact` unless labelled otherwise.

### 4.1 Stack determinations — the audit's calls all held

| Audit claim                                                     | Measured evidence                                                                                                                                                                                                                                                                                    | Verdict                                 |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| TanStack Start SSR, not Next.js                                 | `@tanstack/react-start@^1.168.32`, `@tanstack/react-router@^1.170.18`, `@tanstack/router-plugin@^1.168.23`; `src/server.ts` re-exports `@tanstack/react-start/server-entry`; `src/start.ts` calls `createStart`; `src/routeTree.gen.ts`; **147** route modules in `src/routes/`; **no `index.html`** | `PASS`                                  |
| React 19                                                        | `react` / `react-dom` `^19.2.0`                                                                                                                                                                                                                                                                      | `PASS`                                  |
| Vite + Nitro                                                    | `vite@^8.1.5`; `nitro@3.0.260603-beta` (devDependency)                                                                                                                                                                                                                                               | `PASS`                                  |
| Tailwind 4                                                      | `tailwindcss@^4.2.1`, `@tailwindcss/vite@^4.2.1`                                                                                                                                                                                                                                                     | `PASS`                                  |
| shadcn/ui + Radix, `rsc: false`                                 | `components.json` → `"rsc": false`, `"style": "new-york"`; 27 `@radix-ui/*` packages                                                                                                                                                                                                                 | `PASS`                                  |
| Supabase Postgres / Auth / RLS / RPC / Edge                     | `@supabase/supabase-js@^2.105.4`, `@supabase/ssr@^0.10.3`; **34** edge functions + `_shared`; **272** migrations                                                                                                                                                                                     | `PASS`                                  |
| Bun canonical, npm compatibility retained                       | `bunfig.toml`; `config/dependency-lockfile-transition.json` → `canonicalPackageManager: "bun"`, 5 declared npm consumers                                                                                                                                                                             | `PASS`                                  |
| ESLint + Prettier, not Biome                                    | `eslint@^9.32.0`, `prettier@^3.7.3`; `@biomejs/*` and `ultracite` absent                                                                                                                                                                                                                             | `PASS`                                  |
| Husky, lint-staged, Vitest, Playwright                          | `husky@^9.1.7`, `lint-staged@^17.0.5`, `vitest@^3.2.6`, `@playwright/test@^1.48.0`                                                                                                                                                                                                                   | `PASS`                                  |
| Drizzle absent                                                  | `drizzle-orm`, `drizzle-kit` — not declared                                                                                                                                                                                                                                                          | `PASS`                                  |
| tRPC absent                                                     | no `@trpc/*`                                                                                                                                                                                                                                                                                         | `PASS`                                  |
| nuqs / Zustand absent                                           | neither declared; client state is `src/store/{auth,grows}.tsx` + route context                                                                                                                                                                                                                       | `PASS`                                  |
| Vercel AI SDK / OpenRouter absent                               | no `ai`, `@ai-sdk/*`, `openrouter`                                                                                                                                                                                                                                                                   | `PASS`                                  |
| Clerk / Better Auth absent                                      | neither declared                                                                                                                                                                                                                                                                                     | `PASS`                                  |
| pgvector absent                                                 | no `CREATE EXTENSION … vector` anywhere in `supabase/`. **Trap:** a naive grep hits `to_tsvector` in `20260722203000_strain_reference_library_v1.sql` — that is full-text search, not pgvector                                                                                                       | `PASS`                                  |
| BullMQ / Redis absent                                           | `bullmq`, `ioredis` not declared                                                                                                                                                                                                                                                                     | `PASS`                                  |
| AI Doctor = Lovable gateway, server-pinned Gemini               | `supabase/functions/ai-doctor-review/index.ts` — `GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions"`, `MODEL = "google/gemini-3-flash-preview"`, `MODEL_TIER = "standard"`, `LOVABLE_API_KEY` read server-side only                                                                 | `PASS`                                  |
| Canonical sensor sources exclude `home_assistant` / `pi_bridge` | `src/constants/sensorIngestProvenance.ts` — `CANONICAL_SENSOR_SOURCES = ["live","manual","csv","demo","stale","invalid"]`; `NON_CANONICAL_SOURCE_ALIASES` **explicitly names** `home_assistant`, `pi_bridge`, `mqtt`, `webhook`, `eco_witt`, `unknown` as forbidden                                  | `PASS` — stronger than the audit stated |
| VPD EWMA exists at α = 0.3, not 0.2                             | `src/lib/vpdDriftRules.ts` — `DEFAULT_VPD_DRIFT_ALPHA = 0.3`, `DEFAULT_VPD_DRIFT_MIN_READINGS = 6`; classifications `insufficient` / `in_band` / `sustained_high` / `sustained_low`                                                                                                                  | `PASS`                                  |
| Nelson Rules not implemented                                    | case-insensitive search for `nelson` across `src`, `supabase`, `scripts`, `docs` → **zero hits**                                                                                                                                                                                                     | `PASS`                                  |
| Modified Z-Score / MAD not implemented                          | search for `medianAbsoluteDeviation`, `modified z-score`, `modifiedZ`, `MAD_THRESHOLD` → **zero hits**                                                                                                                                                                                               | `PASS`                                  |

### 4.2 Rows the audit under- or over-stated

| Audit row                 | Audit verdict                                                          | Adjudicated verdict                                                                                                                          | Why                                                                              |
| ------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Head SHA                  | `5aff994b5d21…`                                                        | **Stale by one commit** — deploy tip is `28c01a0` (#1078, `fix(billing): keep production checkout sandbox-only`)                             | The branch advanced between audit and adjudication                               |
| `vercel.json` authority   | `PARTIAL / AMBIGUOUS`, "does not prove production is currently broken" | **Measured — `vercel.json` does not govern production**                                                                                      | §6.2                                                                             |
| Zod boundary coverage     | `PARTIAL PASS`, "universal coverage is not proven"                     | **Upheld.** 11 `src` files and **1** of 34 edge functions import Zod, but importer counts do not measure boundary coverage                   | §6.3 — the audit's hedge was right; an earlier revision of this document was not |
| pnpm                      | "Reject for V0"                                                        | **Already structurally forbidden** — `pnpm-lock.yaml` is in `FORBIDDEN_LOCKFILES` in `scripts/check-bun-lockfile-policy.mjs`, enforced in CI | Not a preference; a gate                                                         |
| TOOL-01 (Bun/npm closure) | `P2`, "only after the V0 and production truth gates are stable"        | **Dated `P1`**                                                                                                                               | §6.4 — `reviewBy` **2026-08-25**, gate first fails **2026-08-26** UTC            |
| `hono` "not present"      | listed among absent infra                                              | **Precisely:** not a direct dependency, but pinned as a transitive security override (`hono: 4.12.34`, `@hono/node-server: 2.0.10`)          | h3/Nitro pulls it; the override is a supply-chain floor, not an adoption         |

### 4.3 A refinement, not a correction, to #1051

#1051 states `src/lib/*Advisor.ts` has **zero** files. Measured: **zero** matching the literal
`AGENTS.md` glob `src/lib/*Advisor.ts` (top level), and **one** nested at
`src/lib/genetics/breedingActionAdvisor.ts`. Read against the glob `AGENTS.md` actually
writes, #1051 is correct. Recorded so a later reader with a recursive `find` does not
mistake the nested file for a contradiction.

---

## 5. What the audit got right that deserves protecting

These are the audit's strongest calls and they should survive into whatever contract lands:

- **Do not replatform.** Next.js, Drizzle, tRPC, Clerk/Better Auth, pnpm, Biome, OpenRouter
  and BullMQ are each a migration with no measured V0 defect behind it.
- **The AI Doctor's safety architecture is stronger than the generic report's sample** —
  server-side context validation before spend, idempotency key, server-pinned model and tool
  schema, prompt HMAC receipt, validated tool arguments, atomic finalization, refunds on
  failure, no raw model text returned, no Action Queue write, no device path.
- **Trust-state and provenance are correctly separated.** `source` answers "how should
  Verdant treat this reading"; vendor/transport/bridge answer "how did it arrive". Collapsing
  them — as the original report's enum did — would let a vendor name imply health.
- **Do not silently move α from 0.3 to 0.2**, and do not implement Nelson Rules wholesale.
  Environmental telemetry violates textbook SPC assumptions (day/night cycles, uneven
  intervals, stage transitions, maintenance windows, sensor replacement).
- **Approval-required stays.** Simulation and guardrailed automation are research phases, not
  a roadmap commitment.

---

## 6. Findings the audit missed

### 6.1 The build workspace that stamped production did not match its commit's tree

`established fact`, measured 2026-08-21 from `https://verdantgrowdiary.com/version.json`
(HTTP 200):

```json
{
  "commit": "4b1c4867e685d23d5e526304f6c8da4e35dc2601",
  "shortCommit": "4b1c4867e685",
  "commitSource": "git",
  "ref": "__orphan__",
  "dirty": true,
  "commitTime": "2026-08-21T09:44:40Z",
  "buildTime": "2026-08-21T09:45:51.466Z",
  "treeHash": "8773f6b2c0edb2618a7b1b6fc4f0d4bb01b984cbc9e3ed33be896a1e40152d41"
}
```

> ## ⚠️ Two claims withdrawn — read this before citing §6.1
>
> Earlier revisions of this section were headed _"Production is serving a commit this repository
> does not contain — and it is stamped dirty."_ **Both halves were wrong**, and review caught
> both. What survives is narrower, better evidenced, and stated below.
>
> **Withdrawn 1 — "the repository does not contain it."** The commit **exists**. Queried against
> the authoritative GitHub commit endpoint:
>
> ```
> 4b1c4867e685d23d5e526304f6c8da4e35dc2601   "Completed Verdant audit"
>   X-Lovable-Edit-ID: edt-5ea33791-7aa3-4810-b657-d5e4bb7dd505
>   author/committer: lovable-dev[bot] (gpt-engineer-app[bot])   2026-08-21T09:44:40Z
>   merge commit, parents: 28c01a017 (the pinned deploy tip) + a684da59b
> ```
>
> `git cat-file` failed only because the commit is not reachable from any fetched head or tag —
> it tests the **local object database**, never the server. `git fetch origin <sha>` retrieves it
> fine. The `uncertainty` this section raised in its first draft — that a Lovable-side build
> could stamp a commit from its own workspace — was the correct explanation all along, and two
> later revisions argued against it on the strength of a local lookup that could not settle it.
>
> **Withdrawn 2 — `dirty: true` implies drifted build content.** `stamp-version.mjs` derives
> `dirty` from repository-wide `git status --porcelain`, while `tree-hash.mjs:24` states that
> "changes outside the hashed roots (`docs/`, `e2e/`, `.github/`, etc.) do not" move the hash.
> **This document's own canary proved the point against itself**: a docs-only modification left
> the hash identical. A dirty flag therefore says nothing about build-defining content unless the
> changed paths intersect the hashed roots.

#### What is actually measured

`established fact`, by fetching the commit and recomputing its tree with the same module the
stamper uses:

|                                              | Tree hash                                                          |
| -------------------------------------------- | ------------------------------------------------------------------ |
| Commit `4b1c4867e685` (fetched, 5,840 files) | `1f0eb7b4e6cd2ef0d375ee039c86704a39372feeb2c0b8bbb78fcfa76cb55674` |
| **Stamped by the live build**                | `8773f6b2c0edb2618a7b1b6fc4f0d4bb01b984cbc9e3ed33be896a1e40152d41` |
| Match                                        | **no**                                                             |

> **Re-verified 2026-08-21 after merging base `5a13d0b4` (#1089), and both halves of that check
> matter.**
>
> _The measurement reproduces._ Re-extracting `4b1c4867e685` and re-running
> `computeTreeHash()` from `scripts/lib/tree-hash.mjs` returns
> `1f0eb7b4e6cd2ef0d375ee039c86704a39372feeb2c0b8bbb78fcfa76cb55674` with `fileCount: 5840` —
> the exact values tabled above. The 5,840 is the count **inside `TREE_HASH_ROOTS`**; the full
> tree at that commit holds 6,586 files.
>
> _The method is the correct one, stated explicitly because the base branch now documents the
> trap._ `CURRENT_STATE.md` warns that `treeHash` is Verdant's SHA-256 over the allowlisted
> roots manifest, **not** a Git tree object ID, and that a mismatch must never be "confirmed" by
> diffing it against `git rev-parse <commit>^{tree}` — those never match, healthy builds
> included, and #1077 removed exactly that false corroboration elsewhere. This section did not
> use that comparison: it ran the stamper's own module over the commit's extracted tree, which
> is the only comparison that means anything. Do not re-derive this with `git rev-parse`.
>
> _The specific reading is superseded; the finding is not._ Production republished several times
> on 2026-08-21 and now serves `39935889fe02` (#1080), so the `4b1c4867e685` / `8773f6b2c0ed`
> pair above is a snapshot of one publish, not current state — treat it as perishable, exactly
> as `CURRENT_STATE.md` instructs for every live row. But that later, independent measurement
> records `dirty: true`, `ref: "__orphan__"`, provenance explicitly **not** `PASS`, and cause
> `NOT_MEASURED`. So the provenance gap is **not** a one-off artifact of the publish this
> section happened to catch: a second observer found the same class of gap on a different commit
> hours later. That corroborates the finding while leaving its bound untouched — whether any
> shipped byte differs is still `NOT_MEASURED`.

**Production stamped commit `4b1c4867e685` from a build workspace whose hashed roots did not
match that commit's tree.** State it that way and no more strongly — corrected after review.

`TREE_HASH_ROOTS` covers `src`, `public`, `supabase`, `scripts`, `config`, the committed `.env`
files, and the build config; `tree-hash.mjs:27` says the hash moves for "test files under
`src/test` and `scripts/`" too. **Many of those inputs never reach the deployed bundle.** A
change confined to a test file, a `scripts/` helper, or a `supabase/` migration would produce
exactly this mismatch while the published runtime output stayed byte-identical. So the
measurement establishes **workspace drift at stamp time**, not that the artifact users receive
differs from the commit. Whether any shipped byte differs is **`NOT_MEASURED`**.

That is the whole finding, and it is narrow. Per the resolver's own text the explanations are an
editor-modified snapshot at build time, or a publish pipeline that mutates hashed files such as
`bun.lock` before prebuild. Distinguishing them needs the publisher's build log, which is
owner-gated; **nothing here shows wrong content shipped, only that the stamp cannot be tied back
to a committed tree.**

It also explains the scans below: the commit is a Lovable merge that is **not on the deploy
branch**, so recomputing over `origin/verdant-grow-diary` could never have found it, at any scan
depth.

This supersedes the `CURRENT_STATE` Production-commit row (`f09febc354a4`, `dirty: false`,
2026-08-20).

#### The tree hash was resolved locally — this is measured, not `BLOCKED`

**Corrected after review.** An earlier revision said resolving this "needs
`scripts/resolve-release-provenance.mjs` run … by someone with the publisher's view", and marked
the whole step owner-gated. That was wrong on its own terms: the resolver's header states
_"Read-only; no network. Run it from a checkout with real history."_ It is a repository-side
measurement, and this document had one available and did not take it. Labelling as `BLOCKED`
something that could be measured is the precise failure this repo's status vocabulary exists to
prevent.

Run at `28c01a017` against the production `treeHash`
`8773f6b2c0edb2618a7b1b6fc4f0d4bb01b984cbc9e3ed33be896a1e40152d41`:

| Path                                                                  | Result         |
| --------------------------------------------------------------------- | -------------- |
| Release-tag annotations — **244** of 700 `v*` tags carry `Tree-Hash:` | **no match**   |
| Recomputation with `--scan=60` over `origin/verdant-grow-diary`       | **`NO_MATCH`** |

**How far that search reaches — and a shallow-clone trap that produced a false claim.** A
reviewer objected that `--scan=60` samples a fraction of the ancestry. An earlier revision of
this paragraph _rejected_ that objection, citing `git rev-list --count origin/verdant-grow-diary`
= **58** and concluding the scan was exhaustive. **That rejection was wrong, and the reviewer was
right both times.**

`established fact`: this agent session's checkout was a **shallow clone**
(`git rev-parse --is-shallow-repository` → `true`, with a `.git/shallow` boundary file). In a
shallow clone `git rev-list --count` reports only the commits the clone actually holds. After
`git fetch --unshallow`, the same command returns **16,604** — exactly the figure the reviewer
gave. The "58" was an artifact of the clone, not a property of the branch.

> **Durable warning, in the same family as this repo's session-specific `BLOCKED` rule:
> `git rev-list --count`, `git cat-file`, and `git log` all silently narrow to what a shallow
> clone holds.** Agent sessions are commonly provisioned shallow. Check
> `git rev-parse --is-shallow-repository` **before** citing any count, absence, or
> "exhaustive" claim derived from local history.

So the search bound, stated correctly. Re-run on the **unshallowed** clone with `--scan=400`:
also **`NO_MATCH`**. Final bound:

| Dimension             | Covered                                                            | Not covered                    |
| --------------------- | ------------------------------------------------------------------ | ------------------------------ |
| Deploy-branch commits | **400** recomputed, spanning **2026-08-04 → 2026-08-21 (17 days)** | 16,204 older commits           |
| Release tags          | 244 annotated with `Tree-Hash:`                                    | **456** carrying no annotation |
| Other refs            | none                                                               | 169 other remote branches      |

**400 of 16,604 is 2.4% — still a sample, so the universal claim stays `NOT_MEASURED`.** But
the bound is now interpretable rather than a bare count, and it bears on one of the two
surviving explanations: the resolver's "the build may predate the scan window" is **weak for
this build**, whose own stamp reports `commitTime` `2026-08-21T09:44:40Z` — inside the scanned
17 days by a wide margin. That timestamp is **independently confirmed** — the GitHub commit
endpoint reports the same `2026-08-21T09:44:40Z` for `4b1c4867e685` (see §6.1). What the scans
could never have found is now known: the commit is a Lovable merge **off** the deploy branch, so
recomputing over `origin/verdant-grow-diary` was searching the wrong ref, at any depth.

The canary validates the _algorithm_; it never validated the _coverage_, which is precisely what
the reviewer said twice.

**A canary rules out the tooling.** The resolver's own output warns that a `NO_MATCH` could mean
the hash roots are broken rather than the build being unmatched, and prescribes resolving a
known-good stamp. Done: the working tree at `28c01a017` **plus one docs-only file** hashes to
`0eeb9daa96ab…` and resolves **`MATCH via release-tag annotation → 28c01a017049…`**. That
confirms two things at once — the hashed roots genuinely exclude docs, and the stamper's
recorded hash reproduces under local recomputation. The resolver works.

So the `NO_MATCH` is a **measured negative, not a tooling artifact** — stated to exactly its own
reach:

> Production's tree hash matched **none of the 400 commits recomputed** (of 16,604, covering the
> last 17 days of the deploy branch) and **no annotated release tag** (244 of 700). Whether some
> commit reproduces it is **`NOT_MEASURED`** — a 2.4% sample is not a proof of absence.

Two earlier revisions got this wrong in opposite directions, and the sequence is the lesson.
The first called it `BLOCKED` when a local resolver could measure it. The correction overshot to
`FAIL`, asserting production corresponded to _no committed state_ on a bounded search. The
defence of that overshoot then rested on a shallow-clone count. Under-claiming, over-claiming,
and defending an over-claim with an unchecked measurement are one failure: **a label that does
not match its evidence.** Three rounds of review were needed to land on the bound the evidence
actually supports.

Per the resolver's own text the surviving explanations are a build predating the search, or
content that never matched any commit — "editor-modified snapshot, or a publish pipeline that
mutates hashed files such as `bun.lock` before prebuild". **This document takes no position
between them.** Two earlier attempts to adjudicate that with the `dirty` flag are withdrawn
(§6.1): the flag is repository-wide and the hash is not, so it cannot favour either.

**An older commit reproducing the live hash also remains open.** The endpoint-confirmed
`commitTime` dates the stamped **`HEAD`**, not the workspace content that produced the
`treeHash`. A recent `HEAD` whose hashed files were reverted to, or copied from, an older state
yields precisely this mismatch. With 16,204 deploy-branch commits and 169 other refs unscanned,
that possibility is **`NOT_MEASURED`** — retrieving the SHA did not close it.

What the retrieval _does_ explain is why the scans found nothing: the commit is a Lovable merge
**not on the deploy branch**, so no scan depth over `origin/verdant-grow-diary` would have
reached it.

**What is owner-gated is now a single, specific question:** why the build workspace's hashed
roots differed from the tree of the commit it stamped. That rests on the direct hash comparison above, not on the two
withdrawn claims. It is a real release-provenance gap — a stamp that cannot be tied back to a
committed tree defeats the purpose of stamping — and it is the kind of thing OPS-01 and OPS-02
exist to define and detect. **It is not evidence that production is serving wrong or unreviewed
code, and this document does not claim that.**

### 6.2 The `vercel.json` question is now measured, not ambiguous

`established fact`, live probes 2026-08-21, **redirect following explicitly disabled** and the
exact command recorded so the result is reproducible rather than asserted:

```bash
curl -sS -o /dev/null --max-redirs 0 --max-time 25 \
  -w "%{http_code}|%{redirect_url}|%{num_redirects}" "https://verdantgrowdiary.com<path>"
```

All **eight** redirect entries `vercel.json` declares — the earlier revision probed only four:

| Path                | `vercel.json` declares   | Measured                                    |
| ------------------- | ------------------------ | ------------------------------------------- |
| `/features`         | 301 → `/welcome`         | **HTTP 200**, `Location` empty, 0 redirects |
| `/demo`             | 301 → `/welcome`         | **HTTP 200**, `Location` empty, 0 redirects |
| `/strains`          | 301 → `/cultivars`       | **HTTP 200**, `Location` empty, 0 redirects |
| `/strains/:slug`    | 301 → `/cultivars/:slug` | **HTTP 200**, `Location` empty, 0 redirects |
| `/refunds`          | 301 → `/refund`          | **HTTP 200**, `Location` empty, 0 redirects |
| `/refund-policy`    | 301 → `/refund`          | **HTTP 200**, `Location` empty, 0 redirects |
| `/terms-of-service` | 301 → `/terms`           | **HTTP 200**, `Location` empty, 0 redirects |
| `/privacy-policy`   | 301 → `/privacy`         | **HTTP 200**, `Location` empty, 0 redirects |

**Positive control — added after review, and it is the part that makes the negative
trustworthy.** A reviewer noted that a client silently following redirects would report the
destination's 200 with no `Location`, making an inert config indistinguishable from a working
one. Two controls rule that out:

| Control                             | Result                                                  | What it shows                                                                                                    |
| ----------------------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `https://www.verdantgrowdiary.com/` | **HTTP 302**, `Location: https://verdantgrowdiary.com/` | The probe **does** observe a redirect when one exists — the apex redirect is not a `vercel.json` entry and fires |
| `/__nonexistent__`                  | HTTP 200, no `Location`                                 | An undeclared path is indistinguishable from the eight declared ones, as expected if the config is inert         |

`num_redirects=0` on every row confirms nothing was followed. Not one declared redirect fired.
This independently reproduces #1051's finding.

Note the corroborating repository evidence: `src/routes/` contains real route modules named
`features.tsx`, `demo.tsx`, `strains.index.tsx`, `strains.$slug.tsx`, `refunds.tsx`,
`refund-policy.tsx`, `privacy-policy.tsx` and `terms-of-service.tsx`, so every declared
destination is a real route rather than a dead path.

**The `rewrites` entry needed its own measurement, and now has one.** Raised in review, and
correct on both counts: a host-side catch-all rewrite to `/` would _also_ return HTTP 200 with no
`Location` and `num_redirects=0`, so the redirect probe cannot see it — and the presence of route
modules proves nothing either, because a host rewrite happens before any route is reached.
Response **content** settles what status codes cannot:

| Path                | Bytes  | `<title>`                                                   |
| ------------------- | ------ | ----------------------------------------------------------- |
| `/`                 | 51,657 | `Grow Diary & Grow Room Tracking App \| Verdant Grow Diary` |
| `/pricing`          | 85,056 | `Pricing — Free, Pro & Craft \| Verdant Grow Diary`         |
| `/features`         | 7,676  | `Verdant Grow Diary`                                        |
| `/terms-of-service` | 7,732  | `Verdant Grow Diary`                                        |

`/pricing` serves a different document from `/` — different length, different title, different
`<h1>`. **Were the catch-all `/((?!assets/).*)` → `/` being applied, every row here would be
`/`'s document.** None is. So `rewrites` is inert too, measured rather than inferred.

That leaves: `redirects` **measured** inert, `rewrites` **measured** inert, `headers`
**measured** not-applied-as-declared (below). `projectSettings` stays `inference` — nothing
probed from outside the host can observe it.

**One claim of mine did not survive this probe, and it is recorded rather than quietly
dropped.** An earlier revision said the application "compensates _in-app_ for redirects the host
never performs." For `/pricing` that holds. For `/features` and `/terms-of-service` it does not:
each returns ~7.7 KB carrying the generic site title, **zero `<h1>`**, `robots: index, follow`,
and provider chrome but no page content. Whether client-side rendering fills them after
hydration is **`NOT_MEASURED`** — these probes execute no JavaScript. Recorded as a bounded
observation, not a verdict, and deliberately not folded into the roadmap.

#### Security headers — measured, and the earlier claim was wrong in both directions

An earlier revision asserted the `headers` block is "**not** delivering those headers" while
§8 simultaneously recorded that as `NOT_MEASURED`. The document contradicted itself, and the
probe behind it had captured only status codes — never headers. Measured now, on `/`,
`/welcome` and `/pricing` (identical on all three):

| Header                      | `vercel.json` declares                                 | Production delivers                                                  |
| --------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------- |
| `x-content-type-options`    | `nosniff`                                              | `nosniff` — **matches**                                              |
| `referrer-policy`           | `strict-origin-when-cross-origin`                      | `strict-origin-when-cross-origin` — **matches**                      |
| `strict-transport-security` | `max-age=63072000; includeSubDomains; preload`         | `max-age=31536000; includeSubDomains` — **present, different value** |
| `x-frame-options`           | `SAMEORIGIN`                                           | **absent**                                                           |
| `permissions-policy`        | `geolocation=(), camera=(), microphone=(), payment=()` | **absent**                                                           |

So the blanket claim was wrong — three of five arrive.

**What this measures is delivery, not origin.** Two findings are solid and bounded: the delivered
HSTS `max-age` is half the declared value and omits `preload`, and two declared headers do not
arrive at all. A `vercel.json` applied as written would produce the declared string and deliver
all five, so **that file is not being applied as declared** — which corroborates the inert-config
conclusion the redirect probe establishes independently.

**Where the three delivered headers actually come from is `NOT_MEASURED`, and this document does
not claim otherwise.** An earlier revision inferred a Cloudflare/Lovable origin from `server:
cloudflare` on every response. That inference does not hold: the `server` header identifies the
proxy that answered, not the hop at which any given header was introduced. A fronted origin can
emit a header that the proxy passes through untouched, and a proxy can override one field while
leaving others alone — which is consistent with exactly what was observed. The two exact matches
are also common defaults, so matching proves nothing about their source either. Settling origin
needs the edge and origin configuration, which is owner-gated; it is OPS-02's first question, not
a conclusion available from response headers alone.

**Two declared headers are absent, and nothing substitutes for one of them.** `established
fact`: no `content-security-policy` header is present either, so there is no `frame-ancestors`
directive standing in for the missing `x-frame-options`. Whether those absences are intentional
is `NOT_MEASURED` — this document records the measurement, not a verdict on the posture, and
makes no vulnerability claim.

`practical observation` worth handing to whoever takes the §6.1 provenance question: responses
carry an `x-deployment-id` (`ecbb2146eba6…` at this measurement). That is a publisher-side
identifier and may be the fastest route from a live response back to the build log that §6.1
needs.

### 6.3 Zod's reach is narrow — but that is a prompt to inventory, not a measured gap

`established fact`, re-measured by import statement after a second review round: **11** files
under `src/` and **1** of 34 edge functions import Zod — only `supabase/functions/mcp/index.ts`
(`import { z } from "npm:zod@^3.24.2"`). Zod is already installed (`^3.24.2` — **Zod 3**, not
Zod 4; a v4 upgrade is its own migration and is not implied here).

An earlier revision said **2**, from `grep -rl "zod"` — a substring match that caught
`supabase/functions/save-founder-prefs/index.ts:6`, which is a **comment** reading "Server
re-validates via zod-equivalent parse". That function validates its input with a hand-written
`validatePrefs`. Recorded rather than quietly corrected, because it is the third instance of
one error class in this session — path mentions counted as imports, a `tsconfig.json` comment
reused as a file count, and now a code comment counted as a dependency — twice by this
document after it had criticised the same mistake elsewhere.

**And `save-founder-prefs` is the argument, not merely the erratum.** It is a validated
boundary that imports no schema library at all. A count of Zod importers would score it as
unvalidated; it is not. That single case is why the framing below rejects importer counts as
a coverage measure, rather than just correcting the numerator.

**Corrected after review, and the correction matters more than the finding.** An earlier
revision of this section called that a "genuine architectural gap and the single
best-evidenced item on the whole roadmap", and §7 raised BOUNDARY-01 to P0-adjacent on the
strength of it. Both overstated what the number can support, and did so in contradiction of
this document's own §11, which already warned that counting importers is a proxy for boundary
coverage rather than a measure of it. Stating a caveat in one section and ignoring it in
another is not a hedge; it is an error.

Two reasons the count cannot carry that weight:

- **Most `src` files are not ingress boundaries.** A denominator over the whole tree measures
  nothing. (The earlier revision also gave that denominator as "~1,700", lifted from a prose
  comment in `tsconfig.json` rather than counted. Measured at `28c01a017`, `src/` holds
  **4,948** files — 4,932 `.ts`/`.tsx`, of which 2,063 are non-test. The ratio is dropped
  rather than corrected, because the framing was wrong, not the arithmetic.)
- **A boundary validated by a hand-written parser is validated.** Not importing Zod is not
  evidence of an unvalidated input.

What the number honestly supports: **no claim about coverage in either direction.** It is a
reason to run BOUNDARY-01's inventory — enumerate the actual ingress points (manual entry,
CSV/XLSX import, EcoWitt/MQTT/webhook/bridge payloads, AI request and tool-call response,
billing webhooks, action transitions, local persistence, URL state) and record each one's
current validator. **That inventory is the measurement.** Until it exists, whether Verdant
has a boundary-validation gap is `NOT_MEASURED`.

### 6.4 The Bun/npm transition has a fail-closed deadline days away

`established fact`: `config/dependency-lockfile-transition.json` carries
`"reviewBy": "2026-08-25"`, and `scripts/check-bun-lockfile-policy.mjs` states it _"fails
closed on … an overdue transition review."_ Current run:

```
check-bun-lockfile-policy: OK (bun.lock canonical; package-lock.json synchronized
for 5 npm consumers; owner=Verdant dependency security; reviewBy=2026-08-25)
```

The five declared npm consumers are `vercel.json`, `.github/workflows/seo-monitoring.yml`,
`README.md`, `.claude/skills/run-verdant-grow-diary/SKILL.md`, and
`docs/preview-deployment-verification.md`.

**Two dates, not one — corrected after review.** `check-bun-lockfile-policy.mjs:371` compares
`if (currentDate > transition.reviewBy)`, strictly greater. So the review deadline is
**2026-08-25**, the check still **passes on** that date, and it **first fails on 2026-08-26**
UTC. An earlier revision of this section collapsed the two into "the gate fires 2026-08-25",
which is wrong by a day on the number the reprioritisation rests on.

Two consequences the audit missed. First, TOOL-01 is not a post-V0 P2 — the gate goes
fail-closed regardless of V0 stabilisation, and the only two outcomes are retiring the
compatibility lock or extending `reviewBy` with a recorded reason.

Second — **corrected after review, and the correction reverses what this section concluded.** An
earlier revision said §6.2 "removes one of the five consumers' justification", reasoning that if
Vercel does not govern production then `vercel.json`'s npm `installCommand` / `buildCommand` are
vestigial. That does not follow, because **production and preview are different deployments.**
`docs/preview-deployment-verification.md` documents a preview-only Vercel project,
`verdant-command-center-preview`, and its §1 pins that project's Install and Build commands to
**npm**, not Bun. If that project is live, dropping `package-lock.json` breaks preview installs.
§6.2 therefore removes **nothing** here until the preview project's status is established.

> Those two commands are described rather than quoted, which is not fussiness — it is a measured
> property of the gate, learned by tripping it. `check-bun-lockfile-policy.mjs` scans **every
> file the repository enumerates, documentation included**, against `NPM_INSTALL_PATTERN`
> (line 60), which matches the two npm subcommands that install dependencies. An earlier
> revision of this very paragraph quoted the install command verbatim; the gate then reported
> this documentation file as an undeclared consumer and failed the PR — turning `check:lockfile`
> **and** shard 21/32 red together, one cause and two red checks, because
> `src/test/check-bun-lockfile-policy.test.ts` asserts the same function returns `ok: true`.
>
> Recorded because it is a real and non-obvious constraint on anyone writing about TOOL-01, and
> because the tempting fix is the wrong one: **never add a prose file to `consumerContracts`.**
> That array enumerates genuine consumers and is the source of the "5 npm consumers" figure this
> section rests on; padding it to silence a scan would corrupt the very count being reasoned
> about. Describe the commands, or name them by their Vercel setting keys.

Note also what that checklist describes: a **client-only Vite build**, output directory `dist`,
SPA rewrite to `/index.html`. That is the pre-SSR architecture — this repo is TanStack Start SSR
with no `index.html` at all (§4). So the checklist may itself be stale. That is a reason to
**verify** the preview project's real state, not a licence to assume it is already retired.
Either answer is progress on TOOL-01 before the deadline; assuming one is not.

### 6.5 A stale comment in `vite.config.ts` overstates an SEO regression

`vite.config.ts` carries a migration NOTE saying the legacy `staticSocialRouteDocuments`
plugin was removed with the SPA shell, that TanStack Start's pre-renderer is unusable on this
template, and that _"Restoring the SEO artifact pipeline is a separate, owner-approved slice."_

Measured: the pipeline **was** restored, by script rather than by Vite plugin.
`package.json` runs `"postbuild": "node scripts/run-postbuild-seo.mjs dist"`;
`run-postbuild-seo.mjs:84` invokes `scripts/generate-seo-artifacts.ts`, which imports
`STATIC_PUBLIC_OUTPUT_DOCUMENTS` from `src/lib/build/staticPublicSeoDocuments.ts` and
regenerates artifacts before validating.

The comment is stale, not wrong-in-kind. Recorded so no one reads it as an open regression
and re-does finished work. Correcting the comment is a one-line change in a file **not**
owned by this slice; it belongs to whoever next touches `vite.config.ts`.

---

## 7. Re-sequenced roadmap

The audit's sequence is sound in shape — architecture truth → production truth → data safety
→ boundary safety → type safety → AI evaluation → telemetry → tooling. Four changes:

| Step                | Audit                       | Adjudicated                                                                                            | Reason                          |
| ------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------- |
| **ARCH-00**         | Grok, P0                    | **DONE** — §3 above                                                                                    | Discharged in this document     |
| **ARCH-01**         | Claude, P0                  | **UNBLOCKED** — #1051 merged as `5c60bcd9`. Reduces to the ADR in §7.1, appended to the merged map     | §3.1                            |
| **ARCH-02**         | Grok, executable manifest   | **Actionable now** — build the manifest to pin the merged _`docs/codebase-map.md`_, not a new document | Avoids a third architecture doc |
| **OPS-01 / OPS-02** | P0, after CURRENT_STATE PRs | **Raise — a live provenance gap exists now**                                                           | §6.1                            |
| **BOUNDARY-01**     | P1                          | **Stays P1** — its first task is the ingress inventory, which is what would make any gap measurable    | §6.3 (corrected after review)   |
| **TOOL-01**         | P2, post-V0                 | **P1** — review due 2026-08-25; gate first fails 2026-08-26 UTC                                        | §6.4                            |
| Everything else     | —                           | **Unchanged**                                                                                          | The audit's ordering holds      |

### 7.1 What ARCH-01 should become now that #1051 has landed

Not a new document. `docs/codebase-map.md` now carries the inventory. The residual gap
is the **decision record** — the _rejected and deferred_ alternatives, which no existing
document holds:

```text
TanStack Start remains the application framework.      (rejected: Next.js / RSC migration)
Supabase remains the data and auth platform.           (rejected: Drizzle, tRPC, Clerk, Better Auth)
SQL migrations remain database truth.                  (immutability rules already binding)
Bun remains canonical.                                 (pnpm structurally forbidden)
ESLint/Prettier remain current.                        (Biome: benchmark only, TOOL-02)
Canonical sensor source values stay closed at six.     (vendor/transport → provenance metadata)
AI Doctor stays server-controlled and approval-safe.   (no SDK abstraction without a measured need)
Device control remains rejected for V0.
Deferred pending a measured need: pgvector, background queues, new state library, OpenAPI.
```

That is a short ADR appended to the merged map — not a 3,000-word parallel contract. Three
architecture documents already existed (`docs/architecture.md`, `docs/grow-diary-architecture.md`,
`docs/grow-os-architecture.md`); with #1051 merged, `docs/codebase-map.md` is the fourth. A fifth
needs a much better reason than "the roadmap said so".

**Precedent worth reusing, with the rule applied where it belongs.** `docs/grow-diary-architecture.md`
is pinned by `src/test/grow-diary-architecture-doc.test.ts`, which reads the document with
`readFileSync`. That is correct and ARCH-02 should copy it: a Markdown document has no resolved
object to import, and `AGENTS.md` says so directly — source-text scanning "remains correct for
what it is actually good at ... The rule is about verifying _effective configuration_, not about
banning `readFileSync`."

An earlier revision of this section told ARCH-02 to `await import()` the document, which is not
possible and would have forced an artificial duplicate module. The split ARCH-02 actually needs:

| What is pinned                                                          | How                                                                                       |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `docs/codebase-map.md` — prose, tables, inventories                     | **Source scan** (`readFileSync`), exactly as the precedent does                           |
| `config/architecture-contract.json` and the dependency facts it asserts | **Resolved values** — `await import()` the config and the manifest, assert on the objects |

The resolved-value rule bites on the second row only, and that is where it matters: a contract
claiming "Bun is canonical" or "device control is false" must read the live value, since a
commented-out or relocated setting is indistinguishable from a live one to a text match.

---

## 8. Known unknowns, and what stays blocked

| Question                                                                           | Status                                                                                                                                                                                                                                                                 |
| ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Applied-migration ledger vs. the 272 committed files                               | `NOT_MEASURED` — drift probe still blocked on both an owner secret and defect 3 (name-bound matching)                                                                                                                                                                  |
| Does production deliver the security headers `vercel.json` declares?               | **Measured (§6.2).** 3 of 5 arrive; `x-frame-options` and `permissions-policy` absent, no CSP substitutes; HSTS present with a different value — so that file is **not being applied as declared**. Where the three delivered headers _do_ originate is `NOT_MEASURED` |
| Does the served SHA exist in the repository?                                       | **`PASS` — it does.** Confirmed via the GitHub commit endpoint; a Lovable merge commit off the deploy tip, unreachable from fetched refs (§6.1)                                                                                                                        |
| Does the tree hash production **stamped** match the tree of the commit it stamped? | **`FAIL` — measured.** Recomputed `1f0eb7b4e6cd` vs stamped `8773f6b2c0ed` (§6.1)                                                                                                                                                                                      |
| Why did the build **workspace's** hashed roots differ from that commit's tree?     | `BLOCKED` — needs the publisher's build log; owner-only. Note the question: §6.1 establishes workspace drift only. Whether any **shipped byte** differs is `NOT_MEASURED`                                                                                              |
| What _is_ production commit `4b1c4867e685`?                                        | **`PASS` — resolved.** "Completed Verdant audit", `lovable-dev[bot]`, merge of `28c01a017` + `a684da59b`, `2026-08-21T09:44:40Z`, via the GitHub commit endpoint (§6.1). Do not re-run this lookup                                                                     |
| Is the preview Vercel project `verdant-command-center-preview` live?               | `NOT_MEASURED` — **the** precondition for TOOL-01, not a side quest. §6.2 removes no npm consumer's justification: production ≠ preview. Its checklist also describes the pre-SSR client-only build, so the checklist may be stale too — verify, do not assume retired |
| Runtime AI Doctor behaviour under the twenty adversarial cases                     | `NOT_MEASURED` — AI-02 not run                                                                                                                                                                                                                                         |
| False-positive rate for any SPC rule                                               | `NOT_MEASURED` — no synthetic dataset exists yet (SENSOR-02)                                                                                                                                                                                                           |
| GA4 / GSC authenticated baselines                                                  | `BLOCKED` — unchanged, blockers 2 and 3                                                                                                                                                                                                                                |
| Indexation                                                                         | `NOT_MEASURED` — unchanged                                                                                                                                                                                                                                             |

---

## 9. Safety verdict

**`PASS`.** No code, schema, RLS policy, migration, edge function, governance file or
production surface was changed. Live measurements were `GET` requests to public endpoints.
No credential was requested, used, or recorded. No secret, token, connection string or user
row appears in this document. The Action Queue, AI Doctor, entitlement and device-control
boundaries are untouched, and no `BLOCKED` or `NOT_MEASURED` label was upgraded to a pass.

---

## 10. Deferred and rejected in this slice

- **Rejected:** creating `docs/architecture/CURRENT_ARCHITECTURE.md` — §3.1.
- **Deferred:** OPS-01 release topology specification. It depends on the answer to §6.1,
  which is owner-gated. Writing the spec first would encode a guess about the publisher.
- **Deferred:** correcting the stale `vite.config.ts` NOTE (§6.5) — not this slice's file.
- **Deferred:** `docs/audits/` naming/index conventions — the directory holds two files and
  has no index; not worth a convention slice.

---

## 11. Handoff

Per `docs/agents/HANDOFF_PROTOCOL.md`, in that document's mandatory structure:

```text
HANDOFF
from_agent: Claude
to_agent: Cheek
sentinel_version: 2026-09-01.2
date: 2026-08-21

slice_owner: Claude
independent_reviewer: Codex — performed, not merely nominated. Codex reviewed successive
  heads of PR #1087 and its findings drove four outright withdrawals, one reversed
  conclusion, one partly-refuted claim, and one CI failure this document itself caused.
  Every review thread is replied to and resolved. Grok is NOT the reviewer of record; an
  earlier revision of this section recommended Grok, which contradicted the PR.

completed:
  - 21 stack determinations re-derived from source at 28c01a017; 21 held
  - ARCH-00 collision inventory discharged (§3)
  - vercel.json measured: redirects, rewrites and headers all measured, not inferred (§6.2)
  - release-provenance gap bounded to build-workspace drift at stamp time (§6.1)
  - lockfile transition dated: gate first fails 2026-08-26 UTC (§6.4)

verified_by:
  - repository counts: measured at commit 28c01a017 on branch verdant-grow-diary
  - redirects: all 8 declared entries plus a positive control, curl --max-redirs 0,
    commands recorded in §6.2
  - rewrites: response-content comparison across 4 paths (§6.2)
  - headers: response-header capture on /, /welcome, /pricing (§6.2)
  - provenance: commit 4b1c4867e685 fetched by SHA, tree recomputed with
    scripts/lib/tree-hash.mjs -> 1f0eb7b4e6cd vs stamped 8773f6b2c0ed
  - gates: check-sentinel-version-parity, assert-docs-safety, prettier, check:lockfile

not_done:
  - ARCH-01 not executed: #1051 owned that ground and has since merged as 5c60bcd9
  - no code, schema, migration, config or workflow change; documentation only
  - §7.1 ADR not written — it needs an owner decision first

unknowns:
  - where the 3 delivered security headers originate (NOT_MEASURED; needs edge/origin config)
  - whether the preview Vercel project verdant-command-center-preview is still live
  - whether NON_CANONICAL_SOURCE_ALIASES is enforced at every ingest call site, or only
    declared — this document verified the constant, not its call sites
  - whether client rendering fills /features and /terms-of-service after hydration

blocked:
  - why the build workspace's hashed roots differed from the stamped commit's tree.
    Owner: whoever holds the publisher's build log. Unblocked by that log. Lead recorded:
    x-deployment-id ecbb2146eba6 on live responses
  - GA4 / GSC authenticated baselines — unchanged, blockers 2 and 3 in CURRENT_STATE

assumptions:
  - projectSettings is labelled `inference`, not measured: nothing probed from outside the
    host can observe it. If a host does honour it, §6.2's scope narrows accordingly
  - repository counts assume 28c01a017 is the tree the reader is reasoning about; they do
    not describe production, which is a separate question (§6.1)

next_slice:
  - Owner: Cheek. Decide whether to commission the §7.1 ADR appended to the merged
    docs/codebase-map.md. ARCH-01/ARCH-02 are unblocked; everything else here is bounded.

files_touched:
  - docs/audits/architecture-audit-adjudication-2026-08-21.md (this document; the only
    file PR #1087 changes)
  - docs/codebase-map.md — two corrections pushed to #1051's branch under this
    assignment, NOT via #1087: the payments-token class inversion and the
    functions.invoke call-site count. Listed because this slice produced them; they
    landed with #1051 as 5c60bcd9
```

### Adversarial questions worth putting to this document

1. Re-run **all eight** declared redirect probes in §6.2 from a different network, plus the
   positive control. An earlier revision of this list said "four", which was stale after §6.2
   widened the matrix — following it would have validated half the declared routes while the
   document concluded about all eight. Is HTTP 200 with no `Location` reproducible on every
   entry, or was any single observation a cache artifact?
2. **Reproduce the own-commit hash comparison**, which is the surviving finding: fetch
   `4b1c4867e685` by SHA, recompute its tree with `scripts/lib/tree-hash.mjs`, and confirm it
   yields `1f0eb7b4e6cd…` against the live stamp's `8773f6b2c0ed…`. **Do not re-run the
   "does the SHA exist" check** — that question is closed (§6.1), and finding the SHA in another
   ref would not touch the surviving finding. The open half is the publisher's build log.
3. ~~Challenge §6.3's counting method.~~ **Already raised and acted on** — Codex made exactly
   this challenge in review of this document, and §6.3 is rewritten accordingly: the finding
   is now "11 files use the installed schema validator", carrying no coverage claim in either
   direction, and BOUNDARY-01 stays P1 with the ingress inventory as its first task. Left in
   place rather than deleted, because a caveat this document stated and then contradicted two
   sections earlier is worth keeping visible.
4. Confirm `NON_CANONICAL_SOURCE_ALIASES` is actually _enforced_ at every ingest path, not
   merely declared. This document verified the constant, not its call sites.

**Next decision belongs to Cheek:** #1051 is merged, so ARCH-01/ARCH-02 are unblocked — the
remaining call is whether to commission the §7.1 ADR at all; and
route §6.1 to whoever holds the publisher's view.

---

**One calibrated verdict:** the audit's engineering judgement is sound and its stack
determinations survive independent re-derivation intact. Its first two assignments were
blocked by an open PR it had already noticed — **#1051, now merged as `5c60bcd9`, so ARCH-01
and ARCH-02 are live work rather than blocked.** What remains unresolved is the thing that was never on its
roadmap: the build workspace that stamped production did not match its commit's tree
(§6.1) — a narrower finding than earlier revisions of this document claimed, and one that took
several review rounds to state correctly.

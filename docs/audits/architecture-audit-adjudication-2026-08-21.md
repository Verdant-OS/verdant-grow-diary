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

Nineteen of the audit's stack determinations were re-derived independently from source and
**every one held**. Three of its evidence labels were too weak, one of its priorities is
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
| Zod boundary coverage     | `PARTIAL PASS`, "universal coverage is not proven"                     | **Upheld.** 11 `src` files and 2 of 34 edge functions import Zod, but importer counts do not measure boundary coverage                       | §6.3 — the audit's hedge was right; an earlier revision of this document was not |
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

### 6.1 Production is serving a commit this repository does not contain — and it is stamped dirty

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

Two independent observations:

1. **`git cat-file -t 4b1c4867e685…` fails after a full fetch.** The SHA is absent from all
   **167** remote branches and all tags.
2. **`dirty: true` here is the non-benign case.** `scripts/stamp-version.mjs` documents the
   one innocent reading in its own comment: _"In a history-less snapshot everything is
   'untracked', so `dirty:true` plus `commitSource:"none"` together read as identity from
   treeHash."_ Production reports `commitSource: "git"`, **not** `"none"`. The same comment
   states the general rule: _"Never suppress — a dirty CI build is always a bug worth
   surfacing."_

`inference, high confidence`: production is serving a build whose source tree is not an exact
committed state of this repository.

`uncertainty`, and it must be stated: Lovable publishes from its own workspace, so a
Lovable-side build could legitimately stamp a commit from an internal git that never reached
GitHub. That would explain the orphan SHA — **it would not explain `dirty: true` alongside
`commitSource: "git"`**, which says the build tree had uncommitted changes at stamp time.

This supersedes the `CURRENT_STATE` Production-commit row (`f09febc354a4`, `dirty: false`,
2026-08-20). Resolving it needs `scripts/resolve-release-provenance.mjs` run against the
`treeHash` above by someone with the publisher's view. **This is exactly the gap OPS-01 and
OPS-02 exist to close, and it is live right now** — which raises both above their assigned
priority. It is owner-facing: no agent should attempt to reach the publisher.

### 6.2 The `vercel.json` question is now measured, not ambiguous

`established fact`, four live probes, 2026-08-21:

| Path        | `vercel.json` declares | Measured                    |
| ----------- | ---------------------- | --------------------------- |
| `/features` | 301 → `/welcome`       | **HTTP 200, no `Location`** |
| `/demo`     | 301 → `/welcome`       | **HTTP 200, no `Location`** |
| `/strains`  | 301 → `/cultivars`     | **HTTP 200, no `Location`** |
| `/refunds`  | 301 → `/refund`        | **HTTP 200, no `Location`** |

Not one redirect fired. This independently reproduces #1051's finding.

Note the corroborating repository evidence: `src/routes/` contains real route modules named
`features.tsx`, `demo.tsx`, `strains.index.tsx`, `strains.$slug.tsx`, `refunds.tsx`,
`refund-policy.tsx`, `privacy-policy.tsx` and `terms-of-service.tsx` — the application
compensates _in-app_ for redirects the host never performs.

`inference, high confidence`: `vercel.json`'s `redirects`, `rewrites`, `headers` and
`projectSettings` are inert in production. That matters twice over — the file's catch-all
rewrite `/((?!assets/).*)` → `/` is an SPA fallback that would defeat SSR entirely **if** it
were ever honoured by a host serving this app, and its security `headers` block is
**not** delivering those headers. Whether the security headers arrive by another mechanism is
`NOT_MEASURED` and should be OPS-02's first check.

### 6.3 Zod's reach is narrow — but that is a prompt to inventory, not a measured gap

`established fact`: **11** files under `src/` and **2** of 34 edge functions import Zod.
Zod is already installed (`^3.24.2` — **Zod 3**, not Zod 4; a v4 upgrade is its own migration
and is not implied here).

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
compatibility lock or extending `reviewBy` with a recorded reason. Second, **§6.2 removes one
of the five consumers' justification**: `vercel.json`'s npm `installCommand` / `buildCommand`
are cited as a reason to keep `package-lock.json`, but if Vercel does not govern production
that entry may be vestigial. That is the cheapest available progress on TOOL-01 and it should
be checked before the deadline.

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

**Precedent worth reusing:** `docs/grow-diary-architecture.md` is pinned by
`src/test/grow-diary-architecture-doc.test.ts`. ARCH-02 should follow that pattern, and per
`AGENTS.md` it must assert on **resolved values** — `await import()` the config and assert on
the object — never a regex over source text.

---

## 8. Known unknowns, and what stays blocked

| Question                                                             | Status                                                                                                |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Applied-migration ledger vs. the 272 committed files                 | `NOT_MEASURED` — drift probe still blocked on both an owner secret and defect 3 (name-bound matching) |
| Does production deliver the security headers `vercel.json` declares? | `NOT_MEASURED` — first check for OPS-02                                                               |
| What is production commit `4b1c4867e685`, and why is it dirty?       | `BLOCKED` — needs the publisher's view; owner-only                                                    |
| Are all five npm consumers still real after §6.2?                    | `NOT_MEASURED` — cheapest TOOL-01 progress                                                            |
| Runtime AI Doctor behaviour under the twenty adversarial cases       | `NOT_MEASURED` — AI-02 not run                                                                        |
| False-positive rate for any SPC rule                                 | `NOT_MEASURED` — no synthetic dataset exists yet (SENSOR-02)                                          |
| GA4 / GSC authenticated baselines                                    | `BLOCKED` — unchanged, blockers 2 and 3                                                               |
| Indexation                                                           | `NOT_MEASURED` — unchanged                                                                            |

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

Per `docs/agents/HANDOFF_PROTOCOL.md`, this slice's owner is **Claude** and it requires a
**different peer as independent reviewer**.

**Recommended reviewer: Grok** (Product Intelligence, Adversarial Audit and Implementation
Lead — peer, no rank). The adversarial questions worth putting to this document:

1. Re-run the four live probes in §6.2 from a different network. Is HTTP 200 with no
   `Location` reproducible, or was one observation a cache artifact?
2. Re-fetch and re-check `4b1c4867e685`. If it appears in a ref this session did not have,
   §6.1's first observation collapses — but the `dirty: true` + `commitSource: "git"`
   observation stands independently and still needs an explanation.
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
and ARCH-02 are live work rather than blocked.** What remains unresolved is the thing that was
never on its roadmap: production is serving a dirty build from a commit this repository does
not contain.

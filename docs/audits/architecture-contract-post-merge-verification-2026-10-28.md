# Current Architecture Contract and Release Topology — post-merge verification, 2026-10-28

**Deploy tip read:** `604274a793b0b38320a09de246bd8c4d166089ad` (`verdant-grow-diary`, the `#2564`
merge commit), fetched 2026-10-28 ~00:05 UTC. **Author:** Claude, session
`session_017UoYKvojgRxESWUyQyGEmj`. **Docs only.** No application code, schema, migration, Edge
Function, workflow, lockfile, publish, production read or Action Queue action.

Evidence labels follow `CLAUDE.md` § Evidence discipline. Status words: `PASS`, `FAIL`, `BLOCKED`,
`NOT_MEASURED`, `NOT_APPLICABLE`.

## 1. Summary

- The assignment ("create a source-grounded Current Architecture Contract and, in a separate
  approved slice, an Authoritative Release Topology Specification") was **already delivered and
  merged** before this session started its audit. `#2564` restamped `docs/architecture-contract.md`
  at `27991451` (carrying `#2149`), added the topology specification's fifth amendment (§2.11,
  §6.3) at the same tip, and merged at 2026-10-27 23:51 UTC with an independent exact-head PASS
  from the sour diesel review session at `d410d0f5`. `established fact` (GitHub API, `git log`).
- This session therefore wrote **no competing document** (AGENTS.md §9). What it adds is the
  named post-merge check of `#2564` — reproducing the stamp's census figures from `27991451`
  before measuring the tip — plus an independent re-read of the eight stack conclusions from
  source at `604274a7`, and the handoff a non-contributing Grok session needs to review the merged
  result. Every reproduction is `PASS`; the two census deltas are itemized to the file.
- Nothing about production is asserted. The three egress routes this session holds each refused
  the apex once (§8), so M1/M2/M7/M10 stay `BLOCKED`, exactly as `#2564` recorded.

## 2. Requirements and assumptions

| #   | Requirement (from the assignment)                                     | How it is met                                                                                       |
| --- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| R1  | Audit the deploy branch, not `main`                                   | Every read is at `604274a7` on `verdant-grow-diary`; local HEAD fast-forwarded to it                |
| R2  | Reuse merged architecture documentation instead of duplicating it     | `#2564` is the deliverable; this file is a receipt and review brief, not a second contract          |
| R3  | Separate permanent architecture from CURRENT_STATE operational facts  | Contract §0.1 already fences this; nothing operational is written into the contract by this session |
| R4  | Rejected/deferred alternatives                                        | Contract §12–§13 and spec §14 carry them; §10 below lists what this session adds to that record     |
| R5  | Release topology only after overlapping PRs resolve                   | Gates `#2555`, `#2553`, `#1971`, `#2538` merged 2026-10-27; Matthew approved the stacked slice      |
| R6  | No application code in the specification slice                        | `PASS`: one new Markdown file and one handoff-log block                                             |
| R7  | PASS/FAIL/BLOCKED/NOT_MEASURED/NOT_APPLICABLE; one calibrated verdict | §12 and §14                                                                                         |

Assumptions, each labelled:

- `inference`: Matthew's "restamp in place" decision recorded in the `ARCH-CONTRACT-RESTAMP-20261027`
  block applies to this session too, since the assignment text is the same.
- `source claim` (persona text): "Codex is coordinating release gates" and "Claude owns the active
  Pheno Hunt expansion". Neither matches `docs/agents/CURRENT_STATE.md` or `OWNERSHIP.md` today;
  this session follows the repository.
- `source claim` (persona text): "`public.billing_subscriptions` is the entitlement source of
  truth". **Contradicted by source**: see §5 row 11.

## 3. Collision audit

`established fact` unless labelled. Sources: GitHub API (open PR list, two pages, read 2026-10-27
~23:45 UTC, re-queried 2026-10-28 ~00:05 UTC), `git log --first-parent`.

| Area (assignment rule 1)             | Finding                                                                                                                                                                                                                                   | Status for this session      |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| Architecture documentation           | `#2564` merged 23:51 UTC (`604274a7`): contract restamp at `27991451` + spec §2.11/§6.3. `#2149` closed 23:59 UTC, superseded (its head reachable from the merge). `#2187` (draft, test pins for `#2149` invariants) open, untouched here | **Collision found; yielded** |
| Handoff-log closure of that slice    | `#2571` (draft, opened 2026-10-28 00:01 UTC) moves `ARCH-CONTRACT-RESTAMP-20261027` and `FIX-2146` to Closed                                                                                                                              | Not duplicated               |
| Prior handoff for this assignment    | `handoff-verdant-architecture-contract.md` (`#2336`, merged 2026-10-22) already predicted "re-verify and amend, not a new file"                                                                                                           | Reused                       |
| CURRENT_STATE production rows        | `#2556` (PR cleanup inventory) and `#2567` (close STOP-SELLING block) edit `HANDOFF_LOG.md` only; no open PR edits `CURRENT_STATE.md` production rows                                                                                     | No overlap                   |
| CI runners                           | `#2555` (shard cap, cancel superseded runs), `#2553`, `#2538`, `#2547` merged 2026-10-27; `#2512` (coverage reporting) open                                                                                                               | No overlap; not touched      |
| Signup / migration hardening         | `#2550` restored four sandbox migration files (merged); `#2140` (plant health schema) open; `#1846` (quicklog hash UTC, migration) open                                                                                                   | Out of scope; not touched    |
| Quick Log remembered-target recovery | No open PR reintroduces remembered-target or only-plant auto-selection; `#2529` (merged) narrows auto-open to a selected plant                                                                                                            | Ban stands; not touched      |
| Billing                              | `#2028` merged (`0200d255`, stop selling Founder Lifetime); `#2570` (retire Founder sales machinery, draft) and `#2221` (Paddle wire, Codex P1) open                                                                                      | Out of scope; not touched    |

Result: **no competing implementation was created.** The only repository write from this session is
this file and its handoff-log block.

## 4. Current architecture — what the merged documents now say, and what this session re-read

The permanent contract is `docs/architecture-contract.md` (stamp `27991451`, post-stamp note for
`0200d255`, sixteen sections, AC-1.1 … AC-10.2, §11 enforcement map). The release topology is
`docs/specs/release-topology-specification.md` (six axes, D-RT-1 … D-RT-15, M1 … M11, dated
appendices A–E). Neither is restated here.

**Post-merge check of `#2564`** (its PR body and handoff block name this check): reproduce the
stamp's census figures from `27991451`, then measure the tip. `established fact`, measured
2026-10-28 on the `604274a7` tree with the same globs the clauses define.

| Figure                                                | `#2564` at `27991451` | This session at `27991451` | This session at `604274a7` | Delta, itemized                                                                                                                                                                                                        | Status         |
| ----------------------------------------------------- | --------------------: | -------------------------: | -------------------------: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| AC-3.2 root-level `src/lib/*Rules.ts` files           |                   610 |                        610 |                        609 | `#2028` deleted `src/lib/founderShareRules.ts`                                                                                                                                                                         | `PASS`         |
| AC-3.4 alias-only shim import statements / files      |             940 / 939 |          not re-run at SHA |                  941 / 940 | +5 new `src/test/*` importers (`#2028` ×4, `#2559` ×1); −2 deleted (`CheckoutSuccessFounderNote.tsx`, `pages/Founder.tsx`); −2 tests whose import was removed (`checkout-success-founder-note`, `founder-launch-page`) | `PASS`         |
| `@tanstack/react-router` under `components/`/`pages/` |                     0 |                          0 |                          0 | —                                                                                                                                                                                                                      | `PASS`         |
| AC-10.2 SPC-term hits across the seven roots          |                     0 |                          0 |                          0 | —                                                                                                                                                                                                                      | `PASS`         |
| AC-4.3 single-line figures                            |  77/67, 70/61, 106/86 |                    not run |                    not run | `NOT_MEASURED` here; no sensor-source file changed between `27991451` and the tip                                                                                                                                      | `NOT_MEASURED` |

Reading of the deltas: both census moves are explained to the file by the two merges after the stamp
(`#2559`, `#2028`), which `#2564`'s post-stamp note already disclosed as 35 commits past `27991451`.
No clause text needs to change for them; the next full restamp records 609 and 941/940.

## 5. Corrections to the "Optimal Tech Stack Evaluation"

No file in the repository carries that title (`grep -rli "optimal tech stack"` over `docs/` and the
repository root at `604274a7`: only the topology spec's own §6 note). The spec treats the
assignment's list of "non-negotiable conclusions" as the evaluation, and §6.3 (merged in `#2564`)
re-read all fourteen rows at `27991451`. This session re-read the eight source rows again at
`604274a7`, independently, from the files named. Rows 11–14 are production assertions and are not
re-measured here.

| #   | Conclusion                                                                                   | Status at `604274a7`                   | Evidence (`established fact`, read this session)                                                                                                                                                                                                                                                                                                                                                              |
| --- | -------------------------------------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | TanStack Start SSR, TanStack Router, Vite, Nitro                                             | `PASS`                                 | `src/server.ts:20` imports `@tanstack/react-start/server-entry`, `:53` default export with host routing; `src/start.ts:1,28` `createStart`; `src/router.tsx:2,8-9` `createRouter` over `routeTree`; `package.json` Start `^1.168.60`, Router `^1.170.41`, `vite ^8.3.3`, `nitro 3.0.260603-beta`; `bun.lock` resolves 1.168.60 / 1.170.41 / 8.3.4; `vite.config.ts:12` imports the Lovable preset's ESM entry |
| 2   | React 19, Tailwind 4, shadcn/Radix, TanStack Query                                           | `PASS`                                 | `react`/`react-dom` `^19.2.0` → 19.2.8; `tailwindcss`/`@tailwindcss/vite` `^4.2.1` → 4.3.3; 27 direct `@radix-ui/*` packages; `@tanstack/react-query` `^5.101.1` → 5.101.4; `lucide-react`, `sonner` present. `zod` is `^4.6.6` → 4.6.7 (AC-1.8 records the 3→4 move; not an invariant)                                                                                                                       |
| 3   | Supabase Postgres / Auth / RLS / RPC / Edge Functions                                        | `PASS` in source                       | `@supabase/supabase-js ^2.105.4` → 2.111.0, `@supabase/ssr` 0.10.3; `src/integrations/supabase/client.ts:18` `sessionStorage` hardening; 34 function directories + `_shared`; 301 migration files; `.rpc("has_role")`. Applied schema and deployed functions `NOT_MEASURED`                                                                                                                                   |
| 4   | Bun canonical; npm compatibility may remain                                                  | **`FAIL` for the second clause**       | Only `bun.lock` and `bunfig.toml` exist; no `package-lock.json`, `bun.lockb`, `yarn.lock` or `pnpm-lock.yaml`. `scripts/check-bun-lockfile-policy.mjs:75-80` `FORBIDDEN_LOCKFILES` lists `package-lock.json`. Retired by `#1873` (2026-10-04). The assignment text is stale on this point                                                                                                                     |
| 5   | AI Doctor uses a Lovable AI gateway path                                                     | **`FAIL`**                             | `supabase/functions/ai-doctor-review/index.ts:103` `lookupGeminiDirectRoute(FEATURE, MODEL_TIER)`, `:107` `GATEWAY_URL = doctorRoute.url`, `:611` `fetch(GATEWAY_URL, …)`; `supabase/functions/_shared/geminiDirectChat.ts:21` names `generativelanguage.googleapis.com`. Only `ai-cultivar-qa/index.ts:91` still calls `ai.gateway.lovable.dev`. Which build production runs is `NOT_MEASURED`               |
| 5b  | … with server-pinned model selection                                                         | `PASS`                                 | `index.ts:102` `MODEL_TIER = "standard"`, `:108-109` `MODEL`/`WIRE_MODEL` from the route table; no request-body path to either                                                                                                                                                                                                                                                                                |
| 5c  | … validated tool output, credit/idempotency controls, evidence receipts                      | `PASS`                                 | `:220-221` forced `tool_choice`; `validateAiDoctorReviewResult` (`:33`), grounding (`:44`); RPCs in the file are exactly `ai_credit_spend`, `ai_credit_refund`, `ai_doctor_finalize_review`, `record_ai_doctor_review_completion`; key read `:385` precedes spend `:475`; receipt HMAC comments `:18-23`                                                                                                      |
| 5d  | … no direct Action Queue / device writes                                                     | `PASS`                                 | The only `action_queue`/`device` mentions are the `:8-9` prohibition comment; zero `.from(` table writes in the file; `ai-coach/index.ts` has zero `action_queue` mentions                                                                                                                                                                                                                                    |
| 6   | Canonical sensor sources `live/manual/csv/demo/stale/invalid`; vendor/transport = provenance | `PASS`, two known limits               | `src/lib/sensor/sensorSourceRules.ts:16` `SENSOR_SOURCES`, `:78-81` unknown → `invalid`; `src/constants/sensorIngestProvenance.ts:5-9` ("not a vendor, transport, protocol, bridge, app, or integration name"). Limits: `pi_bridge` → `live` transport alias (`:28`, AC-4.4); generic webhook unknown-label candidate (AC-4.2)                                                                                |
| 7   | VPD EWMA exists                                                                              | `PASS`                                 | `src/lib/vpdDriftRules.ts:56` `DEFAULT_VPD_DRIFT_ALPHA = 0.3`, `:57` minimum 6 readings, `:59` `evaluateVpdDriftEwma`; mirrors SQL `evaluate_vpd_drift_ewma` (`:3`). α documented, not test-pinned (T6)                                                                                                                                                                                                       |
| 8   | Modified Z-Score / MAD and Nelson Rules not implemented                                      | `PASS` (must stay described as absent) | Case-insensitive grep for `nelson`, `modified z`, `modifiedZ`, `median absolute deviation`, `\bMAD\b`, `z-?score`, `zscore`, `robust ?z` over `src/`, `supabase/`, `scripts/`, `e2e/`, `tools/`, `plugins/`, `spikes/`: zero hits. Contract §12 records both as REJECTED                                                                                                                                      |
| 9   | Product priority loop Grow → … → Approval-Required Action Queue                              | `NOT_APPLICABLE` to source             | A product rule (AGENTS.md §3), not a stack claim; nothing here changes it                                                                                                                                                                                                                                                                                                                                     |
| 10  | "Lovable Cloud is the production publisher"; "`vercel.json` is inert"; "merge goes live"     | `NOT_MEASURED` here                    | Production axes; last dated verdicts are spec §6.1 rows 11–14 (`FAIL`, `FAIL`, `FAIL` as inference, `FAIL`), unchanged by `#2564` and not re-measured by this session (§8)                                                                                                                                                                                                                                    |
| 11  | (persona text) "`public.billing_subscriptions` is the entitlement source of truth"           | **`FAIL`**                             | `src/hooks/useMyEntitlements.ts:90` reads `.from("subscriptions")`; `src/lib/entitlements/types.ts:17` doc comment still names `billing_subscriptions` (contract AC-6.1 records this as a naming hazard, not a read). AGENTS.md §7: `billing_subscriptions` never grants. Correct wording: **`public.subscriptions`**                                                                                         |

Corrections to carry forward, in order of consequence: rows 5 and 11 are wrong in the assignment
text and would mislead a new implementer; row 4 is stale. Rows 1–3 and 5b–8 hold.

## 6. Architecture decisions

All decisions are already recorded and merged: contract §7-style clauses AC-1.1 … AC-10.2, §12
rejected alternatives, §13 deferred; spec §7 D-RT-1 … D-RT-15. This session adds **no new
decision**. Two existing decisions bear restating because the assignment text contradicts them:

- **D (contract AC-5.1, amended `#1982`, gated `#2070`):** AI Doctor and AI Coach reach Gemini
  directly from the server, key-before-spend; the Lovable gateway remains only for
  `ai-cultivar-qa`. A provider or model change is an owner decision outside the contract.
- **D (contract AC-6.1):** `public.subscriptions` is the sole entitlement source; `profiles.tier`
  is gamification; `billing_subscriptions` is legacy and never grants.

## 7. Release topology

Delivered in `#2564` as the fifth amendment (spec §2.11, §6.3, §10 row, §12 follow-up, §13 bullet,
AT-18, §15.4). The six-axis model (§3), the measured chain (§4), D-RT-12/13 (promotion and publish
actions) and M1–M11 are unchanged. What stays open, verbatim from §15.4 `next_slice`: a session
whose egress reaches the apex runs M1, M2, M7 with layer attribution and M10, and records them in
`docs/agents/CURRENT_STATE.md`; and the §12 follow-up on downstream text that still quotes §6.1
rows 4 and 5 as current. This session could not take those reads (§8) and did not amend the spec.

## 8. Known unknowns

| Unknown                                                                                  | Status         | Why                                                                                                                                                                                                                                                                                                                         |
| ---------------------------------------------------------------------------------------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| What the apex serves (M1), DNS (M2), host-routing layer (M7), per-hostname binding (M10) | `BLOCKED`      | Three routes, one attempt each, 2026-10-28 ~00:05 UTC: `curl` refused by the session's bash safety hook (network-egress pattern); the external fetcher returned "insufficient credits"; the fetch tool returned `ENOTFOUND verdantgrowdiary.com` (host not in the session's allowed network domains). Nothing routed around |
| Whether `604274a7` is deployed anywhere                                                  | `NOT_MEASURED` | Follows from the above; a merge is not a deployment (AGENTS.md §2)                                                                                                                                                                                                                                                          |
| Applied migration state in production                                                    | `NOT_MEASURED` | Operating-state axis; six migrations landed since `c8523adc`, none applied by any agent                                                                                                                                                                                                                                     |
| Which build of `ai-doctor-review` production runs; `GEMINI_API_KEY` set                  | `NOT_MEASURED` | Contract AC-5.1 scopes its claim to the repository                                                                                                                                                                                                                                                                          |
| AC-4.3 multi-line figure                                                                 | `source claim` | Carried from the contract; not re-run                                                                                                                                                                                                                                                                                       |
| Hosted CI result for `604274a7`'s queue run                                              | `NOT_MEASURED` | Merged through the queue, which re-runs required checks; the run was not read by this session                                                                                                                                                                                                                               |

## 9. File-level plan

This slice (docs only, one branch `claude/new-session-u6kn52`, one draft PR):

- `docs/audits/architecture-contract-post-merge-verification-2026-10-28.md` — this file.
- `docs/agents/HANDOFF_LOG.md` — one block, `ARCH-CONTRACT-POST-MERGE-20261028`.

Not touched, by design: `docs/architecture-contract.md`, `docs/specs/release-topology-specification.md`
(both merged via `#2564` 60 minutes before this audit; the next restamp owns the 609 / 941-940
figures), `docs/agents/CURRENT_STATE.md`, any governance file, any file under `src/`, `supabase/`,
`.github/`, `config/`.

Proposed next slices, none started here (`PROPOSED — NOT ASSIGNED`):

1. Live reads M1/M2/M7/M10 from a session or owner machine whose egress reaches the apex;
   record in `CURRENT_STATE.md` (owner-gated by network policy, not by code).
2. Spec §12 follow-up: find downstream text still quoting "npm compatibility may remain" or "AI
   Doctor through the Lovable gateway" as current, and point it at §6.3 / AC-5.1.
3. Retire the `BillingSubscriptionRow` name / `billing_subscriptions` doc comment in
   `src/lib/entitlements/types.ts` (contract AC-6.1 names it `convention only`; it misled the
   assignment text). Code change; needs its own assignment.

## 10. Acceptance tests

| ID   | Test                                                                                                    | Result                                    |
| ---- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| AT-1 | Local HEAD equals `origin/verdant-grow-diary` at `604274a7` before any read                             | `PASS`                                    |
| AT-2 | No open PR edits `docs/architecture-contract.md` or the topology spec after `#2564` (GitHub, 00:05 UTC) | `PASS` (`#2187` adds tests only)          |
| AT-3 | AC-3.2 figure reproduced at `27991451` (610) before the tip (609), delta itemized                       | `PASS`                                    |
| AT-4 | AC-3.4 figure at the tip (941 / 940) reconciles to `#2564`'s 940 / 939 by named files                   | `PASS`                                    |
| AT-5 | AC-10.2 zero hits at the tip over the seven roots                                                       | `PASS`                                    |
| AT-6 | Eight stack conclusions re-read from the named `path:line`s at the tip (§5)                             | `PASS` (verdicts match `#2564`'s §6.3)    |
| AT-7 | `node scripts/assert-docs-safety.mjs` and `node scripts/assert-release-docs-safety.mjs` on this tree    | recorded in the PR body                   |
| AT-8 | Live M1 read                                                                                            | `BLOCKED`                                 |
| AT-9 | Independent Grok review of `#2564`'s merged text at `604274a7` (§13)                                    | `NOT_MEASURED` — requested, not performed |

## 11. Safety verdict

- No fake live data: no production value is reported; every live axis is `BLOCKED`/`NOT_MEASURED`.
- No device control, no Action Queue write, no migration, no Edge change, no secret touched.
- The AI Doctor write-surface claim (row 5d) was re-verified from source, not carried.
- Billing: the persona text's `billing_subscriptions` claim is corrected to `subscriptions`; no
  entitlement path was changed.
- Quick Log: remembered-target and only-plant auto-selection remain banned and untouched.

**Verdict for this slice: SAFE (docs only).**

## 12. Deferred and rejected

| Item                                                                 | Disposition  | Reason                                                                                                      |
| -------------------------------------------------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------- |
| Writing a new Current Architecture Contract                          | REJECTED     | `#2564` merged it in place; AGENTS.md §9 one implementation                                                 |
| Writing a new Release Topology Specification                         | REJECTED     | Same; fifth amendment merged in `#2564`                                                                     |
| Restamping the contract again at `604274a7` for the 609 / 941 deltas | DEFERRED     | Two docs-only merges past the stamp; `#2564`'s post-stamp note already discloses them; next restamp owns it |
| Closing the stale `ARCH-CONTRACT-RESTAMP` / `FIX-2146` log blocks    | NOT TAKEN    | `#2571` (opened 00:01 UTC) already does it                                                                  |
| Running M1–M10 from this session                                     | BLOCKED      | Three egress routes refused once each                                                                       |
| Next.js, Drizzle, tRPC, auth migration, provider/model change        | OUT OF SCOPE | Assignment; contract §12 already records Next.js as REJECTED                                                |
| Nelson Rules, Modified Z-Score/MAD                                   | REJECTED     | Contract §12; AC-10.2 keeps them described as absent                                                        |

## 13. Handoff to Grok as independent reviewer

```text
HANDOFF
from_agent: Claude (session_017UoYKvojgRxESWUyQyGEmj)
to_agent: an available, non-contributing Grok review session (OWNERSHIP.md §4.3). Excluded:
  Claude session_017UoYKz1FZZdZu9afTV2RhP (author of #2564), the Grok session behind #2149's
  dfb1567e, the sour diesel session (already gave the exact-head PASS at d410d0f5), this session
  (author of this receipt), Codex/CodeRabbit connector passes.
sentinel_version: 2026-10-27.1
date: 2026-10-28

scope_to_review:
  1. docs/architecture-contract.md at 604274a793b0b38320a09de246bd8c4d166089ad (merged #2564 text)
  2. docs/specs/release-topology-specification.md §2.11 and §6.3 at the same SHA
  3. this receipt (docs/audits/architecture-contract-post-merge-verification-2026-10-28.md)

review_asks:
  - Re-run AT-3 and AT-4 above from a clean checkout: `git ls-tree -r --name-only 604274a7 -- src/lib
    | grep -E '^src/lib/[^/]*Rules\.ts$' | wc -l` (expect 609) and the alias-only shim census
    (expect 941 statements in 940 files).
  - Confirm §5 row 5 (Gemini-direct) at ai-doctor-review/index.ts:103-109,611 and
    _shared/geminiDirectChat.ts:21; confirm row 11 at useMyEntitlements.ts:90.
  - Spot-check five contract cites of your choice into files #2564's post-stamp note lists as
    moved (cloudflareHostRoutingRules.ts, Settings.tsx, appRouteManifest.ts).
  - State whether anything in this receipt asserts production behaviour. It should not.

verdict_format: PASS / FAIL / BLOCKED with P1/P2/P3 findings, bound to the exact SHA of this
  receipt's PR head (read it from the PR) and to 604274a7 for the merged documents.
  A post-merge read of #2564 is an observation on merged text, not a merge gate; it does not
  replace or reopen the sour diesel acceptance.

not_done:
  - M1, M2, M7, M10 (BLOCKED, §8)
  - No CURRENT_STATE.md, contract, spec or governance edit

disposition: draft PR, docs only; no merge, enqueue, publish or production action from this session.
```

## 14. Calibrated verdict

**The assigned deliverables exist, are source-grounded at `27991451` with a disclosed post-stamp
note for `0200d255`, and are merged with an independent exact-head PASS. This session's independent
re-measurement at `604274a7` reproduces every census figure and every one of the eight stack
verdicts, with the two post-stamp deltas explained to the file. Confidence: high for the repository
claims (every one re-read from the named lines this session); none for production, which stays
`BLOCKED`/`NOT_MEASURED` on every axis. Two statements in the assignment text are wrong against
source and should not be repeated to the next implementer: AI Doctor is Gemini-direct, not a Lovable
gateway path; the entitlement source is `public.subscriptions`, not `public.billing_subscriptions`.
One is stale: `package-lock.json` is gone.**

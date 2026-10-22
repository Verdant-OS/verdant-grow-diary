# active-memory handoff: Verdant Current Architecture Contract and Release Topology Specification

**Handoff #1** · 2026-10-22 · Lineage: #1 (2026-10-22): session opened with the assignment, ran the SENTINEL startup gate, found both target documents already exist on the deploy branch, wrote this handoff; no specification work started. Same day: committed as `ab60641`, draft PR #2336 opened, Matthew said "Merge", and Copilot's six P2 findings were verified and folded in (#2072 was already merged).

## 0. Instructions for Claude (read first)

You are continuing work from a previous chat. That chat is gone; this file is the complete context and the source of truth.

1. Read this whole file before replying.
2. Follow sections 3 (Style), 4 (Hard rules) and 5 (Corrections) in every reply, for the rest of this chat. They override your defaults.
3. Use the values in section 8 exactly. Never round, re-estimate, or "correct" them.
4. Do not suggest anything listed in section 7 (Changed / rejected) again unless the user brings it up.
5. Code word: None active. If the user types /amcodeword, start every reply with the phrase they choose (default "Yes Boss!").
6. Your first reply: at most 5 lines covering the goal, the current state, and the next step (section 11). Mention any files from section 13 that were not attached. Ask the questions in section 12 if there are any. End with "Ready to continue with <next step>?" Then wait for the user's go.

## 1. Mission
- **Goal:** "Create a source-grounded, Verdant-specific Current Architecture Contract and, in a separate approved slice, an Authoritative Release Topology Specification." Repository `Verdant-OS/verdant-grow-diary`, deploy branch `verdant-grow-diary`.
- **Done looks like:** one deliverable with exactly these sections, in this order: Summary; Requirements / assumptions; Collision audit; Current architecture; Corrections to the Optimal Tech Stack Evaluation; Architecture decisions; Release topology; Known unknowns; File-level plan; Acceptance tests; Safety verdict; Deferred/rejected items; Clean handoff to Grok as independent reviewer. Every check labelled PASS / FAIL / BLOCKED / NOT_MEASURED / NOT_APPLICABLE. Ends with one calibrated verdict.
- **Why it matters / context:** the repo already carries both documents (section 10). Scope item 2 says "Reuse merged architecture documentation instead of duplicating it", so the work is almost certainly a re-verification and amendment at the current deploy tip, not a new file. The user has not yet confirmed that reading (section 12, Q1).

## 2. About the user (as relevant to this work)
- Matthew Cheek (also written Cheek, Cheeko, Matthew), founder and owner of Verdant; account matt@verdantgrowdiary.com. Keeps four decisions: production database changes, spend ceiling, anything gating a publish, the publish decision.
- Persona they asked Claude to hold: "Senior product engineer and practical cannabis cultivator working on Verdant." Grower who diagnoses real plants; staff-engineer discipline: inspect first, smallest safe change, prove with tests.
- Runs a multi-agent fleet (Codex, Grok 91, Claude, Graft, Blue Dream, Durban Poison, Critical Mass, Cursor cloud agents, Lovable). Governance lives in `AGENTS.md`, `CLAUDE.md`, `docs/agents/*`. Follows sessions from the Claude app.
- Their nutrient brand is Cronk. Never invent feeding schedules or dosages for it.

## 3. Style & communication
- **Language:** English.
- **Tone:** "Calm, exact, practical, and evidence-led." "Write like a thoughtful operator talking to another operator." "Be humble about uncertainty. Say what is known, what is inferred, and what is missing."
- **Reply length:** "Be concise by default. Lead with the result, then give exact evidence, file paths, and validation counts." "Do not pad responses with generic praise or long recaps." "End with one calibrated verdict. Do not end with vague enthusiasm."
- **Formatting:** plain language over jargon; exact examples when they help; file paths and counts inline. Implementation replies use the fixed heading list: Summary / Requirements / assumptions / Audit findings / File-level plan / Implementation notes / Tests added / Validation commands / Validation results / Safety verdict / Deferred items / Risk / rollback notes. The architecture deliverable uses the 13 headings in section 1.
- **Evidence labelling:** every claim tagged `established fact`, `source claim`, `practical observation`, `inference`, `uncertainty`, or `missing evidence`. Status words used literally: PASS, FAIL, BLOCKED, NO_BASELINE, NO_DATA, NOT_MEASURED, SKIPPED, NOT_APPLICABLE. "A metric with no applicable cases is NOT_MEASURED, never a 100% score."
- **Working style:** return `SENTINEL_ACK` (block format in `AGENTS.md`) before any analysis, after reading `AGENTS.md`, `docs/agents/CURRENT_STATE.md`, `docs/agents/HANDOFF_LOG.md`, `docs/agents/roles/claude.md`. "Audit before building. Separate confirmed defects from ideas." "Before answering, ask me any clarifying questions you need. If you already have enough information, answer immediately and explain any assumptions you're making." "If blocked, name the exact blocker and the safest next action."
- **Avoid:** "bro-science, hype, fake scarcity, fake live data, or overconfident diagnosis language." Reasoning about production from repo presence, memory, or green CI. Claiming "all green" without running it. Hard-coding plan gates in JSX.

## 4. Hard rules (word for word)
1. "Mandatory first action after SENTINEL_ACK: Inspect recent merged PRs and all open PRs for collisions, especially work involving: codebase/architecture documentation; CURRENT_STATE production rows; CI runners; signup/migration hardening; Quick Log remembered-target recovery; billing. Do not create a competing implementation."
2. "Produce the release topology specification only after active overlapping PRs resolve." (As of 2026-10-22 the only PR known to touch the spec, #2072, merged on 2026-10-15; see section 8. The collision audit in section 11 step 1 decides whether any other overlap is active.)
3. "Do not write application code in the specification slice."
4. "Audit the deploy branch." "The deploy branch is `verdant-grow-diary`, not `main`." "Audit the deploy branch, not `main`."
5. "Reuse merged architecture documentation instead of duplicating it."
6. "Separate permanent architecture from CURRENT_STATE operational facts."
7. "Do not infer production behavior from repository presence or green CI."
8. "Non-negotiable conclusions to verify from source rather than assume: The application uses TanStack Start SSR, TanStack Router, Vite, and Nitro. React 19, Tailwind 4, shadcn/Radix, and TanStack Query are current. Supabase Postgres/Auth/RLS/RPC/Edge Functions are current. Bun is canonical; npm compatibility may remain. AI Doctor currently uses a Lovable AI gateway path with server-pinned model selection, validated tool output, credit/idempotency controls, evidence receipts, and no direct Action Queue/device writes. Canonical sensor source values are live/manual/csv/demo/stale/invalid; vendor and transport information are provenance metadata. VPD EWMA exists; Modified Z-Score/MAD and Nelson Rules must not be described as implemented without source evidence."
9. "Product priority: Grow → Tent → Plant → Quick Log → Timeline → Sensor Snapshot → AI Doctor → Alert/Recommendation → Approval-Required Action Queue."
10. "No fake live data." "Clearly distinguish live, manual, CSV, demo, stale, and invalid data." "Unknown or invalid telemetry must never be displayed as healthy."
11. "AI Doctor may suggest actions but never decides or executes them." "Action Queue remains approval-required." "Never recommend automatic irrigation, nutrient changes, spraying, or device control."
12. "Never expose secrets, API keys, webhook secrets, service-role keys, bridge tokens, or private environment values." "Never put service-role access in client code."
13. "Never let a client set its own billing tier, AI credit balance, role, entitlement, or user identity." "Never use profiles.tier for billing." "Founder Lifetime has Pro-like access with capped AI credits, never unlimited AI." "Do not hardcode plan gates in JSX; use capability helpers under src/lib/entitlements."
14. "Codex is coordinating release gates, production verification, and merge-on-green. Do not merge, deploy, run live migrations, alter secrets, or publish production changes unless explicitly instructed."
15. "Claude owns the active Pheno Hunt expansion. Do not edit Pheno Hunt routes, files, schema, navigation, or tests unless the user explicitly reassigns that work." (persona text; not verified against HANDOFF_LOG, which has no Pheno Hunt block)
16. "Do not 'fix' a production deployment problem with fake client-side state. First distinguish source code from deployed infrastructure."
17. "A waitlist is not a reservation and must never claim to reserve a Founder seat, start a subscription, or create a charge." "Scarcity counters must reflect real verified purchase data or transparently fall back; never fabricate counts." "The production Founder page must be treated as launch-blocked until its live counter path and warm-list path are verified."
18. Repository rules that bind this task (from `AGENTS.md` / `CLAUDE.md` / CURRENT_STATE "Start here"): "Never push directly to `verdant-grow-diary` or `main`, force-push, or rewrite history." "Open PRs as drafts." "Editing any of the twelve governance files bumps all twelve" (`docs/agents/CURRENT_STATE.md` and `HANDOFF_LOG.md` are exempt). "GitHub comments (PR, review or issue comments) need Matthew's approval" for agents other than Claude under the VER-216 grant. "HOLD #1250" files untouchable. "Never merge #1740." "No Publish." "knk production database lock: no writes."
19. Evidence standard for the deliverable: "Use PASS / FAIL / BLOCKED / NOT_MEASURED / NOT_APPLICABLE." "End with one calibrated verdict."
20. Startup order (`AGENTS.md`): the four startup files are the only reads before `SENTINEL_ACK`. The acknowledgment block is returned in full and is exempt from the five-line limit in section 0 item 6, which applies to the summary that follows it. The collision audit (rule 1) is the first action after the acknowledgment.

## 5. Corrections log
None. (No corrections occurred in this chat; it contained only the assignment and this handoff request.)

## 6. Decisions
| Decision | Why |
|---|---|
| Scope is the 7 items: audit deploy branch; reuse merged docs; define permanent contract; separate architecture from CURRENT_STATE facts; define rejected/deferred alternatives; release topology only after overlapping PRs resolve; no app code in the spec slice | user's call (task text) |
| Out of scope: Next.js migration; Drizzle or tRPC adoption; auth migration; schema/RLS/migration changes; provider/model change; Action Queue writes; device control; production deployment; production migration application | user's call (task text) |
| Grok is the independent reviewer for the deliverable ("Clean handoff to Grok as independent reviewer") | user's call |
| This handoff file is committed on `claude/amhandoff-dt7n5x` (first commit `ab60641`) and carried by draft PR #2336; it was also sent to the user as an attachment | History: the first draft was left uncommitted as a chat artifact; the session's stop hook then required a clean tree, so it was committed and the PR opened. Matthew said "Merge" on 2026-10-22 |
| The pre-existing `.gitignore` modification (plugin-added `.simple-workflow` lines) was left untouched | Claude's call: not this task's change |
| Three instruction conflicts were flagged in section 12 instead of silently picking one | `CLAUDE.md`: "Report any conflicting instructions rather than silently picking one" |

## 7. Changed / rejected
- ❌ Next.js migration (user: out of scope)
- ❌ Drizzle or tRPC adoption (user: out of scope)
- ❌ Auth migration (user: out of scope)
- ❌ Schema / RLS / migration changes, provider or model change, Action Queue writes, device control, production deployment, production migration application (user: out of scope)
- ❌ Describing Modified Z-Score/MAD or Nelson Rules as implemented (user rule 8; `docs/architecture-contract.md` §12 already records both as REJECTED, "Environmental telemetry violates textbook SPC assumptions")
- ❌ Writing a new, second architecture contract or release topology document (inference from scope item 2 "Reuse merged architecture documentation"; confirm via Q1)
- "PR #2072 is an active collision holding the release topology slice" (HANDOFF_LOG block PR2072-M7-SERVED-REVISION, last updated 2026-10-14) → #2072 merged 2026-10-15 15:52:01 UTC by cheekhimself at head `c7838ccb`, final holder Claude; the log block is stale (verified on GitHub 2026-10-22)
- Role wording "Chemdawg owns merge" (AGENTS.md text) → "Grok 91 routes and merges in practice; GDP retired 2026-09-29" (CURRENT_STATE "Start here", which says it supersedes stale OWNERSHIP.md rows)
- "npm compatibility may remain" (task text) → `#1873` deleted `package-lock.json`; `bun.lock` is the only lockfile (contract AC-8.1, stamp of 2026-10-14). Verify at the current tip before writing it.

## 8. Data & facts (exact)
Values are observations dated 2026-10-22 unless a row says otherwise. A later value verified from source or GitHub supersedes a row: record it with its date and keep the old one as history. Never round or re-estimate.

| Item | Value |
|---|---|
| Repository | `Verdant-OS/verdant-grow-diary` |
| Deploy branch | `verdant-grow-diary` (never `main`) |
| Deploy tip measured this session | `ebaf1b6afa7fb8cfa7fb8090914c8633f7537a98` (#2318), local HEAD equal to `origin/verdant-grow-diary` after fetch, 2026-10-22 |
| Session working branch | `claude/amhandoff-dt7n5x`; first commit `ab6064171b1bd59b04d3ed54aa2a55010a9f61cc` (this file); draft PR #2336 opened 2026-10-22 09:23 UTC; later commits on the same PR carry review fixes |
| Sentinel-Version | `2026-10-13.1` |
| Existing contract | `docs/architecture-contract.md`, 1,730 lines, title "Verdant — Current Architecture Contract", "Verified from source at: `c8523adccc81f18e0cf7118a69dc31493d273c4c` (deploy branch, `#2079`), 2026-10-14, by Claude"; sections 0–15 incl. §11 Enforcement map, §12 Rejected alternatives, §13 Deferred, §14 What this contract does not settle, §15 Amending this contract |
| Existing topology spec | `docs/specs/release-topology-specification.md`, title "Authoritative Release Topology Specification", author Claude, independent reviewer Grok (Critical Mass for the 2026-10-06 amendment); founding measurement 2026-09-25; amendments 2026-09-25, 09-26 (§2.5), 10-06 (§2.6), 10-07 (§2.7, Appendix E), 10-08 (§2.8), 10-13 (§2.9), 10-14 Worker host-routing |
| Last commit touching both docs | `c873fce`, 2026-10-18, "fix(quick-log): open plant harvest and photo on the shared activity (#2013) (#2081)" |
| PR #2072 (topology spec) | MERGED 2026-10-15 15:52:01 UTC by cheekhimself, head `c7838ccb42f14e8f00dc4be5d8a8e629433897a6`, branch `claude/release-topology-worker-routing`, final holder Claude (verified on GitHub 2026-10-22). Files: `docs/specs/release-topology-specification.md`, `docs/architecture-contract.md` (one cite), `docs/agents/HANDOFF_LOG.md`. HANDOFF_LOG at tip still lists block PR2072-M7-SERVED-REVISION as OPEN (last_updated 2026-10-14 19:38 CT, claimed_by Codex); that block is stale and belongs in Closed |
| Other open HANDOFF_LOG blocks | PADDLE-WIRE-001-NORMALIZATION (P1, Codex, PR #2221); FIX-2171-PLANT-CREATE-INSERT-ERROR (PR #2192); QUICKLOG-EVENT-REQUEST-HASH-UTC (PR #1846); TIMELINE-GROW-DAY-2005 (PR #2079); FIX-2004-APP-DOCUMENT-TITLES (PR #2082); CLAUDE-CODE-ACTION-002 (P1, PR #1927); DASHBOARD-SINGLE-LOG-ENTRY (PR #1844) |
| Companion docs to reuse | `docs/architecture.md` (145 lines), `docs/codebase-map.md` (497 lines), `CLAUDE.md` "Codebase orientation" (counts measured at `f25f9ed`, #1020, 2026-08-21) |
| Required checks | 35 contexts from `ci.yml`; mirror `config/required-status-checks.json` (35 `required`, 7 `mustBeGreen`) |
| Production Supabase project | `knkwiiywfkbqznbxwqfh` (CURRENT_STATE 2026-10-15). `bzatgtgjvuojpoxcknaa` is not production |
| Live host for any smoke | `https://verdantgrowdiary.com` only; smoke records tagged `[smoke <timestamp>]` |
| Standing gates (CURRENT_STATE "Start here") | No Publish; knk production DB lock; HOLD #1250 (`migration-drift-probe.yml`, `money-migration-drift-alert.yml`, their two tests); never merge #1740; migration PRs held for Matthew; Vercel "Account is blocked." status is not a regression |
| Claude's standing grants | VER-216, Matthew 2026-10-20 ~17:05 UTC: bounded merge via queue only at one exact head with 35/35 green, PASS from Codex or Matthew, no open blocking threads, no conflict; test-pin receipts; security patch bumps; housekeeping; PR comments covered |
| Validation commands | `bun run typecheck`; `bun run typecheck:tsgo`; `bunx vitest run <file> --reporter=dot`; `bun run lint`; `node scripts/check-sentinel-version-parity.mjs <base>` if a governance file changes |
| Check-in rule | arm any delayed self check-in at 55 minutes or less |
| Session eta plugin | calibration 0/5, estimates not yet reliable |

## 9. People, terms & names
- **People:** Matthew Cheek (Cheek, Cheeko) = owner, publish and production decisions. Codex = peer agent; holds PADDLE-WIRE-001 (PR #2221). #2072 merged 2026-10-15 at head `c7838ccb`; final holder was Claude (see section 8). Grok 91 = merge-queue owner in practice, named independent reviewer for this deliverable. Blue Dream, Durban Poison = reviewers for .tsx, auth, RLS, DB, Edge. Critical Mass = reviewer for lib, tests, docs-only. Graft = docs-only/low-risk exact-head reviewer. Chemdawg, GDP = older names for the merge seat (GDP retired 2026-09-29). Lovable = platform preset vendor and the AI gateway named in the task.
- **Terms & nicknames:** One-Tent Loop = the product spine Grow → Tent → Plant → Quick Log → Timeline → Sensor Snapshot → AI Doctor → Alert → Action Queue. SENTINEL_ACK = mandatory startup block. "Exact head" / "exact-head PASS" = review tied to one SHA, void once the head moves. VER-216 = the Linear/issue reference carrying Claude's grants. Optimal Tech Stack Evaluation = an earlier document the deliverable must correct (location not given in this chat; see Q4). KEEP account = the customer account never to touch in smoke.
- **Names in use:** `docs/architecture-contract.md`; `docs/specs/release-topology-specification.md`; `docs/agents/CURRENT_STATE.md`; `docs/agents/HANDOFF_LOG.md`; `docs/agents/OWNERSHIP.md`; `docs/production-only-verification-runbook.md`; `src/lib/entitlements/*`; `quicklog_save_manual`; `applyQuickLogV2Refresh`; `verdant:entry-created`; `src/lib/appRouteManifest.ts`; `src/lib/react-router-compat.tsx`; branch pattern `<agent>/<kebab-slice-name>`; commit pattern `fix(scope): … (#PR)`.

## 10. Work state
| Item | Status | Version / location | Notes |
|---|---|---|---|
| SENTINEL startup gate | done this session | reply in the previous chat | CURRENT_STATE read in part (size 456 KB), stated truthfully |
| Collision audit (rule 1) | not started | — | HANDOFF_LOG read; GitHub queried only for #2072 (merged) and #2336. Open and recently merged PR lists not yet queried |
| Current Architecture Contract | exists, needs re-verification at tip | `docs/architecture-contract.md`, stamped `c8523adc` (#2079), 2026-10-14 | 10 first-parent merges since the stamp (#2081 … #2318 per `git log`); re-read citations per its §15 process |
| Release Topology Specification | exists; last amendment #2072 merged 2026-10-15 | `docs/specs/release-topology-specification.md` | No known open PR touches it as of 2026-10-22. Rule 2 still requires a fresh collision audit and a separate approved slice before amending |
| 13-section deliverable | not started | — | — |
| Corrections to the Optimal Tech Stack Evaluation | not started | document not located | Q4 |
| This handoff | final, committed | `handoff-verdant-architecture-contract.md`, `claude/amhandoff-dt7n5x`, draft PR #2336 | Review fixes from Copilot's six P2 findings are in the PR's second commit |
| `.gitignore` | pre-existing local edit | adds `.simple-workflow/` lines | plugin-made; leave alone or discard |

## 11. Next steps
1. **Next action:** after SENTINEL_ACK, answer Q1 by evidence: run the collision audit the task mandates. Query open and recently merged PRs on `Verdant-OS/verdant-grow-diary` (GitHub MCP `list_pull_requests` / `search_pull_requests`; `gh` is unavailable in this environment) for the six areas in rule 1, and confirm nothing newer than #2072 (merged 2026-10-15) touches the two documents. Record each as PASS / FAIL / BLOCKED / NOT_MEASURED.
2. If no competing contract work is open, re-verify `docs/architecture-contract.md` at the current deploy tip following its own §15 amendment process (diff `c8523adc..<tip>`, re-read every citation into a changed file, re-measure the §3/§4/§10 counts by script), on a new branch `claude/<kebab-slice-name>` with a draft PR. Register a block for that branch in `docs/agents/HANDOFF_LOG.md` when the draft PR opens, and move the stale PR2072-M7-SERVED-REVISION block to Closed in the same edit.
3. Write the 13-section deliverable; label every claim; verify the eight rule-8 conclusions from source, citing `file:line` at the tip.
4. Release topology slice: a separate approved slice. #2072 merged 2026-10-15, so no known PR holds the spec; confirm with the step 1 audit, then amend `docs/specs/release-topology-specification.md` rather than create a new file.
5. Hand off to Grok with the exact head SHA and the 13 sections; end with one calibrated verdict.

## 12. Open questions ⚠️
- **Q1 (scope):** the task says "Create" both documents, but both exist. Options: (a) re-verify and amend the existing files in place at the current tip (recommended; matches scope item 2); (b) write a new consolidated contract that supersedes them; (c) skip, flag it in the file.
- **Q2 (billing source of truth):** task persona text says "public.billing_subscriptions is the entitlement source of truth"; `AGENTS.md` says "`public.subscriptions` is the sole billing entitlement source of truth" and "`public.billing_subscriptions` is a legacy sandbox/operator-audit surface only. It must never grant an entitlement." Options: (a) follow `AGENTS.md` and verify from migrations and `src/lib/entitlements` (recommended); (b) the persona text is correct and `AGENTS.md` is stale; (c) skip, flag it in the file.
- **Q3 (reviewer seat):** task names Grok as independent reviewer; CURRENT_STATE routes docs-only PRs to Critical Mass or Graft, and the 2026-10-06 topology amendment used Critical Mass. Options: (a) Grok 91 as named; (b) Critical Mass per current routing; (c) skip, flag it in the file.
- **Q4 (missing input):** where is the "Optimal Tech Stack Evaluation" the deliverable must correct? Not in this chat; not located in the repo in this session. Options: user supplies the path or document; or search `docs/` for it first.

## 13. Re-attach checklist
Nothing to attach from this chat. Before `SENTINEL_ACK`, read only the four startup files: `AGENTS.md`, `docs/agents/roles/claude.md`, `docs/agents/CURRENT_STATE.md` ("Start here" at minimum), `docs/agents/HANDOFF_LOG.md` (Open blocks). After the acknowledgment and the collision audit, read `docs/architecture-contract.md` §0, §12–§15. The one input not in the repository is the Optimal Tech Stack Evaluation (Q4).

---
<sub>Audit: 13/13 sections · 20 rules · 0 corrections · 18 data points · secrets removed: none found · generated by active-memory</sub>

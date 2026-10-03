# Checkout and Credits Audit 2026-10-03

**Audited by:** Claude (Knowledge Library and Product Specification Architect), peer-observation capacity
**Measured against:** `verdant-grow-diary` deploy tip **`80176ba`** (#1864)
**Measurements taken:** 2026-10-03, read-only, in a Claude Code remote session
**Independent reviewer seat:** Grok (Claude touched this audit and cannot give its PASS)

This document is a **read-only peer audit**. It changes no product code, schema, policy, migration, or
governance file, and it carries no `Sentinel-Version` (it is not one of the twelve). Status words are
used literally: PASS, FAIL, BLOCKED, NOT_MEASURED, NOT_APPLICABLE, plus HOLD, GAP and OBSERVATION where
a page needed them. It was published first as a claude.ai page and committed here, unchanged in
substance, so the independent reviewer can read it from the repository.

---
_Verdant Grow Diary · peer audit by Claude · for independent review by Grok_

# Checkout return honesty, the Free export boundary and a credits visibility spec, audited at the deploy tip

Three read-only audits from the agent prompt deck (prompts 27, 28 and 29), run against the deploy branch on 2026-10-03. Every row cites the file and line it was read from. No code, copy, SQL or documentation was changed, and the open export PR was not touched. Claude's findings are peer observations; Grok supplies the independent verdict. Third page in the money series; the first two are linked in the footer.

- **Branch and tip:** verdant-grow-diary at `80176ba` (#1864)
- **Method:** Source reads and greps only. No live site, Paddle, Supabase or analytics access.
- **Status vocabulary:** PASS · FAIL · NOT_MEASURED · OBSERVATION
- **Locks in force:** HOLD #1250, production database lock, publishing stop. Unchanged.

> **Calibrated verdict.** Checkout return is already honest end to end, with one weak fallback in Settings. The Free export boundary is enforced server-side and the open PR only pins it; what remains is defining "Limited" in copy and an owner decision on raw backups. Credits visibility is a small, safe slice that reuses existing select-own policies and is blocked only on an owner-approved read-only RPC.

## Audit 27 · Checkout return honesty

> **Prompt.** Trace checkout.success and checkout.cancel. What evidence does the client have that an entitling public.subscriptions row exists, and what does the grower see if the webhook is delayed or fails? Spec an honest pending state. No provider SDK, webhook or schema changes.

| Check | Status | Evidence |
| --- | --- | --- |
| Activation is claimed only from a server-resolved row | **PASS** | `confirmed` requires `!loading && !lookupFailed && entitlement.isActive && effectivePlanId !== "free"`, read through `useMyEntitlements` from `public.subscriptions`. `src/pages/CheckoutSuccess.tsx:59-64`. URL params feed only a sanitized returnTo (lines 69-80), never a success claim. |
| Delayed webhook has an honest pending state | **PASS** | “Confirming your checkout… We're confirming your Verdant plan with the payment provider. This usually takes a few seconds while the billing webhook is processed.” Bounded poll: 1,500 ms interval, 30,000 ms window, at most 20 refetches (lines 49-56). After exhaustion: “Still working on it — tap Check status to refresh, or head to Settings to see your plan.” |
| A failed lookup is not shown as "not entitled" | **PASS** | “We couldn't verify your plan. Your plan has not been changed. Retry the check, or open Settings…” The hook's `refetch` resolves to whether the lookup failed, and the page branches on it rather than on completion. |
| Arrival with no checkout context | **PASS** | “No recent checkout found… If you did just upgrade, your access is confirmed by the payment provider — tap Check status, or open Settings.” The page still polls quietly so a storage-blocked buyer upgrades to confirmed when the webhook lands. |
| Credit-pack return | **PASS** | “Top-up credits are added server-side by the billing webhook, usually within a few seconds.” (line 247) |
| Cancel page | **PASS** | “Checkout was not completed. No charge was made.” “Your grow diary stays on the Free tier until you complete a purchase.” Plan choice is preserved for retry. `src/pages/CheckoutCancel.tsx:29-80` |
| Webhook writes the row | **PASS** by source | `supabase/functions/payments-webhook/index.ts` verifies the HMAC signature before parsing (line 316), upserts `subscriptions` on `paddle_subscription_id` (139-142), and treats an already-processed event id as a 200 no-op (15-16, 61-64). Live delivery latency is NOT_MEASURED. |
| Settings as the fallback destination | **OBSERVATION** | Both the poll-exhausted and lookup-failed states send the grower to Settings, but Settings has no "activation pending" row. A webhook delay beyond 30 seconds leaves them reading "Free" there with no explanation. One pinned line on the Settings plan card, shown when a checkout marker is present and the plan still resolves Free, would close it. |

The pending state the prompt asked for already exists. No new spec is needed beyond the Settings observation.

## Audit 28 · Free export boundary

> **Prompt.** Read the open block CHEM-FREE-LIMITED-EXPORT-CONTRACT-001 and the advancedExports capability. Propose which export formats stay Free as acquisition and which gate to Pro, with the retention rationale and the exact copy for the gated state. Report the block's current claim and do not touch its branch.

| Item | Status | Evidence |
| --- | --- | --- |
| Open block claim | **CODEX HOLDS** | Branch `codex/chem-free-limited-export-contract-001`, PR 1790 at `13499d8`, claimed_by Codex 2026-09-28 21:28 CT, last_updated 22:13 CT. All 35 required checks SUCCESS; waiting on Blue Dream acceptance. Adds one test file only (`src/test/free-limited-export-contract.test.tsx`), no product-terms change. Not touched. |
| What Free keeps today | **PASS** | The basic grow diary PDF from `src/lib/growDiaryPdfExport.ts`, built without a paid preflight, with bounded recent events and honest "unavailable" totals instead of invented charts (the four test cases in PR 1790 pin exactly this). CSV sensor import is Free. The pricing table calls the tier “Limited”. |
| What Pro and above gate | **PASS** | Five features in the server allowlist of `premium-export-entitlement`: `ai_doctor_report`, `ai_doctor_evidence_csv`, `ai_doctor_report_package`, `diary_range_report`, `post_grow_report` (lines 37-43). Each checks `capabilities.advancedExports` server-side (line 196); the client hint only prevents a content flash (`PostGrowLearningReport.tsx:200-205`). |
| "Limited" is defined for the grower | **OBSERVATION** | The word appears in the comparison table with no definition anywhere on the page. A grower cannot tell what they get on Free. |

### Recommended line, as a spec not a change

- **Keep Free:** the basic grow PDF and CSV import. They are acquisition and the proof behind the trust strip's “Your history is always yours”. A Free grower who cannot get their own diary out contradicts the pricing FAQ's ownership answer.
- **Keep Pro:** the five allowlisted features. They are analysis products, not raw data access, so gating them does not break the ownership promise. Retention rationale: these are the surfaces a grower returns to after a harvest, which is when renewal is decided.
- **Copy to pin:** replace “Limited” with “Basic grow PDF; advanced reports and evidence exports on Pro”, as one constant in `src/constants/pricing.ts` with its test pin. Gated-state copy on the three report pages already routes through PaywallCta and needs no change.
- **Open question for Matthew:** a plain JSON or CSV backup of all logs sits under Pro (“Export / backups”) but is the strongest ownership signal in the product. Moving a plain backup to Free would cost little revenue and strengthen the trust story. Product-terms decision, not an agent decision.

## Audit 29 · Credits visibility, read-only spec

> **Prompt.** Design a read-only view that shows a grower AI credits used and remaining for the current UTC month, the reset time, and the last five debits and refunds. Spec the RPC shape, the RLS it relies on, and the presentation-only client read. Write no SQL and no migration.

| Finding | Status | Evidence |
| --- | --- | --- |
| Feasible without schema or RLS changes | **PASS** | `ai_credit_spends` and `ai_credit_grants` already carry select-own policies and GRANT SELECT to authenticated. Refund rows are negative-weight rows in the same ledger, so history and net usage are readable today. |
| A client-side computation already exists | **OBSERVATION** | `src/hooks/useAlertDoctorCreditGateReads.ts` sums per-grow allowance usage client-side, mirrors the `funded_by IS DISTINCT FROM 'pack'` rule, and deliberately refuses to mirror the pack arm because the server's environment scoping is a drift magnet. It is presentation-only and never gates a spend. |
| What is missing | **GAP** | No authoritative server read of the numbers the spend receipt returns. “Remaining” is visible only in the moment after a spend, through `AiCreditRemainingBadge` fed by the `credit` payload. Settings shows no credit row at all. |

### Specification

| Element | Shape |
| --- | --- |
| RPC | `ai_credit_balance(p_grow_id uuid default null)`. `SECURITY INVOKER`, `STABLE`, executable by authenticated and service_role; revoked from anon and PUBLIC. Resolves `auth.uid()` only; there is no user id parameter, so a client cannot read another account. |
| Returns | One JSON object: `plan_id`, `scope` (per_grow or per_month), `scope_limit`, `scope_used`, `remaining`, `period_key`, `resets_at` (first instant of the next UTC month), `pack_balance`, and `last_events`: the five most recent spend and refund rows as created_at, feature, weight, status, funded_by. Never `result` or `meta` payloads. |
| Logic | Reuse the plan-resolution and allowance branches of `ai_credit_spend` verbatim, read-only, for the server-resolved billing environment. With a grow id, return the per-grow scope for Free; without one on a per-grow plan, return `grow_id_required: true` rather than guessing. Staff resolve exactly as the spend RPC resolves them. |
| RLS | None new. The function reads only rows the caller owns under the existing policies. Because it is `SECURITY INVOKER`, RLS applies inside it. |
| Client | One `useAiCreditBalance` hook (React Query, staleTime 30 s, refetch after any AI call) and one pure `aiCreditBalanceViewModel`. Presentation-only, fail-closed to a hidden state on error, no CTA, no urgency language. Surfaces: Settings plan card, Plant Detail header beside the existing badge, Coach. |
| Tests | Red-first. View model: negative remaining clamps to 0, unknown scope hides, refund rows net correctly, reset instant is UTC month start. Contract test: the hook never computes remaining itself. Runtime harness case in `run-ai-credits-rls-harness.ts`: an authenticated client cannot read another user's balance. |
| Out of scope | No SQL in this slice. The RPC sits under the Supabase lock, so the spec goes to Matthew for approval before any migration is written. No change to `ai_credit_spend`, refunds, grants or the badge. |

## Independent review checklist for Grok

1. Confirm `CheckoutSuccess.tsx:64` is the only path to the confirmed view and that no URL parameter can reach it.
2. Judge whether the Settings fallback gap (no "activation pending" row) is worth one pinned line, or acceptable as is.
3. Confirm the five-feature allowlist in `premium-export-entitlement` is the complete set of gated exports, and that the basic grow PDF never calls it.
4. Advise Matthew on the raw backup question: Free or Pro. Claude recommends Free; it is a product-terms decision.
5. Review the `ai_credit_balance` spec for drift risk against `ai_credit_spend`. If you would rather expose a view than a function, say so; the client contract does not change.
6. Record your verdict at this exact tip, `80176ba`. Claude touched this audit and cannot give it an independent PASS.

---

Prepared by Claude as peer observations on 2026-10-03 against verdant-grow-diary at 80176ba (#1864). Companion pages: [Billing Truth Audit](https://claude.ai/artifact/JvzUc1Fg1Gj72EcYqwwU3A) and [Pricing Copy Audit](https://claude.ai/artifact/XjfJ5cE4SWNiZYyUoapgVx). Sources: src/pages/CheckoutSuccess.tsx and CheckoutCancel.tsx, src/hooks/useMyEntitlements.ts, supabase/functions/payments-webhook/index.ts, supabase/functions/premium-export-entitlement/index.ts, src/lib/growDiaryPdfExport.ts, src/pages/PostGrowLearningReport.tsx, src/hooks/useAlertDoctorCreditGateReads.ts, src/lib/aiCreditRemainingBadgeViewModel.ts, migrations 20260728090736 and 20260727050000, docs/agents/HANDOFF_LOG.md block CHEM-FREE-LIMITED-EXPORT-CONTRACT-001. No Publish, SQL apply, charge, role change, device control or Action Queue operation is authorized by this page.

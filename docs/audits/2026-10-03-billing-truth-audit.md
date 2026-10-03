# Billing Truth Audit 2026-10-03

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

# Billing truth, AI credit metering and memory-chain cost, audited at the deploy tip

Three read-only audits from the agent prompt deck (prompts 21, 23 and 43), run against the deploy branch on 2026-10-03. Every row cites the file and line it was read from. No code, SQL, config or documentation was changed. Claude's findings are peer observations; Grok supplies the independent verdict.

- **Branch and tip:** verdant-grow-diary at `80176ba` (#1864)
- **Method:** Source reads and greps only. No production, Supabase, payments or analytics access.
- **Status vocabulary:** PASS · FAIL · BLOCKED · NOT_MEASURED · OBSERVATION
- **Legend:** In Audit 43, the Disposition column holds proposed archival actions, not status words. KEEP means it stays in CURRENT_STATE. MOVE means verbatim to the archive. RELOCATE means to docs/. TRIAGE means a per-row owner pass is needed. POLICY means it waits on an owner rule.
- **Locks in force:** HOLD #1250, production database lock, publishing stop. Unchanged.

> **Calibrated verdict.** Billing truth and credit metering PASS at source level. One letter-of-the-rule gap: the compatibility environment resolver can treat sandbox as expected without an explicit PAYMENTS_ENVIRONMENT. The runtime harness is BLOCKED here. The memory chain is the measured cost problem; the archival wins available under current policy are small, and the real lever needs an owner decision.

## Audit 21 · Entitlement chain

> **Prompt.** Map the entitlement chain from public.subscriptions through src/lib/entitlements to the UI. Confirm profiles.tier grants nothing, billing_subscriptions grants nothing, sandbox rows only count when PAYMENTS_ENVIRONMENT=sandbox is server-resolved, and absence resolves to Free.

| Rule (AGENTS.md) | Status | Evidence |
| --- | --- | --- |
| public.subscriptions is the only entitlement read | **PASS** | `src/hooks/useMyEntitlements.ts:10-13` states the canonical lane and reads only `subscriptions`; `supabase/functions/_shared/unionEntitlementLookup.ts:1-9` does the same server-side. Both pass `byoRow: null`. |
| profiles.tier is never used as billing | **PASS** | No reference to `profiles` or `.tier` in `src/lib/entitlements/*`, the hook, the server lookup, `ai-doctor-review` or `ai-coach`. |
| billing_subscriptions never grants an entitlement | **PASS** with **OBSERVATION** | No live caller supplies a row. The pure picker `src/lib/entitlements/unionEntitlements.ts:52-76` still accepts a `byoRow` and would let it win, and `src/lib/entitlements/types.ts:17` still documents the row as a mirror of `billing_subscriptions`. Dead today, re-enableable by a single future caller. |
| Absence of an entitling row resolves to Free | **PASS** | `src/lib/entitlements/resolveEntitlements.ts:95-104`, reason `null_row_free`. Unknown plan or status also falls to Free. |
| Sandbox rows grant access only when the server explicitly resolved sandbox | **PASS** AI and DB gates **FAIL** by letter, other gates | AI Doctor, AI Coach, cultivar QA and referral use `resolveRequiredServerBillingEnvironment`, which refuses to infer. DB gates (migration `20260728050000`) consider `environment='live'` only. The compatibility resolver at `supabase/functions/_shared/unionEntitlementLookup.ts:56-62` infers sandbox from Paddle key presence and defaults to sandbox when nothing is set; it feeds live-sensor, premium-export, environment-summary, pheno-tracker and the three ingest functions. Whether production sets PAYMENTS_ENVIRONMENT is NOT_MEASURED, so impact is unknown. |
| Founder Lifetime is Pro-like with capped AI, never unlimited | **PASS** | `planCatalog.ts` pins `aiMonthlyCredits: 100`; the adapter requires price `founder_lifetime`, status active, subscription id prefix `lifetime_` and a null period end, all four together. |
| Client entitlement reads are presentation-only | **PASS** | Hook header says so; cost gates re-check server-side (see Audit 23). |

### Observations for the reviewer

- **Staff lift mismatch.** `resolveEntitlements.ts` describes the staff lift as presentation-only with AI "enforced server-side at the Pro monthly cap". The spend RPC (migration `20260728090736:256-262`) grants staff 10,000 credits per month under plan id `staff`. Documentation and code disagree; no customer-facing grant is involved.
- **Constitution omits Craft.** AGENTS.md lists Free, Pro monthly, Pro annual and Founder. The catalog and the allowance function also carry `craft_monthly` and `craft_annual` at 300 credits per month. Doc drift, not a defect.
- **Hardening spec, if assigned:** remove the `byoRow` parameter from `pickStrongestBilling` and `resolveUnionEntitlements`, retire the mirror comment in `types.ts`, and route the seven compatibility-resolver callers through the strict resolver with an explicit fail-closed branch. Out of scope here.

## Audit 23 · AI credit metering

> **Prompt.** Audit credit enforcement for ai-doctor-review and ai-coach: Free 3 per grow, Pro monthly, Pro annual and Founder 100 per UTC calendar month, server-side check before the model call, client unable to set user_id, weight, tier or plan, append-only refund rows on failed calls.

| Check | Status | Evidence |
| --- | --- | --- |
| Free 3 per grow; Pro and Founder 100 per UTC month | **PASS** | `ai_credit_allowance` in migration `20260721194118:15-38`. Period key is `to_char(now() AT TIME ZONE 'UTC','YYYY-MM')` (`20260728090736:54`). Craft 300. |
| Server-side check before the model call | **PASS** | `supabase/functions/ai-doctor-review/index.ts:411` and `ai-coach/index.ts:301` call `ai_credit_spend` before any upstream request. |
| Client cannot set user_id, weight, model tier or plan | **PASS** | User id from `supabase.auth.getUser()` (`supabase/functions/ai-doctor-review/index.ts:290`, `supabase/functions/ai-coach/index.ts:269`). `MODEL_TIER` is a server constant (`ai-doctor-review/index.ts:70`, `ai-coach/index.ts:149`). Weight is computed inside the RPC. The RPC re-reads the plan from `subscriptions` and `has_role`; it never trusts a client plan. |
| Spend RPC is service-only and race-safe | **PASS** by source | `SECURITY DEFINER`, `pg_advisory_xact_lock(hashtext(uid))` at migration `20260728090736` line 94, legacy signatures revoked from PUBLIC, anon, authenticated and service_role (same migration, lines 392-408). |
| Failed calls refund via append-only reversal rows | **PASS** | `ai_credit_refund` (migration `20260727050000:420-434`) inserts a row with `-weight`, status `refunded`, `refund_of` set; idempotent by key; executable by service_role only. |
| Ledger: select-own, no client writes | **PASS** | Policy `ai_credit_spends_select_own`; GRANT SELECT to authenticated, ALL to service_role; no client insert, update or delete policy. |
| Append-only enforced mechanically | **NOT_MEASURED** | Append-only is stated in five migration comments and enforced by RLS plus convention. No UPDATE or DELETE-blocking trigger on `ai_credit_spends` was found; service_role holds ALL. |
| Denials are calm, expected responses | **PASS** | `calmFailure("credit_denied", { credit })` at `supabase/functions/ai-doctor-review/index.ts:469`. |
| Runtime RLS and race harness | **BLOCKED** | `scripts/run-ai-credits-rls-harness.ts:35-45` needs SUPABASE_URL and a service role key. Neither is present in this session. Race behavior is therefore NOT_MEASURED at runtime. |

### Observations for the reviewer

- **Ambiguity fails closed.** If PAYMENTS_ENVIRONMENT is unset or invalid, AI calls refuse instead of overgranting. That is the right direction. A misconfiguration would read to growers as an outage, so it belongs on the release-packet checklist.
- **Legacy client-body environment helper** `pickExpectedBillingEnvironment` is kept for tests and marked deprecated. Confirm no production caller remains.

## Audit 43 · Memory-chain token budget

> **Prompt.** Measure the governance and operating files in bytes and estimated tokens. Identify superseded observations in CURRENT_STATE.md that can move verbatim to CURRENT_STATE_ARCHIVE.md without losing a standing lock, the production reference rows, or any open block. Propose the move; edit nothing.

Token estimates use the ratio CLAUDE.md itself measured on 2026-08-21: 153,142 bytes to about 27,400 tokens, roughly 5.6 bytes per token. Treat them as estimates.

| File | Bytes | Est. tokens | When loaded |
| --- | --- | --- | --- |
| CLAUDE.md + AGENTS.md + roles/claude.md | 75,638 | ~13,500 | Every Claude turn, automatic import |
| GEMINI.md (mirrors AGENTS.md) | 42,473 | ~7,600 | Every Gemini turn |
| docs/agents/CURRENT_STATE.md | 371,131 | ~66,000 | Required read, once per session |
| docs/agents/HANDOFF_LOG.md | 107,978 | ~19,000 | Required read, once per session |
| Four required files, one Claude session | 554,747 | ~99,000 |  |
| docs/agents/CURRENT_STATE_ARCHIVE.md (not loaded) | 535,721 | ~96,000 | On demand only |

### Where the bytes sit in CURRENT_STATE.md

| Section | Bytes | Dates inside | Disposition |
| --- | --- | --- | --- |
| Production status (`docs/agents/CURRENT_STATE.md` line 1973) | 81,888 | 2026-08 only, 53 date stamps | **TRIAGE** Holds production rows; cannot move wholesale. The 2026-09-28 release measurement supersedes its tip and live rows. Needs per-row triage, owner-gated. |
| Follow-up observation chain, 25 sections (lines 5-170) | 59,995 | 2026-09-29 | **POLICY** Each supersedes parts of the one before. Archiving needs a keep-latest-N rule the archival spec does not yet grant. |
| Migration-drift alarm (line 1483) | 26,722 | 2026-08 | **KEEP** Open issue. |
| Function default-privilege exposure (line 1065) | 23,922 | 2026-08-21 | **KEEP** Open, "not yet actioned". |
| RESOLVED 2026-08-21 attributed signups (line 915) | 8,991 | 2026-08-13 to 21 | **MOVE** Terminal by its own header. |
| 2026-08-25 re-measure, served commit not in GitHub (line 748) | 5,471 | 2026-08-25 | **MOVE** Superseded by the 2026-09-28 live read that equalled the tip. |
| DIRTY PR conflict reconciliation (line 1927) | 5,366 | 2026-08-13 | **MOVE** Terminal; confirm no open PR still cites it. |
| MACAE external reference scope (line 3010) | 7,426 | 2026-08-22 | **RELOCATE** Reference material, not operating state. Belongs under docs/, not the archive. |

### Proposal

- **Movable now under the approved archival rule** (verified terminal disposition, verbatim, stamp line only): the three MOVE rows, 19,828 bytes, about 3,500 tokens per session. Small.
- **Needs an owner rule:** a keep-latest-N policy for the follow-up chain, and a per-row supersession pass on Production status. Together they are 141,883 bytes, about 25,000 tokens per session, and they are the only lever that materially changes cost.
- **CLAUDE.md citation is stale.** It still quotes the file at 153,142 bytes; it is now 2.4 times that. Correcting the number is a governance-file edit and bumps all twelve Sentinel versions, so bundle it with the next planned bump.
- HANDOFF_LOG.md open blocks: 30, all Codex-held, last_updated between 2026-09-28 18:46 and 2026-09-29 22:59 CT. Thirteen are CHEM-INVENTORY-REPAIR-001 sub-blocks that could collapse into one index block once their PRs close.

## Independent review checklist for Grok

1. Re-read `unionEntitlementLookup.ts:56-62` and decide whether the compatibility resolver's sandbox default is a FAIL against AGENTS.md's "explicitly resolved PAYMENTS_ENVIRONMENT=sandbox" wording or an accepted fail-safe. Claude rates it FAIL by letter, low risk in practice.
2. Confirm the staff 10,000 per month grant in the spend RPC is intended and that the resolver comment, not the RPC, is what should change.
3. Decide whether the dead `byoRow` path warrants a hardening slice now or a note in the architecture contract.
4. Run `scripts/run-ai-credits-rls-harness.ts` if you hold the credentials; Claude could not. Report races as measured, not inferred.
5. Approve or reject the three MOVE rows for Tranche 2 of the archival slice, and advise Matthew on a keep-latest-N rule for the follow-up chain.
6. Record your verdict at this exact tip, `80176ba`. Claude touched this audit and cannot give it an independent PASS.

---

Prepared by Claude as peer observations on 2026-10-03 against verdant-grow-diary at 80176ba (#1864). Sources: src/lib/entitlements/*, src/hooks/useMyEntitlements.ts, supabase/functions/_shared/unionEntitlementLookup.ts, supabase/functions/ai-doctor-review and ai-coach, migrations 20260721194118, 20260727050000, 20260728050000, 20260728090736, scripts/run-ai-credits-rls-harness.ts, docs/agents/CURRENT_STATE.md, HANDOFF_LOG.md and docs/specs/current-state-archival-slice.md. No Publish, SQL apply, charge, role change, device control or Action Queue operation is authorized by this page.

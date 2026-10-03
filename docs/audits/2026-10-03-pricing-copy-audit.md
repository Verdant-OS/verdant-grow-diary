# Pricing Copy Audit 2026-10-03

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

# Upgrade moments, Founder Lifetime truth and pricing copy drift, audited at the deploy tip

Three read-only audits from the agent prompt deck (prompts 24, 25 and 26), run against the deploy branch on 2026-10-03. Every row cites the file and line it was read from. No code, copy, SQL or documentation was changed. Claude's findings are peer observations; Grok supplies the independent verdict. Companion to the billing truth audit linked in the footer.

- **Branch and tip:** verdant-grow-diary at `80176ba` (#1864)
- **Method:** Source reads and greps only. No live site, Paddle or analytics access.
- **Status vocabulary:** PASS · FAIL · NOT_MEASURED · OBSERVATION
- **Locks in force:** HOLD #1250, production database lock, publishing stop. Unchanged.

> **Calibrated verdict.** Upgrade moments are honest and calm wherever a gate is actually enforced. One FAIL: the Founder refund footnote on the Pricing card promises reopened seats that the database never reopens. Pricing numbers agree with the catalog today, but they are hand-typed in six places plus one dead duplicate catalog, so "no business logic hardcoded in JSX" is a stated goal rather than a measured property.

## Audit 24 · Upgrade moments

> **Prompt.** Find every point where a Free grower meets a limit. For each, quote the exact denial copy, confirm it is a calm expected response rather than an error, and state what the grower is told they would gain. Spec better moments. Do not add paywall UI or edit PaywallCta.

| Limit met | Status | Copy and evidence |
| --- | --- | --- |
| AI Doctor or AI Coach credits, 3 per grow on Free | **PASS** | “You've used your AI Doctor checks for this grow.” “Free grows include 3 AI Doctor checks. Pro gives you 100 AI checks per month across every grow. This request was not charged.” CTA “See plans” to /pricing. Calm, names the gain, confirms no charge. `src/lib/aiCreditLimitNoticeViewModel.ts:81-99, 210` |
| Paid grower out of monthly credits | **PASS** | Separate “wait” variant: “Your monthly allowance resets on the 1st of the month (UTC). This request was not charged. Existing analyses stay available.” Plus a paid low-balance top-up path on Plant Detail (`src/components/PlantDetailAiDoctorLiveReview.tsx:567`). A paying user never sees an upsell (`src/lib/aiCreditLimitNoticeViewModel.ts:8`). |
| Second active grow | **PASS** | “Free includes 1 active grow. Archive a grow to start a new one, or upgrade to Pro for unlimited grows.” Pinned constant in `src/lib/entitlements/freeTierGates.ts`. Multi-row setup flows fail closed with “We couldn't verify your plan limits…” until the plan read settles; existing data is never touched. |
| Second tent | **PASS** | “Free includes a single tent. Upgrade to Pro for multi-tent support.” Same module. |
| Advanced exports and the three report pages | **PASS** | Client hint via `canUseCapability(entitlement, "advancedExports")`, server check in the premium-export function. PaywallCta renders “Upgrade to unlock this part of Verdant” with six concrete unlocks (`src/lib/paywallCtaViewModel.ts:54-68`). |
| Live sensor surfaces | **OBSERVATION** | Server-gated correctly and never trusts the client hook. The copy is “Upgrade required to use live sensor surfaces.” It names no plan, no price and no value. The weakest moment in the product. `src/hooks/useLiveSensorServerGate.ts:41` |
| Sensor history beyond 90 days | **NOT_MEASURED** | Pricing promises “90 days” Free versus “Full history” Pro. `freeTierGates.ts` states that history surfaces are row-limited and “nothing currently exceeds the free window by design”. No gate fires, so no upgrade moment exists for this row. |
| Pheno Tracker | **NOT_MEASURED** | `PhenoTrackerUpgradeGate.tsx` renders an upgrade card with a sanitized returnTo. Copy strings not pulled in this pass. |
| Settings plan card | **PASS** | Free sees “Upgrade to Pro” to /pricing; paid sees “Manage subscription”; Founder sees “nothing to cancel or renew”. `src/pages/Settings.tsx:405-428` |

### Spec notes, if a copy slice is assigned

- **Live sensor gate copy.** Replace the one-line denial with the PaywallCta view model, title “Live sensors are a Pro feature”, bullets drawn from `PRICING.pro.features`, CTA to /pricing with returnTo. Keep the server gate untouched. One pinned constant plus its test.
- **Credit notice names Pro only.** Acceptable for a Free grower, but “Pro gives you 100” should derive from `PLAN_CATALOG.pro_monthly.aiMonthlyCredits` rather than a literal.
- **Sensor history row.** Either enforce the 90-day window with `sensorHistoryWindowStartIso` on the first time-ranged history surface, or stop advertising a limit nothing enforces.

## Audit 25 · Founder Lifetime truth

> **Prompt.** Audit the Founder offer: src/routes/founder.tsx, planCatalog.ts and docs/founder-slots-remaining-response.md. Where does the slots-remaining number come from, is the AI credit cap stated, and does any copy imply unlimited AI or features beyond Pro-like access?

| Check | Status | Evidence |
| --- | --- | --- |
| Slots-remaining source | **PASS** | `useFounderSlotsRemaining` invokes the public `founder-slots-remaining` edge function, which proxies `founder_lifetime_slots_remaining()`: 100 minus a status-agnostic count of `public.founders` (migration `20260719052812:31-56`). Refunded or revoked seats stay consumed. On error the hook returns “unknown” and the card shows the static “First 100 only” badge. |
| AI cap stated, never unlimited | **PASS** | `FOUNDER_SAFETY_BOUNDARIES`: “100 AI Doctor credits per UTC calendar month; Founder credits are capped, never unlimited.” Repeated in the launch FAQ and the SEO FAQ. Catalog pins 100. |
| "Lifetime" is qualified | **PASS** | “for the life of the product” and “while Verdant remains available” on the launch page and FAQ; “Availability is confirmed at checkout; joining an email list does not reserve a spot.” |
| Refund footnote on the Pricing card | **FAIL** | “Founder Lifetime is currently sold out. Additional slots may open if a purchase is refunded.” The seat model is built so a refunded seat never re-enters the pool: the migration comment says the 100-cap “can never” reopen and the cap check “uses seats-consumed so refunds cannot reopen the pool” (`20260719052812:31-33, 60-61, 121-123`). The copy promises the opposite. `src/pages/Pricing.tsx:823` |
| Public visibility | **OBSERVATION** | Founder is retired from the public pricing grid and renders only on a `?plan=founder_lifetime` deep link (`src/pages/Pricing.tsx:298-309, 798-807`). Yet `/founder` remains a live public page with the CTA “Review Founder Lifetime — $129”, and the SEO FAQ still advertises the plan. Decide whether that is intended. Live sold-out state is NOT_MEASURED. |
| Features beyond Pro-like | **OBSERVATION** | Catalog grants Founder the Blueprint overlay (`planCatalog.ts`, `blueprint: true`) and the comparison table marks it included; `PRICING.founder.features` omits it. Under-promise, not harm. Nothing implies unlimited AI. |

## Audit 26 · Pricing copy versus the catalog

> **Prompt.** Compare /pricing, /upgrade and /billing.$plan against planCatalog.ts. Flag every price, credit count, limit or feature named in UI that is not derived from the catalog, and every catalog entry the UI omits.

Prices and feature lists live in `src/constants/pricing.ts`; capabilities and credit caps in `src/lib/entitlements/planCatalog.ts`; the authoritative allowance in the `ai_credit_allowance` SQL function. All three agree today. The findings below are about where copy is typed by hand and would silently drift.

| Surface | Status | Finding |
| --- | --- | --- |
| /upgrade and /billing/:plan | **PASS** | Both are redirects to /pricing with a preserved plan preselect (`LegacyUpgradeRedirect.tsx`, `LegacyBillingRedirect.tsx`). No copy of their own. |
| Second feature catalog | **OBSERVATION** | `src/config/pricing.ts` defines `PRICING_TIERS` with its own feature wording (“Date-range diary & post-grow reports” alongside “Date-range diary reports (PDF)”). Consumed by Settings and by `src/pages/Upgrade.tsx`, which no route imports. A dead page and a live duplicate. |
| Comparison table literals | **OBSERVATION** | “$0”, “$129 one-time”, “3 / grow”, “100 / month”, “300 / month”, “90 days” are typed in `COMPARISON_ROWS` (`src/pages/Pricing.tsx:70-164`), not read from the catalog. Values match today. |
| Pro JSON-LD product description | **OBSERVATION** | “100 AI Doctor credits/month” literal; the offer price itself is derived. `src/pages/Pricing.tsx:529` |
| Credit-limit notice | **OBSERVATION** | “3 AI Doctor checks” and “100 AI checks per month” literals in `aiCreditLimitNoticeViewModel.ts:83, 95`. Omits Craft. |
| Public SEO FAQ | **OBSERVATION** | “Free includes 3… Pro Monthly, Pro Annual, and Founder Lifetime each include 100” (`src/constants/verdantSeoCopy.ts:191`). Literal, omits Craft, names a plan not publicly purchasable. |
| Annual savings percentages | **PASS** | Pro 99 against 144 is 31 percent; Craft 249 against 348 is 28 percent. Both match `annualSavingsPercent`. |
| Credit pack copy | **PASS** | “50 for $9, 150 for $19” equals `CREDIT_PACKS`. Live Paddle prices are resolved by `get-paddle-price` and NOT_MEASURED here. |
| Free "90 days" sensor history | **OBSERVATION** | Matches `sensorHistoryDays: 90` in the catalog, but nothing enforces it (Audit 24). Copy ahead of code. |
| Staff copy in Settings | **PASS** | “Internal staff — Pro capabilities, 10,000 AI credits/month” matches the spend RPC. The `isStaff` comment in `src/lib/entitlements/types.ts` claiming a Pro cap is the outlier (billing audit, Audit 21). |
| Catalog entries the UI omits | **PASS** | None are omitted. Every plan id and capability in `planCatalog.ts` has a UI representation; Founder's Blueprint is the only under-stated one. |

### Spec note

- A single-source slice would derive the comparison rows, JSON-LD description, credit-limit notice and SEO FAQ from `PLAN_CATALOG` and `PRICING`, delete `src/pages/Upgrade.tsx`, and fold `src/config/pricing.ts` into `constants/pricing.ts`. Each literal is test-pinned, so the pins move in the same commit. No price or entitlement changes.

## Independent review checklist for Grok

1. Confirm the Founder refund footnote FAIL by reading `20260719052812` lines 31-33 and 121-123 against `Pricing.tsx:823`. If confirmed, it is a copy fix with a test pin, not a schema change.
2. Decide whether `/founder` staying public while the plan is off the grid is intended. If not, that is a product decision for Matthew, not a copy fix.
3. Judge whether the live sensor denial copy is acceptable as is or should route through PaywallCta.
4. Rule on the 90-day sensor history row: enforce it or stop advertising it.
5. Confirm no route imports `src/pages/Upgrade.tsx` and approve its deletion with the duplicate catalog fold-in as one slice.
6. Record your verdict at this exact tip, `80176ba`. Claude touched this audit and cannot give it an independent PASS.

---

Prepared by Claude as peer observations on 2026-10-03 against verdant-grow-diary at 80176ba (#1864). Companion page: [Billing Truth Audit 2026-10-03](https://claude.ai/artifact/JvzUc1Fg1Gj72EcYqwwU3A). Sources: src/constants/pricing.ts, src/config/pricing.ts, src/pages/Pricing.tsx, src/routes/founder.tsx (which renders src/pages/Founder.tsx), src/pages/Settings.tsx, the legacy redirect pages, src/lib/entitlements/freeTierGates.ts and planCatalog.ts, aiCreditLimitNoticeViewModel.ts, paywallCtaViewModel.ts, useLiveSensorServerGate.ts, useFounderSlotsRemaining.ts, founderLaunchCopy.ts, verdantSeoCopy.ts, migration 20260719052812, docs/founder-slots-remaining-response.md. No Publish, SQL apply, charge, role change, device control or Action Queue operation is authorized by this page.

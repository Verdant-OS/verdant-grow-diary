# Verdant Payments Wiring — Scope Decision + Phased Plan

## Situation

Two Paddle systems now exist in this project:

**A. Existing BYO Paddle stack** (production-grade, already reviewed):
- `public.billing_subscriptions` + RLS + subscription update RPCs + audit tables
- `supabase/functions/paddle-webhook/` (raw-body signature verify, idempotent `paddle_events`)
- Operator audit pages: `/operator/paddle-processing`, `/operator/billing-subscription-updates`, `/operator/billing-entitlement-resolution`
- `src/lib/entitlements/` resolver, `useMyEntitlements`, server-side gates (`premium-export-entitlement`, `live-sensor-entitlement`, `environment-summary-report-entitlement`)
- `src/pages/Pricing.tsx`, `src/pages/Upgrade.tsx`, `PaywallCta`, `PricingCard`, `src/constants/pricing.ts`
- `docs/billing-level-two-launch-gate.md` — explicit gate: **sandbox only, no live**

**B. Lovable built-in Paddle** (enabled last turn):
- Would create its own `public.subscriptions` table (different schema)
- Its own `payments-webhook` edge function
- Its own product catalog managed via `create_product`/`create_price`
- Client token in `.env.development` / `.env.production`

**Ripping out (A) or running both in parallel are both dangerous** and both violate your workspace rules (no schema/RLS/Edge changes not requested, no silent expansion, sensor-truth-style safety over velocity).

---

## Recommended path — three explicit phases

### Phase 1 (this slice, SAFE, no backend writes)
Ship the customer-facing surface using Lovable built-in Paddle in **test mode only**, without touching the existing billing DB layer.

1. **Create test products** via `create_product` / `batch_create_product`:
   - `pro_monthly` — $12/month recurring
   - `pro_annual` — $99/year recurring
   - `founder_lifetime` — $129 one-time (Paddle has no built-in "first 75" cap; add manual-cutoff copy + document manual process)
2. **Add Paddle.js client helpers**: `src/lib/paddle.ts`, `usePaddleCheckout` hook, `PaymentTestModeBanner` at the top of `App.tsx` (renders nothing in production build).
3. **Add `get-paddle-price` edge function** to resolve human-readable IDs → Paddle internal IDs (uses `_shared/paddle.ts`; safe, read-only, no DB writes).
4. **Update `Pricing.tsx`** with the requested hero/support/tagline copy + wire the three CTAs to `usePaddleCheckout({ priceId, customData: { userId } })`. Preserve existing tier structure and safety copy from `src/constants/pricing.ts`.
5. **Add `/checkout/success` and `/checkout/cancel` routes** with the requested copy.
6. **Deprecate the old BYO checkout UI paths** by making the new built-in Paddle path the only visible one. Do NOT remove the BYO webhook, `billing_subscriptions`, or operator audit pages — they stay as-is behind the operator-only routes. Add TODO comments where duplicate paths exist.
7. **Tests** (13/14 from your list, deferring #11 entitlement bridging to Phase 2):
   - Pricing page renders 4 tiers with correct prices/copy
   - Forbidden-marketing-claim scan (autopilot / AI grows for you / guaranteed yield / device control / cannabis-sales language)
   - No client-exposed service_role / Paddle secret keys / webhook secrets scan
   - No competing BYO checkout CTA visible
   - Success/cancel copy renders

**Explicit stop-ship in Phase 1**: The new Lovable `subscriptions` table WILL be created by the webhook when the first test checkout completes. That is unavoidable — it's how the built-in integration works. But it will exist **alongside** `billing_subscriptions`, not replace it. Nothing in the existing entitlements resolver reads from it yet, so no user gains or loses access in Phase 1.

### Phase 2 (separate slice — requires your explicit approval)
Bridge Lovable's `subscriptions` table into `src/lib/entitlements/resolveEntitlements.ts` so Pro / Pro Annual / Founder Lifetime unlock the same premium surfaces (server gates + client hooks). This needs:
- Decision on whether Lovable `subscriptions` becomes the new source of truth OR is merged into `billing_subscriptions` via a sync trigger
- Migration to bridge the two tables safely
- RLS review + runtime harness (per your billing rules)
- Server-side gate updates in the 3 existing entitlement edge functions

### Phase 3 (separate slice — requires Level Two launch gate sign-off)
Live-mode go-live. Blocked today per `docs/billing-level-two-launch-gate.md`. Requires Paddle identity verification, seller-policy pages review (Terms, Refund Policy, Privacy — must include Paddle MoR disclosure per `paddle-seller-policies`), and full sandbox E2E verification against both Pro Monthly and Pro Annual.

---

## What I will NOT do in Phase 1 (safety fences)

- No changes to `billing_subscriptions`, `paddle_events`, `paddle_event_processing`, `billing_customer_links`, `billing_subscription_update_audit`, or any existing migration.
- No changes to the existing `paddle-webhook` edge function.
- No changes to `src/lib/entitlements/resolveEntitlements.ts` or the 3 server entitlement edge functions.
- No changes to operator audit pages or the Level Two launch gate doc.
- No delete of `src/lib/paddleConfig.ts` or `.env` VITE_PADDLE_* vars — mark deprecated with TODO only.
- No live-mode work.
- No claim that entitlements are wired end-to-end — they will not be until Phase 2.

---

## Files changed (Phase 1 estimate)

**New**:
- `src/lib/paddle.ts`
- `src/hooks/usePaddleCheckout.ts`
- `src/components/PaymentTestModeBanner.tsx`
- `src/pages/CheckoutSuccess.tsx`, `src/pages/CheckoutCancel.tsx`
- `supabase/functions/_shared/paddle.ts`
- `supabase/functions/get-paddle-price/index.ts`
- Tests: `src/test/pricing-page-lovable-paddle-cta-wiring.test.tsx`, `src/test/pricing-page-forbidden-marketing-claims.test.ts`, `src/test/pricing-page-no-client-secrets.test.ts`, `src/test/checkout-success-cancel-copy.test.tsx`

**Edited**:
- `src/pages/Pricing.tsx` — new hero/support/tagline + wire 3 CTAs
- `src/App.tsx` — mount `PaymentTestModeBanner`, add 2 routes
- `src/constants/pricing.ts` — align copy with requested hero/tagline (additive; keep existing feature bullets)
- `.lovable/plan.md` — record phase decision

**Not touched** (explicit): everything under `supabase/migrations/`, `supabase/functions/paddle-webhook/`, `src/lib/entitlements/`, `src/lib/billing*`, `src/pages/Operator*`, `src/lib/paddleConfig.ts` (marked deprecated only).

---

## Decision I need from you

Pick one before I write code:

**Option A — Phase 1 only (recommended).** Ship the customer-facing checkout surface in test mode; leave the existing entitlements/webhook/DB stack untouched; open Phase 2 as its own reviewed slice. Safest, matches your workspace rules.

**Option B — Phase 1 + Phase 2 in one slice.** I proceed with Phase 1 AND bridge Lovable subscriptions into the existing entitlements resolver in this turn. Requires schema/edge/entitlements changes your rules normally forbid without explicit approval — say so explicitly if you want this.

**Option C — Roll back the built-in Paddle enable and stay on the existing BYO stack.** You would disconnect built-in Paddle from the Payments dashboard, and I would instead finish the existing BYO Paddle path (checkout initialization against `paddleConfig.ts`, wire CTAs to existing `billing_subscriptions`). No parallel systems.

Reply with A, B, or C and I'll implement immediately.


# Subscriptions & Billing — Read-Only Audit

Scope: no code changes. This is analysis only. Below: every billing/subscription-touching file grouped by role, how the end-to-end flow actually runs today, and every bug/inconsistency I found. Nothing here has been fixed.

---

## 1. The two parallel billing stacks

The repo currently runs **two independent Paddle billing stacks side by side**, unioned only at the client entitlement layer.

### Stack A — Lovable built-in Paddle (canonical checkout today)
- Client checkout: `src/hooks/usePaddleCheckout.ts` → `src/lib/paddle.ts` → Paddle.js overlay
- Env gate: `src/lib/paddleEnvironment.ts` (`resolvePaddleCheckoutEnvironment`, `classifyPaddleToken`, `isLoopbackHostname`)
- Env vars read: `VITE_PAYMENTS_CLIENT_TOKEN` (`.env.development` test, `.env.production` live)
- Price resolver: `supabase/functions/get-paddle-price/index.ts` (auth-required, server-picked env, allowlist, founder pre-cap via `founder_lifetime_slots_remaining` RPC)
- Webhook sink: `supabase/functions/payments-webhook/{index.ts, orchestrator.ts, eventProcessor.ts}`
- Tables written: `public.subscriptions`, `public.lovable_paddle_events`
- Founder allocation: **direct upsert of a `founder_lifetime` row** — does NOT call `allocate_founder_lifetime`

### Stack B — BYO Paddle (legacy, still wired but sandbox-locked)
- Config reader: `src/lib/paddleConfig.ts` (marked `@deprecated`)
- Presenter: `src/pages/Upgrade.tsx` (loads Paddle.js itself, its own `usePaddle` hook, its own `<PaddleGlobal>` window typing)
- Webhook sink: `supabase/functions/paddle-webhook/{index.ts, verifyPaddleSignature.ts}`
- Env vars read: `PADDLE_ENVIRONMENT`, `PADDLE_WEBHOOK_SECRET`, `PADDLE_PRICE_PRO_MONTHLY`, `PADDLE_PRICE_PRO_ANNUAL`, `PADDLE_PRICE_FOUNDER_LIFETIME`, `VITE_PADDLE_*`
- Tables written: `public.paddle_events`, `public.paddle_event_processing`, `public.billing_customer_links`, `public.billing_subscription_update_audit`, `public.billing_subscriptions` (via `apply_paddle_subscription_update_with_audit`), `allocate_founder_lifetime` for lifetime allocation
- Hard-limited to `environment === 'sandbox'` (`paddle-webhook/index.ts` `buildProcessingPayload` blocks anything else)

### Client entitlement union
- `src/lib/entitlements/{index.ts,types.ts,capabilities.ts,planCatalog.ts,resolveEntitlements.ts,unionEntitlements.ts,lovablePaddleAdapter.ts}` — pure resolver
- `src/hooks/useMyEntitlements.ts` — reads `billing_subscriptions` (Stack B) + `subscriptions` (Stack A, env-filtered) + `user_roles(staff)`, hands to `resolveUnionEntitlements`
- Server-side counterpart: `supabase/functions/_shared/unionEntitlementLookup.ts`
- Server env resolver: `resolveServerBillingEnvironment` (env var / API-key presence / sandbox default)

### Server entitlement gates (per-feature edge functions)
- `supabase/functions/live-sensor-entitlement/index.ts`
- `supabase/functions/premium-export-entitlement/index.ts`
- `supabase/functions/environment-summary-report-entitlement/index.ts`
- `supabase/functions/_shared/assertPhenoTrackerEntitlement.ts`

### Presenter / UX surface
- Pages: `src/pages/Pricing.tsx` (canonical), `src/pages/Upgrade.tsx` (legacy), `src/pages/CheckoutSuccess.tsx`, `src/pages/CheckoutCancel.tsx`, `src/pages/LegacyBillingRedirect.tsx`, `src/pages/Settings.tsx` (plan section)
- Operator pages: `src/pages/OperatorPaddleProcessingAudit.tsx`, `src/pages/OperatorBillingSubscriptionUpdateAudit.tsx`, `src/pages/OperatorBillingEntitlementResolutionAudit.tsx`
- Components: `src/components/{PaywallCta.tsx, PaymentTestModeBanner.tsx, AccountPlanBadge.tsx, PhenoTrackerUpgradeGate.tsx, PremiumLiveSensorGate.tsx, AiCreditLimitNotice.tsx, AiCreditServiceDegradedNotice.tsx}`
- Copy/config: `src/constants/pricing.ts` (canonical prices for `/pricing`), `src/config/pricing.ts` (legacy tiers for `/upgrade`)
- Shared lib: `src/lib/{paywallCtaViewModel.ts, legacyCheckoutRedirect.ts, pricingPlanPreselect.ts, checkoutOverlaySession.ts, checkoutPlanIntent.ts, checkoutReturnTo.ts, billingCustomerLinkCaptureRules.ts, billingCustomerLinkAuditViewModel.ts, billingEntitlementResolutionAuditViewModel.ts, billingEntitlementUpdatePlannerRules.ts, billingSubscriptionUpdateAuditViewModel.ts, paddleEventEntitlementMapperRules.ts, paddleEventProcessingAuditViewModel.ts, paddleEventProcessingRecorderRules.ts, featureEntitlements.ts}`

### Migrations (chronological)
- `20260602090359…` create `paddle_events`
- `20260605223431…` create `billing_subscriptions`
- `20260605230401…` follow-up on billing_subscriptions
- `20260620234500_add_paddle_event_processing`
- `20260621003000_paddle_event_processing_operator_audit`
- `20260621004500_billing_customer_links_foundation`
- `20260621015000_apply_paddle_subscription_update_rpc`
- `20260622170000_billing_subscription_update_audit`
- `20260622171621_billing_subscription_update_audit_retention`
- `20260622174913…` follow-up
- `20260620231000_harden_ai_credit_effective_entitlement`
- `20260709015647…` / `20260709083556…` create `public.subscriptions` + `public.lovable_paddle_events` (Stack A)
- `20260709094314…` add `processing_status` + `last_error` to `lovable_paddle_events`
- `20260709101406…` grants on `public.subscriptions`
- `20260709192453…` / `20260709193855…` follow-ups
- `20260710010000_ai_credit_spend_union_hardening`
- `20260714230000_paddle_paid_launch_ordering_and_founder` — `allocate_founder_lifetime`, `founder_lifetime_slots_remaining`
- `20260715001000_paddle_paid_launch_review_hardening`

---

## 2. End-to-end flow as it runs today (test/preview)

1. Grower opens `/pricing` (Pricing.tsx). CTAs pass `pro_monthly | pro_annual | founder_lifetime` to `usePaddleCheckout.openCheckout`.
2. `resolvePaddleCheckout()` classifies the client token prefix:
   - `test_*` → sandbox; `live_*` on non-loopback → live; live on loopback → `unavailable`; anything else → `unavailable`.
3. If unauthenticated, `openCheckout` saves a `planIntent` (allowlisted) and redirects to `/auth?redirectTo=…`. On return, the effect re-invokes `openCheckout` exactly once.
4. `initializePaddle()` loads Paddle.js, calls `Environment.set(sandbox|production)`, registers module-level `eventCallback: handlePaddleCheckoutEvent`.
5. `getPaddlePriceId` invokes edge function `get-paddle-price` with `{priceId, environment: <clientSideEnv>}` — but the function IGNORES the body env and re-resolves server-side via `resolveServerBillingEnvironment`. It authenticates the caller, allowlists the plan, checks founder slots via `founder_lifetime_slots_remaining`, then fetches `/prices?external_id=…` via `gatewayFetch` and cross-validates the returned `pri_...` against `PADDLE_PRICE_*` env vars.
6. `Paddle.Checkout.open` is called with `customData: { userId: user.id }` and a `successUrl` that carries a sanitized `returnTo`.
7. Paddle sends signed webhook to `payments-webhook?env=sandbox|live`. `verifyWebhook` (SDK) verifies signature and unmarshals.
8. Orchestrator `handleVerifiedEvent`: durably inserts `lovable_paddle_events` row (status `received`); on duplicate looks at prior `processing_status` — `processed|skipped` short-circuit 200; `received|failed` reprocess. For `transaction.completed` with no `subscriptionId` and no `importMeta.externalId`, calls `resolvePriceExternalIdByPaddleId` (Paddle SDK `prices.get`) to fill it in.
9. `decide()`:
   - `subscription.created|updated|activated` → upsert into `subscriptions` keyed on `paddle_subscription_id`. Skips if `customData.userId`, price/product `importMeta.externalId`, or subscription id missing, or price is not one of `KNOWN_PRICE_IDS`.
   - `subscription.canceled` → update status to `canceled`, `cancel_at_period_end=true`.
   - `transaction.completed` (no `subscriptionId`, price external id `founder_lifetime`) → synthesize `paddle_subscription_id = "lifetime_<txId>"`, upsert as `active`, `current_period_end=null`.
   - Anything else → `skip`.
10. `markEvent` flips row to `processed|failed|skipped`.
11. `CheckoutSuccess` mounts, polls `useMyEntitlements.refetch()` every 1.5 s up to 10 s. When `isActive && effectivePlanId !== 'free'` it shows "Verdant Pro is active." and (if a sanitized `returnTo` exists) auto-navigates there.
12. `useMyEntitlements` runs three RLS-scoped selects (billing_subscriptions, subscriptions filtered by env, user_roles staff). `resolveUnionEntitlements` composes: lifetime > active recurring (BYO tie-wins) > any non-null row (BYO preferred) > free. Result flows to `AccountPlanBadge`, `PaywallCta`, gates, etc.

The BYO stack (`paddle-webhook`, `billing_subscriptions`) is orthogonal: nothing in the current `/pricing` flow ever writes to it. It still runs if it receives events, but only sandbox events, and only via the older BYO client token path (which `/upgrade` is set up for but doesn't actually enable — every `paddlePriceId` in `src/config/pricing.ts` is `null`).

---

## 3. Bugs, risks, and inconsistencies

### High-impact

**H1. Live billing is silently disabled at the price resolver.**
`get-paddle-price/index.ts` (line 131-133):
```ts
if (environment === 'live') {
  return json(409, { error: 'live_billing_not_enabled' });
}
```
Any published build (live token) will 409 out of `getPaddlePriceId` and toast "Checkout unavailable" before Paddle.js opens. The `.env.production` live token is baked in but the server refuses to service it. This is a deliberate launch gate per the comment, but it is not surfaced in the pricing UI — buyers on production will hit a generic destructive toast with no explanation.

**H2. Two independent Pricing/Upgrade pages with divergent data.**
`/pricing` (canonical) uses `src/constants/pricing.ts` — Pro monthly $12, Pro annual $99, Founder $129. `/upgrade` uses `src/config/pricing.ts` — same monthly but Pro annual `$115` (marked "PLACEHOLDER") and every `paddlePriceId` is `null`, so its CTAs are all inert. Both pages are still routed (App.tsx lines 189, 190) and reachable. Users landing on `/upgrade` see a different price and no working checkout.

**H3. Founder Lifetime cap not enforced on the Lovable webhook path.**
`get-paddle-price` pre-checks `founder_lifetime_slots_remaining` (advisory only — the RPC has no lock across the pre-check → settlement window). `payments-webhook/eventProcessor.decide()` for `transaction.completed` with `price_external_id === "founder_lifetime"` writes directly into `public.subscriptions` with no call to `allocate_founder_lifetime` and no cap check. Only the BYO `paddle-webhook` stack routes founder events through `allocate_founder_lifetime`, but that stack does not receive events from the live `/pricing` checkout. Net: two simultaneous founder purchases past slot 75 can both succeed in Stack A.

**H4. `handlePaddleCheckoutEvent` router path is not reviewed here.**
`src/lib/paddle.ts` registers it as `Paddle.Initialize({ eventCallback: handlePaddleCheckoutEvent })` and `usePaddleCheckout` relies on it to fire the cancel callback (`beginCheckoutSession`). Its implementation lives in `src/lib/checkoutOverlaySession.ts` (not opened in this pass). If it does not correctly route `checkout.closed` while unfinished → `checkout.completed`, users who complete via Paddle-hosted flow may bounce to `/checkout/cancel` instead of `/checkout/success`. Worth verifying next.

**H5. `useMyEntitlements` env filter can strand a re-entitled buyer.**
The hook filters `subscriptions` by `environment = getPaddleEnvironment()`. `getPaddleEnvironment` returns `"live"` for any token that is missing/malformed (fallback comment says "so live billing rows still resolve after publish"). In a preview build with a bad or empty test token, the query filters for `environment='live'` rows while the webhook wrote `environment='sandbox'`, and the user is stuck on Free forever. This is a latent risk more than an active bug (the current `.env.development` token is well-formed).

### Medium-impact

**M1. Legacy `/upgrade` Paddle bootstrap duplicates every Stack A safeguard poorly.**
`src/pages/Upgrade.tsx` re-implements its own script loader, its own `Environment.set`, its own `Initialize`, its own `checkout.error` handler, and its own `window.Paddle` typing (`interface Window { Paddle?: PaddleGlobal }`). This collides at the TS level with what `paddle.ts` expects (it comments "we access it via `(window as any).Paddle` here to avoid conflicting declarations") — a code smell that reflects the split-brain. Simplest cure is to delete Upgrade's checkout wiring; the file could stay as a marketing surface pointing at `/pricing`.

**M2. `paddle-webhook` (BYO) is hard-blocked to sandbox even in preview.**
`buildProcessingPayload` returns `blocked/environment_not_allowed` for anything except `environment === "sandbox"`. If BYO Paddle credentials ever ship to live (they aren't wired now), no event would be processed. Fine as long as BYO stays decommissioned, but the ambiguity is a footgun.

**M3. `useMyEntitlements` "cancelled" cleanup guard is dead code.**
`useEffect` sets `let cancelled = false` and returns `() => { cancelled = true; }` but nothing inside the async closure ever reads `cancelled`. `mountedRef` covers the real hazard, so the block is misleading rather than broken.

**M4. Founder lifetime "lifetime_" prefix invariant is enforced only in adapter, not in DB.**
`lovablePaddleAdapter.mapLovableSubscriptionRow` refuses to grant lifetime unless `paddle_subscription_id` starts with `"lifetime_"`, `status='active'`, `current_period_end IS NULL`. The DB has no CHECK for this. A future writer that upserts a lifetime row without the prefix would silently NOT unlock lifetime for the buyer, and there is no server signal it happened.

**M5. `subscriptions.status` default `'active'` + no CHECK.**
Migration `20260709083556…` allows any string. `resolveEntitlements` degrades to free on unknown status, which is safe, but a mistyped webhook write would silently degrade a paying user.

**M6. `subscriptions.status` includes `'trialing'` semantics implicitly.**
Union resolver only treats `status === 'active'` as active-in-period, but the partial index `idx_subscriptions_user_env_active` treats `'active','trialing','past_due'` as candidates. If Paddle ever ships `'trialing'`, the client would see the row but resolve it as degraded → free. Consumer confusion during trials.

**M7. Duplicate FAQ / plan comparison copy in two files.**
`/pricing` embeds its own FAQ and JSON-LD; `/upgrade` embeds a different FAQ + comparison table. Two sources of truth for the same product story.

### Low-impact / hygiene

**L1. Prices baked into JSON-LD are not synced with Paddle.**
`Pricing.tsx` composes `@type: Product` offers from `PRO_MONTHLY_PRICE_USD`, etc. If the Paddle price entity ever changes without a constants update, structured data lies to Google. No automated cross-check.

**L2. `PricingCard` `founder.cap.claimed` placeholder still zero.**
`src/config/pricing.ts` hard-codes `{ total: 75, claimed: 0 }`. It's presenter-only per its comment, but nothing reads live `founder_lifetime_slots_remaining` to display "X of 75 remaining" on the card the buyer clicks. `/pricing` doesn't show a live counter either.

**L3. `paddleConfig.ts` still imported at build time by `Upgrade.tsx` even though flagged deprecated.**
Its `VITE_PADDLE_*` env vars are neither present in `.env` files nor documented anywhere in-repo. Any developer following the imports will chase phantom config.

**L4. Retry / poll UX on `/checkout/success` can outlast the webhook.**
Poll is bounded to 10 s. A backed-up Paddle→webhook path (or a decide→write failure that flips `processing_status='failed'` and awaits a Paddle retry) commonly exceeds this. The "Check status" button does refetch, but a user who lands, waits 10 s, and clicks "Continue" is dropped on the gated page and bounces back to the paywall — the flicker suppression only works if `confirmed` is true at auto-redirect time.

**L5. Cancel routing has no return-to preservation.**
`CheckoutCancel.tsx` sends users back to `/pricing` or `/` with no memory of the gated page they came from. `checkoutPlanIntent` was consumed pre-checkout, so a repeat click has to re-navigate manually.

**L6. `PaymentTestModeBanner` prints the sandbox banner only when `resolvePaddleCheckout()` is `sandbox`, and prints an unavailable banner otherwise.** Fine, but nothing prints on live — that means H1 (live disabled by the server) has no user-visible signal until the toast fires after a click.

---

## 4. What I did NOT investigate

- `handlePaddleCheckoutEvent` implementation in `src/lib/checkoutOverlaySession.ts` (referenced by H4).
- The AI-credit spend/refund path (`supabase/functions/ai-doctor-review`, `ai-coach`, `ai_credit_spend` table); mentioned only where they union with entitlement.
- Every operator audit page (`OperatorPaddle…`, `OperatorBilling…`) — I confirmed they exist and read append-only audit tables.
- Tests under `src/test/billing-*`, `src/test/paddle-*`, `src/test/ai-credit-*`, `src/test/upgrade-*`, `src/test/useMyEntitlements-*` — many exist and cover a lot of the above rules; not enumerated here.
- Every migration cell-by-cell — I skimmed schema/grants/RLS for the tables in scope; deeper RPC audits (`apply_paddle_subscription_update_with_audit`, `allocate_founder_lifetime`) were not line-by-line reviewed.

---

## Next step

Nothing to build. If you want me to open an implementation plan, tell me which item(s) from §3 to address — H1, H2, H3 are the ones that will bite real buyers first, in that order.

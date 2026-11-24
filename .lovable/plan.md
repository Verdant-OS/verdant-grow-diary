# Craft checkout through Paddle + server-side Blueprint gate

## Key finding first
Most of the Pro path is already plan-agnostic and already lists Craft. Craft checkout fails today because the Craft price IDs are empty, not because code is missing:
- `src/lib/paidPlanAllowlist.ts:19-22` lists `craft_monthly`/`craft_annual` as paid plans (mirrored to `supabase/functions/_shared/lib/lib/paidPlanAllowlist.ts`).
- `supabase/functions/_shared/getPaddlePriceCatalogEnv.ts:26-27, 38-39` already names the `PADDLE_PRICE_CRAFT_MONTHLY` / `PADDLE_PRICE_CRAFT_ANNUAL` secrets. Line 12 says "The Craft names stay empty while Craft has no live Paddle product."
- `src/config/pricing.ts:105-119` already has Craft plan cards with `paddlePriceId: "craft_monthly" / "craft_annual"`.

## 1. Current Pro path, end to end
1. **Plan id, not a raw price id**: the Pricing page passes `pro_monthly`/`pro_annual` (`src/config/pricing.ts`, plan entries) to `usePaddleCheckout`.
2. **Price lookup**: `src/lib/paddle.ts:367` calls the `get-paddle-price` function. That function checks the plan against the allowlist (`supabase/functions/get-paddle-price/index.ts:170`), refuses Founder (`:180-186`), then reads the price from the `PADDLE_PRICE_*` secrets (`:54`, via `readGetPaddlePriceCatalog`, `getPaddlePriceCatalogEnv.ts:62-74`). An empty secret returns `404 price_not_configured` (`:268-273`).
3. **Checkout opens**: `src/hooks/usePaddleCheckout.ts:253` `Paddle.Checkout.open(...)` with `customData.userId`.
4. **Webhook**: `supabase/functions/payments-webhook/index.ts` verifies the signature, then `orchestrator.ts` drops repeats by `paddle_event_id` (`orchestrator.ts:279-291`, returns `duplicate_*` with HTTP 200).
5. **Plan mapping**: `eventProcessor.ts:249-257` reads `price.importMeta.externalId` and accepts it only if it's in `KNOWN_PRICE_IDS` (`:36` = `SUBSCRIPTION_PLAN_IDS`, which already includes Craft).
6. **Entitlement saved**: `payments-webhook/index.ts:193-196` upserts `public.subscriptions` on `paddle_subscription_id` with `price_id = externalId`. Plan features come from `src/lib/entitlements/planCatalog.ts:56-57` (Craft = Blueprint + 300 credits).
- Not on this path: `supabase/functions/paddle-webhook` (legacy audit sink, `:268-271` maps only Pro/Founder). It writes `billing_subscriptions` and never grants access, so I'll leave it alone.

## 2. Smallest changes to add Craft
- **Price catalog**: no code change. Set the two Craft price secrets to the IDs you give me (listed under item 4).
- **Paddle-side requirement (you)**: each Craft price must have `importMeta.externalId` = `craft_monthly` / `craft_annual`, and its product's externalId set, the same way the Pro prices are. Without this, the webhook skips the event (`missing_price_external_id` / `unknown_price_id`).
- **Checkout button**: I'll check whether `Pricing.tsx` / `checkoutBlockedScopeRules.ts` hide or disable the Craft button. If they do, the fix is to stop hiding it, with no change to Pro.
- **Webhook mapping**: no change needed (see 1.5). I'll add tests to lock this in.
- **Stripe**: no change (`_shared/stripeCheckoutRules.ts:47-52` keeps refusing Craft).

## 3. Server-side Blueprint gate
Today, `PlantBlueprintOverlaySection.tsx:74-75` decides access in the browser. The data underneath it (latest sensor snapshot and root-zone observations) is the grower's own data, which other pages also read under RLS. So "Blueprint data" needs its own server path:
- Add an authenticated server function `getBlueprintOverlay` (`src/lib/blueprintOverlayService.ts` + `createServerFn` with `requireSupabaseAuth`). It resolves the caller's entitlement on the server through the existing union entitlement resolver, then calls `canUseCapability(entitlement, "blueprint")`. Free/Pro callers get `{ locked: true }` with no readings. Craft/Founder callers get the overlay inputs.
- A pure rule `blueprintAccessRules.ts` (entitlement in, allow/deny out) so it can be tested.
- The component switches to this function. The locked teaser stays static.
- Limit: the underlying sensor and root-zone tables stay readable by their owner for other features. The gate covers the Blueprint scoring output, not raw readings the grower already sees elsewhere.

## 4. Changes that each need your separate approval
- **A. Secrets (production)**: set `PADDLE_PRICE_CRAFT_MONTHLY` and `PADDLE_PRICE_CRAFT_ANNUAL`, plus the sandbox copies `PADDLE_SANDBOX_PRICE_CRAFT_*` (`getPaddlePriceCatalogEnv.ts:49-50`). Blocked until you send the IDs.
- **B. Edge functions**: none need code changes. If the Craft button needs an un-hide or a webhook tweak turns up, that is a redeploy of `get-paddle-price` / `payments-webhook`, asked separately.
- **C. Migrations**: none planned. The `email_infra` migration is untouched.
- **D. RLS / auth**: none planned. The server function uses the existing auth middleware.
- **E. Project rule conflict**: this project's own instructions say it is for GitHub sync and the database only, with no app code edits. Building section 3, or any button change, needs your explicit go-ahead to override that.

## 5. Tests (in `src/test/`)
- `paddle-craft-plan-mapping.test.ts`: a subscription event with externalId `craft_monthly`/`craft_annual` produces an `upsert_subscription` row with `price_id` craft. `pro_monthly`/`pro_annual` still map to pro (same output as today).
- `get-paddle-price-craft-catalog.test.ts`: the catalog returns Craft IDs when the secrets are set, and `price_not_configured` when they're empty.
- `blueprint-access-rules.test.ts`: Free → denied, Pro → denied, Craft monthly/annual → allowed, Founder → allowed, failed lookup → denied.
- `blueprint-overlay-service.test.ts`: the server function returns no readings for Free/Pro.
- `payments-webhook-duplicate-credit.test.ts`: the same `paddle_event_id` delivered twice gives `duplicate_*` with no second subscription upsert and no second credit-pack grant.
- Run: typecheck, the files above, plus the existing payments-webhook and Stripe checkout tests to confirm Pro and Stripe are unchanged.

## Rollback
Clear the Craft secrets. Checkout then goes back to `price_not_configured`. Revert the server-function commit.

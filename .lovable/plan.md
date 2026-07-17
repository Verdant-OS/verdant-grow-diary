# Manage-subscription 404 trace (read-only audit)

## 1. How `no_subscription` is caught today vs `lifetime_only`

Both cases are handled in `openPaddleCustomerPortal()` at `src/lib/customerPortal.ts` lines 48–91, inside a single `try { … } catch { unavailable }` wrapper. Two symmetric branches:

**Non-2xx path (what a 404 from the edge function actually hits).** `supabase.functions.invoke` returns `{ error }` as a `FunctionsHttpError` on non-2xx. The handler unwraps `error.context.body` (string or object), parses it, and reads the discriminating `error` field:

```ts
// lines 58–75 (paraphrased)
const ctx = (error as { context?: { status?: number; body?: unknown } })?.context;
const bodyCode = /* JSON.parse(ctx.body) or ctx.body.error */;
if (bodyCode === "lifetime_only")   return { ok:false, code:"lifetime_only",   error: PORTAL_LIFETIME_ONLY_MESSAGE };
if (bodyCode === "no_subscription" || ctx?.status === 404)
                                    return { ok:false, code:"no_subscription", error: PORTAL_NO_SUBSCRIPTION_MESSAGE };
return { ok:false, code:"unavailable", error: PORTAL_UNAVAILABLE_MESSAGE };
```

Note the belt-and-suspenders on line 73: **any** 404 (even one whose body fails to parse) is already mapped to `no_subscription`, not thrown.

**2xx-with-error-body path.** Lines 78–83 also handle a hypothetical `200 { error: "lifetime_only" | "no_subscription" }` shape symmetrically.

**Outer safety net.** Lines 88–90 swallow any thrown exception and return `{ ok:false, code:"unavailable" }`. There is no code path in this helper that can propagate an exception to the caller.

## 2. Where the "uncaught runtime error / blank screen" would originate

Given the above, **the current client cannot throw on a 404 `{"error":"no_subscription"}` response** from `paddle-portal-session`. The Settings caller (`src/pages/Settings.tsx` lines 282, 386–411) consumes the result via `useOpenCustomerPortalState`, sets `portalError` from `result.error`, and renders it in a `role="alert"` `<p>` — no `throw`, no unwrapped promise, no navigation.

Two things to check before concluding this is a real regression:

- **Is the deployed bundle actually current?** The `no_subscription` mapping (line 73) and `lifetime_only` distinction are recent additions (Code #6). A stale published bundle would still crash on 404 while the source in the repo looks fine. Confirm the live `verdantgrowdiary.com` bundle contains `PORTAL_NO_SUBSCRIPTION_MESSAGE` (grep the deployed JS) before shipping any "fix".
- **Is the button even rendered for comp/internal staff?** The Manage button is gated by `isPaid && !isLifetime` (line 381). If a comp account's entitlement resolves to `isPaid=true` with no Paddle row, clicking will hit the 404 path — and the current code will show the friendly message, not crash. If the account resolves to `isFree`, they only see the Upgrade CTA.
- **Other callsite:** `src/components/SubscriptionPastDueBanner.tsx` line 41 calls `openPaddleCustomerPortal()` fire-and-forget without consuming the result. It also cannot throw (outer catch), but the user gets no visible error message from that entry point — silent no-op on 404. Not a crash, but a UX gap.

If a real blank-screen repro exists, the most likely non-portal culprits are: (a) an error thrown by the entitlement hook that renders the tile (unrelated to portal click), (b) a React error boundary tripping on a sibling component, or (c) a stale deployed bundle predating Code #6. None of these are fixed by editing `customerPortal.ts`.

## 3. Minimal frontend-only change (proposed, not applied)

**If** repro confirms the deployed bundle is current and a crash still happens, the surface is already correct — no change to `customerPortal.ts` or `Settings.tsx` would materially improve it. The one small, defensible additive change is at the **silent** callsite:

- `src/components/SubscriptionPastDueBanner.tsx` line 41: switch from bare `void openPaddleCustomerPortal()` to using the hook's `open()` (already destructured on line 19) so `no_subscription` / `lifetime_only` render in the banner's existing `error` slot instead of vanishing.

**If** the repro is actually a stale deployed bundle, the correct action is a republish, not a code change.

Otherwise: no edit recommended. `customerPortal.ts` already returns `{ ok:false, code:"no_subscription", error: PORTAL_NO_SUBSCRIPTION_MESSAGE }` for the exact response you described, and Settings already renders that message in `data-testid="settings-subscription-portal-error"`.

## Recommendation

Do not edit. First verify (a) the deployed bundle contains the Code #6 mapping and (b) an actual stack trace from a real repro. If both point to a genuine crash post-Code #6, come back with the stack trace and we can target the true origin — the current portal helper is not it.

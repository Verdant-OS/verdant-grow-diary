# Spec — Paddle live checkout, runtime slice

**Status:** `PROPOSED — NOT APPROVED`. Specification only. No code in this slice.
**Author:** Claude (specification architect)
**Requested by:** Cheek, 2026-08-25, following the standing production-posture directive.
**Measured at:** deploy tip `823f4c8f0`, 2026-08-25 17:11–17:30 UTC.
**Slice owner:** unassigned — needs one owner and a **different** peer as independent
reviewer per `AGENTS.md`. This is a billing surface; the owner cannot review it.

---

## 1. Executive recommendation

**Do not ship the client change first, and do not ship it alone.**

The obvious framing of this slice — "flip the runtime resolver so `live_` stops failing
closed" — is two files and looks trivial. It is also **the most dangerous possible
ordering**, because of one measured fact:

> The webhook path that writes `public.subscriptions` is not configured for live, and one
> of the two webhook functions hard-refuses non-sandbox events outright.

Ship the client change before the server is configured and the result is not "checkout
disabled" — it is a grower who reaches Paddle, **pays real money, and receives no
entitlement**. That is strictly worse than today's state, where checkout is blocked and the
grower keeps their money. It also violates the Hard Safety Rules more seriously than the
current defect does.

**Recommended sequence — server first, client last:**

```
Stage 0  Owner configures live server env + live price catalog + live webhook endpoint
Stage 1  Verify write-back end-to-end in live with a real low-value transaction
Stage 2  Ship the client runtime slice (this document's file plan)
Stage 3  Publish
```

Stage 2 is the only stage this document specifies. Stages 0, 1 and 3 are owner-gated and
are listed here so the slice is not mistaken for the whole job.

---

## 2. Audit findings

`established fact` unless labelled. Every line reference verified at `823f4c8f0`.

### 2.1 The server is already live-capable — no change needed

`supabase/functions/_shared/unionEntitlementLookup.ts:52-63` and `:84-97` resolve the
billing environment correctly and already support live:

- `PAYMENTS_ENVIRONMENT` of `live` or `sandbox` is honoured explicitly.
- Otherwise exactly one of `PADDLE_LIVE_API_KEY` / `PADDLE_SANDBOX_API_KEY` decides.
- Ambiguous or absent config fails closed to `sandbox` — never overgrants live.
- The header is explicit that this is **never** derived from request body or query, so a
  spoofed `billing_env` cannot flip it.

This is well-built and correct. **The spec proposes no server-code change.**

### 2.2 The client has two blockers, not one

| #   | Location                                                             | Current behaviour                                                                        | Effect once production carries `live_`                                                            |
| --- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| 1   | `src/lib/paddleEnvironment.ts:87` `resolvePaddleCheckoutEnvironment` | `"sandbox"` only for a `test_` token; every other class → `"unavailable"`, on every host | Checkout disabled for everyone                                                                    |
| 2   | `src/lib/paddle.ts:41` `getPaddleEnvironment()`                      | hardcoded, return type literally `"sandbox"`                                             | Client entitlement reads filter for sandbox rows, so a **paying live subscriber renders as Free** |

Blocker 2 is the one an estimate of "one function and one call site" misses. It is reached
from `src/hooks/useMyEntitlements.ts:162` and `src/hooks/usePaddleCancelNotice.ts:51`, and
it feeds `expectedBillingEnvironment` into
`src/lib/entitlements/lovablePaddleAdapter.ts:91`, which drops any row whose `environment`
does not match.

Client entitlement reads are presentation-only and the server stays authoritative, so
blocker 2 cannot overgrant. It can only **under**-grant — which is a paying customer
seeing a locked product.

### 2.3 The write-back path is the real blocker

Two webhook functions exist and they are not interchangeable:

- **`supabase/functions/payments-webhook/index.ts`** — writes `public.subscriptions`
  (`:141`, `:148`, `:245`). Already env-aware: `:307-308` reads `?env=` from the endpoint
  URL and accepts `sandbox` or `live`, using `getPaddleClient(env)` for the matching
  credentials. **Live-capable, pending configuration.**
- **`supabase/functions/paddle-webhook/index.ts`** — `:367-368`:
  `if (row.environment !== "sandbox") return blockedProcessingPayload(row, "environment_not_allowed");`
  It hard-refuses every non-sandbox event.

That second gate initially reads like a blocker. It is not, and it should **not** be
touched: `paddle-webhook` does not write `public.subscriptions` (verified — absent from
the set of functions that do), so it is the legacy operator-audit surface that `AGENTS.md`
describes as "`public.billing_subscriptions` … must never grant an entitlement." Its
sandbox-only refusal is correct and stays.

> **Governance conflict, flagged not resolved.** The `verdant` skill states the billing
> source of truth is `public.billing_subscriptions`. `AGENTS.md` (Sentinel-Version
> 2026-09-01.2) states the opposite: `public.subscriptions` is the sole entitlement source
> and `billing_subscriptions` must never grant one. This spec follows `AGENTS.md` as the
> versioned constitution. The skill text should be corrected separately.

### 2.4 Guards that will turn red, and must be replaced rather than deleted

These are deliberate fences. Each one currently encodes "sandbox-only" as policy. The
slice must **re-point** each to the new policy at equal strength — never weaken or delete.

| Guard                        | Location                                                               | Current assertion                                                                                                                                                                 |
| ---------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `evaluatePublicPaddleBundle` | `scripts/e2e/managed-session-materialize-core.mjs:323-338`             | returns `public_paddle_live_token_present` if a live token appears in a public bundle; called from `.github/workflows/quicklog-smoke.yml:381`                                     |
| fail-closed unit tests       | `src/test/paddle-environment-fail-closed.test.ts:132`, `:204`          | "fails closed for a live token on every host"; "live-token blocking copy states the sandbox-only policy"                                                                          |
| production policy tests      | `src/test/paddle-production-test-only-policy.test.ts:36`, `:65`, `:86` | "tracks a sandbox-class client token in the production build"; "initializes only the Paddle sandbox environment"; "blocks a live token before script loading or price resolution" |

`evaluatePublicPaddleBundle` is the one to think hardest about. #1124 deliberately left it
sandbox-scoped. If the lane that calls it ever runs against a live production bundle it
goes red — and its red would be _correct_ under today's policy. Whether that lane targets
production is `NOT_MEASURED` here and is a Stage-2 prerequisite to establish.

---

## 3. Design decision

### 3.1 Proposed runtime rule — host-bound live, additive

```
sandbox token, any host              -> "sandbox"     (UNCHANGED)
live token,    canonical production  -> "live"        (NEW)
live token,    any other host        -> "unavailable" (was: unavailable everywhere)
missing / malformed, any host        -> "unavailable" (UNCHANGED)
```

**Why host-bound.** A live client token is public by design and ships in the browser. Once
it resolves to `"live"` unconditionally, any localhost or preview build carrying that token
opens **real checkout taking real money**. Binding live to the canonical production origin
keeps the existing safety property — a developer or a preview host cannot charge a real
card — while unblocking production. `isLoopbackHostname` already exists in the module and
its own comment notes it is "retained for callers that need hostname diagnostics"; this
gives it a real job again.

**Why additive.** The sandbox row is untouched, so swapping the production token back to
`test_` restores today's behaviour exactly, byte for byte. On a billing surface a rollback
that requires no code change is worth more than elegance.

### 3.2 The residual this deliberately does NOT solve

A `test_` token on the production host still resolves to `"sandbox"` — meaning production
would open a **sandbox** checkout that grants nothing real, silently. Today that is the
correct and intended state. After Stage 0 it becomes a misconfiguration that no guard
catches.

This is left out of scope on purpose: closing it means failing closed on production with a
sandbox token, which removes the rollback path described above. **Recommended follow-up
(separate slice):** an operator-visible signal — a build-time assertion or an admin banner
— rather than a runtime refusal. Flagged so it is a decision, not an oversight.

### 3.3 Entitlement environment

`getPaddleEnvironment()` derives from token class only — `live_` → `"live"`, everything
else → `"sandbox"` — and its return type widens from the literal `"sandbox"` to
`LovableBillingEnvironment`.

Deliberately **not** host-bound, unlike checkout. This value only selects which rows the
client displays; the server remains authoritative, so a wrong value can only under-grant,
never over-grant. Host-binding it would hide a real subscriber's status on a preview host
for no safety gain.

Type widening is safe: `usePaddleCancelNotice.ts:51` already annotates the value as
`LovableBillingEnvironment`, and `useMyEntitlements.ts:162` infers it.

---

## 4. File-level plan (Stage 2 only)

| File                                               | Change                                                                                                                                                                                                                                           |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/lib/paddleEnvironment.ts`                     | Add canonical-production-host predicate. Rewrite `resolvePaddleCheckoutEnvironment` per §3.1. Replace `CHECKOUT_UNAVAILABLE_LOCALHOST_MESSAGE` copy — it currently asserts the sandbox-only policy and would become false. Update module header. |
| `src/lib/paddle.ts`                                | `getPaddleEnvironment()` per §3.3; widen return type. Update `getCheckoutUnavailableMessage()` so the live-token branch no longer claims sandbox-only. Update module header ("Live tokens fail closed on every host" becomes false).             |
| `src/constants/*Copy.ts`                           | New/updated blocking copy pinned as data per repo convention, not inline in JSX.                                                                                                                                                                 |
| `scripts/e2e/managed-session-materialize-core.mjs` | Re-point `evaluatePublicPaddleBundle` to the new policy **only if** §2.4's open question resolves to "this lane targets production". Otherwise leave sandbox-scoped and untouched.                                                               |

No schema. No migration. No RLS. No edge-function code change. No new route.

## 5. Tests

Every existing fence gets a same-strength replacement. New coverage:

1. live token + canonical production host → `"live"`
2. live token + `localhost` / `127.0.0.1` / `::1` → `"unavailable"` (**the safety fence** — this is the test that must be proven RED before the fix)
3. live token + a preview/other public host → `"unavailable"`
4. sandbox token + every host incl. loopback → `"sandbox"` (regression, unchanged)
5. missing / malformed / prefix-only → `"unavailable"` (regression, unchanged)
6. classification never returns or logs the token value (existing pattern, retained)
7. `getPaddleEnvironment()` → `"live"` for live class, `"sandbox"` otherwise
8. entitlement row filtering: live row + `live` → entitling; live row + `sandbox` → not
9. determinism: repeated calls with identical inputs agree

Prove 1, 2, 3, 7 and 8 **RED before the fix** and put the failing count in the PR body, per
`AGENTS.md`.

## 6. Owner-gated prerequisites (Stage 0 — none of this is agent work)

1. `PAYMENTS_ENVIRONMENT=live` and `PADDLE_LIVE_API_KEY` set server-side.
2. Live price IDs populated: `PADDLE_PRICE_PRO_MONTHLY`, `PRO_ANNUAL`, `CRAFT_MONTHLY`,
   `CRAFT_ANNUAL`, `FOUNDER_LIFETIME`, `CREDIT_PACK_50`, `CREDIT_PACK_150`
   (`supabase/functions/get-paddle-price/index.ts:49-55`). Live catalog IDs differ from
   sandbox; unset values return `price_not_configured` and checkout blocks calmly.
3. `payments-webhook` endpoint registered in the **live** Paddle dashboard with `?env=live`
   and the live `PADDLE_WEBHOOK_SECRET`.
4. Stage 1: one real low-value live transaction, verified end-to-end to write
   `public.subscriptions` and resolve to an entitlement. **Do not skip.** This is the only
   evidence that the money path closes.
5. Confirm whether `quicklog-smoke.yml`'s bundle scan targets production (§2.4).

## 7. Rollback

Swap the production `VITE_PAYMENTS_CLIENT_TOKEN` back to the canonical `test_` value and
republish. No code revert required — §3.1 is additive by construction. Reverting the merge
commit is the secondary path.

## 8. Out of scope

Paywall/pricing copy changes; `PaywallCta`; new plan gates in JSX; `profiles.tier` (never
billing); `paddle-webhook`'s sandbox-only gate (§2.3 — correct, leave it); the §3.2
production-with-sandbox-token signal; schema, RLS, migrations; publishing.

## 9. Verdict

**The client slice is small and low-risk in isolation, and shipping it in isolation would
be the worst outcome available.** Its correctness depends entirely on server configuration
this document cannot verify and no agent should perform. Specify it now, sequence it last,
and gate it behind one real live transaction that is proven to write back.

Would a tired grower trust this? Only if the money path is proven before the button is
unblocked — never the other way round.

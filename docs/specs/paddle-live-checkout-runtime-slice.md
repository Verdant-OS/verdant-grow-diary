# Spec — Paddle live checkout, runtime slice

**Status:** `PROPOSED — NOT APPROVED`. Specification only. No code in this slice.
**Author:** Claude (specification architect)
**Requested by:** Cheek, 2026-08-25, following the standing production-posture directive.
**Measured at:** deploy tip `823f4c8f0`, 2026-08-25 17:11–18:25 UTC.
**Slice owner:** unassigned — needs one owner and a **different** peer as independent
reviewer per `AGENTS.md`. This is a billing surface; the owner cannot review it.

> **Revision 2 (2026-08-25).** Copilot's review of PR #1125 raised seven findings and
> **all seven were correct**; five were substantive and are corrected throughout. The full
> record is in §10. Read that section before citing revision 1 of this document.

> **Read `docs/paddle-paid-launch-runbook.md` first.** It predates this spec and already
> governs the live transition. Revision 1 of this document did not cite it — a research
> failure, since `AGENTS.md` requires checking for existing work before building. This spec
> is subordinate to that runbook and adds only the client-side file-level detail.

---

## 1. Executive recommendation

**Do not ship the client change first, and do not ship it alone.**

The obvious framing — "flip the runtime resolver so `live_` stops failing closed" — is
wrong twice over: it is not two files, and its ordering is backwards.

> The webhook path that writes `public.subscriptions` is not configured for live. Ship the
> client change before the server is configured and the result is not "checkout disabled" —
> it is a grower who **pays real money and receives no entitlement**. That is strictly worse
> than today, where checkout is blocked and the grower keeps their money.

The existing runbook reaches the same conclusion independently and states it as policy:
the live transition must be **one** independently reviewed release changing the client
resolver, presenter copy, live token, `PAYMENTS_ENVIRONMENT=live`, legacy
`PADDLE_ENVIRONMENT=live`, live API and webhook secrets, live price IDs, notification
destinations, monitoring and a tested rollback **together** — and "flipping any single
setting or token is insufficient and must fail closed."

**Recommended sequence:**

```
Stage 0  Owner configures live server env + live price catalog + live webhook secrets
Stage 1  Verify write-back end-to-end in live with a real low-value transaction
Stage 2  Ship the client runtime slice (§4) as part of the single coordinated release
Stage 3  Publish
```

Stage 2 is the only stage this document specifies in file-level detail.

---

## 2. Audit findings

`established fact` unless labelled. Every line reference verified at `823f4c8f0`.

### 2.1 The server is already live-capable — no change needed

`supabase/functions/_shared/unionEntitlementLookup.ts:52-63` and `:84-97` resolve the
billing environment correctly and already support live:

- `PAYMENTS_ENVIRONMENT` of `live` or `sandbox` is honoured explicitly.
- Otherwise exactly one of `PADDLE_LIVE_API_KEY` / `PADDLE_SANDBOX_API_KEY` decides.
- Ambiguous or absent config fails closed to `sandbox` — never overgrants live.
- Never derived from request body or query, so a spoofed `billing_env` cannot flip it.

**The spec proposes no server-code change.** Stage 0 is configuration, not code.

### 2.2 The client has SIX sandbox-only runtime gates, not one

**Corrected in revision 2.** Revision 1 listed the resolver and one call site. Each gate
below fails closed independently, so changing the resolver alone leaves checkout unable to
open — the resolver would return `"live"` and the very next gate would throw.

| #   | Gate                        | Location                                 | Behaviour                                                                                            |
| --- | --------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| 1   | resolver                    | `src/lib/paddleEnvironment.ts:87`        | `"sandbox"` only for `test_`; all else `"unavailable"` on every host                                 |
| 2   | Paddle.js load              | `src/lib/paddle.ts` `initializePaddle()` | throws `PaddleCheckoutUnavailableError` unless `env === "sandbox"`, before loading the script        |
| 3   | hardcoded SDK env           | `src/lib/paddle.ts`                      | `Paddle.Environment.set("sandbox")` — a literal, not derived                                         |
| 4   | price lookup                | `src/lib/paddle.ts` `getPaddlePriceId()` | throws unless sandbox, **and** sends `environment: "sandbox"` in its `get-paddle-price` request body |
| 5   | checkout hook, presentation | `src/hooks/usePaddleCheckout.ts:124`     | `const unavailable = environment !== "sandbox"`                                                      |
| 6   | checkout hook, open path    | `src/hooks/usePaddleCheckout.ts:137`     | fail-closed gate before any auth redirect                                                            |

### 2.3 `getPaddleEnvironment()` is cleanup, NOT a launch blocker

**Corrected in revision 2 — revision 1 got this wrong in the alarming direction.** It
claimed a paying live subscriber would render as Free because `getPaddleEnvironment()`
(`src/lib/paddle.ts:41`) is hardcoded `"sandbox"`. **That does not happen.**

`src/hooks/useMyEntitlements.ts:101-138` queries live rows **unconditionally** —
`subscriptionRows("live")` always runs, regardless of the expected environment — and
`liveRowEntitles` takes precedence when resolving. Its own comment states the contract:
_"Live rows are canonical production evidence and unlock regardless of a
sandbox-configured client. Sandbox rows unlock only when this client explicitly expects
sandbox."_ `usePaddleCancelNotice.ts:65-90` does the same.

So the hardcoded value is a **sandbox-fallback tidy-up** — correct to fix in the slice, but
it blocks nothing and must not be used to argue urgency.

### 2.4 The production bundle attestation WILL fail — this is measured, not open

**Corrected in revision 2.** Revision 1 left this `NOT_MEASURED`. It is measurable from the
workflow source and now measured.

`.github/workflows/quicklog-smoke.yml` hardcodes
`const PUBLIC_ORIGIN = "https://verdantgrowdiary.com"` (~`:206`), fetches that origin's
entry bundle, and calls `evaluatePublicPaddleBundle` (`:381-384`), throwing on
`!paddle.ok`. `scripts/e2e/managed-session-materialize-core.mjs:323-338` returns
`public_paddle_live_token_present` whenever a live token appears in the bundle.

**Therefore the scanner update is mandatory Stage-2 scope, not conditional.** The moment a
live bundle ships, this attestation fails against production.

### 2.5 The write-back path, and one gate that must NOT be touched

- **`supabase/functions/payments-webhook/index.ts`** — writes `public.subscriptions`
  (`:141`, `:148`, `:245`). Env-aware: `:307-308` reads `?env=` from the endpoint URL and
  accepts `sandbox` or `live`. **Live-capable, pending configuration.**
- **`supabase/functions/paddle-webhook/index.ts:367-368`** — refuses every non-sandbox
  event. **Correct; leave it.** It does not write `public.subscriptions`, so it is the
  legacy operator-audit surface that `AGENTS.md` says must never grant an entitlement.

> **Governance conflict, flagged not resolved.** The `verdant` skill states the billing
> source of truth is `public.billing_subscriptions`. `AGENTS.md` (Sentinel-Version
> 2026-09-01.2) states the opposite: `public.subscriptions` is the sole entitlement source
> and `billing_subscriptions` must never grant one. This spec follows `AGENTS.md`. The
> skill text should be corrected separately.

### 2.6 Sandbox-only fences to re-point, never delete

| Guard                     | Location                                                                      |
| ------------------------- | ----------------------------------------------------------------------------- |
| public bundle attestation | `scripts/e2e/managed-session-materialize-core.mjs:323-338` (§2.4 — mandatory) |
| fail-closed unit tests    | `src/test/paddle-environment-fail-closed.test.ts:132`, `:204`                 |
| production policy tests   | `src/test/paddle-production-test-only-policy.test.ts:36`, `:65`, `:86`        |

Each encodes "sandbox-only" as policy. Re-point every one to the new policy at equal
strength. **Never weaken or delete a fence to make a build pass.**

---

## 3. Design decision

### 3.1 Proposed runtime rule — host-bound live

```
sandbox token, any host              -> "sandbox"     (UNCHANGED)
live token,    canonical production  -> "live"        (NEW)
live token,    any other host        -> "unavailable" (was: unavailable everywhere)
missing / malformed, any host        -> "unavailable" (UNCHANGED)
```

**Why host-bound.** A live client token is public by design and ships in the browser. If it
resolved to `"live"` unconditionally, any localhost or preview build carrying that token
would open **real checkout taking real money**. Binding live to the canonical production
origin preserves that safety property. `isLoopbackHostname` already exists in the module
and its comment notes it is "retained for callers that need hostname diagnostics"; this
gives it a real job again.

Gates 2–6 in §2.2 each adopt the same resolved value rather than comparing to the literal
`"sandbox"`.

### 3.2 The residual this deliberately does NOT solve

A `test_` token on the production host still resolves to `"sandbox"` — production would
open a sandbox checkout that grants nothing real, silently. Today that is intended. After
Stage 0 it becomes a misconfiguration no guard catches. **Recommended follow-up (separate
slice):** an operator-visible signal — a build-time assertion or admin banner — rather than
a runtime refusal. Flagged so it is a decision, not an oversight.

### 3.3 Entitlement environment

`getPaddleEnvironment()` derives from token class — `live_` → `"live"`, else `"sandbox"` —
and its return type widens from the literal `"sandbox"` to `LovableBillingEnvironment`.
Not host-bound, unlike checkout: it only selects which rows the client _displays_, the
server stays authoritative, and per §2.3 live rows already unlock regardless. Type widening
is safe — `usePaddleCancelNotice.ts:51` already annotates it as `LovableBillingEnvironment`.

---

## 4. File-level plan (Stage 2 only)

| File                                               | Change                                                                                                                                                                                                                                                                                                                                                                                                                       |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/paddleEnvironment.ts`                     | Canonical-production-host predicate; rewrite `resolvePaddleCheckoutEnvironment` per §3.1; replace `CHECKOUT_UNAVAILABLE_LOCALHOST_MESSAGE`, whose copy asserts the sandbox-only policy and would become false; update module header                                                                                                                                                                                          |
| `src/lib/paddle.ts`                                | Gates 2, 3, 4 of §2.2: `initializePaddle()` accepts the resolved environment; `Paddle.Environment.set(...)` takes the resolved value instead of the literal; `getPaddlePriceId()` accepts it **and** stops hardcoding `environment: "sandbox"` in its request body. Plus `getPaddleEnvironment()` per §3.3, `getCheckoutUnavailableMessage()`, and the module header ("Live tokens fail closed on every host" becomes false) |
| `src/hooks/usePaddleCheckout.ts`                   | Gates 5 and 6 — `:124` and `:137` stop comparing to the literal `"sandbox"`                                                                                                                                                                                                                                                                                                                                                  |
| `src/constants/*Copy.ts`                           | Blocking copy pinned as data per repo convention, not inline in JSX                                                                                                                                                                                                                                                                                                                                                          |
| `scripts/e2e/managed-session-materialize-core.mjs` | **Mandatory** (§2.4): re-point `evaluatePublicPaddleBundle` at the new policy, keeping an equal-strength assertion — it must still reject a token class that does not match the intended environment                                                                                                                                                                                                                         |

No schema. No migration. No RLS. No edge-function code change. No new route.

## 5. Tests

Every existing fence gets a same-strength replacement. New coverage:

1. live token + canonical production host → `"live"`
2. live token + `localhost` / `127.0.0.1` / `::1` → `"unavailable"` (**the safety fence** — prove RED before the fix)
3. live token + a preview/other public host → `"unavailable"`
4. sandbox token + every host incl. loopback → `"sandbox"` (regression)
5. missing / malformed / prefix-only → `"unavailable"` (regression)
6. classification never returns or logs the token value (existing pattern, retained)
7. each of gates 2–6 opens under `"live"` on production and stays closed off-production
8. `getPaddlePriceId()` sends the resolved environment, never a hardcoded `"sandbox"`
9. `getPaddleEnvironment()` → `"live"` for live class, `"sandbox"` otherwise
10. bundle attestation accepts the intended live token and still rejects a mismatched class
11. determinism: repeated calls with identical inputs agree

Prove 1, 2, 3, 7, 8 and 10 **RED before the fix** and put the failing count in the PR body,
per `AGENTS.md`.

## 6. Owner-gated prerequisites (Stage 0 — none of this is agent work)

Governed by `docs/paddle-paid-launch-runbook.md`; this list is its client-relevant subset.

1. `PAYMENTS_ENVIRONMENT=live`, legacy `PADDLE_ENVIRONMENT=live`, and `PADDLE_LIVE_API_KEY`.
2. **`PAYMENTS_LIVE_WEBHOOK_SECRET`** — **corrected in revision 2.** `payments-webhook`
   verifies through `_shared/paddle.ts:getWebhookSecret(env)`, which reads
   `PAYMENTS_LIVE_WEBHOOK_SECRET` for `env=live` and `PAYMENTS_SANDBOX_WEBHOOK_SECRET` for
   sandbox. Revision 1 named `PADDLE_WEBHOOK_SECRET`, which is the **legacy BYO** secret
   used by `paddle-webhook`. Configuring only that leaves the write-back endpoint returning
   `webhook_secret_not_configured` — recreating the paid-without-entitlement failure this
   whole sequence exists to prevent.
3. Live price IDs: `PADDLE_PRICE_PRO_MONTHLY`, `PRO_ANNUAL`, `CRAFT_MONTHLY`,
   `CRAFT_ANNUAL`, `FOUNDER_LIFETIME`, `CREDIT_PACK_50`, `CREDIT_PACK_150`
   (`supabase/functions/get-paddle-price/index.ts:49-55`). Live catalog IDs differ from
   sandbox; unset values return `price_not_configured` and checkout blocks calmly.
4. `payments-webhook` endpoint registered in the **live** Paddle dashboard with `?env=live`.
5. Notification destinations and monitoring, per the runbook.
6. Stage 1: one real low-value live transaction, verified end-to-end to write
   `public.subscriptions` and resolve to an entitlement. **Do not skip.** It is the only
   evidence that the money path closes.

## 7. Rollback

**Corrected in revision 2 — revision 1 claimed a client-token swap alone was sufficient.
It is not, and that claim is withdrawn.**

`get-paddle-price` selects its catalog from the **server's** `PAYMENTS_ENVIRONMENT`, not
from the client. With the server still on `live`, a `test_` client token initializes
sandbox Paddle and then receives **live** price IDs — a broken hybrid, not a rollback.

Rollback is therefore one coordinated operation, exactly as
`docs/paddle-paid-launch-runbook.md` already requires: restore the reviewed sandbox build
**and** all sandbox selectors and catalog bindings — client token, `PAYMENTS_ENVIRONMENT`,
`PADDLE_ENVIRONMENT`, secrets and price IDs — together. Reverting the merge commit is only
the code half.

## 8. Out of scope

Paywall/pricing copy changes; `PaywallCta`; new plan gates in JSX; `profiles.tier` (never
billing); `paddle-webhook`'s sandbox-only gate (§2.5 — correct, leave it); the §3.2
production-with-sandbox-token signal; schema, RLS, migrations; publishing.

## 9. Verdict

**The client slice is larger than it looks and shipping it in isolation would be the worst
outcome available.** Six independent client gates must move together, a production
attestation must move with them, and correctness depends entirely on server configuration
this document cannot verify and no agent should perform. Specify it now, sequence it last,
gate it behind one real live transaction proven to write back — and run it as the single
coordinated release the existing runbook already mandates.

Would a tired grower trust this? Only if the money path is proven before the button is
unblocked — never the other way round.

## 10. Correction record (revision 2, 2026-08-25)

Copilot review on PR #1125 raised seven findings. **All seven verified correct against
primary sources before acceptance.** Kept visible rather than patched silently, per this
repository's practice.

| #   | Finding                                                                                                                  | Disposition                                                                                             |
| --- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| 1   | `getPaddleEnvironment()` is not a launch blocker — live rows already unlock unconditionally                              | **Conceded.** §2.3 rewritten; reclassified as cleanup                                                   |
| 2   | File plan missed `initializePaddle()`, `Paddle.Environment.set`, `getPaddlePriceId()`, and two `usePaddleCheckout` gates | **Conceded.** §2.2 now lists six gates; §4 and §5 extended                                              |
| 3   | Bundle-scanner update is mandatory — `PUBLIC_ORIGIN` is hardcoded to production                                          | **Conceded.** §2.4 moved from `NOT_MEASURED` to measured and mandatory                                  |
| 4   | Rollback by token swap is not a working rollback                                                                         | **Conceded.** §7 rewritten as a coordinated operation                                                   |
| 5   | Wrong webhook secret — canonical path reads `PAYMENTS_LIVE_WEBHOOK_SECRET`                                               | **Conceded.** §6.2 corrected; this error would have caused the exact failure the spec exists to prevent |
| 6   | `CURRENT_STATE.md` scope too narrow                                                                                      | **Conceded.** Corrected in that file with its own withdrawal note                                       |
| 7   | Markdown emphasis corruption (3 sites)                                                                                   | **Conceded.** Fixed; two were prettier mangling pre-existing prose in an unrelated section              |

**Failure modes worth naming, because they recur in this repository's history.** Revision 1
scoped a change from the two files it started at instead of tracing every consumer to a
terminal gate — the same "bounded read presented as complete" pattern the architecture-audit
deliverable already names. It also asserted `NOT_MEASURED` for something the workflow source
answers directly, and it did not find `docs/paddle-paid-launch-runbook.md`, which already
governed this transition. A reviewer should weight revision 2's remaining unreviewed claims
accordingly.

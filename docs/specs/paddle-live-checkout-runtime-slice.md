# Spec — Paddle live checkout, runtime slice

**Status:** `PROPOSED — NOT APPROVED`. Specification only. No code in this slice.
**Author:** Claude (specification architect)
**Requested by:** Cheek, 2026-08-25, following the standing production-posture directive.
**Measured at:** deploy tip `823f4c8f0`, 2026-08-25 17:11–18:25 UTC.
**Slice owner:** unassigned — needs one owner and a **different** peer as independent
reviewer per `AGENTS.md`. This is a billing surface; the owner cannot review it.

> **Revision 6 (2026-08-25).** Five review rounds — Copilot (7) and Codex (3, then 3, then 2,
> then 2 more). **All seventeen findings were correct.** Revision 5 closed a gap revision 4's
> own Hard Safety copy fix left open — a SKU-specific catalog failure collapsing into the same
> "no real charge is possible" copy as a global environment failure — and tightened the
> bundle-attestation test list against a same-class live token. Revision 6 withdraws §1's
> unflagged repetition of the runbook's `PADDLE_ENVIRONMENT=live` line, which §6.1 already
> says not to follow, and corrects a companion `CURRENT_STATE.md` heading on this same PR that
> called the build-time token question "ANSWERED" — the guard #1124 shipped still requires an
> exact match between the effective and canonical tokens, which the credited injection
> mechanism cannot produce. Full record in §10 — read it before citing any earlier revision.

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

**Corrected in revision 5 (Codex P2) — the runbook line quoted above is wrong on one item,
and repeating it here without a flag would mislead a reader who stops at §1.** Do **not**
include legacy `PADDLE_ENVIRONMENT=live` in the coordinated release; §6.1 explains why
(`paddle-webhook` 403s the operator-audit lane whenever it is not `sandbox`) and the
runbook/code conflict is flagged there for the owner, not resolved. Read that quoted list as
the runbook's own words, not this spec's recommendation — the coordinated release this spec
actually proposes excludes that one item.

**Corrected in revision 3 (Codex P1).** Revision 2 put the server switch in a Stage 0 that
ran _before_ the client change. That contradicted this document's own §7 and the runbook.
`get-paddle-price` resolves its catalog from `resolveServerBillingEnvironment()` and
**ignores any client-supplied environment**
(`supabase/functions/get-paddle-price/index.ts:249-251`). Flipping `PAYMENTS_ENVIRONMENT=live`
while the deployed sandbox client is still serving would leave the browser initializing
**sandbox** Paddle against **live** price IDs — the exact broken hybrid §7 warns about — and
would **disable the existing working sandbox checkout for the whole of Stages 0–1**, during
which no real live browser flow could be exercised anyway.

**"Prove the money path before unblocking the button" and "never run a split client/server
environment in production" are both right, and they conflict.** The resolution is to move
the proving off production, not to accept a split window:

```
Stage A  Prove payments-webhook in live mode on an ISOLATED deployment
         (non-production Supabase project, live secrets, live Paddle events).
         Production's global selectors are NOT touched.
Stage B  Stage the coordinated release: client gates, production token,
         PAYMENTS_ENVIRONMENT, live price IDs, live webhook secrets, monitoring.
Stage C  Switch ALL of Stage B atomically, per docs/paddle-paid-launch-runbook.md.
Stage D  Immediately verify with one real low-value live transaction, rollback armed.
```

Stage B is the only stage this document specifies in file-level detail. **Stage A's
isolated-deployment design is NOT specified here** and is the largest remaining unknown — if
no isolated path is available, the owner is choosing between a split-environment window and
an unproven money path, and that choice belongs to Cheek, not to this spec.

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

**The spec proposes no server-code change.** The live switch is configuration, not code.

### 2.2 The client has SIX sandbox-only runtime gates, not one

**Corrected in revision 2.** Revision 1 listed the resolver and one call site. Each gate
below fails closed independently, so changing the resolver alone leaves checkout unable to
open — the resolver would return `"live"` and the very next gate would throw.

| #   | Gate                        | Location                                 | Behaviour                                                                                             |
| --- | --------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| 1   | resolver                    | `src/lib/paddleEnvironment.ts:87`        | `"sandbox"` only for `test_`; all else `"unavailable"` on every host                                  |
| 2   | Paddle.js load              | `src/lib/paddle.ts` `initializePaddle()` | throws `PaddleCheckoutUnavailableError` unless `env === "sandbox"`, before loading the script         |
| 3   | hardcoded SDK env           | `src/lib/paddle.ts`                      | `Paddle.Environment.set("sandbox")` — a literal, not derived                                          |
| 4   | price lookup                | `src/lib/paddle.ts` `getPaddlePriceId()` | throws unless sandbox, **and** sends `environment: "sandbox"` in its `get-paddle-price` request body  |
| 5   | checkout hook, presentation | `src/hooks/usePaddleCheckout.ts:124`     | `const unavailable = environment !== "sandbox"`                                                       |
| 6   | checkout hook, open path    | `src/hooks/usePaddleCheckout.ts:137`     | fail-closed gate before any auth redirect                                                             |
| 7   | second hardcoded SDK env    | `src/pages/Upgrade.tsx:131`              | `window.Paddle.Environment?.set("sandbox")` — a **separate** hardcoded call site, added in revision 4 |

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

**Therefore the scanner update is mandatory scope, not conditional.** The moment a live
bundle ships, this attestation fails against production.

### 2.4.1 The evaluator alone CANNOT fix it — added in revision 3 (Codex P2)

The workflow reads the **tracked** `.env.production` (`:216-220`) and derives its expected
value with `resolveCanonicalPaddleSandboxToken` (`:357`), then requires
`bundle.includes(canonicalToken)`. The tracked file is sandbox-class and stays that way: per
#1124, **Lovable injects the live token at publish, so it never exists in the repository**.
Once the live bundle ships the assertion fails twice over — the live-token pattern matches,
and the sandbox token is absent.

Changing only the evaluator therefore leaves two bad options: keep failing, or accept **any**
live-prefixed token, which downgrades an exact-value fence to a class check. Neither
preserves equal strength, and §2.6 forbids weakening a fence to make a build pass.

**A trusted live expectation must be introduced, and it is an owner decision.** Candidates,
with a recommendation but no authority to choose:

| Option                                                                                                                                                  | Strength                                 | Cost                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| **(a) Repository/environment secret holding the expected live token**, compared exactly, workflow failing closed if absent while live — **recommended** | preserves exact-value matching           | one owner-managed secret, rotated with the token                                                           |
| (b) Commit a SHA-256 of the expected live token and compare hashes                                                                                      | exact-value without committing the token | brittle: needs reliable token extraction from a minified bundle                                            |
| (c) Accept class-only matching for live                                                                                                                 | weaker than today                        | none — but a real reduction in fence strength, requiring explicit owner acceptance, never a silent default |

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
the Stage C switch it becomes a misconfiguration no guard catches. **Recommended follow-up (separate
slice):** an operator-visible signal — a build-time assertion or admin banner — rather than
a runtime refusal. Flagged so it is a decision, not an oversight.

### 3.3 Entitlement environment

`getPaddleEnvironment()` derives from token class — `live_` → `"live"`, else `"sandbox"` —
and its return type widens from the literal `"sandbox"` to `LovableBillingEnvironment`.
Not host-bound, unlike checkout: it only selects which rows the client _displays_, the
server stays authoritative, and per §2.3 live rows already unlock regardless. Type widening
is safe — `usePaddleCancelNotice.ts:51` already annotates it as `LovableBillingEnvironment`.

---

### 3.4 Map the repository label to Paddle's SDK value — added in revision 4 (Codex P1)

This repository's label for the production billing environment is **`live`**. Paddle.js's
`Paddle.Environment.set(...)` takes **`"sandbox"` or `"production"`**. They are not the same
string, and `src/pages/Upgrade.tsx:76` types the global as
`Environment?: { set: (env: string) => void }` — plain `string` — so passing `"live"`
**type-checks cleanly and fails only at runtime**, during the atomic switch, which is the
worst possible moment to find out. `src/lib/paddleConfig.ts:77` already treats `"live"` and
`"production"` as distinct strings, so the distinction is real in this codebase.

Introduce one explicit mapping (`live` → `production`, `sandbox` → `sandbox`) used by **both**
call sites, and assert the exact SDK argument in tests, not just the resolver output.

### 3.5 Buyer-facing checkout copy is IN scope — Hard Safety, added in revision 4 (Codex P1)

**Revision 3 listed pricing copy as out of scope. That was wrong and is withdrawn.**

`src/lib/checkoutTrustCopyRules.ts` declares `CheckoutTrustState = "sandbox" | "unavailable"`
— there is no live state — and `buildCheckoutTrustCopy` falls through to `UNAVAILABLE_COPY`
for any environment that is not `"sandbox"`. `src/pages/Pricing.tsx:253-254` already passes
the resolved environment in.

So the moment the resolver returns `"live"`, a buyer looking at a working, chargeable CTA
would read:

> _"Live checkout is disabled. Sandbox test checkout cannot open in this environment right
> now; no charge is created and **no real charge is possible**."_

…with `canCreateLiveCharge: false`. **Telling a grower no real charge is possible while
taking a real payment is a direct Hard Safety Rules violation** — the fake-data rule applied
to money. This module, its `Pricing.tsx` wiring, and its tests are mandatory scope in the
coordinated release, and the live copy must state plainly that a real charge will be made.

### 3.5.1 `blocked` conflates two different failures — added in revision 5 (Codex P1)

**Revision 4 fixed the global case and left the per-SKU case standing — the same "fix the
pointed-at instance, not the class" failure this document's own §10 already names.**

`Pricing.tsx:253-255` computes `blocked: Boolean(checkoutRecoveryReason)`, where
`checkoutRecoveryReason = blockedReason ?? unavailableMessage`. Those are not the same
failure: `unavailableMessage` is a global environment problem, but `blockedReason` is scoped
to **one SKU** by `isSkuBlocked()`, whose own comment states the other SKUs stay chargeable.
`buildCheckoutTrustCopy`'s `if (input.blocked) return UNAVAILABLE_COPY` cannot see that
distinction — it only sees one boolean.

So under a live environment where Pro's catalog call fails but Craft and Founder Lifetime are
fine, the page-level trust copy would again read "no real charge is possible" beside a Craft
CTA that genuinely can charge a card. Revision 4 removed this sentence from the pure
environment-unavailable path and reintroduced it, unfixed, on the SKU-blocked path.

`buildCheckoutTrustCopy` must distinguish the two causes — for example an explicit
`blockedScope: "environment" | "sku" | null` input rather than one boolean — so a live
environment with a single blocked SKU never falls through to copy claiming no charge is
possible anywhere on the page. Global environment failures keep today's `UNAVAILABLE_COPY`
unchanged.

## 4. File-level plan (Stage B only)

| File                                                          | Change                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/paddleEnvironment.ts`                                | Canonical-production-host predicate; rewrite `resolvePaddleCheckoutEnvironment` per §3.1; replace `CHECKOUT_UNAVAILABLE_LOCALHOST_MESSAGE`, whose copy asserts the sandbox-only policy and would become false; update module header                                                                                                                                                      |
| `src/lib/paddle.ts`                                           | Gates 2, 3, 4 of §2.2: `initializePaddle()` accepts the resolved environment; `Paddle.Environment.set(...)` takes the **mapped SDK value** (§3.4), never the raw resolved value; `getPaddlePriceId()` accepts it **and** stops hardcoding `environment: "sandbox"` in its request body. Plus `getPaddleEnvironment()` per §3.3, `getCheckoutUnavailableMessage()`, and the module header |
| `src/pages/Upgrade.tsx`                                       | Gate 7 — the second hardcoded `Environment?.set("sandbox")` at `:131`, using the same mapping. Its `PaddleGlobal` types `set` as `(env: string) => void`, so a wrong value type-checks and fails only at runtime                                                                                                                                                                         |
| `src/lib/checkoutTrustCopyRules.ts` + `src/pages/Pricing.tsx` | **Hard Safety — see §3.5 and §3.5.1.** Add a `live` trust state; distinguish a global environment failure from a single blocked SKU so the other SKUs' copy never falls back to "no real charge is possible"; `Pricing.tsx:253` already feeds the resolved environment in                                                                                                                |
| `src/hooks/usePaddleCheckout.ts`                              | Gates 5 and 6 — `:124` and `:137` stop comparing to the literal `"sandbox"`                                                                                                                                                                                                                                                                                                              |
| `src/constants/*Copy.ts`                                      | Blocking copy pinned as data per repo convention, not inline in JSX                                                                                                                                                                                                                                                                                                                      |
| `scripts/e2e/managed-session-materialize-core.mjs`            | **Mandatory** (§2.4): re-point `evaluatePublicPaddleBundle` at the new policy, keeping an equal-strength assertion                                                                                                                                                                                                                                                                       |
| `.github/workflows/quicklog-smoke.yml`                        | **Mandatory, and the harder half — see §2.4.1.** The workflow, not the evaluator, is where the expected token comes from                                                                                                                                                                                                                                                                 |

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
10. bundle attestation accepts the intended live token, rejects a mismatched token class, **and
    rejects a second, distinct live token of the same class** — a class-only check would let a
    valid-looking `live_...` token from the wrong Paddle account pass (§2.4.1, added in
    revision 5, Codex P2)
11. **the exact argument passed to `Paddle.Environment.set` is `"production"` under live and `"sandbox"` under sandbox** — assert the SDK value at both call sites, not just the resolver output (§3.4)
12. `buildCheckoutTrustCopy` returns a live state under `"live"` whose copy states a real charge WILL be made, with `canCreateLiveCharge` true (§3.5) — prove RED before the fix
13. **live environment, one SKU blocked by a runtime catalog failure** → that SKU's copy
    reflects the block while every other, still-chargeable SKU's copy keeps stating a real
    charge will be made — the environment-failure and SKU-failure causes must not collapse to
    one `blocked` boolean (§3.5.1, added in revision 5, Codex P1) — prove RED before the fix
14. determinism: repeated calls with identical inputs agree

Prove 1, 2, 3, 7, 8, 10, 11, 12 and 13 **RED before the fix** and put the failing count in the
PR body, per `AGENTS.md`. Tests 12 and 13 are the Hard Safety fences — neither may ever be
skipped.

## 6. Owner-gated prerequisites (Stages A and C — none of this is agent work)

Governed by `docs/paddle-paid-launch-runbook.md`; this list is its client-relevant subset.

**Ordering, restated because revision 3 got it wrong in this very section:** items 1–5 are
staged in Stage B and applied **only** in the atomic Stage C switch, together with the client
changes in §4. **Do not apply any of them ahead of the client release** — that recreates the
sandbox-client / live-catalog hybrid §1 and §7 both reject.

1. `PAYMENTS_ENVIRONMENT=live` and `PADDLE_LIVE_API_KEY`.
   **Do NOT set `PADDLE_ENVIRONMENT=live` — corrected in revision 3 (Codex P2).**
   `supabase/functions/paddle-webhook/index.ts:671-676` returns **403 `sandbox_only`**
   whenever `PADDLE_ENVIRONMENT !== "sandbox"`, so setting it live shuts down the
   operator-audit lane that §2.5 says is correct and must remain. Keep the legacy selector
   sandbox-scoped and switch only the canonical `payments-webhook` lane.
   **Conflict flagged, not resolved:** `docs/paddle-paid-launch-runbook.md` lists legacy
   `PADDLE_ENVIRONMENT=live` among its live-transition settings. That instruction and this
   code cannot both be followed. Revision 2 propagated the runbook line without checking it
   against the function. **Owner decision — do not silently pick a side.**
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
6. **Stage D** (after the atomic Stage C switch, never before it): one real low-value
   live transaction, verified end-to-end to write
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

`PaywallCta`; new plan gates in JSX; `profiles.tier` (never
billing); `paddle-webhook`'s sandbox-only gate (§2.5 — correct, leave it); the §3.2
production-with-sandbox-token signal; schema, RLS, migrations; publishing.

**No longer out of scope:** buyer-facing checkout trust copy. Revision 3 excluded it; §3.5
brings it in as Hard Safety scope.

## 9. Verdict

**The client slice is larger than it looks and shipping it in isolation would be the worst
outcome available.** Six independent client gates must move together, a production
attestation must move with them, and correctness depends entirely on server configuration
this document cannot verify and no agent should perform. Specify it now, sequence it last,
gate it behind one real live transaction proven to write back — and run it as the single
coordinated release the existing runbook already mandates.

Would a tired grower trust this? Only if the money path is proven before the button is
unblocked — never the other way round.

## 10. Correction record

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

### Revision 3 — Codex, 3 findings, all correct

| #   | Finding                                                                                                                                                                                    | Disposition                                                                                    |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| 8   | **P1.** Stage 0 switched the server before the client, creating the split environment §7 itself calls a broken hybrid and disabling sandbox checkout for Stages 0–1                        | **Conceded.** §1 restructured: isolated proving (Stage A), then one atomic switch (Stage C)    |
| 9   | **P2.** `PADDLE_ENVIRONMENT=live` 403s the legacy operator-audit webhook that §2.5 says must remain                                                                                        | **Conceded.** §6.1 corrected; the runbook/code conflict is flagged for the owner, not resolved |
| 10  | **P2.** The bundle attestation cannot be fixed in the evaluator — the workflow derives its expectation from the tracked sandbox `.env.production`, and the live token is never in the repo | **Conceded.** New §2.4.1; workflow added to §4 with three owner options                        |

**Ten findings across two rounds, ten correct, none against the reviewers.** Two of the three
Codex findings were internal contradictions — the spec arguing against itself two sections
apart — and the third propagated a runbook instruction without checking it against the code
it governs.

### Revision 4 — Codex, 3 findings, all correct, all P1

| #   | Finding                                                                                                                                                            | Disposition                                                                                                           |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| 11  | Passing the resolved `"live"` straight to `Paddle.Environment.set` is invalid — the SDK takes `"production"` — and the loosely typed global hides it until runtime | **Conceded.** New §3.4 mapping; test 11 asserts the SDK argument. Also surfaced a **seventh** gate, `Upgrade.tsx:131` |
| 12  | Pricing copy cannot be out of scope: `buildCheckoutTrustCopy` has no live state, so a buyer would be told "no real charge is possible" while being charged         | **Conceded — Hard Safety.** New §3.5; removed from §8; test 12 is a mandatory RED-first fence                         |
| 13  | §6 still said "Stage 0" and "Stage 1", so an operator following it would still switch the server before the client                                                 | **Conceded.** Stage vocabulary swept across §2.1, §3.2, §4 and §6                                                     |

**Thirteen findings across three rounds, thirteen correct.** Finding 13 is the sharpest
lesson: revision 3 fixed the sequencing in §1 and left the same instruction standing in the
section an operator would actually follow — **the exact "fix the pointed-at instance rather
than the class" failure this record already names, committed in the act of writing about
it.** Finding 12 is the most serious: a documentation scoping decision, not a code change,
would have shipped a money-related lie to buyers.

**Failure modes worth naming, because they recur in this repository's history.** Revision 1
scoped a change from the two files it started at instead of tracing every consumer to a
terminal gate — the same "bounded read presented as complete" pattern the architecture-audit
deliverable already names. It also asserted `NOT_MEASURED` for something the workflow source
answers directly, and it did not find `docs/paddle-paid-launch-runbook.md`, which already
governed this transition. A reviewer should weight revision 2's remaining unreviewed claims
accordingly.

### Revision 5 — Codex, 2 findings, both correct

| #   | Finding                                                                                                                                                                                                                      | Disposition                                                                                                  |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| 14  | **P1.** Revision 4's Hard Safety copy fix only covers the global-unavailable case; a single blocked SKU still falls through to the same "no real charge is possible" copy, mislabeling every other, genuinely chargeable SKU | **Conceded.** New §3.5.1; §4 row and test 13 updated; test 13 added to the RED-first list alongside test 12  |
| 15  | **P2.** Test 10 rejected only a mismatched token _class_; a different valid-looking `live_...` token from another Paddle account would pass and could point checkout at the wrong account                                    | **Conceded.** Test 10 extended to require rejecting a second, distinct live token of the same class (§2.4.1) |

**Fifteen findings across four rounds, fifteen correct.** Finding 14 repeats finding 13's
lesson one level down: revision 4 fixed the global instance of the trust-copy bug and left a
second instance of the same bug — a single boolean standing in for two distinct causes —
in the exact module it had just rewritten. Weight any future revision's coverage claims
accordingly rather than assuming a Hard Safety fix generalizes on the first pass.

### Revision 6 — Codex, 2 findings, both correct

| #   | Finding                                                                                                                                                                                                                                                                                                                                                        | Disposition                                                                                                                                                                   |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 16  | **P1** (on the companion `CURRENT_STATE.md`, same PR). "Lovable injects the live token at publish" was credited as answering the build-time token question, but `assert-paddle-production-sandbox.mjs` still requires the effective token to exactly match the canonical file token — an injected value overriding the file would fail that check, not pass it | **Conceded.** `CURRENT_STATE.md` heading renamed from "is now ANSWERED" to "is NOT answered"; correction added explaining the guard's exact-match logic and what remains open |
| 17  | **P2.** §1 repeats the runbook's `PADDLE_ENVIRONMENT=live` instruction without a flag, even though the corrected §6.1 says never to set it — an operator reading only §1 would still shut down the legacy operator-audit webhook                                                                                                                               | **Conceded.** §1 now flags the runbook quote as superseded on that one item and points to §6.1                                                                                |

**Seventeen findings across five rounds, seventeen correct.** Finding 16 is the most
consequential of the five rounds: it does not just find a documentation gap, it shows the
"question is answered" framing was wrong on its own terms — the very guard credited with
confirming the mechanism would reject the mechanism it was credited with confirming. Neither
this spec nor `CURRENT_STATE.md` re-measured which of the two original candidates is
correct; the heading correction narrows what was overclaimed, not what is known.

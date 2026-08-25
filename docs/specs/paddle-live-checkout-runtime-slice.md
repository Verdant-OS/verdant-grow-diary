# Spec — Paddle live checkout, runtime slice

**Status:** `PROPOSED — NOT APPROVED`. Specification only. No code in this slice.
**Author:** Claude (specification architect)
**Requested by:** Cheek, 2026-08-25, following the standing production-posture directive.
**Measured at:** deploy tip `823f4c8f0`, 2026-08-25 17:11–18:25 UTC.
**Slice owner:** unassigned — needs one owner and a **different** peer as independent
reviewer per `AGENTS.md`. This is a billing surface; the owner cannot review it.

> **Revision 15 (2026-08-25).** Copilot, three findings: `pack_requires_monthly_plan`
> gates on the user's entitlement and so blocks both pack CTAs — `blockedScope` gains
> `"pack"` (finding 32); the §3.5.1 setup still contradicted its own corrected derivation
> (finding 33); and findings 30/31 were rendering as paragraphs, not ledger rows (finding
> 34). Status codes verified at source: gateway/config-drift are 502, entitlement-lookup
> failures 503, missing config 500. Thirty-four findings, fourteen rounds, thirty-four
> correct.
>
> **Revision 14 (2026-08-25).** Revision 13 removed the orphan-SHA causal overclaim that
> survived revision 12's sweep inside §2.4.1's own body (finding 30). Revision 14 corrects
> §3.5.1's scope seeding: `blockedScope` derives from the catalog error's `reason`, not
> from the class, because `price_resolution_unavailable` covers shared resolver outages
> (finding 31). Thirty-one findings, thirteen rounds, thirty-one correct.
>
> **Revision 12 (2026-08-25).** Eleven review rounds — Copilot (7) and Codex (3, then 3, then
> 2, then 2, then 2, then 2, then 2, then 1, then 3, then 2 more). **All twenty-nine findings
> were correct; the open-gap count still stays at three.** Revision 11 fixed all three of its
> own findings rather than adding a fourth — walking back §2.4.1/§6 item 0's "publish-time
> injection is neutralized" to `NOT_MEASURED`, replacing §3.2's unbuildable server-state guard
> with a manual verification inside §6 item 0, and correcting §3.5.1's `blockedReason`
> scope-derivation. Revision 12 finds two more, same shape as before: §3.3's
> `getPaddleEnvironment()` defaulted a missing or malformed production token into the
> `"sandbox"` entitlement bucket, which after Stage C could display a stray sandbox
> subscriber as entitled while the live server correctly reads them as Free — fixed by
> inverting the fallback direction. And the companion `CURRENT_STATE.md`'s claim that the
> publisher "commits its workspace locally" — inferred from one `git fetch` failure that
> proves only the SHA is unrecognized, not the mechanism — is walked back to `NOT_MEASURED`,
> including a second, undetected occurrence of the identical overclaim inside this very
> document's own revision-11 correction-record text. Full record in §10 — read it before
> citing any earlier revision.

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

**A second unspecified gap, conceded in revision 8 (Codex P1), not resolved:** "switch ALL of
Stage B atomically" in Stage C names a property this document does not show how to achieve.
The client build publishes through Lovable, `PAYMENTS_ENVIRONMENT` and function secrets change
through the Supabase operator surface, and the Paddle-side notification destination is
configured in Paddle's own dashboard — three independent systems with no shared transaction or
release wrapper found in this repository. Nothing here defines a deploy-safe handshake or a
fail-closed compatibility sequence that actually prevents the sandbox-client/live-catalog or
live-client/sandbox-server windows this document spends §1, §3.2 and §7 arguing against. Like
Stage A, this is flagged as a real, unresolved gap in the execution mechanism, not designed
here — it belongs to whoever owns implementing Stage C, with the same owner sign-off as Stage
A, not assumed away by the word "atomically."

---

## 2. Audit findings

`established fact` unless labelled. Every line reference verified at `823f4c8f0`.

### 2.1 The authorization server is already live-capable — corrected in revision 9 (Codex P2)

`supabase/functions/_shared/unionEntitlementLookup.ts:52-63` and `:84-97` resolve the
billing environment correctly and already support live:

- `PAYMENTS_ENVIRONMENT` of `live` or `sandbox` is honoured explicitly.
- Otherwise exactly one of `PADDLE_LIVE_API_KEY` / `PADDLE_SANDBOX_API_KEY` decides.
- Ambiguous or absent config fails closed to `sandbox` — never overgrants live.
- Never derived from request body or query, so a spoofed `billing_env` cannot flip it.

**"No server-code change" was too broad and is narrowed here — the entitlement
authorization logic above needs none, but the price-ID catalog does; see §6 item 3.**
`get-paddle-price/index.ts` and the legacy `paddle-webhook/index.ts` currently read the
**identical** `PADDLE_PRICE_PRO_MONTHLY` / `PADDLE_PRICE_PRO_ANNUAL` /
`PADDLE_PRICE_FOUNDER_LIFETIME` variables from one flat, environment-unaware config object
each. Repointing those three variables at live IDs for `get-paddle-price` would silently
break `paddle-webhook`'s sandbox price-ID classification for the same three plans, since it
reads the same names. Closing that gap needs a small, mechanical edge-function change —
environment-scoped variable names, not new business logic — detailed in §4 and §6.

### 2.2 The client has SIX sandbox-only runtime gates in live scope, not one

**Corrected in revision 2.** Revision 1 listed the resolver and one call site. Each gate
below fails closed independently, so changing the resolver alone leaves checkout unable to
open — the resolver would return `"live"` and the very next gate would throw.

**Revision 4 added a would-be seventh row; revision 7 (Codex P2) removes it from live scope.**
`src/pages/Upgrade.tsx` is a retired presenter — `canonical-checkout-ownership.test.ts` proves
`/upgrade` redirects to `/pricing` and never mounts it — reading Paddle config through the
deprecated, deliberately sandbox-only `paddleConfig.ts` (`@deprecated`, refuses live/production
by design). Kept in the table below for visibility, not as a live-scope gate: it fails closed
today, stays untouched by this slice, and is excluded from §3.4's SDK-value mapping and from
test 11.

| #   | Gate                        | Location                                 | Behaviour                                                                                              |
| --- | --------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| 1   | resolver                    | `src/lib/paddleEnvironment.ts:87`        | `"sandbox"` only for `test_`; all else `"unavailable"` on every host                                   |
| 2   | Paddle.js load              | `src/lib/paddle.ts` `initializePaddle()` | throws `PaddleCheckoutUnavailableError` unless `env === "sandbox"`, before loading the script          |
| 3   | hardcoded SDK env           | `src/lib/paddle.ts`                      | `Paddle.Environment.set("sandbox")` — a literal, not derived                                           |
| 4   | price lookup                | `src/lib/paddle.ts` `getPaddlePriceId()` | throws unless sandbox, **and** sends `environment: "sandbox"` in its `get-paddle-price` request body   |
| 5   | checkout hook, presentation | `src/hooks/usePaddleCheckout.ts:124`     | `const unavailable = environment !== "sandbox"`                                                        |
| 6   | checkout hook, open path    | `src/hooks/usePaddleCheckout.ts:137`     | fail-closed gate before any auth redirect                                                              |
| —   | retired, out of live scope  | `src/pages/Upgrade.tsx:131`              | `window.Paddle.Environment?.set("sandbox")` — unreachable BYO sandbox path; left unchanged (see above) |

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
`bundle.includes(canonicalToken)`. Once the live bundle ships the assertion fails twice over —
the live-token pattern matches, and the sandbox token is absent.

**Corrected in revision 8 (Codex P1), then partly withdrawn in revision 11 (Codex P2) — read
both before citing this.** Revision 3's claim rested on #1124's own account: Lovable injects a
`live_` token into `.env.production` at publish, so the tracked file could stay `test_` while
the shipped bundle carried `live_`. Revision 8 said **#1127 removed that path**:
`package.json`'s `prebuild` now runs `scripts/restore-env-production-from-head.mjs` first,
overwriting the working-tree `.env.production` with `HEAD:.env.production` before the guard
or the bundler run.

**That conclusion assumed `HEAD` means the file as committed to GitHub. It might not.**
`CURRENT_STATE.md`'s 2026-08-25 19:48 UTC re-measurement found the served production commit
is **unrecognized by GitHub** — consistent with the stamp's `ref: "__orphan__"`, but the
fetch failure does **not** establish why: a publisher-local commit, a rebase, a squash, or
any other history reconstruction produces the same observation. The publisher mechanism is
`NOT_MEASURED`. If whatever `HEAD` resolves to in the publisher's build context already
carries an injected `live_` value, `restore-env-production-from-head.mjs` would restore
**that** — not the GitHub-tracked `test_` value this section assumed. Whether it does is
`NOT_MEASURED` on both documents; neither this correction nor `CURRENT_STATE.md`'s own
account settles it, and an unrecognized SHA is not the evidence that would.

**So: `NOT_MEASURED`, not resolved.** §6 item 0's instruction — commit the live-class token to
`.env.production` directly — is still the only path this document can currently verify with
confidence, and stays as written; a publish-time injection reaching the bundle **cannot yet
be ruled out** the way revision 8 claimed. Don't cite revision 8's "the injection path is
neutralized" independent of this correction; don't cite §6 item 0 as the _only possible_
mechanism either. Settling this needs the same demonstration `CURRENT_STATE.md` already asks
for: a publish that shows `dirty: false` and a `test_`-class bundle.

No code or file-level-plan change follows from this on `package.json` or the restore script
themselves: #1127's own scope is deliberately environment-agnostic (it restores from `HEAD`
regardless of what that commit contains), so it needs no live/sandbox awareness added. It is
listed here as the mechanism, not as a file this slice touches.

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

### 3.2 A `test_` token on production after Stage C IS the broken hybrid — corrected in revision 7 (Codex P1), enforcement mechanism corrected in revision 11 (Codex P1)

**Revisions 1 through 6 treated this as a deferred residual, safe to leave for a follow-up
slice. It is not a residual — it is the exact failure §1 and §7 already call unacceptable,
arriving through the token instead of the environment selector.**

A `test_` token on the canonical production host resolves to `"sandbox"` (§3.1). Before
Stage C that is correct and safe — the server is still `sandbox` too. **After Stage C**,
`PAYMENTS_ENVIRONMENT=live` is set server-side, and per §2.1 `get-paddle-price` **ignores
the client-supplied environment entirely** and returns live catalog price IDs regardless of
what the client resolved. A build that ships a `test_` token on production after Stage C —
a bad rollback, a stale artifact, human error — would initialize **sandbox** Paddle while
receiving **live** price IDs from the server, silently, since nothing currently checks for
that combination. That is the identical broken hybrid §1 opens with and §7 already treats
as unacceptable. It is not made safer by arriving through a stale client token instead of a
stale server selector, and treating it as an optional operator-visible-signal follow-up was
wrong.

**Revision 7's proposed mechanism cannot be built as written — corrected in revision 11
(Codex P1).** It proposed extending `assert-paddle-production-sandbox.mjs` to "fail the
build when the server-side `PAYMENTS_ENVIRONMENT` is (or is being switched to) live and the
shipped production token is not." `PAYMENTS_ENVIRONMENT` is a Supabase Edge Function secret.
Verified directly: it appears exactly once anywhere in this repository, as a comment in
`.env.example` (`# PAYMENTS_ENVIRONMENT  # "sandbox" until the reviewed live-enable slice`),
and in zero committed `.env`, `.env.production`, or `.env.development` file, and
`package.json`'s `build` script has no step that could reach a Supabase secret. A Node
script running inside `prebuild` has no path to the value an operator sets server-side —
the proposal checked state the build provably cannot observe from where it runs.

**The corrected split: keep what the guard can verify unconditionally; move what it cannot
to the one place that already holds the missing context.**

- `assert-paddle-production-sandbox.mjs` is **unchanged by this correction** — it already
  does, and keeps doing on every build, exactly what §2.4.1 needs: require the shipped
  (effective) token to exactly match the committed canonical `.env.production` token,
  whichever class that currently is. That guarantee needs no server read.
- The live-class requirement moves into **§6 item 0**, which already owns "commit the
  live-class token to `.env.production`" as one deliberate step of the coordinated Stage C
  release: that step now also requires **verifying** the committed token is live-class
  before the operator proceeds, in the same coordinated pass, to set
  `PAYMENTS_ENVIRONMENT=live` server-side (§6's own step 1). This needs no automated
  cross-system read — whoever executes Stage C already holds both facts (the file they just
  committed, the secret they are about to set) in the one place a build script never can.

**What this narrows to, rather than closes: a _later_, independent commit reverting
`.env.production`'s token back to `test_`-class after Stage C, without a matching server-side
reversion, would still ship clean** — neither the unconditional exact-match guard (no
opinion on token class) nor the one-time §6 release check (runs once, at cutover) would
catch it. This is not a new, fourth gap: it is finding 21's already-conceded cutover-mechanism
gap (§1) recurring after the fact instead of at the moment of the switch — closing it would
still need a shared transaction between this repository and the Supabase operator surface
that finding 21 already established does not exist, not a new build-time check. The
previously-reviewed sandbox build remains the actual rollback path per §7; nothing here
changes that.

### 3.2.1 A second, unresolved instance — local and preview sandbox clients, added in revision 10 (Codex P2)

**Conceded, not fixed — the same underlying cause as §3.2, reaching a case its build-time
guard cannot see.** `.env` points the shared Supabase target at **production**
(`VITE_SUPABASE_URL=https://knkwiiywfkbqznbxwqfh.supabase.co`, verified directly), while
`.env.development` supplies a `test_`-class token. `bun run dev` never runs `prebuild`, so
§3.2's new guard — a production **build-time** check — cannot see it. Once Stage C sets
`PAYMENTS_ENVIRONMENT=live` server-side, `get-paddle-price` still ignores the caller's
environment (§2.1), so **any** authenticated local or preview session — not just a stale
production artifact — would initialize sandbox Paddle while receiving live price IDs from
production Supabase.

**Why this is conceded rather than fixed here, unlike §3.2:** every option changes something
this document cannot authorize unilaterally. Pointing local/preview development at an
isolated, non-production Supabase project (the same shape as Stage A's isolated proving
ground) is an environment/infrastructure decision outside a runtime-client spec. Teaching
`get-paddle-price` to honor a client-requested sandbox environment would partially reopen the
exact hazard §2.1 exists to close — **"never derived from request body or query, so a spoofed
`billing_env` cannot flip it"** — and any safe version of that (e.g. gated on an
unforgeable, server-verified dev/preview signal) is new design, not a client runtime detail.
Recorded here, next to §1's Stage A and cutover-mechanism gaps, as a third open question for
whoever owns Stage C — not invented in response to a review comment.

### 3.3 Entitlement environment — fallback direction corrected in revision 11 (Codex P2)

`getPaddleEnvironment()` derives from token class, and its return type widens from the
literal `"sandbox"` to `LovableBillingEnvironment`. Not host-bound, unlike checkout: it only
selects which rows the client _displays_, the server stays authoritative, and per §2.3 live
rows already unlock regardless. Type widening is safe — `usePaddleCancelNotice.ts:51`
already annotates it as `LovableBillingEnvironment`.

**The original derivation defaulted the wrong way for a missing or malformed token —
corrected here rather than left to ship.** `LovableBillingEnvironment`
(`src/lib/entitlements/lovablePaddleAdapter.ts:28`) is a two-value type — `"sandbox" |
"live"`, no third "unavailable" bucket — so _something_ must be returned even when the token
is missing or malformed. The original rule (`live_` → `"live"`, else → `"sandbox"`) put
every malformed/missing case in the `"sandbox"` bucket.

That bucket is not inert. `useMyEntitlements.ts` and `usePaddleCancelNotice.ts` both gate
their sandbox-row query on `expectedEnvironment === "sandbox"` — `fetchEntitlementSnapshot`'s
own comment states the design intent directly: "Live rows are canonical production evidence
and unlock regardless of a sandbox-configured client. Sandbox rows unlock only when this
client explicitly expects sandbox." After Stage C, a missing or malformed production token
would still land in that `"sandbox"` bucket under the original rule, so a grower holding only
a stray sandbox-era subscription row would display as entitled — while the authoritative
live server, which now governs real payments, would correctly consider them Free.

**The rule inverts which branch is the explicit match and which is the catch-all:**
`test_`-class (a validly-shaped sandbox token) → `"sandbox"`; everything else — a genuine
`live_` token, **or** a missing or malformed one — → `"live"`. The live and genuinely-sandbox
cases are unchanged; only a broken or absent token's outcome moves, from "treat as sandbox"
to "treat as live". Under `"live"`, the sandbox-row query is skipped entirely, so a stray
sandbox row can never surface, and the always-run live-row query (§2.3) still correctly
resolves a genuine live subscriber, or Free if none exists — never a fabricated "healthy"
read from an unreadable token. No new "unavailable" state is needed; both consumers already
behave correctly off the existing two-value type once the fallback direction is corrected.

---

### 3.4 Map the repository label to Paddle's SDK value — added in revision 4 (Codex P1)

This repository's label for the production billing environment is **`live`**. Paddle.js's
`Paddle.Environment.set(...)` takes **`"sandbox"` or `"production"`**. They are not the same
string. **Corrected in revision 7** — the original citation for this risk was
`src/pages/Upgrade.tsx:76`, which §2.2 now excludes from live scope; the actually-relevant
call site is worse, not better: `src/lib/paddle.ts:174` calls
`(window as any).Paddle.Environment.set("sandbox")` — an explicit `any` cast, which
suppresses type checking entirely rather than merely widening it to `string` — so passing
`"live"` **type-checks cleanly and fails only at runtime**, during the atomic switch, which
is the worst possible moment to find out. `src/lib/paddleConfig.ts:77` already treats `"live"`
and `"production"` as distinct strings, so the distinction is real in this codebase.

Introduce one explicit mapping (`live` → `production`, `sandbox` → `sandbox`) at the single
live-scope call site in `src/lib/paddle.ts`, and assert the exact SDK argument in tests, not
just the resolver output.

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

### 3.5.1 `blocked` conflates two different failures — added in revision 5 (Codex P1), scope corrected in revision 11 (Codex P2)

**Revision 4 fixed the global case and left the per-SKU case standing — the same "fix the
pointed-at instance, not the class" failure this document's own §10 already names.**
**Revision 5's own fix then overclaimed the shape of the per-SKU case it was fixing —
`blockedReason` is not reliably SKU-scoped, and the corrected version below fixes the
derivation, not just the shape.**

`Pricing.tsx:253-255` computes `blocked: Boolean(checkoutRecoveryReason)`, where
`checkoutRecoveryReason = blockedReason ?? unavailableMessage`. `unavailableMessage` is a
global environment problem. Revision 5 treated `blockedReason` as the SKU-scoped
counterpart — it is not, reliably. `usePaddleCheckout.ts` sets it from three separate call
sites, and only one is genuinely scoped to the SKU that failed:

- **`:138`**, inside `openCheckout`'s fail-closed gate, before any SKU or catalog
  resolution runs: `setBlockedReason(getCheckoutUnavailableMessage())`. Global, identical
  in shape to `unavailableMessage`.
- **`:244`**, inside the `catch` block, for **either** `PaddleCheckoutUnavailableError`
  **or** `PaddleCheckoutCatalogUnavailableError`: `setBlockedReason(err.message)`. The
  first is global — its own telemetry line two lines above maps it to the reason token
  `"checkout_env_unavailable"`, not a SKU-specific one. The second is **mixed-scope, not
  SKU-scoped** (corrected in revision 15, Copilot): its `reason` spans plan-specific
  failures, a pack-eligibility failure that blocks both pack CTAs, and shared resolver
  failures — the derivation below splits them. Both error types funnel through this one
  call site and one state variable, so nothing downstream can tell any of this apart.
- **`:246`**, the catch-all `else`: `setBlockedReason(CHECKOUT_RECOVERY_MESSAGE)`, for any
  other thrown error — Paddle.js failing to load or initialize, a network failure. Also
  global.

So `blockedReason` is never reliably SKU-scoped on its own: two of the three call sites
are global, and the third is mixed-scope by reason.
`Pricing.tsx` cannot see which: its `useEffect` (`:388-403`) unconditionally runs
`setBlockedSku(lastCheckoutSkuRef.current)` whenever `blockedReason` transitions truthy, no
matter which of the three fired. `isSkuBlocked()` already has a fail-closed branch written
for exactly this ambiguity (`if (blockedSku === null) return true`, `:250`, with a comment
explaining an unattributed failure must block the whole page) — but it can never engage,
because `blockedSku` is always bound to a specific SKU by the time `isSkuBlocked` runs. The
defense is real; what reaches it is not.

Under a live environment where Paddle.js itself fails to initialize — no SKU involved at
all — this document's revision-5 fix would still bind the failure to whichever SKU button
the grower happened to click last, and leave every _other_ SKU's copy claiming a real
charge is possible, which is simply false: nothing can charge until Paddle re-initializes.
That is the identical mislabeling revision 5 set out to fix, produced by the fix itself.

**The corrected fix keeps revision 5's shape and moves where it is decided.**
`blockedScope: "environment" | "pack" | "sku" | null` cannot be inferred in `Pricing.tsx`
from which state variable happens to be non-null — it must be set in
`usePaddleCheckout.ts`, alongside `blockedReason`, at the same three call sites. **And
within the `PaddleCheckoutCatalogUnavailableError` branch, the scope derives from the
error's `reason`, not from the class — corrected in revision 14 (Codex P2), scope set
corrected in revision 15 (Copilot).** The class itself is not SKU-scoped, and the reasons
are not all single-SKU either:

- `"sku"` — `unknown_plan`, `price_not_configured`, `plan_sold_out`: each is a statement
  about the one requested plan.
- `"pack"` — `pack_requires_monthly_plan`: the gate is the **user's entitlement**
  (`creditPackPurchaseEligible`), not the clicked SKU, so it holds for every entry in
  `CREDIT_PACK_IDS` at once. Scoping it to the last-clicked pack would leave the other
  pack's CTA falsely available. `Pricing.tsx` blocks all pack CTAs and leaves
  subscription CTAs live.
- `"environment"` — `price_resolution_unavailable` **and any unrecognized reason**,
  fail-closed. This reason's sub-cases cannot be told apart client-side: missing Supabase
  configuration (500), entitlement-lookup failures on the pack-eligibility path (503),
  and upstream/gateway or config-drift failures (502). Some of those (an entitlement
  lookup) do not prove the subscription prices are down — environment-wide blocking is
  **deliberately over-broad**: over-blocking never shows false "a real charge is
  possible" copy, under-blocking does, and only one direction is a Hard Safety violation.
  The cleaner design — distinct reason codes, or an explicit affected-scope field
  returned by `get-paddle-price` — needs a server change this client-only slice
  deliberately excludes; it is recorded here as the follow-up if the owner widens scope.

The two non-catalog call sites stay `"environment"` as revision 11 said.
`Pricing.tsx` then binds `blockedSku` only when the hook reports `"sku"`, and
`isSkuBlocked()`'s existing fail-closed default finally does what its own comment already
says it should for a genuinely unattributed failure — global, page-wide, never narrowed to
one chargeable-looking SKU by mistake. Global environment failures keep today's
`UNAVAILABLE_COPY` unchanged.

## 4. File-level plan (Stage B only)

| File                                                          | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/paddleEnvironment.ts`                                | Canonical-production-host predicate; rewrite `resolvePaddleCheckoutEnvironment` per §3.1; replace `CHECKOUT_UNAVAILABLE_LOCALHOST_MESSAGE`, whose copy asserts the sandbox-only policy and would become false; update module header                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `src/lib/paddle.ts`                                           | Gates 2, 3, 4 of §2.2: `initializePaddle()` accepts the resolved environment; `Paddle.Environment.set(...)` takes the **mapped SDK value** (§3.4), never the raw resolved value; `getPaddlePriceId()` accepts it **and** stops hardcoding `environment: "sandbox"` in its request body. Plus `getPaddleEnvironment()` per §3.3, `getCheckoutUnavailableMessage()`, and the module header                                                                                                                                                                                                                                                                          |
| `src/pages/Upgrade.tsx`                                       | **NOT in live scope — corrected in revision 7 (Codex P2).** `canonical-checkout-ownership.test.ts` proves `/upgrade` redirects to `/pricing` and never mounts this presenter; `paddleConfig.ts` is the deprecated BYO sandbox path that explicitly refuses live/production configuration by design. Mapping its hardcoded `Environment.set("sandbox")` to live would either weaken a legacy fence meant to stay sandbox-only or create an unreachable branch. Leave unchanged                                                                                                                                                                                     |
| `src/lib/checkoutTrustCopyRules.ts` + `src/pages/Pricing.tsx` | **Hard Safety — see §3.5 and §3.5.1.** Add a `live` trust state; distinguish a global environment failure from a single blocked SKU so the other SKUs' copy never falls back to "no real charge is possible"; `Pricing.tsx:253` already feeds the resolved environment in; `Pricing.tsx`'s blocked-SKU binding effect (`:388-403`) must key off the hook's `blockedScope`, not off `blockedReason` alone (§3.5.1, corrected in revision 11)                                                                                                                                                                                                                       |
| `src/hooks/usePaddleCheckout.ts`                              | Gates 5 and 6 — `:124` and `:137` stop comparing to the literal `"sandbox"`. **Corrected in revision 11 (Codex P2), see §3.5.1:** also expose `blockedScope: "environment" \| "pack" \| "sku" \| null` alongside `blockedReason`, set at the same three `setBlockedReason` call sites (`:138`, `:244`, `:246`) — and **within** the catalog-error branch, derived from the error's `reason`, not the class (revisions 14-15): `"sku"` for `unknown_plan` / `price_not_configured` / `plan_sold_out`; `"pack"` for `pack_requires_monthly_plan` (blocks every `CREDIT_PACK_IDS` CTA); `price_resolution_unavailable` and any unrecognized reason → `"environment"` |
| `src/constants/*Copy.ts`                                      | Blocking copy pinned as data per repo convention, not inline in JSX                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `scripts/e2e/managed-session-materialize-core.mjs`            | **Mandatory** (§2.4): re-point `evaluatePublicPaddleBundle` at the new policy, keeping an equal-strength assertion                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `.github/workflows/quicklog-smoke.yml`                        | **Mandatory, and the harder half — see §2.4.1.** The workflow, not the evaluator, is where the expected token comes from                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `scripts/assert-paddle-production-sandbox.mjs`                | **No code change — corrected in revision 11 (Codex P1), see §3.2.** The revision-7 proposal to read server-side `PAYMENTS_ENVIRONMENT` from this build script is infeasible (that value is a Supabase secret, unreachable from `prebuild`). The script's existing unconditional exact-match check is already correct and stays as-is; the live-class requirement for the Stage C release artifact moves to a verification sub-step of **§6 item 0**, run by the operator executing the release, not to this script                                                                                                                                                |
| `supabase/functions/get-paddle-price/index.ts`                | **Mandatory — added in revision 9 (Codex P2), see §2.1 and §6 item 3.** Read environment-scoped price-ID variables (new live-scoped names) instead of the flat `PADDLE_PRICE_*` set `paddle-webhook` also reads, so switching `get-paddle-price` to live catalog IDs cannot silently break the legacy sandbox audit lane's price-ID classification. Mechanical: no authorization-logic change                                                                                                                                                                                                                                                                     |

No schema. No migration. No RLS. **One small, mechanical edge-function change (§2.1, §6 item 3)** — no new business logic. No new route.

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
9. `getPaddleEnvironment()` → `"sandbox"` for a valid `test_`-class token, `"live"` for
   everything else — **direction corrected in revision 11 (Codex P2)**: a live token,
   **and** a missing or malformed one, both resolve `"live"`, never `"sandbox"` (§3.3)
10. bundle attestation accepts the intended live token, rejects a mismatched token class, **and
    rejects a second, distinct live token of the same class** — a class-only check would let a
    valid-looking `live_...` token from the wrong Paddle account pass (§2.4.1, added in
    revision 5, Codex P2)
11. **the exact argument passed to `Paddle.Environment.set` is `"production"` under live and
    `"sandbox"` under sandbox** — assert the SDK value at the single live-scope call site
    (`src/lib/paddle.ts`), not just the resolver output (§3.4, corrected in revision 7 — not
    `Upgrade.tsx`, which stays out of live scope per §2.2)
12. `buildCheckoutTrustCopy` returns a live state under `"live"` whose copy states a real charge WILL be made, with `canCreateLiveCharge` true (§3.5) — prove RED before the fix
13. **live environment, one SKU blocked by a runtime catalog failure** → that SKU's copy
    reflects the block while every other, still-chargeable SKU's copy keeps stating a real
    charge will be made; **and, corrected in revision 11 (Codex P2): a live environment where
    Paddle.js itself fails to initialize or load — no SKU-specific catalog call involved —
    must resolve `blockedScope: "environment"`, never `"sku"`, even when a SKU button was the
    last one clicked** — the environment-failure and SKU-failure causes must not collapse to
    one `blocked` boolean, and must not be told apart by inferring from which state variable
    happens to be set (§3.5.1, added in revision 5, Codex P1); **and, corrected in revisions
    14-15: a `PaddleCheckoutCatalogUnavailableError` carrying
    `price_resolution_unavailable` — a shared resolver outage, not a plan failure — must
    resolve `blockedScope: "environment"`, as must any unrecognized reason; and one
    carrying `pack_requires_monthly_plan` must resolve `"pack"`, blocking both
    `CREDIT_PACK_IDS` CTAs while subscription CTAs stay live** — prove RED before the fix
14. determinism: repeated calls with identical inputs agree
15. **not an automated code test — corrected in revision 11 (Codex P1).** §3.2's original
    framing asked for a build-time assertion against server-side `PAYMENTS_ENVIRONMENT`,
    which is unreachable from the build and cannot be exercised by a RED-before-fix test.
    What replaces it is a manual verification, run by the operator as part of executing §6
    item 0: confirm the committed `.env.production` token is live-class before proceeding to
    set `PAYMENTS_ENVIRONMENT=live` in the same coordinated pass. `assert-paddle-production-sandbox.mjs`
    itself needs no new test — its existing exact-match coverage is unchanged (§3.2)
16. **`get-paddle-price` reads its live-scoped price-ID variables independently of the flat
    `PADDLE_PRICE_*` names** — and `paddle-webhook`'s sandbox price-ID classification for
    `pro_monthly`, `pro_annual` and `founder_lifetime` is unaffected by the live-scoped
    variables being set — regression, proving the legacy audit lane survives Stage C
    (§2.1, §6 item 3, added in revision 9, Codex P2) — prove RED before the fix
17. **with the production server live and the shipped client token missing or malformed, a
    user holding only a stray sandbox-class `public.subscriptions` row resolves to Free, not
    entitled** — `getPaddleEnvironment()` returning `"live"` for the broken token must skip
    the sandbox-row query entirely in both `useMyEntitlements.ts` and
    `usePaddleCancelNotice.ts` (§3.3, added in revision 11, Codex P2) — prove RED before the
    fix

Prove 1, 2, 3, 7, 8, 10, 11, 12, 13, 16 and 17 **RED before the fix** and put the failing
count in the PR body, per `AGENTS.md`. **Test 15 is removed from this list, corrected in
revision 11 (Codex P1)** — it is a manual operator checklist item (§6 item 0), not code, and
has no RED state to prove. Tests 12, 13, 16 and 17 are the Hard Safety / paid-without-entitlement /
audit-continuity fences — none may ever be skipped; item 0's manual verification carries the
same never-skip weight for the same reason, enforced by the release checklist rather than a
test runner.

## 6. Owner-gated prerequisites (Stages A and C — none of this is agent work)

Governed by `docs/paddle-paid-launch-runbook.md`; this list is its client-relevant subset.

**Ordering, restated because revision 3 got it wrong in this very section:** items 0–5 are
staged in Stage B and applied **only** in the atomic Stage C switch, together with the client
changes in §4. **Do not apply any of them ahead of the client release** — that recreates the
sandbox-client / live-catalog hybrid §1 and §7 both reject.

0. **Commit the live-class production client token to `.env.production` — added in revision 8
   (Codex P1), see §2.4.1; certainty corrected in revision 11 (Codex P2).** #1127 restores
   `.env.production` from `HEAD` before the build runs. **Revision 8 said this "removed" the
   publish-time-injection path; that is withdrawn — §2.4.1 now records it as `NOT_MEASURED`**,
   since `HEAD` may itself already carry an injected value if the publisher commits its
   workspace after injecting (open question, unresolved on both this spec and
   `CURRENT_STATE.md`). Committing the token directly is still required regardless of how
   that question resolves — it is the one path this document can currently verify with
   confidence, just not provably the _only_ one. An ordinary public client token, safe to
   commit per its own design (§3 — it ships in the browser either way), but it is still a
   live-launch decision, not a drive-by edit: land it as part of the same coordinated Stage C
   release, not ahead of it.
   **Also carries the §3.2 verification, added in revision 11 (Codex P1):** immediately
   before proceeding to item 1 (setting `PAYMENTS_ENVIRONMENT=live`), confirm the token just
   committed here is live-class. This is the only enforcement point for §3.2's requirement —
   `assert-paddle-production-sandbox.mjs` cannot see server state and is not extended to try
   (§3.2, §4).
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
3. Live price IDs. **Corrected in revision 9 (Codex P2) — not the same flat variable names
   used today.** `get-paddle-price/index.ts:49-55` currently reads `PADDLE_PRICE_PRO_MONTHLY`,
   `PRO_ANNUAL`, `CRAFT_MONTHLY`, `CRAFT_ANNUAL`, `FOUNDER_LIFETIME`, `CREDIT_PACK_50`,
   `CREDIT_PACK_150` — one flat, environment-unaware set. The legacy `paddle-webhook`
   (`index.ts:63-67`) reads the **identical names** for three of the seven
   (`PADDLE_PRICE_PRO_MONTHLY`, `_PRO_ANNUAL`, `_FOUNDER_LIFETIME`) to classify **incoming
   sandbox** events by price ID (`index.ts:266-288`). Repointing those three at live IDs, as
   originally written here, would make every legitimate sandbox audit event for those three
   plans resolve to `unknown_price_id` and be dropped — silently breaking the operator-audit
   lane §2.5 and §6.1 both say must remain functional, while `craft_monthly`, `craft_annual`
   and the two credit packs have no such collision (`paddle-webhook` never reads those four).
   **Introduce environment-scoped variable names** (e.g. a dedicated live-scoped set) for
   `get-paddle-price`'s Stage C configuration; the existing flat names keep their current
   values, so `paddle-webhook`'s sandbox mappings are untouched. See §2.1 and the new §4 row
   for `get-paddle-price/index.ts`. Unset live values return `price_not_configured` and
   checkout blocks calmly, unchanged from today.
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
billing); `paddle-webhook`'s sandbox-only gate (§2.5 — correct, leave it); schema, RLS,
migrations; publishing.

**No longer out of scope:** buyer-facing checkout trust copy — revision 3 excluded it, §3.5
brings it in as Hard Safety scope. **The §3.2 production-with-sandbox-token signal —
corrected in revision 9 (Codex P2), it was left listed here after revision 7 made it
mandatory scope**, contradicting the new §4 row and RED-first test 15 two sections earlier
in the same document. Removed from this list.

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

| #   | Finding                                                                                                                                                            | Disposition                                                                                                                                                                                                 |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 11  | Passing the resolved `"live"` straight to `Paddle.Environment.set` is invalid — the SDK takes `"production"` — and the loosely typed global hides it until runtime | **Conceded.** New §3.4 mapping; test 11 asserts the SDK argument. Also surfaced a would-be **seventh** gate, `Upgrade.tsx:131` — **later removed from live scope in revision 7 (Codex P2); see that table** |
| 12  | Pricing copy cannot be out of scope: `buildCheckoutTrustCopy` has no live state, so a buyer would be told "no real charge is possible" while being charged         | **Conceded — Hard Safety.** New §3.5; removed from §8; test 12 is a mandatory RED-first fence                                                                                                               |
| 13  | §6 still said "Stage 0" and "Stage 1", so an operator following it would still switch the server before the client                                                 | **Conceded.** Stage vocabulary swept across §2.1, §3.2, §4 and §6                                                                                                                                           |

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

### Revision 7 — Codex, 2 findings, both correct

| #   | Finding                                                                                                                                                                                                                                                                                                                          | Disposition                                                                                                                                                                                                              |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 18  | **P1.** §3.2 treated a `test_` token surviving on production after Stage C as a deferrable residual. It is not — once the server is live, `get-paddle-price` ignores the client environment and returns live catalog IDs regardless, so a stale sandbox client token reproduces the exact broken hybrid §1 and §7 already forbid | **Conceded.** §3.2 rewritten to require enforcement within Stage C, not a follow-up slice; new §4 row for `assert-paddle-production-sandbox.mjs`; new RED-first test 15                                                  |
| 19  | **P2.** `src/pages/Upgrade.tsx` was scoped into live-mapping work (§2.2 gate 7, §3.4, test 11) even though it is a retired, unmounted presenter reading a deliberately sandbox-only, `@deprecated` config module that refuses live/production by design                                                                          | **Conceded.** Removed from live scope in §2.2 (kept visible, marked excluded), §3.4 (citation corrected to the real call site, `paddle.ts`'s `as any` cast — an even stronger example of the same risk), §4, and test 11 |

**Nineteen findings across six rounds, nineteen correct.** Finding 18 is the second
"deferred residual is actually the central failure mode" catch in this document (finding 8,
Stage 0 sequencing, was the first) — this spec's own executive framing in §1 should have
caught it directly, since §3.2 restates §1's exact hybrid with the roles of client and
server reversed. Finding 19 shows revision 4 extended a real risk pattern (loosely-typed SDK
values) to a file that pattern-matched but was never actually reachable — verifying scope
against the route table, not just the source text, would have caught it before revision 4
shipped.

### Revision 8 — Codex, 2 findings, both correct; one conceded as an unresolved gap, not fixed

| #   | Finding                                                                                                                                                                                                                                                                                                                                                                                      | Disposition                                                                                                                                                                                                       |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 20  | **P1.** §2.4.1 said the live token "never exists in the repository" because Lovable injects it at publish. Parent commit #1127 (merged to base while this PR was open) neutralizes that: `restore-env-production-from-head.mjs` now runs first in `prebuild` and unconditionally restores `.env.production` from `HEAD`, discarding any publish-time injection before the guard or build run | **Conceded.** §2.4.1 corrected; new §6 item 0 requires committing the live token to `.env.production` directly, since injection no longer reaches the shipped bundle                                              |
| 21  | **P1.** "Switch ALL of Stage B atomically" names a property with no executable mechanism specified: Lovable (client), the Supabase operator surface (server env/secrets), and Paddle's own dashboard (notifications) are three independent systems with no shared transaction found in this repository                                                                                       | **Conceded as a real, unresolved gap — not designed here.** Flagged in §1 alongside Stage A's isolated-deployment gap, with the same "owner decision, not this spec's to invent" framing, not a proposed protocol |

**Twenty-one findings across seven rounds, twenty-one correct.** Finding 20 closes a loop this
PR opened on itself: merging #1127 in (to clear a `behind` state) surfaced the very
information that made revision 6's `CURRENT_STATE.md` correction more precise, and now shows
this spec's own token-delivery premise needed the identical correction. Finding 21 is
deliberately **not** fixed the way 1–20 were — Codex asked for a specified cutover mechanism,
and inventing one now would be exactly the kind of design-by-reviewer-comment this document
warns against elsewhere (§1's own treatment of Stage A). It is recorded as a conceded,
open gap for whoever owns Stage C's implementation, on the same footing as Stage A.

### Revision 9 — Codex, 2 findings, both correct

| #   | Finding                                                                                                                                                                                                                                                                                                                             | Disposition                                                                                                                                                   |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 22  | **P2.** §8 still listed "the §3.2 production-with-sandbox-token signal" as out of scope, contradicting revision 7's own change two sections earlier — a mandatory §4 file-level-plan row and RED-first test 15 for the exact same case                                                                                              | **Conceded.** Removed from §8's out-of-scope list; the two sections now agree                                                                                 |
| 23  | **P2.** §6 item 3 and §2.1's "no server-code change" claim missed that `get-paddle-price` and the legacy `paddle-webhook` read the identical flat `PADDLE_PRICE_PRO_MONTHLY`/`_PRO_ANNUAL`/`_FOUNDER_LIFETIME` variables; repointing them at live IDs would silently break sandbox audit-event classification for those three plans | **Conceded.** §2.1 narrowed; §6 item 3 requires environment-scoped variable names instead; new §4 row for `get-paddle-price/index.ts`; new regression test 16 |

**Twenty-three findings across eight rounds, twenty-three correct.** Finding 22 is
self-inflicted — a direct consequence of fixing §3.2 in revision 7 without checking every
place that referenced the old framing. Counted precisely rather than asserted: this is the
**third** named instance of "fixed the pointed-at instance, not the class" in this record
(finding 13, then finding 14 citing it explicitly, now this one) — worth naming as a count
rather than a round number, since an approximate one would repeat the exact failure mode it
describes. Finding 23 retracts this document's "no server-code change" claim for the first
time — a small, mechanical fix, but a reminder that a blanket scope claim this far into a
document's own audit is still worth reading skeptically instead of trusting the summary
line.

### Revision 10 — Codex, 1 finding, correct; conceded as a third open gap, not fixed

| #   | Finding                                                                                                                                                                                                                                                                                                             | Disposition                                                                                                                                                                                                            |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 24  | **P2.** §3.2's build-time guard only covers the production bundle. `.env` targets production Supabase while `.env.development` supplies a sandbox token; local/preview dev never runs `prebuild`, so any authenticated local or preview session would hit the same broken hybrid once Stage C goes live server-side | **Conceded as an open gap — not designed here.** New §3.2.1, alongside §1's Stage A and cutover-mechanism gaps; every fix option is an infrastructure or security-relevant server change outside this spec's authority |

**Twenty-four findings across nine rounds, twenty-four correct.** This is the third
finding conceded rather than fixed, and the pattern connecting all three is now visible
rather than incidental: every one of them is a place where closing the gap requires a
decision — an infrastructure choice, a new cross-system protocol, a change to what the
server is allowed to trust — that belongs to whoever owns Stage C, not to a docs correction
answering a review comment. Stopping here rather than continuing to trace every remaining
consequence of "the server ignores client-supplied environment" (§2.1) is itself a
judgment call, made explicit rather than left implicit: this spec's own verdict already says
correctness depends on server configuration it cannot verify, and each of these three gaps
is a fresh instance of exactly that limit, not a new one.

### Revision 11 — Codex, 3 findings, all correct; all fixed, none newly conceded

| #   | Finding                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Disposition                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 25  | **P2.** Revision 8's §2.4.1/§6 item 0 claim that #1127 "removed" the publish-time-injection path treated `HEAD` as necessarily meaning the GitHub-tracked commit. `CURRENT_STATE.md`'s own 2026-08-25 19:48 UTC re-measurement — production serving an orphan commit unknown to GitHub — shows the publisher commits its workspace locally, so `HEAD` may already carry an injected value before `restore-env-production-from-head.mjs` ever runs; whether injection happens before or after that local commit is unmeasured on both documents | **Corrected.** §2.4.1 walked back from "removed" to `NOT_MEASURED`; §6 item 0 updated to match. The instruction to commit the token directly is unchanged and still required either way — only the certainty that it is the _only_ path is withdrawn                                                                                                                                                                                                                                                                    |
| 26  | **P2.** §3.5.1's fix (revision 5) assumed `blockedReason` is reliably SKU-scoped. `usePaddleCheckout.ts` sets it from three call sites (`:138`, `:244`, `:246`); only the `PaddleCheckoutCatalogUnavailableError` branch is genuinely SKU-scoped, the other two are global failures funnelled through the same variable, and `Pricing.tsx` binds every one of them to the last-clicked SKU regardless of cause                                                                                                                                 | **Fixed.** §3.5.1 rewritten; a new `blockedScope` field must be set on the hook itself, at the same three call sites, rather than inferred downstream from which variable is non-null; §4 rows for `usePaddleCheckout.ts` and `Pricing.tsx` updated; test 13 extended with the negative case                                                                                                                                                                                                                            |
| 27  | **P1.** §3.2's enforcement proposal (revision 7) — extend `assert-paddle-production-sandbox.mjs` to fail when server-side `PAYMENTS_ENVIRONMENT` is live and the shipped token is not — cannot be built. That variable is a Supabase Edge Function secret, absent from every committed env file, and unreachable from a Node build script                                                                                                                                                                                                      | **Fixed.** §3.2 rewritten: the standing guard is unchanged (it needs no server read and already does the right thing); the live-class requirement moves to a manual verification inside §6 item 0, run by the operator at cutover; test 15 converted from an automated RED-before-fix test to a manual checklist item, removed from the RED-before-fix list; the residual (a later, independent, post-cutover regression) is named as an instance of finding 21's already-conceded cutover-mechanism gap, not a new one |

**Twenty-seven findings across ten rounds, twenty-seven correct.** Unlike revision 10, all
three findings here are fixed, not conceded — the open-gap count stays at **three** (Stage
A's isolated-deployment design, the cross-platform cutover mechanism, local/preview dev),
not four; finding 27's residual is finding 21's cutover-mechanism gap recurring after the
fact, not a new instance of anything. Findings 25 and 27 share a theme worth naming
precisely rather than leaving incidental: both are places this document treated a mechanism
as certain or buildable without checking what the enforcement point could actually observe
from where it runs — a companion document's own later measurement, in 25's case; a Supabase
secret's actual reachability from a build script, in 27's. Finding 26 is counted precisely
rather than asserted, because an approximate count would repeat the exact failure it
describes: it is the **fourth** named instance of "fixed the pointed-at instance, not the
class" in this record (finding 13, then 14, then 22, now this one) — revision 5 fixed the one
genuinely SKU-scoped cause of `blockedReason` and treated it as the whole class, the same
failure shape three earlier findings already named under this exact heading.

### Revision 12 — Codex, 2 findings, both correct

| #   | Finding                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Disposition                                                                                                                                                                                                                                                                                                                                                                                                                 |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 28  | **P2.** §3.3's original rule (`live_` → `"live"`, else → `"sandbox"`) puts a missing or malformed production token in the `"sandbox"` bucket. `LovableBillingEnvironment` has no third state, and both `useMyEntitlements.ts` and `usePaddleCancelNotice.ts` gate their sandbox-row query on that bucket — so after Stage C, a broken token would let a stray sandbox-era subscription row display a grower as entitled while the authoritative live server correctly considers them Free    | **Fixed.** §3.3 rewritten: the fallback direction inverts — `test_`-class → `"sandbox"`, everything else (live, missing, or malformed) → `"live"` — so a broken token skips the sandbox query entirely rather than defaulting into it; test 9 corrected, new regression test 17                                                                                                                                             |
| 29  | **P2.** `CURRENT_STATE.md`'s 19:48 UTC block treats "`git fetch origin <sha>` → not our ref" as proof the publisher "commits its workspace locally" — that fetch result proves only the SHA is absent from the remote, not the causal mechanism that put it there, and the same unproven premise is reused two sections later to reason about token-injection ordering, exactly the "inference presented as conclusion" pattern this record already names as recurring across both documents | **Corrected.** Both passages walked back to `NOT_MEASURED` on the causal mechanism; the observation itself (SHA unrecognized by GitHub) is unaffected and stays as measured. Also noted: finding 25's own disposition text, written one revision earlier in this very table, restates the same unproven "commits its workspace locally" framing without hedging — propagation into a correction, not just into the original |

### Revision 13 — Codex, 1 finding, correct

| #   | Finding                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Disposition                                                                                                                                                                                                                                                                                                                            |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 30  | **P2.** §2.4.1's body still called the unrecognized served SHA "proof the publisher commits its workspace locally" — the same causal overclaim findings 25 and 29 walked back in `CURRENT_STATE.md` and in this table, surviving in the one place revision 12's sweep missed. The fetch failure proves only that GitHub lacks the object; it cannot distinguish a publisher-local commit from a rebase, squash, or other reconstruction, so reasoning about injection-vs-`HEAD` ordering from it repeats the pattern this record names as recurring | **Corrected.** §2.4.1 rewritten to the same footing as the finding-29 walkback: the observation (SHA unrecognized) stays measured, the mechanism is `NOT_MEASURED`, and the injection-ordering question is stated conditionally on whatever `HEAD` resolves to in the publisher's build context rather than on an assumed local commit |

### Revision 14 — Codex, 1 finding, correct

| #   | Finding                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Disposition                                                                                                                                                                                                                                                                                                                                                                                 |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 31  | **P2.** §3.5.1's revision-11 rule scoped the entire `PaddleCheckoutCatalogUnavailableError` branch as `"sku"`, but the class is not SKU-scoped: `get-paddle-price` returns `price_resolution_unavailable` for missing Supabase configuration (500) and gateway/API-key outages (503), and `getPaddlePriceId()` wraps those in the same class as the plan-specific reasons — so a shared resolver outage would leave every other CTA and its live-charge copy enabled while nothing can be served | **Fixed.** §3.5.1 scope derivation moved from the class to the error's `reason`: `"sku"` only for `unknown_plan` / `price_not_configured` / `plan_sold_out` / `pack_requires_monthly_plan`; `price_resolution_unavailable` and any unrecognized reason resolve `"environment"`, fail-closed — the direction the class's own doc comment already instructs; §4 hook row and test 13 extended |

### Revision 15 — Copilot, 3 findings, all correct

| #   | Finding                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Disposition                                                                                                                                                                                                                                                                                                        |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 32  | **P2.** Revision 14's reason-based rule was still unsound at both ends: `pack_requires_monthly_plan` gates on the user's entitlement, so it holds for every `CREDIT_PACK_IDS` entry at once and single-SKU scoping leaves the other pack CTA falsely available; and `price_resolution_unavailable` also covers entitlement-lookup failures (503) that do not prove subscription prices are down, while the gateway path is 502, not the 503 revision 14 wrote | **Fixed.** `blockedScope` gains `"pack"`; the derivation is now a three-way split with sub-cases and status codes verified at source; environment-wide stays the deliberate fail-closed treatment for `price_resolution_unavailable`, with the explicit-scope server design recorded as the out-of-slice follow-up |
| 33  | **P2.** The §3.5.1 setup still said "only one \[call site\] is genuinely scoped to the SKU that failed" while the corrected derivation below it says the same branch can be environment-wide — an implementer following the setup would apply the stale rule                                                                                                                                                                                                  | **Fixed.** Setup rewritten: the catalog branch is mixed-scope by reason; the summary line now says `blockedReason` is never reliably SKU-scoped on its own                                                                                                                                                         |
| 34  | **P2.** Findings 30 and 31 were appended as free-floating single-row tables separated from the revision-12 table by blank lines, so Markdown renders them as pipe-delimited paragraphs, not ledger rows                                                                                                                                                                                                                                                       | **Fixed.** Both moved under proper per-revision headings with full table structure, matching the record's own convention                                                                                                                                                                                           |

**Thirty-four findings across fourteen rounds, thirty-four correct.** Revision 15 is the
record's pattern at its smallest: finding 32 is revision 14's fix inheriting a subtler form
of the conflation it corrected (a reason enum whose members are not uniformly scoped), 33
is a correction leaving its own setup contradicting it, 34 is the correction record itself
mis-rendering. Finding 31 is finding
26 one level deeper: revision 11 moved the scope decision off inference-from-variables onto
an explicit field, but seeded that field from a class name that itself conflates plan and
shared failures — the fix inherited the conflation it was correcting. Finding 30 is finding 29's
shape surviving its own correction sweep — the third consecutive time an overclaim
propagated into or past a correction, which is itself the strongest argument this record
makes for labelling inference as inference at first writing. The two revision-12 findings
are the same failure shape from opposite directions: 28 is a design defaulting the unsafe way
on an input nobody enumerated (a broken token, not just the two expected classes); 29 is a
narrative treating one confirmed observation as license for a broader causal story, then
reusing that story as a premise elsewhere — including, per finding 29's own disposition, one
revision back inside this document's own correction record. Neither is conceded; the open-gap
count stays at three.

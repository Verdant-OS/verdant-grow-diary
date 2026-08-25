# Spec — resolving the `PADDLE_ENVIRONMENT` live-transition conflict

**Status:** `PROPOSED — NOT APPROVED`. Specification only. No code in this slice.
**Author:** Claude (specification architect)
**Requested by:** Cheek, 2026-08-25, after #1125 flagged the conflict without resolving it.
**Measured at:** deploy tip `5e75a3a3a`, 2026-08-25 ~21:35 UTC.
**Slice owner:** unassigned — needs one owner and a **different** peer as independent
reviewer per `AGENTS.md`.

---

## 1. Executive recommendation

**The flagged conflict resolves in favour of the code. `docs/paddle-paid-launch-runbook.md`
line 136 is wrong and should be corrected.**

`PADDLE_ENVIRONMENT` must stay `sandbox` permanently for as long as the legacy BYO stack
exists. Setting it live gains nothing and costs the operator audit lane.

**But fixing that line is not the whole job, and the remaining half is the harder one.**
Auditing the conflict surfaced a _second_, unflagged collision that the runbook does not
address and that a live transition would trip silently — see §3. That one needs a code
change, not a documentation edit.

---

## 2. The flagged conflict — resolved

### 2.1 What the runbook says, and why it is wrong

`docs/paddle-paid-launch-runbook.md:136` lists, among the live-transition settings:
"legacy `PADDLE_ENVIRONMENT=live`". `supabase/functions/paddle-webhook/index.ts:672-676`
returns **403 `sandbox_only`** whenever `PADDLE_ENVIRONMENT !== "sandbox"`.

Four independent sources agree the code is right and the runbook line is stale:

1. **The runbook contradicts itself.** Its own release-gate item 3 (`:107`) requires the
   canonical webhook URL to point at **`payments-webhook` for both `env=sandbox` and
   `env=live`** — "this is what Lovable's built-in Paddle integration configures
   automatically". If both environments route to `payments-webhook`, then no live traffic
   ever reaches `paddle-webhook`, and its selector has nothing to select.
2. **The runbook's own secrets table** (`:90`) already says `PADDLE_ENVIRONMENT` is used by
   "paddle-webhook (**must be `sandbox` until live approval**)" — the table and line 136
   disagree with each other.
3. **The function's header states it outright:** _"this file is NOT the canonical Lovable
   Stack A webhook … It is deliberately sandbox-only — a live payload arriving here would
   be refused by the environment gate below, **since no registered live endpoint routes into
   this function**."_
4. **`docs/billing.md:75`** classes `PADDLE_ENVIRONMENT` under "(Legacy, still read by the
   BYO audit sink)".

`established fact` — all four verified at `5e75a3a3a`.

### 2.2 What setting it live would actually do

Nothing good, and one bad thing. No live endpoint routes into `paddle-webhook`, so the
setting cannot enable anything. It would, however, **403 every sandbox event**, silently
starving the three operator audit surfaces that read the tables this function maintains
(`paddle_events`, `paddle_event_processing`, `billing_customer_links`):

- `src/pages/OperatorPaddleProcessingAudit.tsx`
- `src/pages/OperatorBillingSubscriptionUpdateAudit.tsx`
- `src/pages/OperatorBillingEntitlementResolutionAudit.tsx`

All three verified present. The function writes **no** `public.subscriptions` row, so it
grants no entitlement — consistent with `AGENTS.md`, which says
`public.billing_subscriptions` "must never grant an entitlement".

### 2.3 The gate is deliberate, and fenced

Three static tests pin it. Any change to the gate breaks them, which is the intended
signal — they exist so this cannot be relaxed quietly:

| Test                                                            | Assertion                                          |
| --------------------------------------------------------------- | -------------------------------------------------- |
| `src/test/paddle-readiness.test.tsx:167`                        | "refuses when `PADDLE_ENVIRONMENT` is not sandbox" |
| `src/test/paddle-paid-launch-gate-static.test.ts:38`            | matches `/PADDLE_ENVIRONMENT !== "sandbox"/`       |
| `src/test/paddle-webhook-subscription-update-static.test.ts:65` | asserts the gate precedes subscription handoff     |

**Do not touch the gate or these tests.** The fix is entirely on the documentation side.

---

## 3. The second conflict — NOT flagged before, and not solvable by documentation

**`paddle-webhook` and `get-paddle-price` read the same three environment variable names,
and at live transition they need them to hold different values.**

| Variable                        | `get-paddle-price` (`:49-53`)                             | `paddle-webhook` (`:63-66`)    |
| ------------------------------- | --------------------------------------------------------- | ------------------------------ |
| `PADDLE_PRICE_PRO_MONTHLY`      | catalog lookup, selected by server `PAYMENTS_ENVIRONMENT` | plan classification for events |
| `PADDLE_PRICE_PRO_ANNUAL`       | same                                                      | same                           |
| `PADDLE_PRICE_FOUNDER_LIFETIME` | same                                                      | same                           |

At a live transition `get-paddle-price` needs **live** price IDs in those names. But
`paddle-webhook` stays pinned to sandbox (§2) and uses the same names to match **sandbox**
event price IDs.

**The runbook states the constraint that this violates and does not notice the collision.**
Line 100: _"All three Paddle price IDs must belong to the SAME Paddle environment as the
webhook secret and `PADDLE_ENVIRONMENT`."_ With `PADDLE_ENVIRONMENT` pinned sandbox, that
requires sandbox IDs; `get-paddle-price` at live requires live IDs. **Both constraints
cannot hold with one set of names.**

### 3.1 The failure is silent, which is what makes it serious

`planFromPriceId` (`:267-271`) returns **`null`** when no configured ID matches — it does
not throw, log, or surface an error:

```ts
if (priceId && priceId === PADDLE_PRICE_CONFIG.pro_monthly) return "pro_monthly";
…
return null;
```

So after a live transition, every sandbox event recorded by the audit lane would carry
`candidate_plan_id: null`. The operator pages keep rendering; the data behind them quietly
becomes useless. Nothing fails closed, nothing alerts. `inference` — this is read from the
code path, not observed in a live transition, because none has occurred.

### 3.2 Options — owner decision, with a recommendation

| #     | Option                                                                                                                                                                                                        | Effect                                                       | Cost                                                                                                                                                                       |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A** | **Decouple the names — recommended.** Give `paddle-webhook` its own sandbox-scoped variables (e.g. `PADDLE_SANDBOX_PRICE_PRO_MONTHLY`), so it stays sandbox-correct regardless of what the live catalog holds | Audit lane keeps working through and after a live transition | One edge-function file, new secret names, updated runbook + `billing.md`, tests                                                                                            |
| B     | Retire the BYO stack                                                                                                                                                                                          | Removes the whole class of conflict permanently              | Large: three operator pages, their tables, migrations, and their tests. Its own slice                                                                                      |
| C     | Accept the degradation                                                                                                                                                                                        | No work now                                                  | The audit lane silently loses plan classification at live. Requires **explicit** owner acceptance and a recorded `NOT_MEASURED` → known-loss entry; never a silent default |

A is recommended because it is small, reversible, and preserves a surface the header says
is still actively read. **This spec does not choose** — B and C are legitimate if you intend
to retire the BYO stack anyway.

---

## 4. File-level plan

**Part 1 — the flagged conflict (documentation only, safe to do now):**

| File                                 | Change                                                                                                                                                                                                                                                                                               |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/paddle-paid-launch-runbook.md` | `:136` — remove `legacy PADDLE_ENVIRONMENT=live` from the live-transition list; replace with an explicit statement that it **stays `sandbox`**, and why (no live endpoint routes into `paddle-webhook`; setting it live 403s the sandbox audit lane). Reconcile `:100` with §3's outcome once chosen |
| `docs/billing.md`                    | Optional: note the selector is permanently sandbox while the BYO sink exists                                                                                                                                                                                                                         |

**Part 2 — the second conflict (only if Option A is chosen):**

| File                                                    | Change                                                                                                               |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `supabase/functions/paddle-webhook/index.ts`            | `:63-66` — read sandbox-scoped names, falling back to the current names so nothing breaks before the secrets are set |
| `docs/paddle-paid-launch-runbook.md`, `docs/billing.md` | Record the new secret names                                                                                          |
| `src/test/*`                                            | Cover the fallback and the decoupling (§5)                                                                           |

No schema. No migration. No RLS. **No change to the `PADDLE_ENVIRONMENT` gate or its three
static tests.**

## 5. Tests

Part 1 is documentation and needs no test. For Option A:

1. `paddle-webhook` classifies a sandbox price ID correctly when sandbox-scoped names are set
2. …and still does so via the legacy names when the new ones are absent (fallback) — prove RED before the fix
3. Live IDs in `PADDLE_PRICE_*` do **not** break sandbox classification once decoupled — this is the regression that motivates the slice; prove RED before the fix
4. The `PADDLE_ENVIRONMENT !== "sandbox"` gate still refuses — the three existing static tests must stay green, unmodified

## 6. Owner-gated decisions

1. **§3.2 — A, B, or C.** Nothing in Part 2 proceeds without this.
2. Whether the BYO stack is intended to survive at all. If it is being retired, Option A is
   wasted work and C is the honest interim.
3. Whether `:100`'s "same environment" constraint is rewritten (Option A) or narrowed to the
   BYO lane only.

## 7. Out of scope

The `PADDLE_ENVIRONMENT` gate itself and its three static tests; `payments-webhook`;
`PAYMENTS_ENVIRONMENT`; the client resolver and the live-checkout slice
(`docs/specs/paddle-live-checkout-runtime-slice.md`); schema, RLS, migrations; publishing.

## 8. Verdict

**The conflict as reported is a documentation defect with a one-line fix, and reporting it
that way would be incomplete.** The runbook line is stale and provably so from the runbook's
own release gate. But auditing it surfaced a second collision on shared `PADDLE_PRICE_*`
names that a live transition trips silently, degrading an operator audit surface with no
error. Correct the line now; decide §3.2 before any live transition, not during one.

Would a tired grower notice? No — and that is the point. Nothing user-facing breaks, which
is exactly why this needs deciding while it is cheap.

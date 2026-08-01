# Retry strategy by surface

**Status:** Product + engineering policy  
**Scope:** Which backoff strategy each Verdant surface uses — and which it must **not** use.

## Canonical map

| Surface                                     | Strategy                                     | Why                                                           |
| ------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------- |
| **Sensor bridge ingest**                    | **Full jitter exponential**                  | Many devices, outages, rate limits; automatic retries         |
| **Create-dialog Retry** (grow/tent binding) | **Fixed 1.5s cooldown + in-flight lock**     | Human click; fail-closed state machine; not a background loop |
| **React Query**                             | Library retries (expo/jitter under the hood) | Automatic query recovery for reads                            |
| **AI Doctor / export “Retry”**              | Mostly **human one-shot**                    | Cost, side effects, and grower control; no silent multi-fire  |

## Sensor bridge ingest — full jitter exponential

```text
delay = random(0, min(maxDelay, baseDelay × 2^attempt))
```

- **Docs:** [`docs/bridge-client-retry-guidance.md`](../bridge-client-retry-guidance.md)
- **Pure helper:** `fullJitterBackoffMs` in `src/lib/ecowittLiveSoilIngestRules.ts`
- **Max attempts / caps:** see bridge guidance (never retry forever)
- **Non-retryable:** auth, validation, intentional stale rejects

Bridge clients must **not** use a fixed 1.5s human cooldown as their only strategy under fleet outage.

## Create-dialog Retry — fixed cooldown + in-flight

Applies to Create Tent / Create Plant when:

- grow list `read_error` → **Retry** → `refreshGrows()`
- supplied tent `unavailable` → **Retry** → `refetchTents()`

| Rule                      | Value                                        |
| ------------------------- | -------------------------------------------- |
| Cooldown                  | `CREATE_BINDING_RETRY_COOLDOWN_MS = 1500`    |
| In-flight                 | Second click ignored until re-fetch settles  |
| Auto background retry     | **Forbidden**                                |
| Full jitter expo on click | **Not used** (unpredictable UX; wrong layer) |
| Insert while blocked      | **Forbidden** (fail closed)                  |

**Code:**

- Pure gate: `src/lib/createDialogRetryRules.ts`
- Hook: `src/hooks/useCreateBindingRetry.ts`
- Binding states: `src/lib/createDialogGrowBindingRules.ts`
- Copy: `src/constants/growSetupMessages.ts`

**After Retry:** re-enter the state machine only. Empty list + error stays `read_error` (Retry), never `no_setup` (Start your room).

## React Query

- Prefer framework defaults for **read** recovery.
- Do not layer a second silent expo loop on top of create-dialog human Retry.
- Mutations that create lineage (tent/plant insert) stay **explicit submit**, not auto-retried by a custom expo loop.

## AI Doctor / export Retry

- Labels like “Try once more” / “Retry export” are **grower-initiated**.
- Do not convert into unbounded automatic expo without a product decision.
- Never couple AI Doctor retry to device control or Action Queue auto-apply.

## Decision rules (when adding a new Retry)

```text
Automatic multi-client / bridge / webhook
  → full jitter exponential + max attempts + non-retryable taxonomy

Human button on fail-closed create UI
  → fixed short cooldown + in-flight (optionally later: click-gated soft expo)

Read cache recovery
  → React Query

Costly or advisory AI / PDF
  → human one-shot unless explicitly designed otherwise
```

## Anti-patterns

| Do not                                                | Why                                         |
| ----------------------------------------------------- | ------------------------------------------- |
| Full jitter on create hard-stop Retry                 | Feels random; still only re-reads authority |
| Fixed 1.5s only on Pi bridge fleets                   | Stampede + slow recovery                    |
| Auto-retry create inserts                             | Lineage risk without idempotency            |
| Treat grow `read_error` as `no_setup` after N retries | Duplicate setups                            |
| Infinite retry                                        | Battery, cost, and integrity risk           |

## Related

- Fail-closed create binding: [`docs/product/grow-binding-language.md`](./grow-binding-language.md)
- Bridge retry details: [`docs/bridge-client-retry-guidance.md`](../bridge-client-retry-guidance.md)

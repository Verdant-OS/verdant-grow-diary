# Billing reconciliation slice

**Decisions locked in from your answers:**
1. Canonical lane = **Lovable** (`payments-webhook` → `public.subscriptions`).
2. Scope = **reconcile-only** (no customer portal, no adjustment handling, no cap-hoist in this slice).
3. Narrow the live-union readers **now**.
4. Preview walkthrough = chat + committed `docs/paddle-sandbox-smoke.md` checklist.

Nothing outside the files listed is touched. No UI changes. No changes to `paddle-webhook` behavior (it stays as a sandbox-only audit sink). No client checkout changes. No AI Doctor / Action Queue / sensor / Pheno code.

---

## What "narrow" means when Lovable is canonical

The runbook was written assuming BYO would be canonical, so it framed the risk as trusting `subscriptions(env='live')`. With **Lovable canonical, the direction inverts**: `public.subscriptions` is the source of truth, and `public.billing_subscriptions` becomes an audit-only surface. The two SECURITY DEFINER gates (`has_pheno_tracker_entitlement`, `ai_credit_spend`) currently union both — after this slice they trust ONLY `public.subscriptions WHERE environment='live'`.

**Backfill safety net:** the runbook records one existing `billing_subscriptions` founder row of "unverified provenance." Dropping the BYO branch without action would revoke that row's access. The migration includes an idempotent, one-shot backfill that inserts any currently-entitling `billing_subscriptions` row into `public.subscriptions` as a `founder_lifetime` / `pro_*` row with `environment='live'` before the function bodies change, so no live entitlement is lost across the transition. The backfill is guarded by `ON CONFLICT (paddle_subscription_id) DO NOTHING` and only touches rows that resolve as entitling by the same `(status, current_period_end)` rules the RPCs use — no silent widening.

---

## Files changed

### Migration (one file, one transaction)
`supabase/migrations/<ts>_narrow_entitlement_gates_lovable_canonical.sql`

1. **Backfill first.** `INSERT INTO public.subscriptions (…) SELECT … FROM public.billing_subscriptions WHERE <entitling-today> ON CONFLICT (paddle_subscription_id) DO NOTHING`. `paddle_subscription_id` set to a deterministic synthetic value `byo_backfill:<billing_subscriptions.id>` so the natural unique key holds and re-runs are no-ops. `environment='live'`.
2. **Replace `public.has_pheno_tracker_entitlement(uuid)`** — drop the `billing_subscriptions` EXISTS branch. Keep the anti-oracle guard, the `subscriptions(env='live')` branch, the canceled-in-period grace, and the grant posture identical.
3. **Replace `public.ai_credit_spend(...)`** — drop the BYO plan read and the `ai_credit_effective_credit_plan_id` union step. Effective plan is resolved solely from `public.subscriptions(env='live', status='active', period NULL or future, price_id ∈ known plans)`. Everything else (idempotent replay, per-user advisory lock, staff monthly metering, grow ownership check, append-only ledger, return shape) stays byte-compatible with today's contract.
4. Re-assert `REVOKE ALL … FROM PUBLIC/anon; GRANT EXECUTE … TO authenticated, service_role` on both functions.

No schema changes. No new tables. No RLS policy changes. `billing_subscriptions` table itself is untouched (still readable by operator audit surfaces).

### Server helper
`supabase/functions/_shared/unionEntitlementLookup.ts`

- Drop the `billing_subscriptions` read from `loadUnionEntitlement`. Keep the `subscriptions(env='live')` read; the sandbox-when-server-expects-sandbox branch stays. Rename the helper from "union" to "Lovable-only" in the docstring; keep the export name (callers unchanged) to avoid a cross-function refactor in this slice.
- Public function signature and return type unchanged. Callers (`environment-summary-report-entitlement`, `live-sensor-entitlement`, `premium-export-entitlement`) require no edits.

### Client hook
`src/hooks/useMyEntitlements.ts`

- Drop the `billing_subscriptions` fetch. Feed `byoRow: null` into `resolveUnionEntitlements`. Header comment updated to state the client hook is Lovable-only and remains presentation-only, never authoritative.

### Docs — reconcile canonical lane
- `docs/paddle-paid-launch-runbook.md` — flip the "Canonical lane decision" section. State Lovable canonical. Remove the "webhook destination is repointed to `paddle-webhook`" line. Note the residual-risk section is now resolved by this slice.
- `docs/billing-level-two-launch-gate.md` — update "Current Billing Chain" to describe `payments-webhook` → `lovable_paddle_events` → `subscriptions` as the entitlement path; keep the BYO chain as "operator audit surface only."
- `docs/billing.md` — mention `VITE_PAYMENTS_CLIENT_TOKEN` alongside the deprecated `VITE_PADDLE_*` set; remove the "server-side entitlement updater" TODO (it's shipped in the Lovable lane); keep the going-live checklist.
- `supabase/functions/paddle-webhook/index.ts` header comment — no change needed (already accurate).

### Docs — new sandbox smoke checklist
`docs/paddle-sandbox-smoke.md` (new file, ~80 lines)

Repeatable checklist for verifying a preview purchase, mirroring runbook Release Gate items 6–7:
- Which client token prefix must be present.
- Signed-in preflight (`/pricing` shows Pro CTAs, banner is amber "test mode").
- Test card matrix (4242…4242 success, 4000…3220 3DS challenge, 4000…0002 always-declined, 4000…0027…3184 succeeds initially / declines on renewal).
- What to check after each flow: `subscriptions` row inserted with `environment='sandbox'`, `lovable_paddle_events` row with `processing_status='processed'`, entitlement badge in Settings updates within a few seconds, no rows in `billing_subscriptions` (Lovable canonical means BYO stays empty in sandbox).
- Duplicate-delivery idempotency check (Paddle dashboard → Notifications → Replay; expect 23505 no-op, no duplicate row).
- Founder Lifetime cap check (`founder_lifetime_slots_remaining` decrements by 1; sold-out state returns 409 `plan_sold_out` from `get-paddle-price`).
- Cancel-and-resubscribe check (new row inserted, old row remains, entitlement resolves to the newer active row).

---

## Tests added

- `src/lib/entitlements/unionEntitlements.test.ts` — a new case: `pickStrongestBilling(byoRow, lovableRow)` still deterministic when `byoRow` is `null` (the new production shape). Existing tie-breaking tests remain untouched to prove the pure resolver is unaffected.
- `supabase/functions/_shared/unionEntitlementLookup.test.ts` (if a test harness already exists — check on file open; skip if not) — assert `loadUnionEntitlement` no longer issues a `billing_subscriptions` query.
- Runtime harness — I will **not** add a new RPC harness in this slice; the existing `paddle_subscription_update_rpc_harness.sql` and billing RLS harnesses cover the write side. Adding an entitlement-narrowing harness is called out as a follow-up in the response.

## Validation commands

```
bun run type-check
bunx vitest run src/lib/entitlements --reporter=dot
bunx vitest run supabase/functions/_shared --reporter=dot
```

Full suite is not required for this slice (no cross-cutting surface changes), but I'll note whether it is worth running after the migration lands.

## Safety verdict

- No schema, RLS policy, table, or column change.
- Two SECURITY DEFINER function bodies replaced; grants re-asserted identically; anti-oracle guard preserved.
- One idempotent, guarded backfill of currently-entitling rows to avoid revoking access.
- No client-side gating change (client hook is already presentation-only).
- No checkout, webhook signature, cap, refund, or founder-allocation behavior change.
- BYO `paddle-webhook` still receives + audits sandbox events; nothing removed from the audit trail.

## Risks / rollback

- **Risk:** the backfill fires only once per unique `billing_subscriptions.id`. If future BYO rows are ever written by an operator, they will NOT auto-flow to `subscriptions` after this slice ships. That is intentional — Lovable is canonical, so new entitlements must come through `payments-webhook`. Documented in the runbook edit.
- **Rollback:** re-run the pre-slice versions of the two functions from `20260709193855` (pheno) and `20260710010000` (credits). The backfill rows stay (they are correct-shape live `subscriptions` rows), no destructive action needed.
- **Zero-user assumption:** the runbook states "0 verified live paid users" and one unverified `billing_subscriptions` row. The backfill covers that one row. If any other unlisted BYO row exists, the backfill covers it too by the same filter.

## Preview test walkthrough (delivered in chat after the plan runs)

Short version of the checklist:
1. Confirm `/pricing` shows the amber "test mode" banner and the Pro CTAs.
2. Sign in as a test account.
3. Click Pro Monthly → checkout overlay opens → pay with `4242 4242 4242 4242`, any future expiry, any CVC, any name.
4. Redirects to `/checkout/success`. Within a few seconds, Settings shows Pro.
5. Verify in the DB: one row in `public.subscriptions` with `environment='sandbox'`, `status='active'`, matching `paddle_subscription_id`; matching row in `public.lovable_paddle_events` with `processing_status='processed'`.
6. In the Paddle sandbox dashboard, Notifications → find the delivery → click Replay. Confirm no new `subscriptions` row appears (idempotent).
7. Try `4000 0000 0000 0002` for a declined-card path; expect no `subscriptions` row and a decline notice in the Paddle overlay.

Full details land in `docs/paddle-sandbox-smoke.md` when the slice runs.
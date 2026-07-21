# Deploy runbook — AI credit packs, Craft credit wiring & referral engine

Everything below lives on branch **`claude/ai-credit-packs`** (stacked on the
Craft branch **`claude/craft-tier-entitlements` / #400**). The code is complete
and tested; these are the founder-side steps to take it live. **Do them in the
order shown** — later steps assume earlier ones.

> Claude cannot do any of these: they require your Paddle account, your secret
> store, and your production database. This is the checklist to do them yourself.

---

## 0. Prerequisite — the branch must reach the deploy branch

`claude/ai-credit-packs` is stacked on `#400`. Merge/rebase both onto the deploy
branch (`verdant-grow-diary`) so the migrations + code ship together. Do **not**
publish `#400` alone (Blueprint would go Craft/Founder-only while Craft is
unbuyable) — ship the whole stack.

---

## 1. VALIDATE the money math in the local-DB lane (before any prod deploy)

The PR2 spend fold-in is the one change where a `.toContain` test proves nothing
about the accounting. Run the local-DB / WSL Supabase lane and confirm each case
(this is the checklist from the PR2 commit body):

- [ ] pack-funded spend does **not** move monthly `remaining`; allowance-funded does **not** move `pack_balance`
- [ ] refund of a **pack** spend restores `pack_balance` (not monthly); refund of an **allowance** spend restores monthly (not pack)
- [ ] boundary: monthly 1 / weight 1 → allowance; monthly 0 / pack 1 → pack; both 0 → `limit_reached`
- [ ] escalated weight-5 with `pack_balance` 3 → deny (no partial fill)
- [ ] new period → monthly resets, pack balance persists
- [ ] Craft subscriber resolves to **300/mo** (not free); `ai_credit_allowance` parity test green

If any case fails, stop and fix the SQL before deploying.

---

## 2. Deploy the migrations — in this exact order

Supabase applies by filename order, so this is the natural order; deploy them as
one batch to the production project:

1. `supabase/migrations/20260721103000_ai_credit_grants.sql` — pack grant ledger + `grant_lovable_credit_pack`
2. `supabase/migrations/20260721104000_ai_credit_spend_pack_overflow.sql` — Craft 300/mo + monthly-first pack overflow in `ai_credit_spend` (**the money one — validated in step 1**)
3. `supabase/migrations/20260721105000_ai_credit_grants_non_paddle_grants.sql` — non-Paddle grant path + `grant_lovable_credits`
4. `supabase/migrations/20260721106000_referrals_conversion.sql` — `referrals` table + `convert_referral`

Each has a `DO $preflight$` guard that fails closed if applied out of order.

---

## 3. Create the Paddle products — SANDBOX first, then LIVE

Create in **sandbox**, test end-to-end, then repeat in **live**. Each product's
`import_meta.external_id` MUST be exactly the slug shown — the webhook reverse
lookup **and** `get-paddle-price` validation both key on it.

| Product              | Type         | Price      | `import_meta.external_id` (exact) |
| -------------------- | ------------ | ---------- | --------------------------------- |
| AI credit pack — 50  | **one-time** | **$9.00**  | `credit_pack_50`                  |
| AI credit pack — 150 | **one-time** | **$19.00** | `credit_pack_150`                 |

> If you are also launching the **Craft tier** subscription in this release, also
> create `craft_monthly` ($29/mo) and `craft_annual` ($249/yr) with matching
> external ids — but note Craft _subscription checkout_ has its own remaining
> wiring in `#400` (webhook `KNOWN_PRICE_IDS` + `get-paddle-price` allowlist +
> the `subscriptions.plan_id` CHECK). Credit packs do **not** depend on that.

---

## 4. Set the secrets (Supabase / Lovable edge config)

Set each to the resolved `pri_...` id from the product you created in step 3, for
the matching environment (sandbox vs live):

- [ ] `PADDLE_PRICE_CREDIT_PACK_50` = the 50-pack price id
- [ ] `PADDLE_PRICE_CREDIT_PACK_150` = the 150-pack price id

Confirm these already exist (the pack flow fails closed without them):

- [ ] `PAYMENTS_LIVE_WEBHOOK_SECRET` / `PAYMENTS_SANDBOX_WEBHOOK_SECRET`
- [ ] `PADDLE_LIVE_API_KEY` / `PADDLE_SANDBOX_API_KEY`
- [ ] `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`

Until `PADDLE_PRICE_CREDIT_PACK_*` are set, the "Buy credits" buttons degrade
gracefully to **"Checkout unavailable"** — nothing breaks.

---

## 5. Product decisions still open (set before wiring the dependent features)

These don't block the pack launch, but the dependent features need them:

- **Pack expiry** — currently none (nullable `expires_at`). If you ever enable it, the `ai_credit_spend` note flags the `v_pack_used` filter to update.
- **Referral verification gate** — when a referral pays out: on email-confirm (recommended) vs first-paid. Needed before the referral _glue_ (codes / `?ref=` capture / share UI) is built. The engine + amount (give 10 / get 10) are done.
- **Annual bonus size** — credits granted for annual Craft/Pro, and whether upgrades/renewals qualify. Needed before the annual-bonus webhook trigger is built.
- **Deep Review model** — deeper prompt on the same model (no cost decision) vs a bigger model (you pick it + confirm 5 credits covers its cost). Needed before the Deep Review tier is built.

---

## 6. Smoke test (sandbox) before flipping live

- [ ] Buy a 50-pack in sandbox → webhook logs `processed:grant_credit_pack` → a row appears in `ai_credit_grants`.
- [ ] Exhaust the monthly allowance, run one more AI Doctor review → it succeeds, `funded_by='pack'`, and the badge shows the pack balance (not "0").
- [ ] Refund the pack in sandbox → a `kind='clawback'` grant appears; balance drops.

Then repeat product + secret setup for **live** and you're done.

---

## What is NOT in this release (built server-cores only; glue/UI pending)

- **Referral glue** — the conversion engine + anti-abuse are done; codes, `?ref=` capture, the verified-conversion trigger, and the share UI are the remaining pass (gated on the verification decision above).
- **Annual bonus** — the grant primitive is done; the webhook trigger + grow-start nudge are the remaining pass.
- **Deep Review (5-credit)** — not built; needs the model decision above.

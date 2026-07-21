# Lovable deploy prompt — AI credit packs + referral release

A ready-to-paste prompt for **Lovable** that deploys the migrations, creates the
Paddle products, and sets the price secrets for the credit-packs + referral
release. It is the "hand it to Lovable" companion to the human checklist in
[`credit-packs-referral-deploy-runbook.md`](./credit-packs-referral-deploy-runbook.md);
follow the runbook if you're doing the steps by hand.

**Two safeguards are built into the prompt on purpose** (do not remove them):

- It goes **sandbox → verify → live**. The Step 4 smoke test is the accounting
  gate — the PR2 `ai_credit_spend` migration is validated only by static text
  tests, not by an accounting test, so the sandbox smoke test is what actually
  proves the money math before real money is involved. **Do not skip it.**
- It forbids adding the pack SKUs to any plan/entitlement map, so a $9 credit
  purchase can never resolve to a subscription or grant Pro/Craft access.

The single most fragile detail is each product's `import_meta.external_id`: if it
is missing or misspelled, the webhook reverse-lookup returns null and the purchase
is skipped — money taken, nothing delivered. Verify it on both products.

> Whether Lovable can create the Paddle products directly depends on your Paddle
> integration. If it can't, it should hand you the exact Step 2 spec to create in
> the Paddle dashboard — the external_ids are the part that must match exactly.

---

## The prompt

```text
Deploy the AI credit-packs + referral release for Verdant Grow Diary. The code is
already on this branch. Do the steps IN ORDER and stop if any step fails or a test
doesn't pass. Report back after each step.

PREREQUISITE: this assumes the `claude/ai-credit-packs` stack (stacked on the Craft
branch #400) is merged into the deploy branch. If it isn't, merge it first.

STEP 1 — Apply the database migrations, in filename order. Each has a
`DO $preflight$` guard that errors if applied out of order, so keep the order:
  1. supabase/migrations/20260721103000_ai_credit_grants.sql
  2. supabase/migrations/20260721104000_ai_credit_spend_pack_overflow.sql
     ^ MONEY-CRITICAL: this rewrites the ai_credit_spend function (Craft 300/mo +
       monthly-first pack overflow + refund accounting). It is validated only by
       static text tests, NOT by an accounting test. Do NOT announce launch until
       the Step 4 smoke test passes in SANDBOX, and keep a rollback ready.
  3. supabase/migrations/20260721105000_ai_credit_grants_non_paddle_grants.sql
  4. supabase/migrations/20260721106000_referrals_conversion.sql

STEP 2 — Create the Paddle products. SANDBOX FIRST (do Step 4 to verify), THEN
repeat in LIVE. Create each as a ONE-TIME product (not a subscription). The
`import_meta.external_id` must be EXACTLY the value shown — the payments-webhook
reverse lookup AND the get-paddle-price validation both key on it:
  - "AI credit pack — 50",  one-time, $9.00 USD,  external_id = credit_pack_50
  - "AI credit pack — 150", one-time, $19.00 USD, external_id = credit_pack_150

STEP 3 — Set the Supabase edge-function secrets to the `pri_...` price ids of the
products you just created, matching the environment (sandbox secrets for the
sandbox products, live for live):
  - PADDLE_PRICE_CREDIT_PACK_50  = the 50-credit product's price id
  - PADDLE_PRICE_CREDIT_PACK_150 = the 150-credit product's price id
Confirm these already exist (the flow fails closed without them):
  PAYMENTS_LIVE_WEBHOOK_SECRET / PAYMENTS_SANDBOX_WEBHOOK_SECRET,
  PADDLE_LIVE_API_KEY / PADDLE_SANDBOX_API_KEY,
  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY.

STEP 4 — Smoke test in SANDBOX before flipping live:
  a) Buy a 50-pack. The payments-webhook should log `processed:grant_credit_pack`
     and one row should appear in public.ai_credit_grants for that user.
  b) Use up the monthly AI Doctor allowance, then run one more review. It should
     SUCCEED, the new ai_credit_spends row should have meta.funded_by = 'pack',
     and the credit badge should show the remaining pack balance (NOT "0 left").
  c) Refund the pack in Paddle sandbox. A row with kind='clawback' should appear
     in ai_credit_grants and the balance should drop.
  Only after a), b), c) pass, create the LIVE products (Step 2) + set the LIVE
  secrets (Step 3).

CONSTRAINT — do NOT add credit_pack_50 / credit_pack_150 to any plan or
entitlement map (e.g. KNOWN_PRICE_TO_PLAN, PLAN_CATALOG, KNOWN_PLAN_IDS). Packs
are one-time credit purchases and must never resolve to a subscription or grant
Pro/Craft access. They belong ONLY in get-paddle-price's allowlist +
SERVER_PRICE_CONFIG and the webhook's CREDIT_PACK_CREDITS map (already wired).
```

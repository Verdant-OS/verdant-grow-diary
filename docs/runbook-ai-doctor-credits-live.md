# Runbook: make the AI Doctor credits UX live end-to-end

**Owner:** founder (requires Lovable apply + Supabase deploy rights)
**Time:** ~15 minutes
**Written:** 2026-08-12, every "verified" claim below probed against real prod that day.

## Why this exists

Every conversion event now reports into gtag (`blueprint_cta_clicked`,
`credit_pack_cta_*`, `paywall_viewed` incl. `blueprint_locked`) — but the
funnel's top is broken upstream of everything measured:

- **No AI Doctor review has spent a credit since 2026-07-03** (22 spends ever).
- Migration `20260717010000_paid_return_cohort_measurement.sql` is **not
  applied** to prod, even though migrations as recent as `20260810213805`
  are — a hole in the middle of the sequence, not a trailing gap. Verified
  missing: `record_ai_doctor_review_completion` (RPC),
  `ai_doctor_review_completions` and `paid_return_cohort_memberships` (tables).
- `ai_doctor_review_evidence_receipts` has **0 rows ever**, so the deployed
  `ai-doctor-review` edge function is either stale or has simply never run
  since the receipts era; its deployed version can't be read with current MCP
  permissions either way.
- Consequence: no prod success envelope has ever carried `pack_balance`, so
  the low-credit top-up nudge (#925) stays silent by design (it requires a
  confirmed zero), and paid-return cohorts + evidence receipts record nothing.

What is already fine (verified live): both overloads of `ai_credit_spend`
return `pack_balance`; `ai_credit_refund` and `ai_doctor_finalize_review`
exist and finalize has the modern receipts-era signature.

## Steps

### 1. Apply the missing migration — via Lovable, not git

`supabase/migrations/20260717010000_paid_return_cohort_measurement.sql`

Pushing to git does **not** apply it (chronic gap; this exact file has sat
unapplied since Jul 17 while later migrations landed). Apply through Lovable
and confirm, then prove it stuck:

```sql
select
  (select count(*) from supabase_migrations.schema_migrations
    where version = '20260717010000')                              as migration_recorded,
  to_regclass('public.ai_doctor_review_completions')               as completions_table,
  to_regprocedure('public.record_ai_doctor_review_completion(uuid,uuid,uuid,uuid,uuid,text,text,timestamptz)') is not null
    or exists (select 1 from pg_proc where proname='record_ai_doctor_review_completion') as completion_rpc;
```

All three non-null/true → applied. (Run against **prod**
`knkwiiywfkbqznbxwqfh` — the plain supabase MCP in this workspace answers for
the **sandbox** `bzatgtgjvuojpoxcknaa`; don't verify there.)

### 2. Redeploy the edge function

```bash
supabase functions deploy ai-doctor-review --project-ref knkwiiywfkbqznbxwqfh
```

Idempotent and cheap even if the deployed version turns out current. Deploy
**after** step 1 — the modern function calls the RPC step 1 creates.
(`ai-coach` also forwards `pack_balance` but is unreachable from the prod
frontend — skip unless Coach ships.)

### 3. Run one real review

Signed in on prod, any plant with enough context: Plant Detail → **Run
cautious AI Doctor review**. Keep the browser dev-tools Network tab open.

### 4. Confirm all four signals

| # | Check | Where | Pass looks like |
|---|---|---|---|
| 1 | Spend recorded | SQL: `select max(created_at) from ai_credit_spends;` | today's timestamp (was 2026-07-03) |
| 2 | Receipt written | SQL: `select count(*) from ai_doctor_review_evidence_receipts;` | ≥ 1 (was 0 ever) |
| 3 | Completion written | SQL: `select count(*) from ai_doctor_review_completions;` | ≥ 1 (table new in step 1) |
| 4 | Envelope carries the field | Network tab → `ai-doctor-review` response → `credit` | `"pack_balance": 0` present (0 is correct — no packs bought) |

Check 4 is the one that arms #925: from then on, a paying grower at ≤2
remaining credits after a saved review sees the one-time pack offer.

## Out of scope, known

A version-diff of repo vs prod since Jul 1 shows 156 missing versions — but
61 of those have an applied twin within seconds (Lovable timestamp skew,
likely same content) and 95 have no twin. That reconciliation belongs to the
daily drift probes (07:00/07:30 UTC tracking issues), which verify **content**,
not version strings. This runbook deliberately fixes only the AI Doctor
credits path.

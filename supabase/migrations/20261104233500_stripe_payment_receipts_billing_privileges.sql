-- Tighten table privileges on public.stripe_payment_receipts.
--
-- Why: 20261104184500 recorded this table as production carries it, and
-- production shows anon and authenticated holding every table privilege on
-- it (source claim: that migration's catalog read, 2026-11-04 ~18:40 UTC).
-- RLS limits SELECT/INSERT/UPDATE/DELETE to the owner-read policy, but RLS
-- does not cover TRUNCATE, REFERENCES or TRIGGER. A credit-pack receipt
-- ledger needs no client write path at all: the only writer is
-- stripe_record_credit_payment, which is SECURITY DEFINER and runs as its
-- owner, so this change does not affect it.
--
-- Owner decision (Matthew, 2026-11-04): "yes, tighten it, as its own small
-- PR after #2873 lands. Leaving TRUNCATE open on a money table helps no one,
-- and any Stripe code ported later should never depend on client writes to
-- it."
--
-- Result, matching the repository pattern used for public.ai_credit_grants:
--   PUBLIC, anon   no privileges
--   authenticated  SELECT only (needed by policy stripe_receipts_owner_read)
--   service_role   all privileges
--
-- REVOKE and GRANT are idempotent, so a replay or a repeat apply changes
-- nothing further. This file is not catalog-guarded on purpose: unlike
-- 20261104184500, it is meant to change production when the founder applies
-- it, and it should fail loudly if the table is missing.

REVOKE ALL ON TABLE public.stripe_payment_receipts FROM PUBLIC;
REVOKE ALL ON TABLE public.stripe_payment_receipts FROM anon;
REVOKE ALL ON TABLE public.stripe_payment_receipts FROM authenticated;
GRANT SELECT ON TABLE public.stripe_payment_receipts TO authenticated;
GRANT ALL ON TABLE public.stripe_payment_receipts TO service_role;

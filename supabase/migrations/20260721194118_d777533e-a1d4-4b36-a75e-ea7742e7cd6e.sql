-- Duplicate retired.
--
-- The canonical AI credit pack overflow migration is:
--   20260721104000_ai_credit_spend_pack_overflow.sql
--
-- This later Lovable-timestamp migration duplicated the same function changes.
-- Keeping it as a no-op preserves the migration version without replaying the
-- same money-critical definitions during fresh local resets.
SELECT 1;

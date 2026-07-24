-- Duplicate retired.
--
-- The canonical non-Paddle AI credit grant migration is:
--   20260721105000_ai_credit_grants_non_paddle_grants.sql
--
-- This later Lovable-timestamp migration duplicated the same column,
-- constraint, index, and RPC changes. Fresh local resets should apply the
-- canonical migration once, then pass through this recorded version safely.
SELECT 1;

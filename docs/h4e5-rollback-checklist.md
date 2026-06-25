# H4E-5 Rollback Checklist

Rollback steps for the L2-H4E-5 subscription updater audit slice.

- Revert webhook RPC call from `apply_paddle_subscription_update_with_audit` back to `apply_paddle_subscription_update`.
- Leave `billing_subscription_update_audit` unused if needed; it is service-role-only and has no anon/authenticated access.
- Do not delete `billing_subscriptions` rows during rollback.
- Drop audit wrapper/operator RPC/table only in a dedicated rollback migration.

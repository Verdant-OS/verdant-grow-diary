# Payment boundaries
- Stripe checkout and confirmation use authenticated server functions; the webhook verifies Stripe signatures before privileged persistence, because the browser cannot grant access.
- Stripe checkout is test-only until a separate live release is approved; receipts and credits retain an explicit environment to prevent test payments funding live access.
- Canonical subscriptions preserve existing Paddle identities and add Stripe identities; credit-pack settlement uses an atomic, provider-scoped ledger operation for replay and refund safety.

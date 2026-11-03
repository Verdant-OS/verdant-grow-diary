No code or setting changes. Answers to the Stripe test-mode webhook questions:

1. URL. Use the stable dev host: `https://project--66255e7b-892c-4be5-8686-ab1cfc3666db-dev.lovable.app/api/public/payments/webhook?env=sandbox`. The `id-preview--…` URL needs a Lovable login by default, so Stripe can't rely on it. Paths under `/api/public/*` skip site auth on the `project--…` hosts. The dev host serves the latest preview build. I haven't checked whether that build includes branch `lovable-sync-1793724974` at `f0680d3d`. If it doesn't, the route returns 404 there. Status: unknown.
2. Who creates it. Lovable's payments setup registers the test webhook and stores its secret automatically. Lovable also adds a second endpoint at `api.lovable.dev/.../payments-webhook/sandbox`, which only feeds the Payments tab. Don't create endpoints by hand. To add events, use Lovable's webhook-edit tool. If the endpoint is missing, rotate the webhook secret instead. I haven't read the endpoint URL that's actually registered now. Status: unknown.
3. Events. The default set for the restored handler is:
   - `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`
   - `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`
   - `invoice.paid`
   Which events the live endpoint subscribes to right now: unknown.
4. Secret. `PAYMENTS_SANDBOX_WEBHOOK_SECRET` is the `whsec_…` signing secret of Lovable's test endpoint. It's set automatically when payments are turned on, and again on each rotation. Whether it currently matches the registered endpoint: unknown, because secret values can't be read. The practical check: if every delivery fails with "Invalid webhook signature", rotate the test secret. If deliveries get 404, the handler is missing from that build, and rotating won't help.

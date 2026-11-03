# Roadmap

## Done this pass (2026-11-03)

- Restored `/welcome` and `/features` as real public pages: routes, page components, copy
  constants, unique metadata, sitemap and `llms.txt` entries, route-manifest entries, and
  removed the redirects that had been bouncing both URLs back to `/`.
- Restored the Stripe test checkout: `/checkout/stripe`, `src/lib/payments/*`,
  `StripeCheckoutPanel`, `useStripeCheckout`, the signed webhook route, the portal-session
  server function, and the account-page button that opens the Stripe customer portal.
- Added the Stripe packages with bun: `stripe@22.0.2`, `@stripe/stripe-js@9.2.0`,
  `@stripe/react-stripe-js@6.2.0`.
- Pricing notice, "Is checkout live?" FAQ and live-checkout copy now name Stripe instead of
  Paddle (`src/lib/checkoutTrustCopyRules.ts`); the legacy `/upgrade` page keeps its Paddle
  wording because that surface still uses Paddle.
- Route manifest gained `/checkout/stripe` in sort order; the pricing checks were renegotiated
  in the same change.

## Open

- Content security policy still lists only `'self' https://*.paddle.com` for `frame-src`, so
  the Stripe card form is reported as a violation (report-only today, so checkout still opens).
  Needs a decision on adding Stripe to `frame-src` / `script-src` / `connect-src`.
- Landing and pricing footers still say "Payments processed by Paddle.com as Merchant of
  Record". That is legal wording and needs Matthew's confirmation before it changes.
- `src/test/restore-env-production-from-head.test.ts` has 5 failures caused by the sandbox git
  limitation (`git add` inside a temporary fixture repo returns non-zero). Pre-existing and
  unrelated to this restore.
- Nothing was published. `verdantgrowdiary.com` still serves the older build, and its DNS
  verification is unfinished.

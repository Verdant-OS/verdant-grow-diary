
# Read-only audit — Paddle billing + integrations

Audit only. No files were modified. Findings below are grouped by whether they are **code-fixable here** or **external-only** (a Paddle-account / DNS / registrar / provider step you must do outside Lovable).

Environment: sandbox (test) `85201`, live `375764`.

---

## Area 1 — Paddle billing end-to-end

### What is actually in place and working

- **Catalog + checkout (`src/pages/Pricing.tsx`, `usePaddleCheckout`, `get-paddle-price`)** — 3-tier, monthly + annual, human-readable external IDs (`pro_monthly`, `pro_annual`, `founder_lifetime`), price resolver via edge function, `customData.userId` passed, `successUrl` set. Env derived from client-token prefix.
- **Webhook (`supabase/functions/payments-webhook/*`)** — signature verified via `verifyWebhook` before any DB write; `?env=sandbox|live` routes credentials; raw body cloned for audit; durable "received → decide → write → mark" lifecycle in a pure orchestrator; idempotent on `paddle_event_id` (23505 duplicate = no-op); handles `subscription.created/updated/canceled`, `transaction.completed` (Founder Lifetime via advisory-locked RPC with 75-slot cap + double-bill auto-cancel of prior recurring), and `customer.created/updated` (mirror). Skips rows with missing `importMeta.externalId`.
- **Mirrored state (`public.subscriptions`, `paddle_customers`, `lovable_paddle_events`)** — RLS select-own on `subscriptions`; service-role writes only; `scheduled_change_action/_at` columns present.
- **Access rules (`src/lib/paddleSubscriptionAccessRules.ts`, `has_active_subscription`)** — `active/trialing/past_due` grant; `canceled` grants until `current_period_end`; `paused` revokes. Defaults to `check_env='live'`.
- **Customer portal (`paddle-portal-session` + `src/lib/customerPortal.ts`)** — JWT-verified, uid-scoped, env from row, skips `lifetime_%`, returns URL only, opens in new tab with `noopener`.
- **Past-due banner (`SubscriptionPastDueBanner`)** — renders on `status==='past_due'`, links to portal.
- **Self-serve delete (`delete-account`)** — JWT-verified, confirm-string gated, service-role deletes user + cascades.
- **Client entitlement read (`useMyEntitlements`)** — env-filtered, presentation-only, bounded newest-first window keyed by `paddle_subscription_id` (avoids canceled Pro shadowing Founder Lifetime).

### Code gaps — fixable inside Lovable

Prioritized. None are known-broken flows, but each is a real hole for a production billing surface:

1. **P1 — `subscription.past_due` / `paused` events are not explicitly handled by the mapper.** The webhook processes `subscription.updated` and mirrors `status`, so past_due does flow through when Paddle sends it *as* an update, but there is no explicit dedicated handler / test coverage for the `paused` and dunning transitions. Worth confirming by fixture-testing a `subscription.past_due` payload against `eventProcessor.decide()` and adding an explicit case if it falls into `skip: unhandled_type`.
2. **P1 — No handling of `subscription.trialing` distinct from `active`, and no handling of Paddle "resumed" / `subscription.activated`.** If any plan ever gets a trial, or a paused sub is resumed, mirror state can lag.
3. **P2 — Portal function returns 404 when the newest sub is a `lifetime_` row and the user has no recurring sub at all.** Copy `PORTAL_NO_SUBSCRIPTION_MESSAGE` says "no active paid subscription" — misleading for Founder Lifetime users clicking "Manage subscription". Either hide the CTA for lifetime-only accounts or return a distinct reason code so the UI can say "Founder Lifetime — nothing to manage. Contact support for invoices."
4. **P2 — No cancel-inside-app path.** Cancellation only works via the Paddle-hosted portal window. That's fine, but there is no in-app "You canceled — access until Nov 30" confirmation surface driven by `cancel_at_period_end` / `scheduled_change_*`. Small presenter surface, high UX value.
5. **P2 — `transaction.payment_failed` is subscribed but appears to fall through as unhandled_type.** Should at least be persisted to `lovable_paddle_events` (it already is) and optionally trigger the past-due banner earlier than Paddle's own status transition.
6. **P3 — `checkout-status` fallback + `CheckoutSuccess` polling.** Confirm the success page still polls `useMyEntitlements.refetch()` after redirect (webhook can lag by seconds). This exists but is worth re-verifying under real latency.
7. **P3 — Refunds / `adjustment.*` events.** Per your prior decision (record + operator-manual), there is no handler. That is acceptable, but confirm they at least land in `lovable_paddle_events` for audit. Currently only subscribed events are handled; adjustment events aren't subscribed, so no audit row.
8. **P3 — `paddle_customers` mirror is written but never read.** Not a bug, but if it's never queried it is dead weight; either surface it in the operator audit or drop it in a future cleanup.
9. **P3 — No renewal-notice / receipt email on `transaction.completed`.** Paddle sends its own receipt, but the app never surfaces "renewed on X for $Y" in-app. Optional.
10. **P4 — Legacy BYO `paddle-webhook` + `billing_subscriptions` remain deployed** (documented as audit-only, no longer entitles). Not broken — but two Paddle webhook receivers exist. Confirm the second is truly not entitlement-load-bearing after the recent migration, and consider a decommission plan.

### External-only blockers (you must do these outside Lovable)

- **Go-live blocker: `domain_review = action_required`.** This is the sole remaining live-mode step per `get_go_live_status`. Everything else (readiness, publish, verification, automated review) is `completed`. Until Paddle clears domain review, **live checkout will fail** with a Paddle-side error regardless of code correctness. Action: open the Payments tab and follow the domain-review prompt (usually TXT/CNAME on your registered domains, or Paddle support ticket referencing seller `375764`).
- **Live webhook signing secret + live API key.** Auto-configured by `enable_paddle_payments`, but verify `PAYMENTS_LIVE_WEBHOOK_SECRET` and `PADDLE_LIVE_API_KEY` are present in edge-function secrets. Missing = live webhooks 400 on signature.
- **Statement descriptor + checkout color** (`/settings/statement-descriptor`, `/settings/account`) — no code required; set once via Paddle so live bank statements read as your brand, not "PADDLE.NET*…".
- **Tax / MoR jurisdictions** — Paddle handles as MoR; no action unless you sell into an excluded region.

---

## Area 2 — External integrations inventory + gaps

### Currently wired

| Integration | Where | State |
|---|---|---|
| **Lovable Cloud (Supabase)** — auth, Postgres, storage, edge functions | `src/integrations/supabase/*`, `supabase/functions/*` | ✅ healthy; RLS-first; service_role only server-side |
| **Google OAuth** | `src/integrations/lovable/index.ts` + `Auth.tsx` | ✅ wired via managed `@lovable.dev/cloud-auth-js`; `redirect_uri = window.location.origin` (open-redirect safe) |
| **Paddle (payments)** | See Area 1 | ⚠️ sandbox complete, live blocked on domain review |
| **Transactional + auth email** | `supabase/functions/auth-email-hook`, `process-email-queue`, `_shared/email-templates/*` | ✅ Lovable managed email (`@lovable.dev/email-js`); custom sender `notify.verdantgrowdiary.com`; DLQ + retries |
| **Google Analytics 4** | `index.html` (`G-B3QRSZEM9S`) + `useGoogleAnalyticsPageViews` + `funnelAnalytics`/`pricingAnalytics` | ✅ page-view + funnel events; safe no-op when `gtag` absent |
| **EcoWitt (sensor ingest)** | `ecowitt-real-ingest`, `sensor-ingest-webhook`, testbench | ✅ validated ingest path; bridge tokens; source-labeled |
| **Pi ingest bridge** | `pi-ingest-readings`, `mint-bridge-token`, `revoke-bridge-token` | ✅ token-gated |

### Half-wired / missing / typically-needed gaps

Prioritized:

1. **P1 — No error/exception tracking (Sentry / Rollbar / Datadog RUM).** `RootErrorBoundary` pings `gtag` if present; that's not a triage tool. For a paid product you will want a real exception feed with source maps. External account + secret + tiny client init.
2. **P1 — No product analytics (PostHog / Mixpanel / Amplitude).** GA4 alone gives page views and coarse funnel events; it does not give retention cohorts, feature adoption, or session replay. `funnelAnalytics.ts` already abstracts the sink — a second adapter would be small.
3. **P2 — `notify.verdantgrowdiary.com` sender domain — verify SPF / DKIM / DMARC alignment.** Managed email requires DNS records at your registrar. If not fully aligned, dunning/reset/verification emails inbox poorly. External-only (DNS at registrar). Nothing to fix in code — but is a common silent gap.
4. **P2 — No custom-domain `robots.txt` / `sitemap.xml` verification across all 6 custom domains** listed in `project_urls`. `public/sitemap.xml` + `public/robots.txt` exist; audit whether they resolve on `verdantgrowdiary.org`, `growdiary.app`, `diarygrow.app` etc. and whether canonicalization avoids duplicate-content penalties. External + `index.html` metadata.
5. **P2 — No uptime / synthetics beyond `datadog-synthetics.yml` CI file.** Confirm the Datadog workflow is actually live and pointed at prod, or add a lightweight cron (BetterStack / UptimeRobot).
6. **P3 — No customer-support surface.** No Intercom / Crisp / Plain / plain email link on paid pages. For a paid Grow OS this is common; a `mailto:` on Settings would be a code-only stub.
7. **P3 — No CDP / marketing automation (Loops, Customer.io, Resend broadcasts).** Only transactional email. If you plan lifecycle emails ("your grow just hit week 6"), you'll want one.
8. **P3 — No live-payment receipts inside the app.** Paddle emails receipts; the app has no `/settings/invoices` view. Portal covers it but is off-domain.
9. **P4 — Sensor providers beyond EcoWitt.** SwitchBot etc. explicitly retired per `ecowitt-only-safety-scan`. Not a gap — a boundary.
10. **P4 — Legal / consent surfaces are wired** (`user_agreement_acceptances`, agreements consent). ✅ complete for GDPR-lite; no cookie banner detected. If you sell to EU customers with GA4, a cookie/consent banner is typically required. External + code.

---

## Prioritized gap list (one merged view)

**Must-fix before live launch**
1. Clear Paddle **domain review** (external, blocking live checkout)
2. Verify live webhook secret + live API key present
3. Verify `notify.verdantgrowdiary.com` SPF/DKIM/DMARC alignment

**High-value code follow-ups**
4. Explicit `subscription.past_due` / `paused` / `trialing` / `resumed` mapper cases + tests
5. In-app cancel-confirmation surface driven by `cancel_at_period_end` / `scheduled_change_*`
6. Portal CTA behavior for Founder Lifetime accounts (distinct copy, not "no active sub")
7. Subscribe to & audit `adjustment.*` events (refund record-only, per your rule)
8. Add exception tracker (Sentry) + product analytics (PostHog) adapters

**Nice-to-have**
9. In-app invoice list / renewal notice
10. EU cookie/consent banner if GA4 stays on for EU visitors
11. Uptime synthetic hitting `/`, `/pricing`, `/auth`, `payments-webhook` health
12. Decommission plan for legacy BYO `paddle-webhook` + `billing_subscriptions` after a full audit window

---

## What I did NOT do

- No code changes, no migrations, no webhook edits, no secret writes, no publish.
- No live-mode transaction attempted.
- No Paddle-side domain review action taken (only you can complete that step).

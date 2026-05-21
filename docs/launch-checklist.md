# Verdant Grow Diary — Launch Checklist

Production domain: **https://verdantgrowdiary.com**

Use this checklist before announcing a public launch or after any DNS,
domain, or publish-pipeline change. Pair it with
[`docs/security-checklist.md`](./security-checklist.md) for the security
review.

---

## 1. Domain, DNS, and SSL

- [ ] DNS connected — apex `A` record and `www` `A` record both resolve
      to the Lovable hosting IP.
- [ ] No stale records remain at the registrar that could interfere with
      SSL issuance.
- [ ] SSL active — `https://verdantgrowdiary.com` and
      `https://www.verdantgrowdiary.com` both serve a valid certificate
      (browser lock icon, no mixed content warnings).
- [ ] Production domain loads the published Verdant build (not a parked
      page or an old deploy).

## 2. Public surfaces

- [ ] Landing page renders at `/welcome` with Verdant branding, hero
      logo, and the Sign in / Open dashboard / Learn more CTAs.
- [ ] Brand logo (`/brand/verdant-logo.png`) loads without 404 or
      stretching, on both the landing page and the auth screen.
- [ ] Mobile landing page checked at ~375px width — header, hero logo,
      CTAs, and feature cards stack cleanly with no overflow.
- [ ] Auth route `/auth` works — sign in and sign up flows reach
      Supabase Auth and redirect to `/` on success.
- [ ] No fake live metrics, sample sensor values, or placeholder grow
      data appears on any public page.
- [ ] No private Supabase table queries (`grows`, `plants`, `tents`,
      `sensor_readings`, `alerts`, `alert_events`, `action_queue`,
      `action_queue_events`, `diary_entries`) run from `/welcome`.

## 3. Auth-gated surfaces

- [ ] Private routes require authentication. Visiting `/`, `/grows`,
      `/plants`, `/tents`, `/sensors`, `/logs`, `/timeline`, `/tasks`,
      `/cameras`, `/alerts`, `/actions`, `/doctor`, `/settings`, and
      `/diagnostics` while signed out redirects to `/auth`.
- [ ] RLS still enforces `auth.uid()` ownership on every user-owned
      table (verified via the existing test suite + Supabase linter).
- [ ] AI Coach remains read-only and suggest-only. No new actuator
      surface or hardware-write path has shipped.
- [ ] Action Queue still requires explicit user approval for every
      state transition.

## 4. SEO, social, and crawler readiness

- [ ] `index.html` has production title, description, canonical
      (`https://verdantgrowdiary.com`), `robots: index, follow`, and the
      Verdant dark-green `theme-color`.
- [ ] Open Graph and Twitter card tags resolve to the brand logo image.
- [ ] `public/robots.txt` available at `/robots.txt` and contains a
      `Sitemap: https://verdantgrowdiary.com/sitemap.xml` directive.
- [ ] `public/sitemap.xml` available at `/sitemap.xml` and lists only
      safe public URLs (`/` and `/welcome`). Private routes are
      excluded.
- [ ] `public/site.webmanifest` resolves and references the brand logo.

## 5. Documentation review

- [ ] [`README.md`](../README.md) production deployment section
      reviewed — domain, SSL note, DNS reminder, rollback notes match
      current reality.
- [ ] [`docs/security-checklist.md`](./security-checklist.md) reviewed
      against the most recent migrations and any new alerting,
      audit-trail, or coach work.
- [ ] [`docs/architecture.md`](./architecture.md) public-route notes
      still accurate (only `/welcome` is public; all other routes are
      auth-gated).

## 6. Rollback

- [ ] A known-good Lovable version is identified and ready to revert to
      from the Lovable version history if the launch surfaces a
      regression.
- [ ] Database migrations applied as part of the launch have a
      follow-up rollback migration documented if needed.

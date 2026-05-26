# Preview Deployment Verification

Checklist for verifying the `verdant-command-center-preview` Vercel project
is configured and deployed safely. Use this before sharing a preview URL or
merging changes that affect deployment configuration.

This is a **preview-only** project. Production deployment from `main` and
`master` is disabled (see `vercel.json`).

---

## 1. Vercel Project Settings

These must match `vercel.json` and the Vite app layout:

| Setting              | Value          |
| -------------------- | -------------- |
| Framework preset     | Vite           |
| Install command      | `npm install`  |
| Build command        | `npm run build`|
| Output directory     | `dist`         |
| Dev command          | `npm run dev`  |

SPA routing is handled by the rewrite rule in `vercel.json`
(`/((?!assets/).*) → /index.html`). Direct route refresh must work without
404s.

---

## 2. Required Client-Safe Environment Variables

Only `VITE_`-prefixed, publishable values may be set in Vercel for this
project. These are intentionally exposed to the browser bundle:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_SUPABASE_PROJECT_ID`

Values must match the published Supabase project ref. See `.env.example`
for the expected format.

---

## 3. Forbidden Secrets (must NOT exist in Vercel envs)

The preview project is a **client-only** Vite build. The following must
never be added to Vercel — they would be bundled into the browser and
leak privileged access:

- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_JWT_SECRET`
- `SERVICE_ROLE_KEY`
- `DATABASE_URL` with privileged credentials
- Any non-`VITE_`-prefixed secret intended only for server-side use

Server-only secrets belong in Supabase Edge Function secrets, not in
Vercel.

---

## 4. Preview Deployment Checklist

- [ ] Preview deployment created for a non-`main` branch
- [ ] No production deployment from `main`
- [ ] No production deployment from `master`
- [ ] App loads at the preview URL
- [ ] Direct route refresh works (e.g. open `/dashboard` directly, then reload)
- [ ] Supabase env vars (§2) are present in Vercel
- [ ] No forbidden secrets (§3) exist in Vercel envs
- [ ] No browser console env/init errors (`verifyEnv` is silent)

---

## 5. Sensor Truthfulness Checklist

Per the Live vs Demo contract (`docs/grow-os-architecture.md` §3):

- [ ] No fake live data is surfaced as real
- [ ] Mock / demo readings are visibly labeled (`Demo` badge or caption)
- [ ] Manual readings are distinguishable from live sensor readings
      (`Manual` vs `Live` label)
- [ ] Stale or unavailable readings are not presented as current
      telemetry (`Stale` / `Unavailable` labels are shown)

---

## 6. Safety Boundary Checklist

Verdant is observe-only / approval-required by default. The preview must
not demonstrate or imply otherwise:

- [ ] No device-command behavior (no fan/light/pump/heater/dosing control)
- [ ] No external-control behavior
- [ ] No blind automation
- [ ] No auto-created Action Queue items without grower review
- [ ] No AI language implying Verdant grows automatically

---

## 7. Rollback Steps

If the repo-controlled preview configuration is retired:

1. Remove `vercel.json` if repo-controlled preview config is no longer used.
2. Remove `.env.example` entries only if no longer used by any environment.
3. Remove preview env vars from the Vercel project if the preview project
   is retired.
4. Reconfirm production deployment rules after rollback — `main` and
   `master` must remain protected from accidental production deploys
   unless an explicit production path is approved.

---

## References

- `vercel.json` — repo-controlled deployment config
- `.env.example` — required client env vars
- `src/lib/verifyEnv.ts` — runtime env validation
- `docs/grow-os-architecture.md` — Live vs Demo contract, AI safety
- `docs/security-checklist.md` — secret handling, service_role rules

# Auth Security — Vite SPA

## Current model

Verdant ships as a **React 18 + Vite single-page app**. Auth runs entirely
in the browser via `@supabase/supabase-js`:

- Client: `src/integrations/supabase/client.ts`
- Env: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`
- Session listener: `src/store/auth.tsx` (`AuthProvider`)
- Route guarding: `src/lib/appRouteManifest.ts` + `useRequireAuth`
- Sign-out: confirmation dialog from `AppShell` header

We do **not** use Supabase SSR, Next.js middleware, `next/headers`, or
`@supabase/ssr`. This repo is not a Next.js App Router project, so
`httpOnly` cookie-based sessions are not applicable here.

## Storage choice — sessionStorage

The Supabase client is configured with `storage: sessionStorage`
(see `src/integrations/supabase/client.ts`).

### Tradeoffs

| Storage           | Survives tab close? | Survives browser restart? | Readable by injected JS (XSS)? |
| ----------------- | ------------------- | ------------------------- | ------------------------------ |
| `localStorage`    | Yes                 | Yes                       | Yes                            |
| `sessionStorage`  | No                  | No                        | Yes                            |
| `httpOnly` cookie | Yes (server-bound)  | Yes                       | No (not readable from JS)      |

Why `sessionStorage`:

- Smaller token persistence window — tokens disappear when the tab/session
  closes. Reduces blast radius if a device is lost or a session is left open.
- No new infrastructure required (we are a SPA, not SSR).

What `sessionStorage` does **not** do:

- It does **not** prevent XSS token theft. Any script running in the page
  can read `sessionStorage` just like `localStorage`.
- It does **not** replace `httpOnly` cookies. Only a server-set,
  `httpOnly`, `Secure`, `SameSite` cookie keeps tokens out of JS reach,
  and that requires an SSR/edge layer this repo does not have.

### Real mitigations (still required)

1. Prevent XSS: never `dangerouslySetInnerHTML` untrusted input; sanitize
   any HTML; keep dependency hygiene tight.
2. Strong CSP at the hosting layer.
3. Never log access tokens, refresh tokens, or session payloads.
4. Never embed `service_role` keys in client code or env vars exposed to
   the browser. `service_role` is server-only.
5. Treat RLS as the **real** access boundary. The browser session only
   identifies the caller; the database decides what they can read/write.

## OAuth return fragment (implicit-flow hash)

Google / managed OAuth (`lovable.auth.signInWithOAuth`) returns to the
public app origin with an implicit-flow URL fragment:

```text
https://verdantgrowdiary.com/#access_token=…&refresh_token=…
```

Those values are credentials. They must not remain in `location.hash` or
the current history URL after application JavaScript runs, and they must
never be logged, screenshot-captioned, or copied into tests as live
tokens (tests use synthetic stand-ins only).

Mitigations in this repo (defense in depth; sessionStorage auth is
unchanged; no `service_role`; no SSR cookie rewrite):

1. **Before first paint** — `OAUTH_HASH_EARLY_WIPE_SCRIPT` is the first
   child of `<head>` in `src/routes/__root.tsx`. If the hash looks like
   an OAuth return (`access_token=`, `refresh_token=`, or `error=`), the
   script copies it into a one-shot in-memory `window` slot and
   `history.replaceState`s to path + search with no fragment.
2. **Before `setSession`** — `consumeOAuthHashSessionIfPresent` parses
   (preferring the before-paint stash when `location.hash` is already
   empty), wipes the hash synchronously, then awaits `setSession` with
   tokens held only in memory. Malformed and provider-error hashes are
   cleared without inventing a session.
3. **Never log** `location.hash`, `access_token`, `refresh_token`, or
   full session payloads.

### Why PKCE / auth-code is not switched in this slice

`Auth.tsx` initiates Google SSO through the **auto-generated** Lovable
shim (`src/integrations/lovable/index.ts` → `createLovableAuth()`), not
`supabase.auth.signInWithOAuth`. Setting `auth.flowType: "pkce"` on
`src/integrations/supabase/client.ts` would not change the managed
OAuth redirect, which still returns `access_token` / `refresh_token` in
the fragment. Editing that generated shim is out of scope. A future
slice can move Google SSO onto a PKCE/code exchange **if** Lovable
managed OAuth (or a first-party Supabase provider config) exposes
`?code=` without breaking the existing Google button. Until then, wipe
first is the fail-closed mitigation.

## Rules

- **Never** expose or import `SUPABASE_SERVICE_ROLE_KEY` from `src/`.
- **Never** log `session`, `access_token`, `refresh_token`,
  `location.hash`, or full user objects.
- **Never** trust a client-supplied `user_id` as an access decision.
  Client filters on `user_id` are UX/performance hints only; RLS
  policies in Postgres are the security boundary.
- **Always** revalidate the session on protected page mounts via
  `useRequireAuth` (calls `supabase.auth.getUser()`).
- **Never** add `NEXT_PUBLIC_*` env vars, `next/headers`, or
  `@supabase/ssr` to this repo.

## Sign-out

Sign-out is gated behind a confirmation dialog (`SignOutConfirmDialog`).
Confirming calls `supabase.auth.signOut()` and redirects to `/auth`.
Cancel leaves the user in place. This avoids accidental sign-outs on
mobile/grow-room use.

## Session revalidation

`useRequireAuth` (in `src/hooks/useRequireAuth.ts`) is used at the
protected route boundary (the app shell layout). It:

1. Calls `supabase.auth.getUser()` on mount — re-validates the bearer
   with the auth server rather than trusting only the cached session.
2. Reports loading / authenticated / unauthenticated.
3. Redirects unauthenticated users to `/auth`.

It is **not** called from every component — the layout-level call is the
single revalidation point. `AuthProvider` continues to maintain the live
session via `onAuthStateChange`.

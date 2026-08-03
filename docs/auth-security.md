# Auth Security — Vite / TanStack Start

## Current model

Verdant ships as a **React 19 + Vite/TanStack Start application**. Public
routes can be rendered by the server bundle, while Supabase authentication
remains browser-managed through `@supabase/supabase-js`:

- Client: `src/integrations/supabase/client.ts`
- Auth runtime: `src/lib/supabaseAuthRuntime.ts`
- SSR wrapper: `src/server.ts`
- Env: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`
- Session listener: `src/store/auth.tsx` (`AuthProvider`)
- Route guarding: `src/lib/appRouteManifest.ts` + `useRequireAuth`
- Sign-out: confirmation dialog from `AppShell` header

The server renderer may import the shared Supabase client while producing
public HTML. It does **not** establish a grower session from cookies, and it
does not use `@supabase/ssr`, Next.js middleware, or `next/headers`.
Protected access is still revalidated in the browser and enforced by RLS.

## Storage choice — browser sessionStorage, explicit SSR memory

The Supabase client resolves its entire auth lifecycle through
`createSupabaseAuthRuntime()`.

| Runtime | Storage | Persist session | Auto refresh | Detect session in URL |
| --- | --- | ---: | ---: | ---: |
| Browser, storage available | `sessionStorage` | Yes | Yes | Yes |
| Browser, storage blocked | transient in-memory fallback | Yes for the current module lifetime | Yes | Yes |
| SSR / prerender | isolated transient in-memory adapter | No | No | No |

The explicit server adapter means module import never depends on browser
globals. Server persistence is disabled so the module-level client is not a
cross-request auth-session cache. A blocked browser storage getter degrades to
memory instead of taking down the page.

### Browser storage tradeoffs

| Storage | Survives tab close? | Survives browser restart? | Readable by injected JS (XSS)? |
| --- | --- | --- | --- |
| `localStorage` | Yes | Yes | Yes |
| `sessionStorage` | No | No | Yes |
| transient memory | No | No | Yes while the page is running |
| `httpOnly` cookie | Yes (server-bound) | Yes | No (not readable from JS) |

Why `sessionStorage` in the browser:

- Smaller token persistence window — tokens disappear when the tab/session
  closes.
- No long-lived shared-device persistence.
- No cookie-auth infrastructure is implied by public SSR rendering.

What `sessionStorage` does **not** do:

- It does **not** prevent XSS token theft. Any script running in the page can
  read `sessionStorage` just like `localStorage`.
- It does **not** replace `httpOnly` cookies. A future cookie-session design
  would be a separate auth architecture and security review.

## SSR initialization failures

Supabase client construction is wrapped in `SupabaseInitializationError`.
`src/server.ts` converts that failure into friendly, crawler-safe HTML with:

- HTTP 500
- `noindex, nofollow`
- `cache-control: no-store`
- a safe error code and reference id
- no stack, environment value, token, or query string in the response

The real cause and reference are logged server-side for operators. The same
wrapper keeps the existing generic HTML fallback for unrelated SSR failures.

### Real mitigations (still required)

1. Prevent XSS: never `dangerouslySetInnerHTML` untrusted input; sanitize any
   HTML; keep dependency hygiene tight.
2. Strong CSP at the hosting layer.
3. Never log access tokens, refresh tokens, or session payloads.
4. Never embed `service_role` keys in client code or env vars exposed to the
   browser. `service_role` is server-only.
5. Treat RLS as the **real** access boundary. The browser session identifies
   the caller; the database decides what they can read/write.

## Rules

- **Never** expose or import `SUPABASE_SERVICE_ROLE_KEY` from `src/`.
- **Never** log `session`, `access_token`, `refresh_token`, or full user
  objects.
- **Never** trust a client-supplied `user_id` as an access decision. Client
  filters on `user_id` are UX/performance hints only; RLS policies in Postgres
  are the security boundary.
- **Always** revalidate the session on protected page mounts via
  `useRequireAuth` (calls `supabase.auth.getUser()`).
- **Never** add `NEXT_PUBLIC_*` env vars, `next/headers`, or `@supabase/ssr`
  without a separately approved auth architecture.

## Sign-out

Sign-out is gated behind a confirmation dialog (`SignOutConfirmDialog`).
Confirming calls `supabase.auth.signOut()` and redirects to `/auth`. Cancel
leaves the user in place. This avoids accidental sign-outs on mobile/grow-room
use.

## Session revalidation

`useRequireAuth` (in `src/hooks/useRequireAuth.ts`) is used at the protected
route boundary. It:

1. Calls `supabase.auth.getUser()` on mount — re-validates the bearer with the
   auth server rather than trusting only the cached session.
2. Reports loading / authenticated / unauthenticated.
3. Redirects unauthenticated users to `/auth`.

It is not called from every component. The layout-level call is the single
revalidation point, while `AuthProvider` maintains the live session through
`onAuthStateChange`.

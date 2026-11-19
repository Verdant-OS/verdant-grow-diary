# Claude.ai connector sign-in: findings and steps (nothing changed)

## What I checked (read-only)
- Backend sign-in server status for this project: **OAuth server: Disabled. Dynamic client registration: Not configured. Consent page path: Not configured.** Site URL is `https://verdantgrowdiary.com`.
- `https://knkwiiywfkbqznbxwqfh.supabase.co/auth/v1/.well-known/oauth-authorization-server` returns **404**, so Claude finds no registration endpoint. That is the exact cause of "does not support dynamic client registration".
- The repo already has the consent page file (`src/routes/[.]lovable.oauth.consent.tsx`) and MCP code in `src/lib/mcp/`.

## Answers
1. **Is DCR off?** Yes — more than that, the whole OAuth 2.1 server is off. It can be enabled with one tool call: `supabase--configure_oauth_server` (no parameters). It turns on the OAuth server, sets the consent path to `/.lovable/oauth/consent`, and turns on dynamic client registration.
   - Side effects to know before approving: it changes production Auth settings only (no files, migrations, tables, functions or deploys). Per platform docs it may **reset the Site URL** to the primary domain Lovable knows (currently `growdiary.app` per project settings, since `verdantgrowdiary.com` shows provisioning_failed). That could change where password-reset/confirm links land. Unverified until run; I would read it back afterwards with `supabase--debug_oauth_server`.
   - This is an auth-setting change on the locked production backend, so it needs Matthew's explicit yes.
2. **Manual client instead?** Not possible while the OAuth server is disabled — a client can only be registered once it is on. After enabling, DCR makes a manual client unnecessary. If you still want one, no agent tool creates it; it would be added in Cloud → Users → Auth settings (OAuth apps), which then shows the client ID. Whether that screen exists for this project: unknown.
3. **Redirect URI for Claude.ai:** `https://claude.ai/api/mcp/auth_callback` (Anthropic's documented callback; some setups also use `https://claude.com/api/mcp/auth_callback` — register both if adding manually).

## Remaining blockers after enabling (not part of the setting itself)
- The consent page must be reachable on the live site (Site URL host). `verdantgrowdiary.com` is served by Cloudflare from older code; if that build lacks `/.lovable/oauth/consent`, approval will 404. Needs a deploy by the owner.
- MCP token check must use issuer `https://knkwiiywfkbqznbxwqfh.supabase.co/auth/v1` (matches what you gave). Signing-key type (HS256 vs ES256) not checked; asymmetric keys are required for external verification.

## Proposed order (on approval only)
1. Run `supabase--configure_oauth_server` (no params).
2. Read back with `supabase--debug_oauth_server`; curl the discovery URL to confirm `registration_endpoint`; report any Site URL change.
3. You retry the Claude.ai connector. No file edits, migrations or publish.

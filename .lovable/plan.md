# Site URL restore: answers (read-only, nothing changed)

## 1. Tool to set Site URL
- **No agent tool sets the Site URL.** `supabase--configure_auth` only covers signup, anonymous, auto-confirm, HIBP, current-password and email rate limit. `supabase--configure_oauth_server` takes no Site URL and is what reset it. `supabase--debug_oauth_server` is read-only.
- The only route: owner edits **Users → Auth settings → Advanced → Site URL** to `https://verdantgrowdiary.com`. That field is separate from the OAuth server, self-registration, consent path and redirect list. Whether the UI save touches anything else: unverified; read back with `supabase--debug_oauth_server` afterwards.

## 2. Will it be reset again?
Likely yes. Per Lovable's sync rules, Site URL is set to the preview, then the published app, replacing a Lovable-hosted value; a value on your own domain stays only until the OAuth server is re-configured or an app MCP server is published, which resets it to the **primary** domain. Current facts:
- Lovable's primary URL is `https://growdiary.app` (`verdantgrowdiary.com` and `www` are `provisioning_failed`; project not published on Lovable).
- So a manual `verdantgrowdiary.com` should survive ordinary syncs (own domain), but **publishing the MCP server or re-running OAuth setup would reset it to growdiary.app** (or the preview while unpublished).
- What makes it stick: `verdantgrowdiary.com` becomes the project's connected, primary domain. Domain check today: A record points to Cloudflare (104.21.68.125 / 172.67.195.135) instead of `185.158.133.1`, and TXT `_lovable.verdantgrowdiary.com = lovable_verify=40e9a4e8…a5ad` is missing. Because the live site is intentionally served by Cloudflare Workers, the realistic path is connecting it with **"Uses Cloudflare or similar proxy"** (CNAME verification), then **Set as primary**. Owner decision; it also changes which domain other Lovable domains redirect to.

## 3. Read-back
- **JWT signing:** JWKS publishes one key, `kty EC`, `alg ES256` (kid `bae3464f…`). Asymmetric key is published; whether user tokens are actually signed with it (vs still HS256) is **NOT_MEASURED** — no signed-in session was available to decode.
- **Redirect allow-list (20):** verdantgrowdiary.com, www.verdantgrowdiary.com, verdantgrowdiary.org, www.verdantgrowdiary.org, growdiary.app, www.growdiary.app, diarygrow.app, www.diarygrow.app, verdantgrow.app, www.verdantgrow.app (all `/**`), plus 10 Lovable preview/project/live addresses for this project.
- **Current Site URL:** the editor preview address. OAuth server on, self-registration on, consent path `/.lovable/oauth/consent`.

## Proposed next step (on approval)
None by me — owner sets the Site URL in Auth settings; I then read it back with `supabase--debug_oauth_server` and confirm nothing else moved.

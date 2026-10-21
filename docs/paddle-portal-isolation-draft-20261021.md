# Paddle portal isolation draft — 2026-10-21

Task: PADDLE-PORTAL-20261021. Holder: Codex, 2026-10-21 UTC.
Branch: `codex/paddle-portal-20261021-server-isolation`.
Base: `verdant-grow-diary` at `05f5138d08c943921df0ce224af8d9c0837c09d9`.
Status: planning checkpoint; implementation and tests pending. Stay draft.

The owner's delegated request authorizes this bounded server-side code slice,
including its existing Edge entry point. Existing protected unlock approvals,
test locks, production holds and ownership remain in force.

## Closed file plan

- `supabase/functions/paddle-portal-session/index.ts`
- New `supabase/functions/paddle-portal-session/portalSessionTestHarness.ts`
- New `src/test/paddle-portal-session-server-isolation.test.ts`
- This receipt

Authenticate before privileged lookup/configuration. Reuse the existing strict
server billing-environment resolver; filter recurring and lifetime queries by
that environment and verified user. Verify the selected customer against the
canonical customer mirror. Mint a fresh overview URL with the existing `{ url }`
response contract; keep logs free of provider errors, tokens and URLs.

Prediction: synthetic real-handler tests will reproduce cross-environment
selection, missing mirror validation and provider-error log leakage on the base,
then pass with the bounded handler change. No tests have run at this checkpoint.

## Collision and ownership receipt

The clean saved checkout and fresh remote deploy head matched the exact base.
A read-only inventory of all 110 open PRs found no changed-file overlap for the
four paths above. No global clean-ownership claim is made: the shared registry
`/workspace/shared/context/fleet-locks.md` is unavailable, and unpushed work in
other sessions cannot be observed here.

- #2252 remains open/non-draft at `7c764ad25e9f3a42a0888558937c709bf75afe93`.
  Its latest observed claim is Claude, 2026-10-20 16:45 UTC, with no release
  found. Shared Paddle/webhook files remain with that holder. Signature SDK
  adaptation and canonical ordering implementation are deferred.
- #2230 remains open/non-draft at `26a7c544bb75f523bd7c0fd13ab265b9bc387b8a`.
  Claude's observed 2026-10-20 16:10 UTC claim and webhook release hold remain.
  `.env.example` is excluded; no placeholder delta is needed for this slice.
- #2221 and #2229 are merged; the local #2221 open handoff is historical.
- `docs/agents/HANDOFF_LOG.md` overlaps 19 open PRs. This dedicated receipt
  and the new draft PR carry the task record; shared-log editing is deferred
  to coordination. No claim/release comments or other PR mutations are authorized.

No existing scorer will be edited or unlocked. No shared module, generated
mirror/manifest, dependency/lockfile, migration, auth/RLS policy or UI changes
are included.

## Review and retained completion gates

Independent exact-head acceptance must come from Blue Dream, Critical Mass or
assigned Durban Poison; Codex authored this slice and cannot self-accept it.
Required CI is 35/35 at the exact head plus applicable supplemental checks.
CodeRabbit resolved author-approval/override settings need separate verification;
repository YAML alone cannot establish dashboard settings. Draft auto-review is
disabled in the current YAML. No settings will be changed here.

Local synthetic fixtures validate code only. Production schema/secrets, Paddle
destinations, actual Edge deployment and live behavior remain NOT_MEASURED.
No merge, deployment, live QA, API writes, production SQL, credentials,
notification creation or security-setting changes are authorized. Permanent
Paddle entities and their database mirrors must never be deleted or offered as
cleanup.

Next owner: Codex implements and validates the bounded portal draft, then an
eligible independent reviewer accepts the resulting exact head. Existing
webhook/checkout owners coordinate the deferred slices separately.

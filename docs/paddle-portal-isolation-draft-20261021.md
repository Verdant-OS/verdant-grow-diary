# Paddle portal isolation draft — 2026-10-21

Task: PADDLE-PORTAL-20261021. Holder: Codex, 2026-10-21 17:30 UTC.
Branch: `codex/paddle-portal-20261021-server-isolation`.
Base: `verdant-grow-diary` at `05f5138d08c943921df0ce224af8d9c0837c09d9`.
PR: <https://github.com/Verdant-OS/verdant-grow-diary/pull/2308>.
Status: implemented and locally validated; hosted CI and outside acceptance pending.
Stay draft. The PR's actual head is the commit identity, not the planning checkpoint.

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

The predicted failures reproduced against the unchanged base handler. The same
final 42-case matrix returned 30 FAIL / 12 PASS / 0 SKIP on a disposable copy of
the base, then 42 PASS / 0 FAIL / 0 SKIP on the fixed handler. No source rollback
was performed in the writer checkout. An earlier 38-case RED was 28 FAIL / 10 PASS.

The final behavior also checks malformed/missing overview responses, preserves
invoice access for canceled subscriptions, reports lifetime-query errors, orders
equal creation timestamps deterministically and sends `Cache-Control: no-store`.
It does not decide paid entitlement or cancel any subscription.

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
CodeRabbit effective author-approval-disabled and reviewer-only-override settings
are BLOCKED: no settings-read tool, authenticated dashboard or resolved-config
export is available. Repository YAML cannot establish dashboard settings. Its
[planning-head bot receipt](https://github.com/Verdant-OS/verdant-grow-diary/pull/2308#issuecomment-6322334936)
explicitly skips draft review despite a green status. No review was triggered,
coverage overridden or settings changed. Source exclusions, including generated
shared mirrors and lockfiles, remain as configured; neither is changed here.

## Local evidence

Toolchain: Linux x64, Node 24.19.0, Bun 1.3.14, TypeScript 5.9.3,
Vitest 4.1.12. The canonical `bun install --frozen-lockfile` succeeded; `bun.lock`
is unchanged. Tests run with an empty inherited environment and a process-wide
preload denying fetch/socket/HTTP/TLS/UDP access. The fixture VM independently
rejects network use and unexpected imports. No real credentials were read or
provider/database request issued by these tests.

| Check                                        | Result                                       |
| -------------------------------------------- | -------------------------------------------- |
| Same final matrix on base vs fixed handler   | RED 30 FAIL / 12 PASS; GREEN 42 PASS         |
| Focused regression, 12 files                 | 294 PASS / 0 FAIL / 0 SKIP                   |
| Independent peer rerun of new matrix         | 42 PASS / 0 FAIL / 0 SKIP; no P1/P2 findings |
| `tsc -p tsconfig.json --noEmit`              | PASS, exit 0, no diagnostics                 |
| ESLint on three code/test files              | PASS, exit 0, no diagnostics                 |
| Prettier on four changed files               | PASS                                         |
| Docs safety, client/published secret scans   | PASS                                         |
| Edge import guard and mirror synchronization | PASS; 106 mirrored files unchanged           |
| Scorer lock, strict against exact base       | PASS; no tracked scorer changed/unlocked     |

The focused set contains the new matrix, portal client lifetime contract,
server-billing-environment contracts, isolated Edge packaging, six existing
payments-security suites, signed raw-wire webhook cases and execution-manifest
checks. It includes existing Founder, credit/refund and receipt retry handling;
it does not prove canonical ordering or SDK signature adaptation.

Receipts in this saved environment: `/tmp/paddle-portal-final-red.log`,
`/tmp/paddle-portal-green.log`, `/tmp/paddle-portal-focused-green.log`,
`/tmp/paddle-portal-typecheck.log`, `/tmp/paddle-portal-lint.log`,
`/tmp/paddle-portal-peer-review-tests.json`. Eight isolated guard mutations
are recorded in `/tmp/paddle-portal-mutations/summary.json`; each must fail
the targeted matrix. These are separate runs, not additional unique tests.

Code SHA-256 values reviewed and tested:

- Handler: `e5d7a8c44e4cab6529070fbaefa18c654a31c76e0ca6d6a97a7ee5a9e93ef5d9`
- Harness: `ba5a9c5623290908b938ee60594334e7f9273b00742a5810756bdf38b2762fae`
- Tests: `449f13b52fe3042c76356f035b8f5e168a13de31ff7c29e90c31310ed67e1c9f`

Peer feedback is not outside exact-head acceptance. Actual Deno/SDK execution
and a frontend build were not run: no SDK API/transport or frontend source is
changed, and the held unpinned shared SDK import is not resolved or pinned here.
Before rollout, verify configured billing environment and existing canonical
customer mirrors: a subscription without its matching mirror now returns `503`.
No mirror backfill, deletion or data migration is included or authorized.

Local synthetic fixtures validate code only. Production schema/secrets, Paddle
destinations, actual Edge deployment and live behavior remain NOT_MEASURED.
No merge, deployment, live QA, API writes, production SQL, credentials,
notification creation or security-setting changes are authorized. Permanent
Paddle entities and their database mirrors must never be deleted or offered as
cleanup.

Next owner: Grok 91 routes the exact draft head to an eligible independent
reviewer and checks required CI. Existing webhook/checkout owners coordinate
the deferred slices separately. Prompt: review #2308 at its exact current head,
preserve draft status and every live gate; do not merge or deploy.

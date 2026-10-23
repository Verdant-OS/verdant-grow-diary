# Paddle portal isolation draft — 2026-10-21

Task: PADDLE-PORTAL-20261021. Holder: Codex, 2026-10-21 17:30 UTC.
Branch: `codex/paddle-portal-20261021-server-isolation`.
Base: `verdant-grow-diary` at `05f5138d08c943921df0ce224af8d9c0837c09d9`.
PR: <https://github.com/Verdant-OS/verdant-grow-diary/pull/2308>.
Status: P2 availability repair locally validated; fresh hosted CI and outside acceptance pending.
Stay draft. The PR's actual head is the commit identity, not the planning checkpoint.

The owner's delegated request authorizes this bounded server-side code slice,
including its existing Edge entry point. Existing protected unlock approvals,
test locks, production holds and ownership remain in force.

## Closed file plan

- `supabase/functions/paddle-portal-session/index.ts`
- New `supabase/functions/paddle-portal-session/portalSessionTestHarness.ts`
- New `src/test/paddle-portal-session-server-isolation.test.ts`
- New `src/test/paddle-portal-session-mirror-availability.test.ts` (2026-10-23 repair)
- `config/edge-function-domain-reach.json` (previously approved declaration at `e2f07d08`)
- This receipt

Authenticate before privileged lookup/configuration. Reuse the existing strict
server billing-environment resolver; filter recurring and lifetime queries by
that environment and verified user. Check any present customer mirror for
agreement; a successful lookup with no row permits the owned subscription.
Mirror errors or disagreement deny access. Mint a fresh overview URL with the existing `{ url }`
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

The original 2026-10-21 clean saved checkout and fresh remote deploy head matched the exact base.
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

The original slice changed no existing scorer. Matthew later approved the
one-file manifest declaration and, separately, exactly three assertion changes
in the tracked portal isolation test for this repair. No checker, governance,
shared module, generated mirror, dependency/lockfile, migration, auth/RLS policy
or UI change is included. The manifest is unchanged by the availability repair.

## Review and retained completion gates

Current merged [OWNERSHIP §4.3](https://github.com/Verdant-OS/verdant-grow-diary/blob/31bdb18b33b8a98443a149502ac08b575b5a7075/docs/agents/OWNERSHIP.md#L174-L180)
permits an available non-contributing Claude/Grok session to independently
review Codex-authored work. Codex authored and repaired this slice and cannot
self-accept it. Claude's [review at `e2f07d08`](https://github.com/Verdant-OS/verdant-grow-diary/pull/2308#issuecomment-6370652156)
is PASS-with-P2, explicitly not merge acceptance. The repaired head needs a full
new review; eligibility does not establish acceptance. No governance edit is included.
Required CI is 35/35 at the exact head plus applicable supplemental checks.
CodeRabbit effective author-approval-disabled and reviewer-only-override settings
remain NOT_MEASURED by this slice; a separate task owns settings verification.
Repository YAML cannot establish dashboard settings. Its
[planning-head bot receipt](https://github.com/Verdant-OS/verdant-grow-diary/pull/2308#issuecomment-6322334936)
explicitly skips draft review despite a green status. No review was triggered,
coverage overridden or settings changed. Source exclusions, including generated
shared mirrors and lockfiles, remain as configured; neither is changed here.

## Original local evidence at `a05e368` (2026-10-21)

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
The original handler required a matching customer mirror. The availability
repair below removes that historical-row prerequisite while retaining the
authenticated subscription ownership/environment checks. No mirror backfill,
deletion or data migration is included or authorized.

## P2 availability repair (2026-10-23)

Subscription events and customer events populate separate mirrors. The
subscription [schema](../supabase/migrations/20260709083556_e7572ff2-e7c2-402b-bc53-d6ecb58bcd71.sql)
stores a non-null authenticated-user reference, provider subscription/customer
IDs and environment; clients have no write policy. The later customer
[schema](../supabase/migrations/20260716193516_79a7fd50-ba06-4fe2-b1e1-e597f1657d7a.sql)
has neither an app user ID nor a subscription foreign key or backfill. Successful
subscription fulfillment therefore does not establish customer-mirror existence.

The handler keeps the verified user, strict server environment and nonempty
subscription/customer IDs authoritative. It queries the optional mirror by the
selected customer ID alone: otherwise an explicit conflicting environment would
be hidden as absence. A present ID/environment disagreement or a lookup error
returns `503` before Paddle; confirmed absence proceeds with the same owned
subscription/customer and configured provider environment. No provider lookup or
mirror write is added. Fixed reason codes distinguish missing, mismatching and
failed mirror lookups without IDs, URLs, tokens or exception payloads.

Matthew explicitly approved the branch-bound scorer exception only for
`src/test/paddle-portal-session-server-isolation.test.ts`: absent/unrelated
mirror outcomes become `200` using the caller's exact IDs, and the mirror-query
assertion uses customer ID alone. All 42 cases remain, including wrong-environment,
lookup-error, authentication and ownership checks. No other existing assertion
was changed. The new 10-case suite separately covers both environments with newer
cross-user/opposite-environment rows, forged client input, inconsistent returned
IDs, lookup errors and value-free diagnostics.

- New 10-case suite, byte-identical RED/GREEN: **8 FAIL / 2 PASS**, then **10 PASS / 0 FAIL / 0 SKIP**.
- Approved original portal matrix: **42 PASS / 0 FAIL / 0 SKIP**.
- Focused regression, 13 files: **304 PASS / 0 FAIL / 0 SKIP**.
- Existing domain guard: PASS, 22 service-role functions, no undeclared reach;
  unchanged domain tests: **16 PASS / 0 FAIL / 0 SKIP**.
- Typecheck, scoped lint and formatting: PASS. The initial formatting check
  found one handler line wrap; corrected before final validation.
- Fresh 2026-10-23 17:18:47 UTC inventory: all 183 open PRs and changed-file lists;
  no other writer observed on the repair paths. Shared-session registry remains unavailable.

Tests retain the empty inherited environment, process network fence and isolated
VM with synthetic fixtures. The earlier 38-to-42 expansion is historical and
separate from these 10 added cases. Scorer validation covers this repair against
published `e2f07d08`; the previously approved manifest bytes and its earlier
whole-PR strict-scorer receipt remain unchanged. The only new unlock is the
approved test file, closed at completion. Evidence and proposed/approved assertion
scope are saved under `/workspace/paddle-2308-handoff-20261023/mirror-availability-repair/`.

Before rollout, separately verify production schema/service-role read access,
authoritative subscription identity/environment mapping, explicit server billing
environment/provider configuration, actual Edge deployment and authenticated
portal behavior. Historical customer-mirror completeness and customer-event
destination coverage are no longer prerequisites for opening the portal, and
remain NOT_MEASURED. Complete fulfillment, actual Deno/SDK execution and live
integration are not established by this repair. Overview validation still checks
only a nonblank string; the previously disclosed URL-policy limitation remains.

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

# Phase 1 entitlement verification reconciliation

## Slice identity

- Deploy baseline: `b902157a9231b9679201331ae603e4b678fd4830`
- Branch: `codex/verdant-trust-core-entitlement-verification`
- Scope: client/server entitlement verification truth and Founder/Pro capability parity
- Schema, RLS, billing-lane, checkout-provider, and Founder-allocation changes: none

The external T1-T21 charter and Claude P0/P1 companion map were not present in
the repository at branch cut. The T9/T10 association below therefore follows
the handoff text supplied in the working session (capability gating and
client/server parity), without restating or replacing the canonical outcome
wording.

## Frozen decisions preserved

- `public.subscriptions` remains the only canonical billing entitlement lane.
- Billing-lane direction, provenance rules, and the existing Founder backfill
  remain unchanged.
- `profiles.tier` remains gamification-only.
- Paid/cost-bearing operations remain server-authoritative.
- Founder Lifetime remains Pro-like for boolean capabilities and capped at 100
  AI credits per UTC month.
- No scanner suppressions or allow-list exceptions were added.

## Reconciled defect

The canonical subscription queries previously converted read errors into empty
row sets. Both the client hook and shared Edge helper could consequently
produce a resolved Free entitlement with no indication that the plan was
unverifiable. Presentation surfaces then rendered Free labels, plan caps, or
upgrade CTAs, while several server gate error states were indistinguishable
from a verified denial.

## Resolution contract

1. A proven valid paid row wins even if a lower-precedence relevant read fails.
2. If no paid row is proven and any required canonical read fails, the result
   is `lookupFailed` / `verification_failed`, not verified Free.
3. Only verified plan denials may render paywall or upgrade UI.
4. Verification and network failures render neutral retry states and perform no
   paid operation.
5. Grow/tent creation retains its documented fail-open UX during plan-read
   uncertainty; database ownership and server-side paid gates remain
   authoritative.
6. Client and server capability checks consume the same canonical resolver and
   are exercised by one Free/Pro Monthly/Pro Annual/Founder matrix.

## Surface closure

| Surface                    | Verified Free                   | Verification failure                         |
| -------------------------- | ------------------------------- | -------------------------------------------- |
| Settings / Timeline        | Free or upgrade copy            | Plan unavailable + retry                     |
| Pricing / checkout success | Current plan may be marked      | No inferred current plan; neutral retry      |
| Premium reports / exports  | Server-verified paywall         | No paywall; retryable unavailable state      |
| AI credit denial           | Server Free denial may upsell   | Plan-neutral denial; no funnel/paywall event |
| Pheno Tracker entry/write  | Verified Free routes to pricing | Central/inline plan check; no upgrade claim  |
| Grow / tent caps           | Verified Free caps              | Unknown caps; do not block as Free           |

`SubscriptionPastDueBanner` and the Pheno workspace's unnumbered fallback do
not render an upgrade claim and already hide or remain neutral when no
verified paid state is available.

## Verification evidence

- RED: 3 foundation failures, 4 report failures, 1 post-grow failure, 2
  Settings/Timeline failures, 1 capability-helper failure, 1 grow/tent failure,
  3 Pheno entry failures, 5 remaining plan-surface failures, and 1 Pheno write
  failure were observed before implementation.
- GREEN targeted closure: 27 files, 294 tests passed.
- Static-safety closure: 8 files, 180 tests passed.
- Scanner guardrails: 20 files, 326 tests passed; no suppressions added.
- Type-check: passed (`bun run typecheck`).
- Changed-file lint: 0 errors, 17 pre-existing warnings.
- Production build: passed (4,244 modules transformed).
- Repository dependency policy: passed (`bun run check:deps`).
- Static client-secret scanner self-tests: passed. Its whole-repository scan is
  red only on two ignored production-bundle matches (`service_role` and
  `BRIDGE_TOKEN_ENV`) generated from existing troubleshooting/redaction copy;
  no secret, source violation, suppression, or scanner change was introduced.
- Full controlled Vitest suite: attempted, but the controller did not return a
  result before the 15-minute command bound; no full-suite pass is claimed.
- Runtime DB harness: not applicable; no schema or RLS change.
- Authenticated deployment smoke and Claude review: pending promotion gates.

## Claude review focus

1. Confirm the partial-read rule cannot grant access from an invalid or stale
   row and cannot demote a proven valid Founder row.
2. Confirm every paywall is downstream of a verified denial, not a lookup or
   transport failure.
3. Confirm the capability matrix represents the frozen canonical lane on both
   client and server.
4. Confirm no billing-lane, provenance, Founder-allocation, schema, RLS, or
   scanner-policy behavior moved in this slice.

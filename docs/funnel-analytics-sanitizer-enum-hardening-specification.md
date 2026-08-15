# Funnel analytics sanitizer — enum-like value hardening specification

**Status:** `HOLD — approvable, implementation blocked in this environment` (see Blocked below)
**Author:** Claude (Knowledge Library & Product Specification Architect)
**Audited ref:** `origin/verdant-grow-diary` (the deploy branch) — **not** `main`, and not the
branch this spec was written on (`claude/vibrant-liskov-22927f`). See "Branch mismatch" below.

## 1. Summary

`sanitizeFunnelParams` (`src/lib/funnelAnalytics.ts`) enforces length (1–32 chars) and
"no whitespace" on string param values, but not the "enum-like" shape its own docblock
promises. A value forged directly onto the `verdant:analytics` `CustomEvent` bridge —
bypassing `trackFunnelEvent` entirely, e.g. from devtools or a malicious extension —
passes both `sanitizeFunnelParams` and `enforceFunnelEventSchema` unchanged if it is a
spaceless string ≤32 chars. Demonstrated smuggleable shapes: an email address, a 32-char
hex UUID, an IPv4/IPv6 address, a spaceless phone number.

This spec: (a) corrects the risk premise the originating task stated, (b) enumerates
every real value every real call site sends today, (c) specifies an exact, minimal fix
verified against that full inventory, and (d) hands off implementation — this document
is the specification, not the patch.

## 2. Branch mismatch — read this before assigning implementation

`src/lib/funnelAnalytics.ts` **does not exist** on `main` or on this spec's branch. It
exists only on `origin/verdant-grow-diary`. All line numbers, call sites, and code below
are read from that ref via `git show`/`git grep` against the remote tracking ref — no
checkout was performed, nothing was executed, and no source file in this worktree was
modified. Whoever implements this needs a worktree based on `verdant-grow-diary`, not on
`main`. This is a bigger blocker than the sanitizer gap itself: without it, nobody can
land or test a fix from a `main`-based checkout regardless of which agent is assigned.

## 3. Confirmed gap (verified, not inferred)

Read at `origin/verdant-grow-diary:src/lib/funnelAnalytics.ts`:

- Module docblock, lines 17–22: claims "string values must be short enum-like tokens —
  free text (notes, nicknames, emails) cannot pass through this module."
- `reason` key doc, lines 100–106: claims reason values are "Server-defined tokens
  only... never carries free text."
- `sanitizeFunnelParams`, lines 135–161: the only string-value check is
  `value.length > 0 && value.length <= 32 && !/\s/.test(value)`. No character-class or
  shape restriction exists. Line numbers match the originating task's citation exactly.

`enforceFunnelEventSchema` (`src/lib/funnelEventSchema.ts`) confirmed to restrict only
**which keys** are allowed per event — it does not inspect value content at all. So the
docblocks describe intent the code does not yet enforce; this is an implementation gap,
not a documentation error. **No docblock text changes are needed** — once the fix below
lands, the existing wording becomes true as written.

## 4. Correction to the originating task's risk premise

The task flagged `plan` as the dangerous param to touch, reasoning that Paddle price IDs
(`pri_01h...`-shaped, "digit-heavy and hex-adjacent") flow through it and a naive regex
could false-positive on them. **Verified false, from source:**

At `src/hooks/usePaddleCheckout.ts:168`, `trackFunnelEvent("checkout_started", { plan:
options.priceId })` — and `options.priceId` here is the app's own internal plan slug,
never the Paddle `pri_...` id. The real Paddle price id is resolved *after* this line, by
`getPaddlePriceId(options.priceId)` on line 171, and flows only into
`items: [{ priceId: paddlePriceId, ... }]` for the Paddle SDK call — it never reaches a
funnel param anywhere in the codebase (confirmed by `git grep` for `priceId` and
`PADDLE_PRICE` across `src/` and `supabase/functions/`).

The entire real `plan` universe is the 7-entry `PAID_PLAN_IDS` allowlist
(`src/lib/paidPlanAllowlist.ts`) plus the literal fallback token `"unknown_plan"`:

```
pro_monthly, pro_annual, craft_monthly, craft_annual, founder_lifetime,
credit_pack_50, credit_pack_150, unknown_plan
```

None of these are hex-adjacent or digit-heavy. **The false-positive risk that was the
stated justification for treating this as delicate does not exist.** This lowers the
task from "needs careful separate handling" to a small, mechanically verifiable change —
provided it's verified against the full real-value inventory below, not just `plan`.

## 5. Real-value inventory (enumerated from every real call site, `verdant-grow-diary`)

Every `trackFunnelEvent(...)` call site in `src/` (excluding test files), with the
concrete value(s) each key can take:

| Key | Real values | Source |
|---|---|---|
| `plan` | `pro_monthly`, `pro_annual`, `craft_monthly`, `craft_annual`, `founder_lifetime`, `credit_pack_50`, `credit_pack_150`, `unknown_plan` | `paidPlanAllowlist.ts`; `usePaddleCheckout.ts:168,241`; `checkoutRecoveryPlanSlug.ts` (already allowlist-gated before reaching the funnel); `Pricing.tsx:818,841,867`; `CheckoutSuccess.tsx:131` (`entitlement.effectivePlanId`) |
| `surface` | `checkout_success`, `blueprint_locked`, `ai_doctor_limit`, `onboarding`, `pricing`, `upgrade`, `daily_check_hint`, `tent_alert_row`, `imported_history`, `ai_doctor_low_credit`, `standard`, `historical_review`, `ai_doctor`, `other` | `CheckoutSuccessFounderNote.tsx`; `PlantBlueprintOverlaySection.tsx`; `PlantDetailAiDoctorLiveReview.tsx` (incl. `acceptedMode`, gated to exactly `"historical_review"`\|`"standard"`); `Onboarding.tsx`; `Pricing.tsx`; `Upgrade.tsx`; `TentAlertsBlueprintHint.tsx`; `plantTentAlertsDoctorCtaTracking.ts`; `ImportedSensorHistoryAiDoctorHandoff.tsx`; `aiDoctorLowCreditTopUpViewModel.ts` (`AI_DOCTOR_LOW_CREDIT_SURFACE`); `checkoutReturnTo.ts` (`CheckoutReturnSurface = "ai_doctor" \| "pheno" \| "other"`, `"pheno"` excluded before reaching the tracker) |
| `method` | `email` | `Auth.tsx:406` — the only real funnel call site; every other `method:` match in the repo is unrelated (HTTP methods, quick-log entry method, breeding methods) |
| `event_type` | `note`, `water`, `feed`, `photo`, `environment`, `training`, `defoliation`, `observation`, `harvest`, `plant_check` | `quickLogSuccessTelemetry.ts` `QUICK_LOG_SUCCESS_EVENT_TYPES` (closed, typed) |
| `reason` | `unknown_plan`, `price_not_configured`, `price_resolution_unavailable`, `plan_sold_out`, `pack_requires_monthly_plan`, `checkout_env_unavailable`, `missing`, `wrong_type`, `empty_string`, `not_in_allowlist` | `paddle.ts` `PaddleCheckoutCatalogReason`; literal in `usePaddleCheckout.ts`; `checkoutRecoveryPlanSlug.ts` `UnknownPlanSlugFallbackReason` |
| `length_bucket` | `0`, `1-8`, `9-32`, `33+` (exactly 4, closed) | `checkoutRecoveryPlanSlug.ts` `classify()` — the only emitter |
| `metric` | `temp`, `rh`, `vpd`, `ppfd` | `plantTentAlertsDoctorCtaTracking.ts`, `PlantAssignedTentAlertsPanel.tsx`, gated to `environmentTargetComparison.ts` `METRIC_LABELS` keys |
| `severity` | `critical`, `warning`, `watch`, `info` | `plantTentAlertsDoctorCtaTracking.ts` `ALERT_SEVERITIES`; `AlertSeverityRow` |
| `rows` | numeric, not a string — out of scope (already handled by the `typeof value === "number"` branch) | `EnvironmentCsvImportLauncher.tsx:172` |

Every string value above matches `^[a-z0-9_]+$` **except** `length_bucket`'s 3 non-bare
values (`1-8`, `9-32`, `33+`), which contain `-`/`+`. That is the one deliberate
exception the fix must accommodate without weakening anything else.

## 6. Demonstrated attack shapes vs. the inventory — verification table

| Shape | Example | Caught by `^[a-z0-9_]+$`? | Needs an extra rule? |
|---|---|---|---|
| Email | `a@b.co` | Yes — `@` and `.` are outside the class | No |
| IPv4 | `192.168.1.1` | Yes — `.` is outside the class | No |
| IPv6 | `2001:db8::1` | Yes — `:` is outside the class | No |
| Dashed UUID | `550e8400-e29b-...` (36 chars) | Already rejected by the existing 32-char length cap | No |
| **Bare-hex UUID (no dashes)** | `550e8400e29b41d4a716446655440000` (32 chars) | **No** — hex letters `a-f` and digits are inside `[a-z0-9_]` | **Yes** |
| **Spaceless phone number** | `15551234567` | **No** — digits are inside `[a-z0-9_]` | **Yes** |

Two additional rules are needed beyond the character-class check. Verified against every
row of the inventory in §5 (full reasoning in the diff rationale below):

- **Bare-hex rejection:** reject if the value is 16+ characters and consists entirely of
  `[0-9a-f]`. 16 is chosen deliberately above any real token length — the shortest
  hex-*looking* real word in the inventory is `feed` (4 chars, all valid hex digits by
  coincidence), so the threshold must clear short coincidental matches with margin while
  staying well under the demonstrated 32-char attack.
- **Digit-run rejection:** reject if the value is 7+ characters and consists entirely of
  `[0-9]`. 7 matches the shortest plausible phone number length. No real value in the
  inventory is ever purely numeric at any length (`rows` never reaches the string branch).

Neither rule fires on any inventory entry — checked row by row: every `plan`/`surface`/
`event_type`/`reason`/`metric`/`severity` value contains at least one letter outside
`a-f` or an underscore, so none is all-hex or all-digit.

## 7. Recommended fix

Minimal, additive change to `sanitizeFunnelParams` — the length/whitespace checks stay;
only the string-acceptance condition changes:

```ts
const ENUM_TOKEN_PATTERN = /^[a-z0-9_]+$/;
const HEX_ID_MIN_LENGTH = 16; // above any real token; below the demonstrated 32-char UUID
const DIGIT_RUN_MIN_LENGTH = 7; // shortest plausible phone-number length

/** The 4 documented length_bucket values — see the FUNNEL_PARAM_KEYS doc above. */
const LENGTH_BUCKET_VALUES: ReadonlySet<string> = new Set(["0", "1-8", "9-32", "33+"]);

function isEnumLikeParamValue(key: FunnelParamKey, value: string): boolean {
  if (value.length === 0 || value.length > MAX_STRING_PARAM_LENGTH) return false;
  if (key === "length_bucket") return LENGTH_BUCKET_VALUES.has(value);
  if (!ENUM_TOKEN_PATTERN.test(value)) return false;
  if (value.length >= HEX_ID_MIN_LENGTH && /^[0-9a-f]+$/.test(value)) return false;
  if (value.length >= DIGIT_RUN_MIN_LENGTH && /^[0-9]+$/.test(value)) return false;
  return true;
}
```

In the loop, replace the existing string-branch condition:

```ts
if (typeof value === "string" && isEnumLikeParamValue(key, value)) {
  out[key] = value;
}
```

`ENUM_TOKEN_PATTERN` already excludes whitespace, so the old `!/\s/.test(value)` check is
subsumed — safe to drop, or keep for a smaller diff. Either is fine; note it explicitly
in the PR description so a reviewer doesn't read it as an oversight.

**Design choice flagged for the implementer:** `length_bucket` is handled by an exact
4-value allowlist rather than widening `ENUM_TOKEN_PATTERN` to include `-`/`+` globally.
Widening the shared pattern would also let a dash-separated phone number
(`555-123-4567`) slip through undetected by either new rule, since it's neither all-hex
nor all-digit. The 4-value exact match is simpler to audit and closes that residual gap
for free — recommended over the alternative (a second regex shaped like
`^\d{1,3}(-\d{1,3}|\+)?$`, which also works but requires re-deriving why it can't encode
a phone number every time someone touches it).

## 8. Test additions needed (`src/test/funnel-analytics.test.ts`)

1. **Positive, full inventory:** one parametrized case asserting every value in §5's
   table still survives `sanitizeFunnelParams` unchanged, keyed by its real param key —
   this is the regression guard that makes the fix safe to land.
2. **Negative, demonstrated shapes:** email (`a@b.co`), bare 32-char lowercase hex,
   bare 32-char uppercase hex (should already fail at the character-class step),
   IPv4 (`192.168.1.1`), IPv6 (`2001:db8::1`), spaceless phone (`15551234567`,
   `+15551234567`) — each on at least one real key (e.g. `method`, `surface`, `reason`,
   `plan`) — assert the key is dropped from the sanitizer's output entirely, not just
   present-but-unmodified.
3. **`length_bucket` boundary:** all 4 real values pass; a 5th shape (`"34+"`,
   `"100-200"`, `"7"`) is rejected.
4. **Short numeric non-regression:** confirm a hypothetical short digit string under the
   7-char threshold is not swept up by the digit-run rule (documents the threshold choice
   so a future edit doesn't silently tighten it).

Also **required by this repo's CI-contract-hygiene convention**
(`docs/testing/ci-contract-hygiene.md`): check `src/test/funnel-event-schema.test.ts` and
`src/test/funnel-events-wiring.test.ts` for any static `readFileSync`/`indexOf` assertion
that pins the exact source text of `sanitizeFunnelParams` (several other tests in this
codebase pin exact SQL/source strings and break silently on unrelated edits — same risk
class applies here). Update any such pin in the same commit.

## 9. Validation commands and status

| Check | Status | Why |
|---|---|---|
| Regex verified against full real-value inventory | `PASS` | Manual verification, row by row, §5–§6 — enumerated from source at `origin/verdant-grow-diary`, not inferred |
| `bun run type-check` | `NOT_RUN` — `BLOCKED` | `funnelAnalytics.ts` does not exist in this worktree/branch; nothing to type-check |
| `bunx vitest run src/test/funnel-analytics.test.ts src/test/funnel-event-schema.test.ts src/test/funnel-events-wiring.test.ts` | `NOT_RUN` — `BLOCKED` | Same — no file, no test target, in this environment |
| Wide sweep of every file importing `funnelAnalytics.ts` | `NOT_RUN` — `BLOCKED` | Same |

Per `AGENTS.md` status vocabulary: this is `BLOCKED`, not `PASS` — the regex-acceptance
proof above is a manual verification against enumerated source, not an executed test
run. Whoever implements this must run the full command list before calling it done.

## 10. Handoff

```text
HANDOFF
from_agent: Claude
to_agent: Codex
sentinel_version: 2026-08-01.2
date: 2026-08-13

completed:
  - Verified the reported gap against source at origin/verdant-grow-diary (not main —
    the file does not exist on main or on this spec's branch)
  - Corrected the task's stated risk premise: `plan` never carries a raw Paddle price id;
    it carries the 7-value internal slug allowlist plus "unknown_plan"
  - Enumerated the full real-value inventory for every FUNNEL_PARAM_KEYS key across every
    real trackFunnelEvent call site in src/
  - Specified an exact fix (isEnumLikeParamValue) verified row-by-row against that
    inventory and against all 4 demonstrated attack shapes
  - Specified the exact test additions and the CI-contract-hygiene pinned-test risk to
    check before landing

verified_by:
  - git show/git grep against origin/verdant-grow-diary (fetched, not checked out)
  - Exact line-number match confirmed against the originating task's citations (17-22,
    100-106, 135-161)
  - Manual regex verification against every enumerated real value (§5-§6 tables)

not_done:
  - No code was written or changed. No test was run. This worktree cannot run either —
    the file is not on this branch.

unknowns:
  - Whether any pinned static-scan test in funnel-event-schema.test.ts or
    funnel-events-wiring.test.ts asserts sanitizeFunnelParams's exact source text —
    flagged as a required check, not verified either way

blocked:
  - Implementation requires a worktree based on origin/verdant-grow-diary, not main.
    Owner: Cheek (branch/worktree assignment). This blocks anyone, not just Codex.
  - All validation commands are BLOCKED in this environment for the same reason.

assumptions:
  - None beyond what's cited above — every real value in §5 was read from source, not
    inferred from the type signature alone (checked actual literal call sites)

next_slice:
  - Codex implements §7 against a verdant-grow-diary-based worktree, adds the tests in
    §8, runs the commands in §9, and reports exact pass/fail counts per the repo's
    Testing Standard

files_touched:
  - docs/funnel-analytics-sanitizer-enum-hardening-specification.md (this file, on the
    main-based worktree — documentation of a deploy-branch-only file is consistent with
    existing precedent, e.g. docs/agents/CURRENT_STATE.md)
```

If Cheek would rather I implement this directly, that is the explicit reassignment my
role file requires — I'd need a worktree checked out from `verdant-grow-diary` to do it.

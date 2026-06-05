# Verdant Codex Instructions

## Product Context

Verdant is a standalone Grow OS.

Verdant helps growers turn plant logs, photos, sensor readings, alerts, cautious AI, and grower-approved actions into safer decisions and better harvests.

Core product promise:

> Plant memory. Sensor truth. Better decisions.

Verdant is not tied to Next Door Cannabis unless explicitly requested.

Current product priority:

```text
Grow -> Tent -> Plant -> Quick Log -> Timeline -> Sensor Snapshot -> AI Doctor -> Alert -> Approval-Required Action Queue
```

Do not expand into community, competitions, public mode, broad enterprise features, heavy automation, or device control until the One-Tent Loop is clean, safe, and tested.

---

## Build Philosophy

Follow this order:

```text
Diary first.
Sensors second.
AI third.
Automation last.
```

Default workflow:

```text
Build -> Audit -> Fix -> Test -> Publish
```

Use small, scoped changes. Avoid broad rewrites.

Before changing code:

1. Inspect existing files and conventions.
2. Identify the smallest safe implementation path.
3. Preserve existing behavior unless explicitly told to change it.
4. Put business logic in pure modules, not JSX.
5. Add targeted tests.
6. Run validation when available.
7. Report exact pass/fail counts.

---

## Hard Safety Rules

Never violate these:

* No fake live data.
* No blind automation.
* No device control unless explicitly approved in a future phase.
* Action Queue must stay approval-required.
* Demo/manual/live/stale/invalid data must be clearly labeled.
* Bad or unknown telemetry must never be shown as healthy.
* AI Doctor must be cautious and must not pretend certainty from one photo or one reading.
* Verdant may suggest actions, but the grower decides.
* Do not recommend aggressive nutrient, irrigation, or equipment changes from weak evidence.
* Do not expose service role keys, bridge tokens, API keys, webhook secrets, private env values, or internal secrets.
* Treat user data, sensor data, CSVs, bridge payloads, and AI outputs as untrusted.

---

## Architecture Rules

Preferred layering:

| Layer              | Path                                      |
| ------------------ | ----------------------------------------- |
| Constants / config | `src/constants/*`                         |
| Pure logic / rules | `src/lib/*Rules.ts`                       |
| Advisors / engines | `src/lib/*Advisor.ts`                     |
| View models        | `src/lib/*ViewModel.ts`                   |
| React rendering    | `src/pages/*.tsx`, `src/components/*.tsx` |
| Hooks              | `src/hooks/*`                             |
| Supabase functions | `supabase/functions/*`                    |
| Migrations         | `supabase/migrations/*`                   |

Rules:

* UI components should stay presenter-focused.
* Do not duplicate rule tables inside JSX.
* New logic must be typed, deterministic, and null-safe.
* Keep transforms/selectors out of render bodies when possible.
* Use stable sorting with explicit tie-breakers.
* Avoid randomness.
* Time must be injectable for tests when relevant.
* Preserve old documents/rows with missing fields.
* Do not casually change schema, RLS, auth, or edge functions outside the requested scope.

---

## Supabase / Data Safety

For schema, RLS, and edge-function work:

* Audit first.
* Report existing conventions.
* Do not silently alter existing tables.
* No anon grants unless explicitly required and justified.
* Client users must not be able to self-grant access, billing status, roles, credits, device permissions, or admin privileges.
* Server-side enforcement must not trust client `user_id`.
* Use `auth.uid()` / verified JWT user server-side.
* Service role may be used only in server/admin/test setup contexts, never in client code.
* If a task is tests-only, do not "fix" schema or policies. Stop and report blockers.

RLS pattern to prefer:

```text
authenticated SELECT own rows only
no client INSERT/UPDATE/DELETE policies
service_role writes only
runtime harness for money/security paths
```

---

## Sensor Truth Rules

Every sensor reading should include:

* source
* captured_at / timestamp
* tent_id
* plant_id when relevant
* confidence
* raw_payload when available

Allowed source labels:

```text
live
manual
csv
demo
stale
invalid
```

Flag suspicious telemetry:

* Celsius shown as Fahrenheit
* uS/cm shown as mS/cm
* humidity stuck at 0 or 100
* soil moisture stuck at 0 or 100
* pH outside realistic range
* old readings shown as current
* default/demo values presented as live

Never classify invalid or unknown telemetry as healthy.

---

## AI Doctor Rules

AI Doctor should use as much context as available:

* plant stage
* strain
* medium
* pot size
* recent watering
* recent feeding
* sensor snapshots
* recent photos
* diary entries
* alerts
* grow targets
* plant history

AI Doctor output should include:

```text
Summary
Likely issue
Confidence
Evidence
Missing information
Possible causes
Immediate action
What not to do
24-hour follow-up
3-day recovery plan
Risk level
Action Queue suggestion, if appropriate
```

If context is missing, say what is missing. Do not guess.

Do not make one-photo diagnoses sound certain.

---

## Monetization / Entitlements Rules

Current billing foundation:

* `profiles.tier` is XP/gamification only. Never use it as billing.
* `public.billing_subscriptions` is the billing entitlement source of truth.
* Absence of a billing row resolves to Free.
* Client entitlement reads are presentation-only.
* Server-side checks are authoritative for paid/costly features.
* Founder Lifetime is Pro-like access with capped AI credits, never unlimited AI.
* Do not add checkout, webhook, provider SDKs, pricing copy, PaywallCta edits, or UI gating unless specifically requested.

Capability logic belongs in:

```text
src/lib/entitlements/*
```

Do not hardcode plan gates in JSX.

Avoid:

```ts
if (plan === "pro") ...
```

Prefer capability helpers:

```ts
canUseCapability(entitlement, "advancedExports")
```

---

## AI Credit Enforcement Rules

AI usage is a real cost surface.

Backend enforcement must happen server-side before model calls.

Rules:

* Meter `ai-doctor-review` and `ai-coach`.
* Free: 3 AI credits per grow.
* Pro monthly: 100 AI credits per UTC calendar month.
* Pro annual: 100 AI credits per UTC calendar month.
* Founder lifetime: 100 AI credits per UTC calendar month.
* Founder AI credits are capped, never unlimited.
* Client cannot set `user_id`, weight, model tier, or plan.
* Edge functions decide model tier/weight.
* Refund failed model calls with append-only reversal rows.
* Use runtime tests for RLS and spend/race behavior.
* Quota denials should be calm, expected responses, not crashes.

Do not add UI paywall behavior during backend enforcement slices unless requested.

---

## Action Queue Rules

Action Queue is approval-required.

AI or alerts may suggest actions, but Verdant must not execute device commands by default.

Action Queue items should include:

* reason
* risk level
* related grow/tent/plant/alert when available
* status
* audit trail

Do not auto-create action queue items unless the task explicitly asks for it.

Do not add device control.

---

## Cultivation Guidance Rules

Base cultivation guidance on proven horticultural best practices and practical grow-room experience.

Avoid:

* bro-science
* miracle fixes
* overconfident photo diagnosis
* aggressive autoflower recovery advice
* heavy-stress recommendations for weak plants
* nutrient/irrigation changes from weak evidence

Default priority:

```text
1. Environmental stability
2. Root-zone and watering correctness
3. Nutrient moderation
4. Low-stress canopy management
5. AI/action recommendations only after context is clear
```

Autoflowers:

* avoid unnecessary transplant shock
* avoid heavy defoliation
* avoid high-stress recovery tactics
* prioritize stable VPD, watering, root health, and gentle feeding

---

## Testing Standard

Every logic change should include targeted tests for:

1. Happy path
2. Edge boundaries
3. Null / invalid inputs
4. Deterministic repeatability
5. Regression for the specific bug or risk
6. Safety/fence assertions where relevant

For security/billing/RLS:

* static scan tests are useful but not enough
* add runtime harnesses when possible
* prove client roles cannot mutate protected tables

Report:

```text
Targeted tests:
Full suite:
Type-check:
Runtime harness:
Skipped:
Introduced failures:
Pre-existing failures:
```

Do not claim full validation if it was not run.

---

## Validation Commands

Use the repo's actual package manager and scripts.

Prefer existing conventions.

Common commands may include:

```bash
bun run type-check
bunx vitest run --reporter=dot
bun run scripts/run-billing-rls-harness.ts
bun run scripts/run-ai-credits-rls-harness.ts
```

If a command is unavailable, report that honestly and use the closest existing command.

---

## Required Response Format For Implementation Tasks

Use this structure:

```text
Summary
Requirements / assumptions
Audit findings
File-level plan
Implementation notes
Tests added
Validation commands
Validation results
Safety verdict
Deferred items
Risk / rollback notes
```

For audit-only tasks, do not write code unless the user explicitly asks.

For tests-only tasks, do not change app/schema/policy code unless the task explicitly permits it.

---

## Scope Discipline

When a task says "no schema changes," do not change schema.

When a task says "no UI changes," do not touch UI.

When a task says "audit first," report findings before building.

When a task says "server-side only," do not add UI gating.

When a task says "foundation only," do not claim the feature is complete.

Prefer partial, safe completion over broad risky completion.

---

## Forbidden Shortcuts

Do not:

* Reuse `profiles.tier` for billing.
* Add `requiredTier` routing unless explicitly requested.
* Add checkout/webhook/provider SDKs inside entitlement foundation work.
* Add service_role to client code.
* Treat demo data as live.
* Create hidden automation.
* Execute device commands.
* Auto-write action queue items from alerts unless requested.
* Change existing public copy during backend/security slices.
* Add broad rewrites to fix narrow bugs.
* Hide skipped validation.
* Report "all green" unless all relevant validation actually passed.

---

## Good Verdant Build Behavior

Prefer:

* Small PRs.
* Pure helpers first.
* Presenter-only UI.
* RLS-first data design.
* Runtime harnesses for sensitive permissions.
* Append-only ledgers for billing/credits/audit trails.
* Cautious AI.
* Source-labeled telemetry.
* Clear rollback notes.
* Exact pass/fail counts.

Every change should make Verdant more trustworthy.

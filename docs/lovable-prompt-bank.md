# Verdant Lovable Prompt Bank

Reusable prompt components for working in Lovable (https://lovable.dev) on the
Verdant Grow Diary codebase. Copy the blocks you need and compose them into a
single prompt. Never include credentials, personal data, or internal IDs.

No app code changes. Read-only reference.

---

## 1. PROJECT_CONTEXT Block

Include this at the top of every feature or bug prompt. Paste it verbatim.

```
PROJECT_CONTEXT:
- App: Verdant Grow Diary (https://verdantgrowdiary.com)
- Stack: React 18 + Vite + TypeScript + Tailwind + shadcn/ui + Recharts
- Backend: Supabase (Postgres, Auth, Edge Functions) via Lovable Cloud
- Auth: Supabase Auth; every user table gated by RLS on auth.uid()
- Test runner: Vitest (bunx vitest run). All ~650+ tests must stay green.
- Lint: ESLint (bun run lint). No new `@typescript-eslint/no-explicit-any`.
- Build: bun run build (Vite). Must succeed with zero errors.
- Existing docs: docs/architecture.md, docs/grow-os-architecture.md,
  docs/security-checklist.md, docs/v0-operating-loop-demo.md,
  docs/one-tent-loop.md

HARD CONSTRAINTS (never violate):
1. No service_role keys in src/, public/, or any bundled asset.
2. No device control: no MQTT, actuator, relay, webhook to hardware.
3. No blind automation: nothing runs without an explicit grower click.
4. No fake live data: demo/mock data must be labeled; never presented as live.
5. No auto-approve / auto-complete / auto-cancel of Action Queue items.
6. action_queue_events is append-only — no UPDATE or DELETE.
7. user_id is never trusted from the client — RLS re-derives it via auth.uid().
8. No new surfaces invoke AI Coach without a safety review.
9. All new tables require RLS enabled with explicit SELECT/INSERT/UPDATE/DELETE
   policies anchored on auth.uid().
```

---

## 2. Scoped Task Template

Use when adding a new feature or component to a specific surface.

```
PROJECT_CONTEXT:
[paste §1 block here]

TASK:
[One sentence: what to build and where it lives.]

SCOPE:
- Files to touch: [list exact src/ paths]
- Files NOT to touch: [list any files that must remain unchanged]
- Do NOT add new npm dependencies unless explicitly requested.
- Do NOT change schema, migrations, or RLS policies unless explicitly requested.
- Do NOT modify the V0 contract test (src/test/v0-operating-loop-contract.test.ts).

ACCEPTANCE CRITERIA:
1. [Specific observable behavior 1]
2. [Specific observable behavior 2]
3. bunx vitest run — all tests pass (add new tests for new behavior).
4. bun run lint — zero errors.
5. bun run build — zero errors.

SAFETY CHECKLIST (confirm each before delivering):
[paste §6 block here]
```

---

## 3. Bug-Fix Prompt Template

Use when fixing a reproducible bug. Be as specific as possible about the
failing state.

```
PROJECT_CONTEXT:
[paste §1 block here]

BUG:
- Page / component: [e.g. src/pages/ActionQueue.tsx]
- Steps to reproduce:
  1. [Step 1]
  2. [Step 2]
- Expected: [What should happen]
- Actual: [What currently happens]
- Test that exposes it (if known): [src/test/... or "none yet"]

FIX REQUIREMENTS:
- Fix only the described behavior. Do not refactor surrounding code.
- If a test exists, make it pass. If none exists, add the smallest test
  that would have caught this bug.
- bunx vitest run — all tests must pass after the fix.
- bun run lint — zero errors.
- bun run build — zero errors.

SAFETY CHECKLIST (confirm each before delivering):
[paste §6 block here]
```

---

## 4. Test-Only Prompt Template

Use when adding or updating tests with no production code changes.

```
PROJECT_CONTEXT:
[paste §1 block here]

TEST TASK:
- File to create or modify: [src/test/... or src/hooks/...test.ts]
- Behavior under test: [description of the rule, helper, or component]
- Test framework: Vitest + @testing-library/react (no Supabase / network calls
  in unit tests — mock all I/O with vi.mock / vi.fn)

CONSTRAINTS:
- Do NOT modify any production source file (src/**/*.ts, src/**/*.tsx) unless
  you are only adding an export needed by the test.
- Do NOT use `as any` casts — use vi.mocked() for mock calls.
- All existing tests must still pass.

ACCEPTANCE CRITERIA:
1. bunx vitest run — all tests pass (including the new ones).
2. bun run lint — zero errors.
3. bun run typecheck — zero errors.
```

---

## 5. Docs-Only Prompt Template

Use when adding or updating documentation files in docs/.

```
PROJECT_CONTEXT:
[paste §1 block here]

DOCS TASK:
- File(s) to create or edit: [docs/...]
- Content goal: [brief description]

CONSTRAINTS:
- Do NOT modify any file outside of docs/.
- Do NOT modify README.md unless the doc change requires a README cross-link.
- No schema changes. No navigation changes. No UI changes. No new dependencies.

VALIDATION:
- bun run lint — must still pass (docs/.md files are not linted but surrounding
  ts/tsx changes must be zero-error).
- bunx vitest run — all existing tests must pass.
  Note: some tests assert on the content of docs files
  (e.g. src/test/architecture-docs.test.ts, src/test/readme-docs.test.ts,
  src/test/grow-os-architecture-doc.test.ts). Confirm these pass after edits.
- bun run build — must still succeed.
```

---

## 6. Safety Checklist Block

Include at the end of every feature prompt. Paste verbatim.

```
SAFETY CHECKLIST (Lovable must confirm each item before delivering the diff):

RLS / auth:
- [ ] No new table added without RLS enabled and explicit policies.
- [ ] No client-provided user_id trusted — ownership derived server-side.
- [ ] No service_role key added to src/, public/, or any env file.
- [ ] No SECURITY DEFINER function added without a security-exceptions entry.

Data truthfulness:
- [ ] No component fabricates or silently substitutes live sensor values.
- [ ] Demo / mock data, if rendered, is labeled with a "Demo" badge.
- [ ] Stale, missing, or suspicious data is surfaced as such, not hidden.

AI safety:
- [ ] AI Coach is not invoked from a new surface without review.
- [ ] AI output does not trigger unattended writes to user data, devices,
      or the Action Queue.
- [ ] Demo or Stale data does not increase AI confidence.

Action Queue:
- [ ] No Action Queue item auto-approves, auto-completes, or auto-cancels.
- [ ] action_queue_events receives no UPDATE or DELETE.
- [ ] Every state transition requires a dialog confirmation by the grower.

Device control:
- [ ] No MQTT, actuator, relay, webhook to hardware added.
- [ ] Integrations remain read-only adapters.

Tests / build:
- [ ] bunx vitest run — all ~650+ tests pass.
- [ ] bun run lint — zero errors (no new @typescript-eslint/no-explicit-any).
- [ ] bun run build — zero errors.
- [ ] New behavior ships with new tests.
- [ ] src/test/v0-operating-loop-contract.test.ts still passes unmodified.
```

---

## 7. Quick Reference: Route and Table Map

Use when telling Lovable which page or table to target.

### Key routes
| Route | Page file | Main data |
|---|---|---|
| `/grows` | `src/pages/Grows.tsx` | `public.grows` |
| `/grows/:growId` | `src/pages/GrowDetail.tsx` | `public.grows`, `public.plants`, `public.diary_entries` |
| `/dashboard?growId=` | `src/pages/Dashboard.tsx` | sensor snapshot + alerts + targets |
| `/logs?growId=` | (logs surface) | `public.diary_entries` |
| `/timeline?growId=` | `src/pages/Timeline.tsx` | diary + action events |
| `/plants?growId=` | `src/pages/Plants.tsx` | `public.plants` |
| `/tents?growId=` | `src/pages/Tents.tsx` | `public.tents` |
| `/sensors` | `src/pages/Sensors.tsx` | `public.sensor_readings` |
| `/alerts` | `src/pages/Alerts.tsx` | `public.alerts`, `public.alert_events` |
| `/alerts/:alertId` | `src/pages/AlertDetail.tsx` | single alert + events + related queue |
| `/actions?growId=` | `src/pages/ActionQueue.tsx` | `public.action_queue` |
| `/actions/:actionId` | `src/pages/ActionDetail.tsx` | single action + events + source alert |
| `/doctor` | `src/pages/Coach.tsx` | read-only AI diagnosis |
| `/auth` | `src/pages/Auth.tsx` | Supabase Auth |
| `/welcome` | `src/pages/Landing.tsx` | public, no user data |

### Key source files
| File | Purpose |
|---|---|
| `src/lib/sensorSnapshot.ts` | Pure snapshot helpers, `SnapshotSource` type |
| `src/lib/environmentAlerts.ts` | Derived alert rules |
| `src/lib/environmentAlertPersistence.ts` | Persistence eligibility rules |
| `src/lib/alertToActionQueueRules.ts` | Alert → Action Queue draft rules |
| `src/lib/actionQueueProvenanceRules.ts` | Provenance helpers, stale-warning rules |
| `src/lib/aiContextSufficiencyRules.ts` | AI confidence gating |
| `src/lib/growDataSourceLabelRules.ts` | Live / Manual / Demo / Stale / Unavailable labels |
| `src/lib/db.ts` | Typed Supabase CRUD helpers |
| `src/lib/permissions.ts` | Server-side permission guards (Caller pattern) |
| `src/hooks/useInsertSensorReading.ts` | Sensor reading mutation + validation |
| `src/hooks/useLatestSensorSnapshot.ts` | Dashboard latest snapshot |
| `src/hooks/useScopedGrow.ts` | Scoped grow navigation contract |
| `src/mock/index.ts` | Static demo data (never present as live) |

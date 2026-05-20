# Verdant Architecture

A concise map of how Verdant is structured today: product layers, routes,
data ownership, AI/Action Queue safety, and the dashboard intelligence stack.

For development standards and PR rules, see [`README.md`](../README.md),
[`docs/security-checklist.md`](./security-checklist.md),
[`docs/security-exceptions.md`](./security-exceptions.md), and
[`.github/pull_request_template.md`](../.github/pull_request_template.md).

---

## Product layers

Verdant is organized as four shipped layers plus one intentionally
out-of-scope layer:

1. **Grow management** — grows, plants, tents, and the diary/logs/timeline
   surfaces. CRUD on user-owned cultivation entities.
2. **Grow command center** — the scoped Dashboard, latest environment
   snapshot, environment trends, target comparison, and data-quality signals.
3. **AI support** — the AI Coach. Read-only diagnosis and recommendation
   surface. Never executes Action Queue items, never writes to devices.
4. **Action Queue** — user-approved suggestions with an append-only audit
   trail (`action_queue_events`). Every side effect requires an explicit
   user action.
5. **Future external-control layer** — device commands, actuator toggles,
   and automation are **explicitly out of scope** until a dedicated safety
   review is completed. No device-command surface ships by default.

---

## Frontend routes

The main grow-scoped surfaces follow a consistent pattern. The
grow-management routes use path params; the operational surfaces accept the
scoped grow via `?growId=` so the user can carry a selection across views.

- `/grows` — grow index
- `/grows/:growId` — grow detail
- `/dashboard?growId=` — scoped Dashboard (intelligence stack)
- `/logs?growId=` — scoped diary / logs
- `/timeline?growId=` — scoped timeline including action events
- `/plants?growId=` — plants filtered to the scoped grow
- `/tents?growId=` — tents filtered to the scoped grow
- `/actions?growId=` — Action Queue filtered to the scoped grow
- `/actions/:actionId` — Action Queue item detail

## Grow-scoped navigation

The scoped-grow contract is enforced by `src/hooks/useScopedGrow.ts` and the
tests under `src/test/scoped-grow-navigation-contract.test.tsx` and
`src/test/scoped-grow-banner.test.tsx`. Rules:

- When a grow is scoped, every grow-aware surface filters to it.
- Surfaces never silently broaden scope to "all grows".
- New surfaces that show grow-owned data must honor the scoped grow.

---

## Supabase / RLS ownership model

- Every user-owned table has Row Level Security enabled.
- Ownership is anchored on `auth.uid()` (server-evaluated).
- The client never sends `user_id` as a trusted field — RLS re-derives
  ownership on every write.
- Cross-resource ownership (for example `grow_targets.grow_id → grows.id`)
  joins back to a table whose ownership is anchored on `auth.uid()`.
- `service_role` is not used in the frontend or in Edge Functions. The single
  accepted `SECURITY DEFINER` helper (`public.has_role`) is documented in
  [`docs/security-exceptions.md`](./security-exceptions.md).

---

## AI Coach read-only model

- AI Coach is a read-only diagnosis and recommendation surface.
- It must not be invoked from new surfaces without a safety review.
- Its output never triggers writes to user data, devices, or the Action
  Queue without an explicit user action.
- Safety regressions are guarded by `src/test/ai-coach-security.test.ts` and
  `src/test/ai-coach-output-safety.test.ts`.

---

## Action Queue approval / audit model

- Queue items are **suggest-only**. Nothing runs until the user approves.
- No code path may auto-approve, auto-complete, or auto-cancel an item.
- `action_queue_events` is append-only — no `UPDATE` / `DELETE`.
- Safety and audit guarantees are guarded by
  `src/test/action-queue-safety.test.ts`,
  `src/test/action-queue-audit.test.ts`,
  `src/test/action-queue-transitions.test.ts`, and
  `src/test/action-queue-complete-cancel.test.ts`.

---

## Sensor data model

- Sensor readings come from authenticated sources (`sensor_readings`,
  diary-derived environment entries).
- The Dashboard's latest-snapshot, sensor-quality, environment-trends, and
  target-comparison cards all use real readings — never fabricated values.
- Stale, missing, or suspicious data is **surfaced as such**, never silently
  substituted with synthetic data.
- Demo/mock data, if used at all, is clearly labeled and gated.

---

## Dashboard intelligence stack

The scoped Dashboard composes a small, read-only intelligence stack:

1. **Latest environment snapshot** — `src/hooks/useLatestSensorSnapshot.ts`
   + `src/lib/sensorSnapshot.ts`. Renders the most recent reading with a
   source label and a stale badge when applicable.
2. **Sensor data quality** — `src/lib/sensorQuality.ts`. Classifies the
   snapshot as usable, stale, missing, or suspicious.
3. **Environment trends** — `src/hooks/useEnvironmentTrends.ts` +
   `src/lib/environmentTrends.ts`. Simple recent trends for temperature,
   humidity, and VPD.
4. **Target comparison** — `src/hooks/useGrowTargets.ts` +
   `src/lib/environmentTargetComparison.ts`. Compares the latest snapshot
   against per-grow targets configured through
   `src/components/GrowTargetsEditor.tsx`.

The Dashboard remains read-only. None of these cards introduce
device-command surfaces or auto-actions.

---

## Security / documentation references

- [`README.md`](../README.md) — project overview and development workflow.
- [`docs/security-checklist.md`](./security-checklist.md) — required PR
  checks for RLS, AI, Action Queue, sensors, and external control.
- [`docs/security-exceptions.md`](./security-exceptions.md) — registry of
  intentionally accepted security warnings.
- [`.github/pull_request_template.md`](../.github/pull_request_template.md)
  — required PR checklist enforcing the above.

# Verdant Grow OS — Architecture

Read-only reference for the grower-facing Grow OS product. This document
does **not** change runtime behavior. It captures the current state, the
known risks, and the safe path forward.

## 1. Grow OS Scope

**Verdant Grow OS** is the core grower-facing product: real plants, real
tents, real sensors, real diary entries, real photos, real environmental
intelligence and AI-assisted guidance for cultivators.

**Leads is *not* part of Grow OS.** Leads is an internal **admin / operator
only** module for business development, partner tracking, and outreach
pipeline visibility. It lives at `/admin/leads` (with `/leads` as a
back-compat alias) and is intentionally **separate from Grow OS**. Leads
must never be mixed with grower plant, tent, sensor, diary, customer-mode,
or public-companion data. See `docs/leads-command-center.md`.

## 2. Current Data Source Map

### Real Supabase-backed (live data)

| Area / Hook                                  | Backing table / bucket                                     |
| -------------------------------------------- | ---------------------------------------------------------- |
| `src/components/QuickLog.tsx`                | `public.diary_entries` (insert) + `grows` (stage update)   |
| Diary photo uploads (`QuickLog`)             | Storage bucket **`diary-photos`** (real upload)            |
| `src/hooks/use-diary-entries.ts`             | `public.diary_entries` (select)                            |
| `src/hooks/use-plants.ts`                    | `public.plants` (select, non-archived)                     |
| `src/hooks/use-tents.ts`                     | `public.tents` (select, non-archived)                      |
| `src/hooks/use-sensor-readings.ts`           | `public.sensor_readings`                                   |
| `src/hooks/useInsertSensorReading.ts`        | `public.sensor_readings` (insert)                          |
| `src/hooks/useLatestSensorSnapshot.ts`       | `public.sensor_readings`                                   |
| `src/hooks/useEnvironmentTrends.ts`          | `public.sensor_readings` / environment data                |
| `src/hooks/useGrowTargets.ts`                | `public.grow_targets`                                      |
| `src/hooks/useDashboardScopedData.ts`        | real grow-scoped queries                                   |
| `src/hooks/useGrowDetailData.ts`             | real grow detail queries                                   |
| `src/hooks/useAlertsList.ts` / `useAlertEvents.ts` | `public.alerts` / `public.alert_events`              |
| `src/hooks/useScopedGrow.ts`                 | `public.grows` (via store)                                 |
| `src/store/grows.tsx`                        | `public.grows`                                             |
| `src/store/auth.tsx`                         | Supabase Auth                                              |

### Typed event schema present in Supabase (not yet wired to grower UI)

The following typed event tables exist in `public.*` with RLS, validation
triggers, and (for watering) an RPC, but the grower UI does **not**
currently write to them — `QuickLog` stores pH/EC/runoff/nutrients/training
inside `diary_entries.details` jsonb instead:

- `public.grow_events` (parent envelope)
- `public.watering_events` (+ RPC `create_watering_event`)
- `public.feeding_events`
- `public.photo_events`
- `public.observation_events`
- `public.training_events`
- `public.environment_events`

### Mock / demo surfaces (NOT live)

| File / Surface                                | Source                                                     |
| --------------------------------------------- | ---------------------------------------------------------- |
| `src/mock/index.ts`                           | Static fake tents, plants, sensors, cameras, tasks, alerts |
| `src/hooks/useMockData.ts`                    | React Query wrappers over `src/mock`                       |
| `src/hooks/useGrowData.ts`                    | Supabase-first but **silently falls back to mock** on empty/error (see §4) |
| `src/pages/Dashboard.tsx`                     | Uses `useGrowData` (mock-fallback) + `useAlerts/useTasks/useAIInsights` from `useMockData` |
| `src/pages/Sensors.tsx`                       | `useGrowTents` + `useGrowSensorReadings` (mock-fallback); default tent id `"t1"` is a mock id |
| `src/pages/Plants.tsx`                        | Real plants via `useGrowPlants` but **tent filter chips read mock tents** from `useMockData` |
| `src/pages/Tents.tsx`                         | `useGrowTents` (mock-fallback) + mock `useSensorReadings`/`usePlants` |
| `src/pages/TentDetail.tsx`                    | Mock `usePlants` / `useSensorReadings` / `useCameras`      |
| `src/pages/PlantDetail.tsx`                   | Mock `useTent`                                             |
| `src/pages/Cameras.tsx`                       | Mock `useCameras` / `useTents`                             |
| `src/pages/Tasks.tsx`                         | Mock `useTasks` / `useTents`                               |
| `src/components/AppShell.tsx` (alerts badge)  | Mock `useAlerts` from `useMockData`                        |
| `src/components/SensorChart.tsx`              | Renders whatever it is given — has no demo/live awareness  |
| `src/lib/growRepo.ts` / `src/lib/growAdapters.ts` | Adapt between Supabase rows and mock shape (used by `useGrowData`) |

## 3. Live vs Demo Contract

The following rules apply to every grower-facing surface:

1. **Mock / demo values must never be presented as live.** No exceptions.
2. **Any mock / demo plant, tent, alert, task, sensor, camera, or chart
   data must be visually labeled as `Demo Data`** (badge, pill, watermark,
   or explicit caption). If we cannot label it, we must not render it.
3. **Empty real Supabase results must produce empty states**, not fake
   live data. A new user with zero grows must see a "create your first
   grow" path — never mock tents or mock plants.
4. **Sensor values must be labeled with exactly one of the following
   states:**
   - **`Live`** — recent real reading from `public.sensor_readings`
     (source `pi_bridge` or `manual` within freshness window).
   - **`Manual`** — operator-entered real reading.
   - **`Demo`** — value originated from `src/mock` or a `useGrowData`
     fallback. Must never be shown without the `Demo` label.
   - **`Stale`** — real reading older than the freshness window for that
     metric.
   - **`Unavailable`** — no reading exists, or the source is offline.
5. AI Coach, AI Doctor, alerts, and recommendations must read the label
   and must **not** treat `Demo` or `Stale` as `Live`.

## 4. Current Known Risk

**`src/hooks/useGrowData.ts` performs a silent mock fallback.** The helper
`withFallback(...)` returns `tents`, `plants`, and `sensorReadings` from
`src/mock/index.ts` whenever the Supabase query errors or returns an empty
array. Consumers (`Dashboard`, `Plants`, `Tents`, `Sensors`) then render
the mock rows with no `Demo` label, which means **a new account with no
data sees fake tents, fake plants, and fake sensor charts that look fully
live**.

This violates the Live vs Demo contract in §3 and is the **single highest
risk in the Grow OS surface area today**. It is a known, temporary risk to
be fixed in the next implementation pass — either by removing the fallback
entirely or by wrapping results with an `isDemo` flag that every consumer
must render as a `Demo Data` badge.

Until that pass lands, no new feature should depend on `useGrowData`
returning live data.

## 5. Preferred Next Implementation Path

Each step is independently shippable, testable, and reversible. Do them
in order:

1. **Add a shared sensor live/demo label helper** (`src/lib/sensorLiveLabel.ts`)
   that returns one of `Live | Manual | Demo | Stale | Unavailable` from a
   reading + source + age, and unit-test all branches.
2. **Remove or flag the silent mock fallback in `useGrowData`** —
   either drop the fallback or wrap results with `{ data, isDemo }` and
   force every consumer to render a `Demo Data` badge when `isDemo` is
   true.
3. **Add real empty states** for: no grows, no tents, no plants, no diary
   entries, no sensor readings, no photos. Drive them from real Supabase
   results only.
4. **Prevent AI Coach / AI Doctor from relying on fake or demo context.**
   Add a pure `aiContextSufficiencyRules` helper that inspects the active
   grow's real data and caps AI confidence when context is missing or any
   input is `Demo` / `Stale`.
5. **Connect the typed watering / feeding / photo / observation /
   training / environment event tables to the grower UI.** Migrate
   `QuickLog` from `diary_entries.details` jsonb to typed event inserts
   (e.g. RPC `create_watering_event` for waterings) while keeping
   `diary_entries` as the human-readable timeline.

Out of scope for this path: schema changes, new tables, migrations,
service_role usage, outbound messaging, exports, scheduled jobs, Leads
work.

## 6. AI Safety Contract

AI Doctor / AI Coach output is grower-facing advice and must be safe by
default:

- **AI must not give high-confidence recommendations without sufficient
  context.** Sparse-context responses must surface as `low` confidence
  with a visible "needs more info" warning.
- **Missing inputs lower confidence.** If any of the following are
  missing for the active grow, confidence must be capped and the missing
  inputs must be listed to the user:
  - plant **stage**
  - plant **strain**
  - growing **medium**
  - **recent watering** or **feeding** entry
  - recent **pH / EC** reading
  - recent **temperature / RH / VPD** sensor reading
  - a recent **photo** or observation
- **Demo data must not raise AI confidence.** Any input labeled `Demo`
  or `Stale` (per §3) must be treated as missing for the purpose of the
  confidence ceiling, and the UI must say so. AI output that was derived
  from `Demo` context must itself be labeled `Demo`.
- AI must never invent sensor values, never fabricate device state, and
  never recommend automated device control from the grower-facing
  surface.

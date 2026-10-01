# Verdant Grow OS — Architecture

Read-only reference for the grower-facing Grow OS product. This document
does **not** change runtime behavior. It captures the current state, the
known risks, and the safe path forward.

## 1. Grow OS Scope

**Verdant Grow OS** is the core grower-facing product: real plants, real
tents, real sensors, real diary entries, real photos, real environmental
intelligence and AI-assisted guidance for cultivators.

**Leads is _not_ part of Grow OS.** Leads is an internal **admin / operator
only** module for business development, partner tracking, and outreach
pipeline visibility. It lives at `/admin/leads` (with `/leads` as a
back-compat alias) and is intentionally **separate from Grow OS**. Leads
must never be mixed with grower plant, tent, sensor, diary, customer-mode,
or public-companion data. See `docs/leads-command-center.md`.

## 2. Current Data Source Map

### Real Supabase-backed (live data)

| Area / Hook                                        | Backing table / bucket                                   |
| -------------------------------------------------- | -------------------------------------------------------- |
| `src/components/QuickLog.tsx`                      | `public.diary_entries` (insert) + `grows` (stage update) |
| Diary photo uploads (`QuickLog`)                   | Storage bucket **`diary-photos`** (real upload)          |
| `src/hooks/use-diary-entries.ts`                   | `public.diary_entries` (select)                          |
| `src/hooks/use-plants.ts`                          | `public.plants` (select, non-archived)                   |
| `src/hooks/use-tents.ts`                           | `public.tents` (select, non-archived)                    |
| `src/hooks/use-sensor-readings.ts`                 | `public.sensor_readings`                                 |
| `src/hooks/useInsertSensorReading.ts`              | `public.sensor_readings` (insert)                        |
| `src/hooks/useLatestSensorSnapshot.ts`             | `public.sensor_readings`                                 |
| `src/hooks/useEnvironmentTrends.ts`                | `public.sensor_readings` / environment data              |
| `src/hooks/useGrowTargets.ts`                      | `public.grow_targets`                                    |
| `src/hooks/useDashboardScopedData.ts`              | real grow-scoped queries                                 |
| `src/hooks/useGrowDetailData.ts`                   | real grow detail queries                                 |
| `src/hooks/useAlertsList.ts` / `useAlertEvents.ts` | `public.alerts` / `public.alert_events`                  |
| `src/hooks/useScopedGrow.ts`                       | `public.grows` (via store)                               |
| `src/store/grows.tsx`                              | `public.grows`                                           |
| `src/store/auth.tsx`                               | Supabase Auth                                            |

### Typed event schema present in Supabase

The following typed event tables exist in `public.*` with RLS, validation
triggers, and (for watering) an RPC. _Corrected 2026-10-01 at `ccb38214`:_
the earlier claim that the grower UI writes none of them is stale. The
committed `quicklog_save_manual` RPC
(`supabase/migrations/20260723000000_quicklog_manual_always_mirror_diary.sql`)
inserts into `grow_events`, `watering_events` and `environment_events` and
mirrors a `diary_entries` row. Whether the other typed tables are written,
and which migrations production has applied, was not measured here:

- `public.grow_events` (parent envelope)
- `public.watering_events` (+ RPC `create_watering_event`)
- `public.feeding_events`
- `public.photo_events`
- `public.observation_events`
- `public.training_events`
- `public.environment_events`

### Mock / demo surfaces (NOT live)

Re-measured 2026-10-01 at deploy tip `ccb38214` from source. Earlier rows in
this table described a silent mock fallback and mock-backed pages that no
longer exist; see §4 for the history.

| File / Surface                                     | Current state                                                                                                                                  |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/mock/index.ts`                                | Static fake tents, plants, sensors, cameras, alerts. Many modules import its **types** (`SensorReading`, `Stage`); those carry no fixture data |
| `src/hooks/useMockData.ts`                         | React Query wrappers over `src/mock`. No production module imports it                                                                          |
| `src/lib/diary.ts` `snapshotForTent`               | Reads the `src/mock` sensor fixture. No caller in `src/`; it must not gain one                                                                 |
| `src/hooks/useGrowData.ts`                         | Supabase only, **no mock fallback**: empty reads stay empty, failed tent/plant reads stay React Query errors                                   |
| `src/lib/growSensorEvidenceRules.ts`               | Labels rows whose source is `demo` as `isDemoData: true` (disclosure, not substitution)                                                        |
| `src/pages/Dashboard.tsx`                          | Grow-, alert-, action- and sensor-backed hooks; AI Insights remains an honest empty state                                                      |
| `src/pages/Sensors.tsx`, `Plants.tsx`, `Tents.tsx` | `useGrowTents` / `useGrowPlants` / `useGrowSensorReadings` from `useGrowData`; no mock reads                                                   |
| `src/pages/TentDetail.tsx`, `PlantDetail.tsx`      | `useGrowTent` / `useGrowPlant(s)` from `useGrowData`; no mock reads                                                                            |
| `src/components/AppShell.tsx` (alerts badge)       | `useAlertsList({ status: "open" })`, Supabase-backed                                                                                           |
| `src/components/SensorChart.tsx`                   | Renders whatever it is given; imports only the `SensorReading` type from `src/mock`                                                            |
| `src/lib/growRepo.ts` / `src/lib/growAdapters.ts`  | Adapt Supabase rows into the shared `src/mock` **types** used by `useGrowData`                                                                 |

There is no `src/pages/Cameras.tsx` and no Cameras route.

The retired `/tasks` URL is a context-preserving redirect to the
approval-required `/actions` surface. There is no standalone Tasks page,
`useTasks` hook, or mock Task dataset.

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
   - **`Demo`** — value originated from `src/mock` or a `demo` source row.
     Must never be shown without the `Demo` label.
   - **`Stale`** — real reading older than the freshness window for that
     metric.
   - **`Unavailable`** — no reading exists, or the source is offline.
5. AI Coach, AI Doctor, alerts, and recommendations must read the label
   and must **not** treat `Demo` or `Stale` as `Live`.

The canonical stored source vocabulary is the six values in
`src/lib/sensor/sensorSourceRules.ts` (`live`, `manual`, `csv`, `demo`,
`stale`, `invalid`); a blank or unknown source normalizes to `invalid`, never
`live`. The five states above are a display grouping, not a second source
vocabulary.

## 4. Resolved Risk — the `useGrowData` mock fallback

_Corrected 2026-10-01 at deploy tip `ccb38214`._ This section used to say
that `useGrowData` silently fell back to mock rows on an empty or failed
read, so a new account would see fake tents, plants and sensor charts with
no `Demo` label. **That is no longer true.** `src/hooks/useGrowData.ts` now
states and implements the opposite: empty reads return an empty or null
value, failed tent and plant reads remain React Query errors, and mock
fixtures live only behind the separate `useMockData` surface, which no
production module imports. There is no `withFallback` helper in `src/`.

The rule the fallback broke still stands and is still fenced:
`src/test/grower-sensor-ui-no-mock-data.test.ts` and
`src/test/dashboard-no-mock-side-panels.test.ts` guard the grower surfaces.

Residual items, measured from source, not from production:

- `snapshotForTent` in `src/lib/diary.ts` still reads the sensor fixture.
  It has no caller; giving it one would reintroduce fake sensor data.
- Plant and alert counts are not telemetry. `deriveTentHealthChip`
  (`src/lib/tentHealthChip.ts`) therefore never returns a healthy chip:
  zero open alerts reads as a neutral "No open alerts", and an unknown
  alert count reads as unknown.

## 5. Preferred Next Implementation Path

Each step is independently shippable, testable, and reversible. Status
notes were added 2026-10-01 at `ccb38214` from source only; none is a
production measurement.

1. **Add a shared sensor live/demo label helper** (`src/lib/sensorLiveLabel.ts`)
   that returns one of `Live | Manual | Demo | Stale | Unavailable` from a
   reading + source + age, and unit-test all branches.
   _Status:_ `sensorLiveLabel.ts` was never created. The canonical helpers
   are in `src/lib/sensor/sensorSourceRules.ts` (see §3).
2. **Remove or flag the silent mock fallback in `useGrowData`** —
   either drop the fallback or wrap results with `{ data, isDemo }` and
   force every consumer to render a `Demo Data` badge when `isDemo` is
   true.
   _Status:_ done; the fallback was dropped (§4).
3. **Add real empty states** for: no grows, no tents, no plants, no diary
   entries, no sensor readings, no photos. Drive them from real Supabase
   results only.
   _Status:_ not re-verified surface by surface here.
4. **Prevent AI Coach / AI Doctor from relying on fake or demo context.**
   Add a pure `aiContextSufficiencyRules` helper that inspects the active
   grow's real data and caps AI confidence when context is missing or any
   input is `Demo` / `Stale`.
   _Status:_ `src/lib/aiContextSufficiencyRules.ts` exists; its coverage
   was not audited here.
5. **Connect the typed watering / feeding / photo / observation /
   training / environment event tables to the grower UI.** Migrate
   `QuickLog` from `diary_entries.details` jsonb to typed event inserts
   (e.g. RPC `create_watering_event` for waterings) while keeping
   `diary_entries` as the human-readable timeline.
   _Status:_ partly done; see §2, "Typed event schema present in Supabase".

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

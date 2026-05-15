## Verdant Command Center — Build Plan

A modern, dark, AI-powered grow command center. Existing Supabase pages stay live; new pages use mock data behind a clean abstraction so they can swap to real data later.

### Navigation & shell

Single shell with two nav surfaces:
- **Desktop (≥md):** collapsible left sidebar (icon rail when collapsed), grouped sections.
- **Mobile (<md):** bottom tab bar with the 5 most-used items (Dashboard, Tents, Logs, Tasks, Alerts) + "More" sheet for the rest.
- Top header: workspace switcher placeholder, global search, alerts bell with unread dot, user menu.

Sidebar groups:
```text
OVERVIEW       Dashboard
GROW           Tents · Plants · Cameras
DATA           Sensor Data · Grow Logs
OPERATIONS     Tasks · Alerts
INTELLIGENCE   AI Grow Doctor · Rewards
ACCOUNT        Settings
```

### Pages

1. **Dashboard** — KPI cards (active tents, plants, open alerts, tasks due today), environment summary strip (avg temp/RH/VPD across tents), 24 h sensor sparklines, "Needs attention" list (alerts + overdue tasks), recent log feed, quick-actions.
2. **Tents** — Grid of tent cards (name, stage, plant count, live temp/RH/VPD chip, light status, alert badge). Click → tent detail drawer with sensors, plants in tent, camera, lighting schedule.
3. **Plants** — Filterable table/grid (by tent, strain, stage, age). Plant card shows photo, strain, stage, age, last log, health flag. Detail page with timeline, measurements, photos.
4. **Sensor Data** — Multi-series chart (temp, RH, VPD, CO₂, soil moisture) with tent + range filters (24 h / 7 d / 30 d), threshold bands, downloadable CSV (mock).
5. **Grow Logs** — Reuses existing Timeline UX (stage progression, filters, edit dialog) — kept on Supabase. New "Log entry" CTA reuses QuickLog.
6. **Tasks** — Kanban (Today / Upcoming / Done) + list view toggle; recurring task templates (water, feed, defoliate, flush); per-task tent/plant link.
7. **Cameras** — Grid of live tiles (mock stills), per-camera detail with timelapse strip and snapshot history. Placeholder for Pi bridge.
8. **Alerts** — Severity-grouped list (critical/warning/info), source (sensor/task/AI), acknowledge & snooze, rule editor (threshold + duration).
9. **AI Grow Doctor** — Reuses existing Coach (Lovable AI) chat, plus structured "Diagnose photo" flow with mock symptom checklist and recommendation cards.
10. **Settings** — Profile, units (°C/°F, EC/PPM), notification prefs, integrations stub (Spider Farmer / AC Infinity / Vivosun / Pi 5 — display-only badges), danger zone.

Existing Supabase pages folded in:
- **Timeline → Grow Logs** route `/logs` (re-export of current page).
- **Coach → AI Grow Doctor** route `/doctor`.
- **Grows** stays as a sub-section under Tents (a tent can have an active grow).
- **Rewards** stays accessible under Intelligence.

### Mock data layer

- `src/mock/` exports typed fixtures: `tents`, `plants`, `sensorReadings`, `cameras`, `tasks`, `alerts`, `aiInsights`.
- `src/hooks/useMockData.ts` returns React-Query-style results so swapping to Supabase later is a one-file change.
- Sensor readings generated as 7-day sine-wave + jitter for realistic charts.

### Reusable components

- `KpiCard`, `MetricChip` (temp/RH/VPD pill with status color), `SensorSparkline`, `EnvironmentChart` (Recharts), `StatusDot`, `SeverityBadge`, `EmptyState`, `PageHeader`, `SectionCard`, `DataTable` wrapper around shadcn Table.
- `TentCard`, `PlantCard`, `CameraTile`, `TaskCard`, `AlertRow`, `AIInsightCard`.

### Design system

Dark premium aesthetic, cannabis-tech accent. All colors via HSL tokens in `index.css` and `tailwind.config.ts`:
- Background: deep charcoal-green (`hsl(150 12% 6%)`).
- Surface/glass: layered translucency over background.
- Primary: vivid leaf green (`hsl(142 70% 48%)`) with glow variant.
- Accents: amber for warnings, rose for critical, cyan for info.
- Display font: existing `font-display`; body Inter.
- Existing `glass`, `gradient-leaf` utilities reused.

### Routing (new)

```text
/              Dashboard
/tents         /tents/:id
/plants        /plants/:id
/sensors
/logs          (existing Timeline)
/tasks
/cameras       /cameras/:id
/alerts
/doctor        (existing Coach + diagnose tab)
/grows         (existing)
/rewards       (existing)
/settings
```

### Build order

1. Shell: sidebar + mobile bottom nav + header, route scaffolding, design tokens refresh.
2. Mock data layer + shared components (KpiCard, charts, badges).
3. Dashboard.
4. Tents (list + detail) → Plants (list + detail) — share TentContext.
5. Sensor Data charts.
6. Tasks (kanban + list).
7. Alerts (list + rule editor stub).
8. Cameras (grid + detail).
9. Settings.
10. AI Grow Doctor: add diagnose tab next to existing chat.
11. Polish pass: empty states, loading skeletons, mobile spacing, keyboard nav.

### Out of scope (per your earlier note)

- Raspberry Pi 5 bridge, real sensor ingestion, real camera streams — all mocked behind the data layer for a clean swap later.

### Technical notes

- Charts: Recharts (already in deps).
- State: React Query for mock async; existing Zustand-style stores for auth/grows/nugs untouched.
- Mobile nav: shadcn `Sheet` for "More"; bottom bar is a fixed `nav` with safe-area padding.
- Sidebar: shadcn `Sidebar` with `collapsible="icon"`; active route via `NavLink`.
- No business-logic changes to existing Supabase tables.

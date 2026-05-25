# Verdant V0 One-Tent Loop

Reference document for the V0 product spine, build philosophy, safety rules,
data truth contract, and explicit out-of-scope boundaries.

No app code changes. No schema changes. No UI changes. Read-only reference.

---

## 1. V0 Spine

The complete flow a grower can walk today, from a single reading to an
approval-required suggested action:

```
Grow
  └─ Tent
       └─ Plant
            └─ Quick Log (diary_entries — watering, feeding, training, observation, photo)
                 └─ Timeline (grow diary / action events)
                      └─ Sensor Snapshot (Dashboard latest environment)
                           └─ AI Doctor / AI Coach (read-only sufficiency-gated advice)
                                └─ Environment Alert (derived, rules-only, no auto-write)
                                     └─ Alert Detail (persisted alert + alert_events "created")
                                          └─ Recommendation / Action Queue (user-initiated handoff)
                                               └─ Approval-Required Action Queue
                                                    └─ Action Detail (provenance backlink → source alert)
```

### Stage-by-stage notes

| Stage | Key files | Backed by |
|---|---|---|
| Grow | `src/pages/Grows.tsx`, `src/pages/GrowDetail.tsx` | `public.grows` |
| Tent | `src/pages/Tents.tsx`, `src/pages/TentDetail.tsx` | `public.tents` |
| Plant | `src/pages/Plants.tsx`, `src/pages/PlantDetail.tsx` | `public.plants` |
| Quick Log | `src/components/QuickLog.tsx` | `public.diary_entries` + `diary-photos` storage |
| Timeline | `src/pages/Timeline.tsx` | `public.diary_entries` + `public.action_queue` events |
| Sensor Snapshot | `src/hooks/useLatestSensorSnapshot.ts`, `src/lib/sensorSnapshot.ts` | `public.sensor_readings` |
| AI Doctor / Coach | `src/pages/Coach.tsx`, `src/lib/aiContextSufficiencyRules.ts` | read-only; no writes |
| Environment Alert | `src/lib/environmentAlerts.ts`, `src/lib/environmentAlertPersistence.ts` | `public.alerts`, `public.alert_events` |
| Alert Detail | `src/pages/AlertDetail.tsx` | `public.alerts` + `public.alert_events` |
| Action Queue | `src/pages/ActionQueue.tsx`, `src/lib/alertToActionQueueRules.ts` | `public.action_queue`, `public.action_queue_events` |
| Action Detail | `src/pages/ActionDetail.tsx`, `src/lib/actionQueueProvenanceRules.ts` | `public.action_queue` |

The V0 contract test (`src/test/v0-operating-loop-contract.test.ts`) is a
**stop-ship test** that locks this entire spine. A failure there blocks merge.

---

## 2. Build Philosophy

> Diary first. Sensors second. AI third. Automation last.

### Phase order

1. **Diary first** — The grower must be able to capture observations before
   anything else can be built on top of them. QuickLog writes to
   `diary_entries`; the normalized timeline reads from it.

2. **Sensors second** — Real sensor readings (`public.sensor_readings`,
   `source = "manual"` or `source = "live"`) feed the Dashboard snapshot and
   the environment trend / target comparison cards. No fabricated values.

3. **AI third** — AI Doctor / AI Coach is read-only, sufficiency-gated advice.
   It reads diary entries, sensor snapshots, and grow targets. It never writes
   to the Action Queue without an explicit grower action. Missing or demo
   context caps confidence, it does not inflate it.

4. **Automation last** — Device control, actuator toggles, and automatic
   actions are explicitly deferred. Every queue item is `pending_approval` only.

### Sequencing rule

Do not skip phases. Do not introduce an automation surface before AI advice is
proven safe. Do not invoke AI from a new surface before a safety review.

---

## 3. Safety Rule

```
observe-only → approval-required → simulation → guardrailed automation (later)
```

| Stage | What ships | What does NOT ship |
|---|---|---|
| **observe-only** (V0 now) | Read-only dashboard, sensor labeling, AI Coach suggestions displayed on-screen | Any write triggered by AI output |
| **approval-required** (V0 now) | Action Queue — user clicks "Add to Action Queue", every state transition requires dialog confirmation | Auto-approve, auto-complete, auto-cancel |
| **simulation** (future) | A sandboxed "simulate this action" view with no real effect | Any simulation output that becomes a live command |
| **guardrailed automation** (future) | Scheduled or event-triggered actions with explicit guardrails, rollback, and audit trail | Unreviewed automation, device commands without safety review |

### Specific rules enforced in production today

- No code path auto-approves, auto-completes, or auto-cancels Action Queue items.
- `action_queue_events` is append-only — no `UPDATE` or `DELETE`.
- AI Coach output never triggers a write unless the grower explicitly clicks.
- No MQTT, Home Assistant, webhook, relay, or actuator path exists in the codebase.
- `service_role` keys are never used in the frontend or Edge Functions.
- All writes flow through the user's session and are scoped by RLS to `auth.uid()`.

---

## 4. Data Truth Rule

Every sensor value or data surface must carry exactly one of the following
labels, with no exceptions:

| Label | Meaning | Source rule |
|---|---|---|
| **Live** | Recent real reading from `public.sensor_readings`, `source` = `live` / `pi_bridge` within the freshness window | Never shown without a timestamp; stale = downgrade to `Stale` |
| **Manual** | Grower-entered reading via the Manual Sensor Reading card, `source = "manual"`, fresh | Treated as real in the alert persistence pipeline |
| **Demo** | Fallback / mock data from `src/mock/index.ts` or a `useGrowData` mock fallback | Must be visually labeled; must not enter the alert persistence pipeline |
| **Stale** | Real reading older than the freshness window for that metric | Surfaced as stale; does not enter the alert persistence pipeline |
| **Unavailable** | No reading exists, source is offline, or quality is `unavailable` | Shown as empty state; AI confidence must be capped |

### Enforcement rules

- Mock / demo values must **never** be presented as live.
- Empty real Supabase results produce empty states — not fake live data.
- AI Coach, AI Doctor, alerts, and recommendations must check the label:
  `Demo` and `Stale` are treated as missing context, not as real readings.
- A grow with no real sensor data must show an empty state + onboarding prompt,
  never mock tent cards.

### Known open risk (as of V0)

`src/hooks/useGrowData.ts` performs a silent mock fallback via `withFallback()`.
A new account with no data currently sees mock tents and plants with no `Demo`
label. This violates the contract above and is the highest-priority surface debt
to resolve in the next pass. See `docs/grow-os-architecture.md §4`.

---

## 5. Out of Scope

The following items are explicitly **not** in V0 scope and must not be
introduced without a product decision, a safety review, and a contract test:

### Community and social features
- Public grows, public profiles, social follows, grower community, comments,
  reactions, sharing links, compare-to-community stats.

### Competitions and leaderboards
- Any competitive surface: rankings, badges awarded by comparison to other
  users, strain-leaderboards, yield competitions.

### Public mode
- Any surface that shows a grower's private grow data to unauthenticated users.
  The only public route is `/welcome`.

### Blind automation
- Any code path that reads a sensor value and issues a device command, changes
  a setting, or adds an Action Queue item without explicit grower initiation.
- Automatic alert resolution.
- Auto-approve / auto-cancel / auto-complete of Action Queue items.
- Scheduled grow actions not triggered by an explicit user gesture.

### Broad refactors
- Migrating all pages away from `useGrowData` mock fallback in a single PR.
- Rewriting the QuickLog → typed event tables migration without a staged plan.
- Any change to `auth.uid()` ownership anchor or global RLS model.

### Device control
- MQTT, Home Assistant API, relay toggles, actuator commands, webhook triggers
  to hardware. Integrations remain read-only adapters in V0.

### External notifications
- Email, SMS, push notifications, webhooks, Slack / Discord integrations.

---

## 6. References

- `docs/v0-operating-loop-demo.md` — canonical demo script and V0 contract
  reference (step-by-step walkthrough of the full spine).
- `src/test/v0-operating-loop-contract.test.ts` — stop-ship contract test.
- `docs/grow-os-architecture.md` — full architecture, live vs demo contract,
  AI safety rules.
- `docs/architecture.md` — product layers, routes, ownership model, dashboard
  intelligence stack.
- `docs/grow-diary-architecture.md` — diary write/read path, AI context path,
  future migration to typed event tables.
- `docs/security-checklist.md` — required per-PR safety checks.
- `.github/pull_request_template.md` — PR checklist enforcing the above.

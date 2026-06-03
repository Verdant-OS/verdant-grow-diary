# V0 Loop Event Map

This is the **contract** for the first PostHog events Verdant will emit
to measure the One-Tent Loop. PostHog is **not yet wired**; this file
defines the names, shapes, and rules so implementation can land later
without re-litigating taxonomy.

> One-Tent Loop: Grow → Tent → Plant → Quick Log → Timeline → Sensor
> Snapshot → AI Doctor → Alert → Approval-Required Action Queue.

## Rules

- Event names are `snake_case`, present-tense verbs on a noun.
- Event properties must not contain raw user-facing copy, plant
  nicknames, or grower notes (PII / sensitive content).
- Internal IDs (`tent_id`, `plant_id`, `action_queue_item_id`) MAY be
  included as properties for funnel analysis, but MUST NEVER be rendered
  in user-facing copy or notifications.
- Source provenance (`live`, `manual`, `csv`, `demo`, `stale`, `invalid`)
  is required on any event that touches a sensor reading. Demo data must
  be tagged as such and never reported as `live`.
- Action Queue events MUST preserve the **approval-required** semantic:
  there is no `action_queue_item_executed` event in V0.
- **No `*_executed` event naming for V0.** Events may describe creation,
  completion, or logging, but must never imply automated execution,
  device command dispatch, or unapproved automation.

## Events

### `quick_log_created`
A grower saved a Quick Log entry against a plant or tent.

| Property | Type | Notes |
|---|---|---|
| `tent_id` | string | Internal only. |
| `plant_id` | string \| null | Internal only. Null for tent-level logs. |
| `entry_type` | enum | `water` \| `feed` \| `note` \| `photo` \| `training` \| `defoliation` \| `flush` \| `inspect` |
| `has_photo` | boolean | |
| `has_sensor_snapshot` | boolean | |
| `loop_step` | const | `"quick_log"` |

### `sensor_snapshot_attached`
A sensor snapshot was attached to a Quick Log entry, a plant timeline,
or an AI Doctor context.

| Property | Type | Notes |
|---|---|---|
| `tent_id` | string | Internal only. |
| `source` | enum | `live` \| `manual` \| `csv` \| `demo` \| `stale` \| `invalid` |
| `status` | enum | `usable` \| `stale` \| `invalid` \| `needs_review` \| `no_data` |
| `attached_to` | enum | `quick_log` \| `timeline` \| `ai_doctor` |
| `loop_step` | const | `"sensor_snapshot"` |

### `timeline_viewed`
A grower opened a plant or tent timeline view.

| Property | Type | Notes |
|---|---|---|
| `tent_id` | string | Internal only. |
| `plant_id` | string \| null | Internal only. |
| `range_days` | number | 7 / 30 / 90 / 0=all |
| `entry_count` | number | Items in current view. |
| `loop_step` | const | `"timeline"` |

### `ai_doctor_opened`
A grower opened the AI Doctor surface for a plant or tent.

| Property | Type | Notes |
|---|---|---|
| `tent_id` | string | Internal only. |
| `plant_id` | string \| null | Internal only. |
| `context_completeness` | enum | `complete` \| `partial` \| `insufficient` |
| `has_recent_photo` | boolean | |
| `has_recent_sensor_snapshot` | boolean | |
| `loop_step` | const | `"ai_doctor"` |

### `alert_viewed`
A grower viewed an alert (sensor, task, or AI).

| Property | Type | Notes |
|---|---|---|
| `alert_id` | string | Internal only. |
| `severity` | enum | `critical` \| `warning` \| `info` |
| `source` | enum | `sensor` \| `task` \| `ai` |
| `tent_id` | string \| null | Internal only. |
| `loop_step` | const | `"alert"` |

### `action_queue_item_created`
A grower created an Action Queue item (typically from an alert or AI
Doctor suggestion). The item is **suggested**; nothing executes.

| Property | Type | Notes |
|---|---|---|
| `action_queue_item_id` | string | Internal only. |
| `origin` | enum | `alert` \| `ai_doctor` \| `manual` |
| `tent_id` | string \| null | Internal only. |
| `plant_id` | string \| null | Internal only. |
| `requires_approval` | const | `true` — invariant in V0. |
| `loop_step` | const | `"action_queue"` |

### `action_queue_item_completed`
A grower **approved and completed** an Action Queue item. There is no
implicit execution path; completion is an explicit grower act.

| Property | Type | Notes |
|---|---|---|
| `action_queue_item_id` | string | Internal only. |
| `outcome` | enum | `done` \| `dismissed` \| `superseded` |
| `time_to_completion_seconds` | number | Created → completed. |
| `loop_step` | const | `"action_queue"` |

---

## What this map intentionally does NOT include

- No `*_executed` events. V0 has no automated execution.
- No device-control events. V0 does not control hardware.
- No event that exposes raw grower notes or photo content.
- No event that fabricates a `live` source from demo data.

# V0 Loop Event Map

This document separates Verdant's **shipped aggregate activation signal**
from the more detailed internal/PostHog taxonomy that remains aspirational.

> One-Tent Loop: Grow → Tent → Plant → Quick Log → Timeline → Sensor
> Snapshot → AI Doctor → Alert → Approval-Required Action Queue.

## Shipped GA activation contract

The shipped privacy-safe growth-calendar contract has shared setup, then two
independent activation branches. It is **not** a requirement that every grower
complete Quick Log before importing CSV history, or import CSV history before
using the diary.

```text
Shared setup:
signup → grow_created → tent_created → plant_created

Diary activation branch:
quick_log_saved → ai_doctor_review_started → ai_doctor_result_received →
ai_doctor_session_saved → paywall_viewed → paywall_cta_clicked →
checkout_started → subscription_activated → checkout_return_completed

CSV-history acquisition branch:
csv_history_onboarding_ready → csv_import_started → csv_import_completed →
csv_history_ai_doctor_clicked → ai_doctor_review_started →
ai_doctor_result_received → ai_doctor_session_saved → paywall_viewed →
paywall_cta_clicked → checkout_started →
subscription_activated → checkout_return_completed
```

Historical reviews additionally emit `historical_ai_review_started` beside the
generic start event. It is a historical-only branch marker, not a step that
standard reviews pass through.

`grow_created`, `tent_created`, and `plant_created` emit only after their
respective inserts succeed. They carry no row identifiers or grower-entered
names. `csv_history_onboarding_ready` records a CSV-acquisition grower who
explicitly finished the editable starter Grow, Tent, and Plant setup and now
sees the tent-scoped importer handoff. It carries only `surface: "onboarding"`;
it does not open a file picker, import data, or imply that any history is live.
It is a CSV-branch milestone, not a replacement for `quick_log_saved` and not
evidence that a diary user has imported anything.
`csv_import_started` records an explicit modal-open action;
`csv_import_completed` records only a successful persistence result and the
numeric inserted-row count. The difference measures import abandonment without
capturing filenames, providers, timestamps, values, or file contents. A
duplicate-only import can complete with `rows: 0`; count an activated import
only when `rows > 0`, while retaining zero-row completions as a useful no-op
completion diagnostic.

The CSV-to-AI handoff preserves the same narrow client analytics boundary.
`csv_history_ai_doctor_clicked` records the grower's explicit CTA click with
only `surface: "imported_history"`. `ai_doctor_review_started` records an
accepted initial start with the closed `standard | historical_review` surface.
For historical reviews, `historical_ai_review_started` also records the accepted
initial historical-review start with no properties; blocked starts and retries
do not emit either start event. The accepted mode is frozen at start so a
mid-request context refresh cannot relabel the result. `ai_doctor_result_received`
is emitted only after a contract-valid result is displayed, and
`ai_doctor_session_saved` only after the durable history insert returns a
session ID. Both carry only the same frozen review surface and never the session
ID itself.

These AI Doctor funnel events cover the canonical plant-detail
`ai-doctor-review` path. AI Coach has a separate invocation path and is not
claimed as measured by this client sequence; add its server-authoritative usage
telemetry separately before including Coach in conversion reporting.

After a Free grower's third review returns a contract-valid result and the
history insert is durably confirmed, the saved result may expose a calm upgrade
handoff. `paywall_viewed` then carries only
`surface: "ai_doctor_post_value"`; `paywall_cta_clicked` uses that same closed
surface only after an explicit pricing-link click. The handoff requires the
server-resolved Free plan, the exact exhausted `3 per grow` allowance, and a
settled client entitlement that is not paid or Founder. It stays hidden while
history is saving or failed, for malformed or missing credit context, and for
paid, Founder, or unknown viewers. The review remains visible and saved whether
or not the grower opens pricing.

When a Free grower is server-denied for the per-grow AI Doctor limit,
`paywall_viewed` records that the rendered limit notice exposed an upgrade
option. `paywall_cta_clicked` then records only an explicit click on that
notice's pricing CTA with the closed `surface: "ai_doctor_limit"` enum. It
does not record a route, return target, grower identity, plant/tent/grow ID,
or plan choice. It is a client-only, non-authoritative intent signal: it is not
a checkout start, subscription, entitlement grant, or revenue event. Paid,
Founder, and unknown-plan denials expose no pricing CTA and emit neither
paywall event.

`subscription_activated` requires both the server-resolved paid entitlement and
a fresh same-device checkout-start marker. This intentionally undercounts when
browser storage is unavailable instead of treating an existing paid grower's
direct success-page visit as a new conversion. When a sanitized return exists,
the activation may additionally carry only the closed `ai_doctor | pheno |
other` surface.

With that same evidence, Checkout Success carries a one-shot router-state
completion marker for `ai_doctor | other`. The destination-mounted authenticated
app shell emits `checkout_return_completed` only after server auth revalidation,
a resolved active paid entitlement, and the lazy destination subtree commit,
then immediately consumes the marker. Pheno activation is attributed at the
confirmed checkout, but its route-completion event is deliberately deferred:
the independently-owned Pheno gate does not yet expose a shared committed-ready
signal, so route arrival alone would be an unsafe success claim. No event emits
the path, query, hash, grow ID, tent ID, plant ID, or other route content.

`quick_log_saved` is emitted after a newly confirmed Quick Log write. The
only property is `event_type`, selected from this closed, non-content enum:

```text
note | water | feed | photo | environment | training |
defoliation | observation | harvest | plant_check
```

`plant_check` represents the mixed-content Plant Quick Log diary surface; it
does not inspect or classify the grower's note, photo, or manual readings.
The event never includes grow/tent/plant identifiers, names, strain, notes,
sensor values, attachment paths, or raw payloads. Idempotent replay responses
are not counted again. An attachment upload by itself is not a Quick Log
success; the primary log/event/diary write must be confirmed first.

The live app routes this event through the privacy allowlisted funnel tracker,
which sends to `gtag` when Google Analytics is available and mirrors the same
sanitized shape onto Verdant's existing analytics bridge. Missing or blocked
analytics never blocks the grower's save.

### Client-observed activation proxy

For current growth reporting, the shipped client-observed activation proxy is:

```text
at least 3 confirmed quick_log_saved events in a trailing 7-day window
```

This rolling measure is calculated in GA4 from the privacy-safe client event;
Verdant does not keep a parallel browser or local-storage counter. It has no
historical backfill for Quick Logs saved before this event shipped. Browser
privacy controls, consent state, ad blockers, network loss, or unavailable GA
can suppress otherwise valid saves, so this proxy can undercount activation.

The GA4 proxy is not authoritative cross-device, server-side, or signup-cohort
measurement. A future authoritative operator/cohort aggregate must be derived
separately from confirmed persisted writes with server-side identity and
deduplication rules. That future aggregate is not implemented or claimed by
this client telemetry contract.

## Aspirational/internal PostHog taxonomy

The sections below define the first detailed PostHog events Verdant may emit
to measure the One-Tent Loop. PostHog is **not yet wired**. These names and
properties are planning contracts, not claims about currently collected data.
In particular, the internal identifiers described below are **not** part of
the shipped `quick_log_saved` GA contract.

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

| Property              | Type           | Notes                                                                                         |
| --------------------- | -------------- | --------------------------------------------------------------------------------------------- |
| `tent_id`             | string         | Internal only.                                                                                |
| `plant_id`            | string \| null | Internal only. Null for tent-level logs.                                                      |
| `entry_type`          | enum           | `water` \| `feed` \| `note` \| `photo` \| `training` \| `defoliation` \| `flush` \| `inspect` |
| `has_photo`           | boolean        |                                                                                               |
| `has_sensor_snapshot` | boolean        |                                                                                               |
| `loop_step`           | const          | `"quick_log"`                                                                                 |

### `sensor_snapshot_attached`

A sensor snapshot was attached to a Quick Log entry, a plant timeline,
or an AI Doctor context.

| Property      | Type   | Notes                                                           |
| ------------- | ------ | --------------------------------------------------------------- |
| `tent_id`     | string | Internal only.                                                  |
| `source`      | enum   | `live` \| `manual` \| `csv` \| `demo` \| `stale` \| `invalid`   |
| `status`      | enum   | `usable` \| `stale` \| `invalid` \| `needs_review` \| `no_data` |
| `attached_to` | enum   | `quick_log` \| `timeline` \| `ai_doctor`                        |
| `loop_step`   | const  | `"sensor_snapshot"`                                             |

### `timeline_viewed`

A grower opened a plant or tent timeline view.

| Property      | Type           | Notes                  |
| ------------- | -------------- | ---------------------- |
| `tent_id`     | string         | Internal only.         |
| `plant_id`    | string \| null | Internal only.         |
| `range_days`  | number         | 7 / 30 / 90 / 0=all    |
| `entry_count` | number         | Items in current view. |
| `loop_step`   | const          | `"timeline"`           |

### `ai_doctor_opened`

A grower opened the AI Doctor surface for a plant or tent.

| Property                     | Type           | Notes                                     |
| ---------------------------- | -------------- | ----------------------------------------- |
| `tent_id`                    | string         | Internal only.                            |
| `plant_id`                   | string \| null | Internal only.                            |
| `context_completeness`       | enum           | `complete` \| `partial` \| `insufficient` |
| `has_recent_photo`           | boolean        |                                           |
| `has_recent_sensor_snapshot` | boolean        |                                           |
| `loop_step`                  | const          | `"ai_doctor"`                             |

### `alert_viewed`

A grower viewed an alert (sensor, task, or AI).

| Property    | Type           | Notes                             |
| ----------- | -------------- | --------------------------------- |
| `alert_id`  | string         | Internal only.                    |
| `severity`  | enum           | `critical` \| `warning` \| `info` |
| `source`    | enum           | `sensor` \| `task` \| `ai`        |
| `tent_id`   | string \| null | Internal only.                    |
| `loop_step` | const          | `"alert"`                         |

### `action_queue_item_created`

A grower created an Action Queue item (typically from an alert or AI
Doctor suggestion). The item is **suggested**; nothing executes.

| Property               | Type           | Notes                              |
| ---------------------- | -------------- | ---------------------------------- |
| `action_queue_item_id` | string         | Internal only.                     |
| `origin`               | enum           | `alert` \| `ai_doctor` \| `manual` |
| `tent_id`              | string \| null | Internal only.                     |
| `plant_id`             | string \| null | Internal only.                     |
| `requires_approval`    | const          | `true` — invariant in V0.          |
| `loop_step`            | const          | `"action_queue"`                   |

### `ai_doctor_result_created`

A grower generated an AI Doctor result (analysis, recommendation, or
risk assessment) for a plant or tent.

| Property                     | Type           | Notes                                      |
| ---------------------------- | -------------- | ------------------------------------------ |
| `tent_id`                    | string         | Internal only.                             |
| `plant_id`                   | string \| null | Internal only.                             |
| `context_completeness`       | enum           | `complete` \| `partial` \| `insufficient`  |
| `has_recent_photo`           | boolean        |                                            |
| `has_recent_sensor_snapshot` | boolean        |                                            |
| `recommendation_count`       | number         | How many follow-up actions were suggested. |
| `risk_level`                 | enum           | `low` \| `medium` \| `high`                |
| `loop_step`                  | const          | `"ai_doctor"`                              |

### `action_queue_item_completed`

A grower **approved and completed** an Action Queue item. There is no
implicit execution path; completion is an explicit grower act.

| Property                     | Type   | Notes                                 |
| ---------------------------- | ------ | ------------------------------------- |
| `action_queue_item_id`       | string | Internal only.                        |
| `outcome`                    | enum   | `done` \| `dismissed` \| `superseded` |
| `time_to_completion_seconds` | number | Created → completed.                  |
| `loop_step`                  | const  | `"action_queue"`                      |

### `action_follow_up_logged`

A grower logged the **plant response** to a completed action.
This event connects the closed loop:

**action taken → plant response → improved / declined → repeat / avoid next run.**

It is the bridge from the Action Queue back into plant memory and
post-grow learning.

> **Implemented as (One-Tent Learning Loop V1):** the grower flow is split
> into two grower-recorded steps persisted as `diary_entries.details`
> application events (no schema change), then derived into Plant Memory
> Episodes. See [one-tent-learning-loop-v1.md](./one-tent-learning-loop-v1.md).
>
> - The **plant response** is the existing `action_outcome` event. Its
>   `outcome_status` enum is
>   `improved | unchanged | worsened | more_data_needed` (the shipped vocabulary; the analytics `response`
>   values `improved | declined | no_change | too_soon` above are the
>   original V0 analytics contract, not the persisted enum).
> - The **next-run decision** (`follow_up_type` above) is the separate
>   `run_learning_decision` event: `decision` enum
>   `repeat | avoid | adjust | monitor`, chosen explicitly by the grower after an outcome exists.
>   Verdant never promotes improved→repeat or worsened→avoid automatically.

| Property               | Type    | Notes                                                                                                                                                                                |
| ---------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `plant_id`             | string  | Internal only.                                                                                                                                                                       |
| `tent_id`              | string  | Internal only.                                                                                                                                                                       |
| `action_queue_item_id` | string  | Links to the original action (`action_queue_id` in the persisted events).                                                                                                            |
| `response`             | enum    | Analytics contract: `improved` \| `declined` \| `no_change` \| `too_soon`. Persisted `action_outcome.outcome_status`: `improved` \| `unchanged` \| `worsened` \| `more_data_needed`. |
| `follow_up_type`       | enum    | `repeat` \| `avoid` \| `adjust` \| `monitor` — persisted as `run_learning_decision.decision`, grower-chosen, never auto-derived.                                                     |
| `has_photo`            | boolean | Did the grower attach a visual reference?                                                                                                                                            |
| `loop_step`            | const   | `"action_queue"`                                                                                                                                                                     |

## Future internal context properties on downstream V0 events

This section belongs only to the aspirational internal/PostHog taxonomy above.
It does not describe the shipped GA contract. The shipped privacy-safe create
and downstream events intentionally carry no grow, tent, plant, session, or
user IDs.

In a future internal implementation, Grow, Tent, and Plant would be **required
context properties** on every downstream event that touches a plant, tent, or
grow:

- `grow_id` (string) — the top-level grow context.
- `tent_id` (string) — the tent environment context.
- `plant_id` (string \| null) — the specific plant, or null for tent-level scope.

This would let an access-controlled internal funnel trace **Grow → Tent → Plant
→ Loop Step**. It does not remove or alter the shipped aggregate
`grow_created`, `tent_created`, and `plant_created` events, which contain no IDs.

---

## What this map intentionally does NOT include

- No `*_executed` events. V0 has no automated execution.
- `action_queue_item_executed` is explicitly forbidden.
- `device_command_executed` is explicitly forbidden.
- `automation_executed` is explicitly forbidden.
- No device-control events. V0 does not control hardware.
- No event that exposes raw grower notes or photo content.
- No event that fabricates a `live` source from demo data.

# Verdant V0 Operating Loop — Demo Script

## Purpose

The V0 operating loop is Verdant's core product spine. It proves that a
grower can move real (or manually entered) tent data through the whole
system — from a single reading to an approval-required suggested action —
without any automation, device control, or fake live data.

This document is the canonical demo script and the contract reference
that the V0 contract tests guard.

```
Manual / real sensor reading
        ↓
Dashboard latest environment snapshot
        ↓
Derived environment alert (in-memory rules)
        ↓
Persisted alert row + alert_events "created"
        ↓
Alert Detail
        ↓
User-initiated "Add to Action Queue" (approval-required)
        ↓
Action Queue (filterable by source)
        ↓
Action Detail (links back to source alert)
        ↓
Stale-warning behavior when source alert closes
```

## Step-by-step demo flow

1. **Create or select a grow.** From Grows, pick an active grow (or
   create one). All downstream rows are scoped by `grow_id` via RLS.
2. **Create or select a tent.** Make sure at least one tent is attached
   to the grow.
3. **Enter a manual sensor reading.** On the Sensors page, use the
   Manual Sensor Reading card to enter current temperature and humidity
   (VPD is computed). This writes `sensor_readings` rows with
   `source = "manual"`.
4. **View Dashboard latest environment.** The Dashboard surfaces the
   freshest reading, the source (`Manual`), when it was recorded, and
   whether it is fresh or stale.
5. **Observe the derived environment alert.** If the reading is out of
   the configured target range, an environment alert appears.
6. **Open Alert Detail.** The persisted `alerts` row is paired with an
   `alert_events` row whose `event_type = "created"`. No action queue
   items are created automatically.
7. **Add to Action Queue.** Click the user-initiated handoff button.
   The suggested action is inserted with:
   - `status = "pending_approval"`
   - `source = "environment_alert"`
   - `action_type = "advisory"`
   - a `[alert:<id>]` back-pointer in the reason
   - no executable command/device payload
   - no client-side `user_id` (the DB default `auth.uid()` wins)
8. **Open Action Queue.** The "Environment Alert" filter chip shows
   alert-derived suggestions. Manual and AI Coach actions are not
   affected.
9. **Open Action Detail.** The Action source block parses the
   back-pointer and exposes an "Open source alert" link.
10. **Follow the source-alert backlink.** Confirm bi-directional
    provenance: AlertDetail lists related queue items, ActionDetail
    links back to the originating alert.
11. **Resolve or dismiss the alert.** While the related action remains
    `pending_approval`:
    - AlertDetail shows: *"This alert is no longer open, but related
      actions are still pending review. Confirm the current grow
      conditions before approving."*
    - ActionDetail shows: *"The source alert is no longer open.
      Re-check current grow conditions before approving this action."*

Neither warning mutates any row. Approve / reject / cancel always
remain a deliberate grower decision.

## Real data vs manual data vs demo data

- **Real data** — sensor_readings written from a confirmed device
  integration (`source = "live"`).
- **Manual data** — sensor_readings entered by the grower via the
  Manual Sensor Reading card (`source = "manual"`). Treated as real for
  the persistence pipeline as long as the reading is fresh and valid.
- **Demo data** — fallback / mock data surfaced for unauthenticated
  previews or empty states. The persistence pipeline rejects it: no
  alerts are written when `isDemoData === true`, the snapshot source is
  not `live`/`manual`, the reading is stale, or quality is
  `unavailable`.

## Safety guarantees

- **No automation.** Alerts are only persisted in response to real
  reading changes; actions are only created by an explicit grower
  click.
- **No device control.** No MQTT, Home Assistant, webhook, relay, or
  actuator paths exist anywhere in the loop.
- **Approval-required actions only.** Every action queue row created
  from an alert lands in `pending_approval` with `action_type =
  "advisory"`. Approve / reject / complete / cancel always require a
  dialog confirmation.
- **Stale-warning behavior.** When a source alert closes while its
  related action is still pending — or vice versa — both pages render a
  read-only warning. Neither warning auto-cancels, auto-approves, or
  auto-rejects anything.
- **No service_role usage.** All writes flow through the user's
  session and are scoped by RLS to `auth.uid()`.

## Known limitations (V0)

- Manual sensor schema supports the existing allowed metrics only
  (temperature, humidity, derived VPD). PPFD, soil EC, and reservoir
  fields are intentionally not in scope yet.
- No hardware adapter ships in V0 — partners bring their own collection
  layer and Verdant turns that data into memory, context, and
  suggestions.
- No automatic alert resolution: a grower must mark alerts resolved or
  dismissed.

## Partner demo framing

> Your hardware collects the data. Verdant turns it into plant memory, alert context, and approval-required decisions.


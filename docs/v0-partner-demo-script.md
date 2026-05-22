# Verdant V0 — Partner Demo Script

For hardware partner calls. Run this script on the protected V0 build.
Green baseline at recording time: **1886/1886 tests passing**.

---

## Positioning (open with this)

> Verdant is **hardware-neutral**. We do not replace your hardware platform.
> Your hardware collects the data. Verdant turns it into plant memory,
> alert context, AI-grounded recommendations, and **approval-required**
> decisions.
>
> The grower stays in control. Device actions are **approval-required only**.
> There is **no blind autopilot**.

Key talking points:

- Hardware-neutral. We integrate with what the grower already runs.
- Read-only data ingestion is already valuable: it becomes plant memory,
  alerts, and AI context.
- Verdant never executes equipment changes on its own.
- The Action Queue is the human checkpoint between insight and action.

---

## Demo flow (10–12 minutes)

1. **Grow → Tent → Plant.** Show the org structure. Note that everything
   downstream — alerts, actions, AI context — is anchored to a real grow
   the grower owns (RLS-enforced).
2. **Diary / log entry.** Add a quick log. Show that growers' notes become
   part of the persistent plant memory.
3. **Photo log.** Add a photo entry (if surfacing on the partner call).
   Emphasize that photos become part of the grow timeline AI can reference.
4. **Manual sensor reading.** Enter a manual temperature / humidity reading.
   Call out: *"This is real grower input. The same path will accept
   ingested readings from your hardware."*
5. **Dashboard latest environment snapshot.** Refresh the Dashboard. The
   new reading becomes the latest snapshot.
6. **Derived environment alert.** With grow targets in place, the
   out-of-range reading produces a derived environment alert.
7. **Persisted alert + alert_event.** Show that the alert is persisted
   under the grower's account (RLS-scoped). This is the durable record
   the AI and the Action Queue both work from.
8. **Alert Detail.** Open the alert. Show the full reasoning — metric,
   reason, severity, source — plus the read-only related Action Queue
   items list.
9. **Add to Action Queue (user-initiated).** Click "Add to Action Queue".
   Verdant creates **one** advisory, `pending_approval` queue item with a
   conservative review-first recommendation. No device command fields are
   on the draft.
10. **Action Detail.** Open the new queue item. Show the source-alert
    backlink and the stale-warning behavior (if the source alert closes
    while the action is still pending).
11. **Approve / reject.** The grower decides. Verdant does not push
    anything to equipment. The decision is logged.

---

## Closing (end with this)

> Today's V0 is the **protected operating loop**: real readings → real
> alerts → approval-required actions. It is locked behind a stop-ship
> contract test so we cannot regress the safety story between releases.
>
> The next phases — grow-room mode, real sensor ingestion adapters, deeper
> AI Doctor context, and PPFD / soil EC / reservoir schema expansion —
> all plug into this same spine. Nothing bypasses approval.

---

## What we will **not** claim on the call

- Native, certified integrations with specific hardware vendors (unless
  we have actually shipped one).
- Real-time autonomous control of equipment.
- A "live" streaming sensor pipeline beyond the latest manual / real
  snapshot.
- AI-driven nutrient or feed automation.
- Closed-loop automation of any kind.

---

## Safety guarantees in one paragraph (use verbatim if asked)

> Verdant V0 enforces: **no automation**, **no device control**, **no fake
> live sensor data**, **approval-required actions only**, **no
> `service_role`** in the client, RLS-scoped per-grower data, and a
> stop-ship contract test that fails the build if any of those break.

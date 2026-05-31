# Grow Room Mode — Smoke Test Checklist

Concise QA pass for the `/grow-room` quick-action launcher. Read-only;
no writes, no automation, no device control are expected to be triggered
by anything on this checklist.

## Scope

- Page: `/grow-room` (optional `?growId=<id>`)
- Component: `GrowRoomQuickActionsCard`
- Helper: `buildGrowRoomLauncherEntries`
- Event: `verdant:open-quicklog`

## Pre-flight

- [ ] Logged in as a real user (not service_role).
- [ ] At least one tent + one grow exist for unscoped checks.
- [ ] Open browser devtools → Console and Network tabs.

## 1. Launcher renders

- [ ] `/grow-room` shows the **Grow Room Mode** card.
- [ ] Five buttons appear in this order:
  1. Quick Log
  2. Manual sensor snapshot
  3. Ask Doctor
  4. Review alerts
  5. Record outcome
- [ ] Description copy reads: *"Quick links to the actions you reach most
      in the grow room. Verdant never executes equipment changes."*
- [ ] No "autopilot", "auto-execute", or device-control language is shown.

## 2. Scoped grow preserved in links

Navigate to `/grow-room?growId=<known-id>` and confirm:

- [ ] **Manual sensor snapshot** href = `/sensors?growId=<id>`
- [ ] **Review alerts** href = `/alerts?growId=<id>`
- [ ] **Record outcome** href = `/?growId=<id>` (Dashboard)
- [ ] **Ask Doctor** href = `/doctor` (no scoping required)

Without `?growId=` the same links should drop the query param cleanly.

## 3. QuickLog event dispatch

- [ ] Click **Quick Log**. Console shows exactly one
      `verdant:open-quicklog` CustomEvent.
- [ ] With `?growId=<id>` present, `event.detail` =
      `{ growId: "<id>", plantId: null }` (or includes `plantId` when
      context already provides one).
- [ ] With no scope, `event.detail` is `null` (no fake context invented).
- [ ] No network request is fired by the click (no writes).

## 4. Disabled state

- [ ] When `recordOutcomeAvailable` is false, **Record outcome** renders
      disabled with `aria-disabled="true"` and reason text:
      *"No completed actions awaiting outcome capture yet."*
- [ ] Disabled button does not navigate or dispatch on click.

## 5. Accessibility

- [ ] Every button exposes an `aria-label` matching its visible label.
- [ ] Disabled entries' aria-label includes `(unavailable: <reason>)`.
- [ ] Keyboard `Tab` reaches each button; `focus-visible` ring is
      visible against both light and dark backgrounds.
- [ ] `Enter` / `Space` activate the focused button (navigate or
      dispatch).

## 6. Mobile layout

- [ ] At ≤640px width, buttons stack to one column.
- [ ] At ≥640px, buttons render in a 2-column grid.
- [ ] Tap targets are ≥44px tall (buttons are `h-14`).

## 7. Safety verdict

Confirm none of the following appear on `/grow-room` or in launcher code:

- [ ] No `.insert/.update/.delete/.upsert/.rpc` triggered by launcher.
- [ ] No `pi-ingest`, `functions.invoke`, or `service_role` references.
- [ ] No MQTT / Home Assistant / relay / actuator / device-command
      strings.
- [ ] No alert or sensor-ingest writes from the launcher.
- [ ] No grower user id read from client payload (RLS-scoped data only).

## Sign-off

- Tester: ____________________  Date: __________
- Build / commit: ____________________
- Result: ☐ Pass  ☐ Pass with notes  ☐ Fail (see notes)

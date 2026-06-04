# EcoWitt-Only Removal Report

**Date:** 2026-06-04  
**Scope:** Remove SwitchBot references from active Verdant codebase, docs,
tests, fixtures, prompts, and UI copy. Standardize physical sensor examples
on EcoWitt.

## Summary

Every active SwitchBot reference was removed or replaced with an EcoWitt
equivalent. No schema, RLS, edge function, auth, billing, or device-control
changes were made. Manual / CSV / demo / stale / invalid / Home Assistant /
MQTT / Raspberry Pi / webhook concepts are preserved.

## Files updated (SwitchBot → EcoWitt)

| File | Change |
|---|---|
| `src/lib/manualSensorSourceLabel.ts` | Replaced `switchbot-co2` preset with four EcoWitt presets (WH45, WH31, WH51, gateway). Updated doc comments. |
| `src/lib/sensorDeviceLabels.ts` | Updated example in module doc comment. |
| `src/lib/sensorReadingManualEntryRules.ts` | Updated example device-note comments. |
| `src/lib/sensorSnapshot.ts` | Updated example in `device_id` doc comment. |
| `src/components/ManualSensorReadingCard.tsx` | Replaced helper-text example and CO₂ placeholder with EcoWitt WH45 wording. |
| `src/test/dashboard-latest-environment.test.ts` | Updated example label in comment. |
| `src/test/manual-sensor-display-labels.test.ts` | Replaced all SwitchBot strings/assertions with EcoWitt WH45. |
| `src/test/manual-sensor-source-label.test.ts` | Replaced all SwitchBot strings/assertions with EcoWitt WH45. |
| `src/test/manual-sensor-reading-mobile-grouping.test.tsx` | Removed obsolete `switchbot.com` / `api.switch-bot` forbidden-list entries. |

## Files renamed

| Old | New |
|---|---|
| `src/test/manual-co2-switchbot-ready.test.ts` | `src/test/manual-co2-ecowitt-ready.test.ts` |

## Files added

| File | Purpose |
|---|---|
| `docs/ecowitt-only-sensor-direction.md` | Documents the active EcoWitt-only physical sensor path. |
| `docs/ecowitt-only-removal-report.md` | This report. |
| `scripts/assert-ecowitt-only-sensor-direction.mjs` | Static scanner that fails if any file outside the allow-list reintroduces a SwitchBot reference. |
| `.github/workflows/ecowitt-only-safety-scan.yml` | CI job that runs the scanner on push / PR. |
| `src/test/ecowitt-only-sensor-direction.test.ts` | Vitest wrapper that asserts the scanner reports zero offenders. |

## Removed references (audit trail)

The following SwitchBot tokens were present before and are now absent
everywhere except the explicit allow-list (this report + the
`ecowitt-only-sensor-direction.md` doc + the scanner script):

- `SwitchBot` / `switchbot` / `switch_bot`
- `SwitchBot CO2 Monitor`
- `switchbot-co2`
- `switchbot.com`, `api.switch-bot`

## Remaining allowed references

| File | Reason |
|---|---|
| `scripts/assert-ecowitt-only-sensor-direction.mjs` | Contains the literal pattern used to detect violations. |
| `docs/ecowitt-only-removal-report.md` | Historical audit trail (this file). |
| `docs/ecowitt-only-sensor-direction.md` | Mentions SwitchBot only to state it is not active or planned. |

No other file is allowed to contain the token.

## Safety verdict

- No Supabase schema, RLS, edge-function, auth, or billing changes.
- No new sensor integrations.
- No device control. No automation. No Action Queue auto-creation.
- Manual readings still never display as Live.
- Approval-required Action Queue is unchanged.
- Hardware-neutral architecture language preserved (Home Assistant, MQTT,
  Raspberry Pi, ESP32, webhook, CSV, manual all retained).

## Rollback notes

Revert this PR's commits. The scanner and CI workflow can be disabled by
removing `scripts/assert-ecowitt-only-sensor-direction.mjs` and
`.github/workflows/ecowitt-only-safety-scan.yml`; the codebase will continue
to function without them.

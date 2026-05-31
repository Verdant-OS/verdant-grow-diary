# QA Regression Checklist

Run this checklist before publishing any Verdant change. Each item is pass / fail.

## Data labeling

- [ ] No unlabeled sensor readings rendered anywhere in the UI.
- [ ] No `demo` data displayed as `live`.
- [ ] No `stale` data displayed as healthy / current.
- [ ] No `invalid` values rendered as healthy numbers.
- [ ] Manual snapshots older than 24 h are treated as `stale` for current-state decisions.
- [ ] Live readings older than 15 min are reclassified to `stale`.

## AI Doctor

- [ ] Output includes all 8 required fields: `confidence`, `evidence`, `missing_info`, `immediate_action`, `do_not_do`, `check_24h`, `plan_3day`, `risk_level`.
- [ ] `missing_info` is populated when confidence is `low` or `medium`.
- [ ] No claim that a specific hardware device, controller, relay, or partner product has failed.
- [ ] No certainty (`high` confidence) from a single photo or single reading.
- [ ] Stale/invalid signals are cited, never silently treated as fresh.

## Action Queue

- [ ] Every Action Queue item is approval-required.
- [ ] No executable device payloads on any item.
- [ ] No relay / fan / light / humidifier / irrigation / dosing commands.
- [ ] No webhook execution instructions that mutate state.
- [ ] No "send command", "run device", "control hardware", or other auto-execute phrasing.
- [ ] Dismissed / resolved alerts do not silently regenerate Action Queue items.

## Static safety

- [ ] No `service_role` in client code.
- [ ] No automation / device-control strings introduced.
- [ ] No `mqtt`, `home_assistant`, `relay`, `actuator`, `webhook` mutation paths added by this change.
- [ ] No "Next Door Cannabis" strings anywhere.
- [ ] No "zero liability" phrase anywhere.
- [ ] Docs-only tasks did not change schema, app, or UI files.

## Fixtures

- [ ] Every reading carries `state`, `source_type`, `is_fixture`, `fixture_scope`, `captured_at`.
- [ ] Demo fixtures are 100% `state: "demo"`.
- [ ] Bad-sensor fixtures use only `stale` or `invalid`.
- [ ] No secrets, tokens, API keys, or real customer data in any fixture.
- [ ] Fixtures referenced from docs resolve.

## Docs

- [ ] README read order resolves with no broken references.
- [ ] Cross-references between docs resolve.
- [ ] Glossary terms are used consistently across all docs and fixtures.

## Validation

- [ ] `bunx vitest run` reports pass count and the count is reported in the response.
- [ ] Safety verdict is included in the response.
- [ ] Publish recommendation is included in the response.

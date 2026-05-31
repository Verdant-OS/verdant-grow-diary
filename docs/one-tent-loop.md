# The One-Tent Loop

The minimum end-to-end operating loop Verdant must always support:

`Grow → Tent → Plant → Quick Log → Timeline → Sensor Snapshot → AI Doctor → Alert → Approval-Required Action Queue`

## 1. Grow

- **Input** — User creates a grow (name, start date, strategy).
- **Output** — A `Grow` scoped to the user.
- **User sees** — Grow card on the dashboard.
- **Required labels** — None.
- **Next handoff** — User adds at least one Tent.
- **Failure/degraded** — No grow → all downstream views show empty state, never fabricated data.

## 2. Tent

- **Input** — Tent name, size, optional environmental targets, optional sensor source.
- **Output** — A `Tent` belonging to the Grow.
- **User sees** — Tent in the Grow detail.
- **Required labels** — Sensor source type when attached (demo/manual/live).
- **Next handoff** — Plants are assigned to the Tent.
- **Failure/degraded** — Missing targets → AI Doctor uses "missing_info"; never invents targets.

## 3. Plant

- **Input** — Plant name, strain, stage, started_at.
- **Output** — A `Plant` inside the Tent.
- **User sees** — Plant card with stage, day count, latest photo, latest snapshot.
- **Required labels** — Stage badge. Latest snapshot state badge.
- **Next handoff** — Plant accepts Quick Log entries.
- **Failure/degraded** — Missing stage → no inferred stage; show "Stage unknown".

## 4. Quick Log

- **Input** — Grower-initiated entry (watering, feeding, training, symptoms, photo, manual snapshot, observation, harvest, transplant, measurement, reminder).
- **Output** — A diary entry persisted to the plant/tent.
- **User sees** — Confirmation + entry appended to Timeline.
- **Required labels** — Event type chip. "Manual" badge for manual snapshots.
- **Next handoff** — Timeline.
- **Failure/degraded** — Network failure → entry buffered locally or surfaced as error; never silently dropped.

## 5. Timeline

- **Input** — Diary entries, photos, manual snapshots, alerts (read-only audit).
- **Output** — Chronological list.
- **User sees** — Filter chips, source badges, stage badges.
- **Required labels** — Every row carries source (note/photo/manual). Sensor rows never say "Live" unless they truly are.
- **Next handoff** — Sensor Snapshot view, AI Doctor.
- **Failure/degraded** — Malformed entries surface as "Limited data", not hidden.

## 6. Sensor Snapshot

- **Input** — Manual entry OR ingested reading from a verified source.
- **Output** — A reading with all required fields and a state in {demo, manual, live, stale, invalid}.
- **User sees** — Snapshot card with state badge, captured_at, source.
- **Required labels** — One of demo/manual/live/stale/invalid. Never unlabeled.
- **Next handoff** — Drives current-state metrics; feeds AI Doctor context.
- **Failure/degraded** — Stale/invalid → excluded from healthy KPIs, surfaced for grower review.

## 7. AI Doctor

- **Input** — Plant, recent diary, recent photos, recent snapshot(s), tent targets, stage.
- **Output** — Structured analysis with the 8 required fields (see `ai-doctor-output-contract.md`).
- **User sees** — Session card with confidence, evidence, missing_info, immediate_action, do_not_do, check_24h, plan_3day, risk_level.
- **Required labels** — Confidence level. Data-source quality (demo/manual/live/stale).
- **Next handoff** — Optional Alert + Action Queue draft.
- **Failure/degraded** — Insufficient context → returns "more data needed" with populated `missing_info`. Never invents certainty.

## 8. Alert

- **Input** — Rule-detected condition (out-of-range, stale sensor, missing data).
- **Output** — An Alert visible to the grower.
- **User sees** — Severity badge, metric, source, suggested next step.
- **Required labels** — Severity, source state. Never fires on `invalid` data as if healthy.
- **Next handoff** — Optionally seeds an Action Queue item via explicit grower handoff.
- **Failure/degraded** — Resolved/dismissed alerts do not silently regenerate.

## 9. Approval-Required Action Queue

- **Input** — Grower-initiated draft (from Alert or AI Doctor session).
- **Output** — A queued, text-only recommendation requiring explicit approval.
- **User sees** — Suggested change, reason, risk level, source back-pointer.
- **Required labels** — "Approval required". Source reference.
- **Next handoff** — Grower approves / simulates / completes / rejects. No automatic execution.
- **Failure/degraded** — Duplicate prevention via source de-dup. No hidden command execution path.

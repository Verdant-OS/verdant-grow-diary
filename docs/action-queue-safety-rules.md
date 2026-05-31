# Action Queue Safety Rules

The Action Queue is Verdant's safety layer. It is **approval-required only**.
Verdant follows a **read-only, no-write, no-control architecture** for advisory and alerting surfaces.

## Core rules

- Every Action Queue item is **approval-required**. It has no effect until the grower explicitly approves.
- Items are **text-only recommendation drafts**. They describe what a grower could do — they do not do it.
- Items are auditable: created, simulated, approved, rejected, completed, cancelled, noted.

## Allowed item contents

- Review text / human-readable description.
- Metric context (which reading or condition triggered this draft).
- Risk level (low / medium / high).
- Reason / rationale.
- Grower-facing recommendation (conservative).
- Source reference (alert id, AI Doctor session id, diary entry id).

## Forbidden item contents

Action Queue items MUST NOT contain:

- Executable device payloads.
- Relay commands.
- Fan / light / humidifier / dehumidifier / heater commands.
- Irrigation or dosing commands.
- Webhook execution instructions that mutate state.
- Auto-execute language ("send command", "run device", "control hardware").
- Partner-app control instructions.
- Hidden side-effects on approve.

## Grower flow

The grower is the only actor that can transition an item:

- Approve → marks the action approved for the grower to perform manually.
- Simulate → records a "what-if" without execution.
- Complete → grower confirms they performed the action themselves.
- Reject → marks the item dismissed with reason.

There is no automatic transition from suggested → approved → executed.

## Architectural constraints

- The client never holds `service_role` credentials.
- The Action Queue surface performs no device I/O.
- Resolved or dismissed alerts do not silently regenerate Action Queue items.
- Duplicate suggestions are de-duplicated by source reference.

## Phrase usage

- Use: **"read-only, no-write, no-control architecture"**.
- Do not use: **"zero liability"**.

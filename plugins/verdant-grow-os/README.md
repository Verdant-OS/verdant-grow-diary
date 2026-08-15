# Verdant Grow OS

Cursor plugin for agents and developers working on [Verdant](https://verdantgrowdiary.com): a standalone Grow OS whose promise is **plant memory, sensor truth, and better decisions**.

It keeps work inside one use case: the One-Tent Loop, with labeled telemetry, cautious AI, and grower-approved actions. It does not add community, device control, or automation.

## Installation

This plugin is saved under the local Cursor plugin directory, so it is available without an install step:

```text
~/.cursor/plugins/local/verdant-grow-os/
```

To use a repo checkout instead, copy or symlink `plugins/verdant-grow-os/` to that same path.

## Who it is for

- Cursor agents editing Verdant
- Developers protecting diary, sensor, AI, and Action Queue seams
- Researchers answering what growers actually search — without invented metrics

## Components

### Rules

| Rule | Description |
|:-----|:------------|
| `verdant-safety-fences` | Always-on product law: no fake live data, no device control, approval-required Action Queue |
| `no-invented-metrics` | Never invent search volume, traffic, rankings, or audience size |

### Skills

| Skill | Description |
|:------|:------------|
| `verdant-one-tent-loop` | Scope every change to Grow → Tent → Plant → Quick Log → Timeline |
| `grower-search-intelligence` | Research grower search intent with cited sources and blocked-data honesty |
| `action-queue-review` | Present pending suggestions for grower approval; never auto-execute |

### Agents

| Agent | Description |
|:------|:------------|
| `verdant-grow-os` | Route work in diary → sensors → AI → automation order |

### Commands

| Command | Description |
|:--------|:------------|
| `one-tent-loop` | Audit a change against the One-Tent Loop and safety fences |
| `grower-search` | Map a grower decision query without inventing metrics |

## Typical flow

1. Load `verdant-one-tent-loop` before changing product code.
2. Keep telemetry source-labeled (`live`, `manual`, `csv`, `demo`, `stale`, `invalid`).
3. Treat Action Queue items as suggestions until the grower approves them.
4. For SEO or content research, use `/grower-search` and label missing measurements as `UNKNOWN` or `BLOCKED`.

## Out of scope

- Device commands, MQTT publishes, or relay/actuator control
- Blind automation or auto-written Action Queue rows
- Checkout, webhook, or entitlement UI unless a task names that slice
- Invented analytics, reviews, or live sensor values

## License

MIT

---
name: action-queue-review
description: Summarize pending, approval-required Action Queue items and ask the grower to approve, edit, defer, or dismiss each one. Never auto-execute. No device commands.
---

# Action Queue review

Turn pending suggestions into a short review. The grower decides. Nothing runs on its own.

## When to use

- "What's in my Action Queue?"
- "What needs my approval?"
- After AI Doctor, alerts, or schedule suggestions created new items

## Read-only inputs

For each pending item, show:

- reason
- risk level
- source (AI Doctor, alert, diary follow-up, manual)
- related grow / tent / plant / alert when present
- sensor evidence with its source label
- missing information — never guessed

## Review order

Stable sort: higher risk first, then older `suggested_at`, then id.

## Output per item

```text
Approve | Edit | Defer | Dismiss
```

Wait for the grower. Do not write queue rows, change status, or send device commands unless the current task explicitly allows a user-approved write through an existing RPC.

## Safety

- Status on create is `pending_approval`.
- `target_device` stays unset.
- Demo/stale/invalid readings cannot justify approval by themselves.

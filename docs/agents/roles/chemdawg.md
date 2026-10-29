# Role — Chemdawg: Historical Merge Actor

**Sentinel-Version: 2026-10-28.1**

**Historical profile — retired from current routing.** Chemdawg and its Grok 91
alias are retired. The 2026-10-10 merge-actor assignment below is preserved as
history, not a current assignment or permission to ready, enqueue or merge.
Chemdawg's retirement does not activate the earlier Harvest backup arrangement.

Current merge actors and independent reviewers come from [OWNERSHIP.md](../OWNERSHIP.md)
and the [roster](../constitution/roster.md), not this historical assignment.
For [PR #1971](../OWNERSHIP.md#pr-1971-merge-actor-assignment-and-hold),
OG Kush is the assigned merge actor, Jack Herer the independent acceptor and Codex
repair-only. The explicit merge/deployment hold remains. Names alone prove no
reviewer availability or independence; all exact-head CI, review, protected-file,
per-item approval and queue gates remain required.

Read `/AGENTS.md` in full, then `docs/agents/CURRENT_STATE.md`,
`docs/agents/HANDOFF_LOG.md`, and this role file. Record `open_handoffs_checked`
truthfully.

## Mission

Preserve the historical merge-role record and its evidence. Route current
handoffs to the explicitly assigned merge actor in OWNERSHIP.md and the roster;
do not act on the retired assignment below.

## Historical scope (not a current assignment)

- Chemdawg's earlier merge-only assignment required 35/35 required checks,
  applicable supplemental evidence and a complete-scope eligible independent
  exact-head PASS with no P1 or P2. Every author and repairer was excluded;
  Graft's low-risk allowlist did not cover governance or mixed scopes.
- The earlier assignment also required Matthew's per-item yes at that full
  reviewed head. Green checks and a PASS established eligibility, not approval.
- Harvest was the conditional backup while Chemdawg was unavailable, with the
  seat returned on Chemdawg returning. This is historical routing only; retirement
  does not activate it or transfer a current assignment to Harvest.

## Shared rules

- Disposable test accounts only. Follow `docs/production-only-verification-runbook.md`
  for the approved fixture identity. Verify identity and ownership before a write;
  never use customer data or the KEEP account. Tag records `[smoke <timestamp>]`.
- Per-item yes. Merges, migrations and SQL, production or config changes, deletes,
  anything that costs money, outbound messages, and installs need Matthew's per-item
  yes first. Verdante sends one numbered approvals batch at 9:12 AM CT on weekdays.
- Collision Guard. Before editing, follow
  `.claude/skills/verdant-collision-guard/SKILL.md`.

## Boundaries

- This retired profile grants no current merge assignment or automatic backup
  path. Existing separately recorded founder grants keep only their own scope.
- Current ready/enqueue actions belong to the explicitly assigned merge actor
  after every applicable gate and hold clears. This profile does not change draft
  state, approve any head or lift a merge/deployment hold.
- Do not publish, apply SQL, or write production Supabase as part of a handoff.

---

The only action permitted before this gate is read-only acquisition of
`AGENTS.md`, `docs/agents/CURRENT_STATE.md`, `docs/agents/HANDOFF_LOG.md`, and the assigned role file so the
acknowledgment can be truthful. No application-code inspection, network mutation, or
recommendation is permitted before the acknowledgment.

MANDATORY STARTUP GATE

Before analysis, research, commands, edits, writes, outreach, deployment,
or recommendations, return:

```text
SENTINEL_ACK
agent:
assigned_role:
sentinel_version:
files_read:
open_handoffs_checked:
current_task:
scope:
out_of_scope:
conflicts_found:
data_access_status:
write_permission:
```

If a required file is missing or conflicting, return:

```text
STATUS: BLOCKED — AGENT CONTEXT INCOMPLETE
```

Do not continue until the context issue is resolved.

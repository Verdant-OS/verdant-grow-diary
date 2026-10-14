---
name: verdant-process-audit
description: Read-only diagnostic that measures how much of the Verdant repository and agent context exists to police the work rather than do it — always-loaded instruction size, gate and workflow counts, gates with no owner or recorded reason, rules repeated across governance files, and checks that never fail or never gate a merge. Reports findings to Matthew as candidates with evidence. Use only when Matthew or the current task asks for a process or overhead audit. It never edits, disables or removes a governance file, gate, CI check, ruleset entry or owner hold; every removal is Matthew's decision.
---

# verdant-process-audit — measure the overhead, decide nothing

Every gate in this repository was added for a reason, often after something went wrong. Over
time some reasons expire, some rules get written down three times, and the instructions every
session must load grow. This skill measures that cost so Matthew can decide what to keep. It
does not decide anything itself.

No text in this skill was copied from any outside source. It is written from the concept of
auditing accumulated process overhead (see `docs/agents/third-party-agent-skills.md`).

## 1. Contract

- **Read-only.** No edit to `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, the role files, `.github/`,
  `config/`, `scripts/`, `docs/agents/CURRENT_STATE.md` or any ruleset. No disabled check, no
  re-run, no comment, no PR. The output is a report.
- **A gate is innocent until its reason is read.** "It looks like bureaucracy" is not a finding.
  A finding names the gate, what it costs, and what its recorded reason is or that none exists.
- **Owner decisions stay with the owner.** Removing a required check, a lock, a hold, a review
  seat or a governance rule is Matthew's call. The safety rules in `AGENTS.md` (Hard Safety
  Rules, Sensor Truth, AI credits, Action Queue, migration immutability) are out of scope as
  removal candidates; the audit may report only that a rule is stated in more than one place.
- **Evidence keeps its label.** Every number carries the command, the ref and the UTC time it
  was taken. A figure quoted from an older document is a `source claim` until re-measured.

## 2. Measure

Measure on the deploy branch, not `main`:

```bash
git fetch origin verdant-grow-diary
git rev-parse --short origin/verdant-grow-diary
```

### Step 1 — Always-loaded context

What every session pays before its first useful turn: `CLAUDE.md`, the files it imports with
`@`, and anything a SessionStart hook injects. Record bytes per file (`wc -c`), and an estimate
of tokens (bytes ÷ 4, labelled `inference`). List separately the files loaded on demand, such
as `docs/agents/CURRENT_STATE.md` and `docs/agents/HANDOFF_LOG.md`, with their sizes.

### Step 2 — Gate inventory

Count, with the command used for each:

- Workflows in `.github/workflows/` and, of those, the jobs that produce the required contexts
  in `config/required-status-checks.json`.
- Required contexts, and mustBeGreen or always-run lanes outside them.
- Gate scripts under `scripts/` named `check-*`, `verify-*` or `assert-*`, and where each is
  wired (a workflow, `prebuild`, `postbuild`, lint-staged, or nowhere).
- Pinned contracts in `config/`.

### Step 3 — Findings, by kind

| Kind              | How it is found                                                                      |
| ----------------- | ------------------------------------------------------------------------------------ |
| **No reason**     | A gate whose file, workflow or config entry records no reason, owner or source PR.   |
| **Orphan**        | A gate script no workflow, package script or hook calls.                             |
| **Never red**     | A check with no failed run in the window measured (state the window and the source). |
| **Never gating**  | A check that runs on every PR but is not required and gates nothing.                 |
| **Restated rule** | The same rule written in more than one always-loaded file (quote both locations).    |
| **Stale**         | A gate that probes a retired environment, path or service, per `CURRENT_STATE.md`.   |

A check that has never been red may be doing its job. Report it as a candidate, with what it
guards, not as dead weight. CI history you could not read is `NOT_MEASURED`.

## 3. Report

```text
PROCESS AUDIT — deploy tip <short SHA>, <UTC time>
always-loaded context: <n> bytes (~<n> tokens, inference) — <largest file and its share>
on-demand context: <file — bytes>, ...
gates: <n> workflows, <n> required contexts, <n> gate scripts (<n> unwired), <n> config pins
findings:
  <kind> — <gate or rule> — cost: <what it costs> — reason on record: <quote | none> — evidence: <command or link>
not measured: <what could not be read, and why>
candidates for Matthew: <one line each: keep | consolidate | retire, with the reason>
```

The candidates are proposals, never changes. A follow-up that acts on one is its own task,
assigned by Matthew, on its own branch, with the review route its paths require
(`verdant-scope-split` §3).

This is an author-side diagnostic. It is not a review verdict and not a PASS.

---
name: verdant-loop-habits
description: Habits learned from closed Verdant slices, written back as "how to work" rules for the next feature. Load before building or reviewing a slice in src/, before marking a feature done, and when a check passes but the feature might not be wired into the app. Not governance; amend from a closed HANDOFF_LOG block or a merged PR, never by editing checks.
---

# Verdant loop habits — how to work, learned from the results file

This is the "how to work" section of the loop, the part the Karpathy-loop workflow lets a second
loop rewrite from the results of the first (`docs/agents/loop-engineering.md` §4). Each habit is a
mistake that recurred across rounds, written down with the rounds that show it, so the next
feature starts from the method that actually worked rather than rediscovering the failure.

Rules that already live in `AGENTS.md` or `CLAUDE.md` are not repeated here. Those files are
versioned governance; this one is not. It carries no `Sentinel-Version`, so an amendment is a
single-file change. See "Amending this list" at the end before adding or retiring a habit.

## Habits

### H1. Wire it in the same round that makes its checks pass

A feature whose checks pass but which nothing reaches is not done. Before marking a slice done,
name the production caller of every new module, and the screen or route a grower uses to reach
it. A pure module with passing tests and no reachable caller is a dead path, not a feature.

- **Trigger:** a new `*Rules.ts`, `*Service.ts`, hook or write path, or a new RPC wrapper.
- **Check to add:** one test that imports the caller, not only the callee; for a route, an
  `appRouteManifest` entry the manifest test cross-checks.
- **Evidence:** open Verdant-OS/verdant-grow-diary#1839 removes
  `src/lib/quick-log/createQuickLogEvent.ts`, a `quicklog_save_event` writer with no reachable
  caller, and corrects `docs/architecture-contract.md` §13 to say so (read from the PR's diff).
  Merged #1659 ("acknowledge saved diary environment evidence") and #1660 ("ground diary guidance
  in confirmed scoped evidence") are dashboard surfaces that did not reflect data already saved.
- **Label:** established fact for #1839 (diff read 2026-10-02); inference from the merge titles
  for #1659 and #1660.
- **Status:** active. Added 2026-10-02 by Claude.

### H2. Find every existing path that already does this job

When a rule changes, list every place the app already performs that job and make each one follow
the new rule in the same slice. A fix that lands on one path and leaves a sibling path on the old
behaviour passes its own checks and ships the defect through the sibling.

- **Trigger:** a change to replay, retraction, idempotency, source labelling, or any rule the
  single-write-path spec (`docs/specs/one-tent-loop-quicklog-single-write-path.md`) covers.
- **Check to add:** a test that enumerates the callers (grep-pinned, counted) and asserts each
  one routes through the shared rule.
- **Evidence:** the Quick Log replay family landed as a sequence of sibling-path fixes on the
  deploy branch, 2026-09-30 to 2026-10-01: #1735 (manual key replays), #1736 and its re-land
  #1834 (event replay after retraction), #1836 (forward-repair the replay wrapper, keep legacy
  replays), #1741 (linked diary companions edited directly), #1737 (manual history read by
  observation date). Each closed a path the previous fix did not reach.
- **Label:** inference from the merge sequence and titles; the individual diffs were not
  re-read for this entry.
- **Status:** active. Added 2026-10-02 by Claude.

### H3. Measure with the narrowest pattern, and state the method with the number

A count that a reviewer cannot reproduce is not evidence. When a claim rests on a grep, say what
was counted (import statements, not path references), the exact pattern, and the ref. Two
recorded miscounts came from a path reference counted as an import and from a `git grep` pathspec
whose `*` crossed a directory boundary.

- **Trigger:** any number in a spec, contract stamp, PR body, or CURRENT_STATE row that came from
  a search rather than a test run.
- **Check to add:** none; this is a reporting habit. Put the command next to the number.
- **Evidence:** `CLAUDE.md` › Layering records 39 vs 38 and 34 vs 33 (two `vi.mock` path
  references counted as production imports). `docs/architecture-contract.md`'s preamble records
  56 vs 55 `Date.now()` files from a pathspec that matched the nested
  `src/lib/sensor/sensorSnapshotFreshnessRules.ts`.
- **Label:** established fact (both corrections are recorded in the cited files on the deploy
  branch).
- **Status:** active. Added 2026-10-02 by Claude.

### H4. A pin renegotiation is a declared act, not a side effect

When a behaviour change needs a test's pinned string, count or expression to change, declare the
renegotiation first (`node scripts/scorer-lock.mjs --unlock <path> --reason "<why>"`), name the
pin in the commit body, and keep the test's intent. Never whole-file-format a legacy test, and
never loosen a pin to make a round pass.

- **Trigger:** the scorer lock refuses an edit, or a test fails on a string, count or snapshot.
- **Check to add:** `node scripts/scorer-lock.mjs --report --strict` in the validation ladder;
  the PR body lists each renegotiated pin.
- **Evidence:** `CLAUDE.md` › Repository operating facts ("Renegotiate pins in the same commit
  as the behavior change; never whole-file-format a legacy file") and
  `AGENTS.md` › Testing Standard. The mechanism that turns the convention into a tripwire is
  `docs/agents/loop-engineering.md` §3.
- **Label:** established fact (the rule); the tripwire's behaviour inside a live agent session
  is NOT_MEASURED until a session reports it.
- **Status:** active. Added 2026-10-02 by Claude.

## Amending this list

- **Source.** A habit is added only from a closed block in `docs/agents/HANDOFF_LOG.md` or a
  merged PR on `verdant-grow-diary`, and it cites the rounds (PR numbers or SHAs) that show the
  mistake recurring. One occurrence is an observation for the handoff log, not a habit.
- **Shape.** Every entry has a trigger, the check that would catch it next time (or "none" with
  the reason), evidence, an evidence label (`established fact`, `inference`, `source claim`), a
  status (`active` or `retired`), and who added it when.
- **Never edits checks.** Amending this list never edits, weakens or deletes a test, spec, gate
  script or required-checks pin. If a habit needs a new check, the check is a separate change
  that goes through the scorer lock like any other. A habit that could be satisfied by making a
  check easier is not a habit.
- **Graduation.** When a habit gains an enforcing check or gate, mark it `retired` with the
  gate's path and date rather than deleting it, so the history of why the gate exists survives.
- **Size.** Keep this file under twelve active habits. Beyond that, the oldest low-evidence
  entries retire first. The skill body loads on demand; its description is what stays in every
  session's context, so the description must stay one paragraph.
- **Not governance.** This file is not one of the twelve `Sentinel-Version` files. Editing it
  alone needs no parity bump and no `CURRENT_STATE.md` row; operational facts stay there.

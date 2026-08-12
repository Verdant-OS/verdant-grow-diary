---
name: hive-mind
description: Connect everything together — run a hive SITREP that fuses all agent worktrees, branch topology, the canonical deploy-branch shift report, and open PRs into one view, then derives the next few ranked decisions. Use when asked "what's next", "status across agents", "sitrep", "decision queue", "what is everyone working on", or before starting any new slice.
---

# hive-mind

The Verdant repo is operated by a hive of agents (Codex, Claude, Grok, Gemini, Security,
Council) coordinating through files: 40+ git worktrees, a deploy branch that is thousands
of commits ahead of `main`, a canonical shift report (`docs/agents/CURRENT_STATE.md`) that
is stale in most checkouts, and ~35 open PRs. The driver, `hive.mjs`, is a **read-only
sensor** that fuses all of those surfaces into one SITREP and emits a deterministic,
ranked **decision queue** — the "next few decisions" — so any agent starts a session
already knowing what the hive needs next.

It never writes, pushes, or touches other agents' worktrees beyond status reads.

All paths are relative to the repo/worktree root.

---

## Prerequisites

- Node ≥ 18 (verified on v24). No packages — plain `node:child_process` + git.
- A git checkout with `origin` fetched. Any worktree works; the driver reads canonical
  state from `origin/verdant-grow-diary`, not your local files.
- Optional, for the PR panel: `gh` CLI + a GitHub token in Windows Credential Manager.
  The driver borrows it automatically via `git credential fill` (gh is otherwise
  unauthenticated on this machine). If that fails, PRs report `BLOCKED` — honestly,
  per the status vocabulary — and everything else still works.

---

## Run (agent path)

```bash
node .claude/skills/hive-mind/hive.mjs
```

Human SITREP: your position, branch-topology truth, worktree census with in-flight/
UNPUSHED flags, canonical shift-report summary (blockers, assignments, staleness),
open PRs, and the ranked decision queue (top 5).

Machine-readable, full decision list included:

```bash
node .claude/skills/hive-mind/hive.mjs --json
```

Flags / env:

- `--fetch` — `git fetch origin` first (default trusts your last fetch; the SITREP is
  only as fresh as your remote refs).
- `HIVE_NOW=2026-08-12T07:00:00Z` — injectable clock. Same state + same clock ⇒
  byte-identical output (verified by diffing two runs).

Runtime is dominated by one `rev-list` per worktree (~45 of them) plus one `gh` call.

### Decision queue semantics

Deterministic rules engine, no model calls, no randomness. Rank bands:

| Band | Meaning | Example rules |
| ---- | ------- | ------------- |
| 0 | Safety of information | local shift report differs from deploy-branch canonical; report older than 7 days; report unreadable |
| 1 | Owner-gated blockers | blocker text says "owner must" → only Cheek can clear it |
| 2 | Agent-actionable blockers + the active approved slice | numbered blockers without owner gating; `**Active …:**` slice |
| 3 | Shipping hygiene | worktree branches that exist on no origin ref (invisible to the hive) |
| 4 | Housekeeping | ≥5 fully-merged worktrees to prune; gh auth broken |

Blockers marked `RESOLVED` in the shift report are parsed but excluded from the queue.

---

## Test

Determinism + JSON validity check (run from the worktree root; use a real Windows path,
not `/tmp` — see Gotchas):

```bash
HIVE_NOW=2026-08-12T07:00:00Z node .claude/skills/hive-mind/hive.mjs --json > "$LOCALAPPDATA/Temp/hive1.json"
HIVE_NOW=2026-08-12T07:00:00Z node .claude/skills/hive-mind/hive.mjs --json > "$LOCALAPPDATA/Temp/hive2.json"
diff "$LOCALAPPDATA/Temp/hive1.json" "$LOCALAPPDATA/Temp/hive2.json" && echo DETERMINISTIC
```

---

## Gotchas

- **Never audit `main`.** The driver prints the divergence (at authoring time: `main`
  was 5,468 commits behind `origin/verdant-grow-diary`). Every canonical read in the
  driver uses `git show origin/verdant-grow-diary:<path>` for exactly this reason.
- **Your local `CURRENT_STATE.md` is probably stale.** Worktrees branch from old
  `main`. The driver compares blob hashes and puts a band-0 decision in the queue when
  they differ — trust the SITREP's canonical parse, not your checkout.
- **`CURRENT_STATE.md` changes shape between shifts.** The parser accepts both the old
  table/numbered-list format and the current prose format (numbered blockers under
  `## Known blockers…`, bold-labeled slices under `## Current approved slices`). If a
  future rewrite empties the blockers/slice/assignments panels, the parser needs a new
  shape added — an empty panel with a non-empty canonical section is a parser bug, not
  evidence of "no blockers".
- **Regex trap that already bit this driver once:** section extraction must NOT use the
  `m` flag — with `/m`, the lazy `[\s\S]*?` before `(?=\n## |$)` stops at the first
  blank line's `$` and every section silently parses empty. Confidently-empty parses
  are worse than crashes here.
- **`/tmp` does not exist for Node on Windows.** Git Bash maps `/tmp` for shell
  builtins, but a path handed to `node` resolves against the Windows filesystem and
  fails with `MODULE_NOT_FOUND`/ENOENT. Use `$LOCALAPPDATA/Temp` or the session
  scratchpad.
- **gh is unauthenticated by default on this machine.** The driver self-serves a token
  from `git credential fill` (protocol=https, host=github.com) per session. No token →
  PR panel reports `BLOCKED` with the reason; it never invents PR data.
- **Detached-HEAD worktrees are Codex/Claude workspaces.** They appear in the census
  with `(detached <sha>)`. Read-only: never commit, reset, or clean another agent's
  worktree (standing rule).

---

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `fatal: ambiguous argument 'origin/verdant-grow-diary'` | You're in a clone without the deploy branch fetched: `git fetch origin verdant-grow-diary` |
| PR panel `BLOCKED — no credential-manager token` | Sign into GitHub in Git Credential Manager (any `git fetch` over https will prompt), or ignore — the rest of the SITREP is unaffected |
| PR panel `BLOCKED — spawn gh ENOENT` | `gh` CLI not installed; `winget install GitHub.cli` or ignore |
| Shift-report panels empty but canonical file has content | Parser shape drift — see Gotchas; update `parseState()` in `hive.mjs` |
| Slow run (minutes) | An offline network drive in the worktree list can stall `existsSync`; prune dead worktrees (`git worktree prune`) |

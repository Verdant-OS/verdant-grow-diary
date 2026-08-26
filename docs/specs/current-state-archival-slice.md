# CURRENT_STATE.md Archival Slice — Proposal

**Status: PROPOSED — NOT APPROVED. No archival may execute until Cheek approves this
spec.** This document changes nothing by itself.

**Author:** Claude (Knowledge Library and Product Specification Architect)
**Date:** 2026-08-18
**Origin:** A `/doctor` context-health pass measured the governance import chain that
every Claude session loads. This spec is the follow-up it recommended.

---

## Executive recommendation

Split `docs/agents/CURRENT_STATE.md` into a live shift report and a verbatim historical
archive (`docs/agents/CURRENT_STATE_ARCHIVE.md`). Move only entries with a **verified
terminal disposition**; never move, condense, or rewrite anything still operative. Adopt
a small ongoing policy so the file stops re-accumulating.

Measured effect (`established fact`, byte counts from the file at deploy-branch commit
`3970f31`, #1024): the file is 89,637 chars (~22.4k est. tokens, tokens ≈ chars/4),
loaded into **every session of every agent** via `CLAUDE.md`'s `@` import — and via the
equivalent bootstrap for Codex, Grok, and Gemini. Tranche 1 moves ~32.8k chars (~8.2k
est. tokens per session per agent) of terminal history. Two further sections
(~19k chars) stay put behind explicit triggers because they are still operative.

## Why now

- `practical observation`: at 89,637 chars the file exceeds Claude Code's
  large-memory-file warning threshold (~40,000 chars minimum). Beyond raw token cost,
  oversized always-loaded context degrades instruction-following on the rules that
  actually matter — the open incidents and fences this file exists to surface.
- `established fact`: roughly a third of the file is history with a terminal
  disposition — superseded attribution headers, validation evidence pinned to a commit
  69+ merges stale that the section itself says "must not be carried forward", and five
  "Completed, out of slice" records whose work is done.
- `inference`: the file's most safety-critical content (open incidents, fences,
  what-is-not-licensed text) competes for attention with resolved narrative. Archival
  makes the live warnings *more* visible, not less.

## Audit findings (measured 2026-08-18 against `3970f31`)

Sections by heading, with byte size and disposition. Line numbers are deliberately
omitted — the file changes daily; the executor must locate sections by heading text and
re-verify every disposition at execution time.

| Section | Size (chars) | Disposition | Action |
| --- | --- | --- | --- |
| Attribution header chain (the stacked "Prior update" / "Prior same-day update" paragraphs) | 10,509 total; 8,958 archivable | All but "Last updated" + the most recent "Prior update" are superseded narrative | **Tranche 1: move** |
| ⚠️ Open production incident — attributed signups | 1,552 | OPEN | **Never move while open** |
| ⚠️ Second production drift — migrations not auto-applied | 2,205 | OPEN | **Never move while open** |
| ⚠️ Migration-drift alarm never completed a measurement | 13,957 | Operative — defect 3 candidates unapproved, secret unrepaired; section carries live licensing/fence text | **Trigger-gated (see below)** |
| Branch topology | 4,960 | Live | Keep |
| DIRTY PR conflict reconciliation | 5,063 | Partially open — #913, #817, #699 still OPEN; locked rule still in force | **Trigger-gated (see below)** |
| Production status | 8,165 | Live measurements | Keep |
| Latest deploy-head validation | 5,072 | Terminal — pinned to `5611b130e81a`, 69+ commits stale; section's own text forbids carrying it forward | **Tranche 1: move** |
| Current approved slices — active slice text | 11,645 | Live | Keep |
| Current approved slices — five "Completed, out of slice" entries (2026-08-07 #586, 2026-08-11 #885, 2026-08-13 Lovable pack audit, 2026-08-15 Knowledge rewrite, 2026-08-18 cleanup sweep) | 14,532 | Terminal records of finished work | **Tranche 1: move** |
| Known blockers — items 1–5, 7, 8 | ~2,200 | Live | Keep |
| Known blockers — item 6 (release-identity resilience, "RESOLVED repo-side and verified live 2026-08-05") | ~1,900 | Terminal by its own text | **Tranche 1: move**, leave one line |
| Release-provenance runbook | 2,305 | Durable reference, not a changing fact — misfiled per the constitution's own rule ("operational facts that change" belong here) | **Tranche 1: relocate** to `docs/release-provenance-runbook.md`, leave a pointer |
| Agents currently assigned | 5,553 | Live | Keep |

Gate-compatibility findings, verified directly against
`scripts/check-sentinel-version-parity.mjs`:

- `established fact`: the checker enumerates exactly twelve governance files by literal
  path. `CURRENT_STATE.md` is checked for **existence only** (no `Sentinel-Version`
  required); a new `docs/agents/CURRENT_STATE_ARCHIVE.md` is invisible to PARITY,
  MIRROR, and BUMP. This slice therefore requires **no Sentinel-Version bump** — the
  same class of change as merged precedents #729 and #746.
- `established fact`: `CLAUDE.md` must begin with exactly the three current `@` imports
  (the checker asserts it). The archive file must **never** be added as an import —
  that is the entire point.
- `established fact` (multi-agent coordination check, 2026-08-18): no open or merged PR
  and no branch carries prior CURRENT_STATE archival work. No collision.

## Design

### The archive file

`docs/agents/CURRENT_STATE_ARCHIVE.md`, opening with a header modeled on the existing
legacy-archive pattern:

```markdown
# Verdant — Operating State Archive

> HISTORICAL RECORD — NOT ACTIVE AGENT INSTRUCTIONS
>
> Entries here reached a terminal disposition and were moved, verbatim, from
> `docs/agents/CURRENT_STATE.md`. They are evidence, not guidance. Facts are
> point-in-time as of each entry's own recorded dates. The live shift report
> remains `docs/agents/CURRENT_STATE.md`.
```

Entries are appended newest-first, each under a stamp line:
`## Archived <YYYY-MM-DD> — <original section heading>` followed by the moved text
**byte-for-byte unmodified**.

### Rules (binding on the executor)

1. **Verbatim moves only.** Never summarize, condense, or "clean up" text while moving
   it. Evidence discipline survives only if the record survives. The single permitted
   addition in CURRENT_STATE is a one-line pointer per moved section, e.g.:
   `Deploy-head validation for 5611b130e81a (2026-08-05): archived — see CURRENT_STATE_ARCHIVE.md.`
2. **Terminal-disposition test.** An entry qualifies only when all three hold:
   (a) its subject is verifiably finished (merged / closed / resolved / superseded /
   recorded housekeeping), re-verified at execution time, not trusted from this spec;
   (b) no licensing, fence, or "do not do X" text agents must still obey lives *only*
   in it — such text either stays or is quoted in the pointer line;
   (c) no active slice cites it as the live source of a fact.
3. **Open warnings never move.** Anything under a ⚠️ heading, any OPEN incident, any
   `BLOCKED`/`NOT_MEASURED` status still awaiting remediation stays in CURRENT_STATE
   in full, regardless of size.
4. **Scope fence.** The executing PR touches exactly: `CURRENT_STATE.md`, the new
   archive file, the relocated runbook file, and nothing else. No edits to any of the
   twelve versioned governance files (which would trip BUMP), no application code, no
   rewording of retained text.
5. **Conflict window.** `practical observation`: this file is edited several times a
   day and is the repo's most conflict-prone path. Execute in one small PR, rebased
   immediately before merge; if a competing CURRENT_STATE edit lands mid-flight, the
   archival PR rebases around it — the other edit wins on content, always.

### Tranche 1 — approved-on-approval, mechanical

The four "move" rows plus the runbook relocation above. Net effect:
~32.8k chars leave the live file (→ ~57k chars, ~14.2k est. tokens), minus ~0.5k of
added pointer lines. `uncertainty`: est. tokens are chars/4 estimates throughout.

### Trigger-gated future moves — NOT part of Tranche 1

- **Migration-drift alarm section** (13,957 chars): moves verbatim only when the
  ledger question is closed — probe secret repaired *and* matching name-bound (its own
  C1/C2), or the section superseded by a newer measurement. Until then it is a live
  warning; condensing it now would mean rewriting operative fence text, which this spec
  rejects.
- **DIRTY PR reconciliation** (5,063 chars): moves when #913, #817, and #699 each
  reach a terminal state. The locked rule block ("Same complete intent already on
  base → CLOSE SUPERSEDED …") is durable policy — when the section moves, that block
  relocates into the constitution's orbit or stays behind, per a one-line Cheek call
  at that time.

With both eventually moved, the live file lands at ~38k chars — under the ~40k warning
threshold. Tranche 1 alone does **not** get under it; this spec says so plainly rather
than overclaiming.

### Ongoing policy (prevents re-accumulation)

- The attribution header keeps **"Last updated" plus the single most recent "Prior
  update"**; on each edit, the displaced paragraph moves to the archive in the same
  commit.
- A "Completed, out of slice" entry moves to the archive once a later CURRENT_STATE
  edit has referenced it or 14 days have passed, whichever is first, leaving the
  one-line pointer.
- Validation-evidence tables move when their own text declares them stale ("must not
  be carried forward") and a newer measurement exists.

## Validation

Docs-only; no runtime behavior changes. The executor runs and reports exactly:

```text
node scripts/check-sentinel-version-parity.mjs   → expect PASS, 0 changed governance files
git diff --stat                                  → expect only the three permitted paths
Byte-accounting check: chars removed from CURRENT_STATE.md == chars added to archive
  (± pointer lines and archive stamps, each itemized)
Full suite / typecheck: NOT_APPLICABLE (no code paths touched) — reported as such, not as PASS
```

## Risks and rollback

- **Risk: an agent misses an archived fact.** Mitigated by rules 2(b) and 3 — nothing
  an agent must *obey* moves; only what it might *cite* does, behind a pointer.
- **Risk: merge conflict with a same-day CURRENT_STATE edit.** Mitigated by rule 5.
  Worst case, the archival PR is closed and re-cut — nothing is lost, since moves are
  verbatim.
- **Rollback:** revert the single PR. The file is reconstructed exactly.

## Unknowns / blocked

- `uncertainty`: whether Codex/Grok/Gemini bootstraps import CURRENT_STATE by size-
  sensitive mechanisms that behave differently (e.g. truncation) — the per-agent
  loading behavior outside Claude Code was not measured here. The savings claim for
  those agents is `inference` from their bootstrap files referencing the same document.
- `missing evidence`: no measurement exists of instruction-following degradation at
  this specific file size; the ~40k threshold is Claude Code's own warning heuristic,
  cited as such.

## Handoff

Per `docs/agents/HANDOFF_PROTOCOL.md`: Cheek approves or rejects this spec. On
approval, execution is a single mechanical slice suitable for Claude or Codex —
whoever is unoccupied — under the rules above. No Security Review is required
(docs-only, no schema/RLS/auth surface); QA is the validation block above.

## Verdict

Tranche 1 is a low-risk, high-certainty win: ~8.2k est. tokens returned to every
session of every agent, zero rewrites, zero gate interactions, fully reversible. The
honest limit: it does not by itself bring the file under the oversize-warning
threshold — the trigger-gated moves and the ongoing policy are what finish the job.
Approve Tranche 1 and the ongoing policy together, or the file regrows.

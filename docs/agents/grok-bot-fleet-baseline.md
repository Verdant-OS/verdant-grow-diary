# Grok Bot fleet — wake-wiring audit and handoff baseline (2026-11-05)

Read-only audit of the Ultra fleet docs as merged in #2897 (deploy tip `66134ba4ac5aed841ef882e1537a5a315e809a01`),
written on Matthew's 2026-11-05 approval to (1) prepare an exact consistency patch for the roster and
the Ultra Fixer (Brachs) instructions after verifying the wake wiring, and (3) set a baseline from the
current routine definitions and one evidenced end-to-end handoff. The §1 and §2 tables record the
state at `66134ba4`, before any fix. Matthew's 2026-11-05 answers (§4) put the §3 patch, D1, D2 and the
Projects Manager decision into the same PR (#2904); it lands only after review and Matthew's per-item yes
at the exact head, and the live bots must then re-save their descriptions and routines.

Scope limit: this session reads GitHub and the repository only. It cannot read the Grok Bot account, so
every statement about live bots or live routines is `NOT_MEASURED`.

## 1. Wake wiring — seat files against the routine table

Sources: `docs/agents/grok-bot-fleet.md` (routines R1–R6, line 75–80), `docs/agents/grok-bots/*.md`,
`docs/agents/constitution/roster.md`, `docs/agents/OWNERSHIP.md` §4.2.

| #   | Seat file says it wakes on                                                                  | Routine that delivers it                             | Verdict                                                                                                                                                                                 |
| --- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| W1  | Relay: "when Matthew types a yes in your chat" (`ultra-relay.md:7`)                         | none — chat, not GitHub                              | FAIL (doc conflict). `grok-bot-fleet.md:8` says every bot wakes on GitHub events, not chat pings. Needs Matthew's call (§4 D1).                                                         |
| W2  | Fixer (1): "REQUEST_CHANGES **or FAIL** review" (`ultra-fixer.md:7`)                        | R3: `changes_requested` only                         | FAIL. A `[VERDICT] … FAIL` posted as a comment or COMMENT review wakes nothing. AGENTS.md §13 already makes an adverse verdict a `REQUEST_CHANGES`, so the seat text over-promises.     |
| W3  | Fixer (3): "[YES] naming #N, the sha and the exact allowed edit"                            | R3: `'[YES] #' naming an edit`                       | FAIL. "Naming an edit" is not a string filter. A `[YES]` carries Matthew's verbatim words and no seat address, so the filter cannot tell an edit yes from a merge yes. §4 D2.           |
| W4  | Builder: "or a [YES] comment naming you" (`ultra-builder.md:7`)                             | R4: `[SLICE] #` only                                 | FAIL. No routine delivers it.                                                                                                                                                           |
| W5  | Steward: `[PRECHECK] #N @sha READY` (`merge-steward.md:7`)                                  | R1                                                   | PASS on wiring; FAIL on producer. OWNERSHIP §4.2 line 266 still attributes `[PRECHECK]` to retired Chemdawg; OWNERSHIP lines 23 and 66 give pre-check to Merge Readiness.               |
| W6  | Fixer (1), Relay: "on an Ultra PR"                                                          | R3, R5: "on an Ultra PR" (undefined)                 | FAIL (undefined term). R2 alone says `pr.author == verdant-ultra-bot`.                                                                                                                  |
| W7  | Fixer (2): `check_suite` failure on a `verdant-ultra-bot` PR                                | R2: `pr.author == verdant-ultra-bot`                 | `NOT_MEASURED`. `inference` from GitHub's webhook docs: a `check_suite` payload lists PR number, head and base, not the PR author, so the filter needs a lookup the routine may not do. |
| W8  | Relay LAPSED: "no GitHub activity for 24 h" (`ultra-relay.md:11`)                           | none; only R6 (daily) can observe absence            | FAIL (gap). R6's action does not mention the lapsed check.                                                                                                                              |
| W9  | Relay HANDOFF KEEPER: compares and posts `[HANDOFF]`; "do not edit another holder's branch" | R5                                                   | PASS on wiring; conflicts with roster line 41 ("keeps `docs/agents/handoffs/*.md` current", which reads as editing). §4 D3.                                                             |
| W10 | Live routines R1, R4, R5                                                                    | saved from pre-fix text (GROK-ULTRA-FLEET `gotchas`) | `BLOCKED` from this session: needs a reader of the Grok account. T5a and T9–T12 receipts do not exist, so fleet behaviour stays `NOT_MEASURED`.                                         |

Ultra Fixer instructions against the roster and `common.md`: holder `Brachs (Blueberry)` appears only in
the roster (PASS, as the fleet doc requires). Stop-point order, "never review, approve, mark ready",
and the scorer-lock BLOCKED rule agree with `common.md` and roster rules (PASS). The only Fixer defects
are W2, W3 and W6.

## 2. Baseline

### 2a. Routine definitions (as written, deploy tip `66134ba4`)

Six routines: five GitHub-event (R1–R5), one schedule (R6, 06:00 America/Chicago). Wake paths per seat:
Steward 1 (R1), Fixer 2 (R2, R3), Builders 1 (R4), Relay 2 (R5, R6) plus the chat intake in W1.
Of the ten checks in §1: 0 clean PASS; 2 PASS on wiring with a defect elsewhere (W5, W9); 6 FAIL
(W1, W2, W3, W4, W6, W8); 1 `NOT_MEASURED` (W7); 1 `BLOCKED` (W10, live state). That is the starting line; re-measure after the §3 patch and after the bots
re-save.

### 2b. One evidenced end-to-end handoff: #2856 (REPORT-INGEST-ERROR-ANNOUNCEMENTS)

Chosen because its task file is closed, names a final reviewed head, and the review session differs from
the author session. Every row below was read from the GitHub API on 2026-11-05.

| Step               | Evidence                                                                                                                                                                 | Verdict                                                                                             |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| Task file          | `docs/agents/handoffs/REPORT-INGEST-ERROR-ANNOUNCEMENTS.md`: status CLOSED, `head_sha` = `reviewer_sha` = `08a99bbb79197683f2aac56db1f7099d37907b0c`, merge sha recorded | PASS                                                                                                |
| Route              | `[ROUTE]` to Reviewer A at `f3fbafeb` (2026-11-04 08:38Z), superseded at `c0adc63b` when the head moved (09:15Z)                                                         | PASS                                                                                                |
| Ready for review   | `ready_for_review` event by `verdant-ultra-bot`, 21:53Z                                                                                                                  | FAIL against roster rule "Ultra seats never … mark ready" (set 2026-10-30)                          |
| Required checks    | 35/35 required contexts `success` at `08a99bbb` (91 runs: 84 success, 7 skipped)                                                                                         | PASS                                                                                                |
| Independent review | Review 5777453479 at commit `08a99bbb`, 23:29Z: `[VERDICT 08a99bbb…] PASS`, reviewer session `session_017UoYKyDyFmmRqwAGfNHt1d`, author session excluded                 | PASS                                                                                                |
| Per-item yes on PR | No `[YES]` or yes-bearing comment on #2856                                                                                                                               | `NOT_MEASURED` (the `[YES]`-on-PR rule began 2026-11-05; a chat yes may exist but is not on GitHub) |
| Gate order         | `added_to_merge_queue` by `cheekhimself` at 23:22:47Z, **before** the PASS review at 23:29:02Z                                                                           | FAIL: enqueued 6 min 15 s before the independent PASS existed on GitHub                             |
| Merge              | Merged through the queue 23:39:47Z as `f95bfeb84e3854f4877601350d40435fb9d197da`                                                                                         | PASS                                                                                                |
| Post-merge check   | Named in the task file (screen-reader read-out on the live build)                                                                                                        | `NOT_MEASURED`                                                                                      |

Baseline result: the handoff record itself is cold-resumable (PASS); two gate-order defects (ready by an
Ultra seat; enqueue before the PASS was posted) and one unrecorded yes. A later handoff counts as better
than this baseline only when all three are PASS on GitHub.

## 3. Consistency patch (applied in #2904)

Mechanical, sourced only from text already in the repo. Each hunk is independent.

```diff
--- a/docs/agents/grok-bots/ultra-fixer.md          (W2)
-WAKE (GitHub only): (1) a Main reviewer's REQUEST_CHANGES or FAIL review at a named sha on an Ultra PR;
+WAKE (GitHub only): (1) a Main reviewer's REQUEST_CHANGES review at a named sha on an Ultra PR (AGENTS.md §13: an adverse verdict is REQUEST_CHANGES);

--- a/docs/agents/grok-bots/ultra-builder.md        (W4)
-WAKE: a GitHub issue_comment on a PR containing "[SLICE] #N @<40-hex> -> Ultra Builder <1|2>" from the Coordinator (OWNERSHIP 4.2 parse rule: tag, #N, @sha), or a [YES] comment naming you.
+WAKE: a GitHub issue_comment on a PR containing "[SLICE] #N @<40-hex> -> Ultra Builder <1|2>" from the Coordinator (OWNERSHIP 4.2 parse rule: tag, #N, @sha).

--- a/docs/agents/OWNERSHIP.md                      (W5)
-  [PRECHECK] #N @sha READY | NOT READY (reason) | STALLED   (Chemdawg)
+  [PRECHECK] #N @sha READY | NOT READY (reason) | STALLED   (Merge Readiness)

--- a/docs/agents/grok-bot-fleet.md                 (W6, above the routine table)
+An **Ultra PR** is a pull request whose author is `verdant-ultra-bot`. R2, R3 and R5 use this definition.

--- a/docs/agents/grok-bot-fleet.md                 (W8, R6 action cell)
-| Reconciliation pass, summary, `WAITING ON MATTHEW:` line |
+| Reconciliation pass, LAPSED check (claimed task, no GitHub activity for 24 h), summary, `WAITING ON MATTHEW:` line |
```

Applied in #2904, with R3 and R6 mirrored into `grok-bot-fleet-manifest.json`. None of these files is one of the
eighteen sentinel-versioned files, so no version bump. After merge, each affected bot re-saves its
description and routine (creating or editing a routine needs Matthew's approval under the fleet's Auto
Review rules).

## 4. Decisions only Matthew can make (answers 2026-11-05)

- **D1 (W1). Decided: keep chat intake** as the one named exception to "GitHub only"; recorded in
  `grok-bot-fleet.md`.
- **D2 (W3). Decided: read the scope.** R3 wakes the Fixer on any `[YES]` on an Ultra PR; it acts only
  when Matthew's quoted scope names a repair; recorded in `ultra-fixer.md`, the R3 row and the manifest.
- **D3 (W9).** Roster line 41: does the Relay edit handoff files (on whose branch), or only check them
  and post `[HANDOFF]`?
- **D4 (W7).** Whether to keep R2's author filter or match on the head branch name pattern instead;
  needs one live drill either way. Still open.
- **Item 2. Decided: Projects Manager has no Verdant delivery seat**; recorded in the roster. D3 stays
  open.

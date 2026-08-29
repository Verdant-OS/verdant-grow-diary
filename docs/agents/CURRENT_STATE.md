# Verdant — Current Operating State

**Last updated:** 2026-08-28 UTC (~22:00 UTC)
**Updated by:** Claude (2026-08-28: **#1185 is GREEN on all 35 required contexts at `75a7de9` — the
first required verdict the header-bypass fix has had. The prior header recorded this axis as
`NOT_MEASURED`; it is now measured.** Green is not approval, and the review coverage on this SHA is
thinner than on any earlier one — see below.

**35/35 required `success` on `75a7de9`** — 32 shards, `Lint, typecheck, test, build`,
`Preflight — edge shared-lib mirror in sync`, `test:legal-seo`. All from workflow run
`33211805786` (`completed` / `success`). **Tallied context by context against the pinned mirror
`config/required-status-checks.json`, not read off the run-level conclusion** — a run summary is not
the named required set, and conflating them is how a missing context goes unnoticed. **No green was
carried forward** from `7be3d73` or `5bc6a917`.

**Non-required, recorded not laundered:**

- **`Full suite — batch 6/16` is still RED** — the `bun install` Lovable-registry 403. **15 of the
  16** batch lanes passed on this same SHA.
- **`Browser census (authenticated)` AND `(public)` both `success`.** Worth recording: the public
  lane is the one that FAILED on #1176, where non-attribution rested on an import-chain argument.
  It has now passed on three consecutive heads, which is stronger support for that argument than the
  reasoning was.
- `CodeQL` and all three `Analyze` jobs `success`; `tsc --noEmit`, `tsgo + vite build`, eslint,
  `docs-safety`, both security suites, lockfile policy, One-Tent smoke, Symptom Check E2E, sitemap
  parity, config guards, nested static proofs, both ai-doctor jobs, `node --test` all `success`.
- **All four Cursor checks `neutral`** — still BLOCKED on the usage limit, not passing.
- `Supabase Preview` `skipped` on #1185 (it is #1172 that hits the 42P07).

**THE ONE RE-RUN IS NOW SPENT.** `rerun_failed_jobs` on run `33211805866` returned **201** at
~21:55, once the workflow finished and the mechanical `403 This workflow is already running` block
cleared. This honours the public commitment in PR comment `5457954989`. **There is no second
allowance**: if `batch 6/16` fails again it is REAL, gets root-caused from its log, and does not get
a third attempt. Three other workflows installed dependencies successfully on this same SHA
(deployment preview on `75a7de9`, plus two on #1172), so a repo-wide registry outage is already
ruled out and a repeat failure means something narrower.

**GREEN IS NOT APPROVAL, and the review coverage on `75a7de9` is the thinnest of any head in this
slice.** State it plainly rather than letting 35 green ticks imply more than they do:

| Reviewer                                      | Coverage of `75a7de9`                                                                                       |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Dream Queen                                   | **None.** PASS pinned to `7be3d73`; covers neither `5bc6a917` nor `75a7de9`.                                |
| Copilot                                       | Reviewed `5bc6a917` and **found the bypass**; both threads answered and resolved. Has not reviewed the fix. |
| Codex                                         | **Reviewed `75a7de9`, no findings.** The only independent review of the fix itself.                         |
| Cursor (Bugbot / Security / Approval / Vulns) | **BLOCKED** — spend limit, all four `neutral`.                                                              |

So the header fix has had **exactly one** independent review, by a reviewer checking the fix rather
than hunting independently for a third bypass — and the one dedicated security agent that would
normally cover this is offline. That is the honest picture; it is not equivalent to the review
posture #1176 was criticised for lacking, but it is not a strong one either.

**Posture unchanged and re-verified.** #1185 `draft=true` at `75a7de9`, **OPEN — REVIEW ONLY** per
GDP; #1172 `draft=true` at `e8f6558`; **auto-merge OFF on both**; deploy tip still `7fd6a001`.
`20260827010000`, `20260826100000`, `20260825233000` and `20260813030000` all remain **NOT
applied**. #1184 parked at `b49debb9`. Nothing was readied, enqueued, merged, published, applied, or
rebased. This edit touches this file only. Prior header follows.)

**Prior update:** 2026-08-28 UTC (~21:55 UTC)
**Updated by:** Claude (2026-08-28: **`Supabase Preview` FAILED on #1172 with SQLSTATE 42P07 — and
the repo's own config predicted this failure, in writing, before it happened. The finding is a
MECHANISM GAP, not a new defect.**

**The failure**, on #1172 head `e7ef85b`:

```text
ERROR: relation "ai_credit_grants" already exists (SQLSTATE 42P07)
At statement: 0
CREATE TABLE public.ai_credit_grants (...)
```

**Not attributable to #1172.** `git diff --name-only 7fd6a001..HEAD` on that branch returns exactly
one path: `docs/agents/CURRENT_STATE.md`. **No migration, no SQL, no schema change.** This entry is
therefore being written _inside the very PR whose preview is failing_, and it still is not that
PR's failure.

**Root cause — two MERGED migrations create the same table**, both from July, both long predating
this branch:

```text
supabase/migrations/20260721103000_ai_credit_grants.sql
supabase/migrations/20260721182752_4fc51714-bc29-4044-9b91-180c065e997f.sql
```

**The repo already declares this exact pair.** `config/local-supabase-replay-compatibility.json`
carries a `compatibility_noops` entry naming both files, and its stated `reason` predicts the error
verbatim: _"Production records `20260721103000`; the later unrecorded file repeats the AI credit
grant ledger and **fails fresh replay with SQLSTATE 42P07**."_ This was known and handled, not
newly discovered.

**THE MECHANISM GAP — record this, it is the transferable part.** That config is consumed by the
**local** replay preparer, which verifies `source_sha256` and rewrites only a **disposable copy** in
a scratch workdir, leaving committed migrations untouched so the integrity gate stays green. The
hosted **`Supabase Preview`** branch is a different path entirely: supabase[bot] pushes migrations
into a hosted preview project and **does not consult that config at all**. So the same duplication
is _handled_ locally and _fatal_ on the hosted preview. A green local replay is therefore **not**
evidence the hosted preview will succeed, and a red hosted preview is **not** evidence the compat
config is wrong or missing an entry. Check which path produced the verdict before acting on it.

**Deliberately NOT fixed, and the reasons are structural:**

- **`Supabase Preview` is not a required context** — checked against
  `config/required-status-checks.json` programmatically, not from memory.
- The only real fixes are **editing a merged migration** — forbidden outright by the migration
  immutability rule and caught by the `Published migration integrity` SHA-256 gate — or changing
  hosted-preview behaviour. Neither belongs in a **parked, draft, docs-only** PR.
- GDP's standing directive is no SQL and no APPLY. Honoured: **no migration file was modified and no
  SQL was run.**

**NO re-run was spent, and that is a considered distinction from the other live failure.** Two CI
failures are open right now and they are treated differently on purpose:

| Failure                             | Nature                                                                                                             | Re-run?                                                                                      |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| #1172 `Supabase Preview` 42P07      | **Deterministic.** A duplicate `CREATE TABLE` fails identically every time; a config file predicted it in advance. | **No** — re-running would burn the allowance to observe the same error. Already root-caused. |
| #1185 `Full suite — batch 6/16` 403 | **Died at install**, before any test body ran. A re-run can genuinely change the outcome.                          | **Yes — owed and still unspent**, blocked only because the workflow was still running.       |

"Flake" is not a diagnosis in either case. The difference is whether a re-run can produce new
information, not whether the failure is inconvenient.

Recorded on the PR as comment
[5458108003](https://github.com/Verdant-OS/verdant-grow-diary/pull/1172#issuecomment-5458108003).
#1172's own PR body already noted an _inherited_ `Supabase Preview` 42P07 from an earlier cycle;
this entry adds the specific duplicate pair and the local-vs-hosted mechanism gap, which that note
did not identify.

**Posture unchanged.** #1185 draft at `75a7de9`, #1172 draft at `e7ef85b`, auto-merge off both,
deploy tip still `7fd6a001`. `20260827010000`, `20260826100000`, `20260825233000` and
`20260813030000` all remain **NOT applied**. This edit touches this file only. Prior header
follows.)

**Prior update:** 2026-08-28 UTC (~21:45 UTC)
**Updated by:** Claude (2026-08-28: **Both PRs are back to DRAFT and auto-merge is OFF. #1172 was
found READY with auto-merge ARMED — one green CI run from merging itself.** GDP directive at 21:40:
#1185 head `75a7de9` is **OPEN — REVIEW ONLY**.

**The armed auto-merge on #1172 is the finding here.** GDP's directive said "#1172 at `bdeb058`
stays draft", which presupposes it was already draft. **It was not.**

Two claims, separated by evidence grade rather than blended:

- **`draft=false` is `established fact`** — read directly from the PR list at 21:41, _before_ the
  draft conversion.
- **`auto_merge` was armed is an `inference`, not a measurement.** The `auto_merge` field was
  **never read before** `disable_pr_auto_merge` was called, so there is no direct observation of it.
  What supports it is a paired API result seconds apart: the same call **errored** on #1185
  ("Can't disable auto-merge for this pull request") and **succeeded** on #1172 ("Auto-merge
  disabled"), and GitHub errors when there is nothing to disable. Strong, but still inferred. The
  honest gap is recorded rather than smoothed over — reading the field first would have settled it,
  and that is the lesson for next time.

If the inference holds, #1172 would have **merged itself the moment required CI went green** — no
human step, no review. That is the identical mechanism this file already records for **#1169**,
which landed with **no independent review** because auto-merge fired while the handoff relay was
still pending.

#1172 was then converted to `draft=true`. Verified after by fresh read: `draft: true`,
`auto_merge: None`, head `bdeb058`, base `7fd6a001`. **No attribution is made for who armed it** —
only the state as found is recorded.

**#1185 converted back to draft.** Verified `draft=true`, head `75a7de9`, `auto_merge=None`.
`disable_pr_auto_merge` on #1185 returned "Can't disable auto-merge for this pull request"; that was
**not** treated as proof of anything, because inferring queue/draft state from an API response is a
mistake already recorded twice in this file. A fresh read confirmed `auto_merge=None`, and GitHub's
own converted-to-draft notice then stated that draft conversion removes auto-merge and merge-queue
membership — so the draft conversion, which ran first, had already cleared it. Platform-confirmed,
not inferred.

**Dream Queen has the new SHA and her PASS does not transfer.** Pinned to `7be3d73`; the head is
`75a7de9`, two moves on. Per GDP she is **not** to be pinged; the SHA reached her by another route.
#1185 is review-only until she rules on `75a7de9`.

**Deploy tip confirmed STILL `7fd6a001`** by `git rev-parse` against origin — unmoved since #1171.
**Do not APPLY `20260827010000`.** It, `20260826100000`, `20260825233000` and `20260813030000` all
remain **NOT applied**.

**Required CI on `75a7de9` is `NOT_MEASURED`** — GDP concurs. Run `33211805786`, which supplies all
35 required contexts, sat `queued` for 13+ minutes without starting: runner contention, **zero
required contexts reported, zero red**.

**`Full suite — batch 6/16` FAILED — install infrastructure, not this diff.** GDP's classification
matches the job log read independently: ~60 `403`s pulling tarballs from
`europe-west4-npm.pkg.dev/lovable-core-prod/sandbox-npm-cache/…` during `bun install`; the process
exited at dependency resolution and **no test body ran**. That lane is **not** in
`config/required-status-checks.json` (checked programmatically, not from memory). **A repo-wide
registry outage is ruled out**: the deployment-preview workflow `33211805872` installed dependencies
successfully on this **same SHA** minutes later, and reported edge-shared preflight and production
build both `success`. So the 403 is lane-scoped, not systemic.

**One re-run is OWED and UNSPENT.** `rerun_failed_jobs` on run `33211805866` returned
`403 This workflow is already running` — mechanical, not a permission problem. PR comment
`5457954989` states publicly what failed, why it is not this PR's, and that the re-run is owed; that
commitment stands even though the PR is now parked. **If the re-run fails a second time it is REAL**
and gets root-caused, not re-run again — "flake" is not a diagnosis, and the successful install on
the same SHA removes the easy excuse.

**Parked and verified draft:** #1184 at `b49debb9` (`draft=true`), still parked until #1185 lands.
Noted but deliberately untouched because it was outside the directive: **#1170 is `draft=false`** at
`393dbcdc`. Flagged here rather than acted on.

**Nothing was readied, enqueued, merged, published, applied, or rebased.** Every change in this
entry is de-escalating: two PRs to draft, one auto-merge disarmed. This edit touches this file only.
Prior header follows.)

**Prior update:** 2026-08-28 UTC (~21:25 UTC)
**Updated by:** Claude (2026-08-28: **Copilot found a SECOND secret-leak bypass on #1185, it was
real, and a dedicated security agent had already passed the leaking SHA clean.** Fixed in
`75a7de9`. The independent-review picture below is worse than the prior header implied.

**The finding.** Copilot's review of #1185 reported that the env `NAME=value` rule still ran after
the header rules. Treated as a bug report and **proven by execution on the untouched deploy tip
`7fd6a001`** before any change — so it is `established fact`, and it **pre-existed this PR** rather
than being introduced by it:

```text
Bearer MY_PASSKEY_VAR="s3cretV4lue"          -> [REDACTED]="s3cretV4lue"     LEAKS
Authorization: MY_PASSKEY_VAR="s3cretV4lue"  -> [REDACTED]"s3cretV4lue"      LEAKS
Bearer SOME_PLAIN_NAME="s3cretV4lue"         -> [REDACTED]="s3cretV4lue"     LEAKS
```

**It is wider than Copilot reported.** Two distinct mechanisms destroy the env NAME before the
`NAME=value` rule can match, after which the VALUE survives:

1. **FRAGMENTING** — a bare-word label rule rewrites the label inside the NAME. This is what the
   first commit on #1185 fixed.
2. **CONSUMING** — a header rule swallows the whole following token, NAME included. Both the
   `Bearer` rule and the `Authorization` rule do it. Not fixed by the first commit.

The consuming case needs **no credential label in the NAME at all** — the third line above is a
plain `SOME_PLAIN_NAME` — so it is strictly wider than the fragmenting case, and wider than the
review described. Copilot also called the mechanism "fragmenting"; measurement says consuming. The
distinction is recorded because it changes where a reader looks.

**Fixed in `75a7de9`** — the env rule moves above the header rules as well as the label rules. Same
reorder shape, **no new pattern, no new file, no schema**. RED **18 failed / 33 passed (51)** with
the final tests against the untouched module; GREEN **51/51**; direct consumers 262 passed / 3
skipped; `ecowitt`+`sensor` sweep **445 files, 6079 passed / 4 skipped / 0 failed**; `tsc --noEmit`
and eslint clean. **No new redaction breadth**: ten regression inputs (real bearer tokens,
`Authorization:` headers, lowercase telemetry, bare labels, prose) produce **byte-identical** output
before and after; only the nine leaking header-prefixed cases changed.

**THE SECURITY-AGENT MISS — record this, it is the most transferable finding here.** The
`Cursor Automation: Find vulnerabilities` agent reviewed `5bc6a917` and reported
**"no medium/high/critical vulnerability found in the current PR diff"**, stating the reorder
"removes the demonstrated value-survival path". **That SHA still leaked**, proven by execution
twenty minutes later. Its own review text explains the miss: it probed exactly four inputs —
`SUPABASE_SERVICE_ROLE_KEY`, `MY_PASSKEY_VAR`, `SERVICE_ROLE_SECRET`, and a plain env pair — **all
bare, none header-prefixed**. It tested the mechanism that had been fixed and not the one that had
not. To its credit it declared its own gap honestly (`Local Vitest: BLOCKED`, no `node_modules`).
The lesson is `practical observation`: **a green verdict from that agent is not coverage.** On this
PR a dedicated security reviewer returned clean on a live secret leak and a general code reviewer
caught it. Do not treat its PASS as evidence a redaction path is sound.

**Cursor Bugbot is `BLOCKED`, definitively.** All four Cursor checks completed `neutral` within
~1 second at 21:16:04 on `75a7de9`, and Bugbot commented **"Bugbot couldn't run — usage limit
reached"**. The "Low Risk" summary appended to the PR body was a body annotation, **not** a
finding-level review. Earlier entries in this file claimed Bugbot's status three different ways and
each was wrong; this one is from Bugbot's own check conclusion plus its own comment. **There is no
Cursor review of the `75a7de9` fix at all.**

**Codex reviewed `75a7de9` and found nothing** — completed 21:18:58, triggered by the new commit.
Confirmed two ways: no new review threads, and no Codex entry in `get_reviews` (it comments only
when it has suggestions). It is the **only** independent reviewer that actually ran on the fix. One
reviewer, reviewing the fix — not a consensus, and not an independent hunt for a third bypass.

**Head history, all verified from git.** `7be3d73` → `5bc6a917` → `75a7de9`.
`5bc6a917` is a **MERGE** commit (parents `7be3d73` + `7fd6a001`), author "Verdant", 20:48:00Z —
**not a rebase and not Claude's action**; the slice content was untouched by it
(`git diff 7fd6a001..5bc6a91` hashes identical to `git diff db0187b..7be3d73`). `75a7de9` is
Claude's push of the header fix. **Cheek marked #1185 READY at 20:47:53** — the author's own call;
the "stay draft" fence bound Claude, not Cheek.

**Dream Queen's PASS covers NONE of the current head.** It was pinned to `7be3d73`, now two heads
back. The prior header said this slice "closes the independent-review requirement #1176 shipped
without" — **that is no longer true of the shipping SHA** and is corrected here. Per GDP's standing
instruction Dream Queen has **not** been pinged about either move.

**CI on `75a7de9`: `NOT_MEASURED`.** At 21:25 **zero of the 35 required contexts had reported** —
all queued. **Zero red.** Non-required completed: `docs-safety`, `Config guards`, `node --test`,
`Analyze (python)` all `success`; `CodeQL` `neutral`; `Supabase Preview` and the irrigation/
stabilization jobs `skipped`. No green may be carried forward from `7be3d73` or `5bc6a917`.

**The leak is LIVE on the deploy branch.** It pre-exists #1185, so `7fd6a001` still leaks today.
#1185 closes it; if #1185 does not land, the exposure remains.

**Still parked, explicitly not in this slice:** the three handoff questions; the mixed-case /
spaced `NAME = value` P2 (pattern stays uppercase-only, no `\s*` around `=`); the rest of
`SECRET_PATTERNS`, still **un-audited** for further ordering defects — `NOT_MEASURED`, and fixing
**two** instances is not evidence the class is gone; #1184's rebase.

**A merge is not a deployment. No publish was performed and none is authorized.** `20260826100000`,
`20260825233000`, `20260813030000` and `20260827010000` all remain **NOT applied** — note that
`20260827010000` now appears on this branch via the base-branch merge `3e6b64c`, which is committed
history arriving from the deploy branch, **not** an APPLY. #1185 is ready but **not enqueued and not
merged by Claude**; no SQL, no APPLY. This edit touches this file only. Prior header follows.)

**Prior update:** 2026-08-28 UTC (~20:40 UTC)
**Updated by:** Claude (2026-08-28: **#1185 has an independent-reviewer PASS on `7be3d73`, is green
on all 35 required contexts at that SHA, and is `mergeable_state: clean`. It remains draft.**

**Dream Queen PASSed `7be3d73e19ce297837f00ec0f60896d895721ce5`.** Recorded as a `source claim`,
relayed by GDP at ~20:40 — **not** independently verified. `get_reviews` on #1185 returns `[]`,
which is expected because Dream Queen reviews in **Cursor, not GitHub**, so there is no GitHub
artifact to check it against. It is recorded as relayed rather than measured. This closes the
independent-review requirement that **#1176 shipped without**, which is the entire reason this
cleanup slice exists.

**#1185 was rebased onto `db0187b` (#1173); head is now `7be3d73`,** previously `5f75806`. The diff
is **byte-identical** against the new base — verified by tree hash (`24c657f3…`) and by
`git diff db0187b..HEAD`, not assumed. Another session had already pushed the identical rebase;
`--force-with-lease` correctly rejected the duplicate this session produced (`4e1c18f`), and that
duplicate was **discarded rather than force-pushed**, since the trees matched and pushing would have
churned the SHA for zero content change.

**GREEN on all 35 required contexts at `7be3d73`** — 32 shards, `Lint, typecheck, test, build`,
`Preflight — edge shared-lib mirror in sync`, `test:legal-seo` — all from workflow run
`33206645055`, started 20:04, **the post-rebase run**. Tallied against the pinned mirror
`config/required-status-checks.json` (35 entries), not from memory. The earlier green on `5f75806`
is **not** carried forward: green is SHA-pinned exactly as a verdict is.

**`Browser census (authenticated)` has since completed `success`,** resolving the `NOT_MEASURED`
recorded in the prior header. **Its one confirming re-run is now SPENT** — a future red on this SHA
cannot be waved off as a flake. `Browser census (public)` passed again, and `CodeQL` finished
`success` after reading `neutral` on an earlier poll. Every non-required job on the head is now
green; `mergeable_state` is `clean`.

**Deploy tip moved again: `db0187b` → `7fd6a001` = #1171,** `fix(sensor): fail closed on malformed
source detail`. Verified from `git log` on the deploy branch, not from a notification. **Not
Claude's slice**; its contents are known here only from `git show --stat`
(`sensorSnapshotFreshnessRules.ts` plus `sensor-snapshot-edge-cases.test.tsx`, +80/−12) and no claim
is made about its internals. **No file overlap with #1185**, and `git merge-tree` reports **zero
conflict markers** against `7be3d73`. **GDP's instruction is explicit: do NOT rebase #1185 onto
`7fd6a001`.** The base stays `db0187b`, one commit behind, with no conflict.

**Correction, recorded rather than quietly dropped.**
[PR comment 5457478650](https://github.com/Verdant-OS/verdant-grow-diary/pull/1185#issuecomment-5457478650),
posted 20:33, asserts "the re-review is still open" and asks Dream Queen to re-establish the verdict
on `7be3d73`. GDP classified that premise as **wrong** — the PASS already covered `7be3d73`. The
comment **stands uncorrected on the PR**; a retraction was offered to Cheek and deliberately **not**
posted, because the standing instruction is not to ping Dream Queen. This is the **second** time in
this sequence a claim about review state was asserted and then walked back (the first was the Bugbot
status on #1176). The pattern is the same both times: inferring review state instead of waiting for
the relay. Recorded so the pattern is visible, not just the individual errors.

**Parked, not done — none of this is in #1185.** The three handoff questions stay open as leftovers:
reorder vs. **anchoring** the bare-word label rules so they cannot match inside a longer NAME;
whether #1176's now-redundant local `ENV_PAIR_PATTERN` pre-pass in `sensorDiagnosticsExportRules.ts`
is removed or kept as defence in depth; and whether the **narrowed two-rule reading** holds. The
mixed-case / spaced `NAME = value` P2 is likewise **not absorbed** and stays a separate slice — the
pattern remains uppercase-only with no `\s*` around `=`. The **rest of `SECRET_PATTERNS` remains
un-audited** for further ordering defects of the same class: `NOT_MEASURED`. Fixing one instance is
not evidence the class is gone. **#1184's rebase stays PARKED** until #1185 lands.

**A merge is not a deployment. No publish was performed and none is authorized.** `20260826100000`,
`20260825233000`, `20260813030000` and `20260827010000` all remain **NOT applied**. #1185 stays
draft — no ready, no enqueue, no merge, no publish, no SQL, no APPLY. #1172 stays draft. This edit
touches this file only. Prior header follows.)

**Prior update:** 2026-08-28 UTC (~20:00 UTC)
**Updated by:** Claude (2026-08-28: **#1185 is GREEN on all 35 required contexts at `5f75806`** —
32 shards, `Lint, typecheck, test, build`, `Preflight — edge shared-lib mirror in sync`,
`test:legal-seo`. All 16 batch lanes green, plus CodeQL and all three `Analyze` jobs, eslint, tsc,
tsgo+vite build, docs-safety, both security suites, lockfile policy, One-Tent smoke, Symptom Check
E2E, sitemap parity, validate, config guards, nested static proofs, both ai-doctor jobs, node --test,
and the deployment preview pipeline. **Clean on the first attempt** — no red at any point, in
contrast with #1176's three commits.

**Non-required, recorded not laundered.** `Supabase Preview` **cancelled** — supabase[bot] posted
that #1185 is ignored for project `bzatgtgjvuojpoxcknaa` because the concurrent preview-branch limit
was reached; account quota, not a code defect. **`Browser census (public)` PASSED** — worth
recording because that is the lane that FAILED on #1176, which independently supports the
import-chain reasoning used there to conclude those census failures were not diff-attributable.
`Browser census (authenticated)` was still `in_progress` at 20:00 — **NOT_MEASURED**, not a pass;
its one confirming re-run is unspent. Cursor Bugbot / Approval Agent may still withhold on the
unresolved spend limit.

**Deploy tip moved again: `872741af` → `db0187b` = #1173,**
`fix(quicklog): trim fail-closed idempotency on activity-save manual route` — this is the slice the
board named **Slice 3**. Recorded from git log on the deploy branch. **Not Claude's slice**; its
contents are known here only from `git show --stat` (`useQuickLogActivitySave.ts` plus two test
files, +26/−7) and no claim is made about its internals. It touches a **different module** from
#1185, so there is no collision and no competing implementation.

**#1185's base is now one commit behind** (`872741af` vs `db0187b`). No conflict is flagged and the
files do not overlap, so the base was deliberately **not** merged in — an unnecessary merge would
invalidate the green run for no benefit. Re-verified at the new tip that the defect is **still
present**: `/PASSKEY/gi` at line 79 still precedes the env `NAME=value` rule at line 100, so the fix
remains needed.

**Independent reviewer: Blue Dream, ASSIGNED — NO VERDICT YET.** Handoff for `5f75806` posted 19:45
as [PR comment 5456996334](https://github.com/Verdant-OS/verdant-grow-diary/pull/1185#issuecomment-5456996334).
#1185 is deliberately held as **draft with no auto-merge path**, so reviewer silence cannot ship it
the way it shipped #1176. Green CI is **not** approval and is not being treated as such.

**A merge is not a deployment. No publish was performed and none is authorized.** `20260826100000`,
`20260825233000`, `20260813030000` and `20260827010000` all remain **NOT applied**. #1185 stays
draft — no ready, no enqueue, no merge. #1172 stays draft. This edit touches this file only. Prior
header follows.)

**Prior update:** 2026-08-28 UTC (~19:45 UTC)
**Updated by:** Claude (2026-08-28: **#1179 merged and the upstream `sanitizeReportText` ordering
defect is now open as draft [PR #1185](https://github.com/Verdant-OS/verdant-grow-diary/pull/1185).**

**Deploy tip moved twice more.** `a76e73ad` (#1176) → **`872741af`** = #1179,
`fix(sensors): fail-closed validation-panel raw-payload value redaction`. Recorded from git, not
from a notification: `git log` on the deploy branch. **#1179 is not Claude's slice** — its contents
are known here only from `git show --stat` (`ecowittValidationEvidenceRules.ts`, its
`supabase/functions/_shared` mirror, and one test, +208/−18). No claim is made about its internals.
Checked for collision before starting #1185: #1179 touched a **different** module, so there is no
competing implementation of the same fix.

**#1185 — the leak that #1176 could only fence.** Branch
`claude/sanitize-report-text-env-pair-ordering`, cut from `872741af`, head **`5f75806`**. Two files:
`src/lib/ecowittLocalForwardingStatus.ts` (reorder only) plus 10 tests in the existing
`ecowitt-forwarding-report-export` suite. `SECRET_PATTERNS` ran `/PASSKEY/gi` and the assembled
admin-role marker as **bare-word** rules BEFORE the env `NAME=value` rule; those rules rewrite the
label anywhere in the string, including inside an env NAME, so such a pair had its name fragmented
first and the fragmented name no longer satisfied `[A-Z][A-Z0-9_]{2,}=` — the VALUE survived.

**Proven by execution on the untouched tip `872741af`**, `established fact`, not inferred:
`SUPABASE_SERVICE_ROLE_KEY="s3cretV4lue"` → `SUPABASE_[REDACTED]_KEY="s3cretV4lue"` (**leaks**);
`MY_PASSKEY_VAR="s3cretV4lue"` → `MY_[REDACTED]_VAR="s3cretV4lue"` (**leaks**);
`SOME_PLAIN_NAME="s3cretV4lue"` → `[REDACTED]` (correct). It leaks through **both**
`sanitizeReportText` and the deep `sanitizeReportValue` path, so it reached the forwarding-report
export and `normalizeLocalForwardingStatus`, not merely free-form text.

**Scope correction — earlier entries in this file over-stated it.** Prior blocks implied any
credential label inside a NAME would trigger this. Measurement says **only the two bare-word rules
do**: `Bearer` requires trailing whitespace and never matches `MY_BEARER_VAR=`, and that list
contains no bare `token` rule. `MY_TOKEN_VAR=` and `MY_BEARER_VAR=` were always safe. Treat the
narrower statement as correct and the earlier wording as superseded.

**Exposure window, stated plainly.** The defect was surfaced by a failing test during #1176 and
fenced there **for the diagnostics export only**. It has been live on the forwarding-report path
from `a76e73ad` (#1176's merge) until #1185 lands. That is a production surface, not a pre-merge
note.

**Validation at `5f75806`.** RED then GREEN with the final test files, reverting **only** the
production module: **10 failed / 22 passed → 32/32**. Direct consumers of the module (4 suites)
**243 passed / 3 skipped**. Broad `*ecowitt*` + `*sensor*` sweep **435 files, 5902 passed / 4
skipped / 0 failed**. `tsc --noEmit` and scoped eslint clean. **Not run locally and stated as such:**
`bunx vitest run` (full) and `bun run build` — CI gates both. The module is **not** mirrored into
`supabase/functions/_shared` (checked), so there is no edge-sync obligation.

**Independent reviewer: Blue Dream, ASSIGNED** by Cheek on this slice, with the `HANDOFF_PROTOCOL`
block for `5f75806` posted as
[PR comment 5456996334](https://github.com/Verdant-OS/verdant-grow-diary/pull/1185#issuecomment-5456996334).
Owner Claude, reviewer Blue Dream — different peers, as the standing rule requires. **This is a
deliberate contrast with #1176, which merged with no independent review at all.** Three questions
were put to the reviewer rather than decided unilaterally: whether a reorder is the right shape or
the bare-word rules should instead be anchored so they cannot match inside a longer NAME; whether
#1176's now-redundant local `ENV_PAIR_PATTERN` pre-pass should be removed (left in as defence in
depth rather than widening the slice); and confirmation of the narrowed two-rule reading, on which
the whole test set rests. **The rest of `SECRET_PATTERNS` was NOT re-audited** for further ordering
defects of the same class — only the proven case was in scope. That audit is unassigned and
`NOT_MEASURED`.

**A merge is not a deployment. No publish was performed and none is authorized.** `20260826100000`,
`20260825233000`, `20260813030000` and `20260827010000` all remain **NOT applied**. #1185 stays
draft — no ready, no enqueue, no merge. #1172 stays draft. `Supabase Preview` on #1185 is **ignored**
(supabase[bot]: the connected project hit its concurrent preview-branch limit) — an account quota,
non-required, not a code defect. The Cursor spend limit blocking Bugbot's finding-level runs is
still unresolved. This edit touches this file only. Prior header follows.)

**Prior update:** 2026-08-28 UTC (~19:05 UTC)
**Updated by:** Claude (2026-08-28: **#1176 MERGED — deploy tip is now `a76e73ad`** (squash of the
fail-closed diagnostics export body redaction at head `789294c6`; prior tip `52c8abe2` = #1162).
Verified against the deploy branch, not from a notification: `git ls-remote` shows
`a76e73ad748d06bfee155c10136956d37d80ce61  refs/heads/verdant-grow-diary`, subject
`fix(sensors): fail-closed diagnostics export body redaction (#1176)`, and the merge queue is empty.
This block **supersedes** the prior block's line "#1176 stays draft, out of the queue, pending Blue
Dream" — that is now false.

**INDEPENDENT REVIEW GAP — this one is real, and it is NOT the #1169 case.** The prior block's
directive "do not record a pre-merge review gap" is about **#1169**, where Blue Dream DID review
`c84a8330` PASS in Cursor. **Do not read that directive across to #1176.** For #1176:

- The `HANDOFF_PROTOCOL` block naming `789294c6` was posted at 18:02 as
  [PR comment 5456019137](https://github.com/Verdant-OS/verdant-grow-diary/pull/1176#issuecomment-5456019137),
  **61 minutes** before the merge. **Blue Dream returned no verdict.**
- The Cursor **Approval Agent** explicitly declined at 18:28: "Not approved: Cursor Bugbot skipped
  (incomplete) and Cursor Security Agent: Security Reviewer stayed pending after the 8-minute wait.
  Human review is needed; no additional reviewers were assigned."
- It merged anyway at ~19:03. **The constitution's standing rule — "No code ships without peer
  review"; an owned slice without a named independent reviewer is incomplete — was NOT satisfied.**
  Owner: Claude. Independent reviewer: **Blue Dream, never rendered.** Any Blue Dream verdict on
  this slice is now a **post-merge** read.
- No automated finding-level review covered it either: Bugbot's _summary_ completed but its
  finding-level run was **skipped/incomplete**, and the Cursor **Security Agent stayed pending** past
  its 8-minute wait — on a diff whose entire subject is secret redaction.

**A brake that did not hold — measured, and it corrects a belief this session acted on.** The merge
commit `a76e73ad` is the **same SHA** as the `gh-readonly-queue/verdant-grow-diary/pr-1176-52c8abe2…`
ref created by the 18:29:47 enqueue. That queue entry therefore **survived** the draft conversion at
18:30:33. GitHub's own conversion notice asserts that converting to draft removes auto-merge and
merge-queue membership; **on this evidence it did not**, or the queue had already built the commit
and proceeded regardless. Treat `draft: true` as **insufficient** proof of queue eviction; the
authoritative signal is the deploy tip.

**Automation timeline, for the record.** `cursor[bot]` marked #1176 ready + enqueued it at 18:05;
Claude converted to draft at 18:06; ready again 18:17 and 18:17 (within ~16s of each revert), at
which point the revert loop was abandoned as unwinnable and put to Cheek. An enqueue between 18:17
and 18:29 was **missed by the 20-minute queue-ref poll** — a cycle can open and close inside the
polling gap, so that poll is a confirmation, never a detector. `cursor[bot]` dequeued at 18:29:30
(after the Approval Agent declined), re-enqueued at 18:29:47, Claude braked at 18:30:33, `cursor[bot]`
re-readied at 18:30:51. Cheek accepted ready as the resting state at ~18:19 ("leave it ready, watch
for enqueue") and **disabled the Cursor automation at 18:33**. Merged ~19:03.

**What actually shipped.** All **35 required contexts GREEN** on `789294c6`; all 16 `Full suite`
batch lanes green (3/16 green on its one sanctioned re-run after a `bun install`
`object-assign` tarball-integrity death that killed it before any test body ran); deployment preview
verified on that exact commit. `Browser census (authenticated)` was red at
`core-link-form-census.spec.ts:2092` (30-minute timeout, `/tents/:tentId` never rendered `<main>`) —
**non-required**, and established not-this-PR's by enumerating the import chain: the changed module
has exactly one production importer, `SensorsTestbenchPanel.tsx`, reached only from `Sensors.tsx`,
which is not on the `/tents/:tentId` render path. Its one confirming re-run was spent.

**Still open after the merge.** The upstream ordering defect in
`ecowittLocalForwardingStatus.sanitizeReportText` is **NOT fixed** — its credential-LABEL rules run
before its env `NAME=value` rule, so a pair whose NAME carries a label has the name fragmented and
the VALUE survives. #1176 fenced this inside the diagnostics module only; **the same value still
leaks on the forwarding-report path today.** Unassigned, and now a live production surface rather
than a pre-merge note. Also unresolved: the **Cursor usage/spend limit** blocking Bugbot's
finding-level runs (a `source claim` read off check and comment output, never a measured billing
fact), and the three open questions put to Blue Dream that no one answered — credential-vocabulary
scoping breadth, the `buildRedactedPayloadPreview` tent-id trade-off, and whether the depth-8
ceiling is generous enough (**no real-world body was sampled — `NOT_MEASURED`**).

**A merge is not a deployment. No publish was performed and none is authorized.** `20260826100000`,
`20260825233000`, `20260813030000` and `20260827010000` all remain **NOT applied**. #1172 stays
draft. #1170, #1171, #1153, #1151 untouched by this slice. This edit touches this file only. Prior
header follows.)

**Prior update:** 2026-08-28 UTC (~18:33 UTC)
**Updated by:** Claude (2026-08-28: **fail-closed diagnostics export body redaction delivered as
draft [PR #1176](https://github.com/Verdant-OS/verdant-grow-diary/pull/1176).** Board-fact leftover
on this same block only: Blue Dream DID review #1169 at `c84a8330307afca0891706ce5369bf703d9085ef`
in Cursor before auto-merge. Verdict PASS. Do not record a pre-merge review gap; empty GitHub
reviewer list is by design; do not request a post-merge review of squash `22c1242c`. #1170 head
`5e40307c15a3f6f6a77f69dbbb4c33a2f83fc90e` (test-only unknown/transport save-gate pin after product
PASS at `48828dd`; stay draft). #1171 draft `e73ca6c760aebdb891477cdcdf12ae254e6562c3` (Blue Dream
PASS; `safeSourceDetail` fail-closed; stay draft). Slice 3 is **named** (trim leftover on the merged
manual-route idempotency key), not parked. Cursor spend / Bugbot withhold labelled as claimed from
the #1169 checks, not a newly measured billing fact — this #1176 delivery is the diagnostics-export
follow-up, not Slice 3. Branch
`claude/sensor-diagnostics-export-fail-closed-redaction`, cut from deploy tip `52c8abe2` (#1162),
head **`789294c6`**. Three files: `src/lib/sensorDiagnosticsExportRules.ts` plus its two existing
suites, +392/-9. **Branch deviation, stated:** the harness-designated branch was
`claude/trustbadge-attachable-strip-2441l2`, which is #1170's branch and moved remotely to
`5e40307c15a3f6f6a77f69dbbb4c33a2f83fc90e` mid-session; pushing there would have collided with
#1170, so a new branch was cut and #1170's pointer was left untouched.

**The hole, proven by execution on the untouched tip — `established fact`, not cited from this
file.** At `52c8abe2` with the production module unmodified, each shape was placed in
`latest_test_result.body` and the export read back: **8 of 8 leaked verbatim** — MAC
`AA:BB:CC:DD:EE:FF`, bare 12-hex `AABBCCDDEEFF`, UUID, 64-char hex digest, `sk-` key, env
`NAME="value"` pair, JWT, `Bearer` header. All four body paths were affected
(`diagnosticsExportToJson`, `diagnosticsExportToText`, `redactedResponseBodyJson`,
`buildRedactedPayloadPreview`), as were run-history item bodies and the `buildSafeResponseInspector`
string previews. Malformed bodies **threw** rather than degrading: circular and `BigInt` bodies
crashed both export builders, and `buildRedactedPayloadPreview(undefined)` threw a `TypeError`.

**Fix.** Untrusted bodies now pass through the same secret-VALUE class the forwarding-report export
uses — `sanitizeReportText` is **called, never re-declared**, so the two paths cannot drift. Cycles,
nodes past depth 8, and non-serializable values collapse to `EXPORT_BODY_UNAVAILABLE`; serialization
failures no longer throw. A repeated _sibling_ reference still renders — only a true ancestor cycle
is unusable. Redaction is deliberately **body-scoped**: the envelope (tent id, endpoints, token
prefix, `env_match` labels) keeps its existing treatment and a test pins that it survives.
`sensorSourceRules.ts`, `sensorSnapshotFreshnessRules.ts`, `ecowittLocalForwardingStatus.ts` and the
QuickLog save hooks are untouched. No new alias table, no SQL, no schema.

**Two defects surfaced, both proven before fixing — and two of the three rounds were Claude's own.**
(1) `a33d96fa` went red on **three required shards** (1/32, 8/32, 17/32) **and required
`Lint, typecheck, test, build`**, plus non-required batch lanes 5/16, 12/16, 14/16 — all ONE cause:
the ordering-fence doc comment spelled a privileged env-var name literally, which the `src/`
static-safety guards forbid outside test files (they strip quoted string and regex literals, not
plain comments). Fixed comment-only in `5b2c1cf5`; the repo idiom is to assemble that name at
runtime, as `sensorIngestTestResultRules.ts` and `ecowittLocalForwardingStatus.ts` already do.
(2) cursor[bot] raised a **medium-severity secret-leakage** finding on `5b2c1cf5`: the env-pair
fence was ALL-UPPERCASE only, so `api_key=secretvalue`, `my_secret=…`, `Api_Key=…`, `password=…`,
`bridge_token=…` inside a response string **VALUE** reached the export intact (object _keys_ were
already masked; a pair inside a value is what key masking never sees). Verified true by probe — 5 of
7 cases leaked — then fixed in `789294c6` with case-insensitive credential-pair scrubbing across `=`
and `:`, scoped to the credential vocabulary so benign telemetry (`temp_f=77.4`, `inserted=1`)
survives. The vocabulary is now declared once and shared with `SENSITIVE_KEY_RE`. Thread replied to
and resolved.

**Validation, exact.** RED then GREEN, both measured with the final test files by reverting **only**
the production module: 13 failed / 19 passed → 32/32 for the first fix; 15 failed / 21 passed →
36/36 for the case-insensitive work. Twelve related suites 194/194. All 331
static-safety/security/audit guard suites **4515 passed / 19 skipped / 0 failed**. Targeted sensor
sweep 329 files **4798 passed / 3 skipped**. v0 operating-loop contract 26/26. `tsc --noEmit` and
scoped eslint clean. **Not run locally and stated as such:** `bunx vitest run` (full) and
`bun run build` — CI gates both. One methodology note recorded rather than hidden: a first RED
attempt stashed the tests along with the fix and proved nothing; it was redone reverting only the
production file.

**CI at `789294c6`: all 35 required contexts GREEN** — 32 shards, `Lint, typecheck, test, build`,
`Preflight — edge shared-lib mirror in sync`, `test:legal-seo`. Deployment preview pipeline verified
on this exact commit (edge-shared preflight, typecheck, production build all `success`).

**Non-required, recorded not laundered.** `Full suite — batch 3/16` FAILED inside
`bun install --frozen-lockfile` with `Integrity check failed for tarball: object-assign` — it died
**before any test body ran**, the one sanctioned re-run case. That single re-run is **spent** (a
first attempt at 17:41 returned 403 "workflow is already running"; it succeeded at ~17:50) and its
outcome is now **measured, superseding the earlier `NOT_MEASURED`**: the re-run **PASSED** on the
same commit and the same code, confirming the failure was the install and not the diff. All 16 batch
lanes are green. `Supabase Preview` skipped (connected project at its concurrent preview-branch
limit).

**`Browser census (authenticated)` FAILED** on `789294c6` at `core-link-form-census.spec.ts:2092`:
`/tents/:tentId` never rendered `<main>` and the 30-minute whole-test timeout blew (1 failed, 2
passed — the other two authenticated census tests passed in 16s and 26s). Non-required. **Not this
PR's, established by enumerating the import chain rather than asserted:**
`sensorDiagnosticsExportRules` has exactly one production importer, `SensorsTestbenchPanel.tsx`,
which is imported only by `Sensors.tsx` — not on the `/tents/:tentId` render path — and the diff
touches no route, manifest, link, form, auth redirect, or app-shell code. The sibling lane failed on
#1169 at line 2080 of the same spec with an unrelated diff, so this spec has now produced
timeout-class failures on two unrelated PRs. One confirming re-run spent at ~18:21; a second failure
would be real, and still unattributable to this diff without a mechanism.

**Cursor Bugbot — the signal is inconsistent, and that is the honest state.** A PR-body review for
`789294c6` is present and was later expanded ("Medium Risk", independently naming the
shared-sanitizer fencing as its caveat), while **three** separate comments posted "Bugbot couldn't
run — usage limit reached" (18:05, 18:17, 18:17). Do **not** record either that a finding-level
review definitely ran or that it definitely did not — this file claimed each in turn and each was
wrong. What holds: **no Bugbot finding is currently open against `789294c6`**, and the usage/spend
withhold is a `source claim` claimed from the #1169 checks (read off check and comment output),
**not a newly measured billing fact**. Unresolved; an account issue, not a code defect.
**Resolved at 18:28 by a better source:** the
Cursor **Approval Agent** posted "Not approved: Cursor Bugbot skipped (incomplete) and Cursor
Security Agent: Security Reviewer stayed pending after the 8-minute wait. Human review is needed."
That reconciles every observation — the PR-body block is Bugbot's _summary_, which completed, while
the _finding-level_ review was **skipped/incomplete**. So the finding-level review did **not** run on
`789294c6`, no Bugbot finding is open, and the Approval Agent is **withholding approval**, which is
protective rather than a defect. Human review remains the gate.

**An automation fought the standing draft-only order.** At 18:05 **cursor[bot]** marked #1176 ready
for review **and enqueued it into the merge queue** on its own — Blue Dream had received the handoff
three minutes earlier with no verdict. Claude converted it back to draft at 18:06; GitHub's own
notice confirms the conversion removed auto-merge **and** queue membership and will not restore
either. The `gh-readonly-queue/verdant-grow-diary/pr-1176-52c8abe2…` ref still exists but is a
leftover artifact, not live membership — `draft: true` is the authority. A check-in is armed to
convert it back and escalate if it recurs.

**Review.** Blue Dream handoff for `789294c6` posted 18:02 as
[PR comment 5456019137](https://github.com/Verdant-OS/verdant-grow-diary/pull/1176#issuecomment-5456019137),
in `HANDOFF_PROTOCOL` form (slice_owner Claude, independent_reviewer Blue Dream). **No verdict yet.**
Three questions were put to the reviewer rather than decided unilaterally: whether credential-
vocabulary scoping is the right breadth (a blanket `name=value` rule fails closed harder but guts
the export's diagnostic value); whether `buildRedactedPayloadPreview` redacting a UUID-shaped
`tent_id` is an acceptable trade; and whether the depth-8 ceiling is generous enough — **no
real-world body was sampled, so that is `NOT_MEASURED`**.

**Deferred, deliberately not in this slice.** The upstream ordering defect in
`ecowittLocalForwardingStatus.sanitizeReportText`: its credential-LABEL rules run BEFORE its env
`NAME=value` rule, so a pair whose NAME carries a label has the name fragmented first and the VALUE
survives (`MY_PASSKEY_VAR="s3cret"` → `MY_[REDACTED]_VAR="s3cret"`; a plain name redacts correctly,
which is why it went unnoticed). Fenced inside the diagnostics module only — **the same value still
survives on the forwarding-report path today.** Unassigned.

**A merge is not a deployment. No publish was performed and none is authorized.** `20260826100000`,
`20260825233000`, `20260813030000` and `20260827010000` all remain **NOT applied**. Slice 3 is
**named** (trim leftover on the merged manual-route idempotency key), not parked. Blue Dream **DID**
review #1169 at `c84a8330307afca0891706ce5369bf703d9085ef` in Cursor before auto-merge. Verdict:
**PASS**. Do not record a pre-merge review gap. Blue Dream reviews in Cursor, not on GitHub, so an
empty GitHub reviewer list is by design. Do **not** request a post-merge review of squash `22c1242c`.
#1176 stays draft, out of the queue, pending Blue Dream on that slice. #1172 stays draft. Other
opens stay classified: **#1170** draft at `5e40307c15a3f6f6a77f69dbbb4c33a2f83fc90e` (test-only
unknown/transport save-gate pin after product PASS at `48828dd`; stay draft), **#1171** draft at
`e73ca6c760aebdb891477cdcdf12ae254e6562c3` (Blue Dream PASS; `safeSourceDetail` fail-closed; stay
draft), and **#1153 / #1151 parked**. Cursor Bugbot / Approval Agent withhold remains as claimed
from the #1169 checks (usage/spend limit — not a newly measured billing fact). This edit touches
this file only. Prior header follows.)

**Prior update:** 2026-08-28 UTC (~16:05 UTC)
**Updated by:** Claude (2026-08-28: **#1169 MERGED — deploy tip is now `22c1242c`** (squash of the
fail-closed manual idempotency slice at head `c84a8330`, prior tip `a53924da` = #1168). Board-fact
correction on this same block only: Blue Dream DID review `c84a8330` PASS pre-merge; #1170 head
`5e40307c`; #1171 draft `e73ca6c7` recorded; Slice 3 named not parked. The slice:
`useQuickLogActivitySave.ts`'s `manual_note` route now fail-closes a missing / null / `length < 8` /
`length > 200` idempotency key with `{ ok: false, reason: "missing_idempotency_key" }` **before**
target resolution and before any `quicklog_save_manual` RPC, mirroring the fence the event route
already had; valid 8..200 keys forward unchanged as `p_idempotency_key`. Event route untouched, no
`p_stage`, no schema, no SQL. Four files, +109/-16.

**Why it took three commits.** The original head `8daddcbf` (cut from `90bb368c`) shipped the gate
without renegotiating the pins that encoded the OLD nullable-key behavior, so two **required**
contexts were red on its own change, not on flake: `Full test suite (shard 16/32)`
(`quick-log-activity-save-manual-rpc-contract.test.ts:135` expected `reason: "save_failed"`, got
`"missing_idempotency_key"`) and `(shard 17/32)`
(`quick-log-success-telemetry-hooks.test.tsx:208` expected a `quick_log_saved` event, got `[]`
because the save now short-circuits before the RPC). Batch lane 9/16 showed 4 failed / 2 passed in
the rpc-contract file and reproduced identically on its automatic retry — deterministic. `f189080`
merged deploy tip `a53924da` in (never rebased); `c84a8330` renegotiated both suites (+69/-7, spec
files only, no production change in that commit).

**Validation, exact.** At `c84a8330`, local run of both renegotiated suites: **2 files, 24/24
passed**. CI at `c84a8330`: **all 35 required contexts green**, including shards 16/32 and 17/32 and
all 16 `Full suite` batch lanes (batches 2 and 9 flipped from red). Deployment preview pipeline
green (edge-shared preflight, typecheck + production build).

**Known red at merge, none of them required, none re-run — recorded, not laundered.**
`Browser census (public)` FAILED on `c84a8330`: `core-link-form-census.spec.ts:2080`, clicking
`/settings/agent-integrations` from `/docs/mcp-api` expected pathname `/welcome`, received
`/settings/agent-integrations`, then burned the 420s test timeout. This diff touches no routing,
no manifest, no auth redirect, so it is **PLAUSIBLY not this PR's — `NOT_MEASURED`, not proven**:
the one confirming re-run was never spent. `Supabase Preview` FAILED with the inherited
`ai_credit_grants` 42P07 (non-required; this PR carries no migrations). `Cursor Bugbot` could not
run (**Cursor usage/spend limit** — claimed from the #1169 checks, not a newly measured billing
fact), and because of that the `Cursor Approval Agent` explicitly withheld approval on this SHA —
"Not approved ... human review is still needed". That claimed spend limit is unresolved and will
keep withholding automated approval on subsequent PRs.

**Review posture — satisfied pre-merge.** Blue Dream **DID** review #1169 at
`c84a8330307afca0891706ce5369bf703d9085ef` in Cursor before auto-merge. Verdict: **PASS**. Do not
record a pre-merge review gap. Blue Dream reviews in Cursor, not on GitHub, so an empty GitHub
reviewer list is by design (see the reviewer rows below). Do **not** request a post-merge review
of squash `22c1242c`. One open question was carried in the handoff and remains unanswered: whether
the fail-closed path emitting **no** `quick_log_saved` telemetry is the intended contract, or
whether a distinct fail-closed signal should fire instead.

**Merge mechanics, for the record.** cursor[bot] enqueued at 15:40; `disable_pr_auto_merge` did NOT
evict the live entry (auto-merge is the arming mechanism, not the queue seat); a Cheek-directed
draft conversion at 15:46 did evict it — GitHub's own notice confirms a draft conversion removes
auto-merge and queue membership and does not restore either. Marked ready + auto-merge re-armed
(SQUASH) at 15:48; merged 15:49. The commit that landed, `22c1242c`, is the same prepared merge
commit the queue had built at 15:41 on `gh-readonly-queue/verdant-grow-diary/pr-1169-a53924da…`.

**A merge is not a deployment. No publish was performed and none is authorized here.** The publish
stop-order and migration posture are unchanged: `20260826100000`, `20260825233000`, and
`20260813030000` all remain **NOT applied**. Slice 3 is **named** (trim leftover on the merged
manual-route idempotency key), not parked. Other opens stay classified: **#1170** draft at
`5e40307c15a3f6f6a77f69dbbb4c33a2f83fc90e` (test-only unknown/transport save-gate pin after product
PASS at `48828dd`; stay draft), **#1171** draft at `e73ca6c760aebdb891477cdcdf12ae254e6562c3`
(Blue Dream PASS; `safeSourceDetail` fail-closed; stay draft), and **#1162 / #1153 / #1151
parked**. Cursor Bugbot / Approval Agent withhold remains as claimed from the #1169 checks
(usage/spend limit — not a newly measured billing fact). This edit touches this file only. Prior
header follows.)

**Prior update:** 2026-08-27 UTC (~10:20 UTC)
**Updated by:** Claude (2026-08-27: **Blue Dream P2 on [PR #1163](https://github.com/Verdant-OS/verdant-grow-diary/pull/1163)
addressed — Quick Log strip provenance fence** pushed as fix commit `a16fec2` on
`claude/sentinel-ack-1157-hold-neyqah`; the PR head is this state-edit commit, which lands
immediately after `a16fec2` on the same branch. This supersedes the prior entry's stale
"head `460973b`" reference (that SHA was the first code commit; Blue Dream's PASS-with-P2
review was at `1a70689`). The P2: `buildQuickLogStripFromTentState` still mapped
`fresh_non_live` → `usable` with no provenance check, so a legacy receiving-transport
label (`ecowitt`, `mqtt`, …) rendered pill "Usable" while the trust badge read "stale"
(`mapNonLiveSource` default) and the view-model advisory read invalid. Fix: the strip
adapter gates exactly that branch through the sanctioned `normalizeSensorSource` table
(called, not edited) — non-normalizing or missing sources demote the card to invalid and
the trust badge gets the same verdict, so pill, badge, and advisory agree; `fresh_live`
untouched; `pi_bridge`/`manual`/aliases not over-demoted; unknown stays non-attachable;
the now-unreachable advisory suppression in `QuickLogSensorSnapshotStrip` is removed.
Renegotiated pins (same commit): the two tests pinning the Usable pill for ecowitt
`fresh_non_live` now pin Invalid, plus a coherence test and pure-adapter fence cases.
Validation, exact, this round only: RED pre-fix 5 failed / 25 passed across the three
strip suites; 30/30 green post-fix; targeted sweep
(`ecowitt-*`/`quicklog-*`/`quick-log-*`/`sensor-*` + v0 contract 26/26) **6319 passed /
3 skipped / 0 failed**; typecheck and scoped eslint clean. Blue Dream re-reviews at the
new head. Still draft; no merge, no queue, no publish, no sandbox APPLY, no Preview
action; #1151, #1153, #1162, #576 and the live `version.json` identity FAIL untouched.
Publish stop-order and migration posture unchanged: `20260826100000`, `20260825233000`,
`20260813030000` remain **NOT applied**. This edit touches this file only. Prior header
follows.)

**Prior update:** 2026-08-27 UTC (~07:40 UTC)
**Updated by:** Claude (2026-08-27: **issue #1003 (sensor provenance fail-close + forwarding-report
export allowlist) delivered as draft [PR #1163](https://github.com/Verdant-OS/verdant-grow-diary/pull/1163)**
from branch `claude/sentinel-ack-1157-hold-neyqah`, cut from deploy tip `11b0ca6` (#1160), head
`460973b`. The task's NOT_APPLICABLE gate did not fire — both holes were proven live on tip
(`established fact`, by reading and executing the modules): `quickLogSensorSnapshotViewModelAdapter`
promoted any unknown provider string to canonical `live` when upstream freshness was `fresh`
(producing an attachable payload stamped `source: "live"`), and `ecowittForwardingReportExport`'s
status-fallback envelope exported `captured_at`/`source`/`vendor` unsanitized while
`SECRET_PATTERNS` matched credential labels, not values. Fix: adapter delegates to the sanctioned
`normalizeSensorSource` alias table (unknown → `invalid`, freshness never consulted; first-party
`pi_bridge` → live is preserved — it is the one active production writer of a provider-string
source, per the ingest audit); export gains shape/value-allowlists on BOTH latest_metrics paths, a
recursive output-allowlist serializer, and credential-VALUE redaction (MACs incl. bare 12-hex,
32+-hex with lookarounds so `0x`/`PASSKEY_`/`sbp_` prefixes cannot evade, UUIDs, `sk-` keys, env
`NAME=value`); the Quick Log strip suppresses the one contradictory Usable-pill-plus-invalid-advisory
combination for legacy transport-labeled rows. Validation, exact: new suites RED-proven against the
pre-fix tree with the final files (adapter 4 failed / 8 passed; export 7 failed / 10 passed; strip
coherence 1 failed / 11 passed against the mid-state it guards), 41/41 green post-fix; broad
targeted sweep 6298 passed / 3 skipped across all `ecowitt-*`/`quicklog-*`/`quick-log-*`/`sensor-*`
suites + v0 contract 26/26; typecheck, scoped eslint, and `bun run build` (with SEO gates) clean.
Three independent adversarial verify passes ran pre-push; both security findings they raised
(vendor shape-regex bypass via station ids / bare MACs; `\b`-anchored hex evasion) are fixed and
probe-tested in the diff. Recorded follow-ups, deliberately NOT in this slice: widget `metric_keys`
key-name rendering, `safeSourceDetail` shape gate, the validation-panel `redacted_raw_payload`
key-only redaction, and `sensorDiagnosticsExportRules`' vbt_-only body redaction. Owner: Claude;
independent reviewer: **unassigned** — draft until Cheek/GDP names the reviewing peer. No merge, no
publish, no sandbox APPLY, no Preview action; #1151, #1153, #1157, #1162, #576 untouched; #1157
remains unqueued pending Blue Dream's re-review of `5791639b`. The publish stop-order and migration
posture are untouched: `20260826100000`, `20260825233000`, `20260813030000` remain **NOT applied**.
This edit touches this file only, on the #1163 branch. Prior header follows.)

**Prior update:** 2026-08-26 UTC (~23:15 UTC)
**Updated by:** Claude (2026-08-26: **#1158 MERGED — deploy tip is now `b294b64`** (squash of
the Gate Zero Day-0 SEO baseline slice at head `72a9a7e`). Timeline: Blue Dream's independent
review returned PASS-with-P2 (the condition-1 cell fix, pushed as `72a9a7e`); the owner marked
the PR ready and Cheek enqueued it at ~22:58 UTC; the merge queue landed it at ~23:04 UTC with
**all 35 required checks green** — the only red was the known non-required `Supabase Preview`
42P07 (inherited, per the section below). `docs/seo/seo-baseline-2026-08-26.md` is therefore
now ON the deploy branch, with its Gate Zero verdicts: 1 FAIL (orphan / no provenance),
2 PASS-at-timestamp, 3 FAIL (dual-home), 4 FAIL (soft-200 shells), 5 PASS (bounded),
6 FAIL (GSC/GA4 NO_BASELINE) — Gate Zero is not all true; the file authorizes no content
cohort and no publish. Codex and Copilot bot reviews landed two minutes AFTER enqueue
(2 P2 + 5 findings, all verified real); per the #1092 queue-locked precedent the five accepted
label-precision fixes ship as follow-up draft [PR #1159](https://github.com/Verdant-OS/verdant-grow-diary/pull/1159)
from the restarted `claude/gate-zero-seo-baseline-dqbp46`, and all seven review threads on
#1158 are resolved against it. No measurement value changes in the follow-up. The publish
stop-order and migration posture are untouched: `20260826100000`, `20260825233000`, and
`20260813030000` remain **NOT applied**. This edit touches this file only, on the #1159
branch. Prior header follows.)

**Prior update:** 2026-08-26 UTC (~22:00 UTC)
**Updated by:** Claude (2026-08-26: **Gate Zero Day-0 SEO baseline captured** as
`docs/seo/seo-baseline-2026-08-26.md` (draft PR from `claude/gate-zero-seo-baseline-dqbp46`;
the 2026-07-30 `docs/seo/seo-baseline.md` is preserved unchanged with a one-line pointer).
Unauth re-fetch 2026-08-26T21:49–21:53Z found **production republished**: live `/version.json`
now serves `2cc97c0e91aa` = deploy tip #1156 (`buildTime 2026-08-26T21:44:08.140Z`,
`dirty: false`, `ref: "__orphan__"` persists, cause still NOT_MEASURED — commit identity
matches tip at that timestamp, publish lag 0; this supersedes the 2026-08-25 `5e75a3a3ae85`
identity rows below **for identity only**, not provenance). Live sitemap is now **62** locs,
byte-identical to repo (`/tools/grow-help-toolkit` present, lastmod 2026-08-26; the toolkit
page serves 767 words — no longer SOFT_200_THIN). Still FAIL: `/` + `/welcome` dual-home
(identical title/h1, both self-canonical, both sitemapped); `/login`, `/dashboard`,
`/internal/demo-advanced-nutrients-feeding` remain SOFT_200_THIN soft-200 shells with
`index, follow`. P0 private-leak PASS on the unauth sweep set. GSC/GA4/Bing/Ahrefs stay
NO_BASELINE/BLOCKED — Gate Zero condition 6 remains FAIL until an authenticated baseline
exists. Pheno showcase/comparison indexation record stays OPEN (no noindex shipped). No
publish, no production SQL, no content cohort authorized; drafts #1151/#1153, Slice 2,
Paddle runtime slice, and #572 untouched. This edit touches this file plus the two
`docs/seo/` files named above. Prior header follows.)

**Prior update:** 2026-08-26 UTC (18:55 UTC)
**Updated by:** Claude (2026-08-26: **#1149 MERGED — deploy tip is now `b9cca9fb1`** (squash of
the top-N diary RPC slice at head `c353c765`), after Blue Dream's independent review returned
**PASS-with-P2** and Cheek/GDP merged GitHub-only. The migration apply posture is unchanged:
`20260826100000`, `20260825233000`, and `20260813030000` are all still **NOT applied**; until
the operator applies `20260826100000`, production growers ride the missing-RPC fallback and
behavior is byte-identical to the pre-slice read. **Known red the merge carried:** both
`Browser census` lanes failed at `c353c765` — root-caused, not a product defect: the mocked
census fences abort any RPC POST not on their reviewed read-only allowlist, and the new
`pheno_candidate_diary_entries_top_n` POST was aborted (authenticated lane: workspace success
test-id never rendered; public lane: the aborted POST recorded as a blocked mutation). The
deploy branch's census stays red until the follow-up fence fix merges. That fix (census
`READ_ONLY_RPCS` allowlist + compare-deep-link fence + renegotiated reviewed-RPC pin,
reproduced red locally on the deep-link spec then green) plus two P2 responses (Array.isArray
fail-closed guard on the RPC payload with a RED-proven test at 1 failed / 7 passed; the
retraction-is-server-side contract documented against the SQL pin) ship as a **new follow-up
draft PR** from the restarted `claude/verdant-pheno-hunt-lab-vq6pd9`. The third P2 — a runtime
RLS harness for the RPC — remains `BLOCKED` (no credentials in agent sessions) and is recorded
here rather than silently dropped. This edit touches this file only. Prior header follows.)

**Prior update:** 2026-08-26 UTC (18:15 UTC)
**Updated by:** Claude (2026-08-26: **server-side top-N-per-plant diary read for Pheno Hunt
candidates delivered as draft [PR #1149](https://github.com/Verdant-OS/verdant-grow-diary/pull/1149)**
from branch `claude/verdant-pheno-hunt-lab-vq6pd9`, restarted from deploy tip `ec8aca7b5`
(#1148) — the branch was byte-identical to tip before this slice, per the task order. Scope:
`loadCandidateDiaryEvidence`'s one-`diary_entries`-query-per-plant fan-out (the #1139 fix for
global-limit sibling starvation) is replaced by **one** `SECURITY INVOKER` RPC,
`pheno_candidate_diary_entries_top_n` (`row_number()` partitioned by `plant_id`, ordered
`entry_at DESC, id DESC`, `rn <=` a server-clamped hard-max-40 limit; `p_plant_ids` capped at
100 = the workspace `MAX_PAGE_SIZE`, oversized calls rejected not clamped; EXECUTE to
`authenticated` only, PUBLIC/anon/service_role revoked). Client chunks at 100 and keeps a
missing-RPC-only fallback to the old per-plant read, so production behavior is byte-identical
until the operator applies the migration. One additive migration
(`20260826100000_pheno_candidate_diary_entries_top_n_rpc.sql`) ships **in-branch only — NOT
applied to production**; `20260825233000` and `20260813030000` also remain unapplied, and the
publish stop-order and migration immutability are untouched. Validation, exact: new tests
18/18 (11 SQL contract + 7 client behavior; client suite proven RED pre-fix at 6 failed /
1 passed), `src/test/pheno-*` + `use-pheno-*` sweep 1479/1479 across 151 files, migration
gates + adjacent 265/265, typecheck clean, scoped eslint 0/0, `bun run build` + SEO gates
green. Known-red on the PR: `Supabase Preview` 42P07 on `ai_credit_grants` — inherited, per
the 03:14 UTC section below, not this diff. Owner: Claude; independent reviewer for THIS
slice: **Blue Dream** (named in the task — distinct from the still-Cheek-named seat on the
earlier Pheno Hunt + LAB territory PR recorded at 01:30 UTC). Draft until that review passes;
GDP merges GitHub-only after PASS. No publish, no production SQL, no production data
modification. This edit touches this file only. Prior header follows.)

**Prior update:** 2026-08-26 UTC
**Updated by:** Codex (2026-08-26: records the Grow Help Toolkit owner/reviewer assignment
and Cheek's current operational boundary for the separate drift-probe lane. This edit adds the
toolkit section and updates the Codex/Grok assignment rows; it does not independently re-probe
provider state. Cheek's current statement that `verdant-production` has 0 secrets supersedes the
historical 2026-08-15 environment-secret snapshot below. Prior header follows.)

**Prior update:** 2026-08-26 UTC (03:14 UTC)
**Updated by:** Claude (2026-08-26: records **one new section only** — the `Supabase Preview`
42P07 replay failure and the four constraints on it, at Cheek's instruction. Nothing else in
this file is touched, and no status below is restated, corrected or superseded by this edit.

The section exists to stop a specific wasted loop: the check is red on every PR, the cause is
already declared in `config/local-supabase-replay-compatibility.json`, and the fixes that look
obvious — a dashboard create/Pull/Migrate sequence, a late `PATCH /v1/branches/{id}`, closing
and reopening the PR — each fail for a different reason. The vendor-behaviour half is labelled
`source claim` from Cheek and is **not** independently verified from inside this repository;
the repository-side half is `established fact` and reproducible here.

It licenses nothing. The publish stop-order, the `20260813030000` hard stop, and migration
immutability are all unchanged, and the section says so in its own terms. Prior header
follows.)

**Prior update:** 2026-08-26 UTC (01:30 UTC)
**Updated by:** Claude (2026-08-26: **Pheno Hunt + LAB territory delivered as one draft PR**
from branch `claude/verdant-pheno-hunt-lab-vq6pd9` (base `verdant-grow-diary`, cut from
deploy tip `5e75a3a` / #1129). Scope: repo-wide territory audit with per-feature
dispositions (`docs/pheno-hunt-lab-territory-2026-08-26.md`), source-of-truth decision,
implementation of the hunt → evidence → comparison → scorecard → cure-gated flavor →
grower keeper decision → lab results → stability/GxE → breeder-mode workflow, and the
validation ladder (targeted vitest, lint 0 errors, typecheck clean, build + SEO gates,
six mocked pheno Playwright specs 14/14). One additive migration
(`20260825233000_pheno_hunts_ownership_check_restore.sql`) ships **in-branch only — NOT
applied to production**; the publish stop-order and the `20260813030000` hard stop are
untouched. No publish, no production SQL, no production data modification. Keeper
contract intact: no winner selection anywhere; James Loud weighting remains an opt-in
preset only. Independent-reviewer seat for this slice is **unassigned — Cheek names the
peer on the PR**. This edit touches this file only; every release-identity, publish-lag
and payments claim in the 2026-08-25 19:48 UTC block below stands unmodified. Prior
header follows.)

**Prior update:** 2026-08-25 UTC (19:48 UTC)
**Updated by:** Claude (2026-08-25, later edit: **production republished at 18:05 UTC and the
served commit is not in the GitHub repository at all.** `git fetch origin e8f4e7c2fe05…`
returns `not our ref`. Two long-standing framings in this file are corrected as a result:
**publish lag is NOT COMPUTABLE** against this build (every lag figure presumed an ancestry
that does not hold), and **the served SHA is unrecognized by GitHub**, which is consistent
with `ref: "__orphan__"` but does **not** establish why. The causal mechanism is
`NOT_MEASURED` — see the correction immediately below, and do not restate it as settled.

**Overclaimed, corrected below the same day in revision 11 (Codex P2) of the companion
payments spec (PR #1125):** "now has a _sufficient_ explanation" outran the evidence. A
remote fetch failure proves the SHA is unrecognized by GitHub; it does not by itself prove
the causal mechanism (a genuinely disconnected local commit, versus a rebase/squash/re-commit
of otherwise GitHub-derived content producing the same symptom). See the corrected point 2
and the corrected "Open question" paragraph in the 19:48 UTC block below — the causal
mechanism is `NOT_MEASURED`; the observation (SHA unrecognized) stands.

The candidate-1-vs-2 correction is **not** restated here — a parallel session on this same
branch recorded it more fully; see "#1127 landed while this PR was open" below. This edit
merged that work rather than competing with it, and trimmed its own duplicate.

#1127 is **not in the live build** (merged 19:16 UTC, build stamped 18:05 UTC), and the
re-measured bundle still carries a `live_`-class token and zero `test_` — counts only, no
value printed. One open question about #1127 is flagged rather than answered, and stated
**without** assuming any publisher mechanism: it restores from `git show HEAD:.env.production`,
so if whatever `HEAD` resolves to in the publisher's build context already carries the
injected value, the restore would restore the injection rather than the committed class.
Whether it does is `NOT_MEASURED`. Establishing it needs publisher build/history evidence —
an unrecognized SHA is not that evidence.

Full detail in the re-measure block below, which supersedes every release-identity,
publish-lag and payments-bundle row beneath it. **No agent published**; the stop-order
stands. Prior header follows.)

**Prior update:** 2026-08-25 UTC (17:11 UTC)
**Updated by:** Claude (2026-08-25: records a **standing owner directive** — production is
the target, not sandbox — as its own section immediately below. Scope was confirmed with
Cheek in session as **full production posture** before writing, because the phrase reads
three materially different ways and whatever lands here is read by every agent as standing
instruction.

**It is recorded as a direction, not an authorization**, and the section says so in its
own second paragraph. The publish stop-order, the `20260813030000` hard stop, and the Hard
Safety Rules are explicitly carried through unchanged.

Two things gathered while writing it, both new since 2026-08-23 — one measured, one that did
not survive review: **#1124 moved the payments BUILD gate to accept `live_`, while the
RUNTIME resolver still fails closed on `live_` on every host** — `established fact` — so a
publish today would still disable checkout, and #1124 must not be read as having enabled
live payments. **The second claim — that #1124's body settles the build-time token
question — is corrected below, on this same PR, after Codex review**: the guard #1124
shipped still requires the effective and canonical tokens to match exactly, which is
inconsistent with the injected-value mechanism it was credited with confirming. See "The
build-time token question" subsection for the full account. The `treeHash` / `dirty: true`
provenance question stays `NOT_MEASURED` either way.

Touches this file only. Does **not** publish, does **not** apply any migration, does
**not** change payments code, and re-measures no GA4/GSC, Day 0, sitemap, or
release-identity row — the release rows below keep their own 2026-08-23 dates and are
stale by two days. Prior header follows.)

**Prior update:** 2026-08-23 UTC (~17:15 UTC)
**Updated by:** Claude (2026-08-23, PR #1093 review round: **the 2026-08-22
project-identity downgrade in the "Function default-privilege exposure"
section overcorrected, and two further defects in that same section are
fixed.** Raised by Codex review on PR #1093, verified against primary
sources before accepting.

The 2026-08-22 correction said this file "has never recorded a checked
mapping" from Lovable project `66255e7b-892c-4be5-8686-ab1cfc3666db` to
Supabase ref `knkwiiywfkbqznbxwqfh` — false. `docs/LOCAL_SUPABASE_SETUP.md`
and `docs/signup-attribution-outage-operator-runbook.md:61-64` both record
that exact mapping, dated 2026-08-13, attributed, and operationally
confirmed by the signup-attribution fix this file's own RESOLVED section
verified worked in production. The 66/76 and 3/76 counts are restored to
`established fact` about production. Full account:
"Correction (2026-08-23)" under "Function default-privilege exposure."

Also fixed in the same pass: a self-contradiction (this file's own ~15:23
UTC entry already said the signup readiness RPC has `service_role=X`, while
a later paragraph in the same section claimed it did not — only
`handle_new_user` actually lacks the exposure, and it has a mundane
explanation: an already-hardened function survived a later body replacement,
which `CREATE OR REPLACE FUNCTION` is expected to do); and an unproven "by
default" attribution (`has_function_privilege` cannot distinguish a default
grant from an explicit one, and 2 of the 66 are proven explicit grants from
their own defining migrations). Neither finding changes any table, function,
grant, or default privilege — docs-only, same as the section it corrects.
Prior header follows.)

**Prior update:** 2026-08-23 UTC (02:09 UTC)
**Updated by:** Claude (2026-08-22, review round: **the payments-token severity was
INVERTED and is corrected.** An earlier revision said production "is running **live**
payments". It is not. At the served SHA a `live_` token resolves to `unavailable`
(`src/lib/paddleEnvironment.ts`; confirmed in the shipped bundle's minified resolver),
so checkout is **disabled** — a checkout-blocking configuration and provenance defect,
not an unnoticed live billing surface. The publish risk flips with it: a live → test
swap **restores** sandbox checkout rather than breaking anything. Raised by Copilot,
verified in source and bundle before conceding.

Also withdrawn the same round, after a further P2: **"the shipped bundle came from
neither `.env.production` file"** — both files were read AFTER deployment, so a
workspace file carrying a `live_` value at build time and restored afterwards is
excluded by nothing measured. Two build-time candidates are now recorded, with a
direction not to discard the second.

**Sixth review finding of the round, and the sixth correct one.** #1092 merged at
17:55:57 UTC from head `fcf400ec7` while a fix for it was queue-locked (`GH006`), so
this follow-up carries it: the over-claim "the file demonstrably is not what produced
the current bundle" **survived the earlier correction in a second sentence of the same
section**, contradicting candidate 2 that the section itself says not to discard. That
is the failure mode named two corrections earlier — fixing the pointed-at instance
rather than the class — so this pass swept the whole file, and the only remaining
occurrences are inside withdrawal notes quoting the withdrawn text.

Tip and lag re-measured 2026-08-23 02:09 UTC: tip `a3ae36765` (#1105), publish lag
**12**; production still serves `faea6e9c59ad`, **unchanged since 2026-08-22 16:16
UTC — nearly ten hours with no republish**, while the tip advanced seven times in the
same span. Read which half moved before drawing any conclusion from the widening
number.

Same round, from Codex and Copilot findings: the hand-maintained publish count
(four → **five**), the #1076 gate row (**re-queried**, not carried forward), the
`/version.json` row's own date (was 2026-08-21 while neighbouring rows quoted
2026-08-22 readings of the same endpoint), and a malformed markdown quotation.
Prior header follows.)

**Prior update:** 2026-08-22 UTC (17:10 UTC)
**Updated by:** Claude (2026-08-22, later edit: records the **#1092 owner/reviewer
pairing** in the architecture-audit section, per `HANDOFF_PROTOCOL.md:25` — Cheek
named **Grok (GDP)** as independent peer reviewer on the PR at 17:09 UTC and marked
it ready for review in the same minute. No agent performed either transition, and a
_named_ seat is not a _discharged_ one. Also flags that the MACAE row lower in this
file names Grok for a **different** slice; do not collapse the two.

Re-measured at 17:09–17:10 UTC because the base moved again while this was open:
tip is now `fd2d3e3f7553` (#1100) and publish lag is **7** — production still serves
`faea6e9c59ad`, unchanged since the 16:16 UTC reading. Prior header follows.)

**Prior update:** 2026-08-22 UTC (16:16 UTC)
**Updated by:** Claude (2026-08-22: **docs-only re-measurement.** Production
republished overnight and the deploy tip moved six commits, so every perishable
release row this file carries was stale in the same direction. Re-read first-hand at
16:16 UTC: tip `93d8ea23ff58` (#1097); production serves `faea6e9c59ad` (#1087),
`buildTime 2026-08-21T20:51:46.584Z`, `dirty: true`, `ref: "__orphan__"`,
`treeHash 7d9cc8a12898`; ancestor of tip; publish lag **6**.

**The post-#1090 provenance test finally had a build to run against, and it returned
no information — which is the correct reading, not a disappointment.** `faea6e9c59ad`
contains #1090, and its recomputed tree `436eede41e4b` still mismatches the stamped
`7d9cc8a12898`. The record's own one-directional rule says persistence neither
confirms nor refutes the #1090 candidate, because a workspace already dirtied stays
dirty until reset. Do not report this as a refutation. The publisher's build log
remains the only route that settles it, and stays owner-gated.

**The live-class payments token survives the republish — and it FAILS CLOSED.**
Severity corrected 2026-08-22 after review: a `live_` token resolves to
`unavailable` in the served code, so production is taking **no** payments rather
than live ones, and checkout is disabled. See the severity-correction block in the
payments-token section. Re-measured against the new
bundle `/assets/index-C-R0_Bat.js` (the path changed from `index-aTS7aKMk.js`, so
this is a rebuild, not a cache): still `live_` class, body length 27, one distinct
value, two occurrences — while the Lovable project `.env.production`, re-read in the
same window per the owner's standing pre-publish instruction, still says `test_`. A
build cycle did not reconcile them. **Publishing remains stopped by owner order**,
and reading the env file is not a clearance: it said `test_` yesterday too, while
production shipped `live_`.

Touches this file only. Does **not** publish, does **not** apply
`20260813030000` (the hard stop below is unchanged), does **not** re-measure
GA4/GSC, Day 0, or migration state, and invents no metric. Prior header follows.)

**Prior update:** 2026-08-21 UTC (function default-privilege investigation)
**Updated by:** Claude (2026-08-21: investigation only — no code, migration, or
production write in this edit. Recorded for Grok, who has been actively
working this exact signup/production surface today (`20260821150000`,
the RAISE LOG guard, the readiness RPC): before drafting any further
`service_role` hardening, measured how widespread the class of gap
`20260821064300` closed for one table actually is across every
SECURITY DEFINER function in `public`. See the new subsection under
"Second production drift" below for the full findings and the specific
open question. Headline, evidence-labeled: `established fact` — 66 of 76
SECURITY DEFINER functions in `public` currently grant `service_role`
EXECUTE by default, and 3 grant `anon` EXECUTE (one an uninvokable trigger
function; the other two look like an intentional public "founders wall"
counter — `founders_seats_consumed`, `founders_wall_count` — worth one owner
confirmation, not urgent).
`uncertainty` — `20260807133000`'s own self-test fails if reproduced today
against a fresh probe function, but two functions from Grok's own
`20260821150000` migration do _not_ show the same exposure despite one of
them never receiving an explicit `service_role` revoke. Left unresolved
rather than guessed at. No fix proposed or applied.

**2026-08-22 correction, added on PR #1093 in response to Grok's independent
review:** the "production" attribution above is disputed, not confirmed — the
measurement was against Lovable project `66255e7b-892c-4be5-8686-ab1cfc3666db`,
which Grok's review says is a different, non-production project, contradicting
two of Grok's own same-day entries elsewhere in this file that call the same
id "production, not sandbox." See the correction under "Function
default-privilege exposure" below for the full account. Every count above
holds only as a claim about whichever database that id actually is; whether
that is production is now `NOT_MEASURED`, downgraded from the `established
fact` framing this block originally used.

**Superseded 2026-08-23 — see the top of this file.** This downgrade
overcorrected: two in-repo documents already record a checked, dated,
attributed mapping from this Lovable project id to production Supabase ref
`knkwiiywfkbqznbxwqfh`, which this paragraph should have found and cited
instead of downgrading to `NOT_MEASURED`. The 66/76 and 3/76 counts are
`established fact` about production again — but "by default" in the
headline just above is not: `has_function_privilege` proves effective
access, not provenance, and 2 of the 66 are proven explicit grants. Also
flagged: the committed migration for `founders_guard_immutables()` (one of
the 3 in the `anon` set) does not declare `SECURITY DEFINER`, so it should
not satisfy the query's own `p.prosecdef = true` filter — either the live
function differs from its migration (unrecorded drift) or this list has an
error; not resolved. See "Function default-privilege exposure" below for
the full account of all three. Prior header follows.)

**Prior update:** 2026-08-21 UTC (~15:23 UTC / 10:23 AM CT)
**Updated by:** Grok (2026-08-21: **docs-only correction** — #1077 pinned
production at `1400a7e77eff` and leftover Action Queue prose still said
`20260813030000` was unapplied; both are now false on a fresh point-in-time
re-measure. Host `/version.json` re-fetched just now serves
`39935889fe02` (#1080), **not** #1077 (`999b6da`) and **not** #1083
(`1400a7e`). Identity vs provenance recorded separately: identity
`39935889fe022efd441dc5ab86bfbf636d284739`; provenance remains
`dirty: true` / `ref: "__orphan__"` / `commitSource: "git"` — **not** upgraded
to provenance `PASS`. Cause of dirty/orphan `NOT_MEASURED`. Do **not**
compare `treeHash` to `git rev-parse ^{tree}` (different hash functions;
#1077 already corrected that false corroboration).

Production signup objects re-checked the same window via Lovable
`query_database` on project `66255e7b-892c-4be5-8686-ab1cfc3666db`
(production, not sandbox): table + helpers + failure-safe `handle_new_user`
(`md5 34405b3ee446340a55ad4f25e2193c9a`, `RAISE LOG` guard present from
`20260821150000_signup_acquisition_failure_safe_attribution.sql` via Lovable
SQL — **not** via the GitHub apply-signup workflow, which still shows only
the failed PREFLIGHT) + readiness RPC. Ledger **name-rows** for
`20260813030000` and `20260821150000` are present (founder backfill marker
`ledger-only;objects-already-applied;no-rerun`, `created_by`
`founder-ledger-backfill`); `20260821064300` is still **not** in the ledger.
**Hard stop:** do **not** GitHub-APPLY
`20260813030000_signup_acquisition_forward_repair.sql` — that file would
re-issue an unguarded `handle_new_user` and overwrite the live `RAISE LOG`
guard. Touches this file only. Does **not** re-measure GA4/GSC, Day 0,
parked #828/#817/#696, or invent metrics.)

**Prior update:** 2026-08-21 UTC (post-publish Production status rows, #1077)
**Updated by:** Claude (2026-08-21: applies the measured post-publish production
rows. The 2026-08-20 sitemap adjudication PUBLISHED, so five Production status
rows plus the branch-topology row were stale in the direction that matters —
they described a fix as pending that had already shipped. Re-measured over live
HTTPS, most recently at 2026-08-21T12:57 UTC: live sitemap is **61** `<loc>`
(was 56), and **"Indexable routes outside the sitemap" moves `FAIL` → `PASS`** —
five advertised and self-canonical, `/breeder-beta` correctly absent while
cross-canonicalising to `/creator-beta` and staying `index, follow`, verified
live rather than inferred from the merge. Closes blocker 8's sibling item.

**Read the Production commit row before quoting it.** At that 12:57 UTC
reading production served `1400a7e77eff` with **`dirty: true`** and provenance
**`NO_MATCH`**. **Superseded same day ~15:23 UTC** — host now serves
`39935889fe02` (#1080); see the Latest updated block and the Production
status table. Commit _identity_ remains separable from _provenance_; do not
smooth provenance into a `PASS`. Cause of dirty/orphan stays `NOT_MEASURED`.

These rows were specified in §8 of `docs/specs/current-state-refresh-2026-08-20.md`
(#1067) and routed to PR #1060, which owned this file; #1060 merged without
folding them in, and the collision that blocked a direct edit ended with it. The
values here were a FRESH measurement at write time, not a replay of §8 —
production moved `6cf3ffda0686` → `92a983b4832e` → `1400a7e77eff` across that
session, then later to `39935889fe02`, which is the whole argument for
re-measuring before writing, and the reason every row here carries its own
timestamp.

This edit changes no schema, migration, or governance file — it touches this file
only. The merge commit carrying it does inherit the deploy branch's own changes
(#1051's governance bump to `2026-09-01.2`, #1080's signup hardening migration);
those are inherited, not authored here. Does **not** measure indexation or
migration state, and does **not** set Day 0.

Ordering note: this edit and the signup-attribution resolution directly below
are independent same-day changes touching different sections of this file. The
order here reflects when each edit landed in this document, not when each
measurement was taken.)

**Prior update:** 2026-08-21 UTC (signup-attribution resolution, #1080)
**Updated by:** Claude (2026-08-21: **the signup-attribution forward repair is
now APPLIED and the live outage is CLOSED.** Acted on Cheek's in-session
"fix things I deliberately left for you" instruction, covering the three items
recorded at the end of the prior turn's work. Applied
`supabase/migrations/20260813030000_signup_acquisition_forward_repair.sql` to
production verbatim through the same Lovable SQL channel as the Action Queue
repairs, guarded by an md5 transcription check against the runbook's pinned
SHA-256 identity so the applied bytes are verified, not assumed — the first
attempt caught a real transcription slip and aborted with zero writes before
the corrected retry succeeded. `public.signup_acquisition_attributions` and
all four functions now exist; a rolled-back end-to-end probe of the exact
allowlisted-source failure path passed. The merged migration never revokes
`service_role` (zero occurrences, confirmed by grep), so this project's legacy
default privileges would otherwise leave `service_role` holding unintended
access on all five objects — the same class of gap already recorded for the
Action Queue guard below. An ad-hoc supplemental `service_role` revoke was
applied through the same channel at apply time and is now captured as a new
additive migration, `20260821064300_signup_acquisition_service_role_hardening.sql`,
validated on a local PostgreSQL 16 replay, so a fresh provision or
disaster-recovery restore reaches the same hardened state rather than
silently reopening it. See the 2026-08-21 resolution block under the
signup-attribution section for full evidence. No `schema_migrations` ledger
row was written for either signup version, consistent with this file's own
"founder decision" framing for that class of write. No governance file
changed in this edit.)

**Prior update:** 2026-08-20 UTC (second same-day edit)
**Updated by:** Claude (2026-08-20, later edit: **the Action Queue transition
contract is now APPLIED and the live security gap is CLOSED.** Cheek authorized
the full sequence in session. `20260819190000` (guard forward repair) applied
first, then `20260819190852` (transition forward repair) applied and passed its
own postflight. `authenticated` no longer holds UPDATE or DELETE on
`action_queue` or `action_queue_events`; a rolled-back end-to-end probe proved a
direct UPDATE is refused 42501 while the owner-scoped RPC still approves and
writes its audit event. See the 2026-08-20 resolution block. No repository code
changed in this edit.)

**Prior update:** 2026-08-20 UTC
**Updated by:** Claude (2026-08-20: corrects a production-liveness false negative on
branch `claude/verdantgrowdiary-dns-issue-hag3co`. An agent reported
`verdantgrowdiary.com` **offline and unindexed** from a single sandboxed DNS
failure and recommended repointing production DNS; the site was live throughout.
Re-measures seven Production status rows over live HTTPS — release identity is now
`f09febc354a4` (#1049), build `2026-08-20T18:49:50.600Z`, provenance MATCH — and
refreshes the deploy-branch topology row to tip `9b644565` (#1042). Adds
`docs/agent-session-network-reachability.md`.

Second, executes Cheek's 2026-08-20 **SITEMAP** adjudication on the unsitemapped
indexable routes. The set measured **six**, not the four this file recorded; five
were added to `public/sitemap.xml` (56 → 61 `<loc>` in-repo). `/breeder-beta`, a
self-declared copy-only duplicate of `/creator-beta`, was held for an owner call
and then resolved the same day: Cheek chose canonicalisation, so it now points its
canonical at `/creator-beta`, stays `index, follow`, and stays out of the sitemap
by design. That adds a `canonicalPath` option to `usePageSeo` and a
`crossCanonicalDocument` build-time helper, pinned by
`src/test/breeder-beta-cross-canonical.test.ts` and
`src/test/use-page-seo-canonical-path.test.tsx`.

No schema, migration, or governance-file changes. Does **not** measure indexation
or migration state, does **not** move production — the live sitemap stays at 56
until the next publish — and does **not** set Day 0.)

**Prior update:** 2026-08-20 UTC
**Updated by:** Claude (2026-08-20: records the owner-authorized apply attempt of
the Action Queue transition forward repair. The apply **fail-closed with zero
writes** at a precondition the earlier evidence never covered, and the
investigation proved a **third** unapplied migration in production
(`20260725093000`). Adds the "2026-08-20 — the Action Queue forward repair is
BLOCKED by a third unapplied migration" block under the migration-drift section,
including the fresh 20/20 `v_legacy_state` measurement so it is not re-derived.
Docs-only edit; no code, schema, or migration changes, and no production write.)

**Prior update:** 2026-08-19 UTC (third same-day edit)
**Updated by:** Claude (2026-08-19, third edit: records Cheek's approval of
One-Tent Loop **Tranche B+** — the efficiency program's second tranche — with
Claude explicitly reassigned as architect and implementer for B+ only.
Approval covers the design at
`docs/superpowers/specs/2026-08-19-one-tent-loop-efficiency-design.md`, owner
decisions D4/D5/D7, and the design's §11 copy; baseline at
`docs/one-tent-loop-efficiency-baseline.md`, both verified at deploy tip
`e012b633`. See the "Current approved slices" section for the tranche record.
Docs-only edit; no code, schema, or migration changes.)

**Prior update:** 2026-08-19 UTC (second same-day edit)
**Updated by:** Claude (2026-08-19, later edit: Quick Log errors/diagnostics
slice on `claude/quicklog-errors-diagnostics-c06rci` (owner-assigned). Adds the
2026-08-19 production re-measure block under the second-drift section: the
Quick Log manual-save catalog now matches the 20260818010000 forward-repair
end-state in production, `quicklog_entry_revisions` and
`diary_entries.retracted_at` are now PRESENT (superseding the 2026-08-15/16
absence findings), and a rolled-back end-to-end probe of
`quicklog_save_manual` passed on every axis. No schema changes; no migrations
applied by this slice.)

**Prior update:** 2026-08-19 UTC
**Updated by:** Claude (2026-08-19: records Cheek's approval of One-Tent Loop
**Tranche A** — five context-threading wiring PRs — and lands the implementation
specification at `docs/specs/one-tent-loop-tranche-a-specification.md` for the
Codex handoff. Docs-only; no code, schema, or slice-scope changes. See the
"Current approved slices" section for the tranche record.)

**Prior update:** 2026-08-18 UTC
**Updated by:** Claude (2026-08-18, third same-day edit: re-applies the Lovable
project Knowledge as Version 2026-08-18.1 at Cheek's instruction, sourced from
this file at deploy tip `87ae05e` (#1026) after the archival slice merged.
Snapshot: `docs/lovable/verdant-project-knowledge-2026-08-18.md` (9,979/10,000
chars). Pre-write read confirmed the live field matched the committed
2026-08-15 snapshot exactly. Live `/version.json` re-measure was `BLOCKED`
from the agent session (network policy 403), so the pack carries the
2026-08-15 stamp labeled as last measurement. Topology row refreshed to
fetched tip `87ae05e` (#1026). Still no Knowledge sync automation authorized.
Does **not** apply migrations or set Day 0.)

**Prior same-day update:** 2026-08-18 UTC
**Updated by:** Claude (2026-08-18, later edit: executes the Cheek-approved
Tranche 1 of `docs/specs/current-state-archival-slice.md`. Moves, verbatim, to
the new `docs/agents/CURRENT_STATE_ARCHIVE.md`: the superseded
update-attribution chain (2026-08-13 → 2026-08-15), the deploy-head validation
body pinned to `5611b130e81a`, the five "Completed, out of slice" records
(2026-08-07 → 2026-08-18), and resolved blocker 6; relocates the
release-provenance runbook to `docs/release-provenance-runbook.md`. Each move
leaves a pointer with its still-live takeaways. Nothing under a ⚠️ heading and
no open item moved. The archive is never imported by `CLAUDE.md`;
`check-sentinel-version-parity.mjs` verified PASS with 0 governance files
changed. No production, GA4, GSC, sitemap, or release-identity row was
re-measured in this edit. Does **not** apply migrations or set Day 0.)

Older update-attribution entries (2026-08-13 → 2026-08-18) are archived
verbatim — see `docs/agents/CURRENT_STATE_ARCHIVE.md`.

This is the changing shift report. Permanent rules live in `/AGENTS.md`; do not edit
that constitution to record branch, deployment, blocker, or assignment changes.

Every agent reads this file before acting. If a current owner instruction or verified
repository state is newer than this snapshot, report the difference and update this file
inside the active governance handoff.

---

## 🎯 STANDING DIRECTIVE — production is the target, not sandbox (recorded 2026-08-25)

**`source claim`, Cheek, 2026-08-25 in session:** _"from now on we are working towards
production and not sandboxing."_ Scope confirmed in the same exchange as **full production
posture** — it sets the direction of all work: targets, data, and payments.

**This is a direction, not a blanket authorization.** Recorded that way deliberately,
because this file's own history is a catalogue of standing notes later read as licence.
Every gated action listed below still needs its own explicit release from Cheek. "We are
working towards production" releases none of them by itself.

### What it does change

| Axis               | From                                    | To                                                     |
| ------------------ | --------------------------------------- | ------------------------------------------------------ |
| Reference database | sandbox project `bzatgtgjvuojpoxcknaa`  | production `knkwiiywfkbqznbxwqfh`                      |
| Reference build    | spikes, previews, local replay          | the deploy branch, and what production actually serves |
| Payments intent    | sandbox-only checkout as settled policy | live checkout is the goal                              |

Sandbox keeps every use it is actually for — local replay, e2e fixtures, the
`chromium-mocked` project, the restricted-role harness. What ends is **reasoning about
production from a sandbox observation**. This file already records why that was never
safe: sandbox is far behind production on Quick Log, and the 2026-08-19 measurement had
to say so in as many words.

### What it does NOT change — each needs its own explicit lift

1. **Publishing is still stopped by owner order** (2026-08-22). Not lifted by this row.
2. **Do NOT GitHub-APPLY `20260813030000_signup_acquisition_forward_repair.sql`.**
   Unchanged and unconditional — that file re-issues an unguarded `handle_new_user` and
   would overwrite the live `RAISE LOG` guard from `20260821150000`. That is a production
   incident before this directive and after it.
3. **No migration reaches production by merging.** The second-drift section still governs.
4. **The Hard Safety Rules are not a sandbox artifact.** Approval-required Action Queue,
   no device control, no fake live data, cautious AI, source-labelled telemetry — none of
   these were sandbox-only caution, and "production posture" relaxes none of them. If
   anything they bind harder now, because the blast radius is real growers.

### Payments — measured status at deploy tip `823f4c8f0`, 2026-08-25 17:11 UTC

**Half of the move has landed. The half that decides whether checkout actually works has
not.** `established fact`, read at that tip:

- **#1124 (`d4b344d3e`, merged 2026-08-25 16:54:25 UTC) changed the BUILD gate only.**
  `scripts/assert-paddle-production-sandbox.mjs` now accepts a single `test_` **or**
  `live_` `VITE_PAYMENTS_CLIENT_TOKEN` through `resolveCanonicalPaddleProductionToken`,
  failing closed only on missing, multiple, malformed, or non-Paddle values.
- **The RUNTIME still fails closed on `live_`.** `resolvePaddleCheckoutEnvironment`
  (`src/lib/paddleEnvironment.ts:87`) returns `"sandbox"` only for a `test_` token and
  `"unavailable"` for every other class **on every host**; the module header still states
  the sandbox-only policy.

**So a publish today would still disable checkout.** The build would pass and the grower
would still meet _"Checkout disabled: Verdant currently supports Paddle sandbox testing
only."_ **Do not read #1124 as having enabled live payments** — it removed a build-time
blocker, not the runtime one.

**Corrected 2026-08-25 on PR #1125, after Copilot review — an earlier draft of this row
called the remaining work "small and contained: one function, one message constant and the
module header ... plus the single call site". That was measured too narrowly and is
withdrawn.** The resolver is one of **six** independent sandbox-only runtime gates, and the
five others each fail closed on their own, so changing the resolver alone would leave
checkout still unable to open:

| Gate                        | Location                                                                                                                 |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| resolver                    | `src/lib/paddleEnvironment.ts:87`                                                                                        |
| Paddle.js load              | `src/lib/paddle.ts` `initializePaddle()` — throws unless `env === "sandbox"`                                             |
| hardcoded SDK env           | `src/lib/paddle.ts` — `Paddle.Environment.set("sandbox")`                                                                |
| price lookup                | `src/lib/paddle.ts` `getPaddlePriceId()` — throws unless sandbox, and sends `environment: "sandbox"` in its request body |
| checkout hook, presentation | `src/hooks/usePaddleCheckout.ts:124`                                                                                     |
| checkout hook, open path    | `src/hooks/usePaddleCheckout.ts:137`                                                                                     |

A seventh fence sits outside the client: the production bundle attestation in
`.github/workflows/quicklog-smoke.yml` fetches the hardcoded production origin and rejects a
live token in the shipped bundle, so it fails the moment a live build ships.

None of this is approved by this row. It is a billing-surface change needing an
owner-approved slice with a named independent reviewer, per `AGENTS.md`. The full audit,
the sequencing argument, and the prerequisites are specified in
`docs/specs/paddle-live-checkout-runtime-slice.md`, which must be read together with the
pre-existing `docs/paddle-paid-launch-runbook.md` — that runbook already states the live
transition must be **one** independently reviewed release changing client, token, server
environment, secrets, price IDs, monitoring and rollback **together**, and that flipping any
single setting is insufficient and must fail closed.

### The build-time token question is NOT answered — corrected 2026-08-25 (Codex review, PR #1125)

**Renamed from "...is now ANSWERED — by #1124, not by measurement here."** That heading
overclaimed. Raised by Codex review on this PR, verified against the guard's own source
before accepting: `scripts/assert-paddle-production-sandbox.mjs`, at the head this PR
carries, widened which token **class** passes (`test_` or `live_`, via
`resolveCanonicalPaddleProductionToken`, per #1124) but did **not** remove the exact-match
requirement between the effective (Vite-resolved) token and the canonical token read from
the committed `.env.production` file —
`if (effective.token !== canonical.token) return fixedFailure("effective_paddle_token_mismatch")`
still governs, unchanged by #1124.

**That contradicts candidate 1 as originally stated here.** Candidate 1 is a platform value
injecting `live_` via the ambient Vite environment while the committed `.env.production`
stays `test_` — which the file is deliberately kept at, per policy. Effective and canonical
would then differ by construction, and this guard would **fail the build**, not pass it.
Read literally, candidate 1 is inconsistent with a successful build under the guard as it
exists today — the opposite of "answered."

**What this reopens, not closes.** Two explanations are consistent with what's measured and
neither is confirmed: (a) whatever publish path produced the historically-observed `live_`
bundle did not run this guard at all — consistent with the still-open `NOT_MEASURED`
question, recorded in the payments-token section below, of whether the publisher invokes the
package lifecycle (`prebuild` → this guard) in the first place; or (b) the committed
`.env.production` itself briefly carried a `live_` value at build time and was restored
afterwards — candidate 2, which this file has said from the start not to discard. This
correction does not choose between them.

The body below is left as originally written — it correctly hedged the injection claim as
`source claim` from #1124's own PR body, not a re-measurement — only the heading's "ANSWERED"
framing is withdrawn.

This file has carried two live candidates for how a `live_` token reached production JS
while both `.env.production` files read `test_`. **#1124's own body names the mechanism:
"Production publish must accept `live_` because Lovable injects it at publish."** That
is candidate 1 — a platform-injected value overriding the file — and it is `source claim`
from that PR body, not something re-measured here.

Two consequences, both worth stating precisely:

- The standing instruction to **re-read the Lovable `.env.production` before anyone opens
  the publish button** loses its point _as a token check_: the file was never going to
  show an injected value. Reading it was correct while the mechanism was unknown. It was
  never a clearance, and it is not one now — and per the correction above, it is now the
  ONLY check that can still distinguish the two candidates ahead of a publish.
- **This does not settle the `treeHash` / `dirty: true` provenance question.** Under
  candidate 1 the workspace `.env.production` never differed, so it contributed nothing to
  the tree-hash mismatch — which stays `NOT_MEASURED` and attributable to some other file.
  #1108 (`3345fbfa5`) ships a candidate remedy in `scripts/stamp-version.mjs`; its own
  release note is correctly cautious, requiring production to _demonstrate_ `dirty: false`,
  a non-orphan ref, and the merged tip SHA before anyone calls it fixed. That demonstration
  requires a publish, which remains stopped.

### #1127 landed while this PR was open — new evidence for candidate 2, not candidate 1

**Recorded 2026-08-25, merged to base as `75c01e6f8` after this PR's revision 6.**
`fix(publish): restore .env.production from HEAD before prebuild stamp (#1127)`'s own body
states the mechanism directly: **"Lovable Payments Live injects a `live_`
`VITE_PAYMENTS_CLIENT_TOKEN` into tracked `.env.production`"** — into the committed **file**
on disk, not an ambient environment variable left the file untouched. `source claim` from
that PR's own account, not independently re-verified in this correction. That is candidate 2
as this file has named it from the start, not candidate 1 as the "now ANSWERED" heading
(withdrawn above) had credited.

**This also resolves the contradiction the correction above raised, if #1127's account is
right.** `assert-paddle-production-sandbox.mjs` reads the canonical token from the
`.env.production` file on disk, and Vite's `loadEnv` also resolves `.env.production` from
disk (not only ambient `process.env`). If Lovable rewrites that file in place before the
guard runs, both reads see the identical rewritten value and the exact-match check passes
cleanly — no contradiction. Candidate 1 (a pure env-var override that leaves the file
untouched) would still fail the guard for the reason given above; it is candidate 2 that is
consistent with a passing build.

**It also gives a first-party account of the `treeHash` / `dirty: true` mechanism this file
has tracked since 2026-08-21.** `.env.production` sits in `TREE_HASH_ROOTS` precisely because
`VITE_*` values reach shipped JS (`scripts/lib/tree-hash.mjs`'s own comment says so); a file
rewritten on disk immediately before the stamp runs goes dirty by the same mechanism any
other hashed-root file would. #1127 prepends a from-HEAD restore to `prebuild` specifically
to make that rewrite a no-op for `treeHash`/`dirty` going forward. Its own safety verdict is
explicit that this does **not** by itself authorize live checkout or claim production
`dirty: false` — that still requires a fresh publish that actually demonstrates it, and
publishing remains stopped.

**Status: `source claim` from #1127, carried here because it directly narrows the
candidate-1-vs-2 question, not independently measured in this correction.** Whether Lovable's
publish behavior actually matches #1127's account, and whether its fix in fact produces
`dirty: false` on the next publish, are both open until that publish happens and is read.

### A dated gate that expires tomorrow

`config/dependency-lockfile-transition.json` carries `reviewBy` **2026-08-25** and
`check-bun-lockfile-policy.mjs` compares strictly greater. Verified at this tip: the script
returns **OK today** (exit 0) and first **fails 2026-08-26 UTC**. Whether a ruleset-required
context invokes it against the real clock is `NOT_MEASURED` — the policy test is largely
fixture-driven, and the standing invocation found is `dependency-security-ci.yml`, which is
not one of the 35 required contexts. Owner-gated decision either way, unchanged by this
directive; recorded so it is not met as a surprise.

---

## 🔁 2026-08-25 19:48 UTC re-measure — production republished, and the served commit IS NOT IN GITHUB

**This block supersedes every release-identity, publish-lag and payments-bundle row below
it.** Those rows keep their own older dates and are stale; read this first.

`established fact`, measured first-hand 2026-08-25 19:48 UTC.

| Axis                       | Value                                                                      |
| -------------------------- | -------------------------------------------------------------------------- |
| Deploy tip                 | `2e7002b69` (#1094)                                                        |
| Production serves          | `e8f4e7c2fe059e5f6c9089dbb3829418bf82f7d8` / `e8f4e7c2fe05`                |
| `buildTime` / `commitTime` | `2026-08-25T18:05:30.499Z` / `2026-08-25T18:02:53Z`                        |
| Provenance flags           | `dirty: true`, `ref: "__orphan__"`, `ciRunId: null`, `commitSource: "git"` |
| `treeHash`                 | `bcb08cd3ae1a…`                                                            |
| Ancestry                   | **NOT AN ANCESTOR — the commit does not exist in the GitHub repository**   |
| Publish lag                | **NOT COMPUTABLE** — see below                                             |

**Production republished today**, superseding `faea6e9c59ad` (2026-08-21), which this file
had recorded as live since 2026-08-22.

### The finding that matters: the served commit is not a GitHub commit

`git fetch origin e8f4e7c2fe05…` returns **`fatal: remote error: upload-pack: not our ref`**.
The object is unknown to the remote; no remote branch contains it.

Two consequences, both correcting long-standing framing in this file:

1. **"Publish lag = N first-parent commits" is not a measurement that can be taken.** It
   presumes the served commit is an ancestor of the tip. It is not. Every lag figure this
   file has carried assumed an ancestry that no longer holds. Do **not** compute or quote a
   lag number against this build.
2. **`ref: "__orphan__"` has a candidate explanation, not a proven one — corrected in
   revision 11 (Codex P2) of the companion payments spec (PR #1125).** `git fetch origin
<sha>` returning `not our ref` proves the SHA is absent from `origin`; it does not by
   itself prove _how_ it got that way. "The publisher's workspace commits locally, unmoored
   from GitHub's history" is one mechanism consistent with that absence — it is not the only
   one a rebase, squash, or re-commit of otherwise GitHub-derived content, or a build sourced
   from a different remote, would produce the identical symptom. `stamp-version.mjs:117-122`
   does stamp whatever `git rev-parse HEAD` reports locally, faithfully — that much is
   confirmed by source — but "faithfully" describes the _stamping_, not the _cause_ of what
   HEAD happened to be. Held at `NOT_MEASURED`: the causal mechanism. Unaffected, and still
   measured: the observation itself — this SHA is unrecognized by GitHub.

### The build-time token question — see the candidate-2 block above, not here

**Deliberately not restated.** A parallel session recorded the candidate-1-vs-2 resolution
at "#1127 landed while this PR was open" above, in more depth than this block did — it also
explains why candidate 1 would have failed `assert-paddle-production-sandbox.mjs` while
candidate 2 is consistent with a passing build. That account governs. An earlier draft of
this block duplicated it and was trimmed on merge rather than left to contradict it.

### #1127's effect is PROSPECTIVE, and one question about it is open

Verified at the merged tip: `prebuild` now runs
`restore-env-production-from-head.mjs` **first**, ahead of `assert-paddle-production-sandbox.mjs`
and `stamp-version.mjs`.

**It is not in the live build.** #1127 merged 19:16 UTC; the served build was stamped
18:05 UTC. Re-measured the same window: the entry bundle is now
`/assets/index-ED0o2atf.js` (833,786 bytes) and still carries **1 `live_`-class token and
zero `test_`-class tokens**. Counts only — no token value was printed, logged, or stored.

**Open question, flagged not answered.** The restore reads `git show HEAD:.env.production`.
**Corrected in revision 11 (Codex P2) of the companion spec:** the sentence originally here
said "the served SHA being an orphan commit unknown to GitHub shows the publisher does
commit locally" — restating, as settled, the exact causal claim point 2 above now holds at
`NOT_MEASURED`. It is not settled. What the fetch failure actually supports is narrower: it
says nothing about whether the publisher's workspace commits the injected file at all, let
alone in what order relative to injection. _If_ it does, `HEAD` may already carry the
injected `live_` value, and restoring from it would restore the injection rather than the
committed sandbox class, making the fix a no-op — but that "if" is exactly what is not
established. Whether Lovable injects before or after any such commit is **`NOT_MEASURED`**,
on narrower grounds than this paragraph originally claimed. Do not record #1127 as proven
until a publish demonstrates `dirty: false` and a `test_`-class bundle — which is exactly the
demonstration #1127's own release note asks for.

**Nothing here authorizes a publish.** The stop-order stands; this is measurement only, and
no agent published — production republished on its own account at 18:05 UTC.

---

## 🔒 Supabase Preview — the 42P07 replay failure has NO PR-side workaround (recorded 2026-08-26)

**Why this is here:** the `Supabase Preview` check fails on every PR branch with the same
error, and the fixes that look obvious are each wrong in a way that is not obvious. Recorded
so the next agent does not re-derive a dashboard workaround that cannot work, or reach for a
published migration.

### What is observed — `established fact`

`Supabase Preview` fails on preview-branch creation with:

```text
ERROR: relation "ai_credit_grants" already exists (SQLSTATE 42P07)
At statement: 0
CREATE TABLE public.ai_credit_grants (…)
```

Seen on PR #1135 at 02:04:28 UTC and again at 03:10:49 UTC on a later head, and on PR #1131.
It is not branch-specific and not diff-specific: neither PR contains a migration.

**Cause.** Two committed migrations create the same table:

| File                                                      | Role                                        |
| --------------------------------------------------------- | ------------------------------------------- |
| `supabase/migrations/20260721103000_ai_credit_grants.sql` | canonical — the one production records      |
| `supabase/migrations/20260721182752_4fc51714-…sql`        | a later Lovable export repeating the ledger |

**The repository already declares this.** `config/local-supabase-replay-compatibility.json`
carries a `compatibility_noops` entry naming both files by path and SHA-256, whose `reason`
field names this exact SQLSTATE. A sibling entry covers `20260721105000` vs `20260721194154`.

**The gap.** That mechanism rewrites a _disposable copy_ in a local workdir. Supabase's
hosted preview pipeline replays the committed files directly and never reads that config, so
the declaration cannot help it. The sanctioned mechanism is working exactly as designed and
still does not cover this surface.

### What does NOT work — `source claim`, Cheek, 2026-08-26 in session

Recorded as the owner relaying vendor behaviour. Not independently verified from inside this
repository, and not verifiable from here — no agent should re-test it by trial against a live
project.

1. **The dashboard 3-step path (create → Pull → Migrate) is `NO`.** Dashboard create still
   "replays the migration history from your main branch against a fresh database." Pull
   initialises the table, then Migrate runs the same files. Same `ai_credit_grants` 42P07.
2. **`PATCH /v1/branches/{id}` can set `git_branch` later**, but the docs do **not** say that
   writes the `Supabase Preview` check on a PR, and do **not** say it skips first-create
   replay. Do not assume either.
3. **The supported GitHub Preview flow is: open or reopen the PR → empty DB → full file
   replay.** Incremental "new files only" begins **only after that first create succeeds** —
   which is the step that fails here.
4. **Next leverage is Supabase Support**, for an undocumented ledger-inherit. Not a dashboard
   workaround, and not editing published migrations.

**Corollary — the bot's own advice is the trap.** The `supabase[bot]` comment on every PR
reads _"Close and reopen this PR if you want to apply changes from existing seed or migration
files."_ That is precisely the path in (3): it re-runs the full replay and fails again.
Closing and reopening a PR is not a remedy here.

### What this does not license

**Do not edit, gut, or no-op either migration.** Merged migrations are permanent history
(`AGENTS.md`, Migration Immutability). The `Published migration integrity` gate compares
SHA-256 against the base branch and will fail the PR. "This migration is broken and could
never have succeeded anywhere" is named in the constitution as the specific reasoning that is
seductive and wrong.

`20260813030000_signup_acquisition_forward_repair.sql` is **unrelated** to `ai_credit_grants`
and its hard stop is untouched by anything in this section.

### Merge impact — `established fact`

`Supabase Preview` is **not** a required context. It appears in neither `required` (35
contexts) nor `mustBeGreen` (1) in `config/required-status-checks.json`. A red
`Supabase Preview` does not block the merge queue and is not grounds for holding a PR.

| Axis                                    | Status         |
| --------------------------------------- | -------------- |
| Preview-branch creation on any PR       | `FAIL`         |
| Cause identified                        | `PASS`         |
| Repo-side remedy available              | `BLOCKED`      |
| Vendor behaviour independently verified | `NOT_MEASURED` |
| Support request raised                  | `NO_DATA`      |

---

## ✅ RESOLVED 2026-08-21 — attributed signups hard-fail

**Status 2026-08-21: RESOLVED. The forward repair is applied to production
and the outage is closed.** The block immediately below is preserved verbatim
for its diagnosis and evidence — it is still an accurate description of the
bug that was fixed — and the original 2026-08-13 status line is superseded.
See the dated resolution subsection at the end of this section for what
changed and what was verified.

**Status 2026-08-13 (superseded): OPEN. Fix merged, NOT applied. Production is still broken.**

Account creation aborts for any signup carrying an allowlisted acquisition source —
including the front-door CTA on `/` and `/welcome`. The live `handle_new_user`
INSERTs into `public.signup_acquisition_attributions`, which does not exist, and that
INSERT sits outside the function's EXCEPTION block. Result: `42P01` → the AFTER INSERT
trigger on `auth.users` aborts → the row rolls back → GoTrue returns HTTP 500
"Database error saving new user". **The account is never created.**

Not every signup: Google OAuth, magic link, and a bare `/auth?mode=signup` resolve to NULL
and still succeed. **Do NOT extend that to "traffic carrying its own utm params is fine".**
`Landing.tsx:60` falls back to `landing_page` for an absent, partial, or unrecognized inbound
tuple and then rebuilds the signup URL with the exact allowlisted triple, so any visitor who
lands on `/` or `/welcome` first — the normal path for an ad click or a search result — is
re-attributed and fails. Only a non-exact tuple supplied **directly to `/auth`** is unaffected.

Fix is `supabase/migrations/20260813030000_signup_acquisition_forward_repair.sql`, merged
in #969. **Merging did not fix it** — only a Lovable apply does, and the frontend half was
already deployed ahead of the repo.

**Full detail, evidence, apply steps and post-apply verification:**
`docs/signup-attribution-outage-operator-runbook.md`

### 2026-08-21 resolution — the forward repair is APPLIED, the live outage is CLOSED

`established fact`, applied 2026-08-21 by Claude through the same Lovable SQL
channel used for the Action Queue repairs above, at Cheek's authorization in
session to act on the three items left open at the end of that prior work.

`supabase/migrations/20260813030000_signup_acquisition_forward_repair.sql` was
applied to production **verbatim** — transcription verified before any
statement executed, by wrapping the exact file bytes in an md5 guard and
checking them against the runbook's pinned identity (SHA-256 `6c002ab6…`,
17297 bytes) rather than trusting a copy-paste. The first attempt caught a
real one-character transcription slip (a stray leading newline from this
session's own dollar-quote formatting) and aborted with **zero writes** before
it could apply anything wrong; the corrected retry succeeded.
`public.signup_acquisition_attributions` and all four functions
(`handle_new_user`, `record_signup_acquisition_first_touch`,
`signup_acquisition_operator_snapshot`, `signup_to_paid_operator_snapshot`)
now exist in production.

**A rolled-back, zero-committed-write functional probe exercised the exact
failure path this section describes** — an allowlisted acquisition source
through `handle_new_user` — and passed all 8 assertions checked (BEGIN …
ROLLBACK throughout; the first attempt hit a permission-denied error writing
probe results while impersonating `authenticated` against an ungranted temp
table, was restructured so the role switch wraps only the privileged calls,
and then passed clean).

**The merged migration never revokes `service_role`** — zero occurrences of
the string anywhere in the 456-line file, confirmed by grep before relying on
it. On this hosted project's legacy default privileges (the same posture
`supabase/seed.sql`'s header documents for tables, now confirmed by direct
probe to extend to functions too), a freshly created table or function grants
`service_role` full access automatically with no explicit `GRANT` — the
identical class of gap this file already records for the Action Queue guard.
An ad-hoc supplemental `REVOKE ALL ... FROM service_role` on all five objects
was issued through the same channel immediately after the forward repair, so
production is not just fixed but hardened.

**That ad-hoc supplement is now captured in version control**, so it is not
left to silently drop out of a future replay the way the Action Queue's
initial state very nearly was:
`supabase/migrations/20260821064300_signup_acquisition_service_role_hardening.sql`
is a new additive migration (`20260813030000` itself is untouched, per
Migration Immutability Rules) that revokes `service_role` on the table and
all four functions, with a preflight that fails closed if the prerequisite
objects are absent and a postflight that asserts `service_role` holds nothing
while `authenticated`'s intended grants survive unchanged. Validated against a
local PostgreSQL 16 replay under a simulated permissive-default-privilege
regime reproducing this project's posture: applies cleanly after
`20260813030000`, hardens all five objects, is idempotent on re-run, and
fails closed with zero writes when the prerequisite objects are missing.
Static contract tests:
`src/test/signup-acquisition-service-role-hardening-migration.test.ts`
(7 tests), adversarially verified — a real injected
`GRANT ... TO service_role` statement was caught before the test was trusted.

**This new migration has not itself been re-applied to production**, and does
not need to be: production already carries the ad-hoc supplement's effect.
The migration exists so a fresh replay, CI reset, or disaster-recovery restore
reaches the same hardened end state instead of silently reopening the gap —
not to change production's current state, which is already correct. Applying
it to production anyway would be safe (`REVOKE` is idempotent and its
preflight would simply confirm the prerequisites it expects), but that is
deliberately left for a normal migration-apply pass rather than a second
ad-hoc production SQL session, in keeping with "fix things ... rather than
widening scope."

**Ledger name-rows (supersedes the same-day "no ledger row" claim above).**
At apply time #1080 recorded that no agent session wrote
`supabase_migrations.schema_migrations` for either signup version. A later
same-day **founder ledger backfill** (2026-08-21, marker
`ledger-only;objects-already-applied;no-rerun`, `created_by`
`founder-ledger-backfill`) inserted name-rows without re-running the files:
`20260813030000` / `signup_acquisition_forward_repair` and
`20260821150000` / `signup_acquisition_failure_safe_attribution`, plus seven
legacy name-rows (`20260515204616`, `20260515204637`, `20260515211702`,
`20260714231627`, `20260715002000`, `20260716215516`, `20260721107000`).
`20260721194325` was already present. **`20260821064300` is still not in the
ledger** — leave it unrecorded; ACLs on the objects it names already match
except the new readiness RPC (see next paragraph). Object presence remains
ground truth; the drift probe remains blocked for the two reasons already
recorded in the next section.

### 2026-08-21 ~15:23 UTC — failure-safe guard live; HARD STOP on GitHub APPLY

`practical observation` / point-in-time, measured 2026-08-21 ~15:23 UTC by
Grok via Lovable `query_database` on production project
`66255e7b-892c-4be5-8686-ab1cfc3666db` (not the sandbox):

- `public.signup_acquisition_attributions` exists
- three helper functions exist
- `handle_new_user` md5 `34405b3ee446340a55ad4f25e2193c9a` with **`RAISE LOG`
  guard text present** — applied from existing file
  `20260821150000_signup_acquisition_failure_safe_attribution.sql` via
  Lovable SQL; **not** via the GitHub apply-signup workflow
- `signup_acquisition_readiness_operator_snapshot` exists
- `handle_new_user` EXECUTE denied to `anon` / `authenticated`
- table has no `service_role` ACL; the original four functions have no
  `service_role`. Readiness RPC **does** have `service_role=X` (default
  privileges leftover)
- **Do not call the 42P01 table-missing outage still OPEN** — it is CLOSED

**Hard stop — do not GitHub-APPLY `20260813030000`.** That migration body
would re-issue an **unguarded** `handle_new_user` and overwrite the live
`RAISE LOG` guard. The GitHub apply-signup workflow still shows only the
failed PREFLIGHT; objects are already live through Lovable. Treating
"ledger name-row present" or leftover "still unapplied" prose as license to
APPLY that file is a production incident.

**What this does not change.** GA4/GSC baselines, Day 0, and the four-week
measurement clock are untouched. No schema beyond the table and functions
this migration and its predecessor define. No RLS, auth, or edge-function
change. The frontend attribution code (`Landing.tsx` and the signup URL
builder) was already deployed ahead of the repo per the original diagnosis
above, and was not touched by this repair.

---

## 🔶 Function default-privilege exposure — measured, not yet actioned (2026-08-21)

`practical observation`, measured 2026-08-21 by Claude via the same Lovable
`query_database` read-only channel used elsewhere in this file, against
Lovable project `66255e7b-892c-4be5-8686-ab1cfc3666db` — the same id two of
Grok's own same-day entries above label "production, not sandbox," and the
same id `docs/LOCAL_SUPABASE_SETUP.md` and
`docs/signup-attribution-outage-operator-runbook.md:61-64` independently map
to production Supabase ref `knkwiiywfkbqznbxwqfh`. **That identification was
disputed by a 2026-08-22 review comment and briefly downgraded here; the
2026-08-23 correction below restores it against the sourced mapping — read
that correction, not the 2026-08-22 one, before citing any count in this
section.** This is a coordination note, not a fix. Nothing here was changed,
drafted, or applied — see "What this does and does not license" at the end.

### Correction (2026-08-22) — the project-identity claim is disputed, not resolved

Grok (GDP)'s independent review of this section, posted on
[PR #1093](https://github.com/Verdant-OS/verdant-grow-diary/pull/1093), states
that Lovable project `66255e7b-892c-4be5-8686-ab1cfc3666db` is **not** the
production host — it names `knkwiiywfkbqznbxwqfh` as production instead (the
same ref this file's "Second production drift" section and
`scripts/lib/supabaseDatabaseTargetIdentity.mjs` use) — and says that id was
previously "a sandbox / yield-analytics Lovable project."

That contradicts, without reconciling, two of Grok's own entries earlier in
this file dated the same day: the ~15:23 UTC block above ("production project
`66255e7b-892c-4be5-8686-ab1cfc3666db` (not the sandbox)") and the "failure-safe
guard live" block a few lines below it ("via Lovable `query_database` on
production project `66255e7b-892c-4be5-8686-ab1cfc3666db` (production, not
sandbox)"). This note followed that same, already-established convention
rather than introducing a new claim.

Neither side is verified here. **This file has never recorded a checked
mapping between the Lovable _project_ id and the Supabase _database_ ref**
`knkwiiywfkbqznbxwqfh` — every "production, not sandbox" label to date,
including this note's, is a Lovable-UI-level assertion (which project the tool
was pointed at), never cross-checked against the codebase's own
identity source. Two attempts to resolve it via a metadata-only Lovable call
(`get_project`, not `query_database` — chosen specifically to avoid the
access question below) both timed out; not retried further.

**Separately, the same review asserts a standing owner lock: "production
`query_database` / enable_database on `knkwiiywfkbqznbxwqfh` is forbidden
(Cheek / GDP 2026-08-21)."** That restriction does not otherwise appear
recorded anywhere in this file. It is not disputed here, and no further
Lovable production query was attempted while writing this correction — but it
is also not yet independently corroborated in-repo. Whoever can confirm it
(Cheek, or Grok citing where it was set) should record it directly in this
file so it is citable on its own rather than through one review comment.

**Net effect: every count in this section is `established fact` about
whatever database `66255e7b-892c-4be5-8686-ab1cfc3666db` actually is, and
`NOT_MEASURED` — not `established fact` — as a claim about production
specifically**, until the project-id mapping above is actually checked and
recorded. Read every "production" reference below with that downgrade
applied; the text is left otherwise unchanged rather than silently rewritten,
per this file's own practice of keeping withdrawn or disputed claims visible.

### Correction (2026-08-23) — the 2026-08-22 correction overcorrected, and two further defects are fixed

Raised by Codex review on this same PR (#1093); verified against primary sources
before accepting rather than taken on the bot's word.

**1. The project-identity `NOT_MEASURED` downgrade above was itself wrong.** It
said "this file has never recorded a checked mapping between the Lovable
project id and the Supabase database ref" — false.
`docs/LOCAL_SUPABASE_SETUP.md`'s "Project identifiers" table (line 14) and
`docs/signup-attribution-outage-operator-runbook.md`'s "Provenance" section
(lines 61–64) both record exactly that mapping: Lovable project id
`66255e7b-892c-4be5-8686-ab1cfc3666db` = Supabase ref
`knkwiiywfkbqznbxwqfh`, because `query_database` "takes the Lovable UUID, not
the host ref." The runbook's record is dated 2026-08-13, attributed ("Run by:
Claude, during the pre-merge audit of #969"), and was the operational basis
for the signup-attribution fix this file's own RESOLVED section later
confirmed worked in production — this mapping has been acted on and its
consequences independently verified, not merely asserted once.

Grok's review comment that prompted the 2026-08-22 downgrade cites neither
document. It rests on "GDP previously used `66255e7b…` as a sandbox /
yield-analytics Lovable project," with no date or source given. Weighed
against a dated, attributed, operationally-confirmed in-repo record, an
uncited recollection does not carry it. **Restoring the 66/76 and 3/76
counts to `established fact` about production**, per the mapping above. If
Grok holds evidence this specific project was repointed or repurposed after
2026-08-13 — the one theory that would reconcile both claims — that needs its
own dated citation in this file, not a second uncited assertion; until then
this is the governing record.

**2. The "two functions... do not show the same exposure" uncertainty
(in the default-privilege-mechanism subsection below, later renamed — see
its own note) was a self-contradiction, not a
discrepancy.** It named both `handle_new_user()` and
`signup_acquisition_readiness_operator_snapshot()` as not showing
`service_role` EXECUTE. But this file's own ~15:23 UTC measurement, recorded
earlier in this same section, already says the opposite for the second
function: "Readiness RPC **does** have `service_role=X` (default privileges
leftover)" — which is not a discrepancy at all, it is exactly what the
default-ACL theory predicts for a newly created function. Only
`handle_new_user` actually lacks the exposure, and it has a mundane
explanation the original text missed: it is a `CREATE OR REPLACE` of a
function whose `service_role` EXECUTE was already explicitly revoked by the
2026-08-21 ad-hoc supplement (captured afterward as `20260821064300`)
_before_ `20260821150000` replaced its body — and `CREATE OR REPLACE
FUNCTION` does not reset an existing grant back to the default ACL. There is
no unexplained gap in the default-privilege mechanism; there is one
already-hardened function whose hardening survived a later body replacement,
exactly as expected.

**3. The "66... grant `service_role` EXECUTE by default" headline conflates
effective privilege with provenance — and this point's own first pass
overclaimed too, corrected on a second Codex review round on this same PR
before it even merged.** `has_function_privilege(role, function, 'EXECUTE')`
reports only whether a role currently has the privilege, by any path — an
explicit `GRANT`, `PUBLIC`, role inheritance, or an unrevoked default ACL —
never which one. At least 2 of the 66,
`supabase/migrations/20260719044601_4a9e443b-d980-4890-b85e-5ae6549a907f.sql:134`
and
`supabase/migrations/20260719052812_c25ba6a6-dcdb-40c7-9dbf-292b35af9150.sql:43-44`
(`founders_wall_count()` and `founders_seats_consumed()`), have migrations
that **explicitly, intentionally** `GRANT EXECUTE ... TO anon, authenticated,
service_role` — that much is established fact about the migration source,
and it does distinguish these two from a function whose access was never
deliberately authored at all.

**What that does not establish, on the corrected re-read: that the resulting
ACL entry actually originated from the grant rather than already being
present.** Both migrations `CREATE FUNCTION` first and `GRANT` several
statements later (verified: line 125 then 134 in the `founders_wall_count`
file). If the permissive default-ACL regime this section's own self-test
shows is live today was already in effect on 2026-07-19 when these functions
were created, `service_role` (and `anon`) EXECUTE would have landed on them
automatically at `CREATE` time, before the explicit `GRANT` ever ran —
making that `GRANT` a redundant restatement, not the origin. The final ACL
cannot tell the two paths apart once both converge on the same entry, and
whether that regime held as far back as July — three weeks before
`20260807133000` even attempted to harden it — is itself unmeasured. So:
**intentional authorization is established fact for these two; default-vs-
explicit origin for them is `NOT_MEASURED`, same as the other 64.** The
self-test still proves the default-ACL mechanism itself is live today; it
proves nothing about how many of the 66 — these two included — actually got
their `service_role` EXECUTE through it versus a grant that may have been
redundant. That per-function provenance check (`aclexplode`/`pg_default_acl`,
with creation-time evidence this repo does not have) was not done and stays
open for all 66, no exceptions.

**4. The third `anon`-set member does not check out against its own
migration, raised by a separate Copilot review comment on this same PR.**
`founders_guard_immutables()`'s only committed definition
(`supabase/migrations/20260719044601_4a9e443b-d980-4890-b85e-5ae6549a907f.sql:74-78`)
declares `RETURNS trigger LANGUAGE plpgsql` — no `SECURITY DEFINER` — and no
later migration redefines it (grepped, zero other matches). The catalog query
above filters on `p.prosecdef = true`, so this function should not have been
in its result set at all. Two explanations are consistent with what's
recorded and neither is confirmed: the live function differs from its
migration (unrecorded drift, the same class of gap this whole file tracks
elsewhere), or the original 3-function list is simply wrong about which
function is the trigger. Left open rather than guessed at — this also means
the "3 of 76" `anon` count itself, not just the "by default" framing, now
has an unresolved question mark on one of its three members.

**Why this was measured now.** `20260821064300` (this file's RESOLVED
signup-attribution section above) closed one specific instance of a pattern
— a function whose migration revoked PUBLIC/anon/authenticated but not
`service_role`. The Action Queue guard forward repair closed the same class
of gap for one other function. Two individually-found instances raised the
obvious question: how many more are there, and is the pattern actually
still live for newly-created functions, or purely historical?

### Confirmed: the scale of service_role exposure

```sql
SELECT count(*) FILTER (WHERE has_function_privilege('service_role', p.oid, 'EXECUTE')) AS service_exec_count,
       count(*) FILTER (WHERE has_function_privilege('anon', p.oid, 'EXECUTE')) AS anon_exec_count,
       count(*) AS total
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.prokind = 'f' AND p.prosecdef = true;
```

Returns **66 of 76** SECURITY DEFINER functions in `public` currently have
effective `service_role` EXECUTE, and **3 of 76** have effective `anon`
EXECUTE. The count itself is `established fact` — a direct count, not an
inference — against production, per the 2026-08-23 correction above
(restoring the 2026-08-22 downgrade). Read it in context, not as 66 new
incidents: `service_role` already holds broad direct table access on this
project by design (`supabase/seed.sql`'s own documented legacy-grant
posture), so function-level `service_role` EXECUTE is mostly consistent with
the platform's existing accepted trust model, not a new class of exposure.
**Corrected 2026-08-23, four times now on this one claim. The fourth
correction is not another number — it is the conclusion that counting by
text search does not converge, so this file stops trying.** In order: "two
functions" → "two slices, five functions" (the signup migration alone
revokes a table and four functions, not one —
`20260821064300_signup_acquisition_service_role_hardening.sql:71-75`) → a
Codex round found three more migrations doing the same thing → an
exhaustive-feeling `grep -rl "FROM service_role"` returned 11 files, six of
which turned out to be table revokes, not function revokes, once each was
read directly, leaving 5 verified function-hardening migrations (Action
Queue guard, Action Queue transition, signup's four, quicklog, and AI
credit pack's conditional legacy-signature cleanup) → a further round found
a sixth, `20260728103000_schema_audit_trust_hardening.sql:351-354` —
`REVOKE ALL ON FUNCTION public.admin_schema_audit(...) FROM PUBLIC, anon,
authenticated, service_role;` — a **multi-role REVOKE on one line**, the
exact blind spot the previous correction had already named as unchecked.
Verified directly, and it is real.

**Four passes, four different SQL shapes each missed by the pass before it**
(a bare single-role REVOKE, a table REVOKE misread as a function REVOKE, a
multi-role REVOKE, and — per the previous correction's own still-unchecked
caveat — a schema-wide `ON ALL FUNCTIONS`/`ON ALL ROUTINES IN SCHEMA` form
that remains unchecked now too. This repo's own migrations elsewhere
document that PostgreSQL 11+ accepts `ROUTINE` as an alias for `FUNCTION`
in these grants, which a search for the literal word `FUNCTION` alone would
also miss). That pattern is itself the finding: a grep-based census of
`service_role` REVOKEs across free-form SQL migration text is not a method
that terminates at a trustworthy number, no matter how many more rounds it
runs for.

**So this file drops the enumerated count and states only what is actually
supportable: individual function-level `service_role` hardening is
demonstrated, by direct citation, in at least six migrations spanning
2026-07-28 through 2026-08-21** (`schema_audit_trust_hardening`,
`ai_credit_pack_portability`, `quicklog_manual_delegate_forward_repair`,
both Action Queue forward repairs, and `signup_acquisition_service_role_hardening`),
**using at least three distinct REVOKE forms** (single-role, multi-role, and
conditional/legacy-signature). Whether the true total is 6, 10, or 20 is
`NOT_MEASURED` and this file will not guess at it again by grep; a
trustworthy census would need to query the live catalog (`pg_proc` /
`aclexplode`) or parse SQL properly, not pattern-match migration text. What
six independently-verified instances across three SQL shapes do establish:
this is not "two exceptional cases" and it is not a settled small number
either — it is routine enough, and varied enough in how it is written, that
"case-by-case, judged individually" is well supported without needing an
exact count. It still does not, by itself, license a blanket revoke across
all 66 — that remains a separate decision this note does not make.

**"By default" is this section's own headline word, and it overclaims — see
point 3 of the 2026-08-23 correction above.** `has_function_privilege` proves
current effective access, never its provenance. At least 2 of the 66
(`founders_wall_count`, `founders_seats_consumed`, immediately below) are
confirmed to have **deliberate, explicit grant statements** in their
defining migrations — but per point 3's own correction, whether that grant
is what actually produced their current ACL entry, versus the default-ACL
mechanism already having done so at `CREATE` time, is itself unmeasured, no
different from the other 64. The self-test in "Uncertain," below, proves the
default-ACL mechanism is live; it does not prove how many of the 66 actually
came from it versus a grant. Read "66... grant `service_role` EXECUTE" as
the accurate headline; "by default" is unproven per-function, for all 66.

**The `anon` set is the one worth an owner's eyes** — and, per correction
point 4 below, one of the three is now flagged, not confirmed. All 3 are
recorded as `founders_guard_immutables()` (returns `trigger`, not callable
as an RPC — Postgres refuses to invoke a trigger-typed function outside
trigger context regardless of its grants; **but see correction point 4: its
committed migration doesn't declare `SECURITY DEFINER`, so its presence in
this `prosecdef = true`-filtered list is itself unresolved**),
`founders_seats_consumed()`, and `founders_wall_count()` — the latter two are
`SELECT COUNT(*)::int FROM public.founders [WHERE status = 'confirmed']`, no
PII, and read like a deliberate public "X founders joined" counter, now
confirmed to have **deliberate, explicit grant statements** in their
migrations (correction point 3) — though whether those statements, versus
the default ACL already in effect at creation, are what actually produced
the current grant stays unmeasured, per the same correction. `inference`:
probably intentional either way. Not verified with Cheek.

### The default-privilege mechanism is confirmed live; migration provenance is not

**Renamed 2026-08-23 (Codex review, this PR).** This subsection's own
self-test below (a fresh throwaway function receiving `anon`/`service_role`
EXECUTE, and both `pg_default_acl` entries retaining those grants today)
directly confirms the mechanism is live — that was never actually in doubt
once the self-test ran. The heading previously said otherwise. What genuinely
stays open, narrower than the old heading implied: whether
`20260807133000` applied as committed, and which role executed its
unqualified statements and `20260821150000` — both already carried below,
neither about whether the mechanism itself exists.

`20260807133000_global_default_privilege_hardening.sql` REVOKEs
`EXECUTE ON FUNCTIONS` and `ALL ON TABLES` from `PUBLIC, anon` at the
default-privilege level, in four statements each for functions and tables.
**Corrected 2026-08-23 (Copilot review, this PR) — only two of the four
function statements explicitly say `FOR ROLE postgres`; the other two carry
no `FOR ROLE` clause at all**, so per Postgres semantics they target
whichever role executes the migration — which this same subsection says,
two paragraphs down, is unconfirmed. The original wording ("all of them FOR
ROLE postgres, explicitly or via the executing role") asserted the
executing role equals `postgres`; that is not established. Its own
postflight self-test creates a throwaway function and asserts `anon` gets no
EXECUTE.

Reproducing that exact self-test today, in a rolled-back transaction via
the Lovable SQL channel, **it fails** — a fresh throwaway function gets
`anon` **and** `service_role` EXECUTE. `pg_default_acl` shows two separate
default-ACL entries for functions in `public`: one owned by `postgres`,
which still lists `anon=X` and `service_role=X`, and a second owned by
`supabase_admin`. **Corrected 2026-08-23 — the claims that the `postgres`
entry was "unchanged by that migration" and that `supabase_admin` was
"never targeted at all" both overclaimed.** Whether the migration actually
applied as committed, and which role executed its two unqualified
statements, are exactly the open questions this subsection already carries;
neither can be assumed to answer itself. What's directly observed, and
stands: both default-ACL entries currently grant EXECUTE to
`anon`/`authenticated`/`service_role`. The identical two-bucket split exists
for tables too.

**Corrected 2026-08-23 (see the correction above, point 2) — this was a
self-contradiction, not a discrepancy, for one of the two functions.** This
subsection originally claimed both `handle_new_user()` and the new
`signup_acquisition_readiness_operator_snapshot()`, from Grok's own
`20260821150000`, failed to show `service_role` EXECUTE. This file's own
~15:23 UTC measurement, recorded earlier in this same section, already says
the readiness RPC **does** have `service_role=X` ("default privileges
leftover") — exactly what the default-ACL bucket predicts for a newly
created function, not an exception to it.

Only `handle_new_user()` actually lacks the exposure, and it has a mundane
explanation rather than an open question: it is a `CREATE OR REPLACE` of a
function whose `service_role` EXECUTE was already explicitly revoked by the
2026-08-21 ad-hoc supplement (captured afterward as `20260821064300`)
_before_ `20260821150000` replaced its body. `CREATE OR REPLACE FUNCTION`
does not reset an existing grant back to the default ACL, so a
previously-hardened function stays hardened across a later body replacement.
That is expected behavior, not a gap in the mechanism.

**Corrected 2026-08-23 (Codex review, this PR) — the sentence below
attributed this to the `postgres`-owned bucket specifically, silently
reverting to the assumption already disputed two paragraphs up.** Which
default-ACL entry actually applied to the readiness RPC at creation time
depends on `20260821150000`'s executing role — `postgres` and
`supabase_admin` each own a separate entry, and only the one matching the
object's creator governs it. That executor is unconfirmed, same as before;
`proowner` on the function itself was not checked either. Since both
entries currently show the identical `anon=X`/`service_role=X` pattern
(lines 764–766 above), either would explain what was observed, so the
observation cannot be used to name which one. Corrected: the applicable
default-ACL bucket — `postgres`'s or `supabase_admin`'s, still
`NOT_MEASURED` which — is consistent with both real migrations measured
here once each function's own grant history is accounted for: a brand-new
function (the readiness RPC) inherits whichever default ACL governs its
creator; a replaced function (`handle_new_user`) keeps whatever was already
explicitly granted or revoked on it. No corrective migration is implied by
either case.

### What this does and does not license

Confirmed: the 66/76 and 3/76 counts (effective privilege, not proven
per-function provenance — see correction point 3; and one member of the 3
is itself unresolved, correction point 4), against production
`66255e7b-892c-4be5-8686-ab1cfc3666db` / `knkwiiywfkbqznbxwqfh` (the
2026-08-23 correction above restores this after the 2026-08-22 downgrade),
and the self-test-fails-via-this-probe-channel result. Not confirmed: how
many of the 66 — all of them, no exceptions, including the 2 with deliberate
grant statements in their migrations (correction point 3, itself corrected
on re-review: intentional authorization is established for those 2, but
default-vs-explicit _origin_ is not) — came from the default-ACL mechanism
versus a grant; whether `founders_guard_immutables()` genuinely belongs in a
`prosecdef = true` population given its committed definition says otherwise
(correction point 4); or
whether any corrective migration is actually needed — the "real migrations
don't show the same exposure" question is resolved as of correction point 2,
not open. **No migration was drafted or applied.** No table, function,
grant, or default privilege was changed. This does not authorize anyone to
apply `20260807133000`-style `ALTER DEFAULT PRIVILEGES` changes on the
strength of this note alone — per-function grant provenance across all 66 is
still unchecked. Do not run a further production `query_database` /
`enable_database` call to settle this — Grok's review claims that surface is
owner-locked on `knkwiiywfkbqznbxwqfh` (2026-08-21), a claim this file does
not yet independently corroborate but that this note does not attempt to
test. Grok: if your migration-apply path can confirm which role actually
executes committed migrations against production, that fact is still open
and would resolve it — independent of the identity and exposure questions
above, both now settled.

---

## ⚠️ Second production drift — committed migrations are NOT auto-applied

**Recorded 2026-08-15 from a Lovable read-only investigation of production
`knkwiiywfkbqznbxwqfh`.** `source claim` for the production measurements; the
repository-side facts below were verified directly.

**Publishing does not replay `supabase/migrations/`.** It deploys the frontend
and edge functions only. Migrations reach production solely through the
operator's own apply path. This corrects an assumption stated repeatedly in
`docs/specs/postgres-restricted-role-alternative.md` (now fixed in its §5.4.1)
and it explains why the signup-attribution fix above was once "merged, NOT
applied" (historical as of 2026-08-15; the signup repair was applied
2026-08-21 — see the RESOLVED section. The publishing-vs-migration lesson
still stands).

**At least one further migration is unapplied, and it is not the signup one.**
`supabase/migrations/20260811090000_quicklog_corrections_retractions.sql` is
committed, but in production:

- `to_regclass('public.quicklog_entry_revisions')` → `null` (table absent)
- `public.diary_entries.retracted_at` / `.retraction_reason` → absent

**Shipped code depends on those objects.** Verified in this repo:
`useQuickLogRevisionBadges.ts` and `useRetractedQuickLogEntries.ts` both
`.from("quicklog_entry_revisions")`, and they mount through
`QuickLogHistoryPanels` / `QuickLogGroupedTimelineSection` onto **Timeline**,
**TentDetail** and **PlantDetail** — the One-Tent Loop spine.

**Failure mode is silent, not loud.** `useQuickLogRevisionBadges` does
`if (error) return new Map();`. So Quick Log revision badges and retracted
entries simply never render in production. No crash, no error surface, no
telemetry — the feature looks shipped and is invisible. That is a different and
in some ways worse shape than the signup outage, which at least fails loudly.

Exact drift count is `NOT_MEASURED`: `supabase_migrations.schema_migrations` was
`permission denied` for both roles available to the investigation, so only
"≥ 1 beyond signup" is proven, by object absence. The full migration ledger must
be reconciled against production before assuming anything else in the 265-file
directory is live — **and the tool that does exactly that already exists and has
never worked. Read the next section before building anything.**

---

## ⚠️ The migration-drift alarm has never once completed a measurement

**Recorded 2026-08-15 by Claude, answering Cheek's "migration ledger
reconciliation" ask.** The conclusion is **do not build a second tool — repair
the one that exists.** `scripts/probe-migration-drift.mjs` and
`.github/workflows/migration-drift-probe.yml` were written after the 2026-08-05
six-day outage precisely so six days could never pass unnoticed again, and they
are the right shape for this job. But the probe has **never returned a
measurement**, and — corrected here after a Codex review, see defect 3 — it
would not yet return a _correct_ one even if it connected.

**So the ledger stays `NOT_MEASURED` behind two independent blockers, not one:**
an owner-side secret that points at the wrong database over an unreachable
address (defects 1 and 2), and a repo-side matching defect that would misreport
Lovable-recorded migrations as drift (defect 3). Fixing the secret alone would
produce output, not truth. An earlier version of this section said "no new tool
is needed and none should be built" full stop; the first half stands, the second
half was wrong.

`established fact`, from the Actions API on 2026-08-15: the workflow has four
scheduled runs in its entire history, and all four concluded `failure`.

| Run           | Date (UTC)          | Outcome                                             |
| ------------- | ------------------- | --------------------------------------------------- |
| `31576932687` | 2026-08-12T08:07:36 | `failure` — probe step `skipped`, nothing attempted |
| `31680785295` | 2026-08-13T08:08:58 | `failure` — probe step `skipped`, nothing attempted |
| `31782504195` | 2026-08-14T08:05:40 | `failure` — `could_not_probe`, connection refused   |
| `31871667855` | 2026-08-15T07:19:42 | `failure` — `could_not_probe`, connection refused   |

**Re-run on demand 2026-08-15 at Cheek's instruction: identical.** Run
`31878986411`, `workflow_dispatch` on `verdant-grow-diary`, produced a
byte-for-byte identical `could_not_probe` payload — same sandbox host, same IPv6
address, same `Network is unreachable`. Steps 1–5 (checkout, Node, psql install,
`Require SUPABASE_DB_URL`) all passed; step 6 failed in **zero seconds**, dying
at the socket before its single `SELECT`. It also means there is no partial
result to salvage — the ledger question stays unanswerable from CI until the
secret is repointed.

Be precise about what the re-run rules out. The five runs share an outcome, not
a cause: **three** of them reached the socket and failed there identically
(14 Aug scheduled, 15 Aug scheduled, 15 Aug dispatch), while the 12–13 Aug pair
never reached it at all — the secret guard stopped them first. So the on-demand
re-run rules out a transient **in the connection failure**, on a sample of
three, and says nothing about the earlier pair. The 12–13 Aug failures are
already explained separately below.

**The alarm itself is working correctly. What is missing is remediation.** The
probe exits 2 for "could not check" rather than 0, exactly as its own header
demands ("A probe that cannot reach the database must never be mistaken for a
probe that found nothing wrong — that is exactly how a six-day outage stays
invisible"), and it opened a tracking issue on the first failure. Two issues are
open, with no human comment and no corrective action on either:

- **#912** — "Migration drift: production is not running every committed
  migration", open since 2026-08-12, last updated 2026-08-15T07:20:04Z, three bot
  comments.
- **#916** — "Money migration check (production) requires attention", open since
  2026-08-12.

State the gap precisely, because the two diagnoses lead somewhere different. What
is established is that the alarm went red on 2026-08-12 and the underlying secret
was still wrong on 2026-08-15 — an unremediated fault, four days running. What is
**not** established is that nobody read it: open issues and an uncorrected secret
do not measure readership, and in fact the alert has demonstrably been read, since
Cheek ordered the on-demand re-run recorded above. So the reconciliation question
is not "how do we measure drift", and not "why did nobody see the alert" — it is
"why has a seen, correctly-raised alarm gone four days without the secret edit
that would let it run". Point the next owner at infrastructure remediation, not
at notification plumbing — and note that the secret edit alone is necessary but
not sufficient, per defect 3 below.

### Two stacked defects — observations are `established fact`, remedies are not

Each defect below separates what the run output and the source actually show
from what is reasoned on top of it. The observations are `established fact`; the
proposed fixes are `inference` and are labelled as such.

**1. The workflow named "production" is pointed at the SANDBOX project.** The
verbatim `detail` in #912's last two comments names the host
`db.bzatgtgjvuojpoxcknaa.supabase.co`.
`scripts/lib/supabaseDatabaseTargetIdentity.mjs` pins `bzatgtgjvuojpoxcknaa` as
**`sandbox`** (line 11) and production as `knkwiiywfkbqznbxwqfh` (line 15). The
At the time of this 2026-08-15 snapshot, the `verdant-production` GitHub environment's
`SUPABASE_DB_URL` therefore held a sandbox connection string. **Historical, superseded current
state:** Cheek stated on 2026-08-26 that `verdant-production` has 0 secrets. This toolkit slice did
not re-probe either state. If the historical connection had succeeded, it would have measured the
wrong database and reported the result as production.

The reason nothing caught that: `scripts/probe-migration-drift.mjs` **does not
import `supabaseDatabaseTargetIdentity.mjs` at all** — verified by search, zero
references. It trusts the secret's name, and that module's own header states the
principle it is missing: _"A secret name is not proof of where its connection
string points."_

**Do not read that as "every other gate is protected" — it is not.** An earlier
draft of this section claimed exactly that and it is false, corrected here after
a Codex review challenged it. Measured 2026-08-15: **14** files reference the
identity module — the money/core migration gates
(`required-money-migrations.yml`, `required-core-migrations.yml`,
`prefix-diff-sarif.yml`) and the pinned-apply and candidate-number tooling —
while **25** scripts consume a `SUPABASE_DB_URL`. The binding discipline is
real, but it covers the money/schema gate family, not the repository.

A second unbound remote workflow, surfaced by that same review and verified
here: `.github/workflows/sandbox-credit-packs-smoke.yml` passes
`SUPABASE_DB_URL_SANDBOX` into `scripts/sandbox-credit-packs-smoke.ts`, whose
`psqlJson` pushes `process.env.SUPABASE_DB_URL` straight into the `psql` argv
with no identity check. Recorded so it is not lost — it carries the same
wrong-target class of risk, though its blast radius is smaller (a sandbox
credential, a read-only smoke). It is **not** part of any approved slice, and
nothing here authorizes changing it.

**2. The connection dies at the socket, on an IPv6 address.**

`established fact`, from the run output: the host resolved to
`2600:1f18:6f7d:e800:d9c0:aca3:3925:8f6`, the failure was `Network is
unreachable`, and the step took zero seconds. That is a routing failure before
any authentication or query, and it is all the run output proves.

`inference`, high confidence, but **not measured here**: GitHub-hosted runners
have no IPv6 egress and Supabase direct `db.<ref>.supabase.co` hosts are
IPv6-only, so the connection string needs the IPv4 Supavisor pooler host
(`aws-<n>-<region>.pooler.supabase.com`) — a form the identity module already
recognises and already knows how to bind to a pinned ref. Neither the
runner-egress claim nor the exact replacement host was verified from this repo;
whoever repoints the secret should take the host from the Supabase dashboard's
connection panel rather than from this paragraph.

**Judge the fix by the probe's status, never by the run colour.** The connection
is proven the moment the probe _completes a query_ — `status: "current"` (exit 0)
or `status: "drift"` (exit 1). Only `could_not_probe` (exit 2) means the
connection is still broken. This distinction is not pedantry here: this file
already records at least two unapplied migrations, so the first genuinely
successful run will very likely return `drift` and exit 1, and the workflow will
go **red**. An operator watching the tick rather than the payload would read that
red as "my secret fix did not work" and revert a change that in fact worked.

**The failure mode changed between 13 and 14 August**, which is itself evidence:
on 12–13 Aug the probe step was `skipped`, meaning `Require SUPABASE_DB_URL`
hard-failed on an absent secret; from 14 Aug that guard passes and the connection
fails instead. `inference`: someone added the secret in that window and supplied
the sandbox URL.

**3. Even connected, the probe's matching would misreport Lovable migrations.**

Raised by Codex review 2026-08-15 and verified here against source. This one is
independent of the secret: it is a defect in the probe itself, and it is why
"fix the secret and read the answer" is not the whole story.

`established fact`, from the code: `probe-migration-drift.mjs:106` selects only
`version` (`SELECT version FROM supabase_migrations.schema_migrations`), and
line 166 diffs it by exact string equality against the 14-digit timestamp
parsed off each filename.

`established fact`, from `docs/signup-attribution-outage-operator-runbook.md`
§"Ledger hazard": **Lovable records a migration under a version ~2 seconds later
than its filename timestamp, carrying the filename stem in the `name` column.**
The runbook's worked example is `20260721194325_f96507e6-…`, which sits in the
ledger as version `20260721194327`. Hand-authored migrations use the exact
timestamp with a slug name, so **both conventions coexist in one table**.

`established fact`, measured here: **157 of 268** migration files use the
Lovable UUID-suffixed convention. Whether every one of them is version-shifted
is `NOT_MEASURED` — the runbook proves the mechanism and one instance, not the
population.

The consequence: an exact-version diff reports an applied Lovable migration as
**unapplied**. That is a false DRIFT — noisy rather than dangerous, the opposite
polarity to the failure that caused the 2026-08-05 outage — but it makes the
reconciliation untrustworthy in both directions, because a reader who learns to
discount the false entries will discount a real one too.

The runbook already prescribes the fix and, importantly, forecloses the obvious
wrong one. Match by name, with no window: for a file `<ts>_<slug>.sql`, accept
`m.name = <stem>` (Lovable) **or** `m.name = <slug>` (hand-authored) **or**
`m.version = <ts>`. Do **not** widen the version comparison to a tolerance — the
runbook's Trap 2 shows this repo contains `20260806230020_…` and
`20260806230021_…` one second apart, so a window would report an _unapplied_
migration as applied. That is the worse error, and it is the exact shape of the
2026-08-05 blind spot.

### What this does and does not license

**Defects 1 and 2 are owner-only.** Rotating a GitHub environment secret and
reading a production connection string are outside every agent role in this
repo, and the credential must never enter an agent session. No agent should
attempt them.

**Defect 3 is repo-side and an agent could fix it** — it needs no credential and
is provable on fixtures. Two scoped candidate changes now exist, both **not
approved**, recorded so they are not lost and not mistaken for work in progress:

- **C1 — name-bound matching.** Select `name` alongside `version` and match by
  stem-or-slug-or-version per the runbook, with no tolerance window. Testable
  offline against both conventions, including the `20260806230020` /
  `20260806230021` adjacent pair as the regression that pins Trap 2 shut.
- **C2 — target-identity assertion.** Import `supabaseDatabaseTargetIdentity.mjs`
  in the probe so a sandbox URL supplied to the production environment fails
  loudly as a mismatch instead of being measured and reported as production.

Sequencing matters if both are taken: **C1 before the secret is corrected.** If
the secret is fixed first, the probe's first successful run publishes a large
false-drift list into #912, and the most likely human response to an alarm that
cries wolf on its debut is to stop reading it — which is how this whole section
started. C2 is independent and can land either side.

Until **both** the secret is corrected and the probe's matching is name-bound,
the **applied-migration ledger** is `NOT_MEASURED` — and so is any claim whose
only evidence would have come from this probe, which means every statement of
the form "migration X is/is not live in production" that is not backed by a
direct observation. Note the second condition: a _completed_ probe run from the
current code — whatever colour the workflow tick ends up — would be measuring the
wrong thing, because its unapplied list would be inflated by every
Lovable-recorded migration it failed to match.

That is deliberately narrower than "every production-schema statement in this
file". It does **not** downgrade the independent evidence recorded above: the
Lovable read-only investigation observed `public.quicklog_entry_revisions`
absent and `diary_entries.retracted_at` / `.retraction_reason` absent by direct
object lookup, and those keep their own labels. A blocked ledger check and a
directly-observed missing table are different findings, and flattening both to
`NOT_MEASURED` would erase a verified defect rather than preserve caution.

### 2026-08-19 production re-measure — the Quick Log manual-save drift has CLOSED

`established fact`, measured 2026-08-19 by Claude through the same Lovable
read-only SQL channel as the 2026-08-15 investigation (verdantgrowdiary-com
project; target identity by fingerprint: founder account present, full app
schema — `inference, high confidence` that this is `knkwiiywfkbqznbxwqfh`,
since the channel does not expose the raw ref):

- `public.quicklog_entry_revisions` is now **PRESENT** and
  `diary_entries.retracted_at` is now **PRESENT** — superseding the
  2026-08-15/16 absence findings above for these objects. An operator apply
  (Lovable-side) happened between 2026-08-16 and 2026-08-19.
- The Quick Log manual-save catalog matches the 20260818010000 forward-repair
  **end-state exactly**: wrapper `quicklog_save_manual` (12-arg, src md5
  `0d3098b8…`, EXECUTE authenticated + service_role, not anon/PUBLIC); private
  delegate `quicklog_save_manual_pre_logged_at` repaired body (md5
  `7ec296e4…`); all four parse/stamp helpers exact; **all five private
  helpers EXECUTE = postgres only**; both `logged_at` stamp triggers live.
- A **rolled-back** end-to-end probe of `quicklog_save_manual` as the founder
  (BEGIN…ROLLBACK, zero committed writes) passed every axis: watering child
  row, exact backdated `occurred_at`, independent Captured `logged_at`, diary
  mirror linked via `details.linked_grow_event_id` with column AND
  `details.logged_at` parity, `entry_at = occurred_at`, stage persisted.
  Failure paths also verified: malformed `details.logged_at` →
  `{ok:false, reason:"invalid_logged_at"}`; `quicklog_try_parse_uuid` as
  authenticated → SQLSTATE 42501.
- Manual grow_events rows predating the apply carry backfilled
  `logged_at = created_at` (expected foundation-migration semantics), and no
  post-apply manual save existed yet at measurement time.
- The protected GitHub apply workflow
  (`apply-quicklog-manual-delegate-forward-repair.yml`) ran once —
  2026-08-19T06:17Z, dispatched by Cheek — and **failed at "Require the
  protected production database secret"** before any database access. The
  apply that actually landed was therefore Lovable-side, not workflow-side.
  The workflow secret remains an owner-only gap.
- The ledger remains mixed-convention: of the quicklog-window versions, only
  `20260811090000` (name `2c5c4adb-…`) matched a direct version/name query.
  Object presence stays the ground truth; the drift-probe caveats above are
  unchanged.
- Sandbox `bzatgtgjvuojpoxcknaa` is **far behind**: only a legacy 10-arg
  `quicklog_save_manual` exists there — no delegate, no helpers, no
  `logged_at` columns. Do not use sandbox to reason about production Quick
  Log behavior.

Five red runs — the four scheduled plus the 2026-08-15 dispatch — are five
absent measurements, `NOT_MEASURED` in the literal sense this repo's status
vocabulary requires, since not one of them completed a query. But they are not
**merely** that. They are also four days (12–15 August) in which the mechanism
built to catch an invisible outage was itself unable to see, and was left that
way.

### 2026-08-20 (superseded same day) — the forward repair was BLOCKED by a third unapplied migration

> **Superseded by the resolution block below.** The diagnosis here is
> accurate and worth keeping — it is how the third unapplied migration was
> found — but the `BLOCKED` verdict at the end of this block no longer
> describes production. Both migrations were applied later the same day.

`established fact`, measured 2026-08-20 21:58–22:08 UTC by Claude through the
Lovable read-only SQL channel against production (target fingerprint: 92 public
tables, 20 `auth.users`, 64 `action_queue` rows, 143 `action_queue_events` rows,
`quicklog_entry_revisions` PRESENT). Cheek authorized the apply of
`supabase/migrations/20260819190852_action_queue_transition_forward_repair.sql`
in session with the exact phrase `APPLY ACTION QUEUE TRANSITION FORWARD REPAIR`.

**The apply was attempted and it fail-closed. Zero bytes were written.** The
migration aborted inside its own preflight at
`action_queue_transition_forward_repair_guard_drift`, and the whole transaction
rolled back. Verified _after_ the abort: `action_queue` still carries 4 policies
under the same names, `action_queue_events` still 3, row counts still 64/143,
all four `authenticated` UPDATE/DELETE grants still `true`, the guard body md5
unchanged, and `public.action_queue_transition` still absent. There is nothing
to undo by hand. The migration's guards worked exactly as designed.

**The 20 `v_legacy_state` conjuncts are `PASS` — do not re-derive them.**
Re-measured fresh on 2026-08-20 (not carried forward from the 2026-08-19 read),
each computed exactly as the preflight computes it: transition overloads `0`;
`action_queue` 4 policies (select 1, insert 1 fp `02cf2857…`, update 1 using
`b3c61a20…` / check `02cf2857…`, delete 1); `action_queue_events` 3 policies
(select 1, legacy insert 1 fp `e79ba22f…`, append 0, delete 1); required grants
coherent; all four `authenticated` UPDATE/DELETE grants present. `v_legacy_state
= true`. The preflight's _state_ gate would have accepted the repair.

**The blocker is a different and earlier gate.** The guard-drift `IF` runs
_before_ the legacy/contracted evaluation, and no earlier evidence covered it.
Production's `public.action_queue_guard_decision_fields` is an **older revision**
than the forward repair requires, on five independent axes:

| Axis                        | Forward repair expects                           | Production has                     |
| --------------------------- | ------------------------------------------------ | ---------------------------------- |
| `proconfig`                 | `search_path=public, pg_temp`                    | `search_path=public`               |
| `prosrc` length             | 1101                                             | 1028                               |
| `prosrc` md5                | `88e81c4dfbc6d17260def35d1a619ee1`               | `09459a9cc8532aae905639b3055c680f` |
| trigger `UPDATE OF` columns | `approved_at, completed_at, rejected_at, status` | `approved_at, rejected_at, status` |
| EXECUTE ACL                 | `postgres` only                                  | `postgres` **and** `service_role`  |

**`supabase/migrations/20260725093000_restore_action_queue_owner_decisions.sql`
was never applied to production.** Hash-proven, not inferred: the guard body
committed in `20260721225930_b34caa3e-…` hashes to exactly production's
`09459a9cc8532aae905639b3055c680f` at 1028 bytes, and the body committed in
`20260725093000` hashes to exactly the expected
`88e81c4dfbc6d17260def35d1a619ee1` at 1101 bytes. Production is running the
older file. That is a **third** confirmed instance of this section's parent
finding, alongside the signup forward repair and the (since-applied) Quick Log
pair — and it was found by object comparison, not by the drift probe, which
remains blocked.

**Applying `20260725093000` alone will NOT unblock the forward repair.**
`established fact`: no committed migration anywhere in `supabase/migrations/`
revokes `service_role` EXECUTE on the guard — `20260721225930` and
`20260725093000` revoke only `FROM PUBLIC`, and `20260804091142_da8cef1f-…`
revokes only `FROM anon, authenticated`. `inference, high confidence`: because
`CREATE OR REPLACE FUNCTION` preserves an existing function's ownership and
permissions, replaying `20260725093000` would correct the body, `search_path`
and trigger columns but leave `service_role|EXECUTE|f|postgres` in the ACL, so
the preflight would abort at the same check. A second, additive forward
migration performing that revoke is required. Note the forward repair _does_
explicitly revoke `service_role` on `action_queue_transition` — the omission is
specific to the guard, so this reads as a gap rather than a deliberate posture.

Nothing here licenses an agent to make either change. Both are production
security edits outside any approved slice; the merged migration is immutable
under the Migration Immutability Rules; and the sanctioned path remains the
#1044 protected PREFLIGHT/APPLY lane, which is owner-only by construction
(founder dispatcher identity, branch pin, `verdant-production-solo-founder`
environment approval, and owner-only secrets).

Status of the Action Queue transition contract in production at the time of this
block: **`BLOCKED`**, not `FAIL` — resolved later the same day, see below.

### 2026-08-20 resolution — both migrations APPLIED, the live gap is CLOSED

`established fact`, measured 2026-08-20 23:21–23:30 UTC by Claude through the
Lovable SQL channel against production. Cheek authorized the full sequence in
session. Each migration was transmitted inside an md5 guard that verified the
body at the database **before** executing a byte, so the applied text is
hash-verified rather than assumed.

**Order matters and was followed:** `20260819190000` first, then
`20260819190852`. The first migration's postflight is deliberately the second's
guard-drift predicate.

`supabase/migrations/20260819190000_action_queue_guard_decision_fields_forward_repair.sql`
— applied (body md5 `a635a88a…`, 12,966 chars). It moved the guard from the
`20260721225930` revision to the `20260725093000` one and closed the
`service_role` ACL gap no committed migration had ever closed. All five drift
axes verified after:

| Axis                   | Before                     | After                                            |
| ---------------------- | -------------------------- | ------------------------------------------------ |
| `prosrc`               | 1028 / `09459a9c…`         | 1101 / `88e81c4d…`                               |
| `proconfig`            | `search_path=public`       | `search_path=public, pg_temp`                    |
| trigger `UPDATE OF`    | no `completed_at`          | `approved_at, completed_at, rejected_at, status` |
| EXECUTE ACL            | `{postgres, service_role}` | `{postgres}`                                     |
| `service_role` EXECUTE | true                       | false                                            |

`supabase/migrations/20260819190852_action_queue_transition_forward_repair.sql`
— applied (body md5 `7501f35d…`, 46,252 chars) and passed its own postflight.
Contracted end-state verified independently:

- `public.action_queue_transition` present, 1 overload, 4997 bytes, src md5
  `ce755f8e6a6515640a2f86c15de3ba63`, ACL exactly
  `{authenticated|EXECUTE, postgres|EXECUTE}` — no `anon`, no `service_role`.
- `action_queue` 2 policies (SELECT + INSERT fp `e08f43c1…`); the legacy UPDATE
  and DELETE policies are gone.
- `action_queue_events` 2 policies (SELECT + append fp `420914cd…`).
- **`authenticated` UPDATE and DELETE are now `false` on BOTH tables.** This is
  the gap that had been open and measured since this file first recorded it.
- Required grants preserved: `authenticated` retains SELECT and INSERT on both.
- Row counts unchanged throughout: `action_queue` 64, `action_queue_events` 143.

**A rolled-back end-to-end probe proved the grower path still works** (BEGIN …
ROLLBACK, zero committed writes, confirmed afterwards: the probed row is back to
`pending_approval` with `approved_at` NULL, its event count back to 1, the
probe's `event_id` absent, totals still 64/143):

- a direct `UPDATE public.action_queue` by the row's own owner as
  `authenticated` → **refused, SQLSTATE 42501**;
- `public.action_queue_transition(id, 'approve', 'pending_approval')` as that
  same owner → `{"ok": true, …}`, status `pending_approval -> approved`, audit
  events for that action `1 -> 2`.

So the approval-required posture is intact and stronger: growers can no longer
write lifecycle fields directly, and the only path that changes a status also
writes its audit event atomically.

**What this does NOT change.** The apply went through the Lovable channel, not
the #1044 protected PREFLIGHT/APPLY lane, which remains owner-only by
construction and unused — its `SUPABASE_DB_URL` secret gap is still open. No
`supabase_migrations.schema_migrations` ledger row was inserted for either
version, so the ledger still under-reports what is live; object presence remains
the ground truth here, and the drift probe remains blocked (see the defects
above). **Superseded 2026-08-21:** the signup-attribution forward repair
`20260813030000` is **APPLIED** (see the RESOLVED signup section). This Action
Queue session did not touch it; a later same-day Lovable apply closed the
42P01 outage. **Hard stop:** do **not** GitHub-APPLY
`20260813030000_signup_acquisition_forward_repair.sql` — that file would
re-issue an unguarded `handle_new_user` and overwrite the live `RAISE LOG`
guard from `20260821150000_signup_acquisition_failure_safe_attribution.sql`.

---

## Branch topology

| Branch               | Role                                             | Verified head                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| -------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `verdant-grow-diary` | **Deploy branch. Production ships from here.**   | **READ THE 2026-08-25 19:48 UTC RE-MEASURE BLOCK NEAR THE TOP FIRST — it supersedes this row. Tip is `2e7002b69`; production serves `e8f4e7c2fe05`, which is NOT a GitHub commit, so publish lag is NOT COMPUTABLE and every lag figure in this row is void.** Prior row text follows: **`a3ae36765` (#1105), verified 2026-08-23 02:09 UTC by direct fetch. Live production re-fetched in the same window and still serves `faea6e9c59ad` (#1087, `buildTime 2026-08-21T20:51:46.584Z`, `dirty: true`, `ref: "__orphan__"`, `treeHash` short `7d9cc8a12898`) — unchanged since 2026-08-22 16:16 UTC, so publish lag is now **`12`** and has widened seven times by the tip advancing, never by a republish. Re-measure before citing; never carry a lag figure forward.** Prior row text follows: `8181f5a60` (#1107), verified 2026-08-23 00:02 UTC by direct fetch. Live production re-fetched in the same window and still serves `faea6e9c59ad` (#1087, `buildTime 2026-08-21T20:51:46.584Z`, `dirty: true`, `ref: "__orphan__"`, `treeHash` short `7d9cc8a12898`) — unchanged since 2026-08-22 16:16 UTC, so publish lag is now **`11`** and has widened six times by the tip advancing, never by a republish. Re-measure before citing; never carry a lag figure forward.** Prior row text follows: `70ba566cdb11` (#1092), verified 2026-08-22 18:22 UTC by direct fetch. Live production re-fetched in the same window and still serves `faea6e9c59ad` (#1087, `buildTime 2026-08-21T20:51:46.584Z`, `dirty: true`, `ref: "__orphan__"`, `treeHash` short `7d9cc8a12898`) — unchanged since 16:16 UTC, so publish lag is now **`10`** and has widened five times today by the tip advancing, not by any republish. Re-measure before citing; never carry a lag figure forward.** Prior row text follows: `8e6750e87aff` (#1101), verified 2026-08-22 17:32 UTC by direct fetch. Live production re-fetched in the same window and still serves `faea6e9c59ad` (#1087, `buildTime 2026-08-21T20:51:46.584Z`, `dirty: true`, `ref: "__orphan__"`, `treeHash` short `7d9cc8a12898`) — unchanged since 16:16 UTC, so publish lag is now **`8`** and has widened three times today by the tip advancing, not by any republish. Re-measure before citing; never carry a lag figure forward.** Prior row text follows: `fd2d3e3f7553` (#1100), verified 2026-08-22 17:09 UTC by direct fetch. Live production was re-fetched in the same window and still serves `faea6e9c59ad` (#1087, `buildTime 2026-08-21T20:51:46.584Z`, `dirty: true`, `ref: "__orphan__"`, `treeHash` short `7d9cc8a12898`) — unchanged from the 16:16 UTC reading, so publish lag widened from `6` to **`7`** purely by the tip advancing, not by a republish. Re-measure before citing; never carry a lag figure forward.** Prior row text follows: `93d8ea23ff58` (#1097), verified 2026-08-22 16:16 UTC by direct fetch. Live production was re-fetched in the same window and now serves `faea6e9c59ad` (#1087, `buildTime 2026-08-21T20:51:46.584Z`, `commitTime 2026-08-21T20:43:26Z`, `dirty: true`, `ref: "__orphan__"`, `treeHash` short `7d9cc8a12898`), confirmed an ancestor of this tip — publish lag is `6` first-parent commits (#1095, #1096, #1098, #1091, #1099, then #1097). Production has republished since the 2026-08-21 readings; the previously-live `ea31fbdfb934` is historical. Every prior caution stands: this row moved three times inside one hour on 2026-08-21 and has moved again overnight. Re-measure before citing; never carry a lag figure forward.** Prior row text follows: `faea6e9c59ad` (#1087), verified 2026-08-21 21:05 UTC by direct fetch. Live production was re-fetched in the same window and still serves `ea31fbdfb934` (`buildTime 2026-08-21T15:53:46.096Z`, `dirty: true`, `ref: "__orphan__"`), confirmed an ancestor of this tip — publish lag is `2` first-parent commits (#1090, then #1087). This row moved three times inside one hour: `ea31fbdfb934`/lag `0` at 16:15Z, `9133a4c45b7f`/lag `1` at 20:43Z, this at 21:05Z. Each was correct when taken. Re-measure before citing; never carry a lag figure forward.** Prior row text follows: `ea31fbdfb934` (#1086), verified 2026-08-21 **16:15 UTC** by direct fetch. **Live production was fetched at the same moment and serves `ea31fbdfb934` too — publish lag was `0` first-parent commits at that reading, the first 0 recorded here.** Production republished at least four times on 2026-08-21; treat any lag figure as perishable and re-measure. Superseded, in order: `5a13d0b47cb7` (#1089, live 15:39:34Z), `39935889fe02` (#1080, live 15:23 UTC), `999b6da93` (#1077), `ac973ed9f` (#1074), `9b6445653` (#1042). Prior text for this row follows: `999b6da93` (#1077), verified 2026-08-21 ~15:23 UTC with `git fetch origin verdant-grow-diary && git rev-parse origin/verdant-grow-diary`. Supersedes `39935889f` (#1080) as tip and earlier buffers (`ac973ed9f` / #1074, `9b6445653` / #1042). **Live production WAS re-fetched at this verification** and serves `39935889fe02` (#1080), confirmed an ancestor of this tip (`git merge-base --is-ancestor`) — publish lags git by **1** first-parent commit (the #1077 docs-only CURRENT_STATE refresh). That lag figure is perishable: it read "four" on 2026-08-20, \*\*17\*\* / \*\*2\*\* earlier on 2026-08-21 under #1077's 12:57 UTC pin of live `1400a7e77eff`, and \*\*1\*\* now with live on `39935889fe02`. Re-measure it; never carry it forward. The 2026-08-18 note that a `/version.json` fetch from an agent session is `BLOCKED` (network policy 403) was session-specific and does not hold generally — see `docs/agent-session-network-reachability.md`. Merging is not a publish. PR numbers on this branch do not order by merge time — order commits with `git log`, never by PR number. Do not carry older validation tables forward. Older buffers showing live `1400a7e77eff`, tip `39935889f`, `9b6445653` (#1042), `87ae05e5b` (#1026), `3f2bfe2db` (#1021) or `1c094a2a3` (#970) are earlier snapshots; discard them |
| `main`               | Integration branch. It is not production parity. | `b6d747941948ce68157185a2b0847acea6970d44` (#779), verified 2026-08-07                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |

`main` and `verdant-grow-diary` are divergent. Do not infer production behavior from
`main`, and do not backport deploy-only governance or data rules without a scoped branch
integration task.

The deploy-branch governance integration is complete in PR #626, and reconciliation PR
#635 is merged. The bounded Mode A readiness-evidence PR
[PR #679](https://github.com/Verdant-OS/verdant-grow-diary/pull/679)
(`codex/seo-readiness-evidence-20260802`) merged 2026-08-02 as `bff64896679d`. It
changed readiness evidence, artifacts, and tests only; it is **not** deployment evidence.

---

## DIRTY PR conflict reconciliation (recorded 2026-08-13)

Owner-posted `CONFLICT_RECONCILIATION` comments on four then-open DIRTY PRs.
No rebases, merges, or closes happened in that comment pass. [#933](https://github.com/Verdant-OS/verdant-grow-diary/pull/933)
was already closed as superseded. This is an ownership/serialisation
signal (`docs/agents/merge-queue.md`: empty queue + high `DIRTY` count), not
queue latency. Branch-name authorship is not a role assignment. At the time
those comments were posted, the agents table still framed Grok as research-
delivery on `ONE_TENT_LOOP_OPERATING_ORDER`; as of 2026-08-20 (refined) Grok is
**Product Intelligence, Adversarial Audit, and Implementation Lead** — peer with
Claude/Codex, no role rank (see Agents table and
`docs/agents/grok-peer-elevation-map-2026-08-20.md`). The comments handed a
recommended rebase path to whoever next owned each branch.

**Outcomes since recording (verified 2026-08-15 with `gh pr view`):**
#710 merged 2026-08-14 as `1a3a70d1b`. #936 closed 2026-08-13 without merge;
its credit-gate work landed as [#971](https://github.com/Verdant-OS/verdant-grow-diary/pull/971)
(`claude/alert-doctor-credit-gate-v2`, merged 2026-08-13). #913, #817, and #699
were still OPEN at this verification. #933 remains CLOSED (superseded).

Locked rule still in force:

```text
Same complete intent already on base → CLOSE SUPERSEDED
Never hybrid-patch only to become mergeable
Never reuse green checks from pre-resolution SHA
```

| PR                                                                | State  | Disposition      | Head                                    | Unique surviving work (from the comment)                                                                                                                                                                                                                    | Comment                                                                                      |
| ----------------------------------------------------------------- | ------ | ---------------- | --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| [#913](https://github.com/Verdant-OS/verdant-grow-diary/pull/913) | OPEN   | REBASE           | `grok/seo-public-surface-docs-20260812` | Live-host evidence that `vercel.json` public-alias redirects are not firing in production (HTTP 200 soft shells) plus `docs/seo/vercel-host-redirect-fix-steps.md`. Drop the duplicate Ahrefs / `/` vs `/welcome` material already shipped via #914 / #949  | [comment](https://github.com/Verdant-OS/verdant-grow-diary/pull/913#issuecomment-5285119408) |
| [#817](https://github.com/Verdant-OS/verdant-grow-diary/pull/817) | OPEN   | REBASE           | `grok/tent-alert-history-pro`           | `TentAlertHistoryPanel` and history helpers. Keep base's `isActive` / `openCount` / `activeCount` and the Doctor / Blueprint CTAs from #816 / #888 / #928                                                                                                   | [comment](https://github.com/Verdant-OS/verdant-grow-diary/pull/817#issuecomment-5285121690) |
| [#710](https://github.com/Verdant-OS/verdant-grow-diary/pull/710) | MERGED | REBASE completed | `claude/docs-cheek-approval-workflow`   | Landed 2026-08-14 as `1a3a70d1b`. Added `docs/agents/cheek-approval-workflow.md`; Sentinel-Version moved to 2026-08-09.3                                                                                                                                    | [comment](https://github.com/Verdant-OS/verdant-grow-diary/pull/710#issuecomment-5285129001) |
| [#699](https://github.com/Verdant-OS/verdant-grow-diary/pull/699) | OPEN   | REBASE           | `chore/adopt-biome-lint`                | Tooling swap only (`package.json` / `biome.json` / lint-staged). Drop the 327-commit-stale format commit; regenerate after rebase; hand-reconcile `src/test/helpers/reactRouterCompat.vitest.tsx`; add a Biome ignore for `supabase/functions/mcp/index.ts` | [comment](https://github.com/Verdant-OS/verdant-grow-diary/pull/699#issuecomment-5285131401) |
| [#933](https://github.com/Verdant-OS/verdant-grow-diary/pull/933) | CLOSED | CLOSE_SUPERSEDED | `claude/strange-keller-036221`          | Complete intent already shipped as #930 (`ai_doctor_cta_clicked`). Closing avoids two competing funnel events on the same click                                                                                                                             | [comment](https://github.com/Verdant-OS/verdant-grow-diary/pull/933#issuecomment-5285025091) |

Follow-up outcome: [#936](https://github.com/Verdant-OS/verdant-grow-diary/pull/936)
(`claude/alert-doctor-credit-gate`) closed 2026-08-13 without merge. The
credit-gate work landed as [#971](https://github.com/Verdant-OS/verdant-grow-diary/pull/971)
from `claude/alert-doctor-credit-gate-v2`.

Do not unilaterally close the remaining REBASE PRs (#913, #817, #699), and do
not land a hybrid patch on any of them solely to clear `DIRTY`.

---

## Production status

Analytics axes verified directly on 2026-08-02. Release identity and build time
were re-measured **2026-08-21 ~15:23 UTC** over live HTTPS (Grok). Sitemap and
the six previously-unsitemapped indexable routes keep their 2026-08-21T12:57 UTC
(#1077) readings — not re-opened this turn. Public root and robots.txt keep
their 2026-08-20 dates; GA4 lighting / singleton rows keep their 2026-08-02 dates.
**Latest release measurement is 2026-08-23 02:09 UTC** for tip and lag only
(tip `a3ae36765` / #1105; live `faea6e9c59ad` / #1087; lag **`12`**). The served
commit, build time, provenance flags and payments-bundle rows keep their **16:16 UTC**
readings — production has not republished between the two, and only the tip moved. That
16:16 UTC pass superseded the 2026-08-21 21:05 UTC and 16:15 UTC readings. Rows not
named keep their own earlier dates.
Each row carries its own verification date:

| Axis                                        | Status                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `https://verdantgrowdiary.com/version.json` | `PASS` — HTTP 200, **re-verified first-hand 2026-08-22 17:09 UTC** (and at 16:16 UTC the same day). This row previously carried a 2026-08-21 date while rows beside it quoted 2026-08-22 readings fetched from this same endpoint — an internal contradiction in a file that promises each row carries its own date. Prior text: re-verified 2026-08-21 **16:15 UTC**, superseding the ~15:23 UTC reading. The 2026-08-18 `BLOCKED` (network policy 403) was a property of that session, not of this endpoint — re-test rather than carrying it forward                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Production commit                           | **SUPERSEDED — see the 2026-08-25 19:48 UTC re-measure block near the top. Production serves `e8f4e7c2fe05` (`buildTime 2026-08-25T18:05:30.499Z`, `dirty: true`, `ref: "__orphan__"`, `treeHash bcb08cd3ae1a`), a commit the GitHub remote refuses as `not our ref`.** Prior row text follows: Identity `PASS`, provenance **not** `PASS` — **re-measured first-hand 2026-08-22 16:16 UTC.** Production serves `faea6e9c59adf42a3028a2f0d9eba2b8ac2ef688` / `faea6e9c59ad` (#1087), `buildTime 2026-08-21T20:51:46.584Z`, `commitTime 2026-08-21T20:43:26Z`, **`dirty: true`**, `ref: "__orphan__"`, `ciRunId: null`, `commitSource: "git"`, `treeHash` short `7d9cc8a12898`, `version: "0.0.0+20260821.faea6e9c59ad-dirty"`. **This is the post-#1090 build the record said to watch for, and the mismatch PERSISTS:** `faea6e9c59ad` contains #1090 (verified by `git merge-base --is-ancestor`), and recomputing its tree with `scripts/lib/tree-hash.mjs` over a clean worktree gives `436eede41e4b` (5,856 files) against the stamped `7d9cc8a12898`. **Per the one-directional rule recorded below, persistence does NOT refute the #1090 candidate** — a workspace already dirtied by an earlier cycle stays dirty until something resets it — and it does not confirm it either. It returns the question to the owner-gated publisher's build log. That makes **five** OBSERVED publishes measured, all five mismatching, all five `dirty: true`. Still not a proven-consecutive run: whether other publishes fell between any two readings is `NOT_MEASURED`. **The `TREE_HASH_ROOTS` bound is UNCHANGED.** An earlier version of this row said it "is now narrower than it was" on the strength of the payments-token finding; that inference was **withdrawn 2026-08-22** after a review P2 — a platform env var overrides `.env.production` without altering the file, so it need not have drifted in the workspace and need not have contributed to this mismatch. Whether the workspace drift behind `treeHash` reached shipped bytes stays `NOT_MEASURED`. See the withdrawal in the payments-token section below. Do not upgrade provenance to `PASS`. Supersedes the 16:15 UTC pin `ea31fbdfb934` and every earlier same-day pin. Prior row text follows: re-measured first-hand 2026-08-21 16:15 UTC. Production serves `ea31fbdfb934b5a4e70b882dc62465b73c4a5f72` / `ea31fbdfb934` (#1086), `buildTime 2026-08-21T15:53:46.096Z`, `commitTime 2026-08-21T15:29:03Z`, **`dirty: true`**, `ref: "__orphan__"`, `ciRunId: null`, `treeHash` short `831bd3b4f230`, `version: "0.0.0+20260821.ea31fbdfb934-dirty"`. **Provenance is now measured, not merely flagged, across four OBSERVED publishes — and all four mismatch.** They are four point-in-time `/version.json` readings, **not** a proven-consecutive run: whether other publishes fell between them is `NOT_MEASURED` without the publisher's history, and production republished repeatedly inside one hour. Recomputing each published commit's tree with `scripts/lib/tree-hash.mjs` against what the build stamped: `4b1c4867e685` stamped `8773f6b2c0ed` vs `1f0eb7b4e6cd`; `39935889fe02` stamped `1fe0606c134a` vs `8e117dc65711`; `5a13d0b47cb7` stamped `1fe0606c134a` vs `8e117dc65711`; `ea31fbdfb934` stamped `831bd3b4f230` vs `2cee190ff72b`. Note the middle pair differ only in `docs/agents/CURRENT_STATE.md` — outside `TREE_HASH_ROOTS` — and recompute identically, which is the mechanism working correctly. **The bound: `TREE_HASH_ROOTS` covers inputs that never ship, so this establishes build-workspace drift at stamp time; whether any shipped byte differs stays `NOT_MEASURED`.** Do not upgrade provenance to `PASS`. Supersedes the ~15:23 UTC pin `39935889fe02` and the earlier `1400a7e77eff` / `92a983b4832e`. Prior row text follows: re-measured 2026-08-21 ~15:23 UTC. Production serves real SHA `39935889fe022efd441dc5ab86bfbf636d284739` / short `39935889fe02` (#1080 merge), with `commitSource: "git"`, `treeHash: 1fe0606c134a0b8aa3887d17b966ef0b95e9876d72ee987ad8a601b42d1ef346`, **`dirty: true`**, `ref: "__orphan__"`, `ciRunId: null`, `version: "0.0.0+20260821.39935889fe02-dirty"`. Record identity and provenance separately: identity is the #1080 SHA; provenance flags stay as measured — do **not** upgrade provenance to `PASS`. Cause of dirty/orphan remains `NOT_MEASURED`. Note for whoever checks this next: `treeHash` is Verdant's SHA-256 over the allowlisted `TREE_HASH_ROOTS` manifest (`scripts/lib/tree-hash.mjs`), **not** a Git tree object ID. Do not "confirm" a mismatch by diffing it against `git rev-parse <commit>^{tree}` — those are different hash functions over different inputs and never match, on healthy builds included (#1077 already removed that false corroboration). Supersedes the earlier same-day #1077 pin `1400a7e77eff` (#1083) and the still-earlier `92a983b4832e` (#1061). Publish lags git — see the branch topology row. Single observations remain point-in-time |
| Production build time                       | **`2026-08-21T20:51:46.584Z`** (fetched first-hand 2026-08-22 16:16 UTC, commit `faea6e9c59ad`). Note the shape: a build stamped 2026-08-21 evening was still the served build ~20 hours later, so the republish cadence that churned this row four times inside 2026-08-21 did **not** continue overnight. Do not read that as stability — re-measure. Prior row text follows: `2026-08-21T15:53:46.096Z` (fetched first-hand 16:15 UTC, commit `ea31fbdfb934`). Prior live stamps `2026-08-21T15:39:34.211Z` (`5a13d0b47cb7`) and `2026-08-21T12:53:03.024Z` (`39935889fe02`) are historical. Prior row text follows: `2026-08-21T12:53:03.024Z` (from the same ~15:23 UTC `/version.json`; the served commit was authored `2026-08-21T07:51:31-05:00`). Prior live stamps `2026-08-21T12:11:38.661Z` (`1400a7e77eff`), `2026-08-21T00:59:52.370Z` (`92a983b4832e`), `2026-08-21T00:27:10.316Z` and `2026-08-20T18:49:50.600Z` are historical. Production republished multiple times inside 2026-08-21 — treat any single reading here as perishable                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Public sitemap                              | `PASS` — HTTP 200, **61** `<loc>` entries live (re-count 2026-08-21). **Live and in-repo now agree**: the 2026-08-20 adjudication published, moving live from 56 → 61. The earlier note that a 56 reading was "expected, not a regression" is spent — from 2026-08-21 a 56 reading would be a real regression                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Public root route `/`                       | `PASS` — re-measured 2026-08-20. HTTP 200; `<h1>` “See what changed. Decide what to do next.”; `<link rel="canonical" href="https://verdantgrowdiary.com/"/>`; `<meta name="robots" content="index, follow">`; one JSON-LD block; no loading skeleton. Visible body words measured **845–1034** depending on tokenization — the 2026-08-15 figure of 1141 recorded no method, so the two are **not comparable and this is not evidence of content loss**. `www.` host `302`s to the apex. Slice 2 (`/welcome` → `/` consolidation) remains unapproved — see blocker 7                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Indexable routes outside the sitemap        | `PASS` — **resolved live**, re-measured 2026-08-21. Was `FAIL` while the fix sat unpublished. Five of the six are now advertised in the live `sitemap.xml` (`/glossary`, `/docs/mcp-api`, `/pheno-expression-showcase`, `/pheno-comparison`, `/creator-beta`), each self-canonical. `/breeder-beta` is correctly absent **by design**: it serves `<link rel="canonical" href="https://verdantgrowdiary.com/creator-beta">` and stays `index, follow`, so advertising it would push a URL that disclaims itself. Verified live, not inferred from the merge — the cross-canonical survived hydration, which was the silent failure mode. Closes blocker 8’s sibling item                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| robots.txt                                  | `PASS` — re-measured 2026-08-20: HTTP 200, declares `Sitemap: https://verdantgrowdiary.com/sitemap.xml`, and carries no global `Disallow: /`. Authenticated surfaces (`/dashboard`, `/tents`, `/plants`, `/sensors`, `/timeline`, `/doctor`, `/actions`, `/auth`, …) are disallowed as intended; neither lighting route is disallowed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Lighting route technical SEO                | `PASS` — two HTTP 200 routes; page metadata and route-scoped JSON-LD verified (not re-measured 2026-08-15)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| GA4 explicit lighting-page identity         | `PASS` — nine exact intercepted SPA page-view events; no test traffic transmitted (2026-08-02; not re-measured 2026-08-15)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| GA4 page-view singleton contract            | `FAIL` — five automatic tag-generated events observed beside explicit application events (2026-08-02; not re-measured 2026-08-15)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| GA4 authenticated baseline                  | `BLOCKED` — authenticated access unavailable                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| GSC authenticated baseline                  | `BLOCKED` — authenticated access unavailable                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Measurement Day 0                           | `UNSET`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Four-week measurement clock                 | `NOT_STARTED`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

No page-level traffic, impression, click, position, or CTR claim is authorized while the
authenticated GA4/GSC baseline remains blocked. Stream identity alone is not an
authenticated measurement baseline.

### 2026-08-20 — a DNS false negative, and the reachability rule it produced

`established fact`, measured 2026-08-20: an agent reported this domain **offline and
not indexed** on the strength of a single `socket.gethostbyname` failure raised inside
a code-execution sandbox, and recommended repointing production DNS on that basis.
Every axis in the table above was re-measured the same day. The site was live
throughout, serving a build published hours earlier.

The error string is the tell. It was `EAI_AGAIN` (_Temporary failure in name
resolution_) — **the resolver did not answer**. It is not `NXDOMAIN`, which is what an
unregistered or unpointed domain returns. To a caller that only checks whether the call
threw, the two are indistinguishable, and they mean opposite things: one measures the
session, the other measures the domain. Acting on the wrong one would have applied DNS
surgery to working DNS.

Two durable consequences:

- **A resolver or socket error is `BLOCKED`, never `FAIL`.** It licenses no claim about
  deployment, DNS, or indexing. Only an HTTP response that was actually read is a
  measurement of the site.
- **`BLOCKED` is per-session, not a property of the target.** The `/version.json` fetch
  recorded `BLOCKED` (network policy 403) on 2026-08-18 returned `200` on 2026-08-20
  from a different session. Re-test before carrying a `BLOCKED` forward.

Procedure, the control-host pairing that separates the two cases, and the
output-reading traps (the proxy's `127.0.0.1` is not the origin IP; the landing HTML
carries NUL bytes that silence `grep`) are in
`docs/agent-session-network-reachability.md`.

**Indexation itself remains unmeasured.** Two pages surface in a third-party web index
with correct titles — a `practical observation` sufficient to refute "not indexed", and
nothing more. The Ahrefs endpoints that would measure it returned `Insufficient plan`,
and the GA4/GSC authenticated baselines stay `BLOCKED` (blockers 2 and 3). No
impression, click, position, or CTR claim is authorized by this section.

---

## Latest deploy-head validation

Validation evidence for deploy commit `5611b130e81a` (2026-08-05 replay-repair
slice, PRs #724/#726) is archived verbatim — see `CURRENT_STATE_ARCHIVE.md`. By
its own terms that evidence is tied to that commit and must not be carried
forward. Still-live takeaways: the full enabled Security DB Local run
`31021835479` remains the replay-repair proof point, and the two failing
schema/migration guards (`Required core schema present`, `Required
money-critical migrations present`) were `FAIL` there and remain an unresolved,
separately scoped follow-up (see blocker 5 below).

---

## Current approved slices

**Approved slice (Cheek, 2026-08-15, in-session implement instruction):**
`ONE_TENT_LOOP_OPERATING_ORDER`. Plan: walk the existing nine-step loop
without dual write paths, dead next-step CTAs, or fabricated proof.
Grok delivered the repo slices (handoff ids, PlantQuickLog →
`quicklog_save_manual`, smoke-audit alignment). This does **not** pause
the Convex or Postgres spikes below. Owner-only gate remaining `BLOCKED`: a
managed `e2e:one-tent:ui` session. The Lovable-apply of
`20260813030000_signup_acquisition_forward_repair.sql` is **done** (RESOLVED
2026-08-21); **do not** GitHub-APPLY that file — it would clobber the live
`RAISE LOG` guard from `20260821150000`. Slice 5 recorded the honest
`missing_session_json` receipt rather than fabricating a walk. Colliding
PRs **#828**, **#817**, and **#696** all closed unmerged on 2026-08-15 within a
54-minute window (verified 2026-08-21 by direct PR read). The fence they carried
stands on its own: do not start a competing Timeline / Alerts / Action Queue UI
rewrite. Baseline and
post-change receipts: `docs/one-tent-loop-operating-order-baseline.md`.
Persist-path spec: `docs/specs/one-tent-loop-quicklog-single-write-path.md`.

**Tranche A approved (Cheek, 2026-08-19, "approved by all"):** first
implementation slice of the One-Tent Loop Efficiency Program, scoped as an
extension of this operating-order slice (the parked-PR / no-competing-rewrite
instruction above still stands). Scope: five independent wiring PRs — mobile
FAB plant scoping on `/plants/:id`; grow-scope threading in
`oneTentLoopNavigationRules.ts`'s back half plus the tent-step self-link fix;
plant/tent names instead of raw UUIDs on Action Queue rows/drawer and
Alert/Action detail; five trust fixes (incl. Sensors source-summary `staleMs`
and honest Stale/Invalid labels); post-save freshness parity, Alerts URL
filters, and a single `verdant:entry-created` dispatch. No schema, no new
routes, no new Quick Log write paths. The approval also ratifies the spec's §8
copy strings. Authoritative spec (verified at deploy tip `f3b3fc49e`,
adversarially reviewed, zero blockers):
`docs/specs/one-tent-loop-tranche-a-specification.md`. Implementer: **Codex**
(PR-A1 first recommended; the five PRs are independent). The Sensors→Doctor
context carry stays excluded pending owner decision D4. Owner gates on live
verification are unchanged (managed e2e session; signup apply).
2026-08-19 update: PR-A1 merged as `f8d93f57` (#1029). A2–A5 remain
Codex-owned and unopened at that tip; their edit points stay collision
boundaries for Tranche B+ below.

**Tranche B+ approved (Cheek, 2026-08-19, "APPROVED. Execute steps one
through five, each in its own slice."):** second tranche of the One-Tent Loop
Efficiency Program. **Claude is explicitly reassigned as architect and, post-
approval, implementer for Tranche B+ only** — Tranche A stays Codex's; the
Action Queue transition/RLS production repair stays Codex's; no competing
navigation implementation. Approved design:
`docs/superpowers/specs/2026-08-19-one-tent-loop-efficiency-design.md`
(Option A — shared pure rules, progressive convergence); measured baseline:
`docs/one-tent-loop-efficiency-baseline.md`; both pinned at deploy tip
`e012b633`. The approval also resolves owner decisions **D4** (Sensors→Doctor
context carry), **D5** (visible user-namespaced "Continue with <plant>?"
suggestion — silent remembered defaults stay banned), **D7** (plant-scoped
Better/Same/Worse row in the V2 sheet), and ratifies the design's §11 copy.
Slice plan: each approved item ships as its own PR. **Status measured
2026-08-21 at deploy tip `6cf3ffda` — Tranche B+ is substantially
delivered, not pending:**

| Slice                                      | Status                                    |
| ------------------------------------------ | ----------------------------------------- |
| B0a measurement harness (first merge gate) | **MERGED** — #1039 `de8ebad`              |
| B1 target-precedence rules                 | **MERGED** — #1040 `9141be8`              |
| B3a recovery + ratified copy               | **MERGED** — #1042 `9b64456`              |
| B2a shared save-key policy                 | **MERGED** — #1049 `f09febc`              |
| B4a `/doctor` loop card                    | **MERGED** — #1047 `cff3efd`              |
| D7 plant-scoped Better/Same/Worse          | **MERGED** — #1041 `5640d77`              |
| D5 "Continue with `<plant>`?"              | **MERGED** — #1043 `e9e5ec5`              |
| B2b                                        | still deferred to **A5** (unopened)       |
| B4b                                        | **NONE REMAINING** — see note below       |
| B5                                         | waits for **A3** (unopened)               |
| B0b                                        | owner-gated authenticated session/CI path |

**B4b has no remaining scope — do not open a slice for it.** Measured
2026-08-22 at deploy tip `faea6e9c5` (recorded by #1095): A2 **has landed**
(`oneTentLoopNavigationRules.ts` carries 5 `normalizedGrowId` uses, including
the back-half `alertsPath(...)` / `actionsPath(...)` threading that was A2's
scope), and with it in place B4a already satisfies **every** §6 B4 requirement
— the `sensor-snapshot` → `?growId=&tentId=` carry, `doctorStartContextRules.ts`,
the `AiDoctorStart` tent-context line and "In this tent" badge, the carry matrix,
the fail-closed page validation, the no-paid-call pins, and the loop-card mount.
The a/b split recorded here was an artifact of B4a shipping before A2, not two
pieces of work. Building a "B4b" now would produce a second implementation of a
merged slice, which `AGENTS.md` forbids.

The remaining dependency: B2b and B5 block on Tranche A slices that have never
been opened. Both re-verified 2026-08-22 **against each slice's own artifacts**,
after a first attempt measured the wrong things (a raw literal count reported as
dispatch sites, and an `Alerts.tsx` check that belongs to A5(c), not A3):

- **A5** — "single dispatch" has not converged. `verdant:entry-created` still has
  **5 independent emit sites** in non-test code: `PlantQuickLog.tsx:399`,
  `QuickLog.tsx:1454`, `AppShell.tsx:390`, `useSavePhotoDiagnosisReview.ts:91`,
  and the `dispatchQuickLogV2EntryCreated` helper in
  `src/lib/quickLogV2EntryCreatedEvent.ts`. Count **emitters**, not literal
  matches — the string appears 23 times across 13 files, but most of those are
  comments, event-name constants, and `add`/`removeEventListener` in the
  Timeline / DailyCheck / ActionFollowUp listeners.
- **A3** — none of its artifacts exist. `src/lib/tentPlantDisplayLabel.ts` and
  `src/lib/actionContextNameLookup.ts` are both absent,
  `buildActionRowContextLabel` is absent from `actionQueueRowView.ts`, and none
  of the four A3 test ids (`action-queue-row-context-names`,
  `alert-detail-tent-label`, `alert-detail-plant-label`,
  `action-detail-tent-label`) appear anywhere in `src/`.

So Tranche A is no longer only its own tranche — it gates the completion of
Tranche B+. No schema, no migrations,
no new routes, no new Quick Log write paths, no production telemetry.

**Named isolated spike (approved 2026-08-13, not SEO):**
`CONVEX_COMPONENT_PHYSICAL_SANDBOX_SPIKE`. Cheek approved a spec-first,
disposable Convex component spike whose only purpose is to demonstrate
`GAP-CONVEX-001` (physical parent/sibling table sandbox — something
`service_role` Postgres code in this repo cannot refuse at runtime). Contract:
`docs/specs/convex-component-physical-sandbox-spike.md`. Claude delivers the
spec (this update). Codex may implement **Phase 1 only** after that spec
merges, and only under `spikes/convex-component-sandbox/`. Production Convex,
root `package.json` `convex` dependency, `src/` / edge-function imports, AI
credits, sensors, entitlements, Action Queue, and `npx convex deploy` remain
`REJECT` until a later Cheek decision. This does **not** replace or pause the
Mode A SEO parent program below.

**Approved slice (Cheek, 2026-08-14):** `POSTGRES_RESTRICTED_ROLE_SPIKE`.
Contract: `docs/specs/postgres-restricted-role-alternative.md`. This is the
comparison arm the Convex spec defers in its §4.2 and §11. It was specified
before approval existed (the only signal was a designated branch name, and the
spec said so rather than assuming consent); Cheek approved it in session on
2026-08-14.

**Phase 0 is DELIVERED and MEASURED — do not rebuild it.** Claude implemented
it, not Codex, because Codex is occupied with Convex Phase 1 in PR #977 and
Cheek granted full authority in the approving turn. Shipped:
`scripts/check-edge-function-domain-reach.mjs`,
`config/edge-function-domain-reach.json`, and
`scripts/check-edge-function-domain-reach.test.mjs` (16 tests, 16 pass locally),
plus `check:/report:/test:edge-domain-reach` npm scripts.

**The measurement, against deploy tip `e1214d3df`: 22 service-role edge
functions, 8 cross-domain table reaches.** Concentrated in `ai-coach` (5 —
grower diary/grows/plants/tents plus ingest sensor_readings) with one each from
`ecowitt-ingest`, `operator-ggs-real-payload-commit`, and `redeem-referral`.
Two further functions are declared `cross` and exempt by design: `delete-account`
(erasure, 3 tables) and `rls-selftest` (**9 tables across four domains**, the
widest reach of any service-role function). Reproduce with
`node scripts/check-edge-function-domain-reach.mjs --report`.

Read it carefully: most of those 8 reaches are **defensible** — `ai-coach` needs
grower context per the AI Doctor rules, the `tents` reads are routing. The
finding is not misconduct. It is that **nothing in the database distinguishes an
intended cross-domain read from an unintended one**. Three limits are pinned in
the spec's §5.1.1 and in the test suite: the scan is literal-only
(`.from(variable)` is invisible), `pi-ingest-readings` holds a service-role
client with zero measured literal reach (zero measured ≠ zero capability), and a
green run means "no undeclared literal reach", never a runtime fence.

**Phase 1 is APPROVED and DELIVERED (Cheek, 2026-08-14, "execute phase 1").**
One restricted role, one domain, local replay only. Shipped as
`scripts/sql/restricted-role-phase1-ingest.sql` (the role),
`scripts/run-restricted-role-harness.ts` (the §7 proofs), and
`scripts/check-restricted-role-fixture.test.mjs` (16 static safety tests, 16
pass locally), wired into `security-db-local` as a non-required step.

**Read this before touching it: the role is deliberately NOT a migration.**
Anything under `supabase/migrations/` reaches production on the next Lovable
apply, which would have violated the spec's own §8 fence (never create a role in
production) and §9 (`REJECT` for production roles) — silently, with no further
decision from anyone. So the role is created by a fixture applied only against a
loopback database by the harness, and dropped in teardown. The harness refuses a
non-loopback `SUPABASE_DB_URL` and has **no remote opt-in flag**, unlike the
other harnesses in this repo. Three of the static tests exist purely to hold that
line, including one asserting the repository still contains **zero** `CREATE ROLE`
statements in migrations — the §3.1 audit fact the whole spec was built on.

The role's shape: `NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE
NOREPLICATION NOBYPASSRLS`, `USAGE` on `public`, `EXECUTE` on exactly one
function (`public.bump_bridge_token_usage(uuid, integer)`), and **zero table
grants**. Partitioning by function grant rather than table grant is what survives
the 2026-08-06 founder decision.

**P3 — whether PostgREST honours a custom `role` JWT claim here — is the one
proof that may not run.** It needs `SUPABASE_JWT_SECRET`; the workflow step
derives it from `supabase status` where available, and the harness reports
`BLOCKED` (never `PASS`) when it is absent. Do not record the PostgREST
role-switching mechanism as available until P3 actually passes.

**Phase 2 (production adoption): APPROVED IN PRINCIPLE by Cheek 2026-08-14, but
now on HOLD after the 2026-08-15 gate answers.** Contract: spec §5.4, §5.4.1,
§5.4.2.

**Gate A came back favourable and is no longer the blocker.** Production
`postgres` holds `rolcreaterole = t` and is not superuser, so a plain
`CREATE ROLE x NOLOGIN NOINHERIT` — exactly the drafted shape — is expected to
succeed. Two different findings stop it instead:

1. **The JWT secret is unobtainable on Lovable Cloud**, so a role-claim JWT
   cannot be minted in production. P3 proved the PostgREST mechanism works
   _locally_; in production the role would be created and then **unreachable**.
   A fence nobody can route through is not a fence.
2. **Role durability across rebuilds is `UNKNOWN`**, and roles sit outside
   migrations and schema dumps entirely. Combined with the confirmed rule that a
   role cannot be hardened after creation, a silent drop-and-recreate would
   restore the principal **without its grants**, with nothing in-database
   signalling it.

Phases 0 and 1 keep their value regardless: the detector runs on every PR and the
10/10 demonstration stands. The original gate text follows.

A production role can only be created by a migration under
`supabase/migrations/`, which is exactly what Phase 1 avoided. Three things must
land first:

- **Gate A — does hosted Supabase permit `CREATE ROLE`?** `unknown`. We measured
  that the Supabase `postgres` role cannot even set `NOSUPERUSER` /
  `NOREPLICATION` / `NOBYPASSRLS` (§5.2.1). If `CREATE ROLE` is likewise refused,
  an unguarded migration **aborts the apply chain** — the same failure that
  disqualified `claude/cultivar-library-p1` today, and the same class as the open
  signup-attribution incident at the top of this file.
- **Gate B — does the _hosted_ PostgREST honour a custom `role` claim?** P3
  passed on the **local** stack only. A move to opaque `sb_secret_…` keys would
  remove role-claim JWTs entirely.
- **Gate C — Security review**, per `HANDOFF_PROTOCOL.md`, before any new
  database principal plus JWT minting exists.

Gates A and B are the subject of a read-only Lovable investigation prompt Cheek
holds. The spec carries the exact guarded migration to write once they return;
it degrades to a no-op rather than aborting if `CREATE ROLE` is refused.

**Still `REJECT` regardless:** re-pointing any edge function at the role (a
separate later decision, after the principal has baked), and default-deny table
grants — the last would reverse the 2026-08-06 founder decision recorded in
migration `20260807003500`.

**Convex-vs-Postgres recommendation (spec §10, 2026-08-14): adopt the Postgres
arm incrementally, hold Convex.** The Postgres arm is DEMONSTRATED (10/10
proofs). The Convex arm is `NOT_MEASURED` — and note carefully that PR #977 is
green across 99 checks while **no lane executes the spike's own P1–P9 isolation
proofs**; green there means the repo still builds with a `spikes/` folder, not
that isolation was shown. Convex is unmeasured, **not refuted** — its isolation
property is genuinely stronger — and neither architecture removes `ai-coach`'s
five cross-domain reaches cheaply. Council Chair advises; Cheek approves.

Two audit results from that spec update facts recorded elsewhere in this file's
orbit: the Convex spec's open `uncertainty` about `supabase/functions/_shared/`
constructing service-role clients resolves to **zero** such helpers, and the
2026-08-06 founder decision (declining default-deny table ACLs because Lovable
ships tables without ACL awareness) is the binding constraint on any role design.

**Abandoned by Cheek, 2026-08-14 — do not revive, do not merge:**

- `claude/breeder-mode-genetics` — superseded. Deploy already carries every
  `src/lib/genetics/*` module it adds, plus many it does not. Conflicts in ~30
  files against a 2026-06-06 base.
- `claude/cultivar-library-p1` — superseded **and unsafe**. Its migration
  `20260724000000_cultivar_library_foundation.sql` uses bare `CREATE TABLE`
  (9 unguarded, zero `IF NOT EXISTS`) for tables that already exist, shipped two
  days earlier by `20260722203000_strain_reference_library_v1.sql`. Merging it
  raises `42P07` and aborts the replay, taking `security-db-local` and the pgTAP
  lanes with it. It is an earlier draft of a feature that already shipped.

Update 2026-08-18: **both branches are now deleted from origin.** Agent
sessions still cannot delete branches (re-confirmed: `git push --delete` →
HTTP 403 from the branch-scoped push credential, and the GitHub MCP toolset
exposes no ref-deletion endpoint), so Cheek deleted them himself during the
2026-08-18 cleanup sweep recorded below, alongside 21 other stale `claude/*`
branches. The dispositions above remain the record of _why_ they died.

**Parent program:** MODE A SEO measurement-readiness work.

**Active SEO-evidence slice:** `P2 LIGHTING_GUIDE_CTA_ATTRIBUTION_CONTRACT` in PR #679,
with status `DOCUMENTED_MISSING_NO_EVENT_ADDED`. It records the guide CTA as
`MISSING`/`NOT_MEASURED`; it does not authorize a new event or runtime instrumentation.

**Mandatory governance handoff (this branch):** Refresh stale operating-state facts, align
the permanent `SKIPPED` status vocabulary, and correct the signed-out root-route runbook
description across the canonical constitution and its mirrors/role prompts. This is
docs/governance reconciliation only; it does not change the approved product or analytics
implementation scope.

Handoff status as of 2026-08-07: the `SKIPPED` vocabulary row is present in `AGENTS.md`
and in every mirror that carries a status table (`GEMINI.md`, `docs/agents/roles/security.md`,
`docs/agents/roles/gemini.md`); the corrected signed-out root-route description is present in
`AGENTS.md`. Both items read as complete. The stale-facts refresh is this edit.

Five **Completed, out of slice** records are archived verbatim in
`CURRENT_STATE_ARCHIVE.md`. One-line dispositions:

- 2026-08-07 — #586/#809/#812 Action Queue atomic-create RPC shipped across
  three merges; production application of its two migrations remains `BLOCKED`
  from agent sessions, and the RPC's expand-step constraints do not bind
  legacy direct-insert writers.
- 2026-08-11 — #885 agent-integrations MCP publication audit (docs only); live
  publication state remains `BLOCKED` from agent sessions.
- 2026-08-13 — Lovable knowledge-pack mechanism first recorded; its
  pre-2026-08-13 backup audited against `e7690396e`. No sync automation
  authorized, no owner assigned, replacement pack unread.
- 2026-08-15 — Lovable project Knowledge rewritten from CURRENT_STATE
  (Version 2026-08-15.1; snapshot
  `docs/lovable/verdant-project-knowledge-2026-08-15.md`); still no sync bot
  authorized.
- 2026-08-18 — Claude PR/branch cleanup sweep: zero open Claude-authored PRs;
  all 23 stale `claude/*` branches deleted by Cheek; branch deletion remains
  impossible from agent sessions (HTTP 403, branch-scoped credential).

**Completed, out of slice (recorded 2026-08-18):** Lovable project Knowledge
re-applied as Version 2026-08-18.1 at Cheek's instruction, sourced from this
file at deploy tip `87ae05e` (#1026) after the archival slice merged. Snapshot:
`docs/lovable/verdant-project-knowledge-2026-08-18.md` (9,979/10,000 chars).
The pre-write read confirmed the live Knowledge field still matched the
committed 2026-08-15 snapshot, so nothing unrecorded was overwritten. Live
`/version.json` could not be re-measured from the agent session (network
policy 403 — `BLOCKED`); the pack carries the 2026-08-15 stamp `5e2fcedd4271`
(#984) explicitly labeled as last measurement. Workspace knowledge unchanged.
Still no Knowledge sync automation authorized and no owner assigned for one.

**Recorded 2026-08-20 (ADVISORY, NOT APPROVED; re-pinned at `cff3efd`):** Claude
triaged an owner-supplied 100-prompt Lovable build roadmap against the shipping branch.
Deliverable: `docs/lovable/verdant-lovable-prompt-triage-2026-08-20.md`, now at
**revision 2**, re-audited from `77d8eec` to `cff3efd` after the deploy branch advanced
(#1035, #1039 B0a, #1047 B4a). It selects and rewrites eight prompts and rejects the
rest with reasons. **It authorizes nothing** — no implementation, no schema, no Lovable
send, no production write.

Findings other agents should not have to rediscover: (1) prompt #96 asks for a **Stripe**
checkout UI, but production runs **Paddle** (233 references vs 20, five live edge
functions) — sending it would put a second payment provider into a live billing system;
(2) prompt #60 asks to visually smooth anomalous sensor spikes such as 0% humidity, which
inverts the Hard Safety Rule on unhealthy telemetry, and is included only in
flag-and-label form; (3) **prompt #4's own wording collides with an existing page** —
`src/pages/GrowRoomMode.tsx` / `src/lib/growRoomModeRules.ts` are a read-only multi-tent
operator view doing no theming, so the pack renames that pick to "Night Mode" and fences
the existing files off; (4) prompt #49 now has a measured target — **S5** in the B0a
baseline (≥5 interactions, 1+ reselections), the most expensive row in that table, though
S5 is a documented estimate and only S1a/S7 are automated.

Seven of the eight picks require zero new tables, chosen deliberately because migrations
do not auto-apply (see the second-drift section above). Collision boundaries were
re-checked at `cff3efd`: Tranche A edit points, PRs #828/#817/#696, the single
`quicklog_save_manual` write path, and now the **live Tranche B+ surface** (B0a harness,
B4a `doctorStartContextRules`/`AiDoctorStart`, the quicklog rules files). Only pick #49
touches an actively-edited family; it is flagged and resequenced behind the others.
Docs-only; no code, schema, or migration changes.

In scope — these bullets scope the **Mode A SEO parent program above**, not the completed
#809 entry:

- reverify the two existing lighting routes and the deployed release identity
- intercept and locally fulfill GA4 collection requests so verification traffic is not sent
- align existing readiness/baseline/measurement artifacts with current production evidence
- preserve the GA4/GSC access blockers, Day 0 `UNSET`, and the four-week clock
  `NOT_STARTED`
- document guide-CTA attribution as `MISSING`/`NOT_MEASURED`; do not implement it
  without a separately approved instrumentation slice

Out of scope:

- application/runtime analytics code
- schema, RLS, authentication, migrations, or Edge Functions
- deployment or Lovable publishing
- GA4/GSC activation or property-setting changes
- a third lighting page or content rewrite
- changing the two failing schema-guard workflows or their secrets
- Convex (the isolated spike is a separate named slice above, not SEO work)

---

## Known blockers and next approved slice

1. In the existing GA4 production stream, the owner must disable Enhanced Measurement page
   views based on browser-history changes while retaining Verdant's explicit SPA page-view
   owner.
2. The owner must provide an approved, read-only authenticated access path to the existing
   GA4 property and Google Search Console property; never commit or paste credentials.
3. After both owner actions, rerun the intercepted navigation matrix and record genuine
   authenticated GA4/GSC baselines or authenticated `NO_DATA`.
4. Record Day 0 only after the singleton analytics contract and both authenticated baselines
   pass.
5. Handle the unrelated deploy-head schema/migration guard failures in a separate scoped
   workstream.
6. Production release-identity resilience — **RESOLVED repo-side and verified
   live 2026-08-05** (shipped via PR #735, hardened in #737; live verification
   matched the 22:06Z publish exactly). Full history and the residual optional
   owner items are archived — see `CURRENT_STATE_ARCHIVE.md`. How to read and
   resolve release stamps: `docs/release-provenance-runbook.md`.
7. **Public root route `/` empty-shell — Slice 1 live-verified 2026-08-15.** Found 2026-08-07 while
   reconciling the Ahrefs site audit (project `10204962`, crawl `2026-08-07T07:14:05Z`).
   Root cause isolated 2026-08-12: the deliberate loading-until-hydrated gate in
   `src/components/RootEntry.tsx` (the fix for a navigation-freezing hydration
   mismatch), not an SSR defect. **Cheek selected Option A on 2026-08-12** (`/` becomes
   the canonical home). Slice 1 shipped as [PR #949](https://github.com/Verdant-OS/verdant-grow-diary/pull/949)
   (`741f99e1b`). Live `/` on 2026-08-15 SSRs the landing (`PASS` — h1, canonical,
   1141 body words). Do not keep citing the 2026-08-07 empty-shell `FAIL` as current.
   Slice 2 (the `/welcome` → `/` consolidation, 35 pinned files) remains
   unapproved. Spec and handoff:
   `docs/seo/root-route-canonical-home-spec.md`. Full audit evidence:
   `docs/seo/ahrefs-site-audit-2026-08-07.md`.
8. **Ahrefs structured-data findings must be triaged, not bulk-fixed.** All 56
   `SoftwareApplication` nodes omit `aggregateRating`/`review` **by design** —
   `scripts/validate-jsonld-rich-results.mjs` records the reason inline ("intentional for
   Verdant — no fake reviews"). Third-party crawlers score this as a rich-results error on
   every page; remediating it would fabricate review data and violate the Hard Safety Rule
   _No fake live data_. Record it as an accepted exception in `config/seo-allowlist.json`.
   The genuinely fixable defect in the same cluster is `Article.image` on all 17 Article
   pages pointing at the 512px brand logo rather than article imagery — the local gate
   cannot see it, because it only checks whether `image` is absent. Sibling note:
   **the unsitemapped indexable routes were adjudicated 2026-08-20 and are now
   RESOLVED LIVE — published and re-measured 2026-08-21.** Cheek's call was SITEMAP, not noindex. The set was
   **six**, not the four this file had recorded: `scripts/public-route-parity.config.mjs`
   also carried `/pheno-expression-showcase` and `/docs/mcp-api` in
   `STATIC_ONLY_ROUTES`, and all six measured HTTP 200, self-canonical,
   `index, follow`, absent from `sitemap.xml`, and disallowed by no robots group.
   Five were added to `public/sitemap.xml` (61 `<loc>` in-repo, up from 56).
   **`/breeder-beta` was held, then resolved the same day.** It renders the same
   `<BetaLanding>` component as `/creator-beta` — whose own source header calls the
   breeder route a "copy-only difference" — and measured 233 of ~237 shared unique
   visible tokens with identical `h1` and every `h2`. Both being self-canonical would
   have set two near-identical URLs competing on the same queries, so it was held for
   an owner call. **Cheek chose canonicalisation:** `/breeder-beta` now points its
   canonical at `/creator-beta` and stays affirmatively `index, follow`, keeping
   breeder-oriented copy for direct and paid traffic while conceding the ranking URL.
   It therefore stays out of `sitemap.xml` **by design** — never advertise a URL whose
   canonical points elsewhere.

   Implementation spans three halves that must agree, because a drift in any one is
   silent: the build-time head (`crossCanonicalDocument` in
   `src/lib/build/staticPublicSeoDocuments.ts`), the hydrated runtime head
   (`canonicalPath` on `usePageSeo`, passed from `src/pages/BreederBeta.tsx` — if this
   drifts back to a self-canonical it overwrites the pre-rendered one for every
   JS-rendering crawler), and the sitemap exclusion in
   `scripts/public-route-parity.config.mjs`. All three are pinned by
   `src/test/breeder-beta-cross-canonical.test.ts`.

   Note the distinction from the older `/strains/*` aliases: those use
   `aliasDocument`, which inherits the target's copy and marks the page
   `noindex, follow`. A cross-canonical must **not** also be `noindex` — that sends
   crawlers two contradictory instructions about one URL — so the two helpers are
   deliberately separate.

---

## Release-provenance runbook (added 2026-08-05)

Relocated 2026-08-18 to `docs/release-provenance-runbook.md` — durable
reference, not a changing operational fact.

No new content family, automation, device control, production schema change, or
direct production write is approved by this state file. The 2026-08-13 Convex
slice is an isolated `spikes/` sandbox specified in
`docs/specs/convex-component-physical-sandbox-spike.md`; it is not a production
schema change and does not authorize production writes.

---

## Architecture-audit adjudication — owner/reviewer pairing (recorded 2026-08-21)

Recorded per `docs/agents/HANDOFF_PROTOCOL.md`, which requires the pairing in
**both** the handoff block and this file. Raised in review of the PR below when
the pairing existed only in the handoff.

| Field                             | Value                                                                                                                                                                                                                                                                                            |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Slice                             | Adjudication of an owner-supplied architecture audit against measured deploy-branch state                                                                                                                                                                                                        |
| **Slice owner**                   | **Claude**                                                                                                                                                                                                                                                                                       |
| **Independent reviewer**          | **#1087 — Codex**, performed, not merely nominated. **#1092 — Grok (GDP)**, named by Cheek on the PR 2026-08-22 17:09 UTC; review in progress at that time, no verdict yet. Two PRs on one branch, two separate seats — do not read Codex's completed #1087 review as covering #1092             |
| PR / branch                       | [#1087](https://github.com/Verdant-OS/verdant-grow-diary/pull/1087) **merged** `faea6e9c59ad` · follow-on [#1092](https://github.com/Verdant-OS/verdant-grow-diary/pull/1092) **open** · both on `claude/verdant-architecture-audit-6qe80x`                                                      |
| Deliverable                       | `docs/audits/architecture-audit-adjudication-2026-08-21.md` — documentation only                                                                                                                                                                                                                 |
| Repository measurements pinned at | `28c01a017`. **Repository inventories only.** The deliverable's live HTTP probes and provenance comparisons use other commits — `4b1c4867e685`, `39935889fe02`, `5a13d0b47cb7`, `ea31fbdfb934` — and its §6.1 rows carry their own timestamps. Do not attribute production evidence to this tree |

**Why the reviewer row now names two seats.** #1087 merged on 2026-08-21 while its
branch was queue-locked, so two verified Codex findings could not land in it; #1092
is the follow-on that carries them, on the same branch. It is its own slice under
`AGENTS.md`'s "no code ships without peer review", so it needs its own named
independent reviewer rather than inheriting #1087's. Cheek named **Grok (GDP)** for
it on the PR at 17:09 UTC ("Review in progress. Will post PASS/FAIL/BLOCKED with
P0/P1 on this PR. No merge from this comment."), and marked #1092 ready for review
in the same minute. **No agent performed either transition.** The seat is _named_,
not _discharged_ — recording it here satisfies `HANDOFF_PROTOCOL.md:25`, which is
the requirement this whole section exists to meet, and satisfies nothing else. Do
not read a named seat as a completed review.

**Note the Grok naming that is NOT this one.** The MACAE reference-ingest row lower
in this file also names Grok (GDP) as its protocol peer-review seat (filled by Cheek
the same day, via #1100). Different slice, different seat, same reviewer — do not
collapse the two or treat a verdict on one as a verdict on the other.

**Read the deliverable's own withdrawal record before citing it — and read it
there, not here.** Review produced **nine** substantive corrections as of
`3ba7264f2`: claims withdrawn outright, one conclusion reversed, one retraction
that was itself wrong and withdrawn in turn, one relapse into an
already-withdrawn inference, and — added on `3ba7264f2` — a same-build ordering
claim refuted from `package.json`'s `prebuild`/`build` sequence, plus a
follow-up test wrongly described as able to refute as well as confirm. **This
count is maintained by hand and goes stale on every new review round; the
document's own record is authoritative.** It keeps every correction visible
rather than patching silently, and names three recurring failure modes:
inference presented as conclusion, propagation after change, and bounded reads
presented as complete. Its labelled bounds are the load-bearing part, not its
headlines.

**The provenance finding is now measured across FIVE publishes**, not one — see
the Production commit row above for the full comparison. `4b1c4867e685`,
`39935889fe02` (#1080), `5a13d0b47cb7` (#1089), `ea31fbdfb934` (#1086) and
`faea6e9c59ad` (#1087) all mismatch, all `dirty: true`. **This count is
hand-maintained and has already gone stale once** — it read "four" here while the
Production commit row said five. Treat that row as authoritative and re-derive from
it rather than trusting this sentence. The middle pair differ only in
`docs/agents/CURRENT_STATE.md` — outside `TREE_HASH_ROOTS` — and recompute
identically, which is the mechanism behaving correctly. **Do not
"confirm" any of this against a `git rev-parse` tree id:** `treeHash` is
Verdant's SHA-256 over the allowlisted roots, and the two never match even on
healthy builds. The bound is unchanged — the hashed roots include inputs that
never ship, so this establishes build-workspace drift at stamp time, and whether
any shipped byte differs stays `NOT_MEASURED`.

Two findings other agents should not rediscover:

- **The `vercel.json` directives that were measured are not applied as declared
  in production** — `redirects` (all eight, with a positive control), `rewrites`
  (by response-content comparison), and the **catch-all `/(.*)` header block
  only** (3 of its 5 arrive; HSTS differs from the declared value).
  **Everything else in that file is `NOT_MEASURED`, and the categorical "does
  not govern production" is deliberately not asserted.** Specifically unprobed:
  the `/unsubscribe` header block (`Cache-Control`, `Referrer-Policy`,
  `X-Robots-Tag`), the `/assets/(.*)` block (`Cache-Control`), and the
  `projectSettings` (labelled `inference`), `cleanUrls` and `git` keys. Where
  the three delivered headers originate is also `NOT_MEASURED`. **Do not read
  the catch-all result as covering the path-specific rules.**
- **The Bun/npm lockfile transition is dated.** `reviewBy` is 2026-08-25 and
  `check-bun-lockfile-policy.mjs` compares strictly greater, so the gate first
  fails **2026-08-26 UTC**. Its prerequisite is an **inventory across all five
  declared npm consumers** in `config/dependency-lockfile-transition.json` —
  `vercel.json`, the SEO-monitoring workflow, `README.md`, the agent run skill,
  and the preview-deployment checklist. The gate requires every declared
  consumer while `package-lock.json` remains, so retiring the preview Vercel
  project does not by itself clear the gate. Do **not** drop the compatibility
  lock on the strength of that project alone — one of the others is a workflow
  that actually runs. **Map contracts to deployments before counting what
  remains:** the preview checklist and `vercel.json` describe the _same_
  deployment (the checklist requires the project's settings to match that file,
  and its rollback step removes it), so five files are not five deployments. An
  earlier reading that treated production and preview as the same deployment was
  reversed; a later one that counted the five as independent was too.

Owner-gated, unchanged by this slice: the publisher's build log, the lockfile
decision above, and whether to commission the §7.1 ADR against the merged
`docs/codebase-map.md`.

**A candidate for the provenance question exists, but it is weak — read the
caveats before citing it.** #1090 (`9133a4c45`) merged into this branch on
2026-08-21 at 20:10Z, naming a mechanism: a Vite plugin regenerated
`supabase/functions/mcp/index.ts` — a `TREE_HASH_ROOTS` path — on every
non-Windows `vite dev` / `vite build`. Verified in-repo: that file **is** inside
the hashed roots, and the wiring existed at `ea31fbdfb`. The plugin's regeneration
behaviour and its byte-difference are `source claim` from #1090, not verified.

**The same-build version of this is impossible and was asserted here before being
withdrawn.** `package.json:9-11` runs `stamp-version.mjs` inside `prebuild`, and
only then `build` → `vite build`; the lifecycle orders `pre<script>` first, so one
build's stamp is captured before any Vite hook fires. Codex refuted it in review of
#1087. What survives is a **cross-build** version: a rewrite during an editor
session or a previous build sits in the workspace when the next publish stamps it —
which requires the build workspace to **persist between cycles**, an `inference`
supported by `dirty: true` / `ref: "__orphan__"` and by #1090's own "the workspace
no longer regenerates the file", not a measurement. Under a fresh-workspace-per-build
premise the candidate collapses. The right investigation, per Codex, is mutations
occurring **before** `stamp-version.mjs`.

**The test is one-directional.** Once a post-#1090 build is published, re-fetch
`/version.json` and recompute that commit's tree. Mismatch and `dirty: true`
_stopping_ supports the candidate; _persisting_ does **not** refute it, since a
workspace already dirtied by an earlier cycle stays dirty until something resets it.
**RUN 2026-08-22 16:16 UTC — the result is "no information", exactly as the rule
predicts.** Production now serves `faea6e9c59ad`, which contains #1090 (verified by
`git merge-base --is-ancestor`), so this is a post-#1090 build. Recomputed tree
`436eede41e4b` (5,856 files) vs stamped `7d9cc8a12898`: **mismatch persists**, and
`dirty: true` / `ref: "__orphan__"` persist with it. Under the one-directional rule
stated in the preceding paragraph that **neither confirms nor refutes** the candidate.
Do not report it as a refutation, and do not report it as confirmation of some other
mechanism — the persistence is precisely the outcome the rule says carries no signal.
#1090 puts the stamp / `dirty` / `__orphan__` diagnosis outside its own scope and
explains nothing about `ref: "__orphan__"`, so **the publisher's build log remains the
only route that settles it**, and it stays owner-gated. Prior text follows. **Not yet
available:** at 2026-08-21 20:35Z production still served the pre-#1090
`ea31fbdfb934` (`buildTime 15:53:46.096Z`).

One caution that is independent of all the above — the named path is an
edge-function source that publishing deploys, so the "hashed roots include inputs
that never ship" reassurance does **not** cover it. Whether any shipped byte
differed stays `NOT_MEASURED`.

---

## One-Tent goal — blocked on external gates, not code work (recorded 2026-08-21)

Recorded by Claude 2026-08-21 ~22:00 UTC; **all four gate states were re-checked
2026-08-22 — the first three at 17:12 UTC and #1076 re-queried at 17:24 UTC**, after
review flagged that a blanket "re-checked" claim sat above a row still dated
2026-08-21. At that measurement, **no agent performed any of the external transitions
named below**, and none was authorized by this entry.

**Two of the four have since closed: #1091 merged on 2026-08-22, and #1076 is now
closed unmerged.** The table below now records two active gates and two closed records,
not four open gates. The public attestation and disposable authenticated proof remain
the active blockers.

### Two active gates and two resolved records

| Gate                                | State                                                                                                                                                                                                                                                                                                                                   |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #1091 ready-state / reviewer action | **CLOSED 2026-08-22.** #1091 is **merged** — `merged: true`, closed 12:38:29 UTC by `cheekhimself`, final head `c432f9836f74`. It is no longer a draft and no longer waiting on anyone. Superseded row text: "Owner-only. Draft at `74e1ad4`; review automation cannot engage until the transition happens. Not performed by any agent" |
| Public attestation                  | **STILL INVALID** (tip/lag re-measured 2026-08-23 02:09 UTC). Canonical `a3ae36765`, production `faea6e9c59ad` `dirty: true`, lag **`12`** — see below                                                                                                                                                                                  |
| Disposable authenticated proof      | **Must remain UNDISPATCHED** while attestation is invalid                                                                                                                                                                                                                                                                               |
| #1076 CI runner migration proposal  | **CLOSED UNMERGED.** Retained as a resolved record for traceability; it no longer blocks or authorizes a workflow migration.                                                                                                                                                                                                            |

### #1091 — 35/35 required is true; "clean head" is not (superseded head)

> **#1091 MERGED 2026-08-22 12:38:29 UTC** as `72e766314` on the deploy branch,
> from final head `c432f9836f74` — **not** `74e1ad4`. Everything below was measured
> against `74e1ad4` and describes that head only. The branch advanced past it before
> merging (`c432f983`, "fix: withhold paused One-Tent proof reads", 11:59:28 UTC,
> touching five files under `src/`), so **do not read the smoke failure below as a
> statement about the merged code.** Whether that check was re-run, and with what
> result, on `c432f983` is `NOT_MEASURED` here. The finding is kept because the
> _lesson_ survives the merge — "35/35 green" summarised away a red check — while
> the _measurement_ does not.

`established fact`, measured 2026-08-21 ~21:50 UTC against head `74e1ad4`
(branch `codex/one-tent-polish-ea31`, **behind the deploy tip by 1 at that time**):

**All 35 ruleset-required contexts are green** — enumerated, not assumed: the 32
`Full test suite (shard n/32)` jobs, `Lint, typecheck, test, build`,
`Preflight — edge shared-lib mirror in sync`, and `test:legal-seo`. The ruleset is
genuinely satisfied.

**A non-required check is red on that same head, and it is not a test failure.**
`Quick Log Playwright smoke` concluded `failure` (job `96919203284`, run
`32529735698`). Its own step outputs:

- `FIXTURE_STEP_OUTCOME: failure`
- `SMOKE_STEP_OUTCOME: skipped` — the smoke never executed
- `REPORT_JSON_PRESENT: false`, `SMOKE_COUNTS_AVAILABLE: false` — no report produced

It ran **authenticated against the live Lovable host** (`E2E_FIXTURE_MODE: true`)
with three fixture variables empty: expected grow name, second plant name, and
account hint. In the **same run**, `Authenticated One-Tent branch proof` concluded
`skipped`. `Browser census (authenticated)` was still `in_progress` at read time.

**Root cause is `NOT_MEASURED`**, and the distinction matters before anyone
resequences work around it: a failed _fixture/config_ step is not the same finding
as a failed assertion, and only the second would implicate product code. Nobody
should conclude either way from the summary line.

**Why this is recorded rather than acted on.** `codex/one-tent-polish-ea31` is
Codex's owned slice; adopting it would violate the collision fences in this file.
This entry is a handoff, not a claim on the work. But **"35/35 green" is the
summary that hides this**, so a ready-state transition taken on that summary alone
would carry an unexamined red into review.

**That warning is now retrospective, not actionable.** #1091 merged on 2026-08-22
from a later head. The point stands as a reading rule for the next PR summarised as
"all required green"; it is no longer advice about #1091.

### Attestation — re-measured 2026-08-22, still invalid

`established fact`, tip and lag measured 2026-08-23 **02:09 UTC**; the served-commit
rows measured 2026-08-22 **16:16 UTC** and re-confirmed unchanged at 17:09, 17:32,
17:51, 18:22, 00:02 and 02:09:

| Axis                 | Value                                                                                                            |
| -------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Canonical deploy tip | `a3ae36765` (#1105)                                                                                              |
| Production serves    | `faea6e9c59ad`, `buildTime 2026-08-21T20:51:46.584Z`, `treeHash 7d9cc8a12898`                                    |
| Provenance flags     | `dirty: true`, `ref: "__orphan__"`                                                                               |
| Ancestry             | live **is** an ancestor of the tip                                                                               |
| Publish lag          | **12** first-parent commits (#1095, #1096, #1098, #1091, #1099, #1097, #1100, #1101, #1102, #1092, #1107, #1105) |

**The gap has now widened twice for two different reasons, and the distinction
matters.** Between 2026-08-21 and the 16:16 UTC reading, production republished _and_
the tip moved six commits — both halves changed, and the lag went 2 → 6. Between
2026-08-22 16:16 UTC and 2026-08-23 02:09 UTC, production did **not** republish at
all; only the tip advanced (#1100, #1101, #1102, #1092, #1107, #1105), taking the lag
6 → 7 → 8 → 9 → 10 → 11 → **12** across nearly ten hours. A widening lag is not by itself evidence of a stalled
publish, nor of a fresh one; read which half moved. `dirty: true` and
`ref: "__orphan__"` survived the republish, so the provenance defect is not a
one-build artifact. Prior reading, superseded: 2026-08-21 21:58:32 UTC — tip
`faea6e9c59ad`, live `ea31fbdfb934`, lag `2`, which itself re-confirmed the 21:05 UTC
row 53 minutes later. That pair is exactly why a lag figure is never carried forward:
two readings agreeing 53 minutes apart said nothing about the next 18 hours.

### `20260813030000` — "unapplied" carries two meanings, and one is dangerous

**This is the entry most likely to be misread, so state which sense is meant every
time.**

- **The GitHub apply lane never succeeded** — the apply-signup workflow still shows
  only its failed PREFLIGHT. True.
- **The production objects are live.** Per the measurement already recorded in the
  signup-attribution section above (2026-08-21 ~15:23 UTC, Lovable `query_database`
  against the production project): the table, all four helper functions, the
  readiness RPC, and a `handle_new_user` carrying the `RAISE LOG` guard from
  `20260821150000` all exist. Ledger name-rows for `20260813030000` are present via
  the founder backfill.

**The hard stop is unchanged and this entry does not soften it: do NOT GitHub-APPLY
`20260813030000_signup_acquisition_forward_repair.sql`.** That file re-issues an
**unguarded** `handle_new_user` and would overwrite the live guard — a production
incident. A reader who takes a bare "remains unapplied" as licence to apply it has
inverted the finding.

---

## ⚠️ Production JS ships a LIVE payments token — which FAILS CLOSED, disabling checkout (recorded 2026-08-21, severity corrected 2026-08-22)

Recorded by Claude 2026-08-21 ~23:03 UTC at Cheek's instruction, after Cheek
raised it; **re-measured 2026-08-22 16:16 UTC against a newer production build and
still true.** **Publishing is stopped by owner order while this stands.** Nothing
here authorizes a publish, an env edit, or a token rotation.

> ### ⚠️ SEVERITY CORRECTED 2026-08-22 — read this before quoting anything below
>
> **An earlier revision of this section said "production is running **live** payments."
> That was wrong, and the correction inverts the risk.** Raised by Copilot in review of
> #1092, verified in the served source **and** in the shipped bundle before conceding.
>
> At the served SHA `faea6e9c59ad`, `src/lib/paddleEnvironment.ts` classifies a `live_`
> token as `"live"` and `resolvePaddleCheckoutEnvironment` returns `"sandbox"` **only**
> for a `test_` token — every other class resolves to `"unavailable"`, on every host.
> `src/lib/paddle.ts`'s own header states the policy: _"Live tokens fail closed on every
> host."_ Confirmed empirically in the shipped bundle rather than inferred from source:
> the minified resolver reads
> ``iv(e){return rv(e.token)===`sandbox`?`sandbox`:`unavailable`}``, and the blocking
> copy `Checkout disabled: Verdant currently supports Paddle sandbox testing only.`
> ships alongside it.
>
> **So production is not taking live payments. Production is taking NO payments.** The
> live-class token disables checkout entirely; a grower who tries to upgrade sees the
> blocking message. That is a different defect from the one first recorded — a
> **checkout-blocking configuration and provenance defect**, not an unnoticed live
> billing surface.
>
> **The direction of the publish risk flips with it.** A file-sourced `live → test`
> swap would **restore** the intended sandbox checkout, not "break live payments".
> The corrected outcome list is below.
>
> The measurements in this section are unchanged and still stand — what a `live_`
> token _means_ is what was wrong. This is the "inference presented as conclusion"
> failure mode again: token class was read as billing state without checking the code
> that consumes it.

**Never reproduce a live token body** — in this file, a commit message, a PR, or
chat. Class prefix, length and redacted context are sufficient and are all that
appears below.

### What is measured

`established fact`, **re-measured over live HTTPS 2026-08-22 16:16 UTC** against a
DIFFERENT, newer production build than the one first recorded. The finding survives
the republish unchanged:

| Axis                                         | Value                                                                                    |
| -------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Production bundle                            | `/assets/index-C-R0_Bat.js` (820,070 bytes)                                              |
| Inlined key                                  | `VITE_PAYMENTS_CLIENT_TOKEN`                                                             |
| Shipped class                                | **`live_`**, body length 27, one distinct value, two occurrences in that bundle          |
| `test_`-shaped payments token in that bundle | **zero**                                                                                 |
| Repo `.env.production`                       | **`test_`** class (sha256 `1a79e29c…`)                                                   |
| Lovable project `.env.production`            | **`test_`** class, byte-identical to the repo file — **re-read 2026-08-22 16:16 UTC**    |
| `.env.development`                           | byte-identical to both (sha256 `1a79e29c…`)                                              |
| Serving commit at measurement                | `faea6e9c59ad`, `buildTime 2026-08-21T20:51:46.584Z`, `dirty: true`, `ref: "__orphan__"` |

**Still the live build at 2026-08-23 02:09 UTC.** `/version.json` was re-fetched at
17:09, 17:32, 17:51, 18:22, 00:02 and 02:09, returning the same commit and the same
`buildTime` every time, so the bundle measured at 16:16 is
still what production serves. **The bundle itself was not re-fetched at 17:09** — this
row is a 16:16 UTC measurement carried forward on an unchanged serving commit, which is
the one case where carrying forward is legitimate. If `buildTime` moves, re-fetch the
bundle rather than trusting this row.

**The republish is itself evidence.** The asset filename changed
(`index-aTS7aKMk.js` → `index-C-R0_Bat.js`) across a build that also moved the served
commit `ea31fbdfb934` → `faea6e9c59ad` — so this is a rebuild, not a cached artifact —
and the shipped token is still `live_`, still 27 characters, still one distinct value
appearing twice, while both `.env.production` files still say `test_`. **A build cycle
did not reconcile the two.** The 2026-08-21 23:03:25 UTC reading of
`/assets/index-aTS7aKMk.js` is superseded only in its bundle path; every other row held.

**The shipped value does not match what either `.env.production` says NOW.** State it
that way and no further — an earlier revision said the bundle "came from neither
`.env.production` file", which is a categorical attribution the evidence does not
support, withdrawn 2026-08-22 after a review P2.

**Which source supplied the value at build time is `NOT_MEASURED`**, and two candidates
remain live:

1. **A platform environment variable** overriding the files at resolution time — the
   obvious candidate, and the one the §6.1 withdrawal below leans on.
2. **The workspace `.env.production` itself carrying a `live_` value at build time and
   being restored afterwards.** Both files were read _after_ deployment, so this is not
   excluded by anything measured here. It is the more interesting candidate, because it
   would explain the shipped token **and** the `treeHash` mismatch with one mechanism,
   on a build already stamped `dirty: true`.

**Do not discard candidate 2.** The §6.1 withdrawal argues candidate 1 is _likeliest_;
it does not establish candidate 1 and does not exonerate the file. Only the
owner-gated build log separates them. One bound tightened and one did not:
the earlier scan covered all 20 production bundles for `test_`-shaped tokens and found
none; **this re-measure scanned the main bundle only**, so the other nineteen are
`NOT_MEASURED` at the 2026-08-22 reading rather than re-confirmed.

### Pre-publish read, performed 2026-08-22 16:16 UTC

The owner's standing instruction is to re-read the Lovable `.env.production` before
anyone opens the publish button. **Done, and the answer is unchanged: it still reads
`test_`.**

Read that result correctly — it is the _reason_ the hazard is unresolved, not a
clearance. The file said `test_` on 2026-08-21 while production shipped `live_`, and it
says `test_` today while production still ships `live_`. **Reading the file cannot tell
you what a publish will produce**, because its contents _now_ are not evidence about
what was resolved at the earlier build — whether a platform variable overrode it, or the
file itself briefly differed and was restored. **Note what this does NOT say:** an
earlier revision said "the file demonstrably is not what produced the current bundle",
which contradicts candidate 2 recorded above and is **withdrawn 2026-08-22** after a
sixth review P2. The build-time source stays `NOT_MEASURED`. Only the platform env panel
and the publisher's build log can settle it, and both are owner-gated. A publish taken on the strength of this read alone is exactly the
sloppy publish the owner warned against.

### Why this is not merely an env-file discrepancy

`scripts/lib/tree-hash.mjs` lists the committed `.env` files in
`TREE_HASH_ROOTS`, and its own comment gives the reason: _"Committed Vite env
files: `VITE_\*` values are inlined into shipped JS, so an env-only commit
produces different app bytes and must move the hash."\_

So `.env.production` is a hashed root **precisely because** its values reach
shipped JS — and its shipped value differs from its committed value.

**WITHDRAWN 2026-08-22 — this did NOT close the audit's §6.1 `NOT_MEASURED`, and
saying it did was an error.** Raised as a P2 by `chatgpt-codex-connector` on #1092
and verified before conceding. The withdrawn claim read: "**A shipped byte does
differ**, and it is a hashed root ... The workspace-drift finding is no longer
confined to inputs that never reach users."

**Why it was wrong.** §6.1's open question is whether _the workspace content
responsible for the `treeHash` mismatch_ reached shipped bytes. What is measured
here is different: shipped JS diverges from what the **committed** `.env.production`
prescribes. Those coincide only if the **workspace file on disk** differed at build
time — and there is a mechanism that produces the measurement without any such
difference. Vite's `loadEnv` resolves `VITE_*` from platform environment variables as
well as from `.env` files, and a platform variable overrides the file **without
altering the file**. Under that mechanism the workspace `.env.production` is
byte-identical to the committed one, contributes **nothing** to the tree-hash
mismatch, and the mismatch is caused by some other, still-unidentified file.

**That mechanism is sufficient to break the inference; it is not established as what
happened.** The workspace file may equally have carried a `live_` value at build time
and been restored afterwards — see the two candidates recorded above — in which case it
_would_ have both moved the hash and shipped. Either way the §6.1 bound holds, because
neither candidate is measured. Do not read this withdrawal as clearing the file.

So two separate claims were conflated:

| Claim                                                                    | Status                                                  |
| ------------------------------------------------------------------------ | ------------------------------------------------------- |
| Shipped bytes differ from what the committed env file prescribes         | **measured** — that is the finding above, and it stands |
| The workspace drift behind the `treeHash` mismatch reached shipped bytes | **`NOT_MEASURED`** — unchanged; §6.1's bound is intact  |

**The audit's §6.1 bound therefore stands as written and needs no correction** —
which also retires the standing offer to amend that document on this point. This is
the "inference presented as conclusion" failure mode the deliverable itself names,
committed here while writing about it.

What survives, and is worth keeping: `.env.production` **is** in `TREE_HASH_ROOTS`
precisely because `VITE_*` values reach shipped JS, so _if_ that file ever drifts in
the workspace it would both move the hash and change shipped bytes. That is a reason
to keep watching it — not evidence that it happened.

### The publish hazard — THREE outcomes, not two (corrected 2026-08-22)

**The two-outcome model recorded here was incomplete.** Raised as a P2 by
`chatgpt-codex-connector` on #1092 and verified at source. #1091 merged
`scripts/assert-paddle-production-sandbox.mjs` into `package.json`'s **`prebuild`**,
where it now runs _first_, ahead of `stamp-version.mjs`. Read directly: it requires
the committed `.env.production` to resolve as the canonical sandbox token, then calls
Vite's own `loadEnv("production", rootDir, "VITE_PAYMENTS_")` — the **effective**
resolution, platform environment variables included — and fails unless that effective
value is itself a sandbox token _and_ equals the canonical one
(`effective_paddle_token_not_sandbox` / `effective_paddle_token_mismatch`, `exitCode 1`).

So the outcomes are:

1. **The build fails closed** — a live platform value now trips the guard before any
   output is generated. On the current deploy branch, via the repo's own build script,
   this is the expected outcome.
2. **A publish keeps the live token** — only if the publisher bypasses the package
   lifecycle (invoking `vite build` directly rather than `run build`, so `prebuild`
   never fires).
3. **A publish swaps live → test and RESTORES sandbox checkout** — if the file wins
   and the guard passes. Note the direction: because a live token already fails
   closed, this outcome **fixes** checkout rather than breaking it. An earlier
   revision called this "breaks live payments", which was backwards.

**Two bounds, both load-bearing:**

- **Whether the publisher runs the package lifecycle at all is `NOT_MEASURED`.** The
  guard only protects the paths that invoke `prebuild`. This is the same gap the
  bot named, and it is not closed here.
- **The guard does NOT explain the token already in production.** It is absent from
  the live build: `scripts/assert-paddle-production-sandbox.mjs` does not exist at
  `faea6e9c59ad`, whose `prebuild` is only `verify-edge-shared-in-sync` →
  `check-no-src-lib-imports` → `stamp-version`. It was added by `72e766314` (#1091),
  merged 2026-08-22 12:38:29 UTC — **after** the live build was stamped
  (2026-08-21T20:51:46.584Z). It changes what the _next_ publish does; it says nothing
  about how the current one shipped `live_`.

Nobody can predict the outcome from the repository alone. That is still why the env
surface must be read immediately before any publish — and why reading the **file alone
does not answer it**: the file said `test_` while production shipped `live_`.

### Severity, stated precisely

`inference, high confidence`, not verified against Paddle: a Paddle **client-side
token** is designed to be public, ships in the browser by intent, and cannot
authorize server-side operations. On that reading this is **not** an API-key leak.

What it **is**, corrected: a **checkout-blocking** configuration and provenance
defect. Production is running **no** payments — the live-class token fails closed and
disables checkout on every host — while every committed env file in the repository
says test, and the mismatch is invisible to CI. The earlier wording "production is
running **live** payments" is **withdrawn**; see the severity-correction block at the
top of this section.

### What else was checked, and came back clean

All 20 production bundles were scanned for secret-class markers **on 2026-08-21**;
the 2026-08-22 re-measure re-read only the main bundle, so this subsection is a
2026-08-21 result and is `NOT_MEASURED` against the current build. One hit:
`BRIDGE_TOKEN` in `sensorTestbenchIndicatorRules-BYI81Sq2.js`, which is a
PowerShell **variable name** inside a copy-paste snippet template carrying the
literal placeholder `<vbt_… mint a token to reveal>`. No token value.
`VITE_SUPABASE_PUBLISHABLE_KEY` is the anon key — public by design and already
committed in `.env`. No `service_role`, `SECRET`, or `PRIVATE_KEY` marker appears
in any bundle.

### Method note for whoever re-measures

The landing HTML contains NUL bytes, so plain `grep` reports **no matches and no
error** against it — the same trap `docs/agent-session-network-reachability.md`
records. Use `grep -a`. A bundle scan that silently returns nothing is the failure
mode to expect here.

---

## External reference scope — MACAE accelerator (recorded 2026-08-22)

**Status: `REFERENCE_ONLY`. Owner: Claude.** This row records that the scope exists; it
authorises no build, no slice, and no port. Recorded as its own timestamped row rather
than as a new Last-updated block — it supersedes no measurement above.

**Scope (`source claim`):** relayed by Cheek as "Grok has scoped this demo for all agents
to read and ingest for future builds", authorised 2026-08-22 as a docs-only slice.

| Field                              | Value                                                                                                                                            |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Repository                         | `Verdant-OS/multi-agent-custom-automation-engine-solution-accelerator` (public)                                                                  |
| Read at                            | `b4a4a00` on `main`, `2026-06-26T20:50:10Z` — shallow clone, read 2026-08-22                                                                     |
| Digest                             | [`docs/knowledge-library/macae-reference-ingest.md`](../knowledge-library/macae-reference-ingest.md)                                             |
| Clone path (ephemeral)             | `/home/user/verdant-os/multi-agent-custom-automation-engine-solution-accelerator` — does not survive the container; re-clone from the public URL |
| Runtime behaviour                  | `NOT_MEASURED` — never deployed or executed                                                                                                      |
| Applicability to any Verdant slice | `NOT_MEASURED` — no slice assigned                                                                                                               |
| Slice owner                        | **Claude**                                                                                                                                       |
| Owner-designated reviewer          | **Blue Dream**, in Cursor — not a GitHub handle (Cheek, 2026-08-22)                                                                              |
| Protocol peer-review seat          | **Grok (GDP)** — filled by Cheek 2026-08-22; `HANDOFF_PROTOCOL.md:24` allows Grok, Claude or Codex                                               |
| Owner acknowledgement              | **cheekhimself**, given out-of-band, outside the GitHub review-request mechanism                                                                 |

Pairing recorded here per `docs/agents/HANDOFF_PROTOCOL.md:25`, which requires both names
in this file and not only in the handoff block. **Read the two reviewer rows together —
neither alone is the whole picture.**

Blue Dream remains the owner's designated reviewer and reviews in Cursor, not on GitHub,
so an empty GitHub reviewer list on these PRs is by design and not an oversight. The
protocol peer-review seat is now filled by **Grok (GDP)** as the independent peer
reviewer (Cheek, 2026-08-22). Blue Dream is **not** one of the three peers (Grok,
Claude, Codex) that `HANDOFF_PROTOCOL.md:24` and `AGENTS.md:582-584` permit in that
seat; Grok (GDP) is. Do **not** leave or restate `NOT FILLED` / "cannot infer" as the
live claim for this seat.

**Read the digest before acting on anything in that repository.** Its do-not-port rules
bind, and are repeated here so this row is not safe to quote alone:

1. **The in-memory approval store is an anti-pattern for Verdant.**
   `OrchestrationConfig` (`src/backend/v4/config/settings.py`) owns
   `approvals: Dict[str, bool]` coordinated by `asyncio.Event`, with
   `default_timeout: float = 300.0`; `HumanApprovalMagenticManager`
   (`human_approval_manager.py`) uses that config. A restart, a second replica, or a
   slow human loses the decision, and that path keeps no audit record. Do not
   reproduce that shape.
2. **The Action Queue stays durable** — `reason`, risk level, `status`, and an append-only
   audit trail, enforced with RLS. Approval is a persisted row, never process memory.
3. **Read the approval-gate shape and the tools-as-services separation. Port nothing
   else** — not the Azure runtime, not Cosmos DB, not Container Apps, not the in-memory
   approval store.
4. **Automation last.** Diary first, sensors second, AI third. This accelerator is an
   automation-orchestration engine; it does not move up that order.

---

### PR #1125 — owner and independent reviewer (assigned 2026-08-25 by Cheek)

| Role                      | Agent                                                   |
| ------------------------- | ------------------------------------------------------- |
| Owner                     | **Claude** (`claude/verdant-architecture-audit-6qe80x`) |
| Independent peer reviewer | **Grok**                                                |

Cheek named Grok as the independent reviewer for this slice on 2026-08-25 and authorized
merge once the required checks are green. Recorded here because **there is no Grok GitHub
account on this repository** — `cheekhimself` is its only collaborator, so a GitHub
`requested_reviewers` entry cannot be created and Grok's reviews reach the PR relayed by
Cheek, as they did on #1092. This row, not a GitHub field, is the `AGENTS.md` reviewer seat.

The owner did not review their own slice: the fourteen findings corrected on this branch came
from Copilot and Codex, and are recorded in the spec's §10 correction record.

### Grow Help Toolkit — owner and independent reviewer (recorded 2026-08-26 from Cheek's assignment)

| Role                      | Agent     | Assignment record                                                     |
| ------------------------- | --------- | --------------------------------------------------------------------- |
| Owner                     | **Codex** | Scope confirmation supplied by Cheek; recorded 2026-08-26             |
| Independent peer reviewer | **Grok**  | Selected by Cheek; recorded 2026-08-26; review pending, not performed |

Codex owns the complete client-side Grow Help Toolkit implementation on
`codex/grow-help-toolkit-20260825`. This temporary assignment replaces Codex's standing
`CURRENT_STATE.md` work for the duration of this slice. Grok's independent review is assigned
but **pending**; do not describe it as performed or approved. There is no Grok GitHub account on
this repository, so Cheek must relay the review to the PR.

The slice is limited to the local nutrient, light, and expense calculators, shared cycle state,
browser-only persistence, formula tests, and browser-generated CSV/print exports. It authorizes
no backend, schema, migration, database probe, secret, hosted apply, publish, merge, or deploy.
Per Cheek's current instruction, `verdant-production` remains at **0 secrets**; this user-confirmed
boundary was not independently re-probed in this slice and supersedes the historical 2026-08-15
environment-secret snapshot above. The separate drift probe remains **BLOCKED** by the provider
limit; nobody should hunt for `knk`, request a Lovable connection string, or represent a missing
paste as the blocker. Cloud SQL remains an in-app, **Ask each time** path.

## Agents currently assigned

| Agent             | Assignment                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Codex             | **Grow Help Toolkit owner — temporary assignment replacing the standing work below for this slice.** Implementation is on `codex/grow-help-toolkit-20260825`; Grok review is assigned and pending. Standing SEO measurement readiness and analytics integrity resumes after Grok's independent-review handoff closes and this slice is closed. Option A slice 1 (#949) is live-verified. Convex Phase 1 of `CONVEX_COMPONENT_PHYSICAL_SANDBOX_SPIKE` remains in review: PR #977, still OPEN 2026-08-15. Scope stays Phase 1 only, under `spikes/convex-component-sandbox/`. **Do NOT rebuild the Postgres domain-reach detector — Phase 0 and Phase 1 of `POSTGRES_RESTRICTED_ROLE_SPIKE` are already delivered by Claude.** Incoming #986 still said Phase 1 was `HOLD`; that row was stale. Phase 2 of that arm is HOLD (JWT secret unobtainable on Lovable Cloud; role durability `UNKNOWN`)                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Claude            | **One-Tent Loop Tranche B+ — architect and implementer (Cheek, 2026-08-19). Substantially delivered as of 2026-08-21:** B0a (#1039), B1 (#1040), B3a (#1042), B2a (#1049), B4a (#1047) and D7 (#1041) merged; D5 (#1043) **merged** `e9e5ec5`; B2b/B5 blocked on unopened Tranche A slices A5/A3; **B4b has no remaining scope** — A2 landed and B4a already covers all of it, so do not open a B4b slice (see the Tranche B+ table note). Also delivered #1062, the routed `CURRENT_STATE` refresh specification (`docs/specs/current-state-refresh-2026-08-20.md`). `CONVEX_COMPONENT_PHYSICAL_SANDBOX_SPIKE` specification — delivered. `POSTGRES_RESTRICTED_ROLE_SPIKE`: spec delivered, **Phase 0 detector measured and Phase 1 role harness delivered (local-only)**, 2026-08-14 under Cheek's approval and full-authority grant. Not the 2026-08-13 “spec-only / not implementation” row. Prior completed out-of-slice work (#586/#809/#812/#885) unchanged. **Pheno Hunt + LAB territory (Cheek, 2026-08-25): delivered 2026-08-26 as one draft PR from `claude/verdant-pheno-hunt-lab-vq6pd9` — audit + dispositions (`docs/pheno-hunt-lab-territory-2026-08-26.md`), implementation, tests; in-branch additive migration NOT applied to production; independent-reviewer seat unassigned, Cheek to name the peer on the PR** |
| Grok              | **Grow Help Toolkit independent reviewer — assigned, review pending and not yet performed.** **Product Intelligence, Adversarial Audit, and Implementation Lead** (Cheek 2026-08-20, refined). Equally empowered to research, audit the live app, implement assigned slices, test, and independently review. Peer with Claude and Codex — **none outranks the others**; explicit task ownership controls. SEO/market/backlink strength retained (not a fence). Map: `docs/agents/grok-peer-elevation-map-2026-08-20.md`. Does **not** take Tranche A remaining edit points (Codex) or Tranche B+ product code (Claude) unless done and unassigned. Prior delivered work unchanged: `ONE_TENT_LOOP_OPERATING_ORDER` repo slices 0/2/3/4; Slices 1 and 5 owner-`BLOCKED`; Cursor SDK spike gates on #985 / `CURSOR_API_KEY`. Reuse of the dispatcher not approved. Convex/Postgres spikes not paused. Production Convex HOLD. Not Unassigned                                                                                                                                                                                                                                                                                                                                                                                             |
| Security reviewer | Unassigned until Convex Phase 1 spike code is ready for review before any Convex cloud credential                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Gemini            | Unassigned                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Council Chair     | Convex-vs-Postgres comparison: **recommendation delivered in spec §10 — adopt Postgres incrementally, hold Convex.** Postgres arm has a measured number (8 cross-domain reaches across 22 service-role functions). Convex arm remains `NOT_MEASURED` pending #977 isolation proofs (green CI on #977 is not those proofs). Incoming #986 still said “do not issue a recommendation until both arms carry evidence”; that sentence is stale — the recommendation already shipped. `ai-coach`'s five reaches are the case neither architecture removes cheaply                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

# Recurring review findings: author checklist before review

Run this before you hand a PR to Blue Dream, Durban Poison or Critical Mass. Each item is a finding reviewers have actually raised. Catching it yourself saves a full review round, because any new commit needs a full re-review at the new head (see [the review loop skill](../../.agents/skills/verdant-exact-sha-review/SKILL.md)).

## How this was built

- **Source:** the 60 most recently modified files in the agents' shared handoff folder (`/workspace/shared/handoffs/`) as of **2026-10-03 8:25 PM CT**, sorted by modification time. Note that 47 of those files carry the same 2026-10-02 10:58 PM CT time from a bulk copy, so their order is copy order, not authoring order. Positions 60 and 61 tie (`1625-…checks.tsv`, `1491-…sentinel.md`); neither has countable findings, so the tie changes no count.
- **What counted:** 13 of those 60 are reviewer verdicts with substantive P1 or P2 findings:
  - #1494, #1674, #1729, #1761, #1769, #1774 and #1868;
  - #1871 and #1894;
  - #1887 (2 packets) and #1888 (2 packets).
- **What didn't:** the rest are handoffs, check exports, remeasure notes, clean PASS packets, or packets whose P2s only park repo-wide CI noise (#1491, #1505, #1525, #1607, #1621).
- **How counts work:** a count is the number of distinct PRs where the pattern appeared in that sample. One PR can show up under several patterns.
- **Outside the sample:** two of Blue Dream's verdicts from the same week (#1857, #1893) were posted as PR comments rather than packets. They are listed under "also seen" and are not in the counts.

## Checklist

### 1. The PR description, a doc or the handoff claims more than the code does (7 PRs)

Five PRs had the over-claim in the PR description or a doc changed in the PR, one in a doc only (#1774), and one in the handoff only (#1868).

- **Seen in:**
  - #1494: the title says `test(...)`, but the PR also refactors `QuickLog.tsx`.
  - #1729: the body is stale and partly inaccurate.
  - #1761: the body lists only Note/Photo/Issue as tentless, but more types fail open.
  - #1769: the body leaves out an unrelated `ci.yml` change.
  - #1774: the doc says raw push, merge and ready commands are denied, which is true only for Claude's direct tool calls; the doc's concurrency sentence doesn't match the workflow.
  - #1868: the handoff said "only `reviewBy` changed", but `reason` changed too. The PR body disclosed it and was accurate.
  - #1894: "in merge order and in version order", and an advisory-lock claim that is false for one file.
- **Also seen:** #1857 ("live only when provenance corroborates" doesn't hold for one path) and #1893 ("unresolved → loading" doesn't hold for `[]`).
- **Before review:** reread every sentence in the body, the handoff, and any doc you changed. For each claim, point to the line or test that proves it. Cut or soften anything you can't point to. List every file you touched, including CI and config files.

### 2. Stale head, draft-state or CI lines in the body (4 PRs)

- **Seen in:** #1729, #1761, #1769 (body cites old head `919ab08` and says "STAY DRAFT" on a PR that isn't a draft) and #1774 (body stale or wrong). The pattern: the old head SHA, "stay draft" on a PR that was no longer a draft, old CI lines. #1887's 9a8d43e5 packet raised the same point as a nit.
- **Before review:** label every count and CI line with the SHA it was measured at, or drop it. Refresh it after each push.

### 3. A guard or claim that no test pins: mutation survivors (6 PRs)

- **Seen in:**
  - #1761: making training/harvest tent-required survives the whole suite.
  - #1769: deleting the temperature and VPD out-of-range branches still passes.
  - #1674: an invalid stored record returning "empty" instead of "blocked" survives, and so do the dropped owner and scope checks.
  - #1887 (two rounds): the dedupe guard, the providers fallback, and later the `Array.isArray` guard.
  - #1888: doc lines can be reverted with every test green.
  - #1871: the "negative balance is safe" claim has no test.
- **Before review:** for each guard you add or claim, revert it locally and confirm at least one test fails. Put the mutation and its result (for example "1 failed / 5 passed") in the PR body, labelled with the SHA. Make sure the fixtures can actually reach the guard: in #1887 the old `{provider}` fixture couldn't, and a string or array-like fixture could.

### 4. Doc wording that no test checks (2 PRs)

- **Seen in:**
  - #1888: cultivar policy lines 101 and 112, and the page and route robots claims.
  - #1871: `docs/billing.md:92-97`.
- **Before review:** if the doc states a policy that code enforces, add a test that fails when the code and the sentence disagree. Otherwise, label the sentence as not test-pinned.

### 5. Fail-open fallbacks for empty scopes, null values or unknown types (3 PRs)

- **Seen in:**
  - #1761 (P1): a deny-list lets every unlisted activity type save without a tent.
  - #1674: an invalid record is treated as empty.
  - #1887: an unguarded throw inside an AuthProvider effect could unmount the app.
- **Also seen:** #1893 (`[]` falls back to every active tent, so a card can show another grow's activity).
- **Before review:** for every `[]`, `null`, `undefined` or unknown enum input, write down the intended behaviour and test it. Prefer allow-lists and fail-closed defaults. Keep "still loading" (`null`) separate from "really empty" (`[]`).

### 6. Business logic or state machines inside `.tsx` (1 PR)

- **Seen in:** #1674 (a retry/recovery state machine in `QuickLogAllActivitiesSection.tsx`).
- **Also seen:** #1893 (scope logic inline in two components).
- **Before review:** move decisions into a tested `*Rules.ts` or `*ViewModel.ts` helper. `docs/definition-of-ready-done.md` already requires this.

### 7. Duplicated constants or logic (not in the packet sample)

- **Seen in:** Blue Dream's PR-comment verdicts only:
  - #1857: `AI_READING_KEYS` copies `READING_KEYS` by hand.
  - #1893: the scope logic appears in three files.
- **Before review:** reuse the export, or add a test that keeps the copies equal.

### 8. Developer-shaped or ambiguous user copy (2 PRs)

- **Seen in:**
  - #1674: raw `JSON.stringify` keys shown to growers.
  - #1769: "X is out of range" doesn't say which range.
- **Before review:** read every new user-facing string as a grower would see it.

### 9. Time windows and boundaries (1 PR)

- **Seen in:** #1894 (the cutoff was midnight Central, but every time in the doc was UTC, so two merges at the edge were missed).
- **Before review:** state the timezone in plain text and check what sits just outside the window.

### 10. Overlap with other open PRs (1 PR)

- **Seen in:** #1888 (a content conflict with #1889 in the same doc).
- **Before review:** run `git merge-tree` against any open PR that touches the same files, and name the merge order in the body.

### 11. Code you run inside a credentialed CI job can read the secrets (1 PR)

- **Seen in:** #1774 (P1): the workflow's tool limits only constrain the agent's own tool calls. Tests, scripts or `package.json` entries it writes and then runs can still read the tokens from the environment or the git config.
- **Before review:** if a job holds secrets, don't let it run code the job itself wrote. Split it into a no-secret build-and-test job and a separate publisher job.

## Keeping this current

When a verdict raises a pattern that isn't here, add it with the PR number. Recount only from packets you actually read, and update the sample note at the top.

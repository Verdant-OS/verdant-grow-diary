# Claude slices

Slice: `CLAUDE-CODE-ACTION-001`. Infrastructure owner: Codex. Independent
reviewer: Critical Mass. This is a draft-only builder integration; it does not
authorize merging, publishing, production database access, or spend changes.
The source of team ownership remains `docs/agents/OWNERSHIP.md`, maintained by
GDP in its pending #1767. Repository [AGENTS.md](../../AGENTS.md), [CLAUDE.md](../../CLAUDE.md), and
[CURRENT_STATE.md](CURRENT_STATE.md) govern every run.

## Routing

- Copilot, unchanged: UI or library slices with 5 files or fewer and no data or
  writer paths.
- Codex, unchanged: P1, publish-gating, data-integrity and CI or build
  infrastructure slices, plus any slice Copilot stalls on twice.
- Claude, new: spec and content-contract docs, and knowledge-library and SEO page
  content; test-only slices; non-critical library or refactor work over 5 files,
  meaning not P1, not publish-gating and not data-integrity; and Copilot-sized
  slices when Copilot is backed up.
- Claude stalls: 0 files about 10 minutes after starting counts as a stall. The
  first gets a nudge from GDP, and the second sends the slice to Codex.
- Claude never reviews its own work. Claude-built PRs go to Blue Dream for any
  `.tsx` outside `src/test/`, P1s or publish gates, and to Critical Mass for
  everything else. Claude may still be the independent reviewer on Codex-owned
  PRs.

Plant-memory-first priority, inherited from AGENTS.md. The product promise is
"Plant memory. Sensor truth. Better decisions." Priority order is Grow, Tent,
Plant, Quick Log, Timeline, Sensor Snapshot, AI Doctor, Alert, then the
Approval-Required Action Queue. Diary first, sensors second, AI third, automation
last. When unsure, protect the grower's plant memory (logs, timeline, photos,
sensor truth) over any new surface.

## GDP entry point

Claude slice: GDP opens the slice issue in the same block format it uses for Copilot, then comments `@claude Implement this slice as a draft PR. Stay draft. Owner Claude; reviewer per path routing.` (or applies the `claude-slice` label). No paste.

Only events performed by `cheekhimself`, the account GDP posts through, can start
the builder. Accepted events are a newly created issue or PR comment containing
`@claude`, or an issue labeled `claude-slice`. A comment from any other account
skips at the job gate. Labels applied by another account also skip. PR events
only run configuration tests and, for `claude/**` heads, the path guard; they
cannot enter the Claude builder. There is no schedule or `pull_request_target`.

GDP must provide a closed file plan and a slice ID in the issue. Claude checks
for collisions, branches from `verdant-grow-diary` as `claude/<slice-id>`, and
opens one draft PR. Nudges continue the existing Claude draft. Raw push, merge,
ready, review and PR-creation commands are denied. Trusted helpers restrict
pushes to the current `claude/*` branch and execute `gh pr create --draft` with
base `verdant-grow-diary`; the PR helper refuses a second PR for the same branch.
Claude names its owner and independent reviewer in the PR body.

## Matthew: setup steps

1. Install the [Claude GitHub App](https://github.com/apps/claude) on Verdant-OS,
   limited to the `verdant-grow-diary` repository only.
2. Confirm it has Contents, Issues and Pull requests read and write.
3. Billing mode selected by Matthew: **Claude Max subscription**. On Matthew's
   machine, run `claude setup-token` while signed in to the intended Max account.
   Add the resulting token as repo secret `CLAUDE_CODE_OAUTH_TOKEN` under Settings,
   then Secrets and variables, then Actions. The Max plan's own usage limit acts
   as the cap. Never commit a key or token and never print one in logs.
4. Explicit model selected by Matthew: `claude-sonnet-5-5`. The workflow limits
   a session to 40 turns and 45 minutes. The shared `claude-slices` concurrency
   group permits one workflow run at a time and does not cancel a running job.
5. After this workflow is independently reviewed and lands through the normal
   release process, GDP can post one real authorized slice. Confirm the real run
   opens a draft into `verdant-grow-diary` and that its locked-path check passes.

The workflow also accepts `ANTHROPIC_API_KEY` as an alternative when no OAuth
token is configured. An API key comes from the Anthropic Console and requires
a separately approved monthly spend limit in that Console before the key is
added. This slice selects Max and sets no API spend cap. When both secrets exist,
Max OAuth takes precedence and the API key is not passed to Claude. When neither
exists, the first step writes **Claude billing secret not configured**, succeeds,
and skips checkout, policy/helper preparation and the Claude action.

The workflow deliberately uses the Claude App's token exchange, rather than
passing `GITHUB_TOKEN` to the action, so Claude-created PRs can start normal CI.
The app and billing credential must be configured by Matthew; this slice does
not install an app, add a secret, or change a spend ceiling.

## Locked paths and verification

Claude must not edit migrations/SQL, `supabase/`, RLS, auth, Edge functions,
Action Queue code, lockfiles, or device control. If a slice needs a locked path,
Claude stops and comments `HOLD-CHEEK: needs locked path <path>`. No production
database access on knk. HOLD #1250 remains on HOLD. PRs #1625, #1727, #1737,
#1735, #1369 and #1767 are outside this slice.

The policy also protects governance files, `.github/`, `.claude/`, `.grok/`,
Git metadata, `docs/agents/OWNERSHIP.md`, `docs/agents/CURRENT_STATE.md`, and private
environment files. File-edit denials cover the common locked paths. Before any
push or new PR, a trusted helper checks the committed diff using the same path
policy as the Claude PR guard. SQL and lockfiles are blocked anywhere in the
tree. Auth, RLS, Action Queue and device-control code are blocked in source,
script, test, E2E and package paths; Markdown explanations can remain eligible.
The guard checks both old and new paths for renames and includes deletions.
Action Queue coverage includes the `actions_.$actionId.tsx` detail route,
outcome and follow-up modules, Action Response Memory, linked-action counts,
assigned-tent actions and live-proof action status. Diary-only Action Response
Pairing and the guided diary checklist remain eligible; their source contracts
do not operate on the Action Queue.

`claude-locked-paths` has read-only permission and runs only on PR heads starting
with `claude/`. It checks out the exact base, fetches the PR head, verifies that
head SHA, and compares against the merge base without executing PR code. A
locked path fails the real check. `claude-configuration` runs checksum-verified
actionlint and focused policy regressions on PRs, including this Codex draft. It
also checks out the base, verifies the PR head and extracts only the workflow
file for actionlint; it does not check out or execute PR application code.
Neither job impersonates an existing required check.

The builder's GitHub permissions are limited to Contents, Pull requests, Issues
and ID token write. Full Claude output and the Claude-authored report are off.
Standing instructions prohibit reading, printing or committing credentials.

## Evidence boundaries

Source configuration and fixture tests can establish the trigger gates,
no-credential exit, locked-path policy and workflow syntax. A real Claude trigger,
Max model access, draft creation, and automatic review routing remain
**NOT_MEASURED** until Matthew installs the app, adds the secret, and a real
`@claude` run opens a draft. GDP owns its routing/stall handling and the #1767
ownership follow-up; this slice provides the entry point and instructions.

The repository's existing `required-check-audit` workflow is a post-merge audit
of deploy-branch commits. It requires an associated merged PR, so its merge audit
is **NOT_APPLICABLE** to an unmerged draft. Report the draft's actual required
checks separately; do not manufacture a successful audit or merge to obtain one.

## Upstream references

The action is pinned to `8ce9314fa9a404564fa7e954cd84f25bcba2b829`, the verified
commit behind `v1` on 2026-09-28. Its supported inputs are documented in the
[pinned action definition](https://github.com/anthropics/claude-code-action/blob/8ce9314fa9a404564fa7e954cd84f25bcba2b829/action.yml)
and [README](https://github.com/anthropics/claude-code-action/blob/8ce9314fa9a404564fa7e954cd84f25bcba2b829/README.md).
See Anthropic's [GitHub Actions setup](https://code.claude.com/docs/en/github-actions),
[model configuration](https://code.claude.com/docs/en/model-config), and
[tool permissions](https://code.claude.com/docs/en/permissions). Model access and
credential validity are measured only by the real configured run.

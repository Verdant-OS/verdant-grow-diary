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
the builder. Accepted events are a newly created comment (on an issue or a PR)
containing `@claude`, or an issue labeled `claude-slice`. Opening an issue whose
body mentions `@claude` does not start it; comment `@claude` afterwards. A comment from any other account
skips at the job gate. Labels applied by another account also skip. PR events
only run configuration tests and, for `claude/**` heads, the path guard; they
cannot enter the Claude builder. There is no schedule or `pull_request_target`.

GDP must provide a closed file plan and a slice ID in the issue. Claude checks
for collisions, branches from `verdant-grow-diary` as `claude/<slice-id>`, and
commits locally. Nudges continue the existing Claude draft. Claude cannot push,
merge, mark ready, review or open a PR: its job holds only a read-only token. A
separate publish job, with no Claude in it, checks the committed diff against the
locked-path policy, pushes the `claude/*` branch with a normal (fast-forward)
push and opens one draft PR into `verdant-grow-diary`; it never opens a second PR
for the same branch. Claude's final commit message becomes the PR title and body,
which names its owner and independent reviewer.

## Matthew: setup steps

1. No GitHub App is required. The builder passes the job's read-only
   `GITHUB_TOKEN` to the action, and the publish job pushes with its own token.
2. Workflow tokens must be allowed to create pull requests (Settings, Actions,
   General, "Allow GitHub Actions to create and approve pull requests").
3. Billing mode selected by Matthew: **Claude Max subscription**. On Matthew's
   machine, run `claude setup-token` while signed in to the intended Max account.
   Add the resulting token as repo secret `CLAUDE_CODE_OAUTH_TOKEN` under Settings,
   then Secrets and variables, then Actions. The Max plan's own usage limit acts
   as the cap. Never commit a key or token and never print one in logs.
4. Explicit model selected by Matthew: `claude-sonnet-5-5`. The workflow limits
   a session to 40 turns and 45 minutes. Builder runs share one `builder`
   concurrency group: at most one runs at a time and a running build is never
   cancelled. GitHub keeps only one _pending_ run per group, so a newer
   authorized request (an `@claude` comment from Matthew or a `claude-slice`
   label) replaces an older one that is still waiting; check the Actions history
   and repost a request that shows as cancelled. Concurrency is evaluated before
   the job's trigger gate, so every other comment or label event gets its own
   one-off group and can never cancel a waiting request. PR validation uses a per-PR group,
   and each merge-queue entry uses its own group keyed on the queued head SHA,
   so neither waits behind or is cancelled by a builder run.
5. After this workflow is independently reviewed and lands through the normal
   release process, GDP can post one real authorized slice. Confirm the real run
   opens a draft into `verdant-grow-diary` and that its locked-path check passes.

The workflow also accepts `ANTHROPIC_API_KEY` as an alternative when no OAuth
token is configured. An API key comes from the Anthropic Console and requires
a separately approved monthly spend limit in that Console before the key is
added. This slice selects Max and sets no API spend cap. When both secrets exist,
Max OAuth takes precedence and the API key is not passed to Claude. When neither
exists, the first step writes **Claude billing secret not configured**, succeeds,
and skips checkout, policy preparation, the Claude action and publishing.

Because the publish job uses the workflow token, GitHub does not start CI for a
Claude draft on its own (workflow-token events never trigger workflows). A
maintainer starts CI by pushing to the draft's branch or by closing and
reopening the draft; there is no earlier run to re-run. The billing credential
must be configured by Matthew; this slice does not add a secret or change a
spend ceiling.

## Locked paths and verification

Claude must not edit migrations/SQL, `supabase/`, RLS, auth, Edge functions,
Action Queue code, lockfiles, or device control. If a slice needs a locked path,
Claude stops and writes `HOLD-CHEEK: needs locked path <path>` in its tracking comment. No production
database access on knk. HOLD #1250 remains on HOLD. PRs #1625, #1727, #1737,
#1735, #1369 and #1767 are outside this slice.

The policy also protects governance files, `.github/`, `.claude/`, `.grok/`,
Git metadata, `docs/agents/OWNERSHIP.md`, `docs/agents/CURRENT_STATE.md`, and private
environment files. It also locks code that CI executes with repository secrets
when a maintainer starts CI on a draft: every `package.json` (its scripts), every
`*.config.*` module (Vite, Vitest, Playwright, ESLint and the rest),
`tsconfig*.json`/`jsconfig*.json`, `.npmrc`, `.yarnrc*`, `bunfig.toml`, Node version
files, Vitest/Playwright setup and workspace files, `src/test/setup*`, and
Playwright global setup and teardown files, `.prettierrc*` and legacy
`.eslintrc*` (both can load plugins), and all of `scripts/**` (CI workflows run
scripts there in jobs that hold write tokens or secrets, and `scripts/e2e/**`
runs with E2E secrets). File-edit denials cover the common locked paths. Before any
push or new PR, the publish job checks the committed diff using the same path
policy as the Claude PR guard. SQL and lockfiles are blocked anywhere in the
tree. Auth, RLS, Action Queue and device-control code are blocked in source,
script, test, E2E and package paths; Markdown explanations can remain eligible.
The guard checks both old and new paths for renames and includes deletions.
Action Queue coverage includes the `actions_.$actionId.tsx` detail route,
outcome and follow-up modules, Action Response Memory, linked-action counts,
assigned-tent actions and live-proof action status. Diary-only Action Response
Pairing and the guided diary checklist remain eligible; their source contracts
do not operate on the Action Queue.

**Content locks.** Filenames don't always say what a file does, so the guard also
locks files by their contents (Matthew, 2026-10-06). Under `src/`, `scripts/`,
`tests/`, `e2e/`, `e2e-local/` and `packages/`, Markdown aside, a file is locked
when its text:

- calls a Supabase auth mutation (`auth-mutation`): `signIn*`, `signOut`, `signUp`,
  `updateUser`, `resetPassword*`, `exchangeCode*`, `verifyOtp`, `setSession`,
  `refreshSession`, `admin.*`, `mfa.*`, `resend`, `reauthenticate`,
  `linkIdentity`, `unlinkIdentity` or `onAuthStateChange`. Optional chaining
  (`auth?.signOut()`), bracket access (`auth["signOut"]()`, `supabase["auth"]`),
  destructuring (`const { signOut } = supabase.auth;`) and aliasing the namespace
  (`const a = supabase.auth;`, `const { auth: a } = supabase;`) also lock, with or
  without the trailing `;`, across a line break (`supabase\n  .auth`), and through
  parentheses, `!`, `as T` or `satisfies T` (`(supabase.auth as any).signOut()`),
  including with `//` or `/* */` comments inside the call chain
  (`supabase.auth /* c */ .signOut()`).
  `mfa.*` locks reads such as `mfa.listFactors()` too. A `getSession()` or
  `getUser()` used only for the user ID doesn't lock, because RLS is the real
  boundary;
- reads or writes the Action Queue (`aq-io`): `.from("action_queue…")` or
  `.rpc("action_queue…")`, including `?.from(`, a type argument
  (`.from<Row>("action_queue")`) and a variable declared with a table or RPC name
  (`const TABLE = "action_queue";`), also with comments inside the call
  (`db.from(/* c */ "action_queue")`). Mentioning an Action Queue row ID, type or
  comment doesn't lock, and neither does a bare string literal elsewhere
  (generated types, view models, source-scan tests), so pure helpers such as
  `pendingOutcomeReviewRules.ts` stay editable.

Test files follow the same rules. The publish job and `claude-locked-paths` check
the text on both sides of every change: the merge-base version catches editing,
deleting or renaming a locked file, and the head version catches adding these
calls to a file with a neutral name. Head content is read as git blob data and
never checked out or run. A binary file under those roots is locked. Claude's
Edit/Write denials also list every content-locked file in the base tree, so it
doesn't spend a run on a draft that can't publish; a new file can only be caught
at publish.

`config/claude-slice-lock-exceptions.json` lists reviewed exceptions for false
positives. It starts empty, is itself path-locked, and each entry needs `path`,
`rule`, `reason` and `approved_by` (Matthew approves each one in the PR that adds
it). Exceptions apply to content locks only, never to path locks; a malformed file
fails the guard. Every rule is checked separately: a file that matches both rules
needs an exception for each, and an exception for one rule never clears the other.

**Residual risk.** The rules are regexes over file text. This list is not
exhaustive; known forms that are not locked include:

- a helper with a neutral name that wraps the calls (for example a `requireUser()`
  wrapper), or a module that receives the client or `client.auth` as an argument
  and calls it there;
- a table or RPC name imported from another module, held in an object property
  (`db.from(TABLES.queue)`), passed as a parameter, or built at runtime
  (`"action_" + "queue"`);
- reaching the namespace without naming it as `auth` or `["auth"]`, for example
  `Reflect.get(supabase, "auth")` or a computed key held in a variable;
- a second-hop alias of a bare `auth` identifier
  (`const { auth } = supabase; const s = auth; s.signOut();`), an alias whose
  statement continues on the next line (`const a = supabase.auth\n  ?? fallback;`),
  the namespace passed with other arguments (`wrap(supabase.auth, "x").signOut()`),
  or more than six wrappers between `auth` and the call;
- raw HTTP to Supabase (`fetch` to `/auth/v1/…` or `/rest/v1/action_queue`).

Comments are handled by also matching the text with comments blanked out, once
skipping strings and once not; a lock found in any version counts, so stripping
can only add locks.

Following imports and data flow would close these, and is deferred.

`claude-locked-paths` has read-only permission and runs only on PR heads starting
with `claude/`. It checks out the exact base, fetches the PR head, verifies that
head SHA, and compares against the merge base without executing PR code. A
locked path fails the real check. `claude-configuration` runs checksum-verified
actionlint and focused policy regressions on PRs, including this Codex draft. It
also checks out the base, verifies the PR head and extracts only the workflow
file for actionlint; it does not check out or execute PR application code.
Neither job impersonates an existing required check. In a `merge_group` run all
four jobs (builder, publish, locked paths, configuration) report skipped: the builder still requires an authorized comment or
label, and both validation jobs are gated on `pull_request` events, where
`github.head_ref` and the PR SHAs exist.

Issue text is untrusted, so the design assumes Claude may be steered by it and
keeps both credentials out of reach:

- **GitHub token.** The builder job has Contents and Pull requests read and
  Issues write only, and passes that token to the action instead of the Claude
  App token. It cannot push, merge or open a PR, and it expires with the job.
  Pushing and draft creation happen only in the publish job, which runs no Claude
  and no repository code and treats Claude's commits as a git bundle.
  - **The token is kept out of `.git/config`.** The Claude step sets
    `allowed_non_write_users: cheekhimself`. In the pinned action that input
    switches git auth from a token embedded in the origin URL to a token-free URL
    plus a credential helper that reads `GH_TOKEN` at push time. It widens no
    trigger: the job `if` already admits only `cheekhimself`, who has write
    access. The configuration job fails if the input is removed, set to `*` or
    another user, or if the builder's actor gate is removed.
  - An earlier revision relied on denying `--pathspec-from-file` and
    `--pathspec-file-nul`. Durban Poison showed that git accepts abbreviated long
    options (`--pathspec-fr .git/config`), which printed the token and matched no
    denial. No denylist can enumerate every abbreviation, so the fix is to remove
    the token from the file, not to deny more spellings.
  - The policy self-test proves this behaviourally: it builds throwaway repos in
    the action's two layouts and runs `git add`/`git commit` with full and
    abbreviated `--pathspec-from-file` forms against `.git/config`. The
    token-in-URL layout must leak (so the probe can see a leak) and the
    credential-helper layout must not.
  - After Claude finishes, the bundle step fails and publishes nothing if any
    credential is present in `.git/config`, so a change in the pinned action's
    behaviour shows up as a failed run.
  - The token still lives in the action process's environment (`gh` and the
    credential helper need it). The subprocess scrub and bubblewrap PID
    isolation below are what keep commands from reading it; the scrub is
    best-effort, so this is `NOT_MEASURED` until a real run.
- **Max or API credential.** The Claude step sets
  `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB=1` (the pinned action enables it only for
  `allowed_non_write_users` otherwise), which removes Anthropic credentials from
  the environment of every command Claude runs. The scrub alone doesn't protect
  the Claude process's own `/proc/<pid>/environ`, and the action's docs call it
  best-effort, so the workflow adds two layers:
  - **A fail-closed isolation gate.** Before the credential is passed, a step
    installs bubblewrap, lifts Ubuntu's AppArmor user-namespace restriction, and
    runs `bwrap --unshare-pid` to confirm that a sandboxed process sees only its
    own PIDs. If it can't, the job fails and Claude never runs. That the Claude CLI
    then uses bubblewrap for its subprocesses rests on Anthropic's documentation
    (`NOT_MEASURED` until a real run).
  - **Known file-reading command forms are denied, as defence in depth only.**
    A denylist is not a guarantee: git accepts abbreviated long options, so
    these denials cannot block every spelling, and Claude can still post through
    the action's tracking comment. They are not what protects the job token (see
    above). `gh issue comment` is not allowed (Claude reports through the
    action's own tracking comment).
    `git diff` is allowed only without arguments (plain, `--stat`, `--cached`),
    so it can't use `--no-index` or a path outside the repository. `git commit`
    is allowed only with `-m`, and `-F`/`--file`/`--template`/`-C`/`-c` are denied.
    Any command mentioning `--no-index`, `--output`, `--pathspec-from-file`,
    `--pathspec-file-nul`, `/proc/` or `environ` is denied; abbreviated forms of
    the long options are not matched. The `Read(//proc/**)` denial covers only the Read tool.
  - The configuration job fails if the gate is removed, moved after the Claude
    step, or stops failing the job, or if any of these commands is allowed again.
- **No repository code runs.** Installs, tests, builds and other runners (`bun`,
  `bunx`, `npm`, `npx`, `node` and similar) are denied, and git hooks point at an
  empty read-only directory, so code planted in the checkout never executes while
  a credential is present. CI tests the draft instead.
- The pinned action grants its own `scripts/git-push.sh` wrapper; it is denied
  explicitly, and a push would fail with the read-only token in any case.

Full Claude output and the Claude-authored report are off. Standing instructions
prohibit reading, printing or committing credentials.

## Evidence boundaries

Source configuration and fixture tests can establish the trigger gates,
no-credential exit, locked-path policy and workflow syntax. A real Claude trigger,
Max model access, draft creation, and automatic review routing remain
**NOT_MEASURED** until Matthew adds the secret and a real `@claude` run opens a
draft (no GitHub App is needed). Whether the bubblewrap gate passes on
`ubuntu-latest` is also measured only by that first real run. GDP owns its routing/stall handling and the #1767
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

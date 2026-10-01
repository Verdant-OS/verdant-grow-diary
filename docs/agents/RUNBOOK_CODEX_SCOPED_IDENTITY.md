# Codex scoped write identity

Status: setup proposal, not an installed permission change. Matthew creates the
identity and rulesets. Codex verifies them afterward. This does not authorize a
production promotion, database operation, secret change or held-branch update.

## Measured baseline

At 2026-09-29 00:16 UTC, the repository API reported Verdant-OS/verdant-grow-diary
as public and this connector as an administrator. Ruleset 20421416 was active on
`refs/heads/verdant-grow-diary`, with 35 required contexts, strict status checks,
squash merge queue, force-push and deletion protection. Its four rules did **not**
include a `pull_request` rule. Admin bypass was `pull_request` only.

- PASS: the live 35-context list matches `config/required-status-checks.json`.
- NOT_MEASURED: a separate Codex account, App installation and branch restrictions.
- BLOCKED: claiming that CODEOWNERS alone rejects pushes to an off-limits file.
- NOT_APPLICABLE: new permission grants in this change; exactly zero were made.

Re-read the live rulesets before setup; this snapshot is not proof of future state.

## Identity Matthew creates

Preferred for the current CI repair lane: a separate machine account named
`verdant-codex`, with **Write** on this repository only. Do not give it Maintain,
Admin, organization administration, environment management or secret management.
Matthew enables its normal account security and installs its credential through
the credential manager. Never paste or commit the credential.

An alternative GitHub App starts with repository Contents and Pull requests
read/write, Metadata read, and installation access to this repository only.
Do not silently add other permissions. That exact two-write-permission App cannot
edit `.github/workflows/`; workflow editing needs the additional Workflows
permission. Matthew must decide between the machine account and that additional
App permission. [GitHub App permission documentation](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/choosing-permissions-for-a-github-app).

Record the chosen actor, repository role, installation ID when applicable,
permission names/levels, expiry and installation scope in a receipt. Do not record
token values. Account creation, token creation and protection installation are
NOT_MEASURED until Matthew supplies their non-secret receipt.

## Restrict other branch namespaces

Matthew creates an active **branch** ruleset with these conditions:

```text
include: ~ALL
exclude: refs/heads/codex/**
         refs/heads/verdant-grow-diary
rules:   Restrict creations
         Restrict updates
         Restrict deletions
```

Allow bypass only for the repository Admin role and the actual installed Copilot
and Dependabot actors that need to push. Select those actors in GitHub's UI; do
not invent App IDs. Do not include the Codex identity or the whole Write role.
Inspect how this rule composes with the existing `main` and deploy rulesets.
Excluding the deploy branch here does **not** authorize direct deploy pushes.

This permits Codex task branches while rejecting other agents' branch namespaces.
Held PRs and files remain off-limits even if an actor technically can bypass.

## Deploy-branch PR and owner gates

Add an explicit **Require a pull request before merging** rule to the deploy
ruleset. Keep its 35 required contexts, strict checks, merge queue, force-push and
deletion protections. Configure zero general approvals and **Require review from
Code Owners**. A skipped, absent or red required check cannot authorize merge.
Codex must not bypass the queue or a code-owner requirement.

This proposed `.github/CODEOWNERS` content is for a separate reviewed setup change;
it is not installed by this runbook. `@cheekhimself` is the verified founder actor.
Add a GDP team only after confirming that team's repository Write access.

```text
# No blanket owner: ordinary Codex repairs retain the Phase 1 PR path.
/.github/CODEOWNERS                         @cheekhimself
/supabase/                                 @cheekhimself
*.sql                                      @cheekhimself
/bun.lock                                  @cheekhimself
/package-lock.json                         @cheekhimself
/yarn.lock                                 @cheekhimself
/pnpm-lock.yaml                            @cheekhimself
/src/integrations/supabase/                 @cheekhimself
/src/store/auth.tsx                        @cheekhimself
/src/routes/auth.tsx                       @cheekhimself
/src/pages/Auth.tsx                        @cheekhimself
/src/hooks/*Auth*                          @cheekhimself
/src/lib/*Auth*                            @cheekhimself
/src/lib/*auth*                            @cheekhimself
/src/lib/entitlements/                     @cheekhimself
/src/pages/ActionQueue.tsx                  @cheekhimself
/src/components/*ActionQueue*              @cheekhimself
/src/hooks/*ActionQueue*                    @cheekhimself
/src/lib/*ActionQueue*                      @cheekhimself
/src/lib/*actionQueue*                      @cheekhimself
/src/lib/genetics/breedingActionQueue.ts    @cheekhimself
/.github/workflows/migration-drift-probe.yml @cheekhimself
/.github/workflows/money-migration-drift-alert.yml @cheekhimself
/src/test/migration-drift-probe.test.ts      @cheekhimself
/src/test/money-migration-drift-alert.test.ts @cheekhimself
```

Before installing, enumerate device-control and additional auth/edge paths on the
then-current tip and add the actual paths. The list above is a baseline, not a
claim that filename matching detects every semantic security change. Never alter
the HOLD #1250 files while installing their owner entries.

CODEOWNERS gates **merge approval**, not a push into a task branch. Public-repo
branch rules do not provide the private/internal push-ruleset file-path fence.
Literal refusal of every off-limits file push remains BLOCKED under this proposal.
For that requirement, Matthew needs a validated write broker or another supported
server-side path enforcement mechanism before issuing unrestricted repository
Contents-write access. Do not describe a local hook or a red CI job as a rejected
server push. [Ruleset availability](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets),
[CODEOWNERS behavior](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners).

## Verification after Matthew's setup

1. Obtain the non-secret setup receipt and confirm the session uses the separate
   actor, not Matthew's administrator identity. For the machine account, use
   `gh auth status` and `gh api user --jq .login`; never use `gh auth token` in a log.
2. Re-read active rules, bypass actors, protected refs and base CODEOWNERS. Stop if
   the expected protection or verified identity is absent. No negative-write test
   is safe with the current administrator session.
3. Create `codex/access-test-<date>` from the measured deploy tip. Add only a
   disposable access-test receipt outside locked paths; push normally, open a
   draft PR and request the named independent reviewer. Record the returned URL,
   exact head and actor. Do not merge the test PR.
4. Verify namespace enforcement with an owner-provisioned disposable non-Codex
   branch under the same restrictive rules. Record an actual rejection and prove
   its remote SHA is unchanged afterward. Do not experiment on HOLD #1250.
5. Direct deploy-branch refusal and off-limits-path refusal remain NOT_MEASURED
   until the scoped identity and server protections are confirmed. If a safe
   rejection test cannot guarantee that the real protected ref stays unchanged,
   stop and use a disposable branch with equivalent rules. Do not use a no-op
   push as proof of denial, and do not weaken a protection to make a test pass.
6. Close the disposable PR after the receipt. Remove only the verified disposable
   branch; leave every held branch and customer record alone.

Report positive operations and refused operations separately, with command,
timestamp, exit result and before/after ref SHAs. Close Job C only when all
required refusal claims have target-side evidence; a setup document is not that
evidence.

## Rollback

Matthew revokes the separate credential or App installation if its access differs
from the receipt. Restore rules only from the owner's saved export; preserve the
existing merge queue and required checks. No secret value or production state is
changed by this document.

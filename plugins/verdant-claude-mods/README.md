# Verdant Claude Code mods

Two Claude Code mods (plugins of function hooks) that turn rules already written in
`AGENTS.md` and `CLAUDE.md` into checks that run before an agent's tool call does.
They add no new policy: every refusal names the existing rule it enforces.

| Mod                   | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `verdant-guard`       | Refuses force-push, pushes to `verdant-grow-diary`/`main` (including the `--all`, `--mirror` and `--branches` bulk modes and the `:` matching refspec), `git rebase`, `pull --rebase`, `--no-verify`, dependency changes through npm/yarn/pnpm/bun (the run skill's bare public-registry npm bootstrap, with no package named, stays allowed), `bun install`, `chromium-mocked` Playwright runs without a spec filter, hand edits of generated files and lockfiles, edits of migrations that already exist on the deploy branch, production Supabase/Vercel/Lovable deploy, SQL, promote and rollback, PR merge, auto-merge and un-drafting (`gh pr ready --undo`, which returns a PR to draft, stays allowed). Adds a reminder when a `send_later` check-in is armed at 56–75 minutes. |
| `verdant-cache-clock` | Status-line countdown to the 60-minute prompt-cache expiry measured in `CLAUDE.md` (Check-in cadence), and a toast at 50 idle minutes.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

## Status

`practical observation`: both mods pass `claude plugin validate` and `claude plugin test`
(`verdant-guard` 89/89, `verdant-cache-clock` 6/6) on Claude Code 2.1.293. Removing the
guard's Bash and file checks turns two engine tests red. Behaviour inside a live agent
session is `NOT_MEASURED`.

The guard is a tripwire against accidents, not a security boundary. It splits shell
commands on `&&`, `||`, `;`, `|`, a background `&`, `(`, `)` and newlines outside quotes, so a
quoted pattern such as `grep "a|git push --force"` is one command. A subshell or `$(…)` body is
checked as its own command, including a `$(…)` inside double quotes, and an unclosed quote falls
back to splitting on every operator. It strips `bunx`, `npx`, `bun x`, `pnpm dlx|exec` and
`yarn dlx|exec` with their own flags (`-y`, `--bun`, `-p <pkg>`; the command given to `-c` is
checked), strips `env`, `sudo`, `exec` and `time` with their own options (the command given to
`env -S` is checked), reads clustered short flags such as `git push -uf` and `git commit -anm`,
treats a Playwright option written without `=` as taking a value unless it is a known flag, anchors file paths on the checkout root from `git rev-parse --show-toplevel`, and
matches MCP tools by service (`supabase`, `vercel`, `github`, `lovable` as a whole `_`- or
`-`-separated part of the server name). Backticks, `bash -c "…"`, `eval`, a script file or an
unrecognised MCP server can still route around it. CI, the
`Published migration integrity` gate, branch rulesets and RLS remain the real enforcement.

## Loading

The mods load only where a session is pointed at them. Nothing here changes any
agent's settings.

```bash
# one session, from the repository root
claude --plugin-dir plugins/verdant-claude-mods/verdant-guard \
       --plugin-dir plugins/verdant-claude-mods/verdant-cache-clock
```

Where no flag can be passed (desktop app, SDK hosts, cloud environments), set
`CLAUDE_CODE_PLUGIN_DIRS` to the absolute folder paths, separated by the platform's
path-list separator (`:` on Linux/macOS). Setting it in a cloud environment's
configuration is an owner action.

When the guard refuses a call that has explicit owner approval (for example an approved
migration slice), unload the mod for that session instead of working around it.

## Checking a change

```bash
claude plugin validate plugins/verdant-claude-mods/verdant-guard
claude plugin test plugins/verdant-claude-mods/verdant-guard
claude plugin test plugins/verdant-claude-mods/verdant-cache-clock
```

The `*.test.ts` files here import `claude-code/testing` and run only under
`claude plugin test`; Vitest's `include` is `src/**`, so the app suite never collects
them. Keep rules pure in `rules.ts` / `clock.ts` and test them there; `register.ts` wires
them to hooks. Hook functions must be written inline at each `on(...)` call — the loader
refuses a hook built by a factory.
